# 个人路线 PostgreSQL 持久化技术方案

## 1. 文档状态

| 项目 | 内容 |
| --- | --- |
| 状态 | 方案已确认，待实现 |
| 日期 | 2026-09-25 |
| 适用应用 | `apps/roadbook-web` |
| 核心目标 | 个人路线跨浏览器、跨设备持久化 |
| 数据边界 | 单个私人工作区，不建设公开账户体系 |

本文只固化已确认的技术方案，不表示数据库持久化已经上线。实现完成前，Roadbook Web 仍以浏览器 `localStorage` 为唯一有效路线仓储，现行产品文档中的本地存储边界继续生效。

## 2. 背景与目标

当前 Roadbook Web 使用 `LocalRoutePlanRepository` 保存路线目录和完整快照。该方案可以满足单个浏览器内的刷新恢复，但存在以下边界：

- 清理浏览器数据后路线不可恢复。
- 无法在另一台设备或另一个浏览器中读取既有路线。
- 无法通过数据库备份恢复误丢失的数据。
- 本地存储损坏、受限或空间不足时，没有服务端副本。

本次目标是在不扩大为账户系统或多人协作系统的前提下，把个人路线方案持久化到 PostgreSQL，并保留现有“启动后不自动加载任一路线”的产品规则。

## 3. 范围

### 3.1 本次负责

- 一个固定的私人 `Workspace`。
- 一个长期有效、可主动更换的访问码。
- 一个有效期为 `90` 天、可滚动续期的签名 `HttpOnly Cookie`。
- 路线目录、路线快照和控制点的 PostgreSQL 持久化。
- 当前浏览器既有本地路线的一次性幂等导入。
- 单标签页和多标签页场景下的 revision 冲突保护。
- Next.js Route Handlers 中的鉴权、参数校验和数据库访问。
- 未授权、过期、保存失败、版本冲突和数据库不可用时的明确反馈。

### 3.2 本次不负责

- 注册、邮箱、手机号、微信、OAuth 或第三方登录。
- 用户资料、找回密码、成员邀请和角色权限。
- 多人同时编辑、在线状态、光标同步、WebSocket、CRDT 或操作合并。
- Redis、消息队列、后台任务和分布式锁。
- COS、头像、路线封面或其他用户文件上传。
- 路线计算结果、天气结果、地图搜索结果和海拔结果的长期持久化。
- 公开分享、路线市场、评论、点赞和版本历史界面。
- 小程序和现有 NestJS 后端改造。

## 4. 核心决策

### 4.1 单租户私人工作区

系统只维护一个固定的私人工作区。所有路线都归属于该工作区，不创建面向用户的账户、成员或组织概念。

数据库仍显式保存 `workspace_id`，原因如下：

- 防止所有路线成为无归属的全局数据。
- 为查询提供稳定的数据隔离条件。
- 未来如果确有多工作区需求，可以增加访问授权而不重构路线表。
- 不因当前只有一个使用者而把单例假设散落到业务代码中。

客户端请求不得提交或覆盖 `workspace_id`。服务端只能从已验证的 Cookie 中取得工作区标识，并将其加入每一次查询和写入条件。

### 4.2 访问码不是账户密码

访问码只承担私人应用入口保护，不代表账户体系：

- 访问码长期有效，直到主动替换。
- 服务端只保存访问码哈希，不保存明文。
- 访问码不得进入 `NEXT_PUBLIC_*`、客户端 JavaScript、日志或错误响应。
- 建议使用至少 `128` bit 熵的随机值，不使用常见口令或短数字 PIN。
- 校验使用恒定时间比较，失败统一返回通用错误，不暴露是否存在工作区。

### 4.3 Cookie 有效期

Cookie 不永久有效，默认策略如下：

- 初次验证成功后有效 `90` 天。
- 剩余有效期不足 `15` 天时，在一次正常请求中滚动续期至 `90` 天。
- 连续 `90` 天未访问后，必须重新输入访问码。
- 用户可以主动退出并删除 Cookie。
- Cookie 中包含 `credentialVersion`；提升服务端版本号可以立即使所有旧 Cookie 失效。

