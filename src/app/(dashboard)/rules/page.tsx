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
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

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

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`선택한 ${selectedIds.size}개의 룰을 삭제하시겠습니까?`)) return;
    setDeleting(true);
    await Promise.all(
      [...selectedIds].map((id) =>
        fetch(`/api/companies/${company!.id}/rules/${id}`, { method: 'DELETE' })
      )
    );
    setSelectedIds(new Set());
    setDeleting(false);
    fetchRules();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === rules.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rules.map((r) => r.id)));
    }
  };

  if (!company) return <div style={{ color: '#727784' }}>회사를 선택하세요</div>;

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
            {selectedIds.size > 0 && (
              <button
                onClick={handleDeleteSelected}
                disabled={deleting}
                className="px-4 py-2 text-sm text-white rounded-xl font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: '#ba1a1a' }}
              >
                {deleting ? '삭제 중...' : `선택 삭제 (${selectedIds.size})`}
              </button>
            )}
            <button
              onClick={() => setImportModalOpen(true)}
              className="px-4 py-2 text-sm rounded-xl font-medium transition-colors"
              style={{ backgroundColor: '#e4e2e1', color: '#1b1c1c' }}
            >
              처리내역 Import
            </button>
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
              className="px-4 py-2 text-sm rounded-xl font-medium transition-colors disabled:opacity-50"
              style={{ backgroundColor: '#e4e2e1', color: '#1b1c1c' }}
            >
              {seeding ? '추가 중...' : '샘플 데이터'}
            </button>
            <button
              onClick={() => {
                setEditingRule(null);
                setModalOpen(true);
              }}
              className="px-4 py-2 text-sm text-white rounded-xl font-medium transition-opacity hover:opacity-90"
              style={{ background: 'linear-gradient(to right, #00408b, #0057b8)' }}
            >
              룰 추가
            </button>
          </div>
        }
      />

      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#ffffff' }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wide" style={{ backgroundColor: '#f6f3f2', color: '#424752' }}>
              <th className="px-4 py-3.5 w-8">
                <input
                  type="checkbox"
                  checked={rules.length > 0 && selectedIds.size === rules.length}
                  onChange={toggleSelectAll}
                />
              </th>
              <th className="px-5 py-3.5 w-16">우선순위</th>
              <th className="px-5 py-3.5">룰 이름</th>
              <th className="px-5 py-3.5">조건</th>
              <th className="px-5 py-3.5">매핑 계정과목</th>
              <th className="px-5 py-3.5 text-right">작업</th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-sm" style={{ color: '#727784' }}>
                  분류 룰이 없습니다. 룰을 추가하세요.
                </td>
              </tr>
            ) : (
              rules.map((r, idx) => (
                <tr
                  key={r.id}
                  style={{
                    backgroundColor: selectedIds.has(r.id)
                      ? '#dbeafe'
                      : idx % 2 === 0 ? '#ffffff' : '#fbf9f8'
                  }}
                  className="transition-colors"
                >
                  <td className="px-4 py-3.5">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(r.id)}
                      onChange={() => toggleSelect(r.id)}
                    />
                  </td>
                  <td className="px-5 py-3.5 text-center font-mono text-xs" style={{ color: '#424752' }}>{r.priority}</td>
                  <td className="px-5 py-3.5 font-medium" style={{ color: '#1b1c1c' }}>{r.name}</td>
                  <td className="px-5 py-3.5 text-xs" style={{ color: '#424752' }}>
                    {summarizeConditions(r.conditions)}
                  </td>
                  <td className="px-5 py-3.5">
                    {r.account && (
                      <span>
                        <span className="font-mono text-xs mr-1" style={{ color: '#727784' }}>
                          {r.account.code}
                        </span>
                        <span style={{ color: '#1b1c1c' }}>{r.account.name}</span>
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => {
                        setEditingRule(r);
                        setModalOpen(true);
                      }}
                      className="text-xs font-medium mr-3 transition-opacity hover:opacity-70"
                      style={{ color: '#00408b' }}
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
                      className="text-xs font-medium transition-opacity hover:opacity-70"
                      style={{ color: '#ba1a1a' }}
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

      <RuleImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        companyId={company.id}
        onImported={fetchRules}
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

  const inputStyle = { backgroundColor: '#f0eded', color: '#1b1c1c' };
  const labelStyle = { color: '#424752', fontSize: '0.8125rem', fontWeight: '500' };

  return (
    <Modal open={open} onClose={onClose} title={rule ? '룰 수정' : '룰 추가'} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block mb-1.5" style={labelStyle}>룰 이름 *</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-sm border-0 focus:outline-none"
              style={inputStyle}
              placeholder="예: 카페 접대비 룰"
            />
          </div>
          <div>
            <label className="block mb-1.5" style={labelStyle}>우선순위</label>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              className="w-full px-3 py-2.5 rounded-xl text-sm border-0 focus:outline-none"
              style={inputStyle}
            />
            <p className="text-xs mt-1" style={{ color: '#727784' }}>높을수록 먼저 적용</p>
          </div>
        </div>

        <div className="pt-2 pb-1">
          <h4 className="text-sm font-medium mb-3" style={{ color: '#1b1c1c' }}>조건 설정</h4>
          <div className="space-y-3">
            <div>
              <label className="block mb-1.5 text-xs" style={{ color: '#424752' }}>MCC 코드 (쉼표 구분)</label>
              <input
                value={mccCodes}
                onChange={(e) => setMccCodes(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm border-0 focus:outline-none"
                style={inputStyle}
                placeholder="예: 5812, 5813, 5814"
              />
            </div>
            <div>
              <label className="block mb-1.5 text-xs" style={{ color: '#424752' }}>가맹점명 포함 텍스트</label>
              <input
                value={merchantContains}
                onChange={(e) => setMerchantContains(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm border-0 focus:outline-none"
                style={inputStyle}
                placeholder="예: 스타벅스"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block mb-1.5 text-xs" style={{ color: '#424752' }}>최소 금액</label>
                <input
                  type="number"
                  value={amountMin}
                  onChange={(e) => setAmountMin(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-sm border-0 focus:outline-none"
                  style={inputStyle}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block mb-1.5 text-xs" style={{ color: '#424752' }}>최대 금액</label>
                <input
                  type="number"
                  value={amountMax}
                  onChange={(e) => setAmountMax(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-sm border-0 focus:outline-none"
                  style={inputStyle}
                  placeholder="제한 없음"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="pt-2">
          <label className="block text-sm font-medium mb-2" style={{ color: '#1b1c1c' }}>
            매핑 계정과목 *
          </label>
          <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} />
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
            disabled={saving || !accountId}
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

function RuleImportModal({
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
  const [phase, setPhase] = useState<'idle' | 'rules' | 'transactions' | 'done'>('idle');
  const [progress, setProgress] = useState<{ processed: number; total: number; imported: number; skipped: number } | null>(null);
  const [ruleResult, setRuleResult] = useState<any>(null);
  const [finalResult, setFinalResult] = useState<any>(null);

  const reset = () => { setFile(null); setUploading(false); setPhase('idle'); setProgress(null); setRuleResult(null); setFinalResult(null); };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setPhase('rules');
    setProgress(null);
    setRuleResult(null);
    setFinalResult(null);

    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`/api/companies/${companyId}/rules/import`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const data = await res.json();
      setFinalResult({ error: data.error || '업로드 실패' });
      setUploading(false);
      setPhase('done');
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
          if (event.type === 'rules_done') {
            setRuleResult(event);
            setPhase('transactions');
            onImported();
          } else if (event.type === 'progress') {
            setProgress({ processed: event.processed, total: event.total, imported: event.imported, skipped: event.skipped });
          } else if (event.type === 'done') {
            setFinalResult(event);
            setPhase('done');
          }
        } catch { /* ignore */ }
      }
    }
    setUploading(false);
  };

  const pct = progress ? Math.round((progress.processed / progress.total) * 100) : 0;

  return (
    <Modal
      open={open}
      onClose={() => { if (!uploading) { onClose(); reset(); } }}
      title="처리내역 CSV로 규칙 자동 생성 + 거래 저장"
    >
      <div className="space-y-4">
        {phase === 'idle' && (
          <>
            <p className="text-sm" style={{ color: '#424752' }}>
              처리내역 CSV를 업로드하면 두 가지 작업이 순서대로 실행됩니다.
            </p>
            <ol className="text-sm space-y-1 list-decimal list-inside" style={{ color: '#1b1c1c' }}>
              <li><strong>규칙 생성</strong> — MCC 1:1 매핑 건을 분류 규칙으로 등록</li>
              <li><strong>거래 저장</strong> — 전체 데이터를 확정 상태로 거래 내역에 저장</li>
            </ol>
            <p className="text-xs" style={{ color: '#727784' }}>
              필요 컬럼: <code className="px-1.5 py-0.5 rounded-lg" style={{ backgroundColor: '#f0eded' }}>가맹점명, 가맹점업종코드, 가맹점업종명, 공급금액, 부가세액, 승인일자, 용도코드, 용도명</code>
            </p>
            <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-sm" />
          </>
        )}

        {phase === 'rules' && (
          <div className="text-sm text-center py-4" style={{ color: '#424752' }}>
            <div className="animate-pulse">규칙 분석 중...</div>
          </div>
        )}

        {(phase === 'transactions' || (phase === 'done' && progress)) && (
          <div className="space-y-3">
            {ruleResult && (
              <div className="p-3 rounded-xl text-sm" style={{ backgroundColor: '#dbeafe', color: '#1e40af' }}>
                <p className="font-medium mb-1">규칙 생성 완료</p>
                <p>생성: <strong>{ruleResult.created}</strong>개
                  {ruleResult.skipped_ambiguous > 0 && <span style={{ color: '#424752' }}> · 복수매핑 스킵 {ruleResult.skipped_ambiguous}개</span>}
                  {ruleResult.skipped_duplicate > 0 && <span style={{ color: '#424752' }}> · 중복 스킵 {ruleResult.skipped_duplicate}개</span>}
                </p>
              </div>
            )}
            {progress && (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: '#424752' }}>거래 저장 중...</span>
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
              </>
            )}
          </div>
        )}

        {phase === 'done' && finalResult && (
          <div className="space-y-3">
            {ruleResult && (
              <div className="p-3 rounded-xl text-sm" style={{ backgroundColor: '#dbeafe', color: '#1e40af' }}>
                <p className="font-medium mb-1">규칙 생성 완료</p>
                <p>생성: <strong>{ruleResult.created}</strong>개</p>
              </div>
            )}
            {finalResult.error ? (
              <p className="text-sm" style={{ color: '#ba1a1a' }}>{finalResult.error}</p>
            ) : (
              <div className="p-3 rounded-xl text-sm" style={{ backgroundColor: '#dcfce7', color: '#166534' }}>
                <p className="font-medium mb-1">거래 저장 완료</p>
                <p>등록: <strong>{finalResult.transactions?.imported}</strong>건 · 건너뜀: <strong>{finalResult.transactions?.skipped}</strong>건</p>
              </div>
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
          {phase === 'idle' && (
            <button
              onClick={handleUpload}
              disabled={!file}
              className="px-4 py-2 text-sm text-white rounded-xl font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: 'linear-gradient(to right, #00408b, #0057b8)' }}
            >
              시작
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
