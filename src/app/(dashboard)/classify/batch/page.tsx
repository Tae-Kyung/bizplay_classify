'use client';

import { useState, useRef } from 'react';
import { useCompany } from '@/components/providers/company-provider';
import { Header } from '@/components/layout/header';
import Papa from 'papaparse';
import Link from 'next/link';
import type { BatchClassifyResult } from '@/types';

export default function BatchClassifyPage() {
  const { company } = useCompany();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<BatchClassifyResult | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (f: File | null) => {
    setFile(f);
    setResult(null);
    setError('');
    if (!f) {
      setPreview([]);
      setPreviewHeaders([]);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { data, meta } = Papa.parse(text, { header: true, skipEmptyLines: true });
      setPreviewHeaders(meta.fields || []);
      setPreview((data as Record<string, string>[]).slice(0, 5));
    };
    reader.readAsText(f);
  };

  const handleProcess = async () => {
    if (!file || !company) return;
    setProcessing(true);
    setError('');
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`/api/companies/${company.id}/classify/batch`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '처리에 실패했습니다');
      } else {
        setResult(data);
      }
    } catch {
      setError('네트워크 오류');
    }
    setProcessing(false);
  };

  if (!company) return <div className="text-gray-400">회사를 선택하세요</div>;

  return (
    <div className="max-w-4xl">
      <Header
        title="일괄 분류"
        description="CSV 파일을 업로드하여 여러 거래를 한 번에 분류합니다"
      />

      {/* Upload */}
      <div className="bg-white rounded-xl shadow p-6 mb-6">
        <div
          className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors cursor-pointer"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f?.name.endsWith('.csv')) handleFileChange(f);
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
          />
          {file ? (
            <div>
              <p className="text-sm font-medium">{file.name}</p>
              <p className="text-xs text-gray-400 mt-1">
                {(file.size / 1024).toFixed(1)} KB
              </p>
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-500">
                CSV 파일을 드래그하거나 클릭하여 선택하세요
              </p>
              <p className="text-xs text-gray-400 mt-2">
                형식: merchant_name, mcc_code, amount, transaction_date, description, card_type
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Preview */}
      {preview.length > 0 && (
        <div className="bg-white rounded-xl shadow p-6 mb-6">
          <h3 className="text-sm font-semibold mb-3">
            미리보기 (처음 5행)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50">
                  {previewHeaders.map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i} className="border-t">
                    {previewHeaders.map((h) => (
                      <td key={h} className="px-3 py-2">{row[h] || ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={handleProcess}
            disabled={processing}
            className="mt-4 w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {processing ? '일괄 분류 처리 중...' : '일괄 분류 시작'}
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm mb-6">{error}</div>
      )}

      {/* Result */}
      {result && (
        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="text-lg font-semibold mb-4">처리 결과</h3>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="text-xs text-gray-500">전체</p>
              <p className="text-xl font-bold">{result.total}건</p>
            </div>
            <div className="bg-green-50 p-3 rounded-lg">
              <p className="text-xs text-green-600">성공</p>
              <p className="text-xl font-bold text-green-700">{result.success}건</p>
            </div>
            <div className="bg-red-50 p-3 rounded-lg">
              <p className="text-xs text-red-600">실패</p>
              <p className="text-xl font-bold text-red-700">{result.failed}건</p>
            </div>
            <div className="bg-blue-50 p-3 rounded-lg">
              <p className="text-xs text-blue-600">룰 / AI</p>
              <p className="text-xl font-bold text-blue-700">
                {result.rule_classified} / {result.ai_classified}
              </p>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium mb-2 text-red-600">
                오류 ({result.errors.length}건)
              </h4>
              <div className="bg-red-50 rounded-lg p-3 max-h-40 overflow-y-auto text-xs">
                {result.errors.map((e, i) => (
                  <p key={i} className="text-red-700">
                    행 {e.row}: {e.error}
                  </p>
                ))}
              </div>
            </div>
          )}

          <Link
            href="/transactions"
            className="inline-block text-sm text-blue-600 hover:underline"
          >
            거래 내역에서 확인 →
          </Link>
        </div>
      )}
    </div>
  );
}
