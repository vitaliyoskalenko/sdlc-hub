// The public surface of @sdlc-hub/core.

/** The `schema_version` this release of the hub reads and writes. */
export const CORE_SCHEMA_VERSION = 1;

export * from "./issues.ts";
export * from "./evidence.ts";
export * from "./files.ts";
export * from "./schema/common.ts";
export * from "./schema/project.ts";
export * from "./schema/feature.ts";
export { splitFrontMatter } from "./parse.ts";
export * from "./project-check.ts";
export { DEFAULT_FLOW_YAML } from "./defaults/flow.ts";
export { DEFAULT_SDD_ENGINE_YAML } from "./defaults/sdd.ts";
export { DEFAULT_PLAIN_ENGINE_YAML, PLAIN_PROMPTS } from "./defaults/plain.ts";
export * from "./content/hash.ts";
export * from "./content/refs.ts";
export * from "./content/structure.ts";
export * from "./access.ts";
export * from "./source.ts";
export * from "./sdd.ts";
export * from "./detect.ts";
export * from "./documents.ts";
export * from "./guard.ts";
export * from "./saves.ts";
export * from "./signoff.ts";
export * from "./next.ts";
export * from "./people.ts";
export * from "./script.ts";
export * from "./verification.ts";
export * from "./release.ts";
export * from "./settings.ts";
export * from "./times.ts";
export * from "./validate.ts";
export * from "./version.ts";
