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

async function postJson(url: string, headers: Record<string, string>, body: unknown) {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new HttpError(502, `Could not reach the AI provider at ${new URL(url).origin}: ${(error as Error).message}`);
  }
  const text = await response.text();
  if (!response.ok) throw new HttpError(502, `AI provider error (${response.status}): ${extractError(text)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(502, "AI provider returned an unreadable response.");
  }
}

async function getJson(url: string, headers: Record<string, string>) {
  let response: Response;
  try {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    throw new HttpError(502, `Could not reach ${new URL(url).origin}: ${(error as Error).message}`);
  }
  const text = await response.text();
  if (!response.ok) throw new HttpError(502, `Provider error (${response.status}): ${extractError(text)}`);
  return JSON.parse(text);
}

function extractError(text: string) {
  try {
    const parsed = JSON.parse(text);
    return parsed?.error?.message ?? parsed?.error ?? parsed?.message ?? text.slice(0, 300);
  } catch {
    return text.slice(0, 300);
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

  switch (llm.provider) {
    case "anthropic": {
      const data = await postJson(`${url}/v1/messages`, { "x-api-key": llm.apiKey, "anthropic-version": "2023-06-01" }, {
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      });
      return (data.content ?? []).filter((block: { type: string }) => block.type === "text").map((block: { text: string }) => block.text).join("");
    }
    case "gemini": {
      const data = await postJson(`${url}/models/${encodeURIComponent(model)}:generateContent`, { "x-goog-api-key": llm.apiKey }, {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: maxTokens, ...(options.json ? { responseMimeType: "application/json" } : {}) },
      });
      return (data.candidates?.[0]?.content?.parts ?? []).map((part: { text?: string }) => part.text ?? "").join("");
    }
    case "ollama": {
      const data = await postJson(`${url}/api/chat`, {}, {
        model,
        stream: false,
        ...(options.json ? { format: "json" } : {}),
        // Interview transcripts are long; the default context window would truncate them.
        options: { num_ctx: 32768 },
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      });
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
      const data = await postJson(`${url}/chat/completions`, headers, body);
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
  switch (llm.provider) {
    case "anthropic": {
      const data = await getJson(`${url}/v1/models?limit=100`, { "x-api-key": llm.apiKey, "anthropic-version": "2023-06-01" });
      return (data.data ?? []).map((model: { id: string }) => model.id);
    }
    case "gemini": {
      const data = await getJson(`${url}/models?pageSize=200`, { "x-goog-api-key": llm.apiKey });
      return (data.models ?? [])
        .filter((model: { supportedGenerationMethods?: string[] }) => model.supportedGenerationMethods?.includes("generateContent"))
        .map((model: { name: string }) => model.name.replace(/^models\//, ""));
    }
    case "ollama": {
      const data = await getJson(`${url}/api/tags`, {});
      return (data.models ?? []).map((model: { name: string }) => model.name);
    }
    default: {
      const data = await getJson(`${url}/models`, llm.apiKey ? { authorization: `Bearer ${llm.apiKey}` } : {});
      const ids: string[] = (data.data ?? []).map((model: { id: string }) => model.id);
      return info.id === "openai" ? ids.filter((id) => /^(gpt|o\d|chatgpt)/.test(id) && !/(audio|realtime|transcribe|tts|image|search)/.test(id)).sort() : ids.sort();
    }
  }
}

export async function testConnection(llm: LlmSettings) {
  const reply = await chat(llm, "You are a connection test.", "Reply with the single word: ready", { maxTokens: 1024 });
  return reply.trim().slice(0, 80) || "(empty reply)";
}
