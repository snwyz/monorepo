# Roadbook Web 基础框架与组件设计

## 1. 目标与范围

在现有 pnpm workspace 与 Turborepo 中新增 `apps/roadbook-web`，作为 Roadbook 的 Web 前端。第一阶段只完成可持续扩展的工程骨架，并提供一个使用 shadcn/ui 组件的 “Hello World” 首页。

本阶段包含：

- Next.js App Router 与 TypeScript；
- Tailwind CSS；
- shadcn/ui 基础配置与一个 `Button` 组件；
- lint、类型检查和生产构建命令；
- 根工作区启动命令及 Turbo 构建输出配置。

本阶段不包含业务接口、登录、状态管理、数据库访问、部署配置以及完整视觉页面。

## 2. 技术方案

采用标准 Next.js App Router 结构，由服务端组件作为默认组件模型。仅当组件需要浏览器事件、状态或浏览器 API 时，才使用 `"use client"` 切换为客户端组件。

核心技术使用 npm `latest` 标签在 2026-09-15 对应的最新稳定版本，不使用 beta、RC、canary 或 nightly：

- Next.js `16.3.5`；
- TypeScript `7.0.2`；
- Tailwind CSS `4.3.3`。

上述版本在 `package.json` 中精确锁定，不使用范围符号。TypeScript 7 通过 `@typescript/native` 别名提供 `tsc`；由于 TypeScript 7.0 尚不提供 typescript-eslint 所需的旧编译器 API，同时安装官方 `@typescript/typescript6` 兼容包供 ESLint 与 Next.js 工具读取。类型检查仍使用 TypeScript 7.0.2。其余配套依赖选择与三者兼容的最新稳定版本，并由 `pnpm-lock.yaml` 固定完整解析结果。项目延续仓库现有约定：使用 pnpm 管理依赖，由 Turborepo 统一调度任务。

## 3. 目录结构

```text
apps/roadbook-web/
  app/
    globals.css          # Tailwind 与全局设计 token
    layout.tsx           # 根布局及页面元数据
    page.tsx             # Hello World 首页
  components/
    ui/
      button.tsx         # shadcn/ui 基础按钮
  lib/
    utils.ts             # className 合并工具
  components.json        # shadcn/ui 生成配置
  eslint.config.mjs      # Next.js ESLint 配置
  next-env.d.ts          # Next.js 类型声明
  next.config.ts         # Next.js 配置
  package.json           # 应用依赖与脚本
  postcss.config.mjs     # Tailwind PostCSS 配置
  tsconfig.json          # TypeScript 配置
  design.md              # 本文档
```

## 4. 组件设计

组件分为两层：

- `components/ui` 保存 shadcn/ui 基础组件。它们只表达通用外观与交互，不包含 Roadbook 业务逻辑。
- 后续业务组件按领域放入 `components/<domain>`。业务组件可以组合 `components/ui`，但基础组件不得反向依赖业务组件。

首个 `Button` 支持 shadcn/ui 标准变体和尺寸，通过 `class-variance-authority` 管理样式变体，并通过 `cn` 工具合并 Tailwind class。首页只使用默认按钮展示 “Hello World”，不引入暂时无用的组件。

## 5. 样式与设计 token

全局颜色、圆角与主题 token 定义在 `app/globals.css`，组件通过语义化 token 使用颜色，不直接绑定具体业务色值。首阶段仅提供 shadcn/ui 所需的基础 token 和简洁居中布局，不建立完整品牌主题。

Tailwind CSS 4 使用自动内容检测覆盖 `app`、`components` 与 `lib` 下的源码，当前阶段不创建无必要的 `tailwind.config`。后续若共享组件进入 `packages`，再通过 `@source` 明确扩展扫描范围，避免当前阶段提前耦合。

## 6. 页面与数据流

首页是无数据依赖的服务端组件：

```text
浏览器请求 → Next.js App Router → 首页服务端组件 → Button 基础组件 → HTML/CSS 响应
```

本阶段没有外部 API、用户输入或持久化状态，因此不设置请求层与全局状态容器。将来接入后端时，服务端读取优先放在对应路由的服务端组件中；需要客户端交互时，再将最小交互边界下沉到客户端组件。

## 7. 异常与边界处理

当前页面不执行可能失败的外部操作，无需自定义错误页。Next.js 默认错误处理负责框架级异常。未来增加远程数据后，再按路由补充 `loading.tsx`、`error.tsx` 和空状态，避免为空骨架预置无行为代码。

## 8. 验收

当前阶段只初始化基础框架，不引入单元测试或 TDD 工具。通过 lint、TypeScript 类型检查和 Next.js 生产构建验证工程配置；业务行为出现后再按实际需求建立测试体系。

验收条件：

1. 首页能渲染可见文本 “Hello World”。
2. 首页使用本地 shadcn/ui `Button` 组件。
3. `lint` 无错误。
4. `typecheck` 无错误。
5. Next.js 生产构建成功。
6. 根目录可通过 `pnpm dev:roadbook-web` 启动该应用。

## 9. 工作区集成

根 `package.json` 增加 `dev:roadbook-web`，使用 workspace filter 启动 Web 应用。根 `turbo.json` 的构建输出同时包含现有 `dist/**` 与 Next.js 的 `.next/**`，并排除 `.next/cache/**`，避免缓存无关的中间数据。

本次不创建 Git 提交，不执行 push，也不部署。
