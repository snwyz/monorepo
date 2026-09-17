# Roadbook Web 基础框架实施计划

> **执行决策（2026-09-15）：** 用户明确决定前期不采用 TDD，直接编码。下文中测试文件、测试依赖及红—绿步骤不再执行；最终验收以 lint、TypeScript 类型检查和 Next.js 生产构建为准。此决策优先于原计划中的测试步骤。

> **供执行代理使用：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，逐项执行本计划。所有步骤使用复选框跟踪。

**目标：** 在现有 pnpm monorepo 中新增一个使用最新稳定版 Next.js、TypeScript、Tailwind CSS 和 shadcn/ui 的最小 Web 应用，并渲染 “Hello World”。

**架构：** 应用位于 `apps/roadbook-web`，采用 Next.js App Router 和服务端组件默认模型。shadcn/ui 基础组件放在 `components/ui`，页面通过该层组合 UI；根工作区仅负责统一启动与 Turbo 任务调度。

**技术栈：** Next.js 16.3.5、React 19.3.0、TypeScript 7.0.2、Tailwind CSS 4.3.3、shadcn/ui、pnpm 11.12.0、Turborepo 2.8.11。TypeScript 7 提供 `tsc`，官方 `@typescript/typescript6` 兼容包仅供依赖旧编译器 API 的 ESLint 工具链使用。

**规格：** `apps/roadbook-web/design.md`

## 全局约束

- Next.js 精确使用 `16.3.5`，不使用 beta、RC 或 canary。
- TypeScript 精确使用 `7.0.2`，不使用 nightly。
- Tailwind CSS 精确使用 `4.3.3`。
- 所有直接依赖使用精确版本，不使用 `^` 或 `~`。
- 页面只实现 “Hello World”，不增加接口、登录、状态管理或部署配置。
- 文档使用中文。
- 不创建 Git 提交，不执行 push 或部署。
- 不读取 `.gitignore` 排除的业务数据或环境文件；依赖安装仅允许 pnpm 管理被忽略的 `node_modules`。

---

## 文件结构

### 新建文件

- `apps/roadbook-web/package.json`：应用依赖与脚本。
- `apps/roadbook-web/tsconfig.json`：Next.js TypeScript 编译配置与 `@/*` 别名。
- `apps/roadbook-web/next-env.d.ts`：Next.js 类型声明入口。
- `apps/roadbook-web/next.config.ts`：Next.js 应用配置。
- `apps/roadbook-web/postcss.config.mjs`：Tailwind CSS 4 PostCSS 插件配置。
- `apps/roadbook-web/eslint.config.mjs`：Next.js Core Web Vitals 与 TypeScript lint 规则。
- `apps/roadbook-web/components.json`：shadcn/ui 路径、样式与 CSS 变量配置。
- `apps/roadbook-web/tests/page.test.tsx`：首页服务端渲染测试。
- `apps/roadbook-web/lib/utils.ts`：shadcn/ui className 合并函数。
- `apps/roadbook-web/components/ui/button.tsx`：shadcn/ui Button 基础组件。
- `apps/roadbook-web/app/page.tsx`：Hello World 首页。
- `apps/roadbook-web/app/layout.tsx`：根布局与元数据。
- `apps/roadbook-web/app/globals.css`：Tailwind 引入及 shadcn/ui 语义 token。

### 修改文件

- `package.json`：增加根启动脚本 `dev:roadbook-web`。
- `turbo.json`：将 `.next/**` 加入构建输出并排除 `.next/cache/**`。
- `pnpm-lock.yaml`：由 `pnpm install` 自动更新，禁止手工编辑。

### 已有文档

- `apps/roadbook-web/design.md`：组件与架构设计，实施时保持内容一致。

---

### 任务 1：建立应用配置与依赖边界

**文件：**

- 新建：`apps/roadbook-web/package.json`
- 新建：`apps/roadbook-web/tsconfig.json`
- 新建：`apps/roadbook-web/next-env.d.ts`
- 新建：`apps/roadbook-web/next.config.ts`
- 新建：`apps/roadbook-web/postcss.config.mjs`
- 新建：`apps/roadbook-web/eslint.config.mjs`
- 新建：`apps/roadbook-web/components.json`
- 自动修改：`pnpm-lock.yaml`

