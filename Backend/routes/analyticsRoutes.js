const express  = require("express");
const router   = express.Router();
const axios    = require("axios");
const Activity = require("../models/Activity");

const ML_SERVICE = "http://localhost:5001";

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
router.get("/dashboard", async (req, res) => {
  try {
    const activities = await Activity.find();
    const totalRuns  = activities.length;

    let totalDistance = 0;
    let longestRun    = 0;
    let totalTime     = 0;

    activities.forEach(run => {
      totalDistance += run.distance;
      totalTime     += run.moving_time;
      if (run.distance > longestRun) longestRun = run.distance;
    });

    const totalKm      = (totalDistance / 1000).toFixed(2);
    const longestRunKm = (longestRun / 1000).toFixed(2);

    const avgPaceSeconds = totalTime / (totalDistance / 1000);
    const paceMinutes    = Math.floor(avgPaceSeconds / 60);
    const paceSeconds    = Math.round(avgPaceSeconds % 60);
    const avgPace        = `${paceMinutes}:${paceSeconds.toString().padStart(2,"0")}/km`;

    res.json({ totalRuns, totalKm, longestRunKm, avgPace });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Dashboard error" });
  }
});

// ─── WEEKLY MILEAGE ───────────────────────────────────────────────────────────
router.get("/weekly-mileage", async (req, res) => {
  try {
    const activities  = await Activity.find();
    const weeklyData  = {};

    activities.forEach(run => {
      const date      = new Date(run.start_date);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      const weekKey   = weekStart.toISOString().split("T")[0];

      if (!weeklyData[weekKey]) weeklyData[weekKey] = 0;
      weeklyData[weekKey] += run.distance;
    });

    const result = Object.keys(weeklyData)
      .map(week => ({ week, distance: (weeklyData[week] / 1000).toFixed(2) }))
      .sort((a, b) => new Date(a.week) - new Date(b.week));

    res.json(result);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Weekly mileage error" });
  }
});

// ─── PACE TREND ───────────────────────────────────────────────────────────────
router.get("/pace-trend", async (req, res) => {
  try {
    const activities = await Activity.find({
      $or: [
        { type: { $in: ["Run", "VirtualRun"] } },
        { type: { $exists: false } }
      ]
    }).sort({ start_date: 1 });

    const result = activities.map(run => {
      const distanceKm  = run.distance / 1000;
      const paceSeconds = run.moving_time / distanceKm;
      return {
        date: run.start_date,
        pace: parseFloat((paceSeconds / 60).toFixed(2))
      };
    });

    res.json(result);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Pace trend error" });
  }
});

