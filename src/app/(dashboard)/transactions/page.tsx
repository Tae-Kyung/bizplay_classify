'use client';

import { useEffect, useState, useCallback } from 'react';
import { useCompany } from '@/components/providers/company-provider';
import { Header } from '@/components/layout/header';
import { Modal } from '@/components/ui/modal';
import { AccountSelect } from '@/components/ui/account-select';
import { ConfidenceBadge } from '@/components/ui/confidence-badge';
import { MethodTag } from '@/components/ui/method-tag';
import type { Account } from '@/types';

export default function TransactionsPage() {
  const { company } = useCompany();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedTx, setSelectedTx] = useState<any>(null);
  const [classifyingIds, setClassifyingIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState<{ deleted: number; total: number } | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [confirmingIds, setConfirmingIds] = useState<Set<string>>(new Set());
  const [bulkConfirming, setBulkConfirming] = useState(false);

  const fetchTransactions = useCallback(async () => {
    if (!company) return;
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
    });
    if (search) params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);

    const res = await fetch(`/api/companies/${company.id}/transactions?${params}`);
    const data = await res.json();
    setTransactions(data.data || []);
    setTotal(data.total || 0);
  }, [company, page, perPage, search, statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  useEffect(() => {
    if (!company) return;
    fetch(`/api/companies/${company.id}/accounts`)
      .then((r) => r.json())
      .then((d) => setAccounts(Array.isArray(d) ? d : []));
  }, [company]);

  const classifyTransaction = async (txId: string) => {
    if (!company) return;
    setClassifyingIds((prev) => new Set(prev).add(txId));
    await fetch(`/api/companies/${company.id}/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction_id: txId }),
    });
    setClassifyingIds((prev) => {
      const next = new Set(prev);
      next.delete(txId);
      return next;
    });
    fetchTransactions();
  };

  const confirmResult = async (resultId: string, accountId?: string) => {
    await fetch(`/api/classifications/${resultId}/confirm`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_confirmed: true, confirmed_account_id: accountId || undefined }),
    });
    fetchTransactions();
    setSelectedTx(null);
  };

  const deleteAll = async () => {
    if (!confirm(`전체 ${total}건의 거래를 모두 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    setDeletingAll(true);
    setDeleteProgress({ deleted: 0, total });

    const res = await fetch(`/api/companies/${company!.id}/transactions`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    });

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() ?? '';
      for (const chunk of lines) {
        const line = chunk.replace(/^data: /, '').trim();
        if (!line) continue;
        try {
          const event = JSON.parse(line);
          if (event.type === 'progress') {
            setDeleteProgress({ deleted: event.deleted, total: event.total });
          } else if (event.type === 'done') {
            setDeleteProgress({ deleted: event.deleted, total: event.total });
          }
        } catch { /* ignore */ }
      }
    }

    setSelectedIds(new Set());
    setDeletingAll(false);
    setDeleteProgress(null);
    setPage(1);
    fetchTransactions();
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`선택한 ${selectedIds.size}건의 거래를 삭제하시겠습니까?`)) return;
    setDeleting(true);
    await fetch(`/api/companies/${company!.id}/transactions`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selectedIds) }),
    });
    setSelectedIds(new Set());
    setDeleting(false);
    fetchTransactions();
  };

  const confirmSingle = async (tx: any) => {
    const result = getLatestResult(tx);
    if (!result) return;
    setConfirmingIds((prev) => new Set(prev).add(tx.id));
    await fetch(`/api/classifications/${result.id}/confirm`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_confirmed: true }),
    });
    setConfirmingIds((prev) => {
      const next = new Set(prev);
      next.delete(tx.id);
      return next;
    });
    fetchTransactions();
  };

  const confirmSelected = async () => {
    const toConfirm = transactions.filter(
      (tx) => selectedIds.has(tx.id) && getStatus(tx) === 'classified'
    );
    if (toConfirm.length === 0) return;
    if (!confirm(`선택한 ${toConfirm.length}건의 분류 결과를 확정하시겠습니까?`)) return;
    setBulkConfirming(true);
    await Promise.allSettled(
      toConfirm.map((tx) => {
        const result = getLatestResult(tx);
        if (!result) return Promise.resolve();
        return fetch(`/api/classifications/${result.id}/confirm`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_confirmed: true }),
        });
      })
    );
    setBulkConfirming(false);
    setSelectedIds(new Set());
    fetchTransactions();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === transactions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(transactions.map((tx) => tx.id)));
    }
  };

  const totalPages = Math.ceil(total / perPage);

  if (!company) return <div style={{ color: '#727784' }}>회사를 선택하세요</div>;

  const getStatus = (tx: any) => {
    if (!tx.classification_results?.length) return 'unclassified';
    if (tx.classification_results.some((r: any) => r.is_confirmed)) return 'confirmed';
    return 'classified';
  };

  const getLatestResult = (tx: any) => {
    if (!tx.classification_results?.length) return null;
    return tx.classification_results[tx.classification_results.length - 1];
  };

  const inputStyle = { backgroundColor: '#f0eded', color: '#1b1c1c' };

  return (
    <div>
      <Header
        title="거래 내역"
        description="거래 목록을 조회하고 분류 결과를 확인합니다"
        action={
          <div className="flex gap-2">
            <button
              onClick={() => setImportModalOpen(true)}
              className="px-4 py-2 text-sm rounded-xl font-medium transition-colors"
              style={{ backgroundColor: '#e4e2e1', color: '#1b1c1c' }}
            >
              처리내역 Import
            </button>
            {total > 0 && (
              <button
                onClick={deleteAll}
                disabled={deletingAll}
                className="px-4 py-2 text-sm text-white rounded-xl font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: '#ba1a1a' }}
              >
                {deletingAll ? '삭제 중...' : `전체 삭제 (${total}건)`}
              </button>
            )}
          </div>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="가맹점명 검색..."
          className="px-3 py-2 rounded-xl text-sm w-48 border-0 focus:outline-none"
          style={inputStyle}
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 rounded-xl text-sm border-0 focus:outline-none"
          style={inputStyle}
        >
          <option value="">전체 상태</option>
          <option value="unclassified">미분류</option>
          <option value="classified">분류됨 (미확정)</option>
          <option value="confirmed">확정됨</option>
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          className="px-3 py-2 rounded-xl text-sm border-0 focus:outline-none"
          style={inputStyle}
        />
        <span className="self-center text-sm" style={{ color: '#727784' }}>~</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          className="px-3 py-2 rounded-xl text-sm border-0 focus:outline-none"
          style={inputStyle}
        />
      </div>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-5 px-4 py-3 rounded-xl" style={{ backgroundColor: '#dbeafe' }}>
          <span className="text-sm font-medium" style={{ color: '#1e40af' }}>
            {selectedIds.size}건 선택됨
          </span>
          {transactions.some((tx) => selectedIds.has(tx.id) && getStatus(tx) === 'classified') && (
            <button
              onClick={confirmSelected}
              disabled={bulkConfirming}
              className="px-3 py-1.5 text-sm text-white rounded-lg font-medium disabled:opacity-50"
              style={{ backgroundColor: '#15803d' }}
            >
              {bulkConfirming ? '확정 중...' : '선택 확정'}
            </button>
          )}
          <button
            onClick={deleteSelected}
            disabled={deleting}
            className="px-3 py-1.5 text-sm text-white rounded-lg font-medium disabled:opacity-50"
            style={{ backgroundColor: '#ba1a1a' }}
          >
            {deleting ? '삭제 중...' : '선택 삭제'}
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="px-3 py-1.5 text-sm rounded-lg font-medium"
            style={{ backgroundColor: '#e4e2e1', color: '#1b1c1c' }}
          >
            선택 해제
          </button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#ffffff' }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wide" style={{ backgroundColor: '#f6f3f2', color: '#424752' }}>
              <th className="px-4 py-3.5 w-10">
                <input
                  type="checkbox"
                  checked={transactions.length > 0 && selectedIds.size === transactions.length}
                  onChange={toggleSelectAll}
                  className="rounded"
                />
              </th>
              <th className="px-5 py-3.5">거래일</th>
              <th className="px-5 py-3.5">가맹점명</th>
              <th className="px-5 py-3.5 text-right">금액</th>
              <th className="px-5 py-3.5">계정과목</th>
              <th className="px-5 py-3.5">신뢰도</th>
              <th className="px-5 py-3.5">방법</th>
              <th className="px-5 py-3.5">상태</th>
              <th className="px-5 py-3.5 text-right">작업</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-5 py-10 text-center text-sm" style={{ color: '#727784' }}>
                  거래 내역이 없습니다
                </td>
              </tr>
            ) : (
              transactions.map((tx, idx) => {
                const status = getStatus(tx);
                const result = getLatestResult(tx);
                return (
                  <tr
                    key={tx.id}
                    style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : '#fbf9f8', cursor: 'pointer' }}
                    className="transition-colors hover:brightness-[0.97]"
                    onClick={() => setSelectedTx(tx)}
                  >
                    <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(tx.id)}
                        onChange={() => toggleSelect(tx.id)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-5 py-3.5 text-xs" style={{ color: '#424752' }}>
                      {tx.transaction_date || '-'}
                    </td>
                    <td className="px-5 py-3.5 font-medium" style={{ color: '#1b1c1c' }}>{tx.merchant_name || '-'}</td>
                    <td className="px-5 py-3.5 text-right font-mono text-sm" style={{ color: '#1b1c1c' }}>
                      {Number(tx.amount).toLocaleString()}
                    </td>
                    <td className="px-5 py-3.5">
                      {result?.account ? (
                        <span>
                          <span className="font-mono text-xs mr-1" style={{ color: '#727784' }}>
                            {result.account.code}
                          </span>
                          <span style={{ color: '#1b1c1c' }}>{result.account.name}</span>
                        </span>
                      ) : (
                        <span style={{ color: '#c2c6d4' }}>-</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      {result ? <ConfidenceBadge confidence={result.confidence} /> : '-'}
                    </td>
                    <td className="px-5 py-3.5">
                      {result ? <MethodTag method={result.method} /> : '-'}
                    </td>
                    <td className="px-5 py-3.5">
                      {status === 'confirmed' && (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: '#dcfce7', color: '#166534' }}>확정</span>
                      )}
                      {status === 'classified' && (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: '#fef9c3', color: '#854d0e' }}>미확정</span>
                      )}
                      {status === 'unclassified' && (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: '#e4e2e1', color: '#727784' }}>미분류</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {status === 'unclassified' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            classifyTransaction(tx.id);
                          }}
                          disabled={classifyingIds.has(tx.id)}
                          className="text-xs font-medium transition-opacity hover:opacity-70 disabled:opacity-50"
                          style={{ color: '#00408b' }}
                        >
                          {classifyingIds.has(tx.id) ? '분류 중...' : '분류'}
                        </button>
                      )}
                      {status === 'classified' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            confirmSingle(tx);
                          }}
                          disabled={confirmingIds.has(tx.id)}
                          className="text-xs font-medium transition-opacity hover:opacity-70 disabled:opacity-50"
                          style={{ color: '#15803d' }}
                        >
                          {confirmingIds.has(tx.id) ? '확정 중...' : '확정'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-5">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="px-4 py-1.5 text-sm rounded-xl font-medium disabled:opacity-40 transition-colors"
            style={{ backgroundColor: '#e4e2e1', color: '#1b1c1c' }}
          >
            이전
          </button>
          <span className="text-sm" style={{ color: '#424752' }}>
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="px-4 py-1.5 text-sm rounded-xl font-medium disabled:opacity-40 transition-colors"
            style={{ backgroundColor: '#e4e2e1', color: '#1b1c1c' }}
          >
            다음
          </button>
        </div>
      )}

      {/* 전체 삭제 진행 오버레이 */}
      {deletingAll && deleteProgress && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,64,139,0.15)', backdropFilter: 'blur(4px)' }}
        >
          <div className="rounded-2xl p-8 w-80" style={{ backgroundColor: '#ffffff', boxShadow: '0 40px 80px rgba(0,64,139,0.08)' }}>
            <h3 className="text-base font-semibold mb-1" style={{ color: '#1b1c1c', fontFamily: 'var(--font-plus-jakarta-sans, sans-serif)' }}>
              전체 삭제 중...
            </h3>
            <p className="text-sm mb-5" style={{ color: '#424752' }}>
              잠시만 기다려 주세요
            </p>
            <div className="flex justify-between text-sm mb-2">
              <span style={{ color: '#424752' }}>{deleteProgress.deleted.toLocaleString()}건 삭제됨</span>
              <span style={{ color: '#727784' }}>
                {deleteProgress.total > 0 ? Math.round((deleteProgress.deleted / deleteProgress.total) * 100) : 0}%
              </span>
            </div>
            <div className="w-full rounded-full h-2.5 overflow-hidden" style={{ backgroundColor: '#e4e2e1' }}>
              <div
                className="h-2.5 rounded-full transition-all duration-300"
                style={{
                  width: `${deleteProgress.total > 0 ? Math.round((deleteProgress.deleted / deleteProgress.total) * 100) : 0}%`,
                  background: 'linear-gradient(to right, #00408b, #0057b8)',
                }}
              />
            </div>
            <p className="text-xs mt-3 text-center" style={{ color: '#727784' }}>
              전체 {deleteProgress.total.toLocaleString()}건
            </p>
          </div>
        </div>
      )}

      <TransactionDetailModal
        tx={selectedTx}
        accounts={accounts}
        onClose={() => setSelectedTx(null)}
        onConfirm={confirmResult}
      />

      <TransactionImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        companyId={company.id}
        onImported={() => { setPage(1); fetchTransactions(); }}
      />
    </div>
  );
}

