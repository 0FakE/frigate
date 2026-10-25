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
