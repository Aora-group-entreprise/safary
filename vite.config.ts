import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const DEFAULT_SUPABASE_URL = 'https://tzznkrxnwbadgwsvlsle.supabase.co';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const supabaseUrl = (env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, '');

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: supabaseUrl,
          changeOrigin: true,
          ws: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
  };
});
