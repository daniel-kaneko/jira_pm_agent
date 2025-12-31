"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ThemeSelectorProps, Theme } from "./types";

interface ThemeConfig {
  id: Theme;
  name: string;
  color: string;
  description: string;
  hasEffect?: boolean;
  effectLabel?: string;
}

const themes: ThemeConfig[] = [
  { id: "grey", name: "Grey", color: "#71717a", description: "Clean minimal dark theme" },
  { id: "gruvbox", name: "Gruvbox", color: "#fabd2f", description: "Retro groove with warm colors" },
  { id: "nord", name: "Nord", color: "#88c0d0", description: "Arctic, north-bluish palette" },
  { id: "tokyo", name: "Tokyo", color: "#bb9af7", description: "Night in Tokyo vibes" },
  { id: "catppuccin", name: "Catppuccin", color: "#f5c2e7", description: "Soothing pastel theme" },
  { id: "solarized", name: "Solarized", color: "#268bd2", description: "Classic light theme ☀️" },
  { id: "github", name: "GitHub", color: "#24292e", description: "Clean and familiar light theme 📄" },
  { id: "matrix", name: "Matrix", color: "#00ff41", description: "Enter the Matrix 🐇", hasEffect: true, effectLabel: "+swag?" },
  { id: "christmas", name: "Christmas", color: "#c41e3a", description: "Festive holiday spirit 🎄", hasEffect: true, effectLabel: "+snow?" },
  { id: "space", name: "Space", color: "#818cf8", description: "Deep space exploration 🚀", hasEffect: true, effectLabel: "+warp?" },
  { id: "nightsky", name: "Night Sky", color: "#a5b4fc", description: "Stargazing at midnight ✨", hasEffect: true, effectLabel: "+peace?" },
  { id: "synthwave", name: "Synthwave", color: "#ff00c8", description: "80s neon retrowave 🌆", hasEffect: true, effectLabel: "+vibes?" },
  { id: "ocean", name: "Ocean", color: "#00d4aa", description: "Deep underwater vibes 🌊", hasEffect: true, effectLabel: "+dive?" },
  { id: "cyberpunk", name: "Cyberpunk", color: "#ff2a6d", description: "Neon-lit rain city 🏙️", hasEffect: true, effectLabel: "+rain?" },
  { id: "sakura", name: "Sakura", color: "#ff90b3", description: "Cherry blossom serenity 🌸", hasEffect: true, effectLabel: "+bloom?" },
];

/**
 * Theme selector component with cog icon dropdown.
 */
export function ThemeSelector({
  currentTheme,
  onThemeChange,
  effectsEnabled,
  onEffectsChange,
}: ThemeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  const handleSelect = (theme: Theme): void => {
    onThemeChange(theme);
    setIsOpen(false);
  };

  const handleLogout = async (): Promise<void> => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const currentThemeConfig = themes.find((theme) => theme.id === currentTheme);
  const currentHasEffect = currentThemeConfig?.hasEffect ?? false;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-1 text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors"
        aria-label="Select theme"
      >
        <CogIcon />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 bg-[var(--bg-soft)] border border-[var(--bg-highlight)] py-1 min-w-[200px] animate-fade-in">
            <div className="px-2 py-1 text-xs text-[var(--fg-muted)] border-b border-[var(--bg-highlight)]">
              theme
            </div>
            {themes.map((theme) => (
              <button
                key={theme.id}
                onClick={() => handleSelect(theme.id)}
                data-tooltip={theme.description}
                className={`w-full px-2 py-1 text-sm flex items-center gap-2 hover:bg-[var(--bg-highlight)] transition-colors ${
                  currentTheme === theme.id ? "text-[var(--fg)]" : "text-[var(--fg-dim)]"
                }`}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: theme.color }} />
                <span>{theme.name}</span>
                {currentTheme === theme.id && <span className="ml-auto text-[var(--green)]">✓</span>}
              </button>
            ))}

            {currentHasEffect && (
              <>
                <div className="border-t border-[var(--bg-highlight)] my-1" />
                <label
                  data-tooltip="⚡ Use with care - may affect performance"
                  className="flex items-center gap-2 px-2 py-1 text-sm cursor-pointer hover:bg-[var(--bg-highlight)]"
                >
                  <input
                    type="checkbox"
                    checked={effectsEnabled}
                    onChange={(e) => onEffectsChange(e.target.checked)}
                    className="w-3 h-3 appearance-none rounded-sm border border-[var(--fg-muted)] bg-[var(--bg-highlight)] checked:bg-[var(--accent)] checked:border-[var(--accent)] relative checked:after:content-['✓'] checked:after:absolute checked:after:inset-0 checked:after:flex checked:after:items-center checked:after:justify-center checked:after:text-[8px] checked:after:text-white checked:after:font-bold"
                  />
                  <span className="text-[var(--fg-dim)]">
                    {currentThemeConfig?.effectLabel}
                  </span>
                </label>
              </>
            )}

            <div className="border-t border-[var(--bg-highlight)] my-1" />
            <button
              onClick={handleLogout}
              className="w-full px-2 py-1 text-sm flex items-center gap-2 text-[var(--red)] hover:bg-[var(--bg-highlight)] transition-colors"
            >
              <LogoutIcon />
              <span>Logout</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function CogIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9"
      />
    </svg>
  );
}
