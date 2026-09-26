# Roadbook 项目上下文

## 项目概览

- 本仓库是基于 pnpm workspace 与 Turborepo 的单体仓库。
- Web 应用位于 `apps/roadbook-web`，使用 Next.js。
- 地图领域能力位于 `packages/map`，Web 端使用腾讯地图适配器。
- 小程序位于 `apps/roadbook-mini-app`，共享配置位于 `packages/config`。

## 子项目规范

- 开始任何 Roadbook Web 需求、设计、实现、诊断或评审前，先读取 `apps/roadbook-web/AGENTS.md`，并按其中的路由读取相关正式规范。

## 开发约定

- 文档使用中文。
- 前端按领域职责组织命名与组件，保持单一职责。
- 页面改动需要关注首屏加载性能与布局稳定性，目标为 LCP、CLS 无回退。
- `@roadbook/map` 的 ECMAScript 运行库基线为 `ES2019`；不得直接使用 ES2020 及以上才提供的内建 API，也不得仅通过提高 TypeScript `lib` 消除兼容性报错。
- 修改后优先验证最小相关包，再验证受影响的应用。
- 不提交构建产物、缓存、密钥、日志、数据库或临时文件。
- 不执行 Git push；提交前必须检查暂存文件与忽略规则。