function TransactionDetailModal({
  tx,
  accounts,
  onClose,
  onConfirm,
}: {
  tx: any;
  accounts: Account[];
  onClose: () => void;
  onConfirm: (resultId: string, accountId?: string) => void;
}) {
  const [editAccountId, setEditAccountId] = useState('');
  const [showEdit, setShowEdit] = useState(false);

  if (!tx) return null;

  const result = tx.classification_results?.[tx.classification_results.length - 1];

  return (
    <Modal open={!!tx} onClose={onClose} title="거래 상세" wide>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-xs font-medium" style={{ color: '#424752' }}>가맹점명</span>
            <p className="font-medium mt-0.5" style={{ color: '#1b1c1c' }}>{tx.merchant_name || '-'}</p>
          </div>
          <div>
            <span className="text-xs font-medium" style={{ color: '#424752' }}>업종코드</span>
            <p className="font-medium mt-0.5" style={{ color: '#1b1c1c' }}>{tx.mcc_code || '-'}</p>
          </div>
          <div>
            <span className="text-xs font-medium" style={{ color: '#424752' }}>금액</span>
            <p className="font-medium mt-0.5" style={{ color: '#1b1c1c' }}>{Number(tx.amount).toLocaleString()}원</p>
          </div>
          <div>
            <span className="text-xs font-medium" style={{ color: '#424752' }}>거래일</span>
            <p className="font-medium mt-0.5" style={{ color: '#1b1c1c' }}>{tx.transaction_date || '-'}</p>
          </div>
          <div className="col-span-2">
            <span className="text-xs font-medium" style={{ color: '#424752' }}>적요</span>
            <p className="font-medium mt-0.5" style={{ color: '#1b1c1c' }}>{tx.description || '-'}</p>
          </div>
        </div>

        {result && (
          <div className="space-y-3 pt-4" style={{ borderTop: '1px solid #f0eded' }}>
            <h4 className="font-medium text-sm" style={{ color: '#1b1c1c' }}>분류 결과</h4>
            <div className="flex items-center gap-3">
              <span className="text-xs w-20" style={{ color: '#424752' }}>계정과목</span>
              <span className="font-medium text-sm" style={{ color: '#1b1c1c' }}>
                <span className="font-mono text-xs mr-1" style={{ color: '#727784' }}>{result.account?.code}</span>
                {result.account?.name}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs w-20" style={{ color: '#424752' }}>신뢰도</span>
              <ConfidenceBadge confidence={result.confidence} />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs w-20" style={{ color: '#424752' }}>방법</span>
              <MethodTag method={result.method} />
            </div>
            {result.reason && (
              <div>
                <span className="text-xs" style={{ color: '#424752' }}>사유</span>
                <p className="mt-1.5 text-sm p-3 rounded-xl" style={{ backgroundColor: '#f6f3f2', color: '#1b1c1c' }}>{result.reason}</p>
              </div>
            )}

            {!result.is_confirmed && (
              <div className="pt-2">
                {!showEdit ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => onConfirm(result.id)}
                      className="px-4 py-2 text-sm text-white rounded-xl font-medium transition-opacity hover:opacity-90"
                      style={{ backgroundColor: '#15803d' }}
                    >
                      확정
                    </button>
                    <button
                      onClick={() => setShowEdit(true)}
                      className="px-4 py-2 text-sm rounded-xl font-medium"
                      style={{ backgroundColor: '#e4e2e1', color: '#1b1c1c' }}
                    >
                      수정
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <AccountSelect accounts={accounts} value={editAccountId} onChange={setEditAccountId} />
                    <div className="flex gap-2">
                      <button
                        onClick={() => onConfirm(result.id, editAccountId)}
                        disabled={!editAccountId}
                        className="px-4 py-2 text-sm text-white rounded-xl font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                        style={{ backgroundColor: '#15803d' }}
                      >
                        수정 확정
                      </button>
                      <button
                        onClick={() => setShowEdit(false)}
                        className="px-4 py-2 text-sm rounded-xl font-medium"
                        style={{ backgroundColor: '#e4e2e1', color: '#1b1c1c' }}
                      >
                        취소
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {result.is_confirmed && (
              <div className="text-sm font-medium" style={{ color: '#15803d' }}>확정 완료</div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function TransactionImportModal({
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
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ processed: number; total: number; imported: number; skipped: number } | null>(null);
  const [result, setResult] = useState<any>(null);

  const reset = () => { setFile(null); setResult(null); setProgress(null); };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setResult(null);
    setProgress(null);

    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`/api/companies/${companyId}/transactions/import`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const data = await res.json();
      setResult({ error: data.error || '업로드 실패' });
      setUploading(false);
      return;
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() ?? '';
      for (const chunk of lines) {
        const line = chunk.replace(/^data: /, '').trim();
        if (!line) continue;
        try {
          const event = JSON.parse(line);
          if (event.type === 'progress') {
            setProgress({ processed: event.processed, total: event.total, imported: event.imported, skipped: event.skipped });
          } else if (event.type === 'done') {
            setResult(event);
            onImported();
          }
        } catch { /* ignore */ }
      }
    }
    setUploading(false);
  };

  const pct = progress ? Math.round((progress.processed / progress.total) * 100) : 0;

  return (
    <Modal open={open} onClose={() => { if (!uploading) { onClose(); reset(); } }} title="처리내역 Import">
      <div className="space-y-4">
        {!uploading && !result && (
          <>
            <p className="text-sm" style={{ color: '#424752' }}>
              용도코드가 매핑된 처리내역 CSV를 업로드합니다. 거래가 저장되고, 용도코드가 있는 건은 분류 확정 상태로 등록됩니다.
            </p>
            <p className="text-xs" style={{ color: '#727784' }}>
              필요 컬럼: <code className="px-1.5 py-0.5 rounded-lg" style={{ backgroundColor: '#f0eded' }}>가맹점명, 공급금액, 부가세액, 승인일자</code>
              <br />
              선택 컬럼: <code className="px-1.5 py-0.5 rounded-lg" style={{ backgroundColor: '#f0eded' }}>용도코드, 가맹점업종코드, 가맹점업종명</code>
            </p>
            <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-sm" />
          </>
        )}

        {uploading && progress && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span style={{ color: '#424752' }}>업로드 중...</span>
              <span style={{ color: '#727784' }}>{progress.processed} / {progress.total}건 ({pct}%)</span>
            </div>
            <div className="w-full rounded-full h-2.5 overflow-hidden" style={{ backgroundColor: '#e4e2e1' }}>
              <div className="h-2.5 rounded-full transition-all duration-200" style={{ width: `${pct}%`, background: 'linear-gradient(to right, #00408b, #0057b8)' }} />
            </div>
            <div className="grid grid-cols-2 gap-3 text-center text-xs">
              <div className="rounded-xl p-3" style={{ backgroundColor: '#dcfce7' }}>
                <p style={{ color: '#166534' }}>등록</p>
                <p className="text-lg font-bold" style={{ color: '#15803d' }}>{progress.imported}</p>
              </div>
              <div className="rounded-xl p-3" style={{ backgroundColor: '#ffdad6' }}>
                <p style={{ color: '#ba1a1a' }}>건너뜀</p>
                <p className="text-lg font-bold" style={{ color: '#b91c1c' }}>{progress.skipped}</p>
              </div>
            </div>
          </div>
        )}

        {uploading && !progress && (
          <p className="text-sm text-center py-2" style={{ color: '#424752' }}>파일 분석 중...</p>
        )}

        {result && (
          <div className="p-4 rounded-xl text-sm space-y-1" style={{ backgroundColor: '#f6f3f2' }}>
            {result.error ? (
              <p style={{ color: '#ba1a1a' }}>{result.error}</p>
            ) : (
              <>
                <p className="font-medium" style={{ color: '#15803d' }}>완료</p>
                <p style={{ color: '#1b1c1c' }}>등록: <strong>{result.imported}</strong>건</p>
                <p style={{ color: '#1b1c1c' }}>건너뜀: <strong>{result.skipped}</strong>건</p>
                {result.errors?.length > 0 && (
                  <ul className="mt-2 text-xs max-h-32 overflow-y-auto" style={{ color: '#ba1a1a' }}>
                    {result.errors.slice(0, 10).map((e: any, i: number) => (
                      <li key={i}>행 {e.row}: {e.error}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={() => { onClose(); reset(); }}
            disabled={uploading}
            className="px-4 py-2 text-sm rounded-xl font-medium disabled:opacity-50"
            style={{ backgroundColor: '#e4e2e1', color: '#1b1c1c' }}
          >
            닫기
          </button>
          {!result && (
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="px-4 py-2 text-sm text-white rounded-xl font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: 'linear-gradient(to right, #00408b, #0057b8)' }}
            >
              {uploading ? '처리 중...' : '업로드'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
