# 路演底稿（5–8 分钟）

场合：2026 上海开源软件应用创新大赛 · 开源 AI 工具 · 10 月 24 日上海  
项目：OpenTrace Studio（自主选题）

## 开场（30s）

一句话：Agent / RAG 的本机调试台——时间线、调用图、证据、回放；页内真跑会直接写出 Trace。

## 痛点（45s）

- 聊天过程：难筛选、难讲清楚  
- 日志：有数据、不好看  
- 云控制台：强，但常绑平台  

缺口：开源、本机可跑、面向交互调试。

## 演示（2.5–3.5 分钟）

优先真跑；挂了就切离线样例。

1. 预设 → Key 打码 → 跑示例问题  
2. 时间线 + 流式答案  
3. 点 `retriever.local_kb` 看分数与原文  
4. 失败：红 span + 右侧诊断，或导入 `sample-otlp.json`  
5. 两次 Run → Diff  
6. 导出 JSONL；可提 OTLP JSON 也能进  

离线文件：`public/demo/offline-pitch.jsonl`

## 差异（60s）

- 相对 LangSmith：自托管 + RAG 证据挂在 span + Live Run 直读  
- 失败步骤留在时间线  
- 协议薄：JSONL；OTLP JSON 子集可转，不做重采集后端  

## 治理与后续（45s）

Apache-2.0、SECURITY、Issue/PR、依赖说明。  
赛后：万级 span、完整 OTLP、LangGraph / Dify 适配。

## 收尾

「仓库地址已公开，`pnpm install && pnpm dev` 可复现。」

| 提问 | 答法 |
|---|---|
| 和 LangSmith？ | 他们偏 SaaS 与生态；我们偏开源本机与演示。 |
| 生产？ | 当前浏览器 + 本地代理；协议可导出对接外部。 |
| 为何自主选题？ | 贴合本机观测工作台，避免换题重做。 |
| 数据来源？ | 真 API + 本地 RAG + Open-Meteo；Key 只在本机。 |
