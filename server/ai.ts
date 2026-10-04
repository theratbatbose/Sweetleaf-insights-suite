import type { LlmProviderId, LlmSettings } from "../shared/types";
import { HttpError } from "./storage";

export type ProviderInfo = {
  id: LlmProviderId;
  label: string;
  defaultBaseUrl: string;
  defaultModel: string;
  needsKey: boolean;
  keyUrl: string;
};

export const LLM_PROVIDERS: ProviderInfo[] = [
  { id: "anthropic", label: "Anthropic (Claude)", defaultBaseUrl: "https://api.anthropic.com", defaultModel: "", needsKey: true, keyUrl: "https://console.anthropic.com/settings/keys" },
  { id: "openai", label: "OpenAI", defaultBaseUrl: "https://api.openai.com/v1", defaultModel: "gpt-5.4-mini", needsKey: true, keyUrl: "https://platform.openai.com/api-keys" },
  { id: "gemini", label: "Google Gemini", defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta", defaultModel: "gemini-3.6-flash", needsKey: true, keyUrl: "https://aistudio.google.com/apikey" },
  { id: "openrouter", label: "OpenRouter (one key, many models)", defaultBaseUrl: "https://openrouter.ai/api/v1", defaultModel: "", needsKey: true, keyUrl: "https://openrouter.ai/keys" },
  { id: "ollama", label: "Ollama (runs on this computer)", defaultBaseUrl: "http://127.0.0.1:11434", defaultModel: "", needsKey: false, keyUrl: "https://ollama.com/download" },
  { id: "openai-compatible", label: "Other OpenAI-compatible (LM Studio, Groq, vLLM…)", defaultBaseUrl: "http://127.0.0.1:1234/v1", defaultModel: "", needsKey: false, keyUrl: "" },
];

export function providerInfo(id: LlmProviderId | null) {
  const info = LLM_PROVIDERS.find((provider) => provider.id === id);
  if (!info) throw new HttpError(400, "No AI provider is connected. Open Settings → AI to connect one.");
  return info;
}

function baseUrl(llm: LlmSettings) {
  return (llm.baseUrl || providerInfo(llm.provider).defaultBaseUrl).replace(/\/+$/, "");
}

const TIMEOUT_MS = 10 * 60 * 1000;

const RETRY_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504, 520, 522, 524, 529]);
const MAX_ATTEMPTS = 5;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function extractError(text: string): string {
  try {
    const parsed = JSON.parse(text);
    const error = parsed?.error;
    const message = typeof error === "string" ? error : error?.message ?? parsed?.message ?? parsed?.detail;
    return typeof message === "string" ? message : text.slice(0, 300);
  } catch {
    return text.slice(0, 300);
  }
}

/** Turns provider error responses into messages a researcher can act on. */
export function friendlyError(status: number, body: string, label: string, model?: string): string {
  const detail = extractError(body);
  const lower = detail.toLowerCase();
  if (status === 401 || /invalid.{0,20}(api key|x-api-key|authentication)|incorrect api key|api key not valid|unauthorized/.test(lower)) {
    return `${label} rejected the API key. Open Settings → AI, paste the key again (no spaces) and press Test connection.`;
  }
  if (status === 402 || /insufficient_quota|credit balance|billing|exceeded your current quota|payment required|out of credits/.test(lower)) {
    return `Your ${label} account has no credit or billing is not set up. Add credit in the provider's billing page, then try again. (${detail})`;
  }
  if (status === 403) return `${label} refused the request (403): ${detail}. The key may not have access to this model or region.`;
  if (status === 404 || /model.{0,40}(not found|does not exist|not supported)|unknown model/.test(lower)) {
    return `The model “${model ?? "?"}” isn't available with this ${label} key. In Settings → AI press “Load models” and choose one from the list. (${detail})`;
  }
  if (/context.{0,20}(length|window)|too long|maximum.{0,20}tokens|prompt is too long|request too large|413/.test(lower) || status === 413) {
    return `The text is too long for this model. Choose a model with a larger context window in Settings → AI. (${detail})`;
  }
  if (status === 429) return `${label} is rate-limiting this account (too many requests). Wait a minute and try again; new accounts have low limits that rise with use. (${detail})`;
  if (status >= 500) return `${label} is having problems right now (${status}). Try again in a few minutes. (${detail})`;
  return `${label} error (${status}): ${detail}`;
}

