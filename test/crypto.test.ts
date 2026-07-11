import { describe, expect, it } from "vitest";
import { PBKDF2_ITERATIONS_DEFAULT, decryptFile, encryptFile, verifyPassword } from "../src/crypto";

// Low iteration counts keep the suite fast; the default-count test runs once.
const FAST = { iterations: 1000 };
const payload = () => new Uint8Array(1024).map((_, i) => (i * 31) & 0xff);

describe("crypto round-trip", () => {
  it("encrypts and decrypts back to the original bytes", async () => {
    const { ciphertext, encMeta } = await encryptFile(payload(), "correct horse", FAST);
    expect(ciphertext.length).toBeGreaterThan(1024); // GCM tag appended
    expect(await verifyPassword("correct horse", encMeta)).toBe(true);
    const plain = await decryptFile(ciphertext, "correct horse", encMeta);
    expect([...plain]).toEqual([...payload()]);
  });

  it("records the iteration count in the meta", async () => {
    const { encMeta } = await encryptFile(new Uint8Array([1]), "pw", FAST);
    expect(encMeta.iterations).toBe(1000);
  });

  it("uses the OWASP default when no override is given", async () => {
    const { encMeta } = await encryptFile(new Uint8Array([1]), "pw");
    expect(encMeta.iterations).toBe(PBKDF2_ITERATIONS_DEFAULT);
    expect(PBKDF2_ITERATIONS_DEFAULT).toBe(600_000);
  });

  it("rejects the wrong password", async () => {
    const { ciphertext, encMeta } = await encryptFile(payload(), "right", FAST);
    expect(await verifyPassword("wrong", encMeta)).toBe(false);
    await expect(decryptFile(ciphertext, "wrong", encMeta)).rejects.toThrow();
  });

  it("detects ciphertext tampering (GCM auth)", async () => {
    const { ciphertext, encMeta } = await encryptFile(payload(), "pw", FAST);
    const tampered = Uint8Array.from(ciphertext);
    tampered[10] ^= 0xff;
    await expect(decryptFile(tampered, "pw", encMeta)).rejects.toThrow();
  });
});

describe("legacy stream compatibility (meta without `iterations`)", () => {
  it("verifies and decrypts a pre-0.1.0 stream with the historical 100k count", async () => {
    // A legacy sender derived with 100 000 iterations and wrote no field.
    const { ciphertext, encMeta } = await encryptFile(payload(), "legacy-pw", {
      iterations: 100_000,
    });
    const legacyMeta = { salt: encMeta.salt, iv: encMeta.iv, passwordHash: encMeta.passwordHash };
    expect(await verifyPassword("legacy-pw", legacyMeta)).toBe(true);
    const plain = await decryptFile(ciphertext, "legacy-pw", legacyMeta);
    expect([...plain]).toEqual([...payload()]);
  });
});
