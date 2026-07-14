# 55camp 历史营地数据采集方案

## 目标与边界

从已授权的旧仓库接口采集营地列表与详情，构建可复现、可断点续跑的数据集。

本阶段只生成本地文件，**不写入 PostgreSQL，也不导入 `POI`**。数据审核、字段映射和导入策略由后续阶段单独确认。

已知接口：

```text
GET https://55camp.cn/api/index/getCamps
GET https://55camp.cn/api/index/getCampDetail
```

`getCamps` 使用地图中心、上一次中心和 `scale` 查询当前地图视口内的营地；`getCampDetail` 按旧系统营地 ID 补全详情。

## 请求客户端画像与授权边界

本采集任务仅用于公司已授权的旧仓库数据迁移。脚本复用旧小程序已验证的请求头；不得绕过登录、签名、访问控制或服务端限流。若接口探针发现需要额外凭据、签名、nonce 或时间戳，任务暂停并由业务负责人提供合法的调用方式。

所有探针、列表和详情请求复用同一 HTTP 会话与以下请求头：

```python
REQUEST_HEADERS = {
    "Host": "55camp.cn",
    "xweb_xhr": "1",
    "user-agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 "
        "Safari/537.36 MicroMessenger/6.8.0(0x16080000) NetType/WIFI "
        "MiniProgramEnv/Mac MacWechat/WMPF MacWechat/3.8.10(0x13080a10) XWEB/1227"
    ),
    "content-type": "application/x-www-form-urlencoded",
    "accept": "*/*",
    "sec-fetch-site": "cross-site",
    "sec-fetch-mode": "cors",
    "sec-fetch-dest": "empty",
    "referer": "https://servicewechat.com/wx9d4fe7e224c821cc/19/page-frame.html",
    "accept-language": "zh-CN,zh;q=0.9",
}
```

`Host` 可由 HTTP 客户端根据目标 URL 自动设置；`--compressed` 由客户端自动处理 gzip/deflate/br 响应。

## 输出目录

```text
data/55camp/
├── config/
│   └── provinces.csv
└── <province_code>/
    ├── raw/
    │   ├── camps.jsonl
    │   └── details.jsonl
    ├── probe/
    │   ├── probe_report.md
    │   └── field_mapping.yaml
    └── processed/
        ├── camps_dedup.csv
        ├── camps_enriched.csv
        ├── detail_tasks.csv
        └── query_tiles.csv
```

### 原始数据

- `raw/camps.jsonl`：每个地图视口请求的原始响应。每行保留请求参数、抓取时间、HTTP 状态和响应 JSON。
- `raw/details.jsonl`：每个 `getCampDetail` 请求的原始响应。每行保留 `external_id`、请求坐标、抓取时间和响应 JSON。
- 原始响应永不以 CSV 作为唯一存档，避免嵌套字段或未知字段丢失。

### 处理结果

- `processed/query_tiles.csv`：查询网格的任务状态，用于断点续跑和覆盖率分析。
- `processed/camps_dedup.csv`：按旧系统营地 ID 去重的列表数据。
- `processed/camps_enriched.csv`：合并详情、清洗坐标、标记行政区归属后的扁平数据集。

不生成 Excel 文件。

## 多省任务编排

近期只运行四川时，`config/provinces.csv` 仅保留一行；未来扩展时，它是唯一的省份任务清单，不从营地结果或行政编码前缀推断省份。

```text
province_code,enabled,collection_mode,seed_scale,max_depth,min_tile_area_m2
510000,true,center_seed,11,8,250000
```

- `province_code` 来自已同步并审核过的一级 `AdministrativeDivision.code`；新增省份前，先同步并核验该省行政区数据，再人工加入清单。
- 一个省份是一个独立采集任务根，产物路径按 `data/55camp/<province_code>/` 隔离；每省的 tile、详情任务和原始 JSONL 都不可混写。
- 批量任务按 `provinces.csv` 的顺序串行调度。所有省份共用一个全局 QPS 令牌桶，不因多省并行而提高对旧接口的请求压力。
- 失败只阻塞当前省份任务；后续省份可继续执行。最终汇总阶段再按 `(source, external_id)` 做跨省去重，并保留首次发现省份与全部发现省份。

## 行政区的作用

`AdministrativeDivision` 当前只有行政区中心点，适合用作首轮探测种子；它不是行政区边界，不能单独保证区域覆盖完整。

采集范围以 `province_code` 作为配置参数。例如四川省为 `510000`。区县中心点用于生成初始查询点、分析查询覆盖和后续归属校验。

若要声称全量覆盖，必须另行准备省级行政区的 bbox 或多边形边界。仅依赖中心点的策略只能称为高覆盖率采集。

## 采集算法

### 1. 接口探针

先对少量已知区域发起探针请求，记录：

