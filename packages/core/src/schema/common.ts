import { z } from "zod";
import { parseRequirement, type Requirement } from "../evidence.ts";

/** Step ids, team ids and role ids: lower-case words joined by hyphens. */
export const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
export const kebab = z.string().regex(KEBAB, "Use lower-case words joined by hyphens");

export const BUILTIN_ROLES = ["admin", "po", "pm", "designer", "dev", "qa", "ops"] as const;
export type BuiltinRole = (typeof BUILTIN_ROLES)[number];

export const ROUTES = ["quick", "standard", "full"] as const;
export type Route = (typeof ROUTES)[number];
export const SIZES = ["XS", "S", "M", "L", "XL"] as const;
export type Size = (typeof SIZES)[number];

/** An ISO 8601 date or date-time, kept as text. */
export const isoTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/, "Use an ISO 8601 date or time");

export const schemaVersion = z.literal(1, { error: "This hub reads schema_version 1" });

export const requirement = z.string().transform((s, ctx): Requirement => {
  const r = parseRequirement(s);
  if ("error" in r) {
    ctx.addIssue({ code: "custom", message: `${r.error}; see the evidence list in the specification` });
    return z.NEVER;
  }
  return r;
});
