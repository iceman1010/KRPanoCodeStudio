import { useEffect, useState } from "react";

export function SplashScreen({ version }: { version: string }) {
  const [visible, setVisible] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFadeOut(true);
      setTimeout(() => setVisible(false), 500);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-background transition-opacity duration-500 ${
        fadeOut ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      role="status"
      aria-label="Loading"
    >
      <div className="flex flex-col items-center gap-4">
        <img
          src="/panomatics-logo.png"
          alt="Panomatics"
          className="w-32 h-32 object-contain"
        />
        <p className="text-muted-foreground text-sm font-mono">
          v{version}
        </p>
      </div>
    </div>
  );
}