import { Sidebar } from '@/components/sidebar';
import { MobileNav } from '@/components/mobile-nav';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {/* Subtle top gradient accent */}
        <div className="pointer-events-none fixed inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent z-50" />
        <div className="p-3 md:p-6 max-w-7xl pb-20 md:pb-6">
          {children}
        </div>
      </main>
      <MobileNav />
    </div>
  );
}
