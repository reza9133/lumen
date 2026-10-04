import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { XIcon } from "./icons";

// Accessible dialog: Esc or a click outside closes it, page scroll is locked while it is open and
// focus returns to where it was. It renders through a portal into <body> so the blurred header can
// never clip it.
export default function Modal(p: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode }) {
  const { open, onClose } = p;
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const before = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    const on = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", on);
    return () => {
      document.removeEventListener("keydown", on);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="modal-scrim" onClick={onClose}>
      <div
        ref={panel}
        className="dialog modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-x" onClick={onClose} aria-label="Close">
          <XIcon />
        </button>
        <h2 id={titleId}>{p.title}</h2>
        {p.description && <p className="meta">{p.description}</p>}
        <div className="modal-body">{p.children}</div>
      </div>
    </div>,
    document.body,
  );
}
