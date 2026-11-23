"use client";

import { useState } from "react";
import { US_STATES } from "@/lib/schemas";
import { COUNTRIES } from "@/lib/countries";

type Values = Partial<Record<"name" | "email" | "phone" | "company" | "line1" | "line2" | "city" | "region" | "postalCode" | "country" | "notes" | "tags", string>>;

/** Full customer / ship-to form fields. Works inside a <form> (uncontrolled) or controlled via onChange. */
export function CustomerFields({
  values = {},
  errors = {},
  onChange,
  withMeta = true,
}: {
  values?: Values;
  errors?: Record<string, string | undefined>;
  onChange?: (k: keyof Values, v: string) => void;
  withMeta?: boolean;
}) {
  const [localCountry, setLocalCountry] = useState(values.country || "US");
  const country = (onChange ? values.country : localCountry) || "US";
  const isUS = country === "US";

  const bind = (k: keyof Values) =>
    onChange
      ? { value: values[k] ?? "", onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => onChange(k, e.target.value) }
      : { defaultValue: values[k] ?? "" };

  const f = (k: keyof Values, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, span = "") => (
    <div className={span}>
      <label className="label" htmlFor={`c-${k}`}>{label}</label>
      <input id={`c-${k}`} name={k} className={`input ${errors[k] ? "border-red" : ""}`} {...bind(k)} aria-invalid={!!errors[k]} {...props} />
      {errors[k] && <p className="mt-1 text-xs text-red">{errors[k]}</p>}
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
      {f("name", "Full name *", { required: true, autoComplete: "name" }, "sm:col-span-3")}
      {f("company", "Company", { autoComplete: "organization" }, "sm:col-span-3")}
      {f("email", "Email *", { type: "email", required: true, autoComplete: "email", inputMode: "email" }, "sm:col-span-3")}
      {f("phone", "Phone *", { type: "tel", required: true, autoComplete: "tel", inputMode: "tel" }, "sm:col-span-3")}

      <div className="sm:col-span-6">
        <label className="label" htmlFor="c-country">Country *</label>
        <select
          id="c-country"
          name="country"
          required
          autoComplete="country"
          className="input"
          value={country}
          onChange={(e) => {
            setLocalCountry(e.target.value);
            onChange?.("country", e.target.value);
            // a US state code is meaningless elsewhere (and vice versa), so start the field clean
            onChange?.("region", "");
          }}
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code} suppressHydrationWarning>{c.name}</option>
          ))}
        </select>
      </div>

      {f("line1", "Address *", { required: true, autoComplete: "address-line1" }, "sm:col-span-6")}
      {f("line2", "Apt / suite", { autoComplete: "address-line2" }, "sm:col-span-6")}
      {f("city", "City *", { required: true, autoComplete: "address-level2" }, "sm:col-span-2")}

      <div className="sm:col-span-2">
        <label className="label" htmlFor="c-region">{isUS ? "State *" : "State / Province *"}</label>
        {isUS ? (
          <select id="c-region" name="region" required autoComplete="address-level1" className={`input ${errors.region ? "border-red" : ""}`} {...bind("region")}>
            <option value="">Select…</option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        ) : (
          <input id="c-region" name="region" required maxLength={30} autoComplete="address-level1" className={`input ${errors.region ? "border-red" : ""}`} {...bind("region")} />
        )}
        {errors.region && <p className="mt-1 text-xs text-red">{errors.region}</p>}
      </div>
      {f("postalCode", isUS ? "ZIP *" : "Postal code *", { required: true, autoComplete: "postal-code" }, "sm:col-span-2")}

      {withMeta && (
        <>
          {f("tags", "Tags (comma separated)", {}, "sm:col-span-6")}
          <div className="sm:col-span-6">
            <label className="label" htmlFor="c-notes">Notes</label>
            <textarea id="c-notes" name="notes" rows={3} className="input h-auto py-2" {...bind("notes")} />
          </div>
        </>
      )}
    </div>
  );
}
