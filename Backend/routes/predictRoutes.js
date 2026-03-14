const express = require("express");
const router = express.Router();
const axios = require("axios");
const Activity = require("../models/Activity");

const FLASK_URL = "http://127.0.0.1:5001";

// ─── WEATHER ──────────────────────────────────────────────────────────────────
async function getWeather(city) {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  const response = await axios.get(
    `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric`
  );
  return {
    temperature: response.data.main.temp,
    humidity: response.data.main.humidity,
    description: response.data.weather[0].description,
    lat: response.data.coord.lat,
    lon: response.data.coord.lon,
  };
}

// ─── ELEVATION ────────────────────────────────────────────────────────────────
async function getElevation(lat, lon) {
  const apiKey = process.env.GOOGLE_ELEVATION_KEY;
  const response = await axios.get(
    `https://maps.googleapis.com/maps/api/elevation/json?locations=${lat},${lon}&key=${apiKey}`
  );
  return response.data.results[0].elevation;
}

// ─── REVERSE GEOCODE ──────────────────────────────────────────────────────────
async function getCityFromCoords(lat, lon) {
  const response = await axios.get(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
    { headers: { "User-Agent": "RunningApp/1.0" } }
  );
  return (
    response.data.address.city ||
    response.data.address.town ||
    response.data.address.village ||
    response.data.address.state
  );
}

// ─── DETECT TRAINING LOCATION ─────────────────────────────────────────────────
function detectTrainingLocation(runs) {
  const locations = {};
  runs.forEach((run) => {
    if (!run.start_latlng || run.start_latlng.length !== 2) return;
    const key = `${run.start_latlng[0].toFixed(2)},${run.start_latlng[1].toFixed(2)}`;
    locations[key] = (locations[key] || 0) + 1;
  });
  let mainLocation = null;
  let maxCount = 0;
  for (const loc in locations) {
    if (locations[loc] > maxCount) {
      maxCount = locations[loc];
      mainLocation = loc;
    }
  }
  return mainLocation;
}

// ─── FORMAT HELPERS ───────────────────────────────────────────────────────────
function formatTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

// ─── BUILD RUNNER FEATURES ────────────────────────────────────────────────────
// trueExperienceMonths is passed in from the main route handler
// where it is calculated from the OLDEST run in the FULL MongoDB database
// not just from the last 50 runs fetched for prediction

