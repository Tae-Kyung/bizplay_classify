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
    <aside className="w-64 flex flex-col min-h-screen" style={{ backgroundColor: '#00408b' }}>
      <div className="p-5 pb-4">
        <h1 className="text-base font-semibold text-white tracking-tight" style={{ fontFamily: 'var(--font-plus-jakarta-sans, sans-serif)' }}>
          Bizplay Classify
        </h1>
        {companies.length > 0 && (
          <div className="mt-3 flex gap-1.5">
            <select
              className="flex-1 text-sm rounded-lg px-2.5 py-1.5 border-0 focus:outline-none"
              style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#ffffff' }}
              value={company?.id || ''}
              onChange={(e) => {
                const c = companies.find((c) => c.id === e.target.value);
                if (c) setCompany(c);
              }}
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id} style={{ backgroundColor: '#00408b', color: '#ffffff' }}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="px-2.5 py-1.5 text-sm font-medium text-white rounded-lg transition-colors"
              style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
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
              className="w-full text-sm rounded-lg px-2.5 py-1.5 border-0 focus:outline-none placeholder-white/50"
              style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#ffffff' }}
            />
            <input
              value={newBizNum}
              onChange={(e) => setNewBizNum(e.target.value)}
              placeholder="사업자번호 (선택)"
              className="w-full text-sm rounded-lg px-2.5 py-1.5 border-0 focus:outline-none placeholder-white/50"
              style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#ffffff' }}
            />
            {createError && (
              <p className="text-xs text-red-300">{createError}</p>
            )}
            <div className="flex gap-1.5">
              <button
                type="submit"
                disabled={creating}
                className="flex-1 px-2.5 py-1.5 text-xs font-medium text-white rounded-lg transition-colors disabled:opacity-50"
                style={{ backgroundColor: 'rgba(255,255,255,0.25)' }}
              >
                {creating ? '생성 중...' : '생성'}
              </button>
              <button
                type="button"
                onClick={() => { setShowCreate(false); setCreateError(''); }}
                className="px-2.5 py-1.5 text-xs text-white/70 rounded-lg transition-colors"
                style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
              >
                취소
              </button>
            </div>
          </form>
        )}
      </div>

      <nav className="flex-1 px-3 pb-3 space-y-0.5">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                isActive
                  ? 'text-white font-medium'
                  : 'text-white/70 hover:text-white'
              }`}
              style={isActive ? { backgroundColor: 'rgba(255,255,255,0.2)' } : {}}
              onMouseEnter={(e) => {
                if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.1)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = '';
              }}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-3 pt-2">
        <button
          onClick={handleLogout}
          className="w-full text-left px-3 py-2.5 text-sm text-white/60 hover:text-white rounded-xl transition-colors"
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.1)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = '';
          }}
        >
          로그아웃
        </button>
      </div>
    </aside>
  );
}
