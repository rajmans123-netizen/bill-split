// node test/parse.test.mjs : the bill reader on OCR text of rendered bill photos (tesseract --psm 6, like the app) + typed bills.
import { readFileSync, readdirSync } from 'node:fs';
import { parseBill } from '../parse.js';
const DIR = new URL('./bills/', import.meta.url);
let fails = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.log('  FAIL', msg); } };
const near = (a, b, tol = 0.6) => Math.abs(a - b) <= tol;

for (const f of readdirSync(DIR).filter(f => f.endsWith('.txt'))) {
  const name = f.replace('.txt', ''); const exp = JSON.parse(readFileSync(new URL(name + '.json', DIR)));
  const r = parseBill(readFileSync(new URL(f, DIR), 'utf8'));
  console.log(`${name}: ${r.items.length} items, sub ${r.subtotal}, total ${r.total}, charges ${r.charges.map(c => c.kind + ' ' + c.amount).join(', ')}`);
  ok(r.items.length === exp.items.length, `${name} item count ${r.items.length} vs ${exp.items.length}: ${r.items.map(i => i.name + '=' + i.amount).join(' | ')}`);
  exp.items.forEach((e, i) => {
    const g = r.items[i]; if (!g) return;
    ok(near(g.amount, e.amount), `${name} item ${i} amount ${g.amount} vs ${e.amount}`);
    ok(g.qty === e.qty, `${name} item ${i} "${g.name}" qty ${g.qty} vs ${e.qty}`);
    ok(g.name.toLowerCase().replace(/\W/g, '') === e.name.toLowerCase().replace(/\W/g, ''), `${name} item ${i} name "${g.name}" vs "${e.name}"`);
  });
  const sum = k => r.charges.filter(c => c.kind === k).reduce((a, c) => a + c.amount, 0);
  ok(near(r.subtotal, exp.subtotal), `${name} subtotal ${r.subtotal} vs ${exp.subtotal}`);
  ok(near(sum('tax'), exp.tax, 0.05), `${name} tax ${sum('tax')} vs ${exp.tax}`);
  ok(near(sum('service'), exp.service, 0.05), `${name} service ${sum('service')} vs ${exp.service}`);
  ok(near(-sum('discount'), exp.discount, 0.05), `${name} discount ${sum('discount')} vs ${exp.discount}`);
  ok(near(r.total, exp.total, 0.05), `${name} total ${r.total} vs ${exp.total}`);
  ok(r.check.itemsMatch && r.check.totalMatch, `${name} check ${JSON.stringify(r.check)}`);
}

// typed / odd layouts
const typed = [
  ['typed simple', 'Cold coffee 180\nFries 220\nPizza 420\nGST 5% 41\nTotal 861', { items: 3, sub: 820, total: 861, service: 0 }],
  ['service as S/C', 'Dal Tadka 1 240.00 240.00\nNaan 4 50.00 200.00\nSub Total 440.00\nS/C 10% 44.00\nCGST 2.5% 11.00\nSGST 2.5% 11.00\nGrand Total 506.00', { items: 2, sub: 440, total: 506, service: 44 }],
  ['rupee signs + lakh commas', 'Party Platter 1 ₹1,20,000.00 ₹1,20,000.00\nSub Total ₹1,20,000.00\nGST 5% ₹6,000.00\nTotal Amount ₹1,26,000.00', { items: 1, sub: 120000, total: 126000, service: 0 }],
  ['packing + delivery', '2 x Veg Thali 300\n1 x Lassi 80\nItem Total 380\nPacking Charges 20\nDelivery Fee 30\nTo Pay 430', { items: 2, sub: 380, total: 430, service: 0 }],
  ['service charge in brackets', 'Burger 1 250 250\nShake 2 150 300\nSubtotal 550\nService Charge (10%) 55\nTotal 605', { items: 2, sub: 550, total: 605, service: 55 }],
];
for (const [label, txt, e] of typed) {
  const r = parseBill(txt); const svc = r.charges.filter(c => c.kind === 'service').reduce((a, c) => a + c.amount, 0);
  ok(r.items.length === e.items, `${label}: items ${r.items.length} vs ${e.items} (${r.items.map(i => i.name + '=' + i.amount).join(' | ')})`);
  ok(near(r.subtotal, e.sub), `${label}: sub ${r.subtotal} vs ${e.sub}`);
  ok(near(r.total, e.total), `${label}: total ${r.total} vs ${e.total}`);
  ok(near(svc, e.service), `${label}: service ${svc} vs ${e.service}`);
}
const q = parseBill('2 x Cold Coffee 360\nSubtotal 360\nTotal 378');
ok(q.items[0].qty === 2 && q.items[0].name === 'Cold Coffee', `"2 x" item: ${JSON.stringify(q.items[0])}`);
console.log(`${n - fails}/${n} checks passed`); process.exit(fails ? 1 : 0);
