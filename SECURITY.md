# Security Policy

## 密钥

- 不要把 API Key、`.env`、`.env.local` 提交到 Git。
- API Key 只放 sessionStorage；地址与 Model 可放 localStorage。
- 会话 Trace 在本机 localStorage。演示录像请打码 Key。

## 开发代理

- `/llm-proxy` 仅随 `vite` / `vite preview` 提供。
- 内网 / 本机目标会被拒绝；连接钉住解析后的公网 IP。
- 不要把 preview 端口暴露到公网。

## 分享链接

- `#ot=` 加载前会确认，并限制体积、校验结构。

## 报告漏洞

密钥泄露、RCE、供应链等问题请私下联系维护者；不要在公开 Issue 贴 Key。

## 依赖

见 `docs/DEPENDENCY-NOTICE.md`。新依赖需兼容 Apache-2.0。
