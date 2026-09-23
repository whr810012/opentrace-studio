# 依赖说明

协议：Apache-2.0。主要依赖以 `package.json` 为准：

| 依赖 | 用途 | 许可证 |
|---|---|---|
| react / react-dom | UI | MIT |
| vite | 构建 / 开发服务 | MIT |
| @vitejs/plugin-react | React 插件 | MIT |
| typescript | 类型检查 | Apache-2.0 |
| vitest / @types/node | 测试与 Node 类型（开发） | MIT |

1. 与 Apache-2.0 常见组合兼容。  
2. Live Run 会请求用户配置的上游 API 与 Open-Meteo；条款与费用由用户自负，Key 只在本机。  
3. 发行时保留 `LICENSE` 与本文；新增依赖请更新本表。  

提交前建议 `pnpm ls`，确认无密钥进仓库。
