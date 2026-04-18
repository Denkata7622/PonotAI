'use client';

import { useEffect, useState } from "react";
import type { ChatMessage } from "../types";
import ActionCard from "./ActionCard";
import { normalizeVisibleText } from "@/lib/text";

type Props = {
  message: ChatMessage;
  onApplyStart?: () => void;
  onApplySuccess?: () => void;
  onDismiss?: () => void;
  onApplyFailure?: () => void;
};

export default function MessageBubble({ message, onApplyStart, onApplySuccess, onDismiss, onApplyFailure }: Props) {
  const [hovered, setHovered] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const time = mounted
    ? new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  if (message.role === "system") {
    return <div className="assistant-system-message">{normalizeVisibleText(message.content)}</div>;
  }

  return (
    <div className={`assistant-message-wrap assistant-${message.role}`} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div className="assistant-message-bubble">
        <div className="assistant-message-content">{normalizeVisibleText(message.content)}</div>
      </div>
      {mounted && hovered ? <span className="assistant-time">{time}</span> : null}
      {message.actionIntent && message.actionState && onApplyStart && onApplySuccess && onDismiss && onApplyFailure ? (
        <ActionCard
          intent={message.actionIntent}
          onApplyStart={onApplyStart}
          onApplySuccess={onApplySuccess}
          onDismiss={onDismiss}
          onApplyFailure={onApplyFailure}
          state={message.actionState}
          autoApply={message.autoApplyAction}
        />
      ) : null}
    </div>
  );
}
