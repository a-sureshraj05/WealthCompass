import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 5173,
        host: '0.0.0.0',
        // Vite 6 rejects requests whose Host header isn't localhost or an IP.
        // Tailscale reaches the machine by its MagicDNS name, so allow that suffix.
        // This is a DNS-rebinding guard, not access control — reachability is still
        // governed by the network (LAN + tailnet only; nothing is port-forwarded).
        allowedHosts: ['.ts.net'],
        proxy: {
          '/api/v1': {
            target: 'http://localhost:8000',
            changeOrigin: true,
            secure: false,
          },
        },
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});