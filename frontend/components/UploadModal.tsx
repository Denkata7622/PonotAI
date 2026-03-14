"use client";

import { useRef, type DragEvent } from "react";
import { t, type Language } from "../lib/translations";

type UploadModalProps = {
  language: Language;
  open: boolean;
  previewUrl: string | null;
  onClose: () => void;
  onSelectFile: (file: File) => void;
  onSubmit: () => void;
  disabled?: boolean;
};

export default function UploadModal({
  language,
  open,
  previewUrl,
  onClose,
  onSelectFile,
  onSubmit,
  disabled,
}: UploadModalProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  if (!open) return null;

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) onSelectFile(file);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-2xl font-semibold">{t("upload_modal_title", language)}</h3>
          <button onClick={onClose} className="glassBtn">✕</button>
        </div>

        <div
          className="cursor-pointer rounded-2xl border-2 border-dashed border-border bg-surface p-10 text-center"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
        >
          {previewUrl ? (
            <img src={previewUrl} alt="preview" className="mx-auto h-52 rounded-xl object-cover" />
          ) : (
            <p className="text-text-muted">{t("upload_modal_hint", language)}</p>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onSelectFile(file);
          }}
        />

        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button onClick={() => inputRef.current?.click()} className="glassBtn">{t("upload_choose_another", language)}</button>
          <button onClick={onSubmit} disabled={!previewUrl || disabled} className="pillAction disabled:opacity-50">{t("upload_process", language)}</button>
        </div>
      </div>
    </div>
  );
}
