"""
predict_service.py
Flask microservice — serves both race predictions AND efficiency scoring.

Endpoints:
  POST /ml-predict          → race time prediction (existing)
  POST /efficiency-score    → running efficiency score (new)
  GET  /health              → health check

Run with: python predict_service.py
Runs on:  http://localhost:5001
"""

import pickle
import math
import os
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# ─── LOAD RACE PREDICTION MODEL ───────────────────────────────────────────────
print("Loading race prediction model...")
with open("model.pkl", "rb") as f:
    saved = pickle.load(f)

model          = saved["model"]
label_encoders = saved["label_encoders"]
FEATURES       = saved["features"]
pb_medians     = saved["pb_medians"]
print(f"✅ Race model loaded. Features: {FEATURES}")

# ─── LOAD EFFICIENCY MODEL (optional — falls back gracefully) ─────────────────
eff_model          = None
eff_label_encoders = None
EFF_FEATURES       = None
eff_fill_medians   = None

if os.path.exists("efficiency_model.pkl"):
    print("Loading efficiency model...")
    with open("efficiency_model.pkl", "rb") as f:
        eff_saved = pickle.load(f)
    eff_model          = eff_saved["model"]
    eff_label_encoders = eff_saved["label_encoders"]
    EFF_FEATURES       = eff_saved["features"]
    eff_fill_medians   = eff_saved["fill_medians"]
    print(f"✅ Efficiency model loaded.")
else:
    print("⚠️  efficiency_model.pkl not found — /efficiency-score will use formula fallback")

# ═══════════════════════════════════════════════════════════════════════════════
# RACE PREDICTION HELPERS (unchanged)
# ═══════════════════════════════════════════════════════════════════════════════

def calculate_heat_index(temp_c, humidity_pct):
    if temp_c < 10:
        return temp_c
    hi = (temp_c +
          (0.33 * (humidity_pct / 100) *
           6.105 * math.exp(17.27 * temp_c / (237.7 + temp_c))) - 4.0)
    return hi

def weather_penalty_multiplier(temp_c, humidity_pct):
    heat_index = calculate_heat_index(temp_c, humidity_pct)
    if heat_index <= 10:
        return 1.0 + max(0, (10 - heat_index)) * 0.002
    elif heat_index <= 15:
        return 1.0
    elif heat_index <= 20:
        return 1.0 + (heat_index - 15) * 0.004
    elif heat_index <= 25:
        return 1.02 + (heat_index - 20) * 0.006
    elif heat_index <= 30:
        return 1.05 + (heat_index - 25) * 0.008
    elif heat_index <= 35:
        return 1.09 + (heat_index - 30) * 0.010
    else:
        return 1.14 + (heat_index - 35) * 0.012

def elevation_penalty_multiplier(elevation_m):
    if elevation_m <= 0:
        return 1.0
    return round(1.0 + (elevation_m / 1000) * 0.03, 4)

def crowd_boost_multiplier(is_big_race, weekly_mileage_km):
    if not is_big_race:
        return 1.0
    if weekly_mileage_km >= 70:
        return 0.99
    elif weekly_mileage_km >= 50:
        return 0.98
    elif weekly_mileage_km >= 30:
        return 0.97
    return 0.96

def get_distance_factor(target_distance_km):
    factors = { 5: 0.108, 10: 0.225, 21.1: 0.478, 42.2: 1.000 }
    closest = min(factors.keys(), key=lambda k: abs(k - target_distance_km))
    return factors[closest]

def temp_to_weather_category(temp_c):
    if temp_c <= 5:   return "Cold"
    if temp_c <= 15:  return "Cloudy"
    if temp_c <= 22:  return "Sunny"
    if temp_c <= 28:  return "Rainy"
    return "Hot"

def elevation_to_course_difficulty(elevation_m):
    if elevation_m <= 100: return "Flat"
    if elevation_m <= 500: return "Mixed"
    return "Hilly"

def encode_feature(col, value, encoders=None):
    if encoders is None:
        encoders = label_encoders
    le = encoders.get(col)
    if le is None:
        return 0
    if value not in le.classes_:
        value = le.classes_[0]
    return int(le.transform([value])[0])

def get_training_program(weekly_mileage_km, running_experience_months):
    if weekly_mileage_km >= 60 or running_experience_months >= 36:
        return "Advanced"
    elif weekly_mileage_km >= 30 or running_experience_months >= 12:
        return "Intermediate"
    return "Beginner"

