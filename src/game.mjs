export const GAME_URL = "https://indispensable-lingonberry-hot.julius.site/?test=1";

const RETURN_CRITERIA = Object.freeze({
  centered_return: "Meet the ball near the racket center for the safest controlled placement.",
  angle_left: "Use a safe off-center contact so the return is directed toward the CPU's left side and is harder to track.",
  angle_right: "Use a safe off-center contact so the return is directed toward the CPU's right side and is harder to track.",
});

const POWER_CRITERIA = Object.freeze({
  controlled: "Use normal pace. Contact is safe, but this gives the CPU its normal tracking time.",
  power: "Use a faster shot. Contact is still safe, and this materially raises the CPU's chance of misreading the return.",
});

const SERVE_CRITERIA = Object.freeze({
  serve_left: "Serve from the left side, sending the ball toward the CPU's right.",
  serve_center: "Serve from the center for a neutral opening.",
  serve_right: "Serve from the right side, sending the ball toward the CPU's left.",
});

function rounded(value, digits = 3) {
  return Number(Number(value).toFixed(digits));
}

export function interceptZone(normalizedX) {
  if (normalizedX < -0.45) return "far_left";
  if (normalizedX < -0.14) return "left";
  if (normalizedX <= 0.14) return "center";
  if (normalizedX <= 0.45) return "right";
  return "far_right";
}

export function estimateVelocity(previous, current) {
  if (!previous || !current || current.observedAt <= previous.observedAt) return null;
  const seconds = (current.observedAt - previous.observedAt) / 1_000;
  return {
    x: (current.telemetry.ball.x - previous.telemetry.ball.x) / seconds,
    y: (current.telemetry.ball.y - previous.telemetry.ball.y) / seconds,
    z: (current.telemetry.ball.z - previous.telemetry.ball.z) / seconds,
  };
}

export function isIncomingBall(previous, current) {
  if (current?.telemetry?.state !== "playing") return false;
  const velocity = estimateVelocity(previous, current);
  return Boolean(velocity && velocity.z > 0.25);
}

function commonState(frame, history) {
  const telemetry = frame.telemetry;
  return {
    goal: "Win this first-to-11 table-tennis match by two points.",
    rules: {
      controls: "The code moves the racket to the chosen legal contact point; the swing is automatic.",
      perspective: "Jev controls the red player on the near side. Screen left and right are Jev's left and right.",
      safety: "Every offered return placement is inside the racket's contact envelope.",
    },
    known_mechanics: {
      power_return: "Shortens the next flight by 0.14 seconds and adds 6.5 percentage points to the CPU's misread chance; it does not reduce contact safety because the adapter has already aligned the racket.",
      angled_return: "A safe off-center contact adds spin and slightly increases the CPU's tracking error.",
    },
    difficulty: telemetry.level,
    score: { jev: telemetry.score[0], cpu: telemetry.score[1] },
    current_rally_shots: telemetry.rally,
    personal_best_rally: telemetry.best,
    recent_results: history.slice(-6),
  };
}

export function makeReturnRequest(frame, velocity, history = []) {
  const { telemetry, canvas } = frame;
  const normalizedX = telemetry.targetScreen / canvas.width * 2 - 1;
  const state = {
    ...commonState(frame, history),
    phase: "incoming_return",
    incoming_ball: {
      world_position: Object.fromEntries(Object.entries(telemetry.ball).map(([key, value]) => [key, rounded(value)])),
      estimated_velocity: Object.fromEntries(Object.entries(velocity).map(([key, value]) => [key, rounded(value)])),
      predicted_intercept: {
        normalized_screen_x: rounded(normalizedX),
        zone: interceptZone(normalizedX),
      },
    },
    red_player: { world_x: rounded(telemetry.playerX) },
  };
  const questions = {
    placement: {
      type: "choice",
      instructions: "Choose the racket contact for this incoming ball. Balance point-winning pressure with reliable returns and vary placement when useful.",
      criteria: RETURN_CRITERIA,
    },
    power: {
      type: "choice",
      instructions: "Choose the stroke strength for this incoming return from the current match state.",
      criteria: POWER_CRITERIA,
    },
  };
  return { state, questions };
}

export function makeServeRequest(frame, history = []) {
  return {
    state: { ...commonState(frame, history), phase: "jev_serve" },
    questions: {
      placement: {
        type: "choice",
        instructions: "Choose where Jev should stand for this serve. Vary the opening when useful.",
        criteria: SERVE_CRITERIA,
      },
    },
  };
}

export function resolveReturnInput(frame, answers) {
  const { canvas, telemetry } = frame;
  const offset = Math.max(24, Math.min(42, canvas.width * 0.022));
  const placementOffset = {
    centered_return: 0,
    angle_left: offset,
    angle_right: -offset,
  }[answers.placement.choice];
  if (placementOffset === undefined) throw new Error("Unknown return placement.");

  return {
    x: Math.max(canvas.left + 2, Math.min(canvas.right - 2, canvas.left + telemetry.targetScreen + placementOffset)),
    y: canvas.top + canvas.height * 0.66,
    power: answers.power.choice === "power",
  };
}

export function resolveServeInput(frame, answer) {
  const fraction = {
    serve_left: 0.41,
    serve_center: 0.5,
    serve_right: 0.59,
  }[answer.choice];
  if (fraction === undefined) throw new Error("Unknown serve placement.");
  return {
    x: frame.canvas.left + frame.canvas.width * fraction,
    y: frame.canvas.top + frame.canvas.height * 0.66,
  };
}
