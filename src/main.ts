import "./app/bootstrap.css";

import { mountCoreWorkspace, renderEmergencyShell } from "./app/bootstrap";

const root = document.getElementById("app") ?? document.body.appendChild(document.createElement("div"));

void mountCoreWorkspace(root).catch((error: unknown) => {
  renderEmergencyShell(root, error);
});
