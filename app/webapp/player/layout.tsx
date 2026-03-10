'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Calendar, UserCircle, FileText } from 'lucide-react';

const PLAYER_TABS = [
  { href: '/webapp/player/calendar', label: 'Calendrier', icon: Calendar },
  { href: '/webapp/player/profile', label: 'Ma fiche', icon: UserCircle },
  { href: '/webapp/player/questionnaires', label: 'Questionnaires', icon: FileText },
];

export default function PlayerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-[calc(100dvh-3.5rem)] md:min-h-screen pb-20 md:pb-0">
      {children}

      {/* Barre d'onglets mobile (style app) */}
      <nav
        className="fixed bottom-0 left-0 right-0 h-16 min-h-[4rem] bg-white border-t border-gray-200 flex items-center justify-around z-50 md:hidden safe-area-inset-bottom"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {PLAYER_TABS.map((tab) => {
          const isActive = pathname === tab.href;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center justify-center flex-1 min-h-[44px] gap-1 transition-colors touch-manipulation ${
                isActive ? 'text-[#16a34a]' : 'text-gray-500'
              }`}
            >
              <Icon className="h-6 w-6" strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-xs font-medium">{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
