import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

/** Per-request Supabase client acting as the signed-in user (RLS applies). */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),

        setAll: (
          list: {
            name: string;
            value: string;
            options?: CookieOptions;
          }[],
        ) => {
          try {
            list.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            /* called from a Server Component: the middleware refreshes the session instead */
          }
        },
      },
    },
  );
}