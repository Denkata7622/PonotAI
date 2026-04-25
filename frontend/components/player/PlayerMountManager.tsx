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
      return;
    }
    const mountNode = document.createElement("div");
    mountNode.id = MOUNT_NODE_ID;
    mountNode.className = "h-full w-full";
    mountNodeRef.current = mountNode;
  }, [mounted]);

  useLayoutEffect(() => {
    if (!mounted) return;
    const collapsedHost = collapsedHostRef.current;
    const expandedHost = expandedHostRef.current;
    if (!collapsedHost || !expandedHost) return;

    mountNodeRef.current = document.getElementById(MOUNT_NODE_ID) ?? mountNodeRef.current;
    if (!mountNodeRef.current) return;

    const targetHost = isExpanded && hasActiveVideo ? expandedHost : collapsedHost;

    if (mountNodeRef.current.parentElement !== targetHost) {
      targetHost.appendChild(mountNodeRef.current);
    }

    if (mountNodeRef.current.isConnected) {
      window.dispatchEvent(new CustomEvent(CONNECTED_EVENT));
    }
  }, [collapsedHostRef, expandedHostRef, hasActiveVideo, isExpanded, mounted]);

  return null;
}
