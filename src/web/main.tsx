import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { AuthGate } from "./auth/AuthGate.tsx";
import { LangProvider } from "./i18n/LangProvider.tsx";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LangProvider>
      <AuthGate>
        <App />
      </AuthGate>
    </LangProvider>
  </StrictMode>,
);
