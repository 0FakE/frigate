# Live Mask & Zone Editor – Frigate 0.13.2 (MVP)

This feature branch is based on **v0.13.2**. It adds a polygon editor to the camera's **Debug → Zonen & Masken bearbeiten** button, displayed directly beside **Show/Hide Options**, using a live JSMpeg stream while editing. This is still an experimental preview release.

## Architecture

- `web/src/routes/Camera.jsx`: the “Zonen & Masken bearbeiten” button is always visible in Debug directly next to “Show/Hide Options”; the six debug checkboxes are still revealed by “Show Options” only. The two buttons wrap on narrow screens. Editing selects the JSMpeg stream regardless of the usual MSE/WebRTC preference, so the overlay can use the detect-resolution coordinate space.
- `web/src/components/LiveZoneEditor.jsx`: Preact polygon editor with selection, point dragging, point insertion/removal, zone/motion/object mask creation and removal.
- The editor layout uses a **330px-wide right-hand tool panel on large screens** (`xl` breakpoint), with grouped creation controls, color-coded zone/motion/object selections, and separate actions under **Ausgewählter Bereich**. On smaller screens, the panel sits **above the livestream and stays fully expanded**. Selection buttons show just zone names, `Maske N`, or `<object> N`, without redundant type prefixes.
- Status notices share a dark background, 16px type, matching message/icon colors, and 16px bottom margin directly above the camera image: **white/bold** for unsaved edits, **yellow** for validation warnings, **red** for errors, and **green** for a successful save. The save confirmation reads `Die Änderungen wurden gespeichert. Ein Neustart von Frigate ist erforderlich.`, with the entire second sentence bold. The previous instructional paragraph has been removed.
- `web/src/components/ButtonsTabbed.jsx` provides an opt-in compact icon/pill style for camera Live/Debug tabs, preserving **right alignment**, controlled selection, and the unsaved-change confirmation on view switches; other routes retain the previous style.
- The legacy `/cameras/:camera/editor` route and “Mask & Zone creator” link were removed from the UI; the old source module is retained for easy rollback.
- The polygon editor keeps the selected area locked while clicking the image (including other polygons); the selection can be toggled off with the same button or “Bearbeitung beenden”, without saving. **Saving successfully deselects the currently selected polygon**; failed saves leave it selected. The existing area selectors and their group headings use **14px** text. Visual vertex handles are 2/3 their original radius and separate transparent hit areas are at least 18 screen pixels. Drag-release clicks are suppressed to prevent accidental point insertion.
- Confirmation modals such as “Restart Frigate” appear above the editor.
- `frigate/http.py`: GET/PUT `/api/cameras/<camera_name>/polygons`.
- `frigate/util/live_polygon_editor.py`: preserving existing YAML structure and comments, legacy pixel coordinates, validation and optimistic file revision checks.
- `frigate/test/test_live_polygon_editor.py`: basic geometry and YAML tests.

## Running tests

Use a Frigate development environment with dependencies installed:

```bash
python -m unittest frigate.test.test_live_polygon_editor -v
cd web
npm ci
npm run build
```

GitHub Actions verifies the full frontend build and lint, Python YAML tests, and targeted Vitest interaction/regression tests (`LiveZoneEditor`, `Dialog`, `ButtonsTabbed`). The preview Docker image build is handled separately. The new UI placement and mouse interactions still require a manual test with a real camera.

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

Once running, open a camera's **Debug** tab and choose **Zonen & Masken bearbeiten** directly next to **Show/Hide Options** (no need to expand the checkboxes),
create or edit the polygons, press **Speichern** and restart Frigate to apply
the saved config. A `config.yml.live-editor.bak` or `config.yaml.live-editor.bak`
will contain the immediately preceding file state.

### Build caveat

The upstream Frigate 0.13.2 devcontainer build uses Debian 11 repository
packages whose archive URLs may now return HTTP 404. This is unrelated to
the editor and is one reason for the overlay-based preview build. It still
needs on-camera integration testing before any production rollout.
