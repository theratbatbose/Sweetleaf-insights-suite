// A fake OpenAI-compatible provider for testing Sweetleaf without real API keys.
// Run: node tests/mock-provider.mjs  (listens on 127.0.0.1:4500, base URL http://127.0.0.1:4500/v1)
import http from "node:http";

const PORT = Number(process.env.MOCK_PORT || 4500);

function reply(prompt) {
  if (prompt.includes("Convert this discussion guide")) {
    return { sections: [
      { title: "Warm-up", questions: ["Tell me about yourself"] },
      { title: "Discovery", questions: ["How do you find new snacks?", "Who influences you? — Probe: friends, family"] },
    ] };
  }
  if (prompt.includes("respondent segments")) {
    return { segments: [{ name: "Heavy users", description: "Snack daily", criteria: "5+ times a week", quota: 2 }, { name: "Light users", description: "Snack rarely", criteria: "1-2 times a week", quota: 2 }] };
  }
  if (prompt.includes("Extract the study design")) {
    return { client: "Mock Foods", objectives: "- Understand snacking", background: "", methodology: "4 IDIs", markets: "Delhi", languages: "Hindi" };
  }
  if (prompt.includes("analysis-grid cell")) {
    const ids = [...prompt.matchAll(/^\[(q[a-z0-9]+)\]/gm)].map((m) => m[1]);
    const transcript = prompt.split("TRANSCRIPT:")[1] ?? "";
    const lines = transcript.split("\n").map((l) => l.replace(/^\[[\d:]+\]\s*/, "").replace(/^[^:]{1,24}:\s*/, "").trim()).filter((l) => l.length > 10);
    return { cells: ids.map((id, i) => ({
      questionId: id,
      summary: `Mock summary for ${id}.`,
      quotes: [
        { text: lines[i % Math.max(lines.length, 1)] ?? "", translation: "" },
        ...(i === 0 ? [{ text: "This sentence was never said by anyone.", translation: "" }] : []),
      ],
    })) };
  }
  if (prompt.includes("across respondents\" synthesis")) return { synthesis: "Mock row synthesis: most respondents agree." };
  if (prompt.includes("cumulative view of this segment")) {
    const id = prompt.match(/^\[(p[a-z0-9]+)\]/m)?.[1];
    return { recurring: ["Habit", "Price"], differences: "Mock differences.", contradictions: "Mock outlier.", explore: "Mock question?", excerpts: id ? [{ participantId: id, text: "Made-up excerpt" }] : [] };
  }
  if (prompt.includes("Suggest 2–7 clusters")) {
    const ids = [...prompt.matchAll(/^\[(o[a-z0-9]+)\]/gm)].map((m) => m[1]);
    return { clusters: [{ title: "Mock cluster", thought: "Mock insight.", observationIds: ids.slice(0, 2) }] };
  }
  if (prompt.includes("Draft a topline report")) return { title: "Mock headline", intro: "Mock summary.", body: "## Objective 1\n\n- Point one\n\n## Implications\n\nMock." };
  if (prompt.includes("connection test")) return "ready";
  return { note: "unhandled" };
}

http.createServer((req, res) => {
  let body = [];
  req.on("data", (chunk) => body.push(chunk));
  req.on("end", () => {
    const send = (status, data) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(data)); };
    if (req.method === "GET" && req.url === "/v1/models") return send(200, { data: [{ id: "mock-model" }, { id: "whisper-1" }] });
    if (req.method === "POST" && req.url === "/v1/chat/completions") {
      const payload = JSON.parse(Buffer.concat(body).toString());
      const prompt = payload.messages.map((m) => m.content).join("\n");
      const answer = reply(prompt);
      return send(200, { choices: [{ message: { role: "assistant", content: typeof answer === "string" ? answer : JSON.stringify(answer) } }] });
    }
    if (req.method === "POST" && req.url === "/v1/audio/transcriptions") {
      const size = Buffer.concat(body).length;
      return send(200, { text: "", segments: [
        { start: 0.5, end: 3, text: "Namaste, aaj hum snacks ke baare mein baat karenge." },
        { start: 3.5, end: 7, text: `I usually buy chips when I'm with friends. (${size > 1000 ? "audio received" : "tiny"})` },
        { start: 8, end: 12, text: "Price matters a lot to me, honestly." },
      ] });
    }
    send(404, { error: { message: "not found" } });
  });
}).listen(PORT, "127.0.0.1", () => console.log(`mock provider on http://127.0.0.1:${PORT}/v1`));
