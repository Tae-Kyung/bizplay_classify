interface MethodTagProps {
  method: 'rule' | 'ai';
}

export function MethodTag({ method }: MethodTagProps) {
  if (method === 'rule') {
    return (
      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
        룰
      </span>
    );
  }
  return (
    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
      AI
    </span>
  );
}
