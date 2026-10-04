import { ApiError } from "./api.ts";
import { hasKey, type Translate } from "./i18n/context.ts";

/** A message HR can read for any error from the API. */
export function errorText(t: Translate, error: unknown): string {
  if (error instanceof ApiError) {
    const key = "error." + error.code;
    if (hasKey(key)) return t(key);
  }
  return t("error.generic");
}
