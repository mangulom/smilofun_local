/** Sustituto de `url` de Node para dependencias que se ejecutan en el navegador. */
export const URL = globalThis.URL;
export const URLSearchParams = globalThis.URLSearchParams;

const url = { URL, URLSearchParams };

export default url;
