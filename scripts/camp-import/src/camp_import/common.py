"""共享基础设施：持久化、传输、限流与重试。"""
from __future__ import annotations

import csv
import json
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterable, Protocol, Sequence


def write_csv_atomic(path: Path, fieldnames: Sequence[str], rows: Iterable[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    try:
        with tmp.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(fieldnames))
            writer.writeheader()
            writer.writerows(rows)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
    finally:
        if tmp.exists():
            tmp.unlink()


def read_csv_rows(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def append_jsonl(path: Path, record: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")


def read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


class TransportError(Exception):
    pass


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
    def __init__(self, script: list[ApiResponse | Exception]):
        self._script = list(script)
        self.sent: list[ApiRequest] = []

    def send(self, request: ApiRequest) -> ApiResponse:
        self.sent.append(request)
        if not self._script:
            raise AssertionError(f"FakeTransport script exhausted, got: {request}")
        result = self._script.pop(0)
        if isinstance(result, Exception):
            raise result
        return result


class TokenBucket:
    def __init__(self, qps: float, burst: int = 1, *, clock: Callable[[], float] = time.monotonic,
                 sleep: Callable[[float], None] = time.sleep):
        if qps <= 0:
            raise ValueError("qps must be > 0")
        self.qps, self.burst, self.clock, self.sleep = float(qps), max(1, int(burst)), clock, sleep
        self.tokens, self.last = float(self.burst), clock()

    def acquire(self) -> None:
        now = self.clock()
        self.tokens = min(float(self.burst), self.tokens + (now - self.last) * self.qps)
        self.last = now
        if self.tokens < 1:
            self.sleep((1 - self.tokens) / self.qps)
            now = self.clock()
            self.tokens = min(float(self.burst), self.tokens + (now - self.last) * self.qps)
            self.last = now
        self.tokens -= 1


class RateLimitedTransport:
    def __init__(self, inner: Transport, bucket: TokenBucket): self.inner, self.bucket = inner, bucket
    def send(self, request: ApiRequest) -> ApiResponse:
        self.bucket.acquire()
        return self.inner.send(request)


BACKOFF_SECONDS = (1.0, 2.0, 4.0, 8.0, 16.0)
MAX_RETRY_WAIT_SECONDS = 30.0


class RetryExhausted(Exception):
    def __init__(self, last_error: str):
        super().__init__(last_error)
        self.last_error = last_error


class RetryingTransport:
    def __init__(self, inner: Transport, *, sleep: Callable[[float], None] = time.sleep):
        self.inner, self.sleep = inner, sleep

    def send(self, request: ApiRequest) -> ApiResponse:
        last_error = ""
        for attempt in range(len(BACKOFF_SECONDS) + 1):
            retry_after = None
            try:
                response = self.inner.send(request)
                if response.status_code < 500 and response.status_code != 429:
                    return response
                last_error, retry_after = f"http {response.status_code}", response.headers.get("Retry-After")
            except TransportError as exc:
                last_error = f"network: {exc}"
            if attempt < len(BACKOFF_SECONDS):
                wait = BACKOFF_SECONDS[attempt]
                if retry_after is not None:
                    try: wait = min(float(retry_after), MAX_RETRY_WAIT_SECONDS)
                    except ValueError: pass
                self.sleep(wait)
        raise RetryExhausted(last_error)


REQUEST_HEADERS = {
    "xweb_xhr": "1",
    "user-agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 "
                   "Safari/537.36 MicroMessenger/6.8.0(0x16080000) NetType/WIFI "
                   "MiniProgramEnv/Mac MacWechat/WMPF MacWechat/3.8.10(0x13080a10) XWEB/1227"),
    "content-type": "application/x-www-form-urlencoded",
    "accept": "*/*",
    "sec-fetch-site": "cross-site",
    "sec-fetch-mode": "cors",
    "sec-fetch-dest": "empty",
    "referer": "https://servicewechat.com/wx9d4fe7e224c821cc/19/page-frame.html",
    "accept-language": "zh-CN,zh;q=0.9",
}


class LiveTransport:
    """Thin httpx adapter. It is constructed only by CLI --live dispatch."""
    def __init__(self, client=None):
        import httpx
        self.client = client or httpx.Client(headers=REQUEST_HEADERS, timeout=30.0)
    def send(self, request: ApiRequest) -> ApiResponse:
        import httpx
        try: raw = self.client.request(request.method, request.url, params=request.params)
        except httpx.HTTPError as exc: raise TransportError(str(exc)) from exc
        try: body = raw.json()
        except ValueError: body = None
        return ApiResponse(raw.status_code, dict(raw.headers), body)
