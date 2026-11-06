// WhatsApp CRM Pro v4.52 — qr.js
// Painel lateral no estilo WaSpeed: lista por categoria colorida, menu ＋ (Resposta rápida / Script / Categoria),
// criador com "Adicionar Ação" (Enviar Mensagem · Aba do CRM · Etiquetas · Temporizadores · Utilitários), menu ⋯ e ⚙ do menu lateral.
// Roda DENTRO do iframe (depois de crm.js) e substitui as funções antigas de renderização/criação. Os dados continuam em `msgs`/`CATS`.
(function () {
  'use strict';
  const $q = id => document.getElementById(id);
  const E = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const PALETTE = ['#f4e04d', '#d96bd1', '#b89b7a', '#4fc3f7', '#81c784', '#ff8a65', '#9575cd', '#f06292', '#90a4ae', '#26a69a'];
  const GROUPS = [
    { id: 'send', ico: '💬', l: 'Enviar Mensagem', items: [['text', '📝', 'Texto'], ['image', '🖼️', 'Imagem'], ['video', '🎬', 'Vídeo'], ['audio', '🎤', 'Áudio'], ['doc', '📄', 'Documentos'], ['pix', '💠', 'Pix'], ['invite', '👥', 'Convite para Grupo'], ['contact', '👤', 'Contato'], ['banner', '🔗', 'Link com Banner'], ['sticker', '😀', 'Figurinha'], ['list', '☰', 'Lista']] },
    { id: 'crm', ico: '📂', l: 'Aba do CRM', items: [['tab_add', '➕', 'Adicionar a um CRM'], ['tab_rm', '➖', 'Remover de um CRM'], ['tab_rmall', '🚫', 'Remover de todos CRMs', 1]] },
    { id: 'lab', ico: '🏷️', l: 'Etiquetas', items: [['label_add', '➕', 'Adicionar a uma Etiqueta'], ['label_rm', '➖', 'Remover de uma Etiqueta'], ['label_rmall', '🚫', 'Remover de todas as Etiquetas', 1]] },
    { id: 'tmr', ico: '⏱️', l: 'Temporizadores', items: [['wait', '⏰', 'Esperar em segundos'], ['typing', '✍️', 'Exibir que esta digitando'], ['recording', '🔴', 'Exibir que um audio esta sendo gravado']] },
    { id: 'utl', ico: '🧰', l: 'Utilitários', items: [['archive', '📥', 'Arquivar Contato'], ['unarchive', '📤', 'Desarquivar o contato'], ['pin', '📌', 'Fixar Conversa'], ['unpin', '📍', 'Desfixar Conversa'], ['unread', '✉️', 'Marcar como não lido']] }
  ];
  const KIND = {}; GROUPS.forEach(g => g.items.forEach(i => { KIND[i[0]] = { i: i[1], l: i[2] }; })); KIND.ref = { i: '🔽', l: 'Resposta rápida' };
  const FILEK = { image: 'image/*', video: 'video/*', audio: 'audio/*', doc: '*/*', sticker: 'image/*' };
  const TYPE_ICO = a => { const ks = (a || []).map(x => x.k); return ks.every(k => k === 'ref') && ks.length ? '🔽' : ks.length > 1 ? '🤖' : ks[0] === 'audio' ? '🎤' : ks[0] === 'image' ? '🖼️' : ks[0] === 'video' ? '🎬' : ks[0] === 'doc' ? '📄' : ks[0] === 'sticker' ? '😀' : ks[0] === 'list' ? '☰' : '📝'; };

  const css = document.createElement('style');
  css.textContent = `
  :root{--acc:#00a884}
  .qr-pills{display:flex;flex-wrap:wrap;gap:6px;padding:8px 10px 4px} .qr-pills .chip{background:var(--acc);border:0;color:#fff;border-radius:99px;padding:5px 12px;font-size:12.5px;font-weight:600;cursor:pointer}
  .qr-pills .chip.on{filter:brightness(.75)} .qr-pills select.chip{appearance:none}
  .qg{margin:8px 10px;border-radius:12px;border:1px solid var(--c);background:color-mix(in srgb,var(--c) 14%,transparent);overflow:hidden}
  .qg-h{display:flex;align-items:center;gap:8px;padding:9px 12px;cursor:pointer;font-weight:700;font-size:13.5px;color:#e9edef} .qg-h .t{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .qg-h button{background:none;border:0;color:#aebac1;cursor:pointer;font-size:14px} .qg-b{padding:0 6px 6px} .qg.closed .qg-b{display:none}
  .qr-row{display:flex;align-items:center;gap:7px;padding:7px 8px;border-radius:8px;font-size:13px;color:#e9edef;border-top:1px solid #ffffff10} .qr-row:hover{background:#ffffff14}
  .qr-row .ic{width:22px;text-align:center;flex:none} .qr-row .nm{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}
  .qr-row button{background:none;border:0;color:#c8d0d4;cursor:pointer;font-size:15px;padding:2px 5px;border-radius:6px} .qr-row button:hover{background:#ffffff22;color:#fff}
  .qr-row .go{color:var(--acc);font-size:17px}
  .qr-prev{margin:2px 8px 8px 32px;padding:8px 10px;background:#0006;border-radius:8px;font-size:12.5px;color:#d5dbde;white-space:pre-wrap}
  .qr-menu{position:fixed;z-index:99999;background:#1f2326;border:1px solid #384046;border-radius:12px;box-shadow:0 10px 30px #000a;padding:6px;min-width:200px;color:#e9edef;font-size:13.5px}
  .qr-menu div{padding:9px 12px;border-radius:8px;cursor:pointer;display:flex;gap:10px;align-items:center} .qr-menu div:hover{background:#ffffff14} .qr-menu .red{color:#ff6b6b} .qr-menu hr{border:0;border-top:1px solid #384046;margin:4px 0}
  .qr-menu .sub{padding-left:30px;font-size:13px} .qr-menu .grp{font-weight:600} .qr-menu .grp .chev{margin-left:auto;color:#8b969c}
  .qc h4{margin:2px 0 8px;font-size:16px;text-align:center;color:#fff} .qc label{display:block;margin:10px 0 4px;font-size:12.5px;color:#aebac1}
  .qc input[type=text],.qc input[type=number],.qc textarea,.qc select{width:100%;box-sizing:border-box;background:#1b2125;border:1px solid #384046;color:#e9edef;border-radius:9px;padding:8px 10px;font:inherit;font-size:13px}
  .qc textarea{min-height:90px;resize:vertical} .qc .card{border:1px solid #384046;border-radius:14px;padding:12px;margin-top:10px;background:#12171a}
  .qc .card h5{margin:0 0 4px;font-size:15px;color:#fff} .qc .tag{display:inline-block;background:color-mix(in srgb,var(--acc) 35%,#000);color:#fff;border-radius:99px;padding:3px 11px;font-size:12px;font-weight:700;cursor:pointer;margin:4px 0}
  .qc .empty{text-align:center;color:#aebac1;padding:18px 6px} .qc .empty b{display:block;color:#fff;font-size:15px;margin:6px 0}
  .qc .act{border:1px solid #384046;border-radius:11px;padding:10px;margin-top:10px;background:#0f1417} .qc .act .hd{display:flex;align-items:center;gap:8px;font-weight:700;font-size:13.5px;margin-bottom:6px} .qc .act .hd span{flex:1}
  .qc .act .hd button{background:none;border:0;cursor:pointer;color:#e9edef;font-size:14px} .qc .act .hd .rm{color:#ff5a5a}
  .qc .sec2{display:flex;align-items:center;gap:8px;font-size:12.5px;margin:6px 0;color:#c4ccd0} .qc .sec2 input[type=number]{width:62px;text-align:center}
  .qc .btn{background:var(--acc);color:#fff;border:0;border-radius:9px;padding:9px 18px;font-weight:700;cursor:pointer;font-size:13.5px} .qc .btn.g{background:#2a3238}
  .qc .row{display:flex;gap:8px;align-items:center} .qc .pv{max-width:100%;max-height:160px;border-radius:8px;margin:6px 0;display:block}
  .qc .warn{color:#ffb74d;font-size:11.5px;margin:4px 0} .qc .note{color:#8b969c;font-size:11.5px;margin:4px 0}
  .qc .ctr{text-align:center;margin-top:12px} .qc .pal{display:flex;gap:7px;flex-wrap:wrap;margin:6px 0} .qc .pal b{width:26px;height:26px;border-radius:50%;cursor:pointer;border:3px solid transparent} .qc .pal b.on{border-color:#fff}
  .qc .srow{display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid #384046;border-radius:10px;margin-top:8px;background:#12171a;font-size:13px} .qc .srow .nm{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .qc .srow input{width:54px!important;text-align:center} .qc .srow button{background:none;border:0;cursor:pointer;color:#ff5a5a;font-size:15px}
  .qr-pick{position:fixed;inset:0;background:#000a;z-index:99998;display:flex;align-items:center;justify-content:center} .qr-pick .bx{background:#1b2125;border:1px solid #384046;border-radius:14px;width:340px;max-width:92vw;max-height:80vh;overflow:auto;padding:14px;color:#e9edef}
  .qr-pick .it{padding:9px 10px;border-radius:8px;cursor:pointer;font-size:13px} .qr-pick .it:hover{background:#ffffff14}
  .cfgrow{display:flex;align-items:center;gap:10px;padding:12px 6px;font-size:14px;color:#e9edef} .cfgrow span{flex:1}
  .sw{width:46px;height:24px;border-radius:99px;background:#3a444a;position:relative;cursor:pointer;flex:none} .sw::after{content:'';position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:.15s} .sw.on{background:var(--acc)} .sw.on::after{left:25px}
  html,body{min-width:0} .sec>.scroll,.cr-body,#msgs-body{min-height:0!important} .creator{position:fixed!important;inset:0;height:100vh;max-height:100vh;overflow:hidden} .cr-body{overflow-y:scroll!important;padding:12px 6px 90px 14px!important;box-sizing:border-box} #msgs-body{overflow-y:scroll!important}
  .qc .ctr{position:sticky;bottom:-12px;padding:10px 0 6px;background:linear-gradient(transparent,#1a2530 35%);z-index:5}
  .qr-row{font-size:15.5px!important;padding:9px 8px!important;cursor:pointer} .qr-row .nm{font-size:15.5px!important;font-weight:500} .qg-h{font-size:15.5px!important} .qr-row .ic{font-size:17px} .qr-row button{font-size:17px!important}
  .qr-pills .chip{font-size:14px!important;padding:6px 14px!important} .qc .btn,.qr-pills .chip{color:var(--acc-fg,#fff)!important}
  html.th-light,html.th-white{filter:invert(1) hue-rotate(180deg)} html.th-light img,html.th-light video,html.th-light audio,html.th-white img,html.th-white video,html.th-white audio{filter:invert(1) hue-rotate(180deg)}
  html.th-black,html.th-black body,html.th-black .app,html.th-black .creator,html.th-black .qc .card,html.th-black .qg{background-color:#000}
  html.th-black .cr-hdr,html.th-black .sbar{background:#0a0a0a}
  *{scrollbar-width:auto;scrollbar-color:var(--acc,#00a884) #0006}
  *::-webkit-scrollbar{width:12px!important;height:12px!important} *::-webkit-scrollbar-track{background:#0005;border-radius:8px} *::-webkit-scrollbar-thumb{background:var(--acc,#00a884)!important;border-radius:8px;border:2px solid #0008;min-height:40px}
  #hdr-cfg{background:none;border:0;cursor:pointer;color:var(--acc,#00a884)}
  `;
  document.head.appendChild(css);
  // ── tema (Preto / Escuro / Claro / Branco) + cor de destaque (inclui branco e preto) ──
  window.__applyTheme = function (u) { const h = document.documentElement; h.classList.remove('th-light', 'th-white', 'th-black'); const m = (u && u.theme) || 'dark'; if (m === 'light') h.classList.add('th-light'); else if (m === 'white') h.classList.add('th-white'); else if (m === 'black') h.classList.add('th-black'); };
  const accFg = c => { const m = /^#?([0-9a-f]{6})$/i.exec(c || ''); if (!m) return '#fff'; const n = parseInt(m[1], 16); const l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)); return l > 160 ? '#000' : '#fff'; };
  window.__applyAcc = function (c) { if (!c) return; document.documentElement.style.setProperty('--acc', c); document.documentElement.style.setProperty('--acc-fg', accFg(c)); };
  try { chrome.storage.local.get('wcrm_ui', o => window.__applyTheme(o.wcrm_ui)); chrome.storage.onChanged.addListener((c, a) => { if (a === 'local' && c.wcrm_ui) window.__applyTheme(c.wcrm_ui.newValue); }); } catch (e) {}
  try { chrome.storage.local.get('wcrm_acc', o => { if (o.wcrm_acc) window.__applyAcc(o.wcrm_acc); }); chrome.storage.onChanged.addListener((c, a) => { if (a === 'local' && c.wcrm_acc && c.wcrm_acc.newValue) window.__applyAcc(c.wcrm_acc.newValue); if (0) document.documentElement.style.setProperty('--acc', c.wcrm_acc.newValue); }); } catch (e) {}

  // ── mídia fora do estado (cada arquivo numa chave própria do chrome.storage; o estado fica leve) ──
  const MK = 'wcrm_mf_';
  const mediaPut = (key, d) => new Promise(r => { try { chrome.storage.local.set({ [key]: d }, () => r(!chrome.runtime.lastError)); } catch (e) { r(false); } });
  const mediaGet = key => new Promise(r => { try { chrome.storage.local.get(key, o => r(o && o[key])); } catch (e) { r(null); } });
  const newKey = () => MK + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const hasFile = a => !!(a.fileKey || a.fileDataUrl);
  const pvOf = a => a._pv || a.fileDataUrl || '';
  async function loadPreviews() { let ch = false; for (const a of (Q && Q.actions) || []) { if (a.fileKey && !a._pv) { a._pv = (await mediaGet(a.fileKey)) || ''; ch = a._pv ? true : ch; } } if (ch && Q) renderCreator(); }
  // migra mídias antigas (guardadas dentro da mensagem) para o armazenamento separado
  (async function migrate() { let n = 0; for (const m of msgs) for (const a of (m.actions || [])) if (a.fileDataUrl && !a.fileKey) { const k = newKey(); if (await mediaPut(k, a.fileDataUrl)) { a.fileKey = k; delete a.fileDataUrl; n++; } } if (n) { console.log('[WCRM] ' + n + ' mídia(s) movida(s) para o armazenamento separado'); try { saveAutoBackup(); } catch (e) {} } })();

  // limpeza única: apaga as respostas importadas do WaSpeed (e suas mídias)
  (async function cleanWs() { const had = msgs.filter(m => m.wsId); const f = await new Promise(r => chrome.storage.local.get('wcrm_wsclean', o => r(o.wcrm_wsclean))); if (f && !had.length) return;
    const keys = []; had.forEach(m => (m.actions || []).forEach(a => { if (a.fileKey) keys.push(a.fileKey); }));
    if (had.length) { msgs = msgs.filter(m => !m.wsId); }
    if (CATS.wsimp) delete CATS.wsimp;
    try { if (keys.length) await new Promise(r => chrome.storage.local.remove(keys, r)); await new Promise(r => chrome.storage.local.set({ wcrm_wsclean: 1 }, r)); } catch (e) {}
    try { renderPills(); renderMsgs(); saveAutoBackup(); } catch (e) {} if (had.length) console.log('[WCRM] removidas ' + had.length + ' respostas importadas do WaSpeed'); })();
  const catList = () => Object.entries(CATS).filter(([k]) => k !== 'all');
  const catColor = k => (CATS[k] && CATS[k].c) || '#8aa0ad';
  const closeMenus = () => document.querySelectorAll('.qr-menu').forEach(m => m.remove());
  document.addEventListener('click', e => { if (!e.target.closest('.qr-menu')) closeMenus(); }, true);
  function popMenu(anchor, html, onPick, side) {
    closeMenus(); const m = document.createElement('div'); m.className = 'qr-menu'; m.innerHTML = html; document.body.appendChild(m);
    const r = anchor.getBoundingClientRect(); const w = m.offsetWidth, h = m.offsetHeight;
    m.style.left = Math.max(6, Math.min(innerWidth - w - 6, side === 'left' ? r.left : r.right - w)) + 'px'; m.style.top = Math.max(6, (r.bottom + 6 + h > innerHeight) ? r.top - h - 6 : r.bottom + 6) + 'px';
    m.addEventListener('click', e => { const d = e.target.closest('[data-p]'); if (d) onPick(d.dataset.p, d, m); });
    return m;
  }

  // ───────────────────────── LISTA ─────────────────────────
  window.renderPills = function () {
    const catOpts = catList().map(([k, v]) => '<option value="' + k + '"' + (activeFilter === k ? ' selected' : '') + '>' + E(v.l) + '</option>').join('');
    const isCat = activeFilter !== 'all' && activeFilter !== 'nocat' && activeFilter !== 'top';
    $q('pills').className = 'qr-pills';
    $q('pills').innerHTML = '<button class="chip' + (activeFilter === 'all' && typeFilter === 'all' ? ' on' : '') + '" data-filter="all">Tudo</button>'
      + '<select class="chip' + (typeFilter !== 'all' ? ' on' : '') + '" id="flt-type">' + TYPE_OPTS.map(([v, l]) => '<option value="' + v + '"' + (typeFilter === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>'
      + '<button class="chip' + (activeFilter === 'nocat' ? ' on' : '') + '" data-filter="nocat">Sem Categoria</button>'
      + '<select class="chip' + (isCat ? ' on' : '') + '" id="flt-cat"><option value="">Por Categoria</option>' + catOpts + '</select>'
      + '<button class="chip' + (activeFilter === 'top' ? ' on' : '') + '" data-filter="top">Mais Usadas</button>';
  };
  window.renderMC = function (m) {
    return '<div class="qr-row" data-id="' + m.id + '"><span class="ic">' + TYPE_ICO(m.actions) + '</span><span class="nm" title="' + E(m.label) + '">' + E(m.label) + '</span>'
      + '<button data-dots="' + m.id + '" title="Mais opções">•••</button><button data-eye="' + m.id + '" title="Pré-visualizar">👁</button><button class="go" data-send="' + m.id + '" title="Enviar">▷</button></div>'
      + '<div class="qr-prev" id="mc-exp-' + m.id + '" style="display:none"></div>';
  };
  const previewText = m => (m.actions || []).map(a => {
    if (a.k === 'text') return (a.txt || '').replace(/#primeiroNome/gi, '«nome»');
    if (a.k === 'ref') { const r = msgs.find(x => x.id === a.refId); return '🔽 ' + (r ? r.label : '(removida)'); }
    return (KIND[a.k] ? KIND[a.k].i + ' ' + KIND[a.k].l : a.k) + (a.fileName ? ': ' + a.fileName : '') + (a.name ? ': ' + a.name : '') + (a.link ? ' ' + a.link : '');
  }).filter(Boolean).join('\n— — —\n') || '(vazia)';
  window.renderMsgs = function () {
    const q = ($q('msg-search').value || '').toLowerCase(); const body = $q('msgs-body');
    let list = msgs.filter(m => msgMatchesType(m) && (!q || String(m.label).toLowerCase().includes(q)));
    const grp = {};
    if (activeFilter === 'top') { list = list.filter(m => (m.uses || 0) > 0).sort((a, b) => (b.uses || 0) - (a.uses || 0)); if (list.length) grp.__top = list; }
    else list.forEach(m => {
      if (activeFilter === 'nocat' && m.cat) return; if (activeFilter !== 'all' && activeFilter !== 'nocat' && m.cat !== activeFilter) return;
      const k = (m.cat && CATS[m.cat]) ? m.cat : '__nocat'; (grp[k] = grp[k] || []).push(m);
    });
    // categorias vazias também aparecem (para poder editar/excluir)
    if (activeFilter === 'all' && !q && typeFilter === 'all') catList().forEach(([k]) => { if (!grp[k]) grp[k] = []; });
    const keys = Object.keys(grp).sort((a, b) => (a === '__nocat') - (b === '__nocat'));
    if (!keys.length) { body.innerHTML = '<div class="empty"><div>🔍</div>Nenhuma resposta rápida. Use o botão ＋ para criar.</div>'; return; }
    body.innerHTML = keys.map(k => {
      const items = grp[k]; const c = k === '__top' ? '#ff8a65' : k === '__nocat' ? '#8aa0ad' : catColor(k); const nm = k === '__top' ? 'Mais usadas' : k === '__nocat' ? 'Sem categoria' : CATS[k].l;
      const closed = (window.__qrClosed || {})[k] ? ' closed' : '';
      return '<div class="qg' + closed + '" style="--c:' + c + '" data-cat="' + k + '"><div class="qg-h" data-toggle="' + k + '"><span>🗂️</span><span class="t">' + E(nm) + ' <small style="opacity:.6;font-weight:400">(' + items.length + ')</small></span>'
        + (k.indexOf('__') === 0 ? '' : '<button data-editcat="' + k + '" title="Editar categoria">✏️</button>') + '<span>' + (closed ? '▾' : '▴') + '</span></div><div class="qg-b">' + items.map(renderMC).join('') + '</div></div>';
    }).join('');
  };
  // clique em cabeçalho/itens da lista (captura antes do handler antigo)
  $q('msgs-body').addEventListener('click', e => {
    const rowTxt = e.target.closest('.qr-row .nm, .qr-row .ic'); if (rowTxt) { e.stopImmediatePropagation(); const rw = rowTxt.closest('.qr-row'); window.parent.postMessage({ type: 'QUICK_RUN', id: +rw.dataset.id }, '*'); return; }
    const ec = e.target.closest('[data-editcat]'); if (ec) { e.stopImmediatePropagation(); openCreator(null, 'cat', ec.dataset.editcat); return; }
    const tg = e.target.closest('[data-toggle]'); if (tg) { e.stopImmediatePropagation(); const k = tg.dataset.toggle; window.__qrClosed = window.__qrClosed || {}; window.__qrClosed[k] = !window.__qrClosed[k]; renderMsgs(); return; }
    const eye = e.target.closest('[data-eye]'); if (eye) { e.stopImmediatePropagation(); const m = msgs.find(x => String(x.id) === eye.dataset.eye); const p = $q('mc-exp-' + eye.dataset.eye); if (m && p) { p.textContent = previewText(m); p.style.display = p.style.display === 'none' ? 'block' : 'none'; } return; }
  }, true);
  // menu ⋯
  window.openDD = function (e, id) {
    e.stopPropagation(); const a = e.target.closest('[data-dots]') || e.currentTarget;
    popMenu(a, '<div data-p="dup">📋 Duplicar Resposta rápida</div><div data-p="edit">✏️ Editar</div><div data-p="sched">🗓️ Criar Agendamento</div><div data-p="del" class="red">🗑 Deletar</div>', p => { closeMenus(); runDD(p, id); });
  };
  function runDD(act, id) {
    if (act === 'edit') openCreator(id);
    else if (act === 'dup') { const m = msgs.find(x => x.id === id); if (m) { const c = JSON.parse(JSON.stringify(m)); c.id = Date.now() + Math.floor(Math.random() * 999); c.label = m.label + ' (cópia)'; c.uses = 0; msgs.push(c); renderMsgs(); toast('📋 Duplicada'); try { saveAutoBackup(); } catch (e) {} } }
    else if (act === 'del') { const m = msgs.find(x => x.id === id); if (m && confirm('Deletar "' + m.label + '"?')) { msgs = msgs.filter(x => x.id !== id); renderMsgs(); try { saveAutoBackup(); } catch (e) {} } }
    else if (act === 'sched') { try { const m = msgs.find(x => x.id === id); window.__qrSchedPref = m; openSchedMsgModal(); } catch (e) { toast('Abra uma conversa primeiro'); } }
  }

  // botão ＋ → Respostas Rápidas / Script / Categoria
  (function () {
    const b = $q('btn-new-msg'); if (!b) return; const nb = b.cloneNode(true); b.replaceWith(nb); nb.textContent = '⊞'; nb.title = 'Criar resposta rápida';
    nb.addEventListener('click', e => { e.stopPropagation(); popMenu(nb, '<div data-p="msg">⚡ Respostas Rápidas</div><div data-p="script">🔽 Script</div><hr><div data-p="cat">🗂️ Categoria</div>', p => { closeMenus(); openCreator(null, p); }); });
  })();

  // ───────────────────────── CRIADOR ─────────────────────────
  let Q = null;   // {mode,id,label,cat,actions,catKey,catName,catColor}
  window.openCreator = function (id, mode, catKey) {
    const ex = id ? msgs.find(m => m.id === id) : null;
    if (mode === 'cat') { const c = catKey && CATS[catKey]; Q = { mode: 'cat', catKey: catKey || '', catName: c ? c.l : '', catColor: c ? (c.c || PALETTE[0]) : PALETTE[0] }; }
    else Q = { mode: mode || (ex && ex.type === 'script' ? 'script' : 'msg'), id: id || null, label: ex ? ex.label : '', cat: ex ? (ex.cat || '') : '', actions: ex ? JSON.parse(JSON.stringify(ex.actions || [])) : [] };
    $q('cr-title').textContent = Q.mode === 'cat' ? (catKey ? 'Editar Categoria' : 'Criar Categoria') : Q.mode === 'script' ? (id ? 'Editar Script' : 'Criar Script') : (id ? 'Editar Resposta Rápida' : 'Criar Respostas Rápidas');
    $q('creator').classList.add('open'); renderCreator(); loadPreviews();
  };
  const fval = (a, k, d) => (a[k] == null || a[k] === '' ? (d == null ? '' : d) : a[k]);
  const sec = (a, k, lbl, d) => '<div class="sec2">' + lbl + ' <input type="number" min="0" max="3600" data-f="' + k + '" value="' + fval(a, k, d) + '"> Segundos</div>';
  const crmTabsOpts = sel => '<option value="">Selecione a aba</option>' + (crmTabs || []).map(t => '<option' + (t === sel ? ' selected' : '') + '>' + E(t) + '</option>').join('');
  const labOpts = sel => { const all = [...new Set([...(waAllLabels || []), ...(labels || [])])]; return '<option value="">Selecione a etiqueta</option>' + all.map(t => '<option' + (t === sel ? ' selected' : '') + '>' + E(t) + '</option>').join(''); };
  function actForm(a, i) {
    const k = a.k; const info = KIND[k] || { i: '❓', l: k }; let body = '';
    if (k === 'text') body = sec(a, 'ty', 'Exibir para o cliente que a mensagem está sendo digitada por', 5) + '<textarea data-f="txt" id="qa-txt-' + i + '" placeholder="Digite o texto">' + E(a.txt || '') + '</textarea><div id="qa-emo-' + i + '"></div>' + sec(a, 'da', 'Aguarde para chamar a próxima ação por', 5);
    else if (FILEK[k]) {
      const has = hasFile(a); const pv = !has ? '<button class="btn g" data-pick="' + i + '" type="button">📎 Escolher ' + info.l.toLowerCase() + ' do PC</button>'
        : (k === 'image' || k === 'sticker' ? '<img class="pv" src="' + pvOf(a) + '">' : k === 'video' ? '<video class="pv" controls src="' + pvOf(a) + '"></video>' : k === 'audio' ? '<audio controls src="' + pvOf(a) + '" style="width:100%"></audio>' : '<div class="note">📄 ' + E(a.fileName || 'arquivo') + '</div>') + '<div class="note">' + E(a.fileName || '') + ' · <a href="#" data-pick="' + i + '" style="color:var(--acc)">trocar</a></div>';
      body = pv + '<input type="file" data-file="' + i + '" accept="' + FILEK[k] + '" style="display:none">'
        + (k === 'audio' ? (has && !/ogg|opus/i.test((a.fileMime || '') + (a.fileName || '')) ? '<div class="warn">⚠ Para sair como áudio gravado (voz) o arquivo precisa ser .ogg/.opus.</div>' : '') + sec(a, 'ty', 'Exibir que um áudio está sendo gravado por', 5)
          : (k === 'image' || k === 'video' || k === 'doc') ? '<label>Legenda (opcional)</label><textarea data-f="cap" style="min-height:60px" placeholder="Legenda">' + E(a.cap || '') + '</textarea>' : '')
        + sec(a, 'da', 'Aguarde para chamar a próxima ação por', 3);
    }
    else if (k === 'pix') body = '<label>Selecione o tipo de chave PIX</label><select data-f="keyType">' + ['', 'CPF', 'CNPJ', 'Celular', 'E-mail', 'Chave aleatória'].map(x => '<option value="' + x + '"' + (a.keyType === x ? ' selected' : '') + '>' + (x || 'Selecione o tipo de chave PIX') + '</option>').join('') + '</select><label>Nome do destinatário do PIX</label><input type="text" data-f="name" value="' + E(a.name || '') + '" placeholder="Insira um nome de quem vai receber"><label>Chave PIX</label><input type="text" data-f="key" value="' + E(a.key || '') + '" placeholder="Insira uma chave PIX"><label>Valor (opcional)</label><input type="text" data-f="value" value="' + E(a.value || '') + '" placeholder="R$ 0,00">' + sec(a, 'da', 'Aguarde para chamar a próxima ação por', 2);
    else if (k === 'invite') { const gs = (waConversations || []).filter(c => c.isGroup || c.group).map(c => c.name); body = '<label>Selecione grupo</label>' + (gs.length ? '<select data-f="group"><option value="">Selecione o grupo para criar o convite</option>' + gs.map(g => '<option' + (a.group === g ? ' selected' : '') + '>' + E(g) + '</option>').join('') + '</select>' : '<input type="text" data-f="group" value="' + E(a.group || '') + '" placeholder="Nome do grupo">') + '<label>Link do convite</label><input type="text" data-f="link" value="' + E(a.link || '') + '" placeholder="https://chat.whatsapp.com/…"><label>Mensagem (opcional)</label><input type="text" data-f="txt" value="' + E(a.txt || '') + '" placeholder="Entre no nosso grupo:">' + sec(a, 'da', 'Aguarde para chamar a próxima ação por', 2); }
    else if (k === 'contact') body = '<label>Nome</label><input type="text" data-f="name" value="' + E(a.name || '') + '" placeholder="Insira o nome do contato"><label>Telefone</label><div class="row"><span style="font-size:20px">🇧🇷</span><input type="text" data-f="phone" value="' + E(a.phone || '+55 ') + '"></div>' + sec(a, 'da', 'Aguarde para chamar a próxima ação por', 2);
    else if (k === 'banner') body = '<label>Link</label><input type="text" data-f="link" value="' + E(a.link || '') + '" placeholder="Insira o link"><label>Título</label><input type="text" data-f="title" value="' + E(a.title || '') + '" placeholder="Insira aqui o título"><label>Descrição</label><textarea data-f="desc" placeholder="Insira uma descrição">' + E(a.desc || '') + '</textarea><div class="note">O WhatsApp monta o banner do link sozinho ao enviar.</div>' + sec(a, 'da', 'Aguarde para chamar a próxima ação por', 2);
    else if (k === 'list') body = '<div class="warn">* Funciona apenas para contatos</div><label>Título da lista (opcional)</label><input type="text" data-f="title" value="' + E(a.title || '') + '" placeholder="Ex: Menu de Almoço"><label>Descrição</label><textarea data-f="desc" placeholder="Descreva brevemente a lista">' + E(a.desc || '') + '</textarea><label>Itens (um por linha)</label><textarea data-items="1" placeholder="Opção 1&#10;Opção 2">' + E((a.items || []).join('\n')) + '</textarea><label>Rodapé (opcional)</label><input type="text" data-f="footer" value="' + E(a.footer || '') + '" placeholder="Ex: Delivery até 22h"><div class="note">Vai como lista numerada — o cliente responde com o número. Botões clicáveis de verdade não funcionam no WhatsApp Web.</div>' + sec(a, 'da', 'Aguarde para chamar a próxima ação por', 2);
    else if (k === 'tab_add' || k === 'tab_rm') body = '<select data-f="name">' + crmTabsOpts(a.name) + '</select>';
    else if (k === 'label_add' || k === 'label_rm') body = '<select data-f="name">' + labOpts(a.name) + '</select>';
    else if (k === 'wait') body = sec(a, 'sec', 'Esperar', 5);
    else if (k === 'typing' || k === 'recording') body = sec(a, 'sec', k === 'typing' ? 'Exibir "digitando…" por' : 'Exibir "gravando áudio…" por', 5);
    else if (k === 'ref') { const r = msgs.find(x => x.id === a.refId); body = '<div class="note">' + (r ? E(r.label) : 'resposta rápida removida') + '</div>'; }
    else body = '<div class="note">Executa automaticamente ao enviar.</div>';
    return '<div class="act" data-i="' + i + '"><div class="hd"><span>' + info.i + ' ' + E(info.l) + '</span><button data-mv="up" title="Subir">▲</button><button data-mv="dn" title="Descer">▼</button><button class="rm" data-rm="1" title="Remover ação">🗑</button></div>' + body + '</div>';
  }
  const catSelect = sel => '<select id="qc-cat"><option value="">Nenhuma selecionada</option>' + catList().map(([k, v]) => '<option value="' + k + '"' + (sel === k ? ' selected' : '') + '>' + E(v.l) + '</option>').join('') + '</select>';
  window.renderCreator = function () {
    const body = $q('cr-body'); body.className = 'qc'; let h = '';
    if (Q.mode === 'cat') {
      h = '<h4>' + (Q.catKey ? 'Editar Categoria' : 'Criar Categoria') + '</h4><label>Nome da categoria</label><input type="text" id="qc-catname" value="' + E(Q.catName) + '" placeholder="Ex: Modelos com Valores"><label>Cor</label><div class="pal">' + PALETTE.map(c => '<b data-pal="' + c + '" style="background:' + c + '" class="' + (Q.catColor === c ? 'on' : '') + '"></b>').join('') + '</div>'
        + '<div class="ctr"><button class="btn" id="qc-save">' + (Q.catKey ? 'Salvar' : 'Criar') + '</button>' + (Q.catKey ? ' <button class="btn g" id="qc-delcat" style="color:#ff6b6b">Excluir categoria</button>' : '') + '</div>';
    } else if (Q.mode === 'script') {
      h = '<h4>' + (Q.id ? 'Editar Script' : 'Criar Script') + '</h4><label>Título</label><input type="text" id="qc-title" value="' + E(Q.label) + '" placeholder="Digite o título do script"><div id="qc-emo-t"></div>'
        + '<label>Script <small style="opacity:.6">— junte várias respostas rápidas e dispare tudo de uma vez</small></label><div style="text-align:right;font-size:12px;color:#8b969c">Intervalo (s)</div>'
        + Q.actions.map((a, i) => { const r = msgs.find(x => x.id === a.refId); return '<div class="srow" data-i="' + i + '"><span>' + (r ? TYPE_ICO(r.actions) : '❓') + '</span><span class="nm">' + E(r ? r.label : '(removida)') + '</span><button data-mv="up" style="color:#aebac1">▲</button><button data-mv="dn" style="color:#aebac1">▼</button><input type="number" min="0" max="3600" data-f="iv" value="' + fval(a, 'iv', 1) + '"><button data-rm="1">🗑</button></div>'; }).join('')
        + '<div class="ctr"><button class="btn g" id="qc-addref" style="font-size:20px;padding:6px 14px">⊞</button></div><label>Selecione uma categoria</label>' + catSelect(Q.cat)
        + '<div class="ctr"><button class="btn" id="qc-save">' + (Q.id ? 'Salvar' : 'Criar') + '</button></div>';
    } else {
      h = '<h4>' + (Q.id ? 'Editar Resposta Rápida' : 'Criar Respostas Rápidas') + '</h4><label>Título</label><input type="text" id="qc-title" value="' + E(Q.label) + '" placeholder="Digite o título da resposta rápida"><div id="qc-emo-t"></div>'
        + '<div class="card"><h5>Ação do Resposta Rápida</h5><span class="tag" id="qc-tag" title="Clique para inserir #primeiroNome no texto">#Tags</span>'
        + (Q.actions.length ? Q.actions.map(actForm).join('') : '<div class="empty">📦<b>Nenhuma ação foi atribuída</b>Adicione ações para criar e configurar modelos de envio personalizados para seus clientes</div>')
        + '<div class="ctr"><button class="btn" id="qc-addact">Adicionar Ação</button></div></div><label>Selecione uma categoria</label>' + catSelect(Q.cat)
        + '<div class="ctr"><button class="btn" id="qc-save">' + (Q.id ? 'Salvar' : 'Criar') + '</button></div>';
    }
    body.innerHTML = h; body.scrollTop = body.scrollTop;
    try { // emojis
      const t = $q('qc-emo-t'); if (t && $q('qc-title')) { const w = buildEmojiPicker('qc-title'); w.style.cssText = 'display:block;margin-top:4px'; t.appendChild(w); }
      Q.actions.forEach((a, i) => { const h2 = $q('qa-emo-' + i); if (h2 && $q('qa-txt-' + i)) { const w = buildEmojiPicker('qa-txt-' + i); w.style.cssText = 'display:block;margin-top:4px'; h2.appendChild(w); } });
    } catch (e) {}
  };
  let lastTa = null;
  const cb = $q('cr-body');
  cb.addEventListener('focusin', e => { if (e.target.tagName === 'TEXTAREA' && e.target.dataset.f === 'txt') lastTa = e.target; });
  cb.addEventListener('input', e => {
    const t = e.target; if (!Q) return;
    if (t.id === 'qc-title') Q.label = t.value; if (t.id === 'qc-catname') Q.catName = t.value;
    const row = t.closest('[data-i]'); if (!row) return; const a = Q.actions[+row.dataset.i]; if (!a) return;
    if (t.dataset.items) a.items = t.value.split('\n').map(x => x.trim()).filter(Boolean);
    else if (t.dataset.f) a[t.dataset.f] = t.type === 'number' ? (t.value === '' ? '' : +t.value) : t.value;
  });
  cb.addEventListener('change', async e => {
    const t = e.target; if (!Q) return;
    if (t.id === 'qc-cat') { Q.cat = t.value; return; }
    const row = t.closest('[data-i]'); if (!row) return; const i = +row.dataset.i, a = Q.actions[i];
    if (t.dataset.file != null && t.files && t.files[0]) {
      const f = t.files[0]; const d = await new Promise((res, rej) => { const r = new FileReader(); r.onload = ev => res(ev.target.result); r.onerror = rej; r.readAsDataURL(f); });
      const k = a.fileKey || newKey(); if (!(await mediaPut(k, d))) { toast('⚠️ Não consegui guardar o arquivo (armazenamento)', '#e74c3c'); return; } a.fileKey = k; a._pv = d; delete a.fileDataUrl; a.fileMime = f.type; a.fileName = f.name; renderCreator(); toast('✅ ' + f.name);
    } else if (t.dataset.f) a[t.dataset.f] = t.type === 'number' ? +t.value : t.value;
  });
  cb.addEventListener('click', e => {
    const t = e.target; if (!Q) return;
    const pal = t.closest('[data-pal]'); if (pal) { Q.catColor = pal.dataset.pal; renderCreator(); return; }
    if (t.id === 'qc-tag') { const ta = lastTa && document.body.contains(lastTa) ? lastTa : cb.querySelector('textarea[data-f="txt"]'); if (ta) { const p = ta.selectionStart || ta.value.length; ta.value = ta.value.slice(0, p) + '#primeiroNome' + ta.value.slice(p); ta.dispatchEvent(new Event('input', { bubbles: true })); ta.focus(); } else toast('Adicione uma ação de texto primeiro'); return; }
    if (t.id === 'qc-addact') { e.stopPropagation(); openActMenu(t); return; }
    if (t.id === 'qc-addref') { openRefPicker(); return; }
    if (t.id === 'qc-save') { saveQ(); return; }
    if (t.id === 'qc-delcat') { if (confirm('Excluir a categoria "' + Q.catName + '"? As respostas ficam sem categoria.')) { delete CATS[Q.catKey]; msgs.forEach(m => { if (m.cat === Q.catKey) m.cat = ''; }); closeCreator(); renderPills(); renderMsgs(); try { saveAutoBackup(); } catch (x) {} } return; }
    const pk = t.closest('[data-pick]'); if (pk) { e.preventDefault(); const r = pk.closest('[data-i]'); const inp = r && r.querySelector('input[type=file]'); inp && inp.click(); return; }
    const row = t.closest('[data-i]'); if (!row) return; const i = +row.dataset.i;
    if (t.closest('[data-rm]')) { Q.actions.splice(i, 1); renderCreator(); }
    else if (t.closest('[data-mv]')) { const d = t.closest('[data-mv]').dataset.mv === 'up' ? -1 : 1; const j = i + d; if (j >= 0 && j < Q.actions.length) { const x = Q.actions[i]; Q.actions[i] = Q.actions[j]; Q.actions[j] = x; renderCreator(); } }
  });
  function openActMenu(anchor) {
    const html = GROUPS.map(g => '<div class="grp" data-g="' + g.id + '">' + g.ico + ' ' + g.l + '<span class="chev">▾</span></div><div class="subs" id="qg-' + g.id + '" style="display:none">' + g.items.map(it => '<div class="sub' + (it[3] ? ' red' : '') + '" data-p="' + it[0] + '">' + it[1] + ' ' + it[2] + '</div>').join('') + '</div>').join('') + '<div class="grp" style="opacity:.45" title="Só faz sentido com vários atendentes">↪ Transferir Atendimento<span class="chev">▾</span></div>';
    const m = popMenu(anchor, html, p => { closeMenus(); addAction(p); }, 'left'); m.style.maxHeight = '70vh'; m.style.overflow = 'auto';
    m.addEventListener('click', ev => { const g = ev.target.closest('[data-g]'); if (g) { const s = m.querySelector('#qg-' + g.dataset.g); const open = s.style.display !== 'none'; m.querySelectorAll('.subs').forEach(x => x.style.display = 'none'); s.style.display = open ? 'none' : 'block'; } });
  }
  function addAction(k) {
    const a = { k }; if (k === 'text') { a.ty = 5; a.da = 5; } if (FILEK[k]) { a.da = 3; if (k === 'audio') a.ty = 5; } if (k === 'contact') a.phone = '+55 ';
    if (k === 'wait') a.sec = 5; if (k === 'typing' || k === 'recording') a.sec = 5;
    Q.actions.push(a); renderCreator(); const cbx = $q('cr-body'); cbx.scrollTop = cbx.scrollHeight;
    if (FILEK[k]) { const inp = cbx.querySelector('.act[data-i="' + (Q.actions.length - 1) + '"] input[type=file]'); inp && inp.click(); }
  }
  function openRefPicker() {
    const pick = document.createElement('div'); pick.className = 'qr-pick';
    const draw = (q) => { pick.innerHTML = '<div class="bx"><div style="font-weight:700;margin-bottom:8px">Adicionar resposta rápida ao script</div><input type="text" id="qp-s" placeholder="Pesquisar" value="' + E(q || '') + '" style="width:100%;box-sizing:border-box;margin-bottom:8px;background:#12171a;border:1px solid #384046;color:#e9edef;border-radius:8px;padding:7px 9px">'
      + msgs.filter(m => m.type !== 'script' && m.id !== Q.id && (!q || String(m.label).toLowerCase().includes(q.toLowerCase()))).map(m => '<div class="it" data-ref="' + m.id + '">' + TYPE_ICO(m.actions) + ' ' + E(m.label) + '</div>').join('') + '<div style="text-align:right;margin-top:8px"><button class="btn g" data-x="1">Fechar</button></div></div>'; const s = pick.querySelector('#qp-s'); s.oninput = () => { draw(s.value); pick.querySelector('#qp-s').focus(); const v = pick.querySelector('#qp-s'); v.setSelectionRange(v.value.length, v.value.length); }; };
    draw(''); document.body.appendChild(pick);
    pick.addEventListener('click', e => { if (e.target === pick || e.target.dataset.x) { pick.remove(); return; } const r = e.target.closest('[data-ref]'); if (r) { Q.actions.push({ k: 'ref', refId: isNaN(+r.dataset.ref) ? r.dataset.ref : +r.dataset.ref, iv: 1 }); renderCreator(); toast('➕ adicionada ao script'); } });
  }
  function saveQ() {
    if (Q.mode === 'cat') {
      const nm = (Q.catName || '').trim(); if (!nm) { toast('⚠️ Digite o nome da categoria', '#e74c3c'); return; }
      const key = Q.catKey || ('c' + Date.now().toString(36)); CATS[key] = { l: nm, e: '🗂️', c: Q.catColor }; closeCreator(); renderPills(); renderMsgs(); toast('✅ Categoria "' + nm + '" salva'); try { saveAutoBackup(); } catch (e) {} return;
    }
    const title = (Q.label || '').trim(); if (!title) { toast('⚠️ Digite um título!', '#e74c3c'); return; }
    if (!Q.actions.length) { toast('⚠️ ' + (Q.mode === 'script' ? 'Adicione ao menos 1 resposta rápida' : 'Adicione ao menos 1 ação') + '!', '#e74c3c'); return; }
    const bad = Q.actions.find(a => FILEK[a.k] && !hasFile(a)); if (bad) { toast('⚠️ Escolha o arquivo de ' + KIND[bad.k].l, '#e74c3c'); return; }
    Q.actions.forEach(a => { delete a._pv; });
    const type = Q.mode === 'script' ? 'script' : 'msg';
    if (Q.id) { const i = msgs.findIndex(m => m.id === Q.id); if (i >= 0) msgs[i] = Object.assign({}, msgs[i], { label: title, cat: Q.cat, type, actions: Q.actions }); }
    else msgs.push({ id: Date.now(), label: title, cat: Q.cat, type, actions: Q.actions, uses: 0 });
    closeCreator(); renderPills(); renderMsgs(); toast('✅ "' + title + '" salvo!'); try { saveAutoBackup(); } catch (e) {}
  }

  // ───────────────────────── ⚙ MENU LATERAL ─────────────────────────
  (function () {
    const nav = $q('main-nav'); if (!nav) return;
    const tabEl = document.createElement('div'); tabEl.className = 'ntab'; tabEl.dataset.tab = 'qrcfg'; tabEl.title = 'Configurações do menu lateral'; tabEl.textContent = '⚙️'; nav.appendChild(tabEl);
    const s = document.createElement('div'); s.className = 'sec'; s.id = 'sec-qrcfg'; document.querySelector('.sec').parentNode.appendChild(s);
    let ui = { noMonitor: false, noSig: true, sigName: '', w: 380 };
    const save = () => { try { chrome.storage.local.set({ wcrm_ui: ui }); } catch (e) {} };
    const draw = () => { s.innerHTML = '<div class="qc" style="padding:14px"><h4>Menu Lateral Configurações</h4>'
      + '<div class="cfgrow"><span>Desabilitar monitor de envios</span><div class="sw' + (ui.noMonitor ? ' on' : '') + '" data-sw="noMonitor"></div></div>'
      + '<div class="cfgrow"><span>Desativar a assinatura</span><div class="sw' + (ui.noSig ? ' on' : '') + '" data-sw="noSig"></div></div>'
      + '<div class="cfgrow"><span>Personalizar o nome da assinatura</span><div class="sw' + (ui.sigName ? ' on' : '') + '" data-sw="sigOn"></div></div>' + (ui.sigName !== '' || s.dataset.sig ? '<input type="text" id="cfg-sig" placeholder="Nome na assinatura" value="' + E(ui.sigName) + '">' : '')
      + '<div style="margin:16px 4px 4px;font-size:14px">Tamanho do Menu Lateral: <b id="cfg-wv">' + ui.w + ' px</b></div><input type="range" id="cfg-w" min="300" max="700" step="10" value="' + ui.w + '" style="width:100%">'
      + '<div style="margin:16px 4px 6px;font-size:14px">Tema</div><div class="pal">' + [['black', 'Preto'], ['dark', 'Escuro'], ['light', 'Claro'], ['white', 'Branco']].map(t => '<button class="btn' + ((ui.theme || 'dark') === t[0] ? '' : ' g') + '" data-theme="' + t[0] + '" style="padding:6px 12px">' + t[1] + '</button>').join('') + '</div>'
      + '<div style="margin:12px 4px 6px;font-size:14px">Cor de destaque</div><div class="pal">' + ['#000000', '#ffffff', '#00a884', '#1d4ed8', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#14b8a6', '#84cc16'].map(c => '<b data-acc="' + c + '" style="background:' + c + ';border-color:' + (c === ui.acc ? '#888' : '#8884') + '"></b>').join('') + '<input type="color" id="cfg-acc" value="' + (ui.acc || '#00a884') + '" style="width:30px;height:30px;border:0;background:none;padding:0"></div>'
      + '<div style="margin:18px 0 6px;font-weight:700;font-size:14px">💾 Backup do CRM ZAMBONINI</div><div class="note">Exporte ou restaure tudo (respostas rápidas, categorias, mídias e configurações).</div><button class="btn" id="cfg-backup" style="margin-top:8px">Abrir backup</button>'
      + '<div class="note" style="margin-top:14px">O monitor de envios é a faixa “Ação (1/9)” com o botão Cancelar Envio. A assinatura, quando ligada, vai em negrito antes do texto.</div>'
      + '<div class="ctr"><button class="btn g" id="cfg-close" style="color:#ff6b6b;border:1px solid #ff6b6b;background:transparent">Fechar Menu</button></div></div>'; };
    const hc = document.getElementById('hdr-cfg'); if (hc) hc.addEventListener('click', () => tabEl.click());
    s.addEventListener('click', e => {
      const sw = e.target.closest('[data-sw]'); if (sw) { const k = sw.dataset.sw; if (k === 'sigOn') { if (ui.sigName) ui.sigName = ''; else { ui.sigName = ' '; ui.noSig = false; } s.dataset.sig = ui.sigName ? '1' : ''; } else ui[k] = !ui[k]; save(); draw(); return; }
      const th = e.target.closest('[data-theme]'); if (th) { ui.theme = th.dataset.theme; save(); window.__applyTheme(ui); draw(); return; }
      const ac = e.target.closest('[data-acc]'); if (ac) { ui.acc = ac.dataset.acc; save(); try { chrome.storage.local.set({ wcrm_acc: ui.acc }); } catch (x) {} window.__applyAcc(ui.acc); draw(); return; }
      if (e.target.id === 'cfg-close') window.parent.postMessage({ type: 'TOGGLE_PANEL' }, '*');
      if (e.target.id === 'cfg-backup') { const t = document.querySelector('.ntab[data-tab="backup"]'); t && t.click(); }
    });
    s.addEventListener('input', e => { if (e.target.id === 'cfg-acc') { ui.acc = e.target.value; save(); try { chrome.storage.local.set({ wcrm_acc: ui.acc }); } catch (x) {} window.__applyAcc(ui.acc); } if (e.target.id === 'cfg-w') { ui.w = +e.target.value; $q('cfg-wv').textContent = ui.w + ' px'; save(); } if (e.target.id === 'cfg-sig') { ui.sigName = e.target.value; save(); } });
    try { chrome.storage.local.get('wcrm_ui', o => { ui = Object.assign(ui, o.wcrm_ui || {}); s.dataset.sig = ui.sigName ? '1' : ''; draw(); }); } catch (e) { draw(); }
  })();

  window.__qrQ = () => Q;
  renderPills(); renderMsgs();
})();
