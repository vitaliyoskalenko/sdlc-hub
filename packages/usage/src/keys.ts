// age keys for per-person usage. Each person has one key pair per machine: the private key stays on the machine (the
// system keychain through git's credential helper, or a file only the owner can read when there is none), and the
// public key is .hub/keys/<user>/<machine>.pub in product-specs. A person's usage is encrypted to their own keys and
// to every key of the admins and the PMs, so only they can read it.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { join } from "node:path";
import { armor, Decrypter, Encrypter, generateX25519Identity, identityToRecipient } from "age-encryption";
import type { FileSource, Roles } from "@sdlc-hub/core";

export async function newKeyPair(): Promise<{ identity: string; recipient: string }> {
  const identity = await generateX25519Identity();
  return { identity, recipient: await identityToRecipient(identity) };
}

/** Armored, so the file in hub-state is text. */
export async function encryptTo(text: string, recipients: string[]): Promise<string> {
  if (!recipients.length) throw new Error("No public key to encrypt to");
  const e = new Encrypter();
  for (const r of [...new Set(recipients)]) e.addRecipient(r);
  return armor.encode(await e.encrypt(text));
}

/** The text, or undefined when none of the identities can open it. */
export async function decryptWith(armored: string, identities: string[]): Promise<string | undefined> {
  if (!identities.length) return undefined;
  const d = new Decrypter();
  for (const i of identities) d.addIdentity(i);
  try {
    return await d.decrypt(armor.decode(armored), "text");
  } catch {
    return undefined;
  }
}

/** This machine's name in key file names: lower case letters, digits and dashes. */
export const machineName = (name = hostname()) => name.toLowerCase().replace(/\.local$/, "").replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "machine";

export const keyPath = (user: string, machine: string) => `.hub/keys/${user}/${machine}.pub`;

/** The public keys of one person, every machine. */
export function keysOf(specs: FileSource, user: string): string[] {
  return specs
    .list(`.hub/keys/${user}`)
    .filter((p) => /^[^/]+\.pub$/.test(p.slice(`.hub/keys/${user}/`.length)))
    .flatMap((p) => (specs.read(p) ?? "").split("\n").map((l) => l.trim()).filter((l) => l.startsWith("age1")));
}

/** Who can read a person's usage: the person, the admins and the PMs. */
export function recipientsFor(specs: FileSource, roles: Roles, user: string): string[] {
  const readers = roles.people.filter((p) => p.user === user || p.roles.includes("admin") || p.roles.includes("pm")).map((p) => p.user);
  return [...new Set(readers.flatMap((u) => keysOf(specs, u)))];
}

export interface KeyStore {
  load(): string | undefined;
  /** Where the key went: the keychain, or a file. */
  save(identity: string): "keychain" | "file";
}

/** The key of one product-specs on this machine, named by the repository's remote. */
export function keyStore(repoId: string, opts: { useKeychain?: boolean; dir?: string } = {}): KeyStore {
  // HUB_KEYS_DIR keeps keys in a folder and out of the keychain: tests, and machines that prefer it.
  const forced = process.env["HUB_KEYS_DIR"];
  if (forced) opts = { ...opts, useKeychain: false, dir: forced };
  const id = createHash("sha256").update(repoId).digest("hex").slice(0, 16);
  const host = `${id}.age.sdlc-hub.invalid`;
  const file = join(opts.dir ?? join(homedir(), ".config", "sdlc-hub", "keys"), `${id}.key`);
  const env = { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "", SSH_ASKPASS: "" };
  const helper = () => {
    if (opts.useKeychain === false) return false;
    try {
      return !!execFileSync("git", ["config", "--get", "credential.helper"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
      return false;
    }
  };
  return {
    load() {
      if (existsSync(file)) return readFileSync(file, "utf8").trim() || undefined;
      if (!helper()) return undefined;
      try {
        const out = execFileSync("git", ["credential", "fill"], { input: `protocol=https\nhost=${host}\nusername=age\n\n`, encoding: "utf8", env, stdio: ["pipe", "pipe", "ignore"] });
        return /^password=(AGE-SECRET-KEY-\S+)$/m.exec(out)?.[1];
      } catch {
        return undefined;
      }
    },
    save(identity) {
      if (helper()) {
        try {
          execFileSync("git", ["credential", "approve"], { input: `protocol=https\nhost=${host}\nusername=age\npassword=${identity}\n\n`, env, stdio: ["pipe", "ignore", "ignore"] });
          return "keychain";
        } catch {
          /* fall back to the file */
        }
      }
      mkdirSync(join(file, ".."), { recursive: true, mode: 0o700 });
      writeFileSync(file, `${identity}\n`, { mode: 0o600 });
      chmodSync(file, 0o600);
      return "file";
    },
  };
}
