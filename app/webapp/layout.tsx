'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import SimpleTeamSelector from './components/SimpleTeamSelector';
import DebugTeamSelector from './components/DebugTeamSelector';
import TeamChangeTester from './components/TeamChangeTester';
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
  Shield
} from 'lucide-react';

// Composant UserMenu pour la sidebar
function UserMenu() {
  const router = useRouter();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [userInitial, setUserInitial] = useState('');

  // Récupérer l'initiale de l'utilisateur
  useEffect(() => {
    const getUserInitial = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.user_metadata?.first_name) {
        setUserInitial(user.user_metadata.first_name[0].toUpperCase());
      }
    };
    getUserInitial();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  return (
    <div className="mt-auto px-3 pb-8">
      <div className="relative">
        <button
          onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-600 text-white font-medium hover:bg-blue-700 focus:outline-none transition-colors duration-200"
        >
          {userInitial || '?'}
        </button>

        {isUserMenuOpen && (
          <div className="absolute bottom-full left-0 mb-2 w-48 bg-white rounded-md shadow-lg py-1 ring-1 ring-black ring-opacity-5">
            <button
              onClick={() => router.push('/webapp/settings')}
              className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              <Settings className="h-4 w-4 mr-2" />
              Paramètres
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Se déconnecter
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Composant Sidebar
function Sidebar({ isExpanded, onToggle }: { isExpanded: boolean; onToggle: () => void }) {
  const navigation = [
    {
      name: 'Accueil',
      href: '/webapp',
      icon: Home
    },
    {
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
    {
      name: 'Scout',
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
    {
      name: 'Share',
      items: [
        {
          name: 'Librairie',
          href: '/webapp/share/library',
          icon: FileText
        },
        {
          name: 'Forum',
          href: '/webapp/share/forum',
          icon: MessageSquare
        }
      ]
    }
  ];

  return (
    <aside
      className={`fixed top-0 left-0 h-full bg-white border-r border-gray-200 transition-all duration-300 flex flex-col ${
        isExpanded ? 'w-64' : 'w-16'
      }`}
    >
      <button
        onClick={onToggle}
        className="absolute -right-3 top-6 bg-white border border-gray-200 rounded-full p-1 hover:bg-gray-50"
      >
        {isExpanded ? (
          <ChevronLeft className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </button>

      {/* Sélecteur d'équipe */}
      <div className="px-3 py-2 border-b border-gray-200">
        {isExpanded ? (
          <SimpleTeamSelector />
        ) : (
          <div className="text-center">
            <div className="text-blue-600 text-lg">🏆</div>
          </div>
        )}
      </div>

      <nav className="flex-1 py-4 overflow-y-auto">
        <div className="px-3 space-y-1 h-full">
          {navigation.map((item) => (
            <div key={item.name}>
              {item.href ? (
                <a
                  href={item.href}
                  className="flex items-center px-3 py-2 text-sm font-medium rounded-md text-gray-700 hover:bg-gray-50"
                >
                  <item.icon className={`${isExpanded ? 'h-5 w-5 mr-3' : 'h-6 w-6'} transition-all duration-200`} />
                  {isExpanded && <span>{item.name}</span>}
                </a>
              ) : (
                <>
                  {isExpanded && (
                    <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {item.name}
                    </div>
                  )}
                  {item.items?.map((subItem) => (
                    <a
                      key={subItem.name}
                      href={subItem.href}
                      className="flex items-center px-3 py-2 text-sm font-medium rounded-md text-gray-700 hover:bg-gray-50"
                    >
                      <subItem.icon className={`${isExpanded ? 'h-5 w-5 mr-3' : 'h-6 w-6'} transition-all duration-200`} />
                      {isExpanded && <span>{subItem.name}</span>}
                    </a>
                  ))}
                </>
              )}
            </div>
          ))}
        </div>
      </nav>
      
      {/* UserMenu en bas de la sidebar */}
      <UserMenu />
    </aside>
  );
}

// Layout principal
export default function WebAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar isExpanded={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
      
      <main
        className={`transition-all duration-300 ${
          sidebarOpen ? 'ml-64' : 'ml-16'
        } min-h-screen`}
      >
        {children}
      </main>
    </div>
  );
} 