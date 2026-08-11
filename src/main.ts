import "./styles.css";
import { mountShell } from "./shell";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("OctoPoly app root was not found.");
}

mountShell(root);
