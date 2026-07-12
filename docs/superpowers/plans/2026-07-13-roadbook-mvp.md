# 路书 MVP 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从零搭建路书微信小程序 MVP，包含地图找路线、路线详情、POI 展示、收藏和文章浏览。

**Architecture:** pnpm + Turborepo monorepo，NestJS 后端 + Taro 微信小程序前端，PostgreSQL 持久化，Redis 存 token，腾讯 COS 存图片，packages/ 共享 db/types/utils/config/monitor。

**Tech Stack:** Taro 4.2.0 · React 18.3.1 · NestJS 11.1.28 · Prisma 7.8.0 · PostgreSQL 17 · Redis 7.4 · TypeScript 5.9.3 · pnpm 11.12.0 · Turborepo 2.8.11

## Global Constraints

- 所有依赖使用固定版本，禁止 `^` 或 `~`
- npm registry 使用淘宝镜像：`https://registry.npmmirror.com`
- Node.js 22.x LTS
- TypeScript 5.9.3（锁在 5.x，不升 TS 7）
- React 18.3.1（Taro 4 不支持 React 19）
- 所有密钥只进环境变量，不进 git
- API 全部走 HTTPS，小程序合法域名必须配置
- **每个源文件第一行必须包含 AI prompt summary**，格式如下：

```typescript
// AI [YYYY-MM-DD]: <该文件的职责一句话描述，说明它做什么、为何存在>
```

示例：
```typescript
// AI [2026-07-13]: Haversine 距离计算工具，用于判断路线起点是否在用户设定的搜索半径内
```

规则：
- 必须是文件第一行（import 之前）
- 日期为该文件**最后一次被 AI 迭代的日期**，格式 `YYYY-MM-DD`
- 用中文，一句话，不超过 40 字
- 描述"这个文件做什么"，不要描述"怎么做"
- 每次 AI 修改该文件时，同步更新日期
- 所有 `.ts` / `.tsx` / `.prisma` 文件均需要，`package.json` / `tsconfig.json` / `yaml` 配置文件除外

---

## Task 1: Workspace 根目录初始化 + 版本校验

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `package.json`
- Create: `.npmrc`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `turbo.json`

**Produces:** 可运行的 pnpm workspace，所有固定版本确认可用

- [ ] **Step 1: 校验关键版本在 npmmirror 可用**

```bash
npm view @tarojs/taro@4.2.0 version --registry https://registry.npmmirror.com
npm view @nestjs/core@11.1.28 version --registry https://registry.npmmirror.com
npm view prisma@7.8.0 version --registry https://registry.npmmirror.com
npm view class-validator@0.15.1 version --registry https://registry.npmmirror.com
npm view pnpm@11.12.0 version --registry https://registry.npmmirror.com
```

期望输出：每条命令返回对应版本号。若某版本不存在，改为同主版本最新 patch 并更新 spec 文档。

- [ ] **Step 2: 创建 `.npmrc`**

```ini
registry=https://registry.npmmirror.com
shamefully-hoist=false
strict-peer-dependencies=false
```

- [ ] **Step 3: 创建 `pnpm-workspace.yaml`**

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

- [ ] **Step 4: 创建根目录 `package.json`**

```json
{
  "name": "roadbook-monorepo",
  "private": true,
  "packageManager": "pnpm@11.12.0",
  "scripts": {
    "dev:api": "pnpm --filter api dev",
    "dev:roadbook": "pnpm --filter roadbook dev:weapp",
    "db:migrate": "pnpm --filter @roadbook/db migrate:dev",
    "db:studio": "pnpm --filter @roadbook/db studio",
    "db:seed": "pnpm --filter @roadbook/db seed",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test"
  },
  "devDependencies": {
    "turbo": "2.8.11"
  }
}
```

- [ ] **Step 4a: 创建 `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "typecheck": { "dependsOn": ["^build"], "outputs": [] },
    "test": { "dependsOn": ["^build"], "outputs": [] },
    "lint": { "outputs": [] }
  }
}
```

共享包必须提供 `build`、`typecheck` 脚本并将 package entry 指向 `dist/`。`apps/api` 使用 `tsc` 输出 `dist/`，不使用 webpack/Vite；`apps/roadbook` 保持 Taro 自身构建器，由 Turbo 调度。

- [ ] **Step 5: 创建 `.gitignore`**

```gitignore
node_modules/
dist/
.env
.env.local
*.local
.DS_Store
prisma/migrations/*.sql.bak
```

- [ ] **Step 6: 创建 `.env.example`**

```dotenv
DATABASE_URL=postgresql://roadbook:password@localhost:5432/roadbook
REDIS_URL=redis://localhost:6379

JWT_ACCESS_SECRET=change-me-access
JWT_REFRESH_SECRET=change-me-refresh
JWT_ACCESS_EXPIRES_IN=30m
JWT_REFRESH_EXPIRES_IN=30d

WECHAT_APP_ID=
WECHAT_APP_SECRET=

TENCENT_MAP_KEY=

TENCENT_COS_SECRET_ID=
TENCENT_COS_SECRET_KEY=
TENCENT_COS_BUCKET=
TENCENT_COS_REGION=ap-guangzhou
TENCENT_COS_PUBLIC_BASE_URL=

SENTRY_DSN=
NODE_ENV=development
PORT=3000
```

- [ ] **Step 7: 安装 pnpm 并初始化**

```bash
corepack enable
corepack prepare pnpm@11.12.0 --activate
pnpm install
```

期望：生成 `pnpm-lock.yaml`，无报错。

- [ ] **Step 8: Commit**

```bash
git init
git add pnpm-workspace.yaml package.json .npmrc .gitignore .env.example
git commit -m "chore: initialize monorepo workspace"
```

---

## Task 2: packages/config — 共享 TypeScript + Lint 配置

**Files:**
- Create: `packages/config/package.json`
- Create: `packages/config/tsconfig.base.json`
- Create: `packages/config/tsconfig.nestjs.json`
- Create: `packages/config/tsconfig.taro.json`
- Create: `packages/config/prettier.config.js`

**Produces:** `@roadbook/config`，被所有 packages 和 apps 继承

- [ ] **Step 1: 创建 `packages/config/package.json`**

```json
{
  "name": "@roadbook/config",
  "version": "0.0.1",
  "private": true,
  "files": ["tsconfig.base.json", "tsconfig.nestjs.json", "tsconfig.taro.json", "prettier.config.js"]
}
```

- [ ] **Step 2: 创建 `packages/config/tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 3: 创建 `packages/config/tsconfig.nestjs.json`**

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2021",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "outDir": "dist"
  }
}
```

- [ ] **Step 4: 创建 `packages/config/tsconfig.taro.json`**

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "target": "ES6",
    "jsx": "react-jsx",
    "allowSyntheticDefaultImports": true
  }
}
```

- [ ] **Step 5: 创建 `packages/config/prettier.config.js`**

```js
module.exports = {
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  semi: true,
};
```

- [ ] **Step 6: Commit**

```bash
git add packages/config
git commit -m "chore: add shared tsconfig and prettier config"
```

---

## Task 3: packages/types + packages/utils

**Files:**
- Create: `packages/types/package.json`
- Create: `packages/types/src/index.ts`
- Create: `packages/utils/package.json`
- Create: `packages/utils/src/haversine.ts`
- Create: `packages/utils/src/bbox.ts`
- Create: `packages/utils/src/index.ts`
- Create: `packages/utils/src/haversine.test.ts`

**Produces:** `@roadbook/types`（共享接口），`@roadbook/utils`（Haversine + bbox）

- [ ] **Step 1: 创建 `packages/types/package.json`**

```json
{
  "name": "@roadbook/types",
  "version": "0.0.1",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "devDependencies": {
    "typescript": "5.9.3",
    "@roadbook/config": "workspace:*"
  }
}
```

- [ ] **Step 2: 创建 `packages/types/src/index.ts`**

```typescript
export type Difficulty = 'easy' | 'medium' | 'hard' | 'extreme';
export type RouteStatus = 'draft' | 'published';
export type PoiType = 'rv_camp' | 'ev_charge';
export type ArticleStatus = 'draft' | 'published';

export interface Coordinate {
  lat: number;
  lng: number;
}

export interface RouteMarker {
  id: string;
  title: string;
  start_lat: number;
  start_lng: number;
  difficulty: Difficulty;
  distance_km: number;
}

export interface RouteDetail extends RouteMarker {
  description: string;
  duration_hours: number;
  elevation_gain_m: number;
  waypoints: Coordinate[];
  polyline: Coordinate[];
  cover_image_url: string | null;
  region: string | null;
  tags: string[];
  published_at: string | null;
  is_collected: boolean;
}

export interface PoiItem {
  id: string;
  name: string;
  type: PoiType;
  lat: number;
  lng: number;
  description: string | null;
  images: string[];
}

export interface ArticleSummary {
  id: string;
  title: string;
  cover_image_url: string | null;
  published_at: string | null;
}

export interface ArticleDetail extends ArticleSummary {
  content: string;
}

export interface UserProfile {
  id: string;
  nickname: string;
  avatar_url: string | null;
}

