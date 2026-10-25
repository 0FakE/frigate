// onVideoDecode fires after a frame has been decoded and rendered by JSMpeg.
// Emit readiness only once for each player instance (not on socket connect).
export function firstFrameCallback(onFirstFrame) {
  let frameSeen = false;
  return () => {
    if (!frameSeen) {
      frameSeen = true;
      onFirstFrame?.();
    }
  };
}
