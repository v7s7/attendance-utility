import { X } from "lucide-react";
import { useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { useLang } from "../i18n/context.ts";
import { cx } from "./cx.ts";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** When set, the body is a form and Enter submits it. */
  onSubmit?: () => void;
  size?: "md" | "lg";
}

/** A modal on the native <dialog>, which keeps keyboard focus inside and closes on Escape. */
export function Dialog({ open, onClose, title, description, children, footer, onSubmit, size = "md" }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useLang();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // The browser focuses the first button (the close button); start where the form asks instead
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit?.();
  };

  const body = (
    <>
      <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {description ? <p className="mt-1 text-sm leading-relaxed text-slate-500">{description}</p> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="size-5" />
        </button>
      </header>
      <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
      {footer ? (
        <footer className="flex flex-wrap items-center justify-end gap-2 rounded-b-xl border-t border-slate-100 bg-slate-50/70 px-5 py-3">
          {footer}
        </footer>
      ) : null}
    </>
  );

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={cx(
        "m-auto w-[calc(100%-2rem)] rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/40",
        size === "lg" ? "max-w-2xl" : "max-w-lg",
      )}
    >
      {open ? onSubmit ? <form onSubmit={submit}>{body}</form> : body : null}
    </dialog>
  );
}
