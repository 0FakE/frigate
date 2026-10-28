import { h } from 'preact';
import { baseUrl } from '../api/baseUrl';
import { useRef, useEffect } from 'preact/hooks';
import JSMpeg from '@cycjimmy/jsmpeg-player';
import { firstFrameCallback } from '../utils/firstFrame';

export default function JSMpegPlayer({ camera, width, height, onFirstFrame, fillContainer = false }) {
  const playerRef = useRef();
  const url = `${baseUrl.replace(/^http/, 'ws')}live/jsmpeg/${camera}`;

  useEffect(() => {
    const video = new JSMpeg.VideoElement(
      playerRef.current,
      url,
      {},
      {
        protocols: [], audio: false, videoBufferSize: 1024*1024*4,
        onVideoDecode: firstFrameCallback(onFirstFrame),
      }
    );

    const fullscreen = () => {
      if (video.els.canvas.webkitRequestFullScreen) {
        video.els.canvas.webkitRequestFullScreen();
      }
      else {
        video.els.canvas.mozRequestFullScreen();
      }
    };

    const canvas = video.els.canvas;
    canvas.addEventListener('click', fullscreen);

    return () => {
      canvas.removeEventListener('click', fullscreen);

      // The bundled JSMpeg WebSocket source unconditionally calls
      // this.socket.close() in destroy(), even if the connection has not
      // created a socket yet. Preserve the player's remaining cleanup while
      // making that source teardown safe during rapid camera navigation.
      const source = video.player?.source;
      if (source && 'socket' in source && source.socket == null) {
        clearTimeout(source.reconnectTimeoutId);
        source.shouldAttemptReconnect = false;
        source.destroy = () => {};
      }
      video.destroy();
    };
  }, [url, onFirstFrame]);

  return (
    <div ref={playerRef}
      class={fillContainer ? 'jsmpeg live-editor-jsmpeg' : 'jsmpeg'}
      style={fillContainer
        ? 'width: 100%; height: 100%; max-width: none; max-height: none;'
        : `max-height: ${height}px; max-width: ${width}px`}
    />
  );
}
