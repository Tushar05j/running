"""
train_efficiency_model.py

Trains an XGBoost model to score running efficiency (0-100)
from runner training data.

Run ONCE:  python train_efficiency_model.py
Output:    efficiency_model.pkl
"""

import pandas as pd
import numpy as np
import pickle
from xgboost import XGBRegressor
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import train_test_split

print("Loading data...")
train_df = pd.read_csv("train.csv")
test_df  = pd.read_csv("test.csv")

# ─── STEP 1: BUILD EFFICIENCY SCORE (TARGET) ─────────────────────────────────
# We don't have a direct "efficiency" label in the dataset.
# So we derive it from what we know about running efficiency:
#
# Efficiency = how well your body converts training effort into performance.
# A runner is efficient if they:
#   1. Run fast relative to their heart rate (low HR at good pace = efficient)
#   2. Have high training adherence (consistency = efficiency)
#   3. Have good VO2 max (oxygen use efficiency)
#   4. Finish close to their target time (execution efficiency)
#   5. Have good recovery (body handling load well)
#
# Formula:
#   base    = how close actual was to target (race execution)
#   hr_comp = HR efficiency (lower resting HR relative to VO2 = better)
#   adh_comp= training adherence score
#   vo2_comp= VO2 max normalized
#   rec_comp= recovery score

def compute_efficiency_score(row):
    score = 0.0

    # 1. Race execution (30 pts) — how close to target finish time
    if pd.notna(row.get("actual_finish_time_minutes")) and pd.notna(row.get("target_finish_time_minutes")):
        actual = row["actual_finish_time_minutes"]
        target = row["target_finish_time_minutes"]
        if target > 0:
            ratio = actual / target   # 1.0 = perfect, >1 = slower than target
            # Within 5% = 30 pts, every extra 5% = -6 pts, max penalty -30
            exec_score = max(0, 30 - max(0, (ratio - 1.0)) * 600)
            score += exec_score
    else:
        score += 15  # neutral if no race data

    # 2. HR efficiency (25 pts) — low resting HR relative to VO2 max
    if pd.notna(row.get("resting_heart_rate_bpm")) and pd.notna(row.get("vo2_max")):
        hr  = row["resting_heart_rate_bpm"]
        vo2 = row["vo2_max"]
        # Good runner: low HR (45-55) + high VO2 (55+)
        # Normalize: HR 40=25pts, HR 80=0pts. VO2 70=bonus
        hr_pts  = max(0, 25 - (hr - 40) * 0.625)
        vo2_bonus = min(5, (vo2 - 40) * 0.2) if vo2 > 40 else 0
        score += min(25, hr_pts + vo2_bonus)
    else:
        score += 12

    # 3. Training adherence (20 pts)
    if pd.notna(row.get("training_adherence_pct")):
        adh = row["training_adherence_pct"]
        score += (adh / 100) * 20
    else:
        score += 10

    # 4. Recovery score (15 pts)
    if pd.notna(row.get("recovery_score")):
        rec = row["recovery_score"]
        score += min(15, (rec / 10) * 15)
    else:
        score += 7

    # 5. Consistency bonus (10 pts) — consecutive weeks without missing
    if pd.notna(row.get("consecutive_weeks_no_miss")):
        weeks = row["consecutive_weeks_no_miss"]
        score += min(10, weeks * 0.5)
    else:
        score += 5

    return round(min(100, max(0, score)), 2)

print("Computing efficiency scores...")
train_df["efficiency_score"] = train_df.apply(compute_efficiency_score, axis=1)
test_df["efficiency_score"]  = test_df.apply(compute_efficiency_score, axis=1)

print(f"Efficiency score stats:")
print(train_df["efficiency_score"].describe())

# ─── STEP 2: SELECT FEATURES ─────────────────────────────────────────────────
FEATURES = [
    "weekly_mileage_km",
    "runs_per_week",
    "long_run_distance_km",
    "speed_work_sessions_per_week",
    "training_adherence_pct",
    "running_experience_months",
    "resting_heart_rate_bpm",
    "vo2_max",
    "recovery_score",
    "consecutive_weeks_no_miss",
    "missed_workout_pct",
    "sleep_hours_avg",
    "age",
    "gender",
    "training_program",
]

# ─── STEP 3: FILL MISSING VALUES ─────────────────────────────────────────────
fill_medians = {}
numeric_cols = [c for c in FEATURES if c not in ["gender", "training_program"]]

for col in numeric_cols:
    median_val = train_df[col].median()
    fill_medians[col] = median_val
    train_df[col] = train_df[col].fillna(median_val)
    test_df[col]  = test_df[col].fillna(median_val)

# ─── STEP 4: ENCODE CATEGORICALS ─────────────────────────────────────────────
label_encoders = {}
categorical_cols = ["gender", "training_program"]

for col in categorical_cols:
    le = LabelEncoder()
    combined = pd.concat([train_df[col], test_df[col]], axis=0).astype(str)
    le.fit(combined)
    train_df[col] = le.transform(train_df[col].astype(str))
    test_df[col]  = le.transform(test_df[col].astype(str))
    label_encoders[col] = le
    print(f"  Encoded {col}: {dict(zip(le.classes_, le.transform(le.classes_)))}")

# ─── STEP 5: TRAIN ───────────────────────────────────────────────────────────
X_train = train_df[FEATURES]
y_train = train_df["efficiency_score"]
X_test  = test_df[FEATURES]
y_test  = test_df["efficiency_score"]

X_tr, X_val, y_tr, y_val = train_test_split(
    X_train, y_train, test_size=0.1, random_state=42
)

print("\nTraining XGBoost efficiency model...")

model = XGBRegressor(
    n_estimators=400,
    max_depth=5,
    learning_rate=0.05,
    subsample=0.8,
    colsample_bytree=0.8,
    min_child_weight=5,
    reg_alpha=0.1,
    reg_lambda=1.0,
    random_state=42,
    n_jobs=-1,
    early_stopping_rounds=40,
    eval_metric="mae",
)

model.fit(
    X_tr, y_tr,
    eval_set=[(X_val, y_val)],
    verbose=50,
)

# ─── STEP 6: EVALUATE ────────────────────────────────────────────────────────
val_pred = model.predict(X_val)
val_mae  = mean_absolute_error(y_val, val_pred)
print(f"\nValidation MAE: {val_mae:.2f} points")

test_pred = model.predict(X_test)
test_mae  = mean_absolute_error(y_test, test_pred)
print(f"Test MAE:       {test_mae:.2f} points")

# ─── STEP 7: FEATURE IMPORTANCE ──────────────────────────────────────────────
print("\nFeature importances:")
for feat, imp in sorted(zip(FEATURES, model.feature_importances_), key=lambda x: -x[1]):
    bar = "█" * int(imp * 80)
    print(f"  {feat:<40} {imp:.3f} {bar}")

# ─── STEP 8: SAVE ────────────────────────────────────────────────────────────
save_data = {
    "model":          model,
    "label_encoders": label_encoders,
    "features":       FEATURES,
    "fill_medians":   fill_medians,
}

with open("efficiency_model.pkl", "wb") as f:
    pickle.dump(save_data, f)

print("\n✅ efficiency_model.pkl saved!")
print("Now add the /efficiency-score route to predict_service.py")
