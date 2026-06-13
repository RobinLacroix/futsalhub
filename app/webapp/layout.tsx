'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { ActiveTeamProvider } from './contexts/ActiveTeamContext';
import { usePlayerProfile } from './hooks/usePlayerProfile';
import { useActiveTeam } from './hooks/useActiveTeam';
import {
  Home, Calendar, Users, BarChart3, Video, FileText,
  MessageSquare, Settings, LogOut, PieChart, Shield,
  Layout, UserCircle, Share2, ChevronDown, Menu, X,
  ChevronRight,
} from 'lucide-react';

// ─── FM Colour tokens ─────────────────────────────────────────────────────────
const FM = {
  sidebar:       '#1B2847',
  sidebarHover:  '#243460',
  sidebarActive: '#2E4585',
  sidebarBorder: 'rgba(255,255,255,0.07)',
  sidebarText:   '#C8D4E8',
  sidebarMuted:  '#5A7A9F',
  accent:        '#3B82F6',
  accentAmber:   '#FFB020',
  pageBg:        '#EEF0F5',
  cardBg:        '#FFFFFF',
  border:        '#DDE1EA',
  text:          '#1A2332',
  textMuted:     '#697585',
  headerBg:      '#FFFFFF',
  headerBorder:  '#E2E6EF',
};

// ─── Nav types ────────────────────────────────────────────────────────────────
type NavItem  = { name: string; href: string; icon: React.ElementType };
type NavGroup = { group: string; items: NavItem[] };
type NavEntry = NavItem | NavGroup;

function isGroup(e: NavEntry): e is NavGroup { return 'group' in e; }

