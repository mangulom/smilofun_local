from __future__ import annotations

import re
from datetime import datetime
from html import escape

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.core.config import settings
from app.core.database import get_db
from app.models import Campana, Empresa, Paciente, Usuario

router = APIRouter(prefix="/api/campanas", tags=["Campañas"], dependencies=[Depends(get_current_user)])
settings_router = APIRouter(prefix="/api/configuracion/campanas", tags=["Configuración de campañas"], dependencies=[Depends(require_roles("admin"))])


class CampanaIn(BaseModel):
    empresa_id: int
    nombre: str = Field(min_length=2, max_length=160)
    asunto: str = Field(min_length=2, max_length=240)
    html: str = Field(min_length=20, max_length=150_000)
    canales: list[str] = Field(default_factory=lambda: ["gmail"], max_length=2)


def _sanitizar_html(html: str) -> str:
    # Allowlist reducida a etiquetas de formato/correo; elimina scripts, formularios,
    # SVG embebido, handlers on* y URLs activas antes de guardar o enviar.
    permitidas = {"html", "head", "body", "meta", "title", "table", "tbody", "thead", "tr", "td", "th", "div", "span", "p", "br", "strong", "b", "em", "i", "u", "a", "img", "h1", "h2", "h3", "ul", "ol", "li"}
    atributos = {"href", "src", "alt", "width", "height", "align", "cellpadding", "cellspacing", "role", "charset", "name", "content"}
    # El template de campaña proviene de campos del propio editor y no necesita JS.
    html = re.sub(r"<(script|iframe|object|embed|form|input|button|video|audio|svg|math)\b[^>]*>[\s\S]*?</\1\s*>", "", html, flags=re.I)
    html = re.sub(r"<(script|iframe|object|embed|form|input|button|video|audio|svg|math)\b[^>]*/?>", "", html, flags=re.I)
    # Do not allow CSS URL/data payloads, legacy imports, or active content through style.
    html = re.sub(r"(?is)url\s*\([^)]*\)|@import[^;]*;", "", html)
    def clean_tag(match: re.Match[str]) -> str:
        closing, tag, raw_attrs = match.group(1), match.group(2).lower(), match.group(3)
        if tag not in permitidas: return ""
        if closing: return f"</{tag}>"
        kept=[]
        for attr_match in re.finditer(r"([\w:-]+)\s*=\s*(?:\"([^\"]*)\"|'([^']*)'|([^\s>]+))", raw_attrs):
            name=attr_match.group(1).lower(); value=next((v for v in attr_match.groups()[1:] if v is not None), "")
            if name.startswith("on") or name not in atributos: continue
            if name in {"href", "src"} and not re.match(r"^(https://|mailto:|#)", value, re.I): continue
            if "javascript:" in value.lower() or "expression(" in value.lower(): continue
            kept.append(f'{name}="{escape(value, quote=True)}"')
        return f"<{tag}{(' ' + ' '.join(kept)) if kept else ''}>"
    return re.sub(r"<(\/)?([a-zA-Z][\w:-]*)([^>]*)>", clean_tag, html)


class EnviarCampanaIn(BaseModel):
    confirmar: bool = False
    solo_con_consentimiento: bool = True
    canal: str = "gmail"


def _empresa_valida(user: Usuario, empresa_id: int) -> None:
    ids = {link.empresa_id for link in user.empresas_link}
    if ids and empresa_id not in ids:
        raise HTTPException(403, "No tienes acceso a esta empresa")


def _canales_configurados() -> dict[str, bool]:
    return {
        "gmail": bool(settings.gmail_sender_email and settings.gmail_oauth_client_id and settings.gmail_oauth_client_secret and settings.gmail_oauth_refresh_token),
        "meta_reels": bool(settings.meta_page_id and settings.meta_access_token),
        "whatsapp": bool(settings.whatsapp_phone_number_id and settings.whatsapp_access_token and settings.whatsapp_campaign_template),
    }

