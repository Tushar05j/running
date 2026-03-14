import { useState } from "react";
import axios from "axios";

function Prediction() {
  const [city, setCity]             = useState("");
  const [isBigRace, setIsBigRace]   = useState(false);
  const [result, setResult]         = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [activeMode, setActiveMode] = useState(null);

  const predict = async (mode) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setActiveMode(mode);

    try {
      const body = mode === "city" && city.trim()
        ? { city: city.trim(), is_big_race: isBigRace }
        : { is_big_race: isBigRace };

      const response = await axios.post("http://localhost:5000/api/predict", body);
      setResult(response.data);
    } catch (err) {
      setError(err.response?.data?.error || "Prediction failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const distances = ["5K", "10K", "Half Marathon", "Marathon"];

  return (
    <div style={{
      minHeight: "80vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "flex-start",
      paddingTop: 32,
      paddingBottom: 48,
    }}>

      {/* Main card */}
      <div style={{
        width: "100%",
        maxWidth: 680,
        background: "var(--bg-card)",
        border: "1px solid var(--border-bright)",
        borderRadius: 24,
        padding: "40px 48px",
        boxShadow: "0 4px 32px rgba(180,120,60,0.12)",
        position: "relative",
        overflow: "hidden",
      }}>

        {/* Top accent stripe */}
        <div style={{
          position: "absolute",
          top: 0, left: 0, right: 0,
          height: 4,
          background: "linear-gradient(90deg, var(--primary-dim), var(--primary-bright), var(--primary-dim))",
        }} />

        {/* Header */}
        <div style={{ marginBottom: 32, textAlign: "center" }}>
          <div style={{
            fontFamily: "var(--font-display)",
            fontSize: 38,
            fontWeight: 900,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: "var(--text-primary)",
            lineHeight: 1,
            marginBottom: 8,
          }}>
            Race <span style={{ color: "var(--primary)" }}>Predictor</span>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Powered by XGBoost ML · Real weather · Elevation · Crowd boost
          </p>
        </div>

        {/* Mode buttons */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          marginBottom: 20,
        }}>
          <button
            onClick={() => predict("instant")}
            disabled={loading}
            style={{
              padding: "14px 20px",
              background: activeMode === "instant" && result ? "var(--primary)" : "var(--bg-3)",
              border: `2px solid ${activeMode === "instant" && result ? "var(--primary)" : "var(--border-bright)"}`,
              borderRadius: 12,
              fontFamily: "var(--font-display)",
              fontSize: 15,
              fontWeight: 800,
              letterSpacing: 1,
              textTransform: "uppercase",
              color: activeMode === "instant" && result ? "#fff" : "var(--text-secondary)",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
              transition: "all 0.2s ease",
            }}
          >
            ⚡ Instant Prediction
          </button>

          <button
            onClick={() => city.trim() && predict("city")}
            disabled={loading || !city.trim()}
            style={{
              padding: "14px 20px",
              background: activeMode === "city" && result ? "var(--primary)" : "var(--bg-3)",
              border: `2px solid ${activeMode === "city" && result ? "var(--primary)" : "var(--border-bright)"}`,
              borderRadius: 12,
              fontFamily: "var(--font-display)",
              fontSize: 15,
              fontWeight: 800,
              letterSpacing: 1,
              textTransform: "uppercase",
              color: activeMode === "city" && result ? "#fff" : "var(--text-secondary)",
              cursor: loading || !city.trim() ? "not-allowed" : "pointer",
              opacity: loading || !city.trim() ? 0.5 : 1,
              transition: "all 0.2s ease",
            }}
          >
            🌍 Race City
          </button>
        </div>

        {/* City input */}
        <div style={{ marginBottom: 16 }}>
          <input
            className="input"
            type="text"
            placeholder="Enter race city (e.g. Mumbai, Delhi, Berlin)"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && city.trim() && predict("city")}
            style={{ borderRadius: 10, padding: "12px 16px" }}
          />
        </div>

        {/* Big race checkbox */}
        <label style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          cursor: "pointer",
          marginBottom: 28,
          padding: "12px 16px",
          background: isBigRace ? "var(--primary-glow2)" : "var(--bg-3)",
          border: `1px solid ${isBigRace ? "var(--border-bright)" : "var(--border)"}`,
          borderRadius: 10,
          transition: "all 0.2s ease",
        }}>
          <input
            type="checkbox"
            checked={isBigRace}
            onChange={(e) => setIsBigRace(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: "var(--primary)", cursor: "pointer" }}
          />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
              Big race / major marathon
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 1 }}>
              Enables crowd boost — runners go faster in large events
            </div>
          </div>
        </label>

        {/* Loading */}
        {loading && (
          <div style={{
            textAlign: "center",
            padding: "32px 0",
            color: "var(--text-muted)",
            fontSize: 14,
          }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>⏱</div>
            Analyzing your training data...
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            background: "rgba(192,57,43,0.08)",
            border: "1px solid rgba(192,57,43,0.2)",
            borderRadius: 10,
            padding: "12px 16px",
            fontSize: 13,
            color: "var(--red)",
            marginBottom: 20,
          }}>
            {error}
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <div>

            {/* Weather strip */}
            <div style={{
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              alignItems: "center",
              marginBottom: 24,
              padding: "10px 16px",
              background: "var(--bg-3)",
              borderRadius: 10,
              fontSize: 13,
            }}>
              <span>📍 <strong>{result.raceCity}</strong></span>
              <span style={{ color: "var(--border-bright)" }}>·</span>
              <span>🌡 {result.weather?.temperature}°C</span>
              <span style={{ color: "var(--border-bright)" }}>·</span>
              <span>💧 {result.weather?.humidity}%</span>
              <span style={{ color: "var(--border-bright)" }}>·</span>
              <span>⛰ {result.elevation}m</span>
              <span style={{ color: "var(--border-bright)" }}>·</span>
              <span style={{
                fontFamily: "var(--font-display)",
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                color: result.predictionEngine === "ml" ? "var(--green)" : "var(--text-muted)",
              }}>
                {result.predictionEngine === "ml" ? "✓ ML Model" : "⚠ Math fallback"}
              </span>
            </div>

            {/* 2x2 prediction grid */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 12,
            }}>
              {distances.map((race) => {
                const data = result.predictions?.[race];
                if (!data) return null;
                const isHalf = race === "Half Marathon";
                const isMarathon = race === "Marathon";
                const isHighlight = isHalf || isMarathon;

                return (
                  <div key={race} style={{
                    background: isHighlight ? "rgba(196,122,58,0.06)" : "var(--bg-3)",
                    border: `1px solid ${isHighlight ? "var(--border-bright)" : "var(--border)"}`,
                    borderRadius: 16,
                    padding: "20px 24px",
                    position: "relative",
                    overflow: "hidden",
                  }}>
                    {/* Corner accent for highlighted cards */}
                    {isHighlight && (
                      <div style={{
                        position: "absolute",
                        top: 0, right: 0,
                        borderTop: "32px solid var(--primary)",
                        borderLeft: "32px solid transparent",
                        opacity: 0.3,
                      }} />
                    )}

                    <div style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: 2,
                      textTransform: "uppercase",
                      color: "var(--text-muted)",
                      marginBottom: 8,
                    }}>
                      {race}
                    </div>

                    <div style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 40,
                      fontWeight: 900,
                      letterSpacing: -1,
                      color: isHighlight ? "var(--primary)" : "var(--text-primary)",
                      lineHeight: 1,
                      marginBottom: 6,
                    }}>
                      {data.time}
                    </div>

                    <div style={{
                      fontSize: 13,
                      color: "var(--text-muted)",
                    }}>
                      {data.pace}
                    </div>
                  </div>
                );
              })}
            </div>

            {result.is_big_race && (
              <p style={{
                fontSize: 12,
                color: "var(--text-muted)",
                textAlign: "center",
                marginTop: 14,
              }}>
                ⚡ Crowd boost applied based on your fitness level
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Prediction;