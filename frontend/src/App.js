import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import "./index.css";

import LoadingScreen from "./pages/LoadingScreen";
import Login         from "./pages/Login";
import Home          from "./pages/Home";
import Analyzer      from "./pages/Analyzer";
import Navbar        from "./components/Navbar";
import RouteComparisonApp from "./components/RouteComparisonApp";
import Prediction         from "./pages/Prediction";

// ─── INNER APP (needs Router context for useNavigate/useLocation) ─────────────
function AppContent() {
  const navigate  = useNavigate();
  const location  = useLocation();

  // Derive current page from URL path
  const raw = location.pathname.replace("/", "").trim();
  const currentPage = raw === "" ? "home" : raw;

  const onNavigate = (page) => {
    navigate(page === "home" ? "/" : `/${page}`);
  };

  return (
    <>
      <Navbar currentPage={currentPage} onNavigate={onNavigate} />

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
        {/* Fallback — unknown routes go home */}
        <Route path="*" element={<Home />} />
      </Routes>
    </>
  );
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
function App() {
  const [appState, setAppState] = useState("loading");

  const handleLoadingComplete = () => {
    fetch("http://localhost:5000/api/analytics/dashboard")
      .then(res => res.json())
      .then(data => {
        setAppState(data.totalRuns > 0 ? "app" : "login");
      })
      .catch(() => {
        setAppState("login");
      });
  };

  if (appState === "loading") {
    return <LoadingScreen onComplete={handleLoadingComplete} />;
  }

  if (appState === "login") {
    return <Login />;
  }

  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;