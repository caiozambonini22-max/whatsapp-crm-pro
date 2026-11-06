// WhatsApp CRM Pro v4.0 — crm.js
// Zero inline event handlers — all via addEventListener

// ── IndexedDB ────────────────────────────────────────────────
let db;
const dbReq = indexedDB.open('wcrm_db', 1);
dbReq.onupgradeneeded = e => {
  db = e.target.result;
  if (!db.objectStoreNames.contains('media')) {
    const s = db.createObjectStore('media', { keyPath: 'id', autoIncrement: true });
    s.createIndex('type', 'type', { unique: false });
  }
};
dbReq.onsuccess = e => { db = e.target.result; renderMedia(); updateStor(); };

function dbSave(file, dataUrl) {
  return new Promise((res, rej) => {
    const tx = db.transaction('media', 'readwrite');
    const r = tx.objectStore('media').add({ name: file.name, type: file.type.split('/')[0], mime: file.type, size: file.size, dataUrl, addedAt: Date.now() });
    r.onsuccess = () => res(r.result); r.onerror = rej;
  });
}
function dbAll() { return new Promise((res, rej) => { const r = db.transaction('media', 'readonly').objectStore('media').getAll(); r.onsuccess = () => res(r.result); r.onerror = rej; }); }
function dbDel(id) { return new Promise((res, rej) => { const r = db.transaction('media', 'readwrite').objectStore('media').delete(id); r.onsuccess = res; r.onerror = rej; }); }

