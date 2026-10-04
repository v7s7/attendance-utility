import type { ReactNode } from "react";
import type { Organization } from "../../core/api.ts";
import { localToday } from "../../core/time.ts";
import { date } from "../format.ts";
import { useLang } from "../i18n/context.ts";
import { cx } from "../ui/cx.ts";

/**
 * A printed sheet. The page itself has no margin, so the browser adds no title, address, date
 * or page number; the empty header and footer rows repeat on every page as its margin.
 */
export function PrintSheet({ children, breakAfter }: { children: ReactNode; breakAfter?: boolean }) {
  return (
    <table className={cx("hidden w-full text-[11px] leading-snug text-black print:table", breakAfter && "break-after-page")}>
      <thead>
        <tr>
          <td className="h-[12mm]" />
        </tr>
      </thead>
      <tfoot>
        <tr>
          <td className="h-[12mm]" />
        </tr>
      </tfoot>
      <tbody>
        <tr>
          <td className="px-[12mm] align-top">{children}</td>
        </tr>
      </tbody>
    </table>
  );
}

export function PrintHeader({ organization, title, lines }: { organization: Organization; title: string; lines: string[] }) {
  const { t } = useLang();
  return (
    <header className="mb-3 flex items-start justify-between gap-6 border-b-2 border-black pb-2.5">
      <div>
        <div className="text-[13px] font-bold">{organization.name || t("app.name")}</div>
        <div className="text-[11px] text-slate-700">{organization.unit || t("app.tagline")}</div>
      </div>
      <div className="text-end">
        <div className="text-[15px] font-bold">{title}</div>
        {lines.map((l) => (
          <div key={l} className="text-[11px] text-slate-700">
            {l}
          </div>
        ))}
      </div>
    </header>
  );
}

/** A row of labelled boxes, e.g. working days, absences, deduction. */
export interface SummaryItem {
  label: string;
  value: ReactNode;
  /** A short line under the number, e.g. "of 137:15" or "4 days". */
  sub?: string;
}

/** The month in a row of boxes: a label, one number, and a short note under it. */
export function PrintSummary({ items }: { items: SummaryItem[] }) {
  return (
    <div className="mb-3 grid border border-slate-500" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((item, i) => (
        <div key={item.label} className={i ? "border-s border-slate-300 px-2 py-1.5 text-center" : "px-2 py-1.5 text-center"}>
          <div className="text-[9.5px] whitespace-nowrap text-slate-600">{item.label}</div>
          <div className="text-[13px] font-bold whitespace-nowrap tabular-nums" dir="ltr">
            {item.value}
          </div>
          {item.sub ? <div className="text-[9px] whitespace-nowrap text-slate-600">{item.sub}</div> : null}
        </div>
      ))}
    </div>
  );
}

export function Signatures({ labels }: { labels: string[] }) {
  return (
    <div className="mt-8 grid gap-10" style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }}>
      {labels.map((l) => (
        <div key={l} className="border-t border-black pt-1 text-[10.5px]">
          {l}
          <div className="mt-4 text-slate-500">………………</div>
        </div>
      ))}
    </div>
  );
}

export function PrintFooter({ note }: { note: string }) {
  const { t } = useLang();
  return (
    <footer className="mt-4 flex justify-between border-t border-slate-300 pt-1.5 text-[9.5px] text-slate-600">
      <span>
        {t("print.footer")} · {note}
      </span>
      <span>{t("print.printedAt", { date: date(localToday()) })}</span>
    </footer>
  );
}

