export * from "./build.ts";
export { demoFixture } from "./demo.ts";
import { fixtures as cases } from "./cases.ts";
import { demoFixture } from "./demo.ts";

/** Every fixture repository, the demo included. */
export const fixtures = { ...cases, demo: demoFixture() };
