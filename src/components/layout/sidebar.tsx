'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useCompany } from '@/components/providers/company-provider';

const navItems = [
  { href: '/dashboard', label: '대시보드', icon: '📊' },
  { href: '/accounts', label: '계정과목', icon: '📋' },
  { href: '/rules', label: '분류 룰', icon: '⚙️' },
  { href: '/classify', label: '거래 분류', icon: '🏷️' },
  { href: '/classify/batch', label: '일괄 분류', icon: '📦' },
  { href: '/transactions', label: '거래 내역', icon: '📄' },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { company, companies, setCompany } = useCompany();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <aside className="w-64 bg-gray-900 text-white flex flex-col min-h-screen">
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-lg font-bold">Bizplay Classify</h1>
        {companies.length > 1 ? (
          <select
            className="mt-2 w-full bg-gray-800 text-sm rounded px-2 py-1 border border-gray-600"
            value={company?.id || ''}
            onChange={(e) => {
              const c = companies.find((c) => c.id === e.target.value);
              if (c) setCompany(c);
            }}
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : company ? (
          <p className="mt-1 text-sm text-gray-400">{company.name}</p>
        ) : null}
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-gray-700">
        <button
          onClick={handleLogout}
          className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
        >
          로그아웃
        </button>
      </div>
    </aside>
  );
}
