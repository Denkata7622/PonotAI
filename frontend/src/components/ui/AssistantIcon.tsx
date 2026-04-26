import type { CSSProperties } from "react";

type AssistantIconState = "idle" | "open" | "thinking" | "speaking" | "happy";

export type AssistantIconProps = {
  size?: number;
  state?: AssistantIconState;
  className?: string;
  animated?: boolean;
};

export default function AssistantIcon({
  size = 20,
  state = "idle",
  className = "",
  animated = true,
}: AssistantIconProps) {
  const style = { "--assistant-icon-size": `${size}px` } as CSSProperties;
  return (
    <span
      className={`assistant-icon ${className}`.trim()}
      data-state={state}
      data-animated={animated ? "true" : "false"}
      style={style}
      aria-hidden="true"
    >
      <span className="assistant-icon__face">
        <span className="assistant-icon__eyes">
          <span className="assistant-icon__eye" />
          <span className="assistant-icon__eye" />
        </span>
        <span className="assistant-icon__mouth" />
      </span>
    </span>
  );
}
