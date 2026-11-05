import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
// @ts-expect-error — the server-only handler is plain JavaScript, tested independently.
import { handleApplication } from './api/application.mjs';
// @ts-expect-error — the server-only handler is plain JavaScript, tested independently.
import { handleEvents } from './api/events.mjs';

export default defineConfig(({ mode }) => {
  const localEnv = loadEnv(mode, process.cwd(), '');
  return {
  plugins: [react(), tailwindcss(), {
    name: 'local-application-api',
    configureServer(server) {
      server.middlewares.use('/api/events', async (req, res) => {
        try {
          const response = await handleEvents(new Request('http://localhost/api/events', { method: req.method }));
          res.writeHead(response.status, Object.fromEntries(response.headers));
          res.end(await response.text());
        } catch {
          res.writeHead(503); res.end(JSON.stringify({ error: 'Events are temporarily unavailable.' }));
        }
      });
      server.middlewares.use('/api/application', async (req, res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        try {
          for await (const chunk of req) {
            size += chunk.length;
            if (size > 16384) { res.writeHead(413); res.end(JSON.stringify({ error: 'Your application is too long.' })); return; }
            chunks.push(Buffer.from(chunk));
          }
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(',') : value);
          const request = new Request('http://localhost/api/application', { method: req.method, headers, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined });
          const response = await handleApplication(request, { env: { ...localEnv, ...process.env } });
          res.writeHead(response.status, Object.fromEntries(response.headers));
          res.end(await response.text());
        } catch {
          res.writeHead(500); res.end(JSON.stringify({ error: 'Application service unavailable. Please try again later.' }));
        }
      });
    },
  }],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  };
});
