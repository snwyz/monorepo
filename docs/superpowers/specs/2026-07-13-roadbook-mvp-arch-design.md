---
name: roadbook-mvp-design
description: 路书小程序 MVP 架构设计：技术选型、固定版本、目录结构、数据模型、六阶段推进路线
metadata:
  type: project
---

# 路书 MVP 架构设计

## 产品定位

微信小程序，面向户外爱好者的徒步自驾路线社区平台。

**MVP 核心功能：**
- 地图拖动半径选路线（Haversine 距离过滤）
- 路线详情 + 沿途 POI（露营点、电车充电点）
- 微信小程序登录 + 收藏路线
- 知识文章浏览

**MVP 之后：** 协作路线编辑（RouteProposal）、用户上传路线、管理员 POI 导入工具。

---

## 技术选型与固定版本

### 运行环境

| 工具 | 版本 |
|---|---|
| Node.js | `22.x` LTS（Docker: `node:22-alpine`） |
| pnpm | `11.12.0` |

### 前端

| 包 | 版本 |
|---|---|
| `@tarojs/taro` | `4.2.0` |
| `@tarojs/cli` | `4.2.0` |
| `react` | `18.3.1` |
| `typescript` | `5.9.3` |

> React 锁在 18.x：Taro 4 的 peerDependencies 为 `@types/react: ^18`，React 19 未在支持范围内。
> TypeScript 锁在 5.x：TS 7 为 Go 重写版本，生态兼容性未追上，NestJS 装饰器有风险。

### 版本可用性校验

实施阶段 1 前必须先验证所有固定版本在 npm registry 中真实存在，且 peerDependencies 可被 pnpm 正常解析。尤其需要确认：

- `@tarojs/taro@4.2.0` / `@tarojs/cli@4.2.0`
- `@nestjs/*@11.1.28`
- `class-validator@0.15.1`
- `prisma@7.8.0` / `@prisma/client@7.8.0`
- `pnpm@11.12.0`

若任一版本不可用，优先改为同一主版本下已发布的最新 patch 版本，并同步更新本设计文档与 lockfile。禁止在未验证的情况下直接进入脚手架初始化。

### 后端

| 包 | 版本 |
|---|---|
| `@nestjs/core` / `@nestjs/common` | `11.1.28` |
| `@nestjs/config` | `4.0.4` |
| `@nestjs/jwt` | `11.0.2` |
| `@nestjs/passport` | `11.0.5` |
| `passport-jwt` | `4.0.1` |
| `class-validator` | `0.15.1` |
| `class-transformer` | `0.5.1` |
| `ioredis` | `5.11.1` |
| `typescript` | `5.9.3` |

### 数据层

| 包 / 镜像 | 版本 |
|---|---|
| `prisma` / `@prisma/client` | `7.8.0` |
| `postgres`（Docker） | `17` |
| `redis`（Docker） | `7.4` |

### 外部服务

- **腾讯地图**：小程序地图组件 + 点位 API
- **腾讯 COS**：图片/文件对象存储（预签名 URL 直传）
- **微信 jscode2session**：微信登录换取 openid

---

## 目录结构

```text
roadbook-monorepo/
  apps/
    roadbook/          # 路书微信小程序（Taro）
    api/               # NestJS 后端服务

  packages/
    db/                # Prisma schema、迁移、seed、导出 client
    types/             # 前后端共享类型（Route、POI、User 等）
    utils/             # 通用工具函数（Haversine 距离计算等）
    config/            # 基础 tsconfig、eslint、prettier 配置
    monitor/           # 日志与监控统一封装
    # taro-shared/     # 预留：未来多个小程序之间共享的组件/hooks

  docker-compose.yml   # postgres + redis 本地环境
  pnpm-workspace.yaml
  package.json
```

---

## 数据模型（MVP 实体）

```
User
  id, openid, nickname, avatar_url
  created_at, updated_at

Route
  id, title, description, difficulty, distance_km, duration_hours, elevation_gain_m
  start_lat, start_lng, end_lat, end_lng
  bounds_min_lat, bounds_max_lat, bounds_min_lng, bounds_max_lng
  waypoints (Json), polyline (Json), cover_image_url, region, tags (Json)
  status (draft | published), author_id → User
  created_at, updated_at, published_at

POI
  id, name, type (rv_camp | ev_charge)
  lat, lng, description, images (Json), source
  created_at, updated_at

Article
  id, title, content, cover_image_url
  author_id → User, status (draft | published)
  created_at, updated_at, published_at

RouteCollection  # 收藏
  user_id → User, route_id → Route
  created_at
```

### Prisma 约束

- `User.openid` 必须唯一。
- `RouteCollection` 使用 `user_id + route_id` 复合唯一索引，防止重复收藏。
- `Route.status`、`Article.status`、`Route.difficulty`、`POI.type` 使用 enum。
- 经纬度字段使用 `Decimal(9, 6)`；距离、海拔、时长使用明确单位后缀。
- 默认所有业务表都有 `created_at` / `updated_at`；内容发布类表额外有 `published_at`。
- `Route.author_id`、`Article.author_id` 保留外键；MVP 后台导入内容可使用系统用户。

