import { h } from 'preact';
import { render } from '@testing-library/preact';
import JSMpegPlayer from '../JSMpegPlayer';

// Render the real wrapper, but replace the network/decoder with a canvas.
// It must not impose its own height in the editor's shared viewport.
vi.mock('@cycjimmy/jsmpeg-player', () => ({
  default: {
    VideoElement: class FakeVideoElement {
      constructor(host) {
        this.els = { canvas: document.createElement('canvas') };
        host.appendChild(this.els.canvas);
      }
      destroy() {}
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
});
