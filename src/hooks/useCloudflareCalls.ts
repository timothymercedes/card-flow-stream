import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Cloudflare Calls (WebRTC SFU) hook for multi-guest video.
 *
 * - Each peer creates ONE RTCPeerConnection against Cloudflare's SFU.
 * - We publish our local audio+video as named tracks.
 * - We pull every other co-host's tracks and render them in <video> elements.
 * - Track metadata (sessionId + track names) is broadcast via the
 *   `stream_cohost_tracks` Postgres table so peers discover each other.
 *
 * Latency: ~80-150ms glass-to-glass via Cloudflare's anycast SFU.
 */

const SFU_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cf-calls`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

async function sfu(path: string, init?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not signed in");
  const r = await fetch(`${SFU_FN_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`Calls API ${path} ${r.status}: ${await r.text()}`);
  return r.json();
}

export type RemoteCohost = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  stream: MediaStream;
  audioEnabled: boolean;
  videoEnabled: boolean;
};

export function useCloudflareCalls(opts: {
  enabled: boolean;
  streamId: string | null;
  userId: string | null;
  username: string | null;
  avatarUrl: string | null;
  /** When true: don't publish local cam/mic — only pull remote cohost tracks (for normal viewers). */
  viewerMode?: boolean;
}) {
  const { enabled, streamId, userId, username, avatarUrl, viewerMode } = opts;
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remotes, setRemotes] = useState<Record<string, RemoteCohost>>({});
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>("new");

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const pulledRef = useRef<Set<string>>(new Set()); // remote sessionIds already pulled
  const remoteStreamsByUserRef = useRef<Map<string, MediaStream>>(new Map());

  // Wait for SDP state transition
  const waitForConnState = useCallback(async (pc: RTCPeerConnection, target: RTCPeerConnectionState) => {
    if (pc.connectionState === target) return;
    await new Promise<void>((resolve) => {
      const handler = () => {
        if (pc.connectionState === target || pc.connectionState === "failed") {
          pc.removeEventListener("connectionstatechange", handler); resolve();
        }
      };
      pc.addEventListener("connectionstatechange", handler);
      setTimeout(() => { pc.removeEventListener("connectionstatechange", handler); resolve(); }, 5000);
    });
  }, []);

  // ─── Setup: get media, create session, publish tracks, advertise ────────
  useEffect(() => {
    if (!enabled || !streamId) return;
    if (!viewerMode && (!userId || !username)) return;
    let cancelled = false;

    (async () => {
      try {
        let local: MediaStream | null = null;

        // Viewers skip mic/cam capture entirely — they only consume.
        if (!viewerMode) {
          local = await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: 640, height: 480 } });
          if (cancelled) { local.getTracks().forEach((t) => t.stop()); return; }
          setLocalStream(local);
        }

        const pc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
          bundlePolicy: "max-bundle",
        });
        pcRef.current = pc;

        pc.addEventListener("connectionstatechange", () => {
          if (cancelled) return;
          setConnectionState(pc.connectionState);
          if (pc.connectionState === "failed") {
            setError("Peer connection failed — please refresh to reconnect");
          }
        });
        pc.ontrack = (ev) => {
          const mid = ev.transceiver.mid;
          const targetUserId = (pc as any).__midToUser?.[mid as string];
          if (!targetUserId) return;
          const ms = remoteStreamsByUserRef.current.get(targetUserId);
          if (ms) {
            if (!ms.getTracks().some((t) => t.id === ev.track.id)) ms.addTrack(ev.track);
          }
        };

        // Create session
        const session = await sfu("/sessions/new", { method: "POST" });
        sessionIdRef.current = session.sessionId;

        if (local) {
          // Publishing path (host / cohost)
          const transceivers = local.getTracks().map((t) => pc.addTransceiver(t, { direction: "sendonly" }));
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          const pubBody = {
            sessionDescription: { type: offer.type, sdp: offer.sdp },
            tracks: transceivers.map((tr) => ({
              location: "local",
              mid: tr.mid,
              trackName: `${userId}-${tr.sender.track?.kind}`,
            })),
          };
          const pubResp = await sfu(`/sessions/${session.sessionId}/tracks/new`, {
            method: "POST", body: JSON.stringify(pubBody),
          });
          await pc.setRemoteDescription(pubResp.sessionDescription);
          await waitForConnState(pc, "connected");

          const audioName = `${userId}-audio`;
          const videoName = `${userId}-video`;
          await supabase.from("stream_cohost_tracks").upsert({
            stream_id: streamId!, user_id: userId!, username: username!, avatar_url: avatarUrl,
            session_id: session.sessionId, audio_track_name: audioName, video_track_name: videoName,
            is_audio_enabled: true, is_video_enabled: true,
          }, { onConflict: "stream_id,user_id" });
        }
        // Viewer-mode session is created empty; pullRemote() in next effect adds recvonly tracks
        // and triggers the first SDP exchange via requiresImmediateRenegotiation.

        if (!cancelled) setReady(true);
      } catch (e: any) {
        console.error("[cf-calls] setup failed", e);
        if (!cancelled) setError(e.message || String(e));
      }
    })();

    return () => {
      cancelled = true;
      try { pcRef.current?.close(); } catch {}
      pcRef.current = null;
      setLocalStream((s) => { s?.getTracks().forEach((t) => t.stop()); return null; });
      if (streamId && userId && !viewerMode) {
        supabase.from("stream_cohost_tracks").delete().eq("stream_id", streamId).eq("user_id", userId);
      }
      sessionIdRef.current = null;
      pulledRef.current.clear();
      remoteStreamsByUserRef.current.clear();
      setRemotes({});
      setReady(false);
    };
  }, [enabled, streamId, userId, username, avatarUrl, viewerMode, waitForConnState]);

  // ─── Discover peers and pull their tracks ───────────────────────────────
  useEffect(() => {
    if (!enabled || !streamId || !ready) return;
    let cancelled = false;

    async function pullRemote(row: any) {
      if (cancelled) return;
      if (row.user_id === userId) return;
      const pc = pcRef.current; const mySession = sessionIdRef.current;
      if (!pc || !mySession) return;
      if (pulledRef.current.has(row.session_id)) return;
      pulledRef.current.add(row.session_id);

      try {
        const wantTracks = [
          row.audio_track_name && { location: "remote", sessionId: row.session_id, trackName: row.audio_track_name },
          row.video_track_name && { location: "remote", sessionId: row.session_id, trackName: row.video_track_name },
        ].filter(Boolean);
        if (wantTracks.length === 0) return;

        const ms = new MediaStream();
        remoteStreamsByUserRef.current.set(row.user_id, ms);

        const resp = await sfu(`/sessions/${mySession}/tracks/new`, {
          method: "POST", body: JSON.stringify({ tracks: wantTracks }),
        });

        // Map mids returned by Cloudflare to this user so ontrack can route
        (pc as any).__midToUser = (pc as any).__midToUser || {};
        for (const t of resp.tracks || []) {
          if (t.mid != null) (pc as any).__midToUser[t.mid] = row.user_id;
        }

        if (resp.requiresImmediateRenegotiation && resp.sessionDescription) {
          await pc.setRemoteDescription(resp.sessionDescription);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sfu(`/sessions/${mySession}/renegotiate`, {
            method: "PUT",
            body: JSON.stringify({ sessionDescription: { type: answer.type, sdp: answer.sdp } }),
          });
        }

        if (!cancelled) {
          setRemotes((prev) => ({
            ...prev,
            [row.user_id]: {
              userId: row.user_id, username: row.username, avatarUrl: row.avatar_url,
              stream: ms, audioEnabled: row.is_audio_enabled, videoEnabled: row.is_video_enabled,
            },
          }));
        }
      } catch (e) {
        console.error("[cf-calls] pull failed", e);
        pulledRef.current.delete(row.session_id);
      }
    }

    async function load() {
      const { data } = await supabase.from("stream_cohost_tracks").select("*").eq("stream_id", streamId!);
      for (const row of data || []) await pullRemote(row);
    }
    load();

    const ch = supabase.channel(`cohost-tracks-${streamId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "stream_cohost_tracks", filter: `stream_id=eq.${streamId}` },
        (p) => pullRemote(p.new))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "stream_cohost_tracks", filter: `stream_id=eq.${streamId}` },
        (p) => {
          const row: any = p.new;
          setRemotes((prev) => prev[row.user_id]
            ? { ...prev, [row.user_id]: { ...prev[row.user_id], audioEnabled: row.is_audio_enabled, videoEnabled: row.is_video_enabled } }
            : prev);
        })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "stream_cohost_tracks", filter: `stream_id=eq.${streamId}` },
        (p) => {
          const row: any = p.old;
          setRemotes((prev) => { const n = { ...prev }; delete n[row.user_id]; return n; });
          remoteStreamsByUserRef.current.delete(row.user_id);
        })
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [enabled, streamId, userId, ready]);

  // ─── Toggle local mic/cam ──────────────────────────────────────────────
  const toggleAudio = useCallback(async () => {
    if (!localStream || !streamId || !userId) return;
    const t = localStream.getAudioTracks()[0]; if (!t) return;
    t.enabled = !t.enabled;
    await supabase.from("stream_cohost_tracks").update({ is_audio_enabled: t.enabled })
      .eq("stream_id", streamId).eq("user_id", userId);
  }, [localStream, streamId, userId]);

  const toggleVideo = useCallback(async () => {
    if (!localStream || !streamId || !userId) return;
    const t = localStream.getVideoTracks()[0]; if (!t) return;
    t.enabled = !t.enabled;
    await supabase.from("stream_cohost_tracks").update({ is_video_enabled: t.enabled })
      .eq("stream_id", streamId).eq("user_id", userId);
  }, [localStream, streamId, userId]);

  return { localStream, remotes: Object.values(remotes), ready, error, toggleAudio, toggleVideo };
}
