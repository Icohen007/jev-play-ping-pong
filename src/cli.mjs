#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

import { clickElement, prepareGame, readGameFrame, setPaused, updateOverlay } from "./browser-game.mjs";
import { CdpClient } from "./cdp.mjs";
import { readEnvFile } from "./env.mjs";
import {
  estimateVelocity,
  GAME_URL,
  isIncomingBall,
  makeReturnRequest,
  makeServeRequest,
  resolveReturnInput,
  resolveServeInput,
} from "./game.mjs";
import { addUsage, calculateJevCost, JEV_PRICE_USD_PER_MILLION } from "./pricing.mjs";
import { TypeSafeClient } from "./typesafe.mjs";

function parseArgs(argv) {
  const options = {
    cdp: "http://127.0.0.1:9222",
    envFile: null,
    level: "club",
    maxSeconds: 300,
    model: null,
    pauseDuringDecision: false,
    url: GAME_URL,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (name === "--help" || name === "-h") return { ...options, help: true };
    if (name === "--no-pause") {
      options.pauseDuringDecision = false;
      continue;
    }
    if (name === "--pause") {
      options.pauseDuringDecision = true;
      continue;
    }
    const value = argv[++index];
    if (value === undefined) throw new Error(`Missing value for ${name}.`);
    if (name === "--cdp") options.cdp = value;
    else if (name === "--env-file") options.envFile = value;
    else if (name === "--level") options.level = value;
    else if (name === "--max-seconds") options.maxSeconds = Number(value);
    else if (name === "--model") options.model = value;
    else if (name === "--url") options.url = value;
    else throw new Error(`Unknown option: ${name}`);
  }
  if (!new Set(["chill", "club", "pro"]).has(options.level)) throw new Error("--level must be chill, club, or pro.");
  if (!Number.isFinite(options.maxSeconds) || options.maxSeconds <= 0) throw new Error("--max-seconds must be positive.");
  return options;
}

function printHelp() {
  console.log(`Usage: npm run play -- [options]

Options:
  --level chill|club|pro   CPU difficulty (default: club)
  --max-seconds N         Wall-clock limit (default: 300)
  --pause                  Pause game physics during Jev API calls
  --no-pause              Explicitly select the default real-time mode
  --env-file PATH         Env file (default: .env or TYPESAFE_ENV_FILE)
  --model NAME            TypeSafe model (default: TYPESAFE_MODEL or jev-latest)
  --cdp URL               Chrome debugging endpoint (default: http://127.0.0.1:9222)
  --url URL               Game URL (default includes ?test=1)`);
}

