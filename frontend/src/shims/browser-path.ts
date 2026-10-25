/** API mínima para que los módulos WASM puedan compilarse para el navegador. */
const unir = (...partes: string[]): string => partes.filter(Boolean).join('/').replace(/\/+/g, '/');

const path = {
  join: unir,
  resolve: unir,
  dirname: (valor: string): string => valor.slice(0, Math.max(0, valor.lastIndexOf('/'))),
  basename: (valor: string): string => valor.slice(valor.lastIndexOf('/') + 1),
};

export const join = path.join;
export const resolve = path.resolve;
export const dirname = path.dirname;
export const basename = path.basename;
export default path;
