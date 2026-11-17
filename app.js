// Bill Split: scan the bill, tap who had what, send everyone their exact share on UPI.
// The photo is read in this page (ocr.js); the split is plain maths (split.js); nothing is sent anywhere.
import { parseBill } from './parse.js';
import { split, upiLink, validVpa } from './split.js';
import { readBill, warmUp } from './ocr.js';
const $ = id => document.getElementById(id);
const SAMPLE_FRIENDS = ['Ananya', 'Kunal', 'Farhan'];   // "Try a sample" fills the table with these, so the split can be tried straight away
const COLORS = ['#FF5A5F', '#3B82F6', '#F59E0B', '#10B981', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16'];
const S = { items: [], charges: [], subtotal: null, total: null, printedSub: null, people: [], active: null, dropService: false, payer: null, editing: false, demo: false, result: null, showResult: false };
const store = { get(k, d) { try { const v = localStorage.getItem('bs.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem('bs.' + k, JSON.stringify(v)); } catch { } } };
let uid = 0; const nid = p => p + (++uid);
const rs = (x, paise = false) => '₹' + (paise && Math.round(x * 100) % 100 ? x.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Math.round(x).toLocaleString('en-IN'));
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
function toast(t) { const e = el('div', 'toast', t); document.body.append(e); setTimeout(() => e.remove(), 2200); }

// ---------------------------------------------------------------- getting the bill in
function show(id) { for (const s of ['start', 'reading', 'bill', 'result', 'pay']) $(s).hidden = !(Array.isArray(id) ? id.includes(s) : s === id); }
async function fromPhoto(file) {
  show('reading'); $('photo').src = URL.createObjectURL(file); $('readSay').textContent = 'Getting the reader ready…';
  try {
    const text = await readBill(file, (what, p) => { $('readSay').textContent = `${what}… ${Math.round((p || 0) * 100)}%`; });
    useText(text, true);
  } catch (e) {
    show('start'); $('typed').hidden = false; toast(e.message || 'Could not read that photo. Type the bill in instead.');
  }
}
export function useText(text, fromScan = false) {
  const r = parseBill(text);
  if (!r.items.length) { show('start'); $('typed').hidden = false; $('typedText').value = text.trim(); toast(fromScan ? "Couldn't find the items. Fix the text and tap Use this bill." : 'No items found: one item per line, with its price at the end.'); return; }
  S.items = r.items.map(it => ({ id: nid('i'), name: it.name, qty: it.qty, amount: it.amount, who: [] }));
  S.charges = r.charges.map(c => ({ ...c, id: nid('c') }));
  S.printedSub = r.check.hasSubtotal ? r.subtotal : null; S.total = r.total; S.totalPrinted = r.check.hasTotal; S.dropService = false; S.result = null; S.showResult = false; S.editing = false;
  if (!S.people.length) addPerson(store.get('me', 'Me'));
  if (S.sample) { for (const n of SAMPLE_FRIENDS) if (!S.people.some(p => p.name === n)) addPerson(n); S.sample = false; }
  S.active = S.people[0]?.id ?? null;
  show('bill'); render(); window.scrollTo({ top: 0 });
}

// ---------------------------------------------------------------- people
function addPerson(name) {
  name = name.trim().replace(/\s+/g, ' ').slice(0, 18); if (!name) return null;
  if (S.people.some(p => p.name.toLowerCase() === name.toLowerCase())) name += ' ' + (S.people.length + 1);
  const used = new Set(S.people.map(p => p.color)); const color = COLORS.find(c => !used.has(c)) || COLORS[S.people.length % COLORS.length];
  const p = { id: nid('p'), name, color }; S.people.push(p); if (!S.active) S.active = p.id; return p;
}
function removePerson(id) {
  S.people = S.people.filter(p => p.id !== id); for (const it of S.items) it.who = it.who.filter(w => w !== id);
  if (S.active === id) S.active = S.people[0]?.id ?? null; if (S.payer === id) S.payer = null;
}
function chip(p, { on, removable } = {}) {
  const b = el('button', 'chip' + (on ? ' on' : '')); b.type = 'button'; b.dataset.id = p.id;
  const i = el('i', '', initials(p.name)); i.style.background = p.color; b.append(i, p.name);
  if (removable) { const x = el('span', 'x', '×'); x.title = 'Remove'; x.onclick = e => { e.stopPropagation(); removePerson(p.id); render(); }; b.append(x); }
  return b;
}
const frac = n => n > 1 ? ` (${({ 2: '½', 3: '⅓', 4: '¼', 5: '⅕', 6: '⅙', 8: '⅛' })[n] || '1/' + n})` : '';
const initials = n => n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

// ---------------------------------------------------------------- assigning items
function tapItem(it) {
  if (S.editing) return;
  if (!S.active) { $('addName').focus(); toast('Add a name first'); return; }
  if (S.active === 'all') it.who = it.who.length === S.people.length ? [] : S.people.map(p => p.id);
  else it.who = it.who.includes(S.active) ? it.who.filter(w => w !== S.active) : [...it.who, S.active];
  render(); const row = document.querySelector(`[data-item="${it.id}"]`); row?.classList.remove('pop'); void row?.offsetWidth; row?.classList.add('pop');
}

// ---------------------------------------------------------------- render
const itemsSum = () => Math.round(S.items.reduce((a, b) => a + (+b.amount || 0), 0) * 100) / 100;
const svc = () => S.charges.filter(c => c.kind === 'service').reduce((a, c) => a + c.amount, 0);
export function render() {
  // people
  const pc = $('peopleChips'); pc.textContent = '';
  for (const p of S.people) pc.append(chip(p, { removable: true }));
  // items
  const box = $('items'); box.textContent = ''; $('receipt').classList.toggle('edit', S.editing);
  $('hint').textContent = S.editing ? 'Fix any name or price the scan got wrong. Prices are the line total (qty × price).' : 'Pick a name below, then tap what they had. Shared something? Tap it for each person.';
  for (const it of S.items) {
    const row = el('div', 'it'); row.dataset.item = it.id;
    if (S.editing) {
      const n = el('input'); n.value = it.name; n.setAttribute('aria-label', 'Item name'); n.oninput = () => { it.name = n.value; };
      const a = el('input'); a.value = it.amount; a.inputMode = 'decimal'; a.setAttribute('aria-label', 'Price'); a.oninput = () => { it.amount = parseFloat(a.value) || 0; renderSums(); };
      const d = el('button', 'del', '✕'); d.type = 'button'; d.setAttribute('aria-label', 'Delete item'); d.onclick = () => { S.items = S.items.filter(x => x !== it); render(); };
      row.append(n, a, d);
    } else {
      const nm = el('div', 'nm', it.name); if (it.qty > 1) nm.append(el('small', '', ` ×${it.qty}`));
      const am = el('div', 'am', rs(it.amount, true)); const who = el('div', 'who');
      if (!it.who.length) who.append(el('em', '', S.people.length ? 'tap to say who had it' : ''));
      else if (it.who.length === S.people.length && S.people.length > 2) { const i = el('i', '', 'Everyone'); i.style.background = '#121212'; who.append(i); }
      else for (const id of it.who) { const p = S.people.find(x => x.id === id); const i = el('i', '', p.name.split(' ')[0].slice(0, 10)); i.style.background = p.color; who.append(i); }
      if (it.who.length > 1) who.append(el('em', '', ` ${rs(it.amount / it.who.length, true)} each`));
      row.append(nm, am, who); row.onclick = () => tapItem(it);
    }
    box.append(row);
  }
  $('addItemBtn').hidden = !S.editing; $('editBtn').textContent = S.editing ? '✓ Done fixing' : '✎ Fix items';
  renderSums(); renderSvc(); renderDock();
  if (S.showResult && S.people.length > 1) renderResult(); else $('result').hidden = true;
}
function renderSums() {
  const s = $('sums'); s.textContent = ''; const sub = itemsSum();
  const line = (l, v, cls = '', input = null) => { const r = el('div', 'sum ' + cls); r.append(el('span', '', l)); if (input) r.append(input); else r.append(el('span', '', v)); s.append(r); return r; };
  line('Items', rs(sub, true));
  for (const c of S.charges) {
    const lbl = c.label || ({ tax: 'GST', service: 'Service charge', discount: 'Discount', roundoff: 'Round off', other: 'Other charge' })[c.kind];
    let inp = null;
    if (S.editing) { inp = el('input'); inp.value = c.amount; inp.inputMode = 'decimal'; inp.style.cssText = 'width:96px;height:32px;border:1.5px solid var(--line);border-radius:8px;text-align:right;font:600 14px var(--mono)'; inp.oninput = () => { c.amount = parseFloat(inp.value) || 0; renderCheck(); }; }
    line(lbl, (c.amount < 0 ? '−' : '') + rs(Math.abs(c.amount), true), c.kind === 'service' ? 'svc' + (S.dropService ? ' off' : '') : '', inp);
  }
  const total = S.total - (S.dropService ? svc() : 0);
  let tin = null; if (S.editing) { tin = el('input'); tin.value = S.total; tin.inputMode = 'decimal'; tin.style.cssText = 'width:110px;height:34px;border:1.5px solid var(--ink);border-radius:8px;text-align:right;font:800 15px var(--mono)'; tin.oninput = () => { S.total = parseFloat(tin.value) || 0; S.totalPrinted = true; renderCheck(); }; }
  line(S.dropService ? 'New total' : 'Total', rs(total, true), 'tot', tin);
  renderCheck();
}
function renderCheck() {
  const c = $('check'); c.textContent = ''; const sub = itemsSum();
  const add = (good, t) => c.append(el('div', good ? 'good' : 'bad', (good ? '✓ ' : '⚠ ') + t));
  if (S.printedSub != null) add(Math.abs(sub - S.printedSub) < 1, Math.abs(sub - S.printedSub) < 1 ? 'Items add up to the bill\'s sub total' : `Items add up to ${rs(sub, true)}, the bill says ${rs(S.printedSub, true)}. Tap ✎ Fix items.`);
  const computed = sub + S.charges.reduce((a, x) => a + x.amount, 0);
  if (S.totalPrinted) add(Math.abs(computed - S.total) < 1.01, Math.abs(computed - S.total) < 1.01 ? `Everything adds up to the bill total, ${rs(S.total, true)}` : `Items and charges make ${rs(computed, true)}, the bill total is ${rs(S.total, true)}. Check the items.`);
  const left = S.items.filter(i => !i.who.length).length;
  if (S.people.length) add(!left, left ? `${left} item${left > 1 ? 's' : ''} not given to anyone yet (they'll be shared by everyone)` : 'Every item has someone');
}
function renderSvc() {
  const amt = svc(); $('svcCard').hidden = !(amt > 0);
  $('svcTitle').textContent = `Service charge ${rs(amt, true)} is optional`;
  $('svcKeep').classList.toggle('on', !S.dropService); $('svcDrop').classList.toggle('on', S.dropService);
}
let resultInView = false;
function renderDock() {
  const showDock = !$('bill').hidden && !S.editing && S.items.length > 0 && $('pay').hidden && !resultInView;
  $('dock').hidden = !showDock; if (!showDock) return;
  const dc = $('dockChips'); dc.textContent = '';
  for (const p of S.people) { const b = chip(p, { on: S.active === p.id }); b.onclick = () => { S.active = p.id; render(); }; dc.append(b); }
  if (S.people.length > 1) { const b = chip({ id: 'all', name: 'Everyone', color: '#121212' }, { on: S.active === 'all' }); b.classList.add('all'); b.querySelector('i').textContent = '∀'; b.onclick = () => { S.active = 'all'; render(); }; dc.append(b); }
  const a = S.people.find(p => p.id === S.active);
  $('dockSay').textContent = !S.people.length ? 'Add the names of everyone at the table' : S.active === 'all' ? 'Tap the things everyone shared' : a ? (/^me$/i.test(a.name) ? 'Tap what you had' : `Tap what ${a.name} had`) : 'Tap a name, then tap what they had';
  $('splitBtn').disabled = S.people.length < 2; $('splitBtn').style.opacity = S.people.length < 2 ? .45 : 1;
  $('splitBtn').textContent = S.people.length < 2 ? 'Add at least 2 people' : 'See who pays what';
}

// ---------------------------------------------------------------- the result
function compute() {
  const items = S.items.map(i => ({ name: i.name, amount: +i.amount || 0, who: i.who }));
  if (!S.payer || !S.people.some(p => p.id === S.payer)) S.payer = S.people[0]?.id ?? null;
  S.result = split({ items, charges: S.charges, total: S.total, people: S.people, payer: S.payer, dropService: S.dropService });
  return S.result;
}
function renderResult() {
  const r = compute(); if (!r) return; $('result').hidden = false;
  const box = $('people'); box.textContent = '';
  for (const row of r.rows) {
    const p = S.people.find(x => x.id === row.id); const c = el('div', 'pc'); c.style.setProperty('--c', p.color);
    const top = el('div', 'top'); const nm = el('b', '', p.name);
    const amt = el('strong', '', rs(row.isPayer ? row.exact : row.pay));
    if (row.isPayer) nm.append(el('small', '', '  paid the bill')); top.append(nm, amt); c.append(top);
    const ul = el('ul');
    for (const it of row.items) { const li = el('li'); li.append(el('span', '', it.name + frac(it.of)), el('span', '', rs(it.share, true))); ul.append(li); }
    const extra = row.tax + row.service + row.other + row.discount + row.roundoff;
    if (Math.abs(extra) >= 0.01) { const li = el('li'); li.append(el('span', '', S.dropService || !row.service ? 'Their share of tax' + (row.discount ? ' and discount' : '') : 'Their share of tax and service'), el('span', '', (extra < 0 ? '−' : '') + rs(Math.abs(extra), true))); ul.append(li); }
    c.append(ul);
    if (!row.isPayer) {
      const acts = el('div', 'acts'); const q = el('button', 'btn small', 'Show QR'); q.type = 'button'; q.onclick = () => showQR(row); acts.append(q); c.append(acts);
    }
    box.append(c);
  }
  const sel = $('payerSel'); const cur = S.payer; sel.textContent = '';
  for (const p of S.people) { const o = el('option', '', p.name); o.value = p.id; sel.append(o); } sel.value = cur;
  const payer = S.people.find(p => p.id === S.payer); const saved = store.get('vpa', {});
  if (document.activeElement !== $('vpa')) $('vpa').value = saved[payer?.name] || '';
  $('vpaBad').hidden = !$('vpa').value || validVpa($('vpa').value);
  const notes = [];
  if (r.dropped) notes.push(`Service charge of ${rs(r.dropped, true)} taken off: ask the restaurant to remove it from the bill before paying.`);
  if (Math.abs(r.roundingDiff) >= 0.01) notes.push(`Friends' shares are rounded to whole rupees; ${payer?.name || 'the payer'} covers the ${rs(Math.abs(r.roundingDiff), true)} difference.`);
  if (r.unassigned.length) notes.push(`${r.unassigned.length} item${r.unassigned.length > 1 ? 's were' : ' was'} shared by everyone because nobody was given ${r.unassigned.length > 1 ? 'them' : 'it'}.`);
  $('roundNote').textContent = notes.join(' ');
}

// ---------------------------------------------------------------- sending
const b64 = o => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = s => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));
const HOME = () => location.origin + location.pathname.replace(/index\.html$/, '');
function payPayload(row) {
  const payer = S.people.find(p => p.id === S.payer);
  const extra = row.tax + row.service + row.other + row.discount + row.roundoff;
  return { v: 1, n: row.name, a: row.pay, to: payer?.name || '', vpa: $('vpa').value.trim(), it: row.items.map(i => [i.name + frac(i.of), Math.round(i.share * 100) / 100]), x: Math.round(extra * 100) / 100, sv: S.dropService ? 0 : 1 };
}
const payUrl = row => HOME() + '#pay=' + b64(payPayload(row));
function splitText() {
  const r = S.result; const payer = S.people.find(p => p.id === S.payer); const lines = [];
  lines.push(`🧾 Bill split · ${rs(r.newTotal, true)}${r.dropped ? ` (service charge ${rs(r.dropped)} taken off)` : ''}`, `Paid by ${payer.name}. Split by what each person had, tax shared fairly.`, '');
  for (const row of r.rows) {
    if (row.isPayer) continue;
    lines.push(`${row.name}: ${rs(row.pay)}` + (validVpa($('vpa').value) ? ` → pay here: ${payUrl(row)}` : ''));
  }
  if (!validVpa($('vpa').value)) lines.push('', `Pay ${payer.name} on UPI.`);
  lines.push('', `Split your next bill free: ${HOME()}`);
  return lines.join('\n');
}
async function send() {
  if (!S.result) return;
  if ($('vpa').value && !validVpa($('vpa').value)) { $('vpaBad').hidden = false; $('vpa').focus(); return; }
  if (!$('vpa').value) { toast(`Add ${S.people.find(p => p.id === S.payer)?.name}'s UPI ID so friends get a pay link`); $('vpa').focus(); return; }
  const text = splitText();
  if (navigator.share) { try { await navigator.share({ text }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  location.href = 'https://wa.me/?text=' + encodeURIComponent(text);
}
function drawQR(text, canvas, scale = 6) {
  const q = window.qrcode(0, 'M'); q.addData(text); q.make(); const n = q.getModuleCount(), m = 4;
  canvas.width = canvas.height = (n + 2 * m) * scale; const g = canvas.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height); g.fillStyle = '#111';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) g.fillRect((c + m) * scale, (r + m) * scale, scale, scale);
}
function showQR(row) {
  const vpa = $('vpa').value.trim(); const payer = S.people.find(p => p.id === S.payer);
  if (!validVpa(vpa)) { toast(`Add ${payer?.name}'s UPI ID first`); $('vpa').focus(); return; }
  const m = el('div', 'modal'); const c = el('div', 'card'); const cv = el('canvas');
  drawQR(upiLink({ vpa, name: payer.name, amount: row.pay, note: 'Bill split' }), cv);
  c.append(el('b', '', `${row.name} pays ${rs(row.pay)}`), el('p', '', `Scan with any UPI app to pay ${payer.name}`), cv, el('p', '', vpa));
  const close = el('button', 'btn', 'Done'); close.type = 'button'; close.style.marginTop = '10px'; close.style.width = '100%'; close.onclick = () => m.remove(); c.append(close);
  m.append(c); m.onclick = e => { if (e.target === m) m.remove(); }; document.body.append(m);
}

// ---------------------------------------------------------------- the page a friend opens from their link
function payPage(data) {
  show('pay'); $('dock').hidden = true; $('limits').hidden = true;
  const p = $('pay'); p.textContent = '';
  const link = validVpa(data.vpa) ? upiLink({ vpa: data.vpa, name: data.to, amount: data.a, note: 'Bill split' }) : null;
  p.append(el('h1', '', `Hi ${data.n}, your share`));
  const amt = el('div', 'amt', rs(data.a)); p.append(amt, el('p', 'sub', `to ${data.to}, who paid the bill`));
  const card = el('div', 'card'); const ul = el('ul');
  for (const [n, v] of data.it || []) { const li = el('li'); li.append(el('span', '', n), el('span', '', rs(v, true))); ul.append(li); }
  if (data.x) { const li = el('li'); li.append(el('span', '', data.sv ? 'Tax and service' : 'Tax'), el('span', '', (data.x < 0 ? '−' : '') + rs(Math.abs(data.x), true))); ul.append(li); }
  card.append(el('b', '', 'What you had'), ul); p.append(card);
  if (link) {
    const a = el('a', 'big', `Pay ${rs(data.a)} on UPI`); a.href = link; a.style.marginTop = '16px'; a.style.textDecoration = 'none'; p.append(a);
    const qc = el('div', 'card'); const q = el('div', 'qr'); const cv = el('canvas'); drawQR(link, cv); q.append(cv);
    const id = el('p', 'note', ''); id.append('Or scan this from another phone, or pay '); id.append(el('b', '', data.vpa)); const cp = el('button', 'btn small', 'Copy UPI ID'); cp.type = 'button'; cp.style.margin = '8px auto 0';
    cp.onclick = () => navigator.clipboard?.writeText(data.vpa).then(() => toast('UPI ID copied'));
    qc.append(q, id, cp); p.append(qc);
  }
  const home = el('a', 'btn', 'Split your next bill free →'); home.href = HOME(); home.style.marginTop = '16px'; home.style.textDecoration = 'none'; p.append(home);
}

// ---------------------------------------------------------------- wiring
$('cam').onchange = e => { S.sample = false; const f = e.target.files[0]; e.target.value = ''; if (f) fromPhoto(f); };
$('pick').onchange = e => { S.sample = false; const f = e.target.files[0]; e.target.value = ''; if (f) fromPhoto(f); };
$('scanBtn').addEventListener('pointerdown', warmUp, { once: true });
$('typeBtn').onclick = () => { $('typed').hidden = !$('typed').hidden; if (!$('typed').hidden) $('typedText').focus(); };
$('typedGo').onclick = () => { S.sample = false; useText($('typedText').value); };
$('sampleBtn').onclick = async () => { S.sample = true; const b = await (await fetch('sample-bill.jpg')).blob(); fromPhoto(new File([b], 'sample-bill.jpg', { type: 'image/jpeg' })); };
$('addForm').onsubmit = e => { e.preventDefault(); const p = addPerson($('addName').value); if (p) { S.active = p.id; if (S.people.length === 1) store.set('me', p.name); } $('addName').value = ''; render(); };
$('editBtn').onclick = () => { S.editing = !S.editing; S.showResult = false; render(); };
$('addItemBtn').onclick = () => { S.items.push({ id: nid('i'), name: 'New item', qty: 1, amount: 0, who: [] }); render(); };
$('restartBtn').onclick = () => { S.items = []; S.charges = []; S.result = null; S.showResult = false; S.editing = false; show('start'); render(); window.scrollTo({ top: 0 }); };
$('svcKeep').onclick = () => { S.dropService = false; render(); };
$('svcDrop').onclick = () => { S.dropService = true; render(); };
$('splitBtn').onclick = () => { if (S.people.length < 2) return; S.showResult = true; render(); if (!S.demo) $('result').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
$('payerSel').onchange = () => { S.payer = $('payerSel').value; render(); };
$('vpa').oninput = () => { const v = $('vpa').value.trim(); const payer = S.people.find(p => p.id === S.payer); $('vpaBad').hidden = !v || validVpa(v); if (payer && validVpa(v)) { const m = store.get('vpa', {}); m[payer.name] = v; store.set('vpa', m); } };
$('sendBtn').onclick = send;
$('copyBtn').onclick = () => { if (!S.result) return; navigator.clipboard?.writeText(splitText()).then(() => toast('Copied. Paste it in your group.')); };

// the name bar steps aside once the shares are on screen
const watchResult = () => { const v = !$('result').hidden && $('result').getBoundingClientRect().top < innerHeight * 0.6; if (v !== resultInView) { resultInView = v; renderDock(); } };
addEventListener('scroll', watchResult, { passive: true }); addEventListener('resize', watchResult);
addEventListener('hashchange', () => { if (/^#pay=/.test(location.hash) || $('pay').hidden === false) location.reload(); });
const Q = new URLSearchParams(location.search);
const pay = location.hash.match(/^#pay=([\w-]+)/);
if (pay) { try { payPage(unb64(pay[1])); } catch { show('start'); toast('That pay link is broken. Ask for a new one.'); } }
window.BS = { S, render, useText, addPerson, compute, split, parseBill, payPage, payUrl, showQR, drawQR, upiLink, $ };
if (Q.has('demo')) import('./demo.js').then(m => m.start(window.BS)).catch(e => console.error(e));