// API response wrapper
export interface ApiResponse<T> {
  data: T;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  page_size: number;
}
```

- [ ] **Step 3: 创建 `packages/utils/package.json`**

```json
{
  "name": "@roadbook/utils",
  "version": "0.0.1",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "devDependencies": {
    "typescript": "5.9.3",
    "@roadbook/config": "workspace:*"
  }
}
```

- [ ] **Step 4: 写失败测试 `packages/utils/src/haversine.test.ts`**

```typescript
import { haversineKm, isWithinRadius } from './haversine';

describe('haversineKm', () => {
  it('returns 0 for same point', () => {
    expect(haversineKm(30, 120, 30, 120)).toBe(0);
  });

  it('calculates distance between Beijing and Shanghai (~1068km)', () => {
    const dist = haversineKm(39.9042, 116.4074, 31.2304, 121.4737);
    expect(dist).toBeGreaterThan(1060);
    expect(dist).toBeLessThan(1080);
  });
});

describe('isWithinRadius', () => {
  it('returns true when point is within radius', () => {
    expect(isWithinRadius(30, 120, 30.001, 120.001, 1)).toBe(true);
  });

  it('returns false when point is outside radius', () => {
    expect(isWithinRadius(30, 120, 31, 121, 10)).toBe(false);
  });
});
```

- [ ] **Step 5: 运行测试确认失败**

```bash
cd packages/utils && pnpm test
```

期望：FAIL "haversineKm is not defined"

- [ ] **Step 6: 实现 `packages/utils/src/haversine.ts`**

```typescript
const EARTH_RADIUS_KM = 6371;

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(a));
}

export function isWithinRadius(
  centerLat: number,
  centerLng: number,
  pointLat: number,
  pointLng: number,
  radiusKm: number,
): boolean {
  return haversineKm(centerLat, centerLng, pointLat, pointLng) <= radiusKm;
}
```

- [ ] **Step 7: 创建 `packages/utils/src/bbox.ts`**

```typescript
export interface BBox {
  min_lat: number;
  max_lat: number;
  min_lng: number;
  max_lng: number;
}

// 判断两个 bbox 是否有交集（路线 bbox 与视野 bbox）
export function bboxIntersects(a: BBox, b: BBox): boolean {
  return a.min_lat <= b.max_lat && a.max_lat >= b.min_lat &&
         a.min_lng <= b.max_lng && a.max_lng >= b.min_lng;
}
```

- [ ] **Step 8: 创建 `packages/utils/src/index.ts`**

```typescript
export * from './haversine';
export * from './bbox';
```

- [ ] **Step 9: 运行测试确认通过**

```bash
cd packages/utils && pnpm test
```

期望：PASS 4 tests

- [ ] **Step 10: Commit**

```bash
git add packages/types packages/utils
git commit -m "feat: add shared types and haversine/bbox utilities"
```

---

## Task 4: packages/db — Prisma Schema + Docker

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/prisma/schema.prisma`
- Create: `packages/db/src/client.ts`
- Create: `packages/db/src/index.ts`
- Create: `docker-compose.yml`

**Produces:** `@roadbook/db`，Prisma Client，本地 postgres + redis

- [ ] **Step 1: 创建 `docker-compose.yml`（根目录）**

```yaml
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_USER: roadbook
      POSTGRES_PASSWORD: password
      POSTGRES_DB: roadbook
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7.4
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

- [ ] **Step 2: 启动数据库**

```bash
docker compose up -d postgres redis
docker compose ps
```

期望：postgres 和 redis 状态为 running。

- [ ] **Step 3: 创建 `packages/db/package.json`**

```json
{
  "name": "@roadbook/db",
  "version": "0.0.1",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "migrate:dev": "prisma migrate dev --schema prisma/schema.prisma",
    "migrate:deploy": "prisma migrate deploy --schema prisma/schema.prisma",
    "studio": "prisma studio --schema prisma/schema.prisma",
    "seed": "tsx prisma/seed.ts",
    "generate": "prisma generate --schema prisma/schema.prisma"
  },
  "dependencies": {
    "@prisma/client": "7.8.0"
  },
  "devDependencies": {
    "prisma": "7.8.0",
    "tsx": "4.19.4",
    "typescript": "5.9.3",
    "@roadbook/config": "workspace:*"
  }
}
```

- [ ] **Step 4: 创建 `packages/db/prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Difficulty {
  easy
  medium
  hard
  extreme
}

enum RouteStatus {
  draft
  published
}

enum PoiType {
  rv_camp
  ev_charge
}

enum ArticleStatus {
  draft
  published
}

model User {
  id         String   @id @default(uuid())
  openid     String   @unique
  nickname   String   @default("路书用户")
  avatar_url String?
  created_at DateTime @default(now())
  updated_at DateTime @updatedAt

  routes      Route[]
  articles    Article[]
  collections RouteCollection[]
}

model Route {
  id               String      @id @default(uuid())
  title            String
  description      String      @default("")
  difficulty       Difficulty
  distance_km      Decimal     @db.Decimal(8, 2)
  duration_hours   Decimal?    @db.Decimal(6, 2)
  elevation_gain_m Int?
  start_lat        Decimal     @db.Decimal(9, 6)
  start_lng        Decimal     @db.Decimal(9, 6)
  end_lat          Decimal     @db.Decimal(9, 6)
  end_lng          Decimal     @db.Decimal(9, 6)
  bounds_min_lat   Decimal     @db.Decimal(9, 6)
  bounds_max_lat   Decimal     @db.Decimal(9, 6)
  bounds_min_lng   Decimal     @db.Decimal(9, 6)
  bounds_max_lng   Decimal     @db.Decimal(9, 6)
  waypoints        Json        @default("[]")
  polyline         Json        @default("[]")
  cover_image_url  String?
  region           String?
  tags             Json        @default("[]")
  status           RouteStatus @default(draft)
  author_id        String
  created_at       DateTime    @default(now())
  updated_at       DateTime    @updatedAt
  published_at     DateTime?

  author      User              @relation(fields: [author_id], references: [id])
  collections RouteCollection[]

  @@index([status, bounds_min_lat, bounds_max_lat, bounds_min_lng, bounds_max_lng])
  @@index([author_id])
}

model POI {
  id          String    @id @default(uuid())
  name        String
  type        PoiType
  lat         Decimal   @db.Decimal(9, 6)
  lng         Decimal   @db.Decimal(9, 6)
  description String?
  images      Json      @default("[]")
  source      String?
  created_at  DateTime  @default(now())
  updated_at  DateTime  @updatedAt

  @@index([type, lat, lng])
}

model Article {
  id              String        @id @default(uuid())
  title           String
  content         String
  cover_image_url String?
  author_id       String
  status          ArticleStatus @default(draft)
  created_at      DateTime      @default(now())
  updated_at      DateTime      @updatedAt
  published_at    DateTime?

  author User @relation(fields: [author_id], references: [id])

  @@index([status, published_at])
}

model RouteCollection {
  user_id    String
  route_id   String
  created_at DateTime @default(now())

  user  User  @relation(fields: [user_id], references: [id])
  route Route @relation(fields: [route_id], references: [id])

  @@id([user_id, route_id])
}
```

- [ ] **Step 5: 创建 `packages/db/src/client.ts`**

```typescript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 6: 创建 `packages/db/src/index.ts`**

```typescript
export { prisma } from './client';
export { Prisma, PrismaClient } from '@prisma/client';
export type {
  User,
  Route,
  POI,
  Article,
  RouteCollection,
  Difficulty,
  RouteStatus,
  PoiType,
  ArticleStatus,
} from '@prisma/client';
```

- [ ] **Step 7: 执行首次 migration**

```bash
cp .env.example .env
# 编辑 .env 确认 DATABASE_URL=postgresql://roadbook:password@localhost:5432/roadbook
cd packages/db
pnpm migrate:dev --name init
```

期望：`prisma/migrations/XXXXX_init/migration.sql` 被创建，数据库表创建成功。

- [ ] **Step 8: Commit**

```bash
git add packages/db docker-compose.yml .env.example
git commit -m "feat: add prisma schema and docker compose"
```

---

## Task 5: packages/db — Seed 数据

**Files:**
- Create: `packages/db/prisma/seed.ts`

**Produces:** 可运行的 seed，包含系统用户、2 条测试路线、4 个 POI、1 篇文章

- [ ] **Step 1: 创建 `packages/db/prisma/seed.ts`**

