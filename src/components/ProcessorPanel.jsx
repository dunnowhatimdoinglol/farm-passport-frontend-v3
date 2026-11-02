// ProcessorPanel — for approved abattoirs / cutting plants, on the Supply Chain page.
//   1. Animals coming in (with their Food Chain Information) → confirm they arrived
//   2. Kill sheet: upload the day's kill sheet (CSV) → one carcass per row, recorded on-chain
//   3. Carcasses & cuts here → cut them into products (weights checked on-chain), send them on, recall
// Everything is sent by Farm Passport (no gas needed); the processor signs in once with its wallet.
import { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE, EXPLORER, formatQty, metaMaskSign, walletSignIn, walletError } from './walletHelpers';

const TEMPLATE = [
  'animal,head,kill_number,kill_date,cold_weight_kg,category,conformation,fat_class,status,notes',
  'UK 123456 700123,1,K101,2026-11-01,312.4,C,R,3,passed,',
  'UK 0123456,8,K102-K109,2026-11-01,168.5,,,,passed,8 lambs',
  'UK 0123456,1,K110,2026-11-01,,,,,condemned,Abscess',
].join('\n');

// Common cuts, to fill the cutting form quickly (any name can be typed)
const CUTS = {
  Cattle: ['Sirloin steak', 'Ribeye steak', 'Fillet steak', 'Rump steak', 'Topside', 'Silverside', 'Brisket', 'Chuck / braising', 'Diced beef', 'Beef mince', 'Short ribs', 'Bones'],
  Sheep: ['Leg of lamb', 'Lamb shoulder', 'Lamb chops', 'Rack of lamb', 'Lamb shanks', 'Diced lamb', 'Lamb mince'],
  Pig: ['Pork loin', 'Pork chops', 'Pork belly', 'Pork shoulder', 'Gammon', 'Pork mince', 'Sausages'],
  Goat: ['Goat leg', 'Goat shoulder', 'Diced goat', 'Goat mince'],
};

// Very small CSV reader (handles quoted fields and commas inside quotes)
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(v => v.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some(v => v.trim() !== '')) rows.push(row);
  return rows;
}

// Kill sheet columns can be named a few different ways
const COLS = {
  animal: ['animal', 'ear_tag', 'eartag', 'tag', 'flock_mark', 'herd_mark', 'batch_id', 'id'],
  head: ['head', 'count', 'number', 'qty'],
  killNumber: ['kill_number', 'kill_no', 'killno', 'kill', 'slaughter_number'],
  killDate: ['kill_date', 'date', 'slaughter_date'],
  coldWeightKg: ['cold_weight_kg', 'cold_weight', 'weight_kg', 'weight', 'carcass_weight', 'cwt'],
  category: ['category', 'cat'],
  conformation: ['conformation', 'conf'],
  fatClass: ['fat_class', 'fat'],
  status: ['status', 'result', 'inspection'],
  notes: ['notes', 'note', 'comments'],
};
function rowsFromCsv(text) {
  const all = parseCsv(text);
  if (all.length < 2) return { error: 'The kill sheet needs a header row and at least one animal' };
  const header = all[0].map(h => h.trim().toLowerCase().replace(/[\s.-]+/g, '_'));
  const idx = {};
  for (const [k, names] of Object.entries(COLS)) idx[k] = header.findIndex(h => names.includes(h));
  if (idx.animal < 0 || idx.killNumber < 0) return { error: 'Columns needed: animal (ear tag / flock mark) and kill_number' };
  return {
    rows: all.slice(1).map(r => {
      const o = {};
      for (const k of Object.keys(COLS)) o[k] = idx[k] >= 0 ? (r[idx[k]] || '').trim() : '';
      o.head = o.head ? Number(o.head) : 1;
      return o;
    })
  };
}

const today = () => new Date().toISOString().slice(0, 10);

