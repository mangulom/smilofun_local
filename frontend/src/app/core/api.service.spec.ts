import { apiUrl } from './runtime-config';

describe('API runtime URL', () => {
  afterEach(() => localStorage.removeItem('smilofun_api_url'));

  it('uses the relative API path by default', () => {
    localStorage.removeItem('smilofun_api_url');
    expect(apiUrl('/api/proveedores')).toBe('/api/proveedores');
  });

  it('uses an externally configured backend origin', () => {
    localStorage.setItem('smilofun_api_url', 'http://127.0.0.1:8010/');
    expect(apiUrl('/api/proveedores')).toBe('http://127.0.0.1:8010/api/proveedores');
  });

  it('rejects a malformed origin and keeps relative requests', () => {
    localStorage.setItem('smilofun_api_url', 'javascript:alert(1)');
    expect(apiUrl('/api/proveedores')).toBe('/api/proveedores');
  });
});
