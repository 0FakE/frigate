import { h } from 'preact';
import { baseUrl } from '../api/baseUrl';
import { useCallback, useEffect, useRef } from 'preact/hooks';

export default function WebRtcPlayer({ camera, width, height, onFirstFrame }) {
  const videoRef = useRef(null);

  // Register on the real WebRTC video element, not on its parent. Some
  // browsers do not emit a capturable 'loadeddata' or 'playing' event at
  // the camera page when a remote MediaStream first starts rendering.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !onFirstFrame) return;

    let completed = false;
    let videoFrameRequest = null;
    const notifyWhenReady = () => {
      if (completed) return;
      completed = true;
      clearInterval(fallbackPoll);
      onFirstFrame();
    };
    const checkVideo = () => {
      if (video.readyState >= 2 && video.videoWidth > 0) notifyWhenReady();
    };
    for (const eventName of ['loadeddata', 'playing', 'timeupdate', 'resize', 'canplay']) {
      video.addEventListener(eventName, checkVideo);
    }
    // requestVideoFrameCallback is the most precise signal: an actual frame
    // reached the compositor, even if ordinary HTMLMediaElement events were
    // skipped or arrived before the camera parent registered listeners.
    if (typeof video.requestVideoFrameCallback === 'function') {
      videoFrameRequest = video.requestVideoFrameCallback(notifyWhenReady);
    }
    // Fallback for older browsers, and remote streams attached after mount.
    const fallbackPoll = setInterval(checkVideo, 250);
    checkVideo();

    return () => {
      completed = true;
      clearInterval(fallbackPoll);
      if (videoFrameRequest !== null && typeof video.cancelVideoFrameCallback === 'function') {
        video.cancelVideoFrameCallback(videoFrameRequest);
      }
      for (const eventName of ['loadeddata', 'playing', 'timeupdate', 'resize', 'canplay']) {
        video.removeEventListener(eventName, checkVideo);
      }
    };
  }, [onFirstFrame]);

  const PeerConnection = useCallback(async (media) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    const localTracks = [];

    if (/camera|microphone/.test(media)) {
      const tracks = await getMediaTracks('user', {
        video: media.indexOf('camera') >= 0,
        audio: media.indexOf('microphone') >= 0,
      });
      tracks.forEach((track) => {
        pc.addTransceiver(track, { direction: 'sendonly' });
        if (track.kind === 'video') localTracks.push(track);
      });
    }

    if (media.indexOf('display') >= 0) {
      const tracks = await getMediaTracks('display', {
        video: true,
        audio: media.indexOf('speaker') >= 0,
      });
      tracks.forEach((track) => {
        pc.addTransceiver(track, { direction: 'sendonly' });
        if (track.kind === 'video') localTracks.push(track);
      });
    }

    if (/video|audio/.test(media)) {
      const tracks = ['video', 'audio']
        .filter((kind) => media.indexOf(kind) >= 0)
        .map((kind) => pc.addTransceiver(kind, { direction: 'recvonly' }).receiver.track);
      localTracks.push(...tracks);
    }

    if (videoRef.current) videoRef.current.srcObject = new MediaStream(localTracks);

    return pc;
  }, []);

  async function getMediaTracks(media, constraints) {
    try {
      const stream =
        media === 'user'
          ? await navigator.mediaDevices.getUserMedia(constraints)
          : await navigator.mediaDevices.getDisplayMedia(constraints);
      return stream.getTracks();
    } catch (e) {
      return [];
    }
  }

  const connect = useCallback(async (ws, aPc) => {
    const pc = await aPc;

    ws.addEventListener('open', () => {
      pc.addEventListener('icecandidate', (ev) => {
        if (!ev.candidate) return;
        const msg = { type: 'webrtc/candidate', value: ev.candidate.candidate };
        ws.send(JSON.stringify(msg));
      });

      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          const msg = { type: 'webrtc/offer', value: pc.localDescription.sdp };
          ws.send(JSON.stringify(msg));
        });
    });

    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'webrtc/candidate') {
        pc.addIceCandidate({ candidate: msg.value, sdpMid: '0' });
      } else if (msg.type === 'webrtc/answer') {
        pc.setRemoteDescription({ type: 'answer', sdp: msg.value });
      }
    });
  }, []);

  useEffect(() => {
    const url = `${baseUrl.replace(/^http/, 'ws')}live/webrtc/api/ws?src=${camera}`;
    const ws = new WebSocket(url);
    const aPc = PeerConnection('video+audio');
    connect(ws, aPc);

    return async () => {
      (await aPc).close();
    }
  }, [camera, connect, PeerConnection]);

  return (
    <div>
      <video id="video" ref={videoRef} autoplay playsinline controls muted width={width} height={height} />
    </div>
  );
}
