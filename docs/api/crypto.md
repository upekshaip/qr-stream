# API — crypto

Runs anywhere with Web Crypto (browsers; Node ≥ 20). Read
[../security.md](../security.md) for the threat model before relying on it.

## `encryptFile(bytes, password, opts?): Promise<{ ciphertext, encMeta }>`

AES-256-GCM encryption with a PBKDF2-HMAC-SHA256 key:

- fresh random 16-byte salt and 12-byte IV per call;
- `opts.iterations` overrides the KDF cost (default
  `PBKDF2_ITERATIONS_DEFAULT` = 600 000) — the value used is **written into
  `encMeta.iterations`** so decryption always knows it;
- returns the ciphertext (GCM tag appended) and the `EncryptionMeta` to embed
  as `FileMeta.encryption`.

Stream the *ciphertext* (its size and SHA-256 go into `FileMeta`), never the
plaintext.

## `verifyPassword(password, encMeta): Promise<boolean>`

Derives a key from the candidate password + stored salt (+ stored or legacy
iteration count) and compares `SHA-256(raw key)` against
`encMeta.passwordHash` in constant time. Cheap pre-check so the UI can say
"wrong password" without a decrypt attempt.

## `decryptFile(ciphertext, password, encMeta): Promise<Uint8Array>`

Authenticated decryption. **Throws** when the password is wrong or the
ciphertext was tampered with (GCM authentication); a resolved promise means
the output is bit-perfect plaintext.

## `PBKDF2_ITERATIONS_DEFAULT: 600_000`

Exported so applications can display or reason about the current default.

## Legacy compatibility

`EncryptionMeta` from streams produced before `iterations` existed decrypts
transparently — readers fall back to the historical 100 000. The reverse is
not true: a pre-0.1.0 receiver cannot decrypt new streams (update both ends
together). Details: [../protocol.md](../protocol.md#encryptionmeta--v1-vs-v2).
