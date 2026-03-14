import { useState } from "react";
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
function AppContent({ onLogout }) {
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
  const [loggingOut, setLoggingOut] = useState(false);
  const [syncMsg,    setSyncMsg]    = useState("Warming up...");

  const handleLoadingComplete = async () => {
    // Check if we just came back from Strava OAuth
    const urlParams  = new URLSearchParams(window.location.search);
    const justAuthed = window.location.search.includes("?") &&
                       !urlParams.get("auth");

    // If redirected back from Strava callback — auto sync first
    if (justAuthed || urlParams.has("synced")) {
      setSyncMsg("Syncing your Strava runs...");
      try {
        await fetch("http://localhost:5000/api/strava/activities");
        // Clean URL
        window.history.replaceState({}, "", "/");
      } catch (e) {
        console.log("Auto sync failed:", e.message);
      }
    }

    // Now check if we have data
    setSyncMsg("Loading your dashboard...");
    try {
      const res  = await fetch("http://localhost:5000/api/analytics/dashboard");
      const data = await res.json();

      if (data.totalRuns > 0) {
        setAppState("app");
      } else {
        // No runs yet — check if we came back from Strava (auth worked but sync needed)
        const fromStrava = document.referrer.includes("strava.com") ||
                           window.location.href.includes("localhost:3000");
        if (fromStrava) {
          // Try syncing once
          setSyncMsg("Fetching your runs from Strava...");
          try {
            await fetch("http://localhost:5000/api/strava/activities");
            const res2  = await fetch("http://localhost:5000/api/analytics/dashboard");
            const data2 = await res2.json();
            setAppState(data2.totalRuns > 0 ? "app" : "login");
          } catch {
            setAppState("login");
          }
        } else {
          setAppState("login");
        }
      }
    } catch {
      setAppState("login");
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch("http://localhost:5000/api/strava/logout", { method: "POST" });
    } catch (err) {
      console.log("Backend logout error (proceeding anyway):", err.message);
    } finally {
      localStorage.clear();
      sessionStorage.clear();
      setLoggingOut(false);
      setAppState("login");
    }
  };

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
        <div style={{ fontSize: 32 }}>⏳</div>
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
          Logging out...
        </p>
      </div>
    );
  }

  if (appState === "loading") {
    return (
      <LoadingScreen
        onComplete={handleLoadingComplete}
        message={syncMsg}
      />
    );
  }

  if (appState === "login") {
    return <Login />;
  }

  return (
    <BrowserRouter>
      <AppContent onLogout={handleLogout} />
    </BrowserRouter>
  );
}

export default App;