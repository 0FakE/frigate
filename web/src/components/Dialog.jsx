import { h } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Dialog({
  children,
  portalRootID = 'dialogs',
  size = 'md',
  labelledBy,
  describedBy,
  label = 'Dialog',
}) {
  const portalRoot = portalRootID && document.getElementById(portalRootID);
  const dialogRef = useRef(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const panel = dialogRef.current;
    const first = panel?.querySelector('[data-dialog-initial-focus]') || panel?.querySelector(FOCUSABLE);
    (first || panel)?.focus();

    const animation = window.requestAnimationFrame(() => setShow(true));
    const handleKeyDown = (event) => {
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const controls = [...dialogRef.current.querySelectorAll(FOCUSABLE)];
      if (!controls.length) {
        event.preventDefault();
        return;
      }
      const firstControl = controls[0];
      const lastControl = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === firstControl || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault();
        lastControl.focus();
      } else if (!event.shiftKey && (document.activeElement === lastControl || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault();
        firstControl.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(animation);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused?.isConnected && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, []);

  const maxWidth = size === 'lg' ? 'max-w-2xl' : 'max-w-[460px]';
  const dialog = (
    <div data-testid="scrim"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 px-4 py-4 sm:px-6 sm:py-8">
      <div ref={dialogRef} role="dialog" aria-modal="true"
        aria-labelledby={labelledBy} aria-describedby={describedBy}
        aria-label={labelledBy ? undefined : label} tabIndex={-1}
        className={`relative w-full min-w-0 ${maxWidth} max-h-[calc(100vh-2rem)] overflow-y-auto rounded-lg border border-slate-300/70 bg-white text-slate-900 shadow-2xl transition-opacity transition-transform duration-150 dark:border-slate-600/70 dark:bg-slate-900 dark:text-slate-100 ${show ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}>
        {children}
      </div>
    </div>
  );
  return portalRoot ? createPortal(dialog, portalRoot) : dialog;
}