// ── CONSTANTS ─────────────────────────────────────────────────
const SC = { lead: ['#ffb300', '#111', '🟡 Lead'], negociando: ['#2196f3', '#fff', '🔵 Negociando'], comprou: ['#00a884', '#fff', '🟢 Comprou'], posVenda: ['#9c27b0', '#fff', '🟣 Pós-venda'], inativo: ['#c0392b', '#fff', '🔴 Inativo'] };
const LC = l => ({ Interessado: '#00a884', VIP: '#ffb300', 'Indicação': '#9c27b0', Smartwatch: '#2196f3', Garantia: '#e74c3c', Aguardando: '#8696a0', 'Pós-venda': '#ff9800' }[l] || '#8696a0');
const AK = { text: { i: '📝', l: 'Mensagem de Texto' }, image: { i: '🖼️', l: 'Imagem' }, video: { i: '🎥', l: 'Vídeo' }, audio: { i: '🎤', l: 'Áudio' }, doc: { i: '📄', l: 'Documento' }, typing: { i: '⌨️', l: 'Exibir "digitando..."' }, recording: { i: '🔴', l: 'Exibir "gravando áudio..."' }, wait: { i: '⏱️', l: 'Aguardar (timer)' } };
const CATS = { all: { l: 'Todas', e: '📋' }, saudacao: { l: 'Saudação', e: '☀️' }, produto: { l: 'Produto', e: '⌚' }, posVenda: { l: 'Pós-venda', e: '🏷️' }, garantia: { l: 'Garantia', e: '🛡️' }, promo: { l: 'Promoção', e: '🔥' }, funil: { l: 'Script', e: '🔗' }, followup: { l: 'Follow UP', e: '🔔' } };
const BG_COLORS = ['#075e54', '#128c7e', '#25d366', '#34b7f1', '#0059b2', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308', '#1a2530', '#000'];
const FU_VARS_DEF = [
  'Oi, #primeiroNome! Tudo bem? 😊 Passando para ver se tinha alguma dúvida!',
  'Olá #primeiroNome! 👋 Qualquer dúvida é só falar!',
  '#primeiroNome, ainda está pensando? Posso te ajudar! ⌚',
  'Oi #primeiroNome! 🔔 Condições especiais hoje! Quer saber mais? 🎁',
  '#primeiroNome, tudo certo? Estamos à disposição! 😊'
];

// ── STATE ──────────────────────────────────────────────────────
let activeContact = null, activeFilter = 'all', allMin = false;
let openDDId = null, mediaFilter = 'all';
let massRunning = false, massStop = false;
let stType = 'text', stBg = '#075e54', stAud = 'all', stSched = false, stFileUrl = null;
let labels = ['Interessado', 'VIP', 'Indicação', 'Smartwatch', 'Garantia', 'Aguardando', 'Pós-venda'];
let crmTabs = ['Primeiro Contato', 'Follow UP', 'Fechado', 'Pós-venda', 'Frio'];
let contacts = {};
let scheduledItems = [], statusHistory = [], scheduledStatuses = [], autoAtends = [], followUps = [];
let msgs = [
  { id: 1, type: 'msg', label: 'Bom dia', cat: 'saudacao', actions: [{ k: 'text', db: 3, da: 2, txt: 'Bom dia! ☀️ Tudo bem? Estamos aqui para te atender! 😊' }] },
  { id: 2, type: 'msg', label: 'Galaxy Watch 6', cat: 'produto', actions: [{ k: 'text', db: 3, da: 3, txt: '⌚ *Galaxy Watch 6* — 44mm\n✅ AMOLED · GPS\n💰 R$ 1.299,00' }, { k: 'image', db: 2, da: 0, txt: 'Foto do produto' }] },
  { id: 3, type: 'msg', label: 'Garantia', cat: 'garantia', actions: [{ k: 'text', db: 2, da: 2, txt: '🛡️ *Garantia — 12 meses*\nCobre defeitos de fabricação.\n❌ Não cobre queda ou água. ✅' }] },
  { id: 4, type: 'msg', label: 'Pós-venda', cat: 'posVenda', actions: [{ k: 'text', db: 3, da: 0, txt: 'Oi! 😊 Passando para saber se chegou tudo certinho! 🙏' }] },
  { id: 5, type: 'script', label: 'Funil Masculino', cat: 'funil', actions: [{ k: 'text', db: 3, da: 4, txt: 'Oi! Tudo bem? 😊 Vi que você se interessou pelos nossos smartwatches!' }, { k: 'typing', db: 2, da: 3, txt: '' }, { k: 'text', db: 0, da: 5, txt: 'Temos os melhores modelos com garantia! ⌚🔥' }, { k: 'text', db: 0, da: 0, txt: 'Qual modelo te chamou mais atenção? 😊' }] },
  { id: 6, type: 'script', label: 'Follow UP', cat: 'followup', actions: [{ k: 'text', db: 4, da: 5, txt: 'Oi! Tudo bem? 😊 Só passando para ver se tinha alguma dúvida...' }, { k: 'typing', db: 3, da: 3, txt: '' }, { k: 'text', db: 0, da: 0, txt: 'Qualquer coisa é só falar! 🙏' }] }
];
let massCPool = Array.from({ length: 60 }, (_, i) => ({ id: i + 1, name: ['Ana', 'Bruno', 'Carlos', 'Daniela', 'Eduardo', 'Fernanda', 'Gabriel', 'Helena', 'Igor', 'Juliana', 'Kleber', 'Larissa', 'Marcos', 'Nathalia', 'Oscar'][i % 15] + (i >= 15 ? ' ' + (Math.floor(i / 15) + 1) : ''), num: '55169' + String(90000000 + i * 1237).substring(0, 8), sel: false }));
let massFilt = [...massCPool];
// Creator state
let dA = [], dL = '', dCat = 'saudacao', dType = 'msg', crEditId = null;
// AA state
let aaActions = [], aaKWs = [];
// FU state
let fuVars = [...FU_VARS_DEF];

// ── HELPERS ───────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
function applyNome(text, name) {
  if (!text) return text;
  if (!/#primeiroNome/i.test(text)) return text;
  if (!name) return text.replace(/#primeiroNome/gi, '');
  let cleaned = name
    .replace(/\s*\(.*?\)\s*/g, '')
    .replace(/\s*[-|\/].*$/, '')
    .trim();
  const fn = (cleaned.split(/\s+/)[0] || name.split(/\s+/)[0] || '').trim();
  if (!fn) return text.replace(/#primeiroNome/gi, '');
  const firstName = fn.charAt(0).toUpperCase() + fn.slice(1).toLowerCase();
  return text.replace(/#primeiroNome/gi, firstName);
}
function sendToWA(text) { window.parent.postMessage({ type: 'SEND', text: text }, '*'); }
function toast(msg, bg = '#00a884') { const t = $('toast'); t.textContent = msg; t.style.background = bg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2600); }
function formatD(d) { if (!d) return ''; const [y, m, day] = d.split('-'); return `${day}/${m}/${y}`; }

// ── POSTMESSAGE FROM WA ────────────────────────────────────────
// ── CRM TABS & LABELS STATE ────────────────────────────────────
let waConversations = []; // [{name, labels, preview}]
let waAllLabels = [];     // all unique WA labels
let crmActiveSubtab = 'abas';
let crmActiveFilter = null; // {type:'aba'|'label', value:string}
let crmTabColors = ['#00a884','#3b82f6','#8b5cf6','#ef4444','#f97316','#f59e0b','#06b6d4','#ec4899','#84cc16'];

window.addEventListener('message', e => {
  if (e.data?.type === 'CONTACT') {
    activeContact = e.data.name;
    $('hdr-contact').textContent = activeContact || 'Nenhum contato';
    if (e.data.allLabels?.length) { waAllLabels = e.data.allLabels; renderWALabelsPills(); }
    if (e.data.conversations?.length) waConversations = e.data.conversations;
    // Auto-apply WA labels to contact
    if (activeContact && e.data.waLabels?.length) {
      if (!contacts[activeContact]) contacts[activeContact] = { av: '👤', col: '#2a3942', labels: [] };
      const cur = contacts[activeContact].labels || [];
      e.data.waLabels.forEach(l => { if (!cur.includes(l)) cur.push(l); if (!labels.includes(l)) labels.push(l); });
      contacts[activeContact].labels = cur;
    }
    if (activeContact && contacts[activeContact]) updateContactPanel();
  }
  if (e.data?.type === 'SET_TAB') {
    const nt = (e.data.newTab || '').trim(); if (nt && !crmTabs.includes(nt)) crmTabs.push(nt);
    const n = e.data.contact;
    if (n) {
      if (!contacts[n]) contacts[n] = { av: '👤', col: '#2a3942', labels: [] };
      const c0 = contacts[n]; let tl = tabsOf(c0); const md = e.data.mode;
      if (md === 'add') { if (e.data.tab && !tl.includes(e.data.tab)) tl = tl.concat([e.data.tab]); }
      else if (md === 'remove' || e.data.onlyIf) { const rm = e.data.onlyIf || e.data.tab; tl = tl.filter(x => x !== rm); }
      else if (md === 'clear') tl = [];
      else tl = e.data.tab ? [e.data.tab] : [];
      c0.tabs = tl; c0.tab = tl[0] || '';
    }
    try { saveAutoBackup(); } catch (x) {}
    if ($('sec-crm-tabs')?.classList.contains('active')) renderCRMTabsSection();
  }
  if (e.data?.type === 'APPLY_LABEL_RESULT') {
    const r = e.data.result || {};
    if (r.ok) toast('🏷️ WhatsApp: "' + e.data.label + '" ' + (e.data.mode === 'add' ? 'aplicada' : 'removida') + ' ✓');
    else toast('⚠️ WhatsApp não aplicou: ' + (r.reason || '?') + ' (ficou só no CRM)', '#e74c3c');
  }
  if (e.data?.type === 'CONVERSATIONS') {
    if (e.data.bridge) setSyncStatus(e.data.bridge);
    if (e.data.allLabels?.length) waAllLabels = e.data.allLabels;
    if (e.data.conversations?.length) waConversations = e.data.conversations;
    // Re-render if CRM tab is active
    if ($('sec-crm-tabs')?.classList.contains('active')) renderCRMTabsSection();
  }
  if (e.data?.type === 'GOTO_TAB') {
    const el = document.querySelector('.ntab[data-tab="' + e.data.tab + '"]');
    if (el) el.click();
  }
  if (e.data?.type === 'FILTER_LABEL') {
    const lbl = e.data.label;
    document.querySelector('[data-tab="crm-tabs"]')?.click();
    document.querySelector('.crm-subtab[data-subtab="etiquetas"]')?.click();
    if (crmActiveFilter?.type === 'label' && crmActiveFilter.value === lbl) {
      crmActiveFilter = null; $('crm-active-filter').style.display = 'none';
    } else {
      crmActiveFilter = { type: 'label', value: lbl };
      $('crm-filter-label').textContent = '🏷️ ' + lbl; $('crm-active-filter').style.display = 'flex';
    }
    renderCRMLabelsPills(); renderCRMContactList();
  }
  if (e.data?.type === 'OPEN_NOTE') openNoteModal();
  if (e.data?.type === 'OPEN_REMINDER') openReminderModal();
  if (e.data?.type === 'OPEN_SCHED') openSchedMsgModal();
});
window.parent.postMessage({ type: 'GET_CONTACT' }, '*');

// ── TAB NAVIGATION ─────────────────────────────────────────────
document.getElementById('main-nav').addEventListener('click', e => {
  const tab = e.target.dataset.tab;
  if (!tab) return;
  document.querySelectorAll('.ntab').forEach(t => t.classList.remove('active'));
  e.target.classList.add('active');
  document.querySelectorAll('.sec').forEach(s => s.classList.remove('active'));
  $('sec-' + tab).classList.add('active');
  $('min-btn').style.display = tab === 'msgs' ? '' : 'none';
  if (tab === 'msgs') renderMsgs();
  if (tab === 'media') { renderMedia(); updateStor(); }
  if (tab === 'contact') updateContactPanel();
  if (tab === 'mass') { renderMassList(); populateMassMsgSel(); }
  if (tab === 'auto') renderAAList();
  if (tab === 'followup') renderFUList();
  if (tab === 'ladder' && window.WCRM_LADDER) window.WCRM_LADDER.render();
  if (tab === 'status') initStatus();
  if (tab === 'sched') renderSchedList();
  if (tab === 'backup') { renderBackupSummary(); renderAutoBackupList(); }
  if (tab === 'crm-tabs') {
    // Request fresh data from WA
    window.parent.postMessage({ type: 'GET_CONVERSATIONS' }, '*');
    renderCRMTabsSection();
  }
});

$('close-panel')?.addEventListener('click', () => window.parent.postMessage({ type: 'TOGGLE_PANEL' }, '*'));

// ── MINIMIZE ALL ──────────────────────────────────────────────
$('min-btn').addEventListener('click', () => {
  allMin = !allMin;
  document.querySelectorAll('.cg').forEach(g => g.classList.toggle('open', !allMin));
  $('min-btn').textContent = allMin ? '⊞' : '⊟';
});

// ── MSGS ──────────────────────────────────────────────────────
let typeFilter = 'all';
const TYPE_OPTS = [['all', 'Por Tipo'], ['msg', '⚡ Rápidas'], ['script', '🔗 Scripts'], ['text', '📝 Com texto'], ['audio', '🎤 Com áudio'], ['image', '🖼️ Com imagem'], ['video', '🎥 Com vídeo'], ['doc', '📄 Com documento']];
function renderPills() {
  const catOpts = Object.entries(CATS).filter(([k]) => k !== 'all').map(([k, v]) => '<option value="' + k + '"' + (activeFilter === k ? ' selected' : '') + '>' + v.e + ' ' + v.l + '</option>').join('');
  const isCat = activeFilter !== 'all' && activeFilter !== 'nocat' && activeFilter !== 'top';
  $('pills').innerHTML =
    '<button class="chip' + (activeFilter === 'all' && typeFilter === 'all' ? ' on' : '') + '" data-filter="all">Tudo</button>'
    + '<select class="chip' + (typeFilter !== 'all' ? ' on' : '') + '" id="flt-type">' + TYPE_OPTS.map(([v, l]) => '<option value="' + v + '"' + (typeFilter === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>'
    + '<button class="chip' + (activeFilter === 'nocat' ? ' on' : '') + '" data-filter="nocat">Sem Categoria</button>'
    + '<select class="chip' + (isCat ? ' on' : '') + '" id="flt-cat"><option value="">Por Categoria</option>' + catOpts + '</select>'
    + '<button class="chip' + (activeFilter === 'top' ? ' on' : '') + '" data-filter="top">🔥 Mais Usadas</button>';
}

// WA labels from WhatsApp Business shown as extra pills
let waLabelFilter = null;
function renderWALabelsPills() {
  const el = $('wa-labels-pills'); if (!el) return;
  el.style.display = 'none'; return;   // removido: etiquetas já ficam na barra do topo
  if (!waAllLabels.length) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  const colors = ['#3b82f6','#f59e0b','#00a884','#8b5cf6','#ef4444','#f97316','#06b6d4','#ec4899','#84cc16','#e879f9'];
  el.innerHTML = waAllLabels.map((lbl, i) => {
    const col = colors[i % colors.length];
    const isActive = waLabelFilter === lbl;
    return '<button class="wa-lbl-pill' + (isActive ? ' active' : '') + '" data-wa-label="' + lbl + '" style="background:' + col + (isActive ? '' : '20') + ';border:1px solid ' + col + '50;color:' + (isActive ? 'white' : col) + ';padding:3px 9px;border-radius:20px;font-size:10px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap;transition:all .15s;">'
      + '🏷️ ' + lbl + '</button>';
  }).join('');
  el.querySelectorAll('[data-wa-label]').forEach(btn => {
    btn.addEventListener('click', () => {
      waLabelFilter = waLabelFilter === btn.dataset.waLabel ? null : btn.dataset.waLabel;
      renderWALabelsPills();
      renderMsgs();
    });
  });
}
$('pills').addEventListener('change', e => {
  if (e.target.id === 'flt-type') { typeFilter = e.target.value; }
  if (e.target.id === 'flt-cat') { activeFilter = e.target.value || 'all'; }
  waLabelFilter = null; renderPills(); renderWALabelsPills(); renderMsgs();
});
$('pills').addEventListener('click', e => {
  const f = e.target.dataset.filter;
  if (!f) return;
  activeFilter = f; if (f === 'all') typeFilter = 'all';
  waLabelFilter = null; // reset WA label filter when category changes
  renderPills();
  renderWALabelsPills();
  renderMsgs();
});
$('msg-search').addEventListener('input', renderMsgs);
$('btn-new-msg').addEventListener('click', () => openCreator(null));

function msgMatchesType(m) {
  if (typeFilter === 'all') return true;
  if (typeFilter === 'msg' || typeFilter === 'script') return m.type === typeFilter;
  return (m.actions || []).some(a => a.k === typeFilter);
}
function renderMsgs() {
  const q = $('msg-search').value.toLowerCase();
  const body = $('msgs-body');
  const grp = {};
  let list = msgs.filter(m => msgMatchesType(m) && (!q || m.label.toLowerCase().includes(q)));
  if (activeFilter === 'top') {
    list = list.filter(m => (m.uses || 0) > 0).sort((a, b) => (b.uses || 0) - (a.uses || 0));
    if (list.length) grp.__top = list;
  } else {
    list.forEach(m => {
      if (activeFilter === 'nocat' && m.cat) return;
      if (activeFilter !== 'all' && activeFilter !== 'nocat' && m.cat !== activeFilter) return;
      const k = m.cat || '__nocat';
      if (!grp[k]) grp[k] = [];
      grp[k].push(m);
    });
  }
  if (!Object.keys(grp).length) { body.innerHTML = '<div class="empty"><div>' + (activeFilter === 'top' ? '🔥' : '🔍') + '</div>' + (activeFilter === 'top' ? 'Nada usado ainda. Envie respostas e elas aparecem aqui.' : 'Nenhuma mensagem') + '</div>'; return; }
  body.innerHTML = Object.entries(grp).map(([cat, items]) => {
    const ci = cat === '__top' ? { e: '🔥', l: 'Mais usadas' } : cat === '__nocat' ? { e: '📌', l: 'Sem categoria' } : (CATS[cat] || { e: '📌', l: cat });
    return '<div class="cg open" data-cat="' + cat + '">'
      + '<div class="cg-hdr"><div class="cg-title">' + ci.e + ' ' + ci.l + ' <span style="color:#8696a0;font-weight:400;font-size:10px;">(' + items.length + ')</span></div><span class="cg-chev">▲</span></div>'
      + '<div class="cg-items">' + items.map(m => renderMC(m)).join('') + '</div>'
      + '</div>';
  }).join('');
}

function renderMC(m) {
  const isSc = m.type === 'script';
  const ks = (m.actions || []).map(a => a.k);
  const ico = isSc ? '🔗' : ks.includes('audio') ? '🎤' : ks.includes('video') ? '🎥' : ks.includes('image') ? '🖼️' : '📝';
  const tags = (m.actions || []).map(a => '<span class="atag">' + (AK[a.k]?.i || '❓') + ' ' + (AK[a.k]?.l || a.k) + '</span>').join('');
  const allText = (m.actions || []).filter(a => a.k === 'text' && a.txt).map(a => a.txt).join('\n\n');
  const highlighted = allText.replace(/#primeiroNome/gi, '<span class="tag-nome">#primeiroNome</span>');
  return '<div class="mr" data-id="' + m.id + '">'
    + '<div class="mr-row"><span class="mr-ico">' + ico + '</span><span class="mr-label" title="' + String(m.label).replace(/"/g, '&quot;') + '">' + m.label + '</span>'
    + '<button class="dots-btn" data-dots="' + m.id + '" title="Mais opções">···</button>'
    + '<button class="mc-eye-btn" data-eye="' + m.id + '" title="Ver / ocultar mensagem">👁</button>'
    + '<button class="send-btn" data-send="' + m.id + '" title="Enviar">▶</button></div>'
    + '<div class="mc-expanded" id="mc-exp-' + m.id + '" style="display:none;">'
    + '<div class="mc-full-text">' + (highlighted ? highlighted.replace(/\n/g, '<br>') : '(sem texto)') + '</div>'
    + '<div class="mc-acts" style="margin-top:6px;">' + tags + '</div>'
    + '<div style="margin-top:6px;"><button class="edit-btn" data-edit="' + m.id + '">✏️ Editar</button></div>'
    + '</div></div>';
}

// Event delegation on msgs-body
$('msgs-body').addEventListener('click', e => {
  const cg = e.target.closest('.cg-hdr');
  if (cg) { cg.closest('.cg').classList.toggle('open'); return; }
  const dots = e.target.dataset.dots || e.target.closest('[data-dots]')?.dataset.dots;
  if (dots) { openDD(e, +dots); return; }
  // Eye toggle — expand/collapse full message
  const eye = e.target.dataset.eye || e.target.closest('[data-eye]')?.dataset.eye;
  if (eye) {
    const exp = $('mc-exp-' + eye);
    const prev = document.querySelector('[data-preview-id="' + eye + '"]');
    const btn = e.target.closest('[data-eye]') || e.target;
    if (exp) {
      const isOpen = exp.style.display !== 'none';
      exp.style.display = isOpen ? 'none' : 'block';
      if (prev) prev.style.display = isOpen ? '' : 'none';
      btn.textContent = isOpen ? '👁' : '🙈';
    }
    return;
  }
  const edit = e.target.dataset.edit || e.target.closest('[data-edit]')?.dataset.edit;
  if (edit) { openCreator(+edit); return; }
  const send = e.target.dataset.send || e.target.closest('[data-send]')?.dataset.send;
  if (send) { runMsg(+send); return; }
});

function runMsg(id) {
  const m = msgs.find(x => x.id === id); if (!m) return;
  m.uses = (m.uses || 0) + 1;
  window.parent.postMessage({ type: 'QUICK_RUN', id: id }, '*');   // o motor envia tudo (texto, mídia, áudio) com faixa de progresso
  return;

  // Verifica se tem conversa aberta (activeContact pode estar desatualizado — content.js vai resolver o nome na hora)
  let cumulativeDelay = 0;
  let hasSomething = false;

  m.actions.forEach(a => {
    const beforeDelay = (a.db || 0) * 1000;
    const afterDelay  = (a.da || 0) * 1000;
    cumulativeDelay += beforeDelay;

    if (a.k === 'text' && a.txt) {
      hasSomething = true;
      const rawText = a.txt; // envia RAW — content.js aplica #primeiroNome com o contato atual do DOM
      const sendAt = cumulativeDelay;
      setTimeout(() => {
        window.parent.postMessage({ type: 'SEND', text: rawText }, '*');
      }, sendAt);
      cumulativeDelay += afterDelay;
    } else if (['typing','recording','wait'].includes(a.k)) {
      cumulativeDelay += (a.db || 3) * 1000;
    } else {
      cumulativeDelay += afterDelay;
    }
  });

  if (hasSomething) toast('✅ "' + m.label + '" enviando...');
  else toast('⚠️ Nenhuma ação de texto nesta mensagem', '#e74c3c');
}

// ── DROPDOWN ──────────────────────────────────────────────────
function openDD(e, id) {
  e.stopPropagation();
  const dd = $('dd');
  if (openDDId === id) { dd.classList.remove('open'); openDDId = null; return; }
  openDDId = id;
  const rect = e.currentTarget.getBoundingClientRect();
  const menuH = 200;
  let top = rect.bottom + 4;
  if (top + menuH > window.innerHeight) top = rect.top - menuH - 4;
  dd.style.cssText = 'left:' + Math.max(4, rect.right - 210) + 'px;top:' + top + 'px;';
  dd.innerHTML = [
    '<div class="ddi" data-ddact="send" data-ddid="' + id + '">▶ Editar e enviar</div>',
    '<div class="ddi" data-ddact="prev" data-ddid="' + id + '">👁 Visualizar</div>',
    '<div class="ddi" data-ddact="edit" data-ddid="' + id + '">✏️ Editar</div>',
    '<div class="ddi" data-ddact="dup" data-ddid="' + id + '">📋 Duplicar</div>',
    '<div class="ddi" data-ddact="sched" data-ddid="' + id + '">🕐 Agendar</div>',
    '<div class="ddi danger" data-ddact="del" data-ddid="' + id + '">🗑 Deletar</div>',
  ].join('');
  dd.classList.add('open');
}
function closeDD() { $('dd').classList.remove('open'); openDDId = null; }
document.addEventListener('click', closeDD);
$('dd').addEventListener('click', e => {
  e.stopPropagation();
  const el = e.target.closest('[data-ddact]'); if (!el) return;
  const act = el.dataset.ddact, id = +el.dataset.ddid;
  closeDD();
  if (act === 'send') runMsg(id);
  else if (act === 'prev') { const m = msgs.find(x => x.id === id); if (m) alert(m.actions.filter(a => a.k === 'text').map(a => a.txt).join('\n\n---\n\n') || '(sem texto)'); }
  else if (act === 'edit') openCreator(id);
  else if (act === 'dup') { const m = msgs.find(x => x.id === id); if (!m) return; const c = JSON.parse(JSON.stringify(m)); c.id = Date.now(); c.label += ' (cópia)'; msgs.push(c); renderMsgs(); toast('📋 Duplicado!'); }
  else if (act === 'sched') { const m = msgs.find(x => x.id === id); if (!m) return; const dt = prompt('Data e hora (ex: 28/03 09:00):'); if (dt) { scheduledItems.push({ id: Date.now(), label: m.label, dt, msgId: id }); toast('🕐 Agendado para ' + dt); } }
  else if (act === 'del') { if (!confirm('Deletar esta mensagem?')) return; msgs = msgs.filter(x => x.id !== id); renderMsgs(); toast('🗑 Removido', '#e74c3c'); }
});

// ── EMOJI PICKER ──────────────────────────────────────────────
const EMOJIS = {
  '😊 Rostos': ['😊','😁','😂','🤣','😍','🥰','😘','😎','🤩','😇','🙏','👋','👍','👏','💪','🎉','🔥','✅','❌','⭐','💎','💰','🎁','📢','⌚','🛡️','🏷️','📦','🚀','💡','📝','✍️','📞','💬','📱'],
  '❤️ Corações': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','💕','💞','💓','💗','💖','💝','♥️'],
  '🎯 Negócios': ['💼','📊','📈','📉','🏆','🥇','🎯','⚡','🔑','🔒','💳','🏪','🏬','🤝','✔️','❎','🔔','⏰','📅','🗓️','📋','📌','🗂️'],
  '⌚ Produtos': ['⌚','📱','💻','🖥️','⌨️','🖱️','📷','🎧','🎮','📺','🔌','🔋','💡','🔦','⚙️','🛒','🎁','🏷️','📦','🚚'],
  '✨ Símbolos': ['✨','🌟','💫','⭐','🌈','☀️','🌙','⚡','🔥','💧','🌊','🍀','🌸','🌺','🌻','🍁','🦋','🐝','🦄'],
};

let activeEmojiCat = Object.keys(EMOJIS)[0];

function buildEmojiPicker(targetId) {
  const wrap = document.createElement('div');
  wrap.className = 'emoji-picker-wrap';

  const btn = document.createElement('button');
  btn.className = 'emoji-picker-btn';
  btn.textContent = '😊';
  btn.title = 'Inserir emoji';
  btn.type = 'button';

  const picker = document.createElement('div');
  picker.className = 'emoji-picker';

  function renderPicker() {
    const cats = Object.keys(EMOJIS).map(c =>
      '<button class="emoji-cat' + (c === activeEmojiCat ? ' active' : '') + '" data-ecat="' + c + '">' + c.split(' ')[0] + '</button>'
    ).join('');
    const grid = (EMOJIS[activeEmojiCat] || []).map(e =>
      '<span class="eitem" data-ei="' + e + '">' + e + '</span>'
    ).join('');
    picker.innerHTML = '<div class="emoji-cats">' + cats + '</div><div class="emoji-grid">' + grid + '</div>';

    picker.querySelectorAll('[data-ecat]').forEach(b => {
      b.addEventListener('click', e => { e.stopPropagation(); activeEmojiCat = b.dataset.ecat; renderPicker(); });
    });
    picker.querySelectorAll('[data-ei]').forEach(span => {
      span.addEventListener('click', e => {
        e.stopPropagation();
        const ta = document.getElementById(targetId);
        if (!ta) return;
        const start = ta.selectionStart || ta.value.length;
        const end = ta.selectionEnd || ta.value.length;
        ta.value = ta.value.substring(0, start) + span.dataset.ei + ta.value.substring(end);
        ta.selectionStart = ta.selectionEnd = start + span.dataset.ei.length;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.focus();
      });
    });
  }

  btn.addEventListener('click', e => {
    e.stopPropagation();
    renderPicker();
    picker.classList.toggle('open');
  });
  document.addEventListener('click', () => picker.classList.remove('open'));

  wrap.appendChild(btn);
  wrap.appendChild(picker);
  return wrap;
}

// ── CREATOR ───────────────────────────────────────────────────
function openCreator(id) {
  const ex = id ? msgs.find(m => m.id === id) : null;
  crEditId = id;
  dA = ex ? JSON.parse(JSON.stringify(ex.actions)) : [];
  dL = ex?.label || ''; dCat = ex?.cat || 'saudacao'; dType = ex?.type || 'msg';
  $('cr-title').textContent = id ? 'Editar Resposta Rápida' : 'Criar Resposta Rápida';
  $('creator').classList.add('open');
  renderCreator();
}
function closeCreator() { $('creator').classList.remove('open'); crEditId = null; }
$('btn-close-creator').addEventListener('click', closeCreator);

function renderCreator() {
  const catOpts = Object.entries(CATS).filter(([k]) => k !== 'all').map(([k, v]) => '<option value="' + k + '"' + (dCat === k ? ' selected' : '') + '>' + v.e + ' ' + v.l + '</option>').join('');
  const actMenuItems = Object.entries(AK).map(([k, v]) => '<div class="am-opt" data-addact="' + k + '">' + v.i + ' ' + v.l + '</div>').join('');
  $('cr-body').innerHTML = '<div class="lbl" style="margin-top:0">Título</div>'
    + '<input class="fi" id="dlabel" value="' + dL + '" placeholder="Nome da resposta rápida">'
    + '<div class="lbl">Tipo</div>'
    + '<select class="fs" id="dtype"><option value="msg"' + (dType === 'msg' ? ' selected' : '') + '>⚡ Resposta Rápida</option><option value="script"' + (dType === 'script' ? ' selected' : '') + '>🔗 Script / Funil</option></select>'
    + '<div class="lbl">Categoria</div>'
    + '<select class="fs" id="dcat">' + catOpts + '</select>'
    + '<div class="divider"></div>'
    + '<div style="color:#e9edef;font-weight:600;font-size:12px;margin-bottom:7px;">⚙️ Ações</div>'
    + '<div id="acts-list">' + dA.map((a, i) => buildAC(a, i)).join('') + '</div>'
    + '<button class="add-act-btn" id="btn-toggle-act-menu">＋ Adicionar Ação</button>'
    + '<div class="act-menu" id="act-menu"><div class="am-sec">Enviar Mensagem</div>'
    + Object.entries(AK).filter(([k]) => ['text','image','video','audio','doc'].includes(k)).map(([k, v]) => '<div class="am-opt" data-addact="' + k + '">' + v.i + ' ' + v.l + '</div>').join('')
    + '<div class="am-sec">Temporizadores</div>'
    + Object.entries(AK).filter(([k]) => ['typing','recording','wait'].includes(k)).map(([k, v]) => '<div class="am-opt" data-addact="' + k + '">' + v.i + ' ' + v.l + '</div>').join('')
    + '</div>'
    + '<button class="btn" id="btn-save-cr" style="margin-top:14px;">💾 Salvar</button>';

  $('btn-toggle-act-menu').addEventListener('click', () => $('act-menu').classList.toggle('open'));
  $('btn-save-cr').addEventListener('click', saveCr);
  $('dtype').addEventListener('change', e => { dType = e.target.value; });
  $('dcat').addEventListener('change', e => { dCat = e.target.value; });
  $('dlabel').addEventListener('input', e => { dL = e.target.value; });
  $('act-menu').addEventListener('click', e => {
    const k = e.target.dataset.addact; if (!k) return;
    dA.push({ k, db: 3, da: 2, txt: '', fileDataUrl: null });
    $('act-menu').classList.remove('open');
    $('acts-list').innerHTML = dA.map((a, i) => buildAC(a, i)).join('');
    bindACEvents();
  });
  bindACEvents();
}

function buildAC(a, i) {
  const info = AK[a.k] || { i: '❓', l: a.k };
  const hasTxt = a.k === 'text';
  const hasFile = ['image', 'video', 'audio', 'doc'].includes(a.k);
  const filePrev = a.fileDataUrl
    ? (a.k === 'image' ? '<img src="' + a.fileDataUrl + '" style="max-width:120px;border-radius:6px;display:block;margin-top:4px;">' : '<span style="color:#aebac1;font-size:11px;">✅ ' + (a.fileName || 'arquivo') + '</span>')
    : '';
  return '<div class="ac" data-ac-idx="' + i + '">'
    + '<div class="ac-hdr"><span class="ac-ico">' + info.i + '</span><span class="ac-ttl">' + info.l + '</span><button class="ac-del" data-rmact="' + i + '">🗑</button></div>'
    + '<div class="ac-body">'
    + '<div class="tr">⏱ <input class="ti" type="number" min="0" max="60" value="' + (a.db || 3) + '" data-ac="' + i + '" data-field="db"> seg antes</div>'
    + (hasTxt ? '<textarea class="ft" style="min-height:48px;margin-bottom:6px;" placeholder="Texto... use #primeiroNome" data-ac="' + i + '" data-field="txt">' + (a.txt || '') + '</textarea>' : '')
    + (hasFile ? '<label class="add-act-btn" style="cursor:pointer;display:block;">📎 Importar ' + info.l + ' do PC<input type="file" class="hidden-file" data-ac="' + i + '" style="display:none" accept="' + (a.k === 'image' ? 'image/*' : a.k === 'video' ? 'video/*' : a.k === 'audio' ? 'audio/*' : '*') + '"></label>' + filePrev : '')
    + '<div class="tr">⏳ <input class="ti" type="number" min="0" max="60" value="' + (a.da || 2) + '" data-ac="' + i + '" data-field="da"> seg depois</div>'
    + '</div></div>';
}

function bindACEvents() {
  document.querySelectorAll('[data-rmact]').forEach(btn => {
    btn.addEventListener('click', () => {
      dA.splice(+btn.dataset.rmact, 1);
      $('acts-list').innerHTML = dA.map((a, i) => buildAC(a, i)).join('');
      bindACEvents();
    });
  });
  document.querySelectorAll('[data-ac][data-field]').forEach(el => {
    el.addEventListener('change', () => { dA[+el.dataset.ac][el.dataset.field] = el.tagName === 'INPUT' && el.type === 'number' ? +el.value : el.value; });
    if (el.tagName === 'TEXTAREA') el.addEventListener('input', () => { dA[+el.dataset.ac].txt = el.value; });
  });
  // Attach emoji pickers to all text action textareas
  document.querySelectorAll('[data-ac][data-field="txt"]').forEach(ta => {
    const i = ta.dataset.ac;
    const taId = 'ac-txt-' + i;
    ta.id = taId;
    const wrap = ta.closest('.ac-body');
    if (wrap && !wrap.querySelector('.emoji-picker-wrap')) {
      const emojiWrap = buildEmojiPicker(taId);
      emojiWrap.style.cssText = 'display:block;margin-bottom:4px;';
      ta.parentNode.insertBefore(emojiWrap, ta);
    }
  });
  document.querySelectorAll('.hidden-file').forEach(inp => {
    inp.addEventListener('change', async () => {
      const f = inp.files[0]; if (!f) return;
      const d = await new Promise((res, rej) => { const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = rej; r.readAsDataURL(f); });
      const i = +inp.dataset.ac;
      dA[i].fileDataUrl = d; dA[i].fileMime = f.type; dA[i].fileName = f.name;
      if (db) await dbSave(f, d).catch(() => {});
      $('acts-list').innerHTML = dA.map((a, j) => buildAC(a, j)).join('');
      bindACEvents();
      toast('✅ ' + f.name + ' importado!');
    });
  });
}

function saveCr() {
  dL = $('dlabel')?.value || dL;
  if (!dL) { toast('⚠️ Digite um título!', '#e74c3c'); return; }
  if (!dA.length) { toast('⚠️ Adicione ao menos 1 ação!', '#e74c3c'); return; }
  if (crEditId) { const idx = msgs.findIndex(m => m.id === crEditId); msgs[idx] = { ...msgs[idx], label: dL, cat: dCat, type: dType, actions: dA }; }
  else msgs.push({ id: Date.now(), label: dL, cat: dCat, type: dType, actions: dA });
  closeCreator(); renderMsgs(); toast('✅ "' + dL + '" salvo!');
  saveAutoBackup();
}

// ── MEDIA ─────────────────────────────────────────────────────
async function handleFiles(files) {
  if (!files || !db) return;
  for (const f of files) { const d = await new Promise((res, rej) => { const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = rej; r.readAsDataURL(f); }); await dbSave(f, d); }
  renderMedia(); updateStor(); toast('✅ ' + files.length + ' arquivo(s) importado(s)!');
}
$('drop-zone').addEventListener('click', () => $('file-inp').click());
$('file-inp').addEventListener('change', e => handleFiles(e.target.files));
$('drop-zone').addEventListener('dragover', e => { e.preventDefault(); $('drop-zone').classList.add('ov'); });
$('drop-zone').addEventListener('dragleave', () => $('drop-zone').classList.remove('ov'));
$('drop-zone').addEventListener('drop', e => { e.preventDefault(); $('drop-zone').classList.remove('ov'); handleFiles(e.dataTransfer.files); });

$('media-type-bar').addEventListener('click', e => {
  const mf = e.target.dataset.mf; if (!mf) return;
  mediaFilter = mf;
  document.querySelectorAll('.tb').forEach(b => b.classList.remove('active'));
  e.target.classList.add('active');
  renderMedia();
});

async function renderMedia() {
  const grid = $('media-grid'); if (!grid || !db) return;
  const all = await dbAll();
  const items = mediaFilter === 'all' ? all : all.filter(m => m.type === mediaFilter || (mediaFilter === 'doc' && m.type === 'application'));
  if (!items.length) { grid.innerHTML = '<div class="empty" style="grid-column:span 3"><div>📂</div>Nenhum arquivo</div>'; return; }
  grid.innerHTML = items.map(m => {
    if (m.type === 'image') return '<div class="mt" data-lb="' + m.id + '"><img src="' + m.dataUrl + '"><button class="md" data-del-media="' + m.id + '">✕</button><div class="mn">' + m.name + '</div></div>';
    if (m.type === 'video') return '<div class="mt" data-lb-v="' + m.id + '"><video src="' + m.dataUrl + '" muted></video><div class="vo">▶</div><button class="md" data-del-media="' + m.id + '">✕</button><div class="mn">' + m.name + '</div></div>';
    return '<div class="mt"><div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:22px;background:#1a3a4a;">' + (m.type === 'audio' ? '🎤' : '📄') + '</div><button class="md" data-del-media="' + m.id + '">✕</button><div class="mn">' + m.name + '</div></div>';
  }).join('');
}
$('media-grid').addEventListener('click', async e => {
  const del = e.target.dataset.delMedia; if (del) { e.stopPropagation(); await dbDel(+del); renderMedia(); updateStor(); toast('🗑 Removido', '#e74c3c'); return; }
  const lb = e.target.closest('[data-lb]')?.dataset.lb;
  if (lb) { const all = await dbAll(); const m = all.find(x => x.id == lb); if (m) { const w = window.open('', '_blank', 'width=600,height=500'); w.document.write('<body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;height:100vh;"><img src="' + m.dataUrl + '" style="max-width:100%;max-height:100%;"></body>'); } }
});
async function updateStor() {
  if (!db) return;
  const all = await dbAll();
  const mb = (all.reduce((s, m) => s + (m.size || 0), 0) / 1024 / 1024).toFixed(1);
  $('stor-used').textContent = mb + ' MB usados';
  $('stor-fill').style.width = Math.min(mb / 500 * 100, 100) + '%';
}

// ── CONTACT ───────────────────────────────────────────────────
$('btn-save-contact').addEventListener('click', () => saveC(true));
$('btn-open-note').addEventListener('click', openNoteModal);
$('btn-open-reminder').addEventListener('click', openReminderModal);
$('btn-open-sched-msg').addEventListener('click', openSchedMsgModal);
$('cc-tab').addEventListener('change', () => saveC());
$('cc-status').addEventListener('change', () => saveC());
$('btn-add-label').addEventListener('click', addLabel);
$('new-label').addEventListener('keydown', e => { if (e.key === 'Enter') addLabel(); });
document.querySelectorAll('.util-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const msgs2 = { pin: '📌 Conversa fixada!', archive: '📁 Arquivado!', unread: '✉️ Marcado como não lido!', block: '🚫 Bloqueado!' };
    toast(msgs2[btn.dataset.util] || '✅', btn.dataset.util === 'block' ? '#e74c3c' : '#00a884');
  });
});

function updateContactPanel() {
  const d = contacts[activeContact] || {};
  $('cc-av').textContent = d.av || '👤'; if (d.col) $('cc-av').style.background = d.col;
  $('cc-name').textContent = activeContact || 'Nenhum contato';
  const tab = $('cc-tab'); if (tab) tab.value = d.tab || '';
  const sts = $('cc-status'); if (sts) sts.value = d.status || '';
  const nts = $('cc-notes'); if (nts) nts.value = d.notes || '';
  const badge = $('cc-badge');
  if (d.status && SC[d.status]) { const [bg, col, txt] = SC[d.status]; badge.style.display = 'block'; badge.style.background = bg; badge.style.color = col; badge.textContent = txt; }
  else badge.style.display = 'none';
  renderContactLabels();
}
function saveC(notify = false) {
  if (!activeContact) return;
  if (!contacts[activeContact]) contacts[activeContact] = { av: '👤', col: '#2a3942', labels: [] };
  { const v = $('cc-tab')?.value || ''; const cc = contacts[activeContact]; if (v) { const tl = tabsOf(cc); if (!tl.includes(v)) tl.push(v); cc.tabs = tl; } else if (!$('cc-tab')) {} else { cc.tabs = []; } cc.tab = (cc.tabs || [])[0] || ''; }
  contacts[activeContact].status = $('cc-status')?.value || '';
  contacts[activeContact].notes = $('cc-notes')?.value || '';
  updateContactPanel();
  if (notify) toast('✅ "' + activeContact + '" salvo!');
}
function renderContactLabels() {
  const d = contacts[activeContact] || {}; const cur = d.labels || [];
  const el = $('cc-labels-cur');
  if (el) el.innerHTML = cur.length ? '<div class="tags-row">' + cur.map(l => '<span class="tag" style="background:' + LC(l) + '30;color:' + LC(l) + '" data-toggle-label="' + l + '">' + l + '<span class="tag-x">×</span></span>').join('') + '</div>' : '<div style="color:#8696a0;font-size:11px;">Sem etiquetas</div>';
  const all = $('cc-labels-all');
  if (all) all.innerHTML = '<div class="tags-row">' + labels.map(l => { const a = cur.includes(l); return '<span class="tag" style="background:' + (a ? LC(l) + '40' : '#2a3942') + ';color:' + (a ? LC(l) : '#8696a0') + '" data-toggle-label="' + l + '">' + l + '</span>'; }).join('') + '</div>';
}
document.getElementById('sec-contact').addEventListener('click', e => {
  const el = e.target.closest('[data-toggle-label]'); if (!el) return;
  toggleLabel(el.dataset.toggleLabel);
});
function setSyncStatus(b) {
  const el = $('wa-sync-status'); if (!el) return;
  if (b.ok) { el.style.color = '#00a884'; el.textContent = '✓ ' + b.labels.length + ' etiquetas do WhatsApp · ' + b.total + ' conversas etiquetadas · ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  else { el.style.color = '#e74c3c'; el.textContent = '✗ ' + (b.reason || 'não sincronizou'); }
}
function toggleLabel(l) {
  if (!activeContact) { toast('⚠️ Selecione um contato no WA', '#e74c3c'); return; }
  if (!contacts[activeContact]) contacts[activeContact] = { av: '👤', col: '#2a3942', labels: [] };
  const labs = contacts[activeContact].labels || [];
  const i = labs.indexOf(l); if (i >= 0) labs.splice(i, 1); else labs.push(l);
  contacts[activeContact].labels = labs;
  renderContactLabels();
  if (waAllLabels.includes(l)) window.parent.postMessage({ type: 'APPLY_LABEL', chat: activeContact, label: l, mode: i >= 0 ? 'remove' : 'add' }, '*');
  else toast(i >= 0 ? '🏷️ "' + l + '" removida (só no CRM)' : '🏷️ "' + l + '" adicionada (só no CRM)');
}
function addLabel() { const n = $('new-label').value.trim(); if (!n || labels.includes(n)) return; labels.push(n); $('new-label').value = ''; renderContactLabels(); toast('🏷️ "' + n + '" criada!'); }

// ── MASS SEND ─────────────────────────────────────────────────
function populateMassMsgSel() {
  const sel = $('mass-msg-sel'); if (!sel || sel.options.length) return;
  msgs.forEach(m => { const o = new Option((m.type === 'script' ? '🔗 ' : '⚡ ') + m.label, m.id); sel.add(o); });
}
$('seg-list').addEventListener('click', e => {
  const seg = e.target.dataset.seg; if (!seg) return;
  document.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
  e.target.classList.add('active');
  massFilt = [...massCPool]; renderMassList();
});
$('mass-search').addEventListener('input', () => { const q = $('mass-search').value.toLowerCase(); massFilt = massCPool.filter(c => !q || c.name.toLowerCase().includes(q) || c.num.includes(q)); renderMassList(); });
$('btn-sel-all').addEventListener('click', () => { const a = massFilt.every(c => c.sel); massFilt.forEach(c => c.sel = !a); renderMassList(); });
$('quick-sel-btns').addEventListener('click', e => {
  const d = +e.target.dataset.qs; if (!d) return;
  if (d > 0) { let n = 0; for (const c of massFilt) { if (!c.sel && n < d) { c.sel = true; n++; } } }
  else { let n = 0, t = Math.abs(d); for (const c of [...massFilt].reverse()) { if (c.sel && n < t) { c.sel = false; n++; } } }
  renderMassList();
});
$('preset-row').addEventListener('click', e => {
  const p = e.target.dataset.preset; if (!p) return;
  document.querySelectorAll('.preset').forEach(b => b.classList.remove('on')); e.target.classList.add('on');
  const pr = { safe: { min: 40, max: 90, typ: 6, typm: 14, batch: 15, pause: 8 }, balanced: { min: 20, max: 50, typ: 4, typm: 9, batch: 25, pause: 5 }, fast: { min: 8, max: 20, typ: 2, typm: 5, batch: 40, pause: 3 } }[p];
  ['min', 'max', 'typ', 'typm', 'batch', 'pause'].forEach(k => { const el = $('cfg-' + k); if (el) el.value = pr[k]; });
  toast('✅ Preset "' + { safe: '🟢 Seguro', balanced: '🟡 Balanceado', fast: '🔴 Rápido' }[p] + '" aplicado!');
});
$('btn-start-mass').addEventListener('click', startMass);
$('btn-stop-mass').addEventListener('click', () => { massStop = true; });
$('mass-list').addEventListener('click', e => { const row = e.target.closest('.cc-row'); if (!row) return; const id = +row.dataset.cid; const c = massCPool.find(x => x.id === id); if (c) { c.sel = !c.sel; renderMassList(); } });

function renderMassList() {
  $('mass-list').innerHTML = massFilt.map(c => '<div class="cc-row' + (c.sel ? ' sel' : '') + '" data-cid="' + c.id + '"><div class="chk">' + (c.sel ? '✓' : '') + '</div><div style="flex:1;min-width:0;"><div style="color:#e9edef;font-size:12px;font-weight:500;">' + c.name + '</div><div style="color:#8696a0;font-size:10px;">' + c.num + '</div></div></div>').join('');
  $('sel-count').textContent = massCPool.filter(c => c.sel).length;
}
async function startMass() {
  const sel = massCPool.filter(c => c.sel);
  if (!sel.length) { toast('⚠️ Selecione contatos!', '#e74c3c'); return; }
  const minT = +($('cfg-min')?.value || 25) * 1000, maxT = +($('cfg-max')?.value || 55) * 1000;
  const typMin = +($('cfg-typ')?.value || 4) * 1000, typMax = +($('cfg-typm')?.value || 9) * 1000;
  const batch = +($('cfg-batch')?.value || 20), pauseMs = +($('cfg-pause')?.value || 5) * 60 * 1000;
  massRunning = true; massStop = false;
  $('btn-start-mass').disabled = true;
  $('prog-wrap').classList.add('show');
  for (let i = 0; i < sel.length; i++) {
    if (massStop) break;
    const c = sel[i];
    $('prog-fill').style.width = Math.round((i + 1) / sel.length * 100) + '%';
    $('prog-nums').textContent = (i + 1) + '/' + sel.length;
    $('prog-lbl').textContent = '⌨️ Digitando para ' + c.name + '...';
    await sleep(typMin + Math.random() * (typMax - typMin));
    if (massStop) break;
    $('prog-lbl').textContent = '📤 Enviando para ' + c.name + '...';
    await sleep(minT + Math.random() * (maxT - minT));
    if ((i + 1) % batch === 0 && i + 1 < sel.length) { $('prog-lbl').textContent = '⏸ Pausa...'; await sleep(pauseMs); }
  }
  massRunning = false;
  if (!massStop) { $('prog-lbl').textContent = '✅ Concluído!'; $('prog-fill').style.width = '100%'; toast('✅ Disparo concluído — ' + sel.length + ' msgs!'); }
  else { $('prog-lbl').textContent = '⏹ Parado'; toast('⏹ Interrompido', '#e74c3c'); }
  $('btn-start-mass').disabled = false;
}

// ── AUTO ATENDIMENTO ──────────────────────────────────────────
$('btn-new-aa').addEventListener('click', openAAForm);
$('btn-close-aa').addEventListener('click', () => $('aa-form').classList.remove('open'));

function renderAAList() {
  const el = $('aa-list'); if (!el) return;
  if (!autoAtends.length) { el.innerHTML = '<div class="empty"><div>🤖</div>Nenhum auto atendimento</div>'; return; }
  el.innerHTML = autoAtends.map(a => '<div class="aa-item"><div class="aa-name">🤖 ' + a.name + '</div><div class="aa-meta"><strong>Tipo:</strong> ' + a.triggerLabel + '<br>' + (a.keywords?.length ? '<strong>Palavras:</strong> ' + a.keywords.join(', ') + '<br>' : '') + '<strong>Ações:</strong> ' + (a.actionSummary || '—') + '</div><div class="aa-foot"><label class="tog"><input type="checkbox" class="aa-toggle-inp"' + (a.active ? ' checked' : '') + ' data-aaid="' + a.id + '"><span class="tog-sl"></span></label><span class="tog-lbl">' + (a.active ? 'Ativo' : 'Inativo') + '</span><div class="aa-acts-row"><button class="aa-act-btn del" data-del-aa="' + a.id + '">🗑</button></div></div></div>').join('');
}
$('aa-list').addEventListener('change', e => { const inp = e.target.closest('.aa-toggle-inp'); if (!inp) return; const id = +inp.dataset.aaid; const a = autoAtends.find(x => x.id === id); if (a) { a.active = inp.checked; toast(a.active ? '✅ Ativado' : '⏸ Desativado'); renderAAList(); } });
$('aa-list').addEventListener('click', e => { const del = e.target.closest('[data-del-aa]'); if (!del) return; autoAtends = autoAtends.filter(x => x.id !== +del.dataset.delAa); renderAAList(); toast('🗑 Removido', '#e74c3c'); });

function openAAForm() {
  aaActions = []; aaKWs = [];
  $('aa-form').classList.add('open');
  renderAAFormBody();
}
function renderAAFormBody() {
  $('aa-form-body').innerHTML =
    // Nome
    '<div class="lbl" style="margin-top:0">Nome do Auto Atendimento</div>'
    + '<input class="fi" id="aa-name" placeholder="Insira um nome para o Auto Atendimento" style="margin-bottom:12px;">'

    // ── Acionamento (acordeão) ──
    + '<div class="aa-accord" id="acc-trigger">'
    + '<div class="aa-accord-hdr" data-acc="trigger"><span>📩 Acionamento do Auto Atendimento</span><span class="aa-chev">▼</span></div>'
    + '<div class="aa-accord-body" style="display:none;">'
    + '<div class="lbl" style="margin-top:0;">Tipo</div>'
    + '<select class="fs" id="aa-trigger" style="margin-bottom:10px;">'
    + '<option value="received">📩 Por Mensagem Recebida</option>'
    + '<option value="keyword">🔤 Por Palavra-chave</option>'
    + '<option value="first-day">📅 Primeira mensagem do dia</option>'
    + '<option value="first-ever">👤 Primeira mensagem do cliente</option>'
    + '</select>'
    + '<div id="aa-kw-area" style="display:none;">'
    + '<div class="lbl">Palavras-chave (Enter para adicionar)</div>'
    + '<div class="kw-wrap" id="kw-wrap"><input class="kw-inp" id="kw-inp" placeholder="Digite e pressione Enter..."></div>'
    + '</div>'
    + '</div></div>'

    // ── Ação (acordeão) ──
    + '<div class="aa-accord" id="acc-action">'
    + '<div class="aa-accord-hdr" data-acc="action"><span>⚙️ Ação</span><span class="aa-chev">▼</span></div>'
    + '<div class="aa-accord-body" style="display:none;">'
    + '<div id="aa-acts-list"></div>'
    + '<button class="add-act-btn" id="aa-toggle-act-menu">＋ Adicionar Ação</button>'
    + '<div class="act-menu" id="aa-act-menu">'
    + Object.entries(AK).map(([k, v]) => '<div class="am-opt" data-addaact="' + k + '">' + v.i + ' ' + v.l + '</div>').join('')
    + '</div>'
    + '</div></div>'

    // ── Regras de Acionamento (acordeão — aberto por padrão) ──
    + '<div class="aa-accord" id="acc-rules">'
    + '<div class="aa-accord-hdr" data-acc="rules"><span>📋 Regras de Acionamento</span><span class="aa-chev">▲</span></div>'
    + '<div class="aa-accord-body" id="acc-rules-body">'

    // Gerais
    + '<div class="aa-rules-section-title">⚙️ Gerais</div>'
    + '<label class="aa-rule-chk"><input type="checkbox" id="aa-r-grupos"> <span>Permitir responder em grupos</span></label>'
    + '<label class="aa-rule-chk"><input type="checkbox" id="aa-r-horario"> <span>Permitir respostas apenas em dias e horários determinados</span></label>'
    + '<div id="aa-horario-config" style="display:none;background:#161d22;border-radius:8px;padding:10px;margin:6px 0 4px;">'
    + '<div class="lbl" style="margin-top:0;">Dias da semana</div>'
    + '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;">'
    + ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map((d,i) => '<label style="display:flex;align-items:center;gap:4px;font-size:11px;color:#e9edef;cursor:pointer;"><input type="checkbox" data-day="' + i + '" checked> ' + d + '</label>').join('')
    + '</div>'
    + '<div class="lbl">Horário</div>'
    + '<div style="display:flex;gap:8px;align-items:center;">'
    + '<input class="fi" type="time" id="aa-hora-ini" value="08:00" style="flex:1;">'
    + '<span style="color:#8696a0;font-size:12px;">até</span>'
    + '<input class="fi" type="time" id="aa-hora-fim" value="18:00" style="flex:1;">'
    + '</div>'
    + '</div>'
    + '<label class="aa-rule-chk"><input type="checkbox" id="aa-r-aberta" checked> <span>Não responder se a conversa estiver aberta</span></label>'
    + '<label class="aa-rule-chk"><input type="checkbox" id="aa-r-arquivada"> <span>Não responder se a conversa estiver arquivada</span></label>'
    + '<label class="aa-rule-chk"><input type="checkbox" id="aa-r-assinatura"> <span>Personalizar ou desativar a assinatura</span></label>'
    + '<div id="aa-assinatura-config" style="display:none;margin:4px 0 4px;">'
    + '<textarea class="ft" id="aa-assinatura-txt" placeholder="Texto da assinatura (deixe vazio para desativar)..." style="min-height:45px;"></textarea>'
    + '</div>'

    // CRM
    + '<div class="aa-rules-section-title" style="margin-top:10px;">📋 CRM</div>'
    + '<label class="aa-rule-radio"><input type="radio" name="aa-crm-rule" value="none" checked> <span>Sem restrição de CRM</span></label>'
    + '<label class="aa-rule-radio"><input type="radio" name="aa-crm-rule" value="not-in-crm"> <span>Não responder se o contato estiver em um CRM</span></label>'
    + '<label class="aa-rule-radio"><input type="radio" name="aa-crm-rule" value="not-crms"> <span>Não responder os CRMs</span></label>'
    + '<label class="aa-rule-radio"><input type="radio" name="aa-crm-rule" value="only-crms"> <span>Responder apenas os CRMs</span></label>'
    // Sub-seletor de quais abas/CRMs
    + '<div id="aa-crm-tabs-sel" style="display:none;margin:4px 0 4px;">'
    + '<div class="lbl" style="margin-top:0;">Selecione as abas/CRMs:</div>'
    + '<div style="display:flex;flex-direction:column;gap:4px;">'
    + crmTabs.map(t => '<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#e9edef;cursor:pointer;"><input type="checkbox" data-crm-tab="' + t + '" checked> ' + t + '</label>').join('')
    + '</div></div>'

    // Etiquetas
    + '<div class="aa-rules-section-title" style="margin-top:10px;">🏷️ Etiquetas</div>'
    + '<label class="aa-rule-radio"><input type="radio" name="aa-label-rule" value="none" checked> <span>Sem restrição de etiqueta</span></label>'
    + '<label class="aa-rule-radio"><input type="radio" name="aa-label-rule" value="not-labeled"> <span>Não responder se o contato estiver etiquetado</span></label>'
    + '<label class="aa-rule-radio"><input type="radio" name="aa-label-rule" value="not-labels"> <span>Não responder as etiquetas</span></label>'
    + '<label class="aa-rule-radio"><input type="radio" name="aa-label-rule" value="only-labels"> <span>Responder apenas as etiquetas</span></label>'
    // Sub-seletor de quais etiquetas
    + '<div id="aa-labels-sel" style="display:none;margin:4px 0 4px;">'
    + '<div class="lbl" style="margin-top:0;">Selecione as etiquetas:</div>'
    + '<div style="display:flex;flex-wrap:wrap;gap:4px;">'
    + labels.map(l => '<label style="display:flex;align-items:center;gap:4px;font-size:11px;color:#e9edef;cursor:pointer;"><input type="checkbox" data-label-sel="' + l + '" checked> ' + l + '</label>').join('')
    + '</div></div>'

    + '</div></div>' // fecha acc-rules

    // Botões
    + '<button class="btn" id="btn-save-aa" style="margin-top:14px;">✅ Criar Auto Atendimento</button>'
    + '<button class="btn outline" id="btn-cancel-aa" style="margin-top:6px;">Cancelar</button>';

  // ── Eventos dos acordeões ──
  $('aa-form-body').querySelectorAll('.aa-accord-hdr').forEach(hdr => {
    hdr.addEventListener('click', () => {
      const body = hdr.nextElementSibling;
      const chev = hdr.querySelector('.aa-chev');
      const open = body.style.display !== 'none';
      body.style.display = open ? 'none' : 'block';
      chev.textContent = open ? '▼' : '▲';
    });
  });
  // Abre "Regras" por padrão
  document.getElementById('acc-rules-body').style.display = 'block';

  // ── Tipo de acionamento ──
  $('aa-trigger').addEventListener('change', e => {
    $('aa-kw-area').style.display = e.target.value === 'keyword' ? '' : 'none';
  });

  // ── Horário config ──
  $('aa-r-horario').addEventListener('change', e => {
    $('aa-horario-config').style.display = e.target.checked ? '' : 'none';
  });

  // ── Assinatura config ──
  $('aa-r-assinatura').addEventListener('change', e => {
    $('aa-assinatura-config').style.display = e.target.checked ? '' : 'none';
  });

  // ── CRM rule sub-selector ──
  $('aa-form-body').querySelectorAll('input[name="aa-crm-rule"]').forEach(r => {
    r.addEventListener('change', () => {
      const v = $('aa-form-body').querySelector('input[name="aa-crm-rule"]:checked')?.value || 'none';
      $('aa-crm-tabs-sel').style.display = ['not-crms','only-crms'].includes(v) ? '' : 'none';
    });
  });

  // ── Label rule sub-selector ──
  $('aa-form-body').querySelectorAll('input[name="aa-label-rule"]').forEach(r => {
    r.addEventListener('change', () => {
      const v = $('aa-form-body').querySelector('input[name="aa-label-rule"]:checked')?.value || 'none';
      $('aa-labels-sel').style.display = ['not-labels','only-labels'].includes(v) ? '' : 'none';
    });
  });

  // ── KW ──
  $('kw-inp').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const v = e.target.value.trim().toLowerCase();
    if (!v || aaKWs.includes(v)) return;
    aaKWs.push(v); e.target.value = ''; renderKWs();
  });

  // ── Action menu ──
  $('aa-toggle-act-menu').addEventListener('click', () => $('aa-act-menu').classList.toggle('open'));
  $('aa-act-menu').addEventListener('click', e => {
    const k = e.target.dataset.addaact; if (!k) return;
    aaActions.push({ k, db: 3, da: 2, txt: '' });
    $('aa-act-menu').classList.remove('open');
    $('aa-acts-list').innerHTML = aaActions.map((a, i) => buildAC2(a, i)).join('');
    bindAC2Events();
  });

  $('btn-save-aa').addEventListener('click', saveAA);
  $('btn-cancel-aa').addEventListener('click', () => $('aa-form').classList.remove('open'));
}
function buildAC2(a, i) {
  const info = AK[a.k] || { i: '❓', l: a.k };
  return '<div class="ac"><div class="ac-hdr"><span class="ac-ico">' + info.i + '</span><span class="ac-ttl">' + info.l + '</span><button class="ac-del" data-rmac2="' + i + '">🗑</button></div><div class="ac-body"><div class="tr">⏱ <input class="ti" type="number" value="' + (a.db || 3) + '" data-aac="' + i + '" data-f="db"> seg antes</div>' + (a.k === 'text' ? '<textarea class="ft" style="min-height:48px;margin-bottom:6px;" placeholder="Texto..." data-aac="' + i + '" data-f="txt">' + (a.txt || '') + '</textarea>' : '') + '<div class="tr">⏳ <input class="ti" type="number" value="' + (a.da || 2) + '" data-aac="' + i + '" data-f="da"> seg depois</div></div></div>';
}
function bindAC2Events() {
  document.querySelectorAll('[data-rmac2]').forEach(btn => { btn.addEventListener('click', () => { aaActions.splice(+btn.dataset.rmac2, 1); $('aa-acts-list').innerHTML = aaActions.map((a, i) => buildAC2(a, i)).join(''); bindAC2Events(); }); });
  document.querySelectorAll('[data-aac][data-f]').forEach(el => { const handler = () => { aaActions[+el.dataset.aac][el.dataset.f] = el.type === 'number' ? +el.value : el.value; }; el.addEventListener('change', handler); if (el.tagName === 'TEXTAREA') el.addEventListener('input', handler); });
}
function renderKWs() {
  const wrap = $('kw-wrap'); const inp = $('kw-inp'); if (!wrap) return;
  wrap.innerHTML = ''; aaKWs.forEach(w => { const s = document.createElement('span'); s.className = 'kw-tag'; const x = document.createElement('span'); x.className = 'kw-x'; x.textContent = '×'; x.addEventListener('click', () => { aaKWs = aaKWs.filter(k => k !== w); renderKWs(); }); s.textContent = w; s.appendChild(x); wrap.appendChild(s); }); wrap.appendChild(inp);
}
function saveAA() {
  const name = $('aa-name')?.value.trim(); if (!name) { toast('⚠️ Insira um nome!', '#e74c3c'); return; }
  if (!aaActions.length) { toast('⚠️ Adicione ao menos 1 ação!', '#e74c3c'); return; }
  const trigger = $('aa-trigger')?.value || 'received';
  const tL = { received: 'Por Mensagem Recebida', keyword: 'Por Palavra-chave', 'first-day': 'Primeira msg no dia', 'first-ever': 'Primeira msg do cliente' };
  const actionSummary = aaActions.map(a => (AK[a.k]?.i || '❓') + ' ' + (AK[a.k]?.l || a.k)).join(' → ');

  // Collect all rules
  const rules = [];
  if ($('aa-r-grupos')?.checked) rules.push('Responder em grupos');
  if ($('aa-r-aberta')?.checked) rules.push('Não responder se conversa aberta');
  if ($('aa-r-arquivada')?.checked) rules.push('Não responder se arquivada');
  if ($('aa-r-assinatura')?.checked) rules.push('Assinatura personalizada: ' + ($('aa-assinatura-txt')?.value || '(desativada)'));

  const horario = $('aa-r-horario')?.checked;
  if (horario) {
    const ini = $('aa-hora-ini')?.value || '08:00', fim = $('aa-hora-fim')?.value || '18:00';
    const dias = [...document.querySelectorAll('[data-day]:checked')].map(el => ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'][+el.dataset.day]);
    rules.push('Horário: ' + ini + '–' + fim + ' (' + dias.join(', ') + ')');
  }

  const crmRule = document.querySelector('input[name="aa-crm-rule"]:checked')?.value || 'none';
  if (crmRule !== 'none') {
    const crmL = { 'not-in-crm': 'Não resp se em CRM', 'not-crms': 'Não resp CRMs', 'only-crms': 'Apenas CRMs' };
    const selTabs = [...document.querySelectorAll('[data-crm-tab]:checked')].map(el => el.dataset.crmTab);
    rules.push(crmL[crmRule] + (selTabs.length ? ': ' + selTabs.join(', ') : ''));
  }

  const labelRule = document.querySelector('input[name="aa-label-rule"]:checked')?.value || 'none';
  if (labelRule !== 'none') {
    const lbL = { 'not-labeled': 'Não resp se etiquetado', 'not-labels': 'Não resp etiquetas', 'only-labels': 'Apenas etiquetas' };
    const selLabels = [...document.querySelectorAll('[data-label-sel]:checked')].map(el => el.dataset.labelSel);
    rules.push(lbL[labelRule] + (selLabels.length ? ': ' + selLabels.join(', ') : ''));
  }

  autoAtends.push({
    id: Date.now(), name, trigger, triggerLabel: tL[trigger] || trigger,
    actions: JSON.parse(JSON.stringify(aaActions)), actionSummary,
    active: true, rules, keywords: [...aaKWs],
    config: { crmRule, labelRule, horario, horarioIni: $('aa-hora-ini')?.value, horarioFim: $('aa-hora-fim')?.value }
  });
  $('aa-form').classList.remove('open'); renderAAList(); toast('✅ "' + name + '" criado!');
  saveAutoBackup();
}

// ── FOLLOW UP ─────────────────────────────────────────────────
$('btn-new-fu').addEventListener('click', openFUForm);
$('btn-close-fu').addEventListener('click', () => $('fu-form').classList.remove('open'));

function renderFUList() {
  const el = $('fu-list'); if (!el) return;
  if (!followUps.length) { el.innerHTML = '<div class="empty"><div>🔔</div>Nenhum follow up</div>'; return; }
  el.innerHTML = followUps.map(f => '<div class="fu-item"><div style="color:#e9edef;font-weight:600;font-size:12px;margin-bottom:4px;">🔔 ' + f.name + '</div><div class="fu-badge">' + (f.trigger === 'notify' ? '🔔 Notificação Manual' : '⚡ Auto') + '</div><div style="color:#8696a0;font-size:11px;line-height:1.6;margin-bottom:7px;"><strong style="color:#aebac1;">Funil:</strong> <span class="fu-tag">' + (f.funil || '—') + '</span><br><strong style="color:#aebac1;">Variações:</strong> ' + (f.variations?.length || 0) + '</div><div class="aa-foot"><label class="tog"><input type="checkbox" class="fu-toggle-inp"' + (f.active ? ' checked' : '') + ' data-fuid="' + f.id + '"><span class="tog-sl"></span></label><span class="tog-lbl">' + (f.active ? 'Ativo' : 'Inativo') + '</span><div class="aa-acts-row"><button class="aa-act-btn" data-test-fu="' + f.id + '">🔔 Testar</button><button class="aa-act-btn del" data-del-fu="' + f.id + '">🗑</button></div></div></div>').join('');
}
$('fu-list').addEventListener('change', e => { const inp = e.target.closest('.fu-toggle-inp'); if (!inp) return; const f = followUps.find(x => x.id === +inp.dataset.fuid); if (f) { f.active = inp.checked; toast(f.active ? '✅ Ativado' : '⏸ Desativado'); renderFUList(); } });
$('fu-list').addEventListener('click', e => {
  const del = e.target.closest('[data-del-fu]'); if (del) { followUps = followUps.filter(x => x.id !== +del.dataset.delFu); renderFUList(); toast('🗑 Removido', '#e74c3c'); return; }
  const test = e.target.closest('[data-test-fu]'); if (test) { testFUNotif(+test.dataset.testFu); }
});

function openFUForm() {
  fuVars = [...FU_VARS_DEF];
  $('fu-form').classList.add('open');
  renderFUFormBody();
}
function renderFUFormBody() {
  const funilOpts = [...crmTabs, ...labels.map(l => '🏷️ ' + l)].map(t => '<option>' + t + '</option>').join('');
  $('fu-form-body').innerHTML = '<div class="lbl" style="margin-top:0">Nome</div>'
    + '<input class="fi" id="fu-name" placeholder="Ex: Follow UP automático" style="margin-bottom:10px;">'
    + '<div class="lbl">Funil / Aba / Etiqueta</div>'
    + '<select class="fs" id="fu-funil" style="margin-bottom:10px;"><option value="">Selecione...</option>' + funilOpts + '</select>'
    + '<div class="lbl">Acionamento</div>'
    + '<select class="fs" id="fu-trigger" style="margin-bottom:8px;"><option value="notify">🔔 Notificar para enviar manualmente (Recomendado)</option><option value="enter">⚡ Ao entrar no funil</option><option value="exit">🚪 Ao sair do funil</option><option value="time">⏳ Após tempo definido</option></select>'
    + '<div id="fu-trigger-fields"></div>'
    + '<div class="divider"></div>'
    + '<div style="color:#e9edef;font-weight:600;font-size:12px;margin-bottom:7px;">💬 Variações de Mensagem</div>'
    + '<div class="info-box"><strong>ℹ️ Anti-repetição:</strong> alterna entre variações automaticamente. Use <strong style="color:#00a884;">#primeiroNome</strong> para personalizar!</div>'
    + '<div id="fu-vars-list"></div>'
    + '<button class="add-act-btn" id="btn-add-fu-var">＋ Adicionar variação</button>'
    + '<button class="btn" id="btn-save-fu" style="margin-top:12px;">✅ Criar</button>'
    + '<button class="btn outline" id="btn-cancel-fu" style="margin-top:6px;">Cancelar</button>';

  renderFUVars();
  $('fu-trigger').addEventListener('change', renderFUTriggerFields);
  $('btn-add-fu-var').addEventListener('click', () => { fuVars.push(''); renderFUVars(); });
  $('btn-save-fu').addEventListener('click', saveFU);
  $('btn-cancel-fu').addEventListener('click', () => $('fu-form').classList.remove('open'));
  renderFUTriggerFields();
}
function renderFUTriggerFields() {
  const trigger = $('fu-trigger')?.value || 'notify';
  const el = $('fu-trigger-fields'); if (!el) return;
  if (trigger === 'notify' || trigger === 'time') {
    el.innerHTML = '<div class="lbl">Disparar após</div><div class="time-inp"><div class="t-unit"><input type="number" id="fu-d" value="0" min="0"><label>dias</label></div><div class="t-unit"><input type="number" id="fu-h" value="23" min="0" max="23"><label>horas</label></div><div class="t-unit"><input type="number" id="fu-m" value="5" min="0" max="59"><label>min</label></div></div>'
      + (trigger === 'notify' ? '<div class="lbl" style="margin-top:10px;">Intervalo entre notificações</div><div class="time-inp"><div class="t-unit"><input type="number" id="fu-interval" value="3" min="1"><label>min entre avisos</label></div></div>' : '');
  } else el.innerHTML = '';
}
function renderFUVars() {
  const el = $('fu-vars-list'); if (!el) return;
  el.innerHTML = fuVars.map((v, i) => {
    const div = document.createElement('div'); div.className = 'var-card';
    div.innerHTML = '<span class="var-num">' + (i + 1) + '</span><textarea placeholder="Variação ' + (i + 1) + '... use #primeiroNome" data-fuvar="' + i + '">' + v + '</textarea><div class="var-foot"><button class="add-act-btn" style="width:auto;padding:3px 8px;font-size:10px;" data-insert-nome="' + i + '"># primeiroNome</button>' + (fuVars.length > 1 ? '<button style="background:none;border:none;color:#8696a0;cursor:pointer;font-size:12px;" data-rm-var="' + i + '">🗑</button>' : '') + '</div>';
    return div.outerHTML;
  }).join('');
  $('fu-vars-list').querySelectorAll('[data-fuvar]').forEach(ta => {
    ta.addEventListener('input', e => { fuVars[+ta.dataset.fuvar] = e.target.value; });
    // Emoji picker
    const taId = 'fuvar-ta-' + ta.dataset.fuvar;
    ta.id = taId;
    const emojiWrap = buildEmojiPicker(taId);
    emojiWrap.style.cssText = 'display:block;margin-bottom:4px;';
    ta.parentNode.insertBefore(emojiWrap, ta);
  });
  $('fu-vars-list').querySelectorAll('[data-insert-nome]').forEach(btn => { btn.addEventListener('click', () => { const i = +btn.dataset.insertNome; fuVars[i] += ' #primeiroNome'; renderFUVars(); }); });
  $('fu-vars-list').querySelectorAll('[data-rm-var]').forEach(btn => { btn.addEventListener('click', () => { fuVars.splice(+btn.dataset.rmVar, 1); renderFUVars(); }); });
}
function saveFU() {
  const name = $('fu-name')?.value.trim(); if (!name) { toast('⚠️ Insira um nome!', '#e74c3c'); return; }
  const funil = $('fu-funil')?.value; if (!funil) { toast('⚠️ Selecione um funil!', '#e74c3c'); return; }
  const trigger = $('fu-trigger')?.value || 'notify';
  const tL = { notify: 'Notificação Manual', enter: 'Ao entrar no funil', exit: 'Ao sair do funil', time: 'Após tempo definido' };
  const vars = fuVars.filter(v => v.trim()); if (!vars.length) { toast('⚠️ Adicione ao menos uma mensagem!', '#e74c3c'); return; }
  followUps.push({ id: Date.now(), name, trigger, triggerLabel: tL[trigger] || trigger, funil, days: +($('fu-d')?.value || 0), hours: +($('fu-h')?.value || 23), mins: +($('fu-m')?.value || 5), notifInterval: +($('fu-interval')?.value || 3), active: true, variations: vars });
  $('fu-form').classList.remove('open'); renderFUList(); toast('✅ "' + name + '" criado!');
}

// FU NOTIFICATIONS
let notifQueue = [], notifTimerActive = false;
function testFUNotif(id) {
  const fu = followUps.find(x => x.id === id); if (!fu) return;
  const contact = activeContact || 'Contato Teste';
  const varIdx = notifQueue.length % fu.variations.length;
  notifQueue.push({ fuName: fu.name, contact, msg: applyNome(fu.variations[varIdx], contact) });
  toast('🔔 Notificação na fila!');
  if (!notifTimerActive) showNextNotif();
}
function showNextNotif() {
  if (!notifQueue.length) { notifTimerActive = false; return; }
  notifTimerActive = true;
  const item = notifQueue.shift();
  const id = 'n' + Date.now();
  const card = document.createElement('div');
  card.className = 'notif'; card.id = id;
  card.innerHTML = '<div class="n-hdr"><span class="n-badge">🔔 ' + item.fuName + '</span><button class="n-x" data-dismiss="' + id + '">✕</button></div><div class="n-name">👤 ' + item.contact + '</div><div class="n-msg">' + item.msg.replace(/\n/g, '<br>') + '</div><div class="n-btns"><button class="n-open" data-notif-open="' + id + '" data-notif-contact="' + encodeURIComponent(item.contact) + '" data-notif-msg="' + encodeURIComponent(item.msg) + '">💬 Abrir e copiar</button><button class="n-skip" data-dismiss="' + id + '">Pular</button></div>';
  $('notifs').appendChild(card);
  setTimeout(() => dismissNotif(id), 30000);
}
$('notifs').addEventListener('click', e => {
  const dis = e.target.dataset.dismiss; if (dis) { dismissNotif(dis); return; }
  const open = e.target.dataset.notifOpen;
  if (open) {
    const contact = decodeURIComponent(e.target.dataset.notifContact);
    const msg = decodeURIComponent(e.target.dataset.notifMsg);
    dismissNotif(open);
    window.parent.postMessage({ type: 'OPEN_CONTACT', contact }, '*');
    setTimeout(() => window.parent.postMessage({ type: 'PREFILL', text: msg }, '*'), 1000);
    toast('💬 Abrindo conversa de ' + contact + '...');
  }
});
function dismissNotif(id) { const el = $(id); if (!el) return; el.classList.add('out'); setTimeout(() => { el.remove(); setTimeout(showNextNotif, 500); }, 250); }

// ── STATUS ─────────────────────────────────────────────────────
function initStatus() {
  renderBGPicker(); updateSTPrev();
  const di = $('st-date'); if (di && !di.value) di.value = new Date().toISOString().split('T')[0];
  renderSchedSTList(); renderHistList();
}
document.getElementById('status-nav').addEventListener('click', e => {
  const tab = e.target.dataset.stab; if (!tab) return;
  document.querySelectorAll('#status-nav .mtab').forEach(t => t.classList.remove('active')); e.target.classList.add('active');
  ['new', 'sched', 'hist'].forEach(t => { const el = $('stab-' + t); if (el) el.style.display = t === tab ? 'block' : 'none'; });
  if (tab === 'sched') renderSchedSTList(); if (tab === 'hist') renderHistList();
});
$('st-types').addEventListener('click', e => {
  const type = e.target.dataset.stype; if (!type) return;
  stType = type; stFileUrl = null;
  document.querySelectorAll('.st-btn').forEach(b => b.classList.remove('active')); e.target.classList.add('active');
  $('st-media-area').style.display = ['image', 'video'].includes(type) ? '' : 'none';
  $('st-link-area').style.display = type === 'link' ? '' : 'none';
  $('st-bg-area').style.display = type === 'text' ? '' : 'none';
  $('st-text-lbl').textContent = type === 'link' ? 'Descrição' : type === 'text' ? 'Texto do status' : 'Legenda (opcional)';
  $('st-drop-ico').textContent = type === 'video' ? '🎥' : '🖼️';
  updateSTPrev();
});
$('st-drop').addEventListener('click', () => $('st-file-inp').click());
$('st-file-inp').addEventListener('change', e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => { stFileUrl = ev.target.result; updateSTPrev(); }; r.readAsDataURL(f); });
$('st-text').addEventListener('input', () => { $('st-chars').textContent = $('st-text').value.length; updateSTPrev(); });
$('st-url').addEventListener('input', updateSTPrev);
// Emoji picker for status text
(function() {
  const ta = $('st-text');
  if (ta) { const ew = buildEmojiPicker('st-text'); ew.style.cssText = 'display:block;margin-bottom:4px;'; ta.parentNode.insertBefore(ew, ta); }
})();
$('aud-row').addEventListener('click', e => { const aud = e.target.dataset.aud; if (!aud) return; stAud = aud; document.querySelectorAll('.aud-btn').forEach(b => b.classList.remove('active')); e.target.classList.add('active'); });
$('st-sch-toggle').addEventListener('click', () => {
  stSched = !stSched;
  $('st-sch-toggle').classList.toggle('on', stSched);
  $('st-dt').classList.toggle('show', stSched);
  $('st-sch-chk').textContent = stSched ? '✅' : '○';
  $('btn-post-status').textContent = stSched ? '🕐 Agendar Publicação' : '🟢 Publicar Agora';
  $('btn-post-status').className = 'btn' + (stSched ? ' blue' : '');
});
$('btn-post-status').addEventListener('click', postStatus);

function renderBGPicker() { $('bg-row').innerHTML = BG_COLORS.map(c => '<div class="bg-sw' + (c === stBg ? ' on' : '') + '" style="background:' + c + '" data-bg="' + c + '"></div>').join(''); }
$('bg-row').addEventListener('click', e => { const bg = e.target.dataset.bg; if (!bg) return; stBg = bg; renderBGPicker(); updateSTPrev(); });
function updateSTPrev() {
  const ph = $('ph-in'); if (!ph) return;
  const text = $('st-text')?.value || '';
  if (['image', 'video'].includes(stType) && stFileUrl) { ph.innerHTML = stType === 'video' ? '<video src="' + stFileUrl + '" muted autoplay loop style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;"></video>' + (text ? '<div class="ph-ovl">' + text + '</div>' : '') : '<img src="' + stFileUrl + '" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;">' + (text ? '<div class="ph-ovl">' + text + '</div>' : ''); }
  else if (stType === 'text') ph.innerHTML = '<div style="position:absolute;inset:0;background:' + stBg + ';display:flex;align-items:center;justify-content:center;padding:10px;"><span style="color:white;font-size:11px;font-weight:600;text-align:center;line-height:1.4;word-break:break-word;">' + (text || 'Texto do status') + '</span></div>';
  else ph.innerHTML = '<span style="color:#8696a0;font-size:10px;">Pré-visualização</span>';
}
function postStatus() {
  const text = $('st-text')?.value || '';
  if (stType === 'text' && !text.trim()) { toast('⚠️ Digite o texto!', '#e74c3c'); return; }
  if (['image', 'video'].includes(stType) && !stFileUrl) { toast('⚠️ Selecione um arquivo!', '#e74c3c'); return; }
  if (stSched) {
    const date = $('st-date')?.value, time = $('st-time')?.value || '09:00';
    if (!date) { toast('⚠️ Selecione a data!', '#e74c3c'); return; }
    scheduledStatuses.push({ id: Date.now(), type: stType, text, bg: stBg, date, time, aud: stAud });
    renderSchedSTList();
    document.querySelectorAll('#status-nav .mtab').forEach(t => t.classList.remove('active'));
    document.querySelector('#status-nav [data-stab="sched"]').classList.add('active');
    ['new', 'sched', 'hist'].forEach(t => { $('stab-' + t).style.display = t === 'sched' ? 'block' : 'none'; });
    toast('🕐 Status agendado!');
  } else {
    statusHistory.unshift({ id: Date.now(), type: stType, text, bg: stBg, postedAt: new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }), views: 0 });
    renderHistList();
    document.querySelectorAll('#status-nav .mtab').forEach(t => t.classList.remove('active'));
    document.querySelector('#status-nav [data-stab="hist"]').classList.add('active');
    ['new', 'sched', 'hist'].forEach(t => { $('stab-' + t).style.display = t === 'hist' ? 'block' : 'none'; });
    toast('✅ Status publicado!'); $('st-text').value = ''; stFileUrl = null; updateSTPrev();
  }
}
function renderSchedSTList() {
  const el = $('sched-st-list'); if (!el) return;
  if (!scheduledStatuses.length) { el.innerHTML = '<div class="empty"><div>🕐</div>Nenhum status agendado</div>'; return; }
  el.innerHTML = scheduledStatuses.map(s => '<div class="si"><div class="si-ico">' + ({ text: '📝', image: '🖼️', video: '🎥', link: '🔗' }[s.type] || '📝') + '</div><div class="si-info"><div class="si-title">' + (s.text || '(sem texto)') + '</div></div><div class="si-time">' + formatD(s.date) + ' ' + s.time + '</div><button class="si-del" data-del-st="' + s.id + '">🗑</button></div>').join('');
}
function renderHistList() {
  const el = $('hist-st-list'); if (!el) return;
  if (!statusHistory.length) { el.innerHTML = '<div class="empty"><div>📋</div>Nenhum status ainda</div>'; return; }
  el.innerHTML = statusHistory.map(s => '<div style="display:flex;align-items:center;gap:10px;padding:10px;border-bottom:1px solid #1a2830;"><div style="width:36px;height:36px;border-radius:8px;background:' + (s.bg || '#202c33') + ';display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">' + ({ text: '📝', image: '🖼️', video: '🎥', link: '🔗' }[s.type] || '📝') + '</div><div style="flex:1;min-width:0;"><div style="color:#e9edef;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (s.text || '(sem texto)') + '</div><div style="color:#8696a0;font-size:10px;margin-top:2px;">🕐 ' + s.postedAt + '</div></div><div style="color:#00a884;font-size:11px;font-weight:600;">👁 ' + s.views + '</div></div>').join('');
}
document.getElementById('stab-sched').addEventListener('click', e => { const del = e.target.dataset.delSt; if (!del) return; scheduledStatuses = scheduledStatuses.filter(x => x.id !== +del); renderSchedSTList(); toast('🗑 Removido', '#e74c3c'); });

// ── SCHED LIST ────────────────────────────────────────────────
function renderSchedList() {
  const el = $('sched-list'); if (!el) return;
  if (!scheduledItems.length) { el.innerHTML = '<div class="empty"><div>🕐</div>Nenhum agendamento</div>'; return; }
  el.innerHTML = scheduledItems.map(s => '<div class="si"><div class="si-ico">📅</div><div class="si-info"><div class="si-title">' + s.label + '</div></div><div class="si-time">' + s.dt + '</div><button class="si-del" data-del-sched="' + s.id + '">🗑</button></div>').join('');
}
$('sched-list').addEventListener('click', e => { const del = e.target.dataset.delSched; if (!del) return; scheduledItems = scheduledItems.filter(x => x.id !== +del); renderSchedList(); toast('🗑 Removido', '#e74c3c'); });

// ── NOTES PER CONTACT ─────────────────────────────────────────
// Notes are stored in contacts[name].notes as array

function openNoteModal() {
  $('note-modal').classList.add('open');
  renderNoteBody();
}
$('btn-close-note').addEventListener('click', () => $('note-modal').classList.remove('open'));

function renderNoteBody() {
  const name = activeContact || '';
  const d = contacts[name] || {};
  const notesList = Array.isArray(d.notesList) ? d.notesList : (d.notes ? [{ id: Date.now(), text: d.notes, date: 'Importado', media: null }] : []);
  $('note-body').innerHTML =
    '<div class="lbl" style="margin-top:0">Anotações de ' + (name || 'contato') + '</div>'
    + '<div id="notes-list" style="margin-bottom:12px;">'
    + (notesList.length ? notesList.map(n =>
        '<div style="background:#202c33;border-radius:8px;padding:10px;margin-bottom:6px;border:1px solid #2a3942;">'
        + '<div style="color:#8696a0;font-size:10px;margin-bottom:4px;">📅 ' + n.date + '</div>'
        + (n.media ? '<img src="' + n.media + '" style="max-width:100%;border-radius:6px;margin-bottom:6px;display:block;">' : '')
        + '<div style="color:#e9edef;font-size:12px;line-height:1.5;">' + n.text.replace(/\n/g, '<br>') + '</div>'
        + '<div style="text-align:right;margin-top:6px;"><button style="background:#e74c3c20;color:#e74c3c;border:none;border-radius:5px;padding:3px 8px;font-size:10px;cursor:pointer;" data-del-note="' + n.id + '">🗑 Remover</button></div>'
        + '</div>'
      ).join('') : '<div class="empty"><div>📝</div>Nenhuma anotação ainda</div>')
    + '</div>'
    + '<div class="lbl">Nova anotação</div>'
    + '<div class="drop" id="note-media-drop" style="margin-bottom:8px;padding:10px;">'
    + '  <div style="font-size:18px;">📎</div>'
    + '  <p style="color:#8696a0;font-size:11px;">Clique para adicionar mídia (opcional)</p>'
    + '  <input type="file" id="note-media-inp" accept="image/*" style="display:none">'
    + '</div>'
    + '<div id="note-media-prev"></div>'
    + '<textarea class="ft" id="note-text" placeholder="Escreva sua anotação..." style="min-height:80px;margin-bottom:8px;"></textarea>'
    + '<button class="btn" id="btn-save-note">💾 Salvar Anotação</button>';

  let noteMediaUrl = null;
  $('note-media-drop').addEventListener('click', () => $('note-media-inp').click());
  $('note-media-inp').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader(); r.onload = ev => {
      noteMediaUrl = ev.target.result;
      $('note-media-prev').innerHTML = '<img src="' + noteMediaUrl + '" style="max-width:100%;border-radius:8px;margin-bottom:8px;">';
    }; r.readAsDataURL(f);
  });
  $('btn-save-note').addEventListener('click', () => {
    const text = $('note-text').value.trim();
    if (!text) { toast('⚠️ Escreva uma anotação!', '#e74c3c'); return; }
    if (!contacts[name]) contacts[name] = { av: '👤', col: '#2a3942', labels: [] };
    if (!Array.isArray(contacts[name].notesList)) contacts[name].notesList = [];
    contacts[name].notesList.unshift({ id: Date.now(), text, date: new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }), media: noteMediaUrl });
    contacts[name].notes = text; // compat
    toast('✅ Anotação salva!');
    renderNoteBody();
    saveAutoBackup();
  });
  // Emoji picker for note text
  const noteTA = $('note-text');
  if (noteTA) {
    noteTA.id = 'note-text';
    const ew = buildEmojiPicker('note-text');
    ew.style.cssText = 'display:block;margin-bottom:4px;';
    noteTA.parentNode.insertBefore(ew, noteTA);
  }
  $('notes-list').addEventListener('click', e => {
    const id = e.target.dataset.delNote; if (!id) return;
    if (!contacts[name]) return;
    contacts[name].notesList = (contacts[name].notesList || []).filter(n => n.id != id);
    renderNoteBody(); toast('🗑 Anotação removida', '#e74c3c');
  });
}

