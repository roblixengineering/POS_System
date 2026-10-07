'use server';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { go } from '@/lib/flash';

const creds = z.object({ email: z.string().trim().email(), password: z.string().min(8).max(128) });

export async function signIn(formData: FormData) {
  const parsed = creds.safeParse(Object.fromEntries(formData));
  if (!parsed.success) go('/login', 'error', 'Enter a valid email and password');
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) go('/login', 'error', 'Invalid email or password'); // do not reveal which part was wrong
  redirect('/dashboard');
}

export async function signUp(formData: FormData) {
  const parsed = creds.safeParse(Object.fromEntries(formData));
  if (!parsed.success) go('/signup', 'error', 'Use a valid email and a password of at least 8 characters');
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp(parsed.data);
  if (error) go('/signup', 'error', error.message);
  if (!data.session) go('/login', 'ok', 'Check your email to confirm your account, then sign in.');
  redirect('/onboarding');
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