// ─── Single nav item ──────────────────────────────────────────────────────────
function SideNavItem({
  item, active, onClick, collapsed,
}: { item: NavItem; active: boolean; onClick: () => void; collapsed: boolean }) {
  const Icon = item.icon;
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? item.name : undefined}
      className="relative w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left"
      style={{
        backgroundColor: active ? FM.sidebarActive : hovered ? FM.sidebarHover : 'transparent',
        color: active ? '#FFFFFF' : FM.sidebarText,
        transition: 'background-color 100ms',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {active && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r"
          style={{ backgroundColor: FM.accentAmber }}
        />
      )}
      <Icon
        size={15}
        className="flex-shrink-0"
        style={{ color: active ? FM.accentAmber : FM.sidebarMuted }}
      />
      {!collapsed && (
        <span style={{ fontSize: '0.8125rem', fontWeight: active ? 600 : 400 }}>
          {item.name}
        </span>
      )}
    </button>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({
  collapsed, mobileOpen, onCloseMobile,
}: { collapsed: boolean; mobileOpen: boolean; onCloseMobile: () => void }) {
  const { player } = usePlayerProfile();
  const { activeTeam, teams, changeActiveTeam } = useActiveTeam();
  const router = useRouter();
  const pathname = usePathname();
  const [teamMenuOpen, setTeamMenuOpen] = useState(false);
  const teamMenuRef = useRef<HTMLDivElement>(null);

  const isPlayerOnly = !!player && teams.length === 0;
  const show = !collapsed || mobileOpen;

  const nav: NavEntry[] = [
    { name: 'Accueil', href: '/webapp', icon: Home },
    ...(player ? [{
      group: 'Joueur',
      items: [
        { name: 'Calendrier', href: '/webapp/player/calendar', icon: Calendar },
        { name: 'Ma fiche', href: '/webapp/player/profile', icon: UserCircle },
        { name: 'Questionnaires', href: '/webapp/player/questionnaires', icon: MessageSquare },
        { name: 'Contenu partagé', href: '/webapp/player/shared', icon: Share2 },
      ],
    } as NavGroup] : []),
    ...(isPlayerOnly ? [] : [
      {
        group: 'Manager',
        items: [
          { name: 'Calendrier', href: '/webapp/manager/calendar', icon: Calendar },
          { name: 'Effectif', href: '/webapp/manager/squad', icon: Users },
          { name: 'Dashboard', href: '/webapp/manager/dashboard', icon: PieChart },
          { name: 'Analytics', href: '/webapp/manager/analytics', icon: BarChart3 },
          { name: 'Équipes', href: '/webapp/manager/teams', icon: Shield },
        ],
      } as NavGroup,
      {
        group: 'Tracker',
        items: [
          { name: 'Enregistrer match', href: '/webapp/tracker/matchrecorder', icon: Video },
        ],
      } as NavGroup,
      {
        group: 'Share',
        items: [
          { name: 'Partage équipe', href: '/webapp/share/content', icon: Share2 },
          { name: 'Librairie', href: '/webapp/library', icon: FileText },
          { name: 'Schémas tactiques', href: '/webapp/library/schematics', icon: Layout },
        ],
      } as NavGroup,
    ]),
  ];

  const handleNav = (href: string) => { onCloseMobile(); router.push(href); };
  const handleLogout = async () => {
    onCloseMobile();
    await supabase.auth.signOut();
    router.push('/');
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (teamMenuRef.current && !teamMenuRef.current.contains(e.target as Node)) {
        setTeamMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <>
      {mobileOpen && (
        <div
          aria-hidden
          className="fixed inset-0 z-40 md:hidden"
          style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed left-0 top-0 bottom-0 z-50 flex flex-col
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          transition-transform md:transition-[width] duration-200 ease-out overflow-hidden
        `}
        style={{
          width: show ? '220px' : '52px',
          backgroundColor: FM.sidebar,
          borderRight: `1px solid ${FM.sidebarBorder}`,
        }}
      >
        {/* ── Brand + team selector ─────────────────────────── */}
        <div className="flex-shrink-0 px-3 py-3" style={{ borderBottom: `1px solid ${FM.sidebarBorder}` }}>
          {show ? (
            <>
              {/* Logo row */}
              <div className="flex items-center gap-2 px-1 mb-3">
                <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: FM.accentAmber }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#0E0E10', fontFamily: 'var(--font-syne)' }}>F</span>
                </div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#FFFFFF', fontFamily: 'var(--font-syne)', letterSpacing: '0.05em' }}>
                  FUTSALHUB
                </span>
                <button type="button" className="ml-auto md:hidden" style={{ color: FM.sidebarMuted }} onClick={onCloseMobile}>
                  <X size={14} />
                </button>
              </div>

              {/* Team pill */}
              {teams.length > 0 && (
                <div ref={teamMenuRef} className="relative">
                  <button
                    type="button"
                    onClick={() => teams.length > 1 && setTeamMenuOpen(v => !v)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-left"
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.07)',
                      border: '1px solid rgba(255,255,255,0.1)',
                    }}
                  >
                    <div className="w-4 h-4 rounded-full flex-shrink-0"
                      style={{ backgroundColor: activeTeam?.color || FM.accent }} />
                    <div className="flex-1 min-w-0">
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#FFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {activeTeam?.name || '—'}
                      </div>
                      {activeTeam && (
                        <div style={{ fontSize: '0.65rem', color: FM.sidebarMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {activeTeam.category} · {activeTeam.level}
                        </div>
                      )}
                    </div>
                    {teams.length > 1 && <ChevronDown size={11} style={{ color: FM.sidebarMuted, flexShrink: 0 }} />}
                  </button>

                  {teamMenuOpen && teams.length > 1 && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-md overflow-hidden shadow-xl"
                      style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.12)' }}>
                      {teams.map(t => (
                        <button key={t.id} type="button"
                          onClick={() => { changeActiveTeam(t.id); setTeamMenuOpen(false); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left"
                          style={{ backgroundColor: t.id === activeTeam?.id ? 'rgba(59,130,246,0.2)' : 'transparent' }}>
                          <div className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color || FM.accent }} />
                          <span style={{ fontSize: '0.75rem', color: '#E8EAED', fontWeight: 500 }}>{t.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 rounded-md flex items-center justify-center"
                style={{ backgroundColor: FM.accentAmber }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#0E0E10', fontFamily: 'var(--font-syne)' }}>F</span>
              </div>
              {activeTeam && (
                <div className="w-5 h-5 rounded-full" style={{ backgroundColor: activeTeam.color || FM.accent }} />
              )}
            </div>
          )}
        </div>

        {/* ── Nav items ─────────────────────────────────────── */}
        <nav className="flex-1 py-2 overflow-y-auto overflow-x-hidden">
          <div className={show ? 'px-2' : 'px-1.5'}>
            {nav.map((entry, idx) =>
              isGroup(entry) ? (
                <div key={entry.group} className={idx > 0 ? 'mt-1' : ''}>
                  {show && (
                    <div className="px-3 pt-3 pb-1"
                      style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', color: FM.sidebarMuted, textTransform: 'uppercase' }}>
                      {entry.group}
                    </div>
                  )}
                  {!show && idx > 0 && (
                    <div className="my-2 mx-auto w-5" style={{ borderTop: `1px solid ${FM.sidebarBorder}` }} />
                  )}
                  <div className="space-y-0.5">
                    {entry.items.map(item => (
                      <SideNavItem key={item.href} item={item}
                        active={pathname === item.href || pathname.startsWith(item.href + '/')}
                        collapsed={!show}
                        onClick={() => handleNav(item.href)} />
                    ))}
                  </div>
                </div>
              ) : (
                <div key={(entry as NavItem).href} className="mb-0.5">
                  <SideNavItem item={entry as NavItem}
                    active={pathname === (entry as NavItem).href}
                    collapsed={!show}
                    onClick={() => handleNav((entry as NavItem).href)} />
                </div>
              )
            )}
          </div>
        </nav>

        {/* ── Settings + logout ─────────────────────────────── */}
        <div className="flex-shrink-0 py-2" style={{ borderTop: `1px solid ${FM.sidebarBorder}` }}>
          <div className={show ? 'px-2' : 'px-1.5'}>
            <SideNavItem item={{ name: 'Paramètres', href: '/webapp/settings', icon: Settings }}
              active={pathname === '/webapp/settings'} collapsed={!show}
              onClick={() => handleNav('/webapp/settings')} />
            <LogoutButton show={show} onLogout={handleLogout} />
          </div>
        </div>
      </aside>
    </>
  );
}

function LogoutButton({ show, onLogout }: { show: boolean; onLogout: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onLogout}
      title={!show ? 'Se déconnecter' : undefined}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md"
      style={{
        backgroundColor: hovered ? FM.sidebarHover : 'transparent',
        color: FM.sidebarText,
        transition: 'background-color 100ms',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <LogOut size={15} style={{ color: FM.sidebarMuted, flexShrink: 0 }} />
      {show && <span style={{ fontSize: '0.8125rem' }}>Se déconnecter</span>}
    </button>
  );
}

// ─── Top page header (breadcrumb) ─────────────────────────────────────────────
function PageHeader({ sidebarWidth }: { sidebarWidth: string }) {
  const pathname = usePathname();
  const { activeTeam } = useActiveTeam();
  const { section, page } = getPageMeta(pathname);

  return (
    <div
      className="fixed top-0 right-0 z-30 flex items-center px-5 h-11"
      style={{
        left: sidebarWidth,
        backgroundColor: FM.headerBg,
        borderBottom: `1px solid ${FM.headerBorder}`,
        transition: 'left 200ms ease-out',
      }}
    >
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 flex-1 min-w-0">
        {section && (
          <>
            <span style={{ fontSize: '0.75rem', color: FM.textMuted, fontWeight: 500 }}>{section}</span>
            <ChevronRight size={11} style={{ color: FM.textMuted, flexShrink: 0 }} />
          </>
        )}
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: FM.text }}>{page}</span>
      </div>

      {/* Active team badge */}
      {activeTeam && (
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full ml-4"
          style={{ backgroundColor: '#F0F4FF', border: `1px solid #CBD5F0` }}
        >
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: activeTeam.color || FM.accent }} />
          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: FM.text }}>{activeTeam.name}</span>
          <span style={{ fontSize: '0.65rem', color: FM.textMuted }}>{activeTeam.category}</span>
        </div>
      )}
    </div>
  );
}

