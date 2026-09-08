'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { ActiveTeamProvider } from './contexts/ActiveTeamContext';
import { ActiveSeasonProvider, useActiveSeasonContext } from './contexts/ActiveSeasonContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { usePlayerProfile } from './hooks/usePlayerProfile';
import { useActiveTeam } from './hooks/useActiveTeam';
import {
  Home, Calendar, Users, BarChart3, Video, FileText,
  MessageSquare, Settings, LogOut, Shield,
  Layout, UserCircle, Share2, ChevronDown, Menu, X,
  ChevronRight, Timer, HeartPulse,
} from 'lucide-react';

/**
 * Palette de chrome de l'app web, dérivée du thème résolu (voir
 * lib/design/tokens.ts). Un seul accent (violet), miroir du mobile — plus de
 * bleu fonctionnel et d'ambre de marque qui se disputaient le rôle.
 */
function useFM() {
  const { theme } = useTheme();
  const c = theme.colors;
  return {
    sidebar: c.bg.sunken,
    sidebarHover: c.bg.surface,
    sidebarActive: c.accent.subtle,
    sidebarBorder: c.border.subtle,
    sidebarText: c.text.secondary,
    sidebarMuted: c.text.tertiary,
    accent: c.accent.default,
    accentFill: c.accent.fill,
    accentSubtle: c.accent.subtle,
    accentBorder: c.accent.border,
    warningSubtle: c.warning.subtle,
    warningBorder: c.warning.default,
    pageBg: c.bg.canvas,
    cardBg: c.bg.surface,
    border: c.border.subtle,
    borderStrong: c.border.strong,
    text: c.text.primary,
    textMuted: c.text.secondary,
    headerBg: c.bg.surface,
    headerBorder: c.border.subtle,
  };
}
type FM = ReturnType<typeof useFM>;

// ─── Nav types ────────────────────────────────────────────────────────────────
type NavItem  = { name: string; href: string; icon: React.ElementType };
type NavGroup = { group: string; items: NavItem[] };
type NavEntry = NavItem | NavGroup;

function isGroup(e: NavEntry): e is NavGroup { return 'group' in e; }

