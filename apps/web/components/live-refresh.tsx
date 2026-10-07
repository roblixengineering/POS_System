'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Realtime is only a nudge: on any change event we re-fetch authoritative server data (router.refresh()).
 * We also refresh when the socket re-subscribes after a drop. RLS decides which events this user receives.
 */
export function LiveRefresh({ tables }: { tables: string[] }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const key = tables.join(','); // stable dependency: the array prop gets a new identity on every render

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 400);
    };
    let channel = supabase.channel(`live-${key}`);
    for (const table of key.split(',')) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, refresh);
    }
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') refresh(); // (re)connected -> re-fetch truth
    });
    return () => {
      clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [router, key]);

  return null;
}
