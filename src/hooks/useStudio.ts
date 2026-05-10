import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Browser-native streaming studio.
 *
 * Manages a list of media sources (multiple cameras, screen shares),
 * composites them onto a canvas with selectable scenes/layouts, and
 * publishes the result via WHIP to Cloudflare Stream.
 *
 * Think: a tiny in-browser OBS. No external software required.
 */

const CANVAS_W = 1280;
const CANVAS_H = 720;
const FPS = 30;

export type StudioScene = "solo" | "split" | "grid" | "freeform";

export type StudioSource = {
  id: string;
  kind: "camera" | "screen" | "phone";
  label: string;
  stream: MediaStream;
  deviceId?: string;
  groupId?: string;
  visible: boolean;
  muted: boolean; // mic muted (camera mics only)
  locked: boolean;
  fit: "cover" | "contain";
};

// Normalised 0..1 freeform layout (x,y top-left; w,h size; z stack order)
export type FreeformLayout = { x: number; y: number; w: number; h: number; z: number };

export type ScenePreset = {
  id: string;
  name: string;
  layouts: Record<string, FreeformLayout>;
  // map of source-id => label so presets can be reapplied to renamed sources
  labels: Record<string, string>;
  scene: StudioScene;
};

function isCameraStartupError(e: any) {
  const name = e?.name || "";
  const message = String(e?.message || "");
  return (
    name === "NotReadableError" ||
    name === "AbortError" ||
    /could not start video|allocate video|already in use|in use by another application|hardware error/i.test(
      message,
    )
  );
}

function deviceGroupForId(devices: MediaDeviceInfo[], deviceId?: string) {
  if (!deviceId) return undefined;
  return devices.find((d) => d.deviceId === deviceId)?.groupId || undefined;
}

function cameraErrorMessage(e: any) {
  const name = e?.name || "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera permission was blocked. Click the camera icon in your browser's address bar to allow it, then try again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No camera found matching that selection. Try a different camera.";
  }
  if (isCameraStartupError(e)) {
    return "That camera is already active or still being held by the browser. I skipped duplicate starts; close any other camera preview, remove it here, or pick a different camera.";
  }
  return e?.message || "Could not access camera";
}

async function openCameraStream(video: MediaTrackConstraints, withAudio: boolean) {
  const audio: MediaTrackConstraints | false = withAudio
    ? { echoCancellation: true, noiseSuppression: true }
    : false;
  try {
    return await navigator.mediaDevices.getUserMedia({ video, audio });
  } catch (e: any) {
    if (withAudio && isCameraStartupError(e)) {
      return navigator.mediaDevices.getUserMedia({ video, audio: false });
    }
    throw e;
  }
}

