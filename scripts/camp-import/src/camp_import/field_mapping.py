"""审核后的 field_mapping.yaml 契约。"""
from __future__ import annotations
from dataclasses import dataclass, fields
from pathlib import Path
import yaml

class FieldMappingError(Exception): pass
class ContractViolation(Exception): pass

REQUIRED_KEYS = (
    "list_items_path", "list_external_id_path", "list_lat_path", "list_lng_path",
    "detail_external_id_path", "list_lng_param", "list_lat_param", "list_old_lng_param",
    "list_old_lat_param", "list_scale_param", "detail_id_param", "detail_lng_param",
    "detail_lat_param", "coordinate_system", "qps_limit", "seed_scale",
    "scale_viewport", "overlap_ratio_by_scale", "edge_margin_ratio", "edge_expansion_max_hops",
)

@dataclass(frozen=True)
class FieldMapping:
    list_items_path: str; list_external_id_path: str; list_lat_path: str; list_lng_path: str
    detail_external_id_path: str; list_lng_param: str; list_lat_param: str; list_old_lng_param: str
    list_old_lat_param: str; list_scale_param: str; detail_id_param: str; detail_lng_param: str; detail_lat_param: str
    response_item_limit: int | None; coordinate_system: str; qps_limit: float; seed_scale: int
    scale_viewport: dict; overlap_ratio_by_scale: dict; edge_margin_ratio: float; edge_expansion_max_hops: int
    burst: int = 1; concurrency: int = 1; dense_ratio: float = .8; empty_sample_ratio: float = .05; response_item_limit_by_scale: dict | None = None
    split_item_threshold: int | None = None; split_item_threshold_by_scale: dict | None = None
    truncation_signal_path: str | None = None; detail_name_path: str | None = None; detail_address_path: str | None = None
    required_auth: tuple = (); required_signature: str | None = None

    def viewport_for_scale(self, scale: int) -> tuple[float, float]:
        entry = self.scale_viewport.get(str(scale)) or {}
        try: return float(entry["width_m"]), float(entry["height_m"])
        except (KeyError, TypeError, ValueError) as exc: raise FieldMappingError(f"scale_viewport missing scale {scale}") from exc
    def overlap_for_scale(self, scale: int) -> float:
        try: return float(self.overlap_ratio_by_scale[str(scale)])
        except (KeyError, TypeError, ValueError) as exc: raise FieldMappingError(f"overlap_ratio_by_scale missing scale {scale}") from exc
    def item_limit_for_scale(self, scale: int) -> int:
        if self.response_item_limit_by_scale and str(scale) in self.response_item_limit_by_scale:
            return int(self.response_item_limit_by_scale[str(scale)])
        if self.response_item_limit is None:
            raise FieldMappingError("response_item_limit is not verified")
        return int(self.response_item_limit)
    def split_threshold_for_scale(self, scale: int) -> int:
        if self.split_item_threshold_by_scale and str(scale) in self.split_item_threshold_by_scale:
            return int(self.split_item_threshold_by_scale[str(scale)])
        if self.split_item_threshold is not None:
            return int(self.split_item_threshold)
        return int(self.item_limit_for_scale(scale) * self.dense_ratio)

def load_field_mapping(path: Path) -> FieldMapping:
    if not path.exists(): raise FieldMappingError(f"field_mapping not found: {path}")
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    missing = [key for key in REQUIRED_KEYS if data.get(key) in (None, "", [], {})]
    if missing: raise FieldMappingError("field_mapping required keys empty: " + ", ".join(missing))
    kwargs = {key: value for key, value in data.items() if key in {f.name for f in fields(FieldMapping)}}
    kwargs.setdefault("response_item_limit", None)
    if "required_auth" in kwargs: kwargs["required_auth"] = tuple(kwargs["required_auth"] or ())
    try: mapping = FieldMapping(**kwargs)
    except TypeError as exc: raise FieldMappingError(str(exc)) from exc
    try:
        mapping.viewport_for_scale(mapping.seed_scale)
        if mapping.qps_limit <= 0 or (mapping.response_item_limit is not None and mapping.response_item_limit <= 0) or (mapping.response_item_limit is None and mapping.split_item_threshold is None) or (mapping.split_item_threshold is not None and mapping.split_item_threshold <= 0) or not 0 < mapping.dense_ratio <= 1 or not 0 <= mapping.empty_sample_ratio <= 1 or not 0 < mapping.edge_margin_ratio < .5 or mapping.edge_expansion_max_hops < 0: raise ValueError
        for scale in mapping.overlap_ratio_by_scale:
            mapping.viewport_for_scale(int(scale)); overlap = mapping.overlap_for_scale(int(scale))
            if not 0 <= overlap < 1: raise ValueError
        if mapping.response_item_limit_by_scale and any(int(value) <= 0 for value in mapping.response_item_limit_by_scale.values()): raise ValueError
        if mapping.split_item_threshold_by_scale and any(int(value) <= 0 for value in mapping.split_item_threshold_by_scale.values()): raise ValueError
    except (ValueError, TypeError) as exc: raise FieldMappingError("invalid numeric field_mapping value") from exc
    return mapping

def extract_path(obj: object, path: str) -> object:
    current = obj
    for part in path.split("."):
        if not isinstance(current, dict) or part not in current: raise ContractViolation(f"path '{path}' not found at segment '{part}'")
        current = current[part]
    return current
