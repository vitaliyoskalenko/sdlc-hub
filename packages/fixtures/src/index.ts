export * from "./build.ts";
export { demoFixture } from "./demo.ts";
import type { Fixture } from "./build.ts";
import { fixtures as cases } from "./cases.ts";
import { demoFixture } from "./demo.ts";

/** Every fixture repository, the demo included. */
export const fixtures: Record<string, Fixture> = { ...cases, demo: demoFixture() };
export { materialize, type OnDisk } from "./materialize.ts";
export { DEMO_USAGE, DEMO_USAGE_MONTH, type DemoUsage } from "./demo-usage.ts";