function buildRunnerFeatures(runs, trueExperienceMonths) {
  const now = new Date();

  // ── Weekly mileage — last 4 weeks ─────────────────────────────────────────
  const last4weeks = runs.filter(
    (r) => (now - new Date(r.start_date)) / (1000 * 60 * 60 * 24) <= 28
  );
  const totalKm4weeks = last4weeks.reduce((s, r) => s + r.distance / 1000, 0);
  const weekly_mileage_km = totalKm4weeks / 4;

  // ── Runs per week ─────────────────────────────────────────────────────────
  const runs_per_week = last4weeks.length / 4;

  // ── Longest run in last 6 weeks ───────────────────────────────────────────
  const last6weeks = runs.filter(
    (r) => (now - new Date(r.start_date)) / (1000 * 60 * 60 * 24) <= 42
  );
  const long_run_distance_km =
    last6weeks.length > 0
      ? Math.max(...last6weeks.map((r) => r.distance / 1000))
      : 10;

  // ── Speed work — relative to personal average pace ────────────────────────
  const allPaces = runs
    .filter((r) => r.distance >= 3000)
    .map((r) => r.moving_time / (r.distance / 1000));

  const avgPace =
    allPaces.length > 0
      ? allPaces.reduce((a, b) => a + b, 0) / allPaces.length
      : 360;

  const speed_work = last4weeks.filter((r) => {
    const pace = r.moving_time / (r.distance / 1000);
    return pace < avgPace * 0.85;
  }).length;
  const speed_work_sessions = speed_work / 4;

  // ── Training adherence ────────────────────────────────────────────────────
  const training_adherence_pct = Math.min(100, (runs_per_week / 4) * 100);

  // ── Experience ───────────────────────────────────────────────────────────
  // Uses trueExperienceMonths passed from main handler
  // which queries the OLDEST run in the full MongoDB database
  // This is accurate regardless of how many runs are fetched for prediction
  const running_experience_months = trueExperienceMonths;

  console.log(`Experience: ${running_experience_months} months (from oldest run in DB)`);

  // ── Best pace — used for HR estimation and VO2 max ───────────────────────
  const paces = runs
    .filter((r) => r.distance >= 5000)
    .map((r) => r.moving_time / (r.distance / 1000));
  const bestPaceSecPerKm = paces.length > 0 ? Math.min(...paces) : 360;

  // ── THREE-TIER HR BLENDING ────────────────────────────────────────────────
  const hrRuns = runs.filter((r) => r.average_heartrate);
  const hrCoverage = runs.length > 0 ? hrRuns.length / runs.length : 0;

  // Mileage-based HR estimate
  const estimatedHR =
    weekly_mileage_km >= 60 ? 52
    : weekly_mileage_km >= 40 ? 57
    : weekly_mileage_km >= 25 ? 62
    : weekly_mileage_km >= 10 ? 67
    : 72;

  let resting_heart_rate_bpm;
  let hrMode;

  if (hrCoverage >= 0.5) {
    // Tier 1 — majority real data
    resting_heart_rate_bpm = Math.round(
      Math.min(...hrRuns.map((r) => r.average_heartrate))
    );
    hrMode = "real";
    console.log(`HR mode: REAL (${Math.round(hrCoverage * 100)}% runs have HR) → ${resting_heart_rate_bpm}bpm`);

  } else if (hrCoverage >= 0.2) {
    // Tier 2 — partial data, weighted blend
    const realHR = Math.min(...hrRuns.map((r) => r.average_heartrate));
    resting_heart_rate_bpm = Math.round(
      realHR * hrCoverage + estimatedHR * (1 - hrCoverage)
    );
    hrMode = "blended";
    console.log(`HR mode: BLENDED (${Math.round(hrCoverage * 100)}% coverage) real=${realHR} est=${estimatedHR} → ${resting_heart_rate_bpm}bpm`);

  } else {
    // Tier 3 — no HR data, multi-signal estimate
    const paceBasedHR =
      bestPaceSecPerKm <= 240 ? 48
      : bestPaceSecPerKm <= 270 ? 52
      : bestPaceSecPerKm <= 300 ? 56
      : bestPaceSecPerKm <= 330 ? 60
      : bestPaceSecPerKm <= 360 ? 64
      : 68;

    const experienceBonus =
      running_experience_months >= 36 ? -4
      : running_experience_months >= 24 ? -3
      : running_experience_months >= 12 ? -2
      : running_experience_months >= 6  ? -1
      : 0;

    const longRunBonus =
      long_run_distance_km >= 30 ? -3
      : long_run_distance_km >= 25 ? -2
      : long_run_distance_km >= 20 ? -1
      : 0;

    const combinedHR = Math.round(
      (paceBasedHR * 0.50) +
      (estimatedHR * 0.35) +
      ((paceBasedHR + experienceBonus + longRunBonus) * 0.15)
    );

    resting_heart_rate_bpm = Math.max(42, Math.min(80, combinedHR));
    hrMode = "multi-signal";
    console.log(`HR mode: MULTI-SIGNAL pace=${paceBasedHR} mileage=${estimatedHR} exp_bonus=${experienceBonus} longrun_bonus=${longRunBonus} → ${resting_heart_rate_bpm}bpm`);
  }

  // ── VO2 max ───────────────────────────────────────────────────────────────
  const bestSpeedKmH = 3600 / bestPaceSecPerKm;
  const vo2_max = bestSpeedKmH * 3.5;

  // ── Previous race count ───────────────────────────────────────────────────
  const previous_race_count = runs.filter((r) => {
    const name = (r.name || "").toLowerCase();
    return (
      name.includes("race") ||
      name.includes("marathon") ||
      name.includes("half") ||
      name.includes("10k") ||
      name.includes("5k") ||
      name.includes("tmm") ||
      name.includes("half marathon")
    );
  }).length;

  // ── Personal best ─────────────────────────────────────────────────────────
  const raceRuns = runs.filter((r) => r.distance >= 20000);
  const personal_best_minutes =
    raceRuns.length > 0
      ? Math.min(...raceRuns.map((r) => r.moving_time / 60))
      : null;

  // ── Average cadence ───────────────────────────────────────────────────────
  const cadenceRuns = runs.filter((r) => r.average_cadence);
  const avg_cadence =
    cadenceRuns.length > 0
      ? cadenceRuns.reduce((s, r) => s + r.average_cadence, 0) / cadenceRuns.length
      : null;

  return {
    weekly_mileage_km:         parseFloat(weekly_mileage_km.toFixed(1)),
    runs_per_week:             parseFloat(runs_per_week.toFixed(1)),
    long_run_distance_km:      parseFloat(long_run_distance_km.toFixed(1)),
    speed_work_sessions:       parseFloat(speed_work_sessions.toFixed(1)),
    training_adherence_pct:    parseFloat(training_adherence_pct.toFixed(1)),
    running_experience_months,
    resting_heart_rate_bpm:    Math.round(resting_heart_rate_bpm),
    vo2_max:                   parseFloat(vo2_max.toFixed(1)),
    previous_race_count,
    personal_best_minutes,
    avg_cadence:               avg_cadence ? parseFloat(avg_cadence.toFixed(1)) : null,
    hrMode,
    hrCoveragePct:             Math.round(hrCoverage * 100),
  };
}

