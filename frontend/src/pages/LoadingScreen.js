import { useEffect, useState } from "react";

function LoadingScreen({ onComplete }) {
  const [progress, setProgress] = useState(0);
  const [message, setMessage]   = useState("Warming up...");

  const messages = [
    "Warming up...",
    "Syncing your runs...",
    "Calculating pace...",
    "Analyzing training...",
    "Ready to run!",
  ];

  useEffect(() => {
    let current = 0;
    const interval = setInterval(() => {
      current += Math.random() * 18 + 8;
      if (current >= 100) {
        current = 100;
        clearInterval(interval);
        setTimeout(() => onComplete && onComplete(), 500);
      }
      setProgress(Math.min(current, 100));
      setMessage(messages[Math.floor((current / 100) * (messages.length - 1))]);
    }, 280);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="loading-screen">
      <div className="loading-logo">PACE<span>IQ</span></div>
      <div className="loading-tagline">Track. Analyze. Race.</div>

      <div className="runner-container">
        <svg
          className="runner-svg"
          width="64" height="64"
          viewBox="0 0 64 64"
          fill="none"
          style={{ left: "88px" }}
        >
          <style>{`
            @keyframes armSwingF { 0%,100%{transform:rotate(-35deg)} 50%{transform:rotate(35deg)} }
            @keyframes armSwingB { 0%,100%{transform:rotate(35deg)}  50%{transform:rotate(-35deg)} }
            @keyframes legSwingF { 0%,100%{transform:rotate(-40deg)} 50%{transform:rotate(40deg)} }
            @keyframes legSwingB { 0%,100%{transform:rotate(40deg)}  50%{transform:rotate(-40deg)} }
            .arm-f { transform-origin: 32px 22px; animation: armSwingF 0.38s ease-in-out infinite; }
            .arm-b { transform-origin: 32px 22px; animation: armSwingB 0.38s ease-in-out infinite; }
            .leg-f { transform-origin: 32px 36px; animation: legSwingF 0.38s ease-in-out infinite; }
            .leg-b { transform-origin: 32px 36px; animation: legSwingB 0.38s ease-in-out infinite; }
          `}</style>
          <circle cx="32" cy="10" r="7" fill="#1a0a00"/>
          <line x1="32" y1="17" x2="32" y2="36" stroke="#c47a3a" strokeWidth="3" strokeLinecap="round"/>
          <line className="arm-b" x1="32" y1="22" x2="18" y2="30" stroke="#a86228" strokeWidth="2.5" strokeLinecap="round"/>
          <line className="arm-f" x1="32" y1="22" x2="46" y2="30" stroke="#a86228" strokeWidth="2.5" strokeLinecap="round"/>
          <line className="leg-f" x1="32" y1="36" x2="46" y2="52" stroke="#1a0a00" strokeWidth="2.5" strokeLinecap="round"/>
          <line className="leg-b" x1="32" y1="36" x2="18" y2="52" stroke="#1a0a00" strokeWidth="2.5" strokeLinecap="round"/>
        </svg>
        <div className="track-line" />
      </div>

      <div className="loading-bar-wrap">
        <div className="loading-bar-fill" style={{ width: `${progress}%` }} />
      </div>
      <div className="loading-text">{message}</div>
    </div>
  );
}

export default LoadingScreen;