// One mining thread: nonces start, start+stride, … until the id meets the
// target. Reports how many it tried every few hundred milliseconds.
import { mineNonce } from './pow.js';

self.onmessage = (e) => {
  const { template, bits, start = 0, stride = 1 } = e.data;
  let last = Date.now();
  try {
    const { event } = mineNonce(template, bits, {
      start,
      stride,
      onCount: (tried) => {
        const t = Date.now();
        if (t - last < 400) return;
        last = t;
        self.postMessage({ tried });
      },
    });
    self.postMessage({ event });
  } catch (err) {
    self.postMessage({ error: String(err?.message || err) });
  }
};
