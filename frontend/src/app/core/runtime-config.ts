import { Injectable } from '@angular/core';

const configRuntime = globalThis as typeof globalThis & { __smilofunApiBase?: string };

/** Configuración pública cargada desde public/config.ini antes del bootstrap Angular. */
@Injectable({ providedIn: 'root' })
export class RuntimeConfig {
  private base = configRuntime.__smilofunApiBase ?? '';

  setApiUrl(value: string): void {
    const candidate = value.trim().replace(/\/+$/, '');
    if (!candidate) {
      this.base = '';
      return;
    }
    try {
      const url = new URL(candidate);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Protocolo no permitido');
      if (url.protocol === 'http:' && !esHostLocal(url.hostname)) throw new Error('El backend remoto requiere HTTPS');
      this.base = url.toString().replace(/\/+$/, '');
    } catch {
      console.warn('[config.ini] api_url inválida; se usarán rutas relativas /api.');
      this.base = '';
    }
  }

  url(path: string): string {
    const base = this.base || configRuntime.__smilofunApiBase || '';
    if (!base || !path.startsWith('/')) return path;
    return `${base}${path}`;
  }
}

export async function cargarConfiguracion(): Promise<void> {
  const runtime = new RuntimeConfig();
  try {
    const response = await fetch('/config.ini', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    const values = new Map<string, string>();
    let section = '';
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith(';') || line.startsWith('#')) continue;
      const header = line.match(/^\[([^\]]+)\]$/);
      if (header) { section = header[1].trim().toLowerCase(); continue; }
      const separator = line.indexOf('=');
      if (separator < 0) continue;
      const key = line.slice(0, separator).trim().toLowerCase();
      const value = line.slice(separator + 1).split(/[;#]/, 1)[0].trim();
      if (!section || section === 'api' || section === 'frontend') values.set(key, value);
    }
    runtime.setApiUrl(values.get('api_url') ?? values.get('backend_url') ?? '');
  } catch (error) {
    console.info('[config.ini] No se pudo cargar; se usarán rutas relativas /api.', error);
  }
  // Se registra en el inyector antes del bootstrap para que todos los servicios
  // HTTP, incluido el login, usen el mismo origen configurado.
  configRuntime.__smilofunApiBase = runtime.url('');
}

export function apiUrl(path: string): string {
  let base = configRuntime.__smilofunApiBase ?? '';
  // In the all-in-one Vercel deployment the API is same-origin under /api.
  // Ignore stale local API overrides saved by the previous Render setup.
  if (typeof location !== 'undefined' && location.hostname.endsWith('.vercel.app')) {
    return path;
  }
  if (!base && typeof localStorage !== 'undefined') {
    base = localStorage.getItem('smilofun_api_url')?.trim().replace(/\/+$/, '') ?? '';
  }
  if (!base || !path.startsWith('/')) return path;
  try {
    const url = new URL(base);
    if (!['http:', 'https:'].includes(url.protocol)) return path;
    if (url.protocol === 'http:' && !esHostLocal(url.hostname)) return path;
    return `${url.toString().replace(/\/+$/, '')}${path}`;
  } catch { return path; }
}

function esHostLocal(host: string): boolean {
  const value = host.toLowerCase();
  return value === 'localhost' || value === '127.0.0.1' || value === '::1' || value.endsWith('.localhost');
}
