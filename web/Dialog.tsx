import { useEffect, useRef, useId, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Dialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = ref.current;
    element?.showModal();
    element?.querySelector<HTMLElement>('input,select,textarea')?.focus();
    return () => {
      element?.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? 'dialog-wide' : ''}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      aria-labelledby={titleId}
    >
      <header className="dialog-head">
        <h2 id={titleId}>{title}</h2>
        <button className="icon-button" aria-label="Close dialog" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      <div className="dialog-body">{children}</div>
    </dialog>
  );
}
