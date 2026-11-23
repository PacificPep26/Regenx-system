import { z } from "zod";

const opt = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((v) => v || undefined);

const customerBase = z.object({
  name: z.string().trim().min(2, "Name is required").max(120),
  email: z.string().trim().toLowerCase().email("Valid email required"),
  phone: z
    .string()
    .trim()
    .min(1, "Phone is required")
    .max(30)
    .regex(/^[+\d\s().-]+$/, "Phone has invalid characters")
    .refine((v) => v.replace(/\D/g, "").length >= 7, "Phone is too short"),
  company: opt,
  line1: z.string().trim().min(3, "Address is required").max(200),
  line2: opt,
  city: z.string().trim().min(2, "City is required").max(80),
  region: z.string().trim().toUpperCase().min(2, "State is required").max(30, "State is too long"),
  postalCode: z.string().trim().min(3, "ZIP is required").max(12),
  country: z.string().trim().toUpperCase().length(2, "Use 2-letter country code").default("US"),
  notes: z.string().trim().max(2000).optional().transform((v) => v || undefined),
  tags: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? "")
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 10),
    ),
});
export const customerSchema = customerBase.superRefine((c, ctx) => {
  if (c.country === "US" && !US_STATES.includes(c.region))
    ctx.addIssue({ code: "custom", path: ["region"], message: "Use the 2-letter state code, e.g. TX or CA" });
});
export type CustomerInput = z.input<typeof customerSchema>;

export const orderSchema = z.object({
  storeId: z.string().min(1),
  customerId: z.string().optional(),
  customer: customerSchema.optional(),
  externalRef: z.string().trim().max(60).optional().transform((v) => v || undefined),
  notes: z.string().trim().max(2000).optional().transform((v) => v || undefined),
  items: z
    .array(z.object({ productId: z.string().min(1), qty: z.number().int().min(1).max(1_000_000) }))
    .min(1, "Add at least one product"),
  submit: z.boolean(),
});
export type OrderInput = z.input<typeof orderSchema>;

export const US_STATES = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR".split(" ");

export const IMPORT_COLUMNS = ["order_ref", "name", "email", "phone", "company", "address1", "address2", "city", "state", "zip", "country", "sku", "qty"] as const;
