import { useState } from "react";
import axios from "axios";

function Navbar({ currentPage, onNavigate, onLogout, isGuest }) {
  const [syncing,  setSyncing]  = useState(false);
  const [toast,    setToast]    = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const syncStrava = async () => {
    if (isGuest) {
      showToast("Guest mode — sync not available", "error");
      return;
    }
    setSyncing(true);
    try {
      const res = await axios.get("https://running-orpin.vercel.app/api/strava/activities");
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

  const handleNavigate = (page) => {
    onNavigate(page);
    setMenuOpen(false);
  };

  const handleLogout = () => {
    onLogout();
    setMenuOpen(false);
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
          onClick={() => handleNavigate("home")}
          style={{ cursor: "pointer" }}
        >
          PACE<span>IQ</span>
          {isGuest && (
            <span className="navbar-mobile-guest-badge">Guest</span>
          )}
        </div>

        {/* Desktop nav links */}
        <div className="navbar-links">
          {links.map(link => (
            <button
              key={link.key}
              className={`navbar-link ${currentPage === link.key ? "active" : ""}`}
              onClick={() => handleNavigate(link.key)}
            >
              {link.label}
            </button>
          ))}
        </div>

        {/* Desktop right side */}
        <div className="navbar-right">
          {isGuest && (
            <div className="guest-badge">Guest</div>
          )}

          {!isGuest && (
            <button
              className="navbar-sync"
              onClick={syncStrava}
              disabled={syncing}
            >
              {syncing ? "Syncing..." : "↻ Sync"}
            </button>
          )}

          <button
            className="navbar-logout"
            onClick={handleLogout}
            title={isGuest ? "Exit guest mode" : "Log out"}
          >
            {isGuest ? "← Exit Guest" : "⎋ Logout"}
          </button>

          <div className="navbar-avatar-placeholder">
            {isGuest ? "G" : "R"}
          </div>
        </div>

        {/* Mobile hamburger button */}
        <button
          className={`navbar-hamburger ${menuOpen ? "open" : ""}`}
          onClick={() => setMenuOpen(v => !v)}
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
        >
          <span />
          <span />
          <span />
        </button>
      </nav>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="navbar-mobile-menu">
          {links.map(link => (
            <button
              key={link.key}
              className={`navbar-link ${currentPage === link.key ? "active" : ""}`}
              onClick={() => handleNavigate(link.key)}
            >
              {link.label}
            </button>
          ))}

          <div className="navbar-mobile-divider" />

          <div className="navbar-mobile-actions">
            {!isGuest && (
              <button
                className="navbar-sync"
                onClick={() => { syncStrava(); setMenuOpen(false); }}
                disabled={syncing}
                style={{ flex: 1 }}
              >
                {syncing ? "Syncing..." : "↻ Sync Strava"}
              </button>
            )}
            <button
              className="navbar-logout"
              onClick={handleLogout}
              style={{ flex: 1 }}
            >
              {isGuest ? "← Exit Guest" : "⎋ Logout"}
            </button>
          </div>
        </div>
      )}

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