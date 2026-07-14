# 55camp 采集脚本(scripts/camp-import)实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 TDD 离线实现 55camp 采集脚本五个模块(common / probe / discover / fetch_detail / normalize)+ CLI;真实请求能力藏在默认关闭的 `--live` 开关后。

**Architecture:** 所有出站请求经 `Transport.send(ApiRequest) -> ApiResponse` 协议;`FakeTransport` 驱动全部测试,`LiveTransport`(httpx)仅当 CLI 显式传 `--live` 时构造。限流(令牌桶)与重试(退避)作为装饰层包在 Transport 外,时钟/sleep 可注入。`field_mapping.yaml` 是输入契约,必填项为空拒绝启动。tile 状态机与详情任务分别落 `query_tiles.csv` / `detail_tasks.csv`,全部 CSV 重写走 tmp 文件 + 原子 rename。

**Tech Stack:** Python 3.12、uv、pytest、PyYAML、httpx(仅 LiveTransport 用)。

**Spec:** `docs/superpowers/specs/2026-07-14-camp-import-design.md`(上游:`docs/superpowers/specs/55camp-data-collection-plan.md`)

## Global Constraints

- 实现语言 Python 3.12;工具链 uv;项目根 `scripts/camp-import/`;测试命令统一 `uv run pytest`(在 `scripts/camp-import/` 下执行)。
- **阶段一不发起任何真实 HTTP 请求**:所有测试离线;`LiveTransport` 仅当 CLI 显式传 `--live` 时才被构造,否则 CLI 拒绝并提示。
- 重试:网络错误、5xx、限流(429)最多重试 5 次,退避 1/2/4/8/16 秒;`Retry-After` 与 30 秒取小;sleep/时钟可注入。
- 所有 CSV 重写必须 tmp 文件 + 原子 rename(`os.replace`);JSONL 只追加。
- `field_mapping.yaml` 必填项（含 `coordinate_system`、列表/详情请求参数名、边缘扩展参数）为空或取值非法时，discover/fetch_detail/normalize 拒绝启动。
- 任一**已配置**的响应路径取不到值、类型不符，立即抛 `ContractViolation`，不猜测字段；仅当可选路径未配置（`null`）时才跳过该字段。
- 细分默认值:`dense_ratio` 0.8、`empty_sample_ratio` 0.05;剪枝规则"连续两级无新增";stale running 重置阈值 600 秒。
- 产物只落 `data/55camp/`,不写 PostgreSQL、不导入 POI;`data/` 加入根 `.gitignore`。
- `camps_enriched.csv` 的 `source` 固定为 `55camp`;含 `coordinate_system`、`raw_hash` 列;阶段一不做坐标转换。
- git:在 `feat/camp-import` 分支工作,conventional commits,每个任务收尾提交;git 命令在仓库根 `/Users/code.yang/Desktop/roadbook-monorepo` 执行,pytest 命令在 `scripts/camp-import/` 执行。

## 文件结构(全量)

```
scripts/camp-import/
├── pyproject.toml               # Task 1
├── README.md                    # Task 14
├── src/camp_import/
│   ├── __init__.py              # Task 1
│   ├── common.py                # Task 2-5(I/O、Transport、限流、重试),Task 13 加 LiveTransport
│   ├── field_mapping.py         # Task 6(契约加载/校验、extract_path)
│   ├── tiles.py                 # Task 7(纯几何函数)
│   ├── discover.py              # Task 8(TileStore 状态机)+ Task 9(DiscoverEngine)
│   ├── fetch_detail.py          # Task 10(DetailStore + DetailEngine)
│   ├── normalize.py             # Task 11(去重、合并、enriched)
│   ├── probe.py                 # Task 12(探针计划、分析、报告)
│   └── cli.py                   # Task 13(子命令 + --live 门禁)
└── tests/
    ├── conftest.py              # 逐任务增量补 fixture
    ├── test_common_io.py        # Task 2
    ├── test_transport.py        # Task 3
    ├── test_token_bucket.py     # Task 4
    ├── test_retry.py            # Task 5
    ├── test_field_mapping.py    # Task 6
    ├── test_tiles.py            # Task 7
    ├── test_tile_store.py       # Task 8
    ├── test_discover_engine.py  # Task 9
    ├── test_fetch_detail.py     # Task 10
    ├── test_normalize.py        # Task 11
    ├── test_probe.py            # Task 12
    └── test_cli.py              # Task 13
```

契约新增说明（实现所需，写入 README 与上游文档修订）：除 spec 决策的 `coordinate_system` 外，契约还需必填 `list_items_path`（列表响应中营地数组的路径）；`list_external_id_path`/`list_lat_path`/`list_lng_path` 均为**相对单个 item** 的路径。列表与详情请求的参数名也必须由探针确认并写入契约，禁止在引擎中硬编码。`detail_name_path`/`detail_address_path` 仅在配置为非空时提取；未配置时输出空列，已配置却取不到值必须中止。

---

### Task 1: 项目脚手架(uv + pyproject + 目录清理)

**Files:**
- Create: `scripts/camp-import/pyproject.toml`
- Create: `scripts/camp-import/src/camp_import/__init__.py`
- Create: `scripts/camp-import/tests/test_sanity.py`
- Modify: `.gitignore`(仓库根)
- Modify: `scripts/ README.md` → 重命名为 `scripts/README.md`(现有文件名带前导空格且为空文件)

**Interfaces:**
- Consumes: 无
- Produces: 可运行的 `uv run pytest` 环境;包名 `camp_import`,src 布局,后续所有任务以 `from camp_import.xxx import ...` 导入。

- [ ] **Step 1: 安装并验证 uv(机器当前未装 uv,系统 Python 是 3.9)**

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
# 安装后按提示确保 ~/.local/bin 在 PATH 中,然后:
uv --version
```

Expected: 输出 uv 版本号(0.5+ 均可)。uv 会在首次 `uv run` 时自动下载 Python 3.12,无需手工装。

- [ ] **Step 2: 清理 scripts/ 下的异常文件名**

`scripts/` 下现有一个文件名带**前导空格**的空文件 `" README.md"`(未跟踪)。重命名:

```bash
cd /Users/code.yang/Desktop/roadbook-monorepo
mv 'scripts/ README.md' scripts/README.md
```

- [ ] **Step 3: 根 .gitignore 加入 data/**

在 `/Users/code.yang/Desktop/roadbook-monorepo/.gitignore` 末尾追加一行:

```
data/
```

- [ ] **Step 4: 创建 pyproject.toml**

创建 `scripts/camp-import/pyproject.toml`:

```toml
[project]
name = "camp-import"
version = "0.1.0"
description = "55camp 历史营地数据采集脚本(阶段一:离线实现)"
requires-python = ">=3.12"
dependencies = [
    "httpx>=0.27",
    "pyyaml>=6.0",
]

