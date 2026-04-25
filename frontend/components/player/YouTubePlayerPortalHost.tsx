"use client";

import { memo, type RefObject } from "react";

type YouTubePlayerPortalHostProps = {
  hostRef: RefObject<HTMLDivElement | null>;
  className?: string;
};

function YouTubePlayerPortalHostComponent({ hostRef, className }: YouTubePlayerPortalHostProps) {
  return <div ref={hostRef} className={className} data-yt-player-host="true" />;
}

const YouTubePlayerPortalHost = memo(YouTubePlayerPortalHostComponent);

export default YouTubePlayerPortalHost;