// ─── MATH FALLBACK ────────────────────────────────────────────────────────────
function mathFallbackPredict(runs, weather, elevation) {
  const weightedPaces = [];
  runs.forEach((run) => {
    const distanceKm = run.distance / 1000;
    if (distanceKm < 5 || distanceKm > 50) return;
    if (run.average_heartrate && run.average_heartrate < 140) return;
    const pace = run.moving_time / distanceKm;
    let weight = 1;
    const name = (run.name || "").toLowerCase();
    if (
      name.includes("race") || name.includes("marathon") ||
      name.includes("half") || name.includes("10k") || name.includes("5k")
    ) weight = 3;
    if (distanceKm >= 8 && pace < 330) weight = 2;
    for (let i = 0; i < weight; i++) weightedPaces.push(pace);
  });

  if (weightedPaces.length === 0) return null;

  weightedPaces.sort((a, b) => a - b);
  const topRuns = weightedPaces.slice(0, Math.ceil(weightedPaces.length * 0.25));
  const thresholdPace = topRuns.reduce((a, b) => a + b, 0) / topRuns.length;

  const heatPenalty      = Math.max(0, (weather.temperature - 15)) * 0.003;
  const humidityPenalty  = Math.max(0, (weather.humidity - 60)) * 0.0015;
  const elevationPenalty = elevation * 0.00002;
  const raceBoost        = 0.02;
  const adjustment       = 1 + heatPenalty + humidityPenalty + elevationPenalty - raceBoost;

  const distances = {
    "5K":            { km: 5,    factor: 0.97 },
    "10K":           { km: 10,   factor: 1.00 },
    "Half Marathon": { km: 21.1, factor: 1.03 },
    "Marathon":      { km: 42.2, factor: 1.06 },
  };

  const predictions = {};
  for (const race in distances) {
    const racePace        = thresholdPace * distances[race].factor * adjustment;
    const raceTimeSeconds = racePace * distances[race].km;
    predictions[race] = {
      pace:       `${(racePace / 60).toFixed(2)} min/km`,
      time:       formatTime(raceTimeSeconds),
      distanceKm: distances[race].km,
    };
  }
  return predictions;
}

