import type { DayResult } from "../../core/types.ts";
import { useLang } from "../i18n/context.ts";
import { Badge } from "../ui/Badge.tsx";
import { STATUS_TONE, statusText } from "./dayText.ts";

export function StatusBadge({ day }: { day: DayResult }) {
  const { t } = useLang();
  return <Badge tone={STATUS_TONE[day.status]}>{statusText(day, t)}</Badge>;
}
