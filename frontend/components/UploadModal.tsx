"use client";

import { useRef, type DragEvent } from "react";
import { t, type Language } from "../lib/translations";
import Modal from "../src/components/ui/Modal";

type UploadModalProps = {
  language: Language;
  open: boolean;
  previewUrls: string[];
  onClose: () => void;
  onSelectFiles: (files: File[]) => void;
  onSubmit: () => void;
  disabled?: boolean;
};

export default function UploadModal({ language, open, previewUrls, onClose, onSelectFiles, onSubmit, disabled }: UploadModalProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length > 0) onSelectFiles(files);
  }

  return (
    <Modal isOpen={open} onClose={onClose} title={t("upload_modal_title", language)} maxWidth="480px" centerOnMobile>
      <div
        className="cursor-pointer rounded-2xl border-2 border-dashed border-border bg-surface p-10 text-center"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        {previewUrls.length > 0 ? (
          <div className="mx-auto grid max-h-56 grid-cols-3 gap-2 overflow-y-auto">
            {previewUrls.slice(0, 9).map((url, index) => (
              <img key={`${url}-${index}`} src={url} alt={`preview-${index + 1}`} className="h-16 w-full rounded-lg object-cover" />
            ))}
          </div>
        ) : (
          <p className="text-text-muted">{t("upload_modal_hint", language)}</p>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) onSelectFiles(files);
        }}
      />

      <div className="mt-5 flex flex-wrap justify-end gap-3">
        <button onClick={() => inputRef.current?.click()} className="glassBtn">{t("upload_choose_another", language)}</button>
        <button onClick={onSubmit} disabled={previewUrls.length === 0 || disabled} className="pillAction disabled:opacity-50">{t("upload_process", language)}</button>
      </div>
    </Modal>
  );
}
