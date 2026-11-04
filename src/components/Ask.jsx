// Ask — small in-page dialogs instead of the browser's own pop-ups (which look like errors on phones).
//   const [ask, askNode] = useAsk();      … render {askNode} somewhere in the component
//   await ask({ title, text })                                   → true / null          (a yes/no question)
//   await ask({ title, text, input: { placeholder, value } })    → the typed text / null
//   await ask({ title, text, okOnly: true })                     → true                 (just a message)
import { useState, useEffect, useRef } from 'react';

function AskModal({ title, text, input, okOnly, confirmLabel, cancelLabel, danger, onDone }) {
  const [value, setValue] = useState(input?.value ?? '');
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
    const esc = (e) => e.key === 'Escape' && onDone(okOnly ? true : null);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);
  const blocked = input?.required && !value.trim();
  const ok = () => { if (!blocked) onDone(input ? value : true); };
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-3" onClick={() => onDone(okOnly ? true : null)}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        {title && <p className="text-lg font-bold text-gray-900">{title}</p>}
        {text && <p className="text-sm text-gray-700 whitespace-pre-line">{text}</p>}
        {input && (
          input.multiline
            ? <textarea ref={ref} value={value} rows={3} maxLength={input.maxLength || 280} onChange={(e) => setValue(e.target.value)} placeholder={input.placeholder}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            : <input ref={ref} value={value} maxLength={input.maxLength || 280} onChange={(e) => setValue(e.target.value)} placeholder={input.placeholder}
                onKeyDown={(e) => e.key === 'Enter' && ok()} inputMode={input.numeric ? 'decimal' : undefined}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base" />
        )}
        <div className="flex gap-2 justify-end pt-1">
          {!okOnly && <button onClick={() => onDone(null)} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-100">{cancelLabel || 'Cancel'}</button>}
          <button ref={input ? undefined : ref} onClick={ok} disabled={blocked}
            className={`px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:bg-gray-400 ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-green-700 hover:bg-green-800'}`}>
            {confirmLabel || 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useAsk() {
  const [q, setQ] = useState(null);
  const ask = (opts) => new Promise(resolve => setQ({ ...opts, resolve }));
  const node = q ? <AskModal {...q} onDone={(v) => { q.resolve(v); setQ(null); }} /> : null;
  return [ask, node];
}