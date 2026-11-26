import { defineConfig, type Plugin } from 'vite';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Endpoint dev-only: bake tool POST JSON → public/baked/<name>.json
const bakeSave = (): Plugin => ({
  name: 'bake-save',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/__bake/save', (req, res) => {
      const name = new URL(req.url ?? '', 'http://x').searchParams.get('name') ?? 'knight';
      if (req.method !== 'POST' || !/^[a-z0-9-]+$/.test(name)) {
        res.statusCode = 400;
        return res.end();
      }
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        JSON.parse(body); // validasi
        mkdirSync(resolve('public/baked'), { recursive: true });
        writeFileSync(resolve(`public/baked/${name}.json`), body);
        res.end('ok');
      });
    });
  },
});

export default defineConfig({
  plugins: [bakeSave()],
  build: {
    target: 'es2022',
    // Hanya player yang di-build. bake.html (Three.js) khusus dev server.
    rolldownOptions: { input: { main: resolve('index.html') } },
  },
  optimizeDeps: { entries: ['index.html', 'bake.html'] },
  assetsInclude: ['**/*.glb'],
});