- `getCamps` 返回字段、营地 ID、坐标字段和单次返回数量；
- `lnt`、`lat`、`oldlnt`、`oldlat` 与 `scale` 对结果范围的影响；
- 是否存在分页、返回上限或截断标记；
- 重复请求、相邻视口和不同 `scale` 的 ID 差异。

在接口语义明确前，不启动全省采集。

探针必须产出并提交 `data/55camp/<province_code>/probe/field_mapping.yaml`，作为后续脚本的输入契约，至少包含：

```yaml
list_items_path: ""          # 列表数组路径；后续 list_* 路径相对单个 item
list_external_id_path: ""
list_lat_path: ""
list_lng_path: ""
detail_external_id_path: ""
list_lng_param: ""
list_lat_param: ""
list_old_lng_param: ""
list_old_lat_param: ""
list_scale_param: ""
detail_id_param: ""
detail_lng_param: ""
detail_lat_param: ""
response_item_limit: null
truncation_signal_path: null
coordinate_system: ""        # 例如 gcj02/wgs84；阶段一不做转换
scale_viewport:
  "11": { width_m: null, height_m: null }
overlap_ratio_by_scale:
  "11": null
qps_limit: null
required_auth: []
required_signature: null
```

`probe_report.md` 记录每项结论的样本请求、样本响应摘要和结论依据。`discover.py` 在必填项为空时必须拒绝启动，不能以猜测的字段名、上限或视口尺寸运行。

### 1.1 频率与视口校准

频率和任务周期分开决策：QPS 用于保护旧接口，采集周期取决于营地数据的变化速度。

QPS 探针是小样本校准，不是压力测试。每省选择 6–8 个代表性 tile（城市密集、山区稀疏、边界区域），保持串行，依次测试 `0.5 → 1 → 2 → 3 → 4 QPS`；每档最多 10 次请求。记录成功数、4xx/5xx、平均与 P95 延迟、响应内容异常和限流提示。

任一档出现以下任一条件立即停止该省份后续更高频率测试，并将上一档作为候选上限：连续 2 次失败、错误率达到 5%、P95 延迟达到基线的 2 倍，或出现明确限流响应。探针最大量级为 `8 × 5 × 10 = 400` 次，且可在异常时显著提前结束。

生产 `qps_limit` 不采用“刚好不报错”的最高值，而采用稳定上限的约 70%，并设置：

```yaml
qps_limit: 2.5  # 示例；必须由 probe 结果替换
burst: 1
concurrency: 1
```

同一批 probe 同时对相同中心点测试多个 `scale`，并使用相邻中心点的重叠请求确认：

- `scale` 到视口宽高的换算；
- 单次结果数量与固定返回上限；
- 相邻 tile 的重复 ID 比例和边界漏失情况。

若某个 scale 多次稳定达到同一返回数量，例如 100 条，将其作为 `response_item_limit`；`dense_ratio` 默认为该上限的 0.8。重叠比例由边界漏失测试结果写入 `overlap_ratio_by_scale`，不得写死为全局常量。

### 1.2 采集周期

当前目标是一次性历史数据迁移，默认流程为：

```text
完整基线采集一次 → 只修复 retry/failed/覆盖不足 tile → 抽样复核
```

基线完成后，周期性复查默认**关闭**。启用前必须先探查旧系统是否具备合法可用的增量能力，例如 `updated_at`、变更游标、增量列表接口或业务方提供的变更清单。

只有确认增量能力、获得业务负责人批准并明确每省复查范围后，才可配置周/月级增量任务；全省全量复查不设自动季度任务。若不存在可靠增量能力，则仅在新的、单独批准的数据迁移或人工核验任务中执行，不将一次性迁移演变为常态化网格扫描。

### 2. 初始网格

当前默认策略是**中心点种子采集**：目标省份每个区县中心点创建一个初始 tile，tile 的视口尺寸使用 `field_mapping.yaml` 中该 `scale` 的实测值。此策略只追求高覆盖率，不声称全量。

中心点模式必须先验证 `seed_scale`：探针对典型的大区县、山区县和城市区县，比较该 scale 的实测视口范围与区县已知范围/抽样边界点；若种子视口无法覆盖典型区县，应调小 scale（扩大视口）后重新校准。未完成此验证时，不得宣称“高覆盖率”。

中心点模式还必须启用**边缘扩展**。若列表响应中营地坐标落在 tile 视口任一边缘的 `edge_margin_ratio` 范围内，按该边缘方向创建相邻 tile；角落命中可创建对角 tile。相邻 tile 继承相同 scale 和 `parent_tile_id`，随后进入同一去重、限流和细分流程。以下参数必须写入 `field_mapping.yaml`：

```yaml
seed_scale: null
edge_margin_ratio: null
edge_expansion_max_hops: null
```

