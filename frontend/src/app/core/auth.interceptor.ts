import { HttpErrorResponse, HttpInterceptorFn, HttpEvent, HttpRequest, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { apiUrl } from './runtime-config';
import { finalize } from 'rxjs';
import { LoadingService } from '../shared/loading.service';

const KEY_TOKEN = 'dentamia_token';
const KEY_USER = 'dentamia_usuario';
const ENVELOPE = 'application/vnd.dentamia.encrypted+json';
const LOGIN_ENVELOPE = 'application/vnd.dentamia.encrypted+json';
const KEY_CACHE = 'dentamia_payload_key_session';
const KEY_DISABLED = 'dentamia_payload_encryption_disabled';
let payloadKeyPromise: Promise<CryptoKey | null> | undefined;
let payloadKeyToken = '';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const loading = inject(LoadingService);
  if (req.url === '/api' || req.url.startsWith('/api/')) req = req.clone({ url: apiUrl(req.url) });
  const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase());
  const fileUpload = req.body instanceof FormData || req.body instanceof Blob;
  const loadingMessage = isMutation ? fileUpload ? 'SUBIENDO ARCHIVO' : 'GUARDANDO CAMBIOS' : loadingMessageFor(req.url);
  const loadingId = loadingMessage ? loading.show(loadingMessage) : null;
  const token = localStorage.getItem(KEY_TOKEN);
  req = req.clone({ withCredentials: true });
  if (token) req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  const requestPath = new URL(req.url, document.baseURI).pathname;
  const bootstrapLogin = requestPath === '/api/auth/login';
  const bootstrapKey = requestPath === '/api/auth/payload-key';
  const refreshPayloadKey = requestPath === '/api/auth/payload-key/refresh';
  const binaryResponse = req.responseType === 'blob' || req.responseType === 'arraybuffer';
  const skipsPayloadCrypto = bootstrapLogin || bootstrapKey;
  return from(skipsPayloadCrypto || binaryResponse ? Promise.resolve(null) : getPayloadKey()).pipe(
    switchMap(key => from(encryptRequest(req, key, binaryResponse))),
    switchMap(protectedRequest => next(protectedRequest)),
    switchMap(event => from(bootstrapLogin ? decryptLoginResponse(event, req.url) : skipsPayloadCrypto || refreshPayloadKey || binaryResponse ? Promise.resolve(event) : decryptResponse(event))),
    finalize(() => { if (loadingId !== null) loading.hide(loadingId); }),
    catchError((err: HttpErrorResponse) => {
      const esLogin = req.url.includes('/api/auth/login');
      if (err.status === 401 && !esLogin) {
        localStorage.removeItem(KEY_TOKEN);
        localStorage.removeItem(KEY_USER);
        payloadKeyPromise = undefined;
        payloadKeyToken = '';
        sessionStorage.removeItem(KEY_CACHE);
        sessionStorage.removeItem(KEY_DISABLED);
        router.navigate(['/login'], { queryParams: { redirect: router.url } });
      }
      return throwError(() => err);
    })
  );
};

async function getPayloadKey(): Promise<CryptoKey | null> {
  const currentToken = localStorage.getItem(KEY_TOKEN) ?? '';
  if (payloadKeyPromise && payloadKeyToken === currentToken) return payloadKeyPromise;
  payloadKeyToken = currentToken;
  const cached = sessionStorage.getItem(KEY_CACHE);
  if (!currentToken) return null;
  if (cached) {
    const [token, encodedKey] = cached.split('.', 2);
    if (token === currentToken && encodedKey) {
      try {
        payloadKeyPromise = crypto.subtle.importKey('raw', fromBase64(encodedKey), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
        return payloadKeyPromise;
      } catch {
        sessionStorage.removeItem(KEY_CACHE);
      }
    } else sessionStorage.removeItem(KEY_CACHE);
  }
  payloadKeyPromise = fetch(apiUrl('/api/auth/payload-key'), {
    credentials: 'include',
    headers: { Authorization: `Bearer ${currentToken}` },
  })
    .then(async response => {
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`No se pudo obtener la clave AES (${response.status}): ${detail}`);
      }
      const payload = await response.json() as { key?: string };
      if (!payload.key) throw new Error('La API no devolvió la clave AES.');
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        fromBase64(payload.key),
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt'],
      );
      sessionStorage.setItem(KEY_CACHE, `${currentToken}.${payload.key}`);
      payloadKeyToken = currentToken;
      return cryptoKey;
    })
    .catch(async error => {
      payloadKeyPromise = undefined;
      payloadKeyToken = '';
      const message = String(error?.message ?? error);
      if (message.includes('(401)')) return refreshSessionPayloadKey();
      throw error;
    });
  return payloadKeyPromise;
}

async function encryptRequest(req: HttpRequest<unknown>, key: CryptoKey | null, binaryResponse: boolean): Promise<HttpRequest<unknown>> {
  if (binaryResponse) return req.clone({ setHeaders: { 'X-Dentamia-Binary-Response': '1' } });
  if (!req.url.includes('/api/') || req.url.includes('/api/auth/login') || req.url.includes('/api/auth/payload-key') || req.body == null || req.body instanceof FormData || req.body instanceof Blob || req.body instanceof ArrayBuffer || req.body instanceof URLSearchParams) {
    return req;
  }
  if (req.headers.has('Content-Type') && !req.headers.get('Content-Type')?.includes('application/json')) return req;
  if (!key) return req;
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(req.body));
  const aad = new TextEncoder().encode(new URL(req.url, document.baseURI).pathname);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad }, key, plain);
  return req.clone({ body: { nonce: toBase64(nonce), ciphertext: toBase64(new Uint8Array(cipher)) }, setHeaders: { 'Content-Type': ENVELOPE, 'X-Dentamia-Encrypted': '1' } });
}

