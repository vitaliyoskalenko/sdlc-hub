// A site whose hub is older than the hub in the checkout or on main saves nothing: its rules and file formats may be
// older than the ones hub-guard applies. It says to sync and start the site again.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compareVersions, HUB_VERSION, hubVersionOf } from "@sdlc-hub/core";
import { refSource } from "@sdlc-hub/git";

export function hubBehind(root: string, running = HUB_VERSION): string | undefined {
  let here: string | undefined;
  try {
    here = readFileSync(join(root, "hub/package.json"), "utf8");
  } catch {
    here = undefined;
  }
  const versions = [hubVersionOf(here), hubVersionOf(refSource(root, "refs/remotes/origin/main").read("hub/package.json"))].filter((v): v is string => !!v);
  const newest = versions.sort(compareVersions).at(-1);
  if (!newest || compareVersions(newest, running) <= 0) return undefined;
  return `This site runs hub ${running}, and product-specs has hub ${newest}. Run node hub/cli.js sync, then start the site again; until then it saves nothing.`;
}
