import { useEffect, useState } from 'react';
import { DateTime } from 'luxon';

/** One shared UTC instant, refreshed just after each minute boundary. */
export function useCurrentTime() {
  const [nowUtc, setNowUtc] = useState(() => DateTime.utc());

  useEffect(() => {
    let timer = 0;
    const scheduleNextMinute = () => {
      const delay = 60_000 - (Date.now() % 60_000) + 25;
      timer = window.setTimeout(() => {
        setNowUtc(DateTime.utc());
        scheduleNextMinute();
      }, delay);
    };
    scheduleNextMinute();
    return () => window.clearTimeout(timer);
  }, []);

  return nowUtc;
}
