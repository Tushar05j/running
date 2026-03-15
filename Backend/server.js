require("dotenv").config();
const express = require("express");
const axios   = require("axios");
const cors    = require("cors");
const fs      = require("fs");
const path    = require("path");

const connectDB              = require("./config/db");
const stravaRoutes           = require("./routes/stravaRoutes");
const analyticsRoutes        = require("./routes/analyticsRoutes");
const predictRoutes          = require("./routes/predictRoutes");
const routeComparisonRoutes  = require("./routes/routeComparisonRoutes");
const aiRoutes               = require("./routes/aiRoutes");

const app = express();

connectDB();

app.use(cors());
app.use(express.json());

app.use("/api/analytics",  analyticsRoutes);
app.use("/api/predict",    predictRoutes);
app.use("/api/routes",     routeComparisonRoutes);
app.use("/api/ai",         aiRoutes);
app.use("/api/strava",     stravaRoutes);

// ─── STRAVA LOGIN ─────────────────────────────────────────────────────────────
app.get("/auth/strava", (req, res) => {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const redirectUrl =
    `https://www.strava.com/oauth/authorize?client_id=${clientId}` +
    `&response_type=code` +
    `&redirect_uri=http://localhost:5000/auth/strava/callback` +
    `&approval_prompt=force` +
    `&scope=read,activity:read`;
  res.redirect(redirectUrl);
});

// ─── STRAVA CALLBACK ──────────────────────────────────────────────────────────
app.get("/auth/strava/callback", async (req, res) => {
  const code = req.query.code;

  try {
    // Exchange code for tokens
    const response = await axios.post("https://www.strava.com/oauth/token", {
      client_id:     process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code:          code,
      grant_type:    "authorization_code",
    });

    const accessToken  = response.data.access_token;
    const refreshToken = response.data.refresh_token;
    const athlete      = response.data.athlete;

    console.log(`Strava connected: ${athlete.firstname} ${athlete.lastname}`);
    console.log(`Access token:  ${accessToken}`);
    console.log(`Refresh token: ${refreshToken}`);

    // Save refresh token to .env so future syncs work
    const envPath = path.join(__dirname, ".env");
    let envContent = fs.readFileSync(envPath, "utf8");

    if (envContent.includes("STRAVA_REFRESH_TOKEN=")) {
      // Update existing line
      envContent = envContent.replace(
        /STRAVA_REFRESH_TOKEN=.*/,
        `STRAVA_REFRESH_TOKEN=${refreshToken}`
      );
    } else {
      // Add new line
      envContent += `\nSTRAVA_REFRESH_TOKEN=${refreshToken}`;
    }

    fs.writeFileSync(envPath, envContent);

    // Update process.env so current session works immediately without restart
    process.env.STRAVA_REFRESH_TOKEN = refreshToken;

    // Redirect back to React app — it will detect totalRuns and show dashboard
    res.redirect("http://localhost:3000?strava=connected");

  } catch (err) {
    console.error("Strava callback error:", err.response?.data || err.message);
    // Redirect to login with error flag
    res.redirect("http://localhost:3000?auth=error");
  }
});

// ─── ROOT ─────────────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.send("Running AI backend active");
});

app.listen(5000, () => {
  console.log("Server running on port 5000");
});