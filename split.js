// Who owes what. Pure functions: used by the app and by test/split.test.mjs.
// Each item's price is split equally between the people who had it (an item nobody was given is shared by everyone).
// Tax, service charge, packing, discount and round off are shared in proportion to what each person ate,
// so the coffee-only friend doesn't pay for the pizza-eater's GST.
const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;

export function split({ items, charges = [], total = null, people, payer = null, dropService = false, roundTo = 1 }) {
  const ids = people.map(p => p.id); if (!ids.length) return null;
  const food = Object.fromEntries(ids.map(id => [id, 0])), mine = Object.fromEntries(ids.map(id => [id, []]));
  const unassigned = [];
  for (const it of items) {
    let who = (it.who || []).filter(id => ids.includes(id));
    if (!who.length) { unassigned.push(it); who = ids; }
    const each = it.amount / who.length;
    for (const id of who) { food[id] += each; mine[id].push({ name: it.name, share: each, of: who.length }); }
  }
  const foodSum = ids.reduce((a, id) => a + food[id], 0);
  const used = charges.filter(c => !(dropService && c.kind === 'service'));
  const dropped = r2(charges.filter(c => dropService && c.kind === 'service').reduce((a, c) => a + c.amount, 0));
  const chargeSum = used.reduce((a, c) => a + c.amount, 0);
  const billTotal = total ?? r2(foodSum + charges.reduce((a, c) => a + c.amount, 0));
  const newTotal = r2(billTotal - dropped);
  // anything the bill total has that items + charges don't explain (an OCR slip, an unprinted round off) is shared like a charge
  const gap = r2(newTotal - (foodSum + chargeSum));
  const weight = id => foodSum > 0 ? food[id] / foodSum : 1 / ids.length;
  const byKind = k => used.filter(c => (Array.isArray(k) ? k : [k]).includes(c.kind)).reduce((a, c) => a + c.amount, 0);
  const rows = ids.map(id => {
    const w = weight(id);
    return { id, name: people.find(p => p.id === id).name, items: mine[id], food: food[id],
      tax: byKind('tax') * w, service: byKind('service') * w, other: byKind('other') * w, discount: byKind('discount') * w, roundoff: (byKind('roundoff') + gap) * w };
  });
  // exact shares in paise that add up to the new total exactly (largest remainder)
  const paise = Math.round(newTotal * 100);
  const raw = rows.map(r => (r.food + r.tax + r.service + r.other + r.discount + r.roundoff) * 100);
  const base = raw.map(Math.floor); let left = paise - base.reduce((a, b) => a + b, 0);
  raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { base[i]++; left--; } else if (left < 0) { base[i]--; left++; } });
  rows.forEach((r, i) => { r.exact = base[i] / 100; });
  // what each person sends the payer: rounded to whole rupees; the payer absorbs the few paise/rupees of rounding
  const step = roundTo * 100; let others = 0;
  for (const r of rows) { if (r.id === payer) continue; r.pay = Math.round(r.exact * 100 / step) * step / 100; others += r.pay; }
  const p = rows.find(r => r.id === payer);
  if (p) { p.pay = r2(newTotal - others); p.isPayer = true; }
  return { rows, unassigned, billTotal, newTotal, dropped, gap, foodSum: r2(foodSum), roundingDiff: p ? r2(p.pay - p.exact) : 0 };
}

// a UPI "pay to" link (opens GPay / PhonePe / Paytm with the amount filled in)
export function upiLink({ vpa, name, amount, note }) {
  const q = new URLSearchParams({ pa: vpa, pn: name || 'Friend', am: amount.toFixed(2), cu: 'INR' });
  if (note) q.set('tn', note.slice(0, 50));
  return 'upi://pay?' + q.toString().replace(/\+/g, '%20');
}
export const validVpa = v => /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$/.test((v || '').trim());
