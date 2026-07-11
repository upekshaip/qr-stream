# API — configuration & capacity guards

Pure data/functions; run anywhere.

## Presets

| Export | Value |
|---|---|
| `DEFAULT_CONFIG` | `{ gridSize: 1, intervalMs: 300, chunkBytes: 512, ecLevel: "M", loop: true }` |
| `GRID_OPTIONS` | `[1, 2, 3]` |
| `INTERVAL_OPTIONS` | `[100, 150, 200, 300, 500, 700, 1000]` ms |
| `EC_OPTIONS` | `["L", "M", "Q", "H"]` |
| `CHUNK_OPTIONS` | `[128, 256, 384, 512, 768, 1024]` bytes |

These are suggestions for UIs — the library accepts any values that fit QR
capacity.

## Capacity guards

QR payloads use mixed-case base64, which forces **byte mode**; a version-40
QR then holds:

| Export | L | M | Q | H |
|---|---|---|---|---|
| `QR_BYTE_CAPACITY[ec]` | 2953 | 2331 | 1663 | 1273 |

- `dataPayloadLength(chunkBytes): number` — worst-case encoded DATA payload
  length (`27 + ceil(chunkBytes/3) × 4`; seq/total budgeted at 7 digits ≈
  files up to 10 M chunks). A UI-gating **estimate** — exact validation
  happens at plan time via `FramePlanOptions.ecLevel`.
- `isChunkEcValid(chunkBytes, ec): boolean` — does the worst-case payload fit?
  (1024 B at EC H famously doesn't.)
- `maxChunkBytesForEc(ec): number` — largest `CHUNK_OPTIONS` entry that fits.

## `VERSION: string`

The package version (kept in sync with package.json by a unit test). The
experiment harness records it into every CSV row.
