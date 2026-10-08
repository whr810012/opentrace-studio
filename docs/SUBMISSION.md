# 作品提交清单

[第四届开放原子大赛·2026 开源行业解决方案创新赛](https://www.oschina.net/oa2026/)  
赛道一：开源基础软件与解决方案 · 重点方向：AI 开发工具链与智能体框架  
项目：OpenTrace Studio · 截止：10 月 31 日 24:00

## 材料

1. 公开可运行仓库链接（含 README / LICENSE）  
2. 介绍文档（建议 PDF），正文：`docs/PROJECT-INTRO.md`  
3. 演示视频链接，脚本：`docs/DEMO-SCRIPT.md`  

发至：`bjoscc@oschina.cn`

标题示例：

```text
【赛道一·开源基础软件】OpenTrace Studio 作品提交-<负责人姓名>
```

正文示例：

```text
您好，提交 OpenTrace Studio 参赛材料。

- 项目：OpenTrace Studio
- 赛道：赛道一 开源基础软件与解决方案
- 重点方向：AI 开发工具链与智能体框架
- 主体：<企业 / 高校实验室 / 科研机构 / 开源社区 / 行业联合体>
- 负责人：<姓名> / <手机> / <邮箱>
- 仓库：<公开 URL>
- 视频：<可访问链接>
- 介绍：附件 PDF

一句话：开源 Agent/RAG 调试工作台，页内真跑并直接读 Trace。

谢谢。
```

仓库与视频用链接；附件以 PDF 为主。

## 自检

- [x] `pnpm install && pnpm build` 通过（提交冲刺时已复验）  
- [x] `.env.local` 已在 `.gitignore`（`.env.*`）；确认勿提交明文 Key  
- [x] LICENSE Apache-2.0；依赖说明已更新（含 `@tanstack/react-virtual`）  
- [ ] 视频含：配置 → 真跑 → 证据 → 失败或 Diff → 导出（**待录制**，见 `DEMO-SCRIPT.md`）  
- [x] PDF 正文：`PROJECT-INTRO.md` / 导出件 `OpenTrace-Studio-Intro.pdf`（差异化：自托管 + RAG 证据 + Live Run）  
- [ ] 报名主体为单位（企业、高校实验室、科研机构、开源社区或行业联合体），团队 8 人以内  

邮件草稿：[`SUBMISSION-EMAIL.md`](SUBMISSION-EMAIL.md)。

## 节点

| 日期 | 事项 |
|---|---|
| 10 月 31 日 24:00 | 作品提交截止 |
| 11 月 6 日 | 入围名单 |
| 11 月 13 日 | 北京亦庄通明湖会议中心线下总决赛 |
