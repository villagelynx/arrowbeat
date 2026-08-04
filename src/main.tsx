import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { applyInitialFavicon } from "./lib/favicon";

applyInitialFavicon();

const params = new URLSearchParams(window.location.search);
const isEmbed =
  params.get("embed") === "1" ||
  params.get("embed") === "true" ||
  params.get("view") === "embed";

async function boot() {
  if (isEmbed) {
    document.documentElement.classList.add("is-embed");
    document.body.classList.add("is-embed");
    const { EmbedWidgetApp } = await import("./components/EmbedWidget");
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <EmbedWidgetApp />
      </StrictMode>,
    );
    return;
  }

  const { default: App } = await import("./App");
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
