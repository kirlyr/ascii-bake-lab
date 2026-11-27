import { defineConfig, type Plugin } from 'vite';
import { writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';

// Endpoint dev-only: bake tool POST container biner (packBake) → public/baked/<name>.bake (gzip level 9).
const bakeSave = (): Plugin => ({
  name: 'bake-save',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/__bake/save', (req, res) => {
      const name = new URL(req.url ?? '', 'http://x').searchParams.get('name') ?? 'hero';
      if (req.method !== 'POST' || !/^[a-z0-9-]+$/.test(name)) {
        res.statusCode = 400;
        return res.end();
      }
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks);
        if (body.readUInt32LE(0) !== 0x33425341) {
          res.statusCode = 400;
          return res.end('bukan container ASB3');
        }
        mkdirSync(resolve('public/baked'), { recursive: true });
        writeFileSync(resolve(`public/baked/${name}.bake`), gzipSync(body, { level: 9 }));
        res.end('ok');
      });
    });
  },
});

export default defineConfig({
  plugins: [bakeSave()],
  build: {
    target: 'es2022',
    // Hanya player (Tavern) + home yang di-build. bake.html (Three.js) khusus dev server.
    rolldownOptions: { input: { main: resolve('index.html'), home: resolve('home.html') } },
  },
  optimizeDeps: { entries: ['index.html', 'bake.html'] },
  assetsInclude: ['**/*.glb'],
});
