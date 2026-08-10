import { execFileSync, spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { copyFileSync, existsSync, unlinkSync } from "node:fs";
import { createServer as createTcpServer } from "node:net";
import process from "node:process";
import { createServer } from "vite";

const WINDOWS_CWD = "/mnt/c/Windows/Temp";
const WSL_HOST = execFileSync("hostname", ["-I"], { encoding: "utf8" }).trim().split(/\s+/)[0];
assert(WSL_HOST !== undefined && WSL_HOST.length > 0, "Could not resolve the WSL host address");
const ROOT_URL = `http://${WSL_HOST}:4174`;
const HARNESS_URL = `${ROOT_URL}/docs/validation/desktop-mouse/browser-harness.html`;
const BROWSERS = [
  {
    name: "Windows Chrome",
    executable: "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe",
    port: 9322,
  },
  {
    name: "Windows Edge",
    executable: "/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    port: 9323,
  },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function closeTo(first, second, epsilon = 1e-9) {
  return Math.abs(first - second) <= epsilon;
}

function vectorChanged(first, second) {
  return !closeTo(first.x, second.x) || !closeTo(first.y, second.y) || !closeTo(first.z, second.z);
}

async function waitFor(getter, label, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await getter();
      if (value !== undefined && value !== null && value !== false) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError}` : ""}`);
}

class CdpClient {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.socket = new WebSocket(url);
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== undefined) {
        const pending = this.pending.get(message.id);
        if (pending === undefined) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error !== undefined) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      this.events.push(message);
    });
  }

  async open() {
    if (this.socket.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("CDP websocket open timed out")), 10_000);
      this.socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      this.socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("CDP websocket open failed"));
      }, { once: true });
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, 10_000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

async function state(client) {
  const result = await client.send("Runtime.evaluate", {
    expression: "new Promise(resolve => requestAnimationFrame(() => resolve(window.__octopolyDesktopMouseHarness?.state())))",
    awaitPromise: true,
    returnByValue: true,
  });
  return result.result.value;
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails !== undefined) {
    throw new Error(result.exceptionDetails.text ?? "browser evaluation failed");
  }
  return result.result.value;
}

async function mouse(client, type, x, y, button, buttons, modifiers = 0, pointerType = "mouse") {
  await client.send("Input.dispatchMouseEvent", {
    type,
    x,
    y,
    button,
    buttons,
    modifiers,
    clickCount: type === "mouseMoved" || type === "mouseWheel" ? 0 : 1,
    pointerType,
  });
}

