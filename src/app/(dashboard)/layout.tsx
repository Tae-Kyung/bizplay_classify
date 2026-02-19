import { CompanyProvider } from '@/components/providers/company-provider';
import { Sidebar } from '@/components/layout/sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <CompanyProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 bg-gray-50 p-8">{children}</main>
      </div>
    </CompanyProvider>
  );
}
