// WCRM v4.32 — ponte no "mundo" da página do WhatsApp Web (MAIN world).
// Lê etiquetas e conversas direto da memória do WhatsApp (sem depender do visual) e
// aplica/retira etiquetas de verdade (sincroniza com o celular). Fala com o content.js via postMessage.
(function () {
  if (window.__wcrmBridge) return; window.__wcrmBridge = true;
  var TAG = 'WCRM_BRIDGE';

  function getReq() {
    var cands = [window.require, window.__debug && window.__debug.require];
    for (var i = 0; i < cands.length; i++) {
      var r = cands[i];
      if (typeof r === 'function') { try { if (r('WAWebLabelCollection')) return r; } catch (e) { } }
    }
    return null;
  }
  function mod(req, name) { try { return req(name); } catch (e) { return null; } }
  function coll(m, names) { if (!m) return null; for (var i = 0; i < names.length; i++) if (m[names[i]]) return m[names[i]]; return m.default || null; }
  function arr(c) { try { return c.getModelsArray ? c.getModelsArray() : (c.models || []); } catch (e) { return []; } }

  function stores() {
    var req = getReq(); if (!req) return { err: 'Não achei o sistema interno do WhatsApp (versão mudou?)' };
    var L = coll(mod(req, 'WAWebLabelCollection'), ['LabelCollectionImpl', 'LabelCollection']);
    var C = coll(mod(req, 'WAWebChatCollection'), ['ChatCollection']);
    if (!L) return { err: 'Sem etiquetas: precisa ser WhatsApp Business' };
    if (!C) return { err: 'Não achei a lista de conversas interna' };
    return { L: L, C: C };
  }

  function chatName(c) {
    try {
      return (c.formattedTitle || c.name || (c.contact && (c.contact.name || c.contact.pushname || c.contact.formattedName)) || (c.id && c.id.user) || '').toString();
    } catch (e) { return ''; }
  }

  function snapshot() {
    var s = stores(); if (s.err) return { ok: false, reason: s.err };
    var labs = arr(s.L).filter(function (l) { return l && l.name && l.isActive !== false; });
    var byId = {}; labs.forEach(function (l) { byId[String(l.id)] = l; });
    var chats = [];
    arr(s.C).forEach(function (c) {
      var ids = c.labels || []; if (!ids.length) return;
      var names = ids.map(function (i) { return byId[String(i)] && byId[String(i)].name; }).filter(Boolean);
      if (!names.length) return;
      chats.push({ id: c.id && c.id._serialized, name: chatName(c), labels: names });
    });
    var counts = {}; chats.forEach(function (c) { c.labels.forEach(function (n) { counts[n] = (counts[n] || 0) + 1; }); });
    var act = [];
    arr(s.C).forEach(function (c) {
      var col = c.msgs; var list = col ? (col.getModelsArray ? col.getModelsArray() : (col.models || [])) : []; var li = 0, lo = 0;
      list.forEach(function (m) {
        if (!m || !m.id || m.isNotification || SKIP_TYPES.test(m.type || '')) return;
        var t = (m.t || 0) * 1000; if (m.id.fromMe) { if (t > lo) lo = t; } else if (t > li) li = t;
      });
      if (li || lo) act.push({ n: chatName(c), i: li, o: lo, g: !!(c.isGroup || (c.id && c.id.server === 'g.us')) });
    });
    var all = [];
    arr(s.C).forEach(function (c) {
      if (c.isGroup || (c.id && c.id.server === 'g.us') || (c.id && c.id.server === 'broadcast') || (c.id && c.id._serialized === 'status@broadcast')) return;
      var nm = chatName(c); if (!nm) return;
      all.push({ n: nm, t: (c.t || 0) * 1000 });
    });
    return {
      ok: true, act: act, all: all,
      labels: labs.map(function (l) { return { id: String(l.id), name: l.name, color: l.hexColor || null, count: counts[l.name] || 0 }; }),
      chats: chats
    };
  }

  function findChat(s, ref) {
    var list = arr(s.C);
    if (ref === '__active__') { for (var a = 0; a < list.length; a++) if (list[a].active) return list[a]; return null; }
    for (var i = 0; i < list.length; i++) { var c = list[i]; if (c.id && c.id._serialized === ref) return c; }
    var low = (ref || '').trim().toLowerCase();
    for (var j = 0; j < list.length; j++) if (chatName(list[j]).trim().toLowerCase() === low) return list[j];
    var dg = (ref || '').replace(/\D/g, '');
    if (dg.length >= 8) {
      for (var k = 0; k < list.length; k++) {
        var u = (list[k].id && list[k].id.user) || ''; var nd = chatName(list[k]).replace(/\D/g, '');
        if ((u && u.slice(-9) === dg.slice(-9)) || (nd.length >= 8 && nd.slice(-9) === dg.slice(-9))) return list[k];
      }
    }
    return null;
  }

  async function apply(msg) {
    var s = stores(); if (s.err) return { ok: false, reason: s.err };
    var chat = findChat(s, msg.chat); if (!chat) return { ok: false, reason: 'Conversa não encontrada: ' + msg.chat };
    var lab = arr(s.L).find(function (l) { return (l.name || '').trim().toLowerCase() === (msg.label || '').trim().toLowerCase(); });
    if (!lab) {
      if (msg.mode === 'add' && msg.create && typeof s.L.addNewLabel === 'function') {
        try { await s.L.addNewLabel(msg.label, (s.L.getNewLabelColor && s.L.getNewLabelColor()) || 0); } catch (e) { return { ok: false, reason: 'Não consegui criar a etiqueta' }; }
        lab = arr(s.L).find(function (l) { return (l.name || '').trim().toLowerCase() === (msg.label || '').trim().toLowerCase(); });
      }
      if (!lab) return { ok: false, reason: 'Etiqueta não existe no WhatsApp: ' + msg.label };
    }
    var has = (chat.labels || []).map(String).indexOf(String(lab.id)) >= 0;
    if ((msg.mode === 'add' && has) || (msg.mode === 'remove' && !has)) return { ok: true, noop: true };
    try { await s.L.addOrRemoveLabels([{ id: String(lab.id), type: msg.mode }], [chat]); }
    catch (e) { return { ok: false, reason: 'WhatsApp recusou: ' + (e && e.message || e) }; }
    return { ok: true };
  }


  var SKIP_TYPES = /notification|e2e|gp2|protocol|call_log|revoked|ciphertext|broadcast_notification/;
  function msgText(m) {
    var ty = m.type || '';
    if (ty === 'chat') return (m.body || '').toString();
    var cap = (m.caption || '').toString();
    var tag = ty === 'image' ? '[foto]' : (ty === 'ptt' || ty === 'audio') ? '[áudio]' : ty === 'video' ? '[vídeo]' : ty === 'sticker' ? '[figurinha]' : ty === 'document' ? '[arquivo]' : '[mídia]';
    return cap ? tag + ' ' + cap : tag;
  }
  function readChat(msg) {
    var s = stores(); if (s.err) return { ok: false, reason: s.err };
    var chat = findChat(s, msg.chat); if (!chat) return { ok: false, reason: 'Conversa não encontrada: ' + msg.chat };
    var col = chat.msgs; var list = col ? (col.getModelsArray ? col.getModelsArray() : (col.models || [])) : [];
    var out = [];
    list.forEach(function (m) {
      if (!m || !m.id) return; if (m.isNotification || SKIP_TYPES.test(m.type || '')) return;
      out.push({ id: String(m.id._serialized || m.id.id || ''), from: m.id.fromMe ? 'out' : 'in', text: msgText(m).slice(0, 1500), ts: (m.t || 0) * 1000, at: m.t ? new Date(m.t * 1000).toLocaleString('pt-BR') : '' });
    });
    out.sort(function (a, b) { return a.ts - b.ts; });
    return { ok: true, name: chatName(chat), id: chat.id && chat.id._serialized, messages: out.slice(-(msg.max || 60)) };
  }
  async function openChat(msg) {
    var req = getReq(); var s = stores(); if (s.err) return { ok: false, reason: s.err };
    var chat = findChat(s, msg.chat); if (!chat) return { ok: false, reason: 'Conversa não encontrada: ' + msg.chat };
    var cm = mod(req, 'WAWebCmd'); var Cmd = cm && (cm.Cmd || cm.default);
    if (!Cmd) return { ok: false, reason: 'Módulo de abrir conversa não encontrado' };
    var tries = [
      function () { return Cmd.openChatBottom({ chat: chat, chatEntryPoint: 'chatList' }); },
      function () { return Cmd.openChatBottom(chat, 'chatList'); },
      function () { return Cmd.openChatAt({ chat: chat }); },
      function () { return Cmd.openChatAt(chat); }
    ];
    var last = '';
    for (var i = 0; i < tries.length; i++) {
      try { await tries[i](); return { ok: true, id: chat.id && chat.id._serialized, name: chatName(chat) }; } catch (e) { last = (e && e.message) || String(e); }
    }
    return { ok: false, reason: 'Não consegui abrir a conversa (' + last + ')' };
  }
  async function openNumber(msg) {
    var req = getReq(); if (!req) return { ok: false, reason: 'Sistema interno do WhatsApp não encontrado' };
    var digits = (msg.phone || '').replace(/\D/g, '');
    if (digits.length === 10 || digits.length === 11) digits = '55' + digits;
    if (digits.length < 12) return { ok: false, reason: 'Número inválido (use DDD + número)' };
    var wf = mod(req, 'WAWebWidFactory'), fa = mod(req, 'WAWebFindChatAction'), cm = mod(req, 'WAWebCmd'); var Cmd = cm && (cm.Cmd || cm.default);
    if (!wf || !fa || !Cmd || !wf.createWid || !fa.findOrCreateLatestChat) return { ok: false, reason: 'Módulos internos não encontrados' };
    try {
      var r = await fa.findOrCreateLatestChat(wf.createWid(digits + '@c.us'), 'newChatFlow'); var chat = r && r.chat;
      if (!chat) return { ok: false, reason: 'WhatsApp não criou a conversa' };
      try { await Cmd.openChatBottom({ chat: chat, chatEntryPoint: 'chatList' }); } catch (e) { await Cmd.openChatBottom(chat, 'chatList'); }
      return { ok: true, digits: digits };
    } catch (e) { return { ok: false, reason: String(e && e.message || e) }; }
  }
  function activeChat() {
    var s = stores(); if (s.err) return { ok: false, reason: s.err };
    var c = arr(s.C).find(function (x) { return x.active; });
    if (!c) return { ok: false, reason: 'nenhuma conversa aberta' };
    var ct = c.contact || {}; var isG = !!(c.isGroup || (c.id && c.id.server === 'g.us'));
    return { ok: true, id: c.id && c.id._serialized, name: chatName(c), saved: (ct.name || '').toString(), push: (ct.pushname || ct.shortName || '').toString(), group: isG };
  }
  // filtro da lista de conversas (lado esquerdo)
  var customSet = null;
  function ensureWrap(req) {
    var G = mod(req, 'WAWebGetters'); if (!G || typeof G.getShouldAppearInList !== 'function') return false;
    if (!G.__wcrmOrig) {
      G.__wcrmOrig = G.getShouldAppearInList;
      var wrapped = function (chat) {
        if (customSet) { try { return customSet.has(chat.id._serialized) || customSet.has(String(chat.id)); } catch (e) { return false; } }
        return G.__wcrmOrig.apply(this, arguments);
      };
      try { Object.defineProperties(wrapped, Object.getOwnPropertyDescriptors(G.__wcrmOrig)); } catch (e) { }
      try { G.getShouldAppearInList = wrapped; } catch (e) { return false; }
      if (G.getShouldAppearInList !== wrapped) return false;
    }
    return true;
  }
  async function filterList(msg) {
    var req = getReq(); var s = stores(); if (s.err) return { ok: false, reason: s.err };
    var cm = mod(req, 'WAWebCmd'); var Cmd = cm && (cm.Cmd || cm.default);
    if (!Cmd || typeof Cmd.setActiveFilter !== 'function') return { ok: false, reason: 'Filtro da lista indisponível' };
    var refresh = function () { try { var cs = mod(req, 'WAWebChatCollection'); var CC = cs && (cs.ChatCollection); CC && CC.trigger && CC.trigger('sort'); } catch (e) { } };
    if (msg.mode === 'all') { customSet = null; try { Cmd.setActiveFilter(); } catch (e) { } refresh(); return { ok: true }; }
    if (msg.mode === 'labels') {
      var lab = arr(s.L).find(function (l) { return (l.name || '').trim().toLowerCase() === (msg.label || '').trim().toLowerCase(); });
      if (!lab) return { ok: false, reason: 'Etiqueta não existe: ' + msg.label };
      customSet = null; try { Cmd.setActiveFilter('labels', String(lab.id)); } catch (e) { return { ok: false, reason: 'WhatsApp recusou o filtro' }; }
      refresh(); return { ok: true };
    }
    if (msg.mode === 'custom') {
      if (!ensureWrap(req)) return { ok: false, reason: 'Não consegui ligar o filtro por aba' };
      var ids = new Set(); var miss = 0;
      (msg.names || []).forEach(function (n) { var c = findChat(s, n); if (c && c.id) ids.add(c.id._serialized); else miss++; });
      customSet = ids; try { Cmd.setActiveFilter(); } catch (e) { } refresh();
      return { ok: true, count: ids.size, missing: miss };
    }
    return { ok: false, reason: 'modo desconhecido' };
  }


  // ações de utilitário/presença sobre uma conversa (arquivar, fixar, não lida, digitando, gravando)
  function modNames(req) {
    var out = [];
    try {
      var cands = [window.__debug, mod(req, '__debug'), req.__debug];
      for (var c = 0; c < cands.length; c++) { var mm = cands[c] && cands[c].modulesMap; if (mm) { out = Object.keys(mm); if (out.length) return out; } }
    } catch (e) { }
    return out;
  }
  var HINT = /Media|Opaque|Prep|Upload|Send|Archive|Pin|Unread|ChatState|Presence|Composing/i;
  var scanCache = {}, scanFail = {};
  function scanMods(req, pred, anyName) {
    var key = pred.toString() + '|' + (anyName ? 1 : 0);
    if (scanCache[key]) return scanCache[key];
    if (scanFail[key] && Date.now() - scanFail[key] < 120000) return null;   // não reescaneia à toa (travava o WhatsApp por minutos)
    var ks = modNames(req); var t0 = Date.now();
    for (var i = 0; i < ks.length; i++) {
      if (Date.now() - t0 > 2500) break;   // orçamento de tempo
      if (!/^WAWeb/.test(ks[i]) || (!anyName && !HINT.test(ks[i]))) continue;
      try { var m = mod(req, ks[i]); var f = m && pred(m); if (f) { f.__mod = ks[i]; scanCache[key] = f; return f; } } catch (e) { }
    }
    scanFail[key] = Date.now();
    return null;
  }
  function withTimeout(p, ms, what) { return new Promise(function (res, rej) { var t = setTimeout(function () { rej(new Error('tempo esgotado em ' + what)); }, ms); Promise.resolve(p).then(function (v) { clearTimeout(t); res(v); }, function (e) { clearTimeout(t); rej(e); }); }); }
  function probeMedia() {
    var req = getReq(); if (!req) return { ok: false, reason: 'sem ponte' };
    var ks = modNames(req);
    var od = null, pr = null;
    for (var i = 0; i < ks.length && !(od && pr); i++) {
      if (!/^WAWeb/.test(ks[i]) || !HINT.test(ks[i])) continue;
      try { var m = mod(req, ks[i]); if (!m) continue; if (!od && (typeof m.createFromData === 'function' || (m.OpaqueData && typeof m.OpaqueData.createFromData === 'function'))) od = ks[i]; if (!pr && typeof m.prepRawMedia === 'function') pr = ks[i]; } catch (e) { }
    }
    var ts = findTextSender(req);
    return { ok: true, modules: ks.length, opaque: od, prep: pr, text: !!ts, textMod: ts && ts.__mod || (ts ? 'WAWebSendTextMsgChatAction' : null) };
  }

  // envio DIRETO de texto (não digita na caixa; igual ao WaSpeed)
  function findTextSender(req) {
    var p = function (m) { return typeof m.sendTextMsgToChat === 'function' && m.sendTextMsgToChat; };
    var names = ['WAWebSendTextMsgChatAction', 'WAWebSendTextMsgAction'];
    for (var i = 0; i < names.length; i++) { var m = mod(req, names[i]); var f = m && p(m); if (f) return f; }
    return scanMods(req, p, true);
  }
  async function sendTextDirect(d) {
    var req = getReq(); var s = stores(); if (s.err) return { ok: false, reason: s.err };
    var chat = findChat(s, d.chat); if (!chat) return { ok: false, reason: 'conversa não encontrada' };
    var fn = findTextSender(req); if (!fn) return { ok: false, reason: 'módulo de envio de texto não encontrado' };
    try { await fn(chat, d.text, {}); return { ok: true }; } catch (err) { return { ok: false, reason: String(err && err.message || err) }; }
  }

  // envio DIRETO de mídia (sem abrir a prévia), pelos módulos internos do WhatsApp
  async function sendMediaDirect(d) {
    var req = getReq(); var s = stores(); if (s.err) return { ok: false, reason: s.err };
    var chat = findChat(s, d.chat); if (!chat) return { ok: false, reason: 'conversa não encontrada' };
    function named(names, pred) { for (var i = 0; i < names.length; i++) { var m = mod(req, names[i]); var f = m && pred(m); if (f) return f; } return null; }
    var pOD = function (m) { return typeof m.createFromData === 'function' ? m : (m.OpaqueData && typeof m.OpaqueData.createFromData === 'function' ? m.OpaqueData : null); };
    var pPrep = function (m) { return typeof m.prepRawMedia === 'function' && m.prepRawMedia; };
    var OD = named(['WAWebMediaOpaqueData', 'WAWebOpaqueData'], pOD) || scanMods(req, pOD, true);
    var prep = named(['WAWebPrepRawMedia', 'WAWebMediaPrep'], pPrep) || scanMods(req, pPrep, true);
    if (!OD || !prep) return { ok: false, reason: 'módulos de mídia não encontrados (' + modNames(req).length + ' módulos lidos; OpaqueData=' + !!OD + ', prepRawMedia=' + !!prep + ')' };
    var stage = 'início';
    try {
      stage = 'ler arquivo';
      var blob = await (await fetch(d.dataUrl)).blob();
      var file = new File([blob], d.name || 'arquivo', { type: d.mime || blob.type });
      stage = 'OpaqueData.createFromData';
      var opaque = await withTimeout(OD.createFromData(file, file.type), 30000, 'ler áudio/arquivo');
      var o = {}; var k = d.mkind || (d.kind === 'SENDMEDIA' ? 'image' : d.kind);
      if (k === 'document') o.asDocument = true; else if (k === 'sticker') o.asSticker = true;
      if (k === 'audio') o.isPtt = true;   // MENSAGEM DE VOZ gravada (precisa ser .ogg/opus)
      stage = 'prepRawMedia';
      var media = prep(opaque, o);
      stage = 'waitForPrep';
      if (media && typeof media.waitForPrep === 'function') await withTimeout(media.waitForPrep(), 40000, 'preparar mídia');
      stage = 'sendToChat';
      if (!media || typeof media.sendToChat !== 'function') return { ok: false, reason: 'sem sendToChat (' + typeof media + ')' };
      var opts = k === 'audio' ? {} : { caption: d.caption || '', addEvenWhilePreparing: false, isViewOnce: false };
      await withTimeout(media.sendToChat.length === 1 ? media.sendToChat({ chat: chat, options: opts }) : media.sendToChat(chat, opts), 40000, 'enviar');
      return { ok: true };
    } catch (err) { return { ok: false, reason: 'etapa ' + (typeof stage !== 'undefined' ? stage : '?') + ': ' + String(err && err.message || err) }; }
  }
  async function actChat(d) {
    var req = getReq(); var s = stores(); if (s.err) return { ok: false, reason: s.err };
    var chat = findChat(s, d.chat); if (!chat) return { ok: false, reason: 'conversa não encontrada' };
    var op = d.op; var cm = mod(req, 'WAWebCmd'); var Cmd = cm && (cm.Cmd || cm.default);
    try {
      if (op === 'archive' || op === 'unarchive') {
        var on = op === 'archive';
        if (Cmd && typeof Cmd.archiveChat === 'function') { await Cmd.archiveChat(chat, on); return { ok: true }; }
        var fa = scanMods(req, function (m) { return typeof m.setArchive === 'function' && m.setArchive; });
        if (fa) { await fa(chat, on); return { ok: true }; }
        return { ok: false, reason: 'arquivar indisponível nesta versão' };
      }
      if (op === 'pin' || op === 'unpin') {
        var pm = mod(req, 'WAWebSetPinChatAction'); var fp = pm && (pm.setPin || (pm.default && pm.default.setPin));
        if (fp) { await fp(chat, op === 'pin'); return { ok: true }; }
        return { ok: false, reason: 'fixar indisponível nesta versão' };
      }
      if (op === 'unread') {
        var um = mod(req, 'WAWebUpdateUnreadChatAction'); var fu = um && (um.markUnread || um.sendSeen && null);
        if (fu) { await fu(chat, true); return { ok: true }; }
        return { ok: false, reason: 'marcar como não lida indisponível' };
      }
      if (op === 'typing' || op === 'recording' || op === 'paused') {
        var nm = op === 'typing' ? 'sendChatStateComposing' : op === 'recording' ? 'sendChatStateRecording' : 'sendChatStatePaused';
        var fs = scanMods(req, function (m) { return typeof m[nm] === 'function' && m[nm]; });
        if (fs) { await fs(chat.id); return { ok: true }; }
        return { ok: false, reason: 'presença indisponível' };
      }
    } catch (err) { return { ok: false, reason: String(err && err.message || err) }; }
    return { ok: false, reason: 'ação desconhecida' };
  }

  function send(o) { o.tag = TAG; window.postMessage(o, '*'); }
  var lastSig = '';
  function push(force) {
    var snap = snapshot(); var sig = JSON.stringify(snap);
    if (!force && sig === lastSig) return; lastSig = sig;
    send({ kind: 'SNAPSHOT', snap: snap });
  }

  window.addEventListener('message', async function (e) {
    if (e.source !== window || !e.data || e.data.tag !== 'WCRM_CONTENT') return;
    var d = e.data;
    if (d.kind === 'SYNC') push(true);
    if (d.kind === 'OPEN' || d.kind === 'OPEN_NUMBER' || d.kind === 'READ' || d.kind === 'FILTER' || d.kind === 'ACTIVE' || d.kind === 'ACT' || d.kind === 'SENDMEDIA' || d.kind === 'SENDTEXT' || d.kind === 'PROBE') {
      var rr; try { rr = d.kind === 'OPEN' ? await openChat(d) : d.kind === 'OPEN_NUMBER' ? await openNumber(d) : d.kind === 'READ' ? readChat(d) : d.kind === 'FILTER' ? await filterList(d) : d.kind === 'ACT' ? await actChat(d) : d.kind === 'SENDMEDIA' ? await sendMediaDirect(d) : d.kind === 'SENDTEXT' ? await sendTextDirect(d) : d.kind === 'PROBE' ? probeMedia() : activeChat(); } catch (err) { rr = { ok: false, reason: String(err && err.message || err) }; }
      send({ kind: 'RESULT', reqId: d.reqId, result: rr });
    }
    if (d.kind === 'APPLY') { var r = await apply(d); r = r || {}; send({ kind: 'APPLY_RESULT', reqId: d.reqId, result: r }); setTimeout(function () { push(false); }, 600); }
  });

  setInterval(function () { push(false); }, 4000);
  setTimeout(function () { push(true); }, 1500);
})();
