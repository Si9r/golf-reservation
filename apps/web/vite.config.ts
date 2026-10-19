import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  // credentials 폴더의 비밀 파일이 개발 서버 주소로 열리지 않도록 차단
  server: {
    // API 서버(apps/api, 8787)로 프록시: 화면은 /api/golf/... 로 부르면 됨
    proxy: { "/api": "http://localhost:8787" },
    fs: { deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/credentials/**"] },
  },
  // 공유 모드(시작.bat): 빌드 결과를 4173 포트로 띄우고 Cloudflare 터널 주소로 접속을 받음
  preview: {
    port: 4173,
    strictPort: true,
    allowedHosts: [".trycloudflare.com", "localhost", "127.0.0.1"],
  },
});
