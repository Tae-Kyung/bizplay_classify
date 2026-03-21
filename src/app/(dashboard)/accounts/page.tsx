'use client';

import { useEffect, useState, useCallback } from 'react';
import { useCompany } from '@/components/providers/company-provider';
import { Header } from '@/components/layout/header';
import { Modal } from '@/components/ui/modal';
import type { Account } from '@/types';

export default function AccountsPage() {
  const { company } = useCompany();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

  const fetchAccounts = useCallback(async () => {
    if (!company) return;
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (categoryFilter) params.set('category', categoryFilter);
    if (showInactive) params.set('active', 'false');
    const res = await fetch(`/api/companies/${company.id}/accounts?${params}`);
    const data = await res.json();
    setAccounts(Array.isArray(data) ? data : []);
  }, [company, search, categoryFilter, showInactive]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const categories = [...new Set(accounts.map((a) => a.category).filter(Boolean))] as string[];

  if (!company) return <div style={{ color: '#727784' }}>회사를 선택하세요</div>;

  return (
    <div>
      <Header
        title="계정과목 관리"
        description="회사별 계정과목을 등록하고 관리합니다"
        action={
          <div className="flex gap-2">
            <button
              onClick={() => setImportModalOpen(true)}
              className="px-4 py-2 text-sm rounded-xl font-medium transition-colors"
              style={{ backgroundColor: '#e4e2e1', color: '#1b1c1c' }}
            >
              CSV Import
            </button>
            <button
              onClick={() => {
                setEditingAccount(null);
                setModalOpen(true);
              }}
              className="px-4 py-2 text-sm text-white rounded-xl font-medium transition-opacity hover:opacity-90"
              style={{ background: 'linear-gradient(to right, #00408b, #0057b8)' }}
            >
              추가
            </button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="코드 또는 이름으로 검색..."
          className="px-3 py-2 rounded-xl text-sm w-64 border-0 focus:outline-none focus:ring-2"
          style={{ backgroundColor: '#f0eded', color: '#1b1c1c', '--tw-ring-color': '#00408b' } as React.CSSProperties}
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 rounded-xl text-sm border-0 focus:outline-none"
          style={{ backgroundColor: '#f0eded', color: '#1b1c1c' }}
        >
          <option value="">전체 분류</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm" style={{ color: '#424752' }}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          비활성 포함
        </label>
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#ffffff' }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wide" style={{ backgroundColor: '#f6f3f2', color: '#424752' }}>
              <th className="px-5 py-3.5">코드</th>
              <th className="px-5 py-3.5">계정과목명</th>
              <th className="px-5 py-3.5">분류</th>
              <th className="px-5 py-3.5">상태</th>
              <th className="px-5 py-3.5 text-right">작업</th>
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-sm" style={{ color: '#727784' }}>
                  계정과목이 없습니다. 추가하거나 CSV로 가져오세요.
                </td>
              </tr>
            ) : (
              accounts.map((a, idx) => (
                <tr
                  key={a.id}
                  style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : '#fbf9f8' }}
                  className="transition-colors hover:brightness-[0.98]"
                >
                  <td className="px-5 py-3.5 font-mono text-xs" style={{ color: '#424752' }}>{a.code}</td>
                  <td className="px-5 py-3.5 font-medium" style={{ color: '#1b1c1c' }}>{a.name}</td>
                  <td className="px-5 py-3.5 text-sm" style={{ color: '#424752' }}>{a.category || '-'}</td>
                  <td className="px-5 py-3.5">
                    {a.is_active ? (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: '#dcfce7', color: '#166534' }}>활성</span>
                    ) : (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: '#e4e2e1', color: '#727784' }}>비활성</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => {
                        setEditingAccount(a);
                        setModalOpen(true);
                      }}
                      className="text-xs font-medium mr-3 transition-opacity hover:opacity-70"
                      style={{ color: '#00408b' }}
                    >
                      수정
                    </button>
                    {a.is_active ? (
                      <button
                        onClick={async () => {
                          if (!confirm('비활성화하시겠습니까?')) return;
                          await fetch(
                            `/api/companies/${company.id}/accounts/${a.id}`,
                            { method: 'DELETE' }
                          );
                          fetchAccounts();
                        }}
                        className="text-xs font-medium transition-opacity hover:opacity-70"
                        style={{ color: '#ba1a1a' }}
                      >
                        비활성화
                      </button>
                    ) : (
                      <button
                        onClick={async () => {
                          if (!confirm('활성화하시겠습니까?')) return;
                          await fetch(
                            `/api/companies/${company.id}/accounts/${a.id}`,
                            {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ is_active: true }),
                            }
                          );
                          fetchAccounts();
                        }}
                        className="text-xs font-medium transition-opacity hover:opacity-70"
                        style={{ color: '#1a7a4a' }}
                      >
                        활성화
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <AccountFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        account={editingAccount}
        companyId={company.id}
        onSaved={fetchAccounts}
      />

      <CsvImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        companyId={company.id}
        onImported={fetchAccounts}
      />
    </div>
  );
}

