import UploadDropzone from "../components/UploadDropzone";

export default function Home() {
  return (
    <div className="page">
      <div className="card">
        <div className="headerRow">
          <div>
            <h1 className="title">Attendance Utility</h1>
            <p className="subtext">
              Upload your exported CSV. The calculation counts only within
              <b> 07:00 → 15:15</b>. Thursdays require <b>7:00</b>, other workdays
              require <b>7:15</b>. Fridays/Saturdays are excluded.
            </p>
          </div>

          <div className="rulesBox">
            <div><b>Counted Window:</b> 07:00 → 15:15</div>
            <div><b>Required:</b> 7:15 (Thu 7:00)</div>
            <div><b>Weekend:</b> Fri/Sat excluded</div>
          </div>
        </div>

        <div className="section">
          <UploadDropzone />
        </div>
      </div>
    </div>
  );
}