Cookie 属性：

```text
HttpOnly = true
Secure = true（生产环境）
SameSite = Lax
Path = /
Max-Age = 7776000
```

Cookie 载荷只允许包含：

```text
workspaceId
credentialVersion
issuedAt
expiresAt
```

载荷使用独立的高熵服务端密钥进行 HMAC-SHA256 签名。访问码和 Cookie 签名密钥必须是两个不同的秘密值。

### 4.4 PostgreSQL 是登录后的权威仓储

- 未通过访问验证时，不允许读取或修改数据库路线。
- 通过访问验证后，PostgreSQL 是路线目录和路线快照的权威来源。
- 启动阶段只读取路线摘要目录，不自动加载完整快照，不自动请求算路或海拔。
- 用户显式选择路线后才读取控制点并恢复到地图。
- `localStorage` 仅用于识别和导入升级前的本地路线，不与数据库长期双向同步。
- 导入成功后暂不自动删除本地数据，给回滚和人工确认保留安全窗口。

首版不提供离线编辑队列。数据库保存失败时，当前内存中的编辑内容继续保留，界面显示“尚未保存到数据库”，用户可以重试；不得静默显示“已保存”。

### 4.5 Web 直接使用 Next.js 服务端能力

本次只服务 Roadbook Web，不通过现有 NestJS API：

```text
浏览器
  → Next.js Route Handlers
    → 应用服务
      → PostgreSQL 路线仓储
```

这样可以避免为个人 Web MVP 额外部署 NestJS、Redis、COS 和第二个 API 域名。数据库连接、访问码校验和 Cookie 签名仅存在于 Next.js Node.js 服务端运行时。

页面、业务组件和应用 Hook 不得直接依赖 Prisma。客户端通过领域仓储接口访问 HTTP 基础设施实现，服务端 Route Handler 再调用 PostgreSQL 仓储。

## 5. 领域与代码结构

推荐依赖方向：

```text
App Router 页面
  → 业务组件
    → useRoutePlanningWorkspace
      → RoutePlanRepository
        ← HttpRoutePlanRepository
          → /api/route-plans
            → RoutePlanApplicationService
              → PostgreSqlRoutePlanRepository
                → @roadbook/db
```

推荐新增或调整的职责：

| 职责 | 建议路径 |
| --- | --- |
| 路线仓储领域接口 | `domain/route-planning/route-plan-repository.ts` |
| 浏览器 HTTP 仓储 | `infrastructure/route-plan/http-route-plan-repository.ts` |
| 服务端 PostgreSQL 仓储 | `infrastructure/route-plan/postgresql-route-plan-repository.ts` |
| 路线应用服务 | `application/route-planning/route-plan-application-service.ts` |
| 访问会话服务 | `infrastructure/workspace-access/workspace-access-session.ts` |
| 访问入口组件 | `components/workspace-access/workspace-access-gate.tsx` |
| 会话接口 | `app/api/access/session/route.ts` |
| 路线目录接口 | `app/api/route-plans/route.ts` |
| 路线详情接口 | `app/api/route-plans/[id]/route.ts` |
| 本地导入接口 | `app/api/route-plans/import-local/route.ts` |

组件和类型使用领域语言，禁止以页面位置命名。`WorkspaceAccessGate` 只负责收集访问码和呈现会话状态，不直接访问 Prisma、环境变量或 `localStorage`。

## 6. 数据模型

### 6.1 Workspace

```text
Workspace
- id           UUID 主键
- name         VARCHAR(80)
- created_at   TIMESTAMPTZ
- updated_at   TIMESTAMPTZ
```

首版只创建一行。工作区标识通过服务端环境变量配置，并由部署初始化步骤写入数据库。

### 6.2 RoutePlan

