// WhatsApp CRM Pro v4.31 — persist.js
// Guarda TUDO (mensagens rápidas, scripts, contatos, follow-ups, etc.) em chrome.storage.local,
// que sobrevive a recarregar o WhatsApp, fechar o Chrome e limpar cache/cookies do navegador.
// Perde só se você REMOVER a extensão. Por isso existe também o backup diário em arquivo (background.js).
(function () {
  'use strict';
  const KEY = 'wcrm_state';
  let ready = false, last = '';
  const snapshot = () => { try { return JSON.stringify(collectBackupData().data); } catch (e) { return ''; } };

  chrome.storage.local.get(KEY, o => {
    const saved = o && o[KEY];
    try {
      if (saved && typeof saved === 'object') {
        applyBackup({ data: saved }, 'replace');
        if (Array.isArray(saved.reminders)) reminders = saved.reminders;
        console.log('[WCRM] dados restaurados do armazenamento da extensão');
      }
    } catch (e) { console.warn('[WCRM] falha ao restaurar dados:', e); }
    last = snapshot();
    ready = true;
    if (!saved) chrome.storage.local.set({ [KEY]: JSON.parse(last || '{}') });
  });

  let lastBar = '';
  function labelBar() {
    const counts = {}, seen = new Set();
    const add = (n, l) => { const k = n + '|' + l; if (seen.has(k)) return; seen.add(k); counts[l] = (counts[l] || 0) + 1; };
    try {
      Object.entries(contacts).forEach(([n, c]) => (c.labels || []).forEach(l => add(n, l)));
      (waConversations || []).forEach(c => (c.labels || []).forEach(l => add(c.name, l)));
      const all = [...new Set([...(waAllLabels || []), ...labels])];
      return all.map(l => ({ name: l, count: counts[l] || 0, wa: (waAllLabels || []).includes(l) }));
    } catch (e) { return []; }
  }
  function tabBar() {
    try {
      return (crmTabs || []).map(t => { const names = Object.entries(contacts).filter(([, c]) => (Array.isArray(c.tabs) ? c.tabs : (c.tab ? [c.tab] : [])).includes(t)).map(([n]) => n); return { name: t, count: names.length, contacts: names }; });
    } catch (e) { return []; }
  }
  setInterval(() => {
    if (!ready) return;
    const lb = JSON.stringify({ l: labelBar(), t: tabBar() });
    if (lb !== lastBar) { lastBar = lb; const o = JSON.parse(lb); chrome.storage.local.set({ wcrm_labelbar: { labels: o.l, tabs: o.t, at: Date.now() } }); }
    const now = snapshot();
    if (now && now !== last) { last = now; chrome.storage.local.set({ [KEY]: JSON.parse(now) }); }
  }, 4000);
})();
