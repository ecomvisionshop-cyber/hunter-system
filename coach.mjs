const SYSTEM = "You are the System, a Solo Leveling style coach for an Indian school student. Be concise (under 120 words), encouraging, practical, safe and age-appropriate. Never give crash diets, supplement advice, medical diagnosis or real-money trading advice; suggest a parent or doctor when needed. Stay on topic: studies, fitness, sleep, looks, health habits, business skills and motivation.";

// Free option: set GEMINI_API_KEY (Google AI Studio, no card). Optional fallback: ANTHROPIC_API_KEY.
async function gen(system, msgs, max, json) {
  const g = process.env.GEMINI_API_KEY;
  if (g) {
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": g },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: msgs.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
        generationConfig: { maxOutputTokens: max, ...(json ? { responseMimeType: "application/json" } : {}) }
      })
    });
    if (!r.ok) return null;
    const d = await r.json();
    return ((d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || []).map(p => p.text || "").join("");
  }
  const a = process.env.ANTHROPIC_API_KEY;
  if (a) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": a, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: process.env.CLAUDE_MODEL || "claude-sonnet-5-5", max_tokens: max, system, messages: msgs })
    });
    if (!r.ok) return null;
    const d = await r.json();
    return (d.content || []).filter(c => c.type === "text").map(c => c.text).join("\n");
  }
  return null;
}
const J = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { "content-type": "application/json" } });
export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY) return J({ error: "No AI key set" }, 500);
  let body;
  try { body = await req.json(); } catch { return J({ error: "Bad request" }, 400); }
  const msgs = (Array.isArray(body.messages) ? body.messages : []).slice(-8).map(m => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content || "").slice(0, 4000)
  }));
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return J({ error: "Bad request" }, 400);
  const text = await gen(SYSTEM, msgs, 500, false);
  return text ? J({ text }) : J({ error: "AI error" }, 502);
};
