import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 개발 중에는 화면 주소 하나로 서버까지 닿도록 /api, /health, /socket.io 를 서버로 넘긴다
// (다중 서버 확인 때 로드밸런서를 다른 포트에 띄웠다면 API_PROXY_TARGET 으로 바꾼다)
const server = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';

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
