export function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function shiftDay(day: string, offset: number): string {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + offset);
  return localDay(date);
}

export function trackingDateLabel(day: string, today: string): string {
  const date = new Date(`${day}T12:00:00`);
  const formatted = date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    ...(day.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}),
  });
  return `${day === today ? "Today" : date.toLocaleDateString("en-GB", { weekday: "long" })}, ${formatted}`;
}
