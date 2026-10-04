import {
  BookOpen,
  CalendarOff,
  CalendarDays,
  Clock3,
  KeyRound,
  Languages,
  LogOut,
  Menu,
  ScrollText,
  Settings,
  Upload,
  UserCog,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useAuth } from "./auth/context.ts";
import { PasswordDialog } from "./components/PasswordDialog.tsx";
import { useLang, type TKey } from "./i18n/context.ts";
import { paths, type Route } from "./router.ts";
import { cx } from "./ui/cx.ts";
import { Link } from "./ui/Link.tsx";

interface NavItem {
  href: string;
  label: TKey;
  icon: LucideIcon;
  active: (r: Route) => boolean;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: paths.employees(), label: "nav.employees", icon: Users, active: (r) => r.page === "employees" || r.page === "employee" },
  { href: paths.months(), label: "nav.months", icon: CalendarDays, active: (r) => ["months", "month", "review", "period"].includes(r.page) },
  { href: paths.import(), label: "nav.import", icon: Upload, active: (r) => r.page === "import" },
  { href: paths.holidays(), label: "nav.holidays", icon: CalendarOff, active: (r) => r.page === "holidays" },
  { href: paths.settings(), label: "nav.settings", icon: Settings, active: (r) => r.page === "settings" },
  { href: paths.users(), label: "nav.users", icon: UserCog, active: (r) => r.page === "users", adminOnly: true },
  { href: paths.audit(), label: "nav.audit", icon: ScrollText, active: (r) => r.page === "audit", adminOnly: true },
  { href: paths.help(), label: "nav.help", icon: BookOpen, active: (r) => r.page === "help" },
];

/** The app frame: a sidebar with the pages and the signed-in user, and the page itself. */
export function Shell({ route, children }: { route: Route; children: ReactNode }) {
  const { t, lang, setLang } = useLang();
  const { user, isAdmin, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  const sidebar = (
    <nav className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex size-9 items-center justify-center rounded-lg bg-teal-700 text-white">
          <Clock3 className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900">{t("app.name")}</div>
          <div className="truncate text-xs text-slate-500">{t("app.tagline")}</div>
        </div>
      </div>

      <ul className="flex flex-1 flex-col gap-0.5 px-3">
        {NAV.filter((item) => !item.adminOnly || isAdmin).map((item) => {
          const active = item.active(route);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => setMenuOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                  active ? "bg-teal-50 text-teal-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                <item.icon className={cx("size-4.5", active ? "text-teal-700" : "text-slate-400")} />
                {t(item.label)}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-slate-200 p-3">
        <div className="px-3 py-2">
          <div className="truncate text-sm font-medium text-slate-900">{user.displayName}</div>
          <div className="text-xs text-slate-500">{t(user.role === "admin" ? "role.admin" : "role.hr")}</div>
        </div>
        <SideButton icon={Languages} onClick={() => setLang(lang === "ar" ? "en" : "ar")}>
          {t("nav.language")}
        </SideButton>
        <SideButton icon={KeyRound} onClick={() => setPasswordOpen(true)}>
          {t("nav.password")}
        </SideButton>
        <SideButton icon={LogOut} onClick={() => void signOut()}>
          {t("nav.logout")}
        </SideButton>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:ps-64">
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 border-e border-slate-200 bg-white lg:block print:hidden">
        {sidebar}
      </aside>

      {/* Narrow screens: a top bar with a button that slides the sidebar in */}
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden print:hidden">
        <button type="button" aria-label={t("nav.menu")} onClick={() => setMenuOpen(true)} className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100">
          <Menu className="size-5" />
        </button>
        <span className="text-sm font-semibold">{t("app.name")}</span>
      </div>
      {menuOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden print:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMenuOpen(false)} />
          <aside className="absolute inset-y-0 start-0 w-72 bg-white shadow-xl">
            <button type="button" aria-label={t("common.close")} onClick={() => setMenuOpen(false)} className="absolute end-3 top-4 rounded-md p-1 text-slate-400 hover:bg-slate-100">
              <X className="size-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      ) : null}

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8 print:max-w-none print:p-0">{children}</main>

      <PasswordDialog open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </div>
  );
}

function SideButton({ icon: Icon, onClick, children }: { icon: LucideIcon; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
    >
      <Icon className="size-4 text-slate-400" />
      {children}
    </button>
  );
}
