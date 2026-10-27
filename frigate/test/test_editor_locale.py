"""Tests for host-editable, bundled-fallback German translations."""

import json
import tempfile
import unittest
from pathlib import Path

from frigate.util.editor_locale import (
    MAX_LOCALE_BYTES,
    ensure_default_locale,
    locale_path,
    read_german_locale,
    log_client_locale_failure,
)

BUNDLED = Path(__file__).resolve().parents[2] / "web" / "src" / "locales" / "de.json"


class TestEditorLocale(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.path = locale_path(self.root)

    def test_first_start_copies_template_into_host_config_directory(self):
        self.assertFalse(self.path.exists())
        self.assertIsNone(ensure_default_locale(self.root, BUNDLED))
        self.assertTrue(self.path.exists())
        self.assertEqual(
            json.loads(self.path.read_text(encoding="utf-8"))["cameras"]["debug"]["editor"]["button"]["open"],
            "Zonen & Masken Editor",
        )
        self.assertEqual(read_german_locale(self.root, BUNDLED)["warning"], None)

    def test_existing_host_locale_is_never_overwritten(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        custom = {"cameras": {"debug": {"editor": {"button": {"open": "Meine eigene Bezeichnung"}}}}}
        self.path.write_text(json.dumps(custom), encoding="utf-8")
        self.assertIsNone(ensure_default_locale(self.root, BUNDLED))
        data = read_german_locale(self.root, BUNDLED)
        self.assertEqual(data["messages"], custom)
        self.assertIsNone(data["warning"])
        self.assertEqual(json.loads(self.path.read_text(encoding="utf-8")), custom)

    def test_invalid_json_reports_warning_and_keeps_original_file(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text("{not valid json", encoding="utf-8")
        result = read_german_locale(self.root, BUNDLED)
        self.assertIn("ungültig", result["warning"])
        self.assertEqual(result["messages"]["cameras"]["debug"]["editor"]["header"]["new_area"], "Neuen Bereich erstellen")
        self.assertEqual(self.path.read_text(encoding="utf-8"), "{not valid json")

    def test_bad_types_fall_back_to_bundled_text(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text('{"cameras": ["not", "an", "object"]}', encoding="utf-8")
        result = read_german_locale(self.root, BUNDLED)
        self.assertIsNotNone(result["warning"])
        self.assertIn("debug", result["messages"]["cameras"])

    def test_does_not_follow_symlink_to_other_config_file(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        secret = self.root / "config.yml"
        secret.write_text('password: "not public"\n', encoding="utf-8")
        self.path.symlink_to(secret)
        result = read_german_locale(self.root, BUNDLED)
        self.assertIsNotNone(result["warning"])
        self.assertNotIn("password", str(result["messages"]))
        self.assertTrue(self.path.is_symlink())

    def test_browser_warning_uses_existing_locale_logger(self):
        with self.assertLogs("frigate.util.editor_locale", level="WARNING") as captured:
            self.assertTrue(log_client_locale_failure("request_failed", 503))
            self.assertTrue(log_client_locale_failure("invalid_response", "untrusted status"))
        self.assertIn("HTTP 503", captured.output[0])
        self.assertIn("HTTP unknown", captured.output[1])
        self.assertIn("bundled German translations", captured.output[0])

    def test_browser_warning_rejects_arbitrary_log_messages(self):
        self.assertFalse(log_client_locale_failure("injected log entry", 503))
        self.assertFalse(log_client_locale_failure(None, 503))

    def test_rejects_oversized_locale(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(" " * (MAX_LOCALE_BYTES + 1), encoding="utf-8")
        result = read_german_locale(self.root, BUNDLED)
        self.assertIsNotNone(result["warning"])
        self.assertEqual(result["messages"]["cameras"]["debug"]["editor"]["button"]["open"], "Zonen & Masken Editor")


if __name__ == "__main__":
    unittest.main()
