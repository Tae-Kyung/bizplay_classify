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

  if (!company) return <div className="text-gray-400">회사를 선택하세요</div>;

  return (
    <div>
      <Header
        title="계정과목 관리"
        description="회사별 계정과목을 등록하고 관리합니다"
        action={
          <div className="flex gap-2">
            <button
              onClick={() => setImportModalOpen(true)}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              CSV Import
            </button>
            <button
              onClick={() => {
                setEditingAccount(null);
                setModalOpen(true);
              }}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              추가
            </button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="코드 또는 이름으로 검색..."
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-64"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">전체 분류</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          비활성 포함
        </label>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-gray-500">
              <th className="px-4 py-3">코드</th>
              <th className="px-4 py-3">계정과목명</th>
              <th className="px-4 py-3">분류</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3 text-right">작업</th>
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  계정과목이 없습니다. 추가하거나 CSV로 가져오세요.
                </td>
              </tr>
            ) : (
              accounts.map((a) => (
                <tr key={a.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs">{a.code}</td>
                  <td className="px-4 py-3">{a.name}</td>
                  <td className="px-4 py-3 text-gray-500">{a.category || '-'}</td>
                  <td className="px-4 py-3">
                    {a.is_active ? (
                      <span className="text-green-600 text-xs">활성</span>
                    ) : (
                      <span className="text-gray-400 text-xs">비활성</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => {
                        setEditingAccount(a);
                        setModalOpen(true);
                      }}
                      className="text-blue-600 hover:underline text-xs mr-3"
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
                        className="text-red-500 hover:underline text-xs"
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
                        className="text-green-600 hover:underline text-xs"
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

      {/* Add/Edit Modal */}
      <AccountFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        account={editingAccount}
        companyId={company.id}
        onSaved={fetchAccounts}
      />

      {/* CSV Import Modal */}
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

  return (
    <Modal open={open} onClose={onClose} title={account ? '계정과목 수정' : '계정과목 추가'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">코드 *</label>
          <input
            required
            disabled={!!account}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100"
            placeholder="예: 51100"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">계정과목명 *</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            placeholder="예: 복리후생비"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">대분류</label>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            placeholder="예: 판관비"
          />
        </div>
        {error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm border rounded-lg">
            취소
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
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
        <p className="text-sm text-gray-500">
          CSV 파일 형식: <code className="bg-gray-100 px-1 rounded">code,name,category</code>
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
          <div className="bg-gray-50 p-3 rounded text-sm">
            <p>가져오기: <strong>{result.imported}</strong>건 성공</p>
            <p>건너뜀: <strong>{result.skipped}</strong>건</p>
            {result.errors?.length > 0 && (
              <ul className="mt-2 text-red-600 text-xs">
                {result.errors.slice(0, 5).map((e: any, i: number) => (
                  <li key={i}>행 {e.row}: {e.error}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={() => { onClose(); setFile(null); setResult(null); }} className="px-4 py-2 text-sm border rounded-lg">
            닫기
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {uploading ? '업로드 중...' : '가져오기'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