有省级 bbox/边界时，边缘扩展只保留与边界相交的 tile；没有边界时，必须以 `edge_expansion_max_hops` 限制每个中心种子的外扩层数，防止无限向外扫描。无边界的中心点模式只能描述为“种子加边缘扩展采集”，不能对覆盖率做量化承诺。

获得省级 bbox/边界后，切换为**边界覆盖采集**：按实测视口宽高平铺目标边界，只保留与边界相交的 tile；这是声明全量覆盖的前置条件。

重叠不固定为 15%。每个 `scale` 的重叠比例由探针写入 `overlap_ratio_by_scale`，格点步长为 `viewport_size × (1 - overlap_ratio)`。每个格子写入 `query_tiles.csv`：

```text
province_code,tile_id,parent_tile_id,center_lng,center_lat,old_lng,old_lat,
min_lng,min_lat,max_lng,max_lat,scale,depth,status,attempts,
discovered_count,new_id_count,last_error,started_at,updated_at
```

### 3. 去重与自适应细分

- 以旧系统的营地 ID（`external_id`）为全局唯一键去重。
- 发现营地的格子记录新增 ID 数量。
- 当 `discovered_count >= response_item_limit × dense_ratio`、接口出现 `truncation_signal_path` 指示的截断，或细分后仍持续发现新增 ID 时，拆分为四个子格子。`response_item_limit` 与 `dense_ratio` 必须来自探针配置；未确认时不允许启用自适应细分。
- `parent_tile_id` 保存父子血缘；“连续两级无新增”沿该链路计算。
- 细分为条件触发：达到 `response_item_limit × dense_ratio`、出现截断信号或细分后仍持续发现新增 ID。沿 `parent_tile_id` 血缘连续两级无新增即剪枝停止；tile 面积小于 `min_tile_area_m2` 或达到 `max_depth` 时无条件停止。对已剪枝的空格子按 `empty_sample_ratio`（默认 0.05）抽样强制细分一层做假阴性校验。
- 不依赖一次请求的结果数量来直接判断“已捞全”；必须结合相邻格、重叠区和细分后的新增 ID 判断。

### 4. 限流、重试与断点续跑

- 默认串行执行；多省任务共享同一个全局 QPS 预算，实际值由 `field_mapping.yaml` 的 `qps_limit` 决定。
- 网络错误、5xx 和限流响应最多重试 5 次，退避间隔为 1、2、4、8、16 秒，单次等待不超过 30 秒；若服务端提供 `Retry-After`，取其值与 30 秒中的较小值。
- `query_tiles.csv` 的 `status` 标记为 `pending`、`running`、`done`、`retry` 或 `failed`。
- 启动时将 `running` 且 `started_at` 超过 10 分钟的 tile 重置为 `retry`；随后继续 `pending`/`retry` 格子。已完成格子不重复请求。
- 原始 JSONL 采用追加写入；每条记录带请求参数和时间，便于审计与重新处理。

### 5. 详情补齐

列表采集稳定后，对去重后的 `external_id` 请求 `getCampDetail`。

- 已成功获取详情的 ID 不再重复请求；
- 详情请求使用列表记录的坐标作为接口所需位置参数；
- 详情任务单独记录在 `processed/detail_tasks.csv`，字段为 `external_id,lng,lat,status,attempts,last_error,started_at,updated_at`；不得与 tile 状态混用；
- 详情失败保留原始错误并按同一重试上限进入 `detail_tasks.csv` 的 `retry` 状态；
- 详情与列表记录以 `external_id` 合并。

## CSV 数据约定

`camps_enriched.csv` 至少包含：

```text
external_id,name,lat,lng,address,province_code,city_code,district_code,
source,coordinate_system,detail_fetched_at,raw_hash
```

- `source` 固定为 `55camp`；
- `external_id` 为旧系统营地 ID；
- 行政区字段可在后处理阶段通过坐标匹配或逆地址解析补齐；
- `raw_hash` 指向对应原始 JSON 的内容摘要，用于发现源数据变化。

字段映射以实际接口探针结果为准，不在未查看响应结构前猜测名称或业务含义。

## 后续实施拆分

建议在 `scripts/camp-import/` 下实现：

```text
scripts/camp-import/
├── README.md
├── probe.py
├── discover.py
├── fetch_detail.py
├── normalize.py
└── common.py
```

1. `probe.py`：验证接口响应、视口语义、单次上限与限流。
2. `discover.py`：执行网格发现、四叉树细分和 JSONL/任务 CSV 写入。
3. `fetch_detail.py`：补齐已发现营地的详情。
4. `normalize.py`：去重、字段清洗、详情合并和 CSV 生成。
5. `common.py`：HTTP 会话、限流、重试、JSONL/CSV 读写与日志。

仅在 `camps_enriched.csv` 的质量、字段映射和覆盖策略均审查完成后，才讨论导入 `POI` 的迁移与脚本。
