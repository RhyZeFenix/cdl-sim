import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import { setLocalRoles } from "../engine";
import { localRoles } from "./savedRoles";

// Role labels set in this browser apply everywhere.
setLocalRoles(localRoles());

createRoot(document.getElementById("root")!).render(<App />);

// Works offline (and installs as an app) once it's been opened, on the built site only.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
