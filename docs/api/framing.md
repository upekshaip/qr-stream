# API — frame planning & composition

Planning runs anywhere; `composeFrame` needs a browser canvas.

## `buildFramePlan(chunks, meta, gridSize, opts?): FramePlan[]`

Build one cycle: a META frame first, then data frames whose cells carry
consecutive chunk seqs (`N²` per frame).

```ts
interface FramePlanOptions {
  metaEvery?: number; // repeat META before every K-th data frame
  ecLevel?: EcLevel;  // validate every payload against QR capacity NOW
}
```

- `metaEvery` exists for slow receivers — a once-per-cycle META is easily
  never sampled. The app uses 16.
- With `ecLevel` set, every payload (data **and** META — long filenames can
  overflow META alone) is length-checked against `QR_BYTE_CAPACITY[ecLevel]`.

**Throws** `QrCapacityError` on overflow (only when `ecLevel` is given).

```ts
interface FramePlan {
  frameIndex: number; // -1 for META
  isMeta: boolean;
  cells: string[];    // payload strings, row-major
}
```

## `buildFramePlanForSeqs(chunks, meta, gridSize, seqs, opts?): FramePlan[]`

Selective retransmission: META plus only the given chunk seqs (deduplicated,
sorted, range-filtered). `opts` accepts `ecLevel` like above. For encrypted
streams pass the **original** chunks — re-encrypting breaks merging.

## `class QrCapacityError extends Error`

| Field | Meaning |
|---|---|
| `code` | `"QR_CAPACITY_EXCEEDED"` |
| `payloadLength` | actual encoded length (chars = bytes in QR byte mode) |
| `capacity` | QR v40 capacity at `ecLevel` |
| `ecLevel` | the level checked against |
| `seq` | offending chunk seq, or `"meta"` |

Recover by lowering chunk size, lowering EC, or shortening the file name.

## `composeFrame(target, frame, gridSize, sidePx, ecLevel): Promise<void>`

Render one frame onto `target` as an N×N grid of QR codes on white
(`sidePx × sidePx`). META frames render as a single full-canvas QR. Performs
the same capacity check pre-render and throws `QrCapacityError` — inside
`TxEngine` that surfaces via `onError`.

## `estimateCycleMs(frameCount, intervalMs): number`

`frameCount × intervalMs` — planning/progress convenience.
