import { requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { Flash, type FlashParams } from '@/components/flash';
import { SubmitButton } from '@/components/submit-button';
import { createBranch } from './actions';

export default async function BranchesPage({ searchParams }: { searchParams: Promise<FlashParams> }) {
  const sp = await searchParams;
  await requirePermission('branches.manage');
  const supabase = await createClient();
  const { data } = await supabase.from('branches').select('id, code, name, address, timezone, is_active, warehouses(name), registers(name)').order('name');
  return (
    <>
      <h1>Branches</h1>
      <Flash {...sp} />
      <form action={createBranch} className="card row">
        <div><label htmlFor="name">Name</label><input id="name" name="name" required /></div>
        <div><label htmlFor="code">Code</label><input id="code" name="code" maxLength={8} required /></div>
        <div><label htmlFor="address">Address</label><input id="address" name="address" /></div>
        <div><label htmlFor="timezone">Timezone</label><input id="timezone" name="timezone" defaultValue="Asia/Karachi" /></div>
        <div className="fit"><SubmitButton>Add branch</SubmitButton></div>
      </form>
      <div className="card scroll"><table>
        <thead><tr><th>Code</th><th>Name</th><th>Address</th><th>Stores</th><th>Registers</th></tr></thead>
        <tbody>{(data ?? []).map((b) => (
          <tr key={b.id}><td>{b.code}</td><td>{b.name}</td><td>{b.address ?? '—'}</td>
            <td>{(b.warehouses as unknown as { name: string }[]).map((w) => w.name).join(', ')}</td>
            <td>{(b.registers as unknown as { name: string }[]).map((r) => r.name).join(', ')}</td></tr>))}</tbody>
      </table></div>
    </>
  );
}
