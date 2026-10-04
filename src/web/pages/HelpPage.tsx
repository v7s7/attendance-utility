import type { DayStatus } from "../../core/types.ts";
import { STATUS_TONE } from "../components/dayText.ts";
import { useAuth } from "../auth/context.ts";
import { useLang, type TKey } from "../i18n/context.ts";
import { paths } from "../router.ts";
import { Badge } from "../ui/Badge.tsx";
import { Card } from "../ui/Card.tsx";
import { Link } from "../ui/Link.tsx";
import { PageHeader } from "../ui/PageHeader.tsx";

const STEPS: { title: TKey; text: TKey; href?: string }[] = [
  { title: "help.step1.title", text: "help.step1.text" },
  { title: "help.step2.title", text: "help.step2.text", href: paths.import() },
  { title: "help.step3.title", text: "help.step3.text", href: paths.months() },
  { title: "help.step4.title", text: "help.step4.text" },
  { title: "help.step5.title", text: "help.step5.text", href: paths.employees() },
  { title: "help.step6.title", text: "help.step6.text" },
  { title: "help.step7.title", text: "help.step7.text" },
];

const STATUSES: DayStatus[] = ["OK", "SHORT", "ABSENT", "INCOMPLETE", "EXCUSED", "HOLIDAY", "NO_DATA", "IN_PROGRESS"];

/** A short guide to the monthly work, written for HR. */
export function HelpPage() {
  const { t } = useLang();
  const { isAdmin } = useAuth();

  return (
    <>
      <PageHeader title={t("help.title")} description={t("help.subtitle")} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <Card title={t("help.monthly")}>
          <ol className="flex flex-col gap-5">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-teal-700 text-sm font-semibold text-white">{i + 1}</span>
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900">
                    {s.href ? (
                      <Link href={s.href} className="hover:text-teal-700 hover:underline">
                        {t(s.title)}
                      </Link>
                    ) : (
                      t(s.title)
                    )}
                  </div>
                  <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{t(s.text)}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <div className="flex flex-col gap-5">
          <Card title={t("help.statuses")}>
            <dl className="flex flex-col gap-3">
              {STATUSES.map((s) => (
                <div key={s} className="grid grid-cols-[7.5rem_1fr] items-start gap-3">
                  <dt>
                    <Badge tone={STATUS_TONE[s]}>{t(`status.${s}`)}</Badge>
                  </dt>
                  <dd className="text-sm leading-relaxed text-slate-600">{t(`help.status.${s}`)}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card title={t("help.deduction")}>
            <ul className="flex list-disc flex-col gap-2 ps-5 text-sm leading-relaxed text-slate-600">
              <li>{t("help.deduction.time")}</li>
              <li>{t("help.deduction.allowance")}</li>
              <li>{t("help.deduction.absence")}</li>
              <li>{t("help.deduction.amount")}</li>
              <li>{t("help.deduction.extra")}</li>
            </ul>
          </Card>

          {isAdmin ? (
            <Card title={t("help.setup")}>
              <ul className="flex list-disc flex-col gap-2 ps-5 text-sm leading-relaxed text-slate-600">
                <li>{t("help.setup.settings")}</li>
                <li>{t("help.setup.holidays")}</li>
                <li>{t("help.setup.users")}</li>
                <li>{t("help.setup.employees")}</li>
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
