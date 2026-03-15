"use client";

import type { KeyboardEvent, RefObject } from "react";
import { Search, X } from "lucide-react";

type SearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  placeholder: string;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  className?: string;
};

export default function SearchInput({
  value,
  onChange,
  onClear,
  placeholder,
  onFocus,
  onBlur,
  onKeyDown,
  inputRef,
  className = "",
}: SearchInputProps) {
  return (
    <div
      className={`flex w-full items-center rounded-full border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 ${className}`}
    >
      <Search className="h-4 w-4 shrink-0 text-[var(--muted)]" />
      <input
        ref={inputRef}
        className="ml-2 w-full bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
      />
      {value.trim().length > 0 && (
        <button
          type="button"
          className="ml-2 rounded-full p-1 text-[var(--muted)] transition hover:bg-[var(--hover-bg)] hover:text-[var(--text)]"
          onClick={onClear}
          aria-label={placeholder}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
