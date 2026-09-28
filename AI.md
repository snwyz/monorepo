# Roadbook AI 上下文入口

本仓库使用 pnpm workspace 与 Turborepo 管理 Web、小程序和共享领域包。

- 仓库协作与工程约定见 [AGENTS.md](AGENTS.md)。
- Web 需求、诊断和实现先读取 [Web 工作入口](apps/roadbook-web/AGENTS.md)，再按任务读取其指定的产品、UI 和组件规范。
- Web 应用位于 `apps/roadbook-web`，地图领域与供应商适配位于 `packages/map`，小程序位于 `apps/roadbook-mini-app`。
- 文档使用中文；前端按领域职责组织，关注首屏性能与布局稳定性。
- 不读取忽略文件中的环境配置、密钥或生成产物；保留已有工作树修改。

本文件只提供上下文导航，具体规范以对应的 `AGENTS.md` 和正式文档为准。
