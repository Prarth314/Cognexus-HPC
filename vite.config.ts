import { defineConfig, loadEnv } from 'vite';
import path from 'node:path';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 3000,
      strictPort: true,
      proxy: { '/api': `http://127.0.0.1:${env.PORT || '3001'}` },
      fs: {
        strict: true,
        deny: [
          `${path.resolve(process.env.DATA_DIR || loadEnv(mode, process.cwd(), '').DATA_DIR || '.data').replaceAll('\\', '/')}/**`,
          '**/.data/**',
          '**/.git/**',
          '**/.env',
          '**/.env.*',
          '**/*.{crt,pem,key,p12,pfx}',
          '**/*recovery-codes*',
        ],
      },
    },
    build: { sourcemap: false },
  };
});
