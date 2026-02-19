interface ConfidenceBadgeProps {
  confidence: number | null;
}

export function ConfidenceBadge({ confidence }: ConfidenceBadgeProps) {
  if (confidence === null) return <span className="text-gray-400 text-xs">-</span>;

  const pct = Math.round(confidence * 100);
  let colorClass = 'bg-red-100 text-red-700';
  if (pct >= 80) colorClass = 'bg-green-100 text-green-700';
  else if (pct >= 50) colorClass = 'bg-yellow-100 text-yellow-700';

  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
      {pct}%
    </span>
  );
}
