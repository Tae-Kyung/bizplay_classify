'use client';

import { useEffect, useState } from 'react';
import { useCompany } from '@/components/providers/company-provider';
import { Header } from '@/components/layout/header';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AI_MODELS, DEFAULT_MODEL_ID } from '@/lib/models/config';
import type { Company } from '@/types';

export default function DashboardPage() {
  const { company, companies, loading, refetch } = useCompany();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [bizNum, setBizNum] = useState('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');
  const router = useRouter();

  // If no company exists, show creation form
  if (!loading && companies.length === 0) {
    return (
      <div className="max-w-md mx-auto mt-20">
        <h2 className="text-xl font-bold mb-4">회사를 등록하세요</h2>
        <p className="text-sm text-gray-500 mb-6">
          시작하려면 먼저 회사를 등록해야 합니다.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setFormError('');
            setCreating(true);
            try {
              const res = await fetch('/api/companies', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, business_number: bizNum || undefined }),
              });
              const data = await res.json();
              if (!res.ok) {
                setFormError(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
                setCreating(false);
                return;
              }
              await refetch();
            } catch (err: any) {
              setFormError(err.message);
            }
            setCreating(false);
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700">회사명 *</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              사업자등록번호
            </label>
            <input
              value={bizNum}
              onChange={(e) => setBizNum(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder="000-00-00000"
            />
          </div>
          {formError && (
            <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{formError}</div>
          )}
          <button
            type="submit"
            disabled={creating}
            className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? '등록 중...' : '회사 등록'}
          </button>
        </form>
      </div>
    );
  }

  if (loading || !company) {
    return <div className="text-gray-400">로딩 중...</div>;
  }

  return <DashboardContent companyId={company.id} />;
}

function DashboardContent({ companyId }: { companyId: string }) {
  const [stats, setStats] = useState<any>(null);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL_ID);

  useEffect(() => {
    const saved = localStorage.getItem('selectedModelId');
    if (saved && AI_MODELS.some((m) => m.id === saved)) {
      setSelectedModel(saved);
    }
  }, []);

  const handleModelChange = (modelId: string) => {
    setSelectedModel(modelId);
    localStorage.setItem('selectedModelId', modelId);
  };

  useEffect(() => {
    fetch(`/api/companies/${companyId}/stats`)
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, [companyId]);

  return (
    <div>
      <Header title="대시보드" description="분류 현황 요약" />

      {/* AI Model Selector */}
      <div className="bg-white rounded-xl shadow p-6 mb-8">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">AI 분류 모델</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {AI_MODELS.map((model) => (
            <button
              key={model.id}
              onClick={() => handleModelChange(model.id)}
              className={`flex items-start gap-3 p-4 rounded-lg border-2 text-left transition-colors ${
                selectedModel === model.id
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <div
                className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  selectedModel === model.id
                    ? 'border-blue-600'
                    : 'border-gray-300'
                }`}
              >
                {selectedModel === model.id && (
                  <div className="w-2 h-2 rounded-full bg-blue-600" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{model.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{model.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {!stats ? (
        <div className="text-gray-400">데이터를 불러오는 중...</div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <StatCard label="이번 달 거래" value={`${stats.total_transactions}건`} />
            <StatCard
              label="분류 완료율"
              value={`${stats.confirmation_rate}%`}
            />
            <StatCard
              label="룰 / AI 비율"
              value={`${stats.rule_count} / ${stats.ai_count}`}
            />
            <StatCard
              label="평균 신뢰도"
              value={`${stats.avg_confidence}%`}
            />
          </div>

          {/* Top Accounts */}
          {stats.top_accounts && stats.top_accounts.length > 0 && (
            <div className="bg-white rounded-xl shadow p-6">
              <h3 className="text-lg font-semibold mb-4">계정과목별 분류 현황 (Top 10)</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-2">코드</th>
                    <th className="pb-2">계정과목</th>
                    <th className="pb-2 text-right">건수</th>
                    <th className="pb-2 text-right">합계 금액</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.top_accounts.map((a: any) => (
                    <tr key={a.code} className="border-b last:border-0">
                      <td className="py-2 font-mono text-xs text-gray-500">{a.code}</td>
                      <td className="py-2">{a.name}</td>
                      <td className="py-2 text-right">{a.count}</td>
                      <td className="py-2 text-right">
                        {Number(a.total_amount).toLocaleString()}원
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl shadow p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}
