import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { llmProxyPlugin } from './vite.llm-proxy'

export default defineConfig({
  // Hub 反代路径：https://dandanhub.vip/opentrace/
  base: '/opentrace/',
  plugins: [react(), llmProxyPlugin()],
  server: {
    port: 5173,
  },
  preview: {
    port: 4173,
  },
})