// ── REMINDERS ─────────────────────────────────────────────────
let reminders = [];

function openReminderModal() {
  $('reminder-modal').classList.add('open');
  renderReminderBody();
}
$('btn-close-reminder').addEventListener('click', () => $('reminder-modal').classList.remove('open'));

function renderReminderBody() {
  const today = new Date().toISOString().split('T')[0];
  $('reminder-body').innerHTML =
    '<div class="lbl" style="margin-top:0">Lembretes ativos</div>'
    + '<div id="reminders-list" style="margin-bottom:12px;">'
    + (reminders.length ? reminders.map(r =>
        '<div class="si"><div class="si-ico">🔔</div>'
        + '<div class="si-info"><div class="si-title">' + r.name + '</div><div class="si-meta">' + (r.contact ? '👤 ' + r.contact + ' · ' : '') + '📅 ' + r.date + ' ' + r.time + '</div></div>'
        + '<button class="si-del" data-del-rem="' + r.id + '">🗑</button></div>'
      ).join('') : '<div class="empty"><div>🔔</div>Nenhum lembrete criado</div>')
    + '</div>'
    + '<div class="lbl">Criar lembrete</div>'
    + '<input class="fi" id="rem-name" placeholder="Nome do lembrete..." style="margin-bottom:8px;">'
    + '<textarea class="ft" id="rem-desc" placeholder="Descrição (opcional)..." style="min-height:55px;margin-bottom:8px;"></textarea>'
    + '<div style="display:flex;gap:8px;margin-bottom:10px;">'
    + '  <div style="flex:1;"><div class="lbl" style="margin-top:0;">Data</div><input class="fi" type="date" id="rem-date" value="' + today + '"></div>'
    + '  <div style="flex:1;"><div class="lbl" style="margin-top:0;">Hora</div><input class="fi" type="time" id="rem-time" value="09:00"></div>'
    + '</div>'
    + '<label style="display:flex;align-items:center;gap:8px;color:#e9edef;font-size:12px;margin-bottom:10px;cursor:pointer;">'
    + '  <input type="checkbox" id="rem-contact-check"> Vincular ao contato aberto <strong style="color:#00a884;">' + (activeContact || '(nenhum)') + '</strong>'
    + '</label>'
    + '<button class="btn" id="btn-save-reminder">🔔 Criar Lembrete</button>';

  $('btn-save-reminder').addEventListener('click', () => {
    const name = $('rem-name').value.trim();
    if (!name) { toast('⚠️ Digite um nome!', '#e74c3c'); return; }
    const date = $('rem-date').value, time = $('rem-time').value || '09:00';
    if (!date) { toast('⚠️ Selecione a data!', '#e74c3c'); return; }
    const contact = $('rem-contact-check')?.checked ? activeContact : null;
    reminders.push({ id: Date.now(), name, desc: $('rem-desc').value || '', date, time, contact });
    // Schedule chrome alarm via background
    window.parent.postMessage({ type: 'SET_ALARM', alarmName: 'reminder_' + encodeURIComponent(name), dateStr: date + 'T' + time }, '*');
    toast('🔔 Lembrete criado!');
    renderReminderBody();
  });
  $('reminders-list').addEventListener('click', e => {
    const id = e.target.dataset.delRem; if (!id) return;
    reminders = reminders.filter(r => r.id != id); renderReminderBody(); toast('🗑 Removido', '#e74c3c');
  });
}

