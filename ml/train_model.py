"""
train_model.py
Run this ONCE to train the model and save it as model.pkl

Steps:
1. Put train.csv and test.csv in the same folder as this file
2. Run: python train_model.py
3. It will create model.pkl — that's what Flask loads
"""

import pandas as pd
import numpy as np
import pickle
import math
from xgboost import XGBRegressor
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import train_test_split

print("Loading data...")
train_df = pd.read_csv("train.csv")
test_df  = pd.read_csv("test.csv")

# ─── STEP 1: DROP ROWS WHERE TARGET IS MISSING ───────────────────────────────
train_df = train_df.dropna(subset=["actual_finish_time_minutes"])
print(f"Training rows after dropping null targets: {len(train_df)}")

# ─── STEP 2: SELECT FEATURES ─────────────────────────────────────────────────
# These are the features the model trains on from the dataset.
# At prediction time your app will map Strava data to these same features.

FEATURES = [
    # Training load features (maps to your Strava runs)
    "weekly_mileage_km",           # avg km/week from Strava
    "runs_per_week",               # runs count / weeks
    "long_run_distance_km",        # longest run in last 6 weeks
    "speed_work_sessions_per_week",# tempo/interval runs
    "training_adherence_pct",      # consistency score
    "running_experience_months",   # months since first Strava run

    # Physiological features (from Strava HR data)
    "resting_heart_rate_bpm",      # avg resting HR
    "vo2_max",                     # estimated from pace + HR

    # Race history
    "previous_marathon_count",     # count of past races
    "personal_best_minutes",       # best time ever

    # Course + weather categories (from dataset)
    # At prediction time we replace these with real values
    "marathon_weather",            # replaced by real temp/humidity
    "course_difficulty",           # replaced by real elevation

    # Demographics
    "age",
    "gender",
    "training_program",            # Beginner/Intermediate/Advanced
]

# ─── STEP 3: HANDLE MISSING VALUES ───────────────────────────────────────────
# vo2_max: estimate from resting HR if missing
# Formula: VO2max ≈ 15 × (HRmax/HRrest), HRmax ≈ 220 - age
train_df["vo2_max"] = train_df.apply(
    lambda r: r["vo2_max"] if not pd.isna(r["vo2_max"])
    else 15 * ((220 - r["age"]) / r["resting_heart_rate_bpm"]),
    axis=1
)
test_df["vo2_max"] = test_df.apply(
    lambda r: r["vo2_max"] if not pd.isna(r["vo2_max"])
    else 15 * ((220 - r["age"]) / r["resting_heart_rate_bpm"]),
    axis=1
)

# personal_best_minutes: fill with median per training_program group
pb_medians = train_df.groupby("training_program")["personal_best_minutes"].median()
train_df["personal_best_minutes"] = train_df.apply(
    lambda r: r["personal_best_minutes"] if not pd.isna(r["personal_best_minutes"])
    else pb_medians[r["training_program"]],
    axis=1
)
test_df["personal_best_minutes"] = test_df.apply(
    lambda r: r["personal_best_minutes"] if not pd.isna(r["personal_best_minutes"])
    else pb_medians.get(r["training_program"], pb_medians.mean()),
    axis=1
)

# ─── STEP 4: ENCODE CATEGORICAL FEATURES ─────────────────────────────────────
label_encoders = {}

categorical_cols = ["marathon_weather", "course_difficulty", "gender", "training_program"]

for col in categorical_cols:
    le = LabelEncoder()
    # Fit on combined train + test to avoid unseen label errors
    combined = pd.concat([train_df[col], test_df[col]], axis=0).astype(str)
    le.fit(combined)
    train_df[col] = le.transform(train_df[col].astype(str))
    test_df[col]  = le.transform(test_df[col].astype(str))
    label_encoders[col] = le
    print(f"  Encoded {col}: {dict(zip(le.classes_, le.transform(le.classes_)))}")

# ─── STEP 5: PREPARE X AND Y ─────────────────────────────────────────────────
X_train = train_df[FEATURES]
y_train = train_df["actual_finish_time_minutes"]

X_test  = test_df[FEATURES]
# test.csv has actual_finish_time_minutes too — use for final evaluation
y_test  = test_df["actual_finish_time_minutes"] if "actual_finish_time_minutes" in test_df.columns else None

print(f"\nFeatures used: {FEATURES}")
print(f"X_train shape: {X_train.shape}")

# ─── STEP 6: TRAIN XGBOOST ───────────────────────────────────────────────────
print("\nTraining XGBoost model...")

model = XGBRegressor(
    n_estimators=500,          # 500 trees
    max_depth=6,               # tree depth — good balance
    learning_rate=0.05,        # slower learning = better generalization
    subsample=0.8,             # use 80% of data per tree
    colsample_bytree=0.8,      # use 80% of features per tree
    min_child_weight=5,        # prevents overfitting on small groups
    reg_alpha=0.1,             # L1 regularization
    reg_lambda=1.0,            # L2 regularization
    random_state=42,
    n_jobs=-1,                 # use all CPU cores
    early_stopping_rounds=50,  # stop if no improvement for 50 rounds
    eval_metric="mae"
)

# Use 10% of train for validation during training
X_tr, X_val, y_tr, y_val = train_test_split(
    X_train, y_train, test_size=0.1, random_state=42
)

model.fit(
    X_tr, y_tr,
    eval_set=[(X_val, y_val)],
    verbose=50
)

# ─── STEP 7: EVALUATE ────────────────────────────────────────────────────────
val_pred   = model.predict(X_val)
val_mae    = mean_absolute_error(y_val, val_pred)
print(f"\nValidation MAE: {val_mae:.2f} minutes")
print(f"Validation MAE: {val_mae/60:.2f} hours")

if y_test is not None:
    test_pred = model.predict(X_test)
    test_mae  = mean_absolute_error(y_test.dropna(), test_pred[:len(y_test.dropna())])
    print(f"Test MAE:       {test_mae:.2f} minutes")

# ─── STEP 8: FEATURE IMPORTANCE ──────────────────────────────────────────────
print("\nFeature importances:")
importances = model.feature_importances_
for feat, imp in sorted(zip(FEATURES, importances), key=lambda x: -x[1]):
    bar = "█" * int(imp * 100)
    print(f"  {feat:<35} {imp:.3f} {bar}")

# ─── STEP 9: SAVE MODEL + ENCODERS + FEATURE LIST ────────────────────────────
save_data = {
    "model": model,
    "label_encoders": label_encoders,
    "features": FEATURES,
    "pb_medians": pb_medians.to_dict(),
}

with open("model.pkl", "wb") as f:
    pickle.dump(save_data, f)

print("\n✅ model.pkl saved successfully!")
print("Now run: python predict_service.py")
