// WhatsApp CRM Pro v4.51 — kanban.js
// CRM KANBAN em tela cheia (layout do WaSpeed): coluna lateral + uma coluna por aba (Inbox + abas), valor em R$, cartões com ações, arrastar e soltar.
// Tema: preto com cor trocável (salva em localStorage wcrm_acc; vale também para o resto da extensão via variável --wcrm-acc).
(function () {
  'use strict';
  if (window.__wcrmKanban) return; window.__wcrmKanban = true;
  const K_KB = 'wcrm_kanban';
  const sget = k => new Promise(r => { try { chrome.storage.local.get(k, o => r(o[k])); } catch (e) { r(undefined); } });
  const sset = (k, v) => new Promise(r => { try { chrome.storage.local.set({ [k]: v }, () => r()); } catch (e) { r(); } });
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = s => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; };
  const money = n => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ACC = ['#00a884', '#1d4ed8', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#14b8a6', '#84cc16'];
  const COLS_MAX = 120;   // cartões desenhados por coluna (o resto aparece como “+N”)

  let tabs = [], inbox = [], kb = { values: {}, notes: {}, hidden: [] }, filters = {}, dark = ls('wcrm_kb_dark') !== '0', acc = ls('wcrm_acc') || ACC[0], open = false, menuCollapsed = ls('wcrm_kb_side') === '1';
  const setAcc = c => { acc = c; ls('wcrm_acc', c); document.documentElement.style.setProperty('--wcrm-acc', c); const r = document.getElementById('wcrm-kb'); if (r) r.style.setProperty('--acc', c); };
  setAcc(acc);

  const css = document.createElement('style');
  css.textContent = `
  #wcrm-kb{--acc:#00a884;--bg:#0c0c0d;--pn:#161718;--cd:#1f2022;--tx:#f1f2f3;--mu:#9aa0a6;--bd:#2c2e30;position:fixed;inset:0;z-index:2147483646;background:var(--bg);color:var(--tx);display:none;font-family:'Segoe UI',Roboto,Arial,sans-serif;}
  #wcrm-kb.light{--bg:#eef1f6;--pn:#fff;--cd:#fff;--tx:#17202e;--mu:#667085;--bd:#dde3ee;}
  #wcrm-kb.show{display:flex;}
  #wcrm-kb .side{width:260px;background:var(--pn);border-right:1px solid var(--bd);display:flex;flex-direction:column;padding:14px 10px;transition:width .15s;flex:none;overflow:hidden;}
  #wcrm-kb.min .side{width:62px;}
  #wcrm-kb .brand{display:flex;align-items:center;gap:10px;padding:2px 6px 14px;} #wcrm-kb .logo{width:38px;height:38px;border-radius:50%;background:var(--acc);display:flex;align-items:center;justify-content:center;font-size:19px;flex:none;}
  #wcrm-kb .brand b{color:var(--acc);font-size:16px;flex:1;white-space:nowrap;} #wcrm-kb .brand button{background:none;border:0;color:var(--mu);font-size:20px;cursor:pointer;}
  #wcrm-kb.min .brand b,#wcrm-kb.min .it span,#wcrm-kb.min .foot span{display:none;}
  #wcrm-kb .it{display:flex;align-items:center;gap:12px;padding:10px 8px;border-radius:10px;cursor:pointer;font-size:15px;white-space:nowrap;} #wcrm-kb .it:hover{background:var(--cd);}
  #wcrm-kb .it i{font-style:normal;width:36px;height:36px;border-radius:9px;background:var(--cd);display:flex;align-items:center;justify-content:center;font-size:18px;flex:none;} #wcrm-kb .it:hover i{background:var(--bd);}
  #wcrm-kb .grow{flex:1;} #wcrm-kb .foot{display:flex;align-items:center;gap:10px;padding:10px 8px;color:var(--mu);font-size:14px;}
  #wcrm-kb .accs{display:none;gap:6px;flex-wrap:wrap;padding:4px 8px 8px 52px;} #wcrm-kb .accs.show{display:flex;} #wcrm-kb.min .accs{display:none;}
  #wcrm-kb .accs b{width:20px;height:20px;border-radius:50%;cursor:pointer;border:2px solid transparent;} #wcrm-kb .accs b.on{border-color:var(--tx);}
  #wcrm-kb .main{flex:1;min-width:0;display:flex;flex-direction:column;}
  #wcrm-kb .bar{display:flex;align-items:center;gap:12px;padding:10px 18px;border-bottom:1px solid var(--bd);} #wcrm-kb .bar h2{margin:0;font-size:17px;flex:1;} #wcrm-kb .bar small{color:var(--mu);}
  #wcrm-kb .x{border:1px solid #ef4444;color:#ef4444;background:transparent;border-radius:8px;padding:6px 16px;cursor:pointer;font-size:13px;}
  #wcrm-kb .board{flex:1;overflow:auto;display:flex;gap:14px;padding:14px 16px;align-items:flex-start;}
  #wcrm-kb .col{width:330px;flex:none;max-height:100%;display:flex;flex-direction:column;background:var(--pn);border:1px solid var(--bd);border-top:3px solid var(--acc);border-bottom:3px solid var(--acc);border-radius:10px;}
  #wcrm-kb .col.over{outline:2px dashed var(--acc);outline-offset:-4px;}
  #wcrm-kb .ch{display:flex;align-items:center;gap:8px;padding:10px 12px;} #wcrm-kb .ch b{font-size:15px;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  #wcrm-kb .pill{background:var(--cd);border-radius:99px;padding:2px 9px;font-size:12px;color:var(--mu);} #wcrm-kb .pill.rs{color:var(--acc);}
  #wcrm-kb .ch .sp{flex:1;} #wcrm-kb .ch button{background:none;border:0;color:var(--mu);font-size:17px;cursor:pointer;padding:2px 5px;border-radius:6px;} #wcrm-kb .ch button:hover{background:var(--cd);color:var(--tx);}
  #wcrm-kb .csr{padding:0 12px 8px;display:none;} #wcrm-kb .csr.show{display:block;} #wcrm-kb input,#wcrm-kb select{background:var(--cd);border:1px solid var(--bd);color:var(--tx);border-radius:8px;padding:7px 10px;font-size:13.5px;width:100%;box-sizing:border-box;}
  #wcrm-kb .cards{overflow:auto;padding:0 10px 10px;display:flex;flex-direction:column;gap:9px;min-height:40px;}
  #wcrm-kb .card{background:var(--cd);border:1px solid var(--bd);border-radius:10px;padding:10px 11px;position:relative;cursor:grab;} #wcrm-kb .card:hover{border-color:var(--acc);}
  #wcrm-kb .card.drag{opacity:.4;}
  #wcrm-kb .top{display:flex;align-items:center;gap:10px;} #wcrm-kb .av{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;flex:none;}
  #wcrm-kb .nm{font-size:15px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;} #wcrm-kb .nm:hover{color:var(--acc);}
  #wcrm-kb .sub{font-size:12.5px;color:var(--mu);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  #wcrm-kb .acts{display:flex;gap:6px;margin-top:9px;align-items:center;} #wcrm-kb .acts button{background:var(--bg);border:1px solid var(--bd);border-radius:8px;width:34px;height:30px;cursor:pointer;font-size:15px;color:var(--tx);position:relative;} #wcrm-kb .acts button:hover{border-color:var(--acc);}
  #wcrm-kb .acts button.has::after{content:'';position:absolute;top:2px;right:2px;width:7px;height:7px;border-radius:50%;background:var(--acc);}
  #wcrm-kb .del{position:absolute;right:8px;top:8px;background:none;border:0;color:var(--mu);cursor:pointer;display:none;font-size:15px;} #wcrm-kb .card:hover .del{display:block;} #wcrm-kb .del:hover{color:#ef4444;}
  #wcrm-kb .more{text-align:center;color:var(--mu);font-size:12.5px;padding:4px;}
  #wcrm-kb .addcol{width:230px;flex:none;border:2px dashed var(--bd);border-radius:10px;padding:18px;text-align:center;color:var(--mu);cursor:pointer;} #wcrm-kb .addcol:hover{border-color:var(--acc);color:var(--acc);}
  #wcrm-kb .pop{position:fixed;z-index:2147483647;background:var(--pn);border:1px solid var(--bd);border-radius:10px;box-shadow:0 8px 30px #0008;padding:6px;min-width:190px;} #wcrm-kb .pop div{padding:8px 12px;border-radius:7px;cursor:pointer;font-size:14px;} #wcrm-kb .pop div:hover{background:var(--cd);} #wcrm-kb .pop .red{color:#ef4444;}
  #wcrm-kb .modal{position:fixed;inset:0;background:#0009;z-index:2147483647;display:flex;align-items:center;justify-content:center;} #wcrm-kb .mb{background:var(--pn);border:1px solid var(--bd);border-radius:14px;padding:18px 20px;width:430px;max-width:92vw;max-height:84vh;overflow:auto;}
  #wcrm-kb .mb h3{margin:0 0 12px;} #wcrm-kb .row{display:flex;align-items:center;gap:8px;padding:8px 4px;border-bottom:1px solid var(--bd);} #wcrm-kb .row span{flex:1;} #wcrm-kb .row button{background:none;border:0;cursor:pointer;font-size:16px;color:var(--tx);}
  #wcrm-kb .btn{background:var(--acc);color:#fff;border:0;border-radius:8px;padding:8px 16px;font-weight:600;cursor:pointer;font-size:13.5px;} #wcrm-kb .btn.g{background:var(--cd);color:var(--tx);}
  #wcrm-kb .toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#111;color:#fff;border:1px solid var(--acc);padding:9px 18px;border-radius:99px;z-index:2147483647;font-size:13.5px;}
  `;
  document.documentElement.appendChild(css);
  const root = document.createElement('div'); root.id = 'wcrm-kb'; document.documentElement.appendChild(root);

  const iframePost = m => { const f = document.getElementById('wcrm-iframe'); if (f && f.contentWindow) f.contentWindow.postMessage(m, '*'); };
  const toast = t => { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; root.appendChild(d); setTimeout(() => d.remove(), 2400); };
  const hue = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return 'hsl(' + h + ',45%,42%)'; };
  const ago = t => { if (!t) return ''; const m = Math.round((Date.now() - t) / 60000); if (m < 1) return 'agora'; if (m < 60) return m + ' min'; const h = Math.round(m / 60); if (h < 24) return h + ' h'; const d = Math.round(h / 24); return d < 30 ? d + ' d' : new Date(t).toLocaleDateString('pt-BR'); };

  async function load() {
    const bar = (await sget('wcrm_labelbar')) || {}; tabs = (bar.tabs || []).map(t => ({ name: t.name, contacts: t.contacts || [] }));
    kb = Object.assign({ values: {}, notes: {}, hidden: [] }, (await sget(K_KB)) || {});
    const W = window.__wcrm, br = W && W.getBridge && W.getBridge();
    const m = new Map(); ((br && br.act) || []).filter(a => !a.g).forEach(a => m.set(norm(a.n), { n: a.n, t: Math.max(a.i || 0, a.o || 0) }));
    ((br && br.all) || []).forEach(a => { const k = norm(a.n); const o = m.get(k); if (o) o.t = Math.max(o.t, a.t || 0); else m.set(k, { n: a.n, t: a.t || 0 }); });
    const inTab = new Set(); tabs.forEach(t => t.contacts.forEach(c => inTab.add(norm(c))));
    inbox = [...m.values()].filter(x => !inTab.has(norm(x.n))).sort((a, b) => b.t - a.t);
    const tm = {}; m.forEach(v => { tm[norm(v.n)] = v.t; }); tm.__ = 1; load.tm = tm;
  }
  const saveKb = () => sset(K_KB, kb);
  const valOf = n => Number(kb.values[norm(n)]) || 0;

  function colHtml(name, items, isInbox) {
    const f = norm(filters[name] || ''); const list = f ? items.filter(x => norm(x.n).includes(f)) : items;
    const sum = items.reduce((s, x) => s + valOf(x.n), 0);
    const cards = list.slice(0, COLS_MAX).map(x => {
      const nt = kb.notes[norm(x.n)], v = valOf(x.n);
      return '<div class="card" draggable="true" data-n="' + esc(x.n) + '" data-c="' + esc(name) + '"><button class="del" data-a="rm" title="' + (isInbox ? '' : 'Tirar desta aba') + '"' + (isInbox ? ' style="display:none!important"' : '') + '>🗑</button>'
        + '<div class="top"><div class="av" style="background:' + hue(x.n) + '">' + esc((x.n.replace(/[^\p{L}\p{N}]/gu, '')[0] || '?').toUpperCase()) + '</div><div style="min-width:0"><div class="nm" data-a="open">' + esc(x.n) + '</div><div class="sub">' + (nt ? '📝 ' + esc(nt) : (x.t ? 'última conversa há ' + ago(x.t) : '—')) + (v ? ' · ' + money(v) : '') + '</div></div></div>'
        + '<div class="acts"><button data-a="note" title="Anotação" class="' + (nt ? 'has' : '') + '">📋</button><button data-a="sched" title="Agendar mensagem">⏰</button><button data-a="open" title="Abrir conversa">💬</button><button data-a="val" title="Valor da venda" class="' + (v ? 'has' : '') + '">💲</button></div></div>';
    }).join('');
    const more = list.length > COLS_MAX ? '<div class="more">+ ' + (list.length - COLS_MAX) + ' contatos (use a busca 🔍)</div>' : '';
    return '<div class="col" data-col="' + esc(name) + '" data-inbox="' + (isInbox ? 1 : 0) + '"><div class="ch"><b title="' + esc(name) + '">' + esc(name.toUpperCase()) + '</b><span class="pill">' + items.length + '</span><span class="pill rs">' + money(sum) + '</span><span class="sp"></span><button data-a="srch" title="Buscar">🔍</button>' + (isInbox ? '' : '<button data-a="menu" title="Opções">⋯</button>') + '</div>'
      + '<div class="csr' + (filters[name] != null && filters['_open_' + name] ? ' show' : '') + '"><input placeholder="Buscar nesta coluna" data-a="f" value="' + esc(filters[name] || '') + '"></div><div class="cards">' + (cards || '<div class="more">vazio</div>') + more + '</div></div>';
  }
  function render() {
    root.className = (open ? 'show ' : '') + (dark ? '' : 'light ') + (menuCollapsed ? 'min' : ''); root.style.setProperty('--acc', acc);
    const vis = tabs.filter(t => !kb.hidden.includes(t.name));
    const cols = [colHtml('Inbox', inbox, true)].concat(vis.map(t => colHtml(t.name, t.contacts.map(n => ({ n, t: (load.tm || {})[norm(n)] || 0 })), false))).join('');
    const total = tabs.reduce((s, t) => s + t.contacts.length, 0);
    root.innerHTML = '<div class="side"><div class="brand"><div class="logo">💬</div><b>CRM KANBAN</b><button data-s="min" title="Recolher menu">⇤</button></div>'
      + '<div class="it" data-s="cfg"><i>🗂️</i><span>Configuração de abas</span></div><div class="it" data-s="dark"><i>' + (dark ? '🌙' : '☀️') + '</i><span>Modo ' + (dark ? 'claro' : 'escuro') + '</span></div>'
      + '<div class="it" data-s="color"><i>🎨</i><span>Cor do tema</span></div><div class="accs" id="kb-accs">' + ACC.map(c => '<b data-c="' + c + '" style="background:' + c + '" class="' + (c === acc ? 'on' : '') + '"></b>').join('') + '</div>'
      + '<div class="it" data-s="add"><i>➕</i><span>Criar CRM / Adicionar aba</span></div><div class="it" data-s="keys"><i>⌘</i><span>Atalhos do teclado</span></div><div class="grow"></div>'
      + '<div class="foot"><i style="font-style:normal">📁</i><span>Abas (' + tabs.length + ')</span></div></div>'
      + '<div class="main"><div class="bar"><h2>CRM Kanban <small>' + total + ' contatos em abas · ' + inbox.length + ' no Inbox</small></h2><button class="x" data-s="close">Fechar</button></div><div class="board">' + cols + '<div class="addcol" data-s="add">➕ Nova aba</div></div></div>';
  }

  // ── ações ──
  function openChat(n) { const W = window.__wcrm; if (W && W.bridgeCall) W.bridgeCall('OPEN', { chat: n }, 8000).then(r => { if (!(r && r.ok)) toast('Não achei a conversa "' + n + '"'); else { close(); } }); }
  const setTab = (n, tab) => iframePost({ type: 'SET_TAB', contact: n, tab: tab, newTab: tab, mode: tab ? 'set' : 'clear' });
  function promptBox(title, val, cb, ph) {
    const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = '<div class="mb"><h3>' + esc(title) + '</h3><input id="kb-in" value="' + esc(val || '') + '" placeholder="' + esc(ph || '') + '"><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn g" data-x="0">Cancelar</button><button class="btn" data-x="1">Salvar</button></div></div>';
    root.appendChild(m); const inp = m.querySelector('#kb-in'); inp.focus(); inp.select();
    const done = ok => { const v = inp.value.trim(); m.remove(); if (ok) cb(v); };
    m.addEventListener('click', e => { if (e.target === m) done(false); const x = e.target.dataset && e.target.dataset.x; if (x != null) done(x === '1'); });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') { e.stopPropagation(); done(false); } });
  }
  function cfgModal() {
    const m = document.createElement('div'); m.className = 'modal';
    const draw = () => { m.innerHTML = '<div class="mb"><h3>Configuração de abas</h3><div style="display:flex;gap:8px;margin-bottom:10px"><input id="kb-s" placeholder="Pesquisar abas"><button class="btn" data-x="new">Nova aba</button></div>'
      + tabs.filter(t => norm(t.name).includes(norm(m.dataset.q || ''))).map(t => '<div class="row" data-t="' + esc(t.name) + '"><span>' + esc(t.name) + ' <small class="pill">' + t.contacts.length + '</small></span><button data-x="ren" title="Renomear">✏️</button><button data-x="del" title="Excluir aba">🗑</button><button data-x="eye" title="' + (kb.hidden.includes(t.name) ? 'Mostrar' : 'Ocultar') + '">' + (kb.hidden.includes(t.name) ? '🙈' : '👁') + '</button></div>').join('')
      + '<div style="text-align:right;margin-top:12px"><button class="btn g" data-x="ok">Fechar</button></div></div>'; const s = m.querySelector('#kb-s'); s.value = m.dataset.q || ''; s.oninput = () => { m.dataset.q = s.value; draw(); m.querySelector('#kb-s').focus(); }; };
    draw(); root.appendChild(m);
    m.addEventListener('click', async e => {
      const x = e.target.dataset && e.target.dataset.x; if (e.target === m || x === 'ok') { m.remove(); return; } if (!x) return;
      const t = (e.target.closest('.row') || {}).dataset && e.target.closest('.row').dataset.t;
      if (x === 'new') promptBox('Nome da nova aba', '', v => { if (v) { iframePost({ type: 'SET_TAB', contact: '', tab: '', newTab: v }); toast('Aba criada'); setTimeout(refresh, 5200); } });
      if (x === 'ren') promptBox('Renomear aba', t, v => { if (v && v !== t) { iframePost({ type: 'KANBAN_TAB_OP', op: 'rename', name: t, to: v }); if (kb.hidden.includes(t)) kb.hidden = kb.hidden.map(h => h === t ? v : h); saveKb(); setTimeout(refresh, 5200); m.remove(); } });
      if (x === 'del' && confirm('Excluir a aba "' + t + '"? Os contatos voltam para o Inbox (nenhum contato é apagado).')) { iframePost({ type: 'KANBAN_TAB_OP', op: 'delete', name: t }); setTimeout(refresh, 5200); m.remove(); }
      if (x === 'eye') { kb.hidden = kb.hidden.includes(t) ? kb.hidden.filter(h => h !== t) : kb.hidden.concat([t]); await saveKb(); draw(); render(); }
    });
  }
  function keysModal() { const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = '<div class="mb"><h3>Atalhos do teclado</h3><div class="row"><span>Fechar o Kanban</span><b>Esc</b></div><div class="row"><span>Abrir conversa do cartão</span><b>Clique no nome ou 💬</b></div><div class="row"><span>Mover contato de aba</span><b>Arrastar e soltar</b></div><div class="row"><span>Voltar para o Inbox</span><b>Soltar na coluna Inbox</b></div><div style="text-align:right;margin-top:12px"><button class="btn g">Fechar</button></div></div>'; root.appendChild(m); m.addEventListener('click', () => m.remove()); }

  root.addEventListener('click', async e => {
    const t = e.target; const s = t.closest('[data-s]'); const a = t.closest('[data-a]');
    if (!t.closest('.pop')) root.querySelectorAll('.pop').forEach(p => p.remove());
    if (t.dataset && t.dataset.c && t.closest('#kb-accs')) { setAcc(t.dataset.c); render(); root.querySelector('#kb-accs').classList.add('show'); return; }
    if (s) {
      const k = s.dataset.s;
      if (k === 'close') close();
      else if (k === 'min') { menuCollapsed = !menuCollapsed; ls('wcrm_kb_side', menuCollapsed ? '1' : '0'); root.classList.toggle('min', menuCollapsed); }
      else if (k === 'dark') { dark = !dark; ls('wcrm_kb_dark', dark ? '1' : '0'); render(); }
      else if (k === 'color') root.querySelector('#kb-accs').classList.toggle('show');
      else if (k === 'cfg') cfgModal();
      else if (k === 'keys') keysModal();
      else if (k === 'add') promptBox('Nome da nova aba (coluna)', '', v => { if (v) { iframePost({ type: 'SET_TAB', contact: '', tab: '', newTab: v }); toast('Aba "' + v + '" criada'); setTimeout(refresh, 5200); } });
      return;
    }
    if (!a) return;
    const card = t.closest('.card'), col = t.closest('.col'); const act = a.dataset.a; const n = card && card.dataset.n, cname = col && col.dataset.col;
    if (act === 'open') openChat(n);
    else if (act === 'rm') { setTab(n, ''); toast('"' + n + '" voltou ao Inbox'); setTimeout(refresh, 5200); }
    else if (act === 'val') promptBox('Valor da venda — ' + n + ' (R$)', valOf(n) || '', async v => { const x = parseFloat(String(v).replace(/\./g, '').replace(',', '.')); kb.values[norm(n)] = isNaN(x) ? 0 : x; await saveKb(); render(); }, 'ex: 299,90');
    else if (act === 'note') promptBox('Anotação — ' + n, kb.notes[norm(n)] || '', async v => { if (v) kb.notes[norm(n)] = v; else delete kb.notes[norm(n)]; await saveKb(); render(); }, 'escreva uma nota rápida');
    else if (act === 'sched') { close(); openChatThen(n, () => { const l = document.querySelector('#wcrm-rail button[title="Agendar mensagem"]'); l && l.click(); }); }
    else if (act === 'srch') { filters['_open_' + cname] = !filters['_open_' + cname]; render(); const i = root.querySelector('.col[data-col="' + CSS.escape(cname) + '"] input'); i && i.focus(); }
    else if (act === 'menu') {
      const r = a.getBoundingClientRect(); const p = document.createElement('div'); p.className = 'pop'; p.style.left = Math.min(r.left, innerWidth - 210) + 'px'; p.style.top = r.bottom + 4 + 'px';
      p.innerHTML = '<div data-p="ren">✏️ Renomear aba</div><div data-p="hide">👁 Ocultar aba</div><div data-p="del" class="red">🗑 Excluir aba</div>'; root.appendChild(p);
      p.addEventListener('click', async ev => { const k = ev.target.dataset.p; p.remove(); if (k === 'ren') promptBox('Renomear aba', cname, v => { if (v && v !== cname) { iframePost({ type: 'KANBAN_TAB_OP', op: 'rename', name: cname, to: v }); setTimeout(refresh, 5200); } }); if (k === 'hide') { kb.hidden.push(cname); await saveKb(); render(); } if (k === 'del' && confirm('Excluir a aba "' + cname + '"? Os contatos voltam para o Inbox.')) { iframePost({ type: 'KANBAN_TAB_OP', op: 'delete', name: cname }); setTimeout(refresh, 5200); } });
    }
  });
  root.addEventListener('input', e => { const t = e.target; if (t.dataset && t.dataset.a === 'f') { const c = t.closest('.col').dataset.col; filters[c] = t.value; const pos = t.selectionStart; const keep = c; render(); const i = root.querySelector('.col[data-col="' + CSS.escape(keep) + '"] input'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } } });

  // arrastar e soltar entre colunas
  let dragN = null, dragFrom = null;
  root.addEventListener('dragstart', e => { const c = e.target.closest && e.target.closest('.card'); if (!c) return; dragN = c.dataset.n; dragFrom = c.dataset.c; c.classList.add('drag'); try { e.dataTransfer.setData('text/plain', dragN); e.dataTransfer.effectAllowed = 'move'; } catch (x) {} });
  root.addEventListener('dragend', () => { root.querySelectorAll('.drag,.over').forEach(x => x.classList.remove('drag', 'over')); dragN = null; });
  root.addEventListener('dragover', e => { const c = e.target.closest && e.target.closest('.col'); if (c && dragN) { e.preventDefault(); root.querySelectorAll('.over').forEach(x => x !== c && x.classList.remove('over')); c.classList.add('over'); } });
  root.addEventListener('drop', e => {
    const c = e.target.closest && e.target.closest('.col'); if (!c || !dragN) return; e.preventDefault();
    const to = c.dataset.col, isInbox = c.dataset.inbox === '1'; if (to === dragFrom) return;
    setTab(dragN, isInbox ? '' : to);
    // atualização otimista
    tabs.forEach(t => { t.contacts = t.contacts.filter(x => norm(x) !== norm(dragN)); });
    if (isInbox) inbox.unshift({ n: dragN, t: (load.tm || {})[norm(dragN)] || 0 }); else { inbox = inbox.filter(x => norm(x.n) !== norm(dragN)); const tt = tabs.find(x => x.name === to); if (tt) tt.contacts.unshift(dragN); }
    render(); toast('"' + dragN + '" → ' + (isInbox ? 'Inbox' : to));
  });

  function openChatThen(n, fn) { const W = window.__wcrm; if (W && W.bridgeCall) W.bridgeCall('OPEN', { chat: n }, 8000).then(() => setTimeout(fn, 600)); }
  async function refresh() { await load(); if (open) render(); }
  function show() { open = true; load().then(render); render(); }
  function close() { open = false; root.className = ''; }
  window.addEventListener('keydown', e => { if (open && e.key === 'Escape' && !root.querySelector('.modal')) close(); }, true);
  window.addEventListener('message', e => { if (e.data && e.data.type === 'OPEN_KANBAN') show(); });
  try { chrome.storage.onChanged.addListener((ch, a) => { if (a === 'local' && open && ch.wcrm_labelbar) refresh(); }); } catch (e) {}
})();
