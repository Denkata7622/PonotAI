'use client';

import { useEffect, useState } from "react";
import type { ChatMessage } from "../types";
import ActionCard from "./ActionCard";

type Props = {
  message: ChatMessage;
  onAccept?: () => void;
  onDismiss?: () => void;
};

export default function MessageBubble({ message, onAccept, onDismiss }: Props) {
  const [hovered, setHovered] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const time = mounted
    ? new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  if (message.role === "system") {
    return <div className="assistant-system-message">{message.content}</div>;
  }

  return (
    <div className={`assistant-message-wrap assistant-${message.role}`} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div className="assistant-message-bubble">
        <div className="assistant-message-content">{message.content}</div>
      </div>
      {mounted && hovered ? <span className="assistant-time">{time}</span> : null}
      {message.actionIntent && message.actionState === "pending" && onAccept && onDismiss ? (
        <ActionCard intent={message.actionIntent} onAccept={onAccept} onDismiss={onDismiss} state={message.actionState} />
      ) : null}
      {message.actionIntent && message.actionState && message.actionState !== "pending" ? (
        <ActionCard intent={message.actionIntent} onAccept={() => {}} onDismiss={() => {}} state={message.actionState} />
      ) : null}
    </div>
  );
}
