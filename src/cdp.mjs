const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function responseJson(url) {
  const response = await fetch(url, { redirect: "error" });
  if (!response.ok) throw new Error(`Chrome debugging endpoint returned HTTP ${response.status}.`);
  return response.json();
}

export class CdpClient {
  constructor(socket, timeoutMs = 10_000) {
    this.socket = socket;
    this.timeoutMs = timeoutMs;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();

    socket.addEventListener("message", (event) => void this.#handleMessage(event));
    socket.addEventListener("close", () => {
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer);
        reject(new Error("Chrome debugging connection closed."));
      }
      this.pending.clear();
    });
  }

  static async connect(endpoint, preferredUrl = "indispensable-lingonberry-hot.julius.site") {
    const base = endpoint.replace(/\/$/, "");
    const targets = await responseJson(`${base}/json/list`);
    const pages = targets.filter((target) => target.type === "page" && target.webSocketDebuggerUrl);
    const target = pages.find((page) => page.url.includes(preferredUrl))
      ?? pages.find((page) => !page.url.startsWith("chrome://"))
      ?? pages[0];
    if (!target) throw new Error("Chrome has no debuggable page target.");

    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out connecting to Chrome.")), 10_000);
      socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("Could not connect to Chrome's page target."));
      }, { once: true });
    });
    return new CdpClient(socket);
  }

  async #handleMessage(event) {
    let raw = event.data;
    if (typeof raw !== "string") {
      raw = raw instanceof Blob
        ? await raw.text()
        : Buffer.from(raw).toString("utf8");
    }
    const message = JSON.parse(raw);
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`Chrome protocol error: ${message.error.message}`));
      else pending.resolve(message.result);
      return;
    }

    for (const listener of this.listeners.get(message.method) ?? []) listener(message.params);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Chrome protocol call timed out: ${method}`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
    return () => this.listeners.set(method, listeners.filter((item) => item !== listener));
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? "Browser evaluation failed.");
    }
    return result.result.value;
  }

  async navigate(url) {
    await this.send("Page.enable");
    await this.send("Runtime.enable");
    await this.send("Page.navigate", { url });
  }

  async waitFor(expression, { timeoutMs = 15_000, intervalMs = 100 } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        if (await this.evaluate(expression)) return;
      } catch {
        // Navigation may temporarily destroy the execution context.
      }
      await sleep(intervalMs);
    }
    throw new Error("Timed out waiting for the game page.");
  }

  async mouseMove(x, y) {
    await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  }

  async mouseDown(x, y) {
    await this.send("Input.dispatchMouseEvent", {
      type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1,
    });
  }

  async mouseUp(x, y) {
    await this.send("Input.dispatchMouseEvent", {
      type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1,
    });
  }

  async click(x, y) {
    await this.mouseMove(x, y);
    await this.mouseDown(x, y);
    await this.mouseUp(x, y);
  }

  async pressP() {
    const common = { key: "p", code: "KeyP", windowsVirtualKeyCode: 80, nativeVirtualKeyCode: 80 };
    await this.send("Input.dispatchKeyEvent", { type: "keyDown", ...common });
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", ...common });
  }

  close() {
    this.socket.close();
  }
}