```typescript
import { PrismaClient, Difficulty, RouteStatus, PoiType, ArticleStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 系统用户（用于后台导入内容）
  const systemUser = await prisma.user.upsert({
    where: { openid: 'system' },
    update: {},
    create: {
      openid: 'system',
      nickname: '路书官方',
      avatar_url: null,
    },
  });

  // 测试路线：稻城亚丁
  const route1 = await prisma.route.upsert({
    where: { id: 'seed-route-1' },
    update: {},
    create: {
      id: 'seed-route-1',
      title: '稻城亚丁徒步环线',
      description: '从冲古寺出发，经珍珠海、牛奶海，至洛绒牛场的经典徒步线路。',
      difficulty: Difficulty.hard,
      distance_km: 25.5,
      duration_hours: 8,
      elevation_gain_m: 1200,
      start_lat: 28.9148,
      start_lng: 100.0742,
      end_lat: 28.9148,
      end_lng: 100.0742,
      bounds_min_lat: 28.9,
      bounds_max_lat: 29.0,
      bounds_min_lng: 100.0,
      bounds_max_lng: 100.15,
      waypoints: [
        { lat: 28.9148, lng: 100.0742 },
        { lat: 28.9312, lng: 100.0856 },
        { lat: 28.9501, lng: 100.0934 },
      ],
      polyline: [],
      region: '四川·稻城',
      tags: ['高原', '徒步', '景区'],
      status: RouteStatus.published,
      published_at: new Date(),
      author_id: systemUser.id,
    },
  });

  // 测试路线：川藏线
  await prisma.route.upsert({
    where: { id: 'seed-route-2' },
    update: {},
    create: {
      id: 'seed-route-2',
      title: '川藏线南线（成都→拉萨）',
      description: '全程约2100公里，途经折多山、理塘、芒康，是最经典的自驾线路之一。',
      difficulty: Difficulty.extreme,
      distance_km: 2100,
      duration_hours: 120,
      elevation_gain_m: 4500,
      start_lat: 30.5728,
      start_lng: 104.0668,
      end_lat: 29.6519,
      end_lng: 91.1321,
      bounds_min_lat: 29.0,
      bounds_max_lat: 31.0,
      bounds_min_lng: 91.0,
      bounds_max_lng: 105.0,
      waypoints: [],
      polyline: [],
      region: '四川·西藏',
      tags: ['自驾', '川藏线', '高原'],
      status: RouteStatus.published,
      published_at: new Date(),
      author_id: systemUser.id,
    },
  });

  // POI 数据
  await prisma.pOI.createMany({
    skipDuplicates: true,
    data: [
      {
        id: 'seed-poi-1',
        name: '亚丁村房车营地',
        type: PoiType.rv_camp,
        lat: 28.9100,
        lng: 100.0700,
        description: '位于亚丁村，提供基础水电，可容纳30辆房车。',
        images: [],
        source: 'admin',
      },
      {
        id: 'seed-poi-2',
        name: '稻城县城充电站',
        type: PoiType.ev_charge,
        lat: 29.0378,
        lng: 100.2984,
        description: '特来电充电桩，60kW直流快充，24小时开放。',
        images: [],
        source: 'admin',
      },
      {
        id: 'seed-poi-3',
        name: '理塘露营基地',
        type: PoiType.rv_camp,
        lat: 29.9944,
        lng: 100.2695,
        description: '海拔4000m，配备卫生间和热水，适合越野房车。',
        images: [],
        source: 'admin',
      },
      {
        id: 'seed-poi-4',
        name: '新都桥超充站',
        type: PoiType.ev_charge,
        lat: 30.0539,
        lng: 101.4776,
        description: '特斯拉超充，8个桩位，附近有餐饮。',
        images: [],
        source: 'admin',
      },
    ],
  });

  // 文章
  await prisma.article.upsert({
    where: { id: 'seed-article-1' },
    update: {},
    create: {
      id: 'seed-article-1',
      title: '高原徒步前你必须了解的5件事',
      content: '## 高反不是开玩笑\n\n海拔超过3000m时，身体需要时间适应...',
      cover_image_url: null,
      status: ArticleStatus.published,
      published_at: new Date(),
      author_id: systemUser.id,
    },
  });

  console.log('Seed complete');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: 运行 seed**

```bash
cd packages/db && pnpm seed
```

期望：输出 "Seed complete"，无报错。

- [ ] **Step 3: 验证数据**

```bash
pnpm studio
```

在 Prisma Studio（http://localhost:5555）确认 User/Route/POI/Article 各有数据。

- [ ] **Step 4: Commit**

```bash
git add packages/db/prisma/seed.ts
git commit -m "feat: add db seed with test routes and POIs"
```

---

## Task 6: packages/monitor — 日志封装

**Files:**
- Create: `packages/monitor/package.json`
- Create: `packages/monitor/src/types/index.ts`
- Create: `packages/monitor/src/server/logger.ts`
- Create: `packages/monitor/src/server/index.ts`
- Create: `packages/monitor/src/client/logger.ts`
- Create: `packages/monitor/src/client/index.ts`
- Create: `packages/monitor/index.ts`

**Produces:** `@roadbook/monitor`，server 侧 winston 封装，client 侧微信实时日志封装

- [ ] **Step 1: 创建 `packages/monitor/package.json`**

```json
{
  "name": "@roadbook/monitor",
  "version": "0.0.1",
  "private": true,
  "main": "index.ts",
  "types": "index.ts",
  "exports": {
    "./server": "./src/server/index.ts",
    "./client": "./src/client/index.ts"
  },
  "dependencies": {
    "winston": "3.19.0",
    "nest-winston": "1.10.2"
  },
  "devDependencies": {
    "typescript": "5.9.3",
    "@roadbook/config": "workspace:*"
  }
}
```

- [ ] **Step 2: 创建 `packages/monitor/src/types/index.ts`**

```typescript
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface LogContext {
  [key: string]: unknown;
}
```

- [ ] **Step 3: 创建 `packages/monitor/src/server/logger.ts`**

```typescript
import winston from 'winston';

const isDev = process.env.NODE_ENV !== 'production';

export const winstonConfig: winston.LoggerOptions = {
  level: isDev ? 'debug' : 'info',
  format: isDev
    ? winston.format.combine(winston.format.colorize(), winston.format.simple())
    : winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
};
```

- [ ] **Step 4: 创建 `packages/monitor/src/server/index.ts`**

```typescript
export { winstonConfig } from './logger';
export { WinstonModule } from 'nest-winston';
```

- [ ] **Step 5: 创建 `packages/monitor/src/client/logger.ts`**

```typescript
// 微信小程序实时日志封装
// 参考：https://developers.weixin.qq.com/miniprogram/dev/framework/realtimelog/

type WxLogManager = ReturnType<typeof wx.getRealtimeLogManager>;

let _manager: WxLogManager | null = null;

function getManager(): WxLogManager | null {
  if (typeof wx === 'undefined') return null;
  if (!_manager) _manager = wx.getRealtimeLogManager();
  return _manager;
}

export const logger = {
  info(...args: unknown[]) {
    getManager()?.info(...args);
  },
  warn(...args: unknown[]) {
    getManager()?.warn(...args);
  },
  error(...args: unknown[]) {
    getManager()?.error(...args);
  },
  setFilterMsg(msg: string) {
    getManager()?.setFilterMsg(msg);
  },
};

export function setupGlobalErrorCapture() {
  if (typeof wx === 'undefined') return;
  wx.onError((err) => {
    logger.error('[uncaught]', err);
  });
}
```

- [ ] **Step 6: 创建 `packages/monitor/src/client/index.ts`**

```typescript
export { logger, setupGlobalErrorCapture } from './logger';
```

- [ ] **Step 7: 创建 `packages/monitor/index.ts`**

```typescript
// 不在这里直接导出 server/client（避免 wx 全局变量在 Node 环境报错）
// 使用方从子路径引入：@roadbook/monitor/server 或 @roadbook/monitor/client
export type { LogLevel, LogContext } from './src/types';
```

- [ ] **Step 8: Commit**

```bash
git add packages/monitor
git commit -m "feat: add monitor package with winston and wx realtime log"
```

---

## Task 7: apps/api — NestJS 骨架 + 基础设施

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`
- Create: `apps/api/src/common/filters/http-exception.filter.ts`
- Create: `apps/api/src/common/interceptors/logging.interceptor.ts`
- Create: `apps/api/src/common/guards/jwt-auth.guard.ts`
- Create: `apps/api/src/modules/health/health.controller.ts`
- Create: `apps/api/src/modules/redis/redis.module.ts`
- Create: `apps/api/src/modules/redis/redis.service.ts`
- Create: `apps/api/src/modules/db/db.module.ts`
- Create: `apps/api/src/modules/db/db.service.ts`
- Create: `apps/api/test/health.e2e-spec.ts`

**Produces:** 可启动的 NestJS 服务，`GET /health` 返回 200

- [ ] **Step 1: 创建 `apps/api/package.json`**

```json
{
  "name": "api",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "nest start --watch",
    "build": "nest build",
    "start": "node dist/main",
    "test": "jest",
    "test:e2e": "jest --config test/jest-e2e.json",
    "lint": "eslint src",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@nestjs/common": "11.1.28",
    "@nestjs/core": "11.1.28",
    "@nestjs/config": "4.0.4",
    "@nestjs/jwt": "11.0.2",
    "@nestjs/passport": "11.0.5",
    "@nestjs/platform-express": "11.1.28",
    "passport": "0.7.0",
    "passport-jwt": "4.0.1",
    "class-validator": "0.15.1",
    "class-transformer": "0.5.1",
    "ioredis": "5.11.1",
    "reflect-metadata": "0.2.2",
    "rxjs": "7.8.2",
    "@roadbook/db": "workspace:*",
    "@roadbook/types": "workspace:*",
    "@roadbook/utils": "workspace:*",
    "@roadbook/monitor": "workspace:*"
  },
  "devDependencies": {
    "@nestjs/cli": "11.0.7",
    "@nestjs/testing": "11.1.28",
    "typescript": "5.9.3",
    "@types/node": "22.15.30",
    "@types/passport-jwt": "4.0.1",
    "jest": "29.7.0",
    "ts-jest": "29.4.0",
    "@roadbook/config": "workspace:*"
  }
}
```

- [ ] **Step 2: 创建 `apps/api/tsconfig.json`**