// ── SCHEDULE MESSAGE MODAL ────────────────────────────────────
function openSchedMsgModal() {
  $('sched-msg-modal').classList.add('open');
  renderSchedMsgBody();
}
$('btn-close-sched-msg').addEventListener('click', () => $('sched-msg-modal').classList.remove('open'));

function renderSchedMsgBody() {
  const today = new Date().toISOString().split('T')[0];
  const msgOpts = msgs.map(m => '<option value="' + m.id + '">' + (m.type === 'script' ? '🔗 ' : '⚡ ') + m.label + '</option>').join('');
  $('sched-msg-body').innerHTML =
    '<div class="lbl" style="margin-top:0">Mensagens agendadas</div>'
    + '<div id="sched-msg-list" style="margin-bottom:12px;">'
    + (scheduledItems.filter(s => !activeContact || s.contact === activeContact).length
      ? scheduledItems.filter(s => !activeContact || s.contact === activeContact).map(s =>
          '<div class="si"><div class="si-ico">📅</div><div class="si-info"><div class="si-title">' + s.label + '</div><div class="si-meta">👤 ' + (s.contact || '—') + ' · 🕐 ' + s.dt + '</div></div><button class="si-del" data-del-sm="' + s.id + '">🗑</button></div>'
        ).join('')
      : '<div class="empty"><div>🕐</div>Nenhuma mensagem agendada</div>')
    + '</div>'
    + '<div class="lbl">Agendar para ' + (activeContact || '...') + '</div>'
    + '<div class="lbl" style="margin-top:0">Mensagem</div>'
    + '<select class="fs" id="sm-msg" style="margin-bottom:8px;">' + msgOpts + '</select>'
    + '<div class="lbl">Ou escreva uma mensagem personalizada</div>'
    + '<textarea class="ft" id="sm-text" placeholder="Texto personalizado (deixe vazio para usar a selecionada acima)..." style="min-height:60px;margin-bottom:8px;"></textarea>'
    + '<div style="display:flex;gap:8px;margin-bottom:10px;">'
    + '  <div style="flex:1;"><div class="lbl" style="margin-top:0;">Data</div><input class="fi" type="date" id="sm-date" value="' + today + '"></div>'
    + '  <div style="flex:1;"><div class="lbl" style="margin-top:0;">Hora</div><input class="fi" type="time" id="sm-time" value="09:00"></div>'
    + '</div>'
    + '<button class="btn" id="btn-save-sm">🕐 Agendar</button>';

  $('btn-save-sm').addEventListener('click', () => {
    if (!activeContact) { toast('⚠️ Nenhum contato selecionado no WA!', '#e74c3c'); return; }
    const date = $('sm-date').value, time = $('sm-time').value || '09:00';
    if (!date) { toast('⚠️ Selecione a data!', '#e74c3c'); return; }
    const msgId = +$('sm-msg').value;
    const customText = $('sm-text').value.trim();
    const m = msgs.find(x => x.id === msgId);
    scheduledItems.push({ id: Date.now(), label: customText ? '✏️ Personalizada' : (m?.label || '—'), msgId, customText, contact: activeContact, dt: formatD(date) + ' ' + time });
    toast('🕐 Agendado para ' + activeContact + ' em ' + formatD(date) + '!');
    renderSchedMsgBody();
    renderSchedList();
    saveAutoBackup();
  });
  $('sched-msg-list').addEventListener('click', e => {
    const id = e.target.dataset.delSm; if (!id) return;
    scheduledItems = scheduledItems.filter(x => x.id != id); renderSchedMsgBody(); renderSchedList(); toast('🗑 Removido', '#e74c3c');
  });
}

