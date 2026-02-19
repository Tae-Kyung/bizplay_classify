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
      body: JSON.stringify({
        is_confirmed: true,
        confirmed_account_id: accountId || undefined,
      }),
    });
    fetchTransactions();
    setSelectedTx(null);
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

  if (!company) return <div className="text-gray-400">회사를 선택하세요</div>;

  const getStatus = (tx: any) => {
    if (!tx.classification_results?.length) return 'unclassified';
    if (tx.classification_results.some((r: any) => r.is_confirmed)) return 'confirmed';
    return 'classified';
  };

  const getLatestResult = (tx: any) => {
    if (!tx.classification_results?.length) return null;
    return tx.classification_results[tx.classification_results.length - 1];
  };

  return (
    <div>
      <Header title="거래 내역" description="거래 목록을 조회하고 분류 결과를 확인합니다" />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="가맹점명 검색..."
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-48"
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
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
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
        <span className="self-center text-gray-400">~</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
      </div>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-4 bg-blue-50 px-4 py-2 rounded-lg">
          <span className="text-sm text-blue-700 font-medium">
            {selectedIds.size}건 선택됨
          </span>
          <button
            onClick={deleteSelected}
            disabled={deleting}
            className="px-3 py-1 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? '삭제 중...' : '선택 삭제'}
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-white"
          >
            선택 해제
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-gray-500">
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={transactions.length > 0 && selectedIds.size === transactions.length}
                  onChange={toggleSelectAll}
                  className="rounded"
                />
              </th>
              <th className="px-4 py-3">거래일</th>
              <th className="px-4 py-3">가맹점명</th>
              <th className="px-4 py-3 text-right">금액</th>
              <th className="px-4 py-3">계정과목</th>
              <th className="px-4 py-3">신뢰도</th>
              <th className="px-4 py-3">방법</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3 text-right">작업</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                  거래 내역이 없습니다
                </td>
              </tr>
            ) : (
              transactions.map((tx) => {
                const status = getStatus(tx);
                const result = getLatestResult(tx);
                return (
                  <tr
                    key={tx.id}
                    className="border-t hover:bg-gray-50 cursor-pointer"
                    onClick={() => setSelectedTx(tx)}
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(tx.id)}
                        onChange={() => toggleSelect(tx.id)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {tx.transaction_date || '-'}
                    </td>
                    <td className="px-4 py-3">{tx.merchant_name || '-'}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {Number(tx.amount).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      {result?.account ? (
                        <span>
                          <span className="font-mono text-xs text-gray-400 mr-1">
                            {result.account.code}
                          </span>
                          {result.account.name}
                        </span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {result ? <ConfidenceBadge confidence={result.confidence} /> : '-'}
                    </td>
                    <td className="px-4 py-3">
                      {result ? <MethodTag method={result.method} /> : '-'}
                    </td>
                    <td className="px-4 py-3">
                      {status === 'confirmed' && (
                        <span className="text-xs text-green-600 font-medium">확정</span>
                      )}
                      {status === 'classified' && (
                        <span className="text-xs text-yellow-600 font-medium">미확정</span>
                      )}
                      {status === 'unclassified' && (
                        <span className="text-xs text-gray-400">미분류</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {status === 'unclassified' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            classifyTransaction(tx.id);
                          }}
                          disabled={classifyingIds.has(tx.id)}
                          className="text-blue-600 hover:underline text-xs disabled:opacity-50"
                        >
                          {classifyingIds.has(tx.id) ? '분류 중...' : '분류'}
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
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="px-3 py-1 text-sm border rounded disabled:opacity-50"
          >
            이전
          </button>
          <span className="text-sm text-gray-500">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="px-3 py-1 text-sm border rounded disabled:opacity-50"
          >
            다음
          </button>
        </div>
      )}

      {/* Detail Modal */}
      <TransactionDetailModal
        tx={selectedTx}
        accounts={accounts}
        onClose={() => setSelectedTx(null)}
        onConfirm={confirmResult}
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
            <span className="text-gray-500">가맹점명</span>
            <p className="font-medium">{tx.merchant_name || '-'}</p>
          </div>
          <div>
            <span className="text-gray-500">업종코드</span>
            <p className="font-medium">{tx.mcc_code || '-'}</p>
          </div>
          <div>
            <span className="text-gray-500">금액</span>
            <p className="font-medium">{Number(tx.amount).toLocaleString()}원</p>
          </div>
          <div>
            <span className="text-gray-500">거래일</span>
            <p className="font-medium">{tx.transaction_date || '-'}</p>
          </div>
          <div className="col-span-2">
            <span className="text-gray-500">적요</span>
            <p className="font-medium">{tx.description || '-'}</p>
          </div>
        </div>

        {result && (
          <div className="border-t pt-4 space-y-3">
            <h4 className="font-medium">분류 결과</h4>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 w-20">계정과목</span>
              <span>
                <span className="font-mono text-sm text-gray-400 mr-1">
                  {result.account?.code}
                </span>
                {result.account?.name}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 w-20">신뢰도</span>
              <ConfidenceBadge confidence={result.confidence} />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 w-20">방법</span>
              <MethodTag method={result.method} />
            </div>
            {result.reason && (
              <div>
                <span className="text-sm text-gray-500">사유</span>
                <p className="mt-1 text-sm bg-gray-50 p-3 rounded">{result.reason}</p>
              </div>
            )}

            {!result.is_confirmed && (
              <div className="pt-2">
                {!showEdit ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => onConfirm(result.id)}
                      className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
                    >
                      확정
                    </button>
                    <button
                      onClick={() => setShowEdit(true)}
                      className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50"
                    >
                      수정
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <AccountSelect
                      accounts={accounts}
                      value={editAccountId}
                      onChange={setEditAccountId}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => onConfirm(result.id, editAccountId)}
                        disabled={!editAccountId}
                        className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg disabled:opacity-50"
                      >
                        수정 확정
                      </button>
                      <button
                        onClick={() => setShowEdit(false)}
                        className="px-4 py-2 text-sm border rounded-lg"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {result.is_confirmed && (
              <div className="text-sm text-green-600 font-medium">확정 완료</div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