function getPageMeta(pathname: string): { section: string; page: string } {
  const routes: Array<{ match: string; section: string; page: string }> = [
    { match: '/webapp/manager/calendar',       section: 'Manager',  page: 'Calendrier & Résultats' },
    { match: '/webapp/manager/squad',          section: 'Manager',  page: 'Effectif' },
    { match: '/webapp/manager/dashboard',      section: 'Manager',  page: 'Dashboard' },
    { match: '/webapp/manager/analytics',      section: 'Manager',  page: 'Analytics' },
    { match: '/webapp/manager/teams',          section: 'Manager',  page: 'Équipes' },
    { match: '/webapp/manager/season-planning',section: 'Manager',  page: 'Planification' },
    { match: '/webapp/tracker/matchrecorder',  section: 'Tracker',  page: 'Enregistrer un match' },
    { match: '/webapp/tracker/match-report',   section: 'Tracker',  page: 'Rapport de match' },
    { match: '/webapp/player/calendar',        section: 'Joueur',   page: 'Calendrier' },
    { match: '/webapp/player/profile',         section: 'Joueur',   page: 'Ma fiche' },
    { match: '/webapp/player/questionnaires',  section: 'Joueur',   page: 'Questionnaires' },
    { match: '/webapp/player/shared',          section: 'Joueur',   page: 'Contenu partagé' },
    { match: '/webapp/library/schematics',     section: 'Librairie',page: 'Schémas tactiques' },
    { match: '/webapp/library',                section: 'Librairie',page: 'Exercices' },
    { match: '/webapp/share/content',          section: 'Share',    page: 'Partage équipe' },
    { match: '/webapp/settings',               section: '',         page: 'Paramètres' },
    { match: '/webapp',                        section: '',         page: 'Accueil' },
  ];
  for (const r of routes) {
    if (pathname === r.match || pathname.startsWith(r.match + '/')) {
      return { section: r.section, page: r.page };
    }
  }
  return { section: '', page: 'FutsalHub' };
}

