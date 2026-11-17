// Reads the text of an Indian restaurant bill (from OCR or typed) into items and charges.
// Pure functions, no DOM: used by the app and by test/parse.test.mjs.
//
// Handles the common layouts: "Item  Qty  Price  Amount" columns (Petpooja and most POS printers), "2 x Item  amount"
// (cafe tills), and the item name on one line with "qty rate amount" on the next. Long names that wrap are joined.
// Charges: CGST/SGST/IGST/GST/VAT/cess, service charge (S.C.), discount, round off, packing/delivery; the grand total.

const NUM = /(?:^|[\s:=(])(-|\+)?\s*(?:rs\.?|inr|₹)?\s*(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?=$|[\s)/])/gi;
const PCT = /\(?\s*@?\s*\d+(?:\.\d+)?\s*%\s*\)?/g;

// keyword tests, in the order they're tried (first match wins)
const KINDS = [
  ['subtotal', /\b(sub\s*-?\s*total|gross\s*(amount|amt|total)|food\s*total|item\s*total|basic\s*amount|amount\s*before\s*tax|taxable\s*(value|amount|amt))\b/i],
  ['service', /\b(service\s*(charge|chg|chrg|fee)s?|serv\.?\s*chg|s\s*\.\s*c\s*\.?|s\/c)(?=$|[\s@:(\d%.-])/i],
  ['tax', /\b(c\s*gst|s\s*gst|i\s*gst|ut\s*gst|gst|vat|cess|service\s*tax)\b/i],
  ['discount', /\b(discount|disc\.?|less\s*:|offer|coupon|promo|savings?)\b/i],
  ['roundoff', /\b(round(ed|ing)?\s*-?\s*(off)?|r\s*\/\s*o)\b/i],
  ['other', /\b(packing|packaging|container|delivery|convenience|platform)\s*(charge|charges|fee|chg)?\b/i],
  ['total', /\b(grand\s*total|net\s*(amount|amt|payable|total)|total\s*(amount|amt|payable|due|bill)|bill\s*(amount|total)|amount\s*(payable|due)|to\s*pay|total\s*rs|payable)\b|^\s*total\b/i],
];
const SKIP = /\b(gstin|fssai|cin\b|pan\b|invoice|bill\s*(no|#)|order\s*(no|#|id)|kot|table|tbl|cover|cov\b|cashier|captain|steward|server|waiter|date|dt\b|time|ph(one)?\b|mob|tel\b|email|www|thank|visit|again|paid\s*by|payment|upi|card|cash\b|change\b|tender|total\s*qty|total\s*items|no\.?\s*of\s*items|items?\s*:|qty\s*:|guest|pax|dine\s*in|take\s*away|e\.?\s*&\s*o\.?\s*e)/i;
const HEADER = /\b(item|items|particulars|description|dish|name)\b.*\b(qty|quantity|amt|amount|price|rate|total)\b/i;
const RULE = /^[\s\-=_*.~·•]{4,}$/;

function clean(s) {
  return s.replace(/[|]/g, ' ').replace(/[“”"]/g, '').replace(/\s+/g, ' ')
    .replace(/(\d)[oO](?=\d|\.|\b)/g, '$10').replace(/(\d)[lI](?=\d)/g, '$11').replace(/(\d)\s*\.\s*(\d{2})\b/g, '$1.$2')
    .replace(/(\d),(\d{2}),(\d{3})\b/g, '$1$2$3').replace(/(\d),(\d{3})\b/g, '$1$2').trim();
}
const toNum = s => parseFloat(String(s).replace(/,/g, ''));

// the trailing money-ish numbers on a line, with the text before them
function tail(line) {
  const s = line.replace(PCT, ' ');
  const nums = []; let m; NUM.lastIndex = 0;
  while ((m = NUM.exec(s))) nums.push({ v: toNum(m[2]) * (m[1] === '-' ? -1 : 1), raw: m[0], at: m.index + (m[0].length - m[0].trimStart().length), end: m.index + m[0].length, dec: /\.\d{1,2}$/.test(m[2]), sign: m[1] || '' });
  // keep only the run of numbers at the end of the line (allowing junk tokens of 1-3 chars in between, like a misread qty)
  const out = [];
  for (let i = nums.length - 1; i >= 0; i--) {
    const gap = s.slice(nums[i].end, out.length ? out[0].at : s.length).trim();
    if (gap && !(out.length && gap.length <= 3 && !/[a-z]{2,}/i.test(gap) || out.length && /^[a-z@-]{1,2}$/i.test(gap))) break;
    out.unshift(nums[i]);
  }
  const head = out.length ? s.slice(0, out[0].at).replace(/\s*(rs\.?|inr|₹|x|@)?\s*$/i, '').trim() : s.trim();
  return { head, nums: out };
}

function kindOf(line) {
  for (const [k, re] of KINDS) if (re.test(line)) return k;
  return null;
}

// "Paneer Tikka 1 320.00 320.00" | "2 x Cold Coffee 360" | "Cold Coffee 2 360" | "Cold Coffee 360"
function asItem(line) {
  const t = tail(line); if (!t.nums.length) return null;
  const n = t.nums; const amt = n[n.length - 1]; if (amt.v <= 0 || amt.v > 200000) return null;
  let name = t.head, qty = 1, price = null;
  const lead = name.match(/^(\d{1,2})\s*[xX×*]\s+(.+)$/) || name.match(/^(\d{1,2})\s+(?=[A-Za-z])(.+)$/);
  if (lead) { qty = +lead[1]; name = lead[2]; }
  if (n.length >= 3) {
    const q = n[n.length - 3], p = n[n.length - 2];
    if (Number.isInteger(q.v) && q.v > 0 && q.v <= 99 && Math.abs(q.v * p.v - amt.v) < 0.6) { qty = q.v; price = p.v; }
    else if (Number.isInteger(q.v) && q.v > 0 && q.v <= 99 && Math.abs(q.v * p.v - amt.v) <= 0.02 * amt.v) { qty = q.v; price = amt.v / q.v; }   // a digit of the price misread
    else if (p.v > 0 && Math.abs(Math.round(amt.v / p.v) * p.v - amt.v) < 0.6) { qty = Math.round(amt.v / p.v); price = p.v; }
    else { price = p.v; }
  } else if (n.length === 2) {
    const a = n[0];
    if (Number.isInteger(a.v) && a.v > 0 && a.v <= 99 && !a.dec) {          // qty amount   (or price amount when qty was misread)
      qty = a.v; price = amt.v / a.v;
    } else if (a.v > 0 && Math.abs(Math.round(amt.v / a.v) * a.v - amt.v) < 0.6) { qty = Math.round(amt.v / a.v); price = a.v; }
  }
  name = name.replace(/\s+[^\w\s(]{1,3}$/, '').replace(/\s+(at|a|-|i|l|\|)$/i, '').trim();    // a misread qty stuck on the name
  if (!/[a-z]{2,}/i.test(name)) return { name: '', qty, price, amount: amt.v, numbersOnly: true };
  return { name, qty, price, amount: amt.v };
}

export function parseBill(text) {
  const lines = text.split(/\r?\n/).map(clean).filter(l => l && !RULE.test(l));
  // where the item list starts: after a column header, else after the last header-ish line before the first priced line
  let start = lines.findIndex(l => HEADER.test(l) && !kindOf(l));
  if (start < 0) {
    const firstCharge = lines.findIndex(l => kindOf(l) && tail(l).nums.length);
    const stop = firstCharge < 0 ? lines.length : firstCharge;
    start = -1; for (let i = 0; i < stop; i++) if (SKIP.test(lines[i])) start = i;
  }
  const items = [], charges = []; let subtotal = null, total = null, pending = null, inItems = true;
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i], k = kindOf(l), t = tail(l);
    if (k && (k !== 'total' || !/total\s*qty/i.test(l) || /sub\s*total/i.test(l))) {
      inItems = false; pending = null;
      if (!t.nums.length) continue;
      const v = t.nums[t.nums.length - 1].v;
      if (k === 'subtotal') subtotal = Math.abs(v);
      else if (k === 'total') total = Math.abs(v);
      else charges.push({ kind: k, label: labelOf(l, t), amount: k === 'discount' ? -Math.abs(v) : k === 'roundoff' ? v : Math.abs(v) });
      continue;
    }
    if (!inItems || SKIP.test(l) || HEADER.test(l)) continue;
    const it = asItem(l);
    if (it && it.numbersOnly) {                       // "1 320.00 320.00" under a name-only line
      if (pending) { items.push({ ...it, name: pending, numbersOnly: undefined }); pending = null; }
      continue;
    }
    if (it) { if (pending) { it.name = pending + ' ' + it.name; pending = null; } items.push(it); continue; }
    if (/[a-z]{2,}/i.test(l)) {                       // a name with no numbers: either the next item's name or the tail of the last one
      const next = lines.slice(i + 1).find(x => x);
      const nextIsNumbers = next && (() => { const a = asItem(next); return a && a.numbersOnly; })();
      if (nextIsNumbers) pending = pending ? pending + ' ' + l : l;
      else if (items.length && !pending) items[items.length - 1].name += ' ' + l;
    }
  }
  for (const it of items) { delete it.numbersOnly; it.name = tidy(it.name); it.amount = r2(it.amount); if (it.price != null) it.price = r2(it.price); }
  const itemsSum = r2(items.reduce((a, b) => a + b.amount, 0));
  const fixes = [];
  if (subtotal != null && misread(subtotal, itemsSum)) { fixes.push(`sub total read as ${subtotal}`); subtotal = itemsSum; }
  const sub = subtotal ?? itemsSum;
  const sumCharges = r2(charges.reduce((a, c) => a + c.amount, 0));
  const computed = r2(sub + sumCharges);
  if (total != null && misread(total, computed)) { fixes.push(`total read as ${total}`); total = computed; }
  return {
    items, charges, subtotal: sub, total: total ?? computed, fixes,
    check: { itemsSum, itemsMatch: subtotal == null || Math.abs(itemsSum - subtotal) < 1, totalMatch: total == null || Math.abs(computed - total) < 1.01, hasTotal: total != null, hasSubtotal: subtotal != null },
  };
}

function labelOf(line, t) {
  const pct = (line.match(/\d+(?:\.\d+)?\s*%/) || [''])[0].replace(/\s+/g, '');
  let h = t.head.replace(PCT, ' ').replace(/[:@]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^less\s/i.test(h)) h = h.replace(/^less\s+/i, '');
  return tidy(h, false) + (pct && !h.includes(pct) ? ` ${pct}` : '');
}
function tidy(s, fixCase = true) {
  s = s.replace(/\s+/g, ' ').replace(/^[^\w(]+|[^\w)%]+$/g, '').trim();
  if (!fixCase) return s;
  return s.toLowerCase() === s || s.toUpperCase() === s ? s.toLowerCase().replace(/(^|\s|-)([a-z])/g, (m, a, b) => a + b.toUpperCase()) : s;
}
const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
// OCR often reads a printed 0 as 9 or 8 in the paise ("2978.99" for "2978.00"). If the bill's own arithmetic gives the same rupees
// with round paise, trust the arithmetic. A real rounding difference (2978.50 vs 2979.00) is left alone.
function misread(printed, computed) {
  return printed !== computed && Math.trunc(printed) === Math.trunc(computed) && Math.abs(computed - Math.round(computed)) < 0.005 && Math.abs(printed - computed) < 1;
}
