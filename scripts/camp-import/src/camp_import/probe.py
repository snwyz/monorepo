from __future__ import annotations
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
import yaml
from .common import ApiRequest, ApiResponse, Transport
from .field_mapping import ContractViolation, extract_path
GET_CAMPS_URL="https://55camp.cn/api/index/getCamps"
@dataclass(frozen=True)
class ProbeRequestProfile:
    items_path:str; external_id_path:str; lat_path:str; lng_path:str; list_lng_param:str; list_lat_param:str; list_old_lng_param:str; list_old_lat_param:str; list_scale_param:str; detail_id_param:str; detail_lng_param:str; detail_lat_param:str
@dataclass
class ProbeFindings:
    item_counts_by_scale:dict=field(default_factory=dict); candidate_item_limit:int|None=None; duplicate_ratio_by_scale:dict=field(default_factory=dict); errors:list=field(default_factory=list)
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
    for scale in out.item_counts_by_scale:
        sets=[s for (key,s) in ids.items() if key[0]==scale]
        if len(sets)>1 and sets[0]|sets[1]:out.duplicate_ratio_by_scale[scale]=round(len(sets[0]&sets[1])/len(sets[0]|sets[1]),4)
    return out
def render_probe_report(f): return "\n".join(["# 55camp 接口探针报告","",f"## 候选 response_item_limit: {f.candidate_item_limit}","",*(["## 异常",*[f"- {e}" for e in f.errors]] if f.errors else [])])+"\n"
def run_probe(transport:Transport,plan,profile:ProbeRequestProfile,probe_dir:Path):
    findings=analyze_probe_results([(r,transport.send(r)) for r in plan],profile);probe_dir.mkdir(parents=True,exist_ok=True);(probe_dir/"probe_report.md").write_text(render_probe_report(findings),encoding="utf-8")
    path=probe_dir/"field_mapping.yaml"
    if not path.exists(): path.write_text(yaml.safe_dump({"list_items_path":profile.items_path,"list_external_id_path":profile.external_id_path,"list_lat_path":profile.lat_path,"list_lng_path":profile.lng_path,"list_lng_param":profile.list_lng_param,"list_lat_param":profile.list_lat_param,"list_old_lng_param":profile.list_old_lng_param,"list_old_lat_param":profile.list_old_lat_param,"list_scale_param":profile.list_scale_param,"detail_id_param":profile.detail_id_param,"detail_lng_param":profile.detail_lng_param,"detail_lat_param":profile.detail_lat_param,"detail_external_id_path":"","response_item_limit":findings.candidate_item_limit,"coordinate_system":"","qps_limit":None,"seed_scale":None,"scale_viewport":{},"overlap_ratio_by_scale":{},"edge_margin_ratio":None,"edge_expansion_max_hops":None},allow_unicode=True,sort_keys=False),encoding="utf-8")
    return findings