def _guardar_variables_entorno(values: dict[str, str]) -> None:
    """Persist integration credentials atomically with restrictive local permissions."""
    import json
    import os
    from pathlib import Path
    env_path = Path(__file__).resolve().parents[2] / ".env"
    existing: dict[str, str] = {}
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if "=" in stripped and not stripped.startswith("#"):
                key, value = stripped.split("=", 1)
                existing[key.strip()] = value.strip().strip('"').strip("'")
    existing.update(values)
    temporal = env_path.with_suffix(".env.tmp")
    temporal.write_text("\n".join(f"{key}={json.dumps(value)}" for key, value in existing.items()) + "\n", encoding="utf-8")
    try:
        os.chmod(temporal, 0o600)
    except OSError:
        pass
    os.replace(temporal, env_path)
    try:
        os.chmod(env_path, 0o600)
    except OSError:
        pass


class GmailConfigIn(BaseModel):
    sender_email: str = Field(min_length=5, max_length=254)
    client_id: str = Field(min_length=10, max_length=500)
    client_secret: str = Field(min_length=8, max_length=500)
    refresh_token: str = Field(min_length=10, max_length=2000)


class WhatsAppConfigIn(BaseModel):
    phone_number_id: str = Field(min_length=5, max_length=100)
    business_account_id: str = Field(min_length=5, max_length=100)
    access_token: str = Field(min_length=20, max_length=5000)
    campaign_template: str = Field(min_length=2, max_length=120)
    template_language: str = Field(default="es", min_length=2, max_length=10)


@settings_router.get("/gmail")
def obtener_configuracion_gmail(user: Usuario = Depends(require_roles("admin"))):
    return {
        "configured": _canales_configurados()["gmail"],
        "sender_email": settings.gmail_sender_email,
        "client_id": settings.gmail_oauth_client_id,
        "client_secret_set": bool(settings.gmail_oauth_client_secret),
        "refresh_token_set": bool(settings.gmail_oauth_refresh_token),
    }


@settings_router.put("/gmail")
def guardar_configuracion_gmail(data: GmailConfigIn, user: Usuario = Depends(require_roles("admin"))):
    from email_validator import validate_email, EmailNotValidError
    try:
        validate_email(data.sender_email, check_deliverability=False)
    except EmailNotValidError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Correo remitente inv?lido") from exc
    values = {
        "GMAIL_SENDER_EMAIL": data.sender_email.strip(),
        "GMAIL_OAUTH_CLIENT_ID": data.client_id.strip(),
        "GMAIL_OAUTH_CLIENT_SECRET": data.client_secret.strip(),
        "GMAIL_OAUTH_REFRESH_TOKEN": data.refresh_token.strip(),
    }
    _guardar_variables_entorno(values)
    # Evita que la API dependa del reinicio para conocer la configuración recién guardada.
    settings.gmail_sender_email = values["GMAIL_SENDER_EMAIL"]
    settings.gmail_oauth_client_id = values["GMAIL_OAUTH_CLIENT_ID"]
    settings.gmail_oauth_client_secret = values["GMAIL_OAUTH_CLIENT_SECRET"]
    settings.gmail_oauth_refresh_token = values["GMAIL_OAUTH_REFRESH_TOKEN"]
    return {"configured": True, "sender_email": settings.gmail_sender_email, "secrets_saved": True}


@settings_router.get("/whatsapp")
def obtener_configuracion_whatsapp(user: Usuario = Depends(require_roles("admin"))):
    return {
        "configured": _canales_configurados()["whatsapp"],
        "phone_number_id": settings.whatsapp_phone_number_id,
        "business_account_id": settings.whatsapp_business_account_id,
        "campaign_template": settings.whatsapp_campaign_template,
        "template_language": settings.whatsapp_template_language,
        "access_token_set": bool(settings.whatsapp_access_token),
    }


