"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

type Opts = {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  /** when set, the dialog shows a text input (prompt mode) */
  input?: { label?: string; placeholder?: string; required?: boolean; multiline?: boolean };
};
type Pending = Opts & { resolve: (v: string | null) => void };

/**
 * In-app replacement for window.confirm / window.prompt.
 *   const { dialog, confirm, prompt } = useDialog();  ...render {dialog}
 *   if (await confirm({ title: "Delete?" })) ...
 *   const reason = await prompt({ title: "Cancel order", input: {} }); // null = dismissed
 */
export function useDialog() {
  const [pending, setPending] = useState<Pending | null>(null);

  const ask = useCallback((o: Opts) => new Promise<string | null>((resolve) => setPending({ ...o, resolve })), []);
  const confirm = useCallback(async (o: Omit<Opts, "input">) => (await ask(o)) !== null, [ask]);
  const prompt = useCallback((o: Opts) => ask({ ...o, input: o.input ?? {} }), [ask]);

  const close = (v: string | null) => {
    pending?.resolve(v);
    setPending(null);
  };

  return { dialog: pending ? <DialogView o={pending} onClose={close} /> : null, confirm, prompt };
}

function DialogView({ o, onClose }: { o: Opts; onClose: (v: string | null) => void }) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    (o.input ? inputRef.current : okRef.current)?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose(null);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [o.input, onClose]);

  const blocked = !!o.input?.required && !value.trim();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!blocked) onClose(o.input ? value.trim() : "");
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onMouseDown={() => onClose(null)}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="dlg-title"
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
        className={`w-full border-t-4 bg-white sm:max-w-md sm:border ${o.danger ? "border-t-red" : "border-t-navy"} sm:border-line`}
      >
        <div className="flex items-start justify-between gap-2 px-4 pt-4">
          <h2 id="dlg-title" className="font-bold text-navy">{o.title}</h2>
          <button type="button" className="btn h-8 w-8 px-0" aria-label="Close" onClick={() => onClose(null)}><X size={16} /></button>
        </div>
        <div className="space-y-3 px-4 py-3">
          {o.message && <p className="text-sm text-gray-600">{o.message}</p>}
          {o.input && (
            <div>
              {o.input.label && <label className="label" htmlFor="dlg-input">{o.input.label}</label>}
              {o.input.multiline ? (
                <textarea id="dlg-input" ref={inputRef} rows={3} className="input h-auto py-2" placeholder={o.input.placeholder} value={value} onChange={(e) => setValue(e.target.value)} maxLength={500} />
              ) : (
                <input id="dlg-input" ref={inputRef} className="input" placeholder={o.input.placeholder} value={value} onChange={(e) => setValue(e.target.value)} maxLength={120} />
              )}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-line bg-soft px-4 py-3">
          <button type="button" className="btn" onClick={() => onClose(null)}>Back</button>
          <button ref={okRef} className={o.danger ? "btn-danger" : "btn-primary"} disabled={blocked}>{o.confirmLabel ?? "OK"}</button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
