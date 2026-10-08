# Roadmap

[第四届开放原子大赛·2026 开源行业解决方案创新赛](https://www.oschina.net/oa2026/) · 赛道一「开源基础软件与解决方案」· AI 开发工具链与智能体框架

## 赛期

| 节点 | 日期 |
|---|---|
| 作品提交 | — **10 月 31 日 24:00** |
| 入围 | 11 月 6 日 |
| 北京总决赛 | **11 月 13 日**（亦庄通明湖会议中心，须线下路演） |

材料发 `bjoscc@oschina.cn`（仓库 + PDF + 视频）。

## v0.1–v0.2（已完成）

时间线 / 调用图 / RAG 证据 / 回放 / Live Run / JSONL / 持久化 / 引导与文档模板。

## v0.3 提交冲刺（进行中）

已完成：失败诊断、统计与筛选、引用跳转、Run Diff、OTLP 导入、双模型对比、瀑布图与关键路径、分享链接、回放断点、CSV、单测与 CI、SECURITY、白天/夜间主题、pnpm、流式 usage、RAG 质检快照、OTLP usage/检索字段加厚等。

待办（非代码为主）：

- [x] 公开仓库（Gitee）  
- [x] 介绍 PDF（`docs/OpenTrace-Studio-Intro.pdf`，源 `PROJECT-INTRO.md`）  
- [ ] 演示视频（按 `DEMO-SCRIPT.md` 录制约 3 分钟）  
- [ ] `pnpm ls` 核对后发邮件（草稿：`SUBMISSION-EMAIL.md`）  

本届不做（边界）：完整 OTLP Collector / protobuf、LangGraph·Dify **深度 SDK 注入**、云托管、账号体系。  
（万级虚拟列表、薄适配器、本地 ingest、评测与插件已在 v0.4 落地。）

## v0.4（功能迭代）

- [x] 万级 span 渲染（Timeline 虚拟列表 / Waterfall 窗口 / CallGraph 分层；`MAX_SPANS=50k`）  
- [x] OTLP 语义加厚 + 可选本地 ingest（Vite middleware，非 Collector）  
- [x] LangGraph / Dify 离线适配  
- [x] 数据集 + 启发式 / 可选 LLM-as-judge 评测  
- [x] 自定义 span 渲染插件（`registerSpanRenderer`）  

## 维护

双周小版本；Issue：`bug` / `enhancement` / `docs`。欢迎样例 Trace 与适配器贡献。
