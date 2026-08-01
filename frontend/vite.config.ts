import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
    return {
      server: {
        port: 5173,
        host: '0.0.0.0',
        // Vite 6 rejects requests whose Host header isn't localhost or an IP.
        // Tailscale reaches the machine by its MagicDNS name, so allow that suffix.
        // This is a DNS-rebinding guard, not access control — reachability is still
        // governed by the network (LAN + tailnet only; nothing is port-forwarded).
        // '.ts.net' covers the full MagicDNS name; the bare machine name has no
        // suffix to match, so it needs listing separately. Update if the device
        // is renamed (tailscale set --hostname=...).
        allowedHosts: ['.ts.net', 'wealthcompass'],
        proxy: {
          '/api/v1': {
            target: 'http://localhost:8000',
            changeOrigin: true,
            secure: false,
          },
        },
      },
      plugins: [react()],
      // No `define` for GEMINI_API_KEY: nothing in the app reads it, and
      // inlining it would put the key in the browser bundle for anyone to read.
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});