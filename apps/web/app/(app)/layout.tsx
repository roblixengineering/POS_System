import { getContext } from '@/lib/session';
import { NavLinks } from '@/components/nav-links';
import { signOut } from '../(auth)/actions';
import type { Permission } from '@cloud-pos/permissions';

const NAV: { href: string; label: string; perm: Permission }[] = [
  { href: '/dashboard', label: 'Dashboard', perm: 'reports.view' },
  { href: '/pos', label: 'POS', perm: 'sales.create' },
  { href: '/sales', label: 'Sales', perm: 'sales.view_own' },
  { href: '/inventory', label: 'Inventory', perm: 'inventory.view' },
  { href: '/inventory/transfers', label: 'Transfers', perm: 'inventory.view' },
  { href: '/purchases', label: 'Receiving', perm: 'purchases.view' },
  { href: '/products', label: 'Products', perm: 'products.manage' },
  { href: '/customers', label: 'Customers', perm: 'customers.view' },
  { href: '/suppliers', label: 'Suppliers', perm: 'suppliers.view' },
  { href: '/expenses', label: 'Expenses', perm: 'expenses.view' },
  { href: '/reports', label: 'Reports', perm: 'reports.view' },
  { href: '/branches', label: 'Branches', perm: 'branches.manage' },
  { href: '/settings', label: 'Staff & settings', perm: 'users.view' },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext();
  const items = NAV.filter((n) => ctx.permissions.has(n.perm));
  return (
    <div className="shell">
      <nav className="side" aria-label="Main">
        <div className="biz">{ctx.business.name}</div>
        <div className="who">{ctx.fullName} · {ctx.roleName}</div>
        <NavLinks items={items.map(({ href, label }) => ({ href, label }))} />
        <form action={signOut}><button className="ghost" style={{ color: '#cfdcd6', borderColor: '#3b4a44', width: '100%' }}>Sign out</button></form>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
