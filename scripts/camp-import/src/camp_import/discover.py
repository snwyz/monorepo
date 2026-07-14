from __future__ import annotations
import random, time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Callable
from . import common
from .common import ApiRequest, ApiResponse, RetryExhausted, Transport
from .field_mapping import FieldMapping, extract_path
from .tiles import Tile, can_split, grid_step_m, meters_to_degrees, split_tile, tile_from_center

STALE_RUNNING_SECONDS=600
TILE_FIELDNAMES=["province_code","tile_id","parent_tile_id","center_lng","center_lat","old_lng","old_lat","min_lng","min_lat","max_lng","max_lat","scale","depth","status","attempts","discovered_count","new_id_count","last_error","started_at","updated_at"]
GET_CAMPS_URL="https://55camp.cn/api/index/getCamps"
@dataclass
class TileRow:
    province_code:str; tile_id:str; parent_tile_id:str; center_lng:float; center_lat:float; old_lng:float; old_lat:float; min_lng:float; min_lat:float; max_lng:float; max_lat:float; scale:int; depth:int; status:str="pending"; attempts:int=0; discovered_count:int=0; new_id_count:int=0; last_error:str=""; started_at:str=""; updated_at:str=""
    @classmethod
    def from_tile(cls,tile:Tile,province_code:str): return cls(province_code,tile.tile_id,tile.parent_tile_id or "",tile.center_lng,tile.center_lat,tile.center_lng,tile.center_lat,tile.min_lng,tile.min_lat,tile.max_lng,tile.max_lat,tile.scale,tile.depth)
    @classmethod
    def from_csv(cls,r:dict):
        nums={"center_lng":float,"center_lat":float,"old_lng":float,"old_lat":float,"min_lng":float,"min_lat":float,"max_lng":float,"max_lat":float,"scale":int,"depth":int,"attempts":int,"discovered_count":int,"new_id_count":int}
        return cls(**{k:(nums[k](r[k] or 0) if k in nums else r.get(k,"") ) for k in TILE_FIELDNAMES})
    def to_tile(self): return Tile(self.tile_id,self.parent_tile_id or None,self.center_lng,self.center_lat,self.min_lng,self.min_lat,self.max_lng,self.max_lat,self.scale,self.depth)
class TileStore:
    def __init__(self,path:Path,clock:Callable[[],float]=time.time): self.path,self.clock,self._rows=path,clock,{r["tile_id"]:TileRow.from_csv(r) for r in common.read_csv_rows(path)}
    def rows(self): return list(self._rows.values())
    def get(self,id): return self._rows.get(id)
    def add(self,row):
        if row.tile_id in self._rows:return False
        self._rows[row.tile_id]=row;return True
    def save(self): common.write_csv_atomic(self.path,TILE_FIELDNAMES,(asdict(r) for r in self._rows.values()))
    def next_pending(self): return next((r for r in self._rows.values() if r.status in ("pending","retry")),None)
    def reset_stale_running(self):
        n=0
        for r in self.rows():
            if r.status=="running" and r.started_at and self.clock()-float(r.started_at)>STALE_RUNNING_SECONDS:r.status="retry";n+=1
        if n:self.save()
        return n
    def requeue_failed(self):
        rows=[r for r in self.rows() if r.status=="failed"]
        for r in rows:r.status="retry"
        if rows:self.save()
        return len(rows)
    def _mark(self,r,status,error=""):
        r.status=status;r.updated_at=f"{self.clock():.3f}";r.last_error=error or r.last_error;self.save()
    def mark_running(self,r):r.attempts+=1;r.started_at=f"{self.clock():.3f}";self._mark(r,"running")
    def mark_done(self,r):self._mark(r,"done")
    def mark_failed(self,r,error):self._mark(r,"failed",error)
