'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { ActiveTeamProvider } from './contexts/ActiveTeamContext';
import SimpleTeamSelector from './components/SimpleTeamSelector';
import { usePlayerProfile } from './hooks/usePlayerProfile';
import { useActiveTeam } from './hooks/useActiveTeam';
import {
  Home,
  Calendar,
  Users,
  BarChart3,
  Video,
  Search,
  FileText,
  MessageSquare,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  PieChart,
  Shield,
  Layout,
  UserCircle,
  Menu
} from 'lucide-react';

const AMBER = '#FFB020';

function NavButton({
  icon: Icon,
  label,
  href,
  active,
  expanded,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  href?: string;
  active?: boolean;
  expanded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={!expanded ? label : undefined}
      className={`flex items-center w-full px-3 py-2.5 min-h-[44px] md:min-h-0 text-sm font-medium rounded-lg transition-all duration-150 ${
        expanded ? 'justify-start text-left' : 'justify-center px-0'
      } ${
        active
          ? 'text-[#FFB020]'
          : 'text-white/55 hover:text-white/90 hover:bg-white/[0.06] active:bg-white/[0.09]'
      }`}
      style={active ? { backgroundColor: 'rgba(255,176,32,0.10)' } : undefined}
    >
      <Icon
        className={`h-4.5 w-4.5 flex-shrink-0 ${expanded ? 'mr-3' : ''}`}
        style={{ color: active ? AMBER : undefined }}
      />
      {expanded && <span style={{ fontFamily: 'var(--font-inter, Inter, sans-serif)', fontSize: '0.8125rem' }}>{label}</span>}
    </button>
  );
}

