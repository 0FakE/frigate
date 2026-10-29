# syntax=docker/dockerfile:1.6
# Lightweight preview: keep all native dependencies, media tooling and entrypoint
# from the official Frigate 0.13.2 image; overlay only our code and rebuilt UI.
FROM --platform=$BUILDPLATFORM node:20-bookworm AS web-build

WORKDIR /work
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build \
    && mv dist/BASE_PATH/monacoeditorwork/* dist/assets/ \
    && rm -rf dist/BASE_PATH

FROM ghcr.io/blakeblackshear/frigate:0.13.2
WORKDIR /opt/frigate
COPY --from=web-build /work/dist/ /opt/frigate/web/
COPY frigate/http.py /opt/frigate/frigate/http.py
COPY frigate/config.py /opt/frigate/frigate/config.py
COPY frigate/util/live_polygon_editor.py /opt/frigate/frigate/util/live_polygon_editor.py
COPY frigate/util/editor_locale.py /opt/frigate/frigate/util/editor_locale.py
COPY web/src/locales/de.json /opt/frigate/frigate/default_lang/de.json

# Run the camera-resolution regression tests against the actual Frigate
# runtime before publishing the preview image.
COPY frigate/test/test_disabled_camera_resolution.py /tmp/test_disabled_camera_resolution.py
RUN python3 -m py_compile /opt/frigate/frigate/config.py /opt/frigate/frigate/http.py /opt/frigate/frigate/util/live_polygon_editor.py /opt/frigate/frigate/util/editor_locale.py /tmp/test_disabled_camera_resolution.py \
    && python3 -m unittest discover -s /tmp -p 'test_disabled_camera_resolution.py' -v \
    && rm /tmp/test_disabled_camera_resolution.py
