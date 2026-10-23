const SYSTEM = `You are the planning engine of a Solo Leveling style self-improvement app for an Indian school student.
Given the student's profile, recent completion data and rule-based insights, output ONLY a JSON object (no prose, no code fences) with this shape:
{"headline": string (<=120 chars, what to focus on this week),
 "mantra": string (<=100 chars, motivating, in a bold gaming tone),
 "rotation": [7 strings Monday..Sunday, each a subject from the student's subjects, or "Rest"],
 "study_tips": [3 short strings], "workout_tips": [3], "looks_tips": [3], "food_tips": [3 Indian-food based, matching their diet],
 "missions": [3 objects {"t": short weekly mission, "s": one of STR|VIT|INT|CHA|BIZ|WIL, "x": integer 40-120}],
 "tweak": {"studyDelta": integer -30..30 minutes, "skillDelta": integer -10..10, "note": string explaining the change}}
Rules: weak subjects appear more often in the rotation; reduce load if recent completion is low, raise it if high; respect exam dates; keep everything safe for a minor (no crash diets, supplements, extreme training, real-money trading); tips must be practical and specific.`;

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
  const data = JSON.stringify(body).slice(0, 6000);
  const raw = await gen(SYSTEM, [{ role: "user", content: "Student data:\n" + data }], 1500, true);
  if (!raw) return J({ error: "AI error" }, 502);
  const t = raw.replace(/```json|```/g, "").trim();
  try { return J({ plan: JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)) }); }
  catch { return J({ error: "Bad AI output" }, 502); }
};
