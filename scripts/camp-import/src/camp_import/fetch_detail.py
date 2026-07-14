from __future__ import annotations
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Callable
from . import common
from .common import ApiRequest, RetryExhausted, Transport
from .discover import STALE_RUNNING_SECONDS
from .field_mapping import ContractViolation, FieldMapping, extract_path

GET_CAMP_DETAIL_URL = "https://55camp.cn/api/index/getCampDetail"
DETAIL_FIELDNAMES = ["external_id", "lng", "lat", "status", "attempts", "last_error", "started_at", "updated_at"]

@dataclass
class DetailTask:
    external_id: str; lng: float; lat: float; status: str = "pending"; attempts: int = 0; last_error: str = ""; started_at: str = ""; updated_at: str = ""
    @classmethod
    def from_csv(cls, row: dict) -> "DetailTask":
        return cls(row.get("external_id", ""), float(row.get("lng") or 0), float(row.get("lat") or 0), row.get("status") or "pending", int(row.get("attempts") or 0), row.get("last_error", ""), row.get("started_at", ""), row.get("updated_at", ""))

class DetailStore:
    def __init__(self, path: Path, clock: Callable[[], float] = time.time):
        self.path, self.clock = path, clock
        self._tasks = {row["external_id"]: DetailTask.from_csv(row) for row in common.read_csv_rows(path)}
    def tasks(self): return list(self._tasks.values())
    def get(self, external_id): return self._tasks.get(str(external_id))
    def save(self): common.write_csv_atomic(self.path, DETAIL_FIELDNAMES, (asdict(t) for t in self.tasks()))
    def seed_tasks(self, camps):
        added = 0
        for camp in camps:
            key = str(camp["external_id"])
            if key not in self._tasks:
                self._tasks[key] = DetailTask(key, float(camp["lng"]), float(camp["lat"])); added += 1
        if added: self.save()
        return added
    def next_pending(self): return next((t for t in self.tasks() if t.status in ("pending", "retry")), None)
    def reset_stale_running(self):
        stale = [t for t in self.tasks() if t.status == "running" and t.started_at and self.clock() - float(t.started_at) > STALE_RUNNING_SECONDS]
        for t in stale: t.status = "retry"
        if stale: self.save()
        return len(stale)
    def requeue_failed(self):
        failed = [t for t in self.tasks() if t.status == "failed"]
        for t in failed: t.status = "retry"
        if failed: self.save()
        return len(failed)
    def requeue_running(self):
        running = [t for t in self.tasks() if t.status == "running"]
        for t in running: t.status = "retry"
        if running: self.save()
        return len(running)
    def mark_running(self, task): task.status = "running"; task.attempts += 1; task.started_at = f"{self.clock():.3f}"; self.save()
    def mark_done(self, task): task.status = "done"; task.updated_at = f"{self.clock():.3f}"; self.save()
    def mark_failed(self, task, error): task.status = "failed"; task.last_error = error; task.updated_at = f"{self.clock():.3f}"; self.save()

def build_detail_request(task: DetailTask, mapping: FieldMapping) -> ApiRequest:
    return ApiRequest("GET", GET_CAMP_DETAIL_URL, {mapping.detail_id_param: task.external_id, mapping.detail_lng_param: f"{task.lng:.6f}", mapping.detail_lat_param: f"{task.lat:.6f}"})

class DetailEngine:
    def __init__(self, mapping: FieldMapping, transport: Transport, store: DetailStore, raw_details_path: Path, clock=time.time): self.mapping,self.transport,self.store,self.raw,self.clock=mapping,transport,store,raw_details_path,clock
    def run(self, max_requests=None):
        self.store.reset_stale_running()
        processed = 0
        while (task := self.store.next_pending()) is not None and (max_requests is None or processed < max_requests):
            self._process(task); processed += 1
        return processed
    def _process(self, task):
        self.store.mark_running(task); request = build_detail_request(task, self.mapping)
        try: response = self.transport.send(request)
        except RetryExhausted as exc: self.store.mark_failed(task, exc.last_error); return
        common.append_jsonl(self.raw, {"external_id": task.external_id, "params": request.params, "fetched_at": self.clock(), "status_code": response.status_code, "response": response.body})
        received = str(extract_path(response.body, self.mapping.detail_external_id_path))
        if received != task.external_id: raise ContractViolation(f"detail external_id mismatch: task={task.external_id}, response={received}")
        self.store.mark_done(task)
