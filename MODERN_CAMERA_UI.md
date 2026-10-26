# Modern Camera UI – experimental Frigate 0.13.2 preview

This branch is an **isolated visual redesign** of the camera detail page and its Live Zone Editor, based on `feature/live-zone-editor`. It does **not** replace the original editor preview image.

## Preview image and branch

- Branch: `feature/modern-camera-ui`
- AMD64 Docker image: `ghcr.io/0fake/frigate:0.13.2-modern-camera-ui-dev`
- Original, unchanged alternative: `ghcr.io/0fake/frigate:0.13.2-live-editor-dev` on `feature/live-zone-editor`
- CI: `.github/workflows/live-zone-editor.yml` (frontend lint/build, Vitest regression tests, backend checks)
- Image build: `.github/workflows/live-editor-image.yml` (independent GHCR tag and cache scope)

## Scope and features preserved

The redesigned camera route includes a dark gradient page, translated camera and stream information, Live/Debug tabs, a **Live-only source selector**, the six existing Debug switches, the editor entry/close toggle, the real camera stream, existing ONVIF controls when supported and event links for detected objects.

### Debug snapshot sizing correction

The regular Debug view (without the polygon editor) uses `AutoUpdatingCameraImage`, whose `CameraImage` canvas measures the width of its parent using `ResizeObserver`. The initial redesign accidentally wrapped it in an `inline-block` element, allowing its width to collapse to a tiny shrink-to-fit size before measurement. The snapshot now uses a **width-defined, responsive block**, with maximum width `100%` and the camera's configured detect width (e.g. 1280px). The image canvas keeps its aspect ratio and scales down on small screens. The Live player and polygon-editor canvas are unchanged.

### Consistent square video frames and streamlined Debug controls

The Live, Debug snapshot, and polygon-editor video all have a consistent thin dark border with **square corners** so the frames never crop the video corners. Live's frame adapts to the selected source (JSMpeg, MSE, or WebRTC) without changing any playback or video-source preference behavior.

**Only Live shows the `Videoquelle` selector.** Debug uses its own snapshot by default, and the editing mode continues to use JSMpeg regardless of the Live source selection. The FPS label is **not shown in the Debug snapshot**, and the obsolete `cameras.debug.preview.status.fps` translation has been removed from bundled `de.json`. An existing host-language file is never edited automatically; a stale FPS key there can be deleted manually but is not used on this camera page. The reusable AutoUpdatingCameraImage component preserves its optional FPS feature for other consumers.



The polygon editor has three cards: **Neuen Bereich erstellen**, **Vorhandene Bereiche ({count})** and **Ausgewählter Bereich**. Existing zone/motion/object-mask creation, object selector, area selection, editing vertices, inserting/removing vertices, deletion, deselection, discard, save, close, SVG coordinate space, unsaved-change protection and camera stream first-frame loading behavior are preserved. Only real actions are rendered; conceptual actions in the initial design reference such as duplicate or color editing are intentionally **not** introduced as nonfunctional buttons.

Invalid names, invalid polygons, and HTTP failures continue using the native browser `window.alert()` modal. White unsaved and green saved status notices remain above the stream as requested. All newly visible static text, switch labels, section titles, tooltips/ARIA labels, camera source names, and common tracked-object class names have nested German translations in `web/src/locales/de.json`. Unknown camera and object names are user/server data, not fixed UI strings.

## Host-editable locale

`./conf/frigate:/config` already mounts `./conf/frigate/lang/de.json` to `/config/lang/de.json`. Existing user-defined files **are never overwritten**. Missing new keys are resolved from the bundled `de.json`; change/add the same nested keys in your host file to customize them. Browser reload applies host-text changes without rebuilding Docker. Browser modal translations live under `cameras.debug.editor.modal.error.*` and `cameras.debug.editor.modal.warning.*`; older `editor.error` and `editor.warning` keys have no compatibility fallback.

## Upgrade only the experimental test service

Make a backup of `config.yml` and keep Frigate databases from newer versions away from 0.13.2. Change only the image of your test service:

```yaml
services:
  frigate-test:
    container_name: frigate-test
    image: ghcr.io/0fake/frigate:0.13.2-modern-camera-ui-dev
    volumes:
      - ./conf/frigate:/config
      - ./data/frigate/media:/media/frigate
```

Then run in the Compose directory:

```bash
docker compose pull frigate-test
docker compose up -d --no-deps --force-recreate frigate-test
```

Hard-refresh the browser (Ctrl+F5). For rollback, return the `image:` value to `ghcr.io/0fake/frigate:0.13.2-live-editor-dev`.

## Manual integration checklist

1. Verify Live/Debug switching, source persistence, Show/Hide Options and the six switches.
2. Confirm the editor toolbar remains directly below the left-side live preview, while three tool cards appear at the right on wide screens, above the video on narrow screens.
3. Select overlapping zones, drag/add/remove points, and save/discard. Saved polygons must appear in raw Config Editor without a Frigate restart (restart is still required to apply them).
4. Trigger invalid zone names, duplicate names and invalid Save; confirm native modal dialogs and unchanged camera layout.
5. Check ONVIF controls for cameras with ONVIF enabled, detected-object event links and the host language overrides.
6. Check the Debug snapshot at full resolution (e.g. 1280×720) and at a narrow browser width; it should not appear as a tiny thumbnail and must preserve aspect ratio. Verify it has **no FPS text**, **no Videoquelle selector**, and the same square video border as Live. The selector must remain available in Live and preserve its current source. Verify the polygon editor's video border has square corners as well.
7. Check camera streams and scaling with your real hardware: the generated visual concept is not a substitute for a runtime screenshot.
