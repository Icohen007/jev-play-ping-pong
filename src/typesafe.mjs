const API_URL = "https://api.typesafe.ai/v1/systemone";
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504, 529]);

function isProbability(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function validateChoiceAnswer(answer, optionNames) {
  if (!answer || answer.type !== "choice" || !optionNames.includes(answer.choice)) {
    throw new Error("TypeSafe returned an invalid Choice answer.");
  }
  if (!isProbability(answer.confidence) || !answer.probabilities || typeof answer.probabilities !== "object") {
    throw new Error("TypeSafe returned invalid Choice probabilities.");
  }

  const returnedNames = Object.keys(answer.probabilities).sort();
  const expectedNames = [...optionNames].sort();
  if (JSON.stringify(returnedNames) !== JSON.stringify(expectedNames)) {
    throw new Error("TypeSafe returned probabilities for unexpected Choice options.");
  }

  const probabilities = optionNames.map((name) => answer.probabilities[name]);
  if (!probabilities.every(isProbability)) {
    throw new Error("TypeSafe returned an out-of-range Choice probability.");
  }
  const total = probabilities.reduce((sum, value) => sum + value, 0);
  if (Math.abs(total - 1) > 0.011) {
    throw new Error("TypeSafe Choice probabilities do not sum to one.");
  }

  const maximum = Math.max(...probabilities);
  if (Math.abs(answer.probabilities[answer.choice] - maximum) > 1e-9) {
    throw new Error("TypeSafe Choice selection is not the highest-probability option.");
  }
}

export function validateSystemOneResponse(response, questions) {
  if (!response || typeof response !== "object" || typeof response.model !== "string") {
    throw new Error("TypeSafe returned an invalid response envelope.");
  }
  if (!response.answers || typeof response.answers !== "object") {
    throw new Error("TypeSafe returned no answers.");
  }

  const expected = Object.keys(questions).sort();
  const actual = Object.keys(response.answers).sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error("TypeSafe answer keys do not match the questions.");
  }

  for (const [name, question] of Object.entries(questions)) {
    if (question.type !== "choice") {
      throw new Error(`Unsupported local question type: ${question.type}`);
    }
    validateChoiceAnswer(response.answers[name], Object.keys(question.criteria));
  }
  return response;
}

function retryDelayMs(response, attempt) {
  const retryAfter = Number(response?.headers?.get?.("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min(retryAfter * 1_000, 5_000);
  return Math.min(250 * 2 ** attempt, 2_000);
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export class TypeSafeClient {
  constructor({ apiKey, model = "jev-latest", timeoutMs = 10_000, maxRetries = 2, fetchImpl = fetch }) {
    if (!apiKey) throw new Error("TYPESAFE_API_KEY is required.");
    this.apiKey = apiKey;
    this.model = model;
    this.timeoutMs = timeoutMs;
    this.maxRetries = maxRetries;
    this.fetchImpl = fetchImpl;
  }

  async decide(state, questions) {
    const payload = JSON.stringify({ model: this.model, state, questions });
    let lastError;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const startedAt = performance.now();
      try {
        const response = await this.fetchImpl(API_URL, {
          method: "POST",
          redirect: "error",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: payload,
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (!response.ok) {
          const safeError = new Error(`TypeSafe request failed with HTTP ${response.status}.`);
          if (!RETRYABLE_STATUS.has(response.status) || attempt === this.maxRetries) throw safeError;
          lastError = safeError;
          await sleep(retryDelayMs(response, attempt));
          continue;
        }

        const contentLength = Number(response.headers.get("content-length"));
        if (Number.isFinite(contentLength) && contentLength > 1_048_576) {
          throw new Error("TypeSafe response exceeded the size limit.");
        }

        const result = validateSystemOneResponse(await response.json(), questions);
        return { ...result, latency_ms: Math.round(performance.now() - startedAt) };
      } catch (error) {
        const safeError = error?.name === "TimeoutError"
          ? new Error(`TypeSafe request timed out after ${this.timeoutMs} ms.`)
          : error;
        if (attempt === this.maxRetries || /invalid|unexpected|answer|probabilit/i.test(safeError.message)) {
          throw safeError;
        }
        lastError = safeError;
        await sleep(250 * 2 ** attempt);
      }
    }

    throw lastError ?? new Error("TypeSafe request failed.");
  }
}
