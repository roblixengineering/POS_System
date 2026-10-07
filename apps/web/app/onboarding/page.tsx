import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createBusiness } from './actions';
import { Flash, type FlashParams } from '@/components/flash';
import { SubmitButton } from '@/components/submit-button';

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<FlashParams> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle();
  if (profile) redirect('/dashboard');
  const sp = await searchParams;

  return (
    <main className="auth">
      <h1>Set up your business</h1>
      <p className="sub">This creates your business, first branch, register and the Owner role for you.</p>
      <Flash {...sp} />
      <form action={createBusiness} className="card stack">
        <div><label htmlFor="businessName">Business name</label><input id="businessName" name="businessName" required /></div>
        <div className="row">
          <div><label htmlFor="currency">Currency (ISO)</label><input id="currency" name="currency" defaultValue="PKR" maxLength={3} required /></div>
          <div><label htmlFor="fullName">Your name</label><input id="fullName" name="fullName" required /></div>
        </div>
        <div className="row">
          <div><label htmlFor="branchName">First branch name</label><input id="branchName" name="branchName" defaultValue="Main Branch" required /></div>
          <div><label htmlFor="branchCode">Branch code</label><input id="branchCode" name="branchCode" defaultValue="MB" maxLength={8} required /></div>
        </div>
        <SubmitButton>Create business</SubmitButton>
      </form>
    </main>
  );
}