**接口：**

- 输入：根 `pnpm-workspace.yaml` 已包含 `apps/*`。
- 输出：名为 `roadbook-web` 的 workspace 包，以及后续任务可调用的 `dev`、`build`、`lint`、`typecheck`、`test` 脚本。

- [ ] **步骤 1：创建精确版本的应用清单**

`apps/roadbook-web/package.json`：

```json
{
  "name": "roadbook-web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "tsx --test tests/**/*.test.tsx"
  },
  "dependencies": {
    "@radix-ui/react-slot": "1.3.3",
    "class-variance-authority": "0.7.1",
    "clsx": "2.1.1",
    "next": "16.3.5",
    "react": "19.3.0",
    "react-dom": "19.3.0",
    "tailwind-merge": "3.7.0",
    "tw-animate-css": "1.4.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "4.3.3",
    "@typescript/native": "npm:typescript@7.0.2",
    "@types/node": "26.5.1",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "eslint": "9.39.4",
    "eslint-config-next": "16.3.5",
    "postcss": "8.5.28",
    "tailwindcss": "4.3.3",
    "typescript": "npm:@typescript/typescript6@6.0.2"
  }
}
```

- [ ] **步骤 2：创建 TypeScript 与 Next.js 配置**

`apps/roadbook-web/tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`apps/roadbook-web/next-env.d.ts`：

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />

// 此文件由 Next.js 使用，不应手工修改。
```

`apps/roadbook-web/next.config.ts`：

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
```

- [ ] **步骤 3：创建 Tailwind、ESLint 与 shadcn/ui 配置**

`apps/roadbook-web/postcss.config.mjs`：

```js
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

`apps/roadbook-web/eslint.config.mjs`：

```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([".next/**"]),
]);
```

`apps/roadbook-web/components.json`：

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

- [ ] **步骤 4：安装依赖并检查 workspace 识别**

运行：

```bash
rtk pnpm install
rtk pnpm --filter roadbook-web exec next --version
```

预期：安装命令退出码为 0，版本命令输出 `Next.js v16.3.5`。若 pnpm 报 peer 或 engine 错误，先分析具体约束，不重复安装命令。

---

### 任务 2：以 TDD 实现 Hello World 与 shadcn/ui Button

**文件：**

- 新建测试：`apps/roadbook-web/tests/page.test.tsx`
- 新建实现：`apps/roadbook-web/lib/utils.ts`
- 新建实现：`apps/roadbook-web/components/ui/button.tsx`
- 新建实现：`apps/roadbook-web/app/page.tsx`

**接口：**

- 输入：任务 1 提供 React、tsx、路径别名和 shadcn/ui 依赖。
- 输出：默认导出 `Home(): React.JSX.Element`；导出 `Button`、`buttonVariants`；导出 `cn(...inputs: ClassValue[]): string`。

- [ ] **步骤 1：先创建首页失败测试**

`apps/roadbook-web/tests/page.test.tsx`：

```tsx
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import Home from "@/app/page";

test("首页使用按钮呈现 Hello World", () => {
  const html = renderToStaticMarkup(<Home />);

  assert.match(html, /<button/);
  assert.match(html, />Hello World<\/button>/);
});
```

使该测试失败的生产变更是缺失的 `app/page.tsx`；测试同时验证可见文案和本地 Button 最终渲染为原生按钮。

- [ ] **步骤 2：运行测试并确认正确失败**

运行：

```bash
rtk pnpm --filter roadbook-web test
```

预期：FAIL，原因是无法解析 `@/app/page`，而不是语法错误或测试运行器错误。

- [ ] **步骤 3：实现最小 className 工具**

`apps/roadbook-web/lib/utils.ts`：

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **步骤 4：实现 shadcn/ui Button**

`apps/roadbook-web/components/ui/button.tsx`：

