import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chat, friendlyError, providerFetch } from "../server/ai";

let server: http.Server;
let base = "";
const hits: Record<string, number> = {};

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const key = req.url ?? "";
    hits[key] = (hits[key] ?? 0) + 1;
    const send = (status: number, body: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { "content-type": "application/json", ...headers });
      res.end(JSON.stringify(body));
    };
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      if (key === "/flaky") return hits[key] < 2 ? send(429, { error: { message: "rate limited" } }, { "retry-after": "0.01" }) : send(200, { ok: true });
      if (key === "/badkey") return send(401, { error: { message: "Incorrect API key provided" } });
      if (key === "/nocredit") return send(400, { error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } });
      if (key === "/v1/chat/completions") {
        const model = JSON.parse(body).model;
        if (model === "cut") return send(200, { choices: [{ finish_reason: "length", message: { content: "{\"cells\":[" } }] });
        return send(200, { choices: [{ finish_reason: "stop", message: { content: "ready" } }] });
      }
      send(404, { error: { message: "not found" } });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.close(); });

describe("providerFetch", () => {
  it("retries rate limits and then succeeds", async () => {
    const text = await providerFetch(`${base}/flaky`, () => ({ method: "POST" }), { label: "Test", timeoutMs: 5000 });
    expect(JSON.parse(text)).toEqual({ ok: true });
    expect(hits["/flaky"]).toBe(2);
  });

  it("does not retry a bad key and explains it", async () => {
    await expect(providerFetch(`${base}/badkey`, () => ({}), { label: "OpenAI", timeoutMs: 5000 })).rejects.toThrow(/OpenAI rejected the API key/);
    expect(hits["/badkey"]).toBe(1);
  });

  it("explains missing credit", async () => {
    await expect(providerFetch(`${base}/nocredit`, () => ({}), { label: "Anthropic", timeoutMs: 5000 })).rejects.toThrow(/no credit or billing/);
  });
});

describe("chat", () => {
  const llm = { provider: "openai-compatible" as const, model: "m", baseUrl: `http://placeholder/v1`, apiKey: "" };
  it("returns text from an OpenAI-compatible server", async () => {
    expect(await chat({ ...llm, baseUrl: `${base}/v1` }, "s", "u")).toBe("ready");
  });
  it("flags answers cut off by the output limit", async () => {
    await expect(chat({ ...llm, baseUrl: `${base}/v1`, model: "cut" }, "s", "u")).rejects.toThrow(/cut off/);
  });
});

describe("friendlyError", () => {
  it("recognises common provider failures", () => {
    expect(friendlyError(404, JSON.stringify({ error: { message: "model: claude-x not found" } }), "Anthropic", "claude-x")).toMatch(/isn't available/);
    expect(friendlyError(400, JSON.stringify({ error: { message: "prompt is too long: 250000 tokens > 200000 maximum" } }), "Anthropic")).toMatch(/too long for this model/);
    expect(friendlyError(429, JSON.stringify({ error: { message: "You exceeded your current quota" } }), "OpenAI")).toMatch(/no credit/);
  });
});

describe("quota errors", () => {
  it("does not retry an exhausted quota even though it is a 429", async () => {
    const quota = http.createServer((_req, res) => { res.writeHead(429, { "content-type": "application/json" }); res.end(JSON.stringify({ error: { message: "You exceeded your current quota, please check your plan and billing details." } })); });
    await new Promise<void>((resolve) => quota.listen(0, "127.0.0.1", resolve));
    const started = Date.now();
    await expect(providerFetch(`http://127.0.0.1:${(quota.address() as AddressInfo).port}/`, () => ({}), { label: "OpenAI", timeoutMs: 5000 })).rejects.toThrow(/no credit/);
    expect(Date.now() - started).toBeLessThan(1000);
    quota.close();
  });
});

describe("recommendedModel", () => {
  it("picks a sensible default from each provider's list", async () => {
    const { recommendedModel } = await import("../server/ai");
    expect(recommendedModel("anthropic", ["claude-opus-9", "claude-sonnet-9", "claude-haiku-9", "claude-sonnet-8"])).toBe("claude-sonnet-9");
    expect(recommendedModel("openai", ["gpt-5.4", "gpt-5.4-mini", "gpt-5.5-mini", "o4-mini", "gpt-5.4-nano"])).toBe("gpt-5.5-mini");
    expect(recommendedModel("gemini", ["gemini-2.5-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.7-flash-preview"])).toBe("gemini-3.6-flash");
    expect(recommendedModel("ollama", ["qwen3:8b"])).toBe("qwen3:8b");
    expect(recommendedModel("anthropic", [])).toBe("");
  });
});

describe("describeNetworkError", () => {
  it("explains common network failures in plain language", async () => {
    const { describeNetworkError } = await import("../server/network");
    const wrap = (code: string) => Object.assign(new TypeError("fetch failed"), { cause: { code, message: code } });
    expect(describeNetworkError(wrap("ENOTFOUND"), "https://api.openai.com/v1/models", "OpenAI")).toMatch(/couldn't find api.openai.com/);
    expect(describeNetworkError(wrap("SELF_SIGNED_CERT_IN_CHAIN"), "https://api.openai.com/v1", "OpenAI")).toMatch(/certificate/);
    expect(describeNetworkError(wrap("ECONNREFUSED"), "http://127.0.0.1:11434/api/tags", "Ollama")).toMatch(/Nothing is answering/);
    expect(describeNetworkError(wrap("ECONNRESET"), "https://openrouter.ai/api/v1", "OpenRouter")).toMatch(/blocked or cut off/);
  });
});
