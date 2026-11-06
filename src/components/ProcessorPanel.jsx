// ProcessorPanel — for approved abattoirs / cutting plants, on the Supply Chain page.
//   1. Animals in (with their Food Chain Information) → confirm they arrived, or refuse them (with a reason)
//   2. Kill sheet: upload the day's kill sheet (CSV) → one carcass per row, recorded on-chain
//   3. Carcasses & cuts, grouped by farm → cut (weights worked out for you, ingredients + allergens),
//      send one or several products, recall; History keeps everything for recalls
//   4. Café orders to send: cuts cafés ordered from a farm's meat list, sent from here
// Everything is sent by Farm Passport (no gas needed); the processor signs in once with its wallet.
import { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE, EXPLORER, formatQty, metaMaskSign, walletSignIn, walletError } from './walletHelpers';
import { TxLink, ChainHelp } from './ChainProof';
import { ReturnCheck, FrozenChoice, frozenBody, Refs, RefInput, AlertSettings } from './FarmerSupply';
import { useAsk } from './Ask';
import { printLabels } from './PrintDocs';
import { batchLink } from './walletHelpers';

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

// v4.5: framed = inside the dashboard frame (the sidebar shows the sections, so no header or tab bar here);
//       tab / onTab let the frame choose the section. 'today' is the new at-a-glance board.
export default function ProcessorPanel({ account, participants, framed = false, tab = null, onTab = null, onData = null }) {
  const [token, setToken] = useState(() => {
    try { const t = JSON.parse(sessionStorage.getItem('fp_processor') || 'null'); return t?.account === account ? t.token : null; } catch { return null; }
  });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(null);
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  // v4.4: one section at a time (remembered for this browser tab)
  const [ptab, setPtabState] = useState(() => {
    try { const t = sessionStorage.getItem('fp_proc_tab'); return ['animals', 'kill', 'stock', 'orders', 'settings'].includes(t) ? t : 'animals'; } catch { return 'animals'; }
  });
  const setPtabLocal = (t) => { setPtabState(t); try { sessionStorage.setItem('fp_proc_tab', t); } catch { /* fine */ } };
  const setPtab = onTab || setPtabLocal;
  const shown = tab || ptab;

  const load = async () => {
    try {
      const [r, o] = await Promise.all([
        axios.get(`${API_BASE}/processor/overview`, auth),
        axios.get(`${API_BASE}/processor/orders`, auth).catch(() => ({ data: { orders: [] } }))
      ]);
      setData({ ...r.data, orders: o.data.orders || [] });
      onData?.({ ...r.data, orders: o.data.orders || [] });
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

  // Several calls one after another (e.g. sending 4 products to one café). Stops at the first problem.
  const postMany = async (key, calls, onProgress) => {
    setBusy(key); setError(null); setMessage(null);
    const done = [];
    try {
      for (const [i, c] of calls.entries()) {
        onProgress?.(i);
        await axios.post(`${API_BASE}${c.path}`, c.body, auth);
        done.push(c);
      }
      setMessage(`${done.length} sent: ${done.map(c => c.label).join(', ')}`);
    } catch (err) {
      setError(`${done.length ? `${done.length} sent (${done.map(c => c.label).join(', ')}), then ` : ''}${calls[done.length]?.label}: ${err.response?.data?.error || 'something went wrong'}`);
    } finally {
      await load();
      setBusy(null);
    }
    return done.length;
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

  const ready = data.orders.filter(o => o.ready).length;
  return (
    <div className="space-y-6">
      {!framed && <>
      <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
        <p className="font-bold text-red-900">🔪 {data.me.name} · approval no. {data.me.approvalNumber}</p>
        <p className="text-xs text-red-800">Animals in → kill sheet → carcasses → cutting → café orders. Every step is on the blockchain.</p>
        {(data.animalsComing.length > 0 || ready > 0) && (
          <p className="text-sm text-red-900 font-semibold mt-1">
            {[data.animalsComing.length > 0 && `🐄 ${data.animalsComing.length} deliver${data.animalsComing.length === 1 ? 'y' : 'ies'} of animals on the way`,
              ready > 0 && `📦 ${ready} café order${ready === 1 ? '' : 's'} ready to send`].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
      {/* v4.4: tabs */}
      <div className="sticky top-0 z-20 py-2 bg-gray-50/95 backdrop-blur">
        <div className="flex gap-1 overflow-x-auto bg-white rounded-lg shadow p-1" role="tablist">
          {[['animals', '🐄', 'Animals in', data.animalsComing.length],
            ['kill', '📋', 'Kill sheet', data.animalsHere.length],
            ['stock', '🥩', 'Carcasses & cuts', 0],
            ['orders', '🧾', 'Café orders', ready],
            ['settings', '⚙️', 'Settings', 0]].map(([k, icon, label, n]) => (
            <button key={k} role="tab" aria-selected={ptab === k} onClick={() => setPtab(k)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-semibold whitespace-nowrap ${ptab === k ? 'bg-red-700 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              <span>{icon}</span><span>{label}</span>
              {n > 0 && <span className={`text-xs rounded-full px-1.5 min-w-[1.25rem] text-center ${ptab === k ? 'bg-white text-red-700' : 'bg-amber-400 text-amber-950'}`}>{n}</span>}
            </button>
          ))}
        </div>
      </div>
      </>}
      {error && <div className="bg-red-50 border border-red-300 rounded-lg p-3 text-red-700 text-sm font-semibold">⚠️ {error}</div>}
      {message && <div className="bg-green-50 border border-green-300 rounded-lg p-3 text-green-700 text-sm font-semibold">✅ {message}</div>}

      {data.refusedComingBack?.length > 0 && (
        <div className="bg-white rounded-lg shadow-lg p-6 space-y-2">
          <h3 className="text-lg font-bold text-orange-800">↩️ Refused by a café, coming back to you ({data.refusedComingBack.length})</h3>
          <p className="text-sm text-gray-500">Check each one when it's back: put it back in stock, or write it off with a reason. Until then it isn't counted as stock.</p>
          {data.refusedComingBack.map(s => <ReturnCheck key={s.shipmentId} s={s} token={token} base="processor" onDone={load} />)}
        </div>
      )}
      {shown === 'today' && <AbattoirToday data={data} go={setPtab} />}
      {shown === 'animals' && <AnimalsIn data={data} auth={auth} busy={busy} post={post} />}
      {shown === 'kill' && <KillSheet post={post} busy={busy} waiting={data.animalsHere} />}
      {shown === 'stock' && <MadeHere data={data} post={post} postMany={postMany} busy={busy} participants={participants} />}
      {shown === 'orders' && <OrdersToSend data={data} post={post} busy={busy} participants={participants} />}
      {shown === 'settings' && <><AlertSettings token={token} /><ChainHelp who="abattoir" /></>}
    </div>
  );
}

const Req = () => <span className="text-red-600 font-bold" title="Required">*</span>;
const round3 = (x) => Math.round(x * 1000) / 1000;
const ukDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

// Why an abattoir turns animals away (the reason goes on the blockchain with the refusal)
const REFUSE_REASONS = [
  'No Food Chain Information (FCI)',
  'FCI incomplete or wrong',
  "Ear tag / passport doesn't match",
  'Unfit to travel / welfare concern',
  'Too dirty to slaughter (clean livestock policy)',
  'Medicine withdrawal period not finished',
  'Wrong animals / not booked in',
  'Other',
];

// ── 1. Animals arriving / waiting ──
function AnimalsIn({ data, auth, busy, post }) {
  const [fciOpen, setFciOpen] = useState(null);
  const [fci, setFci] = useState(null);
  const [qty, setQty] = useState({});
  const [refusing, setRefusing] = useState(null);      // { shipmentId, count, reason, notes }

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

  const refuse = async (s) => {
    const n = Number(refusing.count);
    const notes = `Refused: ${refusing.reason}${refusing.notes.trim() ? ` — ${refusing.notes.trim()}` : ''}`;
    const r = await post(`x${s.shipmentId}`, `/processor/shipments/${s.shipmentId}/receive`,
      { quantityReceived: s.quantitySent - n, quantityRejected: n, notes },
      n === s.quantitySent ? `Refused ${n} head. ${s.fromName} confirms when they're back home` : `${s.quantitySent - n} accepted, ${n} refused`);
    if (r) setRefusing(null);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h3 className="text-lg font-bold text-gray-800 mb-1">Animals in</h3>
      <p className="text-sm text-gray-500 mb-3">Confirm animals when they arrive in lairage, or refuse them. Check their Food Chain Information.</p>
      {data.animalsComing.length === 0 && data.animalsHere.length === 0 && <p className="text-sm text-gray-500">No animals on the way or waiting.</p>}
      <div className="space-y-3">
        {data.animalsComing.map(s => {
          const r = refusing?.shipmentId === s.shipmentId ? refusing : null;
          const n = Number(r?.count);
          const refuseOk = r && Number.isInteger(n) && n >= 1 && n <= s.quantitySent && r.reason;
          return (
            <div key={s.shipmentId} className="border-2 border-blue-200 bg-blue-50 rounded-lg p-3">
              <p className="font-semibold text-gray-800">{formatQty(s.quantitySent, 'head')} {s.productName} from {s.fromName}</p>
              <p className="text-xs text-gray-600">{s.species} · <span className="font-mono">{s.animalRef}</span> · delivery #{s.shipmentId}{s.dispatchNotes ? ` · "${s.dispatchNotes}"` : ''} <Refs x={s} /></p>
              <FciBadge s={s} /><FciView id={s.shipmentId} />
              {!r ? (
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
                  <button disabled={busy !== null} onClick={() => setRefusing({ shipmentId: s.shipmentId, count: String(s.quantitySent), reason: s.fci?.provided ? '' : REFUSE_REASONS[0], notes: '' })}
                    className="text-sm border border-red-300 text-red-700 px-3 py-1.5 rounded hover:bg-red-50">✋ Refuse…</button>
                </div>
              ) : (
                <div className="mt-2 bg-white border border-red-200 rounded-lg p-3 space-y-2">
                  <p className="text-sm font-bold text-red-800">✋ Refuse animals from this delivery</p>
                  <p className="text-xs text-gray-600">Refuse at the unloading bay, so they go straight back on the same lorry. Once animals are in your lairage they normally have to be slaughtered here: moving them out needs an APHA licence, and pigs can't leave at all. If you're keeping them (e.g. to clip dirty cattle, or waiting for the FCI), confirm they arrived instead and add a note.</p>
                  <div className="flex gap-3 flex-wrap items-end">
                    <label className="text-xs font-semibold text-gray-700">How many refused <Req />
                      <span className="flex items-center gap-1 mt-1 font-normal">
                        <input type="number" min="1" step="1" max={s.quantitySent} value={r.count} onChange={(e) => setRefusing({ ...r, count: e.target.value })}
                          className="w-20 px-2 py-1 border border-gray-300 rounded text-sm" />
                        <span className="text-sm text-gray-500">of {s.quantitySent} head</span>
                      </span>
                    </label>
                    <label className="flex-1 min-w-[14rem] text-xs font-semibold text-gray-700">Reason <Req />
                      <select value={r.reason} onChange={(e) => setRefusing({ ...r, reason: e.target.value })}
                        className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white font-normal">
                        <option value="">Choose…</option>
                        {REFUSE_REASONS.map(x => <option key={x}>{x}</option>)}
                      </select>
                    </label>
                  </div>
                  <input value={r.notes} maxLength={160} onChange={(e) => setRefusing({ ...r, notes: e.target.value })}
                    placeholder={r.reason === 'Other' ? 'Say what was wrong (required)' : 'More detail (optional), e.g. which ear tag'}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                  <p className="text-xs text-gray-500">
                    {Number.isInteger(n) && n > 0 && n < s.quantitySent ? `The other ${s.quantitySent - n} head will be accepted. ` : ''}
                    Refused animals go back on {s.fromName}'s count (they return with the haulier), so they can be sent again later. The reason is recorded on the blockchain and the farm sees it.
                  </p>
                  <div className="flex gap-2 items-center">
                    <button disabled={busy !== null || !refuseOk || (r.reason === 'Other' && !r.notes.trim())} onClick={() => refuse(s)}
                      className="bg-red-700 text-white text-sm font-semibold px-3 py-1.5 rounded hover:bg-red-800 disabled:bg-gray-400">
                      {busy === `x${s.shipmentId}` ? '⛓️ Recording…' : `Refuse ${Number.isInteger(n) && n > 0 ? n : ''} head`}
                    </button>
                    <button onClick={() => setRefusing(null)} className="text-sm text-gray-600 hover:underline">Cancel</button>
                    <span className="text-xs text-gray-400 ml-auto"><Req /> required</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {data.animalsHere.map(s => (
          <div key={s.shipmentId} className="border border-gray-200 rounded-lg p-3">
            <p className="font-semibold text-gray-800">{formatQty(s.available, 'head')} {s.productName} in lairage <span className="text-gray-500 font-normal">from {s.fromName}</span></p>
            <p className="text-xs text-gray-600">{s.species} · <span className="font-mono">{s.animalRef}</span> · arrived {new Date(s.deliveredAt).toLocaleDateString('en-GB')} <TxLink hash={s.receivedTxHash} label="Arrival" className="ml-1" /></p>
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
      <h3 className="text-lg font-bold text-gray-800 mb-1">Kill sheet</h3>
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

// ── 3. Carcasses and cuts here ──
// Grouped by farm; under each carcass, what was cut from it. Products can be ticked and sent together.
// "History" keeps everything (also finished and sent batches) so it can still be found and recalled.
function LeftBar({ b, small = false }) {
  const pct = b.quantity > 0 ? Math.max(0, Math.min(100, (b.remaining / b.quantity) * 100)) : 0;
  return (
    <div className="text-right shrink-0">
      <p className={`font-bold text-gray-800 ${small ? 'text-xs' : 'text-sm'}`}>{formatQty(b.remaining, b.unit)} left</p>
      <p className="text-xs text-gray-500">of {formatQty(b.quantity, b.unit)}</p>
      <div className={`${small ? 'w-20' : 'w-28'} h-1.5 bg-gray-200 rounded-full mt-1 ml-auto overflow-hidden`}>
        <div className={`h-full ${pct < 5 ? 'bg-amber-500' : 'bg-green-600'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const refOf = (b) => (b.kind === 'Slaughter' ? `Kill no. ${b.lotRef}` : `${b.kind}${b.lotRef ? ` · lot ${b.lotRef}` : ''}`);

function MadeHere({ data, post, postMany, busy, participants }) {
  const [view, setView] = useState('now');            // now | history
  const [open, setOpen] = useState(null);             // { batchId, what: 'cut' | 'send' }
  const [sendOf, setSendOf] = useState(null);         // single send form
  const [collapsed, setCollapsed] = useState({});     // farm key → true
  const [picked, setPicked] = useState({});           // batchId → true (send several together)
  const [bulk, setBulk] = useState(null);             // { to, via, notes, qty: { batchId: '4' } }
  const [step, setStep] = useState(null);             // bulk progress
  const [q, setQ] = useState('');

  const all = data.madeHere;
  const byId = Object.fromEntries(all.map(b => [b.batchId, b]));
  const live = (b) => b.remaining > 0 && !b.recalled;
  const canSend = (b) => live(b) && b.kind !== 'Slaughter';
  const waiting = data.orders.filter(o => !o.ready);
  const pickedList = Object.keys(picked).filter(id => picked[id] && byId[id] && canSend(byId[id])).map(id => byId[id]);

  // Group by farm → carcasses (each with what was cut from it) + anything from several carcasses / other stock
  const groups = {};
  const farmKey = (b) => b.farmAddress || 'mixed';
  for (const b of all) {
    const k = farmKey(b);
    groups[k] = groups[k] || { key: k, farmName: b.farmAddress ? (b.farmName || 'Farm') : 'Several farms', carcasses: [], other: [] };
  }
  for (const b of all) if (b.kind === 'Slaughter') groups[farmKey(b)].carcasses.push({ carcass: b, products: [] });
  for (const b of all) {
    if (b.kind === 'Slaughter') continue;
    const g = groups[farmKey(b)];
    const home = b.carcasses?.length === 1 ? g.carcasses.find(c => c.carcass.batchId === b.carcasses[0]) : null;
    (home ? home.products : g.other).push(b);
  }
  const shown = Object.values(groups).map(g => ({
    ...g,
    carcasses: g.carcasses.filter(c => live(c.carcass) || c.products.some(live)).map(c => ({ ...c, products: c.products.filter(live) })),
    other: g.other.filter(live),
  })).filter(g => g.carcasses.length || g.other.length).sort((a, b) => a.farmName.localeCompare(b.farmName));

  const openForm = (b, what) => {
    setOpen({ batchId: b.batchId, what });
    setSendOf(what === 'send' ? { batchId: b.batchId, to: '', quantity: String(b.remaining), via: '', notes: '' } : null);
  };
  const close = () => { setOpen(null); setSendOf(null); };
  const [ask, askNode] = useAsk();
  const recall = async (b) => {
    const reason = await ask({ title: `Recall ${b.productName}?`, text: `${b.batchId} and everything made from it. This is recorded on the blockchain and everyone holding it is warned.`,
      input: { placeholder: 'Reason (shown to cafés and diners)', required: true }, confirmLabel: 'Recall', danger: true });
    if (reason && reason.trim()) post(`x${b.batchId}`, '/processor/recall', { batchId: b.batchId, reason: reason.trim() }, `${b.productName} recalled, with everything made from it`);
  };

  const forms = (b) => (
    <>
      {open?.batchId === b.batchId && open.what === 'cut' && (
        <CutForm first={b} all={all.filter(live)} data={data} post={post} busy={busy} onClose={close} />
      )}
      {open?.batchId === b.batchId && open.what === 'send' && sendOf && (
        <SendForm b={b} sendOf={sendOf} setSendOf={setSendOf} me={data.me} participants={participants} post={post} busy={busy} onClose={close} />
      )}
    </>
  );

  // A carcass (plain render function, so open forms keep their state and focus)
  const carcassCard = ({ carcass: b, products }) => {
    const working = open?.batchId === b.batchId;
    const finished = !live(b);
    const small = live(b) && b.remaining < Math.max(5, b.quantity * 0.05);
    return (
      <div key={b.batchId} className={`border rounded-lg ${working ? 'border-gray-400 shadow-sm' : 'border-gray-200'} ${b.recalled ? 'border-red-300 bg-red-50' : 'bg-white'}`}>
        <div className={`p-3 ${finished && !b.recalled ? 'bg-gray-50 rounded-t-lg' : ''}`}>
          <div className="flex justify-between gap-3">
            <div className="min-w-0">
              <p className={`font-semibold ${finished ? 'text-gray-500' : 'text-gray-800'}`}>🥩 {b.productName}
                <span className="font-normal text-gray-500"> · {refOf(b)}{b.grading?.conformation ? ` · grade ${b.grading.conformation}${b.grading.fatClass || ''}` : ''}</span></p>
              <p className="text-xs text-gray-500">{b.animalRef ? `${b.animalRef} · ` : ''}<span className="font-mono text-gray-400">{b.batchId}</span> <TxLink hash={b.txHash} label="Kill record" className="ml-1" /></p>
              {b.recalled && <p className="text-xs text-red-700 font-semibold">🚨 Recalled{b.recallReason ? `: ${b.recallReason}` : ''}</p>}
            </div>
            {finished ? <p className="text-xs text-gray-500 font-semibold shrink-0">{b.recalled ? '' : '✔ All cut'}</p> : <LeftBar b={b} />}
          </div>
          {small && !working && <p className="text-xs text-amber-700 mt-2">Only {formatQty(b.remaining, b.unit)} left: cut it into trim or mince, or include it as waste the next time you cut.</p>}
          {live(b) && !working && (
            <div className="flex gap-2 mt-3 items-center flex-wrap">
              <button onClick={() => openForm(b, 'cut')} className="bg-red-700 text-white text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-red-800">🔪 Cut into products</button>
              <button onClick={() => openForm(b, 'send')} className="text-sm border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50">🚚 Send whole</button>
              <button onClick={() => recall(b)} className="text-xs text-gray-500 hover:text-red-700 hover:underline ml-auto">Recall…</button>
            </div>
          )}
          {finished && !b.recalled && (
            <button onClick={() => recall(b)} className="text-xs text-gray-500 hover:text-red-700 hover:underline mt-1">Recall this carcass and everything cut from it…</button>
          )}
          {forms(b)}
        </div>
        {products.length > 0 && (
          <div className="border-t border-gray-100 pl-4 pr-3 py-2 space-y-2 bg-gray-50/50 rounded-b-lg">
            <p className="text-xs font-semibold text-gray-500">Cut from this carcass</p>
            {products.map(productCard)}
          </div>
        )}
      </div>
    );
  };

  const productCard = (b) => {
    const working = open?.batchId === b.batchId;
    return (
      <div key={b.batchId} className={`border rounded-lg p-2.5 bg-white ${working ? 'border-gray-400 shadow-sm' : picked[b.batchId] ? 'border-green-500 ring-1 ring-green-500' : 'border-gray-200'}`}>
        <div className="flex gap-2.5">
          {canSend(b) && (
            <input type="checkbox" checked={!!picked[b.batchId]} onChange={(e) => setPicked({ ...picked, [b.batchId]: e.target.checked })}
              className="mt-1 h-4 w-4 accent-green-600 shrink-0" aria-label={`Select ${b.productName} to send`} />
          )}
          <div className="flex-1 min-w-0 flex justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-gray-800 text-sm">{b.productName}</p>
              <p className="text-xs text-gray-500">{refOf(b)}{b.pieces ? ` · ${b.pieces} pieces (≈${Math.round((b.quantity / b.pieces) * 1000)} g each)` : ''}{b.useBy ? ` · use by ${ukDate(b.useBy)}` : ''} · <span className="font-mono text-gray-400">{b.batchId}</span> <TxLink hash={b.txHash} label="Cutting record" className="ml-1" /></p>
              {b.allergens?.length > 0 && <p className="text-xs text-amber-800">⚠️ Contains: {b.allergens.join(', ')}</p>}
            </div>
            <LeftBar b={b} small />
          </div>
        </div>
        {!working && (
          <div className="flex gap-2 mt-2 items-center flex-wrap pl-6">
            <button onClick={() => openForm(b, 'send')} className="bg-green-600 text-white text-xs font-semibold px-2.5 py-1 rounded-lg hover:bg-green-700">🚚 Send</button>
            <button onClick={() => openForm(b, 'cut')} className="text-xs border border-gray-300 px-2.5 py-1 rounded-lg hover:bg-gray-50" title="e.g. turn steaks or trim into mince, burgers or cured meat">⚙️ Process further</button>
            <button onClick={() => labels([b])} className="text-xs border border-gray-300 px-2.5 py-1 rounded-lg hover:bg-gray-50" title="Labels with a QR code to where it came from">🏷️ Labels{b.pieces ? ` (${b.pieces})` : ''}</button>
            <button onClick={() => recall(b)} className="text-xs text-gray-500 hover:text-red-700 hover:underline ml-auto">Recall…</button>
          </div>
        )}
        {forms(b)}
      </div>
    );
  };

  // v4.4: printable labels with a QR code to the product's journey — one per piece/pack if the pieces are known
  const [labelHint, setLabelHint] = useState(false);
  const labelsFor = (list) => list.flatMap(b => {
    const kill = (b.carcasses || []).map(id => byId[id]?.lotRef).filter(Boolean).join(', ') || (b.kind === 'Slaughter' ? b.lotRef : null);
    const at = [data.me.approvalNumber, data.me.name && `(${data.me.name})`].filter(Boolean).join(' ') || null;
    const n = b.pieces && b.pieces <= 60 ? b.pieces : 1;
    const each = n > 1 ? Math.round((b.remaining / n) * 1000) / 1000 : b.remaining;
    return Array.from({ length: n }, () => ({
      productName: b.productName, quantity: each, unit: b.unit, useBy: b.useBy, batchId: b.batchId, farmName: b.farmName,
      animalRef: b.animalRef, killNumber: kill, slaughteredAt: at, cutAt: b.kind !== 'Slaughter' ? at : null,
      allergens: b.allergens || [], url: batchLink(b.batchId),
    }));
  });
  const labels = (list) => setLabelHint(printLabels(labelsFor(list)) === false);

  const sendSelected = async () => {
    const calls = pickedList.map(b => ({
      path: '/processor/dispatch',
      body: { batchId: b.batchId, to: bulk.to, quantity: Number(bulk.qty[b.batchId] ?? b.remaining), via: bulk.via || undefined, notes: bulk.notes, senderRef: bulk.senderRef || undefined },
      label: `${b.productName} ${formatQty(Number(bulk.qty[b.batchId] ?? b.remaining), b.unit)}`
    }));
    const n = await postMany('bulk', calls, setStep);
    setStep(null);
    if (n === calls.length) { setBulk(null); setPicked({}); }
    else setPicked(Object.fromEntries(pickedList.slice(n).map(b => [b.batchId, true])));
  };

  // History: everything made here, newest first, searchable
  const needle = q.trim().toLowerCase();
  const hit = (b) => !!b && [b.productName, b.lotRef, b.animalRef, b.batchId, b.farmName].some(v => String(v || '').toLowerCase().includes(needle));
  // A kill number or ear tag also finds everything cut from that carcass
  const history = [...all].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .filter(b => !needle || hit(b) || (b.carcasses || []).some(id => hit(byId[id])));

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex justify-between items-center mb-1 flex-wrap gap-2">
        {askNode}
        <h3 className="text-lg font-bold text-gray-800">Carcasses & cuts</h3>
        {labelHint && <p className="w-full text-xs text-red-600">Your browser blocked the print window: allow pop-ups for this site, then try 🏷️ Labels again.</p>}
        <div className="flex text-xs border border-gray-300 rounded-lg overflow-hidden">
          {[['now', 'Here now'], ['history', `📜 History (${all.length})`]].map(([k, label]) => (
            <button key={k} onClick={() => setView(k)} className={`px-3 py-1.5 ${view === k ? 'bg-gray-800 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>{label}</button>
          ))}
        </div>
      </div>

      {view === 'history' ? (
        <>
          <p className="text-sm text-gray-500 mb-3">Everything cut or made here, including what's been used up or sent. Recalling anything also recalls what was made from it, wherever it is now.</p>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: kill no., ear tag, product, farm or batch ID (a kill no. finds its cuts too)"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3" />
          {history.length === 0 && <p className="text-sm text-gray-500">Nothing matches.</p>}
          <div className="divide-y divide-gray-100">
            {history.map(b => (
              <div key={b.batchId} className="py-2 flex justify-between gap-3 items-start">
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-gray-800">{b.kind === 'Slaughter' ? '🥩 ' : ''}{b.productName} <span className="font-normal text-gray-500">· {b.farmName || 'several farms'}</span></p>
                  <p className="text-xs text-gray-500">{refOf(b)}{b.animalRef ? ` · ${b.animalRef}` : ''} · made {ukDate(b.createdAt)} · <span className="font-mono">{b.batchId}</span> <TxLink hash={b.txHash} className="ml-1" /></p>
                  {b.parents?.length > 0 && b.kind !== 'Slaughter' && (
                    <p className="text-xs text-gray-400">from {b.parents.map(id => byId[id] ? `${byId[id].productName}${byId[id].lotRef ? ` (${byId[id].lotRef})` : ''}` : id).join(' + ')}</p>
                  )}
                </div>
                <div className="text-right shrink-0 text-xs">
                  {b.recalled ? <p className="text-red-700 font-semibold">🚨 Recalled</p>
                    : <p className={b.remaining > 0 ? 'text-gray-800 font-semibold' : 'text-gray-500'}>{b.remaining > 0 ? `${formatQty(b.remaining, b.unit)} left` : 'all used / sent'}</p>}
                  {!b.recalled && <button onClick={() => recall(b)} disabled={busy !== null} className="text-gray-500 hover:text-red-700 hover:underline">Recall…</button>}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-gray-500 mb-4">Cut each carcass into products, then send them to cafés or back to the farm. Tick several products to send them together.</p>
          {shown.length === 0 && <p className="text-sm text-gray-500">Nothing here right now. Record a kill sheet first{all.length ? ', or look in History' : ''}.</p>}
          <div className="space-y-4">
            {shown.map(g => {
              const pre = waiting.filter(o => o.farmerAddress === g.key && (o.toCut ?? o.suggestion.shortBy) > 0);
              const nCarc = g.carcasses.filter(c => live(c.carcass)).length;
              const nProd = g.carcasses.reduce((n, c) => n + c.products.length, 0) + g.other.length;
              return (
                <div key={g.key} className="border border-gray-300 rounded-xl overflow-hidden">
                  <button onClick={() => setCollapsed({ ...collapsed, [g.key]: !collapsed[g.key] })}
                    className="w-full flex justify-between items-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-left">
                    <span className="font-bold text-gray-800">{collapsed[g.key] ? '▸' : '▾'} {g.farmName}</span>
                    <span className="text-xs text-gray-600">
                      {[nCarc && `${nCarc} carcass${nCarc === 1 ? '' : 'es'}`, nProd && `${nProd} product${nProd === 1 ? '' : 's'}`, pre.length && `📋 ${pre.length} to cut to order`].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                  {!collapsed[g.key] && (
                    <div className="p-3 space-y-3">
                      {pre.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-900">
                          <p className="font-semibold">📋 Cut to order for {g.farmName}:</p>
                          <p>{pre.map(o => `${o.productName} ${formatQty(o.toCut ?? o.suggestion.shortBy, o.unit)}${(o.toCut ?? o.suggestion.shortBy) < o.quantity ? ' more' : ''} (${o.restaurantName}${o.neededUntil ? `, by ${ukDate(o.neededUntil)}` : ''})`).join(' · ')}</p>
                        </div>
                      )}
                      {g.carcasses.map(carcassCard)}
                      {g.other.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-gray-500">From several carcasses or other stock</p>
                          {g.other.map(productCard)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Send several together */}
          {pickedList.length > 0 && (
            <div className="sticky bottom-2 mt-4 bg-white border-2 border-green-600 rounded-xl shadow-lg p-3 space-y-3">
              <div className="flex justify-between items-center gap-2 flex-wrap">
                <p className="text-sm font-bold text-gray-800">
                  {pickedList.length} selected · {formatQty(round3(pickedList.reduce((n, b) => n + Number(bulk?.qty[b.batchId] ?? b.remaining), 0)), pickedList[0].unit)}
                </p>
                <div className="flex gap-2">
                  {!bulk && <button onClick={() => setBulk({ to: '', via: '', notes: '', qty: {} })} className="bg-green-600 text-white text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-green-700">🚚 Send selected</button>}
                  {!bulk && <button onClick={() => labels(pickedList)} className="text-sm border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50">🏷️ Labels</button>}
                  <button onClick={() => { setPicked({}); setBulk(null); }} className="text-sm text-gray-600 hover:underline">Clear</button>
                </div>
              </div>
              {bulk && (
                <>
                  <div className="space-y-1">
                    {pickedList.map(b => {
                      const v = bulk.qty[b.batchId] ?? String(b.remaining);
                      const bad = !(Number(v) > 0) || Number(v) > b.remaining;
                      return (
                        <div key={b.batchId} className="flex items-center gap-2 text-sm flex-wrap">
                          <span className="flex-1 min-w-[10rem]">{b.productName} <span className="text-xs text-gray-500">{b.farmName} · {formatQty(b.remaining, b.unit)} left</span></span>
                          <input type="number" step="any" min="0.001" max={b.remaining} value={v}
                            onChange={(e) => setBulk({ ...bulk, qty: { ...bulk.qty, [b.batchId]: e.target.value } })}
                            className={`w-24 px-2 py-1 border rounded ${bad ? 'border-red-500 bg-red-50' : 'border-gray-300'}`} />
                          <span className="text-gray-500">{b.unit}</span>
                          {step !== null && busy === 'bulk' && pickedList.indexOf(b) === step && <span className="text-xs text-gray-500">⛓️ sending…</span>}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <label className="flex-1 min-w-[12rem] text-xs font-semibold text-gray-700">Send all to <Req />
                      <select value={bulk.to} onChange={(e) => setBulk({ ...bulk, to: e.target.value })} className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded bg-white text-sm font-normal">
                        <option value="">Choose…</option>
                        {participants.filter(p => p.address !== data.me.address).map(p => <option key={p.address} value={p.address}>{p.name} ({p.role === 'farm' ? 'farm' : p.role === 'restaurant' ? 'restaurant' : p.processorApproval ? 'processor' : 'depot'})</option>)}
                      </select>
                    </label>
                    <label className="flex-1 min-w-[10rem] text-xs font-semibold text-gray-700">Delivery
                      <select value={bulk.via} onChange={(e) => setBulk({ ...bulk, via: e.target.value })} className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded bg-white text-sm font-normal">
                        <option value="">Direct (own delivery)</option>
                        {participants.filter(p => p.role === 'handler' && p.address !== bulk.to && p.address !== data.me.address).map(p => <option key={p.address} value={p.address}>via {p.name}</option>)}
                      </select>
                    </label>
                  </div>
                  <input value={bulk.notes} maxLength={280} onChange={(e) => setBulk({ ...bulk, notes: e.target.value })} placeholder="Notes for every box (optional), e.g. vac-packed, 2 crates"
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                  <RefInput value={bulk.senderRef} onChange={(v) => setBulk({ ...bulk, senderRef: v })} className="w-full" />
                  <p className="text-xs text-gray-500">Each product goes as its own delivery, so each one keeps its own trace back to the farm.</p>
                  <div className="flex gap-2 items-center">
                    <button disabled={busy !== null || !bulk.to || pickedList.some(b => { const v = Number(bulk.qty[b.batchId] ?? b.remaining); return !(v > 0) || v > b.remaining; })}
                      onClick={sendSelected} className="bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400">
                      {busy === 'bulk' ? `⛓️ Sending ${(step ?? 0) + 1} of ${pickedList.length}…` : `🚚 Send ${pickedList.length} deliveries`}
                    </button>
                    <button onClick={() => setBulk(null)} className="text-sm text-gray-600 hover:underline">Back</button>
                    <span className="text-xs text-gray-400 ml-auto"><Req /> required</span>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SendForm({ b, sendOf, setSendOf, me, participants, post, busy, onClose }) {
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
      <RefInput value={sendOf.senderRef} onChange={(v) => setSendOf({ ...sendOf, senderRef: v })} className="w-full" />
      {missing.length > 0 && <p className="text-xs text-gray-500">Still needed: {missing.join(', ')}</p>}
      <div className="flex gap-2 items-center">
        <button disabled={busy !== null || missing.length > 0} onClick={async () => {
          const r = await post(`s${b.batchId}`, '/processor/dispatch', { ...sendOf, quantity: qty, via: sendOf.via || undefined }, `${b.productName} sent`);
          if (r) onClose();
        }} className="bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400">
          {busy === `s${b.batchId}` ? '⛓️ Recording…' : '🚚 Send'}
        </button>
        <button onClick={onClose} className="text-sm text-gray-600 hover:underline">Cancel</button>
        <span className="text-xs text-gray-400 ml-auto"><Req /> required</span>
      </div>
    </div>
  );
}

// ── Cutting / processing form ──
// You fill in what you USED, any WASTE and any ADDED ingredients; the last product's weight works itself out
// (used + added − waste − the other products). Type over it if you weighed it.
const KINDS = {
  Cutting: 'Cutting (steaks, joints, diced)',
  Mincing: 'Mincing',
  'Sausage making': 'Sausages / burgers',
  Curing: 'Curing (bacon, ham)',
  Marinating: 'Marinating / seasoning',
  Packing: 'Packing only',
};
const ADD_HINT = {
  Cutting: 'e.g. a marinade or seasoning rub',
  Mincing: 'e.g. seasoning',
  'Sausage making': 'e.g. rusk, water, salt, herbs',
  Curing: 'e.g. salt, sugar, cure (sodium nitrite)',
  Marinating: 'e.g. oil, garlic, herbs',
  Packing: 'e.g. a sauce or glaze',
};
const blankOut = () => ({ productName: '', quantity: '', pieces: '', useBy: '', touched: false });

function CutForm({ first, all, data, post, busy, onClose }) {
  const isCarcass = first.kind === 'Slaughter';
  const [kind, setKind] = useState(isCarcass ? 'Cutting' : 'Mincing');
  const [inputs, setInputs] = useState([{ batchId: first.batchId, quantity: '' }]);
  const [outputs, setOutputs] = useState([blankOut()]);
  const [waste, setWaste] = useState('');
  const [showAdded, setShowAdded] = useState(false);
  const [added, setAdded] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [allergens, setAllergens] = useState([]);
  const [lotRef, setLotRef] = useState('');
  const [notes, setNotes] = useState('');
  const [mixing, setMixing] = useState(false);
  const unit = first.unit;
  const addedOpen = kind !== 'Cutting' || showAdded;

  // Cut names: anything pre-ordered from this farm first, then the usual cuts for the animal
  const ordered = data.orders.filter(o => o.farmerAddress === first.farmAddress && !o.ready).map(o => o.productName);
  const suggestions = [...new Set([...ordered, ...(CUTS[first.species] || [])])];

  const n = (v) => Number(v) || 0;
  const batchOf = (id) => all.find(x => x.batchId === id) || first;
  const usedTotal = round3(inputs.reduce((t, i) => t + n(i.quantity), 0));
  const addedQty = addedOpen ? n(added) : 0;
  const available = round3(usedTotal + addedQty - n(waste));
  const last = outputs.length - 1;
  const autoIdx = !outputs[last].touched && outputs.slice(0, last).every(o => o.touched) ? last : null;
  const manualSum = round3(outputs.reduce((t, o, k) => t + (k === autoIdx ? 0 : n(o.quantity)), 0));
  const autoVal = autoIdx !== null ? round3(available - manualSum) : null;
  const weightOf = (k) => (k === autoIdx ? Math.max(0, autoVal) : n(outputs[k].quantity));
  const madeTotal = round3(outputs.reduce((t, _, k) => t + weightOf(k), 0));
  const balance = round3(available - madeTotal);

  const setIn = (i, k, v) => setInputs(inputs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const setOut = (i, k, v) => setOutputs(outputs.map((x, j) => (j === i ? { ...x, [k]: v, ...(k === 'quantity' ? { touched: true } : {}) } : x)));
  // A new product takes whatever is left; the ones above keep what you typed (an auto one is cleared for you to fill in)
  const addOut = () => setOutputs([...outputs.map(o => (o.touched ? o : { ...o, touched: true, quantity: '' })), { ...blankOut(), useBy: outputs[last].useBy }]);
  // Same product again (e.g. a second lot of steaks from the other side): copies the name, use-by and piece count
  const copyOut = (k) => setOutputs([...outputs.map(o => (o.touched ? o : { ...o, touched: true, quantity: '' })),
    { ...blankOut(), productName: outputs[k].productName, useBy: outputs[k].useBy, pieces: outputs[k].pieces }]);
  const others = all.filter(b => b.unit === unit && !inputs.some(i => i.batchId === b.batchId));
  const toggleAllergen = (a) => setAllergens(allergens.includes(a) ? allergens.filter(x => x !== a) : [...allergens, a]);

  const overUsed = inputs.find(i => n(i.quantity) > batchOf(i.batchId).remaining);
  const missing = [
    usedTotal <= 0 && 'how much you used',
    overUsed && `${batchOf(overUsed.batchId).productName} only has ${formatQty(batchOf(overUsed.batchId).remaining, unit)} left`,
    outputs.some(o => !o.productName.trim()) && 'a name for each product',
    usedTotal > 0 && outputs.some((_, k) => !(weightOf(k) > 0)) && 'a weight for each product',
    outputs.some(o => !o.useBy) && 'a use-by date for each product',
    usedTotal > 0 && balance !== 0 && 'the weights to add up',
    (addedQty > 0 || allergens.length > 0) && !ingredients.trim() && 'the ingredients list',
  ].filter(Boolean);

  const submit = async () => {
    const r = await post('cut', '/processor/process', {
      kind, lotRef, notes, waste: n(waste), added: addedQty,
      ingredients: addedOpen && (addedQty > 0 || ingredients.trim()) ? ingredients.trim() : undefined,
      allergens: addedOpen ? allergens : [],
      inputs: inputs.filter(i => n(i.quantity) > 0).map(i => ({ batchId: i.batchId, quantity: n(i.quantity) })),
      outputs: outputs.map((o, k) => ({ productName: o.productName.trim(), quantity: weightOf(k), useBy: o.useBy, pieces: Number(o.pieces) > 0 ? Math.round(Number(o.pieces)) : undefined }))
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
                className={`w-28 px-2 py-1 border rounded ${over ? 'border-red-500 bg-red-50' : 'border-gray-300'}`} aria-label="Weight used (required)" />
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
            {others.map(b => <option key={b.batchId} value={b.batchId}>{b.productName} · {b.farmName || ''} · {b.lotRef || b.batchId} · {formatQty(b.remaining, unit)} left</option>)}
          </select>
        ) : (
          <button onClick={() => setMixing(true)} className="text-xs text-blue-600 hover:underline mt-1">+ Mixing in another carcass or batch? (e.g. for mince)</button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
        <p className="text-sm font-bold text-gray-800">2. Waste{addedOpen ? ' and added ingredients' : ''}</p>
        <label className="block text-sm">Waste (bone, fat, trim, drip loss) <input type="number" step="any" min="0" value={waste} onChange={(e) => setWaste(e.target.value)} placeholder="0" className="w-20 px-2 py-1 border border-gray-300 rounded" /> {unit}</label>
        {!addedOpen ? (
          <button onClick={() => setShowAdded(true)} className="text-xs text-blue-600 hover:underline">+ Added anything? ({ADD_HINT.Cutting})</button>
        ) : (
          <div className="border-t border-gray-100 pt-2 space-y-2">
            <label className="block text-sm">Added ingredients <input type="number" step="any" min="0" value={added} onChange={(e) => setAdded(e.target.value)} placeholder="0" className="w-20 px-2 py-1 border border-gray-300 rounded" /> {unit}
              <span className="text-xs text-gray-500"> ({ADD_HINT[kind]})</span></label>
            <label className="block text-xs font-semibold text-gray-700">Ingredients {(addedQty > 0 || allergens.length > 0) && <Req />}
              <textarea value={ingredients} onChange={(e) => setIngredients(e.target.value)} maxLength={500} rows={2}
                placeholder="As on the label, biggest first, e.g. Beef (90%), rusk (wheat flour, salt), water, black pepper"
                className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-sm font-normal" />
            </label>
            <div>
              <p className="text-xs font-semibold text-gray-700">Allergens it contains <span className="font-normal text-gray-500">(tick all that apply; these are written on the blockchain)</span></p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-0.5 mt-1">
                {(data.allergenList || []).map(a => (
                  <label key={a} className="text-xs flex items-center gap-1.5">
                    <input type="checkbox" checked={allergens.includes(a)} onChange={() => toggleAllergen(a)} className="accent-amber-600" /> {a}
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">Rusk and breadcrumbs contain gluten; many cures and sausage mixes contain sulphites. Check each supplier's label.</p>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-3">
        <p className="text-sm font-bold text-gray-800">3. What did you make? <Req /></p>
        <p className="text-xs text-gray-500 mb-2">One line per product, with its total weight (e.g. 12 kg of sirloin steaks). The last product's weight fills itself in with what's left; type over it if you weighed it. Pieces is optional (e.g. 30 steaks).</p>
        {outputs.map((o, k) => {
          const auto = k === autoIdx;
          return (
            <div key={k} className="border border-gray-200 rounded-lg p-2 mb-2 space-y-1.5">
              <div className="flex gap-2 items-center">
                <input list="fp-cuts" value={o.productName} onChange={(e) => setOut(k, 'productName', e.target.value)} maxLength={100} placeholder="Product, e.g. Sirloin steak *"
                  className="flex-1 min-w-0 px-2 py-1 border border-gray-300 rounded text-sm" aria-label="Product name (required)" />
                <button onClick={() => copyOut(k)} className="text-xs text-gray-600 border border-gray-300 rounded px-1.5 py-0.5 hover:bg-gray-50" title="Add another line for the same product" aria-label="Duplicate product">⧉ copy</button>
                {outputs.length > 1 && <button onClick={() => setOutputs(outputs.filter((_, j) => j !== k))} className="text-xs text-red-600 px-1" aria-label="Remove product">✕</button>}
              </div>
              <div className="flex gap-x-4 gap-y-1.5 items-center flex-wrap text-xs text-gray-600">
                <label className="flex items-center gap-1">Total weight <Req />
                  <input type="number" step="any" min="0" value={auto ? (usedTotal > 0 ? String(Math.max(0, autoVal)) : '') : o.quantity}
                    onChange={(e) => setOut(k, 'quantity', e.target.value)} placeholder="0.0"
                    className={`w-20 px-2 py-1 border rounded text-sm ${auto && usedTotal > 0 ? 'border-green-400 bg-green-50' : 'border-gray-300'}`} aria-label="Weight (required)" />
                  {unit}{auto && usedTotal > 0 && <span className="text-[10px] font-semibold text-green-700 uppercase">auto</span>}
                </label>
                <label className="flex items-center gap-1">Pieces
                  <input type="number" min="1" step="1" value={o.pieces} onChange={(e) => setOutputs(outputs.map((x, j) => (j === k ? { ...x, pieces: e.target.value } : x)))}
                    placeholder="—" className="w-14 px-2 py-1 border border-gray-300 rounded text-sm" aria-label="Pieces (optional)" />
                  {Number(o.pieces) > 0 && weightOf(k) > 0 && <span className="text-gray-500">≈ {Math.round((weightOf(k) / Number(o.pieces)) * 1000)} g each</span>}
                </label>
                <label className="flex items-center gap-1">Use by <Req />
                  <input type="date" min={today()} value={o.useBy} onChange={(e) => setOut(k, 'useBy', e.target.value)}
                    className="px-1 py-1 border border-gray-300 rounded text-sm" aria-label="Use by (required)" />
                </label>
              </div>
              {k === last && !auto && o.touched && autoIdx === null && outputs.slice(0, last).every(x => x.touched) && usedTotal > 0 && (
                <button onClick={() => setOutputs(outputs.map((x, j) => (j === k ? { ...x, touched: false } : x)))} className="text-xs text-blue-600 hover:underline">
                  ↺ Work this weight out for me (whatever's left)
                </button>
              )}
            </div>
          );
        })}
        <datalist id="fp-cuts">{suggestions.map(c => <option key={c} value={c} />)}</datalist>
        <button onClick={addOut} className="text-xs text-blue-600 hover:underline">+ another product</button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <input value={lotRef} onChange={(e) => setLotRef(e.target.value)} maxLength={64} placeholder="Lot code (optional)" className="w-40 px-2 py-1 border border-gray-300 rounded text-sm" />
        <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} placeholder="Public notes (optional), e.g. dry-aged 21 days" className="flex-1 min-w-[12rem] px-2 py-1 border border-gray-300 rounded text-sm" />
      </div>

      {/* Weight check */}
      {usedTotal > 0 && (
        <div className={`rounded-lg p-3 text-sm border ${balance === 0 && madeTotal > 0 ? 'bg-green-50 border-green-300 text-green-800'
          : balance < 0 || (autoIdx !== null && autoVal < 0) ? 'bg-red-50 border-red-300 text-red-700' : 'bg-amber-50 border-amber-300 text-amber-800'}`}>
          <p className="font-semibold">
            Used {formatQty(usedTotal, unit)}{addedQty ? ` + ${formatQty(addedQty, unit)} added` : ''}{n(waste) ? ` − ${formatQty(n(waste), unit)} waste` : ''} = {formatQty(Math.max(0, available), unit)} of product
          </p>
          {balance === 0 && madeTotal > 0 && (
            <p>✓ {outputs.map((o, k) => `${o.productName.trim() || 'product'} ${formatQty(weightOf(k), unit)}`).join(' + ')}</p>
          )}
          {autoIdx !== null && autoVal <= 0 && (
            <p>{autoVal < 0 ? `The products above already weigh ${formatQty(-autoVal, unit)} more than that. Check the weights.` : `Nothing is left for the last product. Remove it, or lower the weights above.`}</p>
          )}
          {autoIdx === null && balance > 0 && (
            <div className="mt-1 space-y-1">
              <p>{formatQty(balance, unit)} still to share out: put it on a product, or count it as waste.</p>
              <button onClick={() => setWaste(String(round3(n(waste) + balance)))} className="text-xs bg-white border border-amber-400 px-2 py-1 rounded hover:bg-amber-100">
                Count {formatQty(balance, unit)} as waste
              </button>
              <span className="text-xs text-amber-700"> (you can change the waste box again afterwards)</span>
            </div>
          )}
          {autoIdx === null && balance < 0 && <p>The products weigh {formatQty(-balance, unit)} more than that. Check the weights.</p>}
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
      <p className="text-xs text-gray-400">The blockchain checks that products + waste never weigh more than what was used plus anything added. <a href={EXPLORER} target="_blank" rel="noopener noreferrer" className="underline">Base Sepolia</a></p>
    </div>
  );
}

// ── 4. Café orders to send ──
// Cafés order a farm's cuts; the abattoir holding them sends them (soonest use-by first), with the agreed terms fingerprinted.
// Part of an order can be sent: the rest stays open (back-order) or is closed with a message to the café.
function OrdersToSend({ data, post, busy, participants }) {
  const [form, setForm] = useState({});        // orderId → { via, notes, qty: { batchId: '2' }, close, note }
  const [openId, setOpenId] = useState(null);  // a waiting order whose "send what's here" form is open
  const sendable = (o) => o.suggestion.allocations.length > 0;
  const ready = data.orders.filter(o => o.ready || openId === o.id);
  const waiting = data.orders.filter(o => !o.ready && openId !== o.id);
  const f = (id) => form[id] || { via: '', notes: '', qty: {}, close: false, note: '', frozen: null };
  const setF = (id, patch) => setForm({ ...form, [id]: { ...f(id), ...patch } });
  const gbp = (v) => `£${Number(v).toFixed(2)}`;
  const sentLine = (o) => (o.quantitySent > 0 ? ` · ${formatQty(o.quantitySent, o.unit)} of ${formatQty(o.quantity, o.unit)} already sent` : '');

  const [ask, askNode] = useAsk();
  const closeRest = async (o) => {
    const note = await ask({ title: `Close the remaining ${formatQty(o.outstanding, o.unit)} of ${o.productName}?`, text: `For ${o.restaurantName}. They'll see your message.`,
      input: { placeholder: 'Message to the café, e.g. no more to cut this week' }, confirmLabel: 'Close the rest', danger: true });
    if (note !== null) post(`c${o.id}`, `/processor/orders/${o.id}/close-rest`, { note: note.trim() }, `Rest of the ${o.productName} order closed`);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      {askNode}
      <h3 className="text-lg font-bold text-gray-800 mb-1">Café orders to send</h3>
      <p className="text-sm text-gray-500 mb-3">Cafés order cuts from a farm's meat prices. When the cuts are here, send them straight to the café, all at once or part now and the rest later.</p>
      {data.orders.length === 0 && <p className="text-sm text-gray-500">No café orders for meat you're holding.</p>}

      {ready.length > 0 && (
        <div className="space-y-3 mb-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">✅ Ready to send ({ready.length})</p>
          {ready.map(o => {
            const F = f(o.id);
            const qtyOf = (a) => Number(F.qty[a.batchId] ?? a.quantity) || 0;
            const sending = round3(o.suggestion.allocations.reduce((n, a) => n + qtyOf(a), 0));
            const left = o.outstanding ?? o.quantity;
            const bad = o.suggestion.allocations.some(a => qtyOf(a) > a.remaining) || sending > left;
            return (
              <div key={o.id} className="border-2 border-green-200 bg-green-50 rounded-lg p-3 space-y-2">
                <div className="flex justify-between gap-2 flex-wrap">
                  <div>
                    <p className="font-semibold text-gray-800">{formatQty(left, o.unit)} {o.productName} → {o.restaurantName}
                      {o.frozen && <span className="ml-2 text-xs font-semibold bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded">❄️ frozen please</span>}</p>
                    <Refs x={o} />
                    <p className="text-xs text-gray-600">
                      {o.farmName}'s meat{o.preOrder ? ' · pre-order' : ''}{o.neededUntil ? ` · needed by ${ukDate(o.neededUntil)}` : ''} · ordered {ukDate(o.createdAt)}{sentLine(o)}
                    </p>
                    {o.note && <p className="text-xs italic text-gray-600">"{o.note}"</p>}
                  </div>
                  {o.unitPrice !== null && <p className="text-sm text-gray-700 text-right">{gbp(o.unitPrice)}/{o.unit}<br /><span className="font-semibold">{gbp(o.unitPrice * sending)}</span></p>}
                </div>
                <div className="text-xs text-gray-700 bg-white border border-green-100 rounded p-2 space-y-1">
                  <p className="font-semibold">Send from (soonest use-by first) — change the amounts to send less:</p>
                  {o.suggestion.allocations.map(a => (
                    <div key={a.batchId} className="flex items-center gap-2 flex-wrap">
                      <input type="number" step="any" min="0" max={a.remaining} value={F.qty[a.batchId] ?? String(a.quantity)}
                        onChange={(e) => setF(o.id, { qty: { ...F.qty, [a.batchId]: e.target.value } })}
                        className={`w-20 px-2 py-0.5 border rounded ${qtyOf(a) > a.remaining ? 'border-red-500' : 'border-gray-300'}`} aria-label="Kg to send" />
                      <span>{o.unit} from <span className="font-mono">{a.batchId}</span>{a.lotRef ? ` · lot ${a.lotRef}` : ''}{a.useBy ? ` · use by ${ukDate(a.useBy)}` : ''}{a.allergens?.length ? ` · contains ${a.allergens.join(', ')}` : ''}</span>
                    </div>
                  ))}
                  {o.suggestion.shortBy > 0 && <p className="text-amber-700">Only {formatQty(round3(left - o.suggestion.shortBy), o.unit)} here: {formatQty(o.suggestion.shortBy, o.unit)} short.</p>}
                </div>
                {sending > 0 && sending < left && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-sm space-y-1">
                    <p className="font-semibold text-amber-900">That leaves {formatQty(round3(left - sending), o.unit)}. What happens to it?</p>
                    <label className="flex items-start gap-2"><input type="radio" className="mt-1" checked={!F.close} onChange={() => setF(o.id, { close: false })} />
                      <span><strong>Keep it open</strong> (back-order): send it once it's cut. It stays on this list.</span></label>
                    <label className="flex items-start gap-2"><input type="radio" className="mt-1" checked={F.close} onChange={() => setF(o.id, { close: true })} />
                      <span><strong>Close the rest</strong>: tell the café it isn't coming.</span></label>
                    {F.close && <input value={F.note} maxLength={200} onChange={(e) => setF(o.id, { note: e.target.value })} placeholder="Message to the café, e.g. no more ribeye until next week"
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />}
                  </div>
                )}
                <div className="flex flex-wrap gap-3 items-center">
                  <FrozenChoice value={F.frozen} wanted={o.frozen} disabled={busy !== null} onChange={(v) => setF(o.id, { frozen: v })} />
                  <RefInput value={F.senderRef} onChange={(v) => setF(o.id, { senderRef: v })} disabled={busy !== null} className="flex-1 min-w-[12rem]" />
                </div>
                <div className="flex gap-2 flex-wrap items-center">
                  <select value={F.via} onChange={(e) => setF(o.id, { via: e.target.value })} className="px-2 py-1.5 border border-gray-300 rounded bg-white text-sm">
                    <option value="">Direct (own delivery)</option>
                    {participants.filter(p => p.role === 'handler' && p.address !== data.me.address).map(p => <option key={p.address} value={p.address}>via {p.name}</option>)}
                  </select>
                  <input value={F.notes} maxLength={280} onChange={(e) => setF(o.id, { notes: e.target.value })}
                    placeholder="Notes (optional), e.g. vac-packed, 1 box" className="flex-1 min-w-[10rem] px-2 py-1.5 border border-gray-300 rounded text-sm" />
                  <button disabled={busy !== null || !(sending > 0) || bad} onClick={async () => {
                    const r = await post(`o${o.id}`, `/processor/orders/${o.id}/dispatch`, {
                      allocations: o.suggestion.allocations.filter(a => qtyOf(a) > 0).map(a => ({ batchId: a.batchId, quantity: qtyOf(a) })),
                      via: F.via || undefined, notes: F.notes,
                      ...(sending < left && F.close ? { closeRest: true, shortNote: F.note || undefined } : {}),
                      ...frozenBody(F.frozen, o.frozen), senderRef: F.senderRef || undefined,
                    }, (d) => d.status === 'part_sent' ? `${formatQty(sending, o.unit)} sent to ${o.restaurantName}; ${formatQty(d.outstanding, o.unit)} kept open`
                      : d.status === 'closed_short' ? `${formatQty(sending, o.unit)} sent; the rest closed` : `${o.productName} sent to ${o.restaurantName}`);
                    if (r) { setForm({ ...form, [o.id]: undefined }); setOpenId(null); }
                  }} className="bg-green-600 text-white text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-green-700 disabled:bg-gray-400">
                    {busy === `o${o.id}` ? '⛓️ Sending…' : sending < left ? `🚚 Send ${formatQty(sending, o.unit)} now` : '🚚 Send order'}
                  </button>
                  {openId === o.id && <button onClick={() => setOpenId(null)} className="text-sm text-gray-600 hover:underline">Cancel</button>}
                  {o.quantitySent > 0 && <button onClick={() => closeRest(o)} disabled={busy !== null} className="text-xs text-gray-500 hover:text-red-700 hover:underline ml-auto">Close the rest…</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {waiting.length > 0 && (
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">📋 Waiting to be cut ({waiting.length})</p>
          <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
            {waiting.map(o => {
              const left = o.outstanding ?? o.quantity;
              const have = round3(left - o.suggestion.shortBy);
              return (
                <div key={o.id} className="px-3 py-2 text-sm space-y-1">
                  <div className="flex justify-between gap-2 flex-wrap">
                    <span><strong>{o.productName}</strong> {formatQty(left, o.unit)} for {o.restaurantName}{o.frozen ? ' ❄️' : ''} {o.orderRef && <span className="font-mono text-xs text-gray-500">{o.orderRef}</span>} <span className="text-gray-500">· {o.farmName}{o.neededUntil ? ` · by ${ukDate(o.neededUntil)}` : ''}{sentLine(o)}</span></span>
                    <span className="text-xs text-gray-500">
                      {[have > 0 && `${formatQty(have, o.unit)} ready here`, o.atFarm > 0 && `${formatQty(o.atFarm, o.unit)} at the farm (they can send it)`,
                        o.toCut > 0 && `${formatQty(o.toCut, o.unit)} still to cut`].filter(Boolean).join(' · ') || (o.preOrder ? 'pre-order: cut it next time' : 'none ready')}
                    </span>
                  </div>
                  <div className="flex gap-3">
                    {sendable(o) && <button onClick={() => setOpenId(o.id)} className="text-xs text-green-700 font-semibold hover:underline">🚚 Send the {formatQty(have, o.unit)} that's here now…</button>}
                    {o.quantitySent > 0 && <button onClick={() => closeRest(o)} disabled={busy !== null} className="text-xs text-gray-500 hover:text-red-700 hover:underline">Close the rest…</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// v4.5 — Today: from farm to cuts at a glance (arriving → waiting to kill → carcasses hanging → cuts), and café orders to pack
// ─────────────────────────────────────────────
function AbattoirToday({ data, go }) {
  const day = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');
  const daysSince = (d) => (d ? Math.max(0, Math.floor((Date.now() - new Date(d)) / 864e5)) : null);
  const live = (b) => !b.recalled && b.remaining > 0;
  const carcasses = data.madeHere.filter(b => live(b) && b.kind === 'Slaughter');
  const cuts = data.madeHere.filter(b => live(b) && b.kind !== 'Slaughter');
  const ready = data.orders.filter(o => o.ready);
  const fciMissing = [...data.animalsComing, ...data.animalsHere].filter(s => s.fciProvided === false).length;
  const kgIn = data.madeHere.filter(b => b.kind === 'Slaughter').reduce((n, b) => n + (b.unit === 'kg' ? b.quantity : 0), 0);
  const kgCut = data.madeHere.filter(b => b.kind !== 'Slaughter').reduce((n, b) => n + (b.unit === 'kg' ? b.quantity : 0), 0);
  const yieldPct = kgIn > 0 ? Math.round((kgCut / kgIn) * 100) : null;
  const cols = [
    ['🚛 Arriving', '#E2B04A', 'animals', data.animalsComing.map(s => ({ id: `a${s.shipmentId}`, top: s.animalRef || s.batchId, main: `${s.fromName} · ${formatQty(s.quantitySent, s.unit)} ${s.productName}`, tag: s.fciProvided === false ? ['FCI needed', 'bad'] : ['FCI ✓', 'ok'] }))],
    ['🔪 Waiting to kill', '#E0644B', 'kill', data.animalsHere.map(s => ({ id: `h${s.shipmentId}`, top: s.animalRef || s.batchId, main: `${s.fromName} · ${formatQty(s.available, s.unit)} ${s.productName}`, tag: s.fciProvided === false ? ['FCI needed', 'bad'] : ['Ready', 'ok'] }))],
    ['❄️ Carcasses hanging', '#6FA0C8', 'stock', carcasses.map(b => ({ id: b.batchId, top: b.lotRef ? `Kill no. ${b.lotRef}` : b.batchId, main: `${formatQty(b.remaining, b.unit)} ${b.productName}`, tag: [`${daysSince(b.madeOn || b.createdAt)} days · ${b.farmName || ''}`, 'n'] }))],
    ['🥩 Cuts in stock', '#2F6B3A', 'stock', cuts.map(b => ({ id: b.batchId, top: b.farmName || b.batchId, main: `${formatQty(b.remaining, b.unit)} ${b.productName}`, tag: [b.useBy ? `use by ${day(b.useBy)}` : 'no use-by', 'n'] }))],
  ];
  const tagCls = { bad: 'bg-red-100 text-red-800', ok: 'bg-green-100 text-green-800', n: 'bg-gray-100 text-gray-700' };
  const tile = (icon, value, label, sub, bg, t) => (
    <button onClick={() => go(t)} className="bg-white rounded-3xl border border-black/5 p-4 sm:p-5 text-left hover:shadow-md transition-shadow">
      <span className="w-10 h-10 rounded-xl flex items-center justify-center text-lg mb-3" style={{ background: bg }}>{icon}</span>
      <p className="text-2xl sm:text-3xl font-extrabold tracking-tight">{value}</p>
      <p className="text-sm text-gray-700 font-semibold">{label}</p>
      <p className="text-xs text-gray-500 mt-1">{sub}</p>
    </button>
  );
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {tile('🐄', data.animalsComing.length, 'Deliveries arriving', fciMissing ? `${fciMissing} still need FCI` : 'All have FCI', '#FBF0D6', 'animals')}
        {tile('🔪', data.animalsHere.length, 'Waiting to kill', 'On site now', '#FBE3DD', 'kill')}
        {tile('⚖️', yieldPct !== null ? `${yieldPct}%` : '—', 'Yield', 'Carcass weight → cuts made', '#E3EDE3', 'stock')}
        {tile('🧾', ready.length, 'Café orders to pack', `${data.orders.length} open in total`, '#F6F6F2', 'orders')}
      </div>
      <div className="bg-white rounded-3xl border border-black/5 p-5 sm:p-6">
        <h2 className="text-lg font-bold mb-4">From farm to cuts</h2>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {cols.map(([title, color, t, items]) => (
            <div key={title} className="rounded-2xl p-3 bg-gray-50">
              <button onClick={() => go(t)} className="w-full flex items-center justify-between mb-3 px-1 text-left">
                <span className="font-bold text-sm">{title}</span>
                <span className="w-6 h-6 rounded-full text-xs font-bold text-white flex items-center justify-center" style={{ background: color }}>{items.length}</span>
              </button>
              <div className="space-y-2">
                {items.length === 0 && <p className="text-xs text-gray-400 px-1">Nothing here</p>}
                {items.slice(0, 5).map(x => (
                  <button key={x.id} onClick={() => go(t)} className="w-full text-left bg-white rounded-xl border border-black/5 p-3 hover:shadow-sm" style={{ borderLeft: `4px solid ${color}` }}>
                    <p className="font-mono text-[11px] text-gray-500 truncate">{x.top}</p>
                    <p className="font-semibold text-sm">{x.main}</p>
                    <span className={`inline-block mt-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${tagCls[x.tag[1]]}`}>{x.tag[0]}</span>
                  </button>
                ))}
                {items.length > 5 && <button onClick={() => go(t)} className="text-xs font-semibold text-green-700 px-1">+{items.length - 5} more →</button>}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-3xl border border-black/5 p-5 sm:p-6">
        <div className="flex justify-between items-center mb-3"><h2 className="text-lg font-bold">🧾 Café orders</h2><button onClick={() => go('orders')} className="text-sm font-semibold text-green-700 hover:underline">Pack & send →</button></div>
        {data.orders.length === 0 ? <p className="text-sm text-gray-500">No café orders right now.</p> : (
          <div className="divide-y divide-black/5">
            {data.orders.slice(0, 6).map(o => (
              <div key={o.id} className="py-2.5 flex gap-3 items-center justify-between flex-wrap">
                <div><p className="font-semibold text-sm">{formatQty(o.quantity, o.unit || 'kg')} {o.productName} <span className="text-gray-500 font-normal">· {o.farmName || ''}</span></p>
                  <p className="text-xs text-gray-500">{o.restaurantName}{o.frozen ? ' · ❄️ frozen' : ''}{o.neededUntil ? ` · by ${day(o.neededUntil)}` : ''}</p></div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${o.ready ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>{o.ready ? 'Ready to pack' : 'Not cut yet'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}