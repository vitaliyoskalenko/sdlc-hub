// libsodium's sealed box (crypto_box_seal), which GitHub's secrets API asks for: an ephemeral X25519 key, a nonce of
// BLAKE2b(ephemeral public key || recipient public key, 24 bytes), and NaCl's crypto_box. Built on the noble
// libraries the hub already carries; checked against libsodium itself (PyNaCl) in the tests.

import { x25519 } from "@noble/curves/ed25519.js";
import { blake2b } from "@noble/hashes/blake2.js";
import { hsalsa, xsalsa20poly1305 } from "@noble/ciphers/salsa.js";

const SIGMA = new Uint32Array(new Uint8Array(Buffer.from("expand 32-byte k", "latin1")).buffer);
const u32 = (b: Uint8Array) => new Uint32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));

/** crypto_box_beforenm: the XSalsa20-Poly1305 key from an X25519 shared secret. */
function beforenm(publicKey: Uint8Array, secretKey: Uint8Array): Uint8Array {
  const shared = x25519.getSharedSecret(secretKey, publicKey);
  const out = new Uint32Array(8);
  hsalsa(SIGMA, u32(shared), new Uint32Array(4), out);
  return new Uint8Array(out.buffer);
}

/** The value GitHub stores: base64 of ephemeral public key || box. `publicKey` is the base64 key from the API. */
export function sealedBox(message: string, publicKeyBase64: string): string {
  const pk = new Uint8Array(Buffer.from(publicKeyBase64, "base64"));
  if (pk.length !== 32) throw new Error("The public key is not an X25519 key");
  const esk = x25519.utils.randomSecretKey();
  const epk = x25519.getPublicKey(esk);
  const nonce = blake2b(new Uint8Array([...epk, ...pk]), { dkLen: 24 });
  const box = xsalsa20poly1305(beforenm(pk, esk), nonce).encrypt(new Uint8Array(Buffer.from(message, "utf8")));
  return Buffer.from(new Uint8Array([...epk, ...box])).toString("base64");
}
