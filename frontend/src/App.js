import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import "./index.css";

import LoadingScreen      from "./pages/LoadingScreen";
import Login              from "./pages/Login";
import Home               from "./pages/Home";
import Analyzer           from "./pages/Analyzer";
import Navbar             from "./components/Navbar";
import RouteComparisonApp from "./components/RouteComparisonApp";
import Prediction         from "./pages/Prediction";

// ─── INNER APP ────────────────────────────────────────────────────────────────
function AppContent({ onLogout, isGuest }) {
  const navigate = useNavigate();
  const location = useLocation();

  const raw         = location.pathname.replace("/", "").trim();
  const currentPage = raw === "" ? "home" : raw;

  const onNavigate = (page) => {
    navigate(page === "home" ? "/" : `/${page}`);
  };

  return (
    <>
      <Navbar
        currentPage={currentPage}
        onNavigate={onNavigate}
        onLogout={onLogout}
        isGuest={isGuest}
      />
      <Routes>
        <Route path="/"         element={<Home />} />
        <Route path="/home"     element={<Home />} />
        <Route path="/analyzer" element={<Analyzer />} />
        <Route path="/routes"   element={
          <div style={{ padding: "80px 32px 32px" }}>
            <RouteComparisonApp />
          </div>
        } />
        <Route path="/predict"  element={
          <div style={{ padding: "80px 32px 32px" }}>
            <Prediction />
          </div>
        } />
        <Route path="*" element={<Home />} />
      </Routes>
    </>
  );
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
function App() {
  const [appState,   setAppState]   = useState("loading");
  const [isGuest,    setIsGuest]    = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [syncing,    setSyncing]    = useState(false);

  // ── Run IMMEDIATELY on mount — before loading screen even shows ───────────
  useEffect(() => {
    const params     = new URLSearchParams(window.location.search);
    const fromStrava = params.get("strava") === "connected";

    if (fromStrava) {
      // Clean URL right away
      window.history.replaceState({}, "", "/");
      // Set syncing state so we show a syncing message
      setSyncing(true);

      // Sync then go to app
      fetch("http://localhost:5000/api/strava/activities")
        .then(() => fetch("http://localhost:5000/api/analytics/dashboard"))
        .then(res => res.json())
        .then(data => {
          setSyncing(false);
          setAppState(data.totalRuns > 0 ? "app" : "login");
        })
        .catch(() => {
          setSyncing(false);
          setAppState("login");
        });
    }
  }, []); // runs once on mount

  // ── Loading screen complete — normal app start ────────────────────────────
  const handleLoadingComplete = async () => {
    // If we're already handling a strava redirect, don't interfere
    if (syncing) return;

    try {
      const res  = await fetch("http://localhost:5000/api/analytics/dashboard");
      const data = await res.json();
      setAppState(data.totalRuns > 0 ? "app" : "login");
    } catch {
      setAppState("login");
    }
  };

  // ── Guest login ────────────────────────────────────────────────────────────
  const handleGuestLogin = async () => {
    try {
      const res  = await fetch("http://localhost:5000/api/analytics/dashboard");
      const data = await res.json();
      if (data.totalRuns > 0) {
        setIsGuest(true);
        setAppState("app");
      } else {
        alert("No data available for guest mode yet. Please sync Strava first.");
      }
    } catch {
      alert("Could not connect to server. Make sure the backend is running.");
    }
  };

  // ── Logout ────────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    if (isGuest) {
      setIsGuest(false);
      setAppState("login");
      return;
    }
    setLoggingOut(true);
    try {
      await fetch("http://localhost:5000/api/strava/logout", { method: "POST" });
    } catch (err) {
      console.log("Backend logout error:", err.message);
    } finally {
      localStorage.clear();
      sessionStorage.clear();
      setLoggingOut(false);
      setIsGuest(false);
      setAppState("login");
    }
  };

  // ── Syncing overlay (shown while importing Strava data after OAuth) ────────
  if (syncing) {
    return (
      <div style={{
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        minHeight:      "100vh",
        background:     "var(--bg-1)",
        gap:            16,
      }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: "var(--primary)" }}>
          PACE<span style={{ color: "var(--text-primary)" }}>IQ</span>
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: 14, marginTop: 8 }}>
          Importing your Strava runs...
        </p>
        <div style={{
          width: 200,
          height: 4,
          background: "var(--border)",
          borderRadius: 2,
          overflow: "hidden",
        }}>
          <div style={{
            height: "100%",
            width: "60%",
            background: "var(--primary)",
            borderRadius: 2,
            animation: "slide 1.2s ease-in-out infinite",
          }} />
        </div>
        <style>{`
          @keyframes slide {
            0%   { transform: translateX(-100%) }
            100% { transform: translateX(300%) }
          }
        `}</style>
      </div>
    );
  }

  // ── Logout overlay ─────────────────────────────────────────────────────────
  if (loggingOut) {
    return (
      <div style={{
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        minHeight:      "100vh",
        background:     "var(--bg-1)",
        gap:            16,
      }}>
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Logging out...</p>
      </div>
    );
  }

  if (appState === "loading") {
    return <LoadingScreen onComplete={handleLoadingComplete} />;
  }

  if (appState === "login") {
    return <Login onGuestLogin={handleGuestLogin} />;
  }

  return (
    <BrowserRouter>
      <AppContent onLogout={handleLogout} isGuest={isGuest} />
    </BrowserRouter>
  );
}

export default App;