```text
RoutePlan
- id              UUID 主键，由客户端既有 UUID 或服务端生成
- workspace_id    UUID 外键 → Workspace.id
- name            VARCHAR(120)
- strategy        RouteStrategy
- revision        INTEGER，默认 0
- schema_version  SMALLINT，默认 1
- created_at      TIMESTAMPTZ
- updated_at      TIMESTAMPTZ
- deleted_at      TIMESTAMPTZ，可空
```

约束与索引：

- `revision >= 0`。
- `schema_version > 0`。
- `workspace_id, updated_at DESC` 组合索引。
- 活跃目录查询始终增加 `deleted_at IS NULL`。
- 名称去除首尾空白后最长 `120` 个字符；空名称归一化为“未命名路线”。

### 6.3 RoutePlanControlPoint

```text
RoutePlanControlPoint
- id             UUID 主键，复用现有控制点稳定标识
- route_plan_id  UUID 外键 → RoutePlan.id，级联删除
- sort_order     SMALLINT
- name           VARCHAR(160)
- address        VARCHAR(500)
- latitude       DECIMAL(9, 6)
- longitude      DECIMAL(9, 6)
- created_at     TIMESTAMPTZ
- updated_at     TIMESTAMPTZ
```

约束与索引：

- `UNIQUE(route_plan_id, sort_order)`。
- `UNIQUE(route_plan_id, id)` 可由主键和所属校验共同保证。
- `sort_order` 范围为 `0—19`，与当前最多 `20` 个控制点一致。
- `latitude` 范围为 `-90—90`。
- `longitude` 范围为 `-180—180`。
- 按 `route_plan_id, sort_order` 读取，数据库顺序是唯一控制点顺序来源。

### 6.4 不进入数据库的数据

以下数据首版不写入 PostgreSQL：

- 地图 SDK 对象和覆盖物状态。
- 当前选中控制点或路段。
- 地图中心、缩放层级和 Widget 展开状态。
- 路线折线、路段计算结果和路线指标。
- 海拔采样与地形指标。
- 天气缓存、搜索历史和地图供应商原始响应。
- 异步请求状态、错误信息和 Toast。

这些数据要么是临时 UI 状态，要么可以由控制点和策略重新计算，不属于路线方案的最小持久化事实。

## 7. API 设计

所有接口均位于同源 `/api` 下，使用 JSON，并要求有效的工作区 Cookie。除创建会话接口外，未授权统一返回 `401`。

### 7.1 访问会话

#### `POST /api/access/session`

请求：

```json
{
  "accessCode": "<用户输入>"
}
```

成功：

- 返回 `204`。
- 设置签名 `HttpOnly Cookie`。
- 响应体不返回访问码、Cookie 载荷或签名信息。

失败：

- 无效访问码返回通用 `401`。
- 不区分访问码不存在、哈希不匹配或工作区不可用。

#### `GET /api/access/session`

返回当前会话是否有效和到期时间，不返回敏感信息。可在该请求中完成滚动续期。

#### `DELETE /api/access/session`

删除 Cookie 并返回 `204`。

### 7.2 路线目录

#### `GET /api/route-plans`

只返回轻量摘要：

```text
id
name
controlPointCount
startPointName
lastControlPointName
updatedAt
schemaVersion
revision
loadable
```

不得返回完整控制点或触发地图计算。

#### `POST /api/route-plans`

创建空方案，允许客户端携带符合 UUID 格式的既有本地 ID。相同工作区内相同 ID 的重复创建必须幂等。

### 7.3 路线快照

#### `GET /api/route-plans/:id`

返回完整 `RoutePlan` 和当前 `revision`。查询必须同时匹配 `id`、Cookie 中的 `workspace_id` 和 `deleted_at IS NULL`。

#### `PUT /api/route-plans/:id`

以完整聚合快照保存名称、策略和控制点：

```json
{
  "baseRevision": 3,
  "schemaVersion": 1,
  "name": "川西环线",
  "strategy": "recommend",
  "controlPoints": []
}
```

服务端在一个事务中完成：

1. 校验工作区、方案状态和 `baseRevision`。
2. 更新路线字段并将 `revision + 1`。
3. 替换该方案的控制点集合。
4. 返回新的 `revision` 和 `updatedAt`。

