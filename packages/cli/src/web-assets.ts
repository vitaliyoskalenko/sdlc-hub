// The built web app, as path → base64. Empty here; the bundle (build.mjs) fills it in from packages/web/dist, so the
// vendored hub/cli.js serves the site with no other files.
export const WEB_ASSETS: Record<string, string> | null = null;