// ─── Root layout ──────────────────────────────────────────────────────────────
const BREAKPOINT = 768;

export default function WebAppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const check = () => {
      const desktop = window.innerWidth >= BREAKPOINT;
      setIsDesktop(desktop);
      if (!desktop) setCollapsed(false);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const sidebarWidth = isDesktop ? (collapsed ? '52px' : '220px') : '0px';

  return (
    <ActiveTeamProvider>
      <div className="fm-light min-h-screen min-h-[100dvh]" style={{ backgroundColor: FM.pageBg, color: FM.text }}>

        <Sidebar
          collapsed={collapsed}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />

        {/* Desktop collapse toggle — thin tab on sidebar edge */}
        {isDesktop && (
          <button
            type="button"
            onClick={() => setCollapsed(v => !v)}
            aria-label={collapsed ? 'Agrandir le menu' : 'Réduire le menu'}
            className="fixed z-[60] flex items-center justify-center rounded-r"
            style={{
              left: sidebarWidth,
              top: '50%',
              transform: 'translateY(-50%)',
              width: '14px',
              height: '36px',
              backgroundColor: FM.sidebar,
              color: FM.sidebarMuted,
              borderTop: `1px solid ${FM.sidebarBorder}`,
              borderRight: `1px solid ${FM.sidebarBorder}`,
              borderBottom: `1px solid ${FM.sidebarBorder}`,
              borderLeft: 'none',
              borderRadius: '0 4px 4px 0',
              transition: 'left 200ms ease-out',
              cursor: 'pointer',
            }}
          >
            <ChevronRight
              size={10}
              style={{ transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 200ms' }}
            />
          </button>
        )}

        {/* Desktop page header */}
        <div className="hidden md:block">
          <PageHeader sidebarWidth={sidebarWidth} />
        </div>

        {/* Mobile header */}
        <header
          className="fixed top-0 left-0 right-0 z-30 h-11 flex items-center px-4 md:hidden"
          style={{ backgroundColor: FM.headerBg, borderBottom: `1px solid ${FM.headerBorder}` }}
        >
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex items-center justify-center w-9 h-9 -ml-1 rounded"
            style={{ color: FM.text }}
          >
            <Menu size={18} />
          </button>
          <span className="ml-2" style={{ fontSize: '0.8125rem', fontWeight: 700, color: FM.text, fontFamily: 'var(--font-syne)', letterSpacing: '0.04em' }}>
            FUTSALHUB
          </span>
        </header>

        {/* Main content */}
        <main
          style={{
            marginLeft: sidebarWidth,
            width: `calc(100% - ${sidebarWidth})`,
            paddingTop: '2.75rem',
            transition: 'margin-left 200ms ease-out, width 200ms ease-out',
            minHeight: '100dvh',
            boxSizing: 'border-box',
            minWidth: 0,
          }}
        >
          <div style={{ padding: '16px 20px', width: '100%', boxSizing: 'border-box', minWidth: 0 }}>
            {children}
          </div>
        </main>
      </div>
    </ActiveTeamProvider>
  );
}
