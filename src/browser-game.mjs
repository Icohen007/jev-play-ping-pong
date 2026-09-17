const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function readGameFrame(cdp) {
  const value = await cdp.evaluate(`(() => {
    const panel = document.querySelector('#test-panel');
    const canvas = document.querySelector('#court canvas');
    if (!panel || !canvas || !panel.textContent) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      telemetry: JSON.parse(panel.textContent),
      canvas: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
    };
  })()`);
  if (!value) throw new Error("The game telemetry is not ready.");
  return { ...value, observedAt: Date.now() };
}

async function elementCenter(cdp, selector) {
  const result = await cdp.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element || element.hidden || element.disabled) return null;
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  if (!result) throw new Error(`Game control is unavailable: ${selector}`);
  return result;
}

export async function clickElement(cdp, selector) {
  const point = await elementCenter(cdp, selector);
  await cdp.click(point.x, point.y);
}

export async function prepareGame(cdp, { url, level }) {
  await cdp.navigate(url);
  await cdp.waitFor("document.querySelector('#app')?.dataset.ready === 'true' && Boolean(document.querySelector('#test-panel')?.textContent)");
  await installOverlay(cdp);
  await clickElement(cdp, `button[data-level=${JSON.stringify(level)}]`);
  await sleep(80);
  await clickElement(cdp, "#start");
  await sleep(120);
}

export async function installOverlay(cdp) {
  await cdp.evaluate(`(() => {
    let overlay = document.querySelector('#jev-controller-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'jev-controller-overlay';
      Object.assign(overlay.style, {
        position: 'fixed', left: '20px', bottom: '20px', zIndex: '2147483646',
        padding: '10px 13px', borderRadius: '9px', color: '#f7f6ec',
        background: 'rgba(31, 66, 49, .92)', font: '600 12px/1.45 ui-monospace, monospace',
        boxShadow: '0 8px 30px rgba(0,0,0,.16)', pointerEvents: 'none', whiteSpace: 'pre'
      });
      document.body.appendChild(overlay);
    }
    overlay.textContent = 'JEV · CONNECTED';
    return true;
  })()`);
}

export async function updateOverlay(cdp, lines) {
  const text = lines.join("\n");
  await cdp.evaluate(`(() => {
    const overlay = document.querySelector('#jev-controller-overlay');
    if (overlay) overlay.textContent = ${JSON.stringify(text)};
    return Boolean(overlay);
  })()`);
}

export async function setPaused(cdp, paused) {
  const state = await cdp.evaluate("document.querySelector('#court')?.dataset.state");
  if ((state === "paused") !== paused) {
    await cdp.pressP();
    await sleep(30);
  }
}
