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

export async function prepareGame(cdp, { url, level, pauseDuringDecision }) {
  await cdp.navigate(url);
  await cdp.waitFor("document.querySelector('#app')?.dataset.ready === 'true' && Boolean(document.querySelector('#test-panel')?.textContent)");
  await installOverlay(cdp, pauseDuringDecision ? "DECISION PAUSE" : "REAL TIME");
  await clickElement(cdp, `button[data-level=${JSON.stringify(level)}]`);
  await sleep(80);
  await clickElement(cdp, "#start");
  await sleep(120);
}

export async function installOverlay(cdp, mode = "REAL TIME") {
  await cdp.evaluate(`(() => {
    const telemetry = document.querySelector('#test-panel');
    if (telemetry) telemetry.style.setProperty('display', 'none', 'important');

    let style = document.querySelector('#jev-controller-overlay-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'jev-controller-overlay-style';
      style.textContent = \`
        #jev-controller-overlay {
          --jev-accent: #e9b96e;
          position: fixed;
          left: 20px;
          bottom: 20px;
          z-index: 2147483646;
          box-sizing: border-box;
          width: 238px;
          height: 126px;
          overflow: hidden;
          color: #f8f5e9;
          background: linear-gradient(145deg, rgba(29, 67, 49, .97), rgba(20, 51, 38, .97));
          border: 1px solid rgba(248, 245, 233, .16);
          border-radius: 14px;
          box-shadow: 0 14px 40px rgba(22, 48, 35, .22), inset 0 1px rgba(255, 255, 255, .08);
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          pointer-events: none;
          backdrop-filter: blur(12px);
        }
        #jev-controller-overlay[data-phase='thinking'] { --jev-accent: #f1c27a; }
        #jev-controller-overlay[data-phase='return'],
        #jev-controller-overlay[data-phase='serve'] { --jev-accent: #ef6a46; }
        #jev-controller-overlay[data-phase='won'] { --jev-accent: #8ed6a8; }
        #jev-controller-overlay[data-phase='lost'],
        #jev-controller-overlay[data-phase='stopped'] { --jev-accent: #d8a18f; }
        #jev-controller-overlay .jev-head {
          box-sizing: border-box;
          height: 34px;
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 0 13px;
          border-bottom: 1px solid rgba(248, 245, 233, .1);
        }
        #jev-controller-overlay .jev-dot {
          flex: 0 0 auto;
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--jev-accent);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--jev-accent) 18%, transparent);
        }
        #jev-controller-overlay .jev-brand {
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 1.5px;
        }
        #jev-controller-overlay .jev-mode {
          margin-left: auto;
          padding: 3px 6px;
          color: rgba(248, 245, 233, .72);
          background: rgba(248, 245, 233, .08);
          border-radius: 999px;
          font-size: 7px;
          font-weight: 700;
          letter-spacing: .9px;
        }
        #jev-controller-overlay .jev-body {
          box-sizing: border-box;
          height: 92px;
          display: grid;
          grid-template-rows: 27px 20px 19px;
          align-content: center;
          padding: 10px 13px 9px;
        }
        #jev-controller-overlay .jev-title,
        #jev-controller-overlay .jev-detail,
        #jev-controller-overlay .jev-meta {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        #jev-controller-overlay .jev-title {
          color: var(--jev-accent);
          font-size: 15px;
          font-weight: 800;
          letter-spacing: -.15px;
        }
        #jev-controller-overlay .jev-detail {
          color: #f8f5e9;
          font-size: 10px;
          font-weight: 700;
        }
        #jev-controller-overlay .jev-meta {
          align-self: end;
          color: rgba(248, 245, 233, .58);
          font-size: 8px;
          font-weight: 600;
          letter-spacing: .15px;
        }
      \`;
      document.head.appendChild(style);
    }

    let overlay = document.querySelector('#jev-controller-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'jev-controller-overlay';
      document.body.appendChild(overlay);
    }
    overlay.removeAttribute('style');
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    overlay.dataset.phase = 'ready';
    overlay.innerHTML = \`
      <div class="jev-head">
        <span class="jev-dot"></span>
        <span class="jev-brand">JEV PLAYER</span>
        <span class="jev-mode"></span>
      </div>
      <div class="jev-body">
        <div class="jev-title">CONNECTED</div>
        <div class="jev-detail">Ready for the next match</div>
        <div class="jev-meta">Waiting for game state</div>
      </div>
    \`;
    overlay.querySelector('.jev-mode').textContent = ${JSON.stringify(mode)};
    return true;
  })()`);
}

export async function updateOverlay(cdp, view) {
  await cdp.evaluate(`(() => {
    const overlay = document.querySelector('#jev-controller-overlay');
    if (!overlay) return false;
    const view = ${JSON.stringify({ phase: "ready", title: "", detail: "", meta: "", ...view })};
    overlay.dataset.phase = view.phase;
    overlay.querySelector('.jev-title').textContent = view.title;
    overlay.querySelector('.jev-detail').textContent = view.detail;
    overlay.querySelector('.jev-meta').textContent = view.meta;
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
