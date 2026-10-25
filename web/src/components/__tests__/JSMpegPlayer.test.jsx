import { firstFrameCallback } from '../../utils/firstFrame';

describe('JSMpeg first rendered frame readiness', () => {
  test('does not report readiness until JSMpeg invokes onVideoDecode, then only once', () => {
    const ready = vi.fn();
    const onVideoDecode = firstFrameCallback(ready);
    expect(ready).not.toHaveBeenCalled();
    onVideoDecode();
    onVideoDecode();
    expect(ready).toHaveBeenCalledTimes(1);
  });

  test('creates a fresh callback for each new player and supports optional handlers', () => {
    const ready = vi.fn();
    firstFrameCallback(ready)();
    firstFrameCallback(ready)();
    expect(ready).toHaveBeenCalledTimes(2);
    expect(() => firstFrameCallback()()).not.toThrow();
  });
});
