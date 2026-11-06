chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'wcrm_autobackup') { doBackup(); return; }
  chrome.notifications.create({ type:'basic', iconUrl:'icons/icon48.png',
    title:'⚡ WhatsApp CRM Pro', message: alarm.name.replace(/^[^_]+_/,''), priority:2 });
});
chrome.notifications.onClicked.addListener(() => {
  chrome.tabs.query({url:'https://web.whatsapp.com/*'}, tabs => {
    if(tabs.length) chrome.tabs.update(tabs[0].id,{active:true});
    else chrome.tabs.create({url:'https://web.whatsapp.com'});
  });
});
chrome.runtime.onMessage.addListener(msg => {
  if (msg && msg.type === 'NOTIFY') {
    chrome.notifications.create({ type:'basic', iconUrl:'icons/icon48.png', title: msg.title || '⚡ WhatsApp CRM Pro', message: msg.message || '', priority:2 });
  }
});
chrome.runtime.onInstalled.addListener(() => console.log('WhatsApp CRM Pro v4.31'));

// ── Backup diário automático em arquivo (pasta Downloads/WCRM-backup) ──
function doBackup() {
  chrome.storage.local.get(['wcrm_state', 'wcrm_cfg', 'wcrm_enr'], o => {
    if (!o.wcrm_state && !o.wcrm_cfg && !o.wcrm_enr) return;
    const json = JSON.stringify({ app: 'wcrm', version: '4.31', exportedAt: new Date().toISOString(), state: o.wcrm_state || null, cfg: o.wcrm_cfg || null, enr: o.wcrm_enr || [] });
    const url = 'data:application/json;base64,' + btoa(unescape(encodeURIComponent(json)));
    const d = new Date(), p = n => String(n).padStart(2, '0');
    chrome.downloads.download({ url, filename: 'WCRM-backup/wcrm-backup-' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '.json', conflictAction: 'overwrite', saveAs: false });
  });
}
chrome.runtime.onInstalled.addListener(() => { chrome.alarms.create('wcrm_autobackup', { delayInMinutes: 5, periodInMinutes: 1440 }); });
chrome.runtime.onStartup && chrome.runtime.onStartup.addListener(() => { chrome.alarms.get('wcrm_autobackup', a => { if (!a) chrome.alarms.create('wcrm_autobackup', { delayInMinutes: 5, periodInMinutes: 1440 }); }); });
chrome.runtime.onMessage.addListener(msg => { if (msg && msg.type === 'BACKUP_NOW') doBackup(); });

// ── Atualizações: verifica o GitHub a cada 3 h e avisa (selo ↑ no ícone + notificação) ──
chrome.runtime.onMessage.addListener(msg => { if (msg && msg.type === 'OPEN_UPDATER') chrome.tabs.create({ url: chrome.runtime.getURL('update.html') }); if (msg && msg.type === 'CHECK_UPDATE') checkUpdate(); });
chrome.alarms.create('wcrm_updcheck', { periodInMinutes: 180, delayInMinutes: 2 });
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'wcrm_updcheck') checkUpdate(); });
chrome.notifications.onClicked.addListener(id => { if (id === 'wcrm_upd') chrome.tabs.create({ url: chrome.runtime.getURL('update.html') }); });
async function checkUpdate() {
  try {
    const o = await new Promise(r => chrome.storage.local.get(['wcrm_upd', 'wcrm_upd_seen'], r)); const c = o.wcrm_upd; if (!c || !c.repo) return;
    const r = await fetch('https://api.github.com/repos/' + c.repo + '/contents/manifest.json?ref=' + encodeURIComponent(c.branch || 'main'), { headers: Object.assign({ Accept: 'application/vnd.github.raw' }, c.token ? { Authorization: 'Bearer ' + c.token } : {}), cache: 'no-store' });
    if (!r.ok) return; const v = JSON.parse(await r.text()).version; const cur = chrome.runtime.getManifest().version;
    const cmp = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };
    if (cmp(v, cur) > 0) {
      chrome.storage.local.set({ wcrm_upd_new: { version: v, at: Date.now() } }); chrome.action.setBadgeText({ text: '↑' }); chrome.action.setBadgeBackgroundColor({ color: '#d4af37' });
      if (o.wcrm_upd_seen !== v) { chrome.storage.local.set({ wcrm_upd_seen: v }); chrome.notifications.create('wcrm_upd', { type: 'basic', iconUrl: 'icons/icon48.png', title: '🔄 Nova versão do CRM: ' + v, message: 'Clique para atualizar (1 clique).', priority: 2 }); }
    } else { chrome.storage.local.remove('wcrm_upd_new'); chrome.action.setBadgeText({ text: '' }); }
  } catch (e) {}
}