// ─── MAIN PREDICTION ROUTE ────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const { city, is_big_race = false, age = 28, gender = "Male" } = req.body;

    const now = new Date();

    // ── Fetch last 50 runs for feature calculation ────────────────────────
    const runs = await Activity.find().sort({ start_date: -1 }).limit(50);
    if (runs.length === 0) {
      return res.status(400).json({ error: "No runs found. Sync Strava first." });
    }

    // ── Fetch TRUE experience from oldest run in FULL database ────────────
    // This is separate from the 50 runs above
    // Queries the entire MongoDB collection to find the very first run
    const oldestRun = await Activity.findOne().sort({ start_date: 1 });
    const firstRunDate = oldestRun
      ? new Date(oldestRun.start_date)
      : new Date(Math.min(...runs.map((r) => new Date(r.start_date))));

    const trueExperienceMonths = Math.floor(
      (now - firstRunDate) / (1000 * 60 * 60 * 24 * 30)
    );

    console.log(`True experience: ${trueExperienceMonths} months (oldest run: ${firstRunDate.toDateString()})`);

    // ── Detect training city ──────────────────────────────────────────────
    const location = detectTrainingLocation(runs);
    let trainingCity = null;
    let trainingWeather = null;

    if (location) {
      const [lat, lon] = location.split(",");
      try {
        trainingCity    = await getCityFromCoords(lat, lon);
        trainingWeather = await getWeather(trainingCity);
      } catch (e) {
        console.log("Could not get training city weather:", e.message);
      }
    }

    // ── Select weather source ─────────────────────────────────────────────
    let weather;
    let raceCity;
    if (city) {
      weather  = await getWeather(city);
      raceCity = city;
    } else {
      if (!trainingWeather) {
        return res.status(400).json({
          error: "Could not detect training location. Please provide a city.",
        });
      }
      weather  = trainingWeather;
      raceCity = trainingCity;
    }

    const elevation = await getElevation(weather.lat, weather.lon);

    // ── Build runner features ─────────────────────────────────────────────
    // Pass trueExperienceMonths so function uses full DB oldest run
    const runnerFeatures = buildRunnerFeatures(runs, trueExperienceMonths);

    // Separate meta fields — not sent to Flask
    const { hrMode, hrCoveragePct, avg_cadence, ...flaskFeatures } = runnerFeatures;

    // ── Try ML first ──────────────────────────────────────────────────────
    let mlPredictions  = null;
    let predictionEngine = "math";

    try {
      await axios.get(`${FLASK_URL}/health`, { timeout: 2000 });

      const distances     = [5, 10, 21.1, 42.2];
      const distanceNames = ["5K", "10K", "Half Marathon", "Marathon"];
      mlPredictions = {};

      for (let i = 0; i < distances.length; i++) {
        const flaskResponse = await axios.post(
          `${FLASK_URL}/ml-predict`,
          {
            ...flaskFeatures,
            // Fix field name mismatches between Node and Flask model
            previous_marathon_count:      flaskFeatures.previous_race_count,
            speed_work_sessions_per_week: flaskFeatures.speed_work_sessions,
            temperature:                  weather.temperature,
            humidity:                     weather.humidity,
            elevation:                    elevation,
            is_big_race:                  is_big_race,
            target_distance_km:           distances[i],
            age,
            gender,
          },
          { timeout: 5000 }
        );

        const pred = flaskResponse.data.prediction;
        const adj  = flaskResponse.data.adjustments;

        mlPredictions[distanceNames[i]] = {
          pace:        pred.pace,
          time:        pred.finish_time,
          distanceKm:  distances[i],
          adjustments: adj,
        };
      }

      predictionEngine = "ml";
      console.log("✅ ML prediction used");

    } catch (flaskError) {
      console.log("⚠️ Flask ML unavailable, using math fallback:", flaskError.message);
    }

    // ── Use math fallback if ML failed ────────────────────────────────────
    const predictions =
      mlPredictions || mathFallbackPredict(runs, weather, elevation);

    if (!predictions) {
      return res.status(400).json({
        error: "Not enough quality runs for prediction.",
      });
    }

    // ── Send response ─────────────────────────────────────────────────────
    res.json({
      predictionEngine,
      predictionMode: city ? "race_prediction" : "instant_prediction",
      trainingCity,
      raceCity,
      weather: {
        temperature: weather.temperature,
        humidity:    weather.humidity,
        description: weather.description,
      },
      elevation:    Math.round(elevation),
      is_big_race,
      runnerProfile: {
        ...flaskFeatures,
        hrMode,
        hrCoveragePct,
        avg_cadence,
        trueExperienceMonths,
        oldestRunDate: firstRunDate.toDateString(),
      },
      predictions,
    });

  } catch (error) {
    console.log("Prediction error:", error.message);
    res.status(500).json({ error: "Prediction failed." });
  }
});

module.exports = router;