import { useState } from "react";
import axios from "axios";

function Navbar({ currentPage, onNavigate, onLogout }) {
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast]     = useState(null);

  const syncStrava = async () => {
    setSyncing(true);
    try {
      const res = await axios.get("http://localhost:5000/api/strava/activities");
      showToast(`✓ Synced ${res.data.count} activities`, "success");
      window.dispatchEvent(new Event("strava-synced"));
    } catch {
      showToast("Sync failed. Check connection.", "error");
    } finally {
      setSyncing(false);
    }
  };

  const showToast = (msg, type) => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const links = [
    { key: "home",     label: "Home"     },
    { key: "analyzer", label: "Analyzer" },
    { key: "routes",   label: "Routes"   },
    { key: "predict",  label: "Predict"  },
  ];

  return (
    <>
      <nav className="navbar">
        {/* Logo */}
        <div
          className="navbar-logo"
          onClick={() => onNavigate("home")}
          style={{ cursor: "pointer" }}
        >
          PACE<span>IQ</span>
        </div>

        {/* Nav links */}
        <div className="navbar-links">
          {links.map(link => (
            <button
              key={link.key}
              className={`navbar-link ${currentPage === link.key ? "active" : ""}`}
              onClick={() => onNavigate(link.key)}
            >
              {link.label}
            </button>
          ))}
        </div>

        {/* Right side */}
        <div className="navbar-right">

          {/* Sync */}
          <button
            className="navbar-sync"
            onClick={syncStrava}
            disabled={syncing}
          >
            {syncing ? "Syncing..." : "↻ Sync"}
          </button>

          {/* Logout */}
          <button
            className="navbar-logout"
            onClick={onLogout}
            title="Log out"
          >
            ⎋ Logout
          </button>

          {/* Avatar */}
          <div className="navbar-avatar-placeholder">R</div>

        </div>
      </nav>

      {/* Toast */}
      {toast && (
        <div className={`sync-toast ${toast.type}`}>
          {toast.msg}
        </div>
      )}
    </>
  );
}

export default Navbar;