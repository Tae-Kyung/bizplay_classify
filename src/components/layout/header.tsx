'use client';

interface HeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function Header({ title, description, action }: HeaderProps) {
  return (
    <div className="flex items-center justify-between mb-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: '#1b1c1c', fontFamily: 'var(--font-plus-jakarta-sans, sans-serif)', letterSpacing: '-0.02em' }}>
          {title}
        </h1>
        {description && <p className="mt-1 text-sm" style={{ color: '#424752' }}>{description}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