def format_time(total_minutes):
    h = int(total_minutes // 60)
    m = int(total_minutes % 60)
    s = int((total_minutes * 60) % 60)
    if h > 0:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"

def format_pace(total_minutes, distance_km):
    pace_min_per_km = total_minutes / distance_km
    m = int(pace_min_per_km)
    s = int((pace_min_per_km - m) * 60)
    return f"{m}:{s:02d}/km"

# ═══════════════════════════════════════════════════════════════════════════════
# EFFICIENCY HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def formula_efficiency_score(pace_std, avg_pace_min, resting_hr=None, vo2_max=None,
                              adherence=None, recovery=None):
    """
    Formula fallback — same logic as analyticsRoutes.js but improved.
    Used when ML model is not loaded or fails.

    pace_std      = standard deviation of pace (min/km) across recent runs
    avg_pace_min  = average pace in min/km
    """
    score = 0.0

    # 1. Pace consistency (40 pts) — lower std = more consistent
    pace_pts = max(0, 40 - pace_std * 20)
    score += pace_pts

    # 2. Pace quality (20 pts) — faster avg pace = more efficient runner
    # 4:00/km = 20pts, 8:00/km = 0pts
    pace_pts2 = max(0, 20 - (avg_pace_min - 4.0) * 5)
    score += min(20, pace_pts2)

    # 3. HR efficiency (20 pts) — if available
    if resting_hr and vo2_max:
        hr_pts  = max(0, 20 - (resting_hr - 40) * 0.5)
        score  += min(20, hr_pts)
    else:
        score += 10  # neutral

    # 4. Adherence (10 pts)
    if adherence:
        score += (adherence / 100) * 10
    else:
        score += 5

    # 5. Recovery (10 pts)
    if recovery:
        score += min(10, (recovery / 10) * 10)
    else:
        score += 5

    return round(min(100, max(0, score)), 1)


def get_efficiency_label(score):
    if score >= 85: return "Excellent form"
    if score >= 70: return "Good form"
    if score >= 50: return "Fair form"
    return "Needs work"

def get_efficiency_tip(score):
    if score >= 85:
        return "Outstanding consistency. Maintain your current training rhythm."
    if score >= 70:
        return "Try adding one tempo run per week to push your score above 85."
    if score >= 50:
        return "Focus on running at an even effort — avoid starting too fast."
    return "Start with short, easy runs to build a consistent pace base."

def get_efficiency_suggestion(score, mode):
    if mode == "ML_MODEL":
        if score >= 85: return "Your training metrics indicate excellent running economy."
        if score >= 70: return "Your efficiency is solid — consistent training is working."
        if score >= 50: return "Room to improve — focus on consistency and easy runs."
        return "Build your base with consistent, low-effort runs."
    else:
        if score >= 85: return "Exceptional pace consistency across your recent runs."
        if score >= 70: return "Pace consistency indicates good running efficiency."
        if score >= 50: return "Pace varies moderately — aim for more even splits."
        return "High pace variability — try running by feel rather than GPS."


# ═══════════════════════════════════════════════════════════════════════════════
# ROUTES
# ═══════════════════════════════════════════════════════════════════════════════

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "race_model": "XGBoost marathon predictor",
        "efficiency_model": "loaded" if eff_model else "not loaded (formula fallback active)",
    })


