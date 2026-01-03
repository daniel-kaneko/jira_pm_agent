/**
 * Types for the ThemeSelector component
 * @module chat/ThemeSelector/types
 */

/**
 * Available theme options
 */
export type Theme =
  | "grey"
  | "gruvbox"
  | "nord"
  | "tokyo"
  | "catppuccin"
  | "solarized"
  | "github"
  | "matrix"
  | "christmas"
  | "space"
  | "nightsky"
  | "synthwave"
  | "ocean"
  | "cyberpunk"
  | "sakura";

/**
 * Props for the ThemeSelector component
 */
export interface ThemeSelectorProps {
  currentTheme: Theme;
  onThemeChange: (theme: Theme) => void;
  effectsEnabled: boolean;
  onEffectsChange: (enabled: boolean) => void;
  reviewerEnabled: boolean;
  onReviewerChange: (enabled: boolean) => void;
}

/**
 * Theme option definition
 */
export interface ThemeOption {
  id: Theme;
  name: string;
  color: string;
}
