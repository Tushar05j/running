require("dotenv").config();
const express = require("express");
const axios   = require("axios");
const cors    = require("cors");

const connectDB             = require("./config/db");
const stravaRoutes          = require("./routes/stravaRoutes");
const analyticsRoutes       = require("./routes/analyticsRoutes");
const predictRoutes         = require("./routes/predictRoutes");
const routeComparisonRoutes = require("./routes/routeComparisonRoutes");
const aiRoutes              = require("./routes/aiRoutes");

const app = express();

connectDB();

app.use(cors({
  origin: [
    "https://paceiq-neon.vercel.app",
    "http://localhost:3000"
  ],
  credentials: true
}));
app.use(express.json());

app.use("/api/analytics", analyticsRoutes);
app.use("/api/predict",   predictRoutes);
app.use("/api/routes",    routeComparisonRoutes);
app.use("/api/ai",        aiRoutes);
app.use("/api/strava",    stravaRoutes);

// STRAVA LOGIN
app.get("/auth/strava", (req, res) => {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const redirectUrl =
    `https://www.strava.com/oauth/authorize?client_id=${clientId}` +
    `&response_type=code` +
    `&redirect_uri=https://running-orpin.vercel.app/auth/strava/callback` +
    `&approval_prompt=force` +
    `&scope=read,activity:read`;
  res.redirect(redirectUrl);
});

// STRAVA CALLBACK
app.get("/auth/strava/callback", async (req, res) => {
  const code = req.query.code;
  try {
    const response = await axios.post("https://www.strava.com/oauth/token", {
      client_id:     process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code:          code,
      grant_type:    "authorization_code",
    });

    const refreshToken = response.data.refresh_token;
    const athlete      = response.data.athlete;

    console.log(`Strava connected: ${athlete.firstname} ${athlete.lastname}`);
    process.env.STRAVA_REFRESH_TOKEN = refreshToken;

    res.redirect("https://paceiq-neon.vercel.app?strava=connected");
  } catch (err) {
    console.error("Strava callback error:", err.response?.data || err.message);
    res.redirect("https://paceiq-neon.vercel.app?auth=error");
  }
});

// ROOT
app.get("/", (req, res) => {
  res.send("Running AI backend active");
});

// Export for Vercel — do not call app.listen()
module.exports = app;