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


def _effective_required_zones(document: dict, camera: dict, kind: str) -> list[str]:
    # Camera-local lists override global ones. An empty list means no restriction,
    # NOT "do not save events".
    if kind == "record":
        camera_section = (camera.get("record") or {}).get("events") or {}
        global_section = ((document.get("record") or {}).get("events") or {})
    else:
        camera_section = camera.get("snapshots") or {}
        global_section = document.get("snapshots") or {}
    return list(camera_section.get("required_zones", global_section.get("required_zones") or []) or [])


def read_polygons(raw: str, camera: str) -> dict:
    data = _yaml().load(raw)
    cfg = _camera(data, camera)
    return {
        "revision": revision(raw),
        "zones": {name: parse_polygon(zone.get("coordinates", "")) for name, zone in (cfg.get("zones") or {}).items()},
        "zone_objects": {
            name: list(zone.get("objects") or []) or None
            for name, zone in (cfg.get("zones") or {}).items()
        },
        "zone_event_zones": {
            "record": _effective_required_zones(data, cfg, "record"),
            "snapshots": _effective_required_zones(data, cfg, "snapshots"),
        },
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
    doubled_area = sum(
        points[i][0] * points[(i + 1) % len(points)][1]
        - points[(i + 1) % len(points)][0] * points[i][1]
        for i in range(len(points))
    )
    if doubled_area == 0:
        raise ValueError("Polygon must enclose a non-zero area")
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
    # This field is optional for backwards compatibility with geometry-only clients.
    zone_objects = payload.get("zone_objects")
    if zone_objects is not None:
        if not isinstance(zone_objects, dict) or set(zone_objects) != set(checked_zones):
            raise ValueError("Zone object selections must match the submitted zones")
        for labels in zone_objects.values():
            if labels is not None and (
                not isinstance(labels, list)
                or not 0 < len(labels) <= MAX_SHAPES
                or any(not isinstance(label, str) or not _NAME.fullmatch(label) for label in labels)
                or len(set(labels)) != len(labels)
            ):
                raise ValueError("Invalid zone object selection")
    # Optional so older polygon-only clients keep all event restrictions.
    zone_event_zones = payload.get("zone_event_zones")
    if zone_event_zones is not None:
        if not isinstance(zone_event_zones, dict) or set(zone_event_zones) != {"record", "snapshots"}:
            raise ValueError("Invalid event-zone settings")
        for names in zone_event_zones.values():
            if (
                not isinstance(names, list)
                or len(names) > MAX_SHAPES
                or any(not isinstance(name, str) or not _NAME.fullmatch(name) for name in names)
                or len(set(names)) != len(names)
            ):
                raise ValueError("Invalid required event zones")
    renames = payload.get("zone_renames", {})
    if not isinstance(renames, dict) or any(
        not isinstance(old, str) or not isinstance(new, str)
        or not _NAME.fullmatch(old) or not _NAME.fullmatch(new)
        or old == new
        for old, new in renames.items()
    ):
        raise ValueError("Invalid zone rename mapping")
    if len(set(renames.values())) != len(renames):
        raise ValueError("Duplicate zone rename destination")
    if any(old in checked_zones or new not in checked_zones for old, new in renames.items()):
        raise ValueError("Zone rename does not match submitted zone data")

    checked_motions = _validate_mask_group(motions, width, height)
    checked_objects = {}
    for name, masks in objects.items():
        if not isinstance(name, str) or not _NAME.fullmatch(name):
            raise ValueError("Invalid object filter name")
        checked_objects[name] = _validate_mask_group(masks, width, height)

    yaml = _yaml()
    data = yaml.load(raw)
    cfg = _camera(data, camera)
    if zone_objects is not None:
        camera_objects = cfg.get("objects") or {}
        global_objects = data.get("objects") or {}
        tracked = (
            camera_objects.get("track")
            if "track" in camera_objects
            else global_objects.get("track")
        )
        if tracked is not None:
            if not isinstance(tracked, list):
                raise ValueError("Invalid camera object tracking configuration")
            allowed = set(tracked)
            for labels in zone_objects.values():
                if labels and any(label not in allowed for label in labels):
                    raise ValueError("Zone objects must be tracked by this camera")
    zone_cfg = cfg.get("zones")
    removed_zones = set(zone_cfg or {}) - set(checked_zones) - set(renames)
    for kind in ("record", "snapshots"):
        original_required = _effective_required_zones(data, cfg, kind)
        if (removed_zones & set(original_required)) and not (
            set(original_required) - removed_zones
        ):
            # Older clients cannot explicitly switch to unrestricted mode.
            # New clients deliberately submit an empty list to do so; the
            # editor prevents it from occurring as an accidental side effect.
            explicit_unrestricted = (
                zone_event_zones is not None and zone_event_zones[kind] == []
            )
            if not explicit_unrestricted:
                raise ValueError(
                    f"Cannot delete the last required {kind} zone; "
                    "choose another zone or remove the restriction first"
                )
    if renames:
        if zone_cfg is None:
            raise ValueError("No existing zones to rename")
        if any(old not in zone_cfg for old in renames):
            raise ValueError("Original zone no longer exists")
        if any(new in zone_cfg and new not in renames for new in renames.values()):
            raise ValueError("Renamed zone conflicts with an existing zone")
        # Move each original YAML zone mapping (including its comments and
        # non-geometric settings), rather than deleting it and creating a new one.
        moved = {}
        positions = {name: i for i, name in enumerate(zone_cfg)}
        for old in renames:
            comment = zone_cfg.ca.items.pop(old, None)
            moved[old] = (zone_cfg.pop(old), comment)
        for old, new in sorted(renames.items(), key=lambda item: positions[item[0]]):
            value, comment = moved[old]
            zone_cfg.insert(positions[old], new, value)
            if comment is not None:
                zone_cfg.ca.items[new] = comment

        # Rewrite references in this camera only; other cameras are untouched.
        def update_required_zones(node):
            if isinstance(node, dict):
                for key, value in node.items():
                    if key == "required_zones" and isinstance(value, list):
                        for i, name in enumerate(value):
                            if isinstance(name, str) and name in renames:
                                value[i] = renames[name]
                    else:
                        update_required_zones(value)
            elif isinstance(node, list):
                for value in node:
                    update_required_zones(value)

        update_required_zones(cfg)

    # Removed zones must not linger in record/snapshot/MQTT/autotracking
    # required_zones references for this camera.
    if removed_zones:
        def remove_deleted_zone_references(node):
            if isinstance(node, dict):
                for key, value in node.items():
                    if key == "required_zones" and isinstance(value, list):
                        value[:] = [name for name in value if name not in removed_zones]
                    else:
                        remove_deleted_zone_references(value)
            elif isinstance(node, list):
                for value in node:
                    remove_deleted_zone_references(value)

        remove_deleted_zone_references(cfg)

    if zone_event_zones is not None:
        for kind in ("record", "snapshots"):
            requested = zone_event_zones[kind]
            # No-op saves do not add redundant empty sections.
            # Global restrictions are considered when deciding whether a
            # camera-local override is required.
            current = _effective_required_zones(data, cfg, kind)
            if requested == current:
                continue
            if kind == "record":
                target = cfg.setdefault("record", {}).setdefault("events", {})
            else:
                target = cfg.setdefault("snapshots", {})
            existing = target.get("required_zones")
            if isinstance(existing, list):
                existing[:] = requested
            else:
                target["required_zones"] = requested

    if checked_zones or zone_cfg is not None:
        zone_cfg = cfg.setdefault("zones", {})
        for name in list(zone_cfg):
            if name not in checked_zones:
                del zone_cfg[name]
        for name, coordinates in checked_zones.items():
            zone = zone_cfg.setdefault(name, {})
            zone["coordinates"] = coordinates
            if zone_objects is not None:
                selected_objects = zone_objects[name]
                if selected_objects:
                    if isinstance(zone.get("objects"), list):
                        # Preserve ruamel's flow/block style and list comments.
                        zone["objects"][:] = selected_objects
                    else:
                        zone["objects"] = selected_objects
                else:
                    zone.pop("objects", None)

    motion_cfg = cfg.get("motion")
    if checked_motions:
        cfg.setdefault("motion", {})["mask"] = checked_motions
    elif motion_cfg is not None:
        motion_cfg.pop("mask", None)

    objects_cfg = cfg.get("objects")
    filters = (objects_cfg or {}).get("filters")
    if checked_objects or filters is not None:
        filters = cfg.setdefault("objects", {}).setdefault("filters", {})
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
