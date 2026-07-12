# 全栈应用 Monorepo 推进路线

## 1. 技术选型

本项目采用一套偏长期、可扩展、适合小程序与后端业务持续演进的全栈架构。

```text
前端：Taro
后端：NestJS
数据库：PostgreSQL
ORM：Prisma
缓存/队列：Redis
部署：Docker Compose
仓库：pnpm workspace monorepo
```

核心思路：

- 前端、后端、共享类型、数据库 schema 放在同一个 monorepo 中统一管理。
- PostgreSQL 作为主数据库，负责持久化业务数据。
- Redis 作为缓存、限流、验证码、队列、幂等锁等临时状态设施。
- 早期使用同机 Docker 部署，降低复杂度。
- 后续根据真实流量逐步拆分数据库、Redis 和 API 服务。

## 2. 推荐目录结构

```text
project/
  apps/
    taro-app/        # Taro 小程序前端
    api/             # NestJS 后端服务

  packages/
    db/              # Prisma schema、迁移、seed、数据库 client
    types/           # 前后端共享类型
    utils/           # 通用工具函数
    config/          # 共享 tsconfig、eslint 等配置

  docker-compose.yml
  pnpm-workspace.yaml
  package.json
  README.md
```

## 3. 第一阶段：初始化 Monorepo

目标是先把仓库骨架搭好，后续前后端和共享包都在统一结构内推进。

推进步骤：

1. 创建 pnpm workspace。
2. 创建 `apps/taro-app`。
3. 创建 `apps/api`。
4. 创建 `packages/db`。
5. 创建 `packages/types`。
6. 创建 `packages/utils`。
7. 统一 TypeScript、ESLint、Prettier 配置。
8. 配置根目录常用 scripts。

示例 `pnpm-workspace.yaml`：

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

示例根目录 scripts：

```json
{
  "scripts": {
    "dev:api": "pnpm --filter api dev",
    "dev:taro": "pnpm --filter taro-app dev",
    "db:migrate": "pnpm --filter @repo/db prisma migrate dev",
    "db:studio": "pnpm --filter @repo/db prisma studio"
  }
}
```

## 4. 第二阶段：搭建 NestJS 后端

目标是建立稳定的后端基础设施，让业务模块可以按领域持续扩展。

推进步骤：

1. 初始化 NestJS 项目。
2. 配置 `ConfigModule` 读取环境变量。
3. 接入 Prisma。
4. 接入 Redis。
5. 建立基础模块。
6. 配置全局异常处理。
7. 配置接口参数校验。
8. 配置 Swagger/OpenAPI，可选。

建议基础模块：

```text
apps/api/src/
  modules/
    auth/            # 登录、鉴权
    users/           # 用户
    health/          # 健康检查
    redis/           # Redis 封装
  common/
    filters/         # 异常过滤器
    guards/          # 守卫
    interceptors/    # 拦截器
    pipes/           # 参数校验管道
  main.ts
  app.module.ts
```

后端关键原则：

- API 尽量无状态，方便后续多实例扩容。
- 登录态不要只放在单台机器内存中。
- 数据库地址、Redis 地址、对象存储配置都通过环境变量管理。
- 复杂任务通过队列异步处理，避免阻塞主请求。

## 5. 第三阶段：搭建数据库层

目标是把数据库 schema、迁移、seed 和 Prisma Client 收敛到统一包中。

推进步骤：

1. 在 `packages/db` 中初始化 Prisma。
2. 配置 PostgreSQL 连接。
3. 创建 `schema.prisma`。
4. 创建 migration。
5. 创建 seed 脚本。
6. 导出 Prisma Client。
7. 在 `apps/api` 中引用 `packages/db`。

建议结构：

```text
packages/db/
  prisma/
    schema.prisma
    migrations/
    seed.ts
  src/
    client.ts
    index.ts
```

数据库设计原则：

- 用户、订单、报名、内容、权限等核心业务数据放 PostgreSQL。
