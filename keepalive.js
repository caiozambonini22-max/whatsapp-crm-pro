// Mantém o disparo rodando mesmo com a aba do WhatsApp em segundo plano.
// O Chrome "congela" os timers de abas escondidas (1x por minuto). Aqui os timers passam a ser
// cronometrados pelo service worker da extensão (que não é limitado) enquanto a aba está escondida.
(function () {
  if (window.__wcrmKeep) return; window.__wcrmKeep = 1;
  const nST = window.setTimeout.bind(window), nCT = window.clearTimeout.bind(window);
  let port = null, rseq = 0, tseq = 0; const pend = new Map(), live = new Map();
  const kick = () => { try { const E = window.__wcrmEngine; if (E && E.bulkTick) E.bulkTick(); } catch (e) { } };
  function connect() {
    try {
      port = chrome.runtime.connect({ name: 'wcrm-keep' });
      port.onMessage.addListener(m => {
        if (!m) return;
        if (m.t === 'fire') { const f = pend.get(m.id); if (f) { pend.delete(m.id); f(); } }
        else if (m.t === 'kick') kick();
      });
      port.onDisconnect.addListener(() => { port = null; nST(connect, 1500); });
    } catch (e) { port = null; nST(connect, 5000); }
  }
  connect();
  try { chrome.runtime.onMessage.addListener(m => { if (m && m.t === 'kick') kick(); }); } catch (e) { }
  try { if (navigator.locks) navigator.locks.request('wcrm-keepalive', () => new Promise(() => { })); } catch (e) { }
  window.setTimeout = function (fn, ms) {
    const args = Array.prototype.slice.call(arguments, 2);
    if (typeof fn !== 'function' || !document.hidden || !port) return nST.apply(window, arguments);
    const id = --tseq; let done = false; const total = Math.max(0, +ms || 0);
    const fire = () => { if (done) return; done = true; live.delete(id); try { fn.apply(window, args); } catch (e) { setTimeout(() => { throw e; }, 0); } };
    live.set(id, () => { done = true; });
    const arm = rem => {
      if (done) return; const chunk = Math.min(rem, 15000); const rid = ++rseq;
      pend.set(rid, () => { if (done) return; if (rem - chunk > 0) arm(rem - chunk); else fire(); });
      try { port.postMessage({ t: 'sleep', id: rid, ms: chunk }); } catch (e) { pend.delete(rid); }
    };
    arm(total);
    nST(fire, total + 4000);   // rede de segurança caso a ponte caia
    return id;
  };
  window.clearTimeout = function (id) { if (id < 0) { const c = live.get(id); if (c) c(); live.delete(id); } else nCT(id); };
})();