export function useStudio(opts: {
  whipUrl: string | null;
  autoPublish: boolean;
  storageKey?: string;
}) {
  const { whipUrl, autoPublish, storageKey } = opts;

  const [sources, setSources] = useState<StudioSource[]>([]);
  const [scene, setScene] = useState<StudioScene>("freeform");
  const [activeId, setActiveId] = useState<string | null>(null); // featured source for solo/grid
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [layouts, setLayouts] = useState<Record<string, FreeformLayout>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoElsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const rafRef = useRef<number | null>(null);
  const sourcesRef = useRef(sources);
  const cameraDevicesRef = useRef(cameraDevices);
  const sceneRef = useRef(scene);
  const activeIdRef = useRef(activeId);
  const layoutsRef = useRef(layouts);
  const expandedIdRef = useRef(expandedId);
  useEffect(() => {
    sourcesRef.current = sources;
  }, [sources]);
  useEffect(() => {
    cameraDevicesRef.current = cameraDevices;
  }, [cameraDevices]);
  useEffect(() => {
    sceneRef.current = scene;
  }, [scene]);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);
  useEffect(() => {
    layoutsRef.current = layouts;
  }, [layouts]);
  useEffect(() => {
    expandedIdRef.current = expandedId;
  }, [expandedId]);

  // ─── Device enumeration ─────────────────────────────────────────────────
  const refreshDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return [];
      const all = await navigator.mediaDevices.enumerateDevices();
      const cameras = all.filter((d) => d.kind === "videoinput");
      setCameraDevices(cameras);
      return cameras;
    } catch {
      return [];
    }
  }, []);

  const requestCameraPermission = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser doesn't support camera access. Try Chrome, Edge, Safari, or Firefox.");
      return [];
    }
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      setError("Camera access requires HTTPS. Open the app via the secure URL.");
      return [];
    }
    try {
      let probe: MediaStream | null = null;
      try {
        probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } catch (e: any) {
        if (!isCameraStartupError(e)) throw e;
      }
      const devices = await refreshDevices();
      probe?.getTracks().forEach((t) => t.stop());
      return devices;
    } catch (e: any) {
      setError(cameraErrorMessage(e));
      return [];
    }
  }, [refreshDevices]);

  useEffect(() => {
    refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
  }, [refreshDevices]);

  // ─── Default freeform layout for a new source ──────────────────────────
  const makeDefaultLayout = useCallback((index: number): FreeformLayout => {
    // Stagger new tiles in a 3-col grid so they don't fully overlap.
    const col = index % 3;
    const row = Math.floor(index / 3) % 3;
    return {
      x: 0.05 + col * 0.3,
      y: 0.1 + row * 0.3,
      w: 0.35,
      h: 0.45,
      z: index + 1,
    };
  }, []);

  // ─── Add / remove sources ───────────────────────────────────────────────
  const addCamera = useCallback(
    async (deviceId?: string) => {
      try {
        setError(null);
        const cameraCount = sourcesRef.current.filter((s) => s.kind === "camera").length;
        if (cameraCount >= 3) {
          setError("You can use up to 3 cameras at once. Remove one before adding another.");
          return null;
        }
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            "This browser doesn't support camera access. Try Chrome, Edge, Safari, or Firefox.",
          );
        }
        if (typeof window !== "undefined" && window.isSecureContext === false) {
          throw new Error("Camera access requires HTTPS. Open the app via the secure URL.");
        }
        const devices = cameraDevicesRef.current;
        const requestedGroupId = deviceGroupForId(devices, deviceId);
        const existingCamera = sourcesRef.current.find((s) => {
          if (s.kind !== "camera") return false;
          if (!deviceId) return sourcesRef.current.filter((x) => x.kind === "camera").length > 0;
          if (s.deviceId && s.deviceId === deviceId) return true;
          return !!requestedGroupId && s.groupId === requestedGroupId;
        });
        if (existingCamera) {
          setActiveId(existingCamera.id);
          setScene("freeform");
          setError(null);
          return existingCamera.id;
        }
        const baseVideoConstraints: MediaTrackConstraints = {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        };
        const preferredVideoConstraints: MediaTrackConstraints = deviceId
          ? { ...baseVideoConstraints, deviceId: { ideal: deviceId } }
          : baseVideoConstraints;
        const exactVideoConstraints: MediaTrackConstraints | null = deviceId
          ? { ...baseVideoConstraints, deviceId: { exact: deviceId } }
          : null;
        let stream: MediaStream;
        try {
          stream = await openCameraStream(preferredVideoConstraints, cameraCount === 0);
        } catch (e: any) {
          if (exactVideoConstraints && !isCameraStartupError(e)) {
            stream = await openCameraStream(exactVideoConstraints, cameraCount === 0);
          } else if (deviceId && isCameraStartupError(e) && cameraCount === 0) {
            stream = await openCameraStream(baseVideoConstraints, cameraCount === 0);
          } else {
            throw e;
          }
        }
        const track = stream.getVideoTracks()[0];
        const settings = track?.getSettings();
        const groupId = deviceGroupForId(cameraDevicesRef.current, settings?.deviceId ?? deviceId);
        const label =
          track?.label ||
          `Camera ${sourcesRef.current.filter((s) => s.kind === "camera").length + 1}`;
        const id = `cam-${crypto.randomUUID()}`;
        const src: StudioSource = {
          id,
          kind: "camera",
          label,
          stream,
          deviceId: settings?.deviceId,
          groupId,
          visible: true,
          muted: false,
          locked: false,
          fit: "cover",
        };
        setSources((prev) => {
          const next = [...prev, src];
          if (!activeIdRef.current) setActiveId(id);
          return next;
        });
        setLayouts((prev) => ({
          ...prev,
          [id]: makeDefaultLayout(Object.keys(prev).length),
        }));
        // Re-enumerate so device labels populate now that permission is granted.
        refreshDevices();
        return id;
      } catch (e: any) {
        setError(cameraErrorMessage(e));
        return null;
      }
    },
    [refreshDevices, makeDefaultLayout],
  );

  const addScreen = useCallback(async () => {
    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: { frameRate: 30 },
        audio: true,
      });
      const id = `scr-${crypto.randomUUID()}`;
      const src: StudioSource = {
        id,
        kind: "screen",
        label: "Screen share",
        stream,
        visible: true,
        muted: false,
        locked: false,
        fit: "contain",
      };
      // Auto-cleanup if user stops sharing via browser UI
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        removeSource(id);
      });
      setSources((prev) => {
        const next = [...prev, src];
        setActiveId(id);
        if (prev.length > 0) setScene("freeform");
        return next;
      });
      setLayouts((prev) => ({
        ...prev,
        [id]: makeDefaultLayout(Object.keys(prev).length),
      }));
      return id;
    } catch (e: any) {
      setError(e?.message || "Screen share canceled");
      return null;
    }
  }, [makeDefaultLayout]);

  /** Add a MediaStream acquired externally (e.g. phone over WebRTC). */
  const addExternalStream = useCallback(
    (stream: MediaStream, label: string, kind: "phone" | "camera" = "phone") => {
      const id = `ext-${crypto.randomUUID()}`;
      const src: StudioSource = {
        id,
        kind,
        label,
        stream,
        visible: true,
        muted: false,
        locked: false,
        fit: "cover",
      };
      setSources((prev) => {
        const next = [...prev, src];
        if (!activeIdRef.current) setActiveId(id);
        return next;
      });
      setLayouts((prev) => ({ ...prev, [id]: makeDefaultLayout(Object.keys(prev).length) }));
      return id;
    },
    [makeDefaultLayout],
  );

  const removeSource = useCallback((id: string) => {
    setSources((prev) => {
      const target = prev.find((s) => s.id === id);
      target?.stream.getTracks().forEach((t) => t.stop());
      videoElsRef.current.get(id)?.remove();
      videoElsRef.current.delete(id);
      const next = prev.filter((s) => s.id !== id);
      if (activeIdRef.current === id) setActiveId(next[0]?.id ?? null);
      return next;
    });
    setLayouts((prev) => {
      const { [id]: _, ...rest } = prev;
      return rest;
    });
    setExpandedId((cur) => (cur === id ? null : cur));
  }, []);

  const toggleVisible = useCallback((id: string) => {
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s)));
  }, []);

  const toggleMute = useCallback((id: string) => {
    setSources((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const next = !s.muted;
        s.stream.getAudioTracks().forEach((t) => (t.enabled = !next));
        return { ...s, muted: next };
      }),
    );
  }, []);

  // ─── Freeform layout controls ──────────────────────────────────────────
  const [snapEnabled, setSnapEnabled] = useState(false);
  const snapRef = useRef(snapEnabled);
  useEffect(() => {
    snapRef.current = snapEnabled;
  }, [snapEnabled]);

  const setLayout = useCallback((id: string, patch: Partial<FreeformLayout>) => {
    setLayouts((prev) => {
      const cur = prev[id] ?? { x: 0, y: 0, w: 0.4, h: 0.4, z: 1 };
      // honor locked sources
      const src = sourcesRef.current.find((s) => s.id === id);
      if (src?.locked) return prev;
      const snap = snapRef.current ? (n: number) => Math.round(n * 20) / 20 : (n: number) => n;
      const nextW = clamp(snap(patch.w ?? cur.w), 0.1, 1);
      const nextH = clamp(snap(patch.h ?? cur.h), 0.1, 1);
      const next: FreeformLayout = {
        x: clamp(snap(patch.x ?? cur.x), 0, 1 - nextW),
        y: clamp(snap(patch.y ?? cur.y), 0, 1 - nextH),
        w: nextW,
        h: nextH,
        z: patch.z ?? cur.z,
      };
      return { ...prev, [id]: next };
    });
  }, []);

  const renameSource = useCallback((id: string, label: string) => {
    const trimmed = label.trim() || "Source";
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, label: trimmed } : s)));
  }, []);

  const toggleLock = useCallback((id: string) => {
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, locked: !s.locked } : s)));
  }, []);

  const setFit = useCallback((id: string, fit: "cover" | "contain") => {
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, fit } : s)));
  }, []);

  const bringToFront = useCallback((id: string) => {
    setLayouts((prev) => {
      const maxZ = Math.max(0, ...Object.values(prev).map((l) => l.z));
      const cur = prev[id];
      if (!cur) return prev;
      return { ...prev, [id]: { ...cur, z: maxZ + 1 } };
    });
  }, []);

  const sendToBack = useCallback((id: string) => {
    setLayouts((prev) => {
      const minZ = Math.min(0, ...Object.values(prev).map((l) => l.z));
      const cur = prev[id];
      if (!cur) return prev;
      return { ...prev, [id]: { ...cur, z: minZ - 1 } };
    });
  }, []);

  const expandSource = useCallback((id: string) => {
    setExpandedId((cur) => (cur === id ? null : id));
    setScene("freeform");
  }, []);

  const resetLayouts = useCallback(() => {
    setLayouts(() => {
      const next: Record<string, FreeformLayout> = {};
      sourcesRef.current.forEach((s, i) => {
        next[s.id] = makeDefaultLayout(i);
      });
      return next;
    });
    setExpandedId(null);
  }, [makeDefaultLayout]);

  // ─── Canvas render loop ─────────────────────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current) {
      const c = document.createElement("canvas");
      c.width = CANVAS_W;
      c.height = CANVAS_H;
      canvasRef.current = c;
      setCanvasEl(c);
    } else {
      setCanvasEl(canvasRef.current);
    }
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    function ensureVideo(s: StudioSource) {
      let v = videoElsRef.current.get(s.id);
      if (!v) {
        v = document.createElement("video");
        v.autoplay = true;
        v.muted = true;
        v.playsInline = true;
        v.srcObject = s.stream;
        v.play().catch(() => {});
        videoElsRef.current.set(s.id, v);
      }
      return v;
    }

    function drawTile(t: { source: StudioSource; x: number; y: number; w: number; h: number }) {
      const v = ensureVideo(t.source);
      if (v.videoWidth > 0) drawFit(ctx!, v, t.x, t.y, t.w, t.h, t.source.fit);
      else {
        ctx!.fillStyle = "#1a1a1a";
        ctx!.fillRect(t.x, t.y, t.w, t.h);
      }
      ctx!.fillStyle = "rgba(0,0,0,0.55)";
      const lw = ctx!.measureText(t.source.label).width + 16;
      ctx!.fillRect(t.x + 12, t.y + t.h - 32, lw, 22);
      ctx!.fillStyle = "#fff";
      ctx!.font = "bold 12px system-ui";
      ctx!.textAlign = "left";
      ctx!.fillText(t.source.label, t.x + 20, t.y + t.h - 16);
    }

    function tick() {
      if (!ctx) return;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      const visible = sourcesRef.current.filter((s) => s.visible);
      if (visible.length === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.font = "bold 28px system-ui";
        ctx.textAlign = "center";
        ctx.fillText("Add a camera to start", CANVAS_W / 2, CANVAS_H / 2);
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // Expanded source overrides everything.
      const exp = expandedIdRef.current
        ? visible.find((s) => s.id === expandedIdRef.current)
        : null;
      if (exp) {
        drawTile({ source: exp, x: 0, y: 0, w: CANVAS_W, h: CANVAS_H });
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      if (sceneRef.current === "freeform") {
        const ordered = [...visible].sort((a, b) => {
          const za = layoutsRef.current[a.id]?.z ?? 0;
          const zb = layoutsRef.current[b.id]?.z ?? 0;
          return za - zb;
        });
        ordered.forEach((s) => {
          const l = layoutsRef.current[s.id];
          if (!l) return;
          drawTile({
            source: s,
            x: l.x * CANVAS_W,
            y: l.y * CANVAS_H,
            w: l.w * CANVAS_W,
            h: l.h * CANVAS_H,
          });
        });
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const featured = visible.find((s) => s.id === activeIdRef.current) ?? visible[0];
      const others = visible.filter((s) => s.id !== featured.id);
      const tiles = layoutTiles(sceneRef.current, visible.length, featured, others);
      tiles.forEach(drawTile);

      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, []);

  // ─── WHIP publish ───────────────────────────────────────────────────────
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const whipResRef = useRef<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const audioNodesRef = useRef<Map<string, MediaStreamAudioSourceNode>>(new Map());

  const startPublish = useCallback(async () => {
    if (!whipUrl || !canvasRef.current || pcRef.current) return;
    try {
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const dest = audioCtx.createMediaStreamDestination();
      audioDestRef.current = dest;

      // Connect non-muted audio tracks
      sourcesRef.current.forEach((s) => {
        if (s.muted) return;
        const at = s.stream.getAudioTracks();
        if (at.length === 0) return;
        try {
          const node = audioCtx.createMediaStreamSource(new MediaStream(at));
          node.connect(dest);
          audioNodesRef.current.set(s.id, node);
        } catch {}
      });

      const videoStream = canvasRef.current.captureStream(FPS);
      const composite = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...dest.stream.getAudioTracks(),
      ]);

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
        bundlePolicy: "max-bundle",
      });
      pcRef.current = pc;
      composite.getTracks().forEach((t) => pc.addTransceiver(t, { direction: "sendonly" }));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const r = await fetch(whipUrl, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: offer.sdp,
      });
      if (!r.ok) throw new Error(`WHIP ${r.status}: ${await r.text()}`);
      whipResRef.current = r.headers.get("location");
      const answer = await r.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answer });
      setPublishing(true);
    } catch (e: any) {
      setError(e?.message || "Could not start broadcast");
      try {
        pcRef.current?.close();
      } catch {}
      pcRef.current = null;
    }
  }, [whipUrl]);

  const stopPublish = useCallback(() => {
    try {
      pcRef.current?.close();
    } catch {}
    pcRef.current = null;
    const res = whipResRef.current;
    if (res)
      try {
        fetch(res, { method: "DELETE" }).catch(() => {});
      } catch {}
    whipResRef.current = null;
    try {
      audioCtxRef.current?.close();
    } catch {}
    audioCtxRef.current = null;
    audioDestRef.current = null;
    audioNodesRef.current.clear();
    setPublishing(false);
  }, []);

  // Auto-publish once we have at least one source + WHIP URL
  useEffect(() => {
    if (!autoPublish || !whipUrl) return;
    if (publishing) return;
    if (sources.length === 0) return;
    startPublish();
  }, [autoPublish, whipUrl, sources.length, publishing, startPublish]);

  // Reconnect new audio sources without restarting WHIP
  useEffect(() => {
    const ctx = audioCtxRef.current;
    const dest = audioDestRef.current;
    if (!ctx || !dest) return;
    sources.forEach((s) => {
      if (audioNodesRef.current.has(s.id) || s.muted) return;
      const at = s.stream.getAudioTracks();
      if (at.length === 0) return;
      try {
        const node = ctx.createMediaStreamSource(new MediaStream(at));
        node.connect(dest);
        audioNodesRef.current.set(s.id, node);
      } catch {}
    });
  }, [sources]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      sourcesRef.current.forEach((s) => s.stream.getTracks().forEach((t) => t.stop()));
      videoElsRef.current.forEach((v) => v.remove());
      videoElsRef.current.clear();
      stopPublish();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Scene presets (persisted) ─────────────────────────────────────────
  const presetsKey = storageKey ? `studio:presets:${storageKey}` : null;
  const [presets, setPresets] = useState<ScenePreset[]>(() => {
    if (typeof window === "undefined" || !presetsKey) return [];
    try {
      return JSON.parse(localStorage.getItem(presetsKey) || "[]");
    } catch {
      return [];
    }
  });
  useEffect(() => {
    if (!presetsKey || typeof window === "undefined") return;
    try {
      localStorage.setItem(presetsKey, JSON.stringify(presets));
    } catch {}
  }, [presets, presetsKey]);

  const savePreset = useCallback((name: string) => {
    const labels: Record<string, string> = {};
    sourcesRef.current.forEach((s) => {
      labels[s.id] = s.label;
    });
    const preset: ScenePreset = {
      id: `pre-${crypto.randomUUID()}`,
      name: name.trim() || `Scene ${Date.now()}`,
      layouts: { ...layoutsRef.current },
      labels,
      scene: sceneRef.current,
    };
    setPresets((prev) => [...prev, preset]);
    return preset.id;
  }, []);

  const loadPreset = useCallback(
    (id: string) => {
      const p = presets.find((x) => x.id === id);
      if (!p) return;
      // map old layout keys to current sources by label match
      const next: Record<string, FreeformLayout> = {};
      const currentByLabel = new Map(sourcesRef.current.map((s) => [s.label, s.id]));
      Object.entries(p.layouts).forEach(([oldId, layout]) => {
        const oldLabel = p.labels[oldId];
        const newId = oldLabel ? currentByLabel.get(oldLabel) : undefined;
        if (newId) next[newId] = layout;
        else if (sourcesRef.current.some((s) => s.id === oldId)) next[oldId] = layout;
      });
      if (Object.keys(next).length) setLayouts((prev) => ({ ...prev, ...next }));
      const legacyScene = p.scene as StudioScene | "pip";
      setScene(legacyScene === "pip" ? "freeform" : legacyScene);
      setExpandedId(null);
    },
    [presets],
  );

  const deletePreset = useCallback((id: string) => {
    setPresets((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return {
    sources,
    scene,
    activeId,
    publishing,
    error,
    cameraDevices,
    layouts,
    expandedId,
    snapEnabled,
    presets,
    canvas: canvasEl,
    canvasW: CANVAS_W,
    canvasH: CANVAS_H,
    setScene,
    setActiveId,
    setSnapEnabled,
    refreshDevices,
    requestCameraPermission,
    addCamera,
    addScreen,
    addExternalStream,
    removeSource,
    toggleVisible,
    toggleMute,
    renameSource,
    toggleLock,
    setFit,
    setLayout,
    bringToFront,
    sendToBack,
    expandSource,
    resetLayouts,
    savePreset,
    loadPreset,
    deletePreset,
    startPublish,
    stopPublish,
    clearError: () => setError(null),
  };
}

// ─── Layout helpers ──────────────────────────────────────────────────────
type Tile = { source: StudioSource; x: number; y: number; w: number; h: number };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function clamp01(n: number) {
  return clamp(n, 0, 1);
}

function layoutTiles(
  scene: StudioScene,
  count: number,
  featured: StudioSource,
  others: StudioSource[],
): Tile[] {
  if (scene === "solo" || count === 1) {
    return [{ source: featured, x: 0, y: 0, w: CANVAS_W, h: CANVAS_H }];
  }
  if (scene === "split") {
    const second = others[0] ?? featured;
    const w = CANVAS_W / 2;
    return [
      { source: featured, x: 0, y: 0, w, h: CANVAS_H },
      { source: second, x: w, y: 0, w, h: CANVAS_H },
    ];
  }
  // grid up to 4
  const all = [featured, ...others].slice(0, 4);
  if (all.length === 2) {
    const w = CANVAS_W / 2;
    return all.map((s, i) => ({ source: s, x: i * w, y: 0, w, h: CANVAS_H }));
  }
  if (all.length === 3) {
    const mainW = (CANVAS_W * 2) / 3;
    const sideW = CANVAS_W - mainW;
    const sideH = CANVAS_H / 2;
    return [
      { source: all[0], x: 0, y: 0, w: mainW, h: CANVAS_H },
      { source: all[1], x: mainW, y: 0, w: sideW, h: sideH },
      { source: all[2], x: mainW, y: sideH, w: sideW, h: sideH },
    ];
  }
  const w = CANVAS_W / 2;
  const h = CANVAS_H / 2;
  return [
    { source: all[0], x: 0, y: 0, w, h },
    { source: all[1], x: w, y: 0, w, h },
    { source: all[2], x: 0, y: h, w, h },
    { source: all[3], x: w, y: h, w, h },
  ];
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  v: HTMLVideoElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  drawFit(ctx, v, x, y, w, h, "cover");
}

function drawFit(
  ctx: CanvasRenderingContext2D,
  v: HTMLVideoElement,
  x: number,
  y: number,
  w: number,
  h: number,
  fit: "cover" | "contain",
) {
  const sw = v.videoWidth;
  const sh = v.videoHeight;
  if (!sw || !sh) return;
  const scale = fit === "cover" ? Math.max(w / sw, h / sh) : Math.min(w / sw, h / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  if (fit === "contain") {
    ctx.fillStyle = "#000";
    ctx.fillRect(x, y, w, h);
  }
  ctx.drawImage(v, dx, dy, dw, dh);
  ctx.restore();
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
}