// ── CRM TABS & LABELS ──────────────────────────────────────────
function renderCRMTabsSection() {
  renderCRMAbasPills();
  renderCRMLabelsPills();
  renderCRMContactList();
}

// Sub-nav toggle
document.getElementById('crm-subnav').addEventListener('click', e => {
  const tab = e.target.dataset.subtab; if (!tab) return;
  crmActiveSubtab = tab;
  crmActiveFilter = null;
  document.querySelectorAll('.crm-subtab').forEach(t => t.classList.remove('active'));
  e.target.classList.add('active');
  $('crm-abas-pills').style.display = tab === 'abas' ? 'flex' : 'none';
  $('crm-labels-pills').style.display = tab === 'etiquetas' ? 'flex' : 'none';
  $('wa-sync-bar').style.display = tab === 'etiquetas' ? 'flex' : 'none';
  if (tab === 'etiquetas') window.parent.postMessage({ type: 'SYNC_LABELS' }, '*');
  $('crm-active-filter').style.display = 'none';
  renderCRMContactList();
});

$('btn-sync-labels').addEventListener('click', () => { $('wa-sync-status').style.color = '#8696a0'; $('wa-sync-status').textContent = 'Sincronizando...'; window.parent.postMessage({ type: 'SYNC_LABELS' }, '*'); });

