# OpenTrace Studio

开源 Agent / RAG 运行时可视化与调试工作台。  
面向第四届开放原子大赛·2026 开源行业解决方案创新赛 · 赛道一「开源基础软件与解决方案」（AI 开发工具链与智能体框架）。

时间线 · 调用图 · RAG 证据 · 回放；页面内 Live Run 真调 API，Trace 直接写入。

## 功能

- Live Run（DeepSeek / OpenAI / 火山预设）、流式回答、本机会话持久化
- 时间线（虚拟列表）/ 调用图 / 瀑布图 / 关键路径、失败诊断、会话统计与 Diff
- JSONL / OTLP / LangGraph / Dify 导入，本地 OTLP ingest，Markdown / HTML / CSV，分享链接
- Dataset 启发式评测与可选 LLM-as-judge；span 渲染插件
- 回放倍速与断点、快捷键、`pnpm test` + GitHub CI

## 快速开始

推荐 [pnpm](https://pnpm.io/)（`corepack enable` 后即可用）：

```bash
pnpm install
pnpm dev
```

打开 `http://localhost:5173/opentrace/`：选预设 → 填 Key → 运行。无 Key 时可加载左侧离线 / OTLP 样例。

本仓库 Vite `base` 为 `/opentrace/`，与 [蛋蛋中心](https://dandanhub.vip/toolbox) 反代路径一致。本地开发也请带此前缀访问。

密钥只在当前浏览器标签页（sessionStorage）；会话在 localStorage。

```bash
pnpm build
pnpm preview
pnpm test
```

产物在 `dist/`。生产 Live Run 走 Cloudflare Pages Function：`/opentrace/llm-proxy/*`。

## 部署到 dandanhub.vip

1. Cloudflare Pages 导入本仓库，Build：`pnpm install && pnpm build`，Output：`dist`
2. 记下 `https://<project>.pages.dev`
3. 在 [dandanhub](https://github.com/whr810012/dandanhub) 的 `wrangler.toml` 设置 `OPENTRACE_ORIGIN`（无末尾 `/`）并部署 Hub
4. 入口：https://dandanhub.vip/toolbox → https://dandanhub.vip/opentrace/

## 文档

- [操作手册](docs/USER-MANUAL.md)
- [作品介绍](docs/PROJECT-INTRO.md)
- [对比说明](docs/COMPARISON.md)
- [架构](docs/ARCHITECTURE.md)
- [演示脚本](docs/DEMO-SCRIPT.md)
- [提交清单](docs/SUBMISSION.md)
- [提交邮件草稿](docs/SUBMISSION-EMAIL.md)
- [OTLP 薄桥](docs/OTLP-BRIDGE.md)
- [路演底稿](docs/PITCH.md)
- [依赖说明](docs/DEPENDENCY-NOTICE.md)
- [路线图](docs/ROADMAP.md)
- [Span 插件](docs/PLUGINS.md)
- [评测](docs/EVAL.md)
- [框架适配](docs/FRAMEWORK-ADAPTERS.md)

## JSONL 协议

每行一个 JSON：

```json
{"type":"session","session":{"id":"s1","title":"demo","startedAt":"2026-08-25T00:00:00.000Z","question":"...","answer":"..."}}
{"type":"span","span":{"sessionId":"s1","id":"a1","name":"llm.answer","kind":"llm","status":"ok","startMs":0,"endMs":100,"input":{},"output":{}}}
```

## 开源协议

Apache-2.0。见 [LICENSE](LICENSE)、[CONTRIBUTING](CONTRIBUTING.md)、[SECURITY](SECURITY.md)。
