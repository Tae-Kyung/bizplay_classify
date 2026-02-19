'use client';

import { useEffect, useState, useCallback } from 'react';
import { useCompany } from '@/components/providers/company-provider';
import { Header } from '@/components/layout/header';
import { Modal } from '@/components/ui/modal';
import { AccountSelect } from '@/components/ui/account-select';
import type { Account, ClassificationRule, RuleConditions } from '@/types';

export default function RulesPage() {
  const { company } = useCompany();
  const [rules, setRules] = useState<(ClassificationRule & { account: Account })[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ClassificationRule | null>(null);
  const [seeding, setSeeding] = useState(false);

  const fetchRules = useCallback(async () => {
    if (!company) return;
    const res = await fetch(`/api/companies/${company.id}/rules`);
    const data = await res.json();
    setRules(Array.isArray(data) ? data : []);
  }, [company]);

  const fetchAccounts = useCallback(async () => {
    if (!company) return;
    const res = await fetch(`/api/companies/${company.id}/accounts`);
    const data = await res.json();
    setAccounts(Array.isArray(data) ? data : []);
  }, [company]);

  useEffect(() => {
    fetchRules();
    fetchAccounts();
  }, [fetchRules, fetchAccounts]);

  if (!company) return <div className="text-gray-400">회사를 선택하세요</div>;

  const summarizeConditions = (c: RuleConditions) => {
    const parts: string[] = [];
    if (c.mcc_codes?.length) parts.push(`MCC: ${c.mcc_codes.join(', ')}`);
    if (c.merchant_name_contains) parts.push(`가맹점 포함: "${c.merchant_name_contains}"`);
    if (c.amount_min !== undefined || c.amount_max !== undefined) {
      const min = c.amount_min ?? 0;
      const max = c.amount_max ? c.amount_max.toLocaleString() : '~';
      parts.push(`금액: ${min.toLocaleString()}~${max}원`);
    }
    return parts.join(' | ') || '조건 없음';
  };

  return (
    <div>
      <Header
        title="분류 룰 관리"
        description="MCC, 가맹점명, 금액 범위로 자동 분류 룰을 설정합니다"
        action={
          <div className="flex gap-2">
            <button
              onClick={async () => {
                if (!confirm('15개의 샘플 분류 룰을 추가하시겠습니까?\n(계정과목이 먼저 등록되어 있어야 합니다)')) return;
                setSeeding(true);
                try {
                  const res = await fetch(`/api/companies/${company.id}/rules/seed`, { method: 'POST' });
                  const data = await res.json();
                  if (!res.ok) {
                    alert(data.error || '샘플 데이터 추가에 실패했습니다');
                  } else {
                    alert(`샘플 룰 ${data.created}개 추가, ${data.skipped}개 스킵 (총 ${data.total}개)`);
                    fetchRules();
                  }
                } catch {
                  alert('샘플 데이터 추가 중 오류가 발생했습니다');
                }
                setSeeding(false);
              }}
              disabled={seeding}
              className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {seeding ? '추가 중...' : '샘플 데이터'}
            </button>
            <button
              onClick={() => {
                setEditingRule(null);
                setModalOpen(true);
              }}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              룰 추가
            </button>
          </div>
        }
      />

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-gray-500">
              <th className="px-4 py-3 w-16">우선순위</th>
              <th className="px-4 py-3">룰 이름</th>
              <th className="px-4 py-3">조건</th>
              <th className="px-4 py-3">매핑 계정과목</th>
              <th className="px-4 py-3 text-right">작업</th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  분류 룰이 없습니다. 룰을 추가하세요.
                </td>
              </tr>
            ) : (
              rules.map((r) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3 text-center font-mono text-xs">{r.priority}</td>
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {summarizeConditions(r.conditions)}
                  </td>
                  <td className="px-4 py-3">
                    {r.account && (
                      <span>
                        <span className="font-mono text-xs text-gray-500 mr-1">
                          {r.account.code}
                        </span>
                        {r.account.name}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => {
                        setEditingRule(r);
                        setModalOpen(true);
                      }}
                      className="text-blue-600 hover:underline text-xs mr-3"
                    >
                      수정
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm('이 룰을 삭제하시겠습니까?')) return;
                        await fetch(`/api/companies/${company.id}/rules/${r.id}`, {
                          method: 'DELETE',
                        });
                        fetchRules();
                      }}
                      className="text-red-500 hover:underline text-xs"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <RuleFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        rule={editingRule}
        accounts={accounts}
        companyId={company.id}
        onSaved={fetchRules}
      />
    </div>
  );
}

function RuleFormModal({
  open,
  onClose,
  rule,
  accounts,
  companyId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  rule: ClassificationRule | null;
  accounts: Account[];
  companyId: string;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [priority, setPriority] = useState(0);
  const [accountId, setAccountId] = useState('');
  const [mccCodes, setMccCodes] = useState('');
  const [merchantContains, setMerchantContains] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (rule) {
      setName(rule.name);
      setPriority(rule.priority);
      setAccountId(rule.account_id);
      setMccCodes(rule.conditions.mcc_codes?.join(', ') || '');
      setMerchantContains(rule.conditions.merchant_name_contains || '');
      setAmountMin(rule.conditions.amount_min?.toString() || '');
      setAmountMax(rule.conditions.amount_max?.toString() || '');
    } else {
      setName('');
      setPriority(0);
      setAccountId('');
      setMccCodes('');
      setMerchantContains('');
      setAmountMin('');
      setAmountMax('');
    }
    setError('');
  }, [rule, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    const conditions: RuleConditions = {};
    if (mccCodes.trim()) {
      conditions.mcc_codes = mccCodes.split(',').map((s) => s.trim()).filter(Boolean);
    }
    if (merchantContains.trim()) {
      conditions.merchant_name_contains = merchantContains.trim();
    }
    if (amountMin) conditions.amount_min = Number(amountMin);
    if (amountMax) conditions.amount_max = Number(amountMax);

    const url = rule
      ? `/api/companies/${companyId}/rules/${rule.id}`
      : `/api/companies/${companyId}/rules`;

    const res = await fetch(url, {
      method: rule ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, priority, conditions, account_id: accountId }),
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
    <Modal open={open} onClose={onClose} title={rule ? '룰 수정' : '룰 추가'} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">룰 이름 *</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder="예: 카페 접대비 룰"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">우선순위</label>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">높을수록 먼저 적용</p>
          </div>
        </div>

        <div className="border-t pt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">조건 설정</h4>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500">MCC 코드 (쉼표 구분)</label>
              <input
                value={mccCodes}
                onChange={(e) => setMccCodes(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="예: 5812, 5813, 5814"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500">가맹점명 포함 텍스트</label>
              <input
                value={merchantContains}
                onChange={(e) => setMerchantContains(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="예: 스타벅스"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500">최소 금액</label>
                <input
                  type="number"
                  value={amountMin}
                  onChange={(e) => setAmountMin(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500">최대 금액</label>
                <input
                  type="number"
                  value={amountMax}
                  onChange={(e) => setAmountMax(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="제한 없음"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="border-t pt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            매핑 계정과목 *
          </label>
          <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} />
        </div>

        {error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm border rounded-lg">
            취소
          </button>
          <button
            type="submit"
            disabled={saving || !accountId}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
