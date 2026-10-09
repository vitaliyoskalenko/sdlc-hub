// Saves from the site: each is a branch `hub/<user>/<label>-<time>` with a merge request that merges itself. When
// hub-guard refuses one, it writes the reason to hub-state at `saves/<user>/<label>-<time>.json` and deletes the
// branch, which closes the merge request. The site reads that record; it is a display cache like all of hub-state.

import { z } from "zod";
import { parseJson } from "./parse.ts";
import { isoTime } from "./schema/common.ts";

export const SAVE_PREFIX = "hub/";

export const saveRefusalSchema = z.strictObject({
  branch: z.string().startsWith(SAVE_PREFIX),
  mr: z.number().int().positive().optional(),
  /** Advisory mode: the findings are warnings, and the request merges anyway. */
  advisory: z.boolean().optional(),
  author: z.string().min(1),
  sha: z.string().regex(/^[0-9a-f]{7,64}$/),
  at: isoTime,
  findings: z
    .array(z.strictObject({ user: z.string(), path: z.string(), reason: z.string(), line: z.number().int().positive().optional() }))
    .min(1),
});
export type SaveRefusal = z.output<typeof saveRefusalSchema>;

export const parseSaveRefusal = (text: string, file: string) => parseJson(saveRefusalSchema, text, file);

const LABEL = /[^a-z0-9.-]+/g;

/** A new branch name for a save: `hub/<user>/<label>-<yyyymmddhhmmss>`. */
export function saveBranch(user: string, label: string, now: Date): string {
  const time = now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const clean = label.toLowerCase().replace(LABEL, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "save";
  return `${SAVE_PREFIX}${user}/${clean}-${time}`;
}

export const isSaveBranch = (branch: string): boolean => /^hub\/[^/]+\/[^/]+$/.test(branch);

/** Where hub-guard records a refusal of a save branch. */
export function refusalPath(branch: string): string {
  if (!isSaveBranch(branch)) throw new Error(`${branch} is not a save branch`);
  return `saves/${branch.slice(SAVE_PREFIX.length)}.json`;
}
