import { createContext, useContext } from "react";
import type { User } from "../../core/api.ts";

export interface AuthState {
  user: User;
  isAdmin: boolean;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

/** The signed-in user. Only used inside the signed-in part of the app. */
export function useAuth(): AuthState {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be used inside AuthGate");
  return auth;
}
