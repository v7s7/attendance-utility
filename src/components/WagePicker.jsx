import { WAGE_SCALES } from "../data/wageTables";
import { useLang, useT } from "../i18n";
import { formatRate } from "../utils/format";
import { findScale, hourlyRate } from "../utils/wages";

export default function WagePicker({ profile, onChange }) {
  const t = useT();
  const lang = useLang();
  const custom = profile.mode === "custom";
  const scale = findScale(profile.scale);
  const grade = scale ? scale.grades.find((g) => g.grade === Number(profile.grade)) : null;
  const rate = hourlyRate(profile);

  function pickScale(value) {
    if (value === "custom") onChange({ mode: "custom", scale: "", grade: "", step: "" });
    else onChange({ mode: "table", scale: value, grade: "", step: "" });
  }

  return (
    <div className="wagePicker">
      <div className="fieldLabel">{t("wage.title")}</div>
      <div className="wageRow">
        <label className="field">
          <span className="fieldHint">{t("wage.scale")}</span>
          <select className="input" value={custom ? "custom" : profile.scale || ""} onChange={(e) => pickScale(e.target.value)}>
            <option value="">{t("wage.choose")}</option>
            {WAGE_SCALES.map((s) => (
              <option key={s.id} value={s.id}>
                {s[lang] || s.en}
              </option>
            ))}
            <option value="custom">{t("wage.custom")}</option>
          </select>
        </label>

        {custom ? (
          <label className="field">
            <span className="fieldHint">{t("wage.customRate")}</span>
            <input
              type="number"
              min="0"
              step="0.001"
              dir="ltr"
              className="input"
              value={profile.rate ?? ""}
              onChange={(e) => onChange({ rate: e.target.value })}
            />
          </label>
        ) : (
          <>
            <label className="field">
              <span className="fieldHint">{t("wage.grade")}</span>
              <select
                className="input"
                value={profile.grade ?? ""}
                disabled={!scale}
                onChange={(e) => onChange({ grade: e.target.value, step: "" })}
              >
                <option value="">{t("wage.choose")}</option>
                {scale
                  ? scale.grades.map((g) => (
                      <option key={g.grade} value={g.grade}>
                        {g.grade}
                      </option>
                    ))
                  : null}
              </select>
            </label>

            <label className="field">
              <span className="fieldHint">{t("wage.step")}</span>
              <select
                className="input"
                value={profile.step ?? ""}
                disabled={!grade}
                onChange={(e) => onChange({ step: e.target.value })}
              >
                <option value="">{t("wage.choose")}</option>
                {grade
                  ? grade.steps.map((v, i) =>
                      v === null ? null : (
                        <option key={i} value={i}>
                          {(i === 0 ? t("wage.min") : i) + " — " + formatRate(v)}
                        </option>
                      )
                    )
                  : null}
              </select>
            </label>
          </>
        )}
      </div>

      <div className={rate === null ? "wageResult wageMissing" : "wageResult"}>
        {rate === null ? t("wage.notSet") : t("wage.rateIs", { rate: formatRate(rate) })}
      </div>
      {!custom ? <div className="fieldHint">{t("wage.source")}</div> : null}
    </div>
  );
}