```tsx
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-white hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline"
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3",
        lg: "h-10 rounded-md px-6",
        icon: "size-9"
      }
    },
    defaultVariants: { variant: "default", size: "default" }
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : "button";

  return (
    <Component
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
```

- [ ] **步骤 5：实现最小首页**

`apps/roadbook-web/app/page.tsx`：

```tsx
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <Button>Hello World</Button>
    </main>
  );
}
```

- [ ] **步骤 6：运行测试并确认转绿**

运行：

```bash
rtk pnpm --filter roadbook-web test
```

预期：1 个测试通过，0 个失败。

---

### 任务 3：补齐 Next.js 根布局与设计 token

**文件：**

- 新建：`apps/roadbook-web/app/layout.tsx`
- 新建：`apps/roadbook-web/app/globals.css`

**接口：**

- 输入：任务 2 的首页和 Button 使用语义化 Tailwind class。
- 输出：`RootLayout` 提供 HTML 外壳、全局 CSS 与页面元数据；全局 CSS 提供 Button 所需 token。

- [ ] **步骤 1：创建根布局**

`apps/roadbook-web/app/layout.tsx`：

```tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Roadbook",
  description: "Roadbook Web 应用"
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **步骤 2：创建 Tailwind CSS 4 与 shadcn/ui token**

`apps/roadbook-web/app/globals.css`：

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
}

:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }

  body {
    @apply bg-background text-foreground;
  }
}
```

- [ ] **步骤 3：检查应用级静态质量**

运行：

```bash
rtk pnpm --filter roadbook-web lint
rtk pnpm --filter roadbook-web typecheck
rtk pnpm --filter roadbook-web test
```

预期：三个命令均退出 0；测试仍为 1 个通过、0 个失败。若 TypeScript 7 报废弃或移除的配置项，只修改被明确指出的配置并记录原因。

---

### 任务 4：接入根工作区并完成生产验证

**文件：**

- 修改：`package.json`
- 修改：`turbo.json`

**接口：**

- 输入：`roadbook-web` 暴露 `dev`、`build`、`lint`、`typecheck`、`test`。
- 输出：根目录 `pnpm dev:roadbook-web` 可启动应用；Turbo 能缓存 `.next` 构建产物但忽略 `.next/cache`。

- [ ] **步骤 1：增加根启动脚本**

在根 `package.json` 的 `scripts` 中加入：

```json
"dev:roadbook-web": "pnpm --filter roadbook-web dev"
```

保留所有既有脚本，不重排无关字段。

- [ ] **步骤 2：补充 Next.js 构建输出**

将根 `turbo.json` 的 `build.outputs` 改为：

```json
["dist/**", ".next/**", "!.next/cache/**"]
```

保留其他 Turbo 任务配置。

- [ ] **步骤 3：检查变更范围和生成物状态**

运行：

```bash
rtk git status --short
rtk git diff --check
rtk git diff --stat
```

预期：仅出现本计划列出的源码、配置、文档与 `pnpm-lock.yaml`；不得跟踪 `.next`、`node_modules`、缓存、环境文件、日志或临时文件。

- [ ] **步骤 4：执行完整验证**

运行：

```bash
rtk pnpm --filter roadbook-web lint
rtk pnpm --filter roadbook-web typecheck
rtk pnpm --filter roadbook-web test
rtk pnpm --filter roadbook-web build
```

预期：四个命令均退出 0；测试为 1 个通过、0 个失败；构建输出包含 `/` 静态路由。只有在源码、依赖或构建参数再次发生变化时才重跑受影响的命令。

- [ ] **步骤 5：按需求逐项核验**

确认：

```text
[ ] apps/roadbook-web 位于现有 workspace
[ ] Next.js 16.3.5
[ ] TypeScript 7.0.2
[ ] Tailwind CSS 4.3.3
[ ] shadcn/ui components.json、cn 工具与 Button 已接通
[ ] 首页显示 Hello World
[ ] design.md 为中文且与实现一致
[ ] 根启动脚本与 Turbo 输出已接入
[ ] 未 commit、push 或部署
```

如果任何一项无证据，不得宣称完成；报告实际状态与阻塞原因。