```json
{
  "extends": "@roadbook/config/tsconfig.nestjs.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@roadbook/*": ["../../packages/*/src"]
    }
  },
  "include": ["src", "test"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: 创建 `apps/api/src/modules/db/db.service.ts`**

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@roadbook/db';

@Injectable()
export class DbService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

- [ ] **Step 4: 创建 `apps/api/src/modules/db/db.module.ts`**

```typescript
import { Global, Module } from '@nestjs/common';
import { DbService } from './db.service';

@Global()
@Module({
  providers: [DbService],
  exports: [DbService],
})
export class DbModule {}
```

- [ ] **Step 5: 创建 `apps/api/src/modules/redis/redis.service.ts`**

```typescript
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService extends Redis implements OnModuleInit, OnModuleDestroy {
  constructor(private config: ConfigService) {
    super(config.getOrThrow<string>('REDIS_URL'));
  }

  async onModuleInit() {
    await this.ping();
  }

  async onModuleDestroy() {
    await this.quit();
  }
}
```

- [ ] **Step 6: 创建 `apps/api/src/modules/redis/redis.module.ts`**

```typescript
import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
```

- [ ] **Step 7: 创建 `apps/api/src/modules/health/health.controller.ts`**

```typescript
import { Controller, Get } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { RedisService } from '../redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(private db: DbService, private redis: RedisService) {}

  @Get()
  async check() {
    await this.db.$queryRaw`SELECT 1`;
    await this.redis.ping();
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
```

- [ ] **Step 8: 创建 `apps/api/src/common/filters/http-exception.filter.ts`**

```typescript
import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = exception instanceof HttpException
      ? exception.message
      : 'Internal server error';

    if (status >= 500) {
      this.logger.error(`${req.method} ${req.url}`, exception instanceof Error ? exception.stack : String(exception));
    }

    res.status(status).json({ statusCode: status, message, path: req.url });
  }
}
```

- [ ] **Step 9: 创建 `apps/api/src/common/interceptors/logging.interceptor.ts`**

```typescript
import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private logger = new Logger('HTTP');

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    const start = Date.now();
    return next.handle().pipe(
      tap(() => {
        const res = ctx.switchToHttp().getResponse();
        this.logger.log(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - start}ms`);
      }),
    );
  }
}
```

- [ ] **Step 10: 创建 `apps/api/src/app.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DbModule } from './modules/db/db.module';
import { RedisModule } from './modules/redis/redis.module';
import { HealthController } from './modules/health/health.controller';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule,
    RedisModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_PIPE, useFactory: () => new ValidationPipe({ whitelist: true, transform: true }) },
  ],
})
export class AppModule {}
```

- [ ] **Step 11: 创建 `apps/api/src/main.ts`**

```typescript
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.enableCors();
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`API running on port ${port}`);
}

bootstrap();
```

- [ ] **Step 12: 写 e2e 测试 `apps/api/test/health.e2e-spec.ts`**

```typescript
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('GET /api/v1/health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(() => app.close());

  it('returns ok', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
      });
  });
});
```

- [ ] **Step 13: 安装依赖并启动**

```bash
cd apps/api && pnpm install
pnpm dev
```

期望：控制台输出 "API running on port 3000"

- [ ] **Step 14: 验证 health 端点**

```bash
curl http://localhost:3000/api/v1/health
```

期望：`{"status":"ok","timestamp":"..."}`

- [ ] **Step 15: Commit**

```bash
git add apps/api
git commit -m "feat: add NestJS api skeleton with health, db, redis"
```

---

## Task 8: apps/api — Auth 模块（微信登录 + JWT）

**Files:**
- Create: `apps/api/src/modules/auth/dto/wx-login.dto.ts`
- Create: `apps/api/src/modules/auth/strategies/jwt.strategy.ts`
- Create: `apps/api/src/modules/auth/auth.service.ts`
- Create: `apps/api/src/modules/auth/auth.controller.ts`
- Create: `apps/api/src/modules/auth/auth.module.ts`
- Create: `apps/api/src/common/guards/jwt-auth.guard.ts`
- Create: `apps/api/src/common/decorators/current-user.decorator.ts`
- Create: `apps/api/test/auth.e2e-spec.ts`

**Interfaces:**
- Consumes: `DbService`（Task 7），`RedisService`（Task 7）
- Produces: `JwtAuthGuard`，`@CurrentUser()` decorator，被后续所有需鉴权的模块使用

- [ ] **Step 1: 创建 `apps/api/src/modules/auth/dto/wx-login.dto.ts`**

```typescript
import { IsString, IsNotEmpty } from 'class-validator';

export class WxLoginDto {
  @IsString()
  @IsNotEmpty()
  code: string;
}
```

- [ ] **Step 2: 创建 `apps/api/src/modules/auth/strategies/jwt.strategy.ts`**

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

export interface JwtPayload {
  sub: string;   // user.id
  openid: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload.sub) throw new UnauthorizedException();
    return { id: payload.sub, openid: payload.openid };
  }
}
```

- [ ] **Step 3: 创建 `apps/api/src/common/guards/jwt-auth.guard.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

- [ ] **Step 4: 创建 `apps/api/src/common/decorators/current-user.decorator.ts`**

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest().user as { id: string; openid: string };
});
```

- [ ] **Step 5: 写失败测试 `apps/api/test/auth.e2e-spec.ts`**

```typescript
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Auth', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(() => app.close());

  it('POST /auth/wx-login returns 400 when code missing', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/wx-login')
      .send({})
      .expect(400);
  });

  it('POST /auth/wx-login returns 401 when code invalid', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/wx-login')
      .send({ code: 'invalid-code' })
      .expect(401);
  });
});
```

- [ ] **Step 6: 创建 `apps/api/src/modules/auth/auth.service.ts`**

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import { DbService } from '../db/db.service';
import { RedisService } from '../redis/redis.service';

interface WxSession {
  openid: string;
  session_key: string;
  errcode?: number;
  errmsg?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private db: DbService,
    private redis: RedisService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async wxLogin(code: string) {
    const appId = this.config.getOrThrow<string>('WECHAT_APP_ID');
    const secret = this.config.getOrThrow<string>('WECHAT_APP_SECRET');
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appId}&secret=${secret}&js_code=${code}&grant_type=authorization_code`;

    const res = await fetch(url);
    const session: WxSession = await res.json();

    if (session.errcode || !session.openid) {
      throw new UnauthorizedException('Invalid wx code');
    }

    const user = await this.db.user.upsert({
      where: { openid: session.openid },
      update: {},
      create: { openid: session.openid },
    });

    return this.issueTokens(user.id, user.openid);
  }

  async refresh(refreshToken: string) {
    const hash = createHash('sha256').update(refreshToken).digest('hex');
    const userId = await this.redis.get(`refresh:${hash}`);
    if (!userId) throw new UnauthorizedException('Invalid refresh token');

    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    await this.redis.del(`refresh:${hash}`);
    return this.issueTokens(user.id, user.openid);
  }

  async logout(refreshToken: string) {
    const hash = createHash('sha256').update(refreshToken).digest('hex');
    await this.redis.del(`refresh:${hash}`);
  }

  private async issueTokens(userId: string, openid: string) {
    const payload = { sub: userId, openid };
    const accessToken = this.jwt.sign(payload, {
      secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      expiresIn: this.config.getOrThrow('JWT_ACCESS_EXPIRES_IN'),
    });

    const refreshToken = randomUUID();
    const hash = createHash('sha256').update(refreshToken).digest('hex');
    const ttlSeconds = 30 * 24 * 60 * 60; // 30d
    await this.redis.set(`refresh:${hash}`, userId, 'EX', ttlSeconds);

    return { access_token: accessToken, refresh_token: refreshToken };
  }
}
```

- [ ] **Step 7: 创建 `apps/api/src/modules/auth/auth.controller.ts`**

```typescript
import { Controller, Post, Body, HttpCode, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { WxLoginDto } from './dto/wx-login.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { IsString, IsNotEmpty } from 'class-validator';

class RefreshDto {
  @IsString() @IsNotEmpty() refresh_token: string;
}

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('wx-login')
  @HttpCode(200)
  wxLogin(@Body() dto: WxLoginDto) {
    return this.auth.wxLogin(dto.code);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refresh_token);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(200)
  logout(@Body() dto: RefreshDto, @CurrentUser() _user: unknown) {
    return this.auth.logout(dto.refresh_token);
  }
}
```

- [ ] **Step 8: 创建 `apps/api/src/modules/auth/auth.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [JwtStrategy],
})
export class AuthModule {}
```

- [ ] **Step 9: 注册 AuthModule 到 `app.module.ts`**

在 `apps/api/src/app.module.ts` 的 imports 数组加入 `AuthModule`：

```typescript
import { AuthModule } from './modules/auth/auth.module';
// ...
imports: [
  ConfigModule.forRoot({ isGlobal: true }),
  DbModule,
  RedisModule,
  AuthModule,  // 新增
],
```

- [ ] **Step 10: 运行测试**

```bash
cd apps/api && pnpm test:e2e
```

期望：auth 测试 PASS（400 和 401 两个用例）

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/modules/auth apps/api/src/common apps/api/test/auth.e2e-spec.ts
git commit -m "feat: add wx-login auth with JWT and Redis refresh token"
```

---

## Task 9: apps/api — Routes 模块

