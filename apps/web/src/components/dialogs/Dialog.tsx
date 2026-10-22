import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from 'react';
import { cn } from '../primitives/cn';

export interface DialogProps {
  readonly open: boolean;
  /**
   * Called for every dismissal the person makes: Esc, a scrim click (unless `scrimDismiss` is
   * false) or the browser closing the dialog itself. The parent decides what dismissing means and
   * flips `open`; the dialog never closes itself, so state has one source of truth.
   */
  readonly onClose: () => void;
  /** The visible, labelling heading. */
  readonly title: string;
  readonly titleClassName?: string;
  /** Rendered beside the title (e.g. a close button). */
  readonly headerAction?: ReactNode;
  /** `sheet` is a bottom sheet on phones and a centred dialog from 1024px. */
  readonly variant?: 'dialog' | 'sheet';
  /** Whether Esc dismisses. Default true. */
  readonly escDismiss?: boolean;
  /** Whether a click on the scrim dismisses. Default true. */
  readonly scrimDismiss?: boolean;
  readonly role?: 'dialog' | 'alertdialog';
  /** Id of the element holding the body text, so the dialog is announced with its description. */
  readonly describedBy?: string;
  /** Initial focus lands on the title (tabIndex -1) so it is read first, not on a control. */
  readonly focusTitle?: boolean;
  readonly children: ReactNode;
}

const VARIANT = {
  dialog:
    'm-auto w-[calc(100%-2rem)] max-w-120 max-h-[calc(100dvh-2rem)] rounded-cloth border-2 border-ink',
  sheet: [
    'mx-0 mt-auto mb-0 w-full max-w-full max-h-[92dvh] rounded-t-2xl border-2 border-b-0 border-ink',
    'translate-y-0 transition-transform duration-[350ms] ease-weave starting:open:translate-y-full',
    'lg:m-auto lg:w-140 lg:max-h-[calc(100dvh-4rem)] lg:rounded-cloth lg:border-2 lg:starting:open:translate-y-0',
  ].join(' '),
} as const;

/**
 * An accessible modal built on the native `<dialog>`: `showModal()` gives the focus trap, the
 * inert page behind it, Esc and the top layer. This wrapper adds what the platform does not
 * guarantee everywhere: focus returns to the opener, `data-autofocus` picks the initial focus
 * (the safe choice, never a destructive one) and the scrim dismisses when allowed.
 *
 * Content is mounted only while open, so a reopened dialog always starts from a clean state.
 */
export function Dialog({
  open,
  onClose,
  title,
  titleClassName,
  headerAction,
  variant = 'dialog',
  escDismiss = true,
  scrimDismiss = true,
  role,
  describedBy,
  focusTitle = false,
  children,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const openRef = useRef(open);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    openRef.current = open;
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el || !open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!el.open) el.showModal();
    el.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return () => {
      if (el.open) el.close();
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);

  const dismiss = () => {
    if (openRef.current) onCloseRef.current();
  };

  // A click whose target is the <dialog> itself landed on the backdrop: the content wrapper
  // below fills the whole box, so nothing inside it can be the target.
  const onClick = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget && scrimDismiss) dismiss();
  };

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events -- backdrop click is a pointer convenience; Esc and the buttons are the keyboard paths.
    <dialog
      ref={ref}
      role={role}
      aria-labelledby={open ? titleId : undefined}
      aria-describedby={open ? describedBy : undefined}
      onCancel={(e) => {
        // `cancel` and `close` bubble through React's tree: a dialog nested inside this one (the
        // barcode match sheet inside the scanner sheet) must not dismiss its parent too.
        if (e.target !== e.currentTarget) return;
        // Keep React state the single source of truth: never let the browser close it for us.
        e.preventDefault();
        if (escDismiss) dismiss();
      }}
      onClose={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
      onClick={onClick}
      className={cn('bg-raised text-ink p-0 backdrop:bg-scrim', VARIANT[variant])}
    >
      {open && (
        <div className="flex flex-col gap-4 overflow-y-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] lg:p-7">
          <div className="flex items-start justify-between gap-3">
            <h2
              id={titleId}
              {...(focusTitle ? { tabIndex: -1, 'data-autofocus': true } : {})}
              className={cn(
                'font-display',
                focusTitle && 'outline-none',
                titleClassName ?? 'text-title',
              )}
            >
              {title}
            </h2>
            {headerAction}
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