function Sidebar({
  isExpanded,
  isMobileOpen,
  onMobileClose,
}: {
  isExpanded: boolean;
  isMobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const { player: playerProfile } = usePlayerProfile();
  const { teams } = useActiveTeam();
  const router = useRouter();
  const pathname = usePathname();

  const isPlayerOnly = !!playerProfile && teams.length === 0;
  const show = isExpanded || isMobileOpen;

  const handleNav = (href: string) => { onMobileClose(); router.push(href); };
  const handleLogout = async () => {
    onMobileClose();
    await supabase.auth.signOut();
    router.push('/');
  };

  const navigation = [
    { name: 'Accueil', href: '/webapp', icon: Home },
    ...(playerProfile ? [{
      name: 'Joueur',
      items: [
        { name: 'Calendrier / Présences', href: '/webapp/player/calendar', icon: Calendar },
        { name: 'Ma fiche', href: '/webapp/player/profile', icon: UserCircle },
        { name: 'Questionnaires', href: '/webapp/player/questionnaires', icon: MessageSquare },
      ] as const,
    }] : []),
    ...(isPlayerOnly ? [] : [
      {
        name: 'Manager',
        items: [
          { name: 'Calendrier / Résultats', href: '/webapp/manager/calendar', icon: Calendar },
          { name: 'Effectif', href: '/webapp/manager/squad', icon: Users },
          { name: 'Dashboard', href: '/webapp/manager/dashboard', icon: PieChart },
          { name: 'Équipes', href: '/webapp/manager/teams', icon: Shield },
        ],
      },
      {
        name: 'Tracker',
        items: [
          { name: 'Dashboard', href: '/webapp/tracker/dashboard', icon: BarChart3 },
          { name: 'Enregistrer match', href: '/webapp/tracker/matchrecorder', icon: Video },
        ],
      },
      {
        name: 'Scout',
        items: [
          { name: 'Annonce', href: '/webapp/scout/opening', icon: FileText },
          { name: 'Recrutement', href: '/webapp/scout/profiles', icon: Search },
        ],
      },
      {
        name: 'Share',
        items: [
          { name: 'Librairie', href: '/webapp/library', icon: FileText },
          { name: 'Schémas tactiques', href: '/webapp/library/schematics', icon: Layout },
          { name: 'Forum', href: '/webapp/share/forum', icon: MessageSquare },
        ],
      },
    ]),
  ];

  const sidebarBg = 'rgba(14,14,16,0.97)';
  const borderColor = 'rgba(255,255,255,0.07)';

  return (
    <>
      {/* Backdrop mobile */}
      <div
        aria-hidden
        onClick={onMobileClose}
        className={`fixed inset-0 z-40 transition-opacity md:hidden ${
          isMobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      />

      <aside
        className={`fixed left-0 flex flex-col z-40 overflow-hidden min-w-0
          transition-[transform,width] duration-300 ease-out
          top-0 max-md:h-full
          md:top-[calc(env(safe-area-inset-top,0px)+0.5rem)]
          md:h-[calc(100vh-calc(env(safe-area-inset-top,0px)+0.5rem))]
          ${isExpanded ? 'w-64 md:!w-64' : 'w-16 md:!w-16'}
          ${isMobileOpen ? 'translate-x-0 max-md:w-64' : '-translate-x-full md:translate-x-0'}
        `}
        style={{
          backgroundColor: sidebarBg,
          borderRight: `1px solid ${borderColor}`,
          backdropFilter: 'blur(24px)',
        }}
      >
        {/* Logo / team selector */}
        <div className="px-3 py-3 flex-shrink-0" style={{ borderBottom: `1px solid ${borderColor}` }}>
          {show ? (
            <div className="flex items-center gap-2 px-1">
              <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: AMBER }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: '#0E0E10', fontFamily: 'var(--font-syne)' }}>F</span>
              </div>
              <SimpleTeamSelector />
            </div>
          ) : (
            <div className="flex justify-center">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: AMBER }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#0E0E10', fontFamily: 'var(--font-syne)' }}>F</span>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 overflow-y-auto overflow-x-hidden">
          <div className={`space-y-0.5 ${show ? 'px-3' : 'px-2'}`}>
            {navigation.map((item) => (
              <div key={item.name}>
                {'items' in item ? (
                  <>
                    {show && (
                      <div className="px-3 pt-4 pb-1.5"
                        style={{ fontFamily: 'var(--font-inter)', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase' }}>
                        {item.name}
                      </div>
                    )}
                    {item.items.map((sub) => (
                      <NavButton
                        key={sub.name}
                        icon={sub.icon}
                        label={sub.name}
                        href={sub.href}
                        active={pathname === sub.href}
                        expanded={show}
                        onClick={() => handleNav(sub.href)}
                      />
                    ))}
                  </>
                ) : (
                  <NavButton
                    icon={item.icon}
                    label={item.name}
                    href={item.href}
                    active={pathname === item.href}
                    expanded={show}
                    onClick={() => handleNav(item.href!)}
                  />
                )}
              </div>
            ))}
          </div>
        </nav>

        {/* Bottom: settings + logout */}
        <div className="pb-4 flex-shrink-0" style={{ borderTop: `1px solid ${borderColor}`, paddingTop: '0.75rem' }}>
          <div className={show ? 'px-3' : 'px-2'}>
            <NavButton icon={Settings} label="Paramètres" href="/webapp/settings"
              active={pathname === '/webapp/settings'} expanded={show}
              onClick={() => handleNav('/webapp/settings')} />
            <NavButton icon={LogOut} label="Se déconnecter" expanded={show} onClick={handleLogout} />
          </div>
        </div>
      </aside>
    </>
  );
}

const DESKTOP_BREAKPOINT = 768;

export default function WebAppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= DESKTOP_BREAKPOINT);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const mainMarginLeft = isDesktop ? (sidebarOpen ? '16rem' : '4rem') : '0';

  return (
    <ActiveTeamProvider>
      <div className="min-h-screen min-h-[100dvh]" style={{ backgroundColor: '#0E0E10' }}>
        <Sidebar
          isExpanded={sidebarOpen}
          isMobileOpen={mobileMenuOpen}
          onMobileClose={() => setMobileMenuOpen(false)}
        />

        {/* Desktop top bar (safe area spacer) */}
        <div
          className="fixed top-0 left-0 right-0 z-30 max-md:hidden"
          style={{
            minHeight: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)',
            backgroundColor: 'rgba(14,14,16,0.90)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            backdropFilter: 'blur(16px)',
          }}
        />

        {/* Mobile header */}
        <header
          className="fixed top-0 left-0 right-0 h-14 z-30 flex items-center px-4 md:hidden safe-area-inset-top"
          style={{
            backgroundColor: 'rgba(14,14,16,0.92)',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="flex items-center justify-center w-10 h-10 -ml-1 rounded-lg touch-manipulation"
            style={{ color: 'rgba(255,255,255,0.6)' }}
            aria-label="Ouvrir le menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="ml-3 text-sm font-semibold" style={{ color: '#FFB020', fontFamily: 'var(--font-syne)' }}>
            FutsalHub
          </span>
        </header>

        <main
          className="transition-all duration-300 min-h-screen pt-14 md:pt-0 relative"
          style={{
            marginLeft: mainMarginLeft,
            ...(isDesktop && { paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }),
          }}
        >
          {/* Sidebar toggle (desktop) */}
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label={sidebarOpen ? 'Réduire le menu' : 'Agrandir le menu'}
            className="fixed z-[60] w-7 h-7 flex items-center justify-center rounded-full max-md:hidden transition-all duration-300"
            style={{
              left: sidebarOpen ? 'calc(16rem - 0.875rem)' : 'calc(4rem - 0.875rem)',
              top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
              backgroundColor: '#1a1a1e',
              border: '1px solid rgba(255,255,255,0.12)',
              color: 'rgba(255,255,255,0.5)',
              boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
            }}
          >
            {sidebarOpen ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>

          <div className="p-4 md:p-6 max-w-full overflow-x-hidden min-h-[calc(100dvh-3.5rem)] md:min-h-screen">
            {children}
          </div>
        </main>
      </div>
    </ActiveTeamProvider>
  );
}
