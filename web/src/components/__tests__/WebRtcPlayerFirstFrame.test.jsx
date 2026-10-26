import { h } from 'preact';
import { act, fireEvent, render } from '@testing-library/preact';
import WebRtcPlayer from '../WebRtcPlayer';

class FakeWebSocket {
  constructor() { this.listeners = {}; }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  send() {}
  close() {}
}

class FakePeerConnection {
  addTransceiver(kind) { return { receiver: { track: { kind } } }; }
  addEventListener() {}
  close() {}
}

describe('WebRTC first visible frame reporting', () => {
  beforeEach(() => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.stubGlobal('RTCPeerConnection', FakePeerConnection);
    vi.stubGlobal('MediaStream', class MediaStream {
      constructor(tracks) { this.tracks = tracks; }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('reports a compositor-presented frame even without loadeddata or playing events', () => {
    let presentFrame;
    const cancelFrame = vi.fn();
    const requestFrame = vi.fn((callback) => {
      presentFrame = callback;
      return 15;
    });
    const originalRequest = HTMLVideoElement.prototype.requestVideoFrameCallback;
    const originalCancel = HTMLVideoElement.prototype.cancelVideoFrameCallback;
    HTMLVideoElement.prototype.requestVideoFrameCallback = requestFrame;
    HTMLVideoElement.prototype.cancelVideoFrameCallback = cancelFrame;
    const onFirstFrame = vi.fn();
    try {
      const { unmount } = render(<WebRtcPlayer camera="test_camera" onFirstFrame={onFirstFrame} />);
      const video = document.getElementById('video');
      expect(video).toBeInTheDocument();
      expect(requestFrame).toHaveBeenCalledTimes(1);
      expect(onFirstFrame).not.toHaveBeenCalled();
      act(() => presentFrame(0, { presentedFrames: 1 }));
      expect(onFirstFrame).toHaveBeenCalledTimes(1);
      fireEvent.playing(video);
      expect(onFirstFrame).toHaveBeenCalledTimes(1);
      unmount();
      expect(cancelFrame).toHaveBeenCalledWith(15);
    } finally {
      if (originalRequest) HTMLVideoElement.prototype.requestVideoFrameCallback = originalRequest;
      else delete HTMLVideoElement.prototype.requestVideoFrameCallback;
      if (originalCancel) HTMLVideoElement.prototype.cancelVideoFrameCallback = originalCancel;
      else delete HTMLVideoElement.prototype.cancelVideoFrameCallback;
    }
  });

  test('falls back to a real loaded frame on browsers without frame callbacks', () => {
    const originalRequest = HTMLVideoElement.prototype.requestVideoFrameCallback;
    delete HTMLVideoElement.prototype.requestVideoFrameCallback;
    const onFirstFrame = vi.fn();
    try {
      const { unmount } = render(<WebRtcPlayer camera="test_camera" onFirstFrame={onFirstFrame} />);
      const video = document.getElementById('video');
      fireEvent.playing(video);
      expect(onFirstFrame).not.toHaveBeenCalled();

      Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
      Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1280 });
      fireEvent.loadedData(video);
      expect(onFirstFrame).toHaveBeenCalledTimes(1);
      fireEvent.timeUpdate(video);
      expect(onFirstFrame).toHaveBeenCalledTimes(1);
      unmount();
    } finally {
      if (originalRequest) HTMLVideoElement.prototype.requestVideoFrameCallback = originalRequest;
      else delete HTMLVideoElement.prototype.requestVideoFrameCallback;
    }
  });
});
