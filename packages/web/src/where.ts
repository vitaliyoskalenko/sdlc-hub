// Where the site is: the path and query of the page, such as /features?as=iryna.s. The hub keeps them in the address
// bar. The static sample (docs/sample/index.html) is one file opened from disk, so it keeps them after the #.

/** The recorded answers of the static sample; absent on the real site. */
export const SAMPLE = (globalThis as { HUB_SAMPLE?: { api: Record<string, unknown> } }).HUB_SAMPLE;

const raw = () => (SAMPLE ? location.hash.slice(1) || "/" : location.pathname + location.search + location.hash);

/** The page, without its #section. */
export function here(): string {
  const url = raw().split("#")[0]!;
  return url.startsWith("/") ? url : `/${url}`;
}
export const hereQuery = () => new URLSearchParams(here().split("?")[1] ?? "");
/** The #section of the page, if any. */
export const hereSection = () => decodeURIComponent(raw().split("#")[1] ?? "");
/** The address for a page and its section: as it is on the site, or after the # in the sample. */
export const toAddress = (url: string) => (SAMPLE ? `#${url}` : url);
