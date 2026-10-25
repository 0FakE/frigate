"""Round-trip-safe mask/zone editing for Frigate 0.13.x.

Coordinates are pixels in the detect resolution, matching v0.13.2.
"""
from __future__ import annotations

import hashlib
import io
import re
from typing import Any

from ruamel.yaml import YAML

_NAME = re.compile(r"^[A-Za-z0-9_]+$")
MAX_SHAPES = 64
MAX_POINTS = 60


def _yaml():
    y = YAML(typ="rt")
    y.preserve_quotes = True
    y.width = 4096
    return y


def revision(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def parse_polygon(value: Any) -> list[list[int]]:
    if not value:
        return []
    if isinstance(value, str):
        tokens = value.split(",")
        if len(tokens) % 2:
            raise ValueError("Odd number of polygon coordinates")
        return [[int(tokens[i]), int(tokens[i + 1])] for i in range(0, len(tokens), 2)]
    if isinstance(value, list):
        pts = []
        for pair in value:
            if isinstance(pair, str):
                xy = pair.split(",")
            elif isinstance(pair, (list, tuple)):
                xy = pair
            else:
                raise ValueError("Unsupported polygon point")
            if len(xy) != 2:
                raise ValueError("Invalid polygon point")
            pts.append([int(xy[0]), int(xy[1])])
        return pts
    raise ValueError("Unsupported polygon format")


def parse_masks(value: Any) -> list[list[list[int]]]:
    if not value:
        return []
    if isinstance(value, str):
        return [parse_polygon(value)]
    if isinstance(value, list):
        return [parse_polygon(item) for item in value]
    raise ValueError("Unsupported mask format")


def _camera(data: Any, camera: str):
    cameras = data.get("cameras", {}) if isinstance(data, dict) else {}
    if camera not in cameras:
        raise ValueError(f"Camera '{camera}' not found in configuration")
    return cameras[camera]


def read_polygons(raw: str, camera: str) -> dict:
    data = _yaml().load(raw)
    cfg = _camera(data, camera)
    return {
        "revision": revision(raw),
        "zones": {name: parse_polygon(zone.get("coordinates", "")) for name, zone in (cfg.get("zones") or {}).items()},
        "motion_masks": parse_masks((cfg.get("motion") or {}).get("mask")),
        "object_masks": {
            name: parse_masks(filt.get("mask"))
            for name, filt in ((cfg.get("objects") or {}).get("filters") or {}).items()
            if filt.get("mask")
        },
    }


def _validate_polygon(points: Any, width: int, height: int) -> str:
    if not isinstance(points, list) or not 3 <= len(points) <= MAX_POINTS:
        raise ValueError("Polygons need between 3 and 60 points")
    packed = []
    for pt in points:
        if not isinstance(pt, list) or len(pt) != 2 or any(type(v) is not int for v in pt):
            raise ValueError("Points must be [integer_x, integer_y]")
        x, y = pt
        if not 0 <= x <= width or not 0 <= y <= height:
            raise ValueError("Polygon point exceeds detect resolution")
        packed.extend([str(x), str(y)])
    if len(set(tuple(p) for p in points)) < 3:
        raise ValueError("Polygon needs 3 different points")
    return ",".join(packed)


def _validate_mask_group(group: Any, width: int, height: int) -> list[str]:
    if not isinstance(group, list) or len(group) > MAX_SHAPES:
        raise ValueError("Invalid number of masks")
    return [_validate_polygon(pts, width, height) for pts in group]


def update_polygons(raw: str, camera: str, payload: dict, width: int, height: int) -> str:
    """Update camera-local geometry, retaining unrelated YAML and comments."""
    if not isinstance(payload, dict):
        raise ValueError("Invalid polygon payload")
    if width <= 0 or height <= 0:
        raise ValueError("Detect resolution is not configured")
    if payload.get("revision") != revision(raw):
        raise RuntimeError("Configuration changed elsewhere; reload before saving")
    zones = payload.get("zones")
    motions = payload.get("motion_masks")
    objects = payload.get("object_masks")
    if not all(isinstance(v, dict) for v in (zones, objects)) or motions is None:
        raise ValueError("Missing polygon groups")
    if len(zones) > MAX_SHAPES or len(objects) > MAX_SHAPES:
        raise ValueError("Too many zones or object filters")
    checked_zones = {}
    for name, points in zones.items():
        if not isinstance(name, str) or not _NAME.fullmatch(name):
            raise ValueError("Zone names must contain only letters, numbers, underscores")
        checked_zones[name] = _validate_polygon(points, width, height)
    checked_motions = _validate_mask_group(motions, width, height)
    checked_objects = {}
    for name, masks in objects.items():
        if not isinstance(name, str) or not _NAME.fullmatch(name):
            raise ValueError("Invalid object filter name")
        checked_objects[name] = _validate_mask_group(masks, width, height)

    yaml = _yaml()
    data = yaml.load(raw)
    cfg = _camera(data, camera)
    zone_cfg = cfg.setdefault("zones", {})
    for name in list(zone_cfg):
        if name not in checked_zones:
            del zone_cfg[name]
    for name, coordinates in checked_zones.items():
        zone_cfg.setdefault(name, {})["coordinates"] = coordinates

    motion_cfg = cfg.setdefault("motion", {})
    if checked_motions:
        motion_cfg["mask"] = checked_motions
    else:
        motion_cfg.pop("mask", None)

    objects_cfg = cfg.setdefault("objects", {})
    filters = objects_cfg.setdefault("filters", {})
    for name, old in list(filters.items()):
        if name not in checked_objects:
            old.pop("mask", None)
    for name, masks in checked_objects.items():
        if masks:
            filters.setdefault(name, {})["mask"] = masks
        elif name in filters:
            filters[name].pop("mask", None)
    stream = io.StringIO()
    yaml.dump(data, stream)
    return stream.getvalue()
