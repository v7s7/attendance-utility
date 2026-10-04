import { FileQuestion } from "lucide-react";
import { useAuth } from "./auth/context.ts";
import { useLang } from "./i18n/context.ts";
import { AuditPage } from "./pages/AuditPage.tsx";
import { EmployeeMonthPage } from "./pages/EmployeeMonthPage.tsx";
import { EmployeePeriodPage } from "./pages/EmployeePeriodPage.tsx";
import { PeriodPage } from "./pages/PeriodPage.tsx";
import { EmployeesPage } from "./pages/EmployeesPage.tsx";
import { HelpPage } from "./pages/HelpPage.tsx";
import { HolidaysPage } from "./pages/HolidaysPage.tsx";
import { ImportPage } from "./pages/ImportPage.tsx";
import { MonthPage } from "./pages/MonthPage.tsx";
import { MonthsPage } from "./pages/MonthsPage.tsx";
import { ReviewPage } from "./pages/ReviewPage.tsx";
import { SettingsPage } from "./pages/SettingsPage.tsx";
import { UsersPage } from "./pages/UsersPage.tsx";
import { paths, useRoute, type Route } from "./router.ts";
import { Shell } from "./Shell.tsx";
import { Button } from "./ui/Button.tsx";
import { Card } from "./ui/Card.tsx";
import { Link } from "./ui/Link.tsx";
import { Empty } from "./ui/States.tsx";

export function App() {
  const route = useRoute();
  return (
    <Shell route={route}>
      <Page route={route} />
    </Shell>
  );
}

function Page({ route }: { route: Route }) {
  const { isAdmin } = useAuth();
  switch (route.page) {
    case "months":
      return <MonthsPage />;
    case "month":
      return <MonthPage key={route.month} month={route.month} />;
    case "review":
      return <ReviewPage key={route.month} month={route.month} />;
    case "employee":
      return route.to && route.month ? (
        <EmployeePeriodPage key={route.employeeId + route.month + route.to} employeeId={route.employeeId} from={route.month} to={route.to} />
      ) : (
        <EmployeeMonthPage key={route.employeeId + (route.month ?? "")} month={route.month} employeeId={route.employeeId} />
      );
    case "period":
      return <PeriodPage key={route.from + route.to} from={route.from} to={route.to} />;
    case "employees":
      return <EmployeesPage />;
    case "import":
      return <ImportPage />;
    case "settings":
      return <SettingsPage />;
    case "users":
      return isAdmin ? <UsersPage /> : <NotFound />;
    case "audit":
      return isAdmin ? <AuditPage /> : <NotFound />;
    case "holidays":
      return <HolidaysPage />;
    case "help":
      return <HelpPage />;
    case "notFound":
      return <NotFound />;
  }
}

function NotFound() {
  const { t } = useLang();
  return (
    <Card>
      <Empty
        icon={FileQuestion}
        title={t("error.not_found")}
        action={
          <Link href={paths.employees()}>
            <Button>{t("nav.employees")}</Button>
          </Link>
        }
      />
    </Card>
  );
}
