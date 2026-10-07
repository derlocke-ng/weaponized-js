if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});

// Live relay status: open a websocket to each relay and report how it went.
for (const li of document.querySelectorAll('[data-relay]')) {
  const url = li.dataset.relay;
  li.innerHTML = '<span class="dot"></span><span class="relay-name"></span><span class="relay-state">checking…</span>';
  li.querySelector('.relay-name').textContent = url.replace(/^https?:\/\//, '').replace(/\/gun$/, '');
  const state = li.querySelector('.relay-state');
  const start = performance.now();
  let ws;
  const finish = (ok, text) => {
    clearTimeout(timer);
    li.classList.add(ok ? 'up' : 'down');
    state.textContent = text;
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  };
  const timer = setTimeout(() => finish(false, 'no answer'), 8000);
  try {
    ws = new WebSocket(url.replace(/^http/, 'ws'));
    ws.onopen = () => finish(true, `${Math.round(performance.now() - start)} ms`);
    ws.onerror = () => finish(false, 'down');
  } catch {
    finish(false, 'down');
  }
}