@app.route("/efficiency-score", methods=["POST"])
def efficiency_score():
    """
    Expects JSON from Node analyticsRoutes /efficiency endpoint:
    {
        // Computed from recent Strava runs
        "pace_values":            [6.2, 6.5, 6.1, ...],   // pace in min/km per run
        "resting_heart_rate_bpm": 58,                       // avg resting HR (optional)
        "vo2_max":                48.5,                     // estimated VO2 (optional)
        "training_adherence_pct": 80,                       // % workouts completed (optional)
        "recovery_score":         7.5,                      // 0-10 (optional)
        "consecutive_weeks_no_miss": 4,                     // streak (optional)
        "missed_workout_pct":     15,                       // % missed (optional)
        "sleep_hours_avg":        7.0,                      // optional
        "weekly_mileage_km":      35.0,
        "runs_per_week":          4.0,
        "long_run_distance_km":   14.0,
        "speed_work_sessions":    1.0,
        "running_experience_months": 24,
        "age":                    28,
        "gender":                 "Male"
    }
    """
    try:
        data = request.get_json()

        pace_values = data.get("pace_values", [])
        if not pace_values or len(pace_values) < 2:
            return jsonify({
                "success": False,
                "error": "Need at least 2 pace values"
            }), 400

        pace_arr     = np.array(pace_values, dtype=float)
        avg_pace     = float(np.mean(pace_arr))
        pace_std     = float(np.std(pace_arr))
        resting_hr   = data.get("resting_heart_rate_bpm")
        vo2_max      = data.get("vo2_max")
        adherence    = data.get("training_adherence_pct")
        recovery     = data.get("recovery_score")

        # ── Try ML model first ────────────────────────────────────────────────
        if eff_model is not None and EFF_FEATURES is not None:
            try:
                weekly_mileage_km         = float(data.get("weekly_mileage_km", 30))
                runs_per_week             = float(data.get("runs_per_week", 3))
                long_run_distance_km      = float(data.get("long_run_distance_km", 12))
                speed_work_sessions       = float(data.get("speed_work_sessions", 1))
                running_experience_months = int(data.get("running_experience_months", 12))
                missed_workout_pct        = float(data.get("missed_workout_pct", 20))
                sleep_hours_avg           = float(data.get("sleep_hours_avg", 7.0))
                age                       = int(data.get("age", 30))
                gender                    = str(data.get("gender", "Male"))
                consecutive_weeks         = float(data.get("consecutive_weeks_no_miss", 4))

                resting_hr_val  = float(resting_hr)  if resting_hr  else eff_fill_medians.get("resting_heart_rate_bpm", 65)
                vo2_val         = float(vo2_max)      if vo2_max     else eff_fill_medians.get("vo2_max", 45)
                adherence_val   = float(adherence)    if adherence   else eff_fill_medians.get("training_adherence_pct", 75)
                recovery_val    = float(recovery)     if recovery     else eff_fill_medians.get("recovery_score", 6)

                training_program = get_training_program(weekly_mileage_km, running_experience_months)

                feature_vector = [
                    weekly_mileage_km,
                    runs_per_week,
                    long_run_distance_km,
                    speed_work_sessions,
                    adherence_val,
                    running_experience_months,
                    resting_hr_val,
                    vo2_val,
                    recovery_val,
                    consecutive_weeks,
                    missed_workout_pct,
                    sleep_hours_avg,
                    age,
                    encode_feature("gender", gender, eff_label_encoders),
                    encode_feature("training_program", training_program, eff_label_encoders),
                ]

                feature_array = np.array(feature_vector).reshape(1, -1)
                ml_score = float(eff_model.predict(feature_array)[0])
                ml_score = round(min(100, max(0, ml_score)), 1)

                return jsonify({
                    "success":         True,
                    "efficiencyScore": ml_score,
                    "mode":            "ML_MODEL",
                    "label":           get_efficiency_label(ml_score),
                    "tip":             get_efficiency_tip(ml_score),
                    "suggestion":      get_efficiency_suggestion(ml_score, "ML_MODEL"),
                    "trend":           "Improving" if pace_std < 0.5 else "Stable",
                    "engine":          "XGBoost efficiency model",
                    "debug": {
                        "avg_pace_min_km": round(avg_pace, 2),
                        "pace_std":        round(pace_std, 3),
                        "training_program": training_program,
                    }
                })

            except Exception as ml_err:
                print(f"⚠️  ML efficiency failed, falling back to formula: {ml_err}")

        # ── Formula fallback ──────────────────────────────────────────────────
        formula_score = formula_efficiency_score(
            pace_std=pace_std,
            avg_pace_min=avg_pace,
            resting_hr=float(resting_hr) if resting_hr else None,
            vo2_max=float(vo2_max) if vo2_max else None,
            adherence=float(adherence) if adherence else None,
            recovery=float(recovery) if recovery else None,
        )

        return jsonify({
            "success":         True,
            "efficiencyScore": formula_score,
            "mode":            "PACE_MODE",
            "label":           get_efficiency_label(formula_score),
            "tip":             get_efficiency_tip(formula_score),
            "suggestion":      get_efficiency_suggestion(formula_score, "PACE_MODE"),
            "trend":           "Stable",
            "engine":          "formula fallback",
            "debug": {
                "avg_pace_min_km": round(avg_pace, 2),
                "pace_std":        round(pace_std, 3),
            }
        })

    except Exception as e:
        print(f"Efficiency error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/ml-predict", methods=["POST"])
