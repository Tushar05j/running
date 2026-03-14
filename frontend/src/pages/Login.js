// World Records and Indian Records for major distances
const RECORDS = [
  {
    distance: "5K",
    wr: { time: "12:35", holder: "Joshua Cheptegei", country: "Uganda", year: 2020 },
    india: { time: "13:18", holder: "Avinash Sable", year: 2021 }
  },
  {
    distance: "10K",
    wr: { time: "26:24", holder: "Joshua Cheptegei", country: "Uganda", year: 2020 },
    india: { time: "27:43", holder: "Avinash Sable", year: 2022 }
  },
  {
    distance: "Half",
    wr: { time: "57:31", holder: "Jacob Kiplimo", country: "Uganda", year: 2021 },
    india: { time: "1:00:30", holder: "Avinash Sable", year: 2023 }
  },
  {
    distance: "Marathon",
    wr: { time: "2:00:35", holder: "Kelvin Kiptum", country: "Kenya", year: 2023 },
    india: { time: "2:12:10", holder: "Tata Mumbai", year: 2023 }
  },
];

function Login() {
  const connectStrava = () => {
    window.location.href = "http://localhost:5000/auth/strava";
  };

  return (
    <div className="login-page">

      {/* LEFT — Auth */}
      <div className="login-left">
        <div className="login-logo">PACE<span>IQ</span></div>
        <p className="login-tagline">Your AI-powered running intelligence platform</p>

        <div className="login-card">
          <h2>Welcome back</h2>
          <p>
            Connect your Strava account to access your personalized
            running dashboard, race predictions, and AI coaching.
          </p>

          <button className="strava-btn" onClick={connectStrava}>
            {/* Strava logo SVG */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0 3 13.828h4.172"/>
            </svg>
            Continue with Strava
          </button>

          <div className="login-divider">or</div>

          <p className="login-note">
            Don't have Strava? Your runs are automatically imported
            once you connect. All data stays private.
          </p>
        </div>
      </div>

      {/* RIGHT — Records */}
      <div className="login-right">
        <p className="records-title">🏆 World &amp; Indian Records</p>

        <div className="records-grid">
          {RECORDS.map((rec) => (
            <div key={rec.distance} className="record-item">
              <div className="record-distance">{rec.distance}</div>

              <div className="record-info">
                <div className="record-name">{rec.wr.holder}</div>
                <div className="record-holder">
                  {rec.wr.country} · {rec.wr.year} · World Record
                </div>
                <div className="record-holder" style={{ marginTop: 4, color: "#FC4C02" }}>
                  🇮🇳 India: {rec.india.time} — {rec.india.holder}
                </div>
              </div>

              <div className="record-time">{rec.wr.time}</div>
            </div>
          ))}
        </div>

        <p style={{ marginTop: 32, fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
          How close are you to these records?<br />
          Connect Strava to find out.
        </p>
      </div>

    </div>
  );
}

export default Login;
