import { h } from 'preact';
import { render, waitFor } from '@testing-library/preact';
import JSMpeg from '@cycjimmy/jsmpeg-player';
import JSMpegPlayer from '../JSMpegPlayer';

vi.mock('@cycjimmy/jsmpeg-player', () => ({
  default: {
    VideoElement: vi.fn().mockImplementation(function FakeVideoElement() {
      this.els = { canvas: document.createElement('canvas') };
      this.destroy = vi.fn();
    }),
  },
}));

describe('JSMpegPlayer first decoded frame', () => {
  beforeEach(() => JSMpeg.VideoElement.mockClear());

  test('reports readiness after the first decoded frame, not when the player is constructed', async () => {
    const ready = vi.fn();
    const { unmount } = render(<JSMpegPlayer camera="test_camera" width={640} height={360} onFirstFrame={ready} />);
    await waitFor(() => expect(JSMpeg.VideoElement).toHaveBeenCalledTimes(1));

    const options = JSMpeg.VideoElement.mock.calls[0][3];
    expect(options.onVideoDecode).toEqual(expect.any(Function));
    expect(ready).not.toHaveBeenCalled();
    options.onVideoDecode();
    options.onVideoDecode();
    expect(ready).toHaveBeenCalledTimes(1);

    const player = JSMpeg.VideoElement.mock.results[0].value;
    unmount();
    expect(player.destroy).toHaveBeenCalledTimes(1);
  });
});
