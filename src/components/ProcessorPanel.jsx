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
// Carcasses (from the kill sheet) are cut into products; products are sent on (or, now and then, processed further).
const Req = () => <span className="text-red-600 font-bold" title="Required">*</span>;
const round3 = (x) => Math.round(x * 1000) / 1000;

function LeftBar({ b }) {
  const pct = b.quantity > 0 ? Math.max(0, Math.min(100, (b.remaining / b.quantity) * 100)) : 0;
  return (
    <div className="text-right shrink-0">
      <p className="font-bold text-sm text-gray-800">{formatQty(b.remaining, b.unit)} left</p>
      <p className="text-xs text-gray-500">of {formatQty(b.quantity, b.unit)}</p>
      <div className="w-28 h-1.5 bg-gray-200 rounded-full mt-1 ml-auto overflow-hidden">
        <div className={`h-full ${pct < 5 ? 'bg-amber-500' : 'bg-green-600'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MadeHere({ data, post, busy, participants }) {
  const [cutFrom, setCutFrom] = useState(null);     // batch being cut / processed
  const [sendOf, setSendOf] = useState(null);       // { batchId, to, quantity, via, notes }
  const [showEmpty, setShowEmpty] = useState(false);
  const visible = data.madeHere.filter(b => showEmpty || b.remaining > 0);
  const carcasses = visible.filter(b => b.kind === 'Slaughter');
  const products = visible.filter(b => b.kind !== 'Slaughter');
  const finished = data.madeHere.filter(b => b.remaining <= 0).length;

  const open = (b, what) => {
    setCutFrom(what === 'cut' ? b : null);
    setSendOf(what === 'send' ? { batchId: b.batchId, to: '', quantity: String(b.remaining), via: '', notes: '' } : null);
  };

  const recall = (b) => {
    const reason = window.prompt(`Recall ${b.productName} (${b.batchId}) and everything made from it?\n\nReason:`);
    if (reason && reason.trim()) post(`x${b.batchId}`, '/processor/recall', { batchId: b.batchId, reason: reason.trim() }, 'Recalled');
  };

  // A plain render function (not a nested component) so open forms keep their state and focus
  const card = (b) => {
    const isCarcass = b.kind === 'Slaughter';
    const working = cutFrom?.batchId === b.batchId || sendOf?.batchId === b.batchId;
    const small = isCarcass && b.remaining > 0 && b.remaining < Math.max(5, b.quantity * 0.05);
    return (
      <div key={b.batchId} className={`border rounded-lg p-3 ${b.recalled ? 'border-red-300 bg-red-50' : working ? 'border-gray-400 shadow-sm' : 'border-gray-200'} ${b.remaining <= 0 ? 'opacity-60' : ''}`}>
        <div className="flex justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-gray-800">{b.productName} <span className="text-gray-500 font-normal">· {b.farmName || 'several farms'}</span></p>
            <p className="text-xs text-gray-500">
              {isCarcass ? `Kill no. ${b.lotRef}` : `${b.kind}${b.lotRef ? ` · lot ${b.lotRef}` : ''}`}
              {b.grading?.conformation ? ` · grade ${b.grading.conformation}${b.grading.fatClass || ''}` : ''}
              {b.animalRef ? ` · ${b.animalRef}` : ''}
              {b.useBy ? ` · use by ${new Date(b.useBy).toLocaleDateString('en-GB')}` : ''}
            </p>
            <p className="text-xs text-gray-400 font-mono">{b.batchId}</p>
            {b.recalled && <p className="text-xs text-red-700 font-semibold">🚨 Recalled{b.recallReason ? `: ${b.recallReason}` : ''}</p>}
            {b.remaining <= 0 && !b.recalled && <p className="text-xs text-gray-500 font-semibold">✔ All used or sent</p>}
          </div>
          <LeftBar b={b} />
        </div>

        {small && !working && !b.recalled && (
          <p className="text-xs text-amber-700 mt-2">Only {formatQty(b.remaining, b.unit)} left: cut it into trim or mince, or include it as waste the next time you cut.</p>
        )}

        {b.remaining > 0 && !b.recalled && !working && (
          <div className="flex gap-2 mt-3 items-center flex-wrap">
            {isCarcass ? (
              <>
                <button onClick={() => open(b, 'cut')} className="bg-red-700 text-white text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-red-800">🔪 Cut into products</button>
                <button onClick={() => open(b, 'send')} className="text-sm border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50">🚚 Send whole</button>
              </>
            ) : (
              <>
                <button onClick={() => open(b, 'send')} className="bg-green-600 text-white text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-green-700">🚚 Send</button>
                <button onClick={() => open(b, 'cut')} className="text-sm border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50" title="e.g. turn steaks or trim into mince, burgers or cured meat">
                  ⚙️ Process further</button>
              </>
            )}
            <button onClick={() => recall(b)} className="text-xs text-gray-500 hover:text-red-700 hover:underline ml-auto">Recall…</button>
          </div>
        )}

        {cutFrom?.batchId === b.batchId && (
          <CutForm first={b} all={data.madeHere.filter(x => x.remaining > 0 && !x.recalled)} post={post} busy={busy} onClose={() => setCutFrom(null)} />
        )}
        {sendOf?.batchId === b.batchId && (
          <SendForm b={b} sendOf={sendOf} setSendOf={setSendOf} me={data.me} participants={participants} post={post} busy={busy} />
        )}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex justify-between items-center mb-1 flex-wrap gap-2">
        <h3 className="text-lg font-bold text-gray-800">3. Carcasses & cuts here</h3>
        {finished > 0 && (
          <label className="text-xs text-gray-500 flex items-center gap-1">
            <input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} /> show {finished} finished
          </label>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-4">Cut each carcass into products, then send the products back to the farm or on to cafés.</p>
      {visible.length === 0 && <p className="text-sm text-gray-500">Nothing here yet. Record a kill sheet first.</p>}

      {carcasses.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">🥩 Carcasses ({carcasses.length})</p>
          <div className="space-y-3">{carcasses.map(card)}</div>
        </div>
      )}
      {products.length > 0 && (
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">📦 Products ready to send ({products.length})</p>
          <div className="space-y-3">{products.map(card)}</div>
        </div>
      )}
    </div>
  );
}

function SendForm({ b, sendOf, setSendOf, me, participants, post, busy }) {
  const qty = Number(sendOf.quantity);
  const missing = [!sendOf.to && 'who it goes to', !(qty > 0) && 'how much', qty > b.remaining && `no more than ${formatQty(b.remaining, b.unit)}`].filter(Boolean);
  return (
    <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-3">
      <p className="text-sm font-bold text-gray-800">🚚 Send {b.productName}</p>
      <label className="block text-xs font-semibold text-gray-700">Send to <Req />
        <select value={sendOf.to} onChange={(e) => setSendOf({ ...sendOf, to: e.target.value })} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm font-normal">
          <option value="">Choose…</option>
          {participants.filter(p => p.address !== me.address).map(p => (
            <option key={p.address} value={p.address}>{p.name} ({p.role === 'farm' ? 'farm (private kill)' : p.role === 'restaurant' ? 'restaurant' : p.processorApproval ? 'cutting plant / processor' : 'depot'})</option>
          ))}
        </select>
      </label>
      <div className="flex gap-3 flex-wrap items-end">
        <label className="text-xs font-semibold text-gray-700">How much <Req />
          <span className="flex items-center gap-1 mt-1">
            <input type="number" step="any" min="0.001" max={b.remaining} value={sendOf.quantity} onChange={(e) => setSendOf({ ...sendOf, quantity: e.target.value })}
              className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm font-normal" />
            <span className="text-sm text-gray-500 font-normal">{b.unit}</span>
          </span>
        </label>
        <label className="flex-1 min-w-[10rem] text-xs font-semibold text-gray-700">Delivery
          <select value={sendOf.via} onChange={(e) => setSendOf({ ...sendOf, via: e.target.value })} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm font-normal">
            <option value="">Direct (own delivery)</option>
            {participants.filter(p => p.role === 'handler' && p.address !== sendOf.to && p.address !== me.address).map(p => <option key={p.address} value={p.address}>via {p.name}</option>)}
          </select>
        </label>
      </div>
      <input type="text" maxLength={280} placeholder="Notes (optional), e.g. 6 boxes, vac-packed" value={sendOf.notes} onChange={(e) => setSendOf({ ...sendOf, notes: e.target.value })}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
      {missing.length > 0 && <p className="text-xs text-gray-500">Still needed: {missing.join(', ')}</p>}
      <div className="flex gap-2 items-center">
        <button disabled={busy !== null || missing.length > 0} onClick={async () => {
          const r = await post(`s${b.batchId}`, '/processor/dispatch', { ...sendOf, quantity: qty, via: sendOf.via || undefined }, 'Sent');
          if (r) setSendOf(null);
        }} className="bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400">
          {busy === `s${b.batchId}` ? '⛓️ Recording…' : '🚚 Send'}
        </button>
        <button onClick={() => setSendOf(null)} className="text-sm text-gray-600 hover:underline">Cancel</button>
        <span className="text-xs text-gray-400 ml-auto"><Req /> required</span>
      </div>
    </div>
  );
}

const KINDS = {
  Cutting: 'Cutting (steaks, joints, diced)',
  Mincing: 'Mincing',
  'Sausage making': 'Sausages / burgers',
  Curing: 'Curing (bacon, ham)',
  Packing: 'Packing only',
};

function CutForm({ first, all, post, busy, onClose }) {
  const isCarcass = first.kind === 'Slaughter';
  const [kind, setKind] = useState(isCarcass ? 'Cutting' : 'Mincing');
  const [inputs, setInputs] = useState([{ batchId: first.batchId, quantity: '' }]);
  const [outputs, setOutputs] = useState([{ productName: '', quantity: '', useBy: '' }]);
  const [waste, setWaste] = useState('');
  const [added, setAdded] = useState('');
  const [lotRef, setLotRef] = useState('');
  const [notes, setNotes] = useState('');
  const [mixing, setMixing] = useState(false);
  const unit = first.unit;
  const suggestions = CUTS[first.species] || [];
  const usesIngredients = kind === 'Sausage making' || kind === 'Curing';

  const n = (v) => Number(v) || 0;
  const batchOf = (id) => all.find(x => x.batchId === id) || first;
  const usedTotal = round3(inputs.reduce((t, i) => t + n(i.quantity), 0));
  const madeTotal = round3(outputs.reduce((t, o) => t + n(o.quantity), 0));
  const addedQty = usesIngredients ? n(added) : 0;
  const balance = round3(usedTotal + addedQty - madeTotal - n(waste));
  const setIn = (i, k, v) => setInputs(inputs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const setOut = (i, k, v) => setOutputs(outputs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const others = all.filter(b => b.unit === unit && !inputs.some(i => i.batchId === b.batchId));

  // What still has to be filled in before it can be recorded
  const overUsed = inputs.find(i => n(i.quantity) > batchOf(i.batchId).remaining);
  const filledOutputs = outputs.filter(o => o.productName.trim() || n(o.quantity) > 0 || o.useBy);
  const missing = [
    usedTotal <= 0 && 'how much you used',
    overUsed && `${batchOf(overUsed.batchId).productName} only has ${formatQty(batchOf(overUsed.batchId).remaining, unit)} left`,
    (filledOutputs.length === 0 || filledOutputs.some(o => !o.productName.trim())) && 'a product name',
    (filledOutputs.length === 0 || filledOutputs.some(o => !(n(o.quantity) > 0))) && 'each product\'s weight',
    (filledOutputs.length === 0 || filledOutputs.some(o => !o.useBy)) && 'each product\'s use-by date',
    usedTotal > 0 && madeTotal > 0 && balance !== 0 && 'the weights to balance',
  ].filter(Boolean);

  const submit = async () => {
    const r = await post('cut', '/processor/process', {
      kind, lotRef, notes, waste: n(waste), added: addedQty,
      inputs: inputs.filter(i => n(i.quantity) > 0).map(i => ({ batchId: i.batchId, quantity: n(i.quantity) })),
      outputs: filledOutputs.map(o => ({ productName: o.productName.trim(), quantity: n(o.quantity), useBy: o.useBy || undefined }))
    }, (d) => `${d.batches.length} product${d.batches.length === 1 ? '' : 's'} made: ${d.batches.map(b => `${b.productName} ${b.quantity} ${b.unit}`).join(', ')}`);
    if (r) onClose();
  };

  return (
    <div className="mt-3 bg-gray-50 border border-gray-300 rounded-lg p-3 space-y-3">
      <div className="flex justify-between items-start gap-2">
        <p className="text-sm font-bold text-gray-800">
          {isCarcass ? '🔪 Cut' : '⚙️ Process'} {first.productName} <span className="font-normal text-gray-500">{first.lotRef ? `· ${isCarcass ? 'kill no. ' : 'lot '}${first.lotRef}` : ''}</span>
        </p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none" aria-label="Close">✕</button>
      </div>

      <label className="block text-xs font-semibold text-gray-700">Type of work
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="mt-1 block px-2 py-1.5 border border-gray-300 rounded text-sm bg-white font-normal">
          {Object.entries(KINDS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </label>

      <div className="bg-white border border-gray-200 rounded-lg p-3">
        <p className="text-sm font-bold text-gray-800">1. How much did you use? <Req /></p>
        <p className="text-xs text-gray-500 mb-2">The weight taken off the {isCarcass ? 'carcass' : 'batch'} for this job. Whatever is left stays here for later.</p>
        {inputs.map((i, k) => {
          const b = batchOf(i.batchId);
          const over = n(i.quantity) > b.remaining;
          return (
            <div key={i.batchId} className="flex gap-2 items-center text-sm mb-1 flex-wrap">
              <span className="flex-1 min-w-[10rem]">{b.productName} <span className="text-xs text-gray-500">{b.lotRef || b.batchId} · {formatQty(b.remaining, unit)} left</span></span>
              <input type="number" step="any" min="0" max={b.remaining} value={i.quantity} placeholder={`up to ${b.remaining}`} onChange={(e) => setIn(k, 'quantity', e.target.value)}
                className={`w-28 px-2 py-1 border rounded ${over ? 'border-red-500 bg-red-50' : 'border-gray-300'}`} />
              <span className="text-gray-500">{unit}</span>
              <button onClick={() => setIn(k, 'quantity', String(b.remaining))} className="text-xs text-blue-600 hover:underline">use all</button>
              {k > 0 && <button onClick={() => setInputs(inputs.filter((_, j) => j !== k))} className="text-xs text-red-600" aria-label="Remove">✕</button>}
            </div>
          );
        })}
        {others.length > 0 && (mixing ? (
          <select value="" onChange={(e) => { const b = all.find(x => x.batchId === e.target.value); if (b) setInputs([...inputs, { batchId: b.batchId, quantity: '' }]); }}
            className="text-xs px-2 py-1 border border-gray-300 rounded bg-white mt-1">
            <option value="">Choose another carcass / batch to mix in…</option>
            {others.map(b => <option key={b.batchId} value={b.batchId}>{b.productName} · {b.lotRef || b.batchId} · {formatQty(b.remaining, unit)} left</option>)}
          </select>
        ) : (
          <button onClick={() => setMixing(true)} className="text-xs text-blue-600 hover:underline mt-1">+ Mixing in another carcass or batch? (e.g. for mince)</button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-3">
        <p className="text-sm font-bold text-gray-800">2. What did you make? <Req /></p>
        <p className="text-xs text-gray-500 mb-2">Each product becomes its own batch that cafés can order, traced back to {first.farmName || 'the farm'}.</p>
        <div className="hidden sm:flex gap-2 text-xs font-semibold text-gray-600 mb-1">
          <span className="flex-1 min-w-[10rem]">Product <Req /></span><span className="w-32">Weight <Req /></span><span className="w-36">Use by <Req /></span><span className="w-4" />
        </div>
        {outputs.map((o, k) => (
          <div key={k} className="flex gap-2 items-center text-sm mb-2 flex-wrap">
            <input list="fp-cuts" value={o.productName} onChange={(e) => setOut(k, 'productName', e.target.value)} maxLength={100} placeholder="e.g. Sirloin steak"
              className="flex-1 min-w-[10rem] px-2 py-1 border border-gray-300 rounded" aria-label="Product name (required)" />
            <span className="w-32 flex items-center gap-1">
              <input type="number" step="any" min="0" value={o.quantity} onChange={(e) => setOut(k, 'quantity', e.target.value)} placeholder="0.0"
                className="w-24 px-2 py-1 border border-gray-300 rounded" aria-label="Weight (required)" />
              <span className="text-gray-500">{unit}</span>
            </span>
            <input type="date" min={today()} value={o.useBy} onChange={(e) => setOut(k, 'useBy', e.target.value)}
              className="w-36 px-1 py-1 border border-gray-300 rounded text-sm" aria-label="Use by (required)" />
            <span className="w-4">{outputs.length > 1 && <button onClick={() => setOutputs(outputs.filter((_, j) => j !== k))} className="text-xs text-red-600" aria-label="Remove product">✕</button>}</span>
          </div>
        ))}
        <datalist id="fp-cuts">{suggestions.map(c => <option key={c} value={c} />)}</datalist>
        <button onClick={() => setOutputs([...outputs, { productName: '', quantity: '', useBy: outputs[outputs.length - 1]?.useBy || '' }])} className="text-xs text-blue-600 hover:underline">+ another product</button>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
        <p className="text-sm font-bold text-gray-800">3. Waste and details</p>
        <div className="flex gap-4 flex-wrap text-sm items-center">
          <label>Waste (bone, fat, trim, drip loss) <input type="number" step="any" min="0" value={waste} onChange={(e) => setWaste(e.target.value)} placeholder="0" className="w-20 px-2 py-1 border border-gray-300 rounded" /> {unit}</label>
          {usesIngredients && (
            <label>Added ingredients (rusk, salt…) <input type="number" step="any" min="0" value={added} onChange={(e) => setAdded(e.target.value)} placeholder="0" className="w-20 px-2 py-1 border border-gray-300 rounded" /> {unit}</label>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <input value={lotRef} onChange={(e) => setLotRef(e.target.value)} maxLength={64} placeholder="Lot code (optional)" className="w-40 px-2 py-1 border border-gray-300 rounded text-sm" />
          <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={280} placeholder="Public notes (optional), e.g. dry-aged 21 days" className="flex-1 min-w-[12rem] px-2 py-1 border border-gray-300 rounded text-sm" />
        </div>
      </div>

      {/* Weight check */}
      {(usedTotal > 0 || madeTotal > 0) && (
        <div className={`rounded-lg p-3 text-sm border ${balance === 0 && usedTotal > 0 ? 'bg-green-50 border-green-300 text-green-800'
          : balance < 0 ? 'bg-red-50 border-red-300 text-red-700' : 'bg-amber-50 border-amber-300 text-amber-800'}`}>
          <p className="font-semibold">
            Weight check: used {formatQty(usedTotal, unit)}{addedQty ? ` + ${formatQty(addedQty, unit)} added` : ''} → made {formatQty(madeTotal, unit)} + waste {formatQty(n(waste), unit)}
          </p>
          {balance === 0 && usedTotal > 0 && <p>✓ Every kilo is accounted for.</p>}
          {balance > 0 && (
            <div className="mt-1 space-y-1">
              <p>{formatQty(balance, unit)} isn't accounted for. Every kilo has to go somewhere, or it would vanish from the record.</p>
              <div className="flex gap-2 flex-wrap">
                {madeTotal > 0 && (
                  <button onClick={() => setInputs(inputs.length === 1 ? [{ ...inputs[0], quantity: String(round3(madeTotal + n(waste) - addedQty)) }] : inputs)}
                    disabled={inputs.length > 1}
                    className="text-xs bg-white border border-amber-400 px-2 py-1 rounded hover:bg-amber-100 disabled:opacity-50">
                    Only used {formatQty(round3(madeTotal + n(waste) - addedQty), unit)}: leave the rest on the {isCarcass ? 'carcass' : 'batch'}
                  </button>
                )}
                <button onClick={() => setWaste(String(round3(n(waste) + balance)))} className="text-xs bg-white border border-amber-400 px-2 py-1 rounded hover:bg-amber-100">
                  Add {formatQty(balance, unit)} to waste
                </button>
              </div>
            </div>
          )}
          {balance < 0 && <p>Products and waste weigh {formatQty(-balance, unit)} more than you used. Check the weights.</p>}
        </div>
      )}

      {missing.length > 0 && <p className="text-xs text-gray-600">Still needed: {missing.join(' · ')}</p>}
      <div className="flex gap-2 items-center">
        <button onClick={submit} disabled={busy !== null || missing.length > 0}
          className="bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-red-800 disabled:bg-gray-400">
          {busy === 'cut' ? '⛓️ Recording…' : 'Record on-chain'}
        </button>
        <button onClick={onClose} className="text-sm text-gray-600 hover:underline">Cancel</button>
        <span className="text-xs text-gray-400 ml-auto"><Req /> required</span>
      </div>
      <p className="text-xs text-gray-400">The blockchain checks that products + waste never weigh more than what was used. <a href={EXPLORER} target="_blank" rel="noopener noreferrer" className="underline">Base Sepolia</a></p>
    </div>
  );
}