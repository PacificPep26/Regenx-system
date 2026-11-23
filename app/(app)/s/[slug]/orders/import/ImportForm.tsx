"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Papa from "papaparse";
import { importOrders, type ImportResult, type ImportRow } from "@/app/actions/import";
import { IMPORT_COLUMNS } from "@/lib/schemas";

export function ImportForm({ storeId, slug }: { storeId: string; slug: string }) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileErr, setFileErr] = useState<string>();
  const [submit, setSubmit] = useState(false);
  const [res, setRes] = useState<ImportResult>();
  const [pending, start] = useTransition();

  const template = `${IMPORT_COLUMNS.join(",")}\nWEB-1001,Jane Smith,jane@example.com,555-0100,,1 Main St,,Austin,TX,78701,US,BPC-157-5MG,2\n`;

  return (
    <div className="space-y-4">
      <div className="panel p-3 text-sm">
        <div className="mb-2 font-mono text-xs break-all">{IMPORT_COLUMNS.join(", ")}</div>
        <a className="text-navy underline" download="orders-template.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(template)}`}>Download template</a>
        <span className="text-gray-500"> · Rows with the same order_ref become one order. SKU = SKU in the price list.</span>
      </div>

      <input
        type="file"
        accept=".csv,text/csv"
        className="block w-full text-sm file:mr-3 file:border file:border-navy file:bg-navy file:px-3 file:py-2 file:text-white"
        onChange={(e) => {
          setRes(undefined);
          setFileErr(undefined);
          const f = e.target.files?.[0];
          if (!f) return;
          Papa.parse<ImportRow>(f, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (h) => h.trim().toLowerCase(),
            complete: (r) => {
              const missing = IMPORT_COLUMNS.filter((c) => !r.meta.fields?.includes(c) && !["company", "address2", "country", "order_ref"].includes(c));
              if (missing.length) return setFileErr(`Missing columns: ${missing.join(", ")}`);
              setRows(r.data);
            },
            error: (err) => setFileErr(err.message),
          });
        }}
      />
      {fileErr && <p className="text-sm text-red">{fileErr}</p>}

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm">{rows.length} row(s)</span>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={submit} onChange={(e) => setSubmit(e.target.checked)} className="h-4 w-4" /> Submit immediately (deducts credit)
          </label>
          <button className="btn-primary" disabled={pending} onClick={() => start(async () => setRes(await importOrders(storeId, rows, submit)))}>
            {pending ? "Importing…" : "Import"}
          </button>
        </div>
      )}

      {res?.error && <p className="border-l-4 border-red bg-red/5 px-3 py-2 text-sm text-red">{res.error}</p>}
      {res?.rowErrors && (
        <div className="border border-red">
          <div className="bg-red px-3 py-2 text-sm font-semibold text-white">{res.rowErrors.length} row error(s) · nothing imported</div>
          <ul className="max-h-80 divide-y divide-line overflow-y-auto text-sm">
            {res.rowErrors.map((e) => (
              <li key={e.row} className="px-3 py-1"><b>Line {e.row}:</b> {e.message}</li>
            ))}
          </ul>
        </div>
      )}
      {res?.results && (
        <ul className="divide-y divide-line border border-line text-sm">
          {res.results.map((r) => (
            <li key={r.ref} className="flex justify-between gap-2 px-3 py-2">
              <span>{r.ref}</span>
              {r.id ? <Link className="text-navy underline" href={`/s/${slug}/orders/${r.id}`}>#{r.number}</Link> : null}
              {r.error ? <span className="text-red">{r.error}</span> : <span className="text-ok">OK</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
