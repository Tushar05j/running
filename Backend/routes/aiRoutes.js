const express = require("express");
const router = express.Router();
const axios = require("axios");
const Activity = require("../models/Activity");

// ─── FORMAT RUNS INTO READABLE TEXT FOR CLAUDE ────────────────────────────────
function formatRunsForPrompt(runs) {
  return runs.map(run => {
    const distanceKm = (run.distance / 1000).toFixed(2);
    const paceSeconds = run.moving_time / (run.distance / 1000);
    const paceMin = Math.floor(paceSeconds / 60);
    const paceSec = Math.round(paceSeconds % 60).toString().padStart(2, "0");
    const date = new Date(run.start_date).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric"
    });

    let line = `- ${date}: "${run.name}" | ${distanceKm}km | ${paceMin}:${paceSec}/km`;
    if (run.average_heartrate) line += ` | HR ${run.average_heartrate}bpm`;
    if (run.average_cadence)   line += ` | cadence ${run.average_cadence}spm`;
    if (run.total_elevation_gain) line += ` | +${run.total_elevation_gain}m elevation`;

    return line;
  }).join("\n");
}

// ─── GET /api/ai/summarize ────────────────────────────────────────────────────
// Fetches last 14 runs + ACWR, sends to Claude, returns a coached paragraph
router.get("/summarize", async (req, res) => {
  try {

    // 1. Fetch last 14 runs
    const recentRuns = await Activity.find()
      .sort({ start_date: -1 })
      .limit(14);

    if (recentRuns.length === 0) {
      return res.status(400).json({ error: "No runs found. Sync Strava first." });
    }

    // 2. Calculate training load (ACWR) for context
    const allRuns = await Activity.find();
    const today = new Date();
    let acuteLoad = 0;
    let chronicLoad = 0;

    allRuns.forEach(run => {
      const diffDays = (today - new Date(run.start_date)) / (1000 * 60 * 60 * 24);
      const km = run.distance / 1000;
      if (diffDays <= 7)  acuteLoad  += km;
      if (diffDays <= 28) chronicLoad += km;
    });

    const acwr = chronicLoad === 0 ? 0 : (acuteLoad / chronicLoad).toFixed(2);
    let acwrStatus = "Optimal";
    if (acwr < 0.8) acwrStatus = "Undertraining";
    if (acwr > 1.5) acwrStatus = "High Injury Risk";

    // 3. Build the prompt
    const systemPrompt = `You are an experienced running coach analyzing an athlete's training data.
Be specific, data-driven, and encouraging. Use the exact numbers from the data.
Write in plain prose — no bullet points, no headers, no markdown.
Keep your response to exactly 3-4 sentences.
End with exactly one specific, actionable training suggestion for the next 7 days.`;

    const userMessage = `Here is my recent training data:

${formatRunsForPrompt(recentRuns)}

Training Load:
- Last 7 days (acute load): ${acuteLoad.toFixed(1)} km
- Last 28 days (chronic load): ${chronicLoad.toFixed(1)} km
- ACWR ratio: ${acwr} — Status: ${acwrStatus}
- Total runs in database: ${allRuns.length}

Please summarize my recent training and give me one specific suggestion for next week.`;

    // 4. Call Groq API (OpenAI-compatible format)
    const groqResponse = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        max_tokens: 300,
        temperature: 0.7,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userMessage  }
        ]
      },
      {
        headers: {
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    // 5. Extract the text response
    const summary = groqResponse.data.choices[0].message.content;

    res.json({
      summary,
      runsAnalyzed: recentRuns.length,
      acuteLoad: acuteLoad.toFixed(1),
      chronicLoad: chronicLoad.toFixed(1),
      acwr,
      acwrStatus
    });

  } catch (error) {
    console.log("AI summarize error:", error.response?.data || error.message);
    res.status(500).json({
      error: "Could not generate summary. Make sure GROQ_API_KEY is set in .env"
    });
  }
});

module.exports = router;