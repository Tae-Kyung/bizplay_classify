'use client';

import { useEffect, useRef } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}

export function Modal({ open, onClose, title, children, wide }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,64,139,0.15)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        className={`rounded-2xl ${wide ? 'max-w-2xl' : 'max-w-md'} w-full mx-4 max-h-[90vh] overflow-y-auto`}
        style={{ backgroundColor: '#ffffff', boxShadow: '0 40px 80px rgba(0,64,139,0.08)' }}
      >
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #f0eded' }}>
          <h2 className="text-base font-semibold" style={{ color: '#1b1c1c', fontFamily: 'var(--font-plus-jakarta-sans, sans-serif)' }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-xl leading-none transition-colors"
            style={{ color: '#727784' }}
          >
            &times;
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
