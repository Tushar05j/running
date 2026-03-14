const express = require("express");
const router = express.Router();
const axios = require("axios");
const Activity = require("../models/Activity");

async function getFreshAccessToken() {
  const response = await axios.post("https://www.strava.com/oauth/token", {
    client_id: process.env.STRAVA_CLIENT_ID,
    client_secret: process.env.STRAVA_CLIENT_SECRET,
    refresh_token: process.env.STRAVA_REFRESH_TOKEN,
    grant_type: "refresh_token",
  });
  return response.data.access_token;
}

router.get("/activities", async (req, res) => {
  try {
    const accessToken = await getFreshAccessToken();

    const response = await axios.get(
      "https://www.strava.com/api/v3/athlete/activities",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { per_page: 200 },
      }
    );

    const activities = response.data;

    for (let activity of activities) {
      await Activity.updateOne(
        { stravaId: activity.id },
        {
          stravaId: activity.id,
          name: activity.name,
          type: activity.type,
          distance: activity.distance,
          moving_time: activity.moving_time,
          average_speed: activity.average_speed,
          average_heartrate: activity.average_heartrate,
          average_cadence: activity.average_cadence,
          total_elevation_gain: activity.total_elevation_gain,
          start_date: activity.start_date,
          start_latlng: activity.start_latlng,
          summary_polyline: activity.map?.summary_polyline || null, // ← NEW
        },
        { upsert: true }
      );
    }

    res.json({ message: "Activities stored successfully", count: activities.length });
  } catch (error) {
    console.log("STRAVA ERROR:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch activities" });
  }
});

module.exports = router;