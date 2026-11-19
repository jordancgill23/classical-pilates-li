// Builds public/ from src/index.html + content/site.json. No dependencies.
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const OUT = path.join(ROOT, 'public');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/site.json'), 'utf8'));
const tpl = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Text fields: escape, then allow **bold**, *italic* and line breaks.
const fmt = s => esc(s == null ? '' : s)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/\*(.+?)\*/g, '<i>$1</i>')
  .replace(/\r?\n/g, '<br>');
const plain = s => esc(s == null ? '' : s).replace(/\*/g, '');
const tel = s => '+1' + String(s || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
const urlq = s => encodeURIComponent(String(s || '')).replace(/%20/g, '+').replace(/%2C/g, ',');

function lookup(scopes, key) {
  if (key === '.') return (scopes[0] && typeof scopes[0] === 'object' && '.' in scopes[0]) ? scopes[0]['.'] : scopes[0];
  for (const sc of scopes) {
    let v = sc, ok = true;
    for (const part of key.split('.')) {
      if (v != null && typeof v === 'object' && part in v) v = v[part]; else { ok = false; break; }
    }
    if (ok) return v;
  }
  return undefined;
}

function render(t, scopes) {
  // blocks: {{#each name}}..{{/each name}}, {{#if name}}..{{/if name}}, {{#unless name}}..{{/unless name}}
  t = t.replace(/\{\{#(each|if|unless) ([\w.@]+)\}\}([\s\S]*?)\{\{\/\1 \2\}\}/g, (m, kind, key, inner) => {
    const v = lookup(scopes, key);
    if (kind === 'each') {
      const arr = Array.isArray(v) ? v : [];
      return arr.map((item, i) => {
        const meta = { '@index': i, '@num': i + 1, '@first': i === 0, '@op': i === 0 ? '1' : '0', '@on': i === 0 ? ' on' : '' };
        const itemScope = (item && typeof item === 'object') ? Object.assign({}, item, meta) : Object.assign({ '.': item }, meta);
        return render(inner, [itemScope].concat(scopes)).replace(/\{\{\.\}\}/g, fmt(item));
      }).join('');
    }
    const truthy = Array.isArray(v) ? v.length > 0 : !!v;
    return (kind === 'if' ? truthy : !truthy) ? render(inner, scopes) : '';
  });
  // values: {{{raw}}}, {{plain:x}}, {{tel:x}}, {{q:x}}, {{x}}
  t = t.replace(/\{\{\{([\w.@]+)\}\}\}/g, (m, k) => { const v = lookup(scopes, k); return v == null ? '' : String(v); });
  t = t.replace(/\{\{(plain|tel|q|attr):([\w.@]+)\}\}/g, (m, f, k) => {
    const v = lookup(scopes, k);
    return f === 'plain' ? plain(v) : f === 'tel' ? tel(v) : f === 'q' ? urlq(v) : esc(v == null ? '' : v);
  });
  t = t.replace(/\{\{([\w.@]+)\}\}/g, (m, k) => { const v = lookup(scopes, k); return v == null ? '' : fmt(v); });
  return t;
}

function copyDir(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    e.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
copyDir(path.join(ROOT, 'static'), OUT);
copyDir(path.join(ROOT, 'images'), path.join(OUT, 'images'));
copyDir(path.join(ROOT, 'admin'), path.join(OUT, 'admin'));
const html = render(tpl, [data]);
const left = html.match(/\{\{[^}]*\}\}/g);
if (left) { console.error('Unfilled template tags:', [...new Set(left)].join(', ')); process.exit(1); }
fs.writeFileSync(path.join(OUT, 'index.html'), html);
console.log('Built public/index.html (' + html.length + ' bytes)');
