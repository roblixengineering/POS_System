import { redirect } from 'next/navigation';

/** Redirect with a one-shot message. Never call inside try/catch (redirect works by throwing). */
export function go(path: string, kind: 'ok' | 'error', message: string): never {
  redirect(`${path}${path.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(message.slice(0, 300))}`);
}
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');