// Search
$('crm-tabs-search').addEventListener('input', renderCRMContactList);

// Clear filter
$('crm-clear-filter').addEventListener('click', () => {
  crmActiveFilter = null;
  $('crm-active-filter').style.display = 'none';
  renderCRMAbasPills();
  renderCRMLabelsPills();
  renderCRMContactList();
});

// New aba button
$('btn-new-crm-tab').addEventListener('click', () => {
  const name = prompt('Nome da nova aba:');
  if (!name || !name.trim()) return;
  if (!crmTabs.includes(name.trim())) { crmTabs.push(name.trim()); saveAutoBackup(); }
  renderCRMAbasPills();
  toast('✅ Aba "' + name + '" criada!');
});

function getTabColor(tab, idx) {
  const fixed = { 'Primeiro Contato': '#3b82f6', 'Follow UP': '#f59e0b', 'Fechado': '#00a884', 'Pós-venda': '#8b5cf6', 'Frio': '#8696a0' };
  return fixed[tab] || crmTabColors[idx % crmTabColors.length];
}

function getLabelColor(label, idx) {
  const fixed = { 'Interessado': '#00a884', 'VIP': '#f59e0b', 'Indicação': '#8b5cf6', 'Smartwatch': '#3b82f6', 'Garantia': '#ef4444', 'Aguardando': '#8696a0', 'Pós-venda': '#f97316' };
  return fixed[label] || crmTabColors[idx % crmTabColors.length];
}

