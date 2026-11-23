"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { saveView, deleteView } from "@/app/actions/views";
import { useDialog } from "./Dialog";

type Opt = { value: string; label: string };
export type Field =
  | { type: "search"; key: string; placeholder?: string }
  | { type: "select"; key: string; label: string; options: Opt[] }
  | { type: "multi"; key: string; label: string; options: Opt[] }
  | { type: "date"; from: string; to: string; label: string }
  | { type: "range"; min: string; max: string; label: string };

export type SavedViewLite = { id: string; name: string; query: string };

export function FilterBar({
  fields,
  database,
  storeId,
  views = [],
  right,
}: {
  fields: Field[];
  database?: string;
  storeId?: string | null;
  views?: SavedViewLite[];
  right?: React.ReactNode;
}) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const { dialog, prompt } = useDialog();
  const search = fields.find((f) => f.type === "search") as Extract<Field, { type: "search" }> | undefined;
  const [q, setQ] = useState(search ? (sp.get(search.key) ?? "") : "");
  const first = useRef(true);

  const push = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    start(() => router.replace(`${path}?${next.toString()}`, { scroll: false }));
  };

  useEffect(() => {
    if (!search) return;
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => push({ [search.key]: q.trim() || null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const filterKeys = fields.flatMap((f) =>
    f.type === "date" ? [f.from, f.to] : f.type === "range" ? [f.min, f.max] : f.type === "search" ? [] : [f.key],
  );
  const active = filterKeys.filter((k) => sp.get(k)).length;
  const params = new URLSearchParams(sp.toString());
  params.delete("page");
  const currentQuery = params.toString();
  const currentView = views.find((v) => v.query === currentQuery);

  return (
    <div className="mb-3 space-y-2">
      {dialog}
      <div className="flex flex-wrap items-center gap-2">
        {search && (
          <input
            className="input min-w-0 flex-1 md:max-w-sm"
            type="search"
            placeholder={search.placeholder ?? "Search…"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        )}
        {fields.length > 1 && (
          <button className={`btn ${active ? "border-navy" : ""}`} onClick={() => setOpen(!open)} aria-expanded={open}>
            Filters{active ? ` (${active})` : ""}
          </button>
        )}
        {active > 0 && (
          <button className="btn text-red" onClick={() => push(Object.fromEntries(filterKeys.map((k) => [k, null])))}>
            Clear
          </button>
        )}
        {database && views.length > 0 && (
          <select
            className="input w-auto"
            value={currentView?.id ?? ""}
            onChange={(e) => {
              const v = views.find((x) => x.id === e.target.value);
              start(() => router.replace(`${path}?${v?.query ?? ""}`));
            }}
          >
            <option value="">Views…</option>
            {views.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        )}
        {database && !currentView && (
          <button
            className="btn"
            onClick={async () => {
              const name = await prompt({ title: "Save view", input: { label: "View name", placeholder: "e.g. On hold this week", required: true }, confirmLabel: "Save" });
              if (name) start(() => saveView({ database, storeId: storeId ?? null, name, query: currentQuery }));
            }}
          >
            Save view
          </button>
        )}
        {currentView && (
          <button className="btn text-red" onClick={() => start(() => deleteView(currentView.id))}>
            Delete view
          </button>
        )}
        {pending && <span className="text-xs text-gray-400">Loading…</span>}
        {right && <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">{right}</div>}
      </div>

      {open && (
        <div className="panel grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
          {fields.map((f, i) => {
            if (f.type === "search") return null;
            if (f.type === "select")
              return (
                <div key={i}>
                  <label className="label">{f.label}</label>
                  <select className="input" value={sp.get(f.key) ?? ""} onChange={(e) => push({ [f.key]: e.target.value || null })}>
                    <option value="">All</option>
                    {f.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              );
            if (f.type === "multi") {
              const sel = new Set((sp.get(f.key) ?? "").split(",").filter(Boolean));
              return (
                <div key={i} className="sm:col-span-2">
                  <label className="label">{f.label}</label>
                  <div className="flex flex-wrap gap-1">
                    {f.options.map((o) => {
                      const on = sel.has(o.value);
                      return (
                        <button
                          key={o.value}
                          type="button"
                          className={`border px-2 py-1 text-xs ${on ? "border-navy bg-navy text-white" : "border-line bg-white"}`}
                          onClick={() => {
                            if (on) sel.delete(o.value);
                            else sel.add(o.value);
                            push({ [f.key]: [...sel].join(",") || null });
                          }}
                        >
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            }
            if (f.type === "date")
              return (
                <div key={i}>
                  <label className="label">{f.label}</label>
                  <div className="flex gap-1">
                    <input type="date" className="input" value={sp.get(f.from) ?? ""} onChange={(e) => push({ [f.from]: e.target.value || null })} />
                    <input type="date" className="input" value={sp.get(f.to) ?? ""} onChange={(e) => push({ [f.to]: e.target.value || null })} />
                  </div>
                </div>
              );
            return (
              <div key={i}>
                <label className="label">{f.label} ($)</label>
                <div className="flex gap-1">
                  <input inputMode="decimal" placeholder="min" className="input" defaultValue={sp.get(f.min) ?? ""} onBlur={(e) => push({ [f.min]: e.target.value || null })} />
                  <input inputMode="decimal" placeholder="max" className="input" defaultValue={sp.get(f.max) ?? ""} onBlur={(e) => push({ [f.max]: e.target.value || null })} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
