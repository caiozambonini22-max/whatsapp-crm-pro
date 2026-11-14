// WhatsApp CRM Pro — clientdata.js
// Extrai os dados do cliente (nome, CPF, nascimento, e-mail, endereço…) das mensagens da conversa,
// sem IA e sem servidor: lê o formulário "✅Nome: … ✅CPF: …" que o cliente devolve e, se faltar algo,
// procura CPF/CEP/e-mail/data soltos no texto. Roda no navegador; nada sai do computador.
(function (root) {
  'use strict';
  const nz = s => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const UFS = { acre: 'AC', alagoas: 'AL', amapa: 'AP', amazonas: 'AM', bahia: 'BA', ceara: 'CE', 'distrito federal': 'DF', 'espirito santo': 'ES', goias: 'GO', maranhao: 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG', para: 'PA', paraiba: 'PB', parana: 'PR', pernambuco: 'PE', piaui: 'PI', 'rio de janeiro': 'RJ', 'rio grande do norte': 'RN', 'rio grande do sul': 'RS', rondonia: 'RO', roraima: 'RR', 'santa catarina': 'SC', 'sao paulo': 'SP', sergipe: 'SE', tocantins: 'TO' };
  const UFSET = new Set(Object.values(UFS));
  function cpfOk(d) {
    d = String(d || '').replace(/\D/g, ''); if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
    for (let t = 9; t < 11; t++) { let s = 0; for (let i = 0; i < t; i++) s += +d[i] * (t + 1 - i); const v = ((s * 10) % 11) % 10; if (v !== +d[t]) return false; }
    return true;
  }
  function cnpjOk(d) {
    d = String(d || '').replace(/\D/g, ''); if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
    const calc = n => { let s = 0, p = n - 7; for (let i = 0; i < n; i++) { s += +d[i] * p--; if (p < 2) p = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
    return calc(12) === +d[12] && calc(13) === +d[13];
  }
  const SMALL = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
  const title = s => {
    s = (s || '').trim(); if (!s) return s; const allUp = s === s.toUpperCase();
    return s.split(/(\s+)/).map((w, i) => {
      if (!w.trim()) return w; const lw = w.toLowerCase();
      if (/^[IVXLC]{2,}$/.test(w.replace(/\W/g, '')) && w === w.toUpperCase() && s.split(/\s+/).length > 1) return w;   // XIII
      if (i > 0 && SMALL.has(lw)) return lw;
      if (allUp || w === lw) return lw.replace(/^\p{L}/u, c => c.toUpperCase());
      return w;
    }).join('');
  };
  const clean = s => (s || '').replace(/^[\s\-–•*_✅☑✔️✓]+/u, '').replace(/[\s.;,]+$/, '').trim();
  function parseDate(v) {
    const m = String(v || '').match(/(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(\d{2,4})/); if (!m) return '';
    let d = +m[1], mo = +m[2], y = +m[3]; if (y < 100) y += y > 30 ? 1900 : 2000;
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > new Date().getFullYear()) return '';
    return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }
  function splitStreet(v) {
    v = clean(v);
    let m = v.match(/^(.*?),\s*(?:n[ºo°.]*\s*)?(\d{1,6}[A-Za-z]?)\b[\s,\-–]*(.*)$/i);   // "Rua X, 123 - apto 4"
    if (m && m[1].length > 2) return { street: m[1], number: m[2], complement: clean(m[3]) };
    m = v.match(/^(.*?)[,\s\-–]+(?:n[ºo°.]*\s*)?(\d{1,6}[A-Za-z]?)\s*$/i);                  // "Avenida X 3905"
    if (m && m[1].length > 2) return { street: m[1].replace(/[,\s\-–]+$/, ''), number: m[2] };
    return { street: v, number: '' };
  }
  function ufOf(v) { v = clean(v); const k = nz(v); if (UFS[k]) return UFS[k]; const u = v.toUpperCase().replace(/[^A-Z]/g, ''); return UFSET.has(u) ? u : ''; }
  // classifica o rótulo da linha ("Nome", "CEP da rua", "Ponto de X referência"…)
  function kindOf(label) {
    const l = nz(label).replace(/[^a-z0-9 /]/g, ' ').replace(/\s+/g, ' ').trim();
    if (/^(nome|nome completo|name|seu nome|cliente)$/.test(l) || /^nome\b/.test(l)) return 'name';
    if (/\bcpf\b|\bcnpj\b/.test(l)) return 'cpf';
    if (/nasc|aniversario/.test(l)) return 'birth';
    if (/e ?-?mail/.test(l)) return 'email';
    if (/\bcep\b/.test(l)) return 'cep';
    if (/referencia|complemento|\bapto?\b|apartamento|bloco/.test(l)) return 'complement';
    if (/^(endereco|rua|logradouro|avenida|av|end)\b/.test(l) || /^endereco/.test(l)) return 'street';
    if (/^(numero|num|n)$/.test(l)) return 'number';
    if (/bairro/.test(l)) return 'bairro';
    if (/cidade|municipio/.test(l)) return 'city';
    if (/^(estado|uf)\b/.test(l)) return 'uf';
    if (/telefone|celular|whats|contato|fone/.test(l)) return 'phone';
    return '';
  }
  // msgs: [{from:'in'|'out', text}] em ordem cronológica
  function extractClient(msgs) {
    const out = { name: '', cpf: '', birth: '', email: '', cep: '', street: '', number: '', complement: '', bairro: '', city: '', uf: '', phone: '' };
    const src = {}; let found = 0;
    const set = (k, v) => { if (v && v !== out[k]) { if (!out[k]) found++; out[k] = v; } };
    const inc = (msgs || []).filter(m => m && m.from !== 'out' && m.text);
    // 1) linhas "Rótulo: valor" — a resposta mais recente de cada campo vale
    inc.forEach(m => {
      String(m.text).split(/\r?\n/).forEach(line => {
        const mm = line.match(/^\s*[^\p{L}\p{N}]*([^:：\n]{1,60}?)\s*[:：]\s*(.+?)\s*$/u); if (!mm) return;
        const label = mm[1], val = clean(mm[2]); if (!val) return; const k = kindOf(label); if (!k) return;
        if (k === 'name') { if (/\p{L}{2,}/u.test(val) && !/\d{3,}/.test(val)) set('name', title(val)); }
        else if (k === 'cpf') { const d = val.replace(/\D/g, ''); if (d.length === 11 || d.length === 14) { if (d.length === 11 ? cpfOk(d) : cnpjOk(d)) set('cpf', d); else if (!out.cpf) { out.cpf = d; out.cpfBad = true; found++; } } }
        else if (k === 'birth') { const d = parseDate(val); if (d) set('birth', d); }
        else if (k === 'email') { const e = (val.match(/[\w.+\-]+@[\w\-]+(?:\.[\w\-]+)+/) || [])[0]; if (e) set('email', e.toLowerCase()); }
        else if (k === 'cep') { const d = val.replace(/\D/g, ''); if (d.length === 8) set('cep', d); }
        else if (k === 'street') { const s = splitStreet(val); set('street', title(s.street)); if (s.number) set('number', s.number); if (s.complement && !out.complement) set('complement', s.complement); }
        else if (k === 'number') { const n = (val.match(/\d{1,6}[A-Za-z]?/) || [])[0]; if (n) set('number', n); }
        else if (k === 'complement') { const pre = nz(label).match(/^ponto de (.*?) referencia$/); const v = pre ? (pre[1] ? label.replace(/^\s*[^\p{L}]*ponto de\s+/iu, '').replace(/\s*refer[êe]ncia\s*$/iu, '').trim() + ' · ' : '') + val : val; set('complement', title(v)); }
        else if (k === 'bairro') set('bairro', title(val));
        else if (k === 'city') set('city', title(val));
        else if (k === 'uf') { const u = ufOf(val); if (u) set('uf', u); }
        else if (k === 'phone') { const d = val.replace(/\D/g, ''); if (d.length >= 10 && d.length <= 13) set('phone', d); }
      });
    });
    // 2) o que faltou: procura solto no texto do cliente (mais recente primeiro)
    const txt = inc.slice().reverse().map(m => String(m.text));
    const all = txt.join('\n');
    if (!out.cpf) { for (const m of all.matchAll(/(?<!\d)(\d{3}\.?\d{3}\.?\d{3}-?\d{2})(?!\d)/g)) { const d = m[1].replace(/\D/g, ''); if (cpfOk(d)) { set('cpf', d); break; } } }
    if (!out.email) { const e = (all.match(/[\w.+\-]+@[\w\-]+(?:\.[\w\-]+)+/) || [])[0]; if (e) set('email', e.toLowerCase()); }
    if (!out.cep) { const c = (all.match(/(?<!\d)(\d{5}-?\d{3})(?!\d)/) || [])[1]; if (c) set('cep', c.replace(/\D/g, '')); }
    if (!out.birth) { for (const t of txt) { const m = t.match(/nasc[^\d\n]{0,25}(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/i); if (m) { const d = parseDate(m[1]); if (d) { set('birth', d); break; } } } }
    out.found = found;
    return out;
  }
  const api = { extractClient, cpfOk, cnpjOk };
  root.__wcrmClient = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
