# Live Mask & Zone Editor – Frigate 0.13.2 (MVP)

This feature branch is based on **v0.13.2**. It adds a polygon editor to the camera's **Debug → Zonen & Masken Editor** button, displayed directly beside **Show/Hide Options**, using a live JSMpeg stream while editing. This is still an experimental preview release.

## Architecture

- `web/src/routes/Camera.jsx`: the “Zonen & Masken Editor” button is always visible in Debug directly next to “Show/Hide Options”. Both controls are **40px high** and wrap on narrow screens. The six debug checkboxes still require “Show Options”. Editing selects JSMpeg regardless of the usual MSE/WebRTC preference; the video overlay uses detect-resolution coordinates.
- `web/src/components/LiveZoneEditor.jsx`: Preact polygon editor with selection, point dragging, point insertion/removal, zone/motion/object mask creation and removal.
- The status area is rendered **only when at least one notice exists**: with no notices there is no reserved whitespace at all. When notices appear, their container adds **16px below the final notice**, and multiple notices are separated by the **same 16px**. The layout grows naturally without clipping or scrolling. Since the empty slot is gone, the first notice may move the video downward. Selecting any polygon still immediately displays **Nicht gespeicherte Änderungen** without marking the YAML dirty: Save remains disabled until coordinates change.
- The editor layout uses a **330px-wide right-hand tool panel** on large screens (`xl` breakpoint), with **Neuen Bereich erstellen**, **Vorhandene Bereiche ({count})**, and **Ausgewählter Bereich**. Group names are **Zonen**, **Abgedeckte Bereiche**, and **Objektfilter**. The creation buttons are `+ Zone`, `+ Maske`, and `+ Objektfilter`. The object-class dropdown is approximately **145px** wide; selected areas are indicated by blue styling without a leading checkmark. Empty groups use 14px text. On smaller screens the panel sits **above the livestream and stays fully expanded**.
- Status notices share a dark background, 16px type, matching text/icon colors, and a shared 16px gap **below the final notice** rather than separate notice margins: **white/bold** for unsaved edits, **yellow** for polygon validation warnings, **red** for errors, and **green** for successful saves. Incomplete new areas are normal drafts; their warnings are displayed **only when Save is attempted**, not while creating/drawing. Save remains clickable for incomplete drafts but never sends invalid polygons to the API. Invalid and duplicate zone names have distinct complete error sentences. The save confirmation reads `Die Änderungen wurden gespeichert. Ein Neustart von Frigate ist erforderlich.`, with the entire second sentence bold.
- `web/src/components/ButtonsTabbed.jsx` provides an opt-in compact icon/pill style for camera Live/Debug tabs, preserving **right alignment**, controlled selection, and the unsaved-change confirmation on view switches; other routes retain the previous style.
- The legacy `/cameras/:camera/editor` route and “Mask & Zone creator” link were removed from the UI; the old source module is retained for easy rollback.
- The polygon editor keeps the selected area locked while clicking the image (including other polygons); it can be toggled off with the same button or “Bearbeitung beenden”, without saving. **Saving successfully deselects the polygon**; failed saves leave it selected. The area selectors and group headings use **14px** text. Vertex handles are 2/3 their original radius, with transparent hit areas at least 18 screen pixels. Drag-release clicks are suppressed to prevent accidental points.
- Confirmation modals such as “Restart Frigate” appear above the editor.
- `frigate/http.py`: GET/PUT `/api/cameras/<camera_name>/polygons`.
- `frigate/util/live_polygon_editor.py`: preserving existing YAML structure and comments, legacy pixel coordinates, validation and optimistic file revision checks.
- `frigate/test/test_live_polygon_editor.py`: basic geometry and YAML tests.


## Raw Config editor synchronization and future i18n

- The polygon API writes camera-local YAML to disk and returns a revision. After a successful save, the browser fetches `api/config/raw` and updates the `config/raw` SWR cache. The Config route reuses its Monaco model but updates its content **only when it matches the previously synchronized value**, never clobbering unsaved local text. On entering Config it also revalidates the raw file.
- The **running** `api/config` endpoint is intentionally separate from raw YAML and is not reloaded before a Frigate restart; no live detector state is changed by a save.
- The existing JSMpeg wrapper accepts an optional `onFirstFrame` callback, fired from the *first decoded/rendered video frame*, not socket connection. The polygon editor shows a loading message and does **not render any polygons/handles** until this callback arrives. The menu remains visible.
- The loading message key `cameras.debug.editor.status.loading_stream` defaults to **Kamera Vorschau wird geladen…**. The editor now establishes **one authoritative preview viewport**, sized from its configured display width and detect aspect ratio; its JSMpeg host, actual decoded canvas, loading background, and polygon SVG all occupy that same positioned rectangle. The editor-only JSMpeg `fillContainer` option forces the canvas to fit the viewport rather than creating additional height below the loading cover, while ordinary live camera players keep their previous size limits. The viewport itself keeps its aspect ratio even before the first frame, and polygons still render only after the first decode.
- The bundled German template is `web/src/locales/de.json` and uses nested keys such as `cameras.debug.editor.header.existing_areas` with placeholders like `{count}`. At Frigate startup, the backend copies it **only if missing** into the user's mounted `/config/lang/de.json`. Existing host files are never overwritten. The configured `CONFIG_FILE` directory determines the `lang` folder (normally `/config/lang`). In Docker Compose, `./conf/frigate:/config` already exposes the editable file as `./conf/frigate/lang/de.json`; no extra volume is needed.
- The browser requests uncached `GET /api/lang/de` at page startup, before rendering the app. Saving `/config/lang/de.json` followed by a **browser page refresh** applies text changes without restarting Frigate or rebuilding the image. Incomplete host key structures fall back **per missing key** to the bundled default. **Important:** if the host file already sets `cameras.debug.editor.status.loading_stream` to the older text, manually change that value; image updates intentionally never overwrite host translations.
- An invalid JSON file, unaccepted structure, unreadable file, or failed HTTP fetch never breaks the whole UI: built-in German copy is used, and the user receives a dismissible visible warning. The server refuses symlink-based host locale files and files over 256 KiB; it does not overwrite them. Check `docker logs frigate-test` for server-side details.
- A settings-page language picker and persistent language selection are **not yet implemented**. The host-editable `de.json` is the only language currently loaded.

