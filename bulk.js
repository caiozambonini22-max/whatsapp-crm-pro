// WhatsApp CRM Pro v4.48 — bulk.js
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
  let view = 'quick', opened = false, timer = null;
  let src = null;                       // fontes de contatos (ponte do WhatsApp)
  let seg = 'saved', segPick = '';      // segmento atual
  let pool = [];                        // contatos exibidos [{n, known, ...}]
  let filterQ = '';
  const sel = new Map();                // nk -> contato selecionado
  let camp = { groupId: '', useSel: true, steps: [], stepGap: 8, opts: { minSec: 40, maxSec: 120, perHour: 30, perDay: 150, useWindow: true, onlyKnown: true, dryRun: true }, name: '' };
  let bulk = { groups: [], jobs: [] }, rt = {}, cfgW = {}, quickList = [];
  let jobOpen = null;

  async function loadAll() {
    bulk = Object.assign({ groups: [], jobs: [] }, (await sget(K_BULK)) || {});
    const st = (await sget(K_ST)) || {}; quickList = (st.msgs || []).map(m => ({ id: m.id, label: m.label || ('#' + m.id), cat: m.cat, n: (m.actions || []).length }));
    const rtv = (await sget('wcrm_rt')) || {}; rt = rtv; const c = (await sget('wcrm_cfg')) || {}; cfgW = { winStart: c.winStart || '09:00', winEnd: c.winEnd || '19:00' };
  }
  function askSources() {
    return new Promise(res => {
      const req = Date.now() + Math.random(); let done = false;
      const h = e => { const d = e.data; if (d && d.type === 'BULK_SOURCES_RESULT' && d.req === req) { done = true; window.removeEventListener('message', h); res(d.data); } };
      window.addEventListener('message', h); post({ type: 'BULK_SOURCES', req });
      setTimeout(() => { if (!done) { window.removeEventListener('message', h); res({ act: [], labels: [], chats: [], tabs: [], ok: false }); } }, 6000);
    });
  }
  function buildPool() {
    if (!src) { pool = []; return; }
    const known = new Map(src.act.filter(a => a.i || a.o || a.t).map(a => [norm(a.n), a]));
    const mk = (n, extra) => Object.assign({ n, known: known.has(norm(n)) }, extra || {});
    if (seg === 'saved') pool = src.act.map(a => mk(a.n));
    else if (seg === 'inbox') pool = src.act.filter(a => a.i && !a.t).sort((a, b) => b.i - a.i).map(a => mk(a.n));
    else if (seg === 'labels') pool = src.chats.filter(c => !segPick || c.labels.includes(segPick)).map(c => mk(c.n));
    else if (seg === 'tabs') { const seen = new Set(); pool = []; src.tabs.filter(t => !segPick || t.name === segPick).forEach(t => (t.contacts || []).forEach(n => { if (!seen.has(norm(n))) { seen.add(norm(n)); pool.push(mk(n)); } })); }
    else if (seg === 'sheet') pool = pool.filter(c => c.sheet);
    const q = norm(filterQ); if (q) pool = pool.filter(c => norm(c.n).includes(q));
  }

  // ── telas ──
  function setView(v) { view = v; root.querySelectorAll('.bk-rail button').forEach(b => b.classList.toggle('on', b.dataset.v === v)); render(); }
  function render() {
    const T = { quick: ['Envio Rápido', 'Selecione os contatos'], groups: ['Contatos', 'Crie agrupamentos dos seus contatos mais utilizados para facilitar o envio'], camp: ['Enviar Campanha', 'Envie mensagens em massa para seus agrupamentos criados'], report: ['Relatório', 'Acompanhe e controle os envios (últimos 30)'] }[view];
    $h1.innerHTML = esc(T[0]) + '<small>' + esc(T[1]) + '</small>';
    ({ quick: rQuick, groups: rGroups, camp: rCamp, report: rReport })[view]();
  }
  function selCount() { return sel.size; }
  function rQuick() {
    buildPool();
    const segs = [['saved', 'Contatos Salvos'], ['inbox', 'Inbox'], ['labels', 'Etiquetas'], ['tabs', 'Abas do CRM'], ['sheet', 'Importar planilha']];
    let pick = '';
    if (seg === 'labels') pick = '<select id="bk-pick"><option value="">Todas as etiquetas</option>' + (src ? src.labels.map(l => '<option' + (segPick === l.name ? ' selected' : '') + ' value="' + esc(l.name) + '">' + esc(l.name) + ' (' + l.count + ')</option>').join('') : '') + '</select>';
    if (seg === 'tabs') pick = '<select id="bk-pick"><option value="">Todas as abas</option>' + (src ? src.tabs.map(t => '<option' + (segPick === t.name ? ' selected' : '') + ' value="' + esc(t.name) + '">' + esc(t.name) + ' (' + (t.contacts || []).length + ')</option>').join('') : '') + '</select>';
    if (seg === 'sheet') pick = '<textarea id="bk-sheet" rows="4" placeholder="Cole números ou nome;número, um por linha"></textarea><button class="btn sm" id="bk-sheet-ok" style="margin-top:6px">Adicionar</button><input type="file" id="bk-file" accept=".csv,.txt" style="margin-top:8px;font-size:12px">';
    const rows = pool.slice(0, 1500).map(c => '<div class="crow' + (sel.has(norm(c.n)) ? ' sel' : '') + '" data-n="' + esc(c.n) + '"><span class="dot"></span><b>' + esc(c.n) + '</b>' + (c.known ? '' : ' <span style="color:#d97706;font-size:11px">⚠ nunca conversou</span>') + '</div>').join('');
    const selList = [...sel.values()];
    $bd.innerHTML = '<div class="cols"><div class="seg"><div class="t">Contatos por segmento</div>' +
      segs.map(s => '<button class="btn' + (seg === s[0] ? '' : '') + '" style="' + (seg === s[0] ? 'background:#1e3a8a' : '') + '" data-seg="' + s[0] + '">' + s[1] + '</button>').join('') + pick +
      '<button class="btn gray" id="bk-exp" style="margin-top:14px">⬇ Exportar em .CSV</button></div>' +
      '<div><div style="display:flex;gap:10px"><input type="text" id="bk-q" placeholder="Pesquisar por número ou nome do contato" value="' + esc(filterQ) + '"><button class="btn" id="bk-all" style="white-space:nowrap">Selecionar Todos (' + pool.length + ')</button></div>' +
      '<div class="qty"><span class="p" data-q="200">+200</span><span class="m" data-q="-200">-200</span><span class="p" data-q="100">+100</span><span class="m" data-q="-100">-100</span><span class="p" data-q="10">+10</span><span class="m" data-q="-10">-10</span></div>' +
      '<div class="clist" id="bk-list">' + (rows || '<div style="padding:22px;text-align:center;color:#6b7791">' + (src && !src.ok ? 'Abra o WhatsApp Web e aguarde carregar (ponte indisponível).' : 'Nenhum contato neste segmento.') + '</div>') + '</div></div>' +
      '<div class="side"><h3>Contatos Selecionados (' + selCount() + ')</h3>' +
      (selList.length ? '<div class="clist" style="max-height:230px;margin:0 0 12px">' + selList.slice(0, 200).map(c => '<div class="crow" data-rm="' + esc(c.n) + '"><span style="flex:1">' + esc(c.n) + '</span><span style="color:#dc2626">✕</span></div>').join('') + '</div>' : '<div class="warnbar">⚠ Nenhum contato selecionado</div>') +
      '<label class="l" style="margin-top:12px">Nome do agrupamento</label><input type="text" id="bk-gname" placeholder="Insira um nome para o agrupamento">' +
      '<label class="l" style="margin-top:10px">Selecione uma cor</label><div style="display:flex;gap:6px;flex-wrap:wrap" id="bk-colors">' + COLORS.map((c, i) => '<span data-c="' + c + '" style="width:22px;height:22px;border-radius:5px;background:' + c + ';cursor:pointer;outline:' + (i === 0 ? '2px solid #1d4ed8' : 'none') + '"></span>').join('') + '</div>' +
      '<div style="display:flex;gap:8px;margin-top:14px"><button class="btn" id="bk-mkgroup" ' + (selList.length ? '' : 'disabled') + '>Criar Agrupamento</button><button class="btn gray" id="bk-nogroup" ' + (selList.length ? '' : 'disabled') + '>Enviar Sem Agrupar</button></div></div></div>';
  }
  function rGroups() {
    const g = bulk.groups;
    $bd.innerHTML = '<div class="card"><h3>Agrupamentos salvos (' + g.length + ')</h3>' + (g.length ? g.map(x => '<div class="gcard"><span class="c" style="background:' + esc(x.color || '#90a4ae') + '"></span><div class="g"><b>' + esc(x.name) + '</b><div style="font-size:12px;color:#6b7791">' + x.contacts.length + ' contato(s)</div></div><button class="btn sm" data-use="' + esc(x.id) + '">Usar na campanha</button><button class="btn sm red" data-del="' + esc(x.id) + '">Excluir</button></div>').join('') : '<div style="color:#6b7791;padding:12px">Nenhum agrupamento ainda. Vá em Envio Rápido, selecione contatos e clique em Criar Agrupamento.</div>') + '</div>';
  }
  function rCamp() {
    const g = bulk.groups.find(x => x.id === camp.groupId);
    const targets = camp.useSel && sel.size ? [...sel.values()] : (g ? g.contacts : []);
    const o = camp.opts;
    $bd.innerHTML = '<div class="grid2" style="grid-template-columns:1.25fr 1fr;align-items:start"><div>' +
      '<div class="card"><h3>1. Para quem enviar</h3>' +
      '<select id="bk-grp"><option value="">' + (sel.size ? '— Seleção atual do Envio Rápido (' + sel.size + ') —' : '— escolha um agrupamento —') + '</option>' + bulk.groups.map(x => '<option value="' + esc(x.id) + '"' + (camp.groupId === x.id && !(camp.useSel && sel.size) ? ' selected' : '') + '>' + esc(x.name) + ' (' + x.contacts.length + ')</option>').join('') + '</select>' +
      '<div style="margin-top:8px;font-size:13px;color:#4b5876"><b>' + targets.length + '</b> contato(s) serão usados.</div></div>' +
      '<div class="card"><h3>2. Script de envio <span style="font-weight:400;font-size:12px;color:#6b7791">— respostas rápidas na ordem em que serão enviadas</span></h3>' +
      (camp.steps.length ? camp.steps.map((s, i) => '<div class="step"><b>' + (i + 1) + '</b><div class="g">' + (s.type === 'quick' ? '⚡ ' + esc((quickList.find(q => String(q.id) === String(s.msgId)) || {}).label || 'resposta apagada') : '✍️ Texto: ' + esc((s.variations || [''])[0].slice(0, 60))) + '</div><button class="btn sm gray" data-up="' + i + '">↑</button><button class="btn sm red" data-rmstep="' + i + '">✕</button></div>').join('') : '<div style="color:#6b7791;padding:6px 2px 10px">Nenhuma ação foi criada. Adicione respostas rápidas (texto, áudio, imagem, vídeo…).</div>') +
      '<div style="display:flex;gap:8px"><select id="bk-addq"><option value="">+ Adicionar resposta rápida…</option>' + quickList.map(q => '<option value="' + esc(q.id) + '">' + esc(q.label) + (q.cat ? ' · ' + esc(q.cat) : '') + '</option>').join('') + '</select><button class="btn" id="bk-addtxt" style="white-space:nowrap">+ Texto</button></div>' +
      '<div style="margin-top:10px;display:flex;gap:10px;align-items:center"><label class="l" style="margin:0">Pausa entre as ações (s)</label><input type="number" id="bk-sgap" value="' + camp.stepGap + '" min="0" style="width:80px"></div>' +
      '<div class="hint" style="margin-top:10px">Use <b>#primeiroNome</b> nos textos para colocar o nome do cliente. Áudios vão como voz gravada.</div></div></div>' +
      '<div><div class="card"><h3>3. Segurança do disparo</h3>' +
      '<div class="grid2"><div><label class="l">Intervalo mínimo (s)</label><input type="number" id="bk-min" value="' + o.minSec + '" min="10"></div><div><label class="l">Intervalo máximo (s)</label><input type="number" id="bk-max" value="' + o.maxSec + '" min="10"></div>' +
      '<div><label class="l">Limite por hora</label><input type="number" id="bk-ph" value="' + o.perHour + '" min="1"></div><div><label class="l">Limite por dia</label><input type="number" id="bk-pd" value="' + o.perDay + '" min="1"></div></div>' +
      '<label class="chk"><input type="checkbox" id="bk-win" ' + (o.useWindow ? 'checked' : '') + '> Só enviar dentro do horário (' + esc(cfgW.winStart) + '–' + esc(cfgW.winEnd) + ' — igual ao Follow Up)</label>' +
      '<label class="chk"><input type="checkbox" id="bk-known" ' + (o.onlyKnown ? 'checked' : '') + '> Nunca enviar para quem nunca conversou comigo (proteção contra banimento)</label>' +
      '<label class="chk"><input type="checkbox" id="bk-dry" ' + (o.dryRun ? 'checked' : '') + '> <b>🧪 Modo teste</b> — simula tudo e NÃO envia nada</label>' +
      '<div class="warn" style="margin-top:8px">O envio é um contato por vez, com intervalo aleatório. O disparo pausa sozinho após 3 falhas seguidas. Mantenha o computador ligado e o WhatsApp Web aberto.</div></div>' +
      '<div class="card"><h3>4. Nome e início</h3><input type="text" id="bk-jname" placeholder="Nome da campanha (ex.: Black November)" value="' + esc(camp.name) + '">' +
      '<button class="btn green" id="bk-go" style="width:100%;margin-top:12px;font-size:15px;padding:12px">' + (o.dryRun ? '🧪 Iniciar TESTE (sem enviar)' : '▶ Iniciar disparo') + '</button></div></div></div>';
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

  // ── eventos ──
  function readCampForm() {
    const g = id => document.getElementById(id); if (!g('bk-min')) return;
    const o = camp.opts;
    o.minSec = Math.max(10, +g('bk-min').value || 40); o.maxSec = Math.max(o.minSec, +g('bk-max').value || 120); o.perHour = Math.max(1, +g('bk-ph').value || 30); o.perDay = Math.max(1, +g('bk-pd').value || 150);
    o.useWindow = g('bk-win').checked; o.onlyKnown = g('bk-known').checked; o.dryRun = g('bk-dry').checked;
    camp.stepGap = Math.max(0, +g('bk-sgap').value || 0); camp.name = g('bk-jname').value;
  }
  root.addEventListener('mousedown', e => { /* não fecha clicando fora */ });
  root.addEventListener('click', async e => {
    const t = e.target; const q = s => t.closest(s);
    if (q('.bk-close')) return close();
    const rb = q('.bk-rail button'); if (rb) return setView(rb.dataset.v);
    if (view === 'quick') {
      const sb = q('[data-seg]'); if (sb) { seg = sb.dataset.seg; segPick = ''; if (seg !== 'sheet') pool = []; return render(); }
      const row = q('.crow[data-n]'); if (row) { const n = row.dataset.n, k = norm(n), c = pool.find(x => norm(x.n) === k) || { n }; if (sel.has(k)) sel.delete(k); else sel.set(k, c); return keepScroll(rQuick); }
      const rm = q('[data-rm]'); if (rm) { sel.delete(norm(rm.dataset.rm)); return keepScroll(rQuick); }
      if (q('#bk-all')) { const all = pool.every(c => sel.has(norm(c.n))); pool.forEach(c => all ? sel.delete(norm(c.n)) : sel.set(norm(c.n), c)); return keepScroll(rQuick); }
      const qb = q('[data-q]'); if (qb) { const d = +qb.dataset.q; if (d > 0) { let n = 0; for (const c of pool) if (!sel.has(norm(c.n)) && n < d) { sel.set(norm(c.n), c); n++; } } else { let n = 0; for (const c of [...pool].reverse()) if (sel.has(norm(c.n)) && n < -d) { sel.delete(norm(c.n)); n++; } } return keepScroll(rQuick); }
      const col = q('[data-c]'); if (col) { root.querySelectorAll('#bk-colors span').forEach(s => s.style.outline = 'none'); col.style.outline = '2px solid #1d4ed8'; col.parentNode.dataset.pick = col.dataset.c; return; }
      if (q('#bk-sheet-ok')) { const txt = document.getElementById('bk-sheet').value; addSheet(txt); return render(); }
      if (q('#bk-exp')) { const rows = [['Nome', 'Selecionado']].concat(pool.map(c => [c.n, sel.has(norm(c.n)) ? 'sim' : 'não'])); return download('contatos.csv', rows); }
      if (q('#bk-mkgroup')) { const name = (document.getElementById('bk-gname').value || '').trim(); if (!name) return alert('Dê um nome ao agrupamento.'); const color = (document.getElementById('bk-colors').dataset.pick) || COLORS[0]; const group = { id: 'g' + Date.now(), name, color, contacts: [...sel.values()].map(c => ({ n: c.n })) }; post({ type: 'BULK_SAVE_GROUP', group }); await sleep(500); await loadAll(); camp.groupId = group.id; camp.useSel = false; sel.clear(); return setView('groups'); }
      if (q('#bk-nogroup')) { camp.useSel = true; camp.groupId = ''; return setView('camp'); }
    }
    if (view === 'groups') {
      const u = q('[data-use]'); if (u) { camp.groupId = u.dataset.use; camp.useSel = false; sel.clear(); return setView('camp'); }
      const d = q('[data-del]'); if (d) { if (confirm('Excluir este agrupamento?')) { post({ type: 'BULK_DEL_GROUP', id: d.dataset.del }); await sleep(400); await loadAll(); render(); } return; }
    }
    if (view === 'camp') {
      readCampForm();
      const up = q('[data-up]'); if (up) { const i = +up.dataset.up; if (i > 0) { const a = camp.steps; [a[i - 1], a[i]] = [a[i], a[i - 1]]; } return render(); }
      const rs = q('[data-rmstep]'); if (rs) { camp.steps.splice(+rs.dataset.rmstep, 1); return render(); }
      if (q('#bk-addtxt')) { const v = prompt('Texto da mensagem (use #primeiroNome para o nome do cliente):'); if (v && v.trim()) { camp.steps.push({ type: 'text', variations: [v.trim()] }); render(); } return; }
      if (q('#bk-go')) return startJob();
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
    if (t.id === 'bk-grp') { camp.groupId = t.value; camp.useSel = !t.value; readCampForm(); render(); }
    if (t.id === 'bk-addq' && t.value) { readCampForm(); camp.steps.push({ type: 'quick', msgId: t.value }); render(); }
  });
  root.addEventListener('input', e => { if (e.target.id === 'bk-q') { filterQ = e.target.value; const p = e.target.selectionStart; rQuick(); const n = document.getElementById('bk-q'); if (n) { n.focus(); n.setSelectionRange(p, p); } } });
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
    readCampForm();
    const g = bulk.groups.find(x => x.id === camp.groupId);
    const targets = camp.useSel && sel.size ? [...sel.values()].map(c => ({ n: c.n })) : (g ? g.contacts.map(c => ({ n: c.n })) : []);
    if (!targets.length) return alert('Escolha os contatos (Envio Rápido) ou um agrupamento.');
    if (!camp.steps.length) return alert('Adicione pelo menos uma ação (resposta rápida ou texto).');
    const o = camp.opts;
    if (!o.dryRun && !confirm('Vai ENVIAR de verdade para ' + targets.length + ' contato(s), 1 por vez, com intervalo de ' + o.minSec + '–' + o.maxSec + ' s (limite ' + o.perHour + '/hora e ' + o.perDay + '/dia).\n\nMantenha o computador ligado. Continuar?')) return;
    const job = { id: 'j' + Date.now(), name: camp.name || (g ? g.name : 'Campanha'), steps: JSON.parse(JSON.stringify(camp.steps)), stepGap: camp.stepGap, opts: Object.assign({}, o), contacts: targets.map(c => ({ n: c.n, state: 'pending' })) };
    post({ type: 'BULK_START', job }); await sleep(600); await loadAll(); jobOpen = job.id; sel.clear(); setView('report');
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