**Files:**
- Create: `apps/api/src/modules/routes/dto/nearby-query.dto.ts`
- Create: `apps/api/src/modules/routes/routes.service.ts`
- Create: `apps/api/src/modules/routes/routes.controller.ts`
- Create: `apps/api/src/modules/routes/routes.module.ts`
- Create: `apps/api/test/routes.e2e-spec.ts`

**Interfaces:**
- Consumes: `DbService`，`@roadbook/utils`（haversine, bbox），`JwtAuthGuard`
- Produces: `GET /routes/nearby`，`GET /routes/:id`，`POST/DELETE /routes/:id/collection`

- [ ] **Step 1: 写失败测试 `apps/api/test/routes.e2e-spec.ts`**

```typescript
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Routes', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(() => app.close());

  it('GET /routes/nearby requires lat/lng/radius_km', () => {
    return request(app.getHttpServer())
      .get('/api/v1/routes/nearby')
      .expect(400);
  });

  it('GET /routes/nearby returns array', () => {
    return request(app.getHttpServer())
      .get('/api/v1/routes/nearby?lat=29&lng=100&radius_km=500')
      .expect(200)
      .expect((res) => expect(Array.isArray(res.body.data)).toBe(true));
  });

  it('GET /routes/:id returns 404 for unknown id', () => {
    return request(app.getHttpServer())
      .get('/api/v1/routes/00000000-0000-0000-0000-000000000000')
      .expect(404);
  });
});
```

- [ ] **Step 2: 创建 `apps/api/src/modules/routes/dto/nearby-query.dto.ts`**

```typescript
import { IsNumber, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class NearbyQueryDto {
  @Type(() => Number) @IsNumber() lat: number;
  @Type(() => Number) @IsNumber() lng: number;
  @Type(() => Number) @IsNumber() @Min(1) @Max(2000) radius_km: number;
  @Type(() => Number) @IsNumber() @IsOptional() min_lat?: number;
  @Type(() => Number) @IsNumber() @IsOptional() max_lat?: number;
  @Type(() => Number) @IsNumber() @IsOptional() min_lng?: number;
  @Type(() => Number) @IsNumber() @IsOptional() max_lng?: number;
}
```

- [ ] **Step 3: 创建 `apps/api/src/modules/routes/routes.service.ts`**

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { haversineKm, bboxIntersects } from '@roadbook/utils';
import { NearbyQueryDto } from './dto/nearby-query.dto';

@Injectable()
export class RoutesService {
  constructor(private db: DbService) {}

  async findNearby(query: NearbyQueryDto) {
    const { lat, lng, radius_km, min_lat, max_lat, min_lng, max_lng } = query;

    // 粗筛：用 bbox 交集过滤
    const routes = await this.db.route.findMany({
      where: {
        status: 'published',
        ...(min_lat != null && max_lat != null && min_lng != null && max_lng != null
          ? {
              bounds_min_lat: { lte: max_lat },
              bounds_max_lat: { gte: min_lat },
              bounds_min_lng: { lte: max_lng },
              bounds_max_lng: { gte: min_lng },
            }
          : {}),
      },
      select: {
        id: true, title: true, difficulty: true, distance_km: true,
        start_lat: true, start_lng: true,
        bounds_min_lat: true, bounds_max_lat: true,
        bounds_min_lng: true, bounds_max_lng: true,
      },
    });

    // 精筛：Haversine 判断起点是否在半径内
    return routes.filter((r) =>
      haversineKm(lat, lng, Number(r.start_lat), Number(r.start_lng)) <= radius_km,
    ).map((r) => ({
      id: r.id,
      title: r.title,
      difficulty: r.difficulty,
      distance_km: Number(r.distance_km),
      start_lat: Number(r.start_lat),
      start_lng: Number(r.start_lng),
    }));
  }

  async findOne(id: string, userId?: string) {
    const route = await this.db.route.findUnique({
      where: { id, status: 'published' },
      include: {
        author: { select: { id: true, nickname: true, avatar_url: true } },
        ...(userId ? { collections: { where: { user_id: userId } } } : {}),
      },
    });
    if (!route) throw new NotFoundException('Route not found');

    return {
      ...route,
      distance_km: Number(route.distance_km),
      start_lat: Number(route.start_lat),
      start_lng: Number(route.start_lng),
      end_lat: Number(route.end_lat),
      end_lng: Number(route.end_lng),
      is_collected: userId ? (route.collections?.length ?? 0) > 0 : false,
      collections: undefined,
    };
  }

  async collect(routeId: string, userId: string) {
    await this.db.routeCollection.upsert({
      where: { user_id_route_id: { user_id: userId, route_id: routeId } },
      create: { user_id: userId, route_id: routeId },
      update: {},
    });
  }

  async uncollect(routeId: string, userId: string) {
    await this.db.routeCollection.deleteMany({
      where: { user_id: userId, route_id: routeId },
    });
  }
}
```

- [ ] **Step 4: 创建 `apps/api/src/modules/routes/routes.controller.ts`**

```typescript
import { Controller, Get, Post, Delete, Param, Query, UseGuards, HttpCode, Request } from '@nestjs/common';
import { RoutesService } from './routes.service';
import { NearbyQueryDto } from './dto/nearby-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('routes')
export class RoutesController {
  constructor(private routes: RoutesService) {}

