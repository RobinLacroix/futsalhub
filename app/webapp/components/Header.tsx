'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Settings, LogOut } from 'lucide-react';
import ActiveTeamIndicator from './ActiveTeamIndicator';

export default function Header() {
  const router = useRouter();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [userInitial, setUserInitial] = useState('');

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
    <header className="fixed top-0 right-0 left-0 h-16 bg-white border-b border-gray-200 z-30">
      <div className="h-full px-4 flex items-center justify-between">
        {/* Indicateur d'équipe active */}
        <ActiveTeamIndicator />
        
        {/* Menu utilisateur */}
        <div className="relative">
          <button
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-600 text-white font-medium hover:bg-blue-700 focus:outline-none transition-colors duration-200"
          >
            {userInitial || '?'}
          </button>

          {isUserMenuOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 ring-1 ring-black ring-opacity-5">
              <Link
                href="/webapp/settings"
                className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                onClick={() => setIsUserMenuOpen(false)}
              >
                <Settings className="h-4 w-4 mr-2" />
                Paramètres
              </Link>
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
    </header>
  );
} 