/**
 * fetch with automatic retries for rate limits, overloads and network blips.
 * Honours Retry-After; backs off 2s, 4s, 8s, 16s otherwise.
 */
export async function providerFetch(url: string, init: () => RequestInit, options: { label: string; timeoutMs: number; model?: string }): Promise<string> {
  let lastError = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, { ...init(), signal: AbortSignal.timeout(options.timeoutMs) });
    } catch (error) {
      const message = (error as Error).name === "TimeoutError" ? "the request timed out" : (error as Error).message;
      lastError = `Could not reach ${options.label} at ${new URL(url).origin}: ${message}. Check the internet connection${/127\.0\.0\.1|localhost/.test(url) ? " and that the local server is running" : ""}.`;
      if (attempt < MAX_ATTEMPTS && (error as Error).name !== "TimeoutError") { await sleep(2000 * 2 ** (attempt - 1)); continue; }
      throw new HttpError(502, lastError);
    }
    const text = await response.text();
    if (response.ok) return text;
    lastError = friendlyError(response.status, text, options.label, options.model);
    const permanent = /no credit or billing/.test(lastError);
    if (permanent || !RETRY_STATUSES.has(response.status) || attempt === MAX_ATTEMPTS) throw new HttpError(response.status >= 500 ? 502 : response.status === 429 ? 429 : 400, lastError);
    const retryAfter = Number(response.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 60) * 1000 : 2000 * 2 ** (attempt - 1));
  }
  throw new HttpError(502, lastError);
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, label: string, model?: string) {
  const text = await providerFetch(url, () => ({
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  }), { label, timeoutMs: TIMEOUT_MS, model });
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(502, `${label} returned an unreadable response.`);
  }
}

async function getJson(url: string, headers: Record<string, string>, label = "The provider") {
  const text = await providerFetch(url, () => ({ headers }), { label, timeoutMs: 30_000 });
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(502, `${label} returned an unreadable response. Check the server address.`);
  }
}

/** The model hit its output limit, so its answer (and any JSON in it) is incomplete. */
export class TruncatedError extends HttpError {
  constructor() {
    super(502, "The AI's answer was cut off because it was too long. Try again on fewer questions, or choose a model with a larger output limit.");
  }
}

export type ChatOptions = { json?: boolean; maxTokens?: number };

