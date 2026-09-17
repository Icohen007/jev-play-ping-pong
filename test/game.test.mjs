import test from "node:test";
import assert from "node:assert/strict";

import {
  estimateVelocity,
  interceptZone,
  isIncomingBall,
  makeReturnRequest,
  resolveReturnInput,
  resolveServeInput,
} from "../src/game.mjs";

function frame(overrides = {}) {
  return {
    observedAt: 1_100,
    telemetry: {
      state: "playing",
      score: [3, 2],
      rally: 7,
      best: 10,
      level: "club",
      targetScreen: 900,
      ball: { x: 0.2, y: 1.4, z: 0.5 },
      playerX: -0.3,
      ...overrides.telemetry,
    },
    canvas: { left: 100, top: 50, right: 1_300, bottom: 850, width: 1_200, height: 800 },
    ...overrides,
  };
}

test("velocity and incoming-ball detection use observed motion", () => {
  const previous = frame({ observedAt: 1_000, telemetry: { ball: { x: 0.1, y: 1.5, z: 0.1 } } });
  const current = frame();
  assert.deepEqual(estimateVelocity(previous, current), { x: 1, y: -1.0000000000000009, z: 4 });
  assert.equal(isIncomingBall(previous, current), true);
});

test("return request gives Jev compact state and two independent choices", () => {
  const request = makeReturnRequest(frame(), { x: 1, y: -1, z: 4 }, []);
  assert.equal(request.state.phase, "incoming_return");
  assert.equal(request.state.incoming_ball.predicted_intercept.zone, "far_right");
  assert.deepEqual(Object.keys(request.questions), ["placement", "power"]);
});

test("return inputs remain inside the canvas and preserve Jev's power choice", () => {
  const input = resolveReturnInput(frame(), {
    placement: { choice: "angle_left" },
    power: { choice: "power" },
  });
  assert.equal(input.power, true);
  assert.ok(input.x > 1_000 && input.x < 1_300);
  assert.equal(input.y, 578);
});

test("serve and zone mappings are deterministic", () => {
  assert.equal(interceptZone(-0.8), "far_left");
  assert.equal(interceptZone(0), "center");
  assert.equal(interceptZone(0.8), "far_right");
  assert.equal(resolveServeInput(frame(), { choice: "serve_center" }).x, 700);
});
