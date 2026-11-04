// PrintDocs — printable paperwork, opened in a new window ready for the printer (or "Save as PDF").
//   printDeliveryNote(…)   goes with the driver: what's in the delivery, references, signature lines
//   printInvoice(…)        what the café owes for an order: only what it accepted (refused not charged)
//   printLabels([…])       meat / product labels with a QR code to the product's journey (several per A4 sheet)
//   printQrSlip(…)         one QR code on a small slip (e.g. for a bill or a table)
// No extra packages: QR codes are drawn with qrcode.react (already used by the app) and turned into plain SVG.
import { renderToStaticMarkup } from 'react-dom/server';
import { QRCodeSVG } from 'qrcode.react';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const day = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const qty = (n, u) => `${Number(n || 0).toLocaleString('en-GB', { maximumFractionDigits: 3 })}${u ? ` ${u}` : ''}`;
const gbp = (v) => (v === null || v === undefined || isNaN(Number(v)) ? '—' : `£${Number(v).toFixed(2)}`);
const qr = (url, size = 96) => renderToStaticMarkup(<QRCodeSVG value={url} size={size} level="M" includeMargin={false} />);

const BASE_CSS = `
  *{box-sizing:border-box} body{font-family:Manrope,Arial,sans-serif;color:#141414;margin:0;padding:24px;font-size:13px}
  h1{font-size:22px;margin:0 0 4px} h2{font-size:14px;margin:18px 0 6px;color:#2F6B3A;text-transform:uppercase;letter-spacing:.06em}
  .muted{color:#6A6A63} .brand{color:#2F6B3A;font-weight:700} .row{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap}
  table{width:100%;border-collapse:collapse;margin-top:6px} th,td{text-align:left;padding:7px 6px;border-bottom:1px solid #E2E2DB;vertical-align:top}
  th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6A6A63} td.num,th.num{text-align:right}
  .box{border:1px solid #E2E2DB;border-radius:10px;padding:10px 12px} .refs span{display:inline-block;margin:0 6px 4px 0;padding:2px 7px;border:1px solid #E2E2DB;border-radius:6px;font-family:monospace;font-size:12px}
  .total td{font-weight:700;font-size:15px;border-bottom:0} .sign{margin-top:28px;display:flex;gap:28px} .sign div{flex:1;border-top:1px solid #141414;padding-top:4px;font-size:11px;color:#6A6A63}
  .noprint{margin-bottom:16px} .noprint button{background:#2F6B3A;color:#fff;border:0;border-radius:8px;padding:8px 14px;font-weight:700;cursor:pointer}
  @media print{.noprint{display:none} body{padding:0}}
`;

function openPrint(title, body, extraCss = '') {
  const w = window.open('', '_blank');
  if (!w) return false;     // pop-up blocked: the button that called it shows a hint
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
    <meta name="viewport" content="width=device-width,initial-scale=1"><style>${BASE_CSS}${extraCss}</style></head>
    <body><div class="noprint"><button onclick="window.print()">🖨️ Print</button> <span class="muted">or save as PDF from the print window</span></div>${body}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch (_) { /* the button still works */ } }, 400);
  return true;
}

const refsHtml = (r) => {
  const list = [r.orderRef && ['Order', r.orderRef], r.poNumber && ['PO', r.poNumber], r.senderRef && ['Our ref', r.senderRef], r.receiverRef && ['Goods-in', r.receiverRef]].filter(Boolean);
  return list.length ? `<div class="refs">${list.map(([k, v]) => `<span>${esc(k)} ${esc(v)}</span>`).join('')}</div>` : '';
};

/**
 * Delivery note — one per order (all its deliveries) or one delivery.
 * { from, to, order: { orderRef, poNumber, productName, unit, quantity }, deliveries: [{ shipmentId, batchId, quantity, useBy, frozenOn, senderRef, status }], notes, journeyUrl }
 */