若数据库中的 revision 已变化，返回 `409 Conflict`，不得执行部分更新。

#### `DELETE /api/route-plans/:id`

首版使用软删除并校验 `baseRevision`。删除活动方案后，客户端回到未选择方案状态，不自动加载其他方案。

#### `DELETE /api/route-plans`

批量软删除当前工作区全部活动路线。接口必须显式携带确认意图，客户端继续复用既有“清除全部路线”确认流程。

### 7.4 本地路线导入

#### `POST /api/route-plans/import-local`

- 一次最多导入合理数量的本地路线，服务端同时限制总请求体大小。
- 复用本地路线和控制点 UUID。
- 相同工作区和路线 ID 的重复请求执行幂等 upsert。
- 不以名称作为去重依据。
- 已存在且 revision 大于导入版本的路线不得被旧本地快照覆盖。
- 返回逐条结果：`created / unchanged / conflict / invalid`。

客户端只有在用户明确确认后才调用导入接口。导入失败不得清除本地数据。

## 8. 并发与一致性

虽然首版只有个人用户，仍需处理多标签页、页面恢复和重复请求造成的并发：

- 每个方案维护单调递增的 `revision`。
- 客户端保存时必须提交加载时获得的 `baseRevision`。
- 服务端更新条件必须包含 `workspace_id + route_plan_id + revision`。
- 条件更新为 `0` 行时返回 `409`。
- 客户端收到 `409` 后停止自动重试，提示“该路线已在其他页面更新”。
- 用户可以重新加载数据库版本；首版不自动合并两个快照。
- 创建和本地导入使用稳定 UUID 保证幂等。

本次不引入编辑租约、在线状态或 WebSocket。

## 9. 客户端状态与交互

### 9.1 未授权状态

- 未授权时展示等尺寸、稳定布局的 `WorkspaceAccessGate`。
- 不加载地图 SDK、路线目录或完整工作台，避免无效首屏资源请求。
- 输入错误时保留输入区域尺寸，使用行内错误，不造成布局跳动。
- 访问成功后进入既有地图工作台。

### 9.2 路线启动规则

- 登录后的首次工作台加载只获取路线摘要目录。
- 不自动选择数据库中最近更新的路线。
- 不自动读取完整控制点。
- 不自动请求驾车路线、海拔或天气。
- 用户点击方案后才加载完整快照并执行既有路线恢复流程。

### 9.3 保存状态

既有 `idle / saving / saved / failed` 暂存状态继续使用，但用户文案调整为数据库语义：

```text
正在保存
已保存
保存失败，请重试
路线已在其他页面更新
```

不得继续显示“已暂存至本机”作为数据库成功状态。

### 9.4 本地数据升级提示

- 只在检测到有效本地目录且数据库目录为空或存在未导入 ID 时展示导入提示。
- 提示包含路线数量，不在启动时读取并渲染全部路线到地图。
- 用户可以暂时跳过，之后从路线管理菜单再次发起导入。
- 导入成功后保留本地副本，后续独立迭代再决定清理策略。

## 10. 环境变量

```text
DATABASE_URL=<运行时连接池地址>
DIRECT_URL=<迁移使用的直连地址>
ROADBOOK_WORKSPACE_ID=<固定 UUID>
ROADBOOK_ACCESS_CODE_HASH=<访问码哈希>
ROADBOOK_SESSION_SECRET=<至少 32 字节随机密钥>
ROADBOOK_SESSION_VERSION=1
ROADBOOK_SESSION_TTL_DAYS=90
```

要求：

- 生产、预览和本地开发使用不同数据库和秘密值。
- Preview 部署不得默认连接生产数据库。
- `DATABASE_URL` 使用适合 Serverless 的池化连接。
- `DIRECT_URL` 只供 Prisma Migrate 和受控管理操作使用。
- 所有秘密变量都不得使用 `NEXT_PUBLIC_` 前缀。
- Turborepo 构建环境声明只包含确实影响构建输出的变量，运行时秘密不得无必要进入构建缓存键。

