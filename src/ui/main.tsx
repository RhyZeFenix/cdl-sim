import { createRoot } from "react-dom/client";
import { App } from "./App";
import { loadLayoutOverrides } from "./layoutStore";
import "./styles.css";

// Map editor changes saved in this browser apply to every replay.
loadLayoutOverrides();

createRoot(document.getElementById("root")!).render(<App />);

// Works offline (and installs as an app) once it's been opened, on the built site only.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
