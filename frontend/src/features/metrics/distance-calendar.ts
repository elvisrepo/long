export function calendarDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export function distanceCalendarDates(
  from: string,
  to: string,
  timeZone: string,
): string[] {
  const first = calendarDate(from, timeZone);
  const last = calendarDate(to, timeZone);
  const days: string[] = [];
  const cursor = new Date(`${first}T12:00:00Z`);
  // Iterate calendar dates in UTC, not 24-hour intervals in the viewer's zone.
  for (
    let date = first;
    date <= last;
    date = cursor.toISOString().slice(0, 10)
  ) {
    days.push(date);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}
