const express  = require("express");
const router   = express.Router();
const axios    = require("axios");
const Activity = require("../models/Activity");

async function getFreshAccessToken() {
  const response = await axios.post("https://www.strava.com/oauth/token", {
    client_id:     process.env.STRAVA_CLIENT_ID,
    client_secret: process.env.STRAVA_CLIENT_SECRET,
    refresh_token: process.env.STRAVA_REFRESH_TOKEN,
    grant_type:    "refresh_token",
  });
  return response.data.access_token;
}

// SYNC ACTIVITIES
router.get("/activities", async (req, res) => {
  try {
    const accessToken = await getFreshAccessToken();

    const response = await axios.get(
      "https://www.strava.com/api/v3/athlete/activities",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params:  { per_page: 200 },
      }
    );

    const activities = response.data;

    for (let activity of activities) {
      await Activity.updateOne(
        { stravaId: activity.id },
        {
          stravaId:              activity.id,
          name:                  activity.name,
          type:                  activity.type,
          distance:              activity.distance,
          moving_time:           activity.moving_time,
          average_speed:         activity.average_speed,
          average_heartrate:     activity.average_heartrate,
          average_cadence:       activity.average_cadence,
          total_elevation_gain:  activity.total_elevation_gain,
          start_date:            activity.start_date,
          start_latlng:          activity.start_latlng,
          summary_polyline:      activity.map?.summary_polyline || null,
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

// LOGOUT — clears all activities from MongoDB
// This effectively logs the user out since the app checks totalRuns > 0
router.post("/logout", async (req, res) => {
  try {
    // Step 1: Revoke Strava access token so the old token stops working
    try {
      const accessToken = await getFreshAccessToken();
      await axios.post(
        "https://www.strava.com/oauth/deauthorize",
        {},
        { params: { access_token: accessToken } }
      );
      console.log("Strava token revoked successfully");
    } catch (stravaErr) {
      // Non-fatal — continue with local logout even if Strava revoke fails
      console.log("Strava revoke failed (non-fatal):", stravaErr.message);
    }

    // Step 2: Clear all activities from MongoDB
    const result = await Activity.deleteMany({});
    console.log(`Logout: cleared ${result.deletedCount} activities from DB`);

    res.json({
      success: true,
      message: `Logged out. Cleared ${result.deletedCount} activities.`
    });
  } catch (error) {
    console.log("Logout error:", error.message);
    res.status(500).json({ error: "Logout failed" });
  }
});

module.exports = router;