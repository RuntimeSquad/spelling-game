import React, { useEffect, useState } from "react";
import "./celebration.css";

export default function FourStarCelebration() {
  const [celebrating, setCelebrating] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setCelebrating(false), 4000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div
      className={"four-star-banner " + (celebrating ? "four-star-active" : "")}
    >
      <div role="status">
        <span className="four-star-bee" aria-hidden="true">
          🐝
        </span>
        <strong>FANTASTIC FOUR!</strong>
        <p>Four brilliant words. You’re flying high!</p>
      </div>
      {celebrating && (
        <>
          <div className="four-star-party" aria-hidden="true">
            {Array.from({ length: 28 }, (_, i) => (
              <i
                key={i}
                style={
                  {
                    left: `${(i * 37) % 100}%`,
                    background: ["#e8b542", "#7cab88", "#e9b3a1"][i % 3],
                    "--delay": `${(i % 8) * 0.12}s`,
                    "--drift": `${(i % 2 ? 1 : -1) * (20 + i * 2)}px`,
                    "--spin": `${180 + i * 23}deg`,
                  } as React.CSSProperties
                }
              />
            ))}
            {[0, 1, 2, 3].map((i) => (
              <span
                className="four-star-spark"
                key={i}
                style={{
                  left: `${12 + i * 25}%`,
                  top: `${i % 2 ? 65 : 24}%`,
                  animationDelay: `${i * 0.18}s`,
                }}
              >
                ✦
              </span>
            ))}
          </div>
          <button
            className="text-button four-star-dismiss"
            onClick={() => setCelebrating(false)}
          >
            Finish celebration
          </button>
        </>
      )}
    </div>
  );
}
