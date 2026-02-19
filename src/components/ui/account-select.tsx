'use client';

import { useState, useRef, useEffect } from 'react';
import type { Account } from '@/types';

interface AccountSelectProps {
  accounts: Account[];
  value: string;
  onChange: (accountId: string) => void;
  placeholder?: string;
}

export function AccountSelect({
  accounts,
  value,
  onChange,
  placeholder = '계정과목 선택',
}: AccountSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const selected = accounts.find((a) => a.id === value);
  const filtered = accounts.filter(
    (a) =>
      a.is_active &&
      (a.code.includes(search) || a.name.includes(search) || (a.category || '').includes(search))
  );

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full text-left px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {selected ? `${selected.code} - ${selected.name}` : placeholder}
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-hidden">
          <div className="p-2 border-b">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="코드 또는 이름 검색..."
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
          </div>
          <ul className="max-h-48 overflow-y-auto">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-gray-400">결과 없음</li>
            )}
            {filtered.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(a.id);
                    setOpen(false);
                    setSearch('');
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${
                    a.id === value ? 'bg-blue-50 text-blue-700' : ''
                  }`}
                >
                  <span className="font-mono text-xs text-gray-500 mr-2">{a.code}</span>
                  {a.name}
                  {a.category && (
                    <span className="ml-2 text-xs text-gray-400">({a.category})</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
