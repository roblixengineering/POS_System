import Link from 'next/link';
import { signUp } from '../actions';
import { Flash, type FlashParams } from '@/components/flash';
import { SubmitButton } from '@/components/submit-button';

export default async function SignupPage({ searchParams }: { searchParams: Promise<FlashParams> }) {
  const sp = await searchParams;
  return (
    <main className="auth">
      <h1>Create your account</h1>
      <p className="sub">You will set up your business and first branch next.</p>
      <Flash {...sp} />
      <form action={signUp} className="card stack">
        <div><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required /></div>
        <div><label htmlFor="password">Password (min 8)</label><input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required /></div>
        <SubmitButton>Create account</SubmitButton>
      </form>
      <p className="muted">Already registered? <Link href="/login">Sign in</Link></p>
    </main>
  );
}
