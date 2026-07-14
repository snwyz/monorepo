from __future__ import annotations
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
import yaml
from .common import ApiRequest, ApiResponse, Transport, append_jsonl
from .field_mapping import ContractViolation, extract_path
GET_CAMPS_URL="https://55camp.cn/api/index/getCamps"
@dataclass(frozen=True)
class ProbeRequestProfile:
    items_path:str; external_id_path:str; lat_path:str; lng_path:str; list_lng_param:str; list_lat_param:str; list_old_lng_param:str; list_old_lat_param:str; list_scale_param:str; detail_id_param:str; detail_lng_param:str; detail_lat_param:str
@dataclass
class ProbeFindings:
    item_counts_by_scale:dict=field(default_factory=dict); candidate_item_limit:int|None=None; candidate_item_limit_by_scale:dict=field(default_factory=dict); duplicate_ratio_by_scale:dict=field(default_factory=dict); errors:list=field(default_factory=list); latencies_ms:list[float]=field(default_factory=list)

@dataclass(frozen=True)
class QpsBatchAssessment:
    qps: float
    request_count: int
    error_rate: float
    p95_ms: float | None
    should_stop: bool
    reason: str = ""

@dataclass(frozen=True)
class ProbePoint:
    purpose: str
    lng: float
    lat: float
    scale: int

def plan_viewport_boundary(center_lng: float, center_lat: float, scale: int, offsets_deg=(.05,.1,.15,.2)) -> list[ProbePoint]:
    """Directional ladder for later binary refinement around a known camp ID."""
    points=[]
    for offset in offsets_deg:
        points += [ProbePoint("east", center_lng+offset, center_lat, scale), ProbePoint("west", center_lng-offset, center_lat, scale), ProbePoint("north", center_lng, center_lat+offset, scale), ProbePoint("south", center_lng, center_lat-offset, scale)]
    return points

def plan_zero_result_confirmation(center_lng: float, center_lat: float, scales: list[int], offsets_deg=(.1,.2)) -> list[ProbePoint]:
    """Confirm that a zero-result center is sparse before classifying it as empty."""
    points=[]
    for scale in scales:
        points.append(ProbePoint("center", center_lng, center_lat, scale))
        for offset in offsets_deg:
            points += [ProbePoint("east", center_lng+offset, center_lat, scale), ProbePoint("west", center_lng-offset, center_lat, scale), ProbePoint("north", center_lng, center_lat+offset, scale), ProbePoint("south", center_lng, center_lat-offset, scale)]
    return points

def infer_candidate_mapping(list_body: object, detail_body: object | None = None) -> dict:
    """Suggest, never approve, paths from observed response shapes."""
    result={}
    if isinstance(list_body, dict) and isinstance(list_body.get("data"), list) and list_body["data"]:
        item=list_body["data"][0]
        if isinstance(item, dict):
            result.update({"list_items_path":"data", "list_external_id_path":"id" if "id" in item else None, "list_lat_path":"lat" if "lat" in item else "latitude" if "latitude" in item else None, "list_lng_path":"lnt" if "lnt" in item else "lng" if "lng" in item else "longitude" if "longitude" in item else None})
    if isinstance(detail_body, dict) and isinstance(detail_body.get("data"), dict) and isinstance(detail_body["data"].get("hotel"), dict):
        hotel=detail_body["data"]["hotel"]; result.update({"detail_external_id_path":"data.hotel.id" if "id" in hotel else None, "detail_name_path":"data.hotel.title" if "title" in hotel else None, "detail_address_path":"data.hotel.address" if "address" in hotel else None})
    return {key:value for key,value in result.items() if value is not None}

def assess_qps_batch(qps: float, status_codes: list[int], latencies_ms: list[float], baseline_p95_ms: float | None = None) -> QpsBatchAssessment:
    """Pure safety gate for manually run 0.5→1→2→3→4 QPS probe batches."""
    if not status_codes:
        return QpsBatchAssessment(qps, 0, 0.0, None, True, "empty batch")
    ordered = sorted(latencies_ms)
    p95 = ordered[min(len(ordered) - 1, max(0, int(len(ordered) * .95) - 1))] if ordered else None
    errors = sum(code >= 400 for code in status_codes)
    error_rate = errors / len(status_codes)
    consecutive_failures = any(status_codes[i:i + 2][0] >= 400 and status_codes[i:i + 2][1] >= 400 for i in range(len(status_codes) - 1))
    if 429 in status_codes: return QpsBatchAssessment(qps, len(status_codes), error_rate, p95, True, "rate limited")
    if consecutive_failures: return QpsBatchAssessment(qps, len(status_codes), error_rate, p95, True, "two consecutive failures")
    if error_rate >= .05: return QpsBatchAssessment(qps, len(status_codes), error_rate, p95, True, "error rate >= 5%")
    if baseline_p95_ms and p95 and p95 >= baseline_p95_ms * 2: return QpsBatchAssessment(qps, len(status_codes), error_rate, p95, True, "p95 >= 2x baseline")
    return QpsBatchAssessment(qps, len(status_codes), error_rate, p95, False)