function tabsOf(c) { return c ? (Array.isArray(c.tabs) ? c.tabs : (c.tab ? [c.tab] : [])) : []; }
function renderCRMAbasPills() {
  const el = $('crm-abas-pills'); if (!el) return;
  // Count contacts per aba
  const counts = {};
  crmTabs.forEach(t => { counts[t] = Object.values(contacts).filter(c => tabsOf(c).includes(t)).length; });
  el.innerHTML = crmTabs.map((tab, i) => {
    const col = getTabColor(tab, i);
    const isActive = crmActiveFilter?.type === 'aba' && crmActiveFilter.value === tab;
    const cnt = counts[tab] || 0;
    return '<button class="aba-pill' + (isActive ? ' active' : '') + '" data-aba="' + tab + '" style="background:' + col + '20;border-color:' + col + '50;color:' + col + ';' + (isActive ? 'box-shadow:0 0 0 2px ' + col + ';' : '') + '">'
      + tab
      + (cnt ? ' <span style="background:' + col + ';color:white;border-radius:10px;padding:1px 5px;font-size:9px;">' + cnt + '</span>' : '')
      + '</button>';
  }).join('') + '<button class="aba-pill" data-aba="__sem_aba__" style="background:#8696a020;border-color:#8696a050;color:#8696a0;">Sem aba</button>';

  el.querySelectorAll('[data-aba]').forEach(btn => {
    btn.addEventListener('click', () => {
      const aba = btn.dataset.aba;
      crmActiveFilter = { type: 'aba', value: aba };
      const label = aba === '__sem_aba__' ? 'Sem aba' : aba;
      $('crm-filter-label').textContent = '📂 ' + label;
      $('crm-active-filter').style.display = 'flex';
      renderCRMAbasPills();
      renderCRMContactList();
    });
  });
}

function renderCRMLabelsPills() {
  const el = $('crm-labels-pills'); if (!el) return;
  // Merge WA labels + stored labels
  const allL = [...new Set([...waAllLabels, ...labels])];
  if (!allL.length) {
    el.innerHTML = '<div style="color:#8696a0;font-size:11px;padding:4px;">Nenhuma etiqueta encontrada no WhatsApp</div>';
    return;
  }
  // Count
  const counts = {};
  allL.forEach(l => {
    counts[l] = waConversations.filter(c => c.labels?.includes(l)).length
      + Object.values(contacts).filter(c => c.labels?.includes(l)).length;
  });
  el.innerHTML = allL.map((lbl, i) => {
    const col = getLabelColor(lbl, i);
    const isActive = crmActiveFilter?.type === 'label' && crmActiveFilter.value === lbl;
    const cnt = counts[lbl] || 0;
    return '<button class="aba-pill' + (isActive ? ' active' : '') + '" data-label="' + lbl + '" style="background:' + col + '20;border-color:' + col + '50;color:' + col + ';' + (isActive ? 'box-shadow:0 0 0 2px ' + col + ';' : '') + '">'
      + '🏷️ ' + lbl
      + (cnt ? ' <span style="background:' + col + ';color:white;border-radius:10px;padding:1px 5px;font-size:9px;">' + cnt + '</span>' : '')
      + '</button>';
  }).join('');

  el.querySelectorAll('[data-label]').forEach(btn => {
    btn.addEventListener('click', () => {
      crmActiveFilter = { type: 'label', value: btn.dataset.label };
      $('crm-filter-label').textContent = '🏷️ ' + btn.dataset.label;
      $('crm-active-filter').style.display = 'flex';
      renderCRMLabelsPills();
      renderCRMContactList();
    });
  });
}