@settings_router.put("/whatsapp")
def guardar_configuracion_whatsapp(data: WhatsAppConfigIn, user: Usuario = Depends(require_roles("admin"))):
    values = {
        "WHATSAPP_PHONE_NUMBER_ID": data.phone_number_id.strip(),
        "WHATSAPP_BUSINESS_ACCOUNT_ID": data.business_account_id.strip(),
        "WHATSAPP_ACCESS_TOKEN": data.access_token.strip(),
        "WHATSAPP_CAMPAIGN_TEMPLATE": data.campaign_template.strip(),
        "WHATSAPP_TEMPLATE_LANGUAGE": data.template_language.strip(),
    }
    _guardar_variables_entorno(values)
    settings.whatsapp_phone_number_id = values["WHATSAPP_PHONE_NUMBER_ID"]
    settings.whatsapp_business_account_id = values["WHATSAPP_BUSINESS_ACCOUNT_ID"]
    settings.whatsapp_access_token = values["WHATSAPP_ACCESS_TOKEN"]
    settings.whatsapp_campaign_template = values["WHATSAPP_CAMPAIGN_TEMPLATE"]
    settings.whatsapp_template_language = values["WHATSAPP_TEMPLATE_LANGUAGE"]
    return {"configured": True, "phone_number_id": settings.whatsapp_phone_number_id, "campaign_template": settings.whatsapp_campaign_template, "access_token_saved": True}


@router.get("/estado")
def estado_integraciones(user: Usuario = Depends(require_roles("admin"))):
    ready = _canales_configurados()
    return {
        "gmail": {"configured": ready["gmail"], "mode": "gmail_api_oauth" if ready["gmail"] else "not_configured"},
        "meta_reels": {"configured": ready["meta_reels"], "mode": "meta_graph_api" if ready["meta_reels"] else "not_configured"},
        "sending_enabled": any(ready.values()),
    }


