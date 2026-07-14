"""Per-seed density policy used before discover creates tiles."""
from __future__ import annotations
from dataclasses import dataclass

VALID_DENSITY_PROFILES = {"dense", "sparse", "unknown"}

@dataclass(frozen=True)
class SeedSpec:
    lng: float
    lat: float
    density_profile: str = "unknown"
    seed_scale: int | None = None

    def resolved_scale(self, default_scale: int) -> int:
        if self.density_profile not in VALID_DENSITY_PROFILES:
            raise ValueError(f"invalid density_profile: {self.density_profile}")
        return self.seed_scale if self.seed_scale is not None else default_scale

    @property
    def requires_empty_confirmation(self) -> bool:
        return self.density_profile in {"sparse", "unknown"}
