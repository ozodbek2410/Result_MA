import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Перенаправляем use-sync-external-store на встроенный React 18 hook
      'use-sync-external-store/shim/index.js': 'react',
      'use-sync-external-store/shim/with-selector.js': path.resolve(__dirname, './use-sync-external-store-shim.js'),
      'use-sync-external-store/shim/with-selector': path.resolve(__dirname, './use-sync-external-store-shim.js'),
      'use-sync-external-store/shim': 'react',
    }
  },
  ssr: {
    noExternal: ['use-sync-external-store']
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: [
      '.trycloudflare.com',
      '.loca.lt',
      '.ngrok-free.app',
      '.ngrok.io',
    ],
    proxy: {
      '/api': {
        target: 'http://localhost:9999',
        changeOrigin: true
      },
      '/uploads': {
        target: 'http://localhost:9999',
        changeOrigin: true
      }
    }
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'axios',
      'zustand',
      'framer-motion',
      '@tanstack/react-query',
    ],
    exclude: ['@tiptap/react', '@tiptap/starter-kit'],
    esbuildOptions: {
      mainFields: ['module', 'main'],
      resolveExtensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json']
    }
  },
  build: {
    commonjsOptions: {
      include: [/use-sync-external-store/, /node_modules/],
      transformMixedEsModules: true,
    },
    target: 'es2015',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug'],
      }
    },
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': ['framer-motion', 'lucide-react'],
          'editor-vendor': ['@tiptap/react', '@tiptap/starter-kit', '@tiptap/extension-placeholder'],
          'chart-vendor': ['recharts'],
          'math-vendor': ['katex', 'react-katex'],
          'query-vendor': ['@tanstack/react-query'],
          'utils-vendor': ['axios', 'zustand', 'clsx', 'tailwind-merge'],
        }
      }
    },
    chunkSizeWarningLimit: 1000,
    sourcemap: false,
    cssCodeSplit: true,
    reportCompressedSize: false,
  },
  esbuild: {
    logOverride: { 'this-is-undefined-in-esm': 'silent' },
    legalComments: 'none',
  },
});