export default function ProcessorPanel({ account, participants }) {
  const [token, setToken] = useState(() => {
    try { const t = JSON.parse(sessionStorage.getItem('fp_processor') || 'null'); return t?.account === account ? t.token : null; } catch { return null; }
  });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(null);
  const auth = { headers: { Authorization: `Bearer ${token}` } };

  const load = async () => {
    try {
      const r = await axios.get(`${API_BASE}/processor/overview`, auth);
      setData(r.data);
    } catch (err) {
      if (err.response?.status === 403 || err.response?.status === 401) { setToken(null); try { sessionStorage.removeItem('fp_processor'); } catch { /* */ } }
      setError(err.response?.data?.error || 'Could not load');
    }
  };
  useEffect(() => { if (token) load(); }, [token]);

  const signIn = async () => {
    setError(null);
    try {
      const r = await walletSignIn(account, (m) => metaMaskSign(account, m), '/processor/auth');
      setToken(r.token);
      try { sessionStorage.setItem('fp_processor', JSON.stringify({ account, token: r.token })); } catch { /* */ }
    } catch (err) {
      setError(walletError(err));
    }
  };

  const post = async (key, path, body, okMsg) => {
    setBusy(key); setError(null); setMessage(null);
    try {
      const r = await axios.post(`${API_BASE}${path}`, body, auth);
      if (okMsg) setMessage(typeof okMsg === 'function' ? okMsg(r.data) : okMsg);
      await load();
      return r.data;
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
      return null;
    } finally {
      setBusy(null);
    }
  };

  if (!token) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6 border-2 border-red-200">
        <h3 className="text-lg font-bold text-gray-800">🔪 Abattoir & processing</h3>
        <p className="text-sm text-gray-600 mt-1 mb-3">This wallet is an approved slaughterhouse / processor. Sign in to record kill sheets and cutting — it's free, Farm Passport pays the gas.</p>
        <button onClick={signIn} className="bg-red-700 text-white font-bold px-4 py-2 rounded-lg hover:bg-red-800">🦊 Sign in as processor</button>
        {error && <p className="text-sm text-red-600 mt-2">⚠️ {error}</p>}
      </div>
    );
  }
  if (!data) return <div className="bg-white rounded-lg shadow-lg p-6">⏳ Loading…{error && <p className="text-red-600 text-sm">⚠️ {error}</p>}</div>;

  return (
    <div className="space-y-6">
      <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
        <p className="font-bold text-red-900">🔪 {data.me.name} · approval no. {data.me.approvalNumber}</p>
        <p className="text-xs text-red-800">Animals in → kill sheet → carcasses → cutting → send out. Every step is on the blockchain.</p>
      </div>
      {error && <div className="bg-red-50 border border-red-300 rounded-lg p-3 text-red-700 text-sm font-semibold">⚠️ {error}</div>}
      {message && <div className="bg-green-50 border border-green-300 rounded-lg p-3 text-green-700 text-sm font-semibold">✅ {message}</div>}

      <AnimalsIn data={data} auth={auth} busy={busy} post={post} />
      <KillSheet post={post} busy={busy} waiting={data.animalsHere} />
      <MadeHere data={data} post={post} busy={busy} participants={participants} />
    </div>
  );
}

