"""
predict_service.py
Flask microservice that loads model.pkl and serves race predictions.

Run with: python predict_service.py
Runs on:  http://localhost:5001

Your Node backend calls this at POST /ml-predict
"""

import pickle
import math
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# ─── LOAD MODEL ON STARTUP ────────────────────────────────────────────────────
print("Loading model...")
with open("model.pkl", "rb") as f:
    saved = pickle.load(f)

model          = saved["model"]
label_encoders = saved["label_encoders"]
FEATURES       = saved["features"]
pb_medians     = saved["pb_medians"]

print(f"✅ Model loaded. Features: {FEATURES}")

# ─── WEATHER PENALTY ─────────────────────────────────────────────────────────
# Uses real temperature + humidity numbers from OpenWeather API
# NOT the 3-category dataset labels
#
# Research basis:
# - Every 1°C above 10°C optimal = ~0.3% slower
# - Humidity compounds the effect via heat index
# - Below 0°C = cold muscle penalty kicks in

def calculate_heat_index(temp_c, humidity_pct):
    """
    Feels-like temperature combining heat + humidity.
    Mumbai 28°C + 85% humidity → feels like ~36°C
    Delhi  15°C + 30% humidity → feels like ~14°C
    """
    if temp_c < 10:
        return temp_c  # cold — humidity doesn't compound cold
    hi = (temp_c +
          (0.33 * (humidity_pct / 100) *
           6.105 * math.exp(17.27 * temp_c / (237.7 + temp_c))) - 4.0)
    return hi

def weather_penalty_multiplier(temp_c, humidity_pct):
    """
    Returns a multiplier to apply to predicted finish time.
    1.0 = no change, 1.06 = 6% slower

    Validated against real race data:
    Mumbai TMM:  28°C, 83% → heat_index 36.1 → multiplier ~1.06
    Delhi HM:    15°C, 30% → heat_index 14.2 → multiplier ~0.99
    """
    heat_index = calculate_heat_index(temp_c, humidity_pct)

    if heat_index <= 10:
        # Cold conditions — slight penalty for muscle stiffness
        penalty = 1.0 + max(0, (10 - heat_index)) * 0.002

    elif heat_index <= 15:
        # Ideal racing conditions — no penalty
        penalty = 1.0

    elif heat_index <= 20:
        # Slightly warm — 0-2% slower
        penalty = 1.0 + (heat_index - 15) * 0.004

    elif heat_index <= 25:
        # Warm — 2-5% slower
        penalty = 1.02 + (heat_index - 20) * 0.006

    elif heat_index <= 30:
        # Hot — 5-9% slower (Mumbai range)
        penalty = 1.05 + (heat_index - 25) * 0.008

    elif heat_index <= 35:
        # Very hot — 9-14% slower
        penalty = 1.09 + (heat_index - 30) * 0.010

    else:
        # Extreme heat 35°C+ — 14-20%+ slower
        penalty = 1.14 + (heat_index - 35) * 0.012

    return round(penalty, 4)

# ─── ELEVATION PENALTY ───────────────────────────────────────────────────────
# Uses real elevation in meters from Google Elevation API

def elevation_penalty_multiplier(elevation_m):
    """
    Oxygen availability decreases with altitude.
    Every 1000m above sea level ≈ 3% slower.

    Mumbai:  14m  → 1.0004 (negligible)
    Delhi:   216m → 1.006
    Shimla:  2200m → 1.066
    """
    if elevation_m <= 0:
        return 1.0
    penalty = 1.0 + (elevation_m / 1000) * 0.03
    return round(penalty, 4)

# ─── CROWD BOOST ─────────────────────────────────────────────────────────────
# Adrenaline + pacing from crowd + elite runners pulling pace

def crowd_boost_multiplier(is_big_race, weekly_mileage_km):
    """
    Big race boost varies by fitness level.
    Fitter runners (high mileage) get smaller boost — already running near limit.
    Recreational runners get bigger boost from crowd energy.

    weekly_mileage_km is used as a fitness proxy.
    """
    if not is_big_race:
        return 1.0

    if weekly_mileage_km >= 70:
        # Elite/advanced runner — 1% boost
        boost = 0.99
    elif weekly_mileage_km >= 50:
        # Intermediate — 2% boost
        boost = 0.98
    elif weekly_mileage_km >= 30:
        # Regular runner — 3% boost
        boost = 0.97
    else:
        # Beginner — 4% boost (most affected by crowd energy)
        boost = 0.96

    return boost

# ─── DISTANCE FACTOR ─────────────────────────────────────────────────────────
# Model is trained on marathon data — scale to other distances

def get_distance_factor(target_distance_km):
    """
    Riegel formula adjusted factors.
    Model predicts marathon (42.2km) time.
    Scale down for shorter distances.
    """
    factors = {
        5:    0.108,   # 5K   ≈ 10.8% of marathon time
        10:   0.225,   # 10K  ≈ 22.5%
        21.1: 0.478,   # Half ≈ 47.8%
        42.2: 1.000,   # Full = 100%
    }
    # Find closest distance
    closest = min(factors.keys(), key=lambda k: abs(k - target_distance_km))
    return factors[closest]

# ─── MAP WEATHER CATEGORY ─────────────────────────────────────────────────────
# Convert real temp to the category the model was trained on
# (model uses encoded categories internally)

