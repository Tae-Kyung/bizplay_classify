'use client';

import { useEffect, useState, useCallback } from 'react';
import { useCompany } from '@/components/providers/company-provider';
import { Header } from '@/components/layout/header';
import {
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_USER_PROMPT,
  PLACEHOLDERS,
} from '@/lib/classify/prompt-defaults';

export default function SettingsPage() {
  const { company } = useCompany();
  const [systemPrompt, setSystemPrompt] = useState('');
  const [userPrompt, setUserPrompt] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchSettings = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/companies/${company.id}/settings/prompts`);
      const data = await res.json();
      setSystemPrompt(data.settings.system_prompt);
      setUserPrompt(data.settings.user_prompt);
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
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '저장 실패');
      }
      setMessage({ type: 'success', text: '프롬프트가 저장되었습니다' });
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
    setMessage(null);
  };

  if (!company) return <div className="text-gray-400">회사를 선택하세요</div>;

  if (loading) {
    return (
      <div>
        <Header title="프롬프트 설정" />
        <div className="text-gray-400">로딩 중...</div>
      </div>
    );
  }

  const systemPlaceholders = PLACEHOLDERS.filter((p) => p.target === 'system');
  const userPlaceholders = PLACEHOLDERS.filter((p) => p.target === 'user');

  return (
    <div>
      <Header
        title="프롬프트 설정"
        description="AI 분류에 사용되는 프롬프트를 커스터마이즈합니다"
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 프롬프트 편집 영역 */}
        <div className="lg:col-span-2 space-y-6">
          {/* 시스템 프롬프트 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              시스템 프롬프트
            </label>
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
