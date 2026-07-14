from __future__ import annotations
import math
from dataclasses import dataclass
METERS_PER_DEGREE_LAT = 111_320.0
@dataclass(frozen=True)
class Tile:
    tile_id: str; parent_tile_id: str | None; center_lng: float; center_lat: float; min_lng: float; min_lat: float; max_lng: float; max_lat: float; scale: int; depth: int
def meters_to_degrees(width_m: float, height_m: float, center_lat: float) -> tuple[float, float]: return width_m/(METERS_PER_DEGREE_LAT*math.cos(math.radians(center_lat))), height_m/METERS_PER_DEGREE_LAT
def make_tile_id(scale: int, depth: int, center_lng: float, center_lat: float) -> str: return f"s{scale}_d{depth}_{center_lng:.6f}_{center_lat:.6f}"
def tile_from_center(center_lng: float, center_lat: float, width_m: float, height_m: float, scale: int, depth: int=0, parent_tile_id: str | None=None) -> Tile:
    dlng,dlat=meters_to_degrees(width_m,height_m,center_lat)
    return Tile(make_tile_id(scale,depth,center_lng,center_lat),parent_tile_id,center_lng,center_lat,center_lng-dlng/2,center_lat-dlat/2,center_lng+dlng/2,center_lat+dlat/2,scale,depth)
def grid_step_m(viewport_m: float, overlap_ratio: float) -> float: return viewport_m*(1-overlap_ratio)
def split_tile(tile: Tile) -> list[Tile]:
    x,y=(tile.min_lng+tile.max_lng)/2,(tile.min_lat+tile.max_lat)/2
    return [Tile(make_tile_id(tile.scale+1,tile.depth+1,(a+b)/2,(c+d)/2),tile.tile_id,(a+b)/2,(c+d)/2,a,c,b,d,tile.scale+1,tile.depth+1) for a,b in ((tile.min_lng,x),(x,tile.max_lng)) for c,d in ((tile.min_lat,y),(y,tile.max_lat))]
def tile_area_m2(tile: Tile) -> float: return (tile.max_lng-tile.min_lng)*METERS_PER_DEGREE_LAT*math.cos(math.radians(tile.center_lat))*(tile.max_lat-tile.min_lat)*METERS_PER_DEGREE_LAT
def can_split(tile: Tile, min_tile_area_m2: float, max_depth: int) -> bool: return tile.depth < max_depth and tile_area_m2(tile) >= min_tile_area_m2
