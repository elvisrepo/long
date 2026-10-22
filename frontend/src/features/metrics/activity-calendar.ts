export function calendarDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export function activityCalendarDates(
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

export function activityBars(
  dates: string[],
  dailyValues: ReadonlyMap<string, number>,
  weekly = false,
): { dates: string[]; values: (number | null)[]; recordedDays: number[] } {
  const first = dates.findIndex((date) => dailyValues.has(date));
  const last = dates.findLastIndex((date) => dailyValues.has(date));
  const activeDates = first < 0 ? [] : dates.slice(first, last + 1);
  const buckets = new Map<string, { value: number | null; count: number }>();
  for (const date of activeDates) {
    const cursor = new Date(`${date}T12:00:00Z`);
    if (weekly)
      cursor.setUTCDate(cursor.getUTCDate() - ((cursor.getUTCDay() + 6) % 7));
    const key = cursor.toISOString().slice(0, 10);
    const bucket = buckets.get(key) ?? { value: null, count: 0 };
    if (dailyValues.has(date)) {
      bucket.value = (bucket.value ?? 0) + dailyValues.get(date)!;
      bucket.count++;
    }
    buckets.set(key, bucket);
  }
  return {
    dates: [...buckets.keys()],
    values: [...buckets.values()].map((bucket) => bucket.value),
    recordedDays: [...buckets.values()].map((bucket) => bucket.count),
  };
}