  @Get('nearby')
  async nearby(@Query() query: NearbyQueryDto) {
    return { data: await this.routes.findNearby(query) };
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: { user?: { id: string } }) {
    return this.routes.findOne(id, req.user?.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/collection')
  @HttpCode(200)
  collect(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.routes.collect(id, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/collection')
  @HttpCode(200)
  uncollect(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.routes.uncollect(id, user.id);
  }
}
```

- [ ] **Step 5: 创建 `apps/api/src/modules/routes/routes.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { RoutesService } from './routes.service';
import { RoutesController } from './routes.controller';

@Module({
  providers: [RoutesService],
  controllers: [RoutesController],
})
export class RoutesModule {}
```

- [ ] **Step 6: 注册到 `app.module.ts`**

```typescript
import { RoutesModule } from './modules/routes/routes.module';
// imports 数组加入 RoutesModule
```

- [ ] **Step 7: 运行测试**

```bash
cd apps/api && pnpm test:e2e
```

期望：routes 测试 3 条全部 PASS

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/routes apps/api/test/routes.e2e-spec.ts
git commit -m "feat: add routes nearby query and collection endpoints"
```

---

## Task 10: apps/api — POIs + Articles 模块

**Files:**
- Create: `apps/api/src/modules/pois/pois.service.ts`
- Create: `apps/api/src/modules/pois/pois.controller.ts`
- Create: `apps/api/src/modules/pois/pois.module.ts`
- Create: `apps/api/src/modules/articles/articles.service.ts`
- Create: `apps/api/src/modules/articles/articles.controller.ts`
- Create: `apps/api/src/modules/articles/articles.module.ts`

**Interfaces:**
- Produces: `GET /pois/near-route`，`GET /articles`，`GET /articles/:id`

- [ ] **Step 1: 创建 `apps/api/src/modules/pois/pois.service.ts`**

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { haversineKm } from '@roadbook/utils';

@Injectable()
export class PoisService {
  constructor(private db: DbService) {}

  async findNearRoute(routeId: string, distanceKm = 5) {
    const route = await this.db.route.findUnique({
      where: { id: routeId, status: 'published' },
    });
    if (!route) throw new NotFoundException('Route not found');

    const polyline: Array<{ lat: number; lng: number }> = Array.isArray(route.polyline)
      ? (route.polyline as Array<{ lat: number; lng: number }>)
      : [];

    // bbox 扩展 distanceKm 度数做粗筛
    const latDelta = distanceKm / 111;
    const lngDelta = distanceKm / 85;

    const pois = await this.db.pOI.findMany({
      where: {
        lat: { gte: Number(route.bounds_min_lat) - latDelta, lte: Number(route.bounds_max_lat) + latDelta },
        lng: { gte: Number(route.bounds_min_lng) - lngDelta, lte: Number(route.bounds_max_lng) + lngDelta },
      },
    });

    // 若无 polyline，退化为 bbox 粗筛结果
    if (polyline.length === 0) {
      return pois.map((p) => ({ ...p, lat: Number(p.lat), lng: Number(p.lng) }));
    }

    // 精筛：POI 到 polyline 最短距离
    return pois
      .map((poi) => {
        const poiLat = Number(poi.lat);
        const poiLng = Number(poi.lng);
        const minDist = Math.min(...polyline.map((pt) => haversineKm(poiLat, poiLng, pt.lat, pt.lng)));
        return { ...poi, lat: poiLat, lng: poiLng, dist_km: minDist };
      })
      .filter((p) => p.dist_km <= distanceKm)
      .sort((a, b) => a.dist_km - b.dist_km);
  }
}
```

- [ ] **Step 2: 创建 `apps/api/src/modules/pois/pois.controller.ts`**

```typescript
import { Controller, Get, Query } from '@nestjs/common';
import { PoisService } from './pois.service';
import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

class NearRouteDto {
  @IsString() @IsNotEmpty() route_id: string;
  @Type(() => Number) @IsNumber() @IsOptional() distance_km?: number;
}

@Controller('pois')
export class PoisController {
  constructor(private pois: PoisService) {}

  @Get('near-route')
  async nearRoute(@Query() dto: NearRouteDto) {
    return { data: await this.pois.findNearRoute(dto.route_id, dto.distance_km) };
  }
}
```

- [ ] **Step 3: 创建 `apps/api/src/modules/pois/pois.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { PoisService } from './pois.service';
import { PoisController } from './pois.controller';

@Module({ providers: [PoisService], controllers: [PoisController] })
export class PoisModule {}
```

- [ ] **Step 4: 创建 `apps/api/src/modules/articles/articles.service.ts`**

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../db/db.service';

@Injectable()
export class ArticlesService {
  constructor(private db: DbService) {}

  async findAll(page = 1, pageSize = 20) {
    const [data, total] = await Promise.all([
      this.db.article.findMany({
        where: { status: 'published' },
        orderBy: { published_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { id: true, title: true, cover_image_url: true, published_at: true },
      }),
      this.db.article.count({ where: { status: 'published' } }),
    ]);
    return { data, total, page, page_size: pageSize };
  }

  async findOne(id: string) {
    const article = await this.db.article.findUnique({
      where: { id, status: 'published' },
    });
    if (!article) throw new NotFoundException('Article not found');
    return article;
  }
}
```

- [ ] **Step 5: 创建 `apps/api/src/modules/articles/articles.controller.ts`**

```typescript
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { IsOptional, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

class PaginationDto {
  @Type(() => Number) @IsNumber() @IsOptional() page?: number;
  @Type(() => Number) @IsNumber() @IsOptional() page_size?: number;
}

@Controller('articles')
export class ArticlesController {
  constructor(private articles: ArticlesService) {}

  @Get()
  findAll(@Query() dto: PaginationDto) {
    return this.articles.findAll(dto.page, dto.page_size);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.articles.findOne(id);
  }
}
```

- [ ] **Step 6: 创建 `apps/api/src/modules/articles/articles.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { ArticlesController } from './articles.controller';

@Module({ providers: [ArticlesService], controllers: [ArticlesController] })
export class ArticlesModule {}
```

- [ ] **Step 7: 注册到 `app.module.ts`**

```typescript
import { PoisModule } from './modules/pois/pois.module';
import { ArticlesModule } from './modules/articles/articles.module';
// imports 数组加入 PoisModule, ArticlesModule
```

- [ ] **Step 8: 冒烟测试**

```bash
curl "http://localhost:3000/api/v1/articles?page=1&page_size=10"
curl "http://localhost:3000/api/v1/pois/near-route?route_id=seed-route-1"
```

期望：两个接口返回 200 + 数据。

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/pois apps/api/src/modules/articles
git commit -m "feat: add pois near-route and articles list/detail endpoints"
```

---

## Task 11: apps/api — Storage 模块（COS 预签名 URL）

**Files:**
- Create: `apps/api/src/modules/storage/storage.service.ts`
- Create: `apps/api/src/modules/storage/storage.controller.ts`
- Create: `apps/api/src/modules/storage/storage.module.ts`

**Produces:** `POST /storage/presigned-url`，鉴权后返回腾讯 COS 直传 URL

- [ ] **Step 1: 安装腾讯 COS SDK**

```bash
cd apps/api && pnpm add cos-nodejs-sdk-v5@2.14.6
pnpm add -D @types/cos-nodejs-sdk-v5@2.1.7
```

- [ ] **Step 2: 创建 `apps/api/src/modules/storage/storage.service.ts`**

```typescript
import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as COS from 'cos-nodejs-sdk-v5';
import { randomUUID } from 'crypto';

const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_SCENES = ['routes', 'pois', 'articles', 'avatars'];

@Injectable()
export class StorageService {
  private cos: COS;
  private bucket: string;
  private region: string;
  private publicBaseUrl: string;

  constructor(private config: ConfigService) {
    this.cos = new COS({
      SecretId: config.getOrThrow('TENCENT_COS_SECRET_ID'),
      SecretKey: config.getOrThrow('TENCENT_COS_SECRET_KEY'),
    });
    this.bucket = config.getOrThrow('TENCENT_COS_BUCKET');
    this.region = config.getOrThrow('TENCENT_COS_REGION');
    this.publicBaseUrl = config.getOrThrow('TENCENT_COS_PUBLIC_BASE_URL');
  }

  async getPresignedUrl(filename: string, contentType: string, scene: string) {
    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
      throw new BadRequestException('Unsupported content type');
    }
    if (!ALLOWED_SCENES.includes(scene)) {
      throw new BadRequestException('Invalid scene');
    }

    const ext = filename.split('.').pop() ?? 'jpg';
    const key = `${scene}/${randomUUID()}.${ext}`;

    const uploadUrl = await new Promise<string>((resolve, reject) => {
      this.cos.getObjectUrl(
        {
          Bucket: this.bucket,
          Region: this.region,
          Key: key,
          Method: 'PUT',
          Expires: 900, // 15分钟
          Sign: true,
        },
        (err, data) => (err ? reject(err) : resolve(data.Url)),
      );
    });

    return {
      upload_url: uploadUrl,
      object_key: key,
      public_url: `${this.publicBaseUrl}/${key}`,
    };
  }
}
```

- [ ] **Step 3: 创建 `apps/api/src/modules/storage/storage.controller.ts`**

```typescript
import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { StorageService } from './storage.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { IsString, IsNotEmpty } from 'class-validator';

class PresignedUrlDto {
  @IsString() @IsNotEmpty() filename: string;
  @IsString() @IsNotEmpty() content_type: string;
  @IsString() @IsNotEmpty() scene: string;
}

@UseGuards(JwtAuthGuard)
@Controller('storage')
export class StorageController {
  constructor(private storage: StorageService) {}

  @Post('presigned-url')
  getPresignedUrl(@Body() dto: PresignedUrlDto) {
    return this.storage.getPresignedUrl(dto.filename, dto.content_type, dto.scene);
  }
}
```

- [ ] **Step 4: 创建 `apps/api/src/modules/storage/storage.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { StorageController } from './storage.controller';

@Module({ providers: [StorageService], controllers: [StorageController] })
export class StorageModule {}
```

- [ ] **Step 5: 注册到 `app.module.ts`**

```typescript
import { StorageModule } from './modules/storage/storage.module';
// imports 数组加入 StorageModule
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/storage
git commit -m "feat: add COS presigned URL storage endpoint"
```

---

## Task 12: apps/roadbook — Taro 骨架 + API Client + Monitor

**Files:**
- Create: `apps/roadbook/package.json`
- Create: `apps/roadbook/project.config.json`
- Create: `apps/roadbook/src/app.tsx`
- Create: `apps/roadbook/src/app.config.ts`
- Create: `apps/roadbook/src/services/http.ts`
- Create: `apps/roadbook/src/services/auth.ts`
- Create: `apps/roadbook/src/pages/index/index.tsx`
- Create: `apps/roadbook/src/pages/index/index.config.ts`
- Create: `apps/roadbook/src/pages/route-detail/index.tsx`
- Create: `apps/roadbook/src/pages/route-detail/index.config.ts`
- Create: `apps/roadbook/src/pages/articles/index.tsx`
- Create: `apps/roadbook/src/pages/articles/index.config.ts`
- Create: `apps/roadbook/src/pages/profile/index.tsx`
- Create: `apps/roadbook/src/pages/profile/index.config.ts`

**Produces:** 可在微信开发者工具运行的 Taro 小程序，4 个页面路由，API client，日志集成

- [ ] **Step 1: 创建 `apps/roadbook/package.json`**

```json
{
  "name": "roadbook",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev:weapp": "taro build --type weapp --watch",
    "build:weapp": "taro build --type weapp",
    "lint": "eslint src",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@tarojs/taro": "4.2.0",
    "@tarojs/components": "4.2.0",
    "@tarojs/runtime": "4.2.0",
    "@tarojs/plugin-framework-react": "4.2.0",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "@roadbook/types": "workspace:*",
    "@roadbook/monitor": "workspace:*"
  },
  "devDependencies": {
    "@tarojs/cli": "4.2.0",
    "@tarojs/webpack5-runner": "4.2.0",
    "@types/react": "18.3.23",
    "typescript": "5.9.3",
    "@roadbook/config": "workspace:*"
  }
}
```

- [ ] **Step 2: 创建 `apps/roadbook/project.config.json`**

```json
{
  "miniprogramRoot": "dist/",
  "projectname": "roadbook",
  "setting": {
    "urlCheck": true,
    "es6": true,
    "enhance": true,
    "postcss": true,
    "minified": true
  },
  "appid": "your-wx-appid-here",
  "compileType": "miniprogram"
}
```

- [ ] **Step 3: 创建 `apps/roadbook/src/services/http.ts`**

```typescript
import Taro from '@tarojs/taro';
import { logger } from '@roadbook/monitor/client';

const BASE_URL = process.env.TARO_APP_API_BASE_URL ?? 'http://localhost:3000/api/v1';

function getToken(): string | null {
  try { return Taro.getStorageSync('access_token'); } catch { return null; }
}

export async function request<T>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  data?: Record<string, unknown>,
): Promise<T> {
  const token = getToken();
  const res = await Taro.request({
    url: `${BASE_URL}${path}`,
    method,
    data,
    header: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (res.statusCode >= 400) {
    logger.error('[http]', method, path, res.statusCode, res.data);
    throw new Error((res.data as { message?: string })?.message ?? 'Request failed');
  }

  return res.data as T;
}

export const http = {
  get: <T>(path: string, params?: Record<string, unknown>) => request<T>('GET', path, params),
  post: <T>(path: string, data?: Record<string, unknown>) => request<T>('POST', path, data),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
```

- [ ] **Step 4: 创建 `apps/roadbook/src/services/auth.ts`**

```typescript
import Taro from '@tarojs/taro';
import { http } from './http';

export async function wxLogin(): Promise<void> {
  const { code } = await Taro.login();
  const res = await http.post<{ access_token: string; refresh_token: string }>(
    '/auth/wx-login',
    { code },
  );
  Taro.setStorageSync('access_token', res.access_token);
  Taro.setStorageSync('refresh_token', res.refresh_token);
}

export function isLoggedIn(): boolean {
  return !!Taro.getStorageSync('access_token');
}

export function logout(): void {
  const refreshToken = Taro.getStorageSync('refresh_token');
  if (refreshToken) {
    http.post('/auth/logout', { refresh_token: refreshToken }).catch(() => {});
  }
  Taro.removeStorageSync('access_token');
  Taro.removeStorageSync('refresh_token');
}
```

- [ ] **Step 5: 创建 `apps/roadbook/src/app.tsx`**

```tsx
import { PropsWithChildren, useEffect } from 'react';
import Taro from '@tarojs/taro';
import { setupGlobalErrorCapture } from '@roadbook/monitor/client';
import './app.css';

function App({ children }: PropsWithChildren) {
  useEffect(() => {
    setupGlobalErrorCapture();
  }, []);

  return <>{children}</>;
}

export default App;
```

- [ ] **Step 6: 创建 `apps/roadbook/src/app.config.ts`**

```typescript
export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/route-detail/index',
    'pages/articles/index',
    'pages/profile/index',
  ],
  window: {
    backgroundTextStyle: 'dark',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTitleText: '路书',
    navigationBarTextStyle: 'black',
  },
  permission: {
    'scope.userLocation': {
      desc: '用于展示附近徒步路线',
    },
  },
  requiredPrivateInfos: ['getLocation'],
});
```

- [ ] **Step 7: 创建首页占位 `apps/roadbook/src/pages/index/index.tsx`**

```tsx
import { View, Text } from '@tarojs/components';

export default function IndexPage() {
  return (
    <View>
      <Text>地图页面（Task 13 实现）</Text>
    </View>
  );
}
```

创建同目录下 `index.config.ts`：
```typescript
export default definePageConfig({ navigationBarTitleText: '路书地图' });
```

对 `route-detail`、`articles`、`profile` 三个页面做同样的占位文件，navigationBarTitleText 分别为"路线详情"、"知识"、"我的"。

- [ ] **Step 8: 安装依赖并启动**

```bash
cd apps/roadbook && pnpm install
pnpm dev:weapp
```

在微信开发者工具导入 `apps/roadbook/dist/` 目录，确认 4 个页面可切换。

- [ ] **Step 9: Commit**

```bash
git add apps/roadbook
git commit -m "feat: add Taro roadbook skeleton with 4 pages and api client"
```

---

## Task 13: apps/roadbook — 地图页（半径拖动 + 路线 Markers）

**Files:**
- Modify: `apps/roadbook/src/pages/index/index.tsx`

**Interfaces:**
- Consumes: `http.get('/routes/nearby')`，`RouteMarker`（@roadbook/types）

- [ ] **Step 1: 修改 `apps/roadbook/src/pages/index/index.tsx`**

```tsx
import { useState, useCallback } from 'react';
import { View, Slider, Text } from '@tarojs/components';
import { Map } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { http } from '../../services/http';
import type { RouteMarker } from '@roadbook/types';

interface Location { lat: number; lng: number }

const DEFAULT_RADIUS = 100; // km
const DEFAULT_LOCATION: Location = { lat: 30.5728, lng: 104.0668 }; // 成都

export default function IndexPage() {
  const [center, setCenter] = useState<Location>(DEFAULT_LOCATION);
  const [radius, setRadius] = useState(DEFAULT_RADIUS);
  const [routes, setRoutes] = useState<RouteMarker[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRoutes = useCallback(async (loc: Location, r: number) => {
    setLoading(true);
    try {
      const res = await http.get<{ data: RouteMarker[] }>(
        `/routes/nearby?lat=${loc.lat}&lng=${loc.lng}&radius_km=${r}`,
      );
      setRoutes(res.data);
    } catch (e) {
      Taro.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  }, []);

  const onLocationTap = useCallback(() => {
    Taro.getLocation({ type: 'gcj02' }).then((loc) => {
      const newCenter = { lat: loc.latitude, lng: loc.longitude };
      setCenter(newCenter);
      fetchRoutes(newCenter, radius);
    });
  }, [radius, fetchRoutes]);

  const onRadiusChange = useCallback((e: { detail: { value: number } }) => {
    const r = e.detail.value;
    setRadius(r);
    fetchRoutes(center, r);
  }, [center, fetchRoutes]);

  const markers = routes.map((r, idx) => ({
    id: idx,
    latitude: r.start_lat,
    longitude: r.start_lng,
    title: r.title,
    callout: { content: r.title, display: 'BYCLICK' as const },
  }));

  return (
    <View style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Map
        style={{ flex: 1 }}
        latitude={center.lat}
        longitude={center.lng}
        markers={markers}
        circles={[{ latitude: center.lat, longitude: center.lng, radius: radius * 1000, strokeColor: '#2563eb', fillColor: '#2563eb20' }]}
        onTap={onLocationTap}
      />
      <View style={{ padding: '12px 16px', background: '#fff' }}>
        <Text>搜索半径：{radius} km {loading ? '加载中...' : `(${routes.length} 条路线)`}</Text>
        <Slider min={10} max={500} step={10} value={radius} onChange={onRadiusChange} />
      </View>
    </View>
  );
}
```

- [ ] **Step 2: 在微信开发者工具验证**

1. 启动 `pnpm dev:weapp`，在开发者工具预览首页
2. 拖动 Slider，地图圆圈半径变化
3. 点击地图触发定位，routes 列表更新（需后端 seed 数据）

- [ ] **Step 3: Commit**

```bash
git add apps/roadbook/src/pages/index
git commit -m "feat: map page with radius slider and nearby routes markers"
```

---

## Task 14: apps/roadbook — 路线详情 + POI

**Files:**
- Modify: `apps/roadbook/src/pages/route-detail/index.tsx`

**Interfaces:**
- Consumes: `http.get('/routes/:id')`，`http.get('/pois/near-route')`，`RouteDetail`，`PoiItem`

- [ ] **Step 1: 修改 `apps/roadbook/src/pages/route-detail/index.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { View, Text, Image, ScrollView } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { http } from '../../services/http';
import { isLoggedIn } from '../../services/auth';
import type { RouteDetail, PoiItem } from '@roadbook/types';

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: '简单', medium: '中等', hard: '困难', extreme: '极难',
};

const POI_LABEL: Record<string, string> = {
  rv_camp: '🚐 房车营地', ev_charge: '⚡ 充电站',
};

export default function RouteDetailPage() {
  const { params } = useRouter();
  const routeId = params.id as string;

  const [route, setRoute] = useState<RouteDetail | null>(null);
  const [pois, setPois] = useState<PoiItem[]>([]);
  const [collected, setCollected] = useState(false);

  useEffect(() => {
    http.get<RouteDetail>(`/routes/${routeId}`).then((r) => {
      setRoute(r);
      setCollected(r.is_collected);
    });
    http.get<{ data: PoiItem[] }>(`/pois/near-route?route_id=${routeId}&distance_km=5`)
      .then((r) => setPois(r.data));
  }, [routeId]);

  const toggleCollect = async () => {
    if (!isLoggedIn()) {
      Taro.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    try {
      if (collected) {
        await http.delete(`/routes/${routeId}/collection`);
      } else {
        await http.post(`/routes/${routeId}/collection`);
      }
      setCollected(!collected);
    } catch {
      Taro.showToast({ title: '操作失败', icon: 'none' });
    }
  };

  if (!route) return <View><Text>加载中...</Text></View>;

  return (
    <ScrollView scrollY style={{ height: '100vh' }}>
      {route.cover_image_url && (
        <Image src={route.cover_image_url} mode="aspectFill" style={{ width: '100%', height: '200px' }} />
      )}
      <View style={{ padding: '16px' }}>
        <Text style={{ fontSize: '20px', fontWeight: 'bold' }}>{route.title}</Text>
        <View style={{ display: 'flex', gap: '8px', margin: '8px 0' }}>
          <Text>{DIFFICULTY_LABEL[route.difficulty]}</Text>
          <Text>{route.distance_km} km</Text>
          {route.duration_hours && <Text>{route.duration_hours} h</Text>}
          {route.elevation_gain_m && <Text>↑{route.elevation_gain_m} m</Text>}
        </View>
        <Text style={{ color: '#666', lineHeight: '1.6' }}>{route.description}</Text>

        <View
          style={{ marginTop: '16px', padding: '12px', background: collected ? '#fef3c7' : '#eff6ff', borderRadius: '8px', textAlign: 'center' }}
          onClick={toggleCollect}
        >
          <Text>{collected ? '★ 已收藏' : '☆ 收藏路线'}</Text>
        </View>

        {pois.length > 0 && (
          <View style={{ marginTop: '16px' }}>
            <Text style={{ fontWeight: 'bold', fontSize: '16px' }}>沿途补给点</Text>
            {pois.map((poi) => (
              <View key={poi.id} style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                <Text>{POI_LABEL[poi.type]} {poi.name}</Text>
                {poi.description && <Text style={{ color: '#666', fontSize: '13px' }}>{poi.description}</Text>}
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
```

- [ ] **Step 2: 从地图页跳转路线详情**

在 `apps/roadbook/src/pages/index/index.tsx` 的 markers 添加点击事件：

```tsx
const onMarkerTap = (e: { detail: { markerId: number } }) => {
  const route = routes[e.detail.markerId];
  if (route) Taro.navigateTo({ url: `/pages/route-detail/index?id=${route.id}` });
};
// Map 组件加 onMarkerTap={onMarkerTap}
```

- [ ] **Step 3: 验证**

1. 地图点击 marker → 跳转路线详情
2. 详情页展示路线信息 + POI 列表
3. 点击收藏按钮（未登录时提示登录）

- [ ] **Step 4: Commit**

```bash
git add apps/roadbook/src/pages/route-detail apps/roadbook/src/pages/index
git commit -m "feat: route detail page with POI list and collect action"
```

---

## Task 15: apps/roadbook — 文章列表 + 个人中心

**Files:**
- Modify: `apps/roadbook/src/pages/articles/index.tsx`
- Modify: `apps/roadbook/src/pages/profile/index.tsx`

- [ ] **Step 1: 修改 `apps/roadbook/src/pages/articles/index.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { View, Text, Image, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { http } from '../../services/http';
import type { ArticleSummary } from '@roadbook/types';

export default function ArticlesPage() {
  const [articles, setArticles] = useState<ArticleSummary[]>([]);

  useEffect(() => {
    http.get<{ data: ArticleSummary[] }>('/articles?page=1&page_size=20')
      .then((r) => setArticles(r.data));
  }, []);

  return (
    <ScrollView scrollY style={{ height: '100vh', padding: '16px' }}>
      <Text style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '12px' }}>户外知识</Text>
      {articles.map((a) => (
        <View
          key={a.id}
          style={{ marginBottom: '12px', background: '#fff', borderRadius: '8px', overflow: 'hidden' }}
          onClick={() => Taro.navigateTo({ url: `/pages/article-detail/index?id=${a.id}` })}
        >
          {a.cover_image_url && (
            <Image src={a.cover_image_url} mode="aspectFill" style={{ width: '100%', height: '120px' }} />
          )}
          <View style={{ padding: '10px' }}>
            <Text style={{ fontWeight: 'bold' }}>{a.title}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
```

- [ ] **Step 2: 修改 `apps/roadbook/src/pages/profile/index.tsx`**

```tsx
import { View, Text, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { wxLogin, isLoggedIn, logout } from '../../services/auth';

export default function ProfilePage() {
  const loggedIn = isLoggedIn();

  const handleLogin = async () => {
    try {
      await wxLogin();
      Taro.showToast({ title: '登录成功', icon: 'success' });
    } catch {
      Taro.showToast({ title: '登录失败', icon: 'none' });
    }
  };

  const handleLogout = () => {
    logout();
    Taro.showToast({ title: '已退出', icon: 'none' });
  };

  return (
    <View style={{ padding: '32px 16px' }}>
      <Text style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '24px' }}>我的</Text>
      {loggedIn ? (
        <Button onClick={handleLogout}>退出登录</Button>
      ) : (
        <Button type="primary" onClick={handleLogin}>微信一键登录</Button>
      )}
    </View>
  );
}
```

- [ ] **Step 3: 创建 `apps/roadbook/src/pages/article-detail/index.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { View, Text, Image, ScrollView } from '@tarojs/components';
import { useRouter } from '@tarojs/taro';
import { http } from '../../services/http';
import type { ArticleDetail } from '@roadbook/types';

export default function ArticleDetailPage() {
  const { params } = useRouter();
  const [article, setArticle] = useState<ArticleDetail | null>(null);

  useEffect(() => {
    http.get<ArticleDetail>(`/articles/${params.id}`).then(setArticle);
  }, [params.id]);

  if (!article) return <View><Text>加载中...</Text></View>;

  return (
    <ScrollView scrollY style={{ height: '100vh' }}>
      {article.cover_image_url && (
        <Image src={article.cover_image_url} mode="aspectFill" style={{ width: '100%', height: '200px' }} />
      )}
      <View style={{ padding: '16px' }}>
        <Text style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '12px' }}>{article.title}</Text>
        <Text style={{ lineHeight: '1.8', color: '#333' }}>{article.content}</Text>
      </View>
    </ScrollView>
  );
}
```

创建同目录 `index.config.ts`：
```typescript
export default definePageConfig({ navigationBarTitleText: '文章详情' });
```

同时在 `apps/roadbook/src/app.config.ts` 的 pages 数组末尾加入 `'pages/article-detail/index'`。

- [ ] **Step 4: 验证**

1. 文章列表正常展示 seed 文章
2. 点击文章跳转详情页，内容正常展示
3. 个人中心登录按钮触发微信登录流程（需配置真实 appid）
4. 退出后 token 被清除

- [ ] **Step 5: Commit**

```bash
git add apps/roadbook/src/pages/articles apps/roadbook/src/pages/article-detail apps/roadbook/src/pages/profile apps/roadbook/src/app.config.ts
git commit -m "feat: articles list/detail and profile login/logout"
```

---

## Task 16: Docker 部署 + 上线检查清单

**Files:**
- Create: `apps/api/Dockerfile`
- Modify: `docker-compose.yml`
- Create: `apps/api/.dockerignore`

**Produces:** 可通过 Docker 构建和运行的完整服务栈

- [ ] **Step 1: 创建 `apps/api/Dockerfile`**

```dockerfile
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.12.0 --activate
WORKDIR /app

# 依赖层
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/config/package.json packages/config/
COPY packages/types/package.json packages/types/
COPY packages/utils/package.json packages/utils/
COPY packages/db/package.json packages/db/
COPY packages/monitor/package.json packages/monitor/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter api...

# 构建层
FROM deps AS builder
COPY packages/ packages/
COPY apps/api/ apps/api/
RUN pnpm --filter api build

# 运行层
FROM node:22-alpine AS runner
RUN corepack enable && corepack prepare pnpm@11.12.0 --activate
WORKDIR /app
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY packages/db/prisma ./prisma

EXPOSE 3000
CMD ["node", "dist/main"]
```

- [ ] **Step 2: 创建 `apps/api/.dockerignore`**

```
node_modules
dist
*.spec.ts
test/
```

- [ ] **Step 3: 更新 `docker-compose.yml` 加入 api 服务**

```yaml
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_USER: roadbook
      POSTGRES_PASSWORD: password
      POSTGRES_DB: roadbook
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U roadbook"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7.4
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    image: roadbook-api:local
    ports:
      - "3000:3000"
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started

volumes:
  postgres_data:
  redis_data:
```

- [ ] **Step 4: 构建并验证**

```bash
docker compose build api
docker compose up -d
curl http://localhost:3000/api/v1/health
```

期望：`{"status":"ok","timestamp":"..."}`

- [ ] **Step 5: Migration 策略确认**

migration 不在业务容器启动时自动执行，使用单独命令：

```bash
docker compose run --rm api node -e "require('@prisma/client'); process.exit(0)"
# 生产 migration 使用：
# cd packages/db && DATABASE_URL=<prod_url> pnpm migrate:deploy
```

- [ ] **Step 6: 上线前检查清单**

```
[ ] 微信小程序后台配置合法域名：
    - request 域名：https://your-api-domain.com
    - uploadFile 域名：https://your-cos-bucket.cos.ap-guangzhou.myqcloud.com
[ ] .env.example 中所有变量均已填写（不含真实密钥）
[ ] WECHAT_APP_ID / WECHAT_APP_SECRET 已配置
[ ] TENCENT_MAP_KEY 已绑定小程序 appid
[ ] JWT_ACCESS_SECRET / JWT_REFRESH_SECRET 已替换为随机强密钥
[ ] COS 存储桶已配置 CORS 策略（允许小程序直传）
[ ] NODE_ENV=production 已设置
[ ] 隐私协议页面已在小程序后台提交
[ ] 位置权限用途说明已填写
[ ] Sentry DSN 已配置，错误上报验证通过
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/Dockerfile apps/api/.dockerignore docker-compose.yml
git commit -m "feat: add Dockerfile and complete docker-compose for deployment"
```

---

## 阶段验收标准（与 spec 对齐）

| 阶段 | Tasks | 验收条件 |
|---|---|---|
| 1 Monorepo | 1-2 | `pnpm install` 生成 lockfile，版本校验通过 |
| 2 数据库 | 3-5 | migration 跑通，seed 写入，Prisma Studio 可查数据 |
| 3 后端 | 6-11 | `/health` 200；路线/文章/POI 接口有测试并通过；微信登录流程可 mock |
| 4 前端骨架 | 12 | 微信开发者工具 4 页面可进入 |
| 5 核心联调 | 13-15 | 地图拖动渲染路线；详情展示 POI；收藏闭环跑通 |
| 6 部署 | 16 | Docker 构建成功；`/health` 可访问；上线清单全部勾选 |
