const $ = (id) => document.getElementById(id);
const views = ['login', 'list', 'edit'];
let editingId = null;

function show(name) {
  views.forEach((v) => { $(v).hidden = v !== name; });
  $('logout').hidden = name === 'login';
}
function say(text, ok = false) { $('msg').textContent = text; $('msg').className = ok ? 'ok' : ''; }

async function api(path, method = 'GET', body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/login') { show('login'); throw new Error('Bitte anmelden'); }
  if (!res.ok) throw new Error(data.error || `Fehler ${res.status}`);
  return data;
}

async function loadList() {
  const pages = await api('/pages');
  const ul = $('pages');
  ul.replaceChildren();
  if (!pages.length) { const li = document.createElement('li'); li.textContent = 'Noch keine Seiten.'; ul.append(li); }
  for (const p of pages) {
    const li = document.createElement('li');
    const t = document.createElement('span'); t.className = 't'; t.textContent = p.title;
    const b = document.createElement('span'); b.className = `badge${p.published ? ' live' : ''}`; b.textContent = p.published ? 'live' : 'Entwurf';
    li.append(t, b);
    li.addEventListener('click', () => openEditor(p.id));
    ul.append(li);
  }
  show('list');
}

async function openEditor(id) {
  const f = $('edit');
  editingId = id;
  const page = id ? await api(`/pages/${id}`) : { title: '', slug: '', content: '', published: 0 };
  const el = f.elements;
  el.title.value = page.title; el.slug.value = page.slug; el.content.value = page.content; el.published.checked = !!page.published;
  $('edit-title').textContent = id ? 'Seite bearbeiten' : 'Neue Seite';
  $('delete').hidden = !id;
  show('edit');
}

$('login').addEventListener('submit', async (e) => {
  e.preventDefault(); say('');
  try {
    const u = await api('/login', 'POST', { username: e.target.username.value, password: e.target.password.value });
    $('who').textContent = u.username; e.target.password.value = '';
    await loadList();
  } catch (err) { say(err.message); }
});
$('logout').addEventListener('click', async () => { await api('/logout', 'POST', {}); $('who').textContent = ''; show('login'); });
$('new').addEventListener('click', () => { say(''); openEditor(null); });
$('cancel').addEventListener('click', () => { say(''); loadList(); });
$('edit').addEventListener('submit', async (e) => {
  e.preventDefault(); say('');
  const f = e.target;
  const el = f.elements;
  const body = { title: el.title.value, slug: el.slug.value, content: el.content.value, published: el.published.checked };
  try {
    editingId ? await api(`/pages/${editingId}`, 'PUT', body) : await api('/pages', 'POST', body);
    await loadList(); say('Gespeichert', true);
  } catch (err) { say(err.message); }
});
$('delete').addEventListener('click', async () => {
  if (!confirm('Seite wirklich löschen?')) return;
  try { await api(`/pages/${editingId}`, 'DELETE'); await loadList(); say('Gelöscht', true); } catch (err) { say(err.message); }
});

(async () => {
  try { const u = await api('/me'); $('who').textContent = u.username; await loadList(); } catch { show('login'); }
})();
