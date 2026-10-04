import { useLang, useT } from "../i18n";
import { formatBhd, formatDuration, formatRate, monthLabel } from "../utils/format";
import PrintFooter from "./PrintFooter";

function monthState(m, t) {
  if (m.rate === null) return { cls: "badge badgeABSENT", text: t("state.noWage") };
  if (m.needsReview) return { cls: "badge badgeINCOMPLETE", text: t("state.review", { n: m.needsReview }) };
  return { cls: "badge badgeOK", text: t("state.ready") };
}

export default function Overview({ report, month, onOpen, onExport }) {
  const t = useT();
  const lang = useLang();
  const rows = report.employees.map((e) => ({ e, m: e.months[month] }));
  // Sum only employees whose wage is set; show "-" until at least one is
  const priced = rows.filter((r) => r.m.deductionFils !== null);
  const totalFils = priced.length ? priced.reduce((sum, r) => sum + r.m.deductionFils, 0) : null;
  const totalMin = rows.reduce((sum, r) => sum + r.m.deductibleMin, 0);

  return (
    <div className="section">
      <div className="sectionHeader">
        <div>
          <h2 className="sectionTitle">{t("overview.title", { month: monthLabel(month, lang) })}</h2>
          <div className="panelHint noPrint">{t("overview.hint")}</div>
        </div>
        <div className="btnRow noPrint">
          <button type="button" className="btn" onClick={onExport}>
            {t("btn.export")}
          </button>
          <button type="button" className="btn btnGhost" onClick={() => window.print()}>
            {t("btn.print")}
          </button>
        </div>
      </div>

      {rows.some((r) => r.m.partial) ? <div className="warnBox">{t("state.partial")}</div> : null}

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>{t("col.name")}</th>
              <th>{t("col.cpr")}</th>
              <th>{t("col.workingDays")}</th>
              <th>{t("col.absent")}</th>
              <th>{t("col.review")}</th>
              <th>{t("col.late")}</th>
              <th>{t("col.early")}</th>
              <th>{t("col.deductible")}</th>
              <th>{t("col.rate")}</th>
              <th>{t("col.deduction")}</th>
              <th>{t("col.state")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ e, m }) => {
              const state = monthState(m, t);
              return (
                <tr key={e.id} className="clickRow" onClick={() => onOpen(e.id)}>
                  <td>
                    {/* the row's click handler opens it; the button gives keyboard access */}
                    <button type="button" className="linkBtn">
                      <b>{e.name || "-"}</b>
                    </button>
                    {e.department ? <div className="muted small">{e.department}</div> : null}
                  </td>
                  <td dir="ltr">{e.id || "-"}</td>
                  <td>{m.workingDays}</td>
                  <td>{m.absentDays}</td>
                  <td>{m.needsReview || "-"}</td>
                  <td>{formatDuration(m.lateMin, lang)}</td>
                  <td>{formatDuration(m.earlyMin, lang)}</td>
                  <td>
                    <b>{formatDuration(m.deductibleMin, lang)}</b>
                  </td>
                  <td dir="ltr">{formatRate(m.rate)}</td>
                  <td>
                    <b>{formatBhd(m.deductionFils, lang)}</b>
                  </td>
                  <td>
                    <span className={state.cls}>{state.text}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={7}>{t("overview.total")}</td>
              <td>{formatDuration(totalMin, lang)}</td>
              <td />
              <td>{formatBhd(totalFils, lang)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <PrintFooter />
    </div>
  );
}
