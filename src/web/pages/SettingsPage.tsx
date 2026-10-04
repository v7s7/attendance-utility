import { DatabaseBackup, Pencil, Plus, Trash } from "lucide-react";
import { useState } from "react";
import type { Organization, SettingsData } from "../../core/api.ts";
import { DEFAULT_SCHEDULES } from "../../core/schedule.ts";
import type { Rules, Schedule } from "../../core/types.ts";
import { api } from "../api.ts";
import { useAuth } from "../auth/context.ts";
import { ScheduleDialog } from "../components/ScheduleDialog.tsx";
import { scheduleLines } from "../components/scheduleText.ts";
import { errorText } from "../errors.ts";
import { duration } from "../format.ts";
import { useLang } from "../i18n/context.ts";
import { Alert } from "../ui/Alert.tsx";
import { Badge } from "../ui/Badge.tsx";
import { Button } from "../ui/Button.tsx";
import { Card } from "../ui/Card.tsx";
import { cx } from "../ui/cx.ts";
import { Check, Field } from "../ui/Field.tsx";
import { PageHeader } from "../ui/PageHeader.tsx";
import { Loading, LoadError } from "../ui/States.tsx";
import { useApi } from "../useApi.ts";

export function SettingsPage() {
  const { t } = useLang();
  const { isAdmin } = useAuth();
  const settings = useApi("settings", api.settings);

  return (
    <>
      <PageHeader title={t("settings.title")} description={t("settings.subtitle")} />
      {settings.error ? (
        <LoadError error={settings.error} retry={settings.reload} />
      ) : !settings.data ? (
        <Loading />
      ) : (
        <div className="flex flex-col gap-5">
          {!isAdmin ? <Alert tone="info">{t("common.adminOnly")}</Alert> : null}
          <SchedulesCard data={settings.data} canEdit={isAdmin} reload={settings.reload} />
          <div className="grid gap-5 lg:grid-cols-2">
            <RulesCard key={JSON.stringify(settings.data.rules)} rules={settings.data.rules} canEdit={isAdmin} reload={settings.reload} />
            <div className="flex flex-col gap-5">
              <OrganizationCard key={JSON.stringify(settings.data.organization)} organization={settings.data.organization} canEdit={isAdmin} reload={settings.reload} />
              {isAdmin ? <BackupCard /> : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

interface CardProps {
  canEdit: boolean;
  reload: () => void;
}

/** Save a change and show the result inline. */
function useSave(reload: () => void) {
  const { t } = useLang();
  const [state, setState] = useState<{ busy: boolean; message: string; error: boolean }>({ busy: false, message: "", error: false });
  const run = async (action: () => Promise<unknown>, showSaved = true) => {
    setState({ busy: true, message: "", error: false });
    try {
      await action();
      setState({ busy: false, message: showSaved ? t("common.saved") : "", error: false });
      reload();
    } catch (e) {
      setState({ busy: false, message: errorText(t, e), error: true });
    }
  };
  return { ...state, run };
}

function SaveStatus({ message, error }: { message: string; error: boolean }) {
  if (!message) return null;
  return <span className={error ? "text-sm text-red-600" : "text-sm text-emerald-700"}>{message}</span>;
}

function SchedulesCard({ data, canEdit, reload }: CardProps & { data: SettingsData }) {
  const { t, lang } = useLang();
  const [editing, setEditing] = useState<Schedule | Omit<Schedule, "id"> | null>(null);
  const save = useSave(reload);

  const remove = (s: Schedule) => {
    if (window.confirm(t("settings.deleteScheduleConfirm", { name: s.name }))) void save.run(() => api.deleteSchedule(s.id), false);
  };

  return (
    <Card
      title={t("settings.schedules")}
      description={t("settings.schedulesHint")}
      actions={
        canEdit ? (
          <Button icon={Plus} onClick={() => setEditing({ ...DEFAULT_SCHEDULES[0], name: "" })}>
            {t("settings.addSchedule")}
          </Button>
        ) : null
      }
    >
      {save.error ? <Alert tone="danger" className="mb-4">{save.message}</Alert> : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.schedules.map((s) => {
          const isDefault = s.id === data.defaultScheduleId;
          return (
            <div key={s.id} className="flex flex-col rounded-lg border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-slate-900">{s.name}</div>
                  <div className="mt-1 flex gap-1.5">
                    <Badge tone="teal">{t(`schedule.kind.${s.kind}`)}</Badge>
                    {isDefault ? <Badge>{t("common.default")}</Badge> : null}
                  </div>
                </div>
                {canEdit ? (
                  <div className="flex">
                    <Button size="sm" variant="ghost" icon={Pencil} aria-label={t("common.edit")} onClick={() => setEditing(s)} />
                    {!isDefault ? <Button size="sm" variant="ghost" icon={Trash} aria-label={t("common.delete")} onClick={() => remove(s)} /> : null}
                  </div>
                ) : null}
              </div>
              <ul className="mt-3 flex flex-1 flex-col gap-1 text-xs leading-relaxed text-slate-600">
                {scheduleLines(s, t, lang).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {canEdit && !isDefault ? (
                <button
                  type="button"
                  className="mt-3 self-start text-xs font-medium text-teal-700 hover:underline"
                  onClick={() => void save.run(() => api.saveSettings({ defaultScheduleId: s.id }), false)}
                >
                  {t("settings.makeDefault")}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      <ScheduleDialog schedule={editing} onClose={() => setEditing(null)} onSaved={reload} />
    </Card>
  );
}

function RulesCard({ rules, canEdit, reload }: CardProps & { rules: Rules }) {
  const { t } = useLang();
  const [draft, setDraft] = useState(rules);
  const save = useSave(reload);
  const set = <K extends keyof Rules>(key: K, value: Rules[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const number = (v: string) => Math.max(0, Number(v) || 0);
  // The allowance is typed as hours:minutes, e.g. 7:15
  const [allowance, setAllowance] = useState(duration(Math.round(rules.allowanceHours * 60)));
  const allowanceMatch = /^(\d{1,3})(?:[:.](\d{2}))?$/.exec(allowance.trim());
  const allowanceHours = allowanceMatch && Number(allowanceMatch[2] ?? 0) < 60 ? Number(allowanceMatch[1]) + Number(allowanceMatch[2] ?? 0) / 60 : null;

  return (
    <Card title={t("settings.rules")} description={t("settings.rulesHint")}>
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (allowanceHours === null) return;
          void save.run(() => api.saveSettings({ rules: { ...draft, allowanceHours } }));
        }}
      >
        <fieldset disabled={!canEdit} className="flex flex-col gap-5">
          <Check label={t("settings.deductEarly")} hint={t("settings.deductEarlyHint")} checked={draft.deductEarlyLeave} onChange={(v) => set("deductEarlyLeave", v)} disabled={!canEdit} />
          <Field label={t("settings.allowance")} hint={t("settings.allowanceHint")}>
            <input
              className={cx("input w-32 tabular-nums", allowanceHours === null && "border-red-400 ring-1 ring-red-300")}
              dir="ltr"
              placeholder="7:15"
              value={allowance}
              onChange={(e) => setAllowance(e.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("settings.absence")}>
              <select className="input" value={draft.absenceMode} onChange={(e) => set("absenceMode", e.target.value as Rules["absenceMode"])}>
                <option value="list">{t("settings.absence.list")}</option>
                <option value="deduct">{t("settings.absence.deduct")}</option>
              </select>
            </Field>
            <Field label={t("settings.incomplete")}>
              <select className="input" value={draft.incompleteMode} onChange={(e) => set("incompleteMode", e.target.value as Rules["incompleteMode"])}>
                <option value="hold">{t("settings.incomplete.hold")}</option>
                <option value="deduct">{t("settings.incomplete.deduct")}</option>
              </select>
            </Field>
            <Field label={t("settings.permCount")}>
              <input type="number" className="input" min="0" max="31" value={draft.permissionLimitCount} onChange={(e) => set("permissionLimitCount", Math.round(number(e.target.value)))} />
            </Field>
            <Field label={t("settings.permTime")}>
              <input className="input" dir="ltr" placeholder="07:15" value={draft.permissionLimitTime} onChange={(e) => set("permissionLimitTime", e.target.value)} />
            </Field>
          </div>
          <p className="-mt-3 text-xs text-slate-500">{t("settings.permHint")}</p>
          <Field label={t("settings.dupWindow")} hint={t("settings.dupHint")}>
            <input type="number" className="input w-32" min="0" max="120" value={draft.duplicateWindowMin} onChange={(e) => set("duplicateWindowMin", Math.round(number(e.target.value)))} />
          </Field>
        </fieldset>
        {canEdit ? (
          <div className="flex items-center gap-3 border-t border-slate-100 pt-4">
            <Button type="submit" variant="primary" loading={save.busy}>
              {t("common.save")}
            </Button>
            <SaveStatus message={save.message} error={save.error} />
          </div>
        ) : null}
      </form>
    </Card>
  );
}

function OrganizationCard({ organization, canEdit, reload }: CardProps & { organization: Organization }) {
  const { t } = useLang();
  const [draft, setDraft] = useState(organization);
  const save = useSave(reload);

  return (
    <Card title={t("settings.org")} description={t("settings.orgHint")}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save.run(() => api.saveSettings({ organization: draft }));
        }}
      >
        <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-2">
          <Field label={t("settings.orgName")}>
            <input className="input" value={draft.name} maxLength={120} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </Field>
          <Field label={t("settings.orgUnit")}>
            <input className="input" value={draft.unit} maxLength={120} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} />
          </Field>
        </fieldset>
        {canEdit ? (
          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" loading={save.busy}>
              {t("common.save")}
            </Button>
            <SaveStatus message={save.message} error={save.error} />
          </div>
        ) : null}
      </form>
    </Card>
  );
}

function BackupCard() {
  const { t } = useLang();
  return (
    <Card title={t("settings.backup")} description={t("settings.backupHint")}>
      <a href="/api/backup" download>
        <Button icon={DatabaseBackup}>{t("settings.backupDownload")}</Button>
      </a>
    </Card>
  );
}