function AccountFormModal({
  open,
  onClose,
  account,
  companyId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  account: Account | null;
  companyId: string;
  onSaved: () => void;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (account) {
      setCode(account.code);
      setName(account.name);
      setCategory(account.category || '');
    } else {
      setCode('');
      setName('');
      setCategory('');
    }
    setError('');
  }, [account, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    const url = account
      ? `/api/companies/${companyId}/accounts/${account.id}`
      : `/api/companies/${companyId}/accounts`;

    const res = await fetch(url, {
      method: account ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        account
          ? { name, category: category || null }
          : { code, name, category: category || undefined }
      ),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(typeof data.error === 'string' ? data.error : '저장에 실패했습니다');
      setSaving(false);
      return;
    }

    setSaving(false);
    onSaved();
    onClose();
  };

  const inputStyle = { backgroundColor: '#f0eded', color: '#1b1c1c' };
  const labelStyle = { color: '#424752', fontSize: '0.8125rem', fontWeight: '500' };

  return (
    <Modal open={open} onClose={onClose} title={account ? '계정과목 수정' : '계정과목 추가'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block mb-1.5" style={labelStyle}>코드 *</label>
          <input
            required
            disabled={!!account}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl text-sm border-0 focus:outline-none disabled:opacity-50"
            style={inputStyle}
            placeholder="예: 51100"
          />
        </div>
        <div>
          <label className="block mb-1.5" style={labelStyle}>계정과목명 *</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl text-sm border-0 focus:outline-none"
            style={inputStyle}
            placeholder="예: 복리후생비"
          />
        </div>
        <div>
          <label className="block mb-1.5" style={labelStyle}>대분류</label>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl text-sm border-0 focus:outline-none"
            style={inputStyle}
            placeholder="예: 판관비"
          />
        </div>
        {error && (
          <div className="text-sm p-3 rounded-xl" style={{ backgroundColor: '#ffdad6', color: '#ba1a1a' }}>
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-xl font-medium" style={{ backgroundColor: '#e4e2e1', color: '#1b1c1c' }}>
            취소
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm text-white rounded-xl font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: 'linear-gradient(to right, #00408b, #0057b8)' }}
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CsvImportModal({
  open,
  onClose,
  companyId,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<any>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`/api/companies/${companyId}/accounts/import`, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    setResult(data);
    setUploading(false);
    onImported();
  };

  return (
    <Modal open={open} onClose={() => { onClose(); setFile(null); setResult(null); }} title="CSV Import">
      <div className="space-y-4">
        <p className="text-sm" style={{ color: '#424752' }}>
          CSV 파일 형식: <code className="px-1.5 py-0.5 rounded-lg text-xs" style={{ backgroundColor: '#f0eded' }}>code,name,category</code> 또는 <code className="px-1.5 py-0.5 rounded-lg text-xs" style={{ backgroundColor: '#f0eded' }}>용도코드,용도명,사용여부</code>
        </p>
        <input
          type="file"
          accept=".csv"
          onChange={(e) => {
            setFile(e.target.files?.[0] || null);
            setResult(null);
          }}
          className="text-sm"
        />
        {result && (
          <div className="p-4 rounded-xl text-sm" style={{ backgroundColor: '#f6f3f2' }}>
            <p style={{ color: '#1b1c1c' }}>가져오기: <strong>{result.imported}</strong>건 성공</p>
            <p style={{ color: '#1b1c1c' }}>건너뜀: <strong>{result.skipped}</strong>건</p>
            {result.errors?.length > 0 && (
              <ul className="mt-2 text-xs" style={{ color: '#ba1a1a' }}>
                {result.errors.slice(0, 5).map((e: any, i: number) => (
                  <li key={i}>행 {e.row}: {e.error}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={() => { onClose(); setFile(null); setResult(null); }} className="px-4 py-2 text-sm rounded-xl font-medium" style={{ backgroundColor: '#e4e2e1', color: '#1b1c1c' }}>
            닫기
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="px-4 py-2 text-sm text-white rounded-xl font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: 'linear-gradient(to right, #00408b, #0057b8)' }}
          >
            {uploading ? '업로드 중...' : '가져오기'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
