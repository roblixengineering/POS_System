import { createClient } from '@/lib/supabase/server';

/** Calls a Postgres function as the signed-in user. Errors raised by the database are user-readable. */
export async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}
