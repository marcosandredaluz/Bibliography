const { defineConfig } = require('vite');
const react = require('@vitejs/plugin-react');

// Em desenvolvimento (vite dev), @vitejs/plugin-react injeta o preambulo HMR inline.
// O index.html fonte e o dist/ de producao permanecem estritamente sem 'unsafe-inline' em script-src.
const devCspPlugin = {
  name: 'dev-hmr-csp',
  apply: 'serve',
  transformIndexHtml(html) {
    return html.replace(
      "script-src 'self' app:;",
      "script-src 'self' 'unsafe-inline' http://localhost:5173 app:;"
    );
  },
};

module.exports = defineConfig({
  base: './',
  plugins: [(react.default || react)(), devCspPlugin],
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true, target: 'esnext', minify: false },
});
