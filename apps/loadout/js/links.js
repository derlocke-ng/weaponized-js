// Board links. Everything secret lives in the URL fragment, which browsers
// never send to a server:
//
//   #/b/<pub>            public board, read only
//   #/b/<pub>?w=<priv>   can edit (for private boards the read key is derived from priv)
//   #/b/<pub>?k=<key>    private board, read only
//
// <pub> is the board's SEA public key (its address in gun), <priv> its signing
// key and <key> the symmetric key its content is encrypted with.

const B64 = '[A-Za-z0-9_-]{43}';
const PUB = new RegExp(`^${B64}\\.${B64}$`);
const SECRET = new RegExp(`^${B64}$`);

export const isPub = (s) => typeof s === 'string' && PUB.test(s);
export const isSecret = (s) => typeof s === 'string' && SECRET.test(s);

/** Parse a location hash (with or without the leading #) into a route. */
export function parseRoute(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  const [path, query = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'b' && isPub(parts[1])) {
    const params = new URLSearchParams(query);
    const w = params.get('w');
    const k = params.get('k');
    return { name: 'board', pub: parts[1], w: isSecret(w) ? w : null, k: isSecret(k) ? k : null };
  }
  if (parts[0] === 'account') return { name: 'account' };
  if (parts.length === 0) return { name: 'home' };
  return { name: 'notfound' };
}

/** Accept a pasted link, a bare hash or a bare board address. */
export function parseBoardInput(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  if (isPub(s)) return { name: 'board', pub: s, w: null, k: null };
  const hash = s.includes('#') ? s.slice(s.indexOf('#') + 1) : s.replace(/^\/?/, '/');
  const route = parseRoute(hash);
  return route.name === 'board' ? route : null;
}

export function boardHash({ pub, w = null, k = null }) {
  const q = w ? `?w=${w}` : k ? `?k=${k}` : '';
  return `#/b/${pub}${q}`;
}

/**
 * Share link for a board.
 * @param {string} base  page URL without hash, e.g. https://x.github.io/weaponized-js/loadout/
 * @param {{pub: string, w?: string|null, k?: string|null, enc: boolean}} board
 * @param {'edit'|'view'} role
 */
export function shareLink(base, board, role) {
  if (role === 'edit') {
    if (!board.w) throw new Error('No edit key for this board');
    return base + boardHash({ pub: board.pub, w: board.w });
  }
  if (board.enc && !board.k) throw new Error('No read key for this board');
  return base + boardHash({ pub: board.pub, k: board.enc ? board.k : null });
}
