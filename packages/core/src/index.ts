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
