// Supabase returns plain PostgrestError objects ({ code, message, details, hint })
// rather than Error instances, so String(err) yields "[object Object]". This
// helper formats anything into a useful log string.
export function formatError(err: unknown): string {
  if (err == null) return 'unknown error';
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (typeof err === 'object') {
    const e = err as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
    const parts: string[] = [];
    if (e.code != null) parts.push(`code=${String(e.code)}`);
    if (typeof e.message === 'string' && e.message) parts.push(e.message);
    if (typeof e.details === 'string' && e.details) parts.push(`details=${e.details}`);
    if (typeof e.hint === 'string' && e.hint) parts.push(`hint=${e.hint}`);
    if (parts.length > 0) return parts.join(' ');
    try {
      return JSON.stringify(err);
    } catch {
      return '[unserializable error]';
    }
  }
  return String(err);
}