[dependency-groups]
dev = [
    "pytest>=8.0",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/camp_import"]

[project.scripts]
camp-import = "camp_import.cli:main"

[tool.pytest.ini_options]
testpaths = ["tests"]
```

- [ ] **Step 5: 创建包骨架与冒烟测试**

创建 `scripts/camp-import/src/camp_import/__init__.py`:

```python
"""55camp 历史营地数据采集脚本。阶段一:全部离线实现,不发真实请求。"""
```

创建 `scripts/camp-import/tests/test_sanity.py`:

```python
import camp_import


def test_package_importable():
    assert camp_import.__doc__
```

- [ ] **Step 6: 运行测试验证环境**

```bash
cd /Users/code.yang/Desktop/roadbook-monorepo/scripts/camp-import
uv run pytest -v
```

Expected: `1 passed`(uv 首次运行会自动创建 .venv、装依赖;注意 `cli.py` 还不存在,`[project.scripts]` 只是入口声明,不影响安装)。

- [ ] **Step 7: 提交**

```bash
cd /Users/code.yang/Desktop/roadbook-monorepo
git add .gitignore scripts/README.md scripts/camp-import
git commit -m "chore(camp-import): scaffold uv project with pytest sanity check"
```

---

### Task 2: common — CSV 原子重写与 JSONL 追加

**Files:**
- Create: `scripts/camp-import/src/camp_import/common.py`
- Test: `scripts/camp-import/tests/test_common_io.py`

**Interfaces:**
- Consumes: 无
- Produces(后续所有落盘都走这四个函数):
  - `write_csv_atomic(path: Path, fieldnames: Sequence[str], rows: Iterable[dict]) -> None`
  - `read_csv_rows(path: Path) -> list[dict]`(文件不存在返回 `[]`,值全为 str)
  - `append_jsonl(path: Path, record: dict) -> None`
  - `read_jsonl(path: Path) -> list[dict]`(文件不存在返回 `[]`)

- [ ] **Step 1: 写失败测试**

创建 `scripts/camp-import/tests/test_common_io.py`:

```python
import csv

import pytest

from camp_import.common import (
    append_jsonl,
    read_csv_rows,
    read_jsonl,
    write_csv_atomic,
)


def test_csv_roundtrip(tmp_path):
    path = tmp_path / "out" / "tiles.csv"
    rows = [{"a": "1", "b": "x"}, {"a": "2", "b": "y"}]
    write_csv_atomic(path, ["a", "b"], rows)
    assert read_csv_rows(path) == rows


def test_csv_rewrite_replaces_content(tmp_path):
    path = tmp_path / "t.csv"
    write_csv_atomic(path, ["a"], [{"a": "old"}])
    write_csv_atomic(path, ["a"], [{"a": "new"}])
    assert read_csv_rows(path) == [{"a": "new"}]


def test_crash_mid_write_keeps_old_file_and_no_tmp(tmp_path):
    """写入中途崩溃:原文件完好,不留 .tmp 半成品。"""
    path = tmp_path / "t.csv"
    write_csv_atomic(path, ["a"], [{"a": "safe"}])

    def exploding_rows():
        yield {"a": "partial"}
        raise RuntimeError("boom")

    with pytest.raises(RuntimeError):
        write_csv_atomic(path, ["a"], exploding_rows())
    assert read_csv_rows(path) == [{"a": "safe"}]
    assert list(tmp_path.glob("*.tmp")) == []


def test_read_csv_missing_file_returns_empty(tmp_path):
    assert read_csv_rows(tmp_path / "nope.csv") == []


def test_jsonl_append_and_read(tmp_path):
    path = tmp_path / "raw" / "camps.jsonl"
    append_jsonl(path, {"id": 1, "名称": "营地"})
    append_jsonl(path, {"id": 2})
    assert read_jsonl(path) == [{"id": 1, "名称": "营地"}, {"id": 2}]
    # 追加写:第一条未被覆盖,且中文不转义
    text = path.read_text(encoding="utf-8")
    assert text.count("\n") == 2
    assert "营地" in text


def test_read_jsonl_missing_file_returns_empty(tmp_path):
    assert read_jsonl(tmp_path / "nope.jsonl") == []
```

- [ ] **Step 2: 运行确认失败**

```bash
cd /Users/code.yang/Desktop/roadbook-monorepo/scripts/camp-import
uv run pytest tests/test_common_io.py -v
```

Expected: 全部 FAIL,报 `ModuleNotFoundError: No module named 'camp_import.common'`(或 ImportError)。

- [ ] **Step 3: 实现**

创建 `scripts/camp-import/src/camp_import/common.py`:

```python
"""共享基础设施:文件 I/O、Transport 协议、限流、重试。"""
from __future__ import annotations

import csv
import json
import os
from pathlib import Path
from typing import Iterable, Sequence


def write_csv_atomic(path: Path, fieldnames: Sequence[str], rows: Iterable[dict]) -> None:
    """全量重写 CSV:先写 tmp 文件并 fsync,再原子 rename;崩溃不留半成品。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    try:
        with open(tmp, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=list(fieldnames))
            writer.writeheader()
            for row in rows:
                writer.writerow(row)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    finally:
        if tmp.exists():
            tmp.unlink()


def read_csv_rows(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def append_jsonl(path: Path, record: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")


def read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]
```

- [ ] **Step 4: 运行确认通过**

```bash
uv run pytest tests/test_common_io.py -v
```

Expected: `6 passed`。

- [ ] **Step 5: 提交**

```bash
cd /Users/code.yang/Desktop/roadbook-monorepo
git add scripts/camp-import
git commit -m "feat(camp-import): atomic CSV rewrite and JSONL append helpers"
```

---

### Task 3: common — Transport 协议与 FakeTransport

**Files:**
- Modify: `scripts/camp-import/src/camp_import/common.py`(追加)
- Test: `scripts/camp-import/tests/test_transport.py`

**Interfaces:**
- Consumes: 无
- Produces:
  - `ApiRequest(method: str, url: str, params: dict[str, str])`(frozen dataclass)
  - `ApiResponse(status_code: int, headers: dict[str, str], body: object)`(frozen dataclass)
  - `Transport`(Protocol,`send(request: ApiRequest) -> ApiResponse`)
  - `TransportError(Exception)`(网络层错误,可重试)
  - `FakeTransport(script: list[ApiResponse | Exception])`,属性 `sent: list[ApiRequest]` 记录全部请求

- [ ] **Step 1: 写失败测试**

创建 `scripts/camp-import/tests/test_transport.py`:

```python
import pytest

from camp_import.common import ApiRequest, ApiResponse, FakeTransport, TransportError


def make_request(**overrides):
    defaults = {"method": "GET", "url": "https://example.test/api", "params": {"a": "1"}}
    return ApiRequest(**{**defaults, **overrides})


def test_fake_transport_returns_scripted_responses_in_order():
    r1 = ApiResponse(status_code=200, headers={}, body={"n": 1})
    r2 = ApiResponse(status_code=200, headers={}, body={"n": 2})
    transport = FakeTransport([r1, r2])
    assert transport.send(make_request()) is r1
    assert transport.send(make_request()) is r2


def test_fake_transport_records_sent_requests():
    transport = FakeTransport([ApiResponse(status_code=200, headers={}, body=None)])
    request = make_request(params={"scale": "11"})
    transport.send(request)
    assert transport.sent == [request]


def test_fake_transport_raises_scripted_exception():
    transport = FakeTransport([TransportError("connection reset")])
    with pytest.raises(TransportError, match="connection reset"):
        transport.send(make_request())


def test_fake_transport_exhausted_script_fails_loudly():
    transport = FakeTransport([])
    with pytest.raises(AssertionError, match="exhausted"):
        transport.send(make_request())
```

- [ ] **Step 2: 运行确认失败**

```bash
uv run pytest tests/test_transport.py -v
```

Expected: FAIL,`ImportError: cannot import name 'ApiRequest'`。

- [ ] **Step 3: 实现**

在 `common.py` 顶部 import 区追加 `from dataclasses import dataclass, field` 与 `from typing import Protocol`,文件末尾追加:

```python
class TransportError(Exception):
    """网络层错误(连接失败、超时等),按重试策略处理。"""


@dataclass(frozen=True)
class ApiRequest:
    method: str
    url: str
    params: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class ApiResponse:
    status_code: int
    headers: dict[str, str] = field(default_factory=dict)
    body: object = None


class Transport(Protocol):
    def send(self, request: ApiRequest) -> ApiResponse: ...


class FakeTransport:
    """按脚本顺序返回罐头响应;条目为 Exception 实例时抛出。记录全部请求供断言。"""

    def __init__(self, script: list):
        self._script = list(script)
        self.sent: list[ApiRequest] = []

    def send(self, request: ApiRequest) -> ApiResponse:
        self.sent.append(request)
        if not self._script:
            raise AssertionError(f"FakeTransport script exhausted, got: {request}")
        step = self._script.pop(0)
        if isinstance(step, Exception):
            raise step
        return step
```

- [ ] **Step 4: 运行确认通过**

```bash
uv run pytest tests/test_transport.py -v
```

Expected: `4 passed`。

- [ ] **Step 5: 提交**

```bash
cd /Users/code.yang/Desktop/roadbook-monorepo
git add scripts/camp-import
git commit -m "feat(camp-import): Transport protocol with scriptable FakeTransport"
```

---

### Task 4: common — 令牌桶限流(时钟可注入)

**Files:**
- Modify: `scripts/camp-import/src/camp_import/common.py`(追加)
- Create: `scripts/camp-import/tests/conftest.py`
- Test: `scripts/camp-import/tests/test_token_bucket.py`

**Interfaces:**
- Consumes: Task 3 的 `Transport` / `ApiRequest` / `ApiResponse`
- Produces:
  - `TokenBucket(qps: float, burst: int = 1, clock: Callable[[], float] = time.monotonic, sleep: Callable[[float], None] = time.sleep)`,方法 `acquire() -> None`
  - `RateLimitedTransport(inner: Transport, bucket: TokenBucket)`,方法 `send(request) -> ApiResponse`
  - 测试侧:`conftest.py` 的 `FakeClock`(属性 `now: float`、`sleeps: list[float]`,方法 `clock()`、`sleep(seconds)`)

- [ ] **Step 1: 创建 conftest 的 FakeClock**

创建 `scripts/camp-import/tests/conftest.py`:

```python
"""跨测试共享的 fixture 与工厂。随任务推进增量补充。"""


class FakeClock:
    """可注入的假时钟:sleep 记录时长并推进 now,测试瞬间完成。"""

    def __init__(self, start: float = 0.0):
        self.now = start
        self.sleeps: list[float] = []

    def clock(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds
```

- [ ] **Step 2: 写失败测试**

创建 `scripts/camp-import/tests/test_token_bucket.py`:

```python
import pytest

from camp_import.common import (
    ApiRequest,
    ApiResponse,
    FakeTransport,
    RateLimitedTransport,
    TokenBucket,
)
from conftest import FakeClock


def make_bucket(qps, burst=1, clock=None):
    clock = clock or FakeClock()
    return TokenBucket(qps=qps, burst=burst, clock=clock.clock, sleep=clock.sleep), clock


def test_first_acquire_is_immediate():
    bucket, clock = make_bucket(qps=2.0)
    bucket.acquire()
    assert clock.sleeps == []


def test_second_acquire_waits_one_over_qps():
    bucket, clock = make_bucket(qps=2.0)
    bucket.acquire()
    bucket.acquire()
    assert clock.sleeps == [pytest.approx(0.5)]


def test_elapsed_time_refills_tokens():
    bucket, clock = make_bucket(qps=2.0)
    bucket.acquire()
    clock.now += 0.5  # 刚好补回 1 个令牌
    bucket.acquire()
    assert clock.sleeps == []


def test_burst_allows_consecutive_calls():
    bucket, clock = make_bucket(qps=1.0, burst=3)
    bucket.acquire()
    bucket.acquire()
    bucket.acquire()
    assert clock.sleeps == []
    bucket.acquire()
    assert clock.sleeps == [pytest.approx(1.0)]


def test_qps_must_be_positive():
    with pytest.raises(ValueError):
        TokenBucket(qps=0)


def test_rate_limited_transport_acquires_before_send():
    clock = FakeClock()
    bucket = TokenBucket(qps=1.0, burst=1, clock=clock.clock, sleep=clock.sleep)
    inner = FakeTransport([
        ApiResponse(status_code=200, headers={}, body=None),
        ApiResponse(status_code=200, headers={}, body=None),
    ])
    transport = RateLimitedTransport(inner, bucket)
    request = ApiRequest("GET", "https://example.test", {})
    transport.send(request)
    transport.send(request)
    assert len(inner.sent) == 2
    assert clock.sleeps == [pytest.approx(1.0)]
```

注:`from conftest import FakeClock` 依赖 pytest 自动把 tests/ 加入 rootdir path(conftest 同目录),无需额外配置。

- [ ] **Step 3: 运行确认失败**

```bash
uv run pytest tests/test_token_bucket.py -v
```

Expected: FAIL,`ImportError: cannot import name 'TokenBucket'`。

- [ ] **Step 4: 实现**

在 `common.py` 顶部 import 区追加 `import time` 与 `from typing import Callable`,文件末尾追加:

```python
class TokenBucket:
    """全局共享令牌桶。qps/burst 来自 field_mapping.yaml;时钟与 sleep 可注入。"""

    def __init__(
        self,
        qps: float,
        burst: int = 1,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
    ):
        if qps <= 0:
            raise ValueError("qps must be > 0")
        self._qps = float(qps)
        self._burst = max(1, int(burst))
        self._clock = clock
        self._sleep = sleep
        self._tokens = float(self._burst)
        self._last = clock()

    def _refill(self) -> None:
        now = self._clock()
        self._tokens = min(float(self._burst), self._tokens + (now - self._last) * self._qps)
        self._last = now

    def acquire(self) -> None:
        self._refill()
        if self._tokens < 1.0:
            self._sleep((1.0 - self._tokens) / self._qps)
            self._refill()
            self._tokens = max(self._tokens, 1.0)
        self._tokens -= 1.0


class RateLimitedTransport:
    """装饰层:send 前先取令牌,不承载业务逻辑。"""

    def __init__(self, inner: Transport, bucket: TokenBucket):
        self._inner = inner
        self._bucket = bucket

    def send(self, request: ApiRequest) -> ApiResponse:
        self._bucket.acquire()
        return self._inner.send(request)
```

- [ ] **Step 5: 运行确认通过**

```bash
uv run pytest tests/test_token_bucket.py -v
```

Expected: `6 passed`。

- [ ] **Step 6: 提交**

```bash
cd /Users/code.yang/Desktop/roadbook-monorepo
git add scripts/camp-import
git commit -m "feat(camp-import): token bucket rate limiter with injectable clock"
```

---

### Task 5: common — 退避重试装饰层

**Files:**
- Modify: `scripts/camp-import/src/camp_import/common.py`(追加)
- Test: `scripts/camp-import/tests/test_retry.py`

**Interfaces:**
- Consumes: Task 3 的 `Transport` / `TransportError` / `FakeTransport`
- Produces:
  - `BACKOFF_SECONDS = (1.0, 2.0, 4.0, 8.0, 16.0)`、`MAX_RETRY_WAIT_SECONDS = 30.0`
  - `RetryExhausted(Exception)`,属性 `last_error: str`
  - `RetryingTransport(inner: Transport, sleep: Callable[[float], None] = time.sleep)`,方法 `send(request) -> ApiResponse`;重试判定:抛 `TransportError`、状态码 `>= 500`、或 `== 429`

- [ ] **Step 1: 写失败测试**

创建 `scripts/camp-import/tests/test_retry.py`:

```python
import pytest

from camp_import.common import (
    ApiRequest,
    ApiResponse,
    FakeTransport,
    RetryExhausted,
    RetryingTransport,
    TransportError,
)
from conftest import FakeClock

REQUEST = ApiRequest("GET", "https://example.test", {})
OK = ApiResponse(status_code=200, headers={}, body={"ok": True})


def make_transport(script):
    clock = FakeClock()
    inner = FakeTransport(script)
    return RetryingTransport(inner, sleep=clock.sleep), inner, clock


def test_success_first_try_no_sleep():
    transport, inner, clock = make_transport([OK])
    assert transport.send(REQUEST) is OK
    assert clock.sleeps == []


def test_network_errors_then_success_backs_off_1_2():
    transport, _, clock = make_transport([
        TransportError("reset"),
        TransportError("reset"),
        OK,
    ])
    assert transport.send(REQUEST) is OK
    assert clock.sleeps == [1.0, 2.0]


def test_5xx_and_429_are_retried():
    transport, inner, clock = make_transport([
        ApiResponse(status_code=503, headers={}, body=None),
        ApiResponse(status_code=429, headers={}, body=None),
        OK,
    ])
    assert transport.send(REQUEST) is OK
    assert len(inner.sent) == 3


def test_exhaustion_after_5_retries_raises_with_last_error():
    transport, inner, clock = make_transport([TransportError("boom")] * 6)
    with pytest.raises(RetryExhausted) as exc_info:
        transport.send(REQUEST)
    assert clock.sleeps == [1.0, 2.0, 4.0, 8.0, 16.0]
    assert len(inner.sent) == 6  # 1 次初始 + 5 次重试
    assert "boom" in exc_info.value.last_error


def test_retry_after_overrides_backoff():
    transport, _, clock = make_transport([
        ApiResponse(status_code=429, headers={"Retry-After": "3"}, body=None),
        OK,
    ])
    transport.send(REQUEST)
    assert clock.sleeps == [3.0]


def test_retry_after_capped_at_30_seconds():
    transport, _, clock = make_transport([
        ApiResponse(status_code=429, headers={"Retry-After": "120"}, body=None),
        OK,
    ])
    transport.send(REQUEST)
    assert clock.sleeps == [30.0]


def test_4xx_other_than_429_is_returned_not_retried():
    resp = ApiResponse(status_code=404, headers={}, body=None)
    transport, inner, clock = make_transport([resp])
    assert transport.send(REQUEST) is resp
    assert len(inner.sent) == 1
    assert clock.sleeps == []
```

- [ ] **Step 2: 运行确认失败**

```bash
uv run pytest tests/test_retry.py -v
```

Expected: FAIL,`ImportError: cannot import name 'RetryExhausted'`。

- [ ] **Step 3: 实现**

在 `common.py` 末尾追加:

```python
BACKOFF_SECONDS = (1.0, 2.0, 4.0, 8.0, 16.0)
MAX_RETRY_WAIT_SECONDS = 30.0


class RetryExhausted(Exception):
    """重试超限。last_error 保留最后一次错误,供任务标记 failed 时落盘。"""

    def __init__(self, last_error: str):
        super().__init__(last_error)
        self.last_error = last_error


class RetryingTransport:
    """装饰层:网络错误 / 5xx / 429 最多重试 5 次,退避 1/2/4/8/16 秒;
    Retry-After 与 30 秒取小。sleep 可注入,测试瞬间完成。"""

    def __init__(self, inner: Transport, sleep: Callable[[float], None] = time.sleep):
        self._inner = inner
        self._sleep = sleep

    def send(self, request: ApiRequest) -> ApiResponse:
        last_error = ""
        for attempt in range(len(BACKOFF_SECONDS) + 1):
            retry_after: str | None = None
            try:
                response = self._inner.send(request)
            except TransportError as exc:
                last_error = f"network: {exc}"
            else:
                if response.status_code < 500 and response.status_code != 429:
                    return response
                last_error = f"http {response.status_code}"
                retry_after = response.headers.get("Retry-After")
            if attempt < len(BACKOFF_SECONDS):
                wait = BACKOFF_SECONDS[attempt]
                if retry_after is not None:
                    wait = min(float(retry_after), MAX_RETRY_WAIT_SECONDS)
                self._sleep(wait)
        raise RetryExhausted(last_error)
```

- [ ] **Step 4: 运行确认通过**

```bash
uv run pytest tests/test_retry.py -v
```

Expected: `7 passed`。

- [ ] **Step 5: 提交**

```bash
cd /Users/code.yang/Desktop/roadbook-monorepo
git add scripts/camp-import
git commit -m "feat(camp-import): retrying transport with backoff and Retry-After cap"
```

---

### Task 6: field_mapping — 契约加载、校验与路径取值

**Files:**
- Create: `scripts/camp-import/src/camp_import/field_mapping.py`
- Modify: `scripts/camp-import/tests/conftest.py`(追加契约 fixture)
- Test: `scripts/camp-import/tests/test_field_mapping.py`

**Interfaces:**
- Consumes: 无(独立于 common)
- Produces:
  - `FieldMappingError(Exception)`(契约缺失/非法 → 拒绝启动)
  - `ContractViolation(Exception)`(响应结构与契约不符 → 中止当前任务)
  - `REQUIRED_KEYS`:`list_items_path, list_external_id_path, list_lat_path, list_lng_path, detail_external_id_path, list_lng_param, list_lat_param, list_old_lng_param, list_old_lat_param, list_scale_param, detail_id_param, detail_lng_param, detail_lat_param, response_item_limit, coordinate_system, qps_limit, seed_scale, scale_viewport, overlap_ratio_by_scale, edge_margin_ratio, edge_expansion_max_hops`
  - `FieldMapping`（frozen dataclass）：必填字段同上；可选 `burst=1, concurrency=1, dense_ratio=0.8, empty_sample_ratio=0.05, truncation_signal_path=None, detail_name_path=None, detail_address_path=None, required_auth=(), required_signature=None`；方法 `viewport_for_scale(scale: int) -> tuple[float, float]`、`overlap_for_scale(scale: int) -> float`。加载时还必须校验正数、比例范围、每个已配置 scale 的视口与 overlap，以及边缘扩展参数的范围。
  - `load_field_mapping(path: Path) -> FieldMapping`
  - `extract_path(obj: object, path: str) -> object`(点分路径;任一级缺失抛 `ContractViolation`)
  - 测试侧 conftest:`VALID_MAPPING: dict`、`make_mapping(**overrides) -> FieldMapping`、`write_mapping_yaml(dir_path, **overrides) -> Path`

- [ ] **Step 1: conftest 追加契约 fixture**

在 `scripts/camp-import/tests/conftest.py` 末尾追加:

```python
import dataclasses
from pathlib import Path

import yaml

# 阶段一测试用的完整合法契约。真实值将由授权探针批次实测产出。
VALID_MAPPING = {
    "list_items_path": "data.list",
    "list_external_id_path": "id",
    "list_lat_path": "latitude",
    "list_lng_path": "longitude",
    "detail_external_id_path": "data.id",
    "list_lng_param": "lnt",
    "list_lat_param": "lat",
    "list_old_lng_param": "oldlnt",
    "list_old_lat_param": "oldlat",
    "list_scale_param": "scale",
    "detail_id_param": "id",
    "detail_lng_param": "lnt",
    "detail_lat_param": "lat",
    "response_item_limit": 100,
    "coordinate_system": "gcj02",
    "qps_limit": 2.5,
    "burst": 1,
    "concurrency": 1,
    "dense_ratio": 0.8,
    "empty_sample_ratio": 0.05,
    "seed_scale": 11,
    "scale_viewport": {
        "11": {"width_m": 40000.0, "height_m": 30000.0},
        "12": {"width_m": 20000.0, "height_m": 15000.0},
    },
    "overlap_ratio_by_scale": {"11": 0.15, "12": 0.15},
    "edge_margin_ratio": 0.05,
    "edge_expansion_max_hops": 2,
    "truncation_signal_path": None,
    "detail_name_path": "data.name",
    "detail_address_path": "data.address",
}


def make_mapping(**overrides):
    from camp_import.field_mapping import FieldMapping

    data = {**VALID_MAPPING, **overrides}
    known = {f.name for f in dataclasses.fields(FieldMapping)}
    return FieldMapping(**{k: v for k, v in data.items() if k in known})


def write_mapping_yaml(dir_path: Path, **overrides) -> Path:
    """把契约写成 probe/field_mapping.yaml,返回文件路径。值为 REMOVE 的键会被删除。"""
    data = {**VALID_MAPPING, **overrides}
    data = {k: v for k, v in data.items() if v != "REMOVE"}
    path = dir_path / "probe" / "field_mapping.yaml"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data, allow_unicode=True), encoding="utf-8")
    return path
```

- [ ] **Step 2: 写失败测试**

创建 `scripts/camp-import/tests/test_field_mapping.py`:

```python
import pytest

from camp_import.field_mapping import (
    ContractViolation,
    FieldMappingError,
    extract_path,
    load_field_mapping,
)
from conftest import write_mapping_yaml


def test_valid_mapping_loads(tmp_path):
    path = write_mapping_yaml(tmp_path)
    mapping = load_field_mapping(path)
    assert mapping.coordinate_system == "gcj02"
    assert mapping.response_item_limit == 100
    assert mapping.viewport_for_scale(11) == (40000.0, 30000.0)
    assert mapping.overlap_for_scale(11) == 0.15


def test_defaults_applied(tmp_path):
    path = write_mapping_yaml(
        tmp_path, dense_ratio="REMOVE", empty_sample_ratio="REMOVE", burst="REMOVE"
    )
    mapping = load_field_mapping(path)
    assert mapping.dense_ratio == 0.8
    assert mapping.empty_sample_ratio == 0.05
    assert mapping.burst == 1


@pytest.mark.parametrize(
    "key",
    [
        "list_items_path",
        "list_external_id_path",
        "list_lat_path",
        "list_lng_path",
        "detail_external_id_path",
        "list_lng_param",
        "list_lat_param",
        "list_old_lng_param",
        "list_old_lat_param",
        "list_scale_param",
        "detail_id_param",
        "detail_lng_param",
        "detail_lat_param",
        "response_item_limit",
        "coordinate_system",
        "qps_limit",
        "seed_scale",
        "scale_viewport",
        "overlap_ratio_by_scale",
        "edge_margin_ratio",
        "edge_expansion_max_hops",
    ],
)
def test_missing_required_key_refuses_to_start(tmp_path, key):
    path = write_mapping_yaml(tmp_path, **{key: None})
    with pytest.raises(FieldMappingError, match=key):
        load_field_mapping(path)


def test_empty_string_coordinate_system_refused(tmp_path):
    path = write_mapping_yaml(tmp_path, coordinate_system="")
    with pytest.raises(FieldMappingError, match="coordinate_system"):
        load_field_mapping(path)


def test_missing_file_refused(tmp_path):
    with pytest.raises(FieldMappingError, match="not found"):
        load_field_mapping(tmp_path / "probe" / "field_mapping.yaml")


def test_seed_scale_without_measured_viewport_refused(tmp_path):
    path = write_mapping_yaml(
        tmp_path, scale_viewport={"11": {"width_m": None, "height_m": None}}
    )
    with pytest.raises(FieldMappingError, match="scale_viewport"):
        load_field_mapping(path)


@pytest.mark.parametrize(
    "overrides",
    [
        {"qps_limit": 0},
        {"response_item_limit": 0},
        {"dense_ratio": 1.1},
        {"empty_sample_ratio": -0.1},
        {"overlap_ratio_by_scale": {"11": 1.0}},
        {"edge_margin_ratio": 0.0},
        {"edge_expansion_max_hops": -1},
    ],
)
def test_invalid_numeric_mapping_refused(tmp_path, overrides):
    with pytest.raises(FieldMappingError):
        load_field_mapping(write_mapping_yaml(tmp_path, **overrides))


def test_extract_path_walks_nested_dicts():
    body = {"data": {"list": [{"id": 7}]}}
    assert extract_path(body, "data.list") == [{"id": 7}]
    assert extract_path(body["data"]["list"][0], "id") == 7


def test_extract_path_missing_segment_raises_contract_violation():
    with pytest.raises(ContractViolation, match="data.items"):
        extract_path({"data": {"list": []}}, "data.items")
```

- [ ] **Step 3: 运行确认失败**

```bash
uv run pytest tests/test_field_mapping.py -v
```

Expected: FAIL,`ModuleNotFoundError: No module named 'camp_import.field_mapping'`。

- [ ] **Step 4: 实现**

创建 `scripts/camp-import/src/camp_import/field_mapping.py`:

```python
"""field_mapping.yaml 契约:加载、校验、按路径取值。

契约是探针产出、后续脚本的输入。必填项为空必须拒绝启动;
响应结构与契约不符必须立即中止,不猜测字段。
"""
from __future__ import annotations

import dataclasses
from dataclasses import dataclass
from pathlib import Path

import yaml


class FieldMappingError(Exception):
    """契约缺失或非法,拒绝启动。"""


class ContractViolation(Exception):
    """响应结构与契约不符,立即中止当前任务,不猜测字段。"""


REQUIRED_KEYS = (
    "list_items_path",
    "list_external_id_path",
    "list_lat_path",
    "list_lng_path",
    "detail_external_id_path",
    "list_lng_param",
    "list_lat_param",
    "list_old_lng_param",
    "list_old_lat_param",
    "list_scale_param",
    "detail_id_param",
    "detail_lng_param",
    "detail_lat_param",
    "response_item_limit",
    "coordinate_system",
    "qps_limit",
    "seed_scale",
    "scale_viewport",
    "overlap_ratio_by_scale",
    "edge_margin_ratio",
    "edge_expansion_max_hops",
)


@dataclass(frozen=True)
class FieldMapping:
    # 必填(REQUIRED_KEYS)。list_* 取值路径中,items 相对响应根,其余相对单个 item。
    list_items_path: str
    list_external_id_path: str
    list_lat_path: str
    list_lng_path: str
    detail_external_id_path: str
    list_lng_param: str
    list_lat_param: str
    list_old_lng_param: str
    list_old_lat_param: str
    list_scale_param: str
    detail_id_param: str
    detail_lng_param: str
    detail_lat_param: str
    response_item_limit: int
    coordinate_system: str
    qps_limit: float
    seed_scale: int
    scale_viewport: dict
    overlap_ratio_by_scale: dict
    edge_margin_ratio: float
    edge_expansion_max_hops: int
    # 可选(有默认值或允许缺省)
    burst: int = 1
    concurrency: int = 1
    dense_ratio: float = 0.8
    empty_sample_ratio: float = 0.05
    truncation_signal_path: str | None = None
    detail_name_path: str | None = None
    detail_address_path: str | None = None
    required_auth: tuple = ()
    required_signature: str | None = None

    def viewport_for_scale(self, scale: int) -> tuple[float, float]:
        entry = self.scale_viewport.get(str(scale)) or {}
        width, height = entry.get("width_m"), entry.get("height_m")
        if width in (None, "") or height in (None, ""):
            raise FieldMappingError(
                f"scale_viewport missing measured width_m/height_m for scale {scale}"
            )
        return float(width), float(height)

    def overlap_for_scale(self, scale: int) -> float:
        value = self.overlap_ratio_by_scale.get(str(scale))
        if value is None:
            raise FieldMappingError(f"overlap_ratio_by_scale missing scale {scale}")
        return float(value)


def load_field_mapping(path: Path) -> FieldMapping:
    if not path.exists():
        raise FieldMappingError(f"field_mapping not found: {path}")
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    missing = [key for key in REQUIRED_KEYS if data.get(key) in (None, "", [], {})]
    if missing:
        raise FieldMappingError(
            f"field_mapping required keys empty: {', '.join(missing)}; refusing to start"
        )
    known = {f.name for f in dataclasses.fields(FieldMapping)}
    kwargs = {k: v for k, v in data.items() if k in known}
    if "required_auth" in kwargs:
        kwargs["required_auth"] = tuple(kwargs["required_auth"] or ())
    mapping = FieldMapping(**kwargs)
    mapping.viewport_for_scale(mapping.seed_scale)  # seed_scale 的实测视口必须存在
    if mapping.qps_limit <= 0 or mapping.response_item_limit <= 0:
        raise FieldMappingError("qps_limit and response_item_limit must be > 0")
    if not 0 < mapping.dense_ratio <= 1 or not 0 <= mapping.empty_sample_ratio <= 1:
        raise FieldMappingError("dense_ratio/empty_sample_ratio out of range")
    if not 0 < mapping.edge_margin_ratio < 0.5 or mapping.edge_expansion_max_hops < 0:
        raise FieldMappingError("invalid edge expansion configuration")
    for scale, overlap in mapping.overlap_ratio_by_scale.items():
        mapping.viewport_for_scale(int(scale))
        if not 0 <= float(overlap) < 1:
            raise FieldMappingError(f"overlap_ratio_by_scale invalid for scale {scale}")
    return mapping


def extract_path(obj: object, path: str) -> object:
    """按点分路径逐级取值;任一级缺失即抛 ContractViolation。"""
    current = obj
    for part in path.split("."):
        if isinstance(current, dict) and part in current:
            current = current[part]
        else:
            raise ContractViolation(f"path '{path}' not found at segment '{part}'")
    return current
```

- [ ] **Step 5: 运行确认通过**

```bash
uv run pytest tests/test_field_mapping.py -v
```

Expected: 全部通过；包含必填键、数值范围及已配置 scale 完整性的参数化覆盖。

- [ ] **Step 6: 提交**

```bash
cd /Users/code.yang/Desktop/roadbook-monorepo
git add scripts/camp-import
git commit -m "feat(camp-import): field_mapping contract loading and validation"
```

---

### Task 7: tiles — 视口换算、网格步长、四叉树、面积(纯函数)

**Files:**
- Create: `scripts/camp-import/src/camp_import/tiles.py`
- Test: `scripts/camp-import/tests/test_tiles.py`

**Interfaces:**
- Consumes: 无(纯函数,无 I/O)
- Produces:
  - `Tile(tile_id: str, parent_tile_id: str | None, center_lng, center_lat, min_lng, min_lat, max_lng, max_lat: float, scale: int, depth: int)`(frozen dataclass)
  - `METERS_PER_DEGREE_LAT = 111_320.0`
  - `meters_to_degrees(width_m, height_m, center_lat) -> tuple[float, float]`(返回 `(dlng, dlat)`)
  - `make_tile_id(scale, depth, center_lng, center_lat) -> str`
  - `tile_from_center(center_lng, center_lat, width_m, height_m, scale, depth=0, parent_tile_id=None) -> Tile`
  - `grid_step_m(viewport_m, overlap_ratio) -> float`(= `viewport × (1 - overlap_ratio)`)
  - `split_tile(tile) -> list[Tile]`(4 个子格,bbox 四等分,`scale+1`、`depth+1`、继承 `parent_tile_id=tile.tile_id`)
  - `tile_area_m2(tile) -> float`
  - `can_split(tile, min_tile_area_m2, max_depth) -> bool`(面积 < 阈值或 depth ≥ max_depth 时 False)

- [ ] **Step 1: 写失败测试**

创建 `scripts/camp-import/tests/test_tiles.py`:

```python
import math

import pytest

from camp_import.tiles import (
    METERS_PER_DEGREE_LAT,
    Tile,
    can_split,
    grid_step_m,
    make_tile_id,
    meters_to_degrees,
    split_tile,
    tile_area_m2,
    tile_from_center,
)


def test_meters_to_degrees_at_equator():
    dlng, dlat = meters_to_degrees(111_320.0, 111_320.0, center_lat=0.0)
    assert dlng == pytest.approx(1.0)
    assert dlat == pytest.approx(1.0)


def test_meters_to_degrees_lng_stretches_with_latitude():
    dlng, dlat = meters_to_degrees(111_320.0, 111_320.0, center_lat=60.0)
    assert dlat == pytest.approx(1.0)
    assert dlng == pytest.approx(1.0 / math.cos(math.radians(60.0)))


def test_tile_from_center_bbox_is_centered():
    tile = tile_from_center(104.0, 30.6, width_m=40000.0, height_m=30000.0, scale=11)
    assert tile.min_lng < 104.0 < tile.max_lng
    assert tile.min_lat < 30.6 < tile.max_lat
    assert (tile.min_lng + tile.max_lng) / 2 == pytest.approx(104.0)
    assert (tile.min_lat + tile.max_lat) / 2 == pytest.approx(30.6)
    assert tile.depth == 0
    assert tile.parent_tile_id is None
    assert tile.tile_id == make_tile_id(11, 0, 104.0, 30.6)


def test_grid_step_is_viewport_times_one_minus_overlap():
    assert grid_step_m(40000.0, 0.15) == pytest.approx(34000.0)


def test_split_produces_four_children_tiling_parent():
    parent = tile_from_center(104.0, 30.6, 40000.0, 30000.0, scale=11)
    children = split_tile(parent)
    assert len(children) == 4
    for child in children:
        assert child.parent_tile_id == parent.tile_id
        assert child.depth == parent.depth + 1
        assert child.scale == parent.scale + 1
    # 四个子格恰好铺满父 bbox:总面积一致,且并集角点与父一致
    assert sum(tile_area_m2(c) for c in children) == pytest.approx(
        tile_area_m2(parent), rel=1e-6
    )
    assert min(c.min_lng for c in children) == pytest.approx(parent.min_lng)
    assert max(c.max_lng for c in children) == pytest.approx(parent.max_lng)
    assert min(c.min_lat for c in children) == pytest.approx(parent.min_lat)
    assert max(c.max_lat for c in children) == pytest.approx(parent.max_lat)
    # 子格 id 互不相同
    assert len({c.tile_id for c in children}) == 4


def test_tile_area_matches_viewport():
    tile = tile_from_center(104.0, 30.6, 40000.0, 30000.0, scale=11)
    assert tile_area_m2(tile) == pytest.approx(40000.0 * 30000.0, rel=1e-3)


def test_can_split_stops_at_min_area():
    tile = tile_from_center(104.0, 30.6, 500.0, 500.0, scale=18)
    assert can_split(tile, min_tile_area_m2=250_000.0, max_depth=8) is True
    small = tile_from_center(104.0, 30.6, 400.0, 400.0, scale=19)
    assert can_split(small, min_tile_area_m2=250_000.0, max_depth=8) is False


def test_can_split_stops_at_max_depth():
    tile = tile_from_center(104.0, 30.6, 40000.0, 30000.0, scale=11, depth=8)
    assert can_split(tile, min_tile_area_m2=250_000.0, max_depth=8) is False
```

- [ ] **Step 2: 运行确认失败**

```bash
uv run pytest tests/test_tiles.py -v
```

Expected: FAIL,`ModuleNotFoundError: No module named 'camp_import.tiles'`。

- [ ] **Step 3: 实现**

创建 `scripts/camp-import/src/camp_import/tiles.py`:

```python
"""tile 几何:视口换算、网格步长、四叉树切分、面积。纯函数,无 I/O、无状态。

阶段一使用等距圆柱近似(1° 纬度 ≈ 111.32 km),精度对网格调度足够;
坐标系语义由 field_mapping.coordinate_system 标注,本模块不做坐标转换。
"""
from __future__ import annotations

import math
from dataclasses import dataclass

METERS_PER_DEGREE_LAT = 111_320.0


@dataclass(frozen=True)
class Tile:
    tile_id: str
    parent_tile_id: str | None
    center_lng: float
    center_lat: float
    min_lng: float
    min_lat: float
    max_lng: float
    max_lat: float
    scale: int
    depth: int


def meters_to_degrees(width_m: float, height_m: float, center_lat: float) -> tuple[float, float]:
    dlat = height_m / METERS_PER_DEGREE_LAT
    dlng = width_m / (METERS_PER_DEGREE_LAT * math.cos(math.radians(center_lat)))
    return dlng, dlat


def make_tile_id(scale: int, depth: int, center_lng: float, center_lat: float) -> str:
    return f"s{scale}_d{depth}_{center_lng:.6f}_{center_lat:.6f}"


def tile_from_center(
    center_lng: float,
    center_lat: float,
    width_m: float,
    height_m: float,
    scale: int,
    depth: int = 0,
    parent_tile_id: str | None = None,
) -> Tile:
    dlng, dlat = meters_to_degrees(width_m, height_m, center_lat)
    return Tile(
        tile_id=make_tile_id(scale, depth, center_lng, center_lat),
        parent_tile_id=parent_tile_id,
        center_lng=center_lng,
        center_lat=center_lat,
        min_lng=center_lng - dlng / 2,
        min_lat=center_lat - dlat / 2,
        max_lng=center_lng + dlng / 2,
        max_lat=center_lat + dlat / 2,
        scale=scale,
        depth=depth,
    )


def grid_step_m(viewport_m: float, overlap_ratio: float) -> float:
    """格点步长 = viewport × (1 - overlap_ratio);overlap 来自探针实测,不写死。"""
    return viewport_m * (1.0 - overlap_ratio)


def split_tile(tile: Tile) -> list[Tile]:
    """四叉树切分:bbox 四等分,scale+1、depth+1、记录血缘。"""
    mid_lng = (tile.min_lng + tile.max_lng) / 2
    mid_lat = (tile.min_lat + tile.max_lat) / 2
    children = []
    for min_lng, max_lng in ((tile.min_lng, mid_lng), (mid_lng, tile.max_lng)):
        for min_lat, max_lat in ((tile.min_lat, mid_lat), (mid_lat, tile.max_lat)):
            center_lng = (min_lng + max_lng) / 2
            center_lat = (min_lat + max_lat) / 2
            children.append(
                Tile(
                    tile_id=make_tile_id(tile.scale + 1, tile.depth + 1, center_lng, center_lat),
                    parent_tile_id=tile.tile_id,
                    center_lng=center_lng,
                    center_lat=center_lat,
                    min_lng=min_lng,
                    min_lat=min_lat,
                    max_lng=max_lng,
                    max_lat=max_lat,
                    scale=tile.scale + 1,
                    depth=tile.depth + 1,
                )
            )
    return children


def tile_area_m2(tile: Tile) -> float:
    width_m = (
        (tile.max_lng - tile.min_lng)
        * METERS_PER_DEGREE_LAT
        * math.cos(math.radians(tile.center_lat))
    )
    height_m = (tile.max_lat - tile.min_lat) * METERS_PER_DEGREE_LAT
    return width_m * height_m


def can_split(tile: Tile, min_tile_area_m2: float, max_depth: int) -> bool:
    """面积小于 min_tile_area_m2 或达到 max_depth 时无条件停止细分。"""
    if tile.depth >= max_depth:
        return False
    return tile_area_m2(tile) >= min_tile_area_m2
```

- [ ] **Step 4: 运行确认通过**

```bash
uv run pytest tests/test_tiles.py -v
```

Expected: `8 passed`。

- [ ] **Step 5: 提交**

```bash
cd /Users/code.yang/Desktop/roadbook-monorepo
git add scripts/camp-import
git commit -m "feat(camp-import): pure tile geometry with quadtree split"
```

---

### Task 8: discover — TileStore 状态机(query_tiles.csv)

**Files:**
- Create: `scripts/camp-import/src/camp_import/discover.py`
- Test: `scripts/camp-import/tests/test_tile_store.py`

**Interfaces:**
- Consumes: Task 2 的 `write_csv_atomic`/`read_csv_rows`;Task 7 的 `Tile`
- Produces:
  - `TILE_FIELDNAMES`(上游文档 query_tiles.csv 的 20 列,顺序固定)
  - `STALE_RUNNING_SECONDS = 600`
  - `TileRow`(dataclass,字段同 TILE_FIELDNAMES;类方法 `from_tile(tile: Tile, province_code: str) -> TileRow`、`_from_csv(raw: dict) -> TileRow`;方法 `to_tile() -> Tile`)
  - `TileStore(path: Path, clock: Callable[[], float] = time.time)`:`rows() -> list[TileRow]`、`get(tile_id) -> TileRow | None`、`add(row) -> bool`(重复 tile_id 返回 False)、`save()`、`next_pending() -> TileRow | None`(按插入序返回首个 pending/retry)、`reset_stale_running() -> int`、`requeue_failed() -> int`、`mark_running(row)`、`mark_done(row)`、`mark_retry(row)`、`mark_failed(row, last_error)`。
  - 状态机:`pending → running → done/retry/failed`;`retry → running`;所有 mark_* 落盘(经 `write_csv_atomic`)

- [ ] **Step 1: 写失败测试**

创建 `scripts/camp-import/tests/test_tile_store.py`:

```python
from camp_import.discover import (
    STALE_RUNNING_SECONDS,
    TILE_FIELDNAMES,
    TileRow,
    TileStore,
)
import itertools

from camp_import.tiles import tile_from_center

_center_seq = itertools.count()


def make_row(_label="", **overrides):
    # 每次调用取一个新的中心点:tile_id 由中心坐标推导,保证唯一且确定
    tile = tile_from_center(
        104.0 + next(_center_seq) * 0.01, 30.6, 40000.0, 30000.0, scale=11
    )
    row = TileRow.from_tile(tile, province_code="510000")
    for key, value in overrides.items():
        setattr(row, key, value)
    return row


def test_fieldnames_match_upstream_contract():
    assert TILE_FIELDNAMES == [
        "province_code", "tile_id", "parent_tile_id", "center_lng", "center_lat",
        "old_lng", "old_lat", "min_lng", "min_lat", "max_lng", "max_lat",
        "scale", "depth", "status", "attempts",
        "discovered_count", "new_id_count", "last_error", "started_at", "updated_at",
    ]


def test_add_save_reload_preserves_types(tmp_path):
    path = tmp_path / "query_tiles.csv"
    store = TileStore(path)
    row = make_row("a")
    assert store.add(row) is True
    store.save()

    reloaded = TileStore(path)
    got = reloaded.get(row.tile_id)
    assert got is not None
    assert got.center_lng == row.center_lng  # float,不是 str
    assert got.scale == 11 and got.depth == 0  # int
    assert got.status == "pending"
    assert got.attempts == 0


def test_add_duplicate_tile_id_returns_false(tmp_path):
    store = TileStore(tmp_path / "t.csv")
    row = make_row("a")
    assert store.add(row) is True
    assert store.add(row) is False  # 同一个 tile_id，而非另造一个中心点
    assert len(store.rows()) == 1


def test_next_pending_returns_pending_and_retry_only(tmp_path):
    store = TileStore(tmp_path / "t.csv")
    done = make_row("done", status="done")
    failed = make_row("fail", status="failed")
    running = make_row("run", status="running")
    retry = make_row("retry", status="retry")
    for row in (done, failed, running, retry):
        store.add(row)
    assert store.next_pending() is retry
    retry.status = "done"
    assert store.next_pending() is None


def test_status_transitions_persist(tmp_path):
    path = tmp_path / "t.csv"
    store = TileStore(path, clock=lambda: 1000.0)
    row = make_row("a")
    store.add(row)

    store.mark_running(row)
    assert row.status == "running"
    assert row.attempts == 1
    assert float(row.started_at) == 1000.0
    assert TileStore(path).get(row.tile_id).status == "running"  # 已落盘

    store.mark_done(row)
    assert TileStore(path).get(row.tile_id).status == "done"


def test_mark_failed_keeps_last_error(tmp_path):
    path = tmp_path / "t.csv"
    store = TileStore(path)
    row = make_row("a")
    store.add(row)
    store.mark_failed(row, "http 503")
    reloaded = TileStore(path).get(row.tile_id)
    assert reloaded.status == "failed"
    assert reloaded.last_error == "http 503"


def test_stale_running_reset_to_retry(tmp_path):
    path = tmp_path / "t.csv"
    store = TileStore(path, clock=lambda: 1000.0)
    stale = make_row("stale", status="running", started_at="399.0")   # 601 秒前
    fresh = make_row("fresh", status="running", started_at="500.0")   # 500 秒前
    idle = make_row("idle", status="pending")
    for row in (stale, fresh, idle):
        store.add(row)

    assert store.reset_stale_running() == 1
    assert stale.status == "retry"
    assert fresh.status == "running"
    assert idle.status == "pending"
    assert TileStore(path).get(stale.tile_id).status == "retry"  # 已落盘


def test_failed_can_be_explicitly_requeued(tmp_path):
    store = TileStore(tmp_path / "t.csv")
    failed = make_row("failed", status="failed")
    store.add(failed)
    assert store.requeue_failed() == 1
    assert store.next_pending() is failed


def test_resume_from_disk_continues_where_left_off(tmp_path):
    path = tmp_path / "t.csv"
    store = TileStore(path)
    store.add(make_row("a", status="done"))
    store.add(make_row("b"))
    store.save()

    resumed = TileStore(path)
    nxt = resumed.next_pending()
    assert nxt is not None and nxt.status == "pending"
    assert resumed.get(nxt.tile_id).tile_id != store.rows()[0].tile_id
```

- [ ] **Step 2: 运行确认失败**

```bash
uv run pytest tests/test_tile_store.py -v
```

Expected: FAIL,`ModuleNotFoundError: No module named 'camp_import.discover'`。

- [ ] **Step 3: 实现**

创建 `scripts/camp-import/src/camp_import/discover.py`:

```python
"""discover:tile 状态机与调度引擎。

状态机:pending → running → done/retry/failed;启动时 stale running 重置为 retry。
所有落盘经 common.write_csv_atomic(tmp + 原子 rename)。
"""
from __future__ import annotations

import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Callable

from camp_import import common
from camp_import.tiles import Tile

STALE_RUNNING_SECONDS = 600

TILE_FIELDNAMES = [
    "province_code", "tile_id", "parent_tile_id", "center_lng", "center_lat",
    "old_lng", "old_lat", "min_lng", "min_lat", "max_lng", "max_lat",
    "scale", "depth", "status", "attempts",
    "discovered_count", "new_id_count", "last_error", "started_at", "updated_at",
]


@dataclass
class TileRow:
    province_code: str
    tile_id: str
    parent_tile_id: str
    center_lng: float
    center_lat: float
    old_lng: float
    old_lat: float
    min_lng: float
    min_lat: float
    max_lng: float
    max_lat: float
    scale: int
    depth: int
    status: str = "pending"
    attempts: int = 0
    discovered_count: int = 0
    new_id_count: int = 0
    last_error: str = ""
    started_at: str = ""  # unix 秒(字符串存储,空串表示未开始)
    updated_at: str = ""

    _INT_FIELDS = ("scale", "depth", "attempts", "discovered_count", "new_id_count")
    _FLOAT_FIELDS = (
        "center_lng", "center_lat", "old_lng", "old_lat",
        "min_lng", "min_lat", "max_lng", "max_lat",
    )

    @classmethod
    def from_tile(cls, tile: Tile, province_code: str) -> "TileRow":
        return cls(
            province_code=province_code,
            tile_id=tile.tile_id,
            parent_tile_id=tile.parent_tile_id or "",
            center_lng=tile.center_lng,
            center_lat=tile.center_lat,
            old_lng=tile.center_lng,
            old_lat=tile.center_lat,
            min_lng=tile.min_lng,
            min_lat=tile.min_lat,
            max_lng=tile.max_lng,
            max_lat=tile.max_lat,
            scale=tile.scale,
            depth=tile.depth,
        )

    @classmethod
    def _from_csv(cls, raw: dict) -> "TileRow":
        kwargs = {}
        for name in TILE_FIELDNAMES:
            value = raw.get(name, "")
            if name in cls._INT_FIELDS:
                kwargs[name] = int(value or 0)
            elif name in cls._FLOAT_FIELDS:
                kwargs[name] = float(value)
            else:
                kwargs[name] = value
        return cls(**kwargs)

    def to_tile(self) -> Tile:
        return Tile(
            tile_id=self.tile_id,
            parent_tile_id=self.parent_tile_id or None,
            center_lng=self.center_lng,
            center_lat=self.center_lat,
            min_lng=self.min_lng,
            min_lat=self.min_lat,
            max_lng=self.max_lng,
            max_lat=self.max_lat,
            scale=self.scale,
            depth=self.depth,
        )


class TileStore:
    """query_tiles.csv 的读写与状态机。"""

    def __init__(self, path: Path, clock: Callable[[], float] = time.time):
        self._path = path
        self._clock = clock
        self._rows: dict[str, TileRow] = {}
        for raw in common.read_csv_rows(path):
            row = TileRow._from_csv(raw)
            self._rows[row.tile_id] = row

    def rows(self) -> list[TileRow]:
        return list(self._rows.values())

    def get(self, tile_id: str) -> TileRow | None:
        return self._rows.get(tile_id)

    def add(self, row: TileRow) -> bool:
        if row.tile_id in self._rows:
            return False
        self._rows[row.tile_id] = row
        return True

    def save(self) -> None:
        common.write_csv_atomic(
            self._path, TILE_FIELDNAMES, (asdict(r) for r in self._rows.values())
        )

    def next_pending(self) -> TileRow | None:
        for row in self._rows.values():
            if row.status in ("pending", "retry"):
                return row
        return None

    def reset_stale_running(self) -> int:
        """running 且 started_at 超过 10 分钟的 tile 重置为 retry(断点恢复)。"""
        now = self._clock()
        count = 0
        for row in self._rows.values():
            if (
                row.status == "running"
                and row.started_at
                and now - float(row.started_at) > STALE_RUNNING_SECONDS
            ):
                row.status = "retry"
                row.updated_at = f"{now:.3f}"
                count += 1
        if count:
            self.save()
        return count

    def requeue_failed(self) -> int:
        """仅由显式 CLI 选项调用；避免普通重启无限重试永久失败任务。"""
        count = 0
        for row in self._rows.values():
            if row.status == "failed":
                row.status = "retry"
                self._touch(row)
                count += 1
        if count:
            self.save()
        return count

    def _touch(self, row: TileRow) -> None:
        row.updated_at = f"{self._clock():.3f}"

    def mark_running(self, row: TileRow) -> None:
        row.status = "running"
        row.attempts += 1
        row.started_at = f"{self._clock():.3f}"
        self._touch(row)
        self.save()

    def mark_done(self, row: TileRow) -> None:
        row.status = "done"
        self._touch(row)
        self.save()

    def mark_retry(self, row: TileRow) -> None:
        row.status = "retry"
        self._touch(row)
        self.save()

    def mark_failed(self, row: TileRow, last_error: str) -> None:
        row.status = "failed"
        row.last_error = last_error
        self._touch(row)
        self.save()
```

- [ ] **Step 4: 运行确认通过**

```bash
uv run pytest tests/test_tile_store.py -v
```

Expected: `8 passed`。

- [ ] **Step 5: 提交**

```bash
cd /Users/code.yang/Desktop/roadbook-monorepo
git add scripts/camp-import
git commit -m "feat(camp-import): tile state machine with stale-running recovery"
```

---

### Task 9: discover — DiscoverEngine(去重、条件细分、剪枝、空格抽样)

**Files:**
- Modify: `scripts/camp-import/src/camp_import/discover.py`(追加)
- Modify: `scripts/camp-import/tests/conftest.py`(追加 `camps_response`)
- Test: `scripts/camp-import/tests/test_discover_engine.py`

**Interfaces:**
- Consumes: Task 3 `ApiRequest`/`FakeTransport`、Task 5 `RetryExhausted`、Task 6 `FieldMapping`/`extract_path`/`ContractViolation`、Task 7 `can_split`/`split_tile`/`tile_from_center`、Task 8 `TileStore`/`TileRow`
- Produces:
  - `GET_CAMPS_URL = "https://55camp.cn/api/index/getCamps"`
  - `build_camps_request(row: TileRow, mapping: FieldMapping) -> ApiRequest`（参数键来自 `mapping` 的 `list_*_param`，不得硬编码）
  - `DiscoverEngine(mapping: FieldMapping, transport: Transport, store: TileStore, raw_camps_path: Path, min_tile_area_m2: float, max_depth: int, rng: random.Random | None = None, clock: Callable[[], float] = time.time)`
    - `seed(centers: list[tuple[float, float]], province_code: str) -> None`
    - `run() -> None`(stale 重置 → 主循环 → 空格抽样 → 二次循环)
    - 属性 `seen_ids: set[str]`(初始化时从已有 raw JSONL 重建,断点恢复去重不丢)
  - 细分规则:触发 = `discovered_count >= response_item_limit × dense_ratio` 或截断信号或(depth>0 且 new_id_count>0);剪枝 = 本级与父级 `new_id_count` 均为 0;边界 = `can_split` 为 False 无条件停止。
  - 边缘扩展：当 item 坐标命中 tile 任意边缘的 `edge_margin_ratio`，按命中方向创建相邻 tile（角落创建对角 tile）；格点步长使用该 scale 的实测 viewport 与 overlap。无边界中心种子以 `edge_expansion_max_hops` 限制连续同 scale 的父链长度。相邻 tile 必须经 `TileStore.add` 去重，且需有正向/角落/达到 hop 上限三类测试。
  - 传给引擎的 transport 应是已装饰好的(限流+重试);引擎只捕获 `RetryExhausted` → `mark_failed`
  - `ContractViolation` 不捕获,直接向上传播(中止运行,不猜测字段)

- [ ] **Step 1: conftest 追加罐头响应工厂**

在 `scripts/camp-import/tests/conftest.py` 末尾追加:

```python
def camps_response(ids, lng=104.0, lat=30.6, truncated=None):
    """构造符合 VALID_MAPPING 契约形状的 getCamps 罐头响应。"""
    from camp_import.common import ApiResponse

    items = [{"id": i, "longitude": lng, "latitude": lat} for i in ids]
    body = {"data": {"list": items}}
    if truncated is not None:
        body["data"]["truncated"] = truncated
    return ApiResponse(status_code=200, headers={}, body=body)
```

- [ ] **Step 2: 写失败测试**

创建 `scripts/camp-import/tests/test_discover_engine.py`:

```python
import pytest

from camp_import.common import FakeTransport, RetryExhausted, append_jsonl, read_jsonl
from camp_import.discover import (
    GET_CAMPS_URL,
    DiscoverEngine,
    TileRow,
    TileStore,
    build_camps_request,
)
from camp_import.field_mapping import ContractViolation
from camp_import.tiles import tile_from_center
from conftest import camps_response, make_mapping

MIN_AREA = 250_000.0
MAX_DEPTH = 8


def make_engine(tmp_path, mapping, script, seed_centers=((104.0, 30.6),)):
    store = TileStore(tmp_path / "query_tiles.csv")
    engine = DiscoverEngine(
        mapping=mapping,
        transport=FakeTransport(script),
        store=store,
        raw_camps_path=tmp_path / "camps.jsonl",
        min_tile_area_m2=MIN_AREA,
        max_depth=MAX_DEPTH,
    )
    engine.seed([tuple(c) for c in seed_centers], "510000")
    return engine, store


def test_build_camps_request_params():
    tile = tile_from_center(104.0, 30.6, 40000.0, 30000.0, scale=11)
    row = TileRow.from_tile(tile, "510000")
    request = build_camps_request(row, make_mapping())
    assert request.method == "GET"
    assert request.url == GET_CAMPS_URL
    assert request.params == {
        "lnt": "104.000000",
        "lat": "30.600000",
        "oldlnt": "104.000000",
        "oldlat": "30.600000",
        "scale": "11",
    }


def test_seed_creates_pending_tiles_from_measured_viewport(tmp_path):
    engine, store = make_engine(
        tmp_path, make_mapping(), [], seed_centers=[(104.0, 30.6), (105.0, 31.0)]
    )
    rows = store.rows()
    assert len(rows) == 2
    assert all(r.status == "pending" and r.scale == 11 and r.depth == 0 for r in rows)
    assert rows[0].min_lng < 104.0 < rows[0].max_lng


def test_process_appends_raw_and_marks_done(tmp_path):
    engine, store = make_engine(tmp_path, make_mapping(), [camps_response(["1", "2"])])
    engine.run()
    row = store.rows()[0]
    assert row.status == "done"
    assert row.discovered_count == 2
    assert row.new_id_count == 2
    assert engine.seen_ids == {"1", "2"}
    records = read_jsonl(tmp_path / "camps.jsonl")
    assert len(records) == 1
    assert records[0]["tile_id"] == row.tile_id
    assert records[0]["status_code"] == 200
    assert records[0]["params"]["scale"] == "11"
    assert records[0]["response"]["data"]["list"][0]["id"] == "1"


def test_dedup_across_tiles(tmp_path):
    engine, store = make_engine(
        tmp_path,
        make_mapping(),
        [camps_response(["1", "2"]), camps_response(["2", "3"])],
        seed_centers=[(104.0, 30.6), (105.0, 31.0)],
    )
    engine.run()
    first, second = store.rows()
    assert first.new_id_count == 2
    assert second.discovered_count == 2
    assert second.new_id_count == 1  # "2" 已见过
    assert engine.seen_ids == {"1", "2", "3"}


def test_duplicate_ids_within_one_response_count_once_as_new(tmp_path):
    engine, store = make_engine(tmp_path, make_mapping(), [camps_response(["1", "1", "2"])])
    engine.run()
    assert store.rows()[0].discovered_count == 3
    assert store.rows()[0].new_id_count == 2


def test_dense_response_triggers_quadtree_split(tmp_path):
    # limit=5, dense_ratio=0.8 → 阈值 4;子格返回空
    mapping = make_mapping(response_item_limit=5)
    script = [camps_response(["1", "2", "3", "4"])] + [camps_response([])] * 4
    engine, store = make_engine(tmp_path, mapping, script)
    engine.run()
    rows = store.rows()
    assert len(rows) == 5
    root = rows[0]
    children = [r for r in rows if r.parent_tile_id == root.tile_id]
    assert len(children) == 4
    assert all(r.status == "done" for r in rows)
    assert all(c.depth == 1 for c in children)


def test_truncation_signal_triggers_split(tmp_path):
    mapping = make_mapping(truncation_signal_path="data.truncated")
    script = [camps_response(["1"], truncated=True)] + [camps_response([])] * 4
    engine, store = make_engine(tmp_path, mapping, script)
    engine.run()
    assert len(store.rows()) == 5  # 未达密度阈值,仅凭截断信号细分


def test_child_still_finding_new_ids_splits_again(tmp_path):
    mapping = make_mapping(response_item_limit=5)
    # 处理顺序:root → c1 → c2 → c3 → c4 → c1 的四个孙格
    script = (
        [camps_response(["1", "2", "3", "4"])]  # root 密集 → 细分
        + [camps_response(["100"])]              # c1 仍有新增 → 再细分
        + [camps_response([])] * 3               # c2-c4 空
        + [camps_response([])] * 4               # c1 的孙格空
    )
    engine, store = make_engine(tmp_path, mapping, script)
    engine.run()
    rows = store.rows()
    assert len(rows) == 9
    assert len([r for r in rows if r.depth == 2]) == 4
    assert all(r.status == "done" for r in rows)


def test_two_levels_no_new_prunes_even_when_dense(tmp_path):
    # 每层都返回同样 4 个 ID(达密度阈值但全是重复):
    # root(新增4)→ 细分;子格(新增0,父新增4)→ 仍细分;孙格(新增0,父新增0)→ 剪枝停止
    mapping = make_mapping(response_item_limit=5, empty_sample_ratio=0.0)
    script = [camps_response(["1", "2", "3", "4"])] * 21  # 1 + 4 + 16
    engine, store = make_engine(tmp_path, mapping, script)
    engine.run()
    rows = store.rows()
    assert len(rows) == 21
    assert max(r.depth for r in rows) == 2
    assert all(r.status == "done" for r in rows)


def test_empty_sampling_forces_split_and_resumes_on_new_ids(tmp_path):
    # 与上一测试相同的三层结构,但 empty_sample_ratio=1.0:
    # 16 个被剪枝孙格全部强制细分一层(64 个曾孙格);
    # 第一个曾孙格发现新 ID "99" → 该区域回退正常细分(再拆 4 个)。
    mapping = make_mapping(response_item_limit=5, empty_sample_ratio=1.0)
    script = (
        [camps_response(["1", "2", "3", "4"])] * 5   # root + 4 子格(密集,全重复)
        + [camps_response([])] * 16                   # 16 孙格:空 → 剪枝
        + [camps_response(["99"])]                    # 第 1 个被抽样曾孙格:新增
        + [camps_response([])] * 67                   # 其余 63 曾孙格 + "99" 格的 4 个子格
    )
    engine, store = make_engine(tmp_path, mapping, script)
    engine.run()
    rows = store.rows()
    assert len(rows) == 89  # 1 + 4 + 16 + 64 + 4
    assert len([r for r in rows if r.depth == 3]) == 64
    assert len([r for r in rows if r.depth == 4]) == 4
    assert "99" in engine.seen_ids
    assert all(r.status == "done" for r in rows)


def test_retry_exhausted_marks_failed_with_last_error(tmp_path):
    class ExhaustedTransport:
        def send(self, request):
            raise RetryExhausted("http 503")

    store = TileStore(tmp_path / "query_tiles.csv")
    engine = DiscoverEngine(
        mapping=make_mapping(),
        transport=ExhaustedTransport(),
        store=store,
        raw_camps_path=tmp_path / "camps.jsonl",
        min_tile_area_m2=MIN_AREA,
        max_depth=MAX_DEPTH,
    )
    engine.seed([(104.0, 30.6)], "510000")
    engine.run()
    row = store.rows()[0]
    assert row.status == "failed"
    assert row.last_error == "http 503"
    assert read_jsonl(tmp_path / "camps.jsonl") == []


def test_unknown_response_structure_aborts(tmp_path):
    from camp_import.common import ApiResponse

    bad = ApiResponse(status_code=200, headers={}, body={"data": {"rows": []}})
    engine, store = make_engine(tmp_path, make_mapping(), [bad])
    with pytest.raises(ContractViolation):
        engine.run()
    # 原始响应已留档(先落盘再解析);tile 停在 running,等待人工排查/stale 重置
    assert len(read_jsonl(tmp_path / "camps.jsonl")) == 1
    assert store.rows()[0].status == "running"


def test_configured_truncation_path_missing_aborts(tmp_path):
    engine, _ = make_engine(
        tmp_path,
        make_mapping(truncation_signal_path="data.truncated"),
        [camps_response(["1"])],
    )
    with pytest.raises(ContractViolation):
        engine.run()


def test_edge_hit_creates_adjacent_tile_and_honors_hop_limit(tmp_path):
    mapping = make_mapping(edge_margin_ratio=0.1, edge_expansion_max_hops=1)
    # 命中根 tile 东边界，创建一个同 scale 的东侧相邻 tile；该 tile 再命中边缘时不得继续外扩。
    engine, store = make_engine(
        tmp_path,
        mapping,
        [camps_response(["1"], lng=104.19)] + [camps_response(["2"], lng=104.39)],
    )
    engine.run()
    assert len([r for r in store.rows() if r.scale == mapping.seed_scale]) == 2


def test_resume_rebuilds_seen_ids_from_raw_jsonl(tmp_path):
    raw_path = tmp_path / "camps.jsonl"
    append_jsonl(
        raw_path,
        {
            "tile_id": "old",
            "params": {},
            "fetched_at": 0,
            "status_code": 200,
            "response": camps_response(["1", "2"]).body,
        },
    )
    engine, store = make_engine(tmp_path, make_mapping(), [camps_response(["1", "2", "3"])])
    assert engine.seen_ids == {"1", "2"}
    engine.run()
    assert store.rows()[0].new_id_count == 1  # 只有 "3" 是新的
```

- [ ] **Step 3: 运行确认失败**

```bash
uv run pytest tests/test_discover_engine.py -v
```

Expected: FAIL,`ImportError: cannot import name 'DiscoverEngine'`。

- [ ] **Step 4: 实现**

在 `scripts/camp-import/src/camp_import/discover.py` 顶部 import 区追加:

```python
import random

from camp_import.common import ApiRequest, ApiResponse, RetryExhausted, Transport
from camp_import.field_mapping import ContractViolation, FieldMapping, extract_path
from camp_import.tiles import can_split, grid_step_m, meters_to_degrees, split_tile, tile_from_center
```

文件末尾追加:

```python
GET_CAMPS_URL = "https://55camp.cn/api/index/getCamps"


def build_camps_request(row: TileRow, mapping: FieldMapping) -> ApiRequest:
    return ApiRequest(
        "GET",
        GET_CAMPS_URL,
        {
            mapping.list_lng_param: f"{row.center_lng:.6f}",
            mapping.list_lat_param: f"{row.center_lat:.6f}",
            mapping.list_old_lng_param: f"{row.old_lng:.6f}",
            mapping.list_old_lat_param: f"{row.old_lat:.6f}",
            mapping.list_scale_param: str(row.scale),
        },
    )


class DiscoverEngine:
    """tile 调度引擎:去重、条件细分、两级无新增剪枝、空格抽样假阴性校验。

    transport 传入前应已包好限流与重试装饰层;本引擎只处理 RetryExhausted。
    ContractViolation 不捕获:未知响应结构立即中止,不猜测字段。
    """

    def __init__(
        self,
        mapping: FieldMapping,
        transport: Transport,
        store: TileStore,
        raw_camps_path: Path,
        min_tile_area_m2: float,
        max_depth: int,
        rng: random.Random | None = None,
        clock: Callable[[], float] = time.time,
    ):
        self._mapping = mapping
        self._transport = transport
        self._store = store
        self._raw_path = raw_camps_path
        self._min_area = min_tile_area_m2
        self._max_depth = max_depth
        self._rng = rng or random.Random(0)
        self._clock = clock
        self.seen_ids: set[str] = set()
        self._rebuild_seen_ids()

    def _rebuild_seen_ids(self) -> None:
        """断点恢复:从已有 raw JSONL 严格重建去重集合。"""
        for record in common.read_jsonl(self._raw_path):
            items = extract_path(record["response"], self._mapping.list_items_path)
            self.seen_ids.update(
                str(extract_path(item, self._mapping.list_external_id_path))
                for item in items
            )

    def seed(self, centers: list[tuple[float, float]], province_code: str) -> None:
        width_m, height_m = self._mapping.viewport_for_scale(self._mapping.seed_scale)
        for lng, lat in centers:
            tile = tile_from_center(lng, lat, width_m, height_m, self._mapping.seed_scale)
            self._store.add(TileRow.from_tile(tile, province_code))
        self._store.save()

    def run(self) -> None:
        self._store.reset_stale_running()
        self._drain()
        self._sample_pruned_empty_tiles()
        self._drain()

    def _drain(self) -> None:
        while (row := self._store.next_pending()) is not None:
            self._process(row)

    def _process(self, row: TileRow) -> None:
        self._store.mark_running(row)
        request = build_camps_request(row, self._mapping)
        try:
            response = self._transport.send(request)
        except RetryExhausted as exc:
            self._store.mark_failed(row, exc.last_error)
            return
        common.append_jsonl(
            self._raw_path,
            {
                "tile_id": row.tile_id,
                "params": dict(request.params),
                "fetched_at": self._clock(),
                "status_code": response.status_code,
                "response": response.body,
            },
        )
        items = extract_path(response.body, self._mapping.list_items_path)
        ids = [
            str(extract_path(item, self._mapping.list_external_id_path)) for item in items
        ]
        unique_ids = list(dict.fromkeys(ids))
        new_ids = [i for i in unique_ids if i not in self.seen_ids]
        self.seen_ids.update(new_ids)
        row.discovered_count = len(ids)
        row.new_id_count = len(new_ids)
        if self._should_split(row, response):
            for child in split_tile(row.to_tile()):
                self._store.add(TileRow.from_tile(child, row.province_code))
        self._expand_edges(row, items)
        self._store.mark_done(row)

    def _should_split(self, row: TileRow, response: ApiResponse) -> bool:
        if not can_split(row.to_tile(), self._min_area, self._max_depth):
            return False  # 面积/深度边界:无条件停止
        if self._pruned_by_lineage(row):
            return False  # 连续两级无新增:剪枝
        if row.discovered_count >= self._mapping.response_item_limit * self._mapping.dense_ratio:
            return True
        if self._truncated(response):
            return True
        return row.depth > 0 and row.new_id_count > 0  # 细分后仍持续新增

    def _truncated(self, response: ApiResponse) -> bool:
        path = self._mapping.truncation_signal_path
        if not path:
            return False
        return bool(extract_path(response.body, path))

    def _pruned_by_lineage(self, row: TileRow) -> bool:
        """本级与父级 new_id_count 均为 0 → 沿血缘连续两级无新增。"""
        if row.new_id_count > 0 or not row.parent_tile_id:
            return False
        parent = self._store.get(row.parent_tile_id)
        return parent is not None and parent.new_id_count == 0

    def _edge_hops(self, row: TileRow) -> int:
        """只计连续的同 scale 邻居父链；四叉树子格不消耗边缘扩展额度。"""
        hops, current = 0, row
        while current.parent_tile_id:
            parent = self._store.get(current.parent_tile_id)
            if parent is None or parent.scale != current.scale:
                break
            hops += 1
            current = parent
        return hops

    def _expand_edges(self, row: TileRow, items: object) -> None:
        """中心种子的边缘命中向相邻 tile 扩展；无边界模式由 hop 上限封顶。"""
        if row.depth != 0 or self._edge_hops(row) >= self._mapping.edge_expansion_max_hops:
            return
        width = row.max_lng - row.min_lng
        height = row.max_lat - row.min_lat
        directions: set[tuple[int, int]] = set()
        for item in items:
            lng = float(extract_path(item, self._mapping.list_lng_path))
            lat = float(extract_path(item, self._mapping.list_lat_path))
            dx = -1 if lng - row.min_lng <= width * self._mapping.edge_margin_ratio else (1 if row.max_lng - lng <= width * self._mapping.edge_margin_ratio else 0)
            dy = -1 if lat - row.min_lat <= height * self._mapping.edge_margin_ratio else (1 if row.max_lat - lat <= height * self._mapping.edge_margin_ratio else 0)
            if dx or dy:
                directions.add((dx, dy))
        viewport_w, viewport_h = self._mapping.viewport_for_scale(row.scale)
        step_lng, step_lat = meters_to_degrees(
            grid_step_m(viewport_w, self._mapping.overlap_for_scale(row.scale)),
            grid_step_m(viewport_h, self._mapping.overlap_for_scale(row.scale)),
            row.center_lat,
        )
        for dx, dy in directions:
            neighbor = tile_from_center(
                row.center_lng + dx * step_lng,
                row.center_lat + dy * step_lat,
                viewport_w,
                viewport_h,
                row.scale,
                depth=0,
                parent_tile_id=row.tile_id,
            )
            self._store.add(TileRow.from_tile(neighbor, row.province_code))

    def _sample_pruned_empty_tiles(self) -> None:
        """假阴性校验:对被剪枝的空叶子格按 empty_sample_ratio 抽样,强制细分一层。
        若抽样子格发现新增 ID,_should_split 的"仍持续新增"规则会让该区域回退正常细分。"""
        parents = {r.parent_tile_id for r in self._store.rows() if r.parent_tile_id}
        candidates = [
            r
            for r in self._store.rows()
            if r.status == "done"
            and r.new_id_count == 0
            and r.tile_id not in parents  # 叶子
            and self._pruned_by_lineage(r)
            and can_split(r.to_tile(), self._min_area, self._max_depth)
        ]
        sample_size = min(
            len(candidates), round(len(candidates) * self._mapping.empty_sample_ratio)
        )
        if sample_size <= 0:
            return
        for row in self._rng.sample(candidates, sample_size):
            for child in split_tile(row.to_tile()):
                self._store.add(TileRow.from_tile(child, row.province_code))
        self._store.save()
```

- [ ] **Step 5: 运行确认通过**

```bash
uv run pytest tests/test_discover_engine.py -v
```

Expected: `12 passed`。

- [ ] **Step 6: 全量回归**

```bash
uv run pytest -v
```

Expected: 此前所有测试仍全部通过。

- [ ] **Step 7: 提交**

```bash
cd /Users/code.yang/Desktop/roadbook-monorepo
git add scripts/camp-import
git commit -m "feat(camp-import): discover engine with conditional split, pruning and empty sampling"
```

---

### Task 10: fetch_detail — 详情任务引擎(detail_tasks.csv)

**Files:**
- Create: `scripts/camp-import/src/camp_import/fetch_detail.py`
- Modify: `scripts/camp-import/tests/conftest.py`(追加 `detail_response`)
- Test: `scripts/camp-import/tests/test_fetch_detail.py`

**Interfaces:**
- Consumes: Task 2 CSV/JSONL 函数、Task 3 `ApiRequest`/`Transport`、Task 5 `RetryExhausted`、Task 6 `FieldMapping`/`extract_path`
- Produces:
  - `GET_CAMP_DETAIL_URL = "https://55camp.cn/api/index/getCampDetail"`
  - `DETAIL_FIELDNAMES = ["external_id", "lng", "lat", "status", "attempts", "last_error", "started_at", "updated_at"]`(上游契约,与 tile 状态完全分离)
  - `DetailTask`(dataclass,字段同上)
  - `DetailStore(path: Path, clock=time.time)`:`tasks()`、`get(external_id)`、`seed_tasks(camps: list[dict]) -> int`(camps 行含 `external_id/lng/lat`,已存在的 ID 跳过,返回新增数)、`next_pending()`、`reset_stale_running()`、`requeue_failed()`、`mark_running/mark_done/mark_failed`、`save()`
  - `build_detail_request(task: DetailTask, mapping: FieldMapping) -> ApiRequest`（参数键来自 `mapping` 的 `detail_*_param`）；详情响应中的 `detail_external_id_path` 必须与任务 ID 一致，否则抛 `ContractViolation`。
  - `DetailEngine(mapping, transport, store, raw_details_path: Path, clock=time.time)`,方法 `run()`

- [ ] **Step 1: conftest 追加详情罐头响应**

在 `scripts/camp-import/tests/conftest.py` 末尾追加:

```python
def detail_response(external_id, name="测试营地", address="四川省某地"):
    """构造符合 VALID_MAPPING 契约形状的 getCampDetail 罐头响应。"""
    from camp_import.common import ApiResponse

    return ApiResponse(
        status_code=200,
        headers={},
        body={"data": {"id": external_id, "name": name, "address": address}},
    )
```

- [ ] **Step 2: 写失败测试**

创建 `scripts/camp-import/tests/test_fetch_detail.py`:

```python
import pytest

from camp_import.common import ApiResponse, FakeTransport, RetryExhausted, read_jsonl
from camp_import.fetch_detail import (
    GET_CAMP_DETAIL_URL,
    DetailEngine,
    DetailStore,
    DetailTask,
    build_detail_request,
)
from camp_import.field_mapping import ContractViolation
from conftest import detail_response, make_mapping


def make_engine(tmp_path, script, store=None):
    store = store or DetailStore(tmp_path / "detail_tasks.csv")
    engine = DetailEngine(
        mapping=make_mapping(),
        transport=FakeTransport(script),
        store=store,
        raw_details_path=tmp_path / "details.jsonl",
    )
    return engine, store


def camp_row(external_id, lng="104.1", lat="30.7"):
    return {"external_id": external_id, "lng": lng, "lat": lat}


def test_build_detail_request_uses_list_coordinates():
    task = DetailTask(external_id="42", lng=104.1, lat=30.7)
    request = build_detail_request(task, make_mapping())
    assert request.method == "GET"
    assert request.url == GET_CAMP_DETAIL_URL
    assert request.params == {"id": "42", "lnt": "104.100000", "lat": "30.700000"}


def test_seed_tasks_is_idempotent(tmp_path):
    store = DetailStore(tmp_path / "detail_tasks.csv")
    added = store.seed_tasks([camp_row("1"), camp_row("2")])
    assert added == 2
    assert store.seed_tasks([camp_row("2"), camp_row("3")]) == 1
    assert {t.external_id for t in store.tasks()} == {"1", "2", "3"}
    assert all(t.status == "pending" for t in store.tasks())
    # 已落盘
    assert len(DetailStore(tmp_path / "detail_tasks.csv").tasks()) == 3


def test_run_fetches_details_and_marks_done(tmp_path):
    engine, store = make_engine(tmp_path, [detail_response("1"), detail_response("2")])
    store.seed_tasks([camp_row("1"), camp_row("2")])
    engine.run()
    assert all(t.status == "done" for t in store.tasks())
    records = read_jsonl(tmp_path / "details.jsonl")
    assert [r["external_id"] for r in records] == ["1", "2"]
    assert records[0]["response"]["data"]["name"] == "测试营地"
    assert records[0]["params"]["id"] == "1"


def test_done_tasks_not_refetched(tmp_path):
    path = tmp_path / "detail_tasks.csv"
    store = DetailStore(path)
    store.seed_tasks([camp_row("1"), camp_row("2")])
    store.mark_done(store.get("1"))

    engine, store = make_engine(tmp_path, [detail_response("2")], store=DetailStore(path))
    engine.run()
    # FakeTransport 脚本只有 1 条:已 done 的 "1" 未重发,否则脚本会耗尽报错
    assert store.get("1").status == "done"
    assert store.get("2").status == "done"


def test_retry_exhausted_marks_failed_with_last_error(tmp_path):
    class ExhaustedTransport:
        def send(self, request):
            raise RetryExhausted("network: reset")

    store = DetailStore(tmp_path / "detail_tasks.csv")
    store.seed_tasks([camp_row("1")])
    engine = DetailEngine(
        mapping=make_mapping(),
        transport=ExhaustedTransport(),
        store=store,
        raw_details_path=tmp_path / "details.jsonl",
    )
    engine.run()
    task = store.get("1")
    assert task.status == "failed"
    assert task.last_error == "network: reset"
    assert read_jsonl(tmp_path / "details.jsonl") == []


def test_unknown_detail_structure_aborts(tmp_path):
    bad = ApiResponse(status_code=200, headers={}, body={"result": {}})
    engine, store = make_engine(tmp_path, [bad])
    store.seed_tasks([camp_row("1")])
    with pytest.raises(ContractViolation):
        engine.run()
    assert len(read_jsonl(tmp_path / "details.jsonl")) == 1  # 原始响应已留档
    assert store.get("1").status == "running"


def test_detail_response_id_must_match_task(tmp_path):
    engine, store = make_engine(tmp_path, [detail_response("other")])
    store.seed_tasks([camp_row("1")])
    with pytest.raises(ContractViolation, match="external_id"):
        engine.run()


def test_stale_running_reset(tmp_path):
    path = tmp_path / "detail_tasks.csv"
    store = DetailStore(path, clock=lambda: 1000.0)
    store.seed_tasks([camp_row("1")])
    task = store.get("1")
    task.status = "running"
    task.started_at = "399.0"  # 601 秒前
    store.save()
    assert store.reset_stale_running() == 1
    assert task.status == "retry"


def test_failed_detail_can_be_explicitly_requeued(tmp_path):
    store = DetailStore(tmp_path / "detail_tasks.csv")
    store.seed_tasks([camp_row("1")])
    store.mark_failed(store.get("1"), "http 503")
    assert store.requeue_failed() == 1
    assert store.get("1").status == "retry"
```

- [ ] **Step 3: 运行确认失败**

```bash
uv run pytest tests/test_fetch_detail.py -v
```

Expected: FAIL,`ModuleNotFoundError: No module named 'camp_import.fetch_detail'`。

- [ ] **Step 4: 实现**

创建 `scripts/camp-import/src/camp_import/fetch_detail.py`:

```python
"""fetch_detail:详情任务引擎。

任务状态存 processed/detail_tasks.csv,与 tile 状态完全分离;
已成功获取详情的 ID 不再重复请求(幂等)。
"""
from __future__ import annotations

import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Callable

from camp_import import common
from camp_import.common import ApiRequest, RetryExhausted, Transport
from camp_import.field_mapping import ContractViolation, FieldMapping, extract_path

GET_CAMP_DETAIL_URL = "https://55camp.cn/api/index/getCampDetail"
STALE_RUNNING_SECONDS = 600

DETAIL_FIELDNAMES = [
    "external_id", "lng", "lat", "status", "attempts",
    "last_error", "started_at", "updated_at",
]


@dataclass
class DetailTask:
    external_id: str
    lng: float
    lat: float
    status: str = "pending"
    attempts: int = 0
    last_error: str = ""
    started_at: str = ""
    updated_at: str = ""

    @classmethod
    def _from_csv(cls, raw: dict) -> "DetailTask":
        return cls(
            external_id=raw.get("external_id", ""),
            lng=float(raw.get("lng") or 0.0),
            lat=float(raw.get("lat") or 0.0),
            status=raw.get("status") or "pending",
            attempts=int(raw.get("attempts") or 0),
            last_error=raw.get("last_error", ""),
            started_at=raw.get("started_at", ""),
            updated_at=raw.get("updated_at", ""),
        )


class DetailStore:
    """detail_tasks.csv 的读写与状态机(pending → running → done/retry/failed)。"""

    def __init__(self, path: Path, clock: Callable[[], float] = time.time):
        self._path = path
        self._clock = clock
        self._tasks: dict[str, DetailTask] = {}
        for raw in common.read_csv_rows(path):
            task = DetailTask._from_csv(raw)
            self._tasks[task.external_id] = task

    def tasks(self) -> list[DetailTask]:
        return list(self._tasks.values())

    def get(self, external_id: str) -> DetailTask | None:
        return self._tasks.get(str(external_id))

    def seed_tasks(self, camps: list[dict]) -> int:
        """按去重结果建任务;已存在的 external_id 跳过(幂等)。返回新增数。"""
        added = 0
        for camp in camps:
            external_id = str(camp["external_id"])
            if external_id in self._tasks:
                continue
            self._tasks[external_id] = DetailTask(
                external_id=external_id,
                lng=float(camp["lng"]),
                lat=float(camp["lat"]),
            )
            added += 1
        if added:
            self.save()
        return added

    def save(self) -> None:
        common.write_csv_atomic(
            self._path, DETAIL_FIELDNAMES, (asdict(t) for t in self._tasks.values())
        )

    def next_pending(self) -> DetailTask | None:
        for task in self._tasks.values():
            if task.status in ("pending", "retry"):
                return task
        return None

    def reset_stale_running(self) -> int:
        now = self._clock()
        count = 0
        for task in self._tasks.values():
            if (
                task.status == "running"
                and task.started_at
                and now - float(task.started_at) > STALE_RUNNING_SECONDS
            ):
                task.status = "retry"
                task.updated_at = f"{now:.3f}"
                count += 1
        if count:
            self.save()
        return count

    def requeue_failed(self) -> int:
        count = 0
        for task in self._tasks.values():
            if task.status == "failed":
                task.status = "retry"
                self._touch(task)
                count += 1
        if count:
            self.save()
        return count

    def _touch(self, task: DetailTask) -> None:
        task.updated_at = f"{self._clock():.3f}"

    def mark_running(self, task: DetailTask) -> None:
        task.status = "running"
        task.attempts += 1
        task.started_at = f"{self._clock():.3f}"
        self._touch(task)
        self.save()

    def mark_done(self, task: DetailTask) -> None:
        task.status = "done"
        self._touch(task)
        self.save()

    def mark_failed(self, task: DetailTask, last_error: str) -> None:
        task.status = "failed"
        task.last_error = last_error
        self._touch(task)
        self.save()


def build_detail_request(task: DetailTask, mapping: FieldMapping) -> ApiRequest:
    # 详情请求使用列表记录的坐标；参数名由已审核契约提供。
    return ApiRequest(
        "GET",
        GET_CAMP_DETAIL_URL,
        {
            mapping.detail_id_param: task.external_id,
            mapping.detail_lng_param: f"{task.lng:.6f}",
            mapping.detail_lat_param: f"{task.lat:.6f}",
        },
    )


class DetailEngine:
    """详情调度:transport 已含限流+重试;RetryExhausted → failed;
    未知响应结构(ContractViolation)直接向上传播,不猜测字段。"""

    def __init__(
        self,
        mapping: FieldMapping,
        transport: Transport,
        store: DetailStore,
        raw_details_path: Path,
        clock: Callable[[], float] = time.time,
    ):
        self._mapping = mapping
        self._transport = transport
        self._store = store
        self._raw_path = raw_details_path
        self._clock = clock

    def run(self) -> None:
        self._store.reset_stale_running()
        while (task := self._store.next_pending()) is not None:
            self._process(task)

    def _process(self, task: DetailTask) -> None:
        self._store.mark_running(task)
        request = build_detail_request(task, self._mapping)
        try:
            response = self._transport.send(request)
        except RetryExhausted as exc:
            self._store.mark_failed(task, exc.last_error)
            return
        common.append_jsonl(
            self._raw_path,
            {
                "external_id": task.external_id,
                "params": dict(request.params),
                "fetched_at": self._clock(),
                "status_code": response.status_code,
                "response": response.body,
            },
        )
        response_id = str(extract_path(response.body, self._mapping.detail_external_id_path))
        if response_id != task.external_id:
            raise ContractViolation(
                f"detail external_id mismatch: task={task.external_id}, response={response_id}"
            )
        self._store.mark_done(task)
```

- [ ] **Step 5: 运行确认通过**

```bash
uv run pytest tests/test_fetch_detail.py -v
```

Expected: `7 passed`。

- [ ] **Step 6: 提交**

```bash
cd /Users/code.yang/Desktop/roadbook-monorepo
git add scripts/camp-import
git commit -m "feat(camp-import): detail task engine with idempotent scheduling"
```

---

### Task 11: normalize — 去重、详情合并、camps_enriched.csv

**Files:**
- Create: `scripts/camp-import/src/camp_import/normalize.py`
- Test: `scripts/camp-import/tests/test_normalize.py`

**Interfaces:**
- Consumes: Task 2 `read_jsonl`/`write_csv_atomic`、Task 6 `FieldMapping`/`extract_path`/`ContractViolation`
- Produces:
  - `SOURCE = "55camp"`
  - `DEDUP_FIELDNAMES = ["external_id", "lng", "lat", "source_tile_id", "fetched_at", "raw_hash"]`
  - `ENRICHED_FIELDNAMES = ["external_id", "name", "lat", "lng", "address", "province_code", "city_code", "district_code", "source", "coordinate_system", "detail_fetched_at", "raw_hash"]`
  - `raw_hash(item: object) -> str`(canonical JSON 的 sha256 hex,键序无关)
  - `dedup_camps(raw_records: list[dict], mapping) -> list[dict]`(首次出现胜出,按 external_id 排序)
  - `merge_details(dedup_rows, detail_records, mapping, province_code) -> list[dict]`
  - `run_normalize(province_dir: Path, mapping, province_code: str) -> None`(读 `raw/*.jsonl`,写 `processed/camps_dedup.csv` 与 `processed/camps_enriched.csv`)

- [ ] **Step 1: 写失败测试**

创建 `scripts/camp-import/tests/test_normalize.py`:

```python
import pytest

from camp_import.common import append_jsonl
from camp_import.field_mapping import ContractViolation
from camp_import.normalize import (
    DEDUP_FIELDNAMES,
    ENRICHED_FIELDNAMES,
    dedup_camps,
    merge_details,
    raw_hash,
    run_normalize,
)
from conftest import camps_response, detail_response, make_mapping


def camps_record(ids, tile_id="t1", fetched_at=100.0):
    return {
        "tile_id": tile_id,
        "params": {},
        "fetched_at": fetched_at,
        "status_code": 200,
        "response": camps_response(ids).body,
    }


def detail_record(external_id, fetched_at=200.0, **kwargs):
    return {
        "external_id": external_id,
        "params": {},
        "fetched_at": fetched_at,
        "status_code": 200,
        "response": detail_response(external_id, **kwargs).body,
    }


def test_raw_hash_stable_regardless_of_key_order():
    assert raw_hash({"a": 1, "b": [2, 3]}) == raw_hash({"b": [2, 3], "a": 1})
    assert raw_hash({"a": 1}) != raw_hash({"a": 2})


def test_dedup_first_occurrence_wins_and_output_sorted():
    mapping = make_mapping()
    records = [
        camps_record(["9", "2"], tile_id="t1"),
        camps_record(["2", "1"], tile_id="t2"),
    ]
    rows = dedup_camps(records, mapping)
    assert [r["external_id"] for r in rows] == ["1", "2", "9"]
    by_id = {r["external_id"]: r for r in rows}
    assert by_id["2"]["source_tile_id"] == "t1"  # 首次出现胜出
    assert by_id["1"]["source_tile_id"] == "t2"
    assert set(rows[0]) == set(DEDUP_FIELDNAMES)


def test_merge_fills_detail_fields_and_coordinate_system():
    mapping = make_mapping()
    dedup_rows = dedup_camps([camps_record(["1"])], mapping)
    enriched = merge_details(
        dedup_rows, [detail_record("1", name="鹿溪营地", address="龙泉驿")],
        mapping, province_code="510000",
    )
    row = enriched[0]
    assert set(row) == set(ENRICHED_FIELDNAMES)
    assert row["name"] == "鹿溪营地"
    assert row["address"] == "龙泉驿"
    assert row["source"] == "55camp"
    assert row["coordinate_system"] == "gcj02"
    assert row["province_code"] == "510000"
    assert row["detail_fetched_at"] == 200.0
    assert row["city_code"] == "" and row["district_code"] == ""  # 后处理阶段补齐
    assert row["raw_hash"] == raw_hash(detail_response("1", name="鹿溪营地", address="龙泉驿").body)


def test_camp_without_detail_keeps_list_hash_and_blank_fields():
    mapping = make_mapping()
    dedup_rows = dedup_camps([camps_record(["1"])], mapping)
    enriched = merge_details(dedup_rows, [], mapping, province_code="510000")
    row = enriched[0]
    assert row["name"] == "" and row["address"] == ""
    assert row["detail_fetched_at"] == ""
    assert row["raw_hash"] == dedup_rows[0]["raw_hash"]  # 回退列表 item 的哈希


def test_configured_detail_path_missing_aborts_normalize():
    mapping = make_mapping(detail_name_path="data.missing")
    dedup_rows = dedup_camps([camps_record(["1"])], mapping)
    with pytest.raises(ContractViolation):
        merge_details(dedup_rows, [detail_record("1")], mapping, province_code="510000")


def test_run_normalize_writes_both_csvs_and_is_idempotent(tmp_path):
    mapping = make_mapping()
    province_dir = tmp_path / "510000"
    append_jsonl(province_dir / "raw" / "camps.jsonl", camps_record(["1", "2"]))
    append_jsonl(province_dir / "raw" / "details.jsonl", detail_record("1"))

    run_normalize(province_dir, mapping, "510000")
    dedup_path = province_dir / "processed" / "camps_dedup.csv"
    enriched_path = province_dir / "processed" / "camps_enriched.csv"
    assert dedup_path.exists() and enriched_path.exists()
    first_dedup = dedup_path.read_bytes()
    first_enriched = enriched_path.read_bytes()
    assert b"coordinate_system" in first_enriched

    run_normalize(province_dir, mapping, "510000")  # 重跑幂等:输出字节一致
    assert dedup_path.read_bytes() == first_dedup
    assert enriched_path.read_bytes() == first_enriched
```

- [ ] **Step 2: 运行确认失败**

```bash
uv run pytest tests/test_normalize.py -v
```

Expected: FAIL,`ModuleNotFoundError: No module named 'camp_import.normalize'`。

- [ ] **Step 3: 实现**

创建 `scripts/camp-import/src/camp_import/normalize.py`:

```python
"""normalize:raw JSONL → camps_dedup.csv → 合并详情 → camps_enriched.csv。

阶段一不做坐标转换,coordinate_system 原样标注;
行政区 city/district 留空,由后处理阶段补齐。
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from camp_import import common
from camp_import.field_mapping import ContractViolation, FieldMapping, extract_path

SOURCE = "55camp"

DEDUP_FIELDNAMES = ["external_id", "lng", "lat", "source_tile_id", "fetched_at", "raw_hash"]

ENRICHED_FIELDNAMES = [
    "external_id", "name", "lat", "lng", "address",
    "province_code", "city_code", "district_code",
    "source", "coordinate_system", "detail_fetched_at", "raw_hash",
]


def raw_hash(item: object) -> str:
    """原始 JSON 的内容摘要:canonical 序列化(键排序)后 sha256,用于发现源数据变化。"""
    canonical = json.dumps(item, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def dedup_camps(raw_records: list[dict], mapping: FieldMapping) -> list[dict]:
    """按 external_id 去重,首次出现的记录胜出;输出按 external_id 排序保证重跑幂等。"""
    result: dict[str, dict] = {}
    for record in raw_records:
        items = extract_path(record["response"], mapping.list_items_path)
        for item in items:
            external_id = str(extract_path(item, mapping.list_external_id_path))
            if external_id in result:
                continue
            result[external_id] = {
                "external_id": external_id,
                "lng": extract_path(item, mapping.list_lng_path),
                "lat": extract_path(item, mapping.list_lat_path),
                "source_tile_id": record.get("tile_id", ""),
                "fetched_at": record.get("fetched_at", ""),
                "raw_hash": raw_hash(item),
            }
    return sorted(result.values(), key=lambda row: row["external_id"])


def _optional(body: object, path: str | None) -> str:
    if not path:
        return ""
    return str(extract_path(body, path))


def merge_details(
    dedup_rows: list[dict],
    detail_records: list[dict],
    mapping: FieldMapping,
    province_code: str,
) -> list[dict]:
    details: dict[str, dict] = {}
    for record in detail_records:
        details.setdefault(str(record["external_id"]), record)
    enriched = []
    for row in dedup_rows:
        detail = details.get(row["external_id"])
        name = address = ""
        detail_fetched_at = ""
        content_hash = row["raw_hash"]
        if detail is not None:
            detail_fetched_at = detail.get("fetched_at", "")
            content_hash = raw_hash(detail["response"])
            name = _optional(detail["response"], mapping.detail_name_path)
            address = _optional(detail["response"], mapping.detail_address_path)
        enriched.append({
            "external_id": row["external_id"],
            "name": name,
            "lat": row["lat"],
            "lng": row["lng"],
            "address": address,
            "province_code": province_code,
            "city_code": "",
            "district_code": "",
            "source": SOURCE,
            "coordinate_system": mapping.coordinate_system,
            "detail_fetched_at": detail_fetched_at,
            "raw_hash": content_hash,
        })
    return enriched


def run_normalize(province_dir: Path, mapping: FieldMapping, province_code: str) -> None:
    camps_records = common.read_jsonl(province_dir / "raw" / "camps.jsonl")
    detail_records = common.read_jsonl(province_dir / "raw" / "details.jsonl")
    dedup_rows = dedup_camps(camps_records, mapping)
    common.write_csv_atomic(
        province_dir / "processed" / "camps_dedup.csv", DEDUP_FIELDNAMES, dedup_rows
    )
    enriched = merge_details(dedup_rows, detail_records, mapping, province_code)
    common.write_csv_atomic(
        province_dir / "processed" / "camps_enriched.csv", ENRICHED_FIELDNAMES, enriched
    )
```

- [ ] **Step 4: 运行确认通过**

```bash
uv run pytest tests/test_normalize.py -v
```

Expected: `5 passed`。

- [ ] **Step 5: 提交**

```bash
cd /Users/code.yang/Desktop/roadbook-monorepo
git add scripts/camp-import
git commit -m "feat(camp-import): normalize with dedup, detail merge and stable raw_hash"
```

---

### Task 12: probe — 探针计划、响应分析、probe_report.md

**Files:**
- Create: `scripts/camp-import/src/camp_import/probe.py`
- Test: `scripts/camp-import/tests/test_probe.py`

**Interfaces:**
- Consumes: Task 3 `ApiRequest`/`ApiResponse`/`Transport`、Task 6 `extract_path`/`ContractViolation`
- Produces:
  - `ProbeRequestProfile`：列表/详情请求所需的参数名与已确认的列表响应路径，由 CLI 显式提供并写入报告；探针不得在代码中假设 `id/lnt/lat/oldlnt/oldlat/scale`。
  - `build_probe_plan(center_lng, center_lat, scales, profile, repeats=3, neighbor_offset_deg=0.1) -> list[ApiRequest]`：同中心重复、相邻中心以及 current/old 中心不一致的组合；每个请求带 probe case 标签。
  - `ProbeFindings`（dataclass）：除数量、候选上限、重复率、错误外，记录每个 case 的请求、状态、耗时、响应摘要，供人工确认 `scale_viewport`、`overlap_ratio_by_scale`、坐标系与截断路径。
  - `analyze_probe_results(results: list[tuple[ApiRequest, ApiResponse]], profile: ProbeRequestProfile) -> ProbeFindings`
  - `render_probe_report(findings) -> str`、`render_mapping_skeleton(findings, profile) -> str`
  - `run_probe(...) -> ProbeFindings`：执行一个显式 QPS 的串行批次并写 `probe_report.md` 与包含已知请求参数/路径的 `field_mapping.yaml` 草稿；现存审核文件绝不覆盖。CLI 接受 `--qps`，业务负责人按 0.5→1→2→3→4 分批调用；每档最多 10 请求，连续 2 次失败、错误率 ≥5%、P95 达基线 2 倍或 429 时停止升档。

- [ ] **Step 1: 写失败测试**

创建 `scripts/camp-import/tests/test_probe.py`:

```python
from camp_import.common import ApiResponse, FakeTransport
from camp_import.probe import (
    ProbeRequestProfile,
    analyze_probe_results,
    build_probe_plan,
    render_probe_report,
    run_probe,
)
from conftest import camps_response

ITEMS_PATH = "data.list"
ID_PATH = "id"
PROFILE = ProbeRequestProfile(
    items_path=ITEMS_PATH, external_id_path=ID_PATH, lat_path="latitude", lng_path="longitude",
    list_lng_param="lnt", list_lat_param="lat", list_old_lng_param="oldlnt",
    list_old_lat_param="oldlat", list_scale_param="scale",
    detail_id_param="id", detail_lng_param="lnt", detail_lat_param="lat",
)


def test_build_probe_plan_repeats_and_neighbor_per_scale():
    plan = build_probe_plan(104.0, 30.6, scales=[10, 11], profile=PROFILE, repeats=3)
    assert len(plan) == 10  # 每个 scale:3 次同中心 + 1 次相邻中心 + 1 次 old-center 变体
    scale_10 = [r for r in plan if r.params["scale"] == "10"]
    assert len(scale_10) == 5
    assert [r.params["lnt"] for r in scale_10] == [
        "104.000000", "104.000000", "104.000000", "104.100000", "104.000000",
    ]
    assert all(r.params["oldlnt"] == r.params["lnt"] for r in scale_10[:-1])
    assert scale_10[-1].params["oldlnt"] != scale_10[-1].params["lnt"]


def test_analyze_finds_stable_item_limit():
    full = [str(i) for i in range(100)]
    plan = build_probe_plan(104.0, 30.6, scales=[11], profile=PROFILE, repeats=3)
    responses = [camps_response(full)] * 3 + [camps_response(["1", "2"])]
    findings = analyze_probe_results(list(zip(plan, responses)), PROFILE)
    assert findings.item_counts_by_scale["11"] == [100, 100, 100, 2]
    assert findings.candidate_item_limit == 100  # 同一数量稳定出现 >= 3 次


def test_analyze_no_stable_count_leaves_limit_none():
    plan = build_probe_plan(104.0, 30.6, scales=[11], profile=PROFILE, repeats=3)
    responses = [
        camps_response(["1"]),
        camps_response(["1", "2"]),
        camps_response(["1", "2", "3"]),
        camps_response([]),
    ]
    findings = analyze_probe_results(list(zip(plan, responses)), PROFILE)
    assert findings.candidate_item_limit is None


def test_analyze_duplicate_ratio_between_adjacent_centers():
    plan = build_probe_plan(104.0, 30.6, scales=[11], profile=PROFILE, repeats=1)
    responses = [camps_response(["1", "2", "3"]), camps_response(["2", "3", "4"])]
    findings = analyze_probe_results(list(zip(plan, responses)), PROFILE)
    assert findings.duplicate_ratio_by_scale["11"] == 0.5  # 交 2 / 并 4


def test_analyze_records_errors_without_guessing():
    plan = build_probe_plan(104.0, 30.6, scales=[11], profile=PROFILE, repeats=1)
    responses = [
        ApiResponse(status_code=500, headers={}, body=None),
        ApiResponse(status_code=200, headers={}, body={"data": {"rows": []}}),
    ]
    findings = analyze_probe_results(list(zip(plan, responses)), PROFILE)
    assert len(findings.errors) == 2
    assert "http 500" in findings.errors[0]
    assert "contract" in findings.errors[1]


def test_run_probe_writes_report_and_skeleton_without_clobbering(tmp_path):
    probe_dir = tmp_path / "probe"
    plan = build_probe_plan(104.0, 30.6, scales=[11], profile=PROFILE, repeats=3)
    full = [str(i) for i in range(100)]
    transport = FakeTransport([camps_response(full)] * 3 + [camps_response(["1"])] * 2)
    findings = run_probe(transport, plan, PROFILE, probe_dir)

    report = (probe_dir / "probe_report.md").read_text(encoding="utf-8")
    assert "response_item_limit" in report and "100" in report
    skeleton = (probe_dir / "field_mapping.yaml").read_text(encoding="utf-8")
    assert "response_item_limit: 100" in skeleton
    assert "coordinate_system" in skeleton

    # 已存在的契约不被覆盖(人工审核后的文件是权威版本)
    (probe_dir / "field_mapping.yaml").write_text("reviewed: true\n", encoding="utf-8")
    run_probe(
        FakeTransport([camps_response(full)] * 3 + [camps_response(["1"])] * 2),
        plan, PROFILE, probe_dir,
    )
    assert (probe_dir / "field_mapping.yaml").read_text(encoding="utf-8") == "reviewed: true\n"
```

- [ ] **Step 2: 运行确认失败**

```bash
uv run pytest tests/test_probe.py -v
```

Expected: FAIL,`ModuleNotFoundError: No module named 'camp_import.probe'`。

- [ ] **Step 3: 实现**

创建 `scripts/camp-import/src/camp_import/probe.py`:

```python
"""probe:探针请求构造、响应分析、probe_report.md 与 field_mapping.yaml 骨架。

阶段一全部离线(FakeTransport);真实探针属另批授权任务,经 CLI --live 执行。
分析不猜测字段:请求 profile 由执行者显式提供；已配置响应路径取不到值记入 errors。
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

import yaml

from camp_import.common import ApiRequest, ApiResponse, Transport
from camp_import.field_mapping import ContractViolation, extract_path

GET_CAMPS_URL = "https://55camp.cn/api/index/getCamps"


@dataclass(frozen=True)
class ProbeRequestProfile:
    items_path: str
    external_id_path: str
    lat_path: str
    lng_path: str
    list_lng_param: str
    list_lat_param: str
    list_old_lng_param: str
    list_old_lat_param: str
    list_scale_param: str
    detail_id_param: str
    detail_lng_param: str
    detail_lat_param: str


def _camps_request(
    lng: float, lat: float, scale: int, profile: ProbeRequestProfile,
    old_lng: float | None = None, old_lat: float | None = None,
) -> ApiRequest:
    old_lng = lng if old_lng is None else old_lng
    old_lat = lat if old_lat is None else old_lat
    return ApiRequest(
        "GET",
        GET_CAMPS_URL,
        {
            profile.list_lng_param: f"{lng:.6f}",
            profile.list_lat_param: f"{lat:.6f}",
            profile.list_old_lng_param: f"{old_lng:.6f}",
            profile.list_old_lat_param: f"{old_lat:.6f}",
            profile.list_scale_param: str(scale),
        },
    )


def build_probe_plan(
    center_lng: float,
    center_lat: float,
    scales: list[int],
    profile: ProbeRequestProfile,
    repeats: int = 3,
    neighbor_offset_deg: float = 0.1,
) -> list[ApiRequest]:
    """同中心多 scale 重复请求(观察返回上限稳定性)+ 相邻中心(观察重复 ID 比例)。"""
    plan = []
    for scale in scales:
        for _ in range(repeats):
            plan.append(_camps_request(center_lng, center_lat, scale, profile))
        plan.append(_camps_request(center_lng + neighbor_offset_deg, center_lat, scale, profile))
        plan.append(
            _camps_request(
                center_lng, center_lat, scale, profile,
                old_lng=center_lng - neighbor_offset_deg, old_lat=center_lat,
            )
        )
    return plan


@dataclass
class ProbeFindings:
    item_counts_by_scale: dict = field(default_factory=dict)
    candidate_item_limit: int | None = None
    duplicate_ratio_by_scale: dict = field(default_factory=dict)
    errors: list = field(default_factory=list)


def analyze_probe_results(
    results: list[tuple[ApiRequest, ApiResponse]], profile: ProbeRequestProfile
) -> ProbeFindings:
    findings = ProbeFindings()
    ids_by_center: dict[tuple[str, str], set[str]] = {}
    for request, response in results:
        scale = request.params[profile.list_scale_param]
        if response.status_code != 200:
            findings.errors.append(f"scale={scale} http {response.status_code}")
            continue
        try:
            items = extract_path(response.body, profile.items_path)
            ids = {str(extract_path(item, profile.external_id_path)) for item in items}
        except ContractViolation as exc:
            findings.errors.append(f"scale={scale} contract: {exc}")
            continue
        findings.item_counts_by_scale.setdefault(scale, []).append(len(items))
        ids_by_center.setdefault((scale, request.params[profile.list_lng_param]), set()).update(ids)

    # 同一数量稳定出现 >= 3 次 → 候选 response_item_limit
    all_counts = Counter(
        count for counts in findings.item_counts_by_scale.values() for count in counts
    )
    stable = [count for count, seen in all_counts.items() if seen >= 3 and count > 0]
    findings.candidate_item_limit = max(stable) if stable else None

    # 相邻中心的 ID 重复率(Jaccard),供 overlap_ratio_by_scale 校准参考
    for scale in findings.item_counts_by_scale:
        centers = [ids for (s, _), ids in ids_by_center.items() if s == scale]
        if len(centers) >= 2 and (centers[0] | centers[1]):
            ratio = len(centers[0] & centers[1]) / len(centers[0] | centers[1])
            findings.duplicate_ratio_by_scale[scale] = round(ratio, 4)
    return findings


def render_probe_report(findings: ProbeFindings) -> str:
    lines = ["# 55camp 接口探针报告", "", "## 单次返回数量(按 scale)"]
    for scale, counts in sorted(findings.item_counts_by_scale.items()):
        lines.append(f"- scale {scale}: {counts}")
    lines += ["", f"## 候选 response_item_limit: {findings.candidate_item_limit}"]
    lines += ["", "## 相邻中心 ID 重复率(Jaccard)"]
    for scale, ratio in sorted(findings.duplicate_ratio_by_scale.items()):
        lines.append(f"- scale {scale}: {ratio}")
    if findings.errors:
        lines += ["", "## 异常"]
        lines += [f"- {error}" for error in findings.errors]
    lines.append("")
    return "\n".join(lines)


def render_mapping_skeleton(findings: ProbeFindings, profile: ProbeRequestProfile) -> str:
    """契约骨架:探针可自动填的项填入,其余留空由人工核验补齐。"""
    skeleton = {
        # CLI 已显式确认的请求参数与响应路径必须原样写回，不能退化为空值。
        "list_items_path": profile.items_path,
        "list_external_id_path": profile.external_id_path,
        "list_lat_path": profile.lat_path,
        "list_lng_path": profile.lng_path,
        "detail_external_id_path": "",
        "list_lng_param": profile.list_lng_param,
        "list_lat_param": profile.list_lat_param,
        "list_old_lng_param": profile.list_old_lng_param,
        "list_old_lat_param": profile.list_old_lat_param,
        "list_scale_param": profile.list_scale_param,
        "detail_id_param": profile.detail_id_param,
        "detail_lng_param": profile.detail_lng_param,
        "detail_lat_param": profile.detail_lat_param,
        "response_item_limit": findings.candidate_item_limit,
        "truncation_signal_path": None,
        "coordinate_system": "",
        "scale_viewport": {},
        "overlap_ratio_by_scale": {},
        "seed_scale": None,
        "edge_margin_ratio": None,
        "edge_expansion_max_hops": None,
        "qps_limit": None,
        "burst": 1,
        "concurrency": 1,
        "dense_ratio": 0.8,
        "empty_sample_ratio": 0.05,
        "required_auth": [],
        "required_signature": None,
    }
    return yaml.safe_dump(skeleton, allow_unicode=True, sort_keys=False)


def run_probe(
    transport: Transport,
    plan: list[ApiRequest],
    profile: ProbeRequestProfile,
    probe_dir: Path,
) -> ProbeFindings:
    results = [(request, transport.send(request)) for request in plan]
    findings = analyze_probe_results(results, profile)
    probe_dir.mkdir(parents=True, exist_ok=True)
    (probe_dir / "probe_report.md").write_text(
        render_probe_report(findings), encoding="utf-8"
    )
    mapping_path = probe_dir / "field_mapping.yaml"
    if not mapping_path.exists():  # 人工审核过的契约是权威版本,绝不覆盖
        mapping_path.write_text(render_mapping_skeleton(findings, profile), encoding="utf-8")
    return findings
```

- [ ] **Step 4: 运行确认通过**

```bash
uv run pytest tests/test_probe.py -v
```

Expected: `6 passed`。

- [ ] **Step 5: 提交**

```bash
cd /Users/code.yang/Desktop/roadbook-monorepo
git add scripts/camp-import
git commit -m "feat(camp-import): offline probe plan builder, analyzer and report"
```

---

### Task 13: cli + LiveTransport — 子命令入口与 --live 门禁

**Files:**
- Modify: `scripts/camp-import/src/camp_import/common.py`(追加 `REQUEST_HEADERS`、`LiveTransport`)
- Create: `scripts/camp-import/src/camp_import/cli.py`
- Test: `scripts/camp-import/tests/test_cli.py`

**Interfaces:**
- Consumes: 前面全部模块
- Produces:
  - `common.REQUEST_HEADERS: dict`(上游文档的小程序请求头,原样复用)
  - `common.LiveTransport(client: httpx.Client | None = None)`:极薄 httpx 实现,单一会话复用 `REQUEST_HEADERS`;httpx 异常 → `TransportError`;非 JSON 响应 body 为 `None`
  - `cli.LiveDisabledError(Exception)`
  - `cli.build_transport(live: bool, qps_limit: float, burst: int) -> Transport`:`live=False` 抛 `LiveDisabledError`(**LiveTransport 不被构造**);`live=True` 返回 `RetryingTransport(RateLimitedTransport(LiveTransport(), TokenBucket(...)))`
  - `cli.main(argv: list[str] | None = None) -> int`:子命令 `probe / discover / fetch-detail / normalize`;全局 `--live`、`--data-dir`(默认 `data/55camp`);discover/fetch-detail 的 `--retry-failed` 只显式重置 failed 任务；拒绝时打印原因到 stderr 并返回退出码 2。

- [ ] **Step 1: 写失败测试**

创建 `scripts/camp-import/tests/test_cli.py`:

```python
import httpx
import pytest

from camp_import import cli, common
from camp_import.common import (
    ApiRequest,
    RetryingTransport,
    TransportError,
    append_jsonl,
)
from conftest import camps_response, write_mapping_yaml


def write_seed_centers(tmp_path):
    path = tmp_path / "seed_centers.csv"
    path.write_text("lng,lat\n104.0,30.6\n", encoding="utf-8")
    return path


def test_request_headers_reuse_miniprogram_profile():
    assert common.REQUEST_HEADERS["xweb_xhr"] == "1"
    assert "MicroMessenger" in common.REQUEST_HEADERS["user-agent"]
    assert common.REQUEST_HEADERS["referer"].startswith("https://servicewechat.com/")


def test_live_transport_sends_headers_and_maps_errors():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["xweb_xhr"] = request.headers.get("xweb_xhr")
        return httpx.Response(200, json={"data": {"list": []}})

    client = httpx.Client(
        headers=common.REQUEST_HEADERS, transport=httpx.MockTransport(handler)
    )
    transport = common.LiveTransport(client=client)
    response = transport.send(ApiRequest("GET", "https://55camp.cn/api/index/getCamps", {}))
    assert response.status_code == 200
    assert response.body == {"data": {"list": []}}
    assert seen["xweb_xhr"] == "1"

    def exploding(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("boom")

    failing = common.LiveTransport(
        client=httpx.Client(transport=httpx.MockTransport(exploding))
    )
    with pytest.raises(TransportError):
        failing.send(ApiRequest("GET", "https://55camp.cn/x", {}))


def test_build_transport_without_live_never_constructs_live_transport(monkeypatch):
    constructed = []
    monkeypatch.setattr(common, "LiveTransport", lambda: constructed.append(1))
    with pytest.raises(cli.LiveDisabledError):
        cli.build_transport(live=False, qps_limit=1.0, burst=1)
    assert constructed == []


def test_build_transport_with_live_wraps_rate_limit_and_retry(monkeypatch):
    monkeypatch.setattr(common, "LiveTransport", lambda: object())
    transport = cli.build_transport(live=True, qps_limit=1.0, burst=1)
    assert isinstance(transport, RetryingTransport)


def test_discover_without_live_exits_2_with_message(tmp_path, capsys, monkeypatch):
    constructed = []
    monkeypatch.setattr(common, "LiveTransport", lambda: constructed.append(1))
    write_mapping_yaml(tmp_path / "510000")
    exit_code = cli.main([
        "--data-dir", str(tmp_path),
        "discover", "--province-code", "510000",
        "--seed-centers", str(write_seed_centers(tmp_path)),
    ])
    assert exit_code == 2
    assert constructed == []
    assert "--live" in capsys.readouterr().err


def test_probe_without_live_exits_2(tmp_path, capsys):
    exit_code = cli.main([
        "--data-dir", str(tmp_path),
        "probe", "--province-code", "510000",
        "--center-lng", "104.0", "--center-lat", "30.6",
        "--items-path", "data.list", "--id-path", "id",
        "--lat-path", "latitude", "--lng-path", "longitude",
        "--list-lng-param", "lnt", "--list-lat-param", "lat",
        "--list-old-lng-param", "oldlnt", "--list-old-lat-param", "oldlat",
        "--list-scale-param", "scale", "--detail-id-param", "id",
        "--detail-lng-param", "lnt", "--detail-lat-param", "lat",
    ])
    assert exit_code == 2
    assert "--live" in capsys.readouterr().err


def test_missing_mapping_refuses_to_start(tmp_path, capsys):
    exit_code = cli.main([
        "--data-dir", str(tmp_path),
        "normalize", "--province-code", "510000",
    ])
    assert exit_code == 2
    assert "field_mapping" in capsys.readouterr().err


def test_normalize_runs_fully_offline(tmp_path):
    write_mapping_yaml(tmp_path / "510000")
    append_jsonl(
        tmp_path / "510000" / "raw" / "camps.jsonl",
        {
            "tile_id": "t1",
            "params": {},
            "fetched_at": 1.0,
            "status_code": 200,
            "response": camps_response(["1"]).body,
        },
    )
    exit_code = cli.main([
        "--data-dir", str(tmp_path),
        "normalize", "--province-code", "510000",
    ])
    assert exit_code == 0
    enriched = (tmp_path / "510000" / "processed" / "camps_enriched.csv").read_text(
        encoding="utf-8"
    )
    assert "55camp" in enriched and "gcj02" in enriched
```

- [ ] **Step 2: 运行确认失败**

```bash
uv run pytest tests/test_cli.py -v
```

Expected: FAIL,`ImportError`(`REQUEST_HEADERS`/`cli` 不存在)。

- [ ] **Step 3: 实现 common.py 追加**

在 `scripts/camp-import/src/camp_import/common.py` 末尾追加(请求头逐字来自上游文档"请求客户端画像"):

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


class LiveTransport:
    """httpx 实现:单一会话,复用小程序请求头。保持极薄,不承载业务逻辑。

    仅当 CLI 显式传 --live 时由 cli.build_transport 构造;阶段一测试只经
    httpx.MockTransport 注入,绝不发真实请求。
    """

    def __init__(self, client=None):
        import httpx

        self._client = client or httpx.Client(headers=REQUEST_HEADERS, timeout=30.0)

    def send(self, request: ApiRequest) -> ApiResponse:
        import httpx

        try:
            raw = self._client.request(request.method, request.url, params=request.params)
        except httpx.HTTPError as exc:
            raise TransportError(str(exc)) from exc
        try:
            body = raw.json()
        except ValueError:
            body = None
        return ApiResponse(
            status_code=raw.status_code, headers=dict(raw.headers), body=body
        )
```

- [ ] **Step 4: 实现 cli.py**

创建 `scripts/camp-import/src/camp_import/cli.py`:

```python
"""CLI 子命令入口。--live 默认关闭:不显式传入就拒绝构造 LiveTransport。"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from camp_import import common, discover, fetch_detail, normalize, probe
from camp_import.common import (
    RateLimitedTransport,
    RetryingTransport,
    TokenBucket,
    Transport,
)
from camp_import.field_mapping import ContractViolation, FieldMappingError, load_field_mapping

PROBE_DEFAULT_QPS = 0.5  # 探针未校准前的保守频率(上游 QPS 探针从 0.5 起测)


class LiveDisabledError(Exception):
    pass


def build_transport(live: bool, qps_limit: float, burst: int) -> Transport:
    if not live:
        raise LiveDisabledError(
            "阶段一默认离线,真实 HTTP 请求被禁用;"
            "获得授权后显式传 --live 才会构造 LiveTransport。"
        )
    bucket = TokenBucket(qps=qps_limit, burst=burst)
    return RetryingTransport(RateLimitedTransport(common.LiveTransport(), bucket))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="camp-import")
    parser.add_argument("--live", action="store_true", help="允许真实 HTTP 请求(默认关闭)")
    parser.add_argument("--data-dir", default="data/55camp", help="产物根目录")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("probe", help="接口探针(需 --live,属另批授权任务)")
    p.add_argument("--province-code", required=True)
    p.add_argument("--center-lng", type=float, required=True)
    p.add_argument("--center-lat", type=float, required=True)
    p.add_argument("--scales", default="10,11,12", help="逗号分隔的 scale 列表")
    p.add_argument("--qps", type=float, default=PROBE_DEFAULT_QPS, help="本探针批次的串行 QPS")
    p.add_argument("--items-path", required=True, help="列表数组的响应路径,如 data.list")
    p.add_argument("--id-path", required=True, help="item 内 ID 的相对路径,如 id")
    p.add_argument("--lat-path", required=True, help="item 内纬度路径")
    p.add_argument("--lng-path", required=True, help="item 内经度路径")
    p.add_argument("--list-lng-param", required=True)
    p.add_argument("--list-lat-param", required=True)
    p.add_argument("--list-old-lng-param", required=True)
    p.add_argument("--list-old-lat-param", required=True)
    p.add_argument("--list-scale-param", required=True)
    p.add_argument("--detail-id-param", required=True)
    p.add_argument("--detail-lng-param", required=True)
    p.add_argument("--detail-lat-param", required=True)

    p = sub.add_parser("discover", help="tile 网格发现(需 --live)")
    p.add_argument("--province-code", required=True)
    p.add_argument("--seed-centers", required=True, help="区县中心点 CSV(列:lng,lat)")
    p.add_argument("--min-tile-area-m2", type=float, default=250_000.0)
    p.add_argument("--max-depth", type=int, default=8)
    p.add_argument("--retry-failed", action="store_true", help="显式将 failed tile 重置为 retry")

    p = sub.add_parser("fetch-detail", help="详情补齐(需 --live)")
    p.add_argument("--province-code", required=True)
    p.add_argument("--retry-failed", action="store_true", help="显式将 failed 详情任务重置为 retry")

    p = sub.add_parser("normalize", help="离线清洗合并(无需 --live)")
    p.add_argument("--province-code", required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    province_dir = Path(args.data_dir) / args.province_code
    mapping_path = province_dir / "probe" / "field_mapping.yaml"
    try:
        return _dispatch(args, province_dir, mapping_path)
    except (LiveDisabledError, FieldMappingError) as exc:
        print(str(exc), file=sys.stderr)
        return 2
    except ContractViolation as exc:
        print(f"contract violation: {exc}", file=sys.stderr)
        return 1


def _dispatch(args, province_dir: Path, mapping_path: Path) -> int:
    if args.command == "normalize":
        mapping = load_field_mapping(mapping_path)
        normalize.run_normalize(province_dir, mapping, args.province_code)
        return 0

    if args.command == "probe":
        transport = build_transport(args.live, args.qps, burst=1)
        scales = [int(s) for s in args.scales.split(",")]
        profile = probe.ProbeRequestProfile(
            items_path=args.items_path, external_id_path=args.id_path,
            lat_path=args.lat_path, lng_path=args.lng_path,
            list_lng_param=args.list_lng_param, list_lat_param=args.list_lat_param,
            list_old_lng_param=args.list_old_lng_param,
            list_old_lat_param=args.list_old_lat_param,
            list_scale_param=args.list_scale_param,
            detail_id_param=args.detail_id_param,
            detail_lng_param=args.detail_lng_param,
            detail_lat_param=args.detail_lat_param,
        )
        plan = probe.build_probe_plan(args.center_lng, args.center_lat, scales, profile)
        probe.run_probe(transport, plan, profile, province_dir / "probe")
        return 0

    mapping = load_field_mapping(mapping_path)  # 必填项为空 → 拒绝启动
    transport = build_transport(args.live, mapping.qps_limit, mapping.burst)

    if args.command == "discover":
        store = discover.TileStore(province_dir / "processed" / "query_tiles.csv")
        if args.retry_failed:
            store.requeue_failed()
        engine = discover.DiscoverEngine(
            mapping=mapping,
            transport=transport,
            store=store,
            raw_camps_path=province_dir / "raw" / "camps.jsonl",
            min_tile_area_m2=args.min_tile_area_m2,
            max_depth=args.max_depth,
        )
        if not store.rows():
            centers = [
                (float(row["lng"]), float(row["lat"]))
                for row in common.read_csv_rows(Path(args.seed_centers))
            ]
            engine.seed(centers, args.province_code)
        engine.run()
        return 0

    if args.command == "fetch-detail":
        store = fetch_detail.DetailStore(province_dir / "processed" / "detail_tasks.csv")
        if args.retry_failed:
            store.requeue_failed()
        store.seed_tasks(common.read_csv_rows(province_dir / "processed" / "camps_dedup.csv"))
        engine = fetch_detail.DetailEngine(
            mapping=mapping,
            transport=transport,
            store=store,
            raw_details_path=province_dir / "raw" / "details.jsonl",
        )
        engine.run()
        return 0

    raise AssertionError(f"unhandled command: {args.command}")


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 5: 运行确认通过**

```bash
uv run pytest tests/test_cli.py -v
```

Expected: `8 passed`。

- [ ] **Step 6: 全量回归**

```bash
uv run pytest -v
```

Expected: 全部通过,无跳过。

- [ ] **Step 7: 提交**

```bash
cd /Users/code.yang/Desktop/roadbook-monorepo
git add scripts/camp-import
git commit -m "feat(camp-import): CLI subcommands with --live gate and thin LiveTransport"
```

---

### Task 14: README 与上游文档修订、最终验证

**Files:**
- Create: `scripts/camp-import/README.md`
- Modify: `docs/superpowers/specs/55camp-data-collection-plan.md`(细分矛盾条目、coordinate_system、detail_tasks.csv 目录树、list_items_path、请求参数名)
- Modify: `docs/superpowers/specs/2026-07-14-camp-import-design.md`(修正上游文档相对路径)

**Interfaces:**
- Consumes: 全部已实现模块(文档描述它们)
- Produces: 无代码;文档与代码一致

- [ ] **Step 1: 写 README**

创建 `scripts/camp-import/README.md`:

````markdown
# camp-import — 55camp 历史营地数据采集脚本

阶段一:**全部离线实现**,不发起任何真实 HTTP 请求。真实请求能力藏在默认关闭的
`--live` 开关后,待授权探针批次单独启用。设计文档:
`docs/superpowers/specs/2026-07-14-camp-import-design.md`。

## 运行

```bash
cd scripts/camp-import
uv run pytest                      # 全部离线测试
uv run camp-import normalize --province-code 510000        # 离线,无需 --live
uv run camp-import discover --province-code 510000 \
    --seed-centers seeds.csv       # 无 --live:拒绝并提示(退出码 2)
```

需要网络的子命令(`probe` / `discover` / `fetch-detail`)必须显式传 `--live`,
且 `--live` 仅在获得业务授权后使用。

## 模块

| 模块 | 职责 |
| --- | --- |
| `common.py` | Transport 协议、FakeTransport/LiveTransport、令牌桶限流、退避重试、JSONL/CSV 原子读写 |
| `field_mapping.py` | field_mapping.yaml 契约加载与校验(必填项为空拒绝启动)、`extract_path` |
| `tiles.py` | 视口换算、网格步长、四叉树细分、面积计算(纯函数) |
| `probe.py` | 探针请求构造、响应分析、probe_report.md 与契约骨架生成 |
| `discover.py` | tile 状态机与调度引擎:去重、条件细分、两级无新增剪枝、空格抽样 |
| `fetch_detail.py` | 详情任务引擎(detail_tasks.csv,与 tile 状态分离) |
| `normalize.py` | camps_dedup.csv、详情合并、camps_enriched.csv(含 raw_hash、coordinate_system) |
| `cli.py` | 子命令入口;`--live` 默认关闭 |

## field_mapping.yaml 契约

必填项为空时 discover/fetch-detail/normalize 拒绝启动:

- `list_items_path`(列表响应中营地数组的路径,相对响应根,如 `data.list`)
- `list_external_id_path` / `list_lat_path` / `list_lng_path`(**相对单个 item**)
- `detail_external_id_path`(相对详情响应根)
- 列表请求参数名：`list_lng_param`、`list_lat_param`、`list_old_lng_param`、
  `list_old_lat_param`、`list_scale_param`；详情请求参数名：`detail_id_param`、
  `detail_lng_param`、`detail_lat_param`
- `response_item_limit`、`coordinate_system`、`qps_limit`、`seed_scale`、
  `scale_viewport`、`overlap_ratio_by_scale`、`edge_margin_ratio`、`edge_expansion_max_hops`

可选:`burst`、`concurrency`、`dense_ratio`(默认 0.8)、`empty_sample_ratio`
(默认 0.05)、`truncation_signal_path`、`detail_name_path`、`detail_address_path`、
`required_auth`、`required_signature`。可选路径为 `null` 时不提取；一旦配置，缺失即为契约错误。

真实值由授权探针批次实测产出并经人工审核;`probe` 子命令只在
`field_mapping.yaml` 不存在时生成骨架,绝不覆盖已审核文件。

## 阶段边界

- 产物只落 `data/55camp/<province_code>/`(已 gitignore),不写 PostgreSQL、不导入 POI。
- 请求参数名与响应路径不在引擎中硬编码，均由探针报告中的已审核 `field_mapping.yaml` 提供。
- 阶段一不做坐标转换;`coordinate_system` 只做标注。
````

- [ ] **Step 2: 修订上游文档与链接(5 处)**

编辑 `docs/superpowers/specs/55camp-data-collection-plan.md`:

**(a)目录树补 detail_tasks.csv** — 把"输出目录"代码块中:

```text
    └── processed/
        ├── camps_dedup.csv
        ├── camps_enriched.csv
        └── query_tiles.csv
```

改为:

```text
    └── processed/
        ├── camps_dedup.csv
        ├── camps_enriched.csv
        ├── detail_tasks.csv
        └── query_tiles.csv
```

**(b)契约模板补必填项与请求参数名** — 把"接口探针"一节 field_mapping.yaml 模板中的:

```yaml
list_external_id_path: ""
```

改为:

```yaml
list_items_path: ""          # 列表响应中营地数组的路径;后续 list_* 路径相对单个 item
list_external_id_path: ""
```

并在模板 `required_signature: null` 之前加入以下键（真实值均来自经授权探针与人工审核）：

```yaml
coordinate_system: ""        # 坐标系标注(如 gcj02/wgs84);阶段一不做转换
list_lng_param: ""           # 列表请求的经度参数名
list_lat_param: ""           # 列表请求的纬度参数名
list_old_lng_param: ""       # 列表请求的旧经度参数名
list_old_lat_param: ""       # 列表请求的旧纬度参数名
list_scale_param: ""         # 列表请求的 scale 参数名
detail_id_param: ""          # 详情请求的 ID 参数名
detail_lng_param: ""         # 详情请求的经度参数名
detail_lat_param: ""         # 详情请求的纬度参数名
edge_margin_ratio: null
edge_expansion_max_hops: null
```

**(c)废除"无条件细分到底"** — 把"去重与自适应细分"一节中这条:

> 在 tile 面积仍大于 `min_tile_area_m2` 且未达到 `max_depth` 前,即使连续两级没有新增 ID,也必须继续细分到最小尺度。只有达到最小面积或最大深度后,才允许以"连续两级无新增"停止。

替换为:

> 细分为条件触发:达到 `response_item_limit × dense_ratio`、出现截断信号、或细分后仍持续发现新增 ID。沿 `parent_tile_id` 血缘"连续两级无新增"即剪枝停止,不再无条件细分到底;tile 面积小于 `min_tile_area_m2` 或达到 `max_depth` 时无条件停止。对已剪枝的空格子按 `empty_sample_ratio`(默认 0.05)抽样强制细分一层做假阴性校验;若抽样发现新增 ID,该区域回退为正常细分。(修订依据:`docs/superpowers/specs/2026-07-14-camp-import-design.md`)

**(d)camps_enriched 列补 coordinate_system** — 把"CSV 数据约定"中:

```text
external_id,name,lat,lng,address,province_code,city_code,district_code,
source,detail_fetched_at,raw_hash
```

改为:

```text
external_id,name,lat,lng,address,province_code,city_code,district_code,
source,coordinate_system,detail_fetched_at,raw_hash
```

**(e)修正设计文档上游链接** — 将 `docs/superpowers/specs/2026-07-14-camp-import-design.md` 第 4 行的 `docs/55camp-data-collection-plan.md` 改为实际维护位置 `docs/superpowers/specs/55camp-data-collection-plan.md`。

- [ ] **Step 3: 最终全量验证**

```bash
cd /Users/code.yang/Desktop/roadbook-monorepo/scripts/camp-import
uv run pytest -v
```

Expected: 全部通过(约 90 个测试),0 failed,0 skipped。同时抽查:

```bash
uv run camp-import discover --province-code 510000 --seed-centers /dev/null
```

Expected: stderr 提示 field_mapping 缺失或 --live 被禁用,退出码 2(绝不发请求)。

- [ ] **Step 4: 提交**

```bash
cd /Users/code.yang/Desktop/roadbook-monorepo
git add scripts/camp-import/README.md docs/superpowers/specs/55camp-data-collection-plan.md \
  docs/superpowers/specs/2026-07-14-camp-import-design.md
git commit -m "docs(camp-import): README and upstream plan revisions for phase-1 contract"
```

---

## 执行顺序与依赖

```
Task 1(脚手架)
 └→ Task 2(CSV/JSONL)→ Task 3(Transport)→ Task 4(限流)→ Task 5(重试)
     └→ Task 6(field_mapping)   └→ Task 7(tiles)
         └→ Task 8(TileStore)→ Task 9(DiscoverEngine)
         └→ Task 10(fetch_detail) └→ Task 11(normalize)
         └→ Task 12(probe)
             └→ Task 13(cli + LiveTransport)→ Task 14(文档)
```

严格按编号顺序执行即可满足全部依赖。
