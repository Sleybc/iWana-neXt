export function dashboardDayKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('es-CO', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  return ['year', 'month', 'day']
    .map((type) => parts.find((part) => part.type === type)?.value)
    .join('-');
}

export function dashboardDayRange(day: string, timeZone: string): { from: string; to: string } {
  const offset = new Intl.DateTimeFormat('en', { timeZone, timeZoneName: 'longOffset' });
  const localMidnight = (utcMidnight: number) => {
    const offsetAt = (timestamp: number) => {
      const label = offset
        .formatToParts(timestamp)
        .find(({ type }) => type === 'timeZoneName')?.value;
      const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(label ?? '');
      if (!match) return 0;
      return (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) * 60_000;
    };
    const estimate = utcMidnight - offsetAt(utcMidnight);
    const adjusted = utcMidnight - offsetAt(estimate);
    // Si un cambio de hora salta la medianoche, el día empieza en el instante posterior.
    const start =
      offsetAt(adjusted) === offsetAt(estimate) ? adjusted : Math.max(estimate, adjusted);
    return new Date(start).toISOString();
  };
  const utc = Date.parse(`${day}T00:00:00Z`);
  return { from: localMidnight(utc), to: localMidnight(utc + 86_400_000) };
}