function renderCRMContactList() {
  const el = $('crm-contact-list'); if (!el) return;
  const q = ($('crm-tabs-search')?.value || '').toLowerCase();

  // Build unified contact list
  let items = [];

  if (!crmActiveFilter) {
    // Show ALL contacts (WA conversations + CRM stored)
    const seen = new Set();
    // From WA scrape
    waConversations.forEach(c => {
      if (!seen.has(c.name)) { seen.add(c.name); items.push({ name: c.name, labels: c.labels || [], preview: c.preview, tab: contacts[c.name]?.tab || '', status: contacts[c.name]?.status || '' }); }
    });
    // From CRM storage (contacts not in WA list)
    Object.entries(contacts).forEach(([name, d]) => {
      if (!seen.has(name) && (d.tab || d.labels?.length)) {
        seen.add(name); items.push({ name, labels: d.labels || [], preview: d.notes || '', tab: d.tab || '', status: d.status || '' });
      }
    });
  } else if (crmActiveFilter.type === 'aba') {
    const aba = crmActiveFilter.value;
    if (aba === '__sem_aba__') {
      // Contacts without tab assignment
      const seen = new Set();
      waConversations.forEach(c => {
        const tab = tabsOf(contacts[c.name]).length ? 'x' : '';
        if (!tab) { seen.add(c.name); items.push({ name: c.name, labels: contacts[c.name]?.labels || c.labels || [], preview: c.preview, tab: '', status: contacts[c.name]?.status || '' }); }
      });
    } else {
      Object.entries(contacts).filter(([, d]) => tabsOf(d).includes(aba)).forEach(([name, d]) => {
        items.push({ name, labels: d.labels || [], preview: d.notes || '', tab: d.tab, status: d.status || '' });
      });
    }
  } else if (crmActiveFilter.type === 'label') {
    const lbl = crmActiveFilter.value;
    const seen = new Set();
    // WA conversations with this label
    waConversations.filter(c => c.labels?.includes(lbl)).forEach(c => {
      if (!seen.has(c.name)) { seen.add(c.name); items.push({ name: c.name, labels: c.labels || [], preview: c.preview, tab: contacts[c.name]?.tab || '', status: contacts[c.name]?.status || '' }); }
    });
    // CRM contacts with this label
    Object.entries(contacts).filter(([name, d]) => d.labels?.includes(lbl) && !seen.has(name)).forEach(([name, d]) => {
      seen.add(name); items.push({ name, labels: d.labels || [], preview: d.notes || '', tab: d.tab || '', status: d.status || '' });
    });
  }

  // Filter by search
  if (q) items = items.filter(c => c.name.toLowerCase().includes(q));

  if (!items.length) {
    el.innerHTML = '<div class="empty"><div>' + (crmActiveFilter ? '🔍' : '👥') + '</div>' + (crmActiveFilter ? 'Nenhum contato encontrado' : 'Abra conversas no WA para ver os contatos aqui') + '</div>';
    return;
  }

  const SC_COLORS = { lead: '#ffb300', negociando: '#2196f3', comprou: '#00a884', posVenda: '#9c27b0', inativo: '#c0392b' };
  const SC_LABELS = { lead: '🟡 Lead', negociando: '🔵 Neg.', comprou: '🟢 Comprou', posVenda: '🟣 Pós', inativo: '🔴 Inativo' };

  el.innerHTML = items.map((c, idx) => {
    const initials = c.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
    const avColor = crmTabColors[idx % crmTabColors.length];
    const statusBadge = c.status ? '<span class="crm-c-badge" style="background:' + (SC_COLORS[c.status] || '#8696a0') + '20;color:' + (SC_COLORS[c.status] || '#8696a0') + ';">' + (SC_LABELS[c.status] || c.status) + '</span>' : '';
    const tabBadge = c.tab ? '<span class="crm-c-badge" style="background:' + getTabColor(c.tab, crmTabs.indexOf(c.tab)) + '20;color:' + getTabColor(c.tab, crmTabs.indexOf(c.tab)) + ';">📂 ' + c.tab + '</span>' : '';
    const labelBadges = (c.labels || []).slice(0, 3).map(l => '<span class="crm-c-badge" style="background:' + getLabelColor(l, 0) + '20;color:' + getLabelColor(l, 0) + ';">🏷️ ' + l + '</span>').join('');
    return '<div class="crm-c-item" data-contact-name="' + c.name + '">'
      + '<div class="crm-c-av" style="background:' + avColor + '">' + initials + '</div>'
      + '<div class="crm-c-info">'
      + '<div class="crm-c-name">' + c.name + '</div>'
      + (c.preview ? '<div class="crm-c-meta">' + c.preview.substring(0, 40) + '</div>' : '')
      + '<div class="crm-c-badges">' + statusBadge + tabBadge + labelBadges + '</div>'
      + '</div>'
      + '<div class="crm-c-actions">'
      + '<button class="crm-c-open" data-open-contact="' + c.name + '">💬 Abrir</button>'
      + '<select class="crm-c-move" data-move-contact="' + c.name + '" title="Mover para aba">'
      + '<option value="">📂 Mover</option>'
      + crmTabs.map(t => '<option value="' + t + '"' + (c.tab === t ? ' selected' : '') + '>' + t + '</option>').join('')
      + '</select>'
      + '</div></div>';
  }).join('');

  // Open contact click
  el.querySelectorAll('[data-open-contact]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      window.parent.postMessage({ type: 'OPEN_CONTACT', contact: btn.dataset.openContact }, '*');
      toast('💬 Abrindo ' + btn.dataset.openContact + '...');
    });
  });
  // Row click also opens
  el.querySelectorAll('.crm-c-item').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('button,select')) return;
      window.parent.postMessage({ type: 'OPEN_CONTACT', contact: row.dataset.contactName }, '*');
    });
  });
  // Move to aba
  el.querySelectorAll('[data-move-contact]').forEach(sel => {
    sel.addEventListener('change', () => {
      const name = sel.dataset.moveContact, tab = sel.value;
      if (!name || !tab) return;
      if (!contacts[name]) contacts[name] = { av: '👤', col: '#2a3942', labels: [] };
      { const tl = tabsOf(contacts[name]); if (!tl.includes(tab)) tl.push(tab); contacts[name].tabs = tl; contacts[name].tab = tl[0] || ''; }
      saveAutoBackup();
      toast('📂 "' + name + '" movido para ' + tab + '!');
      renderCRMContactList();
      renderCRMAbasPills();
    });
  });
}

// ── BACKUP & RESTORE ──────────────────────────────────────────
const BACKUP_VERSION = '1.0';
const AUTO_BACKUP_KEY = 'wcrm_auto_backups';

// Coleta todos os dados para backup
function collectBackupData() {
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    exportedAtFormatted: new Date().toLocaleString('pt-BR'),
    data: {
      msgs,
      labels,
      crmTabs,
      contacts,
      autoAtends,
      followUps,
      scheduledItems,
      scheduledStatuses,
      reminders,
    }
  };
}

// Renderiza sumário do que será exportado
function renderBackupSummary() {
  const el = $('backup-summary'); if (!el) return;
  const items = [
    { icon: '⚡', label: 'Mensagens rápidas', count: msgs.filter(m => m.type === 'msg').length },
    { icon: '🔗', label: 'Scripts / Funis', count: msgs.filter(m => m.type === 'script').length },
    { icon: '🤖', label: 'Auto Atendimentos', count: autoAtends.length },
    { icon: '🔔', label: 'Follow Ups', count: followUps.length },
    { icon: '🏷️', label: 'Etiquetas', count: labels.length },
    { icon: '📋', label: 'Abas do CRM', count: crmTabs.length },
    { icon: '👤', label: 'Clientes salvos', count: Object.keys(contacts).length },
    { icon: '🕐', label: 'Agendamentos', count: scheduledItems.length },
  ];
  el.innerHTML = items.map(i =>
    '<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;border-bottom:1px solid #2a3942;">'
    + '<span style="color:#aebac1;font-size:11px;">' + i.icon + ' ' + i.label + '</span>'
    + '<span style="color:' + (i.count > 0 ? '#00a884' : '#8696a0') + ';font-weight:600;font-size:12px;">' + i.count + '</span>'
    + '</div>'
  ).join('') + '<div style="color:#8696a0;font-size:10px;margin-top:6px;text-align:right;">⚠️ Mídia (imagens/vídeos) não incluída — salva separadamente</div>';
}

// Exportar backup completo
function exportBackup(onlyMsgs = false) {
  const data = onlyMsgs
    ? { version: BACKUP_VERSION, exportedAt: new Date().toISOString(), exportedAtFormatted: new Date().toLocaleString('pt-BR'), type: 'messages-only', data: { msgs } }
    : collectBackupData();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const ts = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
  a.href = url;
  a.download = onlyMsgs ? 'crm-mensagens-' + ts + '.json' : 'crm-backup-completo-' + ts + '.json';
  a.click();
  URL.revokeObjectURL(url);
  toast('✅ Backup exportado!');
  saveAutoBackup();
}

// Salvar backup automático local (no localStorage)
function saveAutoBackup() {
  try {
    const backups = JSON.parse(localStorage.getItem(AUTO_BACKUP_KEY) || '[]');
    const snap = {
      id: Date.now(),
      savedAt: new Date().toLocaleString('pt-BR'),
      counts: {
        msgs: msgs.length,
        autoAtends: autoAtends.length,
        followUps: followUps.length,
        contacts: Object.keys(contacts).length,
      },
      data: collectBackupData()
    };
    backups.unshift(snap);
    // Mantém só os últimos 5
    if (backups.length > 5) backups.splice(5);
    localStorage.setItem(AUTO_BACKUP_KEY, JSON.stringify(backups));
    renderAutoBackupList();
  } catch(e) { console.warn('[WCRM] Erro ao salvar auto-backup:', e); }
}

// Renderiza lista de backups automáticos
function renderAutoBackupList() {
  const el = $('auto-backup-list'); if (!el) return;
  try {
    const backups = JSON.parse(localStorage.getItem(AUTO_BACKUP_KEY) || '[]');
    if (!backups.length) { el.innerHTML = '<div style="color:#8696a0;font-size:11px;">Nenhum backup salvo ainda</div>'; return; }
    el.innerHTML = backups.map((b, i) =>
      '<div style="display:flex;align-items:center;justify-content:space-between;background:#161d22;border-radius:7px;padding:8px 10px;margin-bottom:5px;">'
      + '<div><div style="color:#e9edef;font-size:11px;font-weight:500;">' + (i === 0 ? '🟢 ' : '') + b.savedAt + '</div>'
      + '<div style="color:#8696a0;font-size:10px;margin-top:2px;">'
      + b.counts.msgs + ' msgs · ' + b.counts.autoAtends + ' auto · ' + b.counts.followUps + ' follow · ' + b.counts.contacts + ' clientes'
      + '</div></div>'
      + '<button style="background:#2563eb20;color:#60a5fa;border:1px solid #2563eb40;border-radius:6px;padding:4px 9px;font-size:10px;cursor:pointer;font-family:inherit;white-space:nowrap;" data-restore-snap="' + b.id + '">↩ Restaurar</button>'
      + '</div>'
    ).join('');
  } catch(e) { el.innerHTML = '<div style="color:#8696a0;font-size:11px;">Erro ao carregar backups</div>'; }
}

// Restaurar a partir de snapshot local
$('auto-backup-list').addEventListener('click', e => {
  const snapId = e.target.dataset.restoreSnap; if (!snapId) return;
  try {
    const backups = JSON.parse(localStorage.getItem(AUTO_BACKUP_KEY) || '[]');
    const snap = backups.find(b => b.id == snapId);
    if (!snap) return;
    if (!confirm('Restaurar o backup de ' + snap.savedAt + '?\nIsso substituirá as configurações atuais.')) return;
    applyBackup(snap.data, 'replace');
    toast('✅ Backup de ' + snap.savedAt + ' restaurado!');
  } catch(e) { toast('❌ Erro ao restaurar', '#e74c3c'); }
});

// Processar arquivo JSON importado
let pendingImportData = null;

$('backup-drop').addEventListener('click', () => $('backup-file-inp').click());
$('backup-file-inp').addEventListener('change', e => { const f = e.target.files[0]; if (f) readBackupFile(f); });
$('backup-drop').addEventListener('dragover', e => { e.preventDefault(); $('backup-drop').classList.add('ov'); });
$('backup-drop').addEventListener('dragleave', () => $('backup-drop').classList.remove('ov'));
$('backup-drop').addEventListener('drop', e => { e.preventDefault(); $('backup-drop').classList.remove('ov'); const f = e.dataTransfer.files[0]; if (f) readBackupFile(f); });

function readBackupFile(file) {
  if (!file.name.endsWith('.json')) { toast('⚠️ Selecione um arquivo .json!', '#e74c3c'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.version || !data.data) { toast('⚠️ Arquivo inválido!', '#e74c3c'); return; }
      pendingImportData = data;
      showImportPreview(data);
    } catch(err) { toast('⚠️ Erro ao ler o arquivo!', '#e74c3c'); }
  };
  reader.readAsText(file);
}

function showImportPreview(data) {
  const preview = $('backup-preview');
  const title = $('backup-preview-title');
  const content = $('backup-preview-content');
  const d = data.data;
  title.textContent = '📦 Arquivo: ' + (data.exportedAtFormatted || data.exportedAt || 'desconhecido');
  const isOnlyMsgs = data.type === 'messages-only';
  const items = isOnlyMsgs
    ? [{ label: '⚡ Mensagens / Scripts', count: d.msgs?.length || 0 }]
    : [
        { label: '⚡ Mensagens rápidas', count: d.msgs?.filter(m => m.type === 'msg').length || 0 },
        { label: '🔗 Scripts / Funis', count: d.msgs?.filter(m => m.type === 'script').length || 0 },
        { label: '🤖 Auto Atendimentos', count: d.autoAtends?.length || 0 },
        { label: '🔔 Follow Ups', count: d.followUps?.length || 0 },
        { label: '🏷️ Etiquetas', count: d.labels?.length || 0 },
        { label: '📋 Abas do CRM', count: d.crmTabs?.length || 0 },
        { label: '👤 Clientes', count: Object.keys(d.contacts || {}).length },
      ];
  content.innerHTML = items.map(i => '<span style="margin-right:12px;">' + i.label + ': <strong style="color:#e9edef;">' + i.count + '</strong></span>').join('<br>');
  preview.style.display = '';
}

// Botões de importar
$('btn-import-merge').addEventListener('click', () => {
  if (!pendingImportData) return;
  if (!confirm('Mesclar o backup com as configurações atuais?\n(Não remove o que já existe, só adiciona)')) return;
  applyBackup(pendingImportData, 'merge');
  toast('✅ Backup mesclado com sucesso!');
  $('backup-preview').style.display = 'none';
  pendingImportData = null;
  renderBackupSummary();
});
$('btn-import-replace').addEventListener('click', () => {
  if (!pendingImportData) return;
  if (!confirm('⚠️ ATENÇÃO: Substituir tudo pelas configurações do backup?\nIsso apagará todas as mensagens e configurações atuais.')) return;
  applyBackup(pendingImportData, 'replace');
  toast('✅ Backup restaurado com sucesso!');
  $('backup-preview').style.display = 'none';
  pendingImportData = null;
  renderBackupSummary();
});

// Aplica o backup
function applyBackup(data, mode) {
  const d = data.data;
  if (mode === 'replace') {
    if (d.msgs) msgs = d.msgs;
    if (d.labels) labels = d.labels;
    if (d.crmTabs) crmTabs = d.crmTabs;
    if (d.contacts) contacts = d.contacts;
    if (d.autoAtends) autoAtends = d.autoAtends;
    if (d.followUps) followUps = d.followUps;
    if (d.scheduledItems) scheduledItems = d.scheduledItems;
    if (d.scheduledStatuses) scheduledStatuses = d.scheduledStatuses;
  } else { // merge
    if (d.msgs) {
      const existingIds = new Set(msgs.map(m => m.label + m.cat));
      d.msgs.forEach(m => {
        if (!existingIds.has(m.label + m.cat)) {
          m.id = Date.now() + Math.random(); // novo id
          msgs.push(m);
        }
      });
    }
    if (d.labels) { d.labels.forEach(l => { if (!labels.includes(l)) labels.push(l); }); }
    if (d.crmTabs) { d.crmTabs.forEach(t => { if (!crmTabs.includes(t)) crmTabs.push(t); }); }
    if (d.contacts) { Object.entries(d.contacts).forEach(([k, v]) => { if (!contacts[k]) contacts[k] = v; }); }
    if (d.autoAtends) { const eIds = new Set(autoAtends.map(a => a.name)); d.autoAtends.forEach(a => { if (!eIds.has(a.name)) autoAtends.push(a); }); }
    if (d.followUps) { const eIds = new Set(followUps.map(f => f.name)); d.followUps.forEach(f => { if (!eIds.has(f.name)) followUps.push(f); }); }
  }
  // Atualiza todas as seções visíveis
  renderPills(); renderMsgs(); renderAAList(); renderFUList(); renderSchedList();
}

// Botões exportar / reset
$('btn-export-backup').addEventListener('click', () => exportBackup(false));
$('btn-export-msgs-only').addEventListener('click', () => exportBackup(true));
$('btn-save-auto').addEventListener('click', () => { saveAutoBackup(); toast('💾 Snapshot salvo!'); });
$('btn-reset-all').addEventListener('click', () => {
  if (!confirm('⚠️ TEM CERTEZA?\n\nIsso vai APAGAR todas as mensagens, scripts, follow ups, auto atendimentos e configurações.\n\nEssa ação não pode ser desfeita!')) return;
  if (!confirm('Última confirmação: deseja realmente zerar tudo?')) return;
  msgs = []; autoAtends = []; followUps = []; scheduledItems = []; scheduledStatuses = [];
  labels = ['Interessado', 'VIP', 'Indicação', 'Smartwatch', 'Garantia', 'Aguardando', 'Pós-venda'];
  crmTabs = ['Primeiro Contato', 'Follow UP', 'Fechado', 'Pós-venda', 'Frio'];
  renderPills(); renderMsgs(); renderAAList(); renderFUList(); renderSchedList(); renderBackupSummary();
  toast('🗑 Tudo zerado', '#e74c3c');
});

// Salva auto-backup quando sair da aba backup (ou ao fazer alterações)
const origSaveCr = saveCr;
// Abre aba backup → renderiza
document.getElementById('main-nav').addEventListener('click', e => {
  if (e.target.dataset.tab === 'backup') { renderBackupSummary(); renderAutoBackupList(); }
});

// ── INIT ──────────────────────────────────────────────────────
renderPills();
renderMsgs();
