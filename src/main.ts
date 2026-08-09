import { mountBootstrap, renderEmergencyShell } from "./app/bootstrap";

const root = document.getElementById("app") ?? document.body.appendChild(document.createElement("div"));

void mountBootstrap(root).catch((error: unknown) => {
  renderEmergencyShell(root, error);
});
