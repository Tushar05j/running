const mongoose = require("mongoose");

const ActivitySchema = new mongoose.Schema({
  stravaId: Number,
  name: String,
  type: String,
  distance: Number,
  moving_time: Number,
  average_speed: Number,
  average_heartrate: { type: Number, default: null },
  average_cadence: { type: Number, default: null },
  total_elevation_gain: Number,
  start_date: Date,
  start_latlng: { type: [Number], default: null },
  summary_polyline: { type: String, default: null },  // ← NEW
  efficiency_mode: String
});

module.exports = mongoose.model("Activity", ActivitySchema);