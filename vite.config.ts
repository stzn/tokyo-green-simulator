/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  // GitHub Pagesはプロジェクトサイト（https://stzn.github.io/tokyo-green-simulator/）としてサブパス配信されるため、
  // 本番ビルドのみbaseを変える（開発サーバーは従来どおりルートで動かす）
  base: command === 'build' ? '/tokyo-green-simulator/' : '/',
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.spec.{ts,tsx}', 'scripts/**/*.spec.ts'],
  },
}))