// ─── TRAINING LOAD ────────────────────────────────────────────────────────────
router.get("/training-load", async (req, res) => {
  try {
    const activities = await Activity.find();
    const today      = new Date();

    let acuteLoad   = 0;
    let chronicLoad = 0;

    activities.forEach(run => {
      const diffDays  = (today - new Date(run.start_date)) / (1000 * 60 * 60 * 24);
      const distanceKm = run.distance / 1000;
      if (diffDays <= 7)  acuteLoad   += distanceKm;
      if (diffDays <= 28) chronicLoad += distanceKm;
    });

    const acwr   = chronicLoad === 0 ? 0 : (acuteLoad / chronicLoad).toFixed(2);
    let   status = "Optimal";
    if (acwr < 0.8) status = "Undertraining";
    if (acwr > 1.5) status = "High Injury Risk";

    res.json({
      acuteLoad:   acuteLoad.toFixed(2),
      chronicLoad: chronicLoad.toFixed(2),
      acwr,
      status
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Training load error" });
  }
});

// ─── EFFICIENCY ───────────────────────────────────────────────────────────────
// Uses the SAME 3-tier HR blending as predictRoutes.js buildRunnerFeatures()
// Primary: ML service at /efficiency-score
// Fallback: formula using the same blended HR + pace values
router.get("/efficiency", async (req, res) => {
  try {

    // ── Step 1: Fetch last 50 runs (same as prediction) ──────────────────────
    const runs = await Activity.find().sort({ start_date: -1 }).limit(50);

    if (runs.length === 0) {
      return res.json({
        mode:            "NO_DATA",
        efficiencyScore: 0,
        label:           "No data",
        tip:             "Sync your Strava runs to calculate efficiency.",
        suggestion:      "Not enough running data",
        trend:           "Unknown",
        engine:          "none",
      });
    }

    // ── Step 2: Filter valid runs for pace (3–20km) ───────────────────────────
    const validRuns = runs.filter(r => {
      const km = r.distance / 1000;
      return km >= 3 && km <= 20;
    });

    if (validRuns.length < 2) {
      return res.json({
        mode:            "NO_DATA",
        efficiencyScore: 0,
        label:           "Not enough data",
        tip:             "Need at least 2 runs between 3–20km.",
        suggestion:      "Keep running and sync Strava",
        trend:           "Unknown",
        engine:          "none",
      });
    }

    // ── Step 3: Pace values array (min/km) ───────────────────────────────────
    const paceValues = validRuns.map(r => {
      const km = r.distance / 1000;
      return parseFloat((r.moving_time / km / 60).toFixed(3));
    });

    // ── Step 4: Training metrics (same calc as prediction) ───────────────────
    const now = new Date();

    const last4weeks = runs.filter(
      r => (now - new Date(r.start_date)) / (1000 * 60 * 60 * 24) <= 28
    );
    const last6weeks = runs.filter(
      r => (now - new Date(r.start_date)) / (1000 * 60 * 60 * 24) <= 42
    );

    const weekly_mileage_km   = last4weeks.reduce((s, r) => s + r.distance / 1000, 0) / 4;
    const runs_per_week       = last4weeks.length / 4;
    const long_run_distance_km = last6weeks.length > 0
      ? Math.max(...last6weeks.map(r => r.distance / 1000))
      : 10;
    const training_adherence_pct = Math.min(100, (runs_per_week / 4) * 100);

    // ── Step 5: Experience from oldest run (same as prediction) ──────────────
    const oldestRun = await Activity.findOne().sort({ start_date: 1 });
    const firstRunDate = oldestRun ? new Date(oldestRun.start_date) : now;
    const running_experience_months = Math.floor(
      (now - firstRunDate) / (1000 * 60 * 60 * 24 * 30)
    );

    // ── Step 6: Best pace (for HR and VO2 estimation) ────────────────────────
    const allPaces = runs
      .filter(r => r.distance >= 5000)
      .map(r => r.moving_time / (r.distance / 1000));
    const bestPaceSecPerKm = allPaces.length > 0 ? Math.min(...allPaces) : 360;

    // ── Step 7: EXACT same 3-tier HR blending as predictRoutes.js ────────────
    const hrRuns     = runs.filter(r => r.average_heartrate);
    const hrCoverage = runs.length > 0 ? hrRuns.length / runs.length : 0;

    // Mileage-based HR estimate (Tier 3 base)
    const estimatedHR =
      weekly_mileage_km >= 60 ? 52
      : weekly_mileage_km >= 40 ? 57
      : weekly_mileage_km >= 25 ? 62
      : weekly_mileage_km >= 10 ? 67
      : 72;

    let resting_heart_rate_bpm;
    let hrMode;

    if (hrCoverage >= 0.5) {
      // Tier 1 — majority real HR data
      resting_heart_rate_bpm = Math.round(
        Math.min(...hrRuns.map(r => r.average_heartrate))
      );
      hrMode = "real";

    } else if (hrCoverage >= 0.2) {
      // Tier 2 — partial data, weighted blend
      const realHR = Math.min(...hrRuns.map(r => r.average_heartrate));
      resting_heart_rate_bpm = Math.round(
        realHR * hrCoverage + estimatedHR * (1 - hrCoverage)
      );
      hrMode = "blended";

    } else {
      // Tier 3 — no HR data, multi-signal estimate from pace + mileage + experience
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
    }

    // ── Step 8: VO2 max (same formula as prediction) ─────────────────────────
    const bestSpeedKmH = 3600 / bestPaceSecPerKm;
    const vo2_max      = parseFloat((bestSpeedKmH * 3.5).toFixed(1));

    // Speed work sessions (same logic as prediction)
    const avgPaceAll = allPaces.length > 0
      ? allPaces.reduce((a, b) => a + b, 0) / allPaces.length : 360;
    const speed_work_sessions = last4weeks.filter(r => {
      const p = r.moving_time / (r.distance / 1000);
      return p < avgPaceAll * 0.85;
    }).length / 4;

    console.log(`Efficiency HR mode: ${hrMode} (${Math.round(hrCoverage * 100)}% coverage) → ${resting_heart_rate_bpm}bpm | VO2: ${vo2_max}`);

    // ── Step 9: Try ML service ────────────────────────────────────────────────
    try {
      const mlResponse = await axios.post(
        `${ML_SERVICE}/efficiency-score`,
        {
          pace_values:               paceValues,
          resting_heart_rate_bpm,            // always a real number now (never null)
          vo2_max,                           // always estimated (never null)
          training_adherence_pct,
          weekly_mileage_km:         parseFloat(weekly_mileage_km.toFixed(1)),
          runs_per_week:             parseFloat(runs_per_week.toFixed(1)),
          long_run_distance_km:      parseFloat(long_run_distance_km.toFixed(1)),
          speed_work_sessions:       parseFloat(speed_work_sessions.toFixed(1)),
          running_experience_months,
          age:                       30,
          gender:                    "Male",
        },
        { timeout: 5000 }
      );

      if (mlResponse.data.success) {
        return res.json({
          ...mlResponse.data,
          hrMode,
          hrCoveragePct: Math.round(hrCoverage * 100),
        });
      }
    } catch (mlError) {
      console.log("⚠️  ML efficiency unavailable, using formula fallback:", mlError.message);
    }

    // ── Step 10: Formula fallback — uses same blended HR + pace ──────────────
    const avg      = paceValues.reduce((a, b) => a + b, 0) / paceValues.length;
    const variance = paceValues.reduce((s, p) => s + Math.pow(p - avg, 2), 0) / paceValues.length;
    const std      = Math.sqrt(variance);

    // 1. Pace consistency  (30 pts) — lower std = better
    const consistencyPts = Math.max(0, 30 - std * 20);
    // 2. Pace quality      (25 pts) — 4:00/km = 25pts, 8:00/km = 0pts
    const qualityPts     = Math.max(0, Math.min(25, 25 - (avg - 4.0) * 6.25));
    // 3. HR efficiency     (25 pts) — same formula as prediction's HR logic
    const hrPts          = Math.max(0, Math.min(25, 25 - (resting_heart_rate_bpm - 40) * 0.625));
    // 4. VO2 bonus         (10 pts) — higher VO2 = more efficient
    const vo2Pts         = Math.max(0, Math.min(10, (vo2_max - 30) * 0.4));
    // 5. Adherence         (10 pts)
    const adherencePts   = (training_adherence_pct / 100) * 10;

    const score = Math.round(
      Math.min(100, Math.max(0, consistencyPts + qualityPts + hrPts + vo2Pts + adherencePts))
    );

    const getLabel = s => s >= 85 ? "Excellent form" : s >= 70 ? "Good form" : s >= 50 ? "Fair form" : "Needs work";
    const getTip   = s => s >= 85
      ? "Outstanding! Maintain your current training rhythm."
      : s >= 70
      ? "Try adding one tempo run per week to push your score above 85."
      : s >= 50
      ? "Focus on running at an even effort — avoid starting too fast."
      : "Start with short, easy runs to build a consistent pace base.";

    return res.json({
      efficiencyScore: score,
      mode:            "PACE_MODE",
      label:           getLabel(score),
      tip:             getTip(score),
      suggestion:      hrMode === "real"
        ? "Score uses your real heart rate data."
        : hrMode === "blended"
        ? "Score uses partial HR data blended with pace estimate."
        : "No HR data — score estimated from pace, mileage and experience.",
      trend:           std < 0.4 ? "Consistent" : "Variable",
      engine:          "formula fallback",
      hrMode,
      hrCoveragePct:   Math.round(hrCoverage * 100),
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Efficiency calculation error" });
  }
});

// ─── RECENT RUNS ──────────────────────────────────────────────────────────────
router.get("/recent-runs", async (req, res) => {
  try {
    const limit      = parseInt(req.query.limit) || 10;
    const activities = await Activity.find()
      .sort({ start_date: -1 })
      .limit(limit);

    const result = activities.map(run => {
      const distanceKm  = run.distance / 1000;
      const paceSeconds = run.moving_time / distanceKm;
      const paceMin     = Math.floor(paceSeconds / 60);
      const paceSec     = Math.round(paceSeconds % 60).toString().padStart(2, "0");
      const h = Math.floor(run.moving_time / 3600);
      const m = Math.floor((run.moving_time % 3600) / 60).toString().padStart(2, "0");
      const s = Math.floor(run.moving_time % 60).toString().padStart(2, "0");
      const duration = h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;

      return {
        name:        run.name,
        date:        run.start_date,
        distanceKm:  distanceKm.toFixed(2),
        pace:        `${paceMin}:${paceSec}/km`,
        duration,
        heartrate:   run.average_heartrate || null,
        cadence:     run.average_cadence   || null,
        elevation:   run.total_elevation_gain || 0,
        type:        run.type
      };
    });

    res.json(result);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Recent runs error" });
  }
});

module.exports = router;