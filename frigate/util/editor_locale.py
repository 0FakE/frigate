"""Host-editable German editor translations, with a safe bundled fallback.

A first-start copy is written to /config/lang/de.json (the existing /config
volume), never replacing a file already managed by the user.
"""

import json
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)
MAX_LOCALE_BYTES = 256 * 1024
BUNDLED_LOCALE = Path(__file__).resolve().parent.parent / "default_lang" / "de.json"


def locale_path(config_dir=None):
    """Use the same config directory that holds config.yml/config.yaml."""
    base = Path(config_dir) if config_dir is not None else Path(
        os.environ.get("CONFIG_FILE", "/config/config.yml")
    ).parent
    return base / "lang" / "de.json"


def _valid_tree(value, depth=0):
    if depth > 12:
        return False
    if not isinstance(value, dict):
        return False
    return all(
        isinstance(key, str)
        and not key.startswith("__")
        and (isinstance(item, str) or (isinstance(item, dict) and _valid_tree(item, depth + 1)))
        for key, item in value.items()
    )


def bundled_locale(bundled_path=None):
    source = Path(bundled_path) if bundled_path is not None else BUNDLED_LOCALE
    data = json.loads(source.read_text(encoding="utf-8"))
    if not _valid_tree(data):
        raise ValueError("Bundled German locale must contain nested objects with string values")
    return data


def ensure_default_locale(config_dir=None, bundled_path=None):
    """Populate a missing host locale without modifying an existing one.

    Return a readable warning if the directory is not writable. The HTTP
    interface may continue using the bundled defaults.
    """
    path = locale_path(config_dir)
    try:
        source = Path(bundled_path) if bundled_path is not None else BUNDLED_LOCALE
        # Read the bundled template *before* creating a new file, so an
        # unavailable template cannot leave an empty permanent host file.
        template = source.read_text(encoding="utf-8")
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            with path.open("x", encoding="utf-8") as host_file:
                host_file.write(template)
            logger.info("Created editable German translations at %s", path)
        except FileExistsError:
            pass
    except OSError as error:
        logger.warning("Cannot initialize host locale %s: %s", path, error)
        return (
            "Die Sprachdatei /config/lang/de.json konnte nicht angelegt werden. "
            "Bitte prüfe die Schreibrechte für /config/lang. "
            "Stattdessen werden die integrierten deutschen Texte verwendet."
        )
    return None


def read_german_locale(config_dir=None, bundled_path=None):
    """Return the host file or validated bundled defaults, never an invalid JSON."""
    default = bundled_locale(bundled_path)
    warning = ensure_default_locale(config_dir, bundled_path)
    path = locale_path(config_dir)
    try:
        if path.is_symlink():
            raise ValueError("symbolic links are not accepted")
        if path.stat().st_size > MAX_LOCALE_BYTES:
            raise ValueError("file exceeds 256 KiB")
        custom = json.loads(path.read_text(encoding="utf-8"))
        if not _valid_tree(custom):
            raise ValueError("expected nested JSON objects and string values")
        return {"language": "de", "messages": custom, "warning": warning}
    except (OSError, ValueError, UnicodeError, json.JSONDecodeError) as error:
        logger.warning("Invalid or unreadable host locale %s: %s", path, error)
        return {
            "language": "de",
            "messages": default,
            "warning": (
                "Die Sprachdatei /config/lang/de.json ist ungültig oder nicht lesbar. "
                "Bitte prüfe das JSON-Format und die Dateirechte. "
                "Die integrierten deutschen Texte werden verwendet."
            ),
        }
