from __future__ import annotations
import hashlib,json
from pathlib import Path
from . import common
from .field_mapping import FieldMapping,extract_path
SOURCE="55camp"
DEDUP_FIELDNAMES=["external_id","lng","lat","source_tile_id","fetched_at","raw_hash"]
ENRICHED_FIELDNAMES=["external_id","name","lat","lng","address","province_code","city_code","district_code","source","coordinate_system","detail_fetched_at","raw_hash"]
def raw_hash(value):return hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(",",":")).encode()).hexdigest()
def dedup_camps(records,mapping):
    out={}
    for rec in records:
        for item in extract_path(rec["response"],mapping.list_items_path):
            id=str(extract_path(item,mapping.list_external_id_path))
            out.setdefault(id,{"external_id":id,"lng":extract_path(item,mapping.list_lng_path),"lat":extract_path(item,mapping.list_lat_path),"source_tile_id":rec.get("tile_id",""),"fetched_at":rec.get("fetched_at",""),"raw_hash":raw_hash(item)})
    return sorted(out.values(),key=lambda r:r["external_id"])
def merge_details(rows,details,mapping,province_code):
    detail={str(r["external_id"]):r for r in details};out=[]
    for row in rows:
        d=detail.get(row["external_id"]);body=d["response"] if d else None
        out.append({"external_id":row["external_id"],"name":str(extract_path(body,mapping.detail_name_path)) if d and mapping.detail_name_path else "","lat":row["lat"],"lng":row["lng"],"address":str(extract_path(body,mapping.detail_address_path)) if d and mapping.detail_address_path else "","province_code":province_code,"city_code":"","district_code":"","source":SOURCE,"coordinate_system":mapping.coordinate_system,"detail_fetched_at":d.get("fetched_at","") if d else "","raw_hash":raw_hash(body) if d else row["raw_hash"]})
    return out
def run_normalize(province_dir:Path,mapping:FieldMapping,province_code:str):
    rows=dedup_camps(common.read_jsonl(province_dir/"raw/camps.jsonl"),mapping);common.write_csv_atomic(province_dir/"processed/camps_dedup.csv",DEDUP_FIELDNAMES,rows);common.write_csv_atomic(province_dir/"processed/camps_enriched.csv",ENRICHED_FIELDNAMES,merge_details(rows,common.read_jsonl(province_dir/"raw/details.jsonl"),mapping,province_code))
