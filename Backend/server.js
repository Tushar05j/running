require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const routeComparisonRoutes = require("./routes/routeComparisonRoutes");
const aiRoutes = require("./routes/aiRoutes");
const connectDB = require("./config/db");
const stravaRoutes = require("./routes/stravaRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");

const predictRoutes = require("./routes/predictRoutes");
const app = express();

connectDB();

app.use(cors());
app.use(express.json());
app.use("/api/analytics", analyticsRoutes);
app.use("/api/predict", predictRoutes);
app.use("/api/routes", routeComparisonRoutes);
app.use("/api/ai", aiRoutes);
/* STRAVA LOGIN ROUTE */
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


/* STRAVA CALLBACK ROUTE */
app.get("/auth/strava/callback", async (req, res) => {

  const code = req.query.code;

  try {

    const response = await axios.post(
      "https://www.strava.com/oauth/token",
      {
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code: code,
        grant_type: "authorization_code"
      }
    );

    const accessToken = response.data.access_token;

    console.log("Access Token:", accessToken);

    res.send("Strava connected successfully!");

  } catch (err) {
    console.error(err.response?.data || err.message);
    res.send("Error connecting Strava");
  }

});


app.use("/api/strava", stravaRoutes);
app.use("/api/predict", predictRoutes);
app.get("/", (req, res) => {
  res.send("Running AI backend active");
});

app.listen(5000, () => {
  console.log("Server running on port 5000");
});
