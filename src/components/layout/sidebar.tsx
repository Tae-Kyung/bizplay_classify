'use client';

import { useState } from 'react';
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
  { href: '/settings', label: '설정', icon: '🔧' },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { company, companies, setCompany, refetch } = useCompany();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBizNum, setNewBizNum] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError('');
    try {
      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, business_number: newBizNum || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
        setCreating(false);
        return;
      }
      await refetch();
      setCompany(data);
      setShowCreate(false);
      setNewName('');
      setNewBizNum('');
    } catch (err: any) {
      setCreateError(err.message);
    }
    setCreating(false);
  };

  return (
    <aside className="w-64 bg-gray-900 text-white flex flex-col min-h-screen">
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-lg font-bold">Bizplay Classify</h1>
        {companies.length > 0 && (
          <div className="mt-2 flex gap-1">
            <select
              className="flex-1 bg-gray-800 text-sm rounded px-2 py-1 border border-gray-600"
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
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="px-2 py-1 bg-gray-700 text-gray-300 rounded border border-gray-600 hover:bg-gray-600 text-sm"
              title="새 회사 추가"
            >
              +
            </button>
          </div>
        )}
        {showCreate && (
          <form onSubmit={handleCreateCompany} className="mt-3 space-y-2">
            <input
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="회사명"
              className="w-full bg-white text-gray-900 text-sm rounded px-2 py-1.5 border border-gray-400 placeholder-gray-400"
            />
            <input
              value={newBizNum}
              onChange={(e) => setNewBizNum(e.target.value)}
              placeholder="사업자번호 (선택)"
              className="w-full bg-white text-gray-900 text-sm rounded px-2 py-1.5 border border-gray-400 placeholder-gray-400"
            />
            {createError && (
              <p className="text-xs text-red-400">{createError}</p>
            )}
            <div className="flex gap-1">
              <button
                type="submit"
                disabled={creating}
                className="flex-1 px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {creating ? '생성 중...' : '생성'}
              </button>
              <button
                type="button"
                onClick={() => { setShowCreate(false); setCreateError(''); }}
                className="px-2 py-1 bg-gray-700 text-gray-300 text-xs rounded hover:bg-gray-600"
              >
                취소
              </button>
            </div>
          </form>
        )}
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
