import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 개발 중에는 화면 주소 하나로 서버까지 닿도록 /api, /health, /socket.io 를 서버로 넘긴다
const server = 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': server,
      '/health': server,
      '/socket.io': { target: server, ws: true },
    },
  },
});
