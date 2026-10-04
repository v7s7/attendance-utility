import { Plus } from "lucide-react";
import { useState } from "react";
import type { Role, User } from "../../core/api.ts";
import { api } from "../api.ts";
import { useAuth } from "../auth/context.ts";
import { errorText } from "../errors.ts";
import { useLang } from "../i18n/context.ts";
import { Alert } from "../ui/Alert.tsx";
import { Badge } from "../ui/Badge.tsx";
import { Button } from "../ui/Button.tsx";
import { Card } from "../ui/Card.tsx";
import { Dialog } from "../ui/Dialog.tsx";
import { Check, Field } from "../ui/Field.tsx";
import { PageHeader } from "../ui/PageHeader.tsx";
import { Loading, LoadError } from "../ui/States.tsx";
import { useApi } from "../useApi.ts";

export function UsersPage() {
  const { t } = useLang();
  const { user: me } = useAuth();
  const users = useApi("users", api.users);
  const [editing, setEditing] = useState<User | "new" | null>(null);

  return (
    <>
      <PageHeader
        title={t("users.title")}
        description={t("users.subtitle")}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>
            {t("users.add")}
          </Button>
        }
      />
      {users.error ? (
        <LoadError error={users.error} retry={users.reload} />
      ) : !users.data ? (
        <Loading />
      ) : (
        <Card flush>
          <table className="table">
            <thead>
              <tr>
                <th>{t("users.displayName")}</th>
                <th>{t("users.username")}</th>
                <th>{t("users.role")}</th>
                <th>{t("col.state")}</th>
              </tr>
            </thead>
            <tbody>
              {users.data.map((u) => (
                <tr key={u.id} onClick={() => setEditing(u)} className="cursor-pointer hover:bg-slate-50">
                  <td className="font-medium">
                    {u.displayName}
                    {u.id === me.id ? <Badge tone="info" className="ms-2">{t("users.you")}</Badge> : null}
                  </td>
                  <td dir="ltr" className="text-start text-slate-600">
                    {u.username}
                  </td>
                  <td>{u.role === "admin" ? <Badge tone="teal">{t("role.admin")}</Badge> : <Badge>{t("role.hr")}</Badge>}</td>
                  <td>{u.active ? <Badge tone="success">{t("common.active")}</Badge> : <Badge>{t("common.inactive")}</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? t("users.add") : t("common.edit")}>
        {editing ? <UserForm key={editing === "new" ? "new" : editing.id} user={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={users.reload} /> : null}
      </Dialog>
    </>
  );
}

function UserForm({ user, onClose, onSaved }: { user: User | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useLang();
  const [username, setUsername] = useState(user?.username ?? "");
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [role, setRole] = useState<Role>(user?.role ?? "hr");
  const [active, setActive] = useState(user?.active ?? true);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      if (user) await api.updateUser(user.id, { displayName, role, active, ...(password ? { password } : {}) });
      else await api.createUser({ username, displayName, role, password });
      onSaved();
      onClose();
    } catch (e) {
      setError(errorText(t, e));
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label={t("users.displayName")}>
        <input className="input" value={displayName} maxLength={80} onChange={(e) => setDisplayName(e.target.value)} required />
      </Field>
      <Field label={t("users.username")} hint={user ? undefined : t("account.usernameHint")}>
        <input
          className="input"
          dir="ltr"
          value={username}
          disabled={Boolean(user)}
          minLength={3}
          pattern="[A-Za-z0-9._\-]+"
          onChange={(e) => setUsername(e.target.value)}
          required
        />
      </Field>
      <Field label={t("users.role")}>
        <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <option value="hr">{t("role.hr")}</option>
          <option value="admin">{t("role.admin")}</option>
        </select>
      </Field>
      <Field label={user ? t("users.newPassword") : t("users.password")} hint={user ? t("users.newPasswordHint") : t("account.passwordHint")}>
        <input
          className="input"
          dir="ltr"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required={!user}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      {user ? <Check label={t("users.active")} checked={active} onChange={setActive} /> : null}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button type="submit" variant="primary" loading={busy}>
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
}