export function printDeliveryNote({ from, to, order = {}, deliveries = [], notes, journeyUrl }) {
  const unit = order.unit || '';
  const rows = deliveries.map(d => `<tr><td>#${esc(d.shipmentId)}</td><td>${esc(order.productName)}<div class="muted">batch ${esc(d.batchId)}</div></td>
    <td>${d.useBy ? day(d.useBy) : '—'}${d.frozenOn ? `<div class="muted">❄️ frozen ${day(d.frozenOn)}</div>` : ''}</td><td class="num">${qty(d.quantity, unit)}</td><td class="num">☐</td></tr>`).join('');
  const total = deliveries.reduce((n, d) => n + Number(d.quantity || 0), 0);
  return openPrint(`Delivery note ${order.orderRef || ''}`, `
    <div class="row"><div><p class="brand">🌾 Farm Passport</p><h1>Delivery note</h1><p class="muted">${day(new Date())}</p></div>
      ${journeyUrl ? `<div style="text-align:center">${qr(journeyUrl, 84)}<div class="muted" style="font-size:10px">Scan to check it</div></div>` : ''}</div>
    ${refsHtml({ orderRef: order.orderRef, poNumber: order.poNumber, senderRef: deliveries.find(d => d.senderRef)?.senderRef })}
    <div class="row" style="margin-top:12px"><div class="box" style="flex:1"><b>From</b><br>${esc(from)}</div><div class="box" style="flex:1"><b>To</b><br>${esc(to)}</div></div>
    <h2>What's in this delivery</h2>
    <table><thead><tr><th>Delivery</th><th>Product</th><th>Use by</th><th class="num">Quantity</th><th class="num">Checked</th></tr></thead>
      <tbody>${rows}<tr class="total"><td colspan="3">Total</td><td class="num">${qty(total, unit)}</td><td></td></tr></tbody></table>
    ${notes ? `<p style="margin-top:10px"><b>Notes:</b> ${esc(notes)}</p>` : ''}
    <p class="muted" style="margin-top:10px">Confirm what arrived in Farm Passport (Deliveries → All arrived, or Something wrong?). Refused goods go back with the driver.</p>
    <div class="sign"><div>Delivered by (name &amp; signature)</div><div>Received by (name &amp; signature)</div><div>Date &amp; time</div></div>`);
}

/**
 * Invoice — what the café owes for an order: only what it accepted, plus delivery unless it refused everything.
 * { seller, buyer, order: { orderRef, poNumber, productName, unit, owed, total, paymentStatus }, deliveries: [{ shipmentId, quantity, received, refused, missing, missingResolution, unitPrice, deliveryFee, owed, status, senderRef }] }
 */
