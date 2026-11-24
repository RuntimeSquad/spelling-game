import React, { useEffect, useState } from "react";
import "./celebration.css";

export default function FiveStarCelebration() {
  const [celebrating, setCelebrating] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setCelebrating(false), 7000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <>
      <div className="perfect-banner" role="status">
        <span>🏆</span>
        <strong>PERFECT FIVE!</strong>
        <p>Five words. Five stars. Un-bee-lievable!</p>
      </div>
      {celebrating && (
        <>
          <div className="victory-spectacle" aria-hidden="true">
            <div className="victory-aura" />
            {Array.from({ length: 100 }, (_, i) => (
              <i
                className="victory-confetti"
                key={i}
                style={
                  {
                    "--x": `${(i * 37) % 101}%`,
                    "--drift": `${((i * 53) % 300) - 150}px`,
                    "--delay": `${(i % 20) * 0.11}s`,
                    "--duration": `${3 + (i % 5) * 0.3}s`,
                    "--spin": `${360 + i * 29}deg`,
                    background: [
                      "#f8be35",
                      "#e9748b",
                      "#68bca2",
                      "#9b88e2",
                      "#ef8c3d",
                    ][i % 5],
                  } as React.CSSProperties
                }
              />
            ))}
            {Array.from({ length: 6 }, (_, i) => (
              <div
                className="victory-firework"
                key={i}
                style={{
                  left: `${12 + (i % 3) * 36}%`,
                  top: `${20 + Math.floor(i / 3) * 45}%`,
                  animationDelay: `${i * 0.3}s`,
                }}
              >
                {Array.from({ length: 10 }, (_, j) => (
                  <span
                    key={j}
                    style={{ "--angle": `${j * 36}deg` } as React.CSSProperties}
                  >
                    ✦
                  </span>
                ))}
              </div>
            ))}
            <div className="victory-center">
              <div className="victory-crown">👑</div>
              <div className="victory-bee">🐝</div>
              <strong>PERFECT FIVE!</strong>
              <div className="victory-five">★★★★★</div>
            </div>
          </div>
          <button
            className="victory-dismiss secondary"
            onClick={() => setCelebrating(false)}
          >
            Finish celebration
          </button>
        </>
      )}
    </>
  );
}
