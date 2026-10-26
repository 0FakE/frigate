# Modern Camera UI – experimental Frigate 0.13.2 preview

This branch is an **isolated visual redesign** of the camera detail page and its Live Zone Editor, based on `feature/live-zone-editor`. It does **not** replace the original editor preview image.

## Preview image and branch

- Branch: `feature/modern-camera-ui`
- AMD64 Docker image: `ghcr.io/0fake/frigate:0.13.2-modern-camera-ui-dev`
- Original, unchanged alternative: `ghcr.io/0fake/frigate:0.13.2-live-editor-dev` on `feature/live-zone-editor`
- CI: `.github/workflows/live-zone-editor.yml` (frontend lint/build, Vitest regression tests, backend checks)
- Image build: `.github/workflows/live-editor-image.yml` (independent GHCR tag and cache scope)

## Scope and features preserved

The redesigned camera route inherits Frigate's **original plain theme background** (no radial or linear gradients), and retains translated camera and stream information, Live/Debug tabs, a **Live-only source selector**, the six existing Debug switches, the editor entry/close toggle, the real camera stream, existing ONVIF controls when supported and event links for detected objects. Non-video buttons, cards and form controls use the same subtle **8px corner radius** across the modern page, while video frames stay square and selection/status dots remain circular.

### Debug snapshot sizing correction

The regular Debug view (without the polygon editor) uses `AutoUpdatingCameraImage`, whose `CameraImage` canvas measures the width of its parent using `ResizeObserver`. The initial redesign accidentally wrapped it in an `inline-block` element, allowing its width to collapse to a tiny shrink-to-fit size before measurement. The snapshot now uses a **width-defined, responsive block**, with maximum width `100%` and the camera's configured detect width (e.g. 1280px). The image canvas keeps its aspect ratio and scales down on small screens. The original `CameraImage` sizing subtracts the **global browser scrollbar width** from its canvas dimensions, which in this already width-constrained Debug viewport could expose a dark strip on the right. **Only the regular Debug preview** opts in to `matchContainer`: its canvas fills the reserved viewport exactly, without the second scrollbar subtraction. Other uses of `CameraImage` keep their established sizing behavior. The Live player and polygon-editor canvas are unchanged.

### Consistent square video frames and streamlined Debug controls

The Live, Debug snapshot, and polygon-editor video all have a consistent thin dark border with **square corners** so the frames never crop the video corners. Live's frame adapts to the selected source (JSMpeg, MSE, or WebRTC) without changing any playback or video-source preference behavior.

The **Live-only video-source select** now matches the Live/Debug segmented control: its outer container has the same `p-1` insets and 8px corners, and the selected source has the same **40px height** as the tabs. The selection functionality and translated source names are unchanged.

**Only Live shows the `Videoquelle` selector.** Debug uses its own snapshot by default, and the editing mode continues to use JSMpeg regardless of the Live source selection. The FPS label is **not shown in the Debug snapshot**, and the obsolete `cameras.debug.preview.status.fps` translation has been removed from bundled `de.json`. An existing host-language file is never edited automatically; a stale FPS key there can be deleted manually but is not used on this camera page. Existing host overrides of the three creation button labels may still include leading plus signs; change those values manually if you want the new defaults. The reusable AutoUpdatingCameraImage component preserves its optional FPS feature for other consumers.



The polygon editor has three **compact** cards: **Neuen Bereich erstellen**, **Vorhandene Bereiche ({count})** and **Ausgewählter Bereich**. Card padding, heading spacing, group titles, area rows, selected-area details, and action groups use consistent, reduced vertical spacing **without changing font sizes**. All three creation buttons are 40px high and display **Zone**, **Maske**, and **Objektfilter** without a leading '+'. The zone/mask controls and object-class select/object-filter button use matching **50/50 grid columns**, and the select is also 40px tall. The redundant mobile-only heading **Bearbeitungsmenü** (including its locale key) and duplicate sidebar **Editor schließen** button are gone; the toolbar button **below the video** remains the sole editor-close action, with its existing unsaved-change confirmation. The close translation key remains, since it is still used there.

Polygon names are shown **only when the mouse hovers an area entry in the “Vorhandene Bereiche” list**, not when hovering the actual camera image. While a zone, covered area or object filter is hovered in the list, its name appears at an interior position inside the corresponding polygon; the label disappears on leaving the list entry. Concave polygons use a safe interior position. The label now uses **smaller 12px text**, a 95%-opaque slate background, white text and a pointer-transparent overlay; it **stays on one line whenever it fits inside the video viewport** and only wraps long names when its intrinsic width exceeds the viewport. Its measured width keeps the entire label inside the left and right video edges even for off-center polygons. Hover does not select or edit the polygon. Labels derive from existing area names and require no translation key.

The editor's bundled `cameras.debug.editor.label.no_selection` text is now **“Wähle einen Bereich zum Bearbeiten aus.”**; the same key remains customizable via `/config/lang/de.json` if a user has overridden it.

Existing zone/motion/object-mask creation, object selector, area selection, editing vertices, inserting/removing vertices, deletion, deselection, discard, save, close, SVG coordinate space, unsaved-change protection and camera stream first-frame loading behavior are preserved. Only real actions are rendered; conceptual actions in the initial design reference such as duplicate or color editing are intentionally **not** introduced as nonfunctional buttons.

