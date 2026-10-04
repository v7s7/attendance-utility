import { useT } from "../i18n";
import { todayStr } from "../utils/calc";

// Signature lines that only appear on paper
export default function PrintFooter() {
  const t = useT();
  return (
    <div className="printOnly printFooter">
      <div>
        {t("print.printed")}: <span dir="ltr">{todayStr()}</span>
      </div>
      <div className="signRow">
        <div className="signBox">{t("print.preparedBy")}</div>
        <div className="signBox">{t("print.approvedBy")}</div>
      </div>
    </div>
  );
}