def predict():
    try:
        data = request.get_json()

        weekly_mileage_km         = float(data.get("weekly_mileage_km", 40))
        runs_per_week             = float(data.get("runs_per_week", 4))
        long_run_distance_km      = float(data.get("long_run_distance_km", 16))
        speed_work_sessions       = float(data.get("speed_work_sessions", 1))
        training_adherence_pct    = float(data.get("training_adherence_pct", 75))
        running_experience_months = int(data.get("running_experience_months", 12))
        resting_hr                = float(data.get("resting_heart_rate_bpm", 65))
        age                       = int(data.get("age", 30))
        gender                    = str(data.get("gender", "Male"))
        previous_race_count       = int(data.get("previous_race_count", 0))
        temperature               = float(data.get("temperature", 15))
        humidity                  = float(data.get("humidity", 50))
        elevation                 = float(data.get("elevation", 0))
        is_big_race               = bool(data.get("is_big_race", False))
        target_distance_km        = float(data.get("target_distance_km", 42.2))

        vo2_max = data.get("vo2_max")
        if vo2_max is None or vo2_max == 0:
            vo2_max = 15 * ((220 - age) / resting_hr)
        vo2_max = float(vo2_max)

        personal_best = data.get("personal_best_minutes")
        if personal_best is None or personal_best == 0:
            training_program_key = get_training_program(weekly_mileage_km, running_experience_months)
            personal_best = pb_medians.get(training_program_key, 290)
        personal_best = float(personal_best)

        training_program    = get_training_program(weekly_mileage_km, running_experience_months)
        weather_category    = temp_to_weather_category(temperature)
        difficulty_category = elevation_to_course_difficulty(elevation)

        feature_vector = [
            weekly_mileage_km,
            runs_per_week,
            long_run_distance_km,
            speed_work_sessions,
            training_adherence_pct,
            running_experience_months,
            resting_hr,
            vo2_max,
            previous_race_count,
            personal_best,
            encode_feature("marathon_weather", weather_category),
            encode_feature("course_difficulty", difficulty_category),
            age,
            encode_feature("gender", gender),
            encode_feature("training_program", training_program),
        ]

        feature_array        = np.array(feature_vector).reshape(1, -1)
        marathon_base_minutes = float(model.predict(feature_array)[0])
        distance_factor       = get_distance_factor(target_distance_km)
        base_time             = marathon_base_minutes * distance_factor
        w_penalty             = weather_penalty_multiplier(temperature, humidity)
        time_after_weather    = base_time * w_penalty
        e_penalty             = elevation_penalty_multiplier(elevation)
        time_after_elevation  = time_after_weather * e_penalty
        c_boost               = crowd_boost_multiplier(is_big_race, weekly_mileage_km)
        final_time            = time_after_elevation * c_boost
        heat_index            = calculate_heat_index(temperature, humidity)

        return jsonify({
            "success": True,
            "prediction": {
                "distance_km":          target_distance_km,
                "finish_time":          format_time(final_time),
                "finish_time_minutes":  round(final_time, 1),
                "pace":                 format_pace(final_time, target_distance_km),
            },
            "breakdown": {
                "base_prediction_minutes":  round(marathon_base_minutes, 1),
                "after_distance_scaling":   round(base_time, 1),
                "after_weather":            round(time_after_weather, 1),
                "after_elevation":          round(time_after_elevation, 1),
                "final":                    round(final_time, 1),
            },
            "adjustments": {
                "weather_penalty_pct":   round((w_penalty - 1) * 100, 2),
                "elevation_penalty_pct": round((e_penalty - 1) * 100, 2),
                "crowd_boost_pct":       round((1 - c_boost) * 100, 2),
                "heat_index":            round(heat_index, 1),
                "temperature":           temperature,
                "humidity":              humidity,
                "elevation_m":           elevation,
                "is_big_race":           is_big_race,
            },
            "inputs_used": {
                "weekly_mileage_km":     weekly_mileage_km,
                "long_run_km":           long_run_distance_km,
                "runs_per_week":         runs_per_week,
                "resting_hr":            resting_hr,
                "vo2_max":               round(vo2_max, 1),
                "experience_months":     running_experience_months,
                "training_program":      training_program,
            }
        })

    except Exception as e:
        print(f"Prediction error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


if __name__ == "__main__":
    print("Starting ML service on port 5001...")
    app.run(host="0.0.0.0", port=5001, debug=False)