def build_probe_plan(lng,lat,scales,profile,repeats=3,neighbor_offset_deg=.1):
    requests=[]
    for scale in scales:
        def request(x,y,ox=None): return ApiRequest("GET",GET_CAMPS_URL,{profile.list_lng_param:f"{x:.6f}",profile.list_lat_param:f"{y:.6f}",profile.list_old_lng_param:f"{(x if ox is None else ox):.6f}",profile.list_old_lat_param:f"{y:.6f}",profile.list_scale_param:str(scale)})
        requests += [request(lng,lat) for _ in range(repeats)] + [request(lng+neighbor_offset_deg,lat),request(lng,lat,lng-neighbor_offset_deg)]
    return requests
def analyze_probe_results(results, profile):
    out=ProbeFindings(); ids={}
    for request,response in results:
        scale=request.params[profile.list_scale_param]
        if response.status_code != 200: out.errors.append(f"scale={scale} http {response.status_code}");continue
        try: items=extract_path(response.body,profile.items_path); found={str(extract_path(i,profile.external_id_path)) for i in items}
        except ContractViolation as exc: out.errors.append(f"scale={scale} contract: {exc}");continue
        out.item_counts_by_scale.setdefault(scale,[]).append(len(items));ids.setdefault((scale,request.params[profile.list_lng_param]),set()).update(found)
    counts=Counter(c for cs in out.item_counts_by_scale.values() for c in cs); stable=[c for c,n in counts.items() if c>0 and n>=3];out.candidate_item_limit=max(stable) if stable else None
    for scale, values in out.item_counts_by_scale.items():
        stable_scale=[count for count,seen in Counter(values).items() if count>0 and seen>=3]
        if stable_scale: out.candidate_item_limit_by_scale[scale]=max(stable_scale)
    for scale in out.item_counts_by_scale:
        sets=[s for (key,s) in ids.items() if key[0]==scale]
        if len(sets)>1 and sets[0]|sets[1]:out.duplicate_ratio_by_scale[scale]=round(len(sets[0]&sets[1])/len(sets[0]|sets[1]),4)
    return out
def render_probe_report(f):
    lines=["# 55camp 接口探针报告","",f"## 重复样本的稳定返回计数（非接口上限）: {f.candidate_item_limit}"]
    if f.candidate_item_limit_by_scale: lines += ["", "## 各 scale 稳定返回计数（非接口上限）", *[f"- scale {scale}: {limit}" for scale,limit in sorted(f.candidate_item_limit_by_scale.items())]]
    if f.latencies_ms: lines += ["", f"## 本批次 P95 延迟(ms): {sorted(f.latencies_ms)[min(len(f.latencies_ms)-1, max(0, int(len(f.latencies_ms)*.95)-1))]:.2f}"]
    if f.errors: lines += ["", "## 异常", *[f"- {e}" for e in f.errors]]
    return "\n".join(lines)+"\n"
def run_probe(transport:Transport,plan,profile:ProbeRequestProfile,probe_dir:Path,clock=None):
    import time
    timer=clock or time.perf_counter; results=[]; latencies=[]
    for request in plan:
        started=timer(); response=transport.send(request); elapsed=(timer()-started)*1000; latencies.append(elapsed); results.append((request,response))
        append_jsonl(probe_dir / "probe_responses.jsonl", {"params": request.params, "status_code": response.status_code, "latency_ms": elapsed, "response": response.body})
    findings=analyze_probe_results(results,profile); findings.latencies_ms=latencies;probe_dir.mkdir(parents=True,exist_ok=True);(probe_dir/"probe_report.md").write_text(render_probe_report(findings),encoding="utf-8")
    path=probe_dir/"field_mapping.yaml"
    if not path.exists(): path.write_text(yaml.safe_dump({"list_items_path":profile.items_path,"list_external_id_path":profile.external_id_path,"list_lat_path":profile.lat_path,"list_lng_path":profile.lng_path,"list_lng_param":profile.list_lng_param,"list_lat_param":profile.list_lat_param,"list_old_lng_param":profile.list_old_lng_param,"list_old_lat_param":profile.list_old_lat_param,"list_scale_param":profile.list_scale_param,"detail_id_param":profile.detail_id_param,"detail_lng_param":profile.detail_lng_param,"detail_lat_param":profile.detail_lat_param,"detail_external_id_path":"","response_item_limit":None,"split_item_threshold":None,"coordinate_system":"","qps_limit":None,"seed_scale":None,"scale_viewport":{},"overlap_ratio_by_scale":{},"edge_margin_ratio":None,"edge_expansion_max_hops":None},allow_unicode=True,sort_keys=False),encoding="utf-8")
    return findings
