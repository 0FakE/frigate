# Live Mask & Zone Editor – Frigate 0.13.2 (MVP)

This feature branch is based on **v0.13.2**. It adds a polygon editor directly to the camera live view; it is **not a production-tested release**.

## Architecture

- `web/src/routes/Camera.jsx`: “Zonen & Masken bearbeiten” button in the live camera view. Editing selects the JSMpeg stream regardless of the usual MSE/WebRTC preference, so the overlay can use the detect-resolution coordinate space.
- `web/src/components/LiveZoneEditor.jsx`: Preact polygon editor with selection, point dragging, point insertion/removal, zone/motion/object mask creation and removal.
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

The isolated YAML helper tests were also executed successfully before this code was pushed. The **complete Frontend build, Docker build and Frigate integration tests have not yet been performed**.

## Deployment notes

- Frigate 0.13.2 stores zone and mask coordinates as **detect-resolution pixels**. This is not the normalized 0..1 format from newer releases.
- Saving writes to the YAML file. Restart Frigate before the detector picks up the new configuration.
- A backup is written as `config.yml.live-editor.bak` (or `config.yaml.live-editor.bak`). The API uses temporary-file-and-rename to avoid a partially written YAML. Bind-mount the whole `/config` directory, not a single config file.
- Revision hashes detect edits that happened after opening the editor. Concurrent changes through legacy Frigate config APIs are **not yet covered by the editor's dedicated lock**.
- Global/inherited masks are not edited by this MVP: only explicitly camera-local polygon fields are loaded and changed.
- Expose Frigate only behind trusted network access or a secured reverse proxy/VPN. The 0.13.2 security model must be reviewed before public deployment.

## Next engineering tasks

1. Run the full Vite/TypeScript build against v0.13.2 and fix any integration errors.
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

Once running, open a camera's Live tab, choose **Zonen & Masken bearbeiten**,
create or edit the polygons, press **Speichern** and restart Frigate to apply
the saved config. A `config.yml.live-editor.bak` or `config.yaml.live-editor.bak`
will contain the immediately preceding file state.

### Build caveat

The upstream Frigate 0.13.2 devcontainer build uses Debian 11 repository
packages whose archive URLs may now return HTTP 404. This is unrelated to
the editor and is one reason for the overlay-based preview build. It still
needs on-camera integration testing before any production rollout.
