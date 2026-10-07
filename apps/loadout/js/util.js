// Small helpers shared by every module. No DOM or network access here so the
// pure modules that import it stay testable under node.

export const enc = new TextEncoder();

/** Escape text for use inside HTML (element content and quoted attributes). */
export function h(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function bytesToB64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlToBytes(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Random url-safe id; 8 bytes = 11 chars is plenty for item keys. */
export function randomId(bytes = 8) {
  return bytesToB64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256(text) {
  return bytesToB64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text))));
}

export function debounce(fn, ms) {
  let t;
  const run = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  run.flush = (...args) => {
    clearTimeout(t);
    fn(...args);
  };
  run.cancel = () => clearTimeout(t);
  return run;
}

export function timeout(promise, ms, message = 'Timed out') {
  let t;
  return Promise.race([promise, new Promise((_, reject) => (t = setTimeout(() => reject(new Error(message)), ms)))]).finally(() => clearTimeout(t));
}

const UNITS = [
  ['year', 31536e6],
  ['month', 2592e6],
  ['week', 6048e5],
  ['day', 864e5],
  ['hour', 36e5],
  ['minute', 6e4],
];
const rtf = typeof Intl !== 'undefined' ? new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }) : null;

export function relTime(ts, now = Date.now()) {
  if (!ts) return '';
  const diff = ts - now;
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return 'just now';
}

export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** localStorage access that never throws (private mode, quota, disabled). */
export const store = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};