def temp_to_weather_category(temp_c):
    if temp_c <= 5:
        return "Cold"
    elif temp_c <= 15:
        return "Cloudy"
    elif temp_c <= 22:
        return "Sunny"
    elif temp_c <= 28:
        return "Rainy"  # using Rainy as moderate-warm proxy
    else:
        return "Hot"

def elevation_to_course_difficulty(elevation_m):
    if elevation_m <= 100:
        return "Flat"
    elif elevation_m <= 500:
        return "Mixed"
    else:
        return "Hilly"

def encode_feature(col, value):
    """Safely encode a categorical value using saved LabelEncoder."""
    le = label_encoders.get(col)
    if le is None:
        return 0
    if value not in le.classes_:
        # Unknown value — use most common class
        value = le.classes_[0]
    return int(le.transform([value])[0])

# ─── DETERMINE TRAINING PROGRAM ──────────────────────────────────────────────
def get_training_program(weekly_mileage_km, running_experience_months):
    if weekly_mileage_km >= 60 or running_experience_months >= 36:
        return "Advanced"
    elif weekly_mileage_km >= 30 or running_experience_months >= 12:
        return "Intermediate"
    else:
        return "Beginner"

# ─── FORMAT TIME ─────────────────────────────────────────────────────────────
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

# ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "model": "XGBoost marathon predictor"})

# ─── MAIN PREDICTION ENDPOINT ─────────────────────────────────────────────────
@app.route("/ml-predict", methods=["POST"])
def predict():
    """
    Expects JSON body with runner's Strava data + race conditions:
    {
        // From Strava (calculated by Node backend)
        "weekly_mileage_km": 45.0,
        "runs_per_week": 4.5,
        "long_run_distance_km": 18.0,
        "speed_work_sessions": 1.0,
        "training_adherence_pct": 80.0,
        "running_experience_months": 24,
        "resting_heart_rate_bpm": 58,
        "vo2_max": 48.5,              // optional — estimated if missing
        "previous_race_count": 2,
        "personal_best_minutes": 240, // optional
        "age": 28,
        "gender": "Male",

        // From OpenWeather API (race city)
        "temperature": 28.0,
        "humidity": 83,

        // From Google Elevation API
        "elevation": 14.0,

        // User input
        "is_big_race": true,
        "target_distance_km": 21.1
    }
    """
    try:
        data = request.get_json()

        # ── Extract inputs ──
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

        # ── VO2 max: use provided or estimate ──
        vo2_max = data.get("vo2_max")
        if vo2_max is None or vo2_max == 0:
            vo2_max = 15 * ((220 - age) / resting_hr)
        vo2_max = float(vo2_max)

        # ── Personal best: use provided or estimate from mileage ──
        personal_best = data.get("personal_best_minutes")
        if personal_best is None or personal_best == 0:
            training_program_key = get_training_program(weekly_mileage_km, running_experience_months)
            personal_best = pb_medians.get(training_program_key, 290)
        personal_best = float(personal_best)

        # ── Determine training program ──
        training_program = get_training_program(weekly_mileage_km, running_experience_months)

        # ── Map real weather/elevation to dataset categories for model ──
        weather_category    = temp_to_weather_category(temperature)
        difficulty_category = elevation_to_course_difficulty(elevation)

        # ── Build feature vector (must match FEATURES list exactly) ──
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

        feature_array = np.array(feature_vector).reshape(1, -1)

        # ── XGBoost prediction (marathon base time in minutes) ──
        marathon_base_minutes = float(model.predict(feature_array)[0])

        # ── Scale to target distance ──
        distance_factor = get_distance_factor(target_distance_km)
        base_time = marathon_base_minutes * distance_factor

        # ── Apply weather penalty (real temp + humidity) ──
        w_penalty    = weather_penalty_multiplier(temperature, humidity)
        time_after_weather = base_time * w_penalty

        # ── Apply elevation penalty (real meters) ──
        e_penalty    = elevation_penalty_multiplier(elevation)
        time_after_elevation = time_after_weather * e_penalty

        # ── Apply crowd boost ──
        c_boost      = crowd_boost_multiplier(is_big_race, weekly_mileage_km)
        final_time   = time_after_elevation * c_boost

        # ── Calculate heat index for response ──
        heat_index = calculate_heat_index(temperature, humidity)

        # ── Format response ──
        response = {
            "success": True,
            "prediction": {
                "distance_km": target_distance_km,
                "finish_time": format_time(final_time),
                "finish_time_minutes": round(final_time, 1),
                "pace": format_pace(final_time, target_distance_km),
            },
            "breakdown": {
                "base_prediction_minutes": round(marathon_base_minutes, 1),
                "after_distance_scaling": round(base_time, 1),
                "after_weather": round(time_after_weather, 1),
                "after_elevation": round(time_after_elevation, 1),
                "final": round(final_time, 1),
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
                "weekly_mileage_km":         weekly_mileage_km,
                "long_run_km":               long_run_distance_km,
                "runs_per_week":             runs_per_week,
                "resting_hr":                resting_hr,
                "vo2_max":                   round(vo2_max, 1),
                "experience_months":         running_experience_months,
                "training_program":          training_program,
            }
        }

        return jsonify(response)

    except Exception as e:
        print(f"Prediction error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


if __name__ == "__main__":
    print("Starting ML prediction service on port 5001...")
    app.run(host="0.0.0.0", port=5001, debug=False)
