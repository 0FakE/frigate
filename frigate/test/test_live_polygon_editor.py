"""Tests for the Frigate v0.13.2 live polygon YAML helper."""
import unittest

from frigate.util.live_polygon_editor import read_polygons, update_polygons

BASE = """mqtt:
  host: mosquitto # preserve this comment
cameras:
  driveway:
    ffmpeg:
      inputs:
        - path: rtsp://user:pass@camera.local/stream
          roles: [detect]
    detect:
      width: 640
      height: 360
    zones:
      front:
        coordinates: 10,20,80,20,80,90
        inertia: 4 # preserve inertia
    motion:
      threshold: 40
      mask:
        - 0,0,100,0,100,30
    objects:
      filters:
        person:
          min_score: 0.6
          mask: 2,2,60,2,60,60
"""


class TestLivePolygonEditor(unittest.TestCase):
    def test_read_legacy_pixel_coordinates(self):
        data = read_polygons(BASE, "driveway")
        self.assertEqual(data["zones"]["front"], [[10, 20], [80, 20], [80, 90]])
        self.assertEqual(data["motion_masks"][0][2], [100, 30])
        self.assertEqual(data["object_masks"]["person"][0][0], [2, 2])

    def test_preserve_other_configuration(self):
        data = read_polygons(BASE, "driveway")
        data["zones"]["front"][0] = [25, 20]
        data["motion_masks"] = []
        data["object_masks"] = {}
        changed = update_polygons(BASE, "driveway", data, 640, 360)
        self.assertIn("inertia: 4 # preserve inertia", changed)
        self.assertIn("host: mosquitto # preserve this comment", changed)
        self.assertIn("min_score: 0.6", changed)
        self.assertIn("coordinates: 25,20,80,20,80,90", changed)
        self.assertEqual(read_polygons(changed, "driveway")["motion_masks"], [])

    def test_rename_preserves_zone_metadata_and_required_zone_references(self):
        raw = BASE.replace(
            "        inertia: 4 # preserve inertia",
            "        inertia: 4 # preserve inertia\n"
            "        objects: [person]",
        ).replace(
            "    objects:\n      filters:",
            "    onvif:\n      autotracking:\n        required_zones: [front]\n"
            "    objects:\n      filters:",
        ).replace(
            "          min_score: 0.6",
            "          required_zones: [front]\n          min_score: 0.6",
        )
        payload = read_polygons(raw, "driveway")
        payload["zones"]["entry"] = payload["zones"].pop("front")
        payload["zone_objects"]["entry"] = payload["zone_objects"].pop("front")
        payload["zone_renames"] = {"front": "entry"}
        updated = update_polygons(raw, "driveway", payload, 640, 360)
        self.assertIn("inertia: 4 # preserve inertia", updated)
        self.assertIn("objects: [person]", updated)
        self.assertEqual(updated.count("required_zones: [entry]"), 2)
        self.assertNotIn("required_zones: [front]", updated)
        self.assertEqual(list(read_polygons(updated, "driveway")["zones"]), ["entry"])
        self.assertIn("host: mosquitto # preserve this comment", updated)


    def test_zone_object_selections_round_trip_and_clear_without_losing_metadata(self):
        raw = BASE.replace(
            "        inertia: 4 # preserve inertia",
            "        inertia: 4 # preserve inertia\n        objects: [person, cat]",
        ).replace("    objects:\n      filters:", "    objects:\n      track: [person, cat, dog]\n      filters:", 1)
        data = read_polygons(raw, "driveway")
        self.assertEqual(data["zone_objects"]["front"], ["person", "cat"])
        data["zone_objects"]["front"] = ["cat", "dog"]
        updated = update_polygons(raw, "driveway", data, 640, 360)
        self.assertEqual(read_polygons(updated, "driveway")["zone_objects"]["front"], ["cat", "dog"])
        self.assertIn("inertia: 4 # preserve inertia", updated)
        self.assertIn("host: mosquitto # preserve this comment", updated)

        cleared = read_polygons(updated, "driveway")
        cleared["zone_objects"]["front"] = None
        final = update_polygons(updated, "driveway", cleared, 640, 360)
        self.assertIsNone(read_polygons(final, "driveway")["zone_objects"]["front"])
        self.assertNotIn("        objects: [cat, dog]", final)

    def test_renaming_zone_preserves_edited_object_selections(self):
        raw = BASE.replace(
            "        inertia: 4 # preserve inertia",
            "        inertia: 4 # preserve inertia\n        objects: [person]",
        )
        payload = read_polygons(raw, "driveway")
        payload["zones"]["entry"] = payload["zones"].pop("front")
        payload["zone_objects"]["entry"] = ["person"]
        del payload["zone_objects"]["front"]
        payload["zone_renames"] = {"front": "entry"}
        updated = update_polygons(raw, "driveway", payload, 640, 360)
        self.assertEqual(read_polygons(updated, "driveway")["zone_objects"]["entry"], ["person"])
        self.assertIn("inertia: 4 # preserve inertia", updated)

    def test_reject_invalid_and_untracked_zone_objects(self):
        raw = BASE.replace("    objects:\n      filters:", "    objects:\n      track: [person, cat]\n      filters:", 1)
        payload = read_polygons(raw, "driveway")
        for bad_value in ([], ["dog"], ["person", "person"], [42], "person"):
            payload["zone_objects"]["front"] = bad_value
            with self.assertRaisesRegex(ValueError, "zone object|Zone object|Zone objects"):
                update_polygons(raw, "driveway", payload, 640, 360)
        payload["zone_objects"] = {"missing": ["person"]}
        with self.assertRaisesRegex(ValueError, "must match"):
            update_polygons(raw, "driveway", payload, 640, 360)

    def test_geometry_only_legacy_payload_keeps_zone_objects(self):
        raw = BASE.replace(
            "        inertia: 4 # preserve inertia",
            "        inertia: 4 # preserve inertia\n        objects: [person]",
        )
        payload = read_polygons(raw, "driveway")
        del payload["zone_objects"]
        updated = update_polygons(raw, "driveway", payload, 640, 360)
        self.assertEqual(read_polygons(updated, "driveway")["zone_objects"]["front"], ["person"])

    def test_reject_unsafe_zone_rename_payload(self):
        payload = read_polygons(BASE, "driveway")
        payload["zones"] = {"entry": payload["zones"]["front"]}
        payload["zone_objects"] = {"entry": None}
        payload["zone_renames"] = {"not_existing": "entry"}
        with self.assertRaisesRegex(ValueError, "Original zone"):
            update_polygons(BASE, "driveway", payload, 640, 360)
        payload["zone_renames"] = {"front": "bad name"}
        with self.assertRaisesRegex(ValueError, "Invalid zone rename"):
            update_polygons(BASE, "driveway", payload, 640, 360)
        payload["zone_renames"] = {"front": "entry"}
        payload["zones"]["front"] = payload["zones"]["entry"]
        payload["zone_objects"]["front"] = None
        with self.assertRaisesRegex(ValueError, "does not match"):
            update_polygons(BASE, "driveway", payload, 640, 360)

    def test_refuse_outdated_revision(self):
        data = read_polygons(BASE, "driveway")
        with self.assertRaises(RuntimeError):
            update_polygons(BASE + "\n", "driveway", data, 640, 360)

    def test_out_of_bounds(self):
        data = read_polygons(BASE, "driveway")
        data["zones"]["front"][0] = [900, 20]
        with self.assertRaises(ValueError):
            update_polygons(BASE, "driveway", data, 640, 360)

    def test_delete_and_add_zone(self):
        data = read_polygons(BASE, "driveway")
        data["zones"] = {"new_zone": [[10, 10], [40, 10], [40, 40]]}
        data["zone_objects"] = {"new_zone": None}
        changed = update_polygons(BASE, "driveway", data, 640, 360)
        self.assertEqual(list(read_polygons(changed, "driveway")["zones"]), ["new_zone"])

    def test_reject_collinear_polygon(self):
        data = read_polygons(BASE, "driveway")
        data["zones"]["front"] = [[10, 10], [20, 20], [30, 30]]
        with self.assertRaisesRegex(ValueError, "non-zero area"):
            update_polygons(BASE, "driveway", data, 640, 360)

    def test_event_zone_flags_preserve_existing_record_and_snapshot_lists(self):
        raw = BASE.replace(
            "    motion:\n",
            "    record:\n      events:\n        required_zones: [front] # keep video\n"
            "    snapshots:\n      required_zones: [front] # keep snapshots\n"
            "    motion:\n",
        )
        payload = read_polygons(raw, "driveway")
        self.assertEqual(payload["zone_event_zones"], {
            "record": ["front"], "snapshots": ["front"]
        })
        payload["zones"]["entry"] = [[200, 20], [270, 20], [270, 90]]
        payload["zone_objects"]["entry"] = None
        payload["zone_event_zones"]["snapshots"].append("entry")
        updated = update_polygons(raw, "driveway", payload, 640, 360)
        self.assertIn("required_zones: [front] # keep video", updated)
        self.assertIn("required_zones: [front, entry] # keep snapshots", updated)
        self.assertEqual(read_polygons(updated, "driveway")["zone_event_zones"], {
            "record": ["front"], "snapshots": ["front", "entry"]
        })

    def test_unrestricted_mode_is_an_empty_override_not_no_events(self):
        raw = BASE.replace(
            "cameras:\n",
            "record:\n  events:\n    required_zones: [front]\n"
            "snapshots:\n  required_zones: [front]\n"
            "cameras:\n",
        )
        payload = read_polygons(raw, "driveway")
        self.assertEqual(payload["zone_event_zones"]["record"], ["front"])
        payload["zone_event_zones"] = {"record": [], "snapshots": []}
        updated = update_polygons(raw, "driveway", payload, 640, 360)
        self.assertIn("required_zones: []", updated)
        self.assertEqual(read_polygons(updated, "driveway")["zone_event_zones"], {
            "record": [], "snapshots": []
        })
        self.assertIn("required_zones: [front]", updated)

    def test_rename_and_delete_update_related_zone_references(self):
        raw = BASE.replace(
            "    motion:\n",
            "    record:\n      events:\n        required_zones: [front]\n"
            "    snapshots:\n      required_zones: [front]\n"
            "    mqtt:\n      required_zones: [front]\n"
            "    motion:\n",
        )
        rename = read_polygons(raw, "driveway")
        rename["zones"]["entry"] = rename["zones"].pop("front")
        rename["zone_objects"]["entry"] = rename["zone_objects"].pop("front")
        rename["zone_event_zones"] = {"record": ["entry"], "snapshots": ["entry"]}
        rename["zone_renames"] = {"front": "entry"}
        updated = update_polygons(raw, "driveway", rename, 640, 360)
        self.assertEqual(updated.count("required_zones: [entry]"), 3)

        removed = read_polygons(updated, "driveway")
        removed["zones"] = {}
        removed["zone_objects"] = {}
        removed["zone_event_zones"] = {"record": [], "snapshots": []}
        with self.assertRaisesRegex(ValueError, "last required"):
            update_polygons(updated, "driveway", removed, 640, 360)

        # First explicitly choose unrestricted mode, then deletion is safe.
        reset = read_polygons(updated, "driveway")
        reset["zone_event_zones"] = {"record": [], "snapshots": []}
        unrestricted = update_polygons(updated, "driveway", reset, 640, 360)
        removed = read_polygons(unrestricted, "driveway")
        removed["zones"] = {}
        removed["zone_objects"] = {}
        deleted = update_polygons(unrestricted, "driveway", removed, 640, 360)
        self.assertNotIn("required_zones: [entry]", deleted)
        self.assertEqual(read_polygons(deleted, "driveway")["zone_event_zones"], {
            "record": [], "snapshots": []
        })

    def test_legacy_payload_keeps_record_and_snapshot_restrictions(self):
        raw = BASE.replace(
            "    motion:\n",
            "    record:\n      events:\n        required_zones: [front]\n"
            "    snapshots:\n      required_zones: [front]\n"
            "    motion:\n",
        )
        payload = read_polygons(raw, "driveway")
        del payload["zone_event_zones"]
        self.assertIn("required_zones: [front]",
            update_polygons(raw, "driveway", payload, 640, 360))

    def test_reject_invalid_event_zone_payload(self):
        for invalid in (
            {"record": ["front"]},
            {"record": ["front", "front"], "snapshots": []},
            {"record": "front", "snapshots": []},
            {"record": [], "snapshots": [1]},
        ):
            payload = read_polygons(BASE, "driveway")
            payload["zone_event_zones"] = invalid
            with self.assertRaisesRegex(ValueError, "event.zone|event zones"):
                update_polygons(BASE, "driveway", payload, 640, 360)

    def test_no_extra_empty_sections(self):
        minimal = """cameras:
  driveway:
    detect:
      width: 640
      height: 360
"""
        data = read_polygons(minimal, "driveway")
        self.assertEqual(update_polygons(minimal, "driveway", data, 640, 360), minimal)



if __name__ == "__main__":
    unittest.main()
