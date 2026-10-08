import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { memorySource, parseRoles } from "@sdlc-hub/core";
import { ROLES } from "@sdlc-hub/fixtures";
import { decryptWith, encryptTo, keyStore, machineName, newKeyPair, recipientsFor } from "../src/index.ts";

const temp: string[] = [];
afterAll(() => temp.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe("per-person usage keys", () => {
  it("encrypt a month for the person, the admin and the PM, and nobody else", async () => {
    const [olena, nazar, maksym, iryna] = await Promise.all([newKeyPair(), newKeyPair(), newKeyPair(), newKeyPair()]);
    const specs = memorySource({
      ".hub/keys/olena.k/laptop.pub": `${olena.recipient}\n`,
      ".hub/keys/olena.k-x/laptop.pub": `${iryna.recipient}\n`, // not Olena's: another person's folder
      ".hub/keys/nazar.t/mac.pub": `${nazar.recipient}\n`,
      ".hub/keys/maksym.d/mac.pub": `${maksym.recipient}\n`,
      ".hub/keys/iryna.s/mac.pub": `${iryna.recipient}\n`,
    });
    const recipients = recipientsFor(specs, parseRoles(ROLES, "r").value!, "olena.k");
    expect(recipients.sort()).toEqual([olena.recipient, nazar.recipient, maksym.recipient].sort());
    const file = await encryptTo('{"tokens":1}\n', recipients);
    expect(file).toMatch(/^-----BEGIN AGE ENCRYPTED FILE-----/);
    expect(await decryptWith(file, [olena.identity])).toBe('{"tokens":1}\n');
    expect(await decryptWith(file, [maksym.identity])).toBe('{"tokens":1}\n');
    expect(await decryptWith(file, [iryna.identity])).toBeUndefined(); // QA sees totals only
  });
  it("keep the private key in a file only its owner reads when there is no keychain", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-keys-"));
    temp.push(dir);
    const store = keyStore("https://gl/shop/product-specs.git", { useKeychain: false, dir });
    expect(store.load()).toBeUndefined();
    const { identity } = await newKeyPair();
    expect(store.save(identity)).toBe("file");
    expect(store.load()).toBe(identity);
    const f = join(dir, readdirSync(dir)[0]!);
    expect(statSync(f).mode & 0o777).toBe(0o600);
  });
  it("name the machine plainly", () => {
    expect(machineName("Olena's MacBook Pro.local")).toBe("olena-s-macbook-pro");
  });
});
