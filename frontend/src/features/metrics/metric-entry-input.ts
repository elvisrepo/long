export function parseMetricEntryValue(value: string) {
  if (value.trim() === "") {
    return undefined;
  }

  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) ? parsedValue : undefined;
}

export function formatDateTimeLocalInput(isoTimestamp: string) {
  const timestamp = new Date(isoTimestamp);
  const localTimestamp = new Date(
    timestamp.getTime() - timestamp.getTimezoneOffset() * 60 * 1000,
  );
  return localTimestamp.toISOString().slice(0, 16);
}

export function isValidSleepWindow(bedtime: string, wakeTime: string) {
  return (
    bedtime !== "" &&
    wakeTime !== "" &&
    new Date(wakeTime).getTime() > new Date(bedtime).getTime()
  );
}

export function getSleepDurationHours(bedtime: string, wakeTime: string) {
  if (!isValidSleepWindow(bedtime, wakeTime)) {
    return undefined;
  }

  return (
    (new Date(wakeTime).getTime() - new Date(bedtime).getTime()) /
    (60 * 60 * 1000)
  );
}
