# 提交邮件草稿

发至：`oscc@oschina.cn`  
截止：2026-10-11 24:00

## 标题

```text
【开源AI工具赛道】OpenTrace Studio 作品提交-<负责人姓名>
```

## 正文

```text
您好，提交 OpenTrace Studio 参赛材料。

- 项目：OpenTrace Studio
- 赛道：开源 AI 工具（自主选题）
- 主体：<单位/学校>
- 负责人：<姓名> / <手机> / <邮箱>
- 仓库：https://gitee.com/wangdandan810012/opentrace-studio
- 镜像：https://github.com/whr810012/opentrace-studio
- 视频：<可访问链接，上传后填入>
- 介绍：附件 PDF（docs/OpenTrace-Studio-Intro.pdf）

一句话：开源 Agent/RAG 调试工作台，页内真跑并直接读 Trace。

复现：pnpm install && pnpm dev → http://localhost:5173/opentrace/

谢谢。
```

## 附件与链接

| 项 | 状态 | 说明 |
|---|---|---|
| 介绍 PDF | 见同目录 `OpenTrace-Studio-Intro.pdf` | 由 `PROJECT-INTRO.md` + `md-to-pdf.config.mjs` 导出 |
| 演示视频 | **待录制** | 按 `DEMO-SCRIPT.md`，约 2.5–3 分钟 |
| 公开仓库 | Gitee 已就绪 | 发信前确认 README 与最新代码已推送 |

## 发信前自检

- [ ] `pnpm install && pnpm build` 通过  
- [ ] 仓库无明文 API Key；本地 `.env.local` 勿提交  
- [ ] PDF 含差异化表述（自托管 + RAG 证据 + Live Run）  
- [ ] 视频可公开访问；含配置→真跑→证据→失败/Diff→导出  
- [ ] 未绑企业命题  
- [ ] 邮件标题/正文占位符已替换  
