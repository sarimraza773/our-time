export class CalendarAccessError extends Error {}

// Never expose server messages/details/hints: they can include row values or SQL.
export class CalendarRequestError extends Error {
  constructor(status: number, serverCode?: string) {
    const code = serverCode && /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(serverCode) ? serverCode : undefined;
    const http = Number.isInteger(status) && status >= 400 && status <= 599 ? `HTTP ${status}` : 'network unavailable';
    const reference = `Calendar request: ${http}${code ? `; code ${code}` : ''}.`;
    const advice = code === 'PGRST202' || code === 'PGRST205' || code === '42P01' || code === '42883'
      ? 'The calendar database setup is incomplete. Ask the administrator to review migration history.'
      : code === 'PGRST301' || code === 'PGRST303' || status === 401
        ? 'Your session could not be authorized. Sign out and sign in again.'
        : code === '42501' || status === 403
          ? 'Calendar access was denied. Ask the administrator to check membership and access policies.'
          : status === 0
            ? 'Check your connection and retry.'
            : 'Retry, or share this diagnostic reference with the administrator.';
    super(`The latest calendar could not be loaded. ${advice} ${reference}`);
  }
}

export function calendarLoadError(error: unknown): string {
  if (error instanceof CalendarAccessError || error instanceof CalendarRequestError) return error.message;
  return 'The latest calendar could not be loaded. Check your connection and Supabase setup, then retry.';
}
