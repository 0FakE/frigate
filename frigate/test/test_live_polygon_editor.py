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
        payload["zone_renames"] = {"front": "entry"}
        updated = update_polygons(raw, "driveway", payload, 640, 360)
        self.assertIn("inertia: 4 # preserve inertia", updated)
        self.assertIn("objects: [person]", updated)
        self.assertEqual(updated.count("required_zones: [entry]"), 2)
        self.assertNotIn("required_zones: [front]", updated)
        self.assertEqual(list(read_polygons(updated, "driveway")["zones"]), ["entry"])
        self.assertIn("host: mosquitto # preserve this comment", updated)

    def test_reject_unsafe_zone_rename_payload(self):
        payload = read_polygons(BASE, "driveway")
        payload["zones"] = {"entry": payload["zones"]["front"]}
        payload["zone_renames"] = {"not_existing": "entry"}
        with self.assertRaisesRegex(ValueError, "Original zone"):
            update_polygons(BASE, "driveway", payload, 640, 360)
        payload["zone_renames"] = {"front": "bad name"}
        with self.assertRaisesRegex(ValueError, "Invalid zone rename"):
            update_polygons(BASE, "driveway", payload, 640, 360)
        payload["zone_renames"] = {"front": "entry"}
        payload["zones"]["front"] = payload["zones"]["entry"]
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
        changed = update_polygons(BASE, "driveway", data, 640, 360)
        self.assertEqual(list(read_polygons(changed, "driveway")["zones"]), ["new_zone"])

    def test_reject_collinear_polygon(self):
        data = read_polygons(BASE, "driveway")
        data["zones"]["front"] = [[10, 10], [20, 20], [30, 30]]
        with self.assertRaisesRegex(ValueError, "non-zero area"):
            update_polygons(BASE, "driveway", data, 640, 360)

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