Invalid names, invalid polygons, and HTTP failures continue using the native browser `window.alert()` modal. White unsaved and green saved status notices remain above the stream as requested. All newly visible static text, switch labels, section titles, tooltips/ARIA labels, camera source names, and common tracked-object class names have nested German translations in `web/src/locales/de.json`. Unknown camera and object names are user/server data, not fixed UI strings.

### Stable camera previews and simplified object cards

The camera detail page preallocates the whole preview area using camera dimensions before video data arrives. This is especially important when changing Live sources (JSMpeg, MSE, WebRTC): the preview does **not** collapse to a tiny rectangle while reconnecting. The same loading overlay covers ordinary Debug snapshots (editor closed), and the polygon editor retains its existing first-JSMpeg-frame loading gate.

The translated `cameras.page.preview_loading` key defaults to `Kamera Vorschau wird geladen…`. The overlay is removed only after the first decoded JSMpeg frame, the first real native MSE/WebRTC video frame, or the first JPEG painted into the Debug canvas. **WebRTC explicitly reports its first frame from the actual video element**, preferring the browser's `requestVideoFrameCallback` compositor notification and falling back to ready-video event/poll checks: previously, WebRTC could already show live images while the parent never marked the preview ready and falsely displayed a 20-second error. After the first frame, the loading/error timer is cancelled. If no frame arrives for 20 seconds, the overlay displays `cameras.page.preview_error`, rather than showing an indefinite spinner. An eventual successful frame still clears the error.

The Live preview now draws its 1px frame as an **outside outline**, not a CSS border taking a pixel from each side of the video surface. Its JSMpeg loading overlay has a fully opaque and uniformly colored background, so no decoder letterbox strips can show above or below the loading text. The reserved viewport width and aspect ratio remain unchanged when waiting for or changing sources. Debug and polygon-editor video frame styling remains unchanged.

The **Kameravorschau** section now has **1rem (mb-4)** of bottom margin, instead of 2rem (mb-8). The section **Erkannte Objekte** starts with a subtle full-width separator. Each entire card remains a link to filtered events and shows the **centered uppercase rendering** of its localized object class name **above its fixed 175×175 CSS-pixel square thumbnail** with `object-fit: cover`. The card width adapts naturally to its content; no fixed card width is imposed. The thumbnail has explicit HTML width/height attributes and pixel-based CSS width, height, minimum and maximum dimensions; it no longer depends on rem units or the browser's document font size. The object card no longer shifts upward on hover: its blue border **and darker background highlight both remain**, but only color properties transition (no translate animation). Text casing is applied by CSS (`uppercase`) without altering translated object names. The redundant `Ereignisse anzeigen` subtitle and its bundled `cameras.page.view_events` locale key were removed. Host overrides with that old key are ignored and can be removed manually.

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
6. Check the Debug snapshot at full resolution (e.g. 1280×720) and at a narrow browser width; it should not appear as a tiny thumbnail and must preserve aspect ratio. Check there is **no dark strip at the right edge** when the editor is closed, even when a page scrollbar is present. Verify the editor itself remains unaffected. Verify it has **no FPS text**, **no Videoquelle selector**, and the same square video border as Live. The selector must remain available in Live and preserve its current source. Verify the polygon editor's video border has square corners as well.
7. Check compactness on narrow and wide screens: no 'Bearbeitungsmenü' heading, lower panel heights, consistent selected-area/list-row spacing, no duplicate sidebar close, consistent 40px creation buttons and 50/50 rows, with visible text size unchanged.
8. Hover over the **names in the editor’s existing-area list**, without clicking. Verify the corresponding polygon label appears with a solid dark background and **smaller, normally single-line text** that stays completely inside the video even when near the edge; exceptionally long names may wrap when wider than the video. The label hides when leaving the list. Merely hovering the video must **not** produce a label. Check zones, covered areas and object filters, plus uninterrupted vertex dragging. Labels must stay hidden before the first stream frame.
9. Check Live JSMpeg, MSE and WebRTC transitions, plus ordinary Debug snapshots: the preview keeps its size from the start and shows `Kamera Vorschau wird geladen…` until the first real image. JSMpeg loading must have no differently colored strips; the picture must meet the Live video outline without 1px gaps. Test **initial camera opening with WebRTC already selected**: when the stream starts playing, loading must disappear and must **not** change to the 20-second error over a working video. Verify actual connection failures and that a later successful frame clears an error.
10. Check the subtle horizontal divider above detected objects, content-sized event cards with the object name **uppercase and centered above each 175×175 CSS-pixel square thumbnail**; on hover only the border/background colors should change, without the card moving. Ensure the `Ereignisse anzeigen` subtitle is absent.
11. Check the Live video-source selector uses the same 4px outer padding and 40px active-control height as the Live/Debug tab group. The `Kameravorschau` section should have exactly 1rem bottom margin, not 2rem. Check the original monochrome Frigate theme background and consistent 8px nonvideo control radii; keep video corners square.
12. Check camera streams and scaling with your real hardware: automated tests cannot substitute for runtime playback on actual cameras and browsers.