## Running tests

Use a Frigate development environment with dependencies installed:

```bash
python -m unittest frigate.test.test_live_polygon_editor -v
cd web
npm ci
npm run build
```

GitHub Actions verifies frontend build/lint, Python polygon YAML and host-locale tests, and targeted Vitest regressions (`LiveZoneEditor`, `Dialog`, `ButtonsTabbed`, first JSMpeg frame handling, Config model synchronization, and locale placeholders). The preview Docker image builds separately. Real camera integration and render behavior still require manual verification.

## Deployment notes

- Frigate 0.13.2 stores zone and mask coordinates as **detect-resolution pixels**. This is not the normalized 0..1 format from newer releases.
- Saving writes to the YAML file. Restart Frigate before the detector picks up the new configuration.
- A backup is written as `config.yml.live-editor.bak` (or `config.yaml.live-editor.bak`). The API uses temporary-file-and-rename to avoid a partially written YAML. Bind-mount the whole `/config` directory, not a single config file.
- Revision hashes detect edits that happened after opening the editor. Concurrent changes through legacy Frigate config APIs are **not yet covered by the editor's dedicated lock**.
- Global/inherited masks are not edited by this MVP: only explicitly camera-local polygon fields are loaded and changed.
- Expose Frigate only behind trusted network access or a secured reverse proxy/VPN. The 0.13.2 security model must be reviewed before public deployment.

## Next engineering tasks

1. Verify the Debug-option entry point, modal stacking, and mouse pointer behavior with a real camera (the automated build/tests pass).
2. Verify JSMpeg rendering sizes and coordinate alignment at various screen sizes, especially fullscreen/mobile.
3. Extend testing for motion/object masks, deleted vertices, YAML edge cases, and active global/inherited config.
4. Verify Frigate restart and Docker deployment with a real camera.
5. Harden concurrency with all config API endpoints and add a safe “Save & restart” control.


## Lightweight Docker preview

To test this branch without rebuilding Frigate's native dependencies, use
`docker/live-editor/Dockerfile`. It starts from the upstream **official**
`ghcr.io/blakeblackshear/frigate:0.13.2` image, rebuilds the frontend
and replaces only the patched Python modules.

The separate GitHub Actions workflow `.github/workflows/live-editor-image.yml`
builds and attempts to publish an **experimental linux/amd64 image** at:

```text
ghcr.io/0fake/frigate:0.13.2-live-editor-dev
```

**Use the tag only after the preview-image workflow succeeds.** Depending on
package visibility, a GitHub Container Registry login may be required to pull it.

Alternatively, build locally from this branch:

```bash
docker build -f docker/live-editor/Dockerfile -t frigate:0.13.2-live-editor-dev .
```

For an existing Docker Compose deployment, make a copy of its compose file and
**back up the existing /config directory**. On a test system, substitute only
the service's `image:` value with the image above, leaving its ports, volumes
and device settings unchanged. Mount the entire config directory as `/config`.
The preview currently targets **AMD64**; arm64 hardware requires a separate image.

The version 0.13.2 configuration schema is required. Do not reuse a newer
Frigate config without reviewing incompatibilities and making a backup.

Once running, open a camera's **Debug** tab and choose **Zonen & Masken Editor** next to **Show/Hide Options** (no need to expand the checkboxes). Wait for the first real video frame before polygon overlays appear, then
create or edit polygons. Press **Speichern** to update `config.yml` and the Config editor's raw YAML view **without restarting**. Restart Frigate separately to apply the changes to detection
the saved config. A `config.yml.live-editor.bak` or `config.yaml.live-editor.bak`
will contain the immediately preceding file state.

### Build caveat

The upstream Frigate 0.13.2 devcontainer build uses Debian 11 repository
packages whose archive URLs may now return HTTP 404. This is unrelated to
the editor and is one reason for the overlay-based preview build. It still
needs on-camera integration testing before any production rollout.
