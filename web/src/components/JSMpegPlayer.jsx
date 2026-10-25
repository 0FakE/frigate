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

    video.els.canvas.addEventListener('click',fullscreen);

    return () => {
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
