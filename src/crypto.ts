// AES-256-GCM file encryption helpers using the Web Crypto API.
//
// Encryption flow (sender):
//   password + random salt → PBKDF2 → 256-bit AES-GCM key
//   file bytes → AES-GCM encrypt(key, random IV) → ciphertext
//   passwordHash = SHA-256(raw key bytes)  ← stored in FileMeta for receiver pre-check
//
// Verification flow (receiver):
//   user-entered password + stored salt → PBKDF2 → raw key bytes → SHA-256
//   compare derived hash against stored passwordHash → fast pre-check before decrypt
//
// Decryption flow (receiver):
//   password + salt → PBKDF2 → AES-GCM key → decrypt(ciphertext, IV) → original bytes
//   AES-GCM authentication guarantees bit-perfect output if decryption succeeds.
//
// Forward compatibility: the PBKDF2 iteration count is embedded in
// EncryptionMeta (`iterations`). Streams produced before that field existed
// omit it and are read with the legacy count, so old captures keep decrypting.

import { base64ToBytes, bytesToBase64 } from "./binary";
import type { EncryptionMeta } from "./types";

/**
 * Default PBKDF2-HMAC-SHA256 iteration count written into new streams
 * (OWASP-recommended order of magnitude as of 2023+).
 */
export const PBKDF2_ITERATIONS_DEFAULT = 600_000;

/** Iteration count assumed for legacy streams whose meta lacks `iterations`. */
const LEGACY_PBKDF2_ITERATIONS = 100_000;

/** Extract a plain ArrayBuffer from a Uint8Array (Web Crypto requires this). */
function toAB(arr: Uint8Array): ArrayBuffer {
  return arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength) as ArrayBuffer;
}

async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<{ key: CryptoKey; raw: Uint8Array }> {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey("raw", toAB(enc.encode(password)), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: toAB(salt), iterations, hash: "SHA-256" },
    base,
    256
  );
  const raw = new Uint8Array(bits);
  const key = await crypto.subtle.importKey("raw", bits, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
  return { key, raw };
}

async function hashRaw(raw: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", toAB(raw));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time comparison of two equal-purpose hex digests. */
function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Encrypt `bytes` with `password`. Returns the ciphertext and the metadata
 * the receiver needs to verify the password and decrypt (embed it as
 * `FileMeta.encryption`). The PBKDF2 iteration count is recorded in the
 * returned meta; override it via `opts.iterations` (e.g. lower for tests,
 * higher for long-lived archives).
 */
export async function encryptFile(
  bytes: Uint8Array,
  password: string,
  opts: { iterations?: number } = {}
): Promise<{ ciphertext: Uint8Array; encMeta: EncryptionMeta }> {
  const iterations = opts.iterations ?? PBKDF2_ITERATIONS_DEFAULT;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const { key, raw } = await deriveKey(password, salt, iterations);
  const buf = await crypto.subtle.encrypt({ name: "AES-GCM", iv: toAB(iv) }, key, toAB(bytes));
  return {
    ciphertext: new Uint8Array(buf),
    encMeta: {
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      passwordHash: await hashRaw(raw),
      iterations,
    },
  };
}

/**
 * Verify a candidate password against the stored passwordHash without
 * decrypting. Returns true if the password is correct. Reads the iteration
 * count from the meta (legacy streams without one use the historical value).
 */
export async function verifyPassword(
  password: string,
  encMeta: EncryptionMeta
): Promise<boolean> {
  const salt = base64ToBytes(encMeta.salt);
  const { raw } = await deriveKey(password, salt, encMeta.iterations ?? LEGACY_PBKDF2_ITERATIONS);
  return constantTimeEqualHex(await hashRaw(raw), encMeta.passwordHash);
}

/**
 * Decrypt ciphertext using the given password and stored encryption metadata.
 * Throws if the password is wrong or the data is tampered (AES-GCM
 * authentication). Reads the iteration count from the meta (legacy streams
 * without one use the historical value).
 */
export async function decryptFile(
  ciphertext: Uint8Array,
  password: string,
  encMeta: EncryptionMeta
): Promise<Uint8Array> {
  const salt = base64ToBytes(encMeta.salt);
  const iv = base64ToBytes(encMeta.iv);
  const { key } = await deriveKey(password, salt, encMeta.iterations ?? LEGACY_PBKDF2_ITERATIONS);
  const buf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toAB(iv) },
    key,
    toAB(ciphertext)
  );
  return new Uint8Array(buf);
}
