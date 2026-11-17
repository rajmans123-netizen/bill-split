// node test/split.test.mjs : the split maths.
import { split, upiLink, validVpa } from '../split.js';
let fails = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.log('  FAIL', msg); } };
const P = ['Raj', 'Ananya', 'Kunal', 'Farhan'].map((name, i) => ({ id: 'p' + i, name }));
const sum = (rows, k) => Math.round(rows.reduce((a, r) => a + r[k], 0) * 100) / 100;

// the sample cafe bill: 2590 food, 129.50 GST, 259 service, -0.50 round off = 2978
const items = [
  { name: 'Cold Coffee', amount: 360, who: ['p0', 'p1'] }, { name: 'Masala Chai', amount: 60, who: ['p2'] }, { name: 'Peri Peri Fries', amount: 220, who: ['p0', 'p1', 'p2', 'p3'] },
  { name: 'Paneer Tikka Pizza', amount: 420, who: ['p1', 'p3'] }, { name: 'Virgin Mojito', amount: 380, who: ['p2', 'p3'] }, { name: 'Chicken Burger', amount: 290, who: ['p0'] },
  { name: 'Nachos', amount: 260, who: ['p0', 'p1', 'p2', 'p3'] }, { name: 'Pasta Alfredo', amount: 360, who: ['p3'] }, { name: 'Brownie', amount: 240, who: ['p1'] }];
const charges = [{ kind: 'tax', amount: 64.75 }, { kind: 'tax', amount: 64.75 }, { kind: 'service', amount: 259 }, { kind: 'roundoff', amount: -0.5 }];
const s = split({ items, charges, total: 2978, people: P, payer: 'p0' });
ok(sum(s.rows, 'exact') === 2978, `exact shares add up: ${sum(s.rows, 'exact')}`);
ok(sum(s.rows, 'pay') === 2978, `payments add up: ${sum(s.rows, 'pay')}`);
ok(s.rows.filter(r => !r.isPayer).every(r => Number.isInteger(r.pay)), 'friends pay whole rupees');
ok(Math.abs(s.rows[0].food - (180 + 55 + 290 + 65)) < 1e-9, `Raj's food ${s.rows[0].food}`);
const zoya = s.rows[3]; ok(Math.abs(zoya.tax - 129.5 * zoya.food / 2590) < 1e-9, 'tax in proportion to food');
console.log('with service:', s.rows.map(r => `${r.name} ${r.exact} → ${r.pay}`).join(', '));

const d = split({ items, charges, total: 2978, people: P, payer: 'p0', dropService: true });
ok(d.newTotal === 2719 && d.dropped === 259, `service dropped: ${d.newTotal}, ${d.dropped}`);
ok(sum(d.rows, 'exact') === 2719, `exact without service: ${sum(d.rows, 'exact')}`);
console.log('without service:', d.rows.map(r => `${r.name} ${r.exact} → ${r.pay}`).join(', '));

// everyone shares everything -> equal split
const eq = split({ items: [{ name: 'Thali', amount: 1000 }], charges: [{ kind: 'tax', amount: 50 }], total: 1050, people: P.slice(0, 3), payer: 'p1' });
ok(eq.unassigned.length === 1, 'unassigned item flagged');
ok(eq.rows.every(r => Math.abs(r.exact - 350) < 0.011), `equal split: ${eq.rows.map(r => r.exact)}`);
ok(sum(eq.rows, 'pay') === 1050, 'equal split pays the bill');

// paise rounding: 100 / 3
const t = split({ items: [{ name: 'A', amount: 100 }], total: 100, people: P.slice(0, 3), payer: 'p2' });
ok(sum(t.rows, 'exact') === 100 && t.rows.map(r => r.exact).sort().join() === '33.33,33.33,33.34', `100/3: ${t.rows.map(r => r.exact)}`);

// discount shared in proportion, and a total the items can't explain is shared too
const g = split({ items: [{ name: 'A', amount: 300, who: ['p0'] }, { name: 'B', amount: 100, who: ['p1'] }], charges: [{ kind: 'discount', amount: -40 }], total: 361, people: P.slice(0, 2), payer: 'p0' });
ok(Math.abs(g.rows[1].discount + 10) < 1e-9, `discount share ${g.rows[1].discount}`);
ok(g.gap === 1 && sum(g.rows, 'exact') === 361, `gap ${g.gap}, total ${sum(g.rows, 'exact')}`);

ok(upiLink({ vpa: 'raj@okaxis', name: 'Raj Sharma', amount: 713, note: 'Cafe bill' }) === 'upi://pay?pa=raj%40okaxis&pn=Raj%20Sharma&am=713.00&cu=INR&tn=Cafe%20bill', upiLink({ vpa: 'raj@okaxis', name: 'Raj Sharma', amount: 713, note: 'Cafe bill' }));
ok(validVpa('raj.s-1@okhdfcbank') && validVpa('9876543210@ybl') && !validVpa('raj') && !validVpa('raj@') && !validVpa('@ybl'), 'vpa check');
console.log(`${n - fails}/${n} checks passed`); process.exit(fails ? 1 : 0);
