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
import { TypeSafeClient } from "./typesafe.mjs";

const DEFAULT_ENV_FILE = "/Users/itamarc/Desktop/.env";

function parseArgs(argv) {
  const options = {
    cdp: "http://127.0.0.1:9222",
    envFile: DEFAULT_ENV_FILE,
    level: "club",
    maxSeconds: 300,
    model: null,
    url: GAME_URL,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (name === "--help" || name === "-h") return { ...options, help: true };
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
  --env-file PATH         Env file containing TYPESAFE_API_KEY
  --model NAME            TypeSafe model (default: TYPESAFE_MODEL or jev-latest)
  --cdp URL               Chrome debugging endpoint (default: http://127.0.0.1:9222)
  --url URL               Game URL (default includes ?test=1)`);
}

function makeRecorder(model, level) {
  const directory = path.resolve("artifacts");
  fs.mkdirSync(directory, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const file = path.join(directory, `run-${stamp}.jsonl`);
  const write = (record) => fs.appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), ...record })}\n`, { mode: 0o600 });
  write({ type: "session", model, level, controller: "Jev choices over structured game telemetry; Chrome receives ordinary mouse and keyboard input" });
  return { file, write };
}

function probability(answer) {
  return answer.probabilities[answer.choice];
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const envFile = readEnvFile(options.envFile);
  const apiKey = process.env.TYPESAFE_API_KEY || envFile.values.TYPESAFE_API_KEY;
  const model = options.model || process.env.TYPESAFE_MODEL || envFile.values.TYPESAFE_MODEL || "jev-latest";
  if (!apiKey) throw new Error("TYPESAFE_API_KEY is missing.");
  if (envFile.permissionsTooOpen) {
    console.warn(`Security note: ${options.envFile} is readable by other local users; consider chmod 600.`);
  }

  const typesafe = new TypeSafeClient({ apiKey, model });
  const cdp = await CdpClient.connect(options.cdp);
  const recorder = makeRecorder(model, options.level);
  let mouseHeld = false;
  let pointer = { x: 0, y: 0 };

  const releaseMouse = async () => {
    if (!mouseHeld) return;
    await cdp.mouseUp(pointer.x, pointer.y);
    mouseHeld = false;
  };

  try {
    console.log(`Connected to Chrome. Starting ${options.level} match with ${model}.`);
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
        recorder.write({ type: "result", winner, score: { jev: nextScore[0], cpu: nextScore[1] }, decisions: decisionCount, elapsed_seconds: (Date.now() - startedAt) / 1_000 });
        await updateOverlay(cdp, [`JEV · MATCH ${winner === "jev" ? "WON" : "LOST"}`, `${nextScore[0]}–${nextScore[1]} · ${decisionCount} decisions`]);
        console.log(`Match ${winner === "jev" ? "won" : "lost"}: ${nextScore[0]}–${nextScore[1]}.`);
        return;
      }

      if (state === "ready" && frame.telemetry.server === 0 && !serveHandled) {
        serveHandled = true;
        const request = makeServeRequest(frame, history);
        await updateOverlay(cdp, ["JEV · THINKING", "Choosing serve placement…"]);
        const response = await typesafe.decide(request.state, request.questions);
        decisionCount += 1;
        const selected = response.answers.placement;
        pointer = resolveServeInput(frame, selected);
        recorder.write({ type: "decision", phase: "serve", request, response });
        await updateOverlay(cdp, ["JEV · SERVE", `${selected.choice} · ${(probability(selected) * 100).toFixed(0)}%`, `${response.model} · ${response.latency_ms} ms`]);
        console.log(`Jev serve: ${selected.choice} (${(probability(selected) * 100).toFixed(0)}%, ${response.latency_ms} ms)`);
        await cdp.click(pointer.x, pointer.y);
      } else if (state !== "ready") {
        serveHandled = false;
      }

      const velocity = estimateVelocity(previous, frame);
      if (state === "playing" && isIncomingBall(previous, frame) && !returnHandled) {
        returnHandled = true;
        await releaseMouse();
        await setPaused(cdp, true);
        const request = makeReturnRequest(frame, velocity, history);
        await updateOverlay(cdp, ["JEV · THINKING", `Rally ${frame.telemetry.rally} · ball incoming…`]);

        let response;
        try {
          response = await typesafe.decide(request.state, request.questions);
        } finally {
          await setPaused(cdp, false);
        }

        decisionCount += 1;
        const input = resolveReturnInput(frame, response.answers);
        pointer = { x: input.x, y: input.y };
        await cdp.mouseMove(pointer.x, pointer.y);
        if (input.power) {
          await cdp.mouseDown(pointer.x, pointer.y);
          mouseHeld = true;
        }

        pendingReturn = {
          placement: response.answers.placement.choice,
          power: response.answers.power.choice,
          outcome: "rally_continued",
        };
        recorder.write({ type: "decision", phase: "return", request, response, input: { power: input.power } });
        const placement = response.answers.placement;
        const power = response.answers.power;
        await updateOverlay(cdp, [
          "JEV · RETURN",
          `${placement.choice} · ${(probability(placement) * 100).toFixed(0)}%`,
          `${power.choice} · ${(probability(power) * 100).toFixed(0)}%`,
          `${response.model} · ${response.latency_ms} ms`,
        ]);
        console.log(`Jev return: ${placement.choice} + ${power.choice} (${response.latency_ms} ms)`);
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
    recorder.write({ type: "stopped", reason: "time_limit", score: { jev: score[0], cpu: score[1] } });
    await updateOverlay(cdp, ["JEV · STOPPED", `Time limit · ${score[0]}–${score[1]}`]);
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