// ─── Single nav item ──────────────────────────────────────────────────────────
function SideNavItem({
  item, active, onClick, collapsed, fm,
}: { item: NavItem; active: boolean; onClick: () => void; collapsed: boolean; fm: FM }) {
  const Icon = item.icon;
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? item.name : undefined}
      className="relative w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left"
      style={{
        backgroundColor: active ? fm.sidebarActive : hovered ? fm.sidebarHover : 'transparent',
        color: active ? fm.accent : fm.sidebarText,
        transition: 'background-color 100ms',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {active && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r"
          style={{ backgroundColor: fm.accent }}
        />
      )}
      <Icon
        size={15}
        className="flex-shrink-0"
        style={{ color: active ? fm.accent : fm.sidebarMuted }}
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
  collapsed, mobileOpen, onCloseMobile, fm,
}: { collapsed: boolean; mobileOpen: boolean; onCloseMobile: () => void; fm: FM }) {
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
          { name: 'Analyse', href: '/webapp/manager/analyse', icon: BarChart3 },
          { name: 'Performance', href: '/webapp/manager/performance', icon: HeartPulse },
          { name: 'Tests physiques', href: '/webapp/manager/tests', icon: Timer },
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
          backgroundColor: fm.sidebar,
          borderRight: `1px solid ${fm.sidebarBorder}`,
        }}
      >
        {/* ── Brand + team selector ─────────────────────────── */}
        <div className="flex-shrink-0 px-3 py-3" style={{ borderBottom: `1px solid ${fm.sidebarBorder}` }}>
          {show ? (
            <>
              {/* Logo row */}
              <div className="flex items-center gap-2 px-1 mb-3">
                <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: fm.accentFill }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#FFFFFF', fontFamily: 'var(--font-archivo)' }}>F</span>
                </div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: fm.text, fontFamily: 'var(--font-archivo)', letterSpacing: '0.05em' }}>
                  FUTSALHUB
                </span>
                <button type="button" className="ml-auto md:hidden" style={{ color: fm.sidebarMuted }} onClick={onCloseMobile}>
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
                      backgroundColor: fm.cardBg,
                      border: `1px solid ${fm.border}`,
                    }}
                  >
                    <div className="w-4 h-4 rounded-full flex-shrink-0"
                      style={{ backgroundColor: activeTeam?.color || fm.accent }} />
                    <div className="flex-1 min-w-0">
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: fm.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {activeTeam?.name || '—'}
                      </div>
                      {activeTeam && (
                        <div style={{ fontSize: '0.65rem', color: fm.sidebarMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {activeTeam.category} · {activeTeam.level}
                        </div>
                      )}
                    </div>
                    {teams.length > 1 && <ChevronDown size={11} style={{ color: fm.sidebarMuted, flexShrink: 0 }} />}
                  </button>

                  {teamMenuOpen && teams.length > 1 && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-md overflow-hidden shadow-xl"
                      style={{ backgroundColor: fm.cardBg, border: `1px solid ${fm.borderStrong}` }}>
                      {teams.map(t => (
                        <button key={t.id} type="button"
                          onClick={() => { changeActiveTeam(t.id); setTeamMenuOpen(false); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left"
                          style={{ backgroundColor: t.id === activeTeam?.id ? fm.accentSubtle : 'transparent' }}>
                          <div className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color || fm.accent }} />
                          <span style={{ fontSize: '0.75rem', color: fm.text, fontWeight: 500 }}>{t.name}</span>
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
                style={{ backgroundColor: fm.accentFill }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#FFFFFF', fontFamily: 'var(--font-archivo)' }}>F</span>
              </div>
              {activeTeam && (
                <div className="w-5 h-5 rounded-full" style={{ backgroundColor: activeTeam.color || fm.accent }} />
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
                      style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', color: fm.sidebarMuted, textTransform: 'uppercase' }}>
                      {entry.group}
                    </div>
                  )}
                  {!show && idx > 0 && (
                    <div className="my-2 mx-auto w-5" style={{ borderTop: `1px solid ${fm.sidebarBorder}` }} />
                  )}
                  <div className="space-y-0.5">
                    {entry.items.map(item => (
                      <SideNavItem key={item.href} item={item}
                        active={pathname === item.href || pathname.startsWith(item.href + '/')}
                        collapsed={!show}
                        onClick={() => handleNav(item.href)}
                        fm={fm} />
                    ))}
                  </div>
                </div>
              ) : (
                <div key={(entry as NavItem).href} className="mb-0.5">
                  <SideNavItem item={entry as NavItem}
                    active={pathname === (entry as NavItem).href}
                    collapsed={!show}
                    onClick={() => handleNav((entry as NavItem).href)}
                    fm={fm} />
                </div>
              )
            )}
          </div>
        </nav>

        {/* ── Settings + logout ─────────────────────────────── */}
        <div className="flex-shrink-0 py-2" style={{ borderTop: `1px solid ${fm.sidebarBorder}` }}>
          <div className={show ? 'px-2' : 'px-1.5'}>
            <SideNavItem item={{ name: 'Paramètres', href: '/webapp/settings', icon: Settings }}
              active={pathname === '/webapp/settings'} collapsed={!show}
              onClick={() => handleNav('/webapp/settings')} fm={fm} />
            <LogoutButton show={show} onLogout={handleLogout} fm={fm} />
          </div>
        </div>
      </aside>
    </>
  );
}

function LogoutButton({ show, onLogout, fm }: { show: boolean; onLogout: () => void; fm: FM }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onLogout}
      title={!show ? 'Se déconnecter' : undefined}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md"
      style={{
        backgroundColor: hovered ? fm.sidebarHover : 'transparent',
        color: fm.sidebarText,
        transition: 'background-color 100ms',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <LogOut size={15} style={{ color: fm.sidebarMuted, flexShrink: 0 }} />
      {show && <span style={{ fontSize: '0.8125rem' }}>Se déconnecter</span>}
    </button>
  );
}

// ─── Season selector ──────────────────────────────────────────────────────────
function SeasonSelector({ fm }: { fm: FM }) {
  const { activeSeason, clubSeason, availableSeasons, changeActiveSeason } = useActiveSeasonContext();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const isPast = activeSeason !== clubSeason;

  return (
    <div ref={ref} className="relative ml-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
        style={{
          backgroundColor: isPast ? fm.warningSubtle : fm.accentSubtle,
          border: `1px solid ${isPast ? fm.warningBorder : fm.accentBorder}`,
        }}
        title={isPast ? 'Vous consultez une saison passée' : 'Saison active'}
      >
        <Calendar size={11} style={{ color: isPast ? fm.warningBorder : fm.accent, flexShrink: 0 }} />
        <span style={{ fontSize: '0.7rem', fontWeight: 600, color: fm.text }}>{activeSeason}</span>
        {availableSeasons.length > 1 && (
          <ChevronDown size={10} style={{ color: fm.textMuted, flexShrink: 0 }} />
        )}
      </button>

      {open && availableSeasons.length > 1 && (
        <div
          className="absolute right-0 top-full mt-1 z-50 rounded-md overflow-hidden shadow-xl min-w-[8rem]"
          style={{ backgroundColor: fm.cardBg, border: `1px solid ${fm.border}` }}
        >
          {availableSeasons.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => { changeActiveSeason(s); setOpen(false); }}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
              style={{ backgroundColor: s === activeSeason ? fm.accentSubtle : 'transparent' }}
            >
              <span style={{ fontSize: '0.72rem', fontWeight: s === activeSeason ? 700 : 500, color: fm.text }}>{s}</span>
              {s === clubSeason && (
                <span style={{ fontSize: '0.55rem', fontWeight: 700, color: fm.accent, letterSpacing: '0.05em' }}>ACTIVE</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Top page header (breadcrumb) ─────────────────────────────────────────────
function PageHeader({ sidebarWidth, fm }: { sidebarWidth: string; fm: FM }) {
  const pathname = usePathname();
  const { activeTeam } = useActiveTeam();
  const { section, page } = getPageMeta(pathname);
  const showSeason = pathname.startsWith('/webapp/manager') || pathname.startsWith('/webapp/tracker');

  return (
    <div
      className="fixed top-0 right-0 z-30 flex items-center px-5 h-11"
      style={{
        left: sidebarWidth,
        backgroundColor: fm.headerBg,
        borderBottom: `1px solid ${fm.headerBorder}`,
        transition: 'left 200ms ease-out',
      }}
    >
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 flex-1 min-w-0">
        {section && (
          <>
            <span style={{ fontSize: '0.75rem', color: fm.textMuted, fontWeight: 500 }}>{section}</span>
            <ChevronRight size={11} style={{ color: fm.textMuted, flexShrink: 0 }} />
          </>
        )}
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: fm.text }}>{page}</span>
      </div>

      {/* Active team badge */}
      {activeTeam && (
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full ml-4"
          style={{ backgroundColor: fm.accentSubtle, border: `1px solid ${fm.accentBorder}` }}
        >
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: activeTeam.color || fm.accent }} />
          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: fm.text }}>{activeTeam.name}</span>
          <span style={{ fontSize: '0.65rem', color: fm.textMuted }}>{activeTeam.category}</span>
        </div>
      )}

      {/* Season selector */}
      {showSeason && <SeasonSelector fm={fm} />}
    </div>
  );
}

function getPageMeta(pathname: string): { section: string; page: string } {
  const routes: Array<{ match: string; section: string; page: string }> = [
    { match: '/webapp/manager/calendar',       section: 'Manager',  page: 'Calendrier & Résultats' },
    { match: '/webapp/manager/squad',          section: 'Manager',  page: 'Effectif' },
    { match: '/webapp/manager/analyse',        section: 'Manager',  page: 'Analyse' },
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

// ─── Shell (consomme le thème, doit être sous ThemeProvider) ─────────────────
const BREAKPOINT = 768;

function WebAppShell({ children }: { children: React.ReactNode }) {
  const fm = useFM();
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
      <ActiveSeasonProvider>
      <div className="min-h-screen min-h-[100dvh]" style={{ backgroundColor: fm.pageBg, color: fm.text }}>

        <Sidebar
          collapsed={collapsed}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
          fm={fm}
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
              backgroundColor: fm.sidebar,
              color: fm.sidebarMuted,
              borderTop: `1px solid ${fm.sidebarBorder}`,
              borderRight: `1px solid ${fm.sidebarBorder}`,
              borderBottom: `1px solid ${fm.sidebarBorder}`,
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
          <PageHeader sidebarWidth={sidebarWidth} fm={fm} />
        </div>

        {/* Mobile header */}
        <header
          className="fixed top-0 left-0 right-0 z-30 h-11 flex items-center px-4 md:hidden"
          style={{ backgroundColor: fm.headerBg, borderBottom: `1px solid ${fm.headerBorder}` }}
        >
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex items-center justify-center w-9 h-9 -ml-1 rounded"
            style={{ color: fm.text }}
          >
            <Menu size={18} />
          </button>
          <span className="ml-2" style={{ fontSize: '0.8125rem', fontWeight: 700, color: fm.text, fontFamily: 'var(--font-archivo)', letterSpacing: '0.04em' }}>
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
      </ActiveSeasonProvider>
    </ActiveTeamProvider>
  );
}

// ─── Root layout ──────────────────────────────────────────────────────────────
export default function WebAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <WebAppShell>{children}</WebAppShell>
    </ThemeProvider>
  );
}
