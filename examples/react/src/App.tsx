import { useState } from "react";
import { Sender } from "./Sender";
import { Receiver } from "./Receiver";

export function App() {
  const [tab, setTab] = useState<"send" | "receive">("send");
  return (
    <main>
      <h1>qr-stream — React example</h1>
      <p>
        Open this app on two devices: <b>Send</b> on one, <b>Receive</b> on the
        other (camera pointed at the sender's screen).
      </p>
      <p>
        <button onClick={() => setTab("send")} disabled={tab === "send"}>Send</button>
        <button onClick={() => setTab("receive")} disabled={tab === "receive"}>Receive</button>
      </p>
      {tab === "send" ? <Sender /> : <Receiver />}
    </main>
  );
}