// ── 1. Animals arriving / waiting ──
function AnimalsIn({ data, auth, busy, post }) {
  const [fciOpen, setFciOpen] = useState(null);
  const [fci, setFci] = useState(null);
  const [qty, setQty] = useState({});

  const viewFci = async (id) => {
    if (fciOpen === id) { setFciOpen(null); return; }
    setFciOpen(id); setFci(null);
    try { setFci((await axios.get(`${API_BASE}/fci/${id}`, auth)).data); }
    catch (err) { setFci({ error: err.response?.data?.error || 'Could not load' }); }
  };

  const FciBadge = ({ s }) => (
    <span className="text-xs">
      {s.fci?.provided
        ? <button onClick={() => viewFci(s.shipmentId)} className="text-green-700 font-semibold hover:underline">📋 FCI received{s.fci.hasFile ? ' + form' : ''} — view</button>
        : <span className="text-red-700 font-semibold">⚠️ No Food Chain Information yet — the OV can't allow slaughter without it</span>}
    </span>
  );
  const FciView = ({ id }) => fciOpen === id && (
    <div className="mt-2 bg-white border border-gray-200 rounded p-2 text-xs space-y-1">
      {!fci ? 'Loading…' : fci.error ? <span className="text-red-600">{fci.error}</span> : (
        <>
          {Object.entries(fci.questions).map(([k, q]) => <p key={k}>{fci.answers[k] ? '✅' : '❌'} {q}</p>)}
          {fci.answers.notes && <p className="italic">Notes: {fci.answers.notes}</p>}
          {fci.fileUrl && <a href={fci.fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Open the attached form ↗</a>}
          <p className={fci.matchesBlockchain ? 'text-green-700' : 'text-red-600'}>
            {fci.matchesBlockchain ? '🔏 Matches the fingerprint on the blockchain' : '⚠️ Does NOT match the blockchain fingerprint'} · sent {new Date(fci.providedAt).toLocaleString('en-GB')}
          </p>
        </>
      )}
    </div>
  );

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h3 className="text-lg font-bold text-gray-800 mb-1">1. Animals in</h3>
      <p className="text-sm text-gray-500 mb-3">Confirm animals when they arrive in lairage. Check their Food Chain Information.</p>
      {data.animalsComing.length === 0 && data.animalsHere.length === 0 && <p className="text-sm text-gray-500">No animals on the way or waiting.</p>}
      <div className="space-y-3">
        {data.animalsComing.map(s => (
          <div key={s.shipmentId} className="border-2 border-blue-200 bg-blue-50 rounded-lg p-3">
            <p className="font-semibold text-gray-800">{formatQty(s.quantitySent, 'head')} {s.productName} from {s.fromName}</p>
            <p className="text-xs text-gray-600">{s.species} · <span className="font-mono">{s.animalRef}</span> · delivery #{s.shipmentId}{s.dispatchNotes ? ` · "${s.dispatchNotes}"` : ''}</p>
            <FciBadge s={s} /><FciView id={s.shipmentId} />
            <div className="flex gap-2 mt-2 items-center flex-wrap">
              <span className="text-sm text-gray-600">Arrived:</span>
              <input type="number" min="0" step="1" max={s.quantitySent} value={qty[s.shipmentId] ?? s.quantitySent}
                onChange={(e) => setQty({ ...qty, [s.shipmentId]: e.target.value })} className="w-20 px-2 py-1 border border-gray-300 rounded text-sm" />
              <span className="text-sm text-gray-500">head</span>
              <button disabled={busy !== null} onClick={() => post(`r${s.shipmentId}`, `/processor/shipments/${s.shipmentId}/receive`,
                { quantityReceived: Number(qty[s.shipmentId] ?? s.quantitySent) }, 'Arrival recorded')}
                className="bg-green-600 text-white text-sm font-semibold px-3 py-1.5 rounded hover:bg-green-700 disabled:bg-gray-400">
                {busy === `r${s.shipmentId}` ? '⛓️ Recording…' : '✅ Confirm arrived'}
              </button>
            </div>
          </div>
        ))}
        {data.animalsHere.map(s => (
          <div key={s.shipmentId} className="border border-gray-200 rounded-lg p-3">
            <p className="font-semibold text-gray-800">{formatQty(s.available, 'head')} {s.productName} in lairage <span className="text-gray-500 font-normal">from {s.fromName}</span></p>
            <p className="text-xs text-gray-600">{s.species} · <span className="font-mono">{s.animalRef}</span> · arrived {new Date(s.deliveredAt).toLocaleDateString('en-GB')}</p>
            <FciBadge s={s} /><FciView id={s.shipmentId} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 2. Kill sheet upload ──
function KillSheet({ post, busy, waiting }) {
  const [text, setText] = useState('');
  const [rows, setRows] = useState(null);
  const [parseErr, setParseErr] = useState(null);
  const [results, setResults] = useState(null);

  const read = (t) => {
    setText(t); setResults(null);
    if (!t.trim()) { setRows(null); setParseErr(null); return; }
    const r = rowsFromCsv(t);
    setParseErr(r.error || null);
    setRows(r.rows || null);
  };
  const onFile = (f) => { if (!f) return; const fr = new FileReader(); fr.onload = () => read(String(fr.result)); fr.readAsText(f); };
  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' }));
    a.download = 'kill-sheet-template.csv'; a.click();
  };
  const submit = async () => {
    const r = await post('kill', '/processor/kill-sheet', { rows }, (d) => `Kill sheet recorded: ${d.done} done${d.failed ? `, ${d.failed} need fixing` : ''}`);
    if (r) { setResults(r.results); if (!r.failed) { setText(''); setRows(null); } }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h3 className="text-lg font-bold text-gray-800 mb-1">2. Kill sheet</h3>
      <p className="text-sm text-gray-500 mb-3">
        At the end of the kill, upload the day's kill sheet as a CSV (export it from your system, or fill in the template).
        One row per animal for cattle; one row per batch for lambs and pigs. Carcasses that fail inspection: status <code>condemned</code>.
      </p>
      {waiting.length > 0 && (
        <p className="text-xs text-gray-600 mb-2">
          Waiting: {waiting.map(s => `${s.animalRef} (${s.available} head)`).join(' · ')}
        </p>
      )}
      <div className="flex gap-2 flex-wrap mb-2">
        <label className="bg-gray-700 text-white text-sm font-semibold px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-800">
          📄 Upload CSV <input type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <button onClick={download} className="text-sm border border-gray-300 px-3 py-2 rounded-lg hover:bg-gray-50">⬇️ Template</button>
      </div>
      <textarea value={text} onChange={(e) => read(e.target.value)} rows={4} placeholder="…or paste the CSV here"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono" />
      {parseErr && <p className="text-sm text-red-600">⚠️ {parseErr}</p>}
      {rows && (
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-gray-500 border-b">
              <th className="py-1 pr-2">#</th><th className="pr-2">Animal</th><th className="pr-2">Head</th><th className="pr-2">Kill no.</th>
              <th className="pr-2">Date</th><th className="pr-2">Cold kg</th><th className="pr-2">Grade</th><th className="pr-2">Status</th><th>Result</th>
            </tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const res = results?.find(x => x.line === i + 1);
                return (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-1 pr-2 text-gray-400">{i + 1}</td>
                    <td className="pr-2 font-mono">{r.animal}</td><td className="pr-2">{r.head}</td><td className="pr-2">{r.killNumber}</td>
                    <td className="pr-2">{r.killDate || today()}</td><td className="pr-2">{r.coldWeightKg}</td>
                    <td className="pr-2">{[r.category, `${r.conformation}${r.fatClass}`].filter(Boolean).join(' ')}</td>
                    <td className="pr-2">{r.status || 'passed'}</td>
                    <td className={res ? (res.ok ? 'text-green-700' : 'text-red-600 font-semibold') : 'text-gray-400'}>
                      {!res ? '—' : res.ok ? (res.skipped ? 'already recorded' : res.condemned ? 'written off' : `✓ ${res.productName}`) : res.error}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button onClick={submit} disabled={busy !== null || rows.length === 0}
            className="mt-3 bg-red-700 text-white font-semibold px-4 py-2 rounded-lg hover:bg-red-800 disabled:bg-gray-400">
            {busy === 'kill' ? `⛓️ Recording ${rows.length} rows…` : `Record ${rows.length} row${rows.length === 1 ? '' : 's'} on-chain`}
          </button>
          <p className="text-xs text-gray-400 mt-1">Rows already recorded (same kill number) are skipped, so it's safe to upload again after fixing a row.</p>
        </div>
      )}
    </div>
  );
}

// ── 3. Carcasses and cuts here: cut, send, recall ──
function MadeHere({ data, post, busy, participants }) {
  const [cutFrom, setCutFrom] = useState(null);     // batch being cut
  const [sendOf, setSendOf] = useState(null);       // { batchId, to, quantity, via, notes }
  const [showEmpty, setShowEmpty] = useState(false);
  const list = data.madeHere.filter(b => showEmpty || b.remaining > 0);

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex justify-between items-center mb-1 flex-wrap gap-2">
        <h3 className="text-lg font-bold text-gray-800">3. Carcasses & cuts here</h3>
        <label className="text-xs text-gray-500 flex items-center gap-1"><input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} /> show used up</label>
      </div>
      <p className="text-sm text-gray-500 mb-3">Cut carcasses into products, then send them back to the farm or straight to cafés.</p>
      {list.length === 0 && <p className="text-sm text-gray-500">Nothing here yet — record a kill sheet first.</p>}
      <div className="space-y-3">
        {list.map(b => (
          <div key={b.batchId} className={`border rounded-lg p-3 ${b.recalled ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
            <div className="flex justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <p className="font-semibold text-gray-800">{b.productName} <span className="text-gray-500 font-normal">· {b.farmName || 'several farms'}</span></p>
                <p className="text-xs text-gray-500">
                  {b.kind === 'Slaughter' ? `Kill no. ${b.lotRef}` : `${b.kind}${b.lotRef ? ` · lot ${b.lotRef}` : ''}`}
                  {b.grading?.conformation ? ` · grade ${b.grading.conformation}${b.grading.fatClass || ''}` : ''}
                  {b.animalRef ? ` · ${b.animalRef}` : ''} · <span className="font-mono">{b.batchId}</span>
                  {b.useBy ? ` · use by ${new Date(b.useBy).toLocaleDateString('en-GB')}` : ''}
                </p>
                {b.recalled && <p className="text-xs text-red-700 font-semibold">🚨 Recalled{b.recallReason ? `: ${b.recallReason}` : ''}</p>}
              </div>
              <p className="font-bold text-sm text-gray-800">{formatQty(b.remaining, b.unit)} <span className="font-normal text-gray-500">of {formatQty(b.quantity, b.unit)}</span></p>
            </div>
            {b.remaining > 0 && !b.recalled && cutFrom?.batchId !== b.batchId && sendOf?.batchId !== b.batchId && (
              <div className="flex gap-3 mt-2 text-sm">
                <button onClick={() => setCutFrom(b)} className="text-red-700 font-semibold hover:underline">🔪 Cut / process</button>
                <button onClick={() => setSendOf({ batchId: b.batchId, to: '', quantity: String(b.remaining), via: '', notes: '' })} className="text-green-700 font-semibold hover:underline">🚚 Send</button>
                <button onClick={() => {
                  const reason = window.prompt(`Recall ${b.productName} (${b.batchId}) and everything made from it?\n\nReason:`);
                  if (reason && reason.trim()) post(`x${b.batchId}`, '/processor/recall', { batchId: b.batchId, reason: reason.trim() }, 'Recalled');
                }} className="text-gray-500 hover:underline">Recall</button>
              </div>
            )}
            {cutFrom?.batchId === b.batchId && (
              <CutForm first={b} all={data.madeHere.filter(x => x.remaining > 0 && !x.recalled)} post={post} busy={busy} onClose={() => setCutFrom(null)} />
            )}
            {sendOf?.batchId === b.batchId && (
              <div className="mt-2 bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
                <select value={sendOf.to} onChange={(e) => setSendOf({ ...sendOf, to: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm">
                  <option value="">— Send to —</option>
                  {participants.filter(p => p.address !== data.me.address).map(p => (
                    <option key={p.address} value={p.address}>{p.name} ({p.role === 'farm' ? 'farm — private kill' : p.role === 'restaurant' ? 'restaurant' : p.processorApproval ? 'cutting plant / processor' : 'depot'})</option>
                  ))}
                </select>
                <select value={sendOf.via} onChange={(e) => setSendOf({ ...sendOf, via: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm">
                  <option value="">Direct (own delivery)</option>
                  {participants.filter(p => p.role === 'handler' && p.address !== sendOf.to && p.address !== data.me.address).map(p => <option key={p.address} value={p.address}>via {p.name}</option>)}
                </select>
                <div className="flex gap-2 items-center flex-wrap">
                  <input type="number" step="any" min="0.001" max={b.remaining} value={sendOf.quantity} onChange={(e) => setSendOf({ ...sendOf, quantity: e.target.value })}
                    className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  <span className="text-sm text-gray-500">{b.unit}</span>
                  <input type="text" maxLength={280} placeholder="Notes, e.g. 6 boxes, vac-packed" value={sendOf.notes} onChange={(e) => setSendOf({ ...sendOf, notes: e.target.value })}
                    className="flex-1 min-w-[8rem] px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div className="flex gap-2">
                  <button disabled={busy !== null || !sendOf.to} onClick={async () => {
                    const r = await post(`s${b.batchId}`, '/processor/dispatch', { ...sendOf, quantity: Number(sendOf.quantity), via: sendOf.via || undefined }, 'Sent');
                    if (r) setSendOf(null);
                  }} className="bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400">
                    {busy === `s${b.batchId}` ? '⛓️ Recording…' : '🚚 Send'}
                  </button>
                  <button onClick={() => setSendOf(null)} className="text-sm text-gray-600 hover:underline">Cancel</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CutForm({ first, all, post, busy, onClose }) {
  const [inputs, setInputs] = useState([{ batchId: first.batchId, quantity: String(first.remaining) }]);
  const [outputs, setOutputs] = useState([{ productName: '', quantity: '', useBy: '' }]);
  const [kind, setKind] = useState('Cutting');
  const [waste, setWaste] = useState('');
  const [added, setAdded] = useState('');
  const [lotRef, setLotRef] = useState('');
  const [notes, setNotes] = useState('');
  const unit = first.unit;
  const suggestions = CUTS[first.species] || [];

  const n = (v) => Number(v) || 0;
  const usedTotal = inputs.reduce((t, i) => t + n(i.quantity), 0);
  const madeTotal = outputs.reduce((t, o) => t + n(o.quantity), 0);
  const balance = Math.round((usedTotal + n(added) - madeTotal - n(waste)) * 1000) / 1000;
  const setIn = (i, k, v) => setInputs(inputs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const setOut = (i, k, v) => setOutputs(outputs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const others = all.filter(b => b.unit === unit && !inputs.some(i => i.batchId === b.batchId));

  const submit = async () => {
    const r = await post('cut', '/processor/process', {
      kind, lotRef, notes, waste: n(waste), added: n(added),
      inputs: inputs.map(i => ({ batchId: i.batchId, quantity: n(i.quantity) })),
      outputs: outputs.filter(o => o.productName.trim() && n(o.quantity) > 0).map(o => ({ productName: o.productName.trim(), quantity: n(o.quantity), useBy: o.useBy || undefined }))
    }, (d) => `${d.batches.length} product${d.batches.length === 1 ? '' : 's'} made: ${d.batches.map(b => `${b.productName} ${b.quantity} ${b.unit}`).join(', ')}`);
    if (r) onClose();
  };

  return (
    <div className="mt-2 bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-3">
      <div className="flex gap-2 items-center flex-wrap">
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-sm bg-white">
          {['Cutting', 'Mincing', 'Sausage making', 'Curing', 'Packing'].map(k => <option key={k}>{k}</option>)}
        </select>
        <input value={lotRef} onChange={(e) => setLotRef(e.target.value)} maxLength={64} placeholder="Lot code (optional)" className="px-2 py-1 border border-gray-300 rounded text-sm" />
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-700 mb-1">Used</p>
        {inputs.map((i, k) => {
          const b = all.find(x => x.batchId === i.batchId) || first;
          return (
            <div key={i.batchId} className="flex gap-2 items-center text-sm mb-1 flex-wrap">
              <span className="flex-1 min-w-[10rem]">{b.productName} <span className="text-xs text-gray-500">{b.lotRef || b.batchId} · {formatQty(b.remaining, unit)} left</span></span>
              <input type="number" step="any" min="0" max={b.remaining} value={i.quantity} onChange={(e) => setIn(k, 'quantity', e.target.value)} className="w-24 px-2 py-1 border border-gray-300 rounded" />
              <span className="text-gray-500">{unit}</span>
              {k > 0 && <button onClick={() => setInputs(inputs.filter((_, j) => j !== k))} className="text-xs text-red-600">✕</button>}
            </div>
          );
        })}
        {others.length > 0 && (
          <select value="" onChange={(e) => { const b = all.find(x => x.batchId === e.target.value); if (b) setInputs([...inputs, { batchId: b.batchId, quantity: String(b.remaining) }]); }}
            className="text-xs px-2 py-1 border border-gray-300 rounded bg-white">
            <option value="">+ add another carcass / batch (e.g. for mince)</option>
            {others.map(b => <option key={b.batchId} value={b.batchId}>{b.productName} · {b.lotRef || b.batchId} · {formatQty(b.remaining, unit)}</option>)}
          </select>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-700 mb-1">Made</p>
        {outputs.map((o, k) => (
          <div key={k} className="flex gap-2 items-center text-sm mb-1 flex-wrap">
            <input list="fp-cuts" value={o.productName} onChange={(e) => setOut(k, 'productName', e.target.value)} maxLength={100} placeholder="Product, e.g. Sirloin steak"
              className="flex-1 min-w-[10rem] px-2 py-1 border border-gray-300 rounded" />
            <input type="number" step="any" min="0" value={o.quantity} onChange={(e) => setOut(k, 'quantity', e.target.value)} placeholder="0.0" className="w-24 px-2 py-1 border border-gray-300 rounded" />
            <span className="text-gray-500">{unit}</span>
            <label className="text-xs text-gray-500">use by <input type="date" min={today()} value={o.useBy} onChange={(e) => setOut(k, 'useBy', e.target.value)} className="px-1 py-0.5 border border-gray-300 rounded" /></label>
            {outputs.length > 1 && <button onClick={() => setOutputs(outputs.filter((_, j) => j !== k))} className="text-xs text-red-600">✕</button>}
          </div>
        ))}
        <datalist id="fp-cuts">{suggestions.map(c => <option key={c} value={c} />)}</datalist>
        <button onClick={() => setOutputs([...outputs, { productName: '', quantity: '', useBy: outputs[outputs.length - 1]?.useBy || '' }])} className="text-xs text-blue-600 hover:underline">+ another product</button>
      </div>

      <div className="flex gap-3 flex-wrap text-sm items-center">
        <label>Waste (bone, fat, trim) <input type="number" step="any" min="0" value={waste} onChange={(e) => setWaste(e.target.value)} className="w-20 px-2 py-1 border border-gray-300 rounded" /> {unit}</label>
        <label>Added ingredients <input type="number" step="any" min="0" value={added} onChange={(e) => setAdded(e.target.value)} className="w-20 px-2 py-1 border border-gray-300 rounded" /> {unit}</label>
      </div>
      <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={280} placeholder="Notes (public), e.g. dry-aged 21 days" className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />

      <p className={`text-xs ${balance < 0 ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
        Used {formatQty(usedTotal, unit)}{n(added) ? ` + ${formatQty(n(added), unit)} added` : ''} = made {formatQty(madeTotal, unit)} + waste {formatQty(n(waste), unit)}
        {balance > 0 ? ` (${formatQty(balance, unit)} unaccounted — add it to waste or a product)` : balance < 0 ? ` — that's ${formatQty(-balance, unit)} more than went in` : ' ✓'}
      </p>
      <div className="flex gap-2">
        <button onClick={submit} disabled={busy !== null || balance < 0 || madeTotal <= 0}
          className="bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-red-800 disabled:bg-gray-400">
          {busy === 'cut' ? '⛓️ Recording…' : 'Record on-chain'}
        </button>
        <button onClick={onClose} className="text-sm text-gray-600 hover:underline">Cancel</button>
      </div>
      <p className="text-xs text-gray-400">The blockchain checks that products + waste never weigh more than what was used. <a href={EXPLORER} target="_blank" rel="noopener noreferrer" className="underline">Base Sepolia</a></p>
    </div>
  );
}