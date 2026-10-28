import { h } from 'preact';
import { render } from '@testing-library/preact';
import JSMpegPlayer from '../JSMpegPlayer';

const playerInstances = vi.hoisted(() => []);

// Render the real wrapper, but replace the network/decoder with a canvas.
// It must not impose its own height in the editor's shared viewport.
vi.mock('@cycjimmy/jsmpeg-player', () => ({
  default: {
    VideoElement: class FakeVideoElement {
      constructor(host) {
        this.els = { canvas: document.createElement('canvas') };
        host.appendChild(this.els.canvas);
        this.player = {
          source: {
            socket: null,
            reconnectTimeoutId: 0,
            shouldAttemptReconnect: true,
            destroy() {
              // Reproduce the upstream JSMpeg bug seen in Firefox.
              this.socket.close();
            },
          },
        };
        this.destroy = vi.fn(() => {
          this.player.source.destroy();
          this.els.canvas.remove();
        });
        playerInstances.push(this);
      }
    },
  },
}));

describe('JSMpeg editor preview sizing', () => {
  test('editor video opts into the full-size viewport', () => {
    const view = render(<JSMpegPlayer camera="test_camera" width={640} height={360} fillContainer />);
    const host = view.container.querySelector('.live-editor-jsmpeg');

    expect(host).toHaveClass('jsmpeg');
    expect(host.style.width).toBe('100%');
    expect(host.style.height).toBe('100%');
    expect(host.style.maxWidth).toBe('none');
    expect(host.style.maxHeight).toBe('none');
    view.unmount();
  });

  test('other camera players retain their original width and height limits', () => {
    const view = render(<JSMpegPlayer camera="test_camera" width={640} height={360} />);
    const host = view.container.querySelector('.jsmpeg');

    expect(host).not.toHaveClass('live-editor-jsmpeg');
    expect(host.style.maxWidth).toBe('640px');
    expect(host.style.maxHeight).toBe('360px');
    view.unmount();
  });
  test('unmounts a player whose WebSocket was never created without throwing', () => {
    const view = render(<JSMpegPlayer camera="test_camera" width={640} height={360} />);
    const video = playerInstances[playerInstances.length - 1];
    const source = video.player.source;
    expect(source.socket).toBeNull();

    expect(() => view.unmount()).not.toThrow();
    expect(video.destroy).toHaveBeenCalledTimes(1);
    expect(source.shouldAttemptReconnect).toBe(false);
    expect(video.els.canvas.isConnected).toBe(false);
  });

  test('closes an existing JSMpeg socket during ordinary unmount', () => {
    const view = render(<JSMpegPlayer camera="test_camera" width={640} height={360} />);
    const video = playerInstances[playerInstances.length - 1];
    const close = vi.fn();
    video.player.source.socket = { close };

    expect(() => view.unmount()).not.toThrow();
    expect(close).toHaveBeenCalledTimes(1);
    expect(video.destroy).toHaveBeenCalledTimes(1);
  });

});
