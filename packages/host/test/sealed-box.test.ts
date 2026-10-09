import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { sealedBox } from "../src/sealed-box.ts";

/** libsodium itself, through PyNaCl: a key pair, and opening a sealed box. */
const python = (code: string, input = "") => execFileSync("python3", ["-c", code], { input, encoding: "utf8" }).trim();
let hasNacl = true;
try {
  python("import nacl");
} catch {
  hasNacl = false;
}

describe.skipIf(!hasNacl)("libsodium's sealed box, for GitHub secrets", () => {
  it("opens with libsodium and the recipient's key", () => {
    const [sk, pk] = python("from nacl.public import PrivateKey; import base64\nk=PrivateKey.generate()\nprint(base64.b64encode(bytes(k)).decode()); print(base64.b64encode(bytes(k.public_key)).decode())").split("\n");
    const sealed = sealedBox("deploy-key-💡-secret", pk!);
    const opened = python(`import sys,base64\nfrom nacl.public import PrivateKey, SealedBox\nk=PrivateKey(base64.b64decode("${sk}"))\nprint(SealedBox(k).decrypt(base64.b64decode(sys.stdin.read())).decode())`, sealed);
    expect(opened).toBe("deploy-key-💡-secret");
  });
  it("is different each time and refuses a key that is not X25519", () => {
    const pk = Buffer.alloc(32, 7).toString("base64");
    expect(sealedBox("x", pk)).not.toBe(sealedBox("x", pk));
    expect(() => sealedBox("x", Buffer.alloc(31).toString("base64"))).toThrow(/X25519/);
  });
});
