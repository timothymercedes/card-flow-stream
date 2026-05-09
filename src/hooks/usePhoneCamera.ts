import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Host-side phone-as-camera signaling.
 *
 * - Generates a short token + join URL the host shows as QR / link.
 * - Listens on a Supabase realtime broadcast channel for an SDP offer
 *   from the phone, answers it, exchanges ICE, and yields the resulting
 *   inbound MediaStream via `onStream`.
 *
 * This uses Supabase Realtime as a free, RLS-bypassing signaling bus.
 * The actual media flows peer-to-peer over WebRTC (with public STUN).
 */

type Pending = {
  token: string;
  pc: RTCPeerConnection;
  channel: ReturnType<typeof supabase.channel>;
};

export function usePhoneCamera(opts: {
  streamId: string;
  onStream: (stream: MediaStream, label: string) => void;
}) {
  const { streamId, onStream } = opts;
  const [pending, setPending] = useState<Pending | null>(null);
  const [status, setStatus] = useState<"idle" | "waiting" | "connecting" | "live" | "error">("idle");
  const onStreamRef = useRef(onStream);
  useEffect(() => { onStreamRef.current = onStream; }, [onStream]);

  const startSession = useCallback(() => {
    // 6-char token, easy enough for a short URL or QR.
    const token = Math.random().toString(36).slice(2, 8);
    const channelName = `phone-cam:${streamId}:${token}`;

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
    });

    pc.ontrack = (ev) => {
      const stream = ev.streams[0];
      if (stream) {
        setStatus("live");
        onStreamRef.current(stream, `Phone (${token})`);
      }
    };

    const channel = supabase.channel(channelName, {
      config: { broadcast: { self: false, ack: false } },
    });

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        channel.send({
          type: "broadcast",
          event: "ice-host",
          payload: { candidate: ev.candidate.toJSON() },
        });
      }
    };

    channel.on("broadcast", { event: "offer" }, async ({ payload }) => {
      try {
        setStatus("connecting");
        await pc.setRemoteDescription({ type: "offer", sdp: payload.sdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await channel.send({
          type: "broadcast",
          event: "answer",
          payload: { sdp: answer.sdp },
        });
      } catch {
        setStatus("error");
      }
    });

    channel.on("broadcast", { event: "ice-phone" }, async ({ payload }) => {
      try { await pc.addIceCandidate(payload.candidate); } catch {}
    });

    channel.subscribe((s) => {
      if (s === "SUBSCRIBED") setStatus("waiting");
    });

    setPending({ token, pc, channel });
    return token;
  }, [streamId]);

  const cancelSession = useCallback(() => {
    if (!pending) return;
    try { pending.pc.close(); } catch {}
    try { supabase.removeChannel(pending.channel); } catch {}
    setPending(null);
    setStatus("idle");
  }, [pending]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pending) {
        try { pending.pc.close(); } catch {}
        try { supabase.removeChannel(pending.channel); } catch {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const joinUrl = pending
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/join-cam/${streamId}/${pending.token}`
    : null;

  return { startSession, cancelSession, status, token: pending?.token ?? null, joinUrl };
}
