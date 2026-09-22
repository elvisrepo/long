import { setTheme, useTheme, type Theme } from "../theme";

export function ThemeToggle() {
  const theme = useTheme();
  return (
    <select
      className="theme-toggle"
      aria-label="Color theme"
      title="Color theme"
      value={theme}
      onChange={(event) => setTheme(event.currentTarget.value as Theme)}
    >
      <option value="dark">Dark</option>
      <option value="light">Light</option>
      <option value="sand">Sand</option>
    </select>
  );
}
