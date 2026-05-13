/**
 * BidAnnouncer — global aria-live region for screen-reader announcements
 * during live auctions (new high bid, sold, going-live, timer warnings).
 *
 * Usage anywhere in the tree:
 *   import { announceBid } from "@/components/BidAnnouncer";
 *   announceBid(`New high bid: $${amount} from @${user}`);
 *
 * The region uses aria-live="polite" + aria-atomic so screen readers read
 * the full message without interrupting the user. Visually hidden via .sr-only.
 */
import { useEffect, useState } from "react";

type Listener = (msg: string) => void;
const listeners = new Set<Listener>();

export function announceBid(message: string) {
  if (!message) return;
  for (const l of listeners) l(message);
}

export function BidAnnouncer() {
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const onMsg: Listener = (m) => {
      // force re-announce identical strings by toggling
      setMsg("");
      requestAnimationFrame(() => setMsg(m));
    };
    listeners.add(onMsg);
    return () => { listeners.delete(onMsg); };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {msg}
    </div>
  );
}
