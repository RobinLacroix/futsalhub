'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import SimpleTeamSelector from './SimpleTeamSelector';
import {
  Home,
  Calendar,
  Users,
  Video,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
  PieChart,
  Shield,
  Layout
} from 'lucide-react';

interface SidebarProps {
  isExpanded: boolean;
  onToggle: () => void;
}

export default function Sidebar({ isExpanded, onToggle }: SidebarProps) {
  const pathname = usePathname();

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
          name: 'Enregistrer match',
          href: '/webapp/tracker/matchrecorder',
          icon: Video
        }
      ]
    },
    {
      name: 'Share',
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
        }
      ]
    },
    {
      name: 'Paramètres',
      href: '/webapp/settings',
      icon: Settings
    }
  ];

  const isActive = (href: string) => pathname === href;

  return (
    <aside
      className={`fixed top-16 left-0 h-[calc(100vh-4rem)] bg-white border-r border-gray-200 transition-all duration-300 ${
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
      <div className="px-3 py-4 border-b border-gray-200">
        <SimpleTeamSelector />
      </div>

      <nav className="h-full py-4 overflow-y-auto">
        <div className="px-3 space-y-1">
          {navigation.map((item) => (
            <div key={item.name}>
              {item.href ? (
                <Link
                  href={item.href}
                  className={`flex items-center px-3 py-2 text-sm font-medium rounded-md ${
                    isActive(item.href)
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <item.icon className="h-5 w-5 mr-3" />
                  {isExpanded && <span>{item.name}</span>}
                </Link>
              ) : (
                <>
                  {isExpanded && (
                    <div className="px-3 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      {item.name}
                    </div>
                  )}
                  {item.items?.map((subItem) => (
                    <Link
                      key={subItem.name}
                      href={subItem.href}
                      className={`flex items-center px-3 py-2 text-sm font-medium rounded-md ${
                        isActive(subItem.href)
                          ? 'bg-blue-50 text-blue-600'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <subItem.icon className="h-5 w-5 mr-3" />
                      {isExpanded && <span>{subItem.name}</span>}
                    </Link>
                  ))}
                </>
              )}
            </div>
          ))}
        </div>
      </nav>
    </aside>
  );
} 