import { Download, Pencil, Search, Upload, Users } from "lucide-react";
import { useRef, useState } from "react";
import type { EmployeeView } from "../../core/api.ts";
import type { SheetResult } from "../../core/employeeSheet.ts";
import { api } from "../api.ts";
import { EmployeeDialog } from "../components/EmployeeDialog.tsx";
import { SheetReview } from "../components/EmployeeSheet.tsx";
import { rate } from "../format.ts";
import { useLang } from "../i18n/context.ts";
import { Alert } from "../ui/Alert.tsx";
import { Badge } from "../ui/Badge.tsx";
import { Button } from "../ui/Button.tsx";
import { Card } from "../ui/Card.tsx";
import { cx } from "../ui/cx.ts";
import { Check } from "../ui/Field.tsx";
import { PageHeader } from "../ui/PageHeader.tsx";
import { Empty, Loading, LoadError } from "../ui/States.tsx";
import { navigate, paths } from "../router.ts";
import { Link } from "../ui/Link.tsx";
import { useApi } from "../useApi.ts";

type Filter = "all" | "noWage";

export function EmployeesPage() {
  const { t, lang } = useLang();
  const employees = useApi("employees", api.employees);
  const settings = useApi("settings", api.settings);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>(() => (new URLSearchParams(location.search).get("filter") === "noWage" ? "noWage" : "all"));
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<EmployeeView | null>(null);
  const [sheet, setSheet] = useState<Extract<SheetResult, { ok: true }> | null>(null);
  const [sheetMessage, setSheetMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const q = query.trim().toLowerCase();
  const visible = employees.data?.filter((e) => showInactive || e.active);
  const noWage = visible?.filter((e) => e.rate === null).length ?? 0;
  const list = visible?.filter(
    (e) =>
      (filter === "all" || e.rate === null) &&
      (!q || e.name.toLowerCase().includes(q) || e.exportedName.toLowerCase().includes(q) || e.id.includes(q) || e.employeeNo.includes(q)),
  );

  const download = async () => {
    if (!employees.data || !settings.data) return;
    setBusy(true);
    try {
      // The Excel code loads only when it is used
      const { downloadEmployeeSheet } = await import("../sheetFile.ts");
      await downloadEmployeeSheet(employees.data, settings.data.schedules, lang, t);
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File | undefined) => {
    if (!file || !employees.data || !settings.data) return;
    setSheetMessage(null);
    setSheet(null);
    try {
      const { readUploadedSheet } = await import("../sheetFile.ts");
      const result = await readUploadedSheet(file, employees.data, settings.data.schedules);
      if (result.ok) setSheet(result);
      else setSheetMessage({ tone: "danger", text: t("sheet.noHeader") });
    } catch {
      setSheetMessage({ tone: "danger", text: t("sheet.unreadable") });
    }
  };

  return (
    <>
      <PageHeader
        title={t("employees.title")}
        description={`${t("employees.subtitle")} ${t("sheet.hint")}`}
        actions={
          <>
            <Button icon={Download} loading={busy} disabled={!employees.data?.length || !settings.data} onClick={() => void download()}>
              {t("sheet.download")}
            </Button>
            <Button icon={Upload} disabled={!employees.data?.length || !settings.data} onClick={() => fileRef.current?.click()}>
              {t("sheet.upload")}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              onChange={(e) => {
                void upload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </>
        }
      />

      <div className="flex flex-col gap-5">
        {sheetMessage ? <Alert tone={sheetMessage.tone}>{sheetMessage.text}</Alert> : null}
        {sheet && settings.data ? (
          <SheetReview
            result={sheet}
            schedules={settings.data.schedules}
            defaultScheduleId={settings.data.defaultScheduleId}
            onCancel={() => setSheet(null)}
            onApplied={(n) => {
              setSheet(null);
              setSheetMessage({ tone: "success", text: t("sheet.applied", { n }) });
              employees.reload();
            }}
          />
        ) : null}

        {employees.error ? (
          <LoadError error={employees.error} retry={employees.reload} />
        ) : !list ? (
          <Loading />
        ) : (
          <Card
            flush
            actions={
              <>
                <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
                  {(["all", "noWage"] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFilter(f)}
                      className={cx(
                        "rounded-md px-2.5 py-1 text-sm font-medium transition",
                        filter === f ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
                      )}
                    >
                      {f === "all" ? t("employees.filter.all") : t("employees.filter.noWage", { n: noWage })}
                    </button>
                  ))}
                </div>
                <Check label={t("employees.showInactive")} checked={showInactive} onChange={setShowInactive} />
                <div className="relative">
                  <Search className="pointer-events-none absolute start-2.5 top-2.5 size-4 text-slate-400" />
                  <input className="input w-64 ps-8" placeholder={t("common.search")} value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
              </>
            }
            title={`${t("employees.title")} (${list.length})`}
          >
            {employees.data?.length === 0 ? (
              <Empty icon={Users} title={t("employees.empty")} />
            ) : list.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-slate-500">{t("month.noMatch")}</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("col.name")}</th>
                    <th>{t("col.cpr")}</th>
                    <th>{t("col.employeeNo")}</th>
                    <th>{t("col.department")}</th>
                    <th>{t("col.schedule")}</th>
                    <th>{t("col.rate")}</th>
                    <th>{t("col.state")}</th>
                    <th aria-hidden />
                  </tr>
                </thead>
                <tbody>
                  {list.map((e) => (
                    <tr key={e.id} onClick={() => navigate(paths.employee(e.id))} className="cursor-pointer hover:bg-slate-50">
                      <td>
                        <Link href={paths.employee(e.id)} className="font-medium text-slate-900 hover:text-teal-700">
                          {e.name}
                        </Link>
                        {e.fullName && e.fullName !== e.exportedName ? <div className="text-xs text-slate-500">{e.exportedName}</div> : null}
                      </td>
                      <td dir="ltr" className="text-start text-slate-600">
                        {e.id}
                      </td>
                      <td dir="ltr" className="text-start text-slate-600">
                        {e.employeeNo || "–"}
                      </td>
                      <td className="text-slate-600">{e.department || "–"}</td>
                      <td>
                        {e.scheduleName}
                        {e.scheduleChoice === null ? <span className="ms-1.5 text-xs text-slate-400">({t("common.default")})</span> : null}
                      </td>
                      <td dir="ltr" className="text-start">
                        {e.rate === null ? <Badge tone="danger">{t("state.noWage")}</Badge> : rate(e.rate)}
                      </td>
                      <td>{e.active ? <Badge tone="success">{t("common.active")}</Badge> : <Badge>{t("common.inactive")}</Badge>}</td>
                      <td className="w-10">
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={Pencil}
                          aria-label={t("emp.details")}
                          title={t("emp.details")}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setEditing(e);
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        )}
      </div>

      {settings.data ? (
        <EmployeeDialog
          employee={editing}
          schedules={settings.data.schedules}
          defaultScheduleId={settings.data.defaultScheduleId}
          onClose={() => setEditing(null)}
          onSaved={employees.reload}
        />
      ) : null}
    </>
  );
}
