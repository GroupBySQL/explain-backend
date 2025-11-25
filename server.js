const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

// --- Safety: require API key at startup ---
if (!process.env.OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY");
  process.exit(1);
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const app = express();

// Allow browser requests from your front-end
app.use(cors({ origin: "*" }));

// Small JSON limit to avoid huge bills by accident
app.use(express.json({ limit: "10kb" }));

// Tiny in-memory cache (per server instance)
const cache = new Map();

// Simple health check
app.get("/", (req, res) => {
  res.json({ ok: true, message: "SQL Dojo explain backend is running." });
});

app.post("/api/explain-sql", async (req, res) => {
  try {
    const { sql, challengeId, title, description, gradeStatus } = req.body || {};

    if (!sql || typeof sql !== "string") {
      return res.status(400).json({ error: "Missing 'sql' in request body." });
    }

    // Cache key based on body (same SQL = same answer)
    const key = JSON.stringify({ sql, challengeId, title, gradeStatus });
    if (cache.has(key)) {
      return res.json({ explanation: cache.get(key), cached: true });
    }

    // Build a helpful prompt
    const systemPrompt = `
You are an expert SQL instructor and analytics lead.
Explain the user's SQL in clear, non-technical language for someone who cares about business outcomes.
- First, summarize what the query is doing.
- Then explain how it relates to the question or scenario.
- If there is any obvious bug or inefficiency, mention it briefly.
Keep the answer under 200-250 words.
`;

    const userPrompt = `
SQL query:
${sql}

Challenge context:
- ID: ${challengeId || "unknown"}
- Title: ${title || "N/A"}
- Description (may be truncated):
${(description || "").slice(0, 500)}

Grading status (if any): ${gradeStatus || "N/A"}

Please explain this query step by step, as if mentoring an analyst who knows basic SQL but wants to understand the logic and business meaning.
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",         // ✅ cheap + correct name
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 400,
    });

    const explanation =
      completion.choices?.[0]?.message?.content ||
      "I couldn't generate an explanation.";

    // Save to cache
    cache.set(key, explanation);
    if (cache.size > 1000) cache.clear(); // simple reset when too big

    res.json({ explanation });
  } catch (err) {
    console.error("Explain SQL error:", err);
    res.status(500).json({ error: "Failed to explain SQL." });
  }
});

// Use Render's PORT or default to 3000 locally
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Explain backend listening on port ${PORT}`);
});
