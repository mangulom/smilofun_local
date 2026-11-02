"""Password hashing (bcrypt with legacy PBKDF2 verification) and Fernet helpers."""
import hashlib
import hmac
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
import base64
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from app.core.config import settings

_LEGACY_ITERATIONS = 200_000
_ENCRYPTED_PREFIX = "fernet:v1:"
_OPAQUE_CIPHERTEXT_MARKER = "[dato cifrado no disponible]"


def hash_password(password: str) -> str:
    if len(password.encode("utf-8")) > 72:
        raise ValueError("La contrase?a no puede superar 72 bytes UTF-8 con bcrypt")
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("ascii")


def verify_password(password: str, stored: str) -> bool:
    if not stored:
        return False
    if stored.startswith(("$2a$", "$2b$", "$2y$")):
        try:
            return bcrypt.checkpw(password.encode("utf-8"), stored.encode("ascii"))
        except (ValueError, TypeError):
            return False
    # Compatibilidad y migraci?n transparente desde el formato PBKDF2 anterior.
    try:
        salt_hex, digest_hex = stored.split(":", 1)
        salt = bytes.fromhex(salt_hex)
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _LEGACY_ITERATIONS)
        valid = hmac.compare_digest(digest.hex(), digest_hex)
        return valid
    except (ValueError, TypeError):
        return False


def needs_password_rehash(stored: str) -> bool:
    return not stored.startswith(("$2a$", "$2b$", "$2y$"))


def _fernet() -> Fernet:
    key = settings.fernet_key
    if not key:
        raise RuntimeError("FERNET_KEY falta; usa la misma clave persistente con la que se cifraron los datos")
    try:
        return Fernet(key.encode("ascii"))
    except (ValueError, UnicodeEncodeError) as exc:
        raise RuntimeError("FERNET_KEY no es una clave Fernet v?lida") from exc


def validate_fernet_key() -> None:
    """Fail at startup when the configured key is malformed."""
    _fernet()


def encrypt_sensitive(value: str | None) -> str | None:
    if value is None or value == "" or value.startswith(_ENCRYPTED_PREFIX) or value.startswith("gAAAA") or value == _OPAQUE_CIPHERTEXT_MARKER:
        return value
    if settings.demo_mode:
        return value
    token = _fernet().encrypt(value.encode("utf-8")).decode("ascii")
    return _ENCRYPTED_PREFIX + token


def is_encrypted_sensitive(value: str | None) -> bool:
    return bool(value and (value.startswith(_ENCRYPTED_PREFIX) or value.startswith("gAAAA")))


def decrypt_sensitive(value: str | None) -> str | None:
    if value is None:
        return value
    if value == _OPAQUE_CIPHERTEXT_MARKER:
        return value
    if settings.demo_mode:
        return value
    if not value.startswith(_ENCRYPTED_PREFIX):
        if value.startswith("gAAAA"):
            return _decrypt_legacy_fernet(value)
        return value
    if not settings.fernet_key:
        return _OPAQUE_CIPHERTEXT_MARKER
    try:
        return _fernet().decrypt(value[len(_ENCRYPTED_PREFIX):].encode("ascii")).decode("utf-8")
    except (InvalidToken, UnicodeEncodeError, UnicodeDecodeError):
        # Keep protected clinical data fail-closed: never return the ciphertext
        # as though it were plaintext. Preserve the database token unchanged.
        return _OPAQUE_CIPHERTEXT_MARKER


def _decrypt_legacy_fernet(value: str) -> str:
    if not settings.fernet_key:
        return _OPAQUE_CIPHERTEXT_MARKER
    try:
        return _fernet().decrypt(value.encode("ascii")).decode("utf-8")
    except (InvalidToken, UnicodeEncodeError, UnicodeDecodeError):
        return _OPAQUE_CIPHERTEXT_MARKER


def create_token(subject: str, extra: dict | None = None, expires_minutes: int | None = None) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": subject, "iat": now, "exp": now + timedelta(minutes=expires_minutes or settings.access_token_expire_minutes)}
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])



def derive_payload_key(user_id: int, salt: bytes) -> bytes:
    """Derive an AES-GCM key from the server master key for this authenticated session."""
    fernet = _fernet()
    # Fernet's documented 32-byte key is urlsafe-base64 of these two halves.
    # HKDF receives exactly the same master key across Fernet implementation versions.
    return HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        info=b"dentamia-payload-v1:" + str(user_id).encode("ascii"),
    ).derive(base64.urlsafe_b64decode(settings.fernet_key.encode("ascii")))
