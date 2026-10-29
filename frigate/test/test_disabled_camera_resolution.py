"""Startup resolution handling for enabled and disabled Frigate cameras."""

import unittest
from unittest.mock import AsyncMock, call, patch

from frigate.config import DEFAULT_DETECT_DIMENSIONS, FrigateConfig


class TestCameraResolutionStartup(unittest.TestCase):
    def camera(self, name, enabled, detect=None):
        camera = {
            "enabled": enabled,
            "ffmpeg": {
                "inputs": [
                    {"path": f"rtsp://127.0.0.1:8554/{name}", "roles": ["detect"]}
                ]
            },
        }
        if detect is not None:
            camera["detect"] = detect
        return camera

    @patch("frigate.config.get_video_properties", new_callable=AsyncMock)
    def test_disabled_camera_without_dimensions_never_probes_stream(self, probe):
        config = FrigateConfig(
            mqtt={"host": "mqtt"},
            cameras={"disabled": self.camera("disabled", enabled=False)},
        )

        runtime = config.runtime_config()
        probe.assert_not_awaited()
        camera = runtime.cameras["disabled"]
        self.assertFalse(camera.enabled)
        self.assertEqual(camera.detect.width, DEFAULT_DETECT_DIMENSIONS["width"])
        self.assertEqual(camera.detect.height, DEFAULT_DETECT_DIMENSIONS["height"])

    @patch("frigate.config.get_video_properties", new_callable=AsyncMock)
    def test_disabled_camera_preserves_configured_dimensions(self, probe):
        config = FrigateConfig(
            mqtt={"host": "mqtt"},
            cameras={
                "disabled": self.camera(
                    "disabled", enabled=False, detect={"width": 2048}
                ),
            },
        )

        camera = config.runtime_config().cameras["disabled"]
        probe.assert_not_awaited()
        self.assertEqual(camera.detect.width, 2048)
        self.assertEqual(camera.detect.height, DEFAULT_DETECT_DIMENSIONS["height"])

    @patch("frigate.config.get_video_properties", new_callable=AsyncMock)
    def test_enabled_cameras_probe_independent_stream_resolutions(self, probe):
        paths = {
            "rtsp://127.0.0.1:8554/first": {"width": 1920, "height": 1080},
            "rtsp://127.0.0.1:8554/second": {"width": 640, "height": 480},
        }
        probe.side_effect = lambda url: paths[url]
        config = FrigateConfig(
            mqtt={"host": "mqtt"},
            cameras={
                "disabled": self.camera("disabled", enabled=False),
                "first": self.camera("first", enabled=True),
                "second": self.camera("second", enabled=True),
            },
        )

        cameras = config.runtime_config().cameras
        self.assertEqual(
            (cameras["first"].detect.width, cameras["first"].detect.height),
            (1920, 1080),
        )
        self.assertEqual(
            (cameras["second"].detect.width, cameras["second"].detect.height),
            (640, 480),
        )
        self.assertEqual(
            (cameras["disabled"].detect.width, cameras["disabled"].detect.height),
            (DEFAULT_DETECT_DIMENSIONS["width"], DEFAULT_DETECT_DIMENSIONS["height"]),
        )
        self.assertEqual(
            probe.await_args_list,
            [
                call("rtsp://127.0.0.1:8554/first"),
                call("rtsp://127.0.0.1:8554/second"),
            ],
        )

    @patch("frigate.config.get_video_properties", new_callable=AsyncMock)
    def test_reenabled_camera_probes_its_actual_resolution(self, probe):
        probe.return_value = {"width": 2560, "height": 1440}
        disabled = FrigateConfig(
            mqtt={"host": "mqtt"},
            cameras={"switchable": self.camera("switchable", enabled=False)},
        )
        disabled.runtime_config()
        probe.assert_not_awaited()

        enabled = FrigateConfig(
            mqtt={"host": "mqtt"},
            cameras={"switchable": self.camera("switchable", enabled=True)},
        )
        camera = enabled.runtime_config().cameras["switchable"]
        probe.assert_awaited_once_with("rtsp://127.0.0.1:8554/switchable")
        self.assertEqual((camera.detect.width, camera.detect.height), (2560, 1440))


if __name__ == "__main__":
    unittest.main()
