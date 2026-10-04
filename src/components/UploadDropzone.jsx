import { useState } from "react";
import { parseFile } from "../utils/parseFile";
import { useT } from "../i18n";

export default function UploadDropzone({ onLoaded, loadedText }) {
  const t = useT();
  const [names, setNames] = useState([]);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    setError("");
    if (files.length === 0) return;

    if (files.some((f) => !f.name.toLowerCase().endsWith(".csv"))) {
      setError(t("upload.onlyCsv"));
      return;
    }
    setNames(files.map((f) => f.name));

    try {
      const rows = (await Promise.all(files.map(parseFile))).flat();
      onLoaded(rows, files.length);
    } catch (e) {
      const code = e && e.message ? e.message : "";
      const known = t("err." + code);
      setError(known !== "err." + code ? known : t("err.generic") + (code ? " (" + code + ")" : ""));
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  return (
    <div className="noPrint">
      <div
        className={"dropzone" + (dragging ? " dropzoneActive" : "")}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          type="file"
          accept=".csv"
          multiple
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
          className="hidden"
          id="fileInput"
        />

        <label htmlFor="fileInput" className="dropzoneLabel">
          <div className="dropTitle">{t("upload.title")}</div>
          <div className="dropHint">{t("upload.hint")}</div>
        </label>

        {names.length ? (
          <div className="fileNote">
            <b dir="ltr">{names.join(" · ")}</b>
            {loadedText ? <span> — {loadedText}</span> : null}
          </div>
        ) : null}
      </div>

      {error ? <div className="errorBox">{error}</div> : null}
    </div>
  );
}
