import { useEffect } from "react";
import { initCapacitor } from "@/lib/capacitor";

/**
 * Mounts once in the root tree and wires up the native shell (status bar,
 * splash, keyboard, hardware back). No-op on web — safe to render always.
 */
export function CapacitorBootstrap() {
  useEffect(() => {
    void initCapacitor();
  }, []);
  return null;
}