async function exerciseBrowser(browser) {
  console.error(`[desktop-mouse] launching ${browser.name}`);
  const profileLeaf = `octopoly-desktop-mouse-${browser.port}-${process.pid}`;
  const profile = `C:\\Windows\\Temp\\${profileLeaf}`;
  const profileWslPath = `${WINDOWS_CWD}/${profileLeaf}`;
  const reversePort = browser.port + 200;
  const localPort = browser.port + 300;
  const proxyName = `octopoly-cdp-proxy-${reversePort}-${process.pid}.ps1`;
  const proxyWslPath = `${WINDOWS_CWD}/${proxyName}`;
  const proxyWindowsPath = `C:\\Windows\\Temp\\${proxyName}`;
  copyFileSync("scripts/verify-desktop-mouse-windows-cdp-proxy.ps1", proxyWslPath);
  const child = spawn(browser.executable, [
    "--headless=new",
    "--no-first-run",
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-features=Translate",
    `--remote-allow-origins=http://127.0.0.1:${localPort}`,
    "--window-size=900,700",
    `--remote-debugging-port=${browser.port}`,
    `--user-data-dir=${profile}`,
    HARNESS_URL,
  ], { cwd: WINDOWS_CWD, stdio: ["ignore", "pipe", "pipe"] });
  let browserStderr = "";
  child.stderr.on("data", (chunk) => {
    browserStderr += chunk.toString();
  });

  let client;
  let proxy;
  let reverseSocket;
  let resolveReverse;
  const reverseReady = new Promise((resolve) => { resolveReverse = resolve; });
  const reverseServer = createTcpServer((socket) => {
    reverseSocket = socket;
    resolveReverse(socket);
  });
  const localServer = createTcpServer(async (socket) => {
    const reverse = await reverseReady;
    socket.pipe(reverse);
    reverse.pipe(socket);
  });
  try {
    reverseServer.listen(reversePort, WSL_HOST);
    await once(reverseServer, "listening");
    localServer.listen(localPort, "127.0.0.1");
    await once(localServer, "listening");
    const target = await waitFor(async () => {
      const output = execFileSync(
        "/mnt/c/Windows/System32/curl.exe",
        ["-sS", `http://localhost:${browser.port}/json/list`],
        { cwd: WINDOWS_CWD, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      );
      const targets = JSON.parse(output);
      return targets.find((entry) => entry.type === "page" && entry.url.includes("browser-harness"));
    }, `${browser.name} CDP target`);
    console.error(`[desktop-mouse] ${browser.name} target ready`);
    proxy = spawn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", proxyWindowsPath,
      "-WslHost", WSL_HOST,
      "-WslPort", String(reversePort),
      "-TargetPort", String(browser.port),
    ], { cwd: WINDOWS_CWD, stdio: ["ignore", "pipe", "pipe"] });
    await waitFor(async () => reverseSocket, `${browser.name} reverse CDP bridge`);
    console.error(`[desktop-mouse] ${browser.name} reverse bridge ready`);
    const websocketUrl = new URL(target.webSocketDebuggerUrl);
    websocketUrl.hostname = "127.0.0.1";
    websocketUrl.port = String(localPort);
    client = new CdpClient(websocketUrl);
    await client.open();
    console.error(`[desktop-mouse] ${browser.name} websocket ready`);
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await waitFor(async () => {
      const value = await evaluate(client, "window.__octopolyDesktopMouseHarness?.state().ready === true");
      return value === true;
    }, `${browser.name} harness`);
    console.error(`[desktop-mouse] ${browser.name} harness ready`);

    const browserVersion = await client.send("Browser.getVersion");
    const userAgent = await evaluate(client, "navigator.userAgent");
    const rect = await evaluate(client, "(() => { const r = document.querySelector('#viewport').getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; })()");
    const x = rect.x + 100;
    const y = rect.y + 100;
    const initial = await state(client);

    await mouse(client, "mousePressed", x, y, "middle", 4);
    await mouse(client, "mouseMoved", x + 70, y + 35, "middle", 4);
    await mouse(client, "mouseReleased", x + 70, y + 35, "middle", 0);
    const orbit = await state(client);
    assert(vectorChanged(initial.position, orbit.position), `${browser.name}: middle orbit did not move camera`);
    assert(orbit.received.length === 0, `${browser.name}: middle navigation leaked to tool`);
    assert(orbit.gotCapture >= 1 && orbit.lostCapture >= 1, `${browser.name}: orbit capture/release missing`);
    assert(!orbit.navigationOwner && orbit.wheelAllowed, `${browser.name}: orbit owner stuck`);

    const panStart = orbit;
    await mouse(client, "mousePressed", x, y, "middle", 4, 8);
    await mouse(client, "mouseMoved", x + 45, y + 20, "middle", 4, 0);
    await mouse(client, "mouseReleased", x + 45, y + 20, "middle", 0, 0);
    const pan = await state(client);
    const positionDelta = {
      x: pan.position.x - panStart.position.x,
      y: pan.position.y - panStart.position.y,
      z: pan.position.z - panStart.position.z,
    };
    const targetDelta = {
      x: pan.target.x - panStart.target.x,
      y: pan.target.y - panStart.target.y,
      z: pan.target.z - panStart.target.z,
    };
    assert(closeTo(positionDelta.x, targetDelta.x) && closeTo(positionDelta.y, targetDelta.y) && closeTo(positionDelta.z, targetDelta.z), `${browser.name}: Shift mode was not frozen as pan`);

    await evaluate(client, "window.scrollTo(0, 0)");
    await client.send("Input.dispatchMouseEvent", {
      type: "mouseWheel", x, y, deltaX: 0, deltaY: 100, modifiers: 0,
    });
    const zoom = await state(client);
    assert(zoom.distance > pan.distance, `${browser.name}: wheel did not zoom out`);
    assert(zoom.scrollY === 0, `${browser.name}: handled wheel scrolled page`);

    const receivedBeforeLeft = zoom.received.length;
    await mouse(client, "mousePressed", x, y, "left", 1);
    const capturedLeft = await state(client);
    assert(capturedLeft.received.length === receivedBeforeLeft + 1, `${browser.name}: left modeling down missing`);
    const distanceBeforeBlockedWheel = capturedLeft.distance;
    await client.send("Input.dispatchMouseEvent", {
      type: "mouseWheel", x, y, deltaX: 0, deltaY: 120, modifiers: 0,
    });
    const blockedWheel = await state(client);
    assert(closeTo(blockedWheel.distance, distanceBeforeBlockedWheel), `${browser.name}: wheel changed camera during tool capture`);
    assert(blockedWheel.scrollY > 0, `${browser.name}: unhandled wheel did not retain page scroll`);
    await mouse(client, "mouseReleased", x, y, "left", 0);

    const beforeRight = await state(client);
    const receivedBeforeRight = beforeRight.received.length;
    await mouse(client, "mousePressed", x, y, "right", 2);
    await mouse(client, "mouseReleased", x, y, "right", 0);
    const right = await state(client);
    assert(right.received.length === receivedBeforeRight, `${browser.name}: right button reached modeling tool`);
    assert(right.contextMenus > beforeRight.contextMenus, `${browser.name}: right-button context menu was suppressed`);

    await mouse(client, "mousePressed", x, y, "left", 1, 0, "pen");
    await mouse(client, "mouseReleased", x, y, "left", 0, 0, "pen");
    const pen = await state(client);
    assert(pen.received.some((entry) => entry.pointerType === "pen" && entry.phase === "down"), `${browser.name}: Pencil/pen modeling regression`);

    await client.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 2 });
    const touchStart = await state(client);
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y, id: 41, radiusX: 1, radiusY: 1, force: 1 }],
    });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + 35, y: y + 15, id: 41, radiusX: 1, radiusY: 1, force: 1 }],
    });
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await client.send("Emulation.setTouchEmulationEnabled", { enabled: false });
    const touch = await state(client);
    assert(vectorChanged(touchStart.position, touch.position), `${browser.name}: touch orbit regression`);

    await mouse(client, "mousePressed", x, y, "middle", 4);
    await mouse(client, "mouseMoved", x + 5, y + 5, "none", 0);
    const lostMiddleBit = await state(client);
    assert(!lostMiddleBit.navigationOwner && lostMiddleBit.wheelAllowed, `${browser.name}: middle-bit loss left navigation owner`);
    await mouse(client, "mouseReleased", x + 5, y + 5, "middle", 0);

    await mouse(client, "mousePressed", x, y, "middle", 4);
    await evaluate(client, "window.dispatchEvent(new Event('blur'))");
    const blurred = await state(client);
    assert(!blurred.navigationOwner && blurred.wheelAllowed, `${browser.name}: blur left navigation owner`);
    await mouse(client, "mouseReleased", x, y, "middle", 0);

    const beforeDispose = await state(client);
    await evaluate(client, "window.__octopolyDesktopMouseHarness.dispose()");
    await client.send("Input.dispatchMouseEvent", {
      type: "mouseWheel", x, y, deltaX: 0, deltaY: -100, modifiers: 0,
    });
    const afterDispose = await state(client);
    assert(closeTo(beforeDispose.distance, afterDispose.distance), `${browser.name}: post-dispose wheel callback ran`);

    const exceptions = client.events.filter((event) => event.method === "Runtime.exceptionThrown");
    assert(exceptions.length === 0, `${browser.name}: page exception observed`);
    return {
      browser: browser.name,
      product: browserVersion.product,
      userAgent,
      orbitCapture: `${orbit.gotCapture}/${orbit.lostCapture}`,
      shiftPan: "PASS",
      wheelZoom: "PASS",
      handledWheelPageScrollSuppressed: "PASS",
      blockedWheelPageScrollPreserved: "PASS",
      leftModeling: "PASS",
      rightReserved: "PASS",
      contextMenuDefaultPreserved: "PASS",
      penRegression: "PASS",
      touchRegression: "PASS",
      blurCleanup: "PASS",
      middleBitLossCleanup: "PASS",
      postDisposeCallbacks: "PASS",
      pageExceptions: 0,
    };
  } finally {
    if (client !== undefined) {
      try {
        await client.send("Browser.close");
      } catch {}
      client.close();
    }
    await Promise.race([
      once(child, "exit"),
      new Promise((resolve) => setTimeout(resolve, 3_000)),
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
    reverseSocket?.destroy();
    reverseServer.close();
    localServer.close();
    if (proxy !== undefined) {
      proxy.kill("SIGTERM");
      await Promise.race([
        once(proxy, "exit"),
        new Promise((resolve) => setTimeout(resolve, 2_000)),
      ]);
      if (proxy.exitCode === null) proxy.kill("SIGKILL");
    }
    try { unlinkSync(proxyWslPath); } catch {}
    const cleanup = spawnSync("powershell.exe", [
      "-NoProfile",
      "-Command",
      `$self=$PID; $marker='${profileLeaf}'; $path='${profile}'; $deadline=[DateTime]::UtcNow.AddSeconds(10); do { Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $self -and $_.CommandLine -like ('*'+$marker+'*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; Start-Sleep -Milliseconds 200; Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction SilentlyContinue; if (-not (Test-Path -LiteralPath $path)) { exit 0 } } while ([DateTime]::UtcNow -lt $deadline); exit 1`,
    ], { cwd: WINDOWS_CWD, stdio: "ignore", timeout: 15_000 });
    if (cleanup.status !== 0 || existsSync(profileWslPath) || existsSync(proxyWslPath)) {
      throw new Error(`${browser.name} left run-owned browser/profile/proxy artifacts`);
    }
    if (child.exitCode !== 0 && child.exitCode !== null && !browserStderr.includes("DevTools listening")) {
      throw new Error(`${browser.name} exited ${child.exitCode}: ${browserStderr.slice(-1000)}`);
    }
  }
}

async function main() {
  const vite = await createServer({
    logLevel: "error",
    server: { host: WSL_HOST, port: 4174, strictPort: true },
  });
  try {
    await vite.listen();
    await waitFor(async () => {
      const response = await fetch(HARNESS_URL);
      return response.ok;
    }, "Vite browser harness");
    const results = [];
    for (const browser of BROWSERS) {
      results.push(await exerciseBrowser(browser));
    }
    console.log(JSON.stringify({
      evidenceClass: "SYNTHETIC_CDP_AUTOMATION",
      automationStatus: "PASS",
      harness: HARNESS_URL,
      physicalDesktopMouse: "NOT_RUN",
      precisionTrackpad: "NOT_RUN",
      physicalIPadExternalPointer: "NOT_RUN",
      results,
    }, null, 2));
  } finally {
    await vite.close();
  }
}

await main();
