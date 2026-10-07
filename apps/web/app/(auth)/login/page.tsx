import Link from 'next/link';
import { signIn } from '../actions';
import { Flash, type FlashParams } from '@/components/flash';
import { SubmitButton } from '@/components/submit-button';

export default async function LoginPage({ searchParams }: { searchParams: Promise<FlashParams> }) {
  const sp = await searchParams;
  return (
    <main className="auth">
      <h1>Sign in</h1>
      <p className="sub">Cloud POS — manage every branch from one place.</p>
      <Flash {...sp} />
      <form action={signIn} className="card stack">
        <div><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required /></div>
        <div><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required /></div>
        <SubmitButton>Sign in</SubmitButton>
      </form>
      <p className="muted">New business? <Link href="/signup">Create an account</Link></p>
    </main>
  );
}
