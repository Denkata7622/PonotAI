'use client';

import { ReactNode, useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { X } from '../../../lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  maxWidth?: string;
  centerOnMobile?: boolean;
  panelClassName?: string;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = '480px',
  centerOnMobile = false,
  panelClassName = '',
}: ModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!mounted || !isOpen) return null;

  return ReactDOM.createPortal(
    <>
      <div onClick={onClose} className="fixed inset-0 z-[1000] bg-[var(--overlay-scrim)] backdrop-blur-sm" />
      <div
        data-modal-box
        className={`fixed left-1/2 top-1/2 z-[1001] w-[90%] max-h-[85vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--panel-border)] bg-[var(--panel-surface-elevated)] p-6 shadow-[var(--shadow-raised)] ${panelClassName}`}
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="m-0 text-[1.1rem] font-semibold text-[var(--text)]">{title}</h2>
            <button onClick={onClose} className="flex items-center rounded-[var(--radius-sm)] p-1 text-[var(--muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text)]">
              <X width={18} height={18} />
            </button>
          </div>
        )}
        {children}
      </div>

      {!centerOnMobile ? (
        <style>{`
          @media (max-width: 768px) {
            [data-modal-box] {
              top: auto !important;
              bottom: 0 !important;
              left: 0 !important;
              transform: none !important;
              width: 100% !important;
              max-width: 100% !important;
              border-radius: var(--radius-lg) var(--radius-lg) 0 0 !important;
            }
          }
        `}</style>
      ) : null}
    </>,
    document.body,
  );
}

export default Modal;
