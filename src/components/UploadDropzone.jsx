import { useMemo, useState } from "react";
import { parseFile } from "../utils/parseFile";
import { buildReport } from "../utils/calc";

function formatMin(min) {
  if (min === null || min === undefined) return "-";
  const h = Math.floor(min / 60);
  const m = Math.abs(min % 60);
  const mm = String(m).padStart(2, "0");
  return String(h) + "h " + mm + "m";
}

function badgeClass(status) {
  if (status === "OK") return "badge badgeOK";
  if (status === "SHORT") return "badge badgeSHORT";
  if (status === "ABSENT") return "badge badgeABSENT";
  return "badge badgeINCOMPLETE";
}

function rowClass(status) {
  if (status === "OK") return "rowOK";
  if (status === "SHORT") return "rowSHORT";
  if (status === "ABSENT") return "rowABSENT";
  return "rowINCOMPLETE";
}

export default function UploadDropzone() {
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);

  const summary = useMemo(() => {
    if (!report) return null;
    const shortCount = report.daily.filter((x) => x.status === "SHORT").length;
    const absentCount = report.daily.filter((x) => x.status === "ABSENT").length;
    const incompleteCount = report.daily.filter((x) => x.status === "INCOMPLETE").length;

    return {
      days: report.daily.length,
      shortDays: shortCount,
      incompleteDays: incompleteCount,
      absentDays: absentCount,
    };
  }, [report]);

  async function handlePick(file) {
    setError("");
    setReport(null);

    if (!file) return;
    setFileName(file.name);

    const ext = file.name.toLowerCase();
    if (!ext.endsWith(".csv") && !ext.endsWith(".xlsx") && !ext.endsWith(".xls")) {
      setError("Please upload a CSV or Excel file.");
      return;
    }

    try {
      const rows = await parseFile(file);
      const rep = buildReport(rows);
      setReport(rep);
    } catch (e) {
      setError(e && e.message ? e.message : "Failed to parse file.");
    }
  }

  function onInputChange(e) {
    const file = e.target.files && e.target.files[0];
    handlePick(file);
  }

  return (
    <div>
      <div className="dropzone">
        <input
          type="file"
          accept=".csv"
          onChange={onInputChange}
          className="hidden"
          id="fileInput"
        />

        <label htmlFor="fileInput" className="dropzoneLabel">
<div className="dropTitle">Click to upload CSV</div>
          <div className="dropHint">
            Exported attendance template (Date / Times / Time columns)
          </div>
        </label>

        {fileName ? (
          <div className="fileNote">
            Selected: <b>{fileName}</b>
          </div>
        ) : null}
      </div>

      {error ? <div className="errorBox">{error}</div> : null}

      {summary ? (
        <div className="statsGrid">
          <div className="statCard">
            <div className="statLabel">Working days in range</div>
            <div className="statValue">{summary.days}</div>
          </div>
          <div className="statCard">
            <div className="statLabel">Short days</div>
            <div className="statValue">{summary.shortDays}</div>
          </div>
          <div className="statCard">
            <div className="statLabel">Incomplete days</div>
            <div className="statValue">{summary.incompleteDays}</div>
          </div>
          <div className="statCard">
            <div className="statLabel">Absent days</div>
            <div className="statValue">{summary.absentDays}</div>
          </div>
        </div>
      ) : null}

      {report ? (
        <>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Day</th>
                  <th>In</th>
                  <th>Out</th>
                  <th>Worked</th>
                  <th>Required</th>
                  <th>Delta</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {report.daily.map((r) => {
                  const delta =
                    r.deltaMin === null || r.deltaMin === undefined
                      ? "-"
                      : (r.deltaMin >= 0 ? "+" : "-") + formatMin(Math.abs(r.deltaMin));

                  return (
                    <tr key={r.date} className={rowClass(r.status)}>
                      <td><b>{r.date}</b></td>
                      <td>{r.dayName}</td>
                      <td>{r.inTime || "-"}</td>
                      <td>{r.outTime || "-"}</td>
                      <td>{formatMin(r.workedMin)}</td>
                      <td>{formatMin(r.requiredMin)}</td>
                      <td>{delta}</td>
                      <td><span className={badgeClass(r.status)}>{r.status}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid3">
            <div className="panel">
              <div className="panelTitle">Short Days</div>
              <div className="panelHint">Worked less than required</div>
              <ul className="list">
                {report.shortDays.length === 0 ? (
                  <li className="muted">None</li>
                ) : (
                  report.shortDays.map((x) => (
                    <li key={x.date} className="listItem">
                      <span>{x.date}</span>
                      <span style={{ fontWeight: 800, color: "#92400e" }}>
                        -{formatMin(x.shortByMin)}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </div>

            <div className="panel">
              <div className="panelTitle">Incomplete Days</div>
              <div className="panelHint">Missing in/out punches</div>
              <ul className="list">
                {report.incompleteDays.length === 0 ? (
                  <li className="muted">None</li>
                ) : (
                  report.incompleteDays.map((x) => (
                    <li key={x.date} className="listItem">
                      <span>{x.date}</span>
                      <span style={{ fontWeight: 800, color: "#334155" }}>
                        {x.reason}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </div>

            <div className="panel">
              <div className="panelTitle">Absent Days</div>
              <div className="panelHint">Working days with no record</div>
              <ul className="list">
                {report.absentDays.length === 0 ? (
                  <li className="muted">None</li>
                ) : (
                  report.absentDays.map((x) => (
                    <li key={x.date} className="listItem">
                      <span>{x.date}</span>
                      <span className="muted">{x.dayName}</span>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