### 空间查询策略

路线查询不只依赖起点。MVP 使用 PostgreSQL 普通索引 + 应用层计算，暂不引入 PostGIS：

1. 前端地图拖动后提交中心点 `lat/lng`、半径 `radius_km` 和当前视野 bbox。
2. 后端先用路线 `bounds_*` 与请求 bbox 做粗筛。
3. 对粗筛结果再用 Haversine 判断路线起点、终点和关键 waypoints 是否落入半径。
4. 路线详情页沿途 POI 查询使用“POI 到路线 polyline 的最短距离”过滤，默认阈值 3-5km。
5. 当路线数量增长到普通索引无法满足性能时，再迁移到 PostGIS `geography` / `geometry` 字段。

`start_lat` / `start_lng` 只代表路线入口点，适合“附近起点”查询；不能单独代表整条路线的空间范围。

---

## API Contract（MVP）

### Auth

- `POST /auth/wx-login`
  - 入参：`code`
  - 行为：服务端调用微信 `jscode2session`，用 `openid` 查找或创建用户。
  - 出参：`access_token`、`refresh_token`、`user`

- `POST /auth/refresh`
  - 入参：`refresh_token`
  - 行为：校验 Redis 中的 token 状态，轮换 refresh token。

- `POST /auth/logout`
  - 行为：删除当前设备 refresh token。

### Routes

- `GET /routes/nearby?lat=&lng=&radius_km=&min_lat=&max_lat=&min_lng=&max_lng=`
  - 返回：已发布路线列表，包含地图 marker 所需字段。

- `GET /routes/:id`
  - 返回：路线详情、waypoints/polyline、收藏状态。

- `POST /routes/:id/collection`
  - 鉴权：需要 JWT。
  - 行为：收藏路线。

- `DELETE /routes/:id/collection`
  - 鉴权：需要 JWT。
  - 行为：取消收藏。

### POI

- `GET /pois/near-route?route_id=&distance_km=`
  - 返回：路线沿途 POI，按距离路线远近排序。

### Articles

- `GET /articles?page=&page_size=`
  - 返回：已发布文章列表。

- `GET /articles/:id`
  - 返回：文章详情。

### Storage

- `POST /storage/presigned-url`
  - 鉴权：需要 JWT。
  - 入参：`filename`、`content_type`、`scene`
  - 返回：腾讯 COS 上传 URL、object key、公开访问 URL。

---

## 六阶段推进路线

### 阶段 1 — Monorepo 初始化

- pnpm workspace 骨架
- `packages/config`：统一 `tsconfig.base.json`、eslint、prettier
- 根目录常用 scripts（`dev:api`、`dev:taro`、`db:migrate`、`db:studio`）
- 完成所有固定版本可用性校验，生成首版 lockfile

### 阶段 2 — 数据库层（packages/db）

- Prisma 初始化，连接 PostgreSQL 17
- 定义 MVP schema（User / Route / POI / Article / RouteCollection）
- 首次 migration
- seed 脚本（测试路线 + POI 数据）
- 导出 Prisma Client 供 api 使用
- 为 openid、收藏关系、路线 bbox、POI 经纬度建立索引

### 阶段 3 — NestJS 后端（apps/api）

模块：

```
modules/
  auth/        # 微信登录（wx-login → openid → JWT）
  routes/      # 路线 CRUD + Haversine 半径查询
  pois/        # POI 查询
  articles/    # 文章列表 + 详情
  users/       # 用户信息
  storage/     # 腾讯 COS 预签名 URL
  redis/       # Redis 封装
  health/      # 健康检查
common/
  filters/     # 全局异常过滤器
  guards/      # JWT 守卫
  interceptors/
  pipes/       # class-validator 参数校验
```

认证策略：

- access token 短有效期（建议 15-30 分钟）。
- refresh token 长有效期（建议 7-30 天），只保存 token hash 到 Redis。
- refresh token 按设备维度存储，刷新时轮换，退出登录时删除。
- `session_key` 不返回前端；如无手机号/加密数据解密场景，MVP 不持久化 `session_key`。

### 阶段 4 — Taro 前端骨架（apps/taro-app）

- 接入腾讯地图组件
- 微信登录对接（wx.login → POST /auth/wx-login）
- 页面路由结构：首页地图 / 路线详情 / 文章列表 / 个人中心
- 封装 API client、token refresh、登录态恢复、错误 toast
- 配置位置权限说明与隐私协议入口

### 阶段 5 — 核心功能联调

- 地图半径拖动 → 请求后端 → 地图标点展示路线
- 路线详情页 + 沿途 POI 展示
- 收藏路线（RouteCollection）
- 文章列表 + 详情页