/** Sends one system + user prompt and returns the model's text answer. */
export async function chat(llm: LlmSettings, system: string, user: string, options: ChatOptions = {}): Promise<string> {
  const info = providerInfo(llm.provider);
  if (info.needsKey && !llm.apiKey) throw new HttpError(400, `Add your ${info.label} API key in Settings → AI.`);
  const model = llm.model || info.defaultModel;
  if (!model) throw new HttpError(400, "Choose a model in Settings → AI.");
  const maxTokens = options.maxTokens ?? 8000;
  const url = baseUrl(llm);
  const label = info.label.replace(/ \(.*\)$/, "");
  const post = (endpoint: string, headers: Record<string, string>, body: unknown) => postJson(endpoint, headers, body, label, model);

  switch (llm.provider) {
    case "anthropic": {
      const data = await post(`${url}/v1/messages`, { "x-api-key": llm.apiKey, "anthropic-version": "2023-06-01" }, {
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      });
      if (data.stop_reason === "max_tokens") throw new TruncatedError();
      if (data.stop_reason === "refusal") throw new HttpError(502, "Claude declined to process this text.");
      return (data.content ?? []).filter((block: { type: string }) => block.type === "text").map((block: { text: string }) => block.text).join("");
    }
    case "gemini": {
      const data = await post(`${url}/models/${encodeURIComponent(model)}:generateContent`, { "x-goog-api-key": llm.apiKey }, {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: maxTokens, ...(options.json ? { responseMimeType: "application/json" } : {}) },
      });
      const candidate = data.candidates?.[0];
      if (!candidate) throw new HttpError(502, `Gemini returned no answer${data.promptFeedback?.blockReason ? ` (blocked: ${data.promptFeedback.blockReason})` : ""}.`);
      if (candidate.finishReason === "MAX_TOKENS") throw new TruncatedError();
      return (candidate.content?.parts ?? []).filter((part: { thought?: boolean }) => !part.thought).map((part: { text?: string }) => part.text ?? "").join("");
    }
    case "ollama": {
      const data = await post(`${url}/api/chat`, {}, {
        model,
        stream: false,
        ...(options.json ? { format: "json" } : {}),
        // Interview transcripts are long; the default context window would truncate them.
        options: { num_ctx: 32768 },
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      });
      if (data.done_reason === "length") throw new TruncatedError();
      return data.message?.content ?? "";
    }
    case "openai":
    case "openrouter":
    case "openai-compatible": {
      const headers: Record<string, string> = llm.apiKey ? { authorization: `Bearer ${llm.apiKey}` } : {};
      if (llm.provider === "openrouter") {
        headers["HTTP-Referer"] = "https://github.com/theratbatbose/Sweetleaf-insights-suite";
        headers["X-Title"] = "Sweetleaf Suite";
      }
      const body: Record<string, unknown> = {
        model,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      };
      // OpenAI's current models reject max_tokens in favour of max_completion_tokens.
      if (llm.provider === "openai") body.max_completion_tokens = maxTokens;
      else body.max_tokens = maxTokens;
      if (options.json && llm.provider !== "openai-compatible") body.response_format = { type: "json_object" };
      const data = await post(`${url}/chat/completions`, headers, body);
      if (data.choices?.[0]?.finish_reason === "length") throw new TruncatedError();
      return data.choices?.[0]?.message?.content ?? "";
    }
    default:
      throw new HttpError(400, "Unknown AI provider.");
  }
}

/** Asks for JSON and parses it, tolerating code fences or prose around the object. */
export async function chatJson<T>(llm: LlmSettings, system: string, user: string, maxTokens?: number): Promise<T> {
  const text = await chat(llm, `${system}\n\nRespond with a single valid JSON object only. No markdown, no commentary.`, user, { json: true, maxTokens });
  const parsed = parseJsonLoose(text);
  if (parsed === undefined) throw new HttpError(502, "The AI response was not valid JSON. Try again, or choose a more capable model in Settings.");
  return parsed as T;
}

export function parseJsonLoose(text: string): unknown {
  const cleaned = text.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/i, "").trim();
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { /* fall through */ }
  }
  return undefined;
}

export async function listModels(llm: LlmSettings): Promise<string[]> {
  const info = providerInfo(llm.provider);
  const url = baseUrl(llm);
  const label = info.label.replace(/ \(.*\)$/, "");
  switch (llm.provider) {
    case "anthropic": {
      const data = await getJson(`${url}/v1/models?limit=100`, { "x-api-key": llm.apiKey, "anthropic-version": "2023-06-01" }, label);
      return (data.data ?? []).map((model: { id: string }) => model.id);
    }
    case "gemini": {
      const data = await getJson(`${url}/models?pageSize=200`, { "x-goog-api-key": llm.apiKey }, label);
      return (data.models ?? [])
        .filter((model: { supportedGenerationMethods?: string[] }) => model.supportedGenerationMethods?.includes("generateContent"))
        .map((model: { name: string }) => model.name.replace(/^models\//, ""));
    }
    case "ollama": {
      const data = await getJson(`${url}/api/tags`, {}, label);
      return (data.models ?? []).map((model: { name: string }) => model.name);
    }
    default: {
      const data = await getJson(`${url}/models`, llm.apiKey ? { authorization: `Bearer ${llm.apiKey}` } : {}, label);
      const ids: string[] = (data.data ?? []).map((model: { id: string }) => model.id);
      return info.id === "openai" ? ids.filter((id) => /^(gpt|o\d|chatgpt)/.test(id) && !/(audio|realtime|transcribe|tts|image|search)/.test(id)).sort() : ids.sort();
    }
  }
}

export async function testConnection(llm: LlmSettings) {
  const reply = await chat(llm, "You are a connection test.", "Reply with the single word: ready", { maxTokens: 1024 });
  return reply.trim().slice(0, 80) || "(empty reply)";
}
