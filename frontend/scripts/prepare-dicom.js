/*
 * Cornerstone's browser codecs retain guarded `require('fs'|'path')` calls for
 * Node. Angular/esbuild resolves them while bundling, even though the guarded
 * branches never run in a browser. Supply tiny CommonJS shims before builds.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const stubs = {
  fs: 'module.exports = {};\n',
  path: [
    "const join = (...parts) => parts.filter(Boolean).join('/');",
    'module.exports = { join, resolve: join, dirname: () => \'\', basename: (value) => String(value).split(\'/\').pop() };',
    '',
  ].join('\n'),
  url: 'module.exports = { URL: globalThis.URL, URLSearchParams: globalThis.URLSearchParams };\n',
};

for (const [name, source] of Object.entries(stubs)) {
  const directory = path.join(root, 'node_modules', name);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name, private: true, main: 'index.js' }));
  fs.writeFileSync(path.join(directory, 'index.js'), source);
}