@router.get("")
def listar(empresa_id: int, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    _empresa_valida(user, empresa_id)
    return db.execute(select(Campana).where(Campana.empresa_id == empresa_id).order_by(Campana.creado_en.desc())).scalars().all()


@router.post("", status_code=status.HTTP_201_CREATED)
def crear(data: CampanaIn, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    _empresa_valida(user, data.empresa_id)
    if db.get(Empresa, data.empresa_id) is None:
        raise HTTPException(404, "Empresa no encontrada")
    if not data.canales or any(c not in {"gmail", "meta_reels", "whatsapp"} for c in data.canales):
        raise HTTPException(422, "Canal no soportado")
    safe_html = _sanitizar_html(data.html)
    campana = Campana(empresa_id=data.empresa_id, usuario_id=user.id, nombre=data.nombre.strip(), asunto=data.asunto.strip(), html=safe_html, canales=data.canales)
    db.add(campana)
    db.commit()
    db.refresh(campana)
    return {"id": campana.id, "estado": campana.estado, "nombre": campana.nombre, "asunto": campana.asunto, "empresa_id": campana.empresa_id}


@router.post("/{campana_id}/enviar")
async def enviar(campana_id: int, data: EnviarCampanaIn, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    campana = db.get(Campana, campana_id)
    if not campana:
        raise HTTPException(404, "Campaña no encontrada")
    _empresa_valida(user, campana.empresa_id)
    if not data.confirmar:
        raise HTTPException(400, "Confirma explícitamente el envío")
    configured = _canales_configurados()
    if data.canal not in {"gmail", "whatsapp"} or data.canal not in (campana.canales or []):
        raise HTTPException(400, "Canal no incluido en esta campaña")
    if not configured.get(data.canal, False):
        raise HTTPException(503, f"{data.canal} no está configurado")
    campana.html = _sanitizar_html(campana.html)
    db.commit()

    # No seleccionar pacientes hasta que exista un campo explícito de consentimiento
    # y baja. No inferir autorización a partir del mero hecho de tener email.
    columnas = {c["name"] for c in __import__("sqlalchemy").inspect(db.bind).get_columns("pacientes")}
    consent_col = "consentimiento_marketing_email" if data.canal == "gmail" else "consentimiento_marketing_whatsapp"
    baja_col = "baja_marketing_email" if data.canal == "gmail" else "baja_marketing_whatsapp"
    if consent_col not in columnas or baja_col not in columnas:
        raise HTTPException(409, "Falta registrar consentimiento y baja del canal en la ficha del paciente")
    if data.solo_con_consentimiento is not True:
        raise HTTPException(400, "Solo se permite enviar a contactos con consentimiento explícito")
    permitidos = db.execute(select(Paciente).where(
        Paciente.empresa_id == campana.empresa_id,
        Paciente.activo.is_(True),
        (Paciente.email.is_not(None) if data.canal == "gmail" else Paciente.telefono.is_not(None)),
        (Paciente.consentimiento_marketing_email.is_(True) if data.canal == "gmail" else Paciente.consentimiento_marketing_whatsapp.is_(True)),
        (Paciente.baja_marketing_email.is_(False) if data.canal == "gmail" else Paciente.baja_marketing_whatsapp.is_(False)),
    )).scalars().all()
    destinatarios = sorted({(p.email if data.canal == "gmail" else p.telefono).strip() for p in permitidos if (p.email if data.canal == "gmail" else p.telefono) and (p.email if data.canal == "gmail" else p.telefono).strip()})
    if not destinatarios:
        raise HTTPException(409, "No hay destinatarios con email y consentimiento vigente")

    access_token = await _gmail_access_token() if data.canal == "gmail" else settings.whatsapp_access_token
    enviados = 0
    fallidos = 0
    async with httpx.AsyncClient(timeout=30) as client:
        for email in destinatarios:
            if data.canal == "gmail":
                raw = _raw_email(campana.asunto, campana.html, email, settings.gmail_sender_email or "")
                response = await client.post("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", headers={"Authorization": f"Bearer {access_token}"}, json={"raw": raw})
            else:
                response = await client.post(
                    f"https://graph.facebook.com/{settings.meta_graph_api_version}/{settings.whatsapp_phone_number_id}/messages",
                    headers={"Authorization": f"Bearer {access_token}"},
                    json={"messaging_product": "whatsapp", "to": re.sub(r"\D", "", email), "type": "template", "template": {"name": settings.whatsapp_campaign_template, "language": {"code": settings.whatsapp_template_language}, "components": [{"type": "body", "parameters": [{"type": "text", "text": campana.asunto[:1024]}]}]}},
                )
            if response.is_success:
                enviados += 1
            else:
                fallidos += 1
    campana.estado = "enviada" if fallidos == 0 else "parcial"
    campana.destinatarios = enviados
    campana.enviado_en = datetime.now()
    db.commit()
    return {"campana_id": campana.id, "estado": campana.estado, "enviados": enviados, "fallidos": fallidos}


async def _gmail_access_token() -> str:
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post("https://oauth2.googleapis.com/token", data={
            "client_id": settings.gmail_oauth_client_id,
            "client_secret": settings.gmail_oauth_client_secret,
            "refresh_token": settings.gmail_oauth_refresh_token,
            "grant_type": "refresh_token",
        })
    if not response.is_success:
        raise HTTPException(502, "No se pudo renovar el token OAuth de Gmail")
    return response.json()["access_token"]


def _raw_email(subject: str, html: str, to: str, sender: str) -> str:
    from email.message import EmailMessage
    import base64
    message = EmailMessage()
    message["To"] = to
    message["From"] = sender
    message["Subject"] = subject
    message.set_content("Este correo requiere un cliente compatible con HTML.")
    message.add_alternative(html, subtype="html")
    return base64.urlsafe_b64encode(message.as_bytes()).decode().rstrip("=")
