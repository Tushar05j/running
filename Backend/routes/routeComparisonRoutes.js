const express = require("express");
const router = express.Router();
const Activity = require("../models/Activity");

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatPace(secondsPerKm) {
  const min = Math.floor(secondsPerKm / 60);
  const sec = Math.round(secondsPerKm % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

function clusterRunsByGPS(runs, radiusKm = 0.5) {
  const clusters = [];
  runs.forEach((run) => {
    if (!run.start_latlng || run.start_latlng.length !== 2) return;
    const [lat, lon] = run.start_latlng;
    let placed = false;
    for (const cluster of clusters) {
      const dist = haversineKm(lat, lon, cluster.centerLat, cluster.centerLon);
      if (dist <= radiusKm) {
        cluster.runs.push(run);
        cluster.centerLat =
          cluster.runs.reduce((s, r) => s + r.start_latlng[0], 0) / cluster.runs.length;
        cluster.centerLon =
          cluster.runs.reduce((s, r) => s + r.start_latlng[1], 0) / cluster.runs.length;
        placed = true;
        break;
      }
    }
    if (!placed) {
      clusters.push({ centerLat: lat, centerLon: lon, runs: [run] });
    }
  });
  return clusters;
}

// GET /api/routes
router.get("/", async (req, res) => {
  try {
    const activities = await Activity.find({
      start_latlng: { $ne: null, $exists: true },
    }).sort({ start_date: 1 });

    const validRuns = activities.filter(
      (r) => r.start_latlng && r.start_latlng.length === 2
    );

    if (validRuns.length === 0) return res.json({ routes: [] });

    const clusters = clusterRunsByGPS(validRuns, 0.5);

    const routes = clusters
      .filter((c) => c.runs.length >= 2)
      .sort((a, b) => b.runs.length - a.runs.length)
      .map((cluster, idx) => {
        const runs = cluster.runs;
        const distances = runs.map((r) => r.distance / 1000);
        const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
        const paces = runs.map((r) => r.moving_time / (r.distance / 1000));
        const avgPaceSeconds = paces.reduce((a, b) => a + b, 0) / paces.length;
        const bestPaceSeconds = Math.min(...paces);
        const dates = runs.map((r) => new Date(r.start_date));
        const firstRun = new Date(Math.min(...dates));
        const lastRun = new Date(Math.max(...dates));
        const hasHR = runs.filter((r) => r.average_heartrate).length;
        const hasCadence = runs.filter((r) => r.average_cadence).length;
        const sortedByDate = [...runs].sort(
          (a, b) => new Date(a.start_date) - new Date(b.start_date)
        );
        const firstPaces = sortedByDate.slice(0, 3).map((r) => r.moving_time / (r.distance / 1000));
        const lastPaces = sortedByDate.slice(-3).map((r) => r.moving_time / (r.distance / 1000));
        const firstAvg = firstPaces.reduce((a, b) => a + b, 0) / firstPaces.length;
        const lastAvg = lastPaces.reduce((a, b) => a + b, 0) / lastPaces.length;
        const improvementPct = (((firstAvg - lastAvg) / firstAvg) * 100).toFixed(1);

        return {
          routeId: idx + 1,
          centerLat: parseFloat(cluster.centerLat.toFixed(5)),
          centerLon: parseFloat(cluster.centerLon.toFixed(5)),
          totalRuns: runs.length,
          avgDistanceKm: avgDistance.toFixed(2),
          minDistanceKm: Math.min(...distances).toFixed(2),
          maxDistanceKm: Math.max(...distances).toFixed(2),
          avgPace: formatPace(avgPaceSeconds),
          bestPace: formatPace(bestPaceSeconds),
          firstRunDate: firstRun.toISOString(),
          lastRunDate: lastRun.toISOString(),
          improvementPct: parseFloat(improvementPct),
          hasHRData: hasHR > 0,
          hasCadenceData: hasCadence > 0,
          hrRunCount: hasHR,
          cadenceRunCount: hasCadence,
        };
      });

    res.json({ routes, totalClusters: routes.length });
  } catch (error) {
    console.log("Route list error:", error);
    res.status(500).json({ error: "Failed to load routes" });
  }
});

// GET /api/routes/:routeId
router.get("/:routeId", async (req, res) => {
  try {
    const routeId = parseInt(req.params.routeId);
    if (isNaN(routeId) || routeId < 1) {
      return res.status(400).json({ error: "Invalid route ID" });
    }

    const activities = await Activity.find({
      start_latlng: { $ne: null, $exists: true },
    }).sort({ start_date: 1 });

    const validRuns = activities.filter(
      (r) => r.start_latlng && r.start_latlng.length === 2
    );

    if (validRuns.length === 0) return res.status(404).json({ error: "No GPS runs found" });

    const clusters = clusterRunsByGPS(validRuns, 0.5);
    const meaningfulClusters = clusters
      .filter((c) => c.runs.length >= 2)
      .sort((a, b) => b.runs.length - a.runs.length);

    if (routeId > meaningfulClusters.length) {
      return res.status(404).json({ error: "Route not found" });
    }

    const cluster = meaningfulClusters[routeId - 1];
    const sortedRuns = [...cluster.runs].sort(
      (a, b) => new Date(a.start_date) - new Date(b.start_date)
    );

    // Pick the most recent run that has a polyline as the representative route
    const representativePolyline =
      [...sortedRuns].reverse().find((r) => r.summary_polyline)?.summary_polyline || null;

    const runs = sortedRuns.map((run, idx) => {
      const distanceKm = run.distance / 1000;
      const paceSeconds = run.moving_time / distanceKm;
      return {
        index: idx + 1,
        runId: run.stravaId || idx + 1,
        name: run.name || `Run ${idx + 1}`,
        date: run.start_date,
        dateFormatted: new Date(run.start_date).toLocaleDateString("en-US", {
          month: "short", day: "numeric", year: "numeric",
        }),
        dateShort: new Date(run.start_date).toLocaleDateString("en-US", {
          month: "short", day: "numeric",
        }),
        distanceKm: parseFloat(distanceKm.toFixed(2)),
        paceSeconds: parseFloat(paceSeconds.toFixed(1)),
        paceFormatted: formatPace(paceSeconds),
        paceDecimal: parseFloat((paceSeconds / 60).toFixed(3)),
        duration: formatDuration(run.moving_time),
        movingTimeSeconds: run.moving_time,
        heartrate: run.average_heartrate || null,
        cadence: run.average_cadence || null,
        elevation: run.total_elevation_gain || null,
        type: run.type || "Run",
      };
    });

    const paces = runs.map((r) => r.paceDecimal);
    const avgPace = paces.reduce((a, b) => a + b, 0) / paces.length;
    const bestPace = Math.min(...paces);
    const worstPace = Math.max(...paces);
    const distances = runs.map((r) => r.distanceKm);
    const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
    const hrRuns = runs.filter((r) => r.heartrate !== null);
    const avgHR = hrRuns.length > 0
      ? hrRuns.reduce((s, r) => s + r.heartrate, 0) / hrRuns.length : null;
    const cadenceRuns = runs.filter((r) => r.cadence !== null);
    const avgCadence = cadenceRuns.length > 0
      ? cadenceRuns.reduce((s, r) => s + r.cadence, 0) / cadenceRuns.length : null;

    const n = paces.length;
    const xMean = (n + 1) / 2;
    const yMean = avgPace;
    let num = 0, den = 0;
    paces.forEach((p, i) => {
      num += (i + 1 - xMean) * (p - yMean);
      den += Math.pow(i + 1 - xMean, 2);
    });
    const slope = den !== 0 ? num / den : 0;
    let trendLabel = "Stable";
    if (slope < -0.01) trendLabel = "Improving 📈";
    else if (slope > 0.01) trendLabel = "Slowing down";

    res.json({
      routeId,
      centerLat: parseFloat(cluster.centerLat.toFixed(5)),
      centerLon: parseFloat(cluster.centerLon.toFixed(5)),
      representativePolyline, // ← NEW: encoded polyline of most recent run
      totalRuns: runs.length,
      summary: {
        avgPace: formatPace(avgPace * 60),
        bestPace: formatPace(bestPace * 60),
        worstPace: formatPace(worstPace * 60),
        avgDistanceKm: avgDistance.toFixed(2),
        avgHR: avgHR ? Math.round(avgHR) : null,
        avgCadence: avgCadence ? avgCadence.toFixed(1) : null,
        trend: trendLabel,
        paceSlope: parseFloat(slope.toFixed(4)),
      },
      runs,
    });
  } catch (error) {
    console.log("Route detail error:", error);
    res.status(500).json({ error: "Failed to load route detail" });
  }
});

module.exports = router;