// WhatsApp CRM Pro v4.83 — bulk.js
// Tela de DISPARO EM MASSA (layout parecido com o do WaSpeed): Envio Rápido · Contatos · Campanha · Relatório.
// O envio em si é feito pelo motor (engine.js): um contato por vez, intervalo aleatório, horário e limites.
(function () {
  'use strict';
  if (window.__wcrmBulk) return; window.__wcrmBulk = true;
  const K_BULK = 'wcrm_bulk', K_ST = 'wcrm_state';
  const sget = k => new Promise(r => { try { chrome.storage.local.get(k, o => r(o[k])); } catch (e) { r(undefined); } });
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = s => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const post = m => window.postMessage(m, '*');
  const pad = n => String(n).padStart(2, '0');
  const fmt = t => { const d = new Date(t); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const COLORS = ['#d4e157', '#4fc3f7', '#ff8a65', '#ba68c8', '#81c784', '#f06292', '#ffd54f', '#90a4ae'];

  const css = document.createElement('style');
  css.textContent = `
  #wcrm-bulk{position:fixed;inset:0;z-index:2147483646;background:#f4f6fb;color:#1a2233;display:none;font-family:'Segoe UI',Roboto,Arial,sans-serif;}
  #wcrm-bulk.show{display:flex;}
  #wcrm-bulk .bk-rail{width:56px;background:#fff;border-right:1px solid #e3e8f2;display:flex;flex-direction:column;align-items:center;gap:6px;padding-top:12px;}
  #wcrm-bulk .bk-rail .logo{width:34px;height:34px;border-radius:50%;background:#1d4ed8;color:#fff;display:flex;align-items:center;justify-content:center;font-size:18px;margin-bottom:8px;}
  #wcrm-bulk .bk-rail button{width:40px;height:40px;border:0;border-radius:10px;background:transparent;font-size:19px;cursor:pointer;position:relative;}
  #wcrm-bulk .bk-rail button:hover{background:#eef2ff;} #wcrm-bulk .bk-rail button.on{background:#dbe5ff;}
  #wcrm-bulk .bk-rail button::after{content:attr(data-t);position:absolute;left:46px;top:8px;background:#1d4ed8;color:#fff;font-size:12px;padding:3px 8px;border-radius:5px;white-space:nowrap;display:none;z-index:5;}
  #wcrm-bulk .bk-rail button:hover::after{display:block;}
  #wcrm-bulk .bk-main{flex:1;display:flex;flex-direction:column;min-width:0;}
  #wcrm-bulk .bk-top{display:flex;align-items:center;padding:14px 22px 6px;gap:12px;}
  #wcrm-bulk .bk-top h1{margin:0;font-size:22px;font-weight:800;flex:1;} #wcrm-bulk .bk-top small{display:block;font-weight:400;font-size:13px;color:#5b6783;margin-top:3px;}
  #wcrm-bulk .bk-close{border:1px solid #f0a0a0;color:#d44;background:#fff;border-radius:7px;padding:6px 16px;cursor:pointer;font-size:13px;}
  #wcrm-bulk .bk-body{flex:1;overflow:auto;padding:8px 22px 22px;}
  #wcrm-bulk .btn{background:#1d4ed8;color:#fff;border:0;border-radius:8px;padding:9px 16px;font-size:13.5px;font-weight:600;cursor:pointer;}
  #wcrm-bulk .btn:hover{background:#1e40af;} #wcrm-bulk .btn.gray{background:#e6ebf5;color:#1a2233;} #wcrm-bulk .btn.red{background:#dc2626;} #wcrm-bulk .btn.green{background:#16a34a;} #wcrm-bulk .btn.black{background:#1b1f27;}
  #wcrm-bulk .btn.sm{padding:5px 11px;font-size:12px;border-radius:99px;} #wcrm-bulk .btn:disabled{opacity:.5;cursor:not-allowed;}
  #wcrm-bulk .cols{display:grid;grid-template-columns:210px 1fr 340px;gap:18px;align-items:start;}
  #wcrm-bulk .seg button{display:block;width:100%;margin-bottom:9px;text-align:center;}
  #wcrm-bulk .seg .t{font-size:13px;color:#4b5876;margin-bottom:8px;}
  #wcrm-bulk input[type=text],#wcrm-bulk input[type=number],#wcrm-bulk select,#wcrm-bulk textarea{border:1px solid #cfd7e8;border-radius:8px;padding:8px 10px;font-size:13.5px;background:#fff;color:#1a2233;width:100%;box-sizing:border-box;}
  #wcrm-bulk .clist{margin-top:10px;max-height:calc(100vh - 290px);overflow:auto;background:#fff;border:1px solid #e3e8f2;border-radius:10px;}
  #wcrm-bulk .crow{display:flex;gap:9px;align-items:center;padding:7px 12px;border-bottom:1px solid #f0f3fa;cursor:pointer;font-size:13.5px;} #wcrm-bulk .crow:hover{background:#f3f6ff;}
  #wcrm-bulk .crow .dot{width:15px;height:15px;border-radius:50%;border:2px solid #9aa7c4;flex:none;} #wcrm-bulk .crow.sel .dot{background:#1d4ed8;border-color:#1d4ed8;box-shadow:inset 0 0 0 2px #fff;}
  #wcrm-bulk .qty{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;} #wcrm-bulk .qty span{padding:2px 9px;border-radius:99px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;} #wcrm-bulk .qty .p{background:#2563eb;} #wcrm-bulk .qty .m{background:#ef4444;}
  #wcrm-bulk .side{background:#fff;border:1px solid #e3e8f2;border-radius:12px;padding:16px;} #wcrm-bulk .side h3{margin:0 0 12px;text-align:center;font-size:15px;font-weight:600;}
  #wcrm-bulk .warnbar{background:#ffc107;color:#fff;font-weight:700;border-radius:10px;padding:11px 14px;font-size:13.5px;}
  #wcrm-bulk .card{background:#fff;border:1px solid #e3e8f2;border-radius:12px;padding:16px;margin-bottom:14px;} #wcrm-bulk .card h3{margin:0 0 10px;font-size:15px;}
  #wcrm-bulk .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;} #wcrm-bulk .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;}
  #wcrm-bulk label.l{font-size:12px;color:#5b6783;font-weight:700;display:block;margin:0 0 4px;}
  #wcrm-bulk .tbl{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;} #wcrm-bulk .tbl th,#wcrm-bulk .tbl td{padding:10px 12px;text-align:center;border-bottom:1px solid #eef1f8;font-size:13.5px;} #wcrm-bulk .tbl th{color:#5b6783;font-size:12px;}
  #wcrm-bulk .pill{display:inline-block;border-radius:99px;padding:2px 10px;font-size:11.5px;font-weight:700;} #wcrm-bulk .p-run{background:#dcfce7;color:#166534;} #wcrm-bulk .p-pause{background:#fef3c7;color:#92400e;} #wcrm-bulk .p-done{background:#dbeafe;color:#1e40af;} #wcrm-bulk .p-stop{background:#fee2e2;color:#991b1b;}
  #wcrm-bulk .bar{height:10px;background:#e3e8f2;border-radius:99px;overflow:hidden;} #wcrm-bulk .bar i{display:block;height:100%;background:#16a34a;}
  #wcrm-bulk .hint{background:#eaf2ff;border:1px solid #c9dcff;color:#1e3a8a;border-radius:10px;padding:10px 12px;font-size:12.5px;line-height:1.5;}
  #wcrm-bulk .warn{background:#fff7e0;border:1px solid #f3d27a;color:#7a5200;border-radius:10px;padding:10px 12px;font-size:12.5px;line-height:1.5;}
  #wcrm-bulk .step{display:flex;gap:10px;align-items:center;border:1px solid #e3e8f2;border-radius:10px;padding:9px 12px;margin-bottom:8px;background:#fafbff;} #wcrm-bulk .step .g{flex:1;min-width:0;}
  #wcrm-bulk .gcard{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid #e3e8f2;border-radius:10px;padding:11px 14px;margin-bottom:8px;} #wcrm-bulk .gcard .c{width:16px;height:16px;border-radius:50%;} #wcrm-bulk .gcard .g{flex:1;}
  #wcrm-bulk .chk{display:flex;align-items:center;gap:8px;font-size:13.5px;margin:6px 0;} #wcrm-bulk .chk input{width:auto;}
    #wcrm-bulk .bk-main{position:relative;}
  #wcrm-bulk .s1{display:grid;grid-template-columns:250px 1fr 400px 64px;gap:18px;align-items:start;}
  #wcrm-bulk .s1 .seg button{display:block;width:100%;margin-bottom:11px;text-align:center;padding:12px 10px;font-size:14px;border-radius:7px;box-shadow:0 3px 8px rgba(29,78,216,.35);}
  #wcrm-bulk .s1 .seg .dl{background:#1d4ed8;margin-top:36px;}
  #wcrm-bulk .btn.out{background:#fff;color:#e03a3a;border:1px solid #f0a0a0;} #wcrm-bulk .btn.out:hover{background:#fff1f1;}
  #wcrm-bulk .bdg{background:#1d4ed8;color:#fff;border-radius:99px;padding:2px 11px;font-size:13px;font-weight:700;}
  #wcrm-bulk .crow .ck{width:21px;height:21px;border-radius:50%;border:2px solid #b7c3dd;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:900;flex:none;}
  #wcrm-bulk .crow.sel .ck{background:#1d4ed8;border-color:#1d4ed8;}
  #wcrm-bulk .crow .ph{color:#5b6783;font-size:13px;margin-left:6px;} #wcrm-bulk .crow .ph0{font-size:14px;color:#8a97b3;}
  #wcrm-bulk .bk-arrow{border:0;background:transparent;color:#1d4ed8;cursor:pointer;align-self:center;padding:0;margin-top:240px;} #wcrm-bulk .bk-arrow:hover{color:#1e3a8a;transform:scale(1.08);}
  #wcrm-bulk .s2{display:grid;grid-template-columns:56px 1fr 470px;gap:14px;align-items:start;}
  #wcrm-bulk .s2 .bk-arrow{margin-top:200px;}
  #wcrm-bulk .scard{background:#fff;border:1px solid #e3e8f2;border-radius:14px;padding:18px;min-height:calc(100vh - 190px);position:relative;box-shadow:0 2px 10px rgba(30,50,100,.06);}
  #wcrm-bulk .tagchip{background:#c9d8ff;color:#2d4fb8;border-radius:99px;padding:3px 12px;font-size:13px;font-weight:800;cursor:pointer;}
  #wcrm-bulk .sempty{text-align:center;padding:50px 20px 8px;} #wcrm-bulk .sempty .sic{font-size:44px;} #wcrm-bulk .sempty .st1{font-weight:800;font-size:19px;margin-top:8px;} #wcrm-bulk .sempty .st2{color:#6b7791;font-size:14px;margin-top:6px;max-width:480px;margin-left:auto;margin-right:auto;}
  #wcrm-bulk .bk-send{position:absolute;right:18px;bottom:18px;width:64px;height:64px;border-radius:50%;border:0;background:#10b981;color:#fff;font-size:26px;cursor:pointer;box-shadow:0 6px 18px rgba(16,185,129,.5);} #wcrm-bulk .bk-send:hover{background:#059669;}
  #wcrm-bulk .amenu{position:absolute;left:0;top:44px;z-index:6;background:#fff;border:1px solid #d6deee;border-radius:10px;box-shadow:0 10px 28px rgba(0,0,0,.18);min-width:300px;padding:6px;} #wcrm-bulk .amenu div{padding:9px 12px;border-radius:7px;cursor:pointer;font-size:13.5px;} #wcrm-bulk .amenu div:hover{background:#eef2ff;} #wcrm-bulk .amenu small{color:#6b7791;}
  #wcrm-bulk .sctl{display:flex;flex-direction:column;gap:4px;} #wcrm-bulk .sctl button{border:1px solid #d6deee;background:#fff;border-radius:6px;width:28px;height:26px;cursor:pointer;font-size:12px;} #wcrm-bulk .sctl button:hover{background:#eef2ff;}
  #wcrm-bulk .step{align-items:flex-start;} #wcrm-bulk .step>b{background:#1d4ed8;color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;flex:none;margin-top:2px;}
  #wcrm-bulk .qic{font-size:15px;} #wcrm-bulk .alts{font-size:12px;color:#4b5876;margin-top:6px;} #wcrm-bulk .alt{background:#eef2ff;border-radius:99px;padding:2px 8px;margin-right:4px;display:inline-block;} #wcrm-bulk .alt i{cursor:pointer;color:#dc2626;font-style:normal;margin-left:3px;}
  #wcrm-bulk .var{display:flex;gap:8px;align-items:flex-start;margin-bottom:8px;} #wcrm-bulk .var .vn{background:#dbe5ff;color:#1d4ed8;border-radius:6px;padding:3px 7px;font-size:11.5px;font-weight:800;margin-top:6px;} #wcrm-bulk .var textarea{flex:1;resize:vertical;} #wcrm-bulk .var .vx{border:0;background:transparent;color:#dc2626;cursor:pointer;font-size:14px;margin-top:6px;}
  #wcrm-bulk .qpanel{background:#fff;border:1px solid #e3e8f2;border-radius:14px;padding:16px;max-height:calc(100vh - 170px);display:flex;flex-direction:column;} #wcrm-bulk .qtitle{text-align:center;font-weight:800;font-size:17px;line-height:1.35;margin-bottom:12px;}
  #wcrm-bulk .qflt{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0;} #wcrm-bulk .qflt .fl{background:#1d4ed8;color:#fff;border:0;border-radius:7px;padding:5px 11px;font-size:12.5px;font-weight:700;cursor:pointer;width:auto;} #wcrm-bulk .qflt .fl.on{background:#1e3a8a;}
  #wcrm-bulk .qlist{overflow:auto;flex:1;} #wcrm-bulk .qcat{border-radius:10px;margin-bottom:10px;overflow:hidden;border:1px solid #ecefc8;} #wcrm-bulk .qh{display:flex;gap:8px;align-items:center;padding:9px 12px;cursor:pointer;} #wcrm-bulk .qh b{flex:1;font-size:14px;} #wcrm-bulk .qh small{font-weight:400;color:#6b7791;}
  #wcrm-bulk .qi{display:flex;gap:10px;align-items:center;padding:9px 12px 9px 22px;border-top:1px solid rgba(0,0,0,.05);cursor:pointer;background:rgba(255,255,255,.55);} #wcrm-bulk .qi:hover{background:#fff;} #wcrm-bulk .qn{flex:1;font-size:14px;} #wcrm-bulk .qgo{color:#1d4ed8;font-size:18px;}
  #wcrm-bulk .bk-modal{position:absolute;inset:0;background:rgba(15,23,42,.55);display:flex;align-items:flex-start;justify-content:center;z-index:20;padding:20px;overflow:auto;} #wcrm-bulk .bk-mc{background:#f4f6fb;border-radius:16px;width:min(1080px,96%);padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.4);}
  #wcrm-bulk .riskbar{background:#fff;border:1px solid #e3e8f2;border-radius:12px;padding:12px 14px;font-size:13.5px;} #wcrm-bulk .meter{height:9px;background:#e3e8f2;border-radius:99px;overflow:hidden;margin-top:8px;} #wcrm-bulk .meter i{display:block;height:100%;transition:width .2s;}
  #wcrm-bulk .tabsel{display:flex;flex-wrap:wrap;gap:6px;max-height:110px;overflow:auto;} #wcrm-bulk .tchip{background:#eef2ff;border-radius:99px;padding:3px 10px;font-size:12px;display:inline-flex;gap:5px;align-items:center;cursor:pointer;} #wcrm-bulk .tchip input{width:auto;}
`;
  document.head.appendChild(css);

  const root = document.createElement('div'); root.id = 'wcrm-bulk';
  root.innerHTML = '<div class="bk-rail"><div class="logo">📣</div>' +
    '<button data-v="quick" data-t="Envio Rápido">⏩</button><button data-v="groups" data-t="Contatos (agrupamentos)">👥</button>' +
    '<button data-v="camp" data-t="Campanha">📢</button><button data-v="report" data-t="Relatório">📋</button></div>' +
    '<div class="bk-main"><div class="bk-top"><h1></h1><button class="bk-close">Fechar</button></div><div class="bk-body"></div></div>';
  document.body.appendChild(root);
  const $h1 = root.querySelector('h1'), $bd = root.querySelector('.bk-body');

  // ── estado da tela ──
  let view = 'quick', step = 1, opened = false, timer = null, modal = false, addMenu = false;
  let src = null;                       // fontes de contatos (ponte do WhatsApp)
  let seg = 'saved', segPick = '';      // segmento atual
  let pool = [];                        // contatos exibidos [{n, known, phone}]
  let filterQ = '';
  const sel = new Map();                // nk -> contato selecionado
  const DEF_OPTS = { minSec: 45, maxSec: 150, perHour: 25, perDay: 120, useWindow: true, customWindow: false, winStart: '09:00', winEnd: '19:00', onlyKnown: true, dryRun: true, pauseAfterFails: 3,
    typingSim: true, batchEvery: 15, batchMin: 5, batchMax: 12, warmN: 10, warmFactor: 2, skipRecentHours: 24, skipActiveMin: 30, excludeTabs: [], shuffle: true, startAt: 0 };
  let camp = { groupId: '', useSel: true, steps: [], stepGap: 4, stepGapMax: 10, opts: Object.assign({}, DEF_OPTS), name: '' };
  let bulk = { groups: [], jobs: [] }, rt = {}, cfgW = {}, quickList = [], cats = {};
  let qf = { q: '', type: 'all', cat: 'all', closed: {} };
  let jobOpen = null;
  const DEF_CATS = { saudacao: 'Saudação', produto: 'Produto', posVenda: 'Pós-venda', garantia: 'Garantia', promo: 'Promoção', funil: 'Script', followup: 'Follow UP' };
  const CAT_COL = ['#fff3b0', '#d9f2e6', '#dbe7ff', '#fde0e0', '#eadcff', '#ffe6cc', '#d7f0f7', '#e6f0c8'];
  const KIND_ICO = { text: '📝', image: '🖼️', video: '🎬', audio: '🎤', doc: '📄', document: '📄', pix: '💠', invite: '👥', contact: '👤', banner: '🔗', list: '☰', sticker: '😀' };
  const qIcon = q => q.type === 'script' ? '🔗' : (q.kinds.includes('audio') ? '🎤' : (q.kinds.includes('image') ? '🖼️' : (q.kinds.includes('video') ? '🎬' : (q.kinds.includes('doc') ? '📄' : '📝'))));

  async function loadAll() {
    bulk = Object.assign({ groups: [], jobs: [] }, (await sget(K_BULK)) || {});
    const st = (await sget(K_ST)) || {};
    cats = {}; Object.entries(st.cats || {}).forEach(([k, v]) => { if (k !== 'all') cats[k] = (v && v.l) || k; }); Object.keys(DEF_CATS).forEach(k => { if (!cats[k] && (st.msgs || []).some(m => m.cat === k)) cats[k] = DEF_CATS[k]; });
    quickList = (st.msgs || []).map(m => ({ id: m.id, label: m.label || ('#' + m.id), cat: m.cat || '', type: m.type || 'msg', kinds: [...new Set((m.actions || []).map(a => a.k))], n: (m.actions || []).length }));
    const rtv = (await sget('wcrm_rt')) || {}; rt = rtv; const c = (await sget('wcrm_cfg')) || {}; cfgW = { winStart: c.winStart || '09:00', winEnd: c.winEnd || '19:00' };
    const ui = await sget('wcrm_bulk_ui'); if (ui && ui.opts && !loadAll.done) { camp.opts = Object.assign({}, DEF_OPTS, ui.opts, { dryRun: true, startAt: 0 }); if (ui.stepGap != null) camp.stepGap = ui.stepGap; if (ui.stepGapMax != null) camp.stepGapMax = ui.stepGapMax; } loadAll.done = true;
  }
  const saveUi = () => { try { chrome.storage.local.set({ wcrm_bulk_ui: { opts: camp.opts, stepGap: camp.stepGap, stepGapMax: camp.stepGapMax } }); } catch (e) {} };
  function askSources() {
    return new Promise(res => {
      const req = Date.now() + Math.random(); let done = false;
      const h = e => { const d = e.data; if (d && d.type === 'BULK_SOURCES_RESULT' && d.req === req) { done = true; window.removeEventListener('message', h); res(d.data); } };
      window.addEventListener('message', h); post({ type: 'BULK_SOURCES', req });
      setTimeout(() => { if (!done) { window.removeEventListener('message', h); res({ act: [], labels: [], chats: [], tabs: [], marks: [], profile: [], ok: false }); } }, 6000);
    });
  }
  const phoneOf = id => { const m = /^(\d{8,15})@c\.us$/.exec(id || ''); return m ? '+' + m[1] : ''; };
  function buildPool() {
    if (!src) { pool = []; return; }
    const known = new Map(src.act.filter(a => a.i || a.o || a.t).map(a => [norm(a.n), a]));
    const ph = new Map(src.act.map(a => [norm(a.n), phoneOf(a.id)]));
    const mk = (n, extra) => Object.assign({ n, known: known.has(norm(n)), phone: ph.get(norm(n)) || '' }, extra || {});
    const uniq = arr => { const seen = new Set(); return arr.filter(n => { const k = norm(n); if (seen.has(k)) return false; seen.add(k); return true; }); };
    if (seg === 'saved') pool = src.act.filter(a => !a.g).map(a => mk(a.n));
    else if (seg === 'inbox') pool = src.act.filter(a => a.i && !a.t && !a.g).sort((a, b) => b.i - a.i).map(a => mk(a.n));
    else if (seg === 'labels') pool = src.chats.filter(c => !segPick || c.labels.includes(segPick)).map(c => mk(c.n));
    else if (seg === 'crm') pool = uniq(src.tabs.filter(t => !segPick || t.name === segPick).flatMap(t => t.contacts || [])).map(n => mk(n));
    else if (seg === 'sales') pool = uniq((src.marks || []).filter(m => !segPick || m.day === segPick).map(m => m.n)).map(n => mk(n));
    else if (seg === 'noreply') { const d = +(segPick || 3), lim = Date.now() - d * 86400e3; pool = src.act.filter(a => !a.g && a.o && a.o > (a.i || 0) && a.o < lim).sort((a, b) => b.o - a.o).map(a => mk(a.n)); }
    else if (seg === 'profile') { const k = segPick || 'notes'; pool = (src.profile || []).filter(p => k === 'all' || (k === 'notes' && p.notes) || (k === 'value' && p.val)).map(p => mk(p.n)); }
    else if (seg === 'sheet') pool = pool.filter(c => c.sheet);
    const q = norm(filterQ); if (q) pool = pool.filter(c => norm(c.n).includes(q) || (c.phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, '') || '§'));
  }

  // ── telas ──
  const ARW = d => '<svg viewBox="0 0 24 24" width="46" height="46" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' + (d > 0 ? '<path d="M5 5l7 7-7 7M12 5l7 7-7 7"/>' : '<path d="M19 5l-7 7 7 7M12 5l-7 7 7 7"/>') + '</svg>';
  function setView(v) { if (v !== view) { step = 1; modal = false; } view = v; root.querySelectorAll('.bk-rail button').forEach(b => b.classList.toggle('on', b.dataset.v === v)); render(); }
  function render() {
    const T = { quick: step === 1 ? ['Envio Rápido', 'Selecione os contatos'] : ['Envio Rápido', 'Crie um script de envio'], groups: ['Contatos', 'Crie agrupamentos dos seus contatos mais utilizados para facilitar o envio'], camp: ['Enviar Campanha', 'Envie mensagens em massa para seus agrupamentos criados'], report: ['Relatório', 'Acompanhe e controle os envios (últimos 30)'] }[view];
    $h1.innerHTML = esc(T[0]) + '<small>' + esc(T[1]) + '</small>';
    ({ quick: () => step === 1 ? rQuick() : rScript(false), groups: rGroups, camp: () => rScript(true), report: rReport })[view]();
    if (modal) showModal();
  }
  function selCount() { return sel.size; }
  function rQuick() {
    buildPool();
    const segs = [['saved', 'Contatos Salvos'], ['inbox', 'Inbox'], ['labels', 'Etiquetas'], ['crm', 'CRM'], ['sales', '💰 Vendas marcadas'], ['noreply', 'Sem resposta'], ['profile', 'Perfil do contato'], ['sheet', 'Importar planilha']];
    const opt = (v, t, cur) => '<option value="' + esc(v) + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + esc(t) + '</option>';
    let pick = '';
    if (seg === 'labels') pick = '<select id="bk-pick">' + opt('', 'Todas as etiquetas', segPick) + (src ? src.labels.map(l => opt(l.name, l.name + ' (' + l.count + ')', segPick)).join('') : '') + '</select>';
    if (seg === 'crm') pick = '<select id="bk-pick">' + opt('', 'Todas as abas do CRM', segPick) + (src ? src.tabs.map(t => opt(t.name, t.name + ' (' + (t.contacts || []).length + ')', segPick)).join('') : '') + '</select>';
    if (seg === 'sales') { const days = src ? [...new Set((src.marks || []).map(m => m.day))] : []; pick = '<select id="bk-pick">' + opt('', 'Todos os dias de venda', segPick) + days.map(d => opt(d, 'Vendas ' + d, segPick)).join('') + '</select>'; }
    if (seg === 'noreply') pick = '<select id="bk-pick">' + [1, 2, 3, 7, 15, 30].map(d => opt(d, 'Sem resposta há ' + d + ' dia' + (d > 1 ? 's' : '') + ' ou mais', segPick || 3)).join('') + '</select>';
    if (seg === 'profile') pick = '<select id="bk-pick">' + opt('notes', 'Com anotação no CRM', segPick || 'notes') + opt('value', 'Com valor (R$) lançado', segPick || 'notes') + opt('all', 'Todos os contatos do CRM', segPick || 'notes') + '</select>';
    if (seg === 'sheet') pick = '<textarea id="bk-sheet" rows="3" placeholder="Cole números ou nome;número, um por linha"></textarea><div style="display:flex;gap:8px;margin-top:6px;align-items:center"><button class="btn sm" id="bk-sheet-ok">Adicionar</button><input type="file" id="bk-file" accept=".csv,.txt" style="font-size:12px;width:auto"></div>';
    const rows = pool.slice(0, 1500).map(c => '<div class="crow' + (sel.has(norm(c.n)) ? ' sel' : '') + '" data-n="' + esc(c.n) + '"><span class="ck">' + (sel.has(norm(c.n)) ? '✓' : '') + '</span><b>' + esc(c.n) + '</b><span class="ph">' + esc(c.phone) + '</span>' + (c.known ? '' : ' <span style="color:#d97706;font-size:11px">⚠ nunca conversou</span>') + '</div>').join('');
    const selList = [...sel.values()];
    $bd.innerHTML = '<div class="s1"><div class="seg"><div class="t">Contatos por segmento</div>' +
      segs.map(s => '<button class="btn" style="' + (seg === s[0] ? 'background:#1e3a8a' : '') + '" data-seg="' + s[0] + '">' + s[1] + '</button>').join('') +
      '<button class="btn dl" id="bk-exp">⬇ Exporta Em .XLSX</button></div>' +
      '<div><div style="display:flex;gap:10px"><input type="text" id="bk-q" placeholder="Pesquisar por numero ou nome do contato" value="' + esc(filterQ) + '"><button class="btn out" id="bk-none" style="white-space:nowrap">Remover todos</button><button class="btn" id="bk-all" style="white-space:nowrap">Selecionar todos (' + pool.length + ')</button></div>' +
      (pick ? '<div style="margin-top:10px">' + pick + '</div>' : '') +
      '<div class="qty"><span class="p" data-q="200">+200</span><span class="m" data-q="-200">-200</span><span class="p" data-q="100">+100</span><span class="m" data-q="-100">-100</span><span class="p" data-q="10">+10</span><span class="m" data-q="-10">-10</span></div>' +
      '<div class="clist" id="bk-list">' + (rows || '<div style="padding:22px;text-align:center;color:#6b7791">' + (src && !src.ok ? 'Abra o WhatsApp Web e aguarde carregar (ponte indisponível).' : 'Nenhum contato neste segmento.') + '</div>') + '</div></div>' +
      '<div class="side"><div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px"><h3 style="margin:0">Contatos Selecionados</h3><span class="bdg">+' + selCount() + '</span><button class="btn out" id="bk-clear">Remover Seleção</button></div>' +
      (selList.length ? '<div class="clist" style="max-height:calc(100vh - 330px);margin:0 0 12px">' + selList.slice(0, 400).map(c => '<div class="crow" data-rm="' + esc(c.n) + '"><span class="ph0">👤</span><b style="flex:1">' + esc(c.n) + '</b><span class="ph">' + esc(c.phone || '') + '</span><span style="color:#dc2626">✕</span></div>').join('') + '</div>' : '<div class="warnbar">⚠ Nenhum contato selecionado</div>') +
      (selList.length ? '<button class="btn gray" id="bk-savegrp" style="width:100%">💾 Salvar como agrupamento…</button>' : '') + '</div>' +
      '<button class="bk-arrow" id="bk-next" title="Prosseguir">' + ARW(1) + '</button></div>';
  }
  function qpanelItems() {
    const q = norm(qf.q); let list = quickList.filter(m => (!q || norm(m.label).includes(q)) && (qf.type === 'all' || (qf.type === 'msg' && m.type !== 'script') || (qf.type === 'script' && m.type === 'script') || m.kinds.includes(qf.type)) && (qf.cat === 'all' || (qf.cat === '_none' ? !m.cat : m.cat === qf.cat)));
    const groups = {}; list.forEach(m => { (groups[m.cat || ''] = groups[m.cat || ''] || []).push(m); });
    const keys = Object.keys(groups).sort((a, b) => (a === '' ? 1 : b === '' ? -1 : (cats[a] || a).localeCompare(cats[b] || b)));
    if (!keys.length) return '<div style="padding:16px;color:#6b7791;text-align:center">Nenhuma resposta rápida encontrada.</div>';
    return keys.map((k, i) => '<div class="qcat" style="background:' + CAT_COL[i % CAT_COL.length] + '"><div class="qh" data-qcat="' + esc(k) + '"><span>🗂️</span><b>' + esc(k ? (cats[k] || k) : 'Sem categoria') + ' <small>(' + groups[k].length + ')</small></b><span>' + (qf.closed[k] ? '▾' : '▴') + '</span></div>' +
      (qf.closed[k] ? '' : groups[k].map(m => '<div class="qi" data-qadd="' + esc(m.id) + '"><span class="qic">' + qIcon(m) + '</span><span class="qn">' + esc(m.label) + '</span><span class="qgo" title="Inserir no envio">▷</span></div>').join('')) + '</div>').join('');
  }
  function stepHtml(s, i) {
    const ctl = '<div class="sctl"><button data-up="' + i + '" title="Subir">↑</button><button data-dn="' + i + '" title="Descer">↓</button><button data-rmstep="' + i + '" title="Remover">✕</button></div>';
    const ql = id => (quickList.find(q => String(q.id) === String(id)) || { label: 'resposta apagada', type: 'msg', kinds: [] });
    if (s.type === 'quick') {
      const alts = (s.alts || []);
      return '<div class="step"><b>' + (i + 1) + '</b><div class="g"><div><span class="qic">' + qIcon(ql(s.msgId)) + '</span> <b>' + esc(ql(s.msgId).label) + '</b></div>' +
        (alts.length ? '<div class="alts">🎲 Alternativas (sorteia 1 por contato, em rodízio): ' + alts.map((a, j) => '<span class="alt">' + esc(ql(a).label) + ' <i data-altrm="' + i + '|' + j + '">✕</i></span>').join('') + '</div>' : '') +
        '<select data-alt="' + i + '" style="margin-top:6px;max-width:280px"><option value="">＋ alternativa (variar a resposta)…</option>' + quickList.filter(q => String(q.id) !== String(s.msgId) && !alts.includes(String(q.id))).map(q => '<option value="' + esc(q.id) + '">' + esc(q.label) + '</option>').join('') + '</select></div>' + ctl + '</div>';
    }
    if (s.type === 'text') {
      const v = s.variations || [''];
      return '<div class="step"><b>' + (i + 1) + '</b><div class="g"><div style="font-weight:700;margin-bottom:6px">📝 Texto <span style="font-weight:400;font-size:12px;color:#6b7791">— ' + v.length + ' variação(ões); cada contato recebe UMA, em rodízio</span></div>' +
        v.map((t, j) => '<div class="var"><span class="vn">V' + (j + 1) + '</span><textarea rows="3" data-sv="' + i + '|' + j + '" placeholder="Escreva a mensagem (use #primeiroNome)">' + esc(t) + '</textarea>' + (v.length > 1 ? '<button class="vx" data-vdel="' + i + '|' + j + '" title="Remover variação">✕</button>' : '') + '</div>').join('') +
        '<button class="btn sm gray" data-vadd="' + i + '">＋ Adicionar variação</button>' + (v.filter(x => (x || '').trim()).length < 3 ? ' <span style="font-size:11.5px;color:#92400e">dica: use 3 ou mais variações — mensagem idêntica para todos é o que mais derruba conta</span>' : '') + '</div>' + ctl + '</div>';
    }
    const lab = { wait: '⏱ Esperar', typing: '⌨ Mostrar digitando…', recording: '🎙 Mostrar gravando áudio…' }[s.type] || s.type;
    return '<div class="step"><b>' + (i + 1) + '</b><div class="g">' + lab + ' <input type="number" min="1" data-ss="' + i + '" value="' + (s.seconds || 3) + '" style="width:80px;display:inline-block"> segundos</div>' + ctl + '</div>';
  }
  function targetsNow() { const g = bulk.groups.find(x => x.id === camp.groupId); return camp.useSel && sel.size ? [...sel.values()].map(c => ({ n: c.n })) : (g ? g.contacts.map(c => ({ n: c.n })) : []); }
  function rScript(withGroup) {
    const targets = targetsNow();
    const top = withGroup ? '<div class="card" style="margin-bottom:12px"><label class="l">Para quem enviar</label><select id="bk-grp"><option value="">' + (sel.size ? '— Seleção atual do Envio Rápido (' + sel.size + ') —' : '— escolha um agrupamento —') + '</option>' + bulk.groups.map(x => '<option value="' + esc(x.id) + '"' + (camp.groupId === x.id && !(camp.useSel && sel.size) ? ' selected' : '') + '>' + esc(x.name) + ' (' + x.contacts.length + ')</option>').join('') + '</select></div>' : '';
    const empty = '<div class="sempty"><div class="sic">🧊</div><div class="st1">Nenhuma ação foi atribuída</div><div class="st2">Adicione ações para criar e configurar modelos de envio personalizados para seus clientes</div></div>';
    const addbtn = '<div style="position:relative;display:inline-block"><button class="btn" id="bk-addact">Adicionar Ação</button>' + (addMenu ? '<div class="amenu"><div data-add="quick">💬 Resposta rápida <small>(escolha na lista ao lado)</small></div><div data-add="text">📝 Texto (com variações)</div><div data-add="wait">⏱ Esperar (segundos)</div><div data-add="typing">⌨ Mostrar digitando…</div><div data-add="recording">🎙 Mostrar gravando áudio…</div></div>' : '') + '</div>';
    $bd.innerHTML = top + '<div class="s2"><button class="bk-arrow" id="bk-back" title="Voltar"' + (withGroup ? ' style="visibility:hidden"' : '') + '>' + ARW(-1) + '</button>' +
      '<div class="scard"><div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><h3 style="margin:0;font-size:17px">Crie um script de envio</h3><span class="tagchip" id="bk-tags" title="Variáveis">#Tags</span><span style="flex:1"></span><span style="font-size:12.5px;color:#4b5876"><b>' + targets.length + '</b> contato(s)</span></div>' +
      '<div id="bk-tagbox" class="hint" style="display:none;margin-bottom:10px">Use <b>#primeiroNome</b> para colocar o nome do cliente. Áudios vão como voz gravada. Textos e respostas rápidas podem ter várias versões.</div>' +
      (camp.steps.length ? '<div>' + camp.steps.map(stepHtml).join('') + '</div><div style="margin-top:10px">' + addbtn + '</div>' : empty + '<div style="text-align:center;margin-top:14px">' + addbtn + '</div>') +
      '<button class="bk-send" id="bk-send" title="Enviar">➤</button></div>' +
      '<div class="qpanel"><div class="qtitle">Selecione uma Resposta Rápida para inserir no envio da campanha</div>' +
      '<input type="text" id="bq-q" placeholder="🔍 Pesquisar resposta rápida" value="' + esc(qf.q) + '">' +
      '<div class="qflt"><button class="fl' + (qf.type === 'all' && qf.cat === 'all' ? ' on' : '') + '" id="bq-all">Tudo</button><select class="fl" id="bq-type"><option value="all">Por Tipo</option><option value="msg"' + (qf.type === 'msg' ? ' selected' : '') + '>⚡ Rápidas</option><option value="script"' + (qf.type === 'script' ? ' selected' : '') + '>🔗 Scripts</option><option value="audio"' + (qf.type === 'audio' ? ' selected' : '') + '>🎤 Com áudio</option><option value="image"' + (qf.type === 'image' ? ' selected' : '') + '>🖼️ Com imagem</option><option value="video"' + (qf.type === 'video' ? ' selected' : '') + '>🎥 Com vídeo</option><option value="text"' + (qf.type === 'text' ? ' selected' : '') + '>📝 Com texto</option></select>' +
      '<button class="fl' + (qf.cat === '_none' ? ' on' : '') + '" id="bq-none">Sem Categoria</button><select class="fl" id="bq-cat"><option value="all">Por Categoria</option>' + Object.keys(cats).map(k => '<option value="' + esc(k) + '"' + (qf.cat === k ? ' selected' : '') + '>' + esc(cats[k]) + '</option>').join('') + '</select></div>' +
      '<div id="bq-list" class="qlist">' + qpanelItems() + '</div></div></div>';
  }
  // risco do disparo (0–100) e estimativas — só orientação, não bloqueia
  function riskOf(o, nContacts) {
    let r = 0; const tips = []; const avg = (o.minSec + o.maxSec) / 2;
    if (avg < 30) { r += 40; tips.push('Intervalo médio muito curto — suba para 60 s ou mais.'); } else if (avg < 60) { r += 24; tips.push('Intervalo médio curto — o ideal é acima de 60 s.'); } else if (avg < 120) r += 12; else r += 4;
    if (o.maxSec - o.minSec < avg * 0.5) { r += 8; tips.push('Intervalo quase fixo parece robô — deixe máximo bem maior que o mínimo.'); }
    if (o.perHour > 40) { r += 20; tips.push('Mais de 40 envios por hora é arriscado.'); } else if (o.perHour > 25) r += 10;
    if (o.perDay > 250) { r += 18; tips.push('Mais de 250 por dia é arriscado numa conta sem histórico de volume.'); } else if (o.perDay > 150) r += 8;
    if (!o.onlyKnown) { r += 25; tips.push('Enviar para quem nunca conversou é o maior motivo de banimento.'); }
    const txt = camp.steps.filter(s => s.type === 'text'), minV = txt.length ? Math.min(...txt.map(s => (s.variations || []).filter(x => (x || '').trim()).length)) : 99;
    if (txt.length && minV < 2) { r += 12; tips.push('Texto igual para todos — crie 3 ou mais variações.'); } else if (txt.length && minV >= 3) r -= 5;
    if (!o.batchEvery) { r += 5; tips.push('Ative pausas longas entre lotes.'); }
    if (!o.warmN && nContacts > 50) { r += 5; tips.push('Comece devagar (aquecimento) nos primeiros contatos.'); }
    if (!o.useWindow) { r += 8; tips.push('Sem limite de horário: evite enviar de madrugada.'); }
    if (!o.skipRecentHours) r += 3;
    r = Math.max(0, Math.min(100, r)); const lvl = r < 25 ? ['Baixo', '#16a34a'] : r < 50 ? ['Médio', '#d97706'] : ['Alto', '#dc2626'];
    // duração estimada
    let sec = nContacts * avg * (1 + (o.warmN ? Math.min(o.warmN, nContacts) * (o.warmFactor - 1) / Math.max(1, nContacts) : 0));
    if (o.batchEvery) sec += Math.floor(nContacts / o.batchEvery) * ((o.batchMin + o.batchMax) / 2) * 60;
    const days = Math.ceil(nContacts / Math.max(1, o.perDay));
    const hrs = Math.max(sec / 3600, nContacts / Math.max(1, o.perHour));
    return { score: r, lvl, tips, hrs, days };
  }
  const fmtDur = h => h < 1 ? Math.round(h * 60) + ' min' : (h < 48 ? h.toFixed(1).replace('.', ',') + ' h' : Math.round(h / 24) + ' dias');
  function modalHtml() {
    const o = camp.opts, n = targetsNow().length; const rk = riskOf(o, n);
    const tabsAll = (src && src.tabs) || [];
    const chk = (id, on, t, extra) => '<label class="chk"><input type="checkbox" id="' + id + '" ' + (on ? 'checked' : '') + '> ' + t + '</label>' + (extra || '');
    const num = (id, v, lab, min) => '<div><label class="l">' + lab + '</label><input type="number" id="' + id + '" value="' + v + '" min="' + (min == null ? 0 : min) + '"></div>';
    return '<div class="bk-modal"><div class="bk-mc"><div style="display:flex;align-items:center;gap:12px;margin-bottom:12px"><h2 style="margin:0;font-size:20px;flex:1">Configurações do envio <small style="font-weight:400;color:#6b7791">· ' + n + ' contato(s)</small></h2><button class="bk-close" id="bm-x">✕ Fechar</button></div>' +
      '<div class="riskbar"><div><b>Risco de bloqueio:</b> <span id="bm-risk" style="color:' + rk.lvl[1] + ';font-weight:800">' + rk.lvl[0] + ' (' + rk.score + ')</span> · <b>Duração estimada:</b> <span id="bm-est">' + fmtDur(rk.hrs) + (rk.days > 1 ? ' (≈ ' + rk.days + ' dias pelo limite diário)' : '') + '</span></div><div class="meter"><i id="bm-meter" style="width:' + rk.score + '%;background:' + rk.lvl[1] + '"></i></div><div id="bm-tips" style="font-size:12px;color:#7a5200;margin-top:6px">' + (rk.tips.length ? rk.tips.map(t => '• ' + esc(t)).join('<br>') : '✅ Configuração segura.') + '</div></div>' +
      '<div class="grid2" style="align-items:start;margin-top:12px"><div>' +
      '<div class="card"><h3>⏱ Intervalo entre contatos</h3><div class="grid2">' + num('bm-min', o.minSec, 'Mínimo (s)', 10) + num('bm-max', o.maxSec, 'Máximo (s) — sorteado a cada envio', 10) + '</div>' +
      '<div style="font-size:12px;color:#6b7791;margin-top:6px">Cada espera é sorteada entre o mínimo e o máximo, então nunca sai em ritmo de relógio.</div>' +
      '<div class="grid2" style="margin-top:10px">' + num('bm-sg', camp.stepGap, 'Pausa entre ações — mín (s)') + num('bm-sgx', camp.stepGapMax, 'Pausa entre ações — máx (s)') + '</div>' +
      chk('bm-typing', o.typingSim, '⌨ Simular “digitando…” antes de cada texto (tempo conforme o tamanho)') + '</div>' +
      '<div class="card"><h3>📊 Limites</h3><div class="grid2">' + num('bm-ph', o.perHour, 'Por hora', 1) + num('bm-pd', o.perDay, 'Por dia', 1) + '</div>' +
      '<div style="font-size:12px;color:#6b7791;margin-top:6px">Os limites contam junto com o Follow Up (mesma conta, mesmo contador).</div></div>' +
      '<div class="card"><h3>🛌 Pausas e aquecimento</h3>' +
      '<div class="grid3">' + num('bm-be', o.batchEvery, 'Pausa longa a cada (contatos)') + num('bm-bmin', o.batchMin, 'Pausa mín (min)') + num('bm-bmax', o.batchMax, 'Pausa máx (min)') + '</div><div style="font-size:12px;color:#6b7791;margin:4px 0 8px">0 = sem pausas longas.</div>' +
      '<div class="grid2">' + num('bm-wn', o.warmN, 'Aquecimento: primeiros (contatos)') + num('bm-wf', o.warmFactor, 'Intervalo multiplicado por', 1) + '</div>' +
      num('bm-fl', o.pauseAfterFails, 'Pausar o disparo após (falhas seguidas)', 1) + '</div></div><div>' +
      '<div class="card"><h3>🕒 Horário</h3>' + chk('bm-win', o.useWindow, 'Só enviar dentro do horário') +
      '<div class="grid2" style="margin-top:6px">' + '<div><label class="l">Das</label><input type="time" id="bm-ws" value="' + esc(o.customWindow ? o.winStart : cfgW.winStart) + '"></div><div><label class="l">às</label><input type="time" id="bm-we" value="' + esc(o.customWindow ? o.winEnd : cfgW.winEnd) + '"></div></div>' +
      '<div style="font-size:12px;color:#6b7791;margin-top:4px">Dias da semana: os mesmos do Follow Up (Ajustes).</div>' +
      '<label class="l" style="margin-top:10px">Iniciar em (opcional — vazio = agora)</label><input type="datetime-local" id="bm-start" value="' + (o.startAt ? new Date(o.startAt - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '') + '"></div>' +
      '<div class="card"><h3>🛡️ Proteções</h3>' +
      chk('bm-known', o.onlyKnown, 'Nunca enviar para quem nunca conversou comigo') +
      chk('bm-shuf', o.shuffle, '🔀 Embaralhar a ordem dos contatos') +
      '<div class="grid2" style="margin-top:6px">' + num('bm-rec', o.skipRecentHours, 'Pular quem recebeu disparo há menos de (h)') + num('bm-act', o.skipActiveMin, 'Pular quem escreveu há menos de (min)') + '</div>' +
      '<label class="l" style="margin-top:10px">Pular quem está nestas abas do CRM</label><div class="tabsel">' + (tabsAll.length ? tabsAll.map(t => '<label class="tchip"><input type="checkbox" data-xt="' + esc(t.name) + '" ' + ((o.excludeTabs || []).includes(t.name) ? 'checked' : '') + '> ' + esc(t.name) + '</label>').join('') : '<span style="font-size:12px;color:#6b7791">Sem abas no CRM.</span>') + '</div>' +
      '<div style="font-size:12px;color:#6b7791;margin-top:6px">Grupos e contatos bloqueados nunca recebem. A cada falha seguida o disparo pausa sozinho.</div></div>' +
      '<div class="card" style="border:2px solid ' + (o.dryRun ? '#f59e0b' : '#16a34a') + '"><h3>' + (o.dryRun ? '🧪 Modo teste LIGADO' : '🚀 Envio REAL') + '</h3>' + chk('bm-dry', o.dryRun, '<b>Modo teste</b> — simula tudo e NÃO envia nada') +
      '<input type="text" id="bm-name" placeholder="Nome da campanha (ex.: Black November)" value="' + esc(camp.name) + '" style="margin-top:8px"></div></div></div>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:6px;position:sticky;bottom:-20px;background:#f4f6fb;padding:12px 0 4px;border-top:1px solid #e3e8f2"><button class="btn gray" id="bm-cancel">Voltar</button><button class="btn ' + (o.dryRun ? '' : 'green') + '" id="bm-go" style="font-size:15px;padding:12px 28px">' + (o.dryRun ? '🧪 Iniciar TESTE (sem enviar)' : '▶ Iniciar disparo') + '</button></div></div></div>';
  }
  function showModal() { let m = root.querySelector('.bk-modal'); if (m) m.remove(); root.querySelector('.bk-main').insertAdjacentHTML('beforeend', modalHtml()); }
  function hideModal() { modal = false; const m = root.querySelector('.bk-modal'); if (m) m.remove(); }
  function readModal() {
    const g = id => document.getElementById(id); if (!g('bm-min')) return;
    const o = camp.opts, n = (id, d, mn) => { const v = parseFloat(g(id).value); return Math.max(mn == null ? 0 : mn, isFinite(v) ? v : d); };
    o.minSec = n('bm-min', 45, 10); o.maxSec = Math.max(o.minSec, n('bm-max', 150, 10)); o.perHour = n('bm-ph', 25, 1); o.perDay = n('bm-pd', 120, 1);
    camp.stepGap = n('bm-sg', 0); camp.stepGapMax = Math.max(camp.stepGap, n('bm-sgx', 0));
    o.typingSim = g('bm-typing').checked; o.batchEvery = Math.round(n('bm-be', 0)); o.batchMin = n('bm-bmin', 5, 1); o.batchMax = Math.max(o.batchMin, n('bm-bmax', 12, 1));
    o.warmN = Math.round(n('bm-wn', 0)); o.warmFactor = n('bm-wf', 2, 1); o.pauseAfterFails = Math.round(n('bm-fl', 3, 1));
    o.useWindow = g('bm-win').checked; const ws = g('bm-ws').value, we = g('bm-we').value; o.customWindow = !!(ws && we && (ws !== cfgW.winStart || we !== cfgW.winEnd)); o.winStart = ws || cfgW.winStart; o.winEnd = we || cfgW.winEnd;
    const st = g('bm-start').value; o.startAt = st ? new Date(st).getTime() : 0;
    o.onlyKnown = g('bm-known').checked; o.shuffle = g('bm-shuf').checked; o.skipRecentHours = n('bm-rec', 0); o.skipActiveMin = n('bm-act', 0);
    o.excludeTabs = [...root.querySelectorAll('[data-xt]')].filter(x => x.checked).map(x => x.dataset.xt);
    o.dryRun = g('bm-dry').checked; camp.name = g('bm-name').value;
  }
  function refreshRisk() {
    readModal(); const rk = riskOf(camp.opts, targetsNow().length); const g = id => document.getElementById(id);
    g('bm-risk').textContent = rk.lvl[0] + ' (' + rk.score + ')'; g('bm-risk').style.color = rk.lvl[1]; g('bm-meter').style.width = rk.score + '%'; g('bm-meter').style.background = rk.lvl[1];
    g('bm-est').textContent = fmtDur(rk.hrs) + (rk.days > 1 ? ' (≈ ' + rk.days + ' dias pelo limite diário)' : ''); g('bm-tips').innerHTML = rk.tips.length ? rk.tips.map(t => '• ' + esc(t)).join('<br>') : '✅ Configuração segura.';
  }

  function rGroups() {
    const g = bulk.groups;
    $bd.innerHTML = '<div class="card"><h3>Agrupamentos salvos (' + g.length + ')</h3>' + (g.length ? g.map(x => '<div class="gcard"><span class="c" style="background:' + esc(x.color || '#90a4ae') + '"></span><div class="g"><b>' + esc(x.name) + '</b><div style="font-size:12px;color:#6b7791">' + x.contacts.length + ' contato(s)</div></div><button class="btn sm" data-use="' + esc(x.id) + '">Usar na campanha</button><button class="btn sm red" data-del="' + esc(x.id) + '">Excluir</button></div>').join('') : '<div style="color:#6b7791;padding:12px">Nenhum agrupamento ainda. Vá em Envio Rápido, selecione contatos e clique em Salvar como agrupamento.</div>') + '</div>';
  }
  function jobStats(j) {
    const c = j.contacts || []; const n = s => c.filter(x => x.state === s).length;
    return { total: c.length, sent: n('sent'), err: n('error'), skip: n('skipped'), pend: n('pending') };
  }
  function pillOf(j) { const m = { running: ['p-run', 'Enviando'], paused: ['p-pause', 'Pausado'], done: ['p-done', 'Concluído'], stopped: ['p-stop', 'Parado'] }[j.status] || ['p-done', j.status]; return '<span class="pill ' + m[0] + '">' + m[1] + '</span>'; }
  function rReport() {
    const j0 = jobOpen && bulk.jobs.find(x => x.id === jobOpen);
    const dk = new Date(); const dkey = dk.getFullYear() + '-' + pad(dk.getMonth() + 1) + '-' + pad(dk.getDate()); const today = rt.day === dkey ? (rt.sent || 0) : 0;
    const head = '<div class="hint" style="margin-bottom:12px">Hoje (todo o CRM): <b>' + today + '</b> envio(s) · última hora: <b>' + ((rt.hourly || []).filter(t => Date.now() - t < 3600e3).length) + '</b></div>';
    if (j0) {
      const s = jobStats(j0); const pct = s.total ? Math.round((s.sent + s.err + s.skip) / s.total * 100) : 0;
      $bd.innerHTML = head + '<button class="btn gray sm" id="bk-back">← voltar</button><div class="card" style="margin-top:10px"><h3>' + esc(j0.name || 'Campanha') + ' ' + pillOf(j0) + (j0.opts && j0.opts.dryRun ? ' <span class="pill p-pause">🧪 teste</span>' : '') + '</h3>' +
        '<div class="bar"><i style="width:' + pct + '%"></i></div><div style="margin:8px 0;font-size:13px">' + pct + '% · ✅ ' + s.sent + ' enviados · ❌ ' + s.err + ' erros · ⏭ ' + s.skip + ' pulados · ⏳ ' + s.pend + ' na fila' + (j0.status === 'running' && j0.waitWhy ? '<br><span style="color:#92400e">Aguardando: ' + esc(j0.waitWhy) + '</span>' : '') + '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' + (j0.status === 'running' ? '<button class="btn" data-ctrl="pause">⏸ Pausar</button>' : (j0.status === 'paused' ? '<button class="btn green" data-ctrl="resume">▶ Retomar</button>' : '')) + (s.err ? '<button class="btn gray" data-ctrl="retry">↻ Tentar de novo os erros</button>' : '') + (['running', 'paused'].includes(j0.status) ? '<button class="btn red" data-ctrl="stop">⏹ Parar</button>' : '') + '<button class="btn gray" id="bk-csv">⬇ Baixar relatório</button></div></div>' +
        '<table class="tbl"><tr><th>Contato</th><th>Situação</th><th>Detalhe</th><th>Horário</th></tr>' + j0.contacts.map(c => '<tr><td style="text-align:left">' + esc(c.n) + '</td><td>' + ({ sent: c.simulated ? '🧪 simulado' : '✅ enviado', error: '❌ erro', skipped: '⏭ pulado', pending: '⏳ fila' }[c.state] || c.state) + '</td><td style="text-align:left;font-size:12px">' + esc(c.why || c.text || '') + '</td><td>' + (c.at ? fmt(c.at) : '') + '</td></tr>').join('') + '</table>';
      return;
    }
    $bd.innerHTML = head + (bulk.jobs.length ? '<table class="tbl"><tr><th>Data</th><th>Campanha</th><th>Contatos disparados</th><th>Enviados</th><th>Erro ao enviar</th><th>Situação</th><th>Ação</th></tr>' + bulk.jobs.map(j => { const s = jobStats(j); return '<tr><td>' + fmt(j.created) + '</td><td>' + esc(j.name || 'Campanha') + (j.opts && j.opts.dryRun ? ' 🧪' : '') + '</td><td>' + s.total + '</td><td>' + s.sent + '</td><td>' + s.err + '</td><td>' + pillOf(j) + '</td><td><button class="btn sm" data-open="' + esc(j.id) + '">👁 ver</button></td></tr>'; }).join('') + '</table>' : '<div class="card" style="text-align:center;color:#6b7791">Nenhum disparo realizado ainda.</div>');
  }

  // ── .xlsx de verdade (sem biblioteca): zip "armazenado" + XML ──
  function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) { c ^= b[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return (c ^ 0xFFFFFFFF) >>> 0; }
  function zipStore(files) {
    const enc = new TextEncoder(), chunks = [], cen = []; let off = 0;
    const u16 = n => [n & 255, (n >> 8) & 255], u32 = n => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
    files.forEach(f => {
      const nm = enc.encode(f.name), d = enc.encode(f.data), crc = crc32(d);
      const lh = new Uint8Array([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(d.length), ...u32(d.length), ...u16(nm.length), ...u16(0)]);
      chunks.push(lh, nm, d);
      cen.push(new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(d.length), ...u32(d.length), ...u16(nm.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), nm);
      off += lh.length + nm.length + d.length;
    });
    let cl = 0; cen.forEach(c => cl += c.length);
    const end = new Uint8Array([0x50, 0x4b, 5, 6, 0, 0, 0, 0, ...u16(files.length), ...u16(files.length), ...u32(cl), ...u32(off), 0, 0]);
    return new Blob([...chunks, ...cen, end], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  function xlsxBlob(rows) {
    const col = i => String.fromCharCode(65 + i);
    const x = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + rows.map((r, i) => '<row r="' + (i + 1) + '">' + r.map((c, j) => '<c r="' + col(j) + (i + 1) + '" t="inlineStr"><is><t>' + x(c) + '</t></is></c>').join('') + '</row>').join('') + '</sheetData></worksheet>';
    return zipStore([
      { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>' },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Contatos" sheetId="1" r:id="rId1"/></sheets></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
      { name: 'xl/worksheets/sheet1.xml', data: sheet }]);
  }
  function downloadXlsx(name, rows) { const a = document.createElement('a'); a.href = URL.createObjectURL(xlsxBlob(rows)); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800); }

  // ── eventos ──
  root.addEventListener('click', async e => {
    const t = e.target; const q = s => t.closest(s);
    if (q('#bm-x') || q('#bm-cancel')) { readModal(); saveUi(); return hideModal(); }
    if (q('#bm-go')) return startJob();
    if (q('.bk-modal')) { if (!q('.bk-mc')) hideModal(); return; }
    if (q('.bk-close')) return close();
    const rb = q('.bk-rail button'); if (rb) return setView(rb.dataset.v);
    if (addMenu && !q('#bk-addact') && !q('[data-add]')) { addMenu = false; const m = root.querySelector('.amenu'); if (m) m.remove(); }
    if (view === 'quick' && step === 1) {
      const sb = q('[data-seg]'); if (sb) { seg = sb.dataset.seg; segPick = ''; if (seg !== 'sheet') pool = []; return render(); }
      const row = q('.crow[data-n]'); if (row) { const n = row.dataset.n, k = norm(n), c = pool.find(x => norm(x.n) === k) || { n }; if (sel.has(k)) sel.delete(k); else sel.set(k, c); return keepScroll(rQuick); }
      const rm = q('[data-rm]'); if (rm) { sel.delete(norm(rm.dataset.rm)); return keepScroll(rQuick); }
      if (q('#bk-all')) { const all = pool.every(c => sel.has(norm(c.n))); pool.forEach(c => all ? sel.delete(norm(c.n)) : sel.set(norm(c.n), c)); return keepScroll(rQuick); }
      if (q('#bk-none')) { pool.forEach(c => sel.delete(norm(c.n))); return keepScroll(rQuick); }
      if (q('#bk-clear')) { sel.clear(); return keepScroll(rQuick); }
      const qb = q('[data-q]'); if (qb) { const d = +qb.dataset.q; if (d > 0) { let n = 0; for (const c of pool) if (!sel.has(norm(c.n)) && n < d) { sel.set(norm(c.n), c); n++; } } else { let n = 0; for (const c of [...pool].reverse()) if (sel.has(norm(c.n)) && n < -d) { sel.delete(norm(c.n)); n++; } } return keepScroll(rQuick); }
      if (q('#bk-sheet-ok')) { const txt = document.getElementById('bk-sheet').value; addSheet(txt); return render(); }
      if (q('#bk-exp')) { const rows = [['Nome', 'Telefone', 'Selecionado']].concat(pool.map(c => [c.n, c.phone || '', sel.has(norm(c.n)) ? 'sim' : 'não'])); return downloadXlsx('contatos.xlsx', rows); }
      if (q('#bk-savegrp')) { const name = (prompt('Nome do agrupamento:') || '').trim(); if (!name) return; const group = { id: 'g' + Date.now(), name, color: COLORS[bulk.groups.length % COLORS.length], contacts: [...sel.values()].map(c => ({ n: c.n })) }; post({ type: 'BULK_SAVE_GROUP', group }); await sleep(500); await loadAll(); alert('Agrupamento "' + name + '" salvo (' + group.contacts.length + ' contatos). Ele aparece em 👥 Contatos.'); return; }
      if (q('#bk-next')) { if (!sel.size) return alert('Selecione pelo menos um contato.'); camp.useSel = true; camp.groupId = ''; step = 2; return render(); }
    }
    if ((view === 'quick' && step === 2) || view === 'camp') {
      if (q('#bk-back')) { step = 1; return render(); }
      if (q('#bk-tags')) { const b = document.getElementById('bk-tagbox'); b.style.display = b.style.display === 'none' ? 'block' : 'none'; return; }
      if (q('#bk-addact')) { addMenu = !addMenu; return rScriptKeep(); }
      const ad = q('[data-add]'); if (ad) { addMenu = false; const k = ad.dataset.add; if (k === 'text') camp.steps.push({ type: 'text', variations: ['', '', ''] }); else if (k === 'wait') camp.steps.push({ type: 'wait', seconds: 5 }); else if (k === 'typing') camp.steps.push({ type: 'typing', seconds: 4 }); else if (k === 'recording') camp.steps.push({ type: 'recording', seconds: 5 }); rScriptKeep(); if (k === 'quick') { const i = document.getElementById('bq-q'); i && i.focus(); } return; }
      const qa = q('[data-qadd]'); if (qa) { camp.steps.push({ type: 'quick', msgId: String(qa.dataset.qadd), alts: [] }); return rScriptKeep(); }
      const qc = q('[data-qcat]'); if (qc) { qf.closed[qc.dataset.qcat] = !qf.closed[qc.dataset.qcat]; document.getElementById('bq-list').innerHTML = qpanelItems(); return; }
      if (q('#bq-all')) { qf.type = 'all'; qf.cat = 'all'; qf.q = ''; return rScriptKeep(); }
      if (q('#bq-none')) { qf.cat = qf.cat === '_none' ? 'all' : '_none'; return rScriptKeep(); }
      const up = q('[data-up]'); if (up) { const i = +up.dataset.up; if (i > 0) { const a = camp.steps; [a[i - 1], a[i]] = [a[i], a[i - 1]]; } return rScriptKeep(); }
      const dn = q('[data-dn]'); if (dn) { const i = +dn.dataset.dn, a = camp.steps; if (i < a.length - 1) [a[i + 1], a[i]] = [a[i], a[i + 1]]; return rScriptKeep(); }
      const rs = q('[data-rmstep]'); if (rs) { camp.steps.splice(+rs.dataset.rmstep, 1); return rScriptKeep(); }
      const va = q('[data-vadd]'); if (va) { camp.steps[+va.dataset.vadd].variations.push(''); return rScriptKeep(); }
      const vd = q('[data-vdel]'); if (vd) { const [i, j] = vd.dataset.vdel.split('|').map(Number); camp.steps[i].variations.splice(j, 1); return rScriptKeep(); }
      const ar = q('[data-altrm]'); if (ar) { const [i, j] = ar.dataset.altrm.split('|').map(Number); camp.steps[i].alts.splice(j, 1); return rScriptKeep(); }
      if (q('#bk-send')) {
        const tg = targetsNow(); if (!tg.length) return alert(view === 'camp' ? 'Escolha um agrupamento (ou a seleção do Envio Rápido).' : 'Volte e selecione os contatos.');
        if (!camp.steps.length) return alert('Adicione pelo menos uma ação ao script.');
        if (!camp.steps.some(s => s.type === 'quick' || (s.type === 'text' && (s.variations || []).some(v => (v || '').trim())))) return alert('O script precisa ter pelo menos uma mensagem (texto preenchido ou resposta rápida).');
        modal = true; return showModal();
      }
    }
    if (view === 'groups') {
      const u = q('[data-use]'); if (u) { camp.groupId = u.dataset.use; camp.useSel = false; sel.clear(); return setView('camp'); }
      const d = q('[data-del]'); if (d) { if (confirm('Excluir este agrupamento?')) { post({ type: 'BULK_DEL_GROUP', id: d.dataset.del }); await sleep(400); await loadAll(); render(); } return; }
    }
    if (view === 'report') {
      const o = q('[data-open]'); if (o) { jobOpen = o.dataset.open; return render(); }
      if (q('#bk-back')) { jobOpen = null; return render(); }
      const c = q('[data-ctrl]'); if (c) { post({ type: 'BULK_CTRL', id: jobOpen, op: c.dataset.ctrl }); await sleep(500); await loadAll(); return render(); }
      if (q('#bk-csv')) { const j = bulk.jobs.find(x => x.id === jobOpen); if (j) download('relatorio-' + (j.name || 'campanha') + '.csv', [['Contato', 'Situação', 'Detalhe', 'Horário']].concat(j.contacts.map(c => [c.n, c.state + (c.simulated ? ' (simulado)' : ''), c.why || c.text || '', c.at ? fmt(c.at) : '']))); return; }
    }
  });
  root.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'bk-pick') { segPick = t.value; pool = []; render(); }
    if (t.id === 'bk-file') { const f = t.files[0]; if (f) { const r = new FileReader(); r.onload = () => { addSheet(String(r.result)); render(); }; r.readAsText(f); } }
    if (t.id === 'bk-grp') { camp.groupId = t.value; camp.useSel = !t.value; rScriptKeep(); }
    if (t.id === 'bq-type') { qf.type = t.value; rScriptKeep(); }
    if (t.id === 'bq-cat') { qf.cat = t.value; rScriptKeep(); }
    if (t.dataset && t.dataset.alt !== undefined && t.value) { const s = camp.steps[+t.dataset.alt]; s.alts = (s.alts || []).concat([String(t.value)]); rScriptKeep(); }
    if (modal && t.closest && t.closest('.bk-modal')) { if (t.id === 'bm-dry') { readModal(); showModal(); } else refreshRisk(); }
  });
  root.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'bk-q') { filterQ = t.value; const p = t.selectionStart; rQuick(); const n = document.getElementById('bk-q'); if (n) { n.focus(); n.setSelectionRange(p, p); } return; }
    if (t.id === 'bq-q') { qf.q = t.value; document.getElementById('bq-list').innerHTML = qpanelItems(); return; }
    if (t.dataset && t.dataset.sv) { const [i, j] = t.dataset.sv.split('|').map(Number); if (camp.steps[i]) camp.steps[i].variations[j] = t.value; return; }
    if (t.dataset && t.dataset.ss) { const s = camp.steps[+t.dataset.ss]; if (s) s.seconds = Math.max(1, +t.value || 1); return; }
    if (modal && t.closest && t.closest('.bk-modal')) refreshRisk();
  });
  // redesenha o script sem perder o scroll da lista de respostas e o foco da busca
  function rScriptKeep() { const l = document.getElementById('bq-list'); const st = l ? l.scrollTop : 0; const sc = $bd.scrollTop; render(); const n = document.getElementById('bq-list'); if (n) n.scrollTop = st; $bd.scrollTop = sc; }
  function keepScroll(fn) { const l = document.getElementById('bk-list'); const st = l ? l.scrollTop : 0; fn(); const n = document.getElementById('bk-list'); if (n) n.scrollTop = st; }

  function addSheet(txt) {
    const lines = String(txt || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean); const have = new Set(pool.filter(c => c.sheet).map(c => norm(c.n)));
    lines.forEach(l => { const parts = l.split(/[;,\t]/).map(s => s.trim()); const num = (parts.find(p => p.replace(/\D/g, '').length >= 8) || '').replace(/\D/g, ''); const name = parts.find(p => p && p.replace(/\D/g, '').length < 8) || ''; const n = name || num; if (n && !have.has(norm(n))) { have.add(norm(n)); pool.push({ n: num || n, label: name, sheet: true, known: !!(src && src.act.some(a => norm(a.n) === norm(n) || (num && a.n.replace(/\D/g, '').endsWith(num.slice(-9))))) }); } });
  }
  function download(name, rows) {
    const csv = rows.map(r => r.map(c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(';')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function startJob() {
    readModal(); saveUi();
    const g = bulk.groups.find(x => x.id === camp.groupId);
    let targets = targetsNow();
    if (!targets.length) return alert('Escolha os contatos (Envio Rápido) ou um agrupamento.');
    if (!camp.steps.length) return alert('Adicione pelo menos uma ação.');
    const o = camp.opts;
    if (o.shuffle) { for (let i = targets.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [targets[i], targets[j]] = [targets[j], targets[i]]; } }
    if (!o.dryRun && !confirm('Vai ENVIAR de verdade para ' + targets.length + ' contato(s), 1 por vez, com intervalo de ' + o.minSec + '–' + o.maxSec + ' s (limite ' + o.perHour + '/hora e ' + o.perDay + '/dia).\n\nMantenha o computador ligado e o WhatsApp Web aberto. Continuar?')) return;
    const job = { id: 'j' + Date.now(), name: camp.name || (g ? g.name : 'Campanha'), steps: JSON.parse(JSON.stringify(camp.steps)), stepGap: camp.stepGap, stepGapMax: camp.stepGapMax, seed: Math.floor(Math.random() * 997), opts: Object.assign({}, o), contacts: targets.map(c => ({ n: c.n, state: 'pending' })) };
    post({ type: 'BULK_START', job }); await sleep(600); await loadAll(); jobOpen = job.id; hideModal(); sel.clear(); step = 1; setView('report');
  }

  async function open(v) {
    opened = true; root.classList.add('show'); await loadAll();
    if (v) view = v; setView(view); await refreshSources(); setView(view);
    clearInterval(timer); timer = setInterval(async () => { if (!opened || view !== 'report') return; await loadAll(); const a = document.activeElement; if (!a || a.tagName !== 'INPUT') render(); }, 4000);
  }
  async function refreshSources() {
    for (let i = 0; i < 6; i++) { src = await askSources(); if (src && src.ok && (src.act.length || src.chats.length)) return; if (opened && view === 'quick') { const l = document.getElementById('bk-list'); if (l) l.innerHTML = '<div style="padding:22px;text-align:center;color:#6b7791">Carregando contatos do WhatsApp…</div>'; } await sleep(2500); }
  }
  function close() { opened = false; root.classList.remove('show'); clearInterval(timer); }
  window.addEventListener('message', e => { if (e.data && e.data.type === 'OPEN_BULK') open(e.data.view); });
  window.__wcrmBulkTest = { bulkStepsView: () => camp.steps };
})();