## 11. 安全要求

- 所有修改接口校验 `Origin`，只接受当前站点来源。
- Cookie 使用 `HttpOnly`、生产环境 `Secure` 和 `SameSite=Lax`。
- 每次数据库查询都由服务端注入 `workspace_id`，不信任客户端归属字段。
- API 对名称、地址、数组长度、坐标范围、UUID、策略和 schema version 做服务端校验。
- 控制点上限继续为 `20`。
- 访问码、数据库连接串、Cookie、签名载荷和原始异常不得写入日志。
- API 错误响应不得包含 Prisma 错误、SQL、表名、连接信息或堆栈。
- 修改访问码时同步提升 `ROADBOOK_SESSION_VERSION`，使旧 Cookie 全部失效。
- 提供退出入口；退出只删除会话 Cookie，不删除路线数据。

首版不使用 Redis 记录失败次数。访问码必须使用高熵随机值，使在线猜测不可行；若未来开放给非固定用户，再增加平台防火墙、速率限制和审计记录。

## 12. 数据库迁移与发布顺序

### 12.1 实施顺序

1. 在 Prisma schema 中增加 `Workspace`、`RoutePlan` 和 `RoutePlanControlPoint`。
2. 生成并人工审查增量 migration，不修改现有小程序业务表。
3. 增加工作区初始化脚本或受控种子步骤。
4. 实现 Cookie 签名、验证、续期和版本失效。
5. 实现服务端 PostgreSQL 仓储和应用服务。
6. 实现 Route Handlers 及输入校验。
7. 抽取异步 `RoutePlanRepository` 领域接口并实现 HTTP 仓储。
8. 改造 `useRoutePlanningWorkspace`，保持既有路线业务规则不变。
9. 实现本地路线导入和失败保留。
10. 同步更新产品基线、`AI.md`、组件规范及相关迭代文档。
11. 在独立预发布数据库执行迁移、导入和恢复验证。
12. 完成生产迁移后再切换 Web 仓储实现。

### 12.2 发布门禁

- Migration 必须通过 `prisma migrate deploy` 执行，不在应用启动时自动迁移。
- 发布前检查 migration 不包含删除旧表、清空数据或不可逆字段变更。
- 先部署兼容新表但仍可使用本地仓储的版本，再启用数据库仓储。
- 首次切换期间不删除任何本地路线。
- 数据库仓储不可用时允许回退到上一部署，不执行自动逆向 migration。

## 13. 性能与 LCP/CLS

- Cookie 验证只执行本地签名检查，不为每次页面访问增加数据库会话查询。
- 认证成功后才加载地图 SDK，未授权访问不消耗地图额度。
- 路线目录接口只返回摘要，不返回控制点和折线。
- 完整快照只在用户主动选择方案后请求。
- 单个方案最多 `20` 个控制点，保存使用一次短事务。
- 自动保存继续防抖，不为拖拽中的每一帧写数据库。
- 访问入口、目录加载态和保存反馈预留稳定尺寸，目标 CLS 为 `0`。
- 数据库请求不得阻塞地图容器的固定尺寸呈现。
- 首屏不引入 Redis、WebSocket、COS SDK 或新的重型客户端依赖。

## 14. 错误与降级

| 场景 | 行为 |
| --- | --- |
| Cookie 缺失、过期或版本失效 | 返回访问入口，不泄露数据库内容 |
| 访问码错误 | 显示通用错误，允许重新输入 |
| 数据库暂时不可用 | 保留当前内存路线，标记未保存并提供重试 |
| 路线目录加载失败 | 保留地图基础能力，显示目录重试入口 |
| 单条路线损坏或 schema 不支持 | 标记该方案不可加载，不影响其他方案 |
| revision 冲突 | 停止自动重试，要求重新加载数据库版本 |
| 本地导入部分失败 | 展示逐条结果，保留全部本地数据 |
| 路线计算失败 | 与数据库保存状态隔离，不回滚控制点持久化 |

