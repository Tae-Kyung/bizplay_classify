'use client';

import { useState, useRef } from 'react';
import { useCompany } from '@/components/providers/company-provider';
import { Header } from '@/components/layout/header';
import Papa from 'papaparse';
import Link from 'next/link';
import type { BatchClassifyResult } from '@/types';

interface Progress {
  processed: number;
  total: number;
  success: number;
  failed: number;
  rule_classified: number;
  ai_classified: number;
}

export default function BatchClassifyPage() {
  const { company } = useCompany();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<BatchClassifyResult | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (f: File | null) => {
    setFile(f);
    setResult(null);
    setProgress(null);
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
    setProgress(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`/api/companies/${company.id}/classify/batch`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || '처리에 실패했습니다');
        setProcessing(false);
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
              setProgress({
                processed: event.processed,
                total: event.total,
                success: event.success,
                failed: event.failed,
                rule_classified: event.rule_classified,
                ai_classified: event.ai_classified,
              });
            } else if (event.type === 'done') {
              setResult({
                total: event.total,
                success: event.success,
                failed: event.failed,
                rule_classified: event.rule_classified,
                ai_classified: event.ai_classified,
                errors: event.errors,
              });
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch {
      setError('네트워크 오류');
    }
    setProcessing(false);
  };

  if (!company) return <div style={{ color: '#727784' }}>회사를 선택하세요</div>;

  const pct = progress ? Math.round((progress.processed / progress.total) * 100) : 0;

  return (
    <div className="max-w-4xl">
      <Header
        title="일괄 분류"
        description="CSV 파일을 업로드하여 여러 거래를 한 번에 분류합니다"
      />

      {/* Upload */}
      <div className="rounded-2xl p-6 mb-6" style={{ backgroundColor: '#ffffff' }}>
        <div
          className="rounded-2xl p-8 text-center cursor-pointer transition-colors"
          style={{ border: '2px dashed #c2c6d4' }}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f?.name.endsWith('.csv')) handleFileChange(f);
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#0057b8'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#c2c6d4'; }}
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
              <p className="text-sm font-medium" style={{ color: '#1b1c1c' }}>{file.name}</p>
              <p className="text-xs mt-1" style={{ color: '#727784' }}>
                {(file.size / 1024).toFixed(1)} KB
              </p>
            </div>
          ) : (
            <div>
              <p className="text-sm" style={{ color: '#424752' }}>
                CSV 파일을 드래그하거나 클릭하여 선택하세요
              </p>
              <p className="text-xs mt-2" style={{ color: '#727784' }}>
                형식: <code>merchant_name, mcc_code, amount</code> 또는 <code>가맹점명, 가맹점업종코드, 공급금액, 부가세액, 승인일자</code>
              </p>
            </div>
          )}
        </div>
        <div className="mt-3 text-right">
          <button
            onClick={() => {
              const csv = [
                'merchant_name,mcc_code,amount,transaction_date,description,card_type',
                '스타벅스 강남점,5814,15000,2026-02-15,팀 회의 커피,corporate',
                '교보문고 광화문점,5942,35000,2026-02-14,업무 참고서적 구매,corporate',
                'GS칼텍스 서초주유소,5541,80000,2026-02-13,업무용 차량 주유,corporate',
                '대한항공,3000,450000,2026-02-11,출장 항공권,corporate',
                '피자헛 역삼점,5812,120000,2026-02-05,팀 회식,corporate',
              ].join('\n');
              const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'sample-transactions.csv';
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="text-xs font-medium transition-opacity hover:opacity-70"
            style={{ color: '#00408b' }}
          >
            샘플 CSV 다운로드
          </button>
        </div>
      </div>

      {/* Preview */}
      {preview.length > 0 && !processing && !result && (
        <div className="rounded-2xl p-6 mb-6" style={{ backgroundColor: '#ffffff' }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: '#1b1c1c' }}>
            미리보기 (처음 5행)
          </h3>
          <div className="overflow-x-auto rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ backgroundColor: '#f6f3f2' }}>
                  {previewHeaders.map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left font-medium" style={{ color: '#424752' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#ffffff' : '#fbf9f8' }}>
                    {previewHeaders.map((h) => (
                      <td key={h} className="px-3 py-2.5" style={{ color: '#1b1c1c' }}>{row[h] || ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={handleProcess}
            disabled={processing}
            className="mt-5 w-full py-2.5 text-white rounded-xl text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: 'linear-gradient(to right, #00408b, #0057b8)' }}
          >
            일괄 분류 시작
          </button>
        </div>
      )}

      {/* Progress */}
      {processing && progress && (
        <div className="rounded-2xl p-6 mb-6" style={{ backgroundColor: '#ffffff' }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold" style={{ color: '#1b1c1c' }}>처리 중...</h3>
            <span className="text-sm" style={{ color: '#424752' }}>
              {progress.processed} / {progress.total}건 ({pct}%)
            </span>
          </div>

          <div className="w-full rounded-full h-2.5 mb-5 overflow-hidden" style={{ backgroundColor: '#e4e2e1' }}>
            <div
              className="h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${pct}%`, background: 'linear-gradient(to right, #00408b, #0057b8)' }}
            />
          </div>

          <div className="grid grid-cols-4 gap-3 text-center text-xs">
            <div className="rounded-xl p-3" style={{ backgroundColor: '#dcfce7' }}>
              <p style={{ color: '#166534' }}>성공</p>
              <p className="text-lg font-bold" style={{ color: '#15803d' }}>{progress.success}</p>
            </div>
            <div className="rounded-xl p-3" style={{ backgroundColor: '#ffdad6' }}>
              <p style={{ color: '#ba1a1a' }}>실패</p>
              <p className="text-lg font-bold" style={{ color: '#b91c1c' }}>{progress.failed}</p>
            </div>
            <div className="rounded-xl p-3" style={{ backgroundColor: '#dbeafe' }}>
              <p style={{ color: '#1e40af' }}>룰 분류</p>
              <p className="text-lg font-bold" style={{ color: '#1d4ed8' }}>{progress.rule_classified}</p>
            </div>
            <div className="rounded-xl p-3" style={{ backgroundColor: '#f3e8ff' }}>
              <p style={{ color: '#7e22ce' }}>AI 분류</p>
              <p className="text-lg font-bold" style={{ color: '#7c3aed' }}>{progress.ai_classified}</p>
            </div>
          </div>
        </div>
      )}

      {processing && !progress && (
        <div className="rounded-2xl p-6 mb-6 text-center text-sm" style={{ backgroundColor: '#ffffff', color: '#424752' }}>
          파일 분석 중...
        </div>
      )}

      {error && (
        <div className="p-4 rounded-2xl text-sm mb-6" style={{ backgroundColor: '#ffdad6', color: '#ba1a1a' }}>{error}</div>
      )}

      {/* Result */}
      {result && (
        <div className="rounded-2xl p-6" style={{ backgroundColor: '#ffffff' }}>
          <h3 className="text-lg font-semibold mb-5" style={{ color: '#1b1c1c' }}>처리 완료</h3>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="rounded-xl p-4" style={{ backgroundColor: '#f6f3f2' }}>
              <p className="text-xs" style={{ color: '#424752' }}>전체</p>
              <p className="text-xl font-bold" style={{ color: '#1b1c1c' }}>{result.total}건</p>
            </div>
            <div className="rounded-xl p-4" style={{ backgroundColor: '#dcfce7' }}>
              <p className="text-xs" style={{ color: '#166534' }}>성공</p>
              <p className="text-xl font-bold" style={{ color: '#15803d' }}>{result.success}건</p>
            </div>
            <div className="rounded-xl p-4" style={{ backgroundColor: '#ffdad6' }}>
              <p className="text-xs" style={{ color: '#ba1a1a' }}>실패</p>
              <p className="text-xl font-bold" style={{ color: '#b91c1c' }}>{result.failed}건</p>
            </div>
            <div className="rounded-xl p-4" style={{ backgroundColor: '#dbeafe' }}>
              <p className="text-xs" style={{ color: '#1e40af' }}>룰 / AI</p>
              <p className="text-xl font-bold" style={{ color: '#1d4ed8' }}>
                {result.rule_classified} / {result.ai_classified}
              </p>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div className="mb-5">
              <h4 className="text-sm font-medium mb-2" style={{ color: '#ba1a1a' }}>
                오류 ({result.errors.length}건)
              </h4>
              <div className="rounded-xl p-3 max-h-40 overflow-y-auto text-xs" style={{ backgroundColor: '#ffdad6' }}>
                {result.errors.map((e, i) => (
                  <p key={i} style={{ color: '#b91c1c' }}>
                    행 {e.row}: {e.error}
                  </p>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <Link
              href="/transactions"
              className="inline-block text-sm font-medium transition-opacity hover:opacity-70"
              style={{ color: '#00408b' }}
            >
              거래 내역에서 확인 →
            </Link>
            <button
              onClick={() => { setResult(null); setProgress(null); setFile(null); setPreview([]); }}
              className="text-sm transition-opacity hover:opacity-70"
              style={{ color: '#424752' }}
            >
              새 파일 업로드
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
