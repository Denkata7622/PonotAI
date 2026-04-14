"use client";

import { useRef, type DragEvent } from "react";
import { t, type Language } from "../lib/translations";
import Modal from "../src/components/ui/Modal";

type UploadModalProps = {
  language: Language;
  open: boolean;
  previewUrl: string | null;
  onClose: () => void;
  onSelectFile: (file: File) => void;
  onSubmit: () => void;
  disabled?: boolean;
};

export default function UploadModal({ language, open, previewUrl, onClose, onSelectFile, onSubmit, disabled }: UploadModalProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) onSelectFile(file);
  }

  return (
    <Modal isOpen={open} onClose={onClose} title={t("upload_modal_title", language)} maxWidth="480px" centerOnMobile>
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
    </Modal>
  );
}
