import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { env } from "../env.js";
import { logger } from "../logger.js";
import { redis } from "../redis.js";

export const PROMPT_VERSION = "v1";

export const MODEL_HAIKU = "claude-haiku-4-5";
export const MODEL_SONNET = "claude-sonnet-4-6";

let client: Anthropic | null = null;

export class AiUnavailableError extends Error {
  constructor() {
    super(
      "ANTHROPIC_API_KEY ausente. Defina no .env para habilitar features de IA."
    );
    this.name = "AiUnavailableError";
  }
}

export function isAiAvailable(): boolean {
  return Boolean(env.ANTHROPIC_API_KEY);
}

function getClient(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) throw new AiUnavailableError();
  if (!client) client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client;
}

const RATE_LIMIT_WINDOW_S = 60;
const RATE_LIMIT_MAX = 10;

export async function checkRateLimit(identifier: string): Promise<boolean> {
  const key = `ai:rate:${identifier}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, RATE_LIMIT_WINDOW_S);
  return count <= RATE_LIMIT_MAX;
}

const CACHE_TTL_SECONDS = 24 * 60 * 60;

export function hashKey(parts: unknown[]): string {
  const h = createHash("sha256");
  h.update(JSON.stringify(parts));
  return h.digest("hex").slice(0, 24);
}

export async function getCachedJson<T>(key: string): Promise<T | null> {
  const value = await redis.get(`ai:cache:${key}`);
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export async function setCachedJson(
  key: string,
  value: unknown,
  ttlSeconds = CACHE_TTL_SECONDS
): Promise<void> {
  await redis.set(`ai:cache:${key}`, JSON.stringify(value), "EX", ttlSeconds);
}

type CompleteJsonInput = {
  model: typeof MODEL_HAIKU | typeof MODEL_SONNET;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
};

export async function completeJson<T>(input: CompleteJsonInput): Promise<T> {
  const c = getClient();
  const response = await c.messages.create({
    model: input.model,
    max_tokens: input.maxTokens ?? 1024,
    temperature: input.temperature ?? 0.7,
    system: [
      {
        type: "text",
        text: input.systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: input.userPrompt }],
  });

  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("AI response had no text block");
  }
  const text = block.text.trim();
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error(`AI response was not JSON: ${text.slice(0, 200)}`);
  }
  const payload = text.slice(jsonStart, jsonEnd + 1);
  try {
    return JSON.parse(payload) as T;
  } catch (err) {
    logger.error({ err, payload }, "failed to parse AI JSON");
    throw new Error("AI response was not valid JSON");
  }
}

export async function* streamText(input: {
  model: typeof MODEL_HAIKU | typeof MODEL_SONNET;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}): AsyncGenerator<string> {
  const c = getClient();
  const stream = c.messages.stream({
    model: input.model,
    max_tokens: input.maxTokens ?? 1024,
    temperature: input.temperature ?? 0.7,
    system: [
      {
        type: "text",
        text: input.systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: input.userPrompt }],
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield event.delta.text;
    }
  }
}
