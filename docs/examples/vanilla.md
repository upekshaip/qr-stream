# Example — vanilla JavaScript

A complete sender and receiver in plain `<script type="module">` pages (use
any bundler or a CDN that serves npm packages as ESM).

## sender.html

```html
<input type="file" id="file" />
<button id="start">Start</button> <button id="stop">Stop</button>
<canvas id="stage"></canvas>

<script type="module">
  import {
    PROTOCOL, segment, sha256Hex, buildFramePlan, TxEngine,
  } from "@upekshaip/qr-stream";

  const canvas = document.getElementById("stage");
  const engine = new TxEngine(canvas);

  document.getElementById("start").onclick = async () => {
    const file = document.getElementById("file").files[0];
    if (!file || engine.running) return;

    const bytes = new Uint8Array(await file.arrayBuffer());
    const chunkBytes = 512;
    const chunks = segment(bytes, chunkBytes);
    const meta = {
      protocol: PROTOCOL,
      name: file.name,
      size: bytes.length,
      sha256: await sha256Hex(bytes),
      total: chunks.length,
      chunkBytes,
    };

    const frames = buildFramePlan(chunks, meta, 1, { metaEvery: 16, ecLevel: "M" });
    engine.start({
      frames, intervalMs: 300, gridSize: 1, sidePx: 768, ecLevel: "M",
      loop: true, rotatePerCycle: true,
      onProgress: (p) => console.log(`slot ${p.slot} cycle ${p.cycles}`),
      onError: (err) => alert(err.message),
    });
  };

  document.getElementById("stop").onclick = () => engine.stop();
</script>
```

## receiver.html

```html
<video id="cam" playsinline muted></video>
<pre id="status">idle</pre>

<script type="module">
  import {
    QrScanner, drawSourceToCanvas, parsePayload, Reassembler, sha256Hex,
  } from "@upekshaip/qr-stream";

  const video = document.getElementById("cam");
  const status = document.getElementById("status");
  const scratch = document.createElement("canvas");

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment", width: { ideal: 1920 } },
  });
  video.srcObject = stream;
  await video.play();

  const scanner = new QrScanner();
  scanner.gridHint = 1;
  await scanner.whenReady();
  const reasm = new Reassembler();

  while (!reasm.complete) {
    if (video.readyState >= 2) {
      drawSourceToCanvas(video, scratch, 1280);
      const { values } = await scanner.scan(scratch);
      for (const v of values) {
        const p = parsePayload(v);
        if (p.type === "META") reasm.setMeta(p.meta);
        else if (p.type === "DATA" && p.crcOk) reasm.add(p.seq, p.total, p.bytes);
      }
      status.textContent =
        `${reasm.received}/${reasm.total || "?"} chunks · missing ${reasm.missing().length}`;
    }
    await new Promise((r) => setTimeout(r, 0));
  }

  const bytes = reasm.reconstruct();
  const ok = (await sha256Hex(bytes)) === reasm.meta.sha256;
  status.textContent = ok ? "complete · SHA-256 ✓" : "complete · SHA-256 MISMATCH";

  if (ok) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([bytes]));
    a.download = reasm.meta.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
  }
  stream.getTracks().forEach((t) => t.stop());
</script>
```
