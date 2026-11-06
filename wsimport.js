// WhatsApp CRM Pro v4.53 — wsimport.js
// Converte o arquivo de backup do WaSpeed (.json) para respostas rápidas do CRM.
// Só lê o que está legível no backup: ações (texto, imagem, áudio, vídeo, link) — títulos/categorias/abas/contatos vêm criptografados e NÃO são lidos.
(function (root) {
  'use strict';
  const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/webm': 'webm', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/3gpp': '3gp' };
  const props = p => { if (typeof p === 'string') { try { return JSON.parse(p); } catch (e) { return {}; } } return p || {}; };
  const mimeOf = d => { const m = /^data:([^;,]+)/.exec(d || ''); return m ? m[1] : ''; };
  const num = (v, d) => { const n = parseFloat(v); return isFinite(n) ? n : d; };
  const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  function convert(json) {
    const out = { items: [], skipped: { labelActions: 0, crmActions: 0, emptyMedia: 0, empty: 0 }, notes: [], counts: { text: 0, image: 0, audio: 0, video: 0, banner: 0 } };
    const list = (json && json.respostasRapidasAcao) || []; let nImg = 0, nAud = 0, nVid = 0, nTxt = 0, nMix = 0;
    list.forEach(e => {
      const acts = []; let first = null;
      (e.acao || []).forEach(it => {
        const t = it.type, p = props(it.propriedades); const ty = num(p.composing, 0), da = num(p.aguarde, 0);
        if (t === 'txt') { if (!String(p.mensagem || '').trim()) return; acts.push({ k: 'text', txt: p.mensagem, ty, da }); out.counts.text++; first = first || { t: 'txt', s: p.mensagem }; }
        else if (t === 'image' || t === 'audio' || t === 'video') {
          if (!p.base64) { out.skipped.emptyMedia++; return; }
          const mime = mimeOf(p.base64); const n = t === 'image' ? ++nImg : t === 'audio' ? ++nAud : ++nVid;
          acts.push({ k: t, ty, da, cap: t === 'audio' ? '' : (p.mensagem || ''), fileMime: mime, fileName: t + '_' + n + '.' + (EXT[mime] || (mime.split('/')[1] || 'bin')), media: p.base64 }); out.counts[t]++;
          first = first || { t, s: p.mensagem || '' };
        }
        else if (t === 'linkPreview') { acts.push({ k: 'banner', link: p.link, title: p.title, desc: p.description, da }); out.counts.banner++; first = first || { t: 'link', s: p.title || p.link }; }
        else if (t === 'removeAllLabel') acts.push({ k: 'label_rmall' });
        else if (t === 'removeAllCRM') acts.push({ k: 'tab_rmall' });
        else if (t === 'addLabel' || t === 'removeLabel') out.skipped.labelActions++;
        else if (t === 'addCRM' || t === 'removeCRM') out.skipped.crmActions++;
      });
      if (!acts.length) { out.skipped.empty++; return; }
      const f = first || { t: 'aux', s: '' }; let title;
      if (f.t === 'txt') title = clip(f.s, 34) || 'Texto ' + (++nTxt); else if (f.t === 'audio') title = 'Áudio ' + nAud; else if (f.t === 'image') title = 'Imagem ' + nImg + (f.s ? ' – ' + clip(f.s, 24) : ''); else if (f.t === 'video') title = 'Vídeo ' + nVid + (f.s ? ' – ' + clip(f.s, 24) : ''); else if (f.t === 'link') title = 'Link – ' + clip(f.s, 28); else title = 'Ação ' + (++nMix);
      if (acts.length > 1 && f.t !== 'aux') title += ' (+' + (acts.length - 1) + ')';
      out.items.push({ wsId: e.id, title, actions: acts });
    });
    return out;
  }
  const api = { convert };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WCRM_WSIMPORT = api;
})(typeof window !== 'undefined' ? window : globalThis);
