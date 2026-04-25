"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";

type PlayerMountManagerProps = {
  collapsedHostRef: RefObject<HTMLDivElement | null>;
  expandedHostRef: RefObject<HTMLDivElement | null>;
  isExpanded: boolean;
  hasActiveVideo: boolean;
};

const MOUNT_NODE_ID = "ponotai-yt-player";
const CONNECTED_EVENT = "ponotai:yt-mount-connected";
const DEBUG_PLAYER_MOUNT = process.env.NODE_ENV !== "production";

function logMountDebug(message: string, extra?: Record<string, unknown>) {
  if (!DEBUG_PLAYER_MOUNT) return;
  if (extra) {
    console.debug(`[PlayerMountManager] ${message}`, extra);
    return;
  }
  console.debug(`[PlayerMountManager] ${message}`);
}

function getConnectedMountNode() {
  const node = document.getElementById(MOUNT_NODE_ID);
  return node && node.isConnected ? node : null;
}

export default function PlayerMountManager({ collapsedHostRef, expandedHostRef, isExpanded, hasActiveVideo }: PlayerMountManagerProps) {
  const [mounted, setMounted] = useState(false);
  const mountNodeRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!mounted) return;
    const existing = getConnectedMountNode();
    if (existing) {
      mountNodeRef.current = existing;
      logMountDebug("Reusing existing mount node", { tagName: existing.tagName });
      return;
    }
    const mountNode = document.createElement("div");
    mountNode.id = MOUNT_NODE_ID;
    mountNode.className = "h-full w-full";
    mountNodeRef.current = mountNode;
    logMountDebug("Created fresh mount node");
  }, [mounted]);

  useLayoutEffect(() => {
    if (!mounted) return;
    const collapsedHost = collapsedHostRef.current;
    const expandedHost = expandedHostRef.current;
    if (!collapsedHost && !expandedHost) {
      logMountDebug("No hosts available yet");
      return;
    }

    mountNodeRef.current = document.getElementById(MOUNT_NODE_ID) ?? mountNodeRef.current;
    if (!mountNodeRef.current) return;

    const targetHost = isExpanded && hasActiveVideo
      ? (expandedHost ?? collapsedHost)
      : (collapsedHost ?? expandedHost);
    if (!targetHost) {
      logMountDebug("Resolved target host is missing", { isExpanded, hasActiveVideo });
      return;
    }

    if (mountNodeRef.current.parentElement !== targetHost) {
      targetHost.appendChild(mountNodeRef.current);
      logMountDebug("Moved mount node", {
        isExpanded,
        hasActiveVideo,
        targetHost: targetHost.dataset.ytPlayerHost ?? "unknown",
      });
    }

    if (mountNodeRef.current.isConnected) {
      window.dispatchEvent(new CustomEvent(CONNECTED_EVENT));
      logMountDebug("Dispatched mount connected event");
    }
  }, [collapsedHostRef, expandedHostRef, hasActiveVideo, isExpanded, mounted]);

  return null;
}
