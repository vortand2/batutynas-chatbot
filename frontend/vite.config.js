import { defineConfig, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [
    // Pre-transform .js files as JSX so Rollup can parse them.
    // CRA allowed JSX in .js files; Vite requires explicit opt-in.
    {
      name: 'treat-js-files-as-jsx',
      enforce: 'pre',
      async transform(code, id) {
        if (!id.includes('node_modules') && id.endsWith('.js')) {
          return transformWithEsbuild(code, id, { loader: 'jsx' });
        }
      },
    },
    react(),
  ],
  optimizeDeps: {
    esbuildOptions: {
      loader: { '.js': 'jsx' },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Map REACT_APP_ env vars so existing source files work without changes.
  // Vercel injects REACT_APP_BACKEND_URL="" — empty string makes /api calls relative.
  define: {
    'process.env.REACT_APP_BACKEND_URL': JSON.stringify(
      process.env.REACT_APP_BACKEND_URL ?? ''
    ),
    'process.env.REACT_APP_GOOGLE_MAPS_KEY': JSON.stringify(
      process.env.REACT_APP_GOOGLE_MAPS_KEY ?? ''
    ),
  },
  build: {
    outDir: 'build',   // keep same output dir as CRA so Vercel detects it
  },
});
