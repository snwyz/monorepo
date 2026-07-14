# camp-import

55camp 历史营地数据采集脚本。默认仅运行离线处理；真实请求只有在获得授权后显式传入全局 `--live` 才会构造 HTTP 客户端。

```bash
cd scripts/camp-import
uv run pytest
uv run camp-import normalize --province-code 510000
```

`discover` 与 `fetch-detail` 需要已审核的
`data/55camp/<province_code>/probe/field_mapping.yaml`。契约包含响应路径、请求参数名、坐标系、视口、限流和边缘扩展设置；任一必填项为空或非法都会拒绝执行。

探针是独立授权操作；必须显式提供 `--live`、QPS、列表响应路径以及所有请求参数名。例如：

```bash
uv run camp-import --live probe --province-code 510000 \
  --center-lng 104.0 --center-lat 30.6 --qps 0.5 \
  --items-path data.list --external-id-path id \
  --lat-path latitude --lng-path longitude \
  --list-lng-param lnt --list-lat-param lat \
  --list-old-lng-param oldlnt --list-old-lat-param oldlat \
  --list-scale-param scale --detail-id-param id \
  --detail-lng-param lnt --detail-lat-param lat
```

仅在业务授权、探针报告审核、`field_mapping.yaml` 补全后，才可运行 discover 或 fetch-detail。

产物位于 `data/55camp/<province_code>/`：原始 JSONL、tile/详情状态 CSV、去重 CSV 和 enriched CSV。阶段一不做坐标转换、不写 PostgreSQL，也不导入 POI。
