"use client";
import { useEffect } from "react";
import { installGlobalPerfHandlers } from "@/lib/perfMonitor";

export function PerfMonitorBootstrap() {
  useEffect(() => {
    installGlobalPerfHandlers();
  }, []);
  return null;
}
