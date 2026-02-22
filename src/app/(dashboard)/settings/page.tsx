'use client';

import { useEffect, useState, useCallback } from 'react';
import { useCompany } from '@/components/providers/company-provider';
import { Header } from '@/components/layout/header';
import {
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_USER_PROMPT,
  PLACEHOLDERS,
} from '@/lib/classify/prompt-defaults';
import { AI_MODELS, DEFAULT_MODEL_ID } from '@/lib/models/config';

export default function SettingsPage() {
  const { company } = useCompany();
  const [systemPrompt, setSystemPrompt] = useState('');
  const [userPrompt, setUserPrompt] = useState('');
  const [defaultModelId, setDefaultModelId] = useState(DEFAULT_MODEL_ID);
  const [temperature, setTemperature] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // AI 프롬프트 개선 상태
  const [improving, setImproving] = useState(false);
  const [suggestion, setSuggestion] = useState<{
    suggested_prompt: string;
    reasoning: string;
    analyzed_count: number;
  } | null>(null);
  const [improveLimit, setImproveLimit] = useState(100);

  const fetchSettings = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/companies/${company.id}/settings/prompts`);
      const data = await res.json();
      setSystemPrompt(data.settings.system_prompt);
      setUserPrompt(data.settings.user_prompt);
      setDefaultModelId(data.settings.default_model_id || DEFAULT_MODEL_ID);
      setTemperature(data.settings.temperature ?? 0);
      setIsAdmin(data.is_admin);
    } catch {
      setMessage({ type: 'error', text: '설정을 불러오지 못했습니다' });
    } finally {
      setLoading(false);
    }
  }, [company]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    if (!company) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/companies/${company.id}/settings/prompts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_prompt: systemPrompt,
          user_prompt: userPrompt,
          default_model_id: defaultModelId,
          temperature,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '저장 실패');
      }
      setMessage({ type: 'success', text: '설정이 저장되었습니다' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!confirm('기본 프롬프트로 초기화하시겠습니까?')) return;
    setSystemPrompt(DEFAULT_SYSTEM_PROMPT);
    setUserPrompt(DEFAULT_USER_PROMPT);
    setDefaultModelId(DEFAULT_MODEL_ID);
    setTemperature(0);
    setMessage(null);
  };

  const handleImprove = async () => {
    if (!company) return;
    setImproving(true);
    setSuggestion(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/companies/${company.id}/settings/prompts/improve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: improveLimit }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '프롬프트 개선 실패');
      }
      setSuggestion(data);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setImproving(false);
    }
  };

  const handleApplySuggestion = () => {
    if (!suggestion) return;
    setSystemPrompt(suggestion.suggested_prompt);
    setSuggestion(null);
    setMessage({ type: 'success', text: '제안된 프롬프트가 적용되었습니다. "저장" 버튼을 눌러 확정하세요.' });
  };

  if (!company) return <div className="text-gray-400">회사를 선택하세요</div>;

  if (loading) {
    return (
      <div>
        <Header title="AI 분류 설정" />
        <div className="text-gray-400">로딩 중...</div>
      </div>
    );
  }

  const systemPlaceholders = PLACEHOLDERS.filter((p) => p.target === 'system');
  const userPlaceholders = PLACEHOLDERS.filter((p) => p.target === 'user');

  return (
    <div>
      <Header
        title="AI 분류 설정"
        description="AI 분류에 사용되는 모델과 프롬프트를 설정합니다"
        action={
          isAdmin ? (
            <div className="flex gap-2">
              <button
                onClick={handleReset}
                className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                기본값으로 초기화
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          ) : (
            <span className="text-sm text-gray-500">읽기 전용 (관리자만 수정 가능)</span>
          )
        }
      />

      {message && (
        <div
          className={`mb-4 p-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* 모델 설정 섹션 */}
      <div className="bg-white rounded-xl shadow p-6 mb-6">
        <h2 className="text-base font-semibold text-gray-800 mb-4">모델 설정</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              AI 모델
            </label>
            <select
              value={defaultModelId}
              onChange={(e) => setDefaultModelId(e.target.value)}
              disabled={!isAdmin}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-50 disabled:text-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {AI_MODELS.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} — {model.description}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Temperature: {temperature.toFixed(1)}
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              disabled={!isAdmin}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>0.0 — 일관된 결과</span>
              <span>1.0 — 다양한 결과</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 프롬프트 편집 영역 */}
        <div className="lg:col-span-2 space-y-6">
          {/* 시스템 프롬프트 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                시스템 프롬프트
              </label>
              {isAdmin && (
                <div className="flex items-center gap-2">
                  <select
                    value={improveLimit}
                    onChange={(e) => setImproveLimit(Number(e.target.value))}
                    disabled={improving}
                    className="px-2 py-1 border border-gray-300 rounded text-xs text-gray-600"
                  >
                    <option value={50}>최근 50건</option>
                    <option value={100}>최근 100건</option>
                    <option value={200}>최근 200건</option>
                    <option value={500}>최근 500건</option>
                  </select>
                  <button
                    onClick={handleImprove}
                    disabled={improving}
                    className="px-3 py-1 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                  >
                    {improving ? '분석 중...' : 'AI 프롬프트 개선'}
                  </button>
                </div>
              )}
            </div>

            {/* AI 개선 제안 UI */}
            {improving && (
              <div className="mb-3 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                <div className="flex items-center gap-2 text-sm text-purple-700">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  확정된 거래 내역을 분석하고 프롬프트를 개선하고 있습니다...
                </div>
              </div>
            )}

            {suggestion && (
              <div className="mb-3 border border-purple-300 rounded-lg overflow-hidden">
                <div className="bg-purple-50 px-4 py-3 border-b border-purple-200">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-purple-800">
                      AI 개선 제안 (분석 거래: {suggestion.analyzed_count}건)
                    </h4>
                    <div className="flex gap-2">
                      <button
                        onClick={handleApplySuggestion}
                        className="px-3 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700"
                      >
                        적용
                      </button>
                      <button
                        onClick={() => setSuggestion(null)}
                        className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-purple-700 whitespace-pre-line">
                    {suggestion.reasoning}
                  </p>
                </div>
                <textarea
                  value={suggestion.suggested_prompt}
                  readOnly
                  rows={12}
                  className="w-full px-3 py-2 text-sm font-mono bg-white text-gray-700 resize-y border-0 focus:ring-0"
                />
              </div>
            )}

            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              disabled={!isAdmin}
              rows={12}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono resize-y disabled:bg-gray-50 disabled:text-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="mt-1 text-xs text-gray-400">
              JSON 응답 형식 지시문은 항상 자동 추가됩니다.
            </p>
          </div>

          {/* 사용자 프롬프트 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              사용자 프롬프트
            </label>
            <textarea
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              disabled={!isAdmin}
              rows={8}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono resize-y disabled:bg-gray-50 disabled:text-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* 플레이스홀더 참조 패널 */}
        <div className="space-y-4">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">
              사용 가능한 플레이스홀더
            </h3>

            <div className="mb-4">
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">
                시스템 프롬프트용
              </h4>
              <div className="space-y-2">
                {systemPlaceholders.map((p) => (
                  <div key={p.key} className="text-sm">
                    <code className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-xs">
                      {p.key}
                    </code>
                    <span className="ml-2 text-gray-600 text-xs">{p.description}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">
                사용자 프롬프트용
              </h4>
              <div className="space-y-2">
                {userPlaceholders.map((p) => (
                  <div key={p.key} className="text-sm">
                    <code className="bg-green-100 text-green-800 px-1.5 py-0.5 rounded text-xs">
                      {p.key}
                    </code>
                    <span className="ml-2 text-gray-600 text-xs">{p.description}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <h3 className="text-sm font-medium text-amber-800 mb-2">참고</h3>
            <ul className="text-xs text-amber-700 space-y-1.5">
              <li>- &quot;기본값으로 초기화&quot; 버튼으로 원래 프롬프트를 복원할 수 있습니다</li>
              <li>- JSON 응답 형식 지시문은 자동으로 추가되므로 별도로 작성하지 않아도 됩니다</li>
              <li>- 플레이스홀더는 분류 시점에 실제 값으로 치환됩니다</li>
              <li>- 프롬프트 변경은 저장 후 즉시 반영됩니다</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