function makeRecorder(model, level, pauseDuringDecision) {
  const directory = path.resolve("artifacts");
  fs.mkdirSync(directory, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const file = path.join(directory, `run-${stamp}.jsonl`);
  const write = (record) => fs.appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), ...record })}\n`, { mode: 0o600 });
  write({
    type: "session",
    model,
    level,
    pause_during_decision: pauseDuringDecision,
    pricing_usd_per_million_tokens: JEV_PRICE_USD_PER_MILLION,
    controller: "Jev choices over structured game telemetry; Chrome receives ordinary mouse and keyboard input",
  });
  return { file, write };
}

function probability(answer) {
  return answer.probabilities[answer.choice];
}

function actionLabel(choice) {
  return choice.replaceAll("_", " ").toUpperCase();
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const envPath = options.envFile || process.env.TYPESAFE_ENV_FILE || path.resolve(".env");
  const envFile = fs.existsSync(envPath)
    ? readEnvFile(envPath)
    : { values: {}, permissionsTooOpen: false };
  const apiKey = process.env.TYPESAFE_API_KEY || envFile.values.TYPESAFE_API_KEY;
  const model = options.model || process.env.TYPESAFE_MODEL || envFile.values.TYPESAFE_MODEL || "jev-latest";
  if (!apiKey) throw new Error("TYPESAFE_API_KEY is missing. Export it or copy .env.example to .env.");
  if (envFile.permissionsTooOpen) {
    console.warn(`Security note: ${envPath} is readable by other local users; consider chmod 600.`);
  }

  const typesafe = new TypeSafeClient({ apiKey, model });
  const cdp = await CdpClient.connect(options.cdp);
  const recorder = makeRecorder(model, options.level, options.pauseDuringDecision);
  let mouseHeld = false;
  let pointer = { x: 0, y: 0 };

  const releaseMouse = async () => {
    if (!mouseHeld) return;
    await cdp.mouseUp(pointer.x, pointer.y);
    mouseHeld = false;
  };

  try {
    const timingMode = options.pauseDuringDecision ? "decision-paused" : "real-time/no-pause";
    console.log(`Connected to Chrome. Starting ${options.level} match with ${model} (${timingMode}).`);
    console.log(`Evidence log: ${recorder.file}`);
    await prepareGame(cdp, options);

    const startedAt = Date.now();
    let previous = null;
    let returnHandled = false;
    let serveHandled = false;
    let decisionCount = 0;
    let score = [0, 0];
    const history = [];
    let pendingReturn = null;
    const usage = { input_tokens: 0, output_tokens: 0 };

    while ((Date.now() - startedAt) / 1_000 < options.maxSeconds) {
      const frame = await readGameFrame(cdp);
      const state = frame.telemetry.state;
      const nextScore = frame.telemetry.score;

      if (nextScore[0] !== score[0] || nextScore[1] !== score[1]) {
        const winner = nextScore[0] > score[0] ? "jev" : "cpu";
        const result = { winner, score: { jev: nextScore[0], cpu: nextScore[1] }, rally: frame.telemetry.best };
        history.push(result);
        if (pendingReturn) pendingReturn.outcome = winner === "jev" ? "won_point" : "lost_point";
        recorder.write({ type: "point", ...result });
        console.log(`Point: ${nextScore[0]}–${nextScore[1]} (${winner})`);
        score = [...nextScore];
      }

      if (state === "over") {
        await releaseMouse();
        const winner = nextScore[0] > nextScore[1] ? "jev" : "cpu";
        const costUsd = calculateJevCost(usage);
        recorder.write({
          type: "result",
          winner,
          score: { jev: nextScore[0], cpu: nextScore[1] },
          decisions: decisionCount,
          elapsed_seconds: (Date.now() - startedAt) / 1_000,
          usage,
          cost_usd: costUsd,
        });
        await updateOverlay(cdp, {
          phase: winner === "jev" ? "won" : "lost",
          title: `MATCH ${winner === "jev" ? "WON" : "LOST"} · ${nextScore[0]}–${nextScore[1]}`,
          detail: `${decisionCount} decisions · $${costUsd.toFixed(6)}`,
          meta: `${model} · complete`,
        });
        console.log(`Match ${winner === "jev" ? "won" : "lost"}: ${nextScore[0]}–${nextScore[1]}. Cost: $${costUsd.toFixed(6)}.`);
        return;
      }

      if (state === "ready" && frame.telemetry.server === 0 && !serveHandled) {
        serveHandled = true;
        const request = makeServeRequest(frame, history);
        await updateOverlay(cdp, {
          phase: "thinking",
          title: "CHOOSING SERVE",
          detail: `Score ${score[0]}–${score[1]} · reading recent points`,
          meta: `${model} · waiting for Jev`,
        });
        const response = await typesafe.decide(request.state, request.questions);
        addUsage(usage, response.billing_usage);
        decisionCount += 1;
        const selected = response.answers.placement;
        pointer = resolveServeInput(frame, selected);
        recorder.write({ type: "decision", phase: "serve", request, response, cost_usd: calculateJevCost(response.billing_usage) });
        await updateOverlay(cdp, {
          phase: "serve",
          title: actionLabel(selected.choice),
          detail: `Selection ${(probability(selected) * 100).toFixed(0)}%`,
          meta: `${response.model} · ${response.latency_ms} ms`,
        });
        console.log(`Jev serve: ${selected.choice} (${(probability(selected) * 100).toFixed(0)}%, ${response.latency_ms} ms)`);
        await cdp.click(pointer.x, pointer.y);
      } else if (state !== "ready") {
        serveHandled = false;
      }

      const velocity = estimateVelocity(previous, frame);
      if (state === "playing" && isIncomingBall(previous, frame) && !returnHandled) {
        returnHandled = true;
        await releaseMouse();
        if (options.pauseDuringDecision) await setPaused(cdp, true);
        const request = makeReturnRequest(frame, velocity, history);
        await updateOverlay(cdp, {
          phase: "thinking",
          title: "READING THE BALL",
          detail: `Rally ${frame.telemetry.rally} · choosing return`,
          meta: `${model} · waiting for Jev`,
        });

        let response;
        try {
          response = await typesafe.decide(request.state, request.questions);
          addUsage(usage, response.billing_usage);
        } finally {
          if (options.pauseDuringDecision) await setPaused(cdp, false);
        }

        decisionCount += 1;
        const input = resolveReturnInput(frame, response.answers);
        pointer = { x: input.x, y: input.y };
        let executed = true;
        if (!options.pauseDuringDecision) {
          const executionFrame = await readGameFrame(cdp);
          executed = executionFrame.telemetry.state === "playing" && executionFrame.telemetry.ball.z < 4.35;
        }
        if (executed) {
          await cdp.mouseMove(pointer.x, pointer.y);
          if (input.power) {
            await cdp.mouseDown(pointer.x, pointer.y);
            mouseHeld = true;
          }
        }

        pendingReturn = {
          placement: response.answers.placement.choice,
          power: response.answers.power.choice,
          outcome: "rally_continued",
        };
        recorder.write({ type: "decision", phase: "return", request, response, input: { power: input.power, executed }, cost_usd: calculateJevCost(response.billing_usage) });
        const placement = response.answers.placement;
        const power = response.answers.power;
        await updateOverlay(cdp, {
          phase: "return",
          title: actionLabel(placement.choice),
          detail: `${actionLabel(power.choice)} ${(probability(power) * 100).toFixed(0)}% · choice ${(probability(placement) * 100).toFixed(0)}%`,
          meta: `${response.model} · ${response.latency_ms} ms`,
        });
        console.log(`Jev return: ${placement.choice} + ${power.choice} (${response.latency_ms} ms${executed ? "" : ", arrived too late"})`);
      }

      if (velocity?.z < -0.25) {
        returnHandled = false;
        await releaseMouse();
      }
      if (!["playing", "paused"].includes(state)) {
        returnHandled = false;
        await releaseMouse();
      }

      previous = frame;
      await sleep(35);
    }

    await releaseMouse();
    recorder.write({
      type: "stopped",
      reason: "time_limit",
      score: { jev: score[0], cpu: score[1] },
      usage,
      cost_usd: calculateJevCost(usage),
    });
    await updateOverlay(cdp, {
      phase: "stopped",
      title: "SESSION STOPPED",
      detail: `Time limit · score ${score[0]}–${score[1]}`,
      meta: model,
    });
    throw new Error(`Time limit reached at ${score[0]}–${score[1]}.`);
  } finally {
    await releaseMouse().catch(() => {});
    cdp.close();
  }
}

run().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
