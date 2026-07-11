import { useQrReceiver } from "./useQrReceiver";

export function Receiver() {
  const { videoRef, running, received, total, result, start, stop } = useQrReceiver(1);

  function download() {
    if (!result) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([result.bytes as BlobPart]));
    a.download = result.meta.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
  }

  return (
    <div>
      <p>
        <button onClick={start} disabled={running}>Start camera</button>
        <button onClick={stop} disabled={!running}>Stop</button>
        {result && (
          <button onClick={download}>
            Save {result.meta.name} {result.shaOk ? "· SHA-256 ✓" : "· SHA-256 MISMATCH"}
          </button>
        )}
      </p>
      <p className="status">
        {running ? `${received}/${total || "?"} chunks` : result ? "complete" : "idle"}
      </p>
      <video ref={videoRef} playsInline muted />
    </div>
  );
}