数据库保存成功不代表路线计算成功；路线计算失败也不得删除已经保存的控制点。

## 15. 验证计划

### 15.1 单元测试

- 访问码哈希校验和恒定时间比较。
- Cookie 正常验证、篡改失败、到期失败和版本失效。
- 剩余不足 `15` 天时滚动续期。
- 路线 DTO 到领域模型及数据库模型的双向转换。
- 名称、地址、坐标、控制点上限和 schema version 校验。
- 路线摘要生成规则与当前本地仓储一致。

### 15.2 数据库集成测试

- 空数据库迁移和已有数据库增量迁移。
- 工作区隔离条件不会遗漏。
- 创建、读取、更新、软删除和批量清除。
- 控制点顺序唯一约束与级联行为。
- revision 成功递增及旧 revision 返回 `409`。
- 完整快照事务失败时不产生半条路线或部分控制点。
- 本地路线重复导入保持幂等。

### 15.3 浏览器验收

- 未授权时不加载地图和路线数据。
- 输入正确访问码后进入工作台，刷新后无需重复输入。
- 删除 Cookie 或到期后重新显示访问入口。
- 数据写入后清理浏览器站点数据，在重新验证后仍能恢复路线目录。
- 在第二个浏览器输入相同访问码，可以读取同一批路线。
- 启动后仍不自动打开最近路线。
- 加载、编辑、重命名、删除和批量清除行为与现有产品一致。
- 两个标签页对同一路线基于旧 revision 保存时，后者收到冲突提示且不会覆盖。
- 本地路线导入成功、重复导入和部分失败行为正确。
- 保存中、成功、失败和冲突状态不造成地图布局偏移。

## 16. 验收标准

1. 个人用户通过一个访问码进入唯一私人工作区。
2. Cookie 默认有效 `90` 天，支持滚动续期、主动退出和版本失效。
3. 路线目录、名称、策略、控制点及顺序持久化到 PostgreSQL。
4. 清理浏览器数据后，重新输入访问码可以恢复数据库路线。
5. 换浏览器或换设备后，可以通过相同访问码访问同一工作区。
6. 启动只加载轻量目录，不自动加载完整路线或触发地图计算。
7. 既有本地路线可以经用户确认后幂等导入，失败时不删除本地副本。
8. 多标签页旧版本保存不会覆盖数据库新版本。
9. 功能不依赖 NestJS、Redis、COS 或 WebSocket。
10. 未授权请求无法读取、修改或推断私人路线数据。
11. 路线持久化不造成 LCP 回退，异步状态不引入 CLS。

## 17. 已知边界与后续演进

- 单一访问码不能区分真实使用者，适用于当前个人验证阶段，不适合多人协作。
- Cookie 只证明持有私人访问凭证，不提供账户恢复能力；访问码和签名密钥需由部署者安全保管。
- 首版没有离线写入队列，弱网下编辑可能暂时无法保存到数据库。
- 首版没有用户可见版本历史；软删除只用于运行安全和人工恢复，不承诺产品级回收站。
- 若未来需要多人协作，应独立设计用户身份、成员权限、实时通道、操作模型、冲突合并和审计，不在本方案上追加临时 WebSocket 补丁。
- 若未来需要公开分享，应增加不可猜测的分享标识、固定 revision、撤销和访问边界，不直接复用私人工作区 Cookie。
- 若未来需要图片上传，再独立评估对象存储；数据库不保存图片二进制。

## 18. 文档同步要求

本方案真正实现时，必须同步修订以下文档，不能只修改代码：

- `apps/roadbook-web/AI.md` 中的产品边界、启动规则、仓储路径和环境变量。
- MVP 产品基线中“无账户、无云端同步和跨设备恢复”的现行描述。
- 组件规范中的仓储接口、异步状态和 `localStorage` 边界。
- “已暂存路线一键清除”等涉及本地删除范围的迭代文档。
- 部署说明和环境变量示例。

在上述实现和文档同步完成前，本文件不得被引用为已经上线的产品行为。
