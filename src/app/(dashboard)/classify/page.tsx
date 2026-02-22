'use client';

import { useState, useEffect } from 'react';
import { useCompany } from '@/components/providers/company-provider';
import { Header } from '@/components/layout/header';
import { AccountSelect } from '@/components/ui/account-select';
import { ConfidenceBadge } from '@/components/ui/confidence-badge';
import { MethodTag } from '@/components/ui/method-tag';
import { AI_MODELS } from '@/lib/models/config';
import type { Account } from '@/types';

export default function ClassifyPage() {
  const { company } = useCompany();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [merchantName, setMerchantName] = useState('');
  const [mccCode, setMccCode] = useState('');
  const [amount, setAmount] = useState('');
  const [txDate, setTxDate] = useState('');
  const [description, setDescription] = useState('');
  const [cardType, setCardType] = useState<'corporate' | 'personal'>('corporate');
  const [saveTransaction, setSaveTransaction] = useState(true);
  const [classifying, setClassifying] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [editAccountId, setEditAccountId] = useState('');
  const [showEdit, setShowEdit] = useState(false);
  const [currentModelName, setCurrentModelName] = useState('');

  useEffect(() => {
    if (!company) return;
    fetch(`/api/companies/${company.id}/accounts`)
      .then((r) => r.json())
      .then((d) => setAccounts(Array.isArray(d) ? d : []));

    // 설정에서 현재 모델명 가져오기
    fetch(`/api/companies/${company.id}/settings/prompts`)
      .then((r) => r.json())
      .then((d) => {
        const modelId = d.settings?.default_model_id;
        const model = AI_MODELS.find((m) => m.id === modelId);
        setCurrentModelName(model?.name || '');
      })
      .catch(() => {});
  }, [company]);

  const handleClassify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company) return;
    setError('');
    setResult(null);
    setShowEdit(false);
    setClassifying(true);

    const res = await fetch(`/api/companies/${company.id}/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchant_name: merchantName,
        mcc_code: mccCode || undefined,
        amount: Number(amount),
        transaction_date: txDate || undefined,
        description: description || undefined,
        save_transaction: saveTransaction,
      }),
    });

    const data = await res.json();
    setClassifying(false);

    if (!res.ok) {
      setError(data.error || '분류에 실패했습니다');
      return;
    }
    setResult(data.classification);
  };

  const handleConfirm = async (accountId?: string) => {
    if (!result?.id) return;
    setConfirming(true);

    await fetch(`/api/classifications/${result.id}/confirm`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        is_confirmed: true,
        confirmed_account_id: accountId || undefined,
      }),
    });

    setResult({ ...result, is_confirmed: true });
    setConfirming(false);
  };

  if (!company) return <div className="text-gray-400">회사를 선택하세요</div>;

  return (
    <div className="max-w-3xl">
      <Header title="거래 분류" description="거래 정보를 입력하고 계정과목을 자동 분류합니다" />

      {currentModelName && (
        <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
          <span>사용 모델:</span>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
            {currentModelName}
          </span>
        </div>
      )}

      <form onSubmit={handleClassify} className="bg-white rounded-xl shadow p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">가맹점명 *</label>
            <input
              required
              value={merchantName}
              onChange={(e) => setMerchantName(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder="예: 스타벅스 강남점"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">업종코드 (MCC)</label>
            <input
              value={mccCode}
              onChange={(e) => setMccCode(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder="예: 5814"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">금액 *</label>
            <input
              required
              type="number"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder="15000"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">거래일자</label>
            <input
              type="date"
              value={txDate}
              onChange={(e) => setTxDate(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">카드 구분</label>
            <select
              value={cardType}
              onChange={(e) => setCardType(e.target.value as 'corporate' | 'personal')}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="corporate">법인</option>
              <option value="personal">개인</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">적요/메모</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            placeholder="예: 팀 회의 커피"
          />
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={saveTransaction}
              onChange={(e) => setSaveTransaction(e.target.checked)}
            />
            거래 내역에 저장
          </label>
        </div>

        {error && <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</div>}

        <button
          type="submit"
          disabled={classifying}
          className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {classifying ? '분류 중...' : '분류하기'}
        </button>
      </form>

      {/* Result */}
      {result && (
        <div className="mt-6 bg-white rounded-xl shadow p-6">
          <h3 className="text-lg font-semibold mb-4">분류 결과</h3>

          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 w-24">계정과목</span>
              <span className="font-medium">
                <span className="font-mono text-sm text-gray-500 mr-2">
                  {result.account.code}
                </span>
                {result.account.name}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 w-24">신뢰도</span>
              <ConfidenceBadge confidence={result.confidence} />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 w-24">분류 방법</span>
              <MethodTag method={result.method} />
            </div>
            <div>
              <span className="text-sm text-gray-500">사유</span>
              <p className="mt-1 text-sm bg-gray-50 p-3 rounded-lg">{result.reason}</p>
            </div>
          </div>

          {result.id && !result.is_confirmed && (
            <div className="mt-4 pt-4 border-t space-y-3">
              {!showEdit ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleConfirm()}
                    disabled={confirming}
                    className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    {confirming ? '확정 중...' : '확정 (추천 수락)'}
                  </button>
                  <button
                    onClick={() => setShowEdit(true)}
                    className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    수정
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    다른 계정과목 선택:
                  </label>
                  <AccountSelect
                    accounts={accounts}
                    value={editAccountId}
                    onChange={setEditAccountId}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleConfirm(editAccountId)}
                      disabled={!editAccountId || confirming}
                      className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
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
            <div className="mt-4 pt-4 border-t">
              <span className="text-sm text-green-600 font-medium">확정 완료</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
