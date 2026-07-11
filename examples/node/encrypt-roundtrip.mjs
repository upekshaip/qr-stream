// AES-256-GCM encryption round trip — encrypt, verify the password against
// the metadata that travels in the stream, and decrypt. Headless (Node's
// Web Crypto), no camera involved.
//
// Run from the package directory:
//   npm run build
//   node examples/node/encrypt-roundtrip.mjs
//
// In your own project: import { ... } from "@upekshaip/qr-stream";
import {
  encryptFile,
  decryptFile,
  verifyPassword,
  sha256Hex,
  PBKDF2_ITERATIONS_DEFAULT,
} from "../../dist/index.js";

const secret = new TextEncoder().encode("attack at dawn — bring snacks");
const password = "correct horse battery staple";

// 1. Encrypt. encMeta (salt, IV, password verifier, iteration count) is what
//    the sender embeds in the stream's META frame — the ciphertext is what
//    gets chunked and transmitted.
const { ciphertext, encMeta } = await encryptFile(secret, password);
console.log("plaintext ", `${secret.length} B`);
console.log("ciphertext", `${ciphertext.length} B (includes 16 B GCM tag)`);
console.log("PBKDF2    ", `${encMeta.iterations} iterations (default ${PBKDF2_ITERATIONS_DEFAULT})`);

// 2. Receiver side: verify the password BEFORE attempting decryption.
//    A wrong password is rejected by a constant-time verifier comparison.
console.log("verify wrong password  ", await verifyPassword("hunter2", encMeta)); // false
console.log("verify correct password", await verifyPassword(password, encMeta)); // true

// 3. Decrypt and prove the round trip is byte-exact.
const plaintext = await decryptFile(ciphertext, password, encMeta);
const ok = (await sha256Hex(plaintext)) === (await sha256Hex(secret));
console.log("round trip", ok ? "byte-exact ✓" : "MISMATCH ✗");
console.log("decrypted ", new TextDecoder().decode(plaintext));
