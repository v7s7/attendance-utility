// A small router: the page is chosen from the URL path, and links update it without a reload.
import { useMemo, useSyncExternalStore } from "react";

export type Route =
  | { page: "months" }
  | { page: "month"; month: string }
  | { page: "review"; month: string }
  /** One employee's days; month null opens their latest month; with `to`, several months. */
  | { page: "employee"; employeeId: string; month: string | null; to?: string }
  | { page: "period"; from: string; to: string }
  | { page: "employees" }
  | { page: "import" }
  | { page: "settings" }
  | { page: "users" }
  | { page: "audit" }
  | { page: "help" }
  | { page: "holidays" }
  | { page: "notFound" };

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export function parseRoute(pathname: string): Route {
  const [first, second, third, fourth, ...rest] = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (rest.length) return { page: "notFound" };
  // Several months: /employees/<id>/<from>/<to>
  if (fourth !== undefined) {
    return first === "employees" && second && MONTH.test(third) && MONTH.test(fourth) && third <= fourth
      ? { page: "employee", employeeId: second, month: third, to: fourth }
      : { page: "notFound" };
  }
  // HR starts from the staff
  if (!first) return { page: "employees" };
  if (first === "employees" && second) {
    if (!third) return { page: "employee", employeeId: second, month: null };
    return MONTH.test(third) ? { page: "employee", employeeId: second, month: third } : { page: "notFound" };
  }
  if (first === "months" && !second) return { page: "months" };
  if (first === "months" && second && MONTH.test(second)) {
    if (third === "review") return { page: "review", month: second };
    // Everyone over several months: /months/<from>/<to>
    if (third && MONTH.test(third)) return third >= second ? { page: "period", from: second, to: third } : { page: "notFound" };
    // Older links: /months/2026-09/<employee>
    return third ? { page: "employee", employeeId: third, month: second } : { page: "month", month: second };
  }
  if (second) return { page: "notFound" };
  if (first === "employees" || first === "import" || first === "settings" || first === "users" || first === "audit" || first === "help" || first === "holidays") {
    return { page: first };
  }
  return { page: "notFound" };
}

export const paths = {
  months: () => "/months",
  month: (month: string) => `/months/${month}`,
  review: (month: string, tab?: "absent") => `/months/${month}/review${tab ? `?tab=${tab}` : ""}`,
  employee: (id: string, month?: string) => `/employees/${encodeURIComponent(id)}${month ? `/${month}` : ""}`,
  employeeMonth: (month: string, id: string) => `/employees/${encodeURIComponent(id)}/${month}`,
  employeePeriod: (id: string, from: string, to: string) =>
    from === to ? `/employees/${encodeURIComponent(id)}/${from}` : `/employees/${encodeURIComponent(id)}/${from}/${to}`,
  period: (from: string, to: string) => (from === to ? `/months/${from}` : `/months/${from}/${to}`),
  employees: (filter?: "noWage") => (filter ? `/employees?filter=${filter}` : "/employees"),
  import: () => "/import",
  settings: () => "/settings",
  users: () => "/users",
  audit: () => "/audit",
  help: () => "/help",
  holidays: () => "/holidays",
};

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}

export function navigate(to: string, options: { replace?: boolean } = {}): void {
  if (to === location.pathname + location.search) return;
  if (options.replace) history.replaceState(null, "", to);
  else history.pushState(null, "", to);
  listeners.forEach((l) => l());
  window.scrollTo(0, 0);
}

export function useRoute(): Route {
  const pathname = useSyncExternalStore(subscribe, () => location.pathname);
  return useMemo(() => parseRoute(pathname), [pathname]);
}