def build_camps_request(row:TileRow,m:FieldMapping): return ApiRequest("GET",GET_CAMPS_URL,{m.list_lng_param:f"{row.center_lng:.6f}",m.list_lat_param:f"{row.center_lat:.6f}",m.list_old_lng_param:f"{row.old_lng:.6f}",m.list_old_lat_param:f"{row.old_lat:.6f}",m.list_scale_param:str(row.scale)})
class DiscoverEngine:
    def __init__(self,mapping:FieldMapping,transport:Transport,store:TileStore,raw_camps_path:Path,min_tile_area_m2:float,max_depth:int,rng=None,clock=time.time):
        self.m,self.t,self.s,self.raw,self.area,self.depth,self.rng,self.clock=mapping,transport,store,raw_camps_path,min_tile_area_m2,max_depth,rng or random.Random(0),clock;self.seen_ids=set()
        for rec in common.read_jsonl(self.raw): self.seen_ids.update(str(extract_path(i,self.m.list_external_id_path)) for i in extract_path(rec["response"],self.m.list_items_path))
    def seed(self,centers,province_code):
        w,h=self.m.viewport_for_scale(self.m.seed_scale)
        for lng,lat in centers:self.s.add(TileRow.from_tile(tile_from_center(lng,lat,w,h,self.m.seed_scale),province_code))
        self.s.save()
    def run(self):
        self.s.reset_stale_running()
        self._drain()
        self._sample_pruned_empty_tiles()
        self._drain()
    def _drain(self):
        while (r:=self.s.next_pending()) is not None:self._process(r)
    def _process(self,r):
        self.s.mark_running(r); req=build_camps_request(r,self.m)
        try:res=self.t.send(req)
        except RetryExhausted as e:self.s.mark_failed(r,e.last_error);return
        common.append_jsonl(self.raw,{"tile_id":r.tile_id,"params":req.params,"fetched_at":self.clock(),"status_code":res.status_code,"response":res.body})
        items=extract_path(res.body,self.m.list_items_path); ids=[str(extract_path(i,self.m.list_external_id_path)) for i in items]; unique=list(dict.fromkeys(ids));new=[i for i in unique if i not in self.seen_ids];self.seen_ids.update(new);r.discovered_count=len(ids);r.new_id_count=len(new)
        parent=self.s.get(r.parent_tile_id) if r.parent_tile_id else None; pruned=bool(parent and not parent.new_id_count and not r.new_id_count)
        truncated=bool(extract_path(res.body,self.m.truncation_signal_path)) if self.m.truncation_signal_path else False
        if can_split(r.to_tile(),self.area,self.depth) and not pruned and (r.discovered_count>=self.m.response_item_limit*self.m.dense_ratio or truncated or (r.depth>0 and r.new_id_count)):
            for child in split_tile(r.to_tile()):self.s.add(TileRow.from_tile(child,r.province_code))
        self._expand_edges(r, items)
        self.s.mark_done(r)
    def _edge_hops(self, row):
        hops,current=0,row
        while current.parent_tile_id:
            parent=self.s.get(current.parent_tile_id)
            if parent is None or parent.scale != current.scale: break
            hops,current=hops+1,parent
        return hops
    def _expand_edges(self,row,items):
        if row.depth or self._edge_hops(row) >= self.m.edge_expansion_max_hops:return
        width,height=row.max_lng-row.min_lng,row.max_lat-row.min_lat; directions=set()
        for item in items:
            lng,lat=float(extract_path(item,self.m.list_lng_path)),float(extract_path(item,self.m.list_lat_path))
            dx=-1 if lng-row.min_lng <= width*self.m.edge_margin_ratio else 1 if row.max_lng-lng <= width*self.m.edge_margin_ratio else 0
            dy=-1 if lat-row.min_lat <= height*self.m.edge_margin_ratio else 1 if row.max_lat-lat <= height*self.m.edge_margin_ratio else 0
            if dx or dy:directions.add((dx,dy))
        viewport_w,viewport_h=self.m.viewport_for_scale(row.scale)
        step_lng,step_lat=meters_to_degrees(grid_step_m(viewport_w,self.m.overlap_for_scale(row.scale)),grid_step_m(viewport_h,self.m.overlap_for_scale(row.scale)),row.center_lat)
        for dx,dy in directions:
            neighbor=tile_from_center(row.center_lng+dx*step_lng,row.center_lat+dy*step_lat,viewport_w,viewport_h,row.scale,parent_tile_id=row.tile_id)
            self.s.add(TileRow.from_tile(neighbor,row.province_code))
    def _sample_pruned_empty_tiles(self):
        parents={r.parent_tile_id for r in self.s.rows() if r.parent_tile_id}
        candidates=[]
        for row in self.s.rows():
            parent=self.s.get(row.parent_tile_id) if row.parent_tile_id else None
            if row.status=="done" and row.tile_id not in parents and parent and not row.new_id_count and not parent.new_id_count and can_split(row.to_tile(),self.area,self.depth): candidates.append(row)
        n=round(len(candidates)*self.m.empty_sample_ratio)
        for row in self.rng.sample(candidates,min(n,len(candidates))):
            for child in split_tile(row.to_tile()):self.s.add(TileRow.from_tile(child,row.province_code))
        if n:self.s.save()