async function decryptLoginResponse(event: HttpEvent<unknown>, requestUrl: string): Promise<HttpEvent<unknown>> {
  if (!(event instanceof HttpResponse) || event.status >= 400 || event.headers.get('content-type')?.split(';')[0]?.toLowerCase() !== LOGIN_ENVELOPE) return event;
  const body = event.body as { challenge?: string; nonce?: string; ciphertext?: string };
  if (!body?.challenge || !body.nonce || !body.ciphertext) throw new Error('Sobre cifrado de login inválido.');
  const challengeBytes = fromBase64(body.challenge);
  const master = await crypto.subtle.digest('SHA-256', new Uint8Array([
    ...new TextEncoder().encode('dentamia-login-v1:'),
    ...challengeBytes,
  ]));
  const cryptoKey = await crypto.subtle.importKey('raw', master, { name: 'AES-GCM' }, false, ['decrypt']);
  const aad = new TextEncoder().encode(new URL(requestUrl, document.baseURI).pathname);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(body.nonce), additionalData: aad },
    cryptoKey,
    fromBase64(body.ciphertext),
  );
  return event.clone({ body: JSON.parse(new TextDecoder().decode(plaintext)) });
}

async function decryptResponse(event: HttpEvent<unknown>): Promise<HttpEvent<unknown>> {
  if (!(event instanceof HttpResponse) || event.status === 204 || event.headers.get('content-type')?.split(';')[0]?.toLowerCase() !== ENVELOPE) return event;
  const key = await getPayloadKey();
  if (!key) throw new Error('No hay clave para descifrar la respuesta.');
  const body = event.body as { nonce?: string; ciphertext?: string };
  if (!body?.nonce || !body.ciphertext) throw new Error('Sobre cifrado inv?lido.');
  const aad = new TextEncoder().encode(new URL(event.url ?? location.href, document.baseURI).pathname);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(body.nonce), additionalData: aad }, key, fromBase64(body.ciphertext));
  return event.clone({ body: JSON.parse(new TextDecoder().decode(plain)) });
}

function toBase64(bytes: Uint8Array): string { let binary = ''; bytes.forEach(v => binary += String.fromCharCode(v)); return btoa(binary); }
function fromBase64(value: string): Uint8Array {
  // urlsafe_b64encode is used by Python's Fernet/key endpoint. Browser atob
  // accepts standard Base64, so normalize URL-safe characters and restore padding.
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')), c => c.charCodeAt(0));
}

async function refreshSessionPayloadKey(): Promise<CryptoKey> {
  const token = localStorage.getItem(KEY_TOKEN);
  if (!token) throw new Error('No hay una sesión autenticada para renovar la clave AES.');
  const response = await fetch(apiUrl('/api/auth/payload-key/refresh'), {
    method: 'POST',
    credentials: 'include',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`No se pudo renovar la clave AES (${response.status}).`);
  const { key } = await response.json() as { key: string };
  const cryptoKey = await crypto.subtle.importKey('raw', fromBase64(key), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  sessionStorage.setItem(KEY_CACHE, `${token}.${key}`);
  payloadKeyPromise = Promise.resolve(cryptoKey);
  payloadKeyToken = token;
  sessionStorage.removeItem(KEY_DISABLED);
  return cryptoKey;
}

function loadingMessageFor(url: string): string | null {
  if (!url.includes('/api/')) return null;
  if (url.includes('/examenes/')) return 'CARGANDO ESTUDIOS E IMÁGENES';
  if (url.includes('/pacientes')) return 'OBTENIENDO DATOS DEL PACIENTE';
  if (url.includes('/citas')) return 'OBTENIENDO AGENDA';
  if (url.includes('/doctores')) return 'OBTENIENDO LISTA DE DOCTORES';
  if (url.includes('/facturas')) return 'OBTENIENDO FACTURAS';
  if (url.includes('/productos')) return 'OBTENIENDO INVENTARIO';
  if (url.includes('/proveedores')) return 'OBTENIENDO PROVEEDORES';
  if (url.includes('/compras-insumos')) return 'OBTENIENDO COMPRAS';
  if (url.includes('/tratamientos') || url.includes('/planes')) return 'OBTENIENDO TRATAMIENTOS Y PLANES';
  if (url.includes('/empresas')) return 'OBTENIENDO EMPRESAS';
  if (url.includes('/usuarios')) return 'OBTENIENDO USUARIOS';
  if (url.includes('/reportes')) return 'PREPARANDO REPORTES';
  if (url.includes('/ia/')) return 'ANALIZANDO DATOS';
  if (url.includes('/diseno3d')) return 'OBTENIENDO DATOS DE DISEÑO 3D';
  if (url.includes('/respaldos')) return 'OBTENIENDO RESPALDOS';
  if (url.includes('/dashboard')) return 'ACTUALIZANDO DASHBOARD';
  if (url.includes('/sucursales')) return 'OBTENIENDO SEDES';
  return 'OBTENIENDO INFORMACIÓN';
}
