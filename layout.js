// WhatsApp CRM Pro v4.32 — layout.js
// Barra do topo (Etiquetas do WhatsApp / Abas do CRM) que filtra a lista de conversas, arrastar conversa para aba,
// barra da conversa (Abas, Etiquetas), menu lateral recolhível (agendar, lembrete, perfil, agente IA) e painel que "espreme" o WhatsApp.
(function () {
  'use strict';
  if (window.__wcrmLayout) return; window.__wcrmLayout = true;
  if (!document.body || !window.chrome || !chrome.storage) return;
  const BAR_H = 46, STRIP_H = 44, PANEL_W = 380;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const getURL = p => chrome.runtime.getURL(p);
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const W = () => window.__wcrm || {};
  const me = () => { try { return (W().getDisplayName && W().getDisplayName()) || ''; } catch (e) { return ''; } };
  const norm = s => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const toast = m => { try { W().toast && W().toast(m); } catch (e) {} };
  const iframe = () => document.getElementById('wcrm-iframe');
  const post = m => { const f = iframe(); if (f && f.contentWindow) f.contentWindow.postMessage(m, '*'); };
  const showPanel = () => { const w = document.getElementById('wcrm-wrap'); if (w && /100%/.test(w.style.transform)) { const b = document.getElementById('wcrm-btn'); b && b.click(); } };

  // ── CSS ──
  const st = document.createElement('style');
  st.textContent = `
    html.wcrm-bar body{padding-top:var(--wcrm-bh,${BAR_H}px) !important;box-sizing:border-box !important;}
    html.wcrm-bar #app{top:var(--wcrm-bh,${BAR_H}px) !important;height:calc(100vh - var(--wcrm-bh,${BAR_H}px)) !important;}
    html.wcrm-bar #wcrm-wrap{top:var(--wcrm-bh,${BAR_H}px) !important;}
    html.wcrm-open #app{width:calc(100vw - var(--wcrm-pw,${PANEL_W}px)) !important;}
    html.wcrm-left #app{left:56px !important;width:calc(100vw - 56px) !important;}
    html.wcrm-left.wcrm-open #app{width:calc(100vw - 56px - var(--wcrm-pw,${PANEL_W}px)) !important;}
    html.wcrm-open #wcrm-topbar{right:0;}
    #wcrm-left{position:fixed;left:0;top:0;bottom:0;width:56px;z-index:2147483641;background:#0d0f11;border-right:1px solid #2a3238;display:none;flex-direction:column;align-items:center;gap:8px;padding-top:10px;box-sizing:border-box;font-family:'Segoe UI',Arial,sans-serif;}
    html.wcrm-left #wcrm-left{display:flex;} html.wcrm-bar #wcrm-left{top:var(--wcrm-bh,${BAR_H}px);}
    #wcrm-left button{width:42px;height:42px;border-radius:12px;border:1px solid #2a3238;background:#181d21;color:#e9edef;font-size:19px;cursor:pointer;display:flex;align-items:center;justify-content:center;}
    #wcrm-left button:hover{background:#d4af37;color:#111;border-color:#d4af37;}
    #wcrm-start{position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.5);display:none;align-items:center;justify-content:center;font-family:'Segoe UI',Arial,sans-serif;}
    #wcrm-start.show{display:flex;} #wcrm-start .bx{background:#fff;color:#111;border-radius:16px;padding:22px 26px;width:min(440px,92vw);box-shadow:0 20px 60px rgba(0,0,0,.4);}
    #wcrm-start h3{margin:0 0 6px;font-size:20px;} #wcrm-start p{margin:0 0 14px;color:#555;font-size:14px;}
    #wcrm-start input{width:100%;padding:11px 12px;border:1px solid #cfd6db;border-radius:9px;font-size:15px;box-sizing:border-box;outline:none;} #wcrm-start input:focus{border-color:#1d4ed8;}
    #wcrm-start .bt{display:flex;gap:10px;justify-content:flex-end;margin-top:16px;} #wcrm-start button{border:none;border-radius:9px;padding:10px 20px;font-weight:700;font-size:14px;cursor:pointer;}
    #wcrm-start .go{background:#1d4ed8;color:#fff;} #wcrm-start .no{background:#eef0f2;color:#333;} #wcrm-start .er{color:#c0392b;font-size:13px;margin-top:8px;min-height:16px;}
    html.wcrm-strip #main{margin-top:${STRIP_H}px !important;height:calc(100% - ${STRIP_H}px) !important;}
    #wcrm-fab,#wcrm-inline-panel{display:none !important;}
    #wcrm-topbar,#wcrm-strip,#wcrm-rail,#wcrm-pop,#wcrm-minirail{font-family:'Segoe UI',Arial,sans-serif;box-sizing:border-box;}
    #wcrm-topbar{position:fixed;top:0;left:0;right:0;height:${BAR_H}px;z-index:2147483644;background:#0d0f11;border-bottom:1px solid #2a3238;display:none;align-items:center;gap:8px;padding:0 10px;}
    html.wcrm-bar #wcrm-topbar{display:flex;}
    #wcrm-topbar .tb-logo{height:30px;width:30px;object-fit:contain;border-radius:6px;flex-shrink:0;}
    #wcrm-topbar .tb-chips{flex:1;min-width:0;display:flex;gap:6px;overflow-x:auto;overflow-y:hidden;scrollbar-width:thin;scrollbar-color:var(--wcrm-acc,#d4af37) transparent;align-items:center;padding-bottom:2px;}
    #wcrm-topbar .tb-chips::-webkit-scrollbar{height:7px;} #wcrm-topbar .tb-chips::-webkit-scrollbar-thumb{background:var(--wcrm-acc,#d4af37);border-radius:6px;} #wcrm-topbar .tb-chips::-webkit-scrollbar-track{background:transparent;}
    #wcrm-topbar .tb-chip{flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;padding:5px 6px 5px 12px;border-radius:999px;border:1px solid #3a434a;background:#181d21;color:#e9edef;font-size:12.5px;font-weight:600;cursor:pointer;white-space:nowrap;}
    #wcrm-topbar .tb-chip:hover{border-color:#d4af37;}
    #wcrm-topbar .tb-chip.on{background:#d4af37;border-color:#d4af37;color:#111;}
    #wcrm-topbar .tb-chip.drop{background:#2d3a1e;border-color:#84cc16;box-shadow:0 0 0 2px #84cc16;}
    #wcrm-topbar .tb-chip b{background:#d4af37;color:#111;border-radius:999px;min-width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;padding:0 5px;}
    #wcrm-topbar .tb-chip.on b{background:#111;color:#d4af37;}
    #wcrm-topbar .tb-mode{flex:0 0 auto;font-size:10px;font-weight:800;letter-spacing:.5px;color:#d4af37;border:1px solid #5b4b17;border-radius:6px;padding:3px 6px;text-transform:uppercase;}
    #wcrm-topbar .tb-empty{color:#8696a0;font-size:12px;}
    #wcrm-topbar .tb-btn{flex:0 0 auto;width:32px;height:32px;border-radius:9px;border:1px solid #2a3238;background:#181d21;color:#cfd6db;cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;}
    #wcrm-topbar .tb-btn:hover{border-color:#d4af37;color:#d4af37;}
    #wcrm-tabopen{position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:2147483644;background:#0d0f11;border:1px solid #2a3238;color:#d4af37;border-radius:0 0 10px 10px;font-size:11px;padding:1px 14px;cursor:pointer;display:none;font-family:'Segoe UI',Arial,sans-serif;}
    html:not(.wcrm-bar) #wcrm-tabopen{display:block;}
    #wcrm-strip{position:fixed;z-index:2147483642;height:${STRIP_H}px;display:none;align-items:center;gap:8px;padding:0 12px;background:#0d0f11;border-bottom:1px solid #2a3238;}
    html.wcrm-strip #wcrm-strip.show{display:flex;}
    #wcrm-strip button{position:relative;height:32px;min-width:34px;padding:0 9px;border-radius:9px;border:1px solid #2a3238;background:#181d21;color:#d4af37;font-size:15px;cursor:pointer;display:flex;align-items:center;gap:5px;font-weight:600;}
    #wcrm-strip button:hover{background:#d4af37;color:#111;}
    #wcrm-strip button.on{background:#d4af37;color:#111;}
    #wcrm-strip button i{font-style:normal;position:absolute;top:-5px;right:-5px;background:#d4af37;color:#111;border-radius:999px;min-width:16px;height:16px;font-size:10px;display:flex;align-items:center;justify-content:center;padding:0 4px;}
    #wcrm-stripopen{position:fixed;top:var(--wcrm-bh,${BAR_H}px);right:240px;z-index:2147483642;background:#0d0f11;border:1px solid #2a3238;border-top:none;color:#d4af37;border-radius:0 0 8px 8px;font-size:10px;padding:1px 10px;cursor:pointer;display:none;font-family:'Segoe UI',Arial,sans-serif;}
    html:not(.wcrm-strip) #wcrm-stripopen{display:block;}
    #wcrm-strip .hint{font-size:11px;color:#8696a0;margin-left:auto;} #wcrm-strip .min{margin-left:8px;min-width:30px;padding:0 8px;font-size:13px;}
    #wcrm-rail{position:fixed;z-index:2147483643;display:flex;flex-direction:column;gap:8px;padding:8px 6px;background:#0d0f11f2;border:1px solid #2a3238;border-radius:14px;box-shadow:0 6px 20px rgba(0,0,0,.5);}
    #wcrm-rail button,#wcrm-minirail{width:38px;height:38px;border-radius:11px;border:1px solid #2a3238;background:#181d21;color:#d4af37;font-size:17px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .12s;box-shadow:0 1px 3px rgba(0,0,0,.2);}
    #wcrm-rail button:hover,#wcrm-minirail:hover{background:#d4af37;color:#111;transform:scale(1.06);}
    #wcrm-rail button.on{background:#d4af37;color:#111;}
    #wcrm-rail .sep{height:1px;background:#2a3238;margin:1px 4px;}
    #wcrm-minirail{position:fixed;z-index:2147483643;display:none;}
    #wcrm-pop{position:fixed;z-index:2147483647;min-width:230px;max-width:300px;max-height:60vh;overflow:auto;background:#14181c;color:#e9edef;border:1px solid #2a3238;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.6);padding:6px;display:none;}
    #wcrm-pop .it{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;cursor:pointer;font-size:13px;}
    #wcrm-pop .it:hover{background:#26303a;}
    #wcrm-pop .it .ck{width:16px;color:#16a34a;font-weight:800;}
    #wcrm-pop .cn{background:#d4af37;color:#111;border-radius:99px;font-size:10px;font-weight:800;padding:1px 7px;} #wcrm-pop .ck{color:#d4af37!important;}
    #wcrm-pop .ttl{font-size:11px;color:#8696a0;padding:4px 10px;text-transform:uppercase;letter-spacing:.5px;}
    #wcrm-pop input{width:100%;padding:7px 9px;background:#0f1316;color:#e9edef;border:1px solid #38424a;border-radius:8px;font-size:13px;outline:none;margin-top:4px;}
  `;
  document.head.appendChild(st);

  // ── barra do topo ──
  const bar = document.createElement('div'); bar.id = 'wcrm-topbar';
  bar.innerHTML = `<img class="tb-logo" src="${getURL('icons/icon128.png')}" alt=""><button class="tb-btn" id="wcrm-tb-funnel" title="Filtro Funil"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 5h18l-7 8v6l-4-2v-4z"/></svg></button><span class="tb-mode" id="wcrm-mode"></span><div class="tb-chips" id="wcrm-chips"><span class="tb-empty">Carregando…</span></div>
    <button class="tb-btn" id="wcrm-tb-add" title="Nova aba" style="display:none">＋</button>
    <button class="tb-btn" id="wcrm-tb-refresh" title="Atualizar">↻</button><button class="tb-btn" id="wcrm-tb-sales" title="Vendas marcadas (etiqueta virtual)">💰</button><button class="tb-btn" id="wcrm-tb-menu" title="Menu">≡</button>`;
  document.body.appendChild(bar);
  const reopen = document.createElement('div'); reopen.id = 'wcrm-tabopen'; reopen.textContent = '⌄ etiquetas e abas'; reopen.title = 'Mostrar barra';
  document.body.appendChild(reopen);
  const so = document.createElement('div'); so.id = 'wcrm-stripopen'; so.textContent = '▾ barra'; so.title = 'Mostrar barra da conversa'; document.body.appendChild(so);
  so.addEventListener('click', () => setStrip(true));
  const pop = document.createElement('div'); pop.id = 'wcrm-pop'; document.body.appendChild(pop);

  const setBar = on => { document.documentElement.classList.toggle('wcrm-bar', on); lsSet('wcrm_bar', on ? '1' : '0'); placeAll(); };
  const setStrip = on => { document.documentElement.classList.toggle('wcrm-strip', on); lsSet('wcrm_strip', on ? '1' : '0'); placeAll(); };
  reopen.addEventListener('click', () => setBar(true));

  let mode = lsGet('wcrm_mode') === 'tabs' ? 'tabs' : 'labels';
  let activeChip = null; // {mode,name}
  let barData = { labels: [], tabs: [] };

  // ── filtro da lista de conversas ──
  const domHidden = [];
  function domFilter(names) {
    domClear();
    const set = new Set(names.map(norm));
    document.querySelectorAll('#pane-side [role="listitem"], #pane-side [role="row"]').forEach(r => {
      const t = r.querySelector('span[title]'); const n = t ? norm(t.getAttribute('title')) : '';
      if (n && !set.has(n)) { r.style.display = 'none'; domHidden.push(r); }
    });
  }
  function domClear() { while (domHidden.length) { const r = domHidden.pop(); r.style.display = ''; } }

  async function applyFilter() {
    domClear();
    if (!activeChip) { hideList(); return; }
    startList();
  }

  // ── LISTA PRÓPRIA (compacta) da aba/etiqueta: lê as conversas direto do WhatsApp, sem buracos e sem depender do filtro interno dele ──
  const tlCss = document.createElement('style');
  tlCss.textContent = '#wcrm-tabview{position:fixed;z-index:2147483640;display:none;flex-direction:column;overflow:hidden;box-sizing:border-box;font-family:Segoe UI,Helvetica Neue,Arial,sans-serif}'
    + '#wcrm-tabview .tl-h{flex:none;display:flex;align-items:center;gap:8px;padding:8px 16px;font-size:12.5px;opacity:.75;border-bottom:1px solid rgba(128,128,128,.18)}#wcrm-tabview .tl-h b{flex:1;font-weight:600}#wcrm-tabview .tl-h button{border:1px solid rgba(128,128,128,.4);background:transparent;color:inherit;border-radius:8px;padding:3px 10px;font-size:12px;cursor:pointer}'
    + '#wcrm-tabview .tl-b{flex:1;overflow-y:auto}#wcrm-tabview .tl-row{display:flex;gap:13px;padding:6px 14px;min-height:72px;box-sizing:border-box;align-items:center;cursor:pointer;border-bottom:1px solid rgba(128,128,128,.1)}#wcrm-tabview .tl-row:hover{background:rgba(128,128,128,.12)}#wcrm-tabview .tl-row.act{background:rgba(128,128,128,.2)}'
    + '#wcrm-tabview .tl-av{width:49px;height:49px;border-radius:50%;background:#2a3942 center/cover no-repeat;flex:none;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;color:#cfd6db}'
    + '#wcrm-tabview .tl-m{flex:1;min-width:0}#wcrm-tabview .tl-t1{display:flex;justify-content:space-between;gap:8px;align-items:baseline}#wcrm-tabview .tl-n{font-size:16.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#wcrm-tabview .tl-tm{font-size:12px;opacity:.7;flex:none}'
    + '#wcrm-tabview .tl-t2{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:3px}#wcrm-tabview .tl-p{font-size:14px;opacity:.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#wcrm-tabview .tl-u{background:#25d366;color:#111;border-radius:99px;font-size:12px;font-weight:700;padding:1px 7px;flex:none}'
    + '#wcrm-tabview .tl-l{display:flex;gap:4px;flex-wrap:wrap;margin-top:3px;max-height:20px;overflow:hidden}#wcrm-tabview .tl-l span{font-size:10.5px;font-weight:700;color:#fff;border-radius:5px;padding:1px 6px;text-transform:uppercase;white-space:nowrap}#wcrm-tabview .tl-e{padding:34px 22px;text-align:center;opacity:.65;font-size:14px;line-height:1.5}';
  document.head.appendChild(tlCss);
  const tl = document.createElement('div'); tl.id = 'wcrm-tabview'; document.body.appendChild(tl);
  let tlTimer = null, tlBusy = false, tlSig = '';
  const fmtT = ts => { if (!ts) return ''; const d = new Date(ts), n = new Date(); const p = x => String(x).padStart(2, '0');
    if (d.toDateString() === n.toDateString()) return p(d.getHours()) + ':' + p(d.getMinutes());
    const y = new Date(n); y.setDate(n.getDate() - 1); if (d.toDateString() === y.toDateString()) return 'Ontem';
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + String(d.getFullYear()).slice(2); };
  function listNames() {
    if (!activeChip) return [];
    if (activeChip.mode === 'labels') { const br = W().getBridge && W().getBridge(); return ((br && br.chats) || []).filter(c => (c.labels || []).some(l => norm(l) === norm(activeChip.name))).map(c => c.name); }
    if (activeChip.mode === 'sales') return Object.values(sales.marks || {}).filter(m => !activeChip.name || m.day === activeChip.name).sort((x, y) => (y.at || 0) - (x.at || 0)).map(m => m.name);
    const tab = (barData.tabs || []).find(t => t.name === activeChip.name); return (tab && tab.contacts) || [];
  }
  function placeList() {
    const ps = document.getElementById('pane-side'); if (!ps) return false;
    const r = ps.getBoundingClientRect(); if (!r.width || !r.height) return false;
    tl.style.left = r.left + 'px'; tl.style.top = r.top + 'px'; tl.style.width = r.width + 'px'; tl.style.height = r.height + 'px';
    let bg = '', el = ps; while (el && el !== document.documentElement) { const c = getComputedStyle(el).backgroundColor; if (c && !/rgba?\(0, 0, 0, 0\)|transparent/.test(c)) { bg = c; break; } el = el.parentElement; }
    tl.style.background = bg || '#111b21';
    const sp = ps.querySelector('span[title]'); tl.style.color = sp ? getComputedStyle(sp).color : '#e9edef';
    return true;
  }
  function hideList() { clearInterval(tlTimer); tlTimer = null; tl.style.display = 'none'; tl.innerHTML = ''; tlSig = ''; }
  function startList() { clearInterval(tlTimer); tlSig = ''; drawList(true); tlTimer = setInterval(() => drawList(false), 4000); }
  async function drawList(force) {
    if (tlBusy) return; tlBusy = true;
    try {
      if (!activeChip) { hideList(); return; }
      const sb = document.querySelector('#side [contenteditable="true"]');
      if (sb && (sb.textContent || '').trim()) { tl.style.display = 'none'; return; }   // pesquisando: deixa o WhatsApp mostrar
      if (!placeList()) { tl.style.display = 'none'; return; }
      const names = listNames(); const ok = W().bridgeOk && W().bridgeOk();
      let rows = [], miss = 0;
      if (names.length && ok) { const r = await W().bridgeCall('LISTINFO', { names }, 8000); if (r && r.ok) { rows = r.chats || []; miss = (r.missing || []).length; } }
      if (!rows.length && names.length) rows = names.map(n => ({ n, id: '', t: 0, unread: 0, last: '', pic: '' }));
      const brL = W().getBridge && W().getBridge(); const labBy = new Map(); const labCol = new Map();
      ((brL && brL.chats) || []).forEach(c => labBy.set(norm(c.name), c.labels || [])); ((brL && brL.labels) || []).forEach(l => labCol.set(norm(l.name), l.color));
      rows.forEach(r => { r.labels = labBy.get(norm(r.n)) || []; });
      rows.sort((a, b) => ((b.pin ? 1 : 0) - (a.pin ? 1 : 0)) || (b.t - a.t));
      const sig = JSON.stringify([activeChip, rows.map(r => [r.id || r.n, r.t, r.unread, r.last, r.active, r.pic ? 1 : 0, (r.labels || []).join(',')]), miss]);
      if (!force && sig === tlSig && tl.style.display === 'flex') return; tlSig = sig;
      const title = activeChip.mode === 'sales' ? '💰 Vendas' + (activeChip.name ? ' ' + esc(activeChip.name) : ' marcadas') : (activeChip.mode === 'labels' ? '🏷️ ' : '📂 ') + esc(activeChip.name);
      tl.innerHTML = '<div class="tl-h"><b>' + title + ' · ' + rows.length + ' conversa' + (rows.length === 1 ? '' : 's') + (miss ? ' (' + miss + ' não achada' + (miss > 1 ? 's' : '') + ')' : '') + '</b><button data-tl="all">✕ Mostrar tudo</button></div><div class="tl-b">'
        + (rows.length ? rows.map(r => '<div class="tl-row' + (r.active ? ' act' : '') + '" data-id="' + esc(r.id || '') + '" data-n="' + esc(r.n) + '"><div class="tl-av"' + (r.pic ? ' style="background-image:url(\'' + esc(r.pic) + '\')"' : '') + '>' + (r.pic ? '' : esc((r.n || '?').trim().charAt(0).toUpperCase())) + '</div><div class="tl-m"><div class="tl-t1"><span class="tl-n">' + esc(r.n) + '</span><span class="tl-tm">' + esc(fmtT(r.t)) + '</span></div><div class="tl-t2"><span class="tl-p">' + (r.mine ? '✓ ' : '') + esc(r.last || '') + '</span>' + (r.unread ? '<span class="tl-u">' + r.unread + '</span>' : '') + '</div>' + ((r.labels || []).length || saleOf(r.n) ? '<div class="tl-l">' + (saleOf(r.n) ? '<span style="background:#d4af37;color:#111">💰 VENDA ' + esc(saleOf(r.n).day) + '</span>' : '') + (r.labels || []).map(l => '<span style="background:' + esc(labCol.get(norm(l)) || '#3a434a') + '">' + esc(l) + '</span>').join('') + '</div>' : '') + '</div></div>').join('')
          : '<div class="tl-e">' + (activeChip.mode === 'sales' ? 'Nenhuma venda marcada' + (activeChip.name ? ' em ' + esc(activeChip.name) : '') + '.<br>Abra a conversa do cliente e clique em 💰 na barra da conversa.' : 'Essa ' + (activeChip.mode === 'labels' ? 'etiqueta' : 'aba') + ' está vazia.<br>Arraste uma conversa para ela ou use o botão de aba no cabeçalho da conversa.') + '</div>') + '</div>';
      tl.style.display = 'flex';
    } catch (e) { } finally { tlBusy = false; }
  }
  tl.addEventListener('click', async e => {
    if (e.target.closest('[data-tl="all"]')) { activeChip = null; renderChips(); hideList(); return; }
    const row = e.target.closest('.tl-row'); if (!row) return;
    try { const r = await W().bridgeCall('OPEN', { chat: row.dataset.id || row.dataset.n }, 8000); if (!(r && r.ok)) toast('⚠️ Não consegui abrir essa conversa'); } catch (x) {}
    setTimeout(() => drawList(true), 600);
  });
  // clicar nos filtros do próprio WhatsApp (Tudo, Não lidas, Favoritas, Grupos…) sai da aba
  document.addEventListener('click', e => {
    if (!activeChip || tl.contains(e.target)) return;
    const b = e.target.closest && e.target.closest('#side button, #side [role="button"], #side [role="tab"], #side [role="radio"]'); if (!b) return;
    if (/^(tudo|n[aã]o lidas|favoritas|grupos|rascunhos|comunidades|listas)\b/i.test((b.innerText || '').trim())) { activeChip = null; renderChips(); hideList(); }
  }, true);
  window.addEventListener('resize', () => { if (activeChip) placeList(); });
  document.addEventListener('wcrm-bridge', () => { if (activeChip) drawList(false); });

  function chipList() {
    if (mode === 'labels') {
      const br = W().getBridge && W().getBridge();
      if (br && br.ok) return br.labels.map(l => ({ name: l.name, count: l.count }));
      return (barData.labels || []).filter(l => l.wa).map(l => ({ name: l.name, count: l.count }));
    }
    return (barData.tabs || []).map(t => ({ name: t.name, count: t.count }));
  }
  function chipHtml(c) { return `<button class="tb-chip${activeChip && activeChip.mode === mode && activeChip.name === c.name ? ' on' : ''}" data-n="${esc(c.name)}">${esc(c.name)}<b>${c.count || 0}</b></button>`; }
  function renderChips() {
    const el = document.getElementById('wcrm-chips'); if (!el) return;
    document.getElementById('wcrm-mode').textContent = mode === 'labels' ? 'Etiquetas' : 'Abas';
    document.getElementById('wcrm-tb-add').style.display = mode === 'tabs' ? 'flex' : 'none';
    updateSaleBtn();
    const all = chipList();
    const list = all;
    if (!list.length) {
      const br = W().getBridge && W().getBridge();
      el.innerHTML = '<button class="tb-chip' + (!activeChip ? ' on' : '') + '" data-all="1">Tudo</button>' + '<span class="tb-empty">' + (mode === 'tabs' ? 'Nenhuma aba — clique em ＋ para criar e arraste conversas para ela.' : (br && !br.ok ? 'Sem etiquetas: ' + esc(br.reason) : 'Sem etiquetas ainda (WhatsApp Business → crie etiquetas).')) + '</span>';
      return;
    }
    el.innerHTML = '<button class="tb-chip' + (!activeChip ? ' on' : '') + '" data-all="1">Tudo</button>' + list.map(chipHtml).join('');
  }
  const on2 = (t, fn) => document.getElementById('wcrm-chips').addEventListener(t, fn);
  // roda do mouse = rola as abas para o lado; a aba escolhida sempre fica visível
  document.getElementById('wcrm-chips').addEventListener('wheel', e => { const c = e.currentTarget; if (c.scrollWidth > c.clientWidth) { c.scrollLeft += (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY); e.preventDefault(); } }, { passive: false });
  on2('click', e => {
    const b = e.target.closest('.tb-chip'); if (!b) return;
    if (b.dataset.all) { activeChip = null; renderChips(); applyFilter(); return; }
    const n = b.dataset.n;
    activeChip = { mode, name: n };   // clicar noutra aba troca direto; para sair, use "Tudo"
    renderChips(); applyFilter();
    try { const on = document.querySelector('#wcrm-topbar .tb-chip.on'); on && on.scrollIntoView({ inline: 'nearest', block: 'nearest' }); } catch (x) {}
  });
  // editar / excluir aba (botão direito ou duplo clique na aba)
  function patchRules(oldN, newN) {
    try {
      chrome.storage.local.get('wcrm_cfg', o => {
        const cfg = o.wcrm_cfg; if (!cfg || !cfg.rules) return; let ch = 0;
        const walk = x => {
          if (Array.isArray(x)) { x.forEach(walk); return; }
          if (!x || typeof x !== 'object') return;
          Object.keys(x).forEach(k => {
            const v = x[k];
            if ((k === 'name' || k === 'tab') && v === oldN) { x[k] = newN; ch++; }
            else if ((k === 'excludeTabs' || k === 'tabs') && Array.isArray(v)) { v.forEach((t, i) => { if (t === oldN) { v[i] = newN; ch++; } }); }
            else walk(v);
          });
        };
        walk(cfg.rules); if (ch) chrome.storage.local.set({ wcrm_cfg: cfg });
      });
    } catch (e) {}
  }
  function tabMenu(chip, x, y) {
    const n = chip.dataset.n; if (!n || mode !== 'tabs') return;
    const r = chip.getBoundingClientRect();
    popAt(chip, `<div class="ttl">Aba “${esc(n)}”</div><div class="it" data-te="ren">✏️ Renomear</div><div class="it" data-te="del">🗑️ Excluir aba</div>`, 'left');
    pop.dataset.tabn = n;
  }
  on2('contextmenu', e => { const b = e.target.closest('.tb-chip'); if (!b || b.dataset.all || mode !== 'tabs') return; e.preventDefault(); tabMenu(b); });
  on2('dblclick', e => { const b = e.target.closest('.tb-chip'); if (!b || b.dataset.all || mode !== 'tabs') return; e.preventDefault(); tabMenu(b); });


  // ── 💰 VENDA: etiqueta virtual do sistema (não é aba do CRM nem etiqueta do WhatsApp) ──
  let sales = { marks: {} };
  const pad2 = n => String(n).padStart(2, '0');
  const dayLbl = off => { const d = new Date(); d.setDate(d.getDate() - (off || 0)); return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + String(d.getFullYear()).slice(2); };
  const normDay = v => { v = String(v || '').trim().replace(/^vendas\s+/i, ''); let m = v.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/); if (!m) return v; const y = m[3] ? m[3].slice(-2) : String(new Date().getFullYear()).slice(2); return pad2(+m[1]) + '/' + pad2(+m[2]) + '/' + y; };
  const todayLbl = () => dayLbl(0);
  const salesSave = () => { try { chrome.storage.local.set({ wcrm_sales: sales }); } catch (e) {} };
  const saleOf = n => (sales.marks || {})[norm(n)];
  const salesCss = document.createElement('style');
  salesCss.textContent = '.wcrm-vb{position:absolute;right:12px;bottom:6px;background:rgba(212,175,55,.14);color:#d9bb5a;border:1px solid rgba(212,175,55,.4);font:600 9.5px/1.45 Segoe UI,Arial,sans-serif;border-radius:5px;padding:0 5px;z-index:3;pointer-events:none}'
    + '#wcrm-salesm{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.55);display:none;align-items:flex-start;justify-content:center;padding-top:70px;font-family:Segoe UI,Helvetica Neue,Arial,sans-serif}#wcrm-salesm.show{display:flex}'
    + '#wcrm-salesm .sm-c{background:#14181c;color:#e9edef;border:1px solid #2a3238;border-radius:14px;width:min(560px,94vw);max-height:80vh;overflow:auto;padding:16px;box-shadow:0 14px 40px rgba(0,0,0,.7)}'
    + '#wcrm-salesm h2{margin:0 0 4px;font-size:17px;color:#d4af37}#wcrm-salesm .sm-s{font-size:12px;color:#9aa6ad;margin-bottom:12px}'
    + '#wcrm-salesm .sm-d{border:1px solid #2a3238;border-radius:10px;margin-bottom:10px;overflow:hidden}#wcrm-salesm .sm-h{display:flex;align-items:center;gap:8px;background:#1b2127;padding:8px 10px;font-weight:800;font-size:13px}#wcrm-salesm .sm-h b{flex:1}'
    + '#wcrm-salesm button{border:1px solid #3a434a;background:#181d21;color:#e9edef;border-radius:8px;font-size:11.5px;font-weight:700;padding:4px 9px;cursor:pointer}#wcrm-salesm button:hover{border-color:#d4af37;color:#d4af37}'
    + '#wcrm-salesm .sm-n{display:flex;align-items:center;gap:8px;padding:6px 10px;border-top:1px solid #222a30;font-size:13px}#wcrm-salesm .sm-n span{flex:1;cursor:pointer}#wcrm-salesm .sm-n span:hover{color:#d4af37}#wcrm-salesm .sm-n i{color:#f87171;cursor:pointer;font-style:normal}'
    + '#wcrm-salesm .sm-e{color:#9aa6ad;padding:18px 6px;text-align:center;font-size:13px}';
  document.head.appendChild(salesCss);
  const sm = document.createElement('div'); sm.id = 'wcrm-salesm'; document.body.appendChild(sm);
  function decorateRows() {
    const ps = document.getElementById('pane-side'); if (!ps) return;
    ps.querySelectorAll('[role="listitem"], [role="row"]').forEach(row => {
      const t = row.querySelector('span[title]'); const nm = t && t.getAttribute('title'); const m = nm && saleOf(nm); let b = row.querySelector('.wcrm-vb');
      if (m) { if (!b) { b = document.createElement('span'); b.className = 'wcrm-vb'; if (getComputedStyle(row).position === 'static') row.style.position = 'relative'; row.appendChild(b); } const tx = '💰 Venda ' + m.day; if (b.textContent !== tx) b.textContent = tx; }
      else if (b) b.remove();
    });
  }
  function updateSaleBtn() {
    const vb = document.getElementById('wcrm-vbtn'); if (!vb) return; const m = me() && saleOf(me());
    vb.style.background = m ? '#d4af37' : ''; vb.style.color = m ? '#111' : ''; const l = document.getElementById('wcrm-vlabel'); if (l) l.textContent = m ? ' ' + m.day : '';
    vb.title = m ? 'Venda de ' + m.day + ' — clique para mudar a data ou tirar a marcação' : 'Marcar esta conversa como VENDA de hoje (etiqueta virtual do CRM)';
  }
  function salesChanged() { decorateRows(); updateSaleBtn(); if (activeChip && activeChip.mode === 'sales') startList(); if (sm.classList.contains('show')) drawSalesModal(); }
  function markSale(n, day) { if (!n) return; sales.marks = sales.marks || {}; sales.marks[norm(n)] = { name: n, day: day || todayLbl(), at: Date.now() }; salesSave(); salesChanged(); }
  function unmarkSale(n) { if (sales.marks && sales.marks[norm(n)]) { delete sales.marks[norm(n)]; salesSave(); salesChanged(); } }
  let smEdit = null;
  function drawSalesModal() {
    const by = {}; Object.values(sales.marks || {}).forEach(m => { (by[m.day] = by[m.day] || []).push(m); });
    const days = Object.keys(by).sort((a, b) => Math.max(...by[b].map(x => x.at || 0)) - Math.max(...by[a].map(x => x.at || 0)));
    sm.innerHTML = '<div class="sm-c"><div style="display:flex;align-items:center"><h2 style="flex:1">💰 Vendas marcadas</h2><button data-sm="close">✕ Fechar</button></div><div class="sm-s">✏️ renomeia · 🗑 exclui a etiqueta. Etiqueta virtual do CRM — não mistura com abas nem etiquetas do WhatsApp. Marque pelo botão 💰 na barra da conversa.</div>'
      + (days.length ? days.map(d => '<div class="sm-d"><div class="sm-h"><b>Vendas ' + esc(d) + ' · ' + by[d].length + '</b><button data-sm="view" data-d="' + esc(d) + '">👁 Ver</button><button data-sm="copy" data-d="' + esc(d) + '">📋 Copiar</button><button data-sm="ren" data-d="' + esc(d) + '">✏️</button><button data-sm="del" data-d="' + esc(d) + '" style="' + (smEdit && smEdit.k === 'del' && smEdit.d === d ? 'border-color:#f87171;color:#f87171' : '') + '">' + (smEdit && smEdit.k === 'del' && smEdit.d === d ? 'Confirmar excluir?' : '🗑') + '</button></div>' + (smEdit && smEdit.k === 'ren' && smEdit.d === d ? '<div class="sm-n"><input id="wcrm-smren" data-d="' + esc(d) + '" maxlength="24" value="' + esc(d) + '" style="flex:1;background:#0f1215;color:#e9edef;border:1px solid #3a434a;border-radius:8px;padding:6px 8px"><span style="flex:0;font-size:11px;color:#9aa6ad;white-space:nowrap">Enter salva</span></div>' : '') + by[d].sort((x, y) => (y.at || 0) - (x.at || 0)).map(m => '<div class="sm-n"><span data-sm="open" data-n="' + esc(m.name) + '">' + esc(m.name) + '</span><i data-sm="rm" data-n="' + esc(m.name) + '" title="Tirar marcação">✕</i></div>').join('') + '</div>').join('') : '<div class="sm-e">Nenhuma venda marcada ainda.<br>Abra a conversa do cliente e clique em 💰.</div>')
      + '<div style="display:flex;gap:8px;margin-top:6px"><button data-sm="all">👁 Ver todas na lista</button><button data-sm="mark">＋ Marcar conversa aberta (hoje)</button></div></div>';
  }
  sm.addEventListener('keydown', e => {
    if (e.target.id === 'wcrm-smren' && e.key === 'Enter') { const v = normDay(e.target.value), from = e.target.dataset.d; if (v && v !== from) { Object.values(sales.marks || {}).forEach(m => { if (m.day === from) m.day = v; }); salesSave(); salesChanged(); toast('✏️ Etiqueta renomeada: ' + v); } smEdit = null; drawSalesModal(); }
    if (e.key === 'Escape' && smEdit) { smEdit = null; drawSalesModal(); }
  });
  const openSalesModal = () => { smEdit = null; drawSalesModal(); sm.classList.add('show'); };
  sm.addEventListener('click', e => {
    const b = e.target.closest('[data-sm]'); if (!b) { if (e.target === sm) sm.classList.remove('show'); return; } const k = b.dataset.sm;
    if (k === 'close') sm.classList.remove('show');
    else if (k === 'view') { sm.classList.remove('show'); activeChip = { mode: 'sales', name: b.dataset.d }; renderChips(); applyFilter(); }
    else if (k === 'all') { sm.classList.remove('show'); activeChip = { mode: 'sales', name: '' }; renderChips(); applyFilter(); }
    else if (k === 'copy') { const n = Object.values(sales.marks || {}).filter(m => m.day === b.dataset.d).map(m => m.name); try { navigator.clipboard.writeText(n.join('\n')).then(() => toast('📋 ' + n.length + ' nome(s) copiado(s)'), () => toast('⚠️ Não consegui copiar')); } catch (x) { toast('⚠️ Não consegui copiar'); } }
    else if (k === 'rm') unmarkSale(b.dataset.n);
    else if (k === 'ren') { smEdit = { k: 'ren', d: b.dataset.d }; drawSalesModal(); setTimeout(() => { const i = document.getElementById('wcrm-smren'); i && (i.focus(), i.select()); }, 30); }
    else if (k === 'del') {
      if (smEdit && smEdit.k === 'del' && smEdit.d === b.dataset.d) { Object.keys(sales.marks || {}).forEach(x => { if (sales.marks[x].day === b.dataset.d) delete sales.marks[x]; }); smEdit = null; salesSave(); salesChanged(); toast('🗑 Etiqueta "' + b.dataset.d + '" excluída (as conversas continuam, só sem a marcação)'); }
      else { smEdit = { k: 'del', d: b.dataset.d }; drawSalesModal(); }
    }
    else if (k === 'open') { sm.classList.remove('show'); try { W().bridgeCall('OPEN', { chat: b.dataset.n }, 8000); } catch (x) {} }
    else if (k === 'mark') { const w = me(); if (!w) toast('Abra uma conversa primeiro'); else { markSale(w); toast('💰 ' + w + ' marcada como venda ' + todayLbl()); } }
  });
  document.getElementById('wcrm-tb-sales').addEventListener('click', openSalesModal);
  document.addEventListener('click', e => {
    const vbn = e.target.closest && e.target.closest('#wcrm-vbtn'); if (!vbn) return;
    const w = me(); if (!w) { toast('Abra uma conversa primeiro'); return; }
    const m = saleOf(w);
    const lbls = [], cnts = {}; Object.values(sales.marks || {}).sort((x, y) => (y.at || 0) - (x.at || 0)).forEach(x => { cnts[x.day] = (cnts[x.day] || 0) + 1; if (!lbls.includes(x.day)) lbls.push(x.day); });
    popAt(vbn, '<div class="ttl">💰 Etiqueta de venda' + (m ? ' — ' + esc(m.day) : '') + '</div>'
      + lbls.slice(0, 12).map(d => '<div class="it" data-vs="set" data-d="' + esc(d) + '"><span class="ck">' + (m && m.day === d ? '✓' : '') + '</span>Vendas ' + esc(d) + '<span class="cn" style="margin-left:auto;padding-left:14px;color:#d9bb5a;font-weight:800">' + cnts[d] + '</span></div>').join('')
      + '<div class="it" data-vs="today"><span class="ck">' + (m && m.day === todayLbl() ? '✓' : '') + '</span>📅 Hoje (' + todayLbl() + ')' + (cnts[todayLbl()] ? '<span style="margin-left:auto;padding-left:14px;color:#d9bb5a;font-weight:800">' + cnts[todayLbl()] + '</span>' : '') + '</div><div class="it" data-vs="back1"><span class="ck">' + (m && m.day === dayLbl(1) ? '✓' : '') + '</span>📅 Ontem (' + dayLbl(1) + ')' + (cnts[dayLbl(1)] ? '<span style="margin-left:auto;padding-left:14px;color:#d9bb5a;font-weight:800">' + cnts[dayLbl(1)] + '</span>' : '') + '</div><div class="it" data-vs="back2"><span class="ck">' + (m && m.day === dayLbl(2) ? '✓' : '') + '</span>📅 Anteontem (' + dayLbl(2) + ')' + (cnts[dayLbl(2)] ? '<span style="margin-left:auto;padding-left:14px;color:#d9bb5a;font-weight:800">' + cnts[dayLbl(2)] + '</span>' : '') + '</div><div class="it" data-vs="day"><span class="ck"></span>✏️ Nova etiqueta (data ou nome)…</div>'
      + '<div class="it" data-vs="manage"><span class="ck"></span>⚙️ Editar / excluir etiquetas…</div>' + (m ? '<div class="it" data-vs="list"><span class="ck"></span>👁 Ver as vendas de ' + esc(m.day) + '</div><div class="it" data-vs="rm"><span class="ck"></span>✕ Tirar a marcação</div>' : ''), 'left');
  });
  setInterval(decorateRows, 1200);
  try {
    chrome.storage.local.get('wcrm_sales', o => {
      const v = o.wcrm_sales || {}; sales = { marks: v.marks || {} }; let mg = false;
      Object.values(sales.marks).forEach(m => { if (/^\d\d\/\d\d$/.test(m.day || '')) { m.day += '/' + String(new Date(m.at || Date.now()).getFullYear()).slice(2); mg = true; } }); if (mg) salesSave();
      if (Array.isArray(v.days)) { v.days.forEach(d => { const day = String(d.name || '').replace(/^Vendas\s*/i, '') || todayLbl(); (d.contacts || []).forEach(c => { if (!sales.marks[norm(c)]) sales.marks[norm(c)] = { name: c, day, at: Date.now() }; }); }); salesSave(); }
      salesChanged();
    });
    chrome.storage.onChanged.addListener((ch, a) => { if (a === 'local' && ch.wcrm_sales && ch.wcrm_sales.newValue) { sales = { marks: ch.wcrm_sales.newValue.marks || {} }; salesChanged(); } });
  } catch (e) {}
  // arrastar conversa para uma aba
  const chipsEl = document.getElementById('wcrm-chips');
  on2('dragover', e => { const b = e.target.closest('.tb-chip'); if (mode === 'tabs' && b && !b.dataset.all) { e.preventDefault(); document.querySelectorAll('.tb-chip.drop').forEach(x => x.classList.remove('drop')); b.classList.add('drop'); } });
  on2('dragleave', e => { const b = e.target.closest('.tb-chip'); b && b.classList.remove('drop'); });
  on2('drop', e => {
    const b = e.target.closest('.tb-chip'); if (mode !== 'tabs' || !b || b.dataset.all) return; e.preventDefault(); b.classList.remove('drop');
    const name = e.dataTransfer.getData('text/wcrm-contact'); if (!name) return;
    setTab(name, b.dataset.n);
  });
  document.addEventListener('dragstart', e => {
    let name = '';
    const hdr = e.target.closest && e.target.closest('#main header');
    if (hdr) name = me();
    else { const row = e.target.closest && e.target.closest('#pane-side [role="listitem"], #pane-side [role="row"]'); const t = row && row.querySelector('span[title]'); name = t ? t.getAttribute('title') : ''; }
    if (name) { e.dataTransfer.setData('text/wcrm-contact', name); e.dataTransfer.setData('text/plain', name); e.dataTransfer.effectAllowed = 'copyMove'; if (mode !== 'tabs') { mode = 'tabs'; lsSet('wcrm_mode', 'tabs'); renderChips(); } }
  }, true);
  function setTab(contact, tab, isNew, mode) {
    mode = mode || (tab === '' ? 'clear' : 'add');
    post({ type: 'SET_TAB', contact, tab, newTab: isNew ? tab : '', mode });
    const nk = norm(contact);
    const tabs = barData.tabs || [];
    if (isNew && tab && !tabs.some(x => x.name === tab)) tabs.push({ name: tab, count: 0, contacts: [] });
    tabs.forEach(x => {
      const has = (x.contacts || []).some(n => norm(n) === nk);
      if (mode === 'clear') x.contacts = (x.contacts || []).filter(n => norm(n) !== nk);
      else if (x.name === tab && mode === 'add' && !has) x.contacts = (x.contacts || []).concat([contact]);
      else if (x.name === tab && mode === 'remove') x.contacts = (x.contacts || []).filter(n => norm(n) !== nk);
      x.count = (x.contacts || []).length;
    });
    barData.tabs = tabs;
    renderChips(); toast('📂 ' + contact + (mode === 'remove' ? ' tirado de ' : mode === 'clear' ? ' sem abas' : ' + ') + (mode === 'clear' ? '' : tab));
    if (activeChip && activeChip.mode === 'tabs') applyFilter();
  }

  // remove das abas contatos que não existem de verdade no WhatsApp (nome errado salvo por engano)
  function cleanGhosts() {
    const br = (W().getBridge && W().getBridge()) || {}; const known = new Set();
    [].concat(br.act || [], br.all || []).forEach(a => a && a.n && known.add(norm(a.n)));
    (br.chats || []).forEach(c => c && c.name && known.add(norm(c.name)));
    if (known.size < 5) { toast('⚠️ Ainda não li a lista de conversas — tente de novo em alguns segundos'); return; }
    const ghosts = []; (barData.tabs || []).forEach(t => (t.contacts || []).forEach(n => { if (!known.has(norm(n))) ghosts.push({ tab: t.name, n }); }));
    if (!ghosts.length) { toast('✅ Nenhum contato fantasma nas abas'); return; }
    if (!confirm('Estes nomes estão nas abas mas NÃO existem como conversa no WhatsApp:\n\n' + ghosts.map(g => '• ' + g.n + '  (' + g.tab + ')').join('\n') + '\n\nRemover das abas?')) return;
    ghosts.forEach(g => setTab(g.n, g.tab, false, 'remove'));
    toast('🧹 ' + ghosts.length + ' contato(s) fantasma removido(s)');
  }
  // menu ≡
  function popAt(el, html, align) {
    pop.innerHTML = html; pop.style.display = 'block';
    const r = el.getBoundingClientRect(); const pw = pop.offsetWidth;
    const ph = pop.offsetHeight; pop.style.top = Math.round(r.bottom + 6 + ph > window.innerHeight - 8 ? Math.max(8, r.top - ph - 6) : r.bottom + 6) + 'px';
    pop.style.left = Math.round(Math.max(8, Math.min(window.innerWidth - pw - 8, align === 'right' ? r.right - pw : r.left))) + 'px';
  }
  const closePop = () => { pop.style.display = 'none'; pop.innerHTML = ''; };
  document.addEventListener('mousedown', e => { if (pop.style.display !== 'none' && !pop.contains(e.target) && !e.target.closest('#wcrm-strip, #wcrm-topbar')) closePop(); }, true);
  document.getElementById('wcrm-tb-menu').addEventListener('click', e => {
    popAt(e.currentTarget, `<div class="it" data-m="tabs"><span class="ck">${mode === 'tabs' ? '✓' : ''}</span>📂 Abas (do CRM)</div><div class="it" data-m="labels"><span class="ck">${mode === 'labels' ? '✓' : ''}</span>🏷️ Etiquetas (do WhatsApp)</div>
      <div class="it" data-m="strip"><span class="ck">${document.documentElement.classList.contains('wcrm-strip') ? '✓' : ''}</span>▭ Barra da conversa</div><div class="it" data-m="left"><span class="ck">${document.documentElement.classList.contains('wcrm-left') ? '✓' : ''}</span>▍Menu da esquerda</div><div class="it" data-m="ghost"><span class="ck"></span>🧹 Limpar contatos fantasma das abas</div><div class="it" data-m="hide"><span class="ck"></span>⌃ Ocultar exibição</div>`, 'right');
  });
  document.getElementById('wcrm-tb-funnel').addEventListener('click', e => {
    popAt(e.currentTarget, `<div class="it" data-m="tabs"><span class="ck">${mode === 'tabs' ? '✓' : ''}</span>📂 Abas</div><div class="it" data-m="labels"><span class="ck">${mode === 'labels' ? '✓' : ''}</span>🏷️ Etiquetas</div><div class="it" data-m="hide"><span class="ck"></span>⬇ Ocultar Exibição</div>`, 'left');
  });
  document.getElementById('wcrm-tb-add').addEventListener('click', e => {
    popAt(e.currentTarget, '<div class="ttl">Nova aba</div><input id="wcrm-newtab" placeholder="Nome da aba e Enter" maxlength="30">', 'right');
    setTimeout(() => { const i = document.getElementById('wcrm-newtab'); i && i.focus(); }, 30);
  });
  document.getElementById('wcrm-tb-refresh').addEventListener('click', () => { post({ type: 'GET_CONVERSATIONS' }); window.postMessage({ tag: 'WCRM_CONTENT', kind: 'SYNC' }, '*'); loadBar(); });
  pop.addEventListener('input', e => { if (e.target.id === 'wcrm-tabsearch') { const q = norm(e.target.value); pop.querySelectorAll('#wcrm-tablist .it').forEach(x => { x.style.display = !q || (x.dataset.s || '').includes(q) ? '' : 'none'; }); } });
  pop.addEventListener('keydown', e => {
    if (e.target.id === 'wcrm-saleday' && e.key === 'Enter') { const v = normDay(e.target.value); closePop(); if (!v) return; markSale(me(), v); toast('💰 Etiqueta de venda: ' + v); }
    if (e.target.id === 'wcrm-rentab' && e.key === 'Enter') {
      const to = e.target.value.trim(), from = pop.dataset.tabn; closePop();
      if (!to || to === from) return;
      if ((barData.tabs || []).some(t => t.name === to)) { toast('⚠️ Já existe uma aba com esse nome', '#e74c3c'); return; }
      post({ type: 'KANBAN_TAB_OP', op: 'rename', name: from, to });
      patchRules(from, to);
      barData.tabs = (barData.tabs || []).map(t => t.name === from ? Object.assign({}, t, { name: to }) : t);
      if (activeChip && activeChip.name === from) activeChip = { mode: 'tabs', name: to };
      renderChips(); applyFilter(); toast('✏️ "' + from + '" → "' + to + '"');
    }
    if (e.target.id === 'wcrm-newtab' && e.key === 'Enter') {
      const n = e.target.value.trim(); if (!n) return; closePop();
      post({ type: 'SET_TAB', contact: '', tab: '', newTab: n });
      barData.tabs = (barData.tabs || []).concat([{ name: n, count: 0, contacts: [] }]); renderChips(); toast('📂 Aba "' + n + '" criada');
    }
  });
  pop.addEventListener('click', async e => {
    const it = e.target.closest('.it'); if (!it) return;
    if (it.dataset.vs) {
      const w = me(), act = it.dataset.vs, m = saleOf(w);
      if (act === 'manage') { closePop(); smEdit = null; openSalesModal(); }
      else if (act === 'set') { closePop(); markSale(w, it.dataset.d); toast('💰 ' + w + ' → Vendas ' + it.dataset.d); }
      else if (act === 'back1' || act === 'back2') { const dl = dayLbl(act === 'back1' ? 1 : 2); closePop(); markSale(w, dl); toast('💰 ' + w + ' → Vendas ' + dl); }
      else if (act === 'today') { closePop(); markSale(w); toast('💰 ' + w + ' → Vendas ' + todayLbl()); }
      else if (act === 'rm') { closePop(); unmarkSale(w); toast('💰 Marcação tirada de ' + w); }
      else if (act === 'list' && m) { closePop(); activeChip = { mode: 'sales', name: m.day }; renderChips(); applyFilter(); }
      else if (act === 'day') { pop.innerHTML = '<div class="ttl">Nome da etiqueta (data ou qualquer nome) + Enter</div><input id="wcrm-saleday" maxlength="24" placeholder="ex: 08/11/26 ou Black Friday" value="' + esc(m ? m.day : todayLbl()) + '">'; setTimeout(() => { const i = document.getElementById('wcrm-saleday'); i && (i.focus(), i.select()); }, 30); }
      return;
    }
    if (it.dataset.te) {
      const n = pop.dataset.tabn; const act = it.dataset.te;
      if (act === 'ren') {
        pop.innerHTML = '<div class="ttl">Renomear “' + esc(n) + '”</div><input id="wcrm-rentab" maxlength="30" value="' + esc(n) + '">'; pop.dataset.tabn = n;
        setTimeout(() => { const i = document.getElementById('wcrm-rentab'); i && (i.focus(), i.select()); }, 30);
      } else if (act === 'del') {
        const c = ((barData.tabs || []).find(t => t.name === n) || {}).count || 0;
        pop.innerHTML = '<div class="ttl">Excluir “' + esc(n) + '”?</div><div style="padding:4px 10px 8px;font-size:12px;color:#c9d1d6">' + c + ' conversa(s) saem desta aba (nenhum contato é apagado). Follow ups que usam esta aba podem parar de funcionar.</div><div class="it" data-te="delok" style="color:#f87171">🗑️ Sim, excluir</div><div class="it" data-te="no">Cancelar</div>';
      } else if (act === 'delok') {
        closePop();
        post({ type: 'KANBAN_TAB_OP', op: 'delete', name: n });
        barData.tabs = (barData.tabs || []).filter(t => t.name !== n);
        if (activeChip && activeChip.name === n) { activeChip = null; applyFilter(); }
        renderChips(); toast('🗑️ Aba "' + n + '" excluída');
      } else closePop();
      return;
    }
    const m = it.dataset.m;
    if (m === 'tabs' || m === 'labels') { mode = m; lsSet('wcrm_mode', m); activeChip = null; applyFilter(); renderChips(); closePop(); }
    else if (m === 'strip') { setStrip(!document.documentElement.classList.contains('wcrm-strip')); closePop(); }
    else if (m === 'left') { setLeft(!document.documentElement.classList.contains('wcrm-left')); closePop(); }
    else if (m === 'ghost') { closePop(); cleanGhosts(); }
    else if (m === 'hide') { setBar(false); closePop(); }
    else if (it.dataset.tab !== undefined) {
      const who = me(); const tn = it.dataset.tab;
      if (tn === '') { setTab(who, '', false, 'clear'); }
      else setTab(who, tn, false, curTabs().includes(tn) ? 'remove' : 'add');
      const q = (document.getElementById('wcrm-tabsearch') || {}).value || '';
      openTabPop(document.getElementById('wcrm-abtn')); const si = document.getElementById('wcrm-tabsearch'); if (si && q) { si.value = q; si.dispatchEvent(new Event('input', { bubbles: true })); }
    }
    else if (it.dataset.newtab) { closePop(); popAt(document.getElementById('wcrm-abtn'), '<div class="ttl">Nova aba para ' + esc(me()) + '</div><input id="wcrm-newtab2" placeholder="Nome e Enter" maxlength="30">'); setTimeout(() => { const i = document.getElementById('wcrm-newtab2'); i && i.focus(); }, 30); }
    else if (it.dataset.lab) {
      const lab = it.dataset.lab, has = it.dataset.has === '1'; const who = me();
      const r = await W().applyLabel('__active__', lab, has ? 'remove' : 'add', false);
      toast(r && r.ok ? '🏷️ ' + lab + (has ? ' removida' : ' aplicada') + ' no WhatsApp ✓' : '⚠️ ' + ((r && r.reason) || 'falhou'));
      closePop(); setTimeout(() => { window.postMessage({ tag: 'WCRM_CONTENT', kind: 'SYNC' }, '*'); }, 500);
    }
  });
  pop.addEventListener('keydown', e => {
    if (e.target.id === 'wcrm-newtab2' && e.key === 'Enter') { const n = e.target.value.trim(); if (!n) return; closePop(); setTab(me(), n, true, 'add'); }
  });

  function loadBar() {
    chrome.storage.local.get('wcrm_labelbar', o => { const v = o.wcrm_labelbar || {}; barData = { labels: v.labels || [], tabs: v.tabs || [] }; renderChips(); updateStrip(); });
  }
  loadBar();
  try { chrome.storage.onChanged.addListener((ch, a) => { if (a === 'local' && ch.wcrm_labelbar) loadBar(); }); } catch (e) {}
  document.addEventListener('wcrm-bridge', () => { renderChips(); updateStrip(); });

  // ── barra da conversa (acima do chat) ──
  const strip = document.createElement('div'); strip.id = 'wcrm-strip';
  strip.innerHTML = `<button id="wcrm-abtn" title="Abas (do CRM) — mover esta conversa">📂<span id="wcrm-alabel" style="font-size:12px;font-weight:700;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></span><i id="wcrm-abadge" style="display:none">1</i></button>
    <button id="wcrm-lbtn" title="Etiquetas do WhatsApp desta conversa">🏷️<i id="wcrm-lbadge" style="display:none">0</i></button>
    <button id="wcrm-vbtn" title="Marcar esta conversa como VENDA de hoje (etiqueta virtual do CRM)">💰<span id="wcrm-vlabel" style="font-size:12px;font-weight:700"></span></button>
    <span class="hint">⠿ arraste o cabeçalho da conversa para uma aba</span><button class="min" id="wcrm-strip-min" title="Minimizar">▴</button>`;
  document.body.appendChild(strip);
  function curTabs() { const n = norm(me()); return (barData.tabs || []).filter(x => (x.contacts || []).some(c => norm(c) === n)).map(x => x.name); }
  function curTab() { return curTabs().join(', '); }
  function curLabels() { const br = W().getBridge && W().getBridge(); const n = norm(me()); const c = br && br.ok && (br.chats || []).find(x => norm(x.name) === n); return c ? c.labels : []; }
  function updateStrip() {
    const ct = curTab(); const ctl = curTabs(); const al = document.getElementById('wcrm-alabel'); if (al) al.textContent = ctl.length > 1 ? ctl[0] + ' +' + (ctl.length - 1) : (ctl[0] || ''); const ab = document.getElementById('wcrm-abadge'); if (ab) { ab.style.display = ct ? 'flex' : 'none'; document.getElementById('wcrm-abtn').title = ct ? 'Aba: ' + ct : 'Abas (do CRM) — mover esta conversa'; }
    updateSaleBtn(); const cl = curLabels(); const lb = document.getElementById('wcrm-lbadge'); if (lb) { lb.style.display = cl.length ? 'flex' : 'none'; lb.textContent = cl.length; }
  }
  document.getElementById('wcrm-strip-min').addEventListener('click', () => setStrip(false));
  function openTabPop(btn) {
    const cl = curTabs();
    popAt(btn, '<div class="ttl">Abas desta conversa: <b style="color:#d4af37">' + (cl.length ? esc(cl.join(', ')) : 'nenhuma') + '</b></div><input id="wcrm-tabsearch" placeholder="🔍 Pesquisar abas…" autocomplete="off">'
      + '<div id="wcrm-tablist">' + (barData.tabs || []).map(t => `<div class="it" data-tab="${esc(t.name)}" data-s="${esc(norm(t.name))}"><span class="ck">${cl.includes(t.name) ? '☑' : '☐'}</span><span style="flex:1">${esc(t.name)}</span><span class="cn">${t.count || (t.contacts || []).length || 0}</span></div>`).join('') + '</div>'
      + (cl.length ? '<div class="it" data-tab=""><span class="ck"></span>✕ Tirar de todas as abas</div>' : '') + '<div class="it" data-newtab="1"><span class="ck"></span>＋ Nova aba…</div>');
    setTimeout(() => { const i = document.getElementById('wcrm-tabsearch'); i && i.focus(); }, 30);
  }
  document.getElementById('wcrm-abtn').addEventListener('click', e => {
    if (!me()) { toast('Abra uma conversa primeiro'); return; }
    openTabPop(e.currentTarget);
  });
  document.getElementById('wcrm-lbtn').addEventListener('click', e => {
    if (!me()) { toast('Abra uma conversa primeiro'); return; }
    const br = W().getBridge && W().getBridge();
    if (!br || !br.ok) { popAt(e.currentTarget, '<div class="ttl">Etiquetas indisponíveis</div><div style="padding:6px 10px;font-size:12px;color:#667781;">' + esc(br ? br.reason : 'a ponte não respondeu — dê F5 no WhatsApp Web') + '</div>'); return; }
    const cur = curLabels();
    popAt(e.currentTarget, '<div class="ttl">Etiquetas do WhatsApp</div>' + (br.labels.length ? br.labels.map(l => { const has = cur.includes(l.name); return `<div class="it" data-lab="${esc(l.name)}" data-has="${has ? 1 : 0}"><span class="ck">${has ? '✓' : ''}</span>${esc(l.name)}</div>`; }).join('') : '<div style="padding:6px 10px;font-size:12px;color:#667781;">Nenhuma etiqueta criada</div>'));
  });

  // ── menu lateral recolhível ──
  const rail = document.createElement('div'); rail.id = 'wcrm-rail';
  const mini = document.createElement('button'); mini.id = 'wcrm-minirail'; mini.textContent = '☰'; mini.title = 'Abrir menu'; document.body.appendChild(mini);
  let agentOn = {};
  chrome.storage.local.get('wcrm_agent', o => { agentOn = o.wcrm_agent || {}; syncAgentBtn(); });
  const ITEMS = [
    ['«', 'Recolher menu', () => { lsSet('wcrm_rail', '0'); placeAll(); }],
    ['🤖', 'Agente de IA nesta conversa (ligar/desligar)', () => toggleAgent(), 'agent'],
    ['🌡️', 'Analisar conversa (quente/frio + sugestão)', () => { showPanel(); post({ type: 'GOTO_TAB', tab: 'ladder' }); setTimeout(() => post({ type: 'RUN_ANALYZE' }), 350); }],
    ['⚡', 'Respostas rápidas', () => { showPanel(); post({ type: 'GOTO_TAB', tab: 'msgs' }); }],
    ['👤', 'Perfil do contato', () => { showPanel(); post({ type: 'GOTO_TAB', tab: 'contact' }); }],
    ['|'],
    ['🕐', 'Agendar mensagem', () => { showPanel(); post({ type: 'OPEN_SCHED' }); }],
    ['🔔', 'Lembrete', () => { showPanel(); post({ type: 'OPEN_REMINDER' }); }],
    ['📝', 'Anotação', () => { showPanel(); post({ type: 'OPEN_NOTE' }); }],
    ['|'],
    ['🪜', 'Follow Up', () => window.postMessage({ type: 'OPEN_FOLLOWUP' }, '*')],
    ['📢', 'Disparo em massa', () => window.postMessage({ type: 'OPEN_BULK' }, '*')],
    ['🗂️', 'CRM Kanban', () => window.postMessage({ type: 'OPEN_KANBAN' }, '*')],
    ['📋', 'CRM: abas e etiquetas', () => { showPanel(); post({ type: 'GOTO_TAB', tab: 'crm-tabs' }); }],
  ];
  ITEMS.forEach(it => {
    if (it[0] === '|') { const s = document.createElement('div'); s.className = 'sep'; rail.appendChild(s); return; }
    const b = document.createElement('button'); b.textContent = it[0]; b.title = it[1]; if (it[3]) b.dataset.k = it[3]; b.addEventListener('click', it[2]); rail.appendChild(b);
  });
  document.body.appendChild(rail);
  mini.addEventListener('click', () => { lsSet('wcrm_rail', '1'); placeAll(); });
  function syncAgentBtn() { const b = rail.querySelector('[data-k="agent"]'); if (b) b.classList.toggle('on', !!agentOn[norm(me())]); }
  function toggleAgent() {
    const n = norm(me()); if (!n) { toast('Abra uma conversa primeiro'); return; }
    agentOn[n] = !agentOn[n]; chrome.storage.local.set({ wcrm_agent: agentOn }); syncAgentBtn();
    toast(agentOn[n] ? '🤖 Agente de IA LIGADO nesta conversa' : '🤖 Agente de IA desligado nesta conversa');
    if (agentOn[n]) { showPanel(); post({ type: 'GOTO_TAB', tab: 'ladder' }); setTimeout(() => post({ type: 'RUN_ANALYZE' }), 350); }
  }

  // ── menu da esquerda (Follow Up, Auto atendimento, Iniciar conversa…) ──
  const left = document.createElement('div'); left.id = 'wcrm-left';
  [['🪜', 'Follow Up', () => window.postMessage({ type: 'OPEN_FOLLOWUP' }, '*')],
   ['🤖', 'Auto atendimento', () => { showPanel(); post({ type: 'GOTO_TAB', tab: 'auto' }); }],
   ['💬', 'Iniciar conversa (por número)', () => openStart()],
   ['📢', 'Disparo em massa', () => window.postMessage({ type: 'OPEN_BULK' }, '*')],
   ['🗂️', 'CRM Kanban', () => window.postMessage({ type: 'OPEN_KANBAN' }, '*')],
   ['🕐', 'Agendamentos', () => { showPanel(); post({ type: 'GOTO_TAB', tab: 'sched' }); }],
   ['🔔', 'Lembretes', () => { showPanel(); post({ type: 'GOTO_TAB', tab: 'followup' }); }]
  ].forEach(it => { const b = document.createElement('button'); b.textContent = it[0]; b.title = it[1]; b.addEventListener('click', it[2]); left.appendChild(b); });
  document.body.appendChild(left);
  const setLeft = on => { document.documentElement.classList.toggle('wcrm-left', on); lsSet('wcrm_left', on ? '1' : '0'); placeAll(); };

  const startEl = document.createElement('div'); startEl.id = 'wcrm-start';
  startEl.innerHTML = '<div class="bx"><h3>Iniciar uma conversa</h3><p>Abre a conversa com qualquer número, mesmo que não esteja nos seus contatos.</p><input id="wcrm-st-num" type="text" placeholder="DDD + número  (ex: 16 99999-9999)" inputmode="tel"><div class="er" id="wcrm-st-er"></div><div class="bt"><button class="no" id="wcrm-st-no">Cancelar</button><button class="go" id="wcrm-st-go">Conversar agora</button></div></div>';
  document.body.appendChild(startEl);
  function openStart() { startEl.classList.add('show'); document.getElementById('wcrm-st-er').textContent = ''; setTimeout(() => document.getElementById('wcrm-st-num').focus(), 50); }
  const closeStart = () => startEl.classList.remove('show');
  async function goStart() {
    const er = document.getElementById('wcrm-st-er'); let dg = document.getElementById('wcrm-st-num').value.replace(/\D/g, '');
    if (dg.length === 10 || dg.length === 11) dg = '55' + dg;
    if (dg.length < 12) { er.textContent = 'Número inválido — use DDD + número.'; return; }
    er.style.color = '#555'; er.textContent = 'Abrindo…';
    const r = W().bridgeCall ? await W().bridgeCall('OPEN_NUMBER', { phone: dg }, 10000) : { ok: false };
    if (r && r.ok) { closeStart(); return; }
    er.style.color = '#c0392b'; er.textContent = 'Não consegui pela ponte (' + ((r && r.reason) || '?') + '). Abrindo pelo link do WhatsApp…';
    setTimeout(() => { location.href = 'https://web.whatsapp.com/send?phone=' + dg; }, 900);
  }
  document.getElementById('wcrm-st-go').addEventListener('click', goStart);
  document.getElementById('wcrm-st-no').addEventListener('click', closeStart);
  document.getElementById('wcrm-st-num').addEventListener('keydown', e => { if (e.key === 'Enter') goStart(); if (e.key === 'Escape') closeStart(); });
  startEl.addEventListener('mousedown', e => { if (e.target === startEl) closeStart(); });

  // ── posicionamento ──
  function placeAll() {
    const main = document.getElementById('main'); const stripOn = document.documentElement.classList.contains('wcrm-strip');
    const r = main ? main.getBoundingClientRect() : null;
    if (!r || r.width < 200) { rail.style.display = 'none'; mini.style.display = 'none'; strip.classList.remove('show'); so.style.display = 'none'; return; }
    so.style.display = '';
    // barra da conversa
    strip.classList.toggle('show', stripOn);
    strip.style.left = Math.round(r.left) + 'px'; strip.style.width = Math.round(r.width) + 'px';
    strip.style.top = Math.round(stripOn ? Math.max(r.top - STRIP_H, 0) : r.top) + 'px';
    // botão para reabrir a barra: fica no topo da própria conversa (antes ficava atrás do painel direito)
    so.style.right = 'auto'; so.style.left = Math.round(r.left + r.width / 2 - 40) + 'px'; so.style.top = Math.round(Math.max(r.top, 0)) + 'px'; so.style.zIndex = '2147483643'; so.style.padding = '3px 14px';
    // menu lateral
    const open = lsGet('wcrm_rail') !== '0';
    const top = Math.round(Math.min(Math.max(r.top + 70, 0), window.innerHeight - 420));
    mini.style.display = 'none';
    const ftr = main.querySelector('footer'); const zTop = ftr ? ftr.getBoundingClientRect().top - 62 : window.innerHeight - 130;
    if (open) { rail.style.display = 'flex'; rail.style.left = Math.round(r.left + 14) + 'px'; rail.style.top = 'auto'; rail.style.bottom = Math.round(window.innerHeight - zTop + 8) + 'px'; rail.style.maxHeight = Math.max(120, Math.round(zTop - r.top - 70)) + 'px'; rail.style.overflowY = 'auto'; }
    else { rail.style.display = 'none'; }
    const hdr = main.querySelector('header'); if (hdr && hdr.getAttribute('draggable') !== 'true') hdr.setAttribute('draggable', 'true');
    syncAgentBtn(); updateStrip();
  }
  setInterval(placeAll, 1200); window.addEventListener('resize', placeAll);
  // ── largura do menu lateral (ajustável em ⚙) + botão ⚡ ao lado do microfone + logo Z (minimizar/maximizar) ──
  function setPW(px) { px = Math.max(300, Math.min(700, +px || 380)); document.documentElement.style.setProperty('--wcrm-pw', px + 'px'); const w = document.getElementById('wcrm-wrap'); if (w) w.style.width = px + 'px'; }
  try { chrome.storage.local.get('wcrm_ui', o => { const u = o.wcrm_ui || {}; if (u.w) setPW(u.w); }); chrome.storage.onChanged.addListener((ch, a) => { if (a === 'local' && ch.wcrm_ui && ch.wcrm_ui.newValue) setPW(ch.wcrm_ui.newValue.w); }); } catch (e) {}
  try { chrome.storage.local.get('wcrm_acc', o => { if (o.wcrm_acc) document.documentElement.style.setProperty('--wcrm-acc', o.wcrm_acc); }); chrome.storage.onChanged.addListener((c, a) => { if (a === 'local' && c.wcrm_acc && c.wcrm_acc.newValue) document.documentElement.style.setProperty('--wcrm-acc', c.wcrm_acc.newValue); }); } catch (e) {}
  const boltCss = document.createElement('style');
  boltCss.textContent = '#wcrm-bolt,#wcrm-zlogo{position:fixed;z-index:2147483642;border-radius:50%;cursor:pointer;display:none;align-items:center;justify-content:center;user-select:none}'
    + '#wcrm-bolt{width:40px;height:40px;background:transparent;border:0;font-size:24px;color:var(--wcrm-acc,#2563eb)} #wcrm-bolt:hover{background:#8884}'
    + '#wcrm-zlogo{width:44px;height:44px;background:#0b0b0b;border:2px solid var(--wcrm-acc,#00a884);color:var(--wcrm-acc,#00a884);font:900 22px "Segoe UI",Arial;box-shadow:0 3px 12px #0006} #wcrm-zlogo:hover{transform:scale(1.07)}'
    + '#wcrm-btn{display:none !important} #main footer{padding-right:46px !important;box-sizing:border-box}';
  document.documentElement.appendChild(boltCss);
  const bolt = document.createElement('div'); bolt.id = 'wcrm-bolt'; bolt.title = 'Abrir/fechar menu lateral'; bolt.textContent = '⚡';
  const zlogo = document.createElement('div'); zlogo.id = 'wcrm-zlogo'; zlogo.title = 'Minimizar / maximizar o menu de funções'; zlogo.textContent = 'Z';
  const togglePanelBtn = () => { const b = document.getElementById('wcrm-btn'); b && b.click(); };
  bolt.addEventListener('click', togglePanelBtn); zlogo.addEventListener('click', () => { lsSet('wcrm_rail', lsGet('wcrm_rail') !== '0' ? '0' : '1'); placeAll(); });
  document.body.appendChild(bolt); document.body.appendChild(zlogo);
  function placeBolt() {
    const main = document.getElementById('main'); if (!main) { bolt.style.display = zlogo.style.display = 'none'; return; }
    const r = main.getBoundingClientRect(); const ft = main.querySelector('footer'); if (!ft || r.width < 200) { bolt.style.display = zlogo.style.display = 'none'; return; }
    const fr = ft.getBoundingClientRect();
    const mic = ft.querySelector('[data-icon="ptt"],[data-icon="ptt-refreshed"],[data-icon="send"],[data-icon="wds-ic-send-filled"]'); const mr = mic ? mic.getBoundingClientRect() : null;
    bolt.style.display = 'flex'; bolt.style.left = Math.round(fr.right - 40) + 'px'; bolt.style.top = Math.round(fr.top + fr.height / 2 - 20) + 'px';
    zlogo.style.display = 'flex'; zlogo.style.left = Math.round(r.left + 12) + 'px'; zlogo.style.top = Math.round(fr.top - 62) + 'px';
  }
  setInterval(placeBolt, 900); window.addEventListener('resize', placeBolt);


  // ── fechar painel pelo ✕ do cabeçalho ──
  window.addEventListener('message', e => {
    if (e.data && e.data.type === 'TOGGLE_PANEL') { const b = document.getElementById('wcrm-btn'); b && b.click(); }
  });

  if (lsGet('wcrm_bar') !== '0') document.documentElement.classList.add('wcrm-bar');
  if (lsGet('wcrm_strip') !== '0') document.documentElement.classList.add('wcrm-strip');
  if (lsGet('wcrm_left') !== '0') document.documentElement.classList.add('wcrm-left');
  renderChips(); placeAll();
})();
