'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { ActiveTeamProvider } from './contexts/ActiveTeamContext';
import SimpleTeamSelector from './components/SimpleTeamSelector';
import DebugTeamSelector from './components/DebugTeamSelector';
import TeamChangeTester from './components/TeamChangeTester';
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

// Composant Sidebar
function Sidebar({
  isExpanded,
  onToggle,
  isMobileOpen,
  onMobileClose
}: {
  isExpanded: boolean;
  onToggle: () => void;
  isMobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const { player: playerProfile } = usePlayerProfile();
  const { teams } = useActiveTeam();
  const router = useRouter();

  const isPlayerOnly = !!playerProfile && teams.length === 0;

  const handleNavClick = (href: string) => {
    onMobileClose();
    router.push(href);
  };

  const handleLogout = async () => {
    onMobileClose();
    await supabase.auth.signOut();
    router.push('/');
  };

  const navigation = [
    {
      name: 'Accueil',
      href: '/webapp',
      icon: Home
    },
    ...(playerProfile
      ? [{
          name: 'Joueur',
          items: [
            { name: 'Calendrier / Présences', href: '/webapp/player/calendar', icon: Calendar },
            { name: 'Ma fiche', href: '/webapp/player/profile', icon: UserCircle },
            { name: 'Questionnaires', href: '/webapp/player/questionnaires', icon: MessageSquare }
          ] as const
        }]
      : []
    ),
    ...(isPlayerOnly ? [] : [{
      name: 'Manager',
      items: [
        {
          name: 'Calendrier / Résultats',
          href: '/webapp/manager/calendar',
          icon: Calendar
        },
        {
          name: 'Effectif',
          href: '/webapp/manager/squad',
          icon: Users
        },
        {
          name: 'Dashboard',
          href: '/webapp/manager/dashboard',
          icon: PieChart
        },
        {
          name: 'Équipes',
          href: '/webapp/manager/teams',
          icon: Shield
        }
      ]
    },
    {
      name: 'Tracker',
      items: [
        {
          name: 'Dashboard',
          href: '/webapp/tracker/dashboard',
          icon: BarChart3
        },
        {
          name: 'Enregistrer match',
          href: '/webapp/tracker/matchrecorder',
          icon: Video
        }
      ]
    },
    { name: 'Scout',
      items: [
        {
          name: 'Annonce',
          href: '/webapp/scout/opening',
          icon: FileText
        },
        {
          name: 'Recrutement',
          href: '/webapp/scout/profiles',
          icon: Search
        }
      ]
    },
    { name: 'Share',
      items: [
        {
          name: 'Librairie',
          href: '/webapp/library',
          icon: FileText
        },
        {
          name: 'Schémas tactiques',
          href: '/webapp/library/schematics',
          icon: Layout
        },
        {
          name: 'Forum',
          href: '/webapp/share/forum',
          icon: MessageSquare
        }
      ]
    }
  ]),
    { name: 'Paramètres', href: '/webapp/settings', icon: Settings },
    { name: 'Se déconnecter', icon: LogOut, action: 'logout' as const }
  ];

  return (
    <>
      {/* Backdrop mobile */}
      <div
        aria-hidden
        onClick={onMobileClose}
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity md:hidden ${
          isMobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      <aside
        className={`fixed left-0 bg-white border-r border-gray-200 flex flex-col z-40 overflow-hidden min-w-0
          transition-[transform,width] duration-300 ease-out
          top-0 max-md:h-full
          md:top-[calc(env(safe-area-inset-top,0px)+0.5rem)] md:h-[calc(100vh-calc(env(safe-area-inset-top,0px)+0.5rem))]
          ${isExpanded ? 'w-64 md:!w-64' : 'w-16 md:!w-16'}
          ${isMobileOpen ? 'translate-x-0 max-md:w-64' : '-translate-x-full md:translate-x-0'}
        `}
      >
        {/* Sélecteur d'équipe */}
        <div className="px-3 py-2 border-b border-gray-200 flex-shrink-0">
          {isExpanded || isMobileOpen ? (
            <SimpleTeamSelector />
          ) : (
            <div className="text-center">
              <div className="text-blue-600 text-lg">🏆</div>
            </div>
          )}
        </div>

        <nav className="flex-1 py-4 overflow-y-auto overflow-x-hidden">
          <div className="px-3 space-y-1 h-full">
            {navigation.map((item) => (
              <div key={item.name}>
                {'action' in item && item.action === 'logout' ? (
                  <button
                    type="button"
                    onClick={handleLogout}
                    className={`flex items-center w-full px-3 py-3 min-h-[44px] text-sm font-medium rounded-md text-gray-700 hover:bg-gray-50 active:bg-gray-100 md:py-2 md:min-h-0 ${
                      isExpanded || isMobileOpen ? 'justify-start text-left' : 'justify-center px-0'
                    }`}
                  >
                    <item.icon className={`h-5 w-5 flex-shrink-0 ${isExpanded || isMobileOpen ? 'mr-3' : ''}`} />
                    {(isExpanded || isMobileOpen) && <span>{item.name}</span>}
                  </button>
                ) : item.href ? (
                  <button
                    type="button"
                    onClick={() => handleNavClick(item.href!)}
                    className={`flex items-center w-full px-3 py-3 min-h-[44px] text-sm font-medium rounded-md text-gray-700 hover:bg-gray-50 active:bg-gray-100 md:py-2 md:min-h-0 ${
                      isExpanded || isMobileOpen ? 'justify-start text-left' : 'justify-center px-0'
                    }`}
                  >
                    <item.icon className={`h-5 w-5 flex-shrink-0 ${isExpanded || isMobileOpen ? 'mr-3' : ''}`} />
                    {(isExpanded || isMobileOpen) && <span>{item.name}</span>}
                  </button>
                ) : (
                  <>
                    {(isExpanded || isMobileOpen) && (
                      <div className="px-3 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        {item.name}
                      </div>
                    )}
                    {item.items?.map((subItem) => (
                      <button
                        key={subItem.name}
                        type="button"
                        onClick={() => handleNavClick(subItem.href)}
                        className={`flex items-center w-full px-3 py-3 min-h-[44px] text-sm font-medium rounded-md text-gray-700 hover:bg-gray-50 active:bg-gray-100 md:py-2 md:min-h-0 ${
                          isExpanded || isMobileOpen ? 'justify-start text-left' : 'justify-center px-0'
                        }`}
                      >
                        <subItem.icon className={`h-5 w-5 flex-shrink-0 ${isExpanded || isMobileOpen ? 'mr-3' : ''}`} />
                        {(isExpanded || isMobileOpen) && <span>{subItem.name}</span>}
                      </button>
                    ))}
                  </>
                )}
              </div>
            ))}
          </div>
        </nav>
      </aside>
    </>
  );
}

// Breakpoint desktop (aligné avec Tailwind md)
const DESKTOP_BREAKPOINT = 768;

// Layout principal
export default function WebAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
      <div className="min-h-screen bg-gray-50 min-h-[100dvh]">
        <Sidebar
          isExpanded={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
          isMobileOpen={mobileMenuOpen}
          onMobileClose={() => setMobileMenuOpen(false)}
        />

        {/* Barre top : réserve l'espace pour la barre de statut (heure, wifi, etc.) sur iPad / desktop */}
        <div
          className="fixed top-0 left-0 right-0 z-30 bg-white/95 border-b border-gray-100 max-md:hidden"
          style={{ minHeight: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}
        />

        {/* Barre mobile : hamburger + espace */}
        <header className="fixed top-0 left-0 right-0 h-14 min-h-[3.5rem] bg-white border-b border-gray-200 z-30 flex items-center px-4 md:hidden safe-area-inset-top">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="flex items-center justify-center w-11 h-11 -ml-1 rounded-lg text-gray-600 hover:bg-gray-100 active:bg-gray-200 touch-manipulation"
            aria-label="Ouvrir le menu"
          >
            <Menu className="h-6 w-6" />
          </button>
        </header>

        <main
          className="transition-all duration-300 min-h-screen pt-14 md:pt-0 relative"
          style={{
            marginLeft: mainMarginLeft,
            ...(isDesktop && { paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }),
          }}
        >
          {/* Bouton réduire/agrandir la sidebar (desktop) : dans main pour être au-dessus de la sidebar (ordre DOM + z-index) */}
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label={sidebarOpen ? 'Réduire le menu' : 'Agrandir le menu'}
            className="fixed z-[60] w-8 h-8 flex items-center justify-center rounded-full bg-white border border-gray-200 shadow-md hover:bg-gray-50 hover:shadow-lg transition-all duration-300 ease-out max-md:hidden"
            style={{
              left: sidebarOpen ? 'calc(16rem - 1rem)' : 'calc(4rem - 1rem)',
              top: 'calc(env(safe-area-inset-top, 0px) + 0.5rem + 0.25rem)',
            }}
          >
            {sidebarOpen ? (
              <ChevronLeft className="h-4 w-4 text-gray-600" />
            ) : (
              <ChevronRight className="h-4 w-4 text-gray-600" />
            )}
          </button>

          <div className="p-4 md:p-6 max-w-full overflow-x-hidden min-h-[calc(100dvh-3.5rem)] md:min-h-screen">
            {children}
          </div>
        </main>
      </div>
    </ActiveTeamProvider>
  );
} 