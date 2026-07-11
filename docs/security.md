# Security

## What the optional encryption gives you

`encryptFile` protects a stream with a password:

- **Confidentiality + integrity**: AES-256-GCM. Tampered or corrupted
  ciphertext fails authentication and `decryptFile` throws; a successful
  decrypt is bit-perfect.
- **Key derivation**: PBKDF2-HMAC-SHA256 with a random 16-byte salt and
  (by default) 600 000 iterations. The iteration count is recorded in
  `EncryptionMeta.iterations`, so it can be raised in future versions without
  breaking old captures (streams without the field decrypt with the legacy
  100 000).
- **Password pre-check**: `passwordHash = SHA-256(raw derived key)` lets the
  receiver reject a wrong password quickly (constant-time comparison) before
  attempting a full decrypt.

## Threat model — read this before relying on it

**In scope:** a passive observer who records the QR stream (a camera behind
you, a screen recording) and tries to read the file, and an active party who
substitutes or corrupts frames (GCM authentication rejects the result).

**Known limitation — offline password guessing.** The META frame travels in
cleartext and contains `salt`, `iv`, `iterations`, and `passwordHash`. Anyone
who captures the stream can therefore mount an offline dictionary attack:
derive a key from a guessed password and compare its hash. This is inherent
to any password-verifier scheme on a one-way channel — decoupling the
verifier from the encryption key would not remove the oracle (the attacker
could equally test guesses against the GCM tag). Your defenses are the
PBKDF2 cost (~0.5–1 s per guess per core at 600 000 iterations) and, above
all, **password strength**. A random 6-word passphrase keeps the attack
infeasible; "hunter2" does not.

**Out of scope:**

- **Shoulder surfing / recording** — anyone who can film your screen gets
  the (encrypted) stream by design; without the password they get ciphertext.
- **Traffic analysis** — file size, chunk count, and file *name* are visible
  in cleartext META even for encrypted streams. Rename the file first if the
  name is sensitive.
- **Endpoint compromise** — both browsers see the plaintext.
- **Sender authenticity** — there are no signatures; encryption proves
  knowledge of the password, not who transmitted.

## Implementation notes

- Salt (16 B) and IV (12 B) come from `crypto.getRandomValues` per
  encryption; a fresh IV per encryption is what makes GCM safe here. Never
  reuse an `EncryptionMeta` with different ciphertext.
- The whole-file SHA-256 in `FileMeta` covers the *transmitted* bytes
  (ciphertext when encrypted) — it verifies transport integrity before
  decryption is attempted.
- `verifyPassword` compares digests in constant time; the verifier is public
  anyway, so this is hygiene rather than a load-bearing defense.
- Web Crypto is required: browsers, or Node ≥ 20 (global `crypto`).