### 阶段 6 — Docker 部署

```yaml
# docker-compose.yml 核心服务
services:
  postgres:
    image: postgres:17
  redis:
    image: redis:7.4
  api:
    build: ./apps/api
    image: roadbook-api:local
```

`node:22-alpine` 只作为 `apps/api/Dockerfile` 的 base image，不直接作为业务镜像名。

本地 `docker compose up` 跑通后，Taro 打包发布微信开发者工具。

阶段 6 还需要补齐：

- `.env.example`
- API healthcheck
- migration 执行策略（手动执行或独立 migration job，避免业务容器隐式改库）
- HTTPS 入口与小程序合法域名配置
- 生产日志输出到 stdout，由容器平台收集

---

## 日志与监控

日志与监控统一落在 `packages/monitor`，前后端各自引用。

### packages/monitor 内容

```text
packages/monitor/
  src/
    server/     # NestJS 侧：winston 配置、nest-winston 封装、Sentry 初始化
    client/     # 小程序侧：wx.getRealtimeLogManager() 封装、wx.onError 注册
    types/      # 共享日志接口（LogLevel 等）
  index.ts
```

| 包 | 版本 | 用途 |
|---|---|---|
| `winston` | `3.19.0` | 结构化 JSON 日志（server） |
| `nest-winston` | `1.10.2` | NestJS 集成 winston（server） |
| `@sentry/nestjs` | `10.65.0` | 异常上报 + 性能追踪（server） |

**后端策略：**
- 开发环境：console 格式（可读）
- 生产环境：JSON 格式输出到 stdout，由 Docker 收集
- 请求日志：Interceptor 记录 method / path / status / duration
- 错误日志：全局 ExceptionFilter 捕获后交 Sentry 上报
- `GET /health` 探活端点

**前端策略：**
- `wx.getRealtimeLogManager()` 封装 info / warn / error，可在微信公众平台按 openid 检索
- `wx.onError` 全局注册，捕获未处理异常后写入实时日志
- 用户行为分析用微信管理后台内置数据（PV/UV/留存），MVP 不接第三方 SDK

参考：https://developers.weixin.qq.com/miniprogram/dev/framework/realtimelog/

---

## 小程序上线约束

- 后端 API、COS 上传/下载域名必须配置到微信小程序后台合法域名。
- API 必须使用 HTTPS；本地开发可通过微信开发者工具配置绕过域名校验，生产不可依赖该能力。
- 腾讯地图 key 需要绑定小程序 appid，并限制调用来源。
- 获取定位前必须配置清晰的位置权限用途说明。
- 小程序隐私协议需覆盖登录、定位、收藏、图片上传、日志采集。
- 用户上传图片或未来 UGC 内容需要预留内容安全审核流程；MVP 可先限制为后台种子数据和管理员上传。
- COS 直传只能使用短时预签名 URL，并限制 content type、object key 前缀和过期时间。

---

## 环境变量清单

```text
DATABASE_URL=
REDIS_URL=

JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_EXPIRES_IN=30m
JWT_REFRESH_EXPIRES_IN=30d

WECHAT_APP_ID=
WECHAT_APP_SECRET=

TENCENT_MAP_KEY=

TENCENT_COS_SECRET_ID=
TENCENT_COS_SECRET_KEY=
TENCENT_COS_BUCKET=
TENCENT_COS_REGION=
TENCENT_COS_PUBLIC_BASE_URL=

SENTRY_DSN=
NODE_ENV=
PORT=
```

所有密钥只进入环境变量或部署平台 secret，不进入 git。

---

## 阶段验收标准

- 阶段 1：`pnpm install` 可成功生成 lockfile，workspace 脚本可列出，版本校验通过。
- 阶段 2：`docker compose up postgres redis` 后可执行 migration 和 seed；Prisma Client 可被 api 引用。
- 阶段 3：API 本地启动后 `/health` 返回正常；微信登录可 mock；路线查询、文章查询、收藏接口有基础测试。
- 阶段 4：Taro 小程序能在微信开发者工具启动；首页地图、路线详情、文章列表、个人中心路由可进入。
- 阶段 5：地图拖动能请求 `/routes/nearby` 并渲染 marker；路线详情能展示沿途 POI；收藏登录态闭环跑通。
- 阶段 6：API 可通过 Docker 镜像启动；`.env.example` 完整；小程序合法域名、HTTPS、COS 上传链路检查通过。

---

## 关键约束

- 所有包版本固定，不使用 `^` 或 `~`，保证开发与生产一致
- API 无状态，JWT 鉴权，refreshToken 存 Redis
- 图片不经过后端，前端凭预签名 URL 直传腾讯 COS
- 早期单机 Docker Compose，后续按真实流量拆分
- MVP 阶段不引入 PostGIS；当路线/POI 查询性能成为瓶颈时再升级空间索引
- 小程序发布前必须完成合法域名、隐私协议、权限说明和 HTTPS 检查