export function printInvoice({ seller, buyer, order = {}, deliveries = [] }) {
  const unit = order.unit || '';
  const lines = [];
  for (const d of deliveries.filter(x => x.status && x.status !== 'cancelled')) {
    const accepted = d.status === 'delivered' ? Number(d.received || 0) : Number(d.quantity || 0);
    const charged = accepted + (d.missingResolution === 'charged' ? Number(d.missing || 0) : 0);
    lines.push(`<tr><td>${esc(order.productName)} <span class="muted">(delivery #${esc(d.shipmentId)}${d.status !== 'delivered' ? ', not yet confirmed' : ''})</span>
      ${d.refused > 0 ? `<div class="muted">${qty(d.refused, unit)} refused at the door: not charged</div>` : ''}
      ${d.missing > 0 ? `<div class="muted">${qty(d.missing, unit)} didn't arrive: ${d.missingResolution === 'charged' ? 'charged, as agreed' : d.missingResolution === 'waived' ? 'not charged' : 'to be agreed'}</div>` : ''}</td>
      <td class="num">${qty(charged, unit)}</td><td class="num">${gbp(d.unitPrice)}</td><td class="num">${d.unitPrice != null ? gbp(charged * d.unitPrice) : '—'}</td></tr>`);
    const fee = Number(d.deliveryFee || 0);
    if (fee > 0) lines.push(`<tr><td>Delivery${accepted > 0 || d.status !== 'delivered' ? '' : ' (everything refused: not charged)'}</td><td></td><td></td><td class="num">${accepted > 0 || d.status !== 'delivered' ? gbp(fee) : gbp(0)}</td></tr>`);
  }
  const amount = order.owed ?? order.total;
  return openPrint(`Invoice ${order.orderRef || ''}`, `
    <div class="row"><div><p class="brand">🌾 Farm Passport</p><h1>Invoice</h1><p class="muted">${day(new Date())}</p></div>
      <div class="box" style="min-width:200px"><b>Amount due</b><div style="font-size:24px;font-weight:800">${gbp(amount)}</div>
      <div class="muted">${order.paymentStatus === 'paid' ? '✅ Paid — thank you' : 'Pay the farm directly'}</div></div></div>
    ${refsHtml({ orderRef: order.orderRef, poNumber: order.poNumber, senderRef: deliveries.find(d => d.senderRef)?.senderRef })}
    <div class="row" style="margin-top:12px"><div class="box" style="flex:1"><b>From</b><br>${esc(seller)}</div><div class="box" style="flex:1"><b>To</b><br>${esc(buyer)}</div></div>
    <h2>Charges</h2>
    <table><thead><tr><th>Item</th><th class="num">Quantity</th><th class="num">Price</th><th class="num">Amount</th></tr></thead>
      <tbody>${lines.join('')}<tr class="total"><td colspan="3">Total due</td><td class="num">${gbp(amount)}</td></tr></tbody></table>
    <p class="muted" style="margin-top:14px">You only pay for what you accepted. The agreed prices are fingerprinted on the blockchain with each delivery, so both sides can check them in Farm Passport (Verify).</p>`);
}

/**
 * Labels — several per A4 sheet. Each: [{ productName, quantity, unit, useBy, frozenOn, batchId, farmName, animalRef, killNumber,
 *   slaughteredAt, cutAt, approvalNumber, allergens:[], pieces, url }]
 */
export function printLabels(items) {
  const cards = items.map(i => `<div class="label">
    <div class="lt"><div>
      <div class="pn">${esc(i.productName)}</div>
      <div class="w">${qty(i.quantity, i.unit)}${i.pieces ? ` · ${i.pieces} pieces` : ''}</div>
      ${i.farmName ? `<div>From <b>${esc(i.farmName)}</b></div>` : ''}
    </div><div class="qr">${qr(i.url, 78)}</div></div>
    <div class="small">
      ${i.useBy ? `<div><b>Use by:</b> ${day(i.useBy)}</div>` : ''}
      ${i.frozenOn ? `<div><b>Frozen on:</b> ${day(i.frozenOn)} · keep frozen −18°C · once defrosted use within 24 h, do not refreeze</div>` : ''}
      ${i.allergens?.length ? `<div><b>Allergens:</b> ${i.allergens.map(a => `<b>${esc(a)}</b>`).join(', ')}</div>` : ''}
      ${i.slaughteredAt ? `<div>Slaughtered in: ${esc(i.slaughteredAt)}</div>` : ''}
      ${i.cutAt ? `<div>Cut in: ${esc(i.cutAt)}</div>` : ''}
      <div>Ref: ${esc([i.killNumber && `kill ${i.killNumber}`, i.animalRef, i.batchId].filter(Boolean).join(' · '))}</div>
    </div>
    <div class="foot">Scan to see where it came from · Farm Passport</div>
  </div>`).join('');
  return openPrint('Labels', `<div class="sheet">${cards}</div>
    <p class="muted noprint">Check your labels against the beef/lamb labelling rules that apply to you before using them on packs for sale.</p>`, `
    .sheet{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
    .label{border:1px dashed #9a9a92;border-radius:10px;padding:10px;break-inside:avoid;page-break-inside:avoid;min-height:180px;display:flex;flex-direction:column;gap:6px}
    .lt{display:flex;justify-content:space-between;gap:8px} .pn{font-size:17px;font-weight:800} .w{font-size:15px;font-weight:700}
    .small{font-size:11px;line-height:1.35} .foot{margin-top:auto;font-size:10px;color:#6A6A63} .qr svg{display:block}
    @media print{.label{border-color:#bbb}}`);
}

/** One QR code on a small slip: { title, subtitle, url } */
export function printQrSlip({ title, subtitle, url }) {
  return openPrint(title || 'QR code', `<div style="width:72mm;margin:0 auto;text-align:center">
    <p class="brand">🌾 Farm Passport</p><div style="font-weight:800;font-size:16px">${esc(title || '')}</div>
    <div style="margin:10px 0">${qr(url, 200)}</div>
    <div class="muted">${esc(subtitle || 'Scan with your phone camera to see where your food came from')}</div></div>`);
}