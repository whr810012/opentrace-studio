# MVP 范围

赛道：赛道一「开源基础软件与解决方案」· AI 开发工具链与智能体框架  
冻结：2026-08-25 · 冲刺补充：2026-09-03  
提交截止：10 月 31 日 24:00 → `bjoscc@oschina.cn`

## 必须有

1. Trace 时间线（耗时、状态、筛选；失败可诊断）  
2. 工具调用图（点选看参数 / 返回）  
3. RAG 证据面板（与选中 span 联动）  
4. 会话回放（逐步 / 自动）  
5. JSONL 导入 / 导出  
6. Live Run：页内真调 LLM，边跑边写 Trace  
7. Run Diff：两次会话耗时 / 状态 / 答案  
8. OTLP JSON 薄导入 + 离线样例  
9. 提交包：公开仓库 + 介绍 PDF + 演示视频（`docs/SUBMISSION.md`）  

## 本届不做

- 企业命题（openKylin / 15 分钟生活圈 / 魔珐 / ZSvirt 等）  
- 多租户云托管、账号体系  
- 自建向量库 / 训练平台  
- 完整 Agent IDE  
- 万级 span 虚拟列表、完整 OTLP Collector、LangGraph / Dify 深度 SDK  

## 验收

- `pnpm install && pnpm dev`；`pnpm build` 无密钥  
- 能完成首次真跑；流式答案可见；刷新会话仍在  
- 工具失败时保留 error span，有诊断分类  
- JSONL 可导入导出；四视图联动；可 Diff  
- README / LICENSE / CONTRIBUTING / SECURITY / 介绍与模板齐全  
- 公开仓库 URL + PDF + 约 3 分钟内演示视频可提交  
