// Maintenance commands for IT, run in the app folder:
//   npm run create-user -- <username> <password> <display name>        a new administrator
//   npm run create-user -- <username> <password> <display name> --hr   a new HR user
//   npm run reset-password -- <username> <new password>
//   npm run backup                                                     save a copy of the database now
import { backupNow } from "./backups.ts";
import { config } from "./config.ts";
import { one, openDatabase } from "./db/database.ts";
import { DisplayName, Password, Username } from "./schemas.ts";
import { logAction } from "./store/audit.ts";
import { createUser, updateUser } from "./store/users.ts";

const [command, ...args] = process.argv.slice(2);
const db = openDatabase(config.dbFile);

async function addUser(args: string[]): Promise<void> {
  const hr = args.includes("--hr");
  const [username, password, ...name] = args.filter((a) => a !== "--hr");
  const parsed = {
    username: Username.safeParse(username),
    password: Password.safeParse(password),
    displayName: DisplayName.safeParse(name.join(" ")),
  };
  if (!parsed.username.success || !parsed.password.success || !parsed.displayName.success) {
    throw new Error(
      "Usage: npm run create-user -- <username> <password> <display name> [--hr]\n" +
        "  username: 3+ letters, numbers, dots or dashes; password: 8+ characters",
    );
  }
  if (one(db, "SELECT 1 FROM users WHERE username = ?", parsed.username.data)) {
    throw new Error(`The username ${parsed.username.data} already exists. Use reset-password to change its password.`);
  }
  const user = await createUser(db, {
    username: parsed.username.data,
    password: parsed.password.data,
    displayName: parsed.displayName.data,
    role: hr ? "hr" : "admin",
  });
  logAction(db, null, "user.create_cli", user.username, { role: user.role });
  console.log(`Created ${user.role === "admin" ? "administrator" : "HR user"} ${user.username} (${user.displayName}).`);
}

async function resetPassword(username: string | undefined, password: string | undefined): Promise<void> {
  if (!username || !password || password.length < 8) {
    throw new Error("Usage: npm run reset-password -- <username> <new password of 8+ characters>");
  }
  const user = one<{ id: number }>(db, "SELECT id FROM users WHERE username = ?", username);
  if (!user) throw new Error(`No user named ${username}`);
  await updateUser(db, user.id, { password, active: true });
  logAction(db, null, "user.password_reset_cli", username);
  console.log(`Password changed for ${username}.`);
}

try {
  if (command === "create-user") await addUser(args);
  else if (command === "reset-password") await resetPassword(args[0], args[1]);
  else if (command === "backup") console.log("Backup saved:", backupNow(db, config.backupDir, config.backupKeep));
  else throw new Error("Commands: create-user, reset-password, backup");
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  db.close();
}
