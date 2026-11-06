// WhatsApp CRM Pro — atualizador (baixa os arquivos do GitHub para a pasta da extensão e recarrega)
const $ = id => document.getElementById(id);
const cur = chrome.runtime.getManifest().version; $('cur').textContent = cur;
const st = (t, c) => { const e = $('st'); e.textContent = t; e.className = 'st ' + (c || ''); };
const sget = k => new Promise(r => chrome.storage.local.get(k, o => r(o[k])));
const sset = (k, v) => new Promise(r => chrome.storage.local.set({ [k]: v }, r));
// guarda a pasta escolhida (IndexedDB) para não pedir de novo
const idb = () => new Promise((res, rej) => { const q = indexedDB.open('wcrm_upd', 1); q.onupgradeneeded = () => q.result.createObjectStore('h'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
const hGet = async () => { const d = await idb(); return new Promise(r => { const q = d.transaction('h').objectStore('h').get('dir'); q.onsuccess = () => r(q.result); q.onerror = () => r(null); }); };
const hSet = async h => { const d = await idb(); return new Promise(r => { const t = d.transaction('h', 'readwrite'); t.objectStore('h').put(h, 'dir'); t.oncomplete = () => r(); }); };
let dirH = null, remote = null;

const cfg = () => ({ repo: $('repo').value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, ''), branch: $('branch').value.trim() || 'main', token: $('token').value.trim() });
async function saveCfg() { await sset('wcrm_upd', cfg()); }
const gh = (c, path, raw) => fetch('https://api.github.com/repos/' + c.repo + path, { headers: Object.assign({ Accept: raw ? 'application/vnd.github.raw' : 'application/vnd.github+json' }, c.token ? { Authorization: 'Bearer ' + c.token } : {}), cache: 'no-store' });
const cmp = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };

async function check() {
  const c = cfg(); if (!/^[^/]+\/[^/]+$/.test(c.repo)) { st('Informe o repositório no formato dono/nome', 'bad'); return null; }
  await saveCfg(); st('Consultando o GitHub…');
  const r = await gh(c, '/contents/manifest.json?ref=' + encodeURIComponent(c.branch), true);
  if (r.status === 404) { st('Não achei o manifest.json nesse repositório/branch. Se for privado, coloque o token.', 'bad'); return null; }
  if (!r.ok) { st('Erro do GitHub: ' + r.status, 'bad'); return null; }
  const m = JSON.parse(await r.text()); remote = m.version;
  if (cmp(remote, cur) > 0) { st('🆕 Nova versão disponível: ' + remote + ' (instalada: ' + cur + ')', 'new'); $('go').disabled = !dirH; if (!dirH) st($('st').textContent + '\nEscolha a pasta da extensão para poder atualizar.', 'new'); }
  else { st('✅ Você já está na versão mais nova (' + cur + ').', 'ok'); $('go').disabled = true; }
  return m;
}
async function ensurePerm() { if (!dirH) return false; const o = { mode: 'readwrite' }; if (await dirH.queryPermission(o) === 'granted') return true; return (await dirH.requestPermission(o)) === 'granted'; }
async function writeFile(root, path, buf) {
  const parts = path.split('/'); let d = root; for (let i = 0; i < parts.length - 1; i++) d = await d.getDirectoryHandle(parts[i], { create: true });
  const fh = await d.getFileHandle(parts[parts.length - 1], { create: true }); const w = await fh.createWritable(); await w.write(buf); await w.close();
}
async function update() {
  const c = cfg(); if (!(await ensurePerm())) { st('Preciso de permissão para escrever na pasta da extensão.', 'bad'); return; }
  // confere se é a pasta certa (tem manifest.json com a mesma chave/nome)
  try { const f = await (await dirH.getFileHandle('manifest.json')).getFile(); const lm = JSON.parse(await f.text()); if (lm.name !== chrome.runtime.getManifest().name) throw 0; } catch (e) { st('Essa não parece ser a pasta da extensão (não achei o manifest.json certo). Escolha a pasta de novo.', 'bad'); return; }
  $('go').disabled = true; st('Listando arquivos…');
  const tr = await gh(c, '/git/trees/' + encodeURIComponent(c.branch) + '?recursive=1'); if (!tr.ok) { st('Erro ao listar os arquivos: ' + tr.status, 'bad'); return; }
  const files = (await tr.json()).tree.filter(x => x.type === 'blob' && !/^(\.|README|LICENSE)/i.test(x.path) && !/(^|\/)\./.test(x.path));
  if (!files.some(x => x.path === 'manifest.json')) { st('O repositório não tem manifest.json na raiz.', 'bad'); return; }
  // baixa TUDO primeiro (se algo falhar, nada é alterado)
  const got = []; let n = 0;
  for (const f of files) { const r = await gh(c, '/contents/' + f.path.split('/').map(encodeURIComponent).join('/') + '?ref=' + encodeURIComponent(c.branch), true); if (!r.ok) { st('Falhou ao baixar ' + f.path + ' (' + r.status + '). Nada foi alterado.', 'bad'); $('go').disabled = false; return; } got.push([f.path, await r.arrayBuffer()]); st('Baixando… ' + (++n) + '/' + files.length); }
  // o manifest vai por último (o Chrome só recarrega depois)
  got.sort((a, b) => (a[0] === 'manifest.json') - (b[0] === 'manifest.json'));
  n = 0; for (const [p, b] of got) { await writeFile(dirH, p, b); st('Gravando… ' + (++n) + '/' + got.length); }
  st('✅ Atualizado para a versão ' + remote + '! Recarregando a extensão… Depois dê F5 no WhatsApp Web.', 'ok');
  setTimeout(() => chrome.runtime.reload(), 1200);
}
$('pick').onclick = async () => { try { dirH = await window.showDirectoryPicker({ mode: 'readwrite', id: 'wcrm-ext' }); await hSet(dirH); $('dir').textContent = '📁 ' + dirH.name; if (remote && cmp(remote, cur) > 0) $('go').disabled = false; } catch (e) {} };
$('check').onclick = () => check().catch(e => st('Erro: ' + e.message, 'bad'));
$('go').onclick = () => update().catch(e => { st('Erro ao atualizar: ' + e.message, 'bad'); $('go').disabled = false; });
(async () => { const c = await sget('wcrm_upd'); if (c) { $('repo').value = c.repo || ''; $('branch').value = c.branch || 'main'; $('token').value = c.token || ''; } dirH = await hGet().catch(() => null); if (dirH) $('dir').textContent = '📁 ' + dirH.name; if (c && c.repo) check().catch(() => {}); })();
