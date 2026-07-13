# 55camp 采集脚本(scripts/camp-import)设计

日期:2026-07-14
状态:已批准
上游文档:`docs/55camp-data-collection-plan.md`(本设计吸收其评审结论并修正矛盾项)

## 目标

用 TDD 实现 55camp 历史营地数据采集脚本。阶段一**不发起任何真实 HTTP 请求**:五个模块全部离线实现并通过测试,真实请求能力藏在默认关闭的 `--live` 开关后,待授权探针阶段单独启用。

## 决策记录

| 决策点 | 结论 |
| --- | --- |
| 实现语言 | Python 3.12 + pytest |
| 工具链 | uv(`scripts/camp-import/pyproject.toml`,命令统一 `uv run pytest`) |
| 细分策略 | 条件触发(达返回上限 / 截断信号 / 持续新增)+ 空格子按比例抽样细分(默认 5%,可配)做假阴性校验;废除上游文档"无条件细分到底"条目 |
| 坐标系 | `field_mapping.yaml` 增加必填项 `coordinate_system`;`camps_enriched.csv` 增加同名列;阶段一不做坐标转换 |
| 任务状态存储 | CSV(与上游文档一致),所有写入走 tmp 文件 + 原子 rename;评估过 SQLite,单进程、每省数千行量级下不值得引入第二种存储 |
| 阶段一范围 | common / probe / discover / fetch_detail / normalize 全部离线实现 |

## 目录结构

```
scripts/camp-import/
├── pyproject.toml
├── README.md
├── src/camp_import/
│   ├── __init__.py
│   ├── common.py        # Transport 协议、令牌桶限流、退避重试、JSONL/CSV 原子读写
│   ├── field_mapping.py # field_mapping.yaml 契约加载与校验(必填项为空拒绝启动)
│   ├── tiles.py         # 视口换算、网格生成、四叉树细分、面积计算(纯函数)
│   ├── probe.py         # 探针请求构造 + 响应分析 + probe_report.md 生成
│   ├── discover.py      # tile 调度引擎:状态机、去重、条件细分 + 空格抽样
│   ├── fetch_detail.py  # 详情任务引擎(detail_tasks.csv)
│   ├── normalize.py     # camps_dedup.csv、详情合并、camps_enriched.csv
│   └── cli.py           # 子命令入口;--live 默认关闭
└── tests/
```

## 核心抽象

### Transport 协议

所有出站请求经 `Transport.send(request: ApiRequest) -> ApiResponse` 接口:

- `FakeTransport`:测试与阶段一默认实现,按脚本返回罐头响应,可注入错误/限流/截断场景。
- `LiveTransport`:httpx 实现,复用上游文档的 `REQUEST_HEADERS` 与单一会话。**仅当 CLI 显式传 `--live` 时才被构造**;否则 CLI 拒绝并提示。实现保持极薄,不承载业务逻辑。

限流与重试作为装饰层包在 Transport 外:

- 令牌桶:全局共享,`qps_limit`/`burst`/`concurrency` 来自 `field_mapping.yaml`;时钟可注入。
- 重试:网络错误、5xx、限流响应最多 5 次,退避 1/2/4/8/16 秒;`Retry-After` 与 30 秒取小;sleep 可注入,测试瞬间完成。

### field_mapping 契约

`field_mapping.yaml` 是探针产出、后续脚本的输入契约。必填项(含新增的 `coordinate_system`)为空时 `discover`/`fetch_detail`/`normalize` 必须拒绝启动。测试以该契约的 fixture 定义假响应形状,契约先行。

### 状态文件

- `processed/query_tiles.csv`:tile 状态机 `pending → running → done/retry/failed`;启动时将 `running` 且超过 10 分钟的 tile 重置为 `retry`。
- `processed/detail_tasks.csv`:详情任务,字段 `external_id,lng,lat,status,attempts,last_error,started_at,updated_at`,与 tile 状态分离。
- 所有 CSV 重写与 JSONL 追加均通过 common 层完成;CSV 重写必须 tmp + 原子 rename。

## 数据流

```
probe(--live,另批)→ field_mapping.yaml + probe_report.md
discover:读契约 → 生成/恢复 query_tiles.csv → 逐 tile 请求(限流+重试)
  → 追加 raw/camps.jsonl → external_id 去重 → 条件细分/空格抽样 → 更新 tile 状态
fetch_detail:读去重 ID → detail_tasks.csv 调度 → 追加 raw/details.jsonl
normalize:raw JSONL → camps_dedup.csv → 合并详情 → camps_enriched.csv(含 raw_hash、coordinate_system)
```

## 细分规则(修正版)

1. 触发细分:`discovered_count >= response_item_limit × dense_ratio`、出现截断信号、或细分后仍持续新增 ID。
2. 剪枝:沿 `parent_tile_id` 血缘"连续两级无新增"即停止,不再强制细分到底。
3. 假阴性校验:对已剪枝的空格子按 `empty_sample_ratio`(默认 0.05)抽样强制细分一层,若抽样发现新增 ID 则该区域回退为正常细分。
4. 边界:tile 面积小于 `min_tile_area_m2` 或达到 `max_depth` 时无条件停止。

## 错误处理

- 请求失败按重试策略执行,超限后 tile/详情任务标记 `failed` 并保留 `last_error`。
- 任何未知响应结构(契约路径取不到值)立即中止当前任务并报错,不猜测字段。
- 中断恢复:重启后从 CSV 状态续跑,`done` 不重复请求。

## 测试策略(TDD)

先写失败测试再实现,覆盖:

- tiles:视口换算、网格步长 `viewport × (1 - overlap_ratio)`、四叉树切分、面积阈值;
- 状态机:全部状态流转、stale running 重置、断点恢复、原子写崩溃安全(写入中断不留半成品);
- 限流/重试:令牌桶节奏、退避序列、Retry-After 取小(注入时钟);
- field_mapping:必填缺失拒启、`coordinate_system` 必填;
- discover:条件细分触发、两级无新增剪枝、空格抽样、去重;
- fetch_detail:任务调度、失败重试、幂等(已成功不重发);
- normalize:去重、详情合并、raw_hash 稳定性、重跑幂等;
- cli:无 `--live` 时拒绝构造 LiveTransport。

## 阶段边界

- 本阶段产物只落 `data/55camp/`(本地文件),不写 PostgreSQL、不导入 `POI`。
- `data/` 加入 `.gitignore`(`probe/` 报告与 `field_mapping.yaml` 按上游流程单独审核入库)。
- 实施中同步修订 `docs/55camp-data-collection-plan.md`:细分矛盾条目、`coordinate_system`、`detail_tasks.csv` 目录树。
