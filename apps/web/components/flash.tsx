export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  return (
    <div className={`msg ${error ? 'error' : 'ok'}`} role={error ? 'alert' : 'status'}>
      {error ?? ok}
    </div>
  );
}
export type FlashParams = { ok?: string; error?: string };
