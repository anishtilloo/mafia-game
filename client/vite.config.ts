import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    host: true, // reachable from phones on the same Wi-Fi during development
    port: 2000,
    proxy: {
      '/socket.io': { target: 'http://localhost:8004', ws: true },
    },
  },
});
