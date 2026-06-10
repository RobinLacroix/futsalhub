'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useActiveTeam } from '../../hooks/useActiveTeam';
import type { SharedContent, SharedFolder } from '@/types';
import {
  BarChart2, BookOpen, CheckCircle2, ChevronDown, ChevronRight, ChevronUp,
  Download, ExternalLink, Eye, Folder, FolderOpen,
  Link2, Loader2, MoreHorizontal, Pencil, Plus, Search, Trash2, Users, X, Youtube,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartTooltip, ResponsiveContainer } from 'recharts';

// ─── Theme FM light ───────────────────────────────────────────────────────────

const T = {
  pageBg:    '#EEF0F5',
  cardBg:    '#FFFFFF',
  cardBg2:   '#F8FAFC',
  border:    '#DDE1EA',
  text:      '#1A2332',
  textMuted: '#697585',
  textFaint: '#94a3b8',
  navy:      '#1a2744',
  navyLight: '#e8eef8',
  red:       '#dc2626',
  redBg:     '#FEF2F2',
  blue:      '#1e40af',
  green:     '#059669',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractYoutubeId(url: string): string | null {
  const patterns = [/[?&]v=([a-zA-Z0-9_-]{11})/, /youtu\.be\/([a-zA-Z0-9_-]{11})/, /embed\/([a-zA-Z0-9_-]{11})/];
  for (const p of patterns) { const m = url.match(p); if (m) return m[1]; }
  return null;
}
function isYoutubeUrl(url: string) { return /youtube\.com|youtu\.be/.test(url); }

type ContentFilter = 'all' | 'youtube' | 'link';
type PageView = 'library' | 'analytics';

interface ContentAnalyticsRow {
  content_id:    string;
  content_title: string;
  content_type:  string;
  folder_name:   string | null;
  player_id:     string | null;
  player_name:   string | null;
  viewed_at:     string | null;
}

interface ContentStat {
  id:            string;
  title:         string;
  type:          string;
  folder:        string | null;
  totalViews:    number;
  uniqueViewers: number;
  lastViewed:    string | null;
  views:         { playerName: string; viewedAt: string }[];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ShareContentPage() {
  const { activeTeamId } = useActiveTeam();

  const [folders, setFolders] = useState<SharedFolder[]>([]);
  const [items,   setItems]   = useState<SharedContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Navigation dans les dossiers
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath,       setFolderPath]       = useState<SharedFolder[]>([]);

  // Filtres / recherche
  const [filter, setFilter] = useState<ContentFilter>('all');
  const [search, setSearch] = useState('');

  // Modales
  const [showAddModal,    setShowAddModal]    = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [renameTarget,    setRenameTarget]    = useState<SharedFolder | null>(null);
  const [openMenuId,      setOpenMenuId]      = useState<string | null>(null);

  // Formulaire contenu
  const [title,       setTitle]       = useState('');
  const [url,         setUrl]         = useState('');
  const [description, setDescription] = useState('');
  const [addFolderId, setAddFolderId] = useState<string | null>(null);
  const [saving,      setSaving]      = useState(false);
  const [formError,   setFormError]   = useState<string | null>(null);

  // Formulaire dossier
  const [folderName,   setFolderName]   = useState('');
  const [folderSaving, setFolderSaving] = useState(false);

  // Analytics
  const [pageView,          setPageView]          = useState<PageView>('library');
  const [analyticsRows,     setAnalyticsRows]     = useState<ContentAnalyticsRow[]>([]);
  const [analyticsLoading,  setAnalyticsLoading]  = useState(false);
  const [analyticsError,    setAnalyticsError]    = useState<string | null>(null);
  const [expandedContentId, setExpandedContentId] = useState<string | null>(null);
  const [dateRange,     setDateRange]     = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [filterPlayer,   setFilterPlayer]   = useState<string | null>(null);
  const [filterContent,  setFilterContent]  = useState<string[]>([]);
  const [showContentDd,  setShowContentDd]  = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!activeTeamId) { setLoading(false); return; }
    setLoading(true);
    setLoadError(null);
    const [fRes, iRes] = await Promise.all([
      supabase.from('shared_content_folders').select('*').eq('team_id', activeTeamId).order('name'),
      supabase.from('shared_content').select('*').eq('team_id', activeTeamId).order('created_at', { ascending: false }),
    ]);
    if (fRes.error || iRes.error) setLoadError((fRes.error ?? iRes.error)!.message);
    setFolders(fRes.data ?? []);
    setItems(iRes.data ?? []);
    setLoading(false);
  }, [activeTeamId]);

  useEffect(() => { load(); }, [load]);

  // Reset addFolderId default when current folder changes
  useEffect(() => { setAddFolderId(currentFolderId); }, [currentFolderId]);

  // ── Computed ──────────────────────────────────────────────────────────────

  const currentFolders = useMemo(
    () => folders.filter(f => f.parent_id === currentFolderId),
    [folders, currentFolderId]
  );

  const currentItems = useMemo(() => {
    let out = items.filter(i => (i.folder_id ?? null) === currentFolderId);
    if (filter !== 'all') out = out.filter(i => i.content_type === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(i => i.title.toLowerCase().includes(q) || (i.description ?? '').toLowerCase().includes(q));
    }
    return out;
  }, [items, currentFolderId, filter, search]);

  const itemCount = useCallback(
    (folderId: string | null) => {
      const directCount = items.filter(i => (i.folder_id ?? null) === folderId).length;
      const childCount  = folders
        .filter(f => f.parent_id === folderId)
        .reduce((sum, f) => sum + itemCount(f.id), 0);
      return directCount + childCount;
    },
    [items, folders]
  );

  // ── Analytics load ────────────────────────────────────────────────────────

  const loadAnalytics = useCallback(async () => {
    if (!activeTeamId) return;
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    const { data, error } = await supabase.rpc('get_shared_content_analytics', { p_team_id: activeTeamId });
    if (error) setAnalyticsError(error.message);
    else setAnalyticsRows((data ?? []) as ContentAnalyticsRow[]);
    setAnalyticsLoading(false);
  }, [activeTeamId]);

  useEffect(() => {
    if (pageView === 'analytics') loadAnalytics();
  }, [pageView, loadAnalytics]);

  const analyticsPlayers = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of analyticsRows) {
      if (r.player_id && r.player_name) map.set(r.player_id, r.player_name);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'fr'));
  }, [analyticsRows]);

  const analyticsContent = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of analyticsRows) {
      if (r.content_id && r.content_title) map.set(r.content_id, r.content_title);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'fr'));
  }, [analyticsRows]);

  const filteredRows = useMemo(() => {
    let rows = analyticsRows.filter(r => r.viewed_at && r.player_id);
    if (dateRange !== 'all') {
      const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      rows = rows.filter(r => new Date(r.viewed_at!) >= cutoff);
    }
    if (filterPlayer)           rows = rows.filter(r => r.player_id  === filterPlayer);
    if (filterContent.length > 0) rows = rows.filter(r => filterContent.includes(r.content_id));
    return rows;
  }, [analyticsRows, dateRange, filterPlayer, filterContent]);

  const timeSeriesData = useMemo(() => {
    const map = new Map<string, number>();
    const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : dateRange === '90d' ? 90 : null;
    if (days !== null) {
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        map.set(d.toISOString().slice(0, 10), 0);
      }
    }
    for (const r of filteredRows) {
      const key = r.viewed_at!.slice(0, 10);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, views]) => ({
        date: new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
        views,
      }));
  }, [filteredRows, dateRange]);

  const playerStats = useMemo(() => {
    const map = new Map<string, { name: string; views: number }>();
    for (const r of filteredRows) {
      if (!r.player_id || !r.player_name) continue;
      const e = map.get(r.player_id);
      if (e) e.views++;
      else map.set(r.player_id, { name: r.player_name, views: 1 });
    }
    return [...map.values()].sort((a, b) => b.views - a.views);
  }, [filteredRows]);

  const contentStats: ContentStat[] = useMemo(() => {
    const map = new Map<string, ContentStat & { playerSet: Set<string> }>();
    for (const row of analyticsRows) {
      if (!map.has(row.content_id)) {
        map.set(row.content_id, { id: row.content_id, title: row.content_title, type: row.content_type, folder: row.folder_name, totalViews: 0, uniqueViewers: 0, lastViewed: null, views: [], playerSet: new Set() });
      }
    }
    for (const row of filteredRows) {
      const stat = map.get(row.content_id);
      if (!stat) continue;
      stat.totalViews++;
      stat.playerSet.add(row.player_id!);
      stat.uniqueViewers = stat.playerSet.size;
      stat.views.push({ playerName: row.player_name!, viewedAt: row.viewed_at! });
      if (!stat.lastViewed || row.viewed_at! > stat.lastViewed) stat.lastViewed = row.viewed_at!;
    }
    const hasFilter = dateRange !== 'all' || !!filterPlayer || filterContent.length > 0;
    return Array.from(map.values())
      .filter(s => !hasFilter || s.totalViews > 0)
      .sort((a, b) => b.totalViews - a.totalViews);
  }, [analyticsRows, filteredRows, dateRange, filterPlayer, filterContent]);

  const exportCSV = () => {
    const BOM = '﻿';
    const header = 'Titre,Dossier,Type,Joueur,Date/Heure\n';
    const rows = filteredRows
      .slice()
      .sort((a, b) => (b.viewed_at ?? '').localeCompare(a.viewed_at ?? ''))
      .map(r => [
        `"${(r.content_title ?? '').replace(/"/g, '""')}"`,
        `"${(r.folder_name ?? 'Racine').replace(/"/g, '""')}"`,
        `"${r.content_type === 'youtube' ? 'Vidéo' : 'Lien'}"`,
        `"${(r.player_name ?? '').replace(/"/g, '""')}"`,
        `"${r.viewed_at ? new Date(r.viewed_at).toLocaleString('fr-FR') : ''}"`,
      ].join(','))
      .join('\n');
    const blob = new Blob([BOM + header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-partage-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Navigation ────────────────────────────────────────────────────────────

  const enterFolder = (f: SharedFolder) => {
    setCurrentFolderId(f.id);
    setFolderPath(prev => [...prev, f]);
    setSearch('');
    setFilter('all');
  };

  const navigateTo = (index: number) => {
    if (index < 0) { setCurrentFolderId(null); setFolderPath([]); }
    else { const p = folderPath.slice(0, index + 1); setFolderPath(p); setCurrentFolderId(p[p.length - 1].id); }
    setSearch(''); setFilter('all');
  };

  // ── Add content ───────────────────────────────────────────────────────────

  const openAddModal = () => {
    setAddFolderId(currentFolderId);
    setTitle(''); setUrl(''); setDescription(''); setFormError(null);
    setShowAddModal(true);
  };
  const closeAddModal = () => { setShowAddModal(false); setTitle(''); setUrl(''); setDescription(''); setFormError(null); };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTeamId || !title.trim() || !url.trim()) return;
    setSaving(true); setFormError(null);
    const { error: err } = await supabase.from('shared_content').insert({
      team_id: activeTeamId, title: title.trim(), description: description.trim() || null,
      content_type: isYoutubeUrl(url) ? 'youtube' : 'link', url: url.trim(),
      folder_id: addFolderId,
    });
    if (err) { setFormError(err.message); setSaving(false); return; }
    closeAddModal(); await load(); setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce contenu ?')) return;
    await supabase.from('shared_content').delete().eq('id', id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  // ── Folders CRUD ──────────────────────────────────────────────────────────

  const openFolderModal = () => { setFolderName(''); setShowFolderModal(true); };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTeamId || !folderName.trim()) return;
    setFolderSaving(true);
    const { data, error } = await supabase.from('shared_content_folders').insert({
      team_id: activeTeamId, name: folderName.trim(), parent_id: currentFolderId,
    }).select().single();
    if (!error && data) { setFolders(prev => [...prev, data as SharedFolder].sort((a, b) => a.name.localeCompare(b.name, 'fr'))); }
    setFolderName(''); setShowFolderModal(false); setFolderSaving(false);
  };

  const handleRenameFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget || !folderName.trim()) return;
    setFolderSaving(true);
    await supabase.from('shared_content_folders').update({ name: folderName.trim() }).eq('id', renameTarget.id);
    setFolders(prev => prev.map(f => f.id === renameTarget.id ? { ...f, name: folderName.trim() } : f).sort((a, b) => a.name.localeCompare(b.name, 'fr')));
    // update breadcrumb if renamed folder is in path
    setFolderPath(prev => prev.map(f => f.id === renameTarget.id ? { ...f, name: folderName.trim() } : f));
    setRenameTarget(null); setFolderName(''); setFolderSaving(false);
  };

  const handleDeleteFolder = async (f: SharedFolder) => {
    const count = itemCount(f.id);
    const msg = count > 0
      ? `Supprimer le dossier "${f.name}" et déplacer ses ${count} ressource(s) à la racine ?`
      : `Supprimer le dossier "${f.name}" ?`;
    if (!confirm(msg)) return;
    await supabase.from('shared_content_folders').delete().eq('id', f.id);
    setFolders(prev => prev.filter(x => x.id !== f.id));
    // If we were inside this folder, go up
    if (currentFolderId === f.id) navigateTo(-1);
    await load();
    setOpenMenuId(null);
  };

  if (!activeTeamId) {
    return (
      <div style={{ background: T.pageBg, minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <p style={{ color: T.textMuted, fontSize: 14 }}>Sélectionne une équipe dans la barre latérale.</p>
      </div>
    );
  }

  const ytCount   = items.filter(i => (i.folder_id ?? null) === currentFolderId && i.content_type === 'youtube').length;
  const linkCount = items.filter(i => (i.folder_id ?? null) === currentFolderId && i.content_type === 'link').length;

  return (
    <div style={{ background: T.pageBg, minHeight: '100%' }} onClick={() => { setOpenMenuId(null); setShowContentDd(false); }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px' }}>

        {/* ── Header ─────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 11, backgroundColor: T.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <BookOpen size={18} color="#fff" />
            </div>
            <div>
              {/* Breadcrumb */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                <button onClick={() => navigateTo(-1)} style={{ background: 'none', border: 'none', cursor: folderPath.length > 0 ? 'pointer' : 'default', padding: 0 }}>
                  <span style={{ fontSize: 19, fontWeight: 800, color: folderPath.length > 0 ? T.textMuted : T.text, letterSpacing: '-0.3px' }}>
                    Bibliothèque
                  </span>
                </button>
                {folderPath.map((f, i) => (
                  <span key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <ChevronRight size={14} color={T.textFaint} />
                    <button
                      onClick={() => navigateTo(i)}
                      style={{ background: 'none', border: 'none', cursor: i < folderPath.length - 1 ? 'pointer' : 'default', padding: 0 }}
                    >
                      <span style={{ fontSize: 19, fontWeight: 800, color: i === folderPath.length - 1 ? T.text : T.textMuted, letterSpacing: '-0.3px' }}>
                        {f.name}
                      </span>
                    </button>
                  </span>
                ))}
              </div>
              <p style={{ fontSize: 13, color: T.textMuted, margin: 0, marginTop: 2 }}>
                {folderPath.length === 0 ? 'Vidéos et liens partagés avec tes joueurs' : `${items.filter(i => (i.folder_id ?? null) === currentFolderId).length} fichier(s) dans ce dossier`}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* View toggle */}
            <div style={{ display: 'flex', borderRadius: 8, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
              <button onClick={() => setPageView('library')} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: pageView === 'library' ? T.navy : T.cardBg, color: pageView === 'library' ? '#fff' : T.textMuted }}>
                <BookOpen size={13} /> Bibliothèque
              </button>
              <button onClick={() => setPageView('analytics')} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', border: 'none', borderLeft: `1px solid ${T.border}`, cursor: 'pointer', fontSize: 12, fontWeight: 700, background: pageView === 'analytics' ? T.navy : T.cardBg, color: pageView === 'analytics' ? '#fff' : T.textMuted }}>
                <BarChart2 size={13} /> Analytiques
              </button>
            </div>

            {pageView === 'library' && (
              <>
                <button
                  onClick={openFolderModal}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.cardBg, color: T.navy, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  <Folder size={14} />
                  Nouveau dossier
                </button>
                <button
                  onClick={openAddModal}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none', background: T.navy, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  <Plus size={14} />
                  Ajouter
                </button>
              </>
            )}

            {pageView === 'analytics' && (
              <button
                onClick={exportCSV}
                disabled={filteredRows.length === 0}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.cardBg, color: T.navy, fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: analyticsRows.filter(r => r.viewed_at).length === 0 ? 0.4 : 1 }}
              >
                <Download size={14} />
                Exporter CSV
              </button>
            )}
          </div>
        </div>

        {/* ── Load error ─────────────────────────────────────────── */}
        {loadError && (
          <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: T.redBg, border: '1px solid #fca5a5' }}>
            <p style={{ fontSize: 12, color: T.red, margin: 0 }}><strong>Erreur :</strong> {loadError}</p>
          </div>
        )}

        {/* ── Analytics view ─────────────────────────────────────── */}
        {pageView === 'analytics' && (
          <div>
            {analyticsLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
                <Loader2 size={24} color={T.textFaint} style={{ animation: 'spin 1s linear infinite' }} />
              </div>
            ) : analyticsError ? (
              <div style={{ padding: '10px 14px', borderRadius: 8, background: T.redBg, border: '1px solid #fca5a5', marginBottom: 16 }}>
                <p style={{ fontSize: 12, color: T.red, margin: 0 }}>{analyticsError}</p>
              </div>
            ) : analyticsRows.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 220, textAlign: 'center' }}>
                <BarChart2 size={38} color={T.textFaint} style={{ marginBottom: 14 }} />
                <p style={{ fontSize: 15, fontWeight: 700, color: T.text, margin: 0, marginBottom: 5 }}>Aucune ressource publiée</p>
                <p style={{ fontSize: 13, color: T.textMuted, margin: 0 }}>Publiez du contenu pour commencer à suivre les ouvertures.</p>
              </div>
            ) : (
              <>
                {/* ── Filter strip ── */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ display: 'flex', borderRadius: 8, border: `1px solid ${T.border}`, overflow: 'hidden', flexShrink: 0 }}>
                    {(['7d', '30d', '90d', 'all'] as const).map((r, i) => (
                      <button key={r} onClick={() => setDateRange(r)} style={{ padding: '6px 11px', border: 'none', borderLeft: i > 0 ? `1px solid ${T.border}` : 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: dateRange === r ? T.navy : T.cardBg, color: dateRange === r ? '#fff' : T.textMuted }}>
                        {r === '7d' ? '7 j' : r === '30d' ? '30 j' : r === '90d' ? '3 mois' : 'Tout'}
                      </button>
                    ))}
                  </div>

                  <select value={filterPlayer ?? ''} onChange={e => setFilterPlayer(e.target.value || null)} style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${filterPlayer ? T.navy : T.border}`, background: filterPlayer ? T.navyLight : T.cardBg, fontSize: 12, color: filterPlayer ? T.navy : T.textMuted, cursor: 'pointer', outline: 'none', fontWeight: filterPlayer ? 700 : 400 }}>
                    <option value="">Tous les joueurs</option>
                    {analyticsPlayers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                  </select>

                  <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => setShowContentDd(v => !v)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, border: `1px solid ${filterContent.length > 0 ? T.navy : T.border}`, background: filterContent.length > 0 ? T.navyLight : T.cardBg, fontSize: 12, color: filterContent.length > 0 ? T.navy : T.textMuted, cursor: 'pointer', outline: 'none', fontWeight: filterContent.length > 0 ? 700 : 400, maxWidth: 230 }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                        {filterContent.length === 0
                          ? 'Tout le contenu'
                          : filterContent.length === 1
                            ? (analyticsContent.find(([id]) => id === filterContent[0])?.[1] ?? '1 contenu')
                            : `${filterContent.length} contenus`}
                      </span>
                      <ChevronDown size={11} style={{ flexShrink: 0 }} />
                    </button>

                    {showContentDd && (
                      <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 50, background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(15,23,42,0.12)', minWidth: 240, maxWidth: 320, maxHeight: 280, overflowY: 'auto' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: `1px solid ${T.border}` }}>
                          <button onClick={() => setFilterContent(analyticsContent.map(([id]) => id))} style={{ fontSize: 11, fontWeight: 600, color: T.navy, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                            Tout sélectionner
                          </button>
                          {filterContent.length > 0 && (
                            <>
                              <span style={{ color: T.textFaint, fontSize: 11 }}>·</span>
                              <button onClick={() => setFilterContent([])} style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                                Effacer
                              </button>
                            </>
                          )}
                        </div>
                        {analyticsContent.map(([id, title]) => {
                          const checked = filterContent.includes(id);
                          return (
                            <button
                              key={id}
                              onClick={() => setFilterContent(prev => checked ? prev.filter(x => x !== id) : [...prev, id])}
                              style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '9px 12px', border: 'none', background: checked ? T.navyLight : 'none', cursor: 'pointer', textAlign: 'left' }}
                            >
                              <div style={{ width: 15, height: 15, borderRadius: 3, flexShrink: 0, border: `2px solid ${checked ? T.navy : T.border}`, background: checked ? T.navy : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {checked && <span style={{ width: 8, height: 8, display: 'block', borderBottom: '2px solid #fff', borderRight: '2px solid #fff', transform: 'rotate(45deg) translate(-1px, -1px)' }} />}
                              </div>
                              <span style={{ fontSize: 12, fontWeight: checked ? 600 : 400, color: checked ? T.navy : T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {(filterPlayer || filterContent.length > 0 || dateRange !== '30d') && (
                    <button onClick={() => { setDateRange('30d'); setFilterPlayer(null); setFilterContent([]); }} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 8, border: `1px solid ${T.border}`, background: 'none', fontSize: 12, color: T.textMuted, cursor: 'pointer' }}>
                      <X size={11} /> Réinitialiser
                    </button>
                  )}
                </div>

                {/* ── KPI strip ── */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Ouvertures', value: filteredRows.length, icon: <Eye size={14} color={T.navy} /> },
                    { label: 'Joueurs uniques', value: new Set(filteredRows.map(r => r.player_id)).size, icon: <Users size={14} color={T.navy} /> },
                    { label: 'Ressources ouvertes', value: new Set(filteredRows.map(r => r.content_id)).size, icon: <BookOpen size={14} color={T.navy} /> },
                  ].map(stat => (
                    <div key={stat.label} style={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flex: '1 1 140px' }}>
                      {stat.icon}
                      <div>
                        <p style={{ fontSize: 18, fontWeight: 800, color: T.navy, margin: 0 }}>{stat.value}</p>
                        <p style={{ fontSize: 11, color: T.textFaint, margin: 0, fontWeight: 600 }}>{stat.label}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* ── Timeline chart ── */}
                {timeSeriesData.length > 1 && (
                  <div style={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 12, padding: '16px 16px 8px', marginBottom: 16 }}>
                    <p style={{ fontSize: 10, fontWeight: 800, color: T.textFaint, textTransform: 'uppercase', letterSpacing: '0.6px', margin: '0 0 12px 0' }}>
                      OUVERTURES PAR JOUR
                    </p>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={timeSeriesData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10, fill: T.textFaint }}
                          tickLine={false}
                          axisLine={false}
                          interval={timeSeriesData.length > 14 ? Math.floor(timeSeriesData.length / 7) - 1 : 0}
                        />
                        <YAxis tick={{ fontSize: 10, fill: T.textFaint }} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
                        <RechartTooltip
                          contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${T.border}`, boxShadow: '0 4px 12px rgba(0,0,0,0.08)', background: T.cardBg }}
                          formatter={(value: number) => [value, 'Ouvertures']}
                          cursor={{ fill: T.cardBg2 }}
                        />
                        <Bar dataKey="views" fill={T.navy} radius={[3, 3, 0, 0]} maxBarSize={28} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* ── Player chart ── */}
                {playerStats.length > 0 && (
                  <div style={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 12, padding: '16px 16px 8px', marginBottom: 16 }}>
                    <p style={{ fontSize: 10, fontWeight: 800, color: T.textFaint, textTransform: 'uppercase', letterSpacing: '0.6px', margin: '0 0 12px 0' }}>
                      OUVERTURES PAR JOUEUR
                    </p>
                    <ResponsiveContainer width="100%" height={Math.max(120, Math.min(320, playerStats.length * 34))}>
                      <BarChart data={playerStats} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={T.border} horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10, fill: T.textFaint }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: T.text }} tickLine={false} axisLine={false} width={130} />
                        <RechartTooltip
                          contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${T.border}`, background: T.cardBg }}
                          formatter={(value: number) => [value, 'Ouvertures']}
                          cursor={{ fill: T.cardBg2 }}
                        />
                        <Bar dataKey="views" fill={T.navy} radius={[0, 3, 3, 0]} maxBarSize={22}
                          label={{ position: 'right', fontSize: 11, fontWeight: 700, fill: T.navy }} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* ── Table ── */}
                {contentStats.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 140, textAlign: 'center', background: T.cardBg, borderRadius: 12, border: `1px solid ${T.border}` }}>
                    <Eye size={28} color={T.textFaint} style={{ marginBottom: 10 }} />
                    <p style={{ fontSize: 14, fontWeight: 700, color: T.text, margin: 0, marginBottom: 4 }}>Aucune ouverture sur cette période</p>
                    <p style={{ fontSize: 12, color: T.textMuted, margin: 0 }}>Essayez une période plus longue ou réinitialisez les filtres.</p>
                  </div>
                ) : (
                  <div style={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 140px 30px', gap: 0, padding: '9px 16px', background: T.cardBg2, borderBottom: `1px solid ${T.border}` }}>
                      {['Ressource', 'Vues', 'Joueurs', 'Dernière ouverture', ''].map(h => (
                        <span key={h} style={{ fontSize: 10, fontWeight: 800, color: T.textFaint, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</span>
                      ))}
                    </div>
                    {contentStats.map((stat, idx) => (
                      <div key={stat.id}>
                        <button
                          onClick={() => setExpandedContentId(prev => prev === stat.id ? null : stat.id)}
                          style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 140px 30px', gap: 0, padding: '12px 16px', width: '100%', background: 'none', border: 'none', borderBottom: expandedContentId === stat.id || idx < contentStats.length - 1 ? `1px solid ${T.border}` : 'none', cursor: 'pointer', textAlign: 'left', alignItems: 'center' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <div style={{ width: 28, height: 28, borderRadius: 6, background: stat.type === 'youtube' ? '#fef2f2' : '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {stat.type === 'youtube' ? <Youtube size={13} color={T.red} /> : <Link2 size={13} color={T.blue} />}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <p style={{ fontSize: 13, fontWeight: 700, color: T.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stat.title}</p>
                              {stat.folder && <p style={{ fontSize: 10, color: T.textFaint, margin: 0 }}>{stat.folder}</p>}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <Eye size={12} color={T.textFaint} />
                            <span style={{ fontSize: 14, fontWeight: 700, color: stat.totalViews > 0 ? T.navy : T.textFaint }}>{stat.totalViews}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <Users size={12} color={T.textFaint} />
                            <span style={{ fontSize: 14, fontWeight: 700, color: stat.uniqueViewers > 0 ? T.navy : T.textFaint }}>{stat.uniqueViewers}</span>
                          </div>
                          <span style={{ fontSize: 11, color: stat.lastViewed ? T.textMuted : T.textFaint }}>
                            {stat.lastViewed ? new Date(stat.lastViewed).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                          </span>
                          {stat.totalViews > 0
                            ? (expandedContentId === stat.id ? <ChevronUp size={14} color={T.textFaint} /> : <ChevronDown size={14} color={T.textFaint} />)
                            : <span />
                          }
                        </button>

                        {expandedContentId === stat.id && stat.views.length > 0 && (
                          <div style={{ background: T.cardBg2, borderBottom: `1px solid ${T.border}`, padding: '8px 16px 12px 52px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {stat.views.map((v, vi) => (
                                <div key={vi} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <CheckCircle2 size={11} color={T.green} style={{ flexShrink: 0 }} />
                                  <span style={{ fontSize: 12, fontWeight: 600, color: T.text, minWidth: 160 }}>{v.playerName}</span>
                                  <span style={{ fontSize: 11, color: T.textFaint }}>
                                    {new Date(v.viewedAt).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Filter bar (library only) ───────────────────────────── */}
        {pageView === 'library' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {([
              { value: 'all',     label: 'Tous',  count: items.filter(i => (i.folder_id ?? null) === currentFolderId).length },
              { value: 'youtube', label: 'Vidéo', count: ytCount },
              { value: 'link',    label: 'Lien',  count: linkCount },
            ] as const).map(f => (
              <button key={f.value} onClick={() => setFilter(f.value)} style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 7, border: '1px solid',
                cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: filter === f.value ? T.navy : T.cardBg,
                borderColor: filter === f.value ? T.navy : T.border,
                color: filter === f.value ? '#fff' : T.textMuted,
              }}>
                {f.label}
                {f.count > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 10, padding: '1px 5px', background: filter === f.value ? 'rgba(255,255,255,0.18)' : '#e4e9f0', color: filter === f.value ? '#fff' : T.textMuted }}>
                    {f.count}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 150, position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: T.textFaint, pointerEvents: 'none' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..." style={{ width: '100%', paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7, borderRadius: 7, border: `1px solid ${T.border}`, background: T.cardBg, fontSize: 13, color: T.text, outline: 'none', boxSizing: 'border-box' }} />
          </div>
        </div>
        )} {/* end library filter bar */}

        {pageView === 'library' && (loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
            <Loader2 size={24} color={T.textFaint} style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        ) : (
          <>
            {/* ── Dossiers ─────────────────────────────────────── */}
            {currentFolders.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <p style={{ fontSize: 10, fontWeight: 800, color: T.textMuted, letterSpacing: '0.8px', textTransform: 'uppercase', margin: '0 0 10px 0' }}>
                  DOSSIERS
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                  {currentFolders.map(f => (
                    <FolderCard
                      key={f.id}
                      folder={f}
                      count={itemCount(f.id)}
                      isMenuOpen={openMenuId === f.id}
                      onOpen={() => enterFolder(f)}
                      onMenuToggle={e => { e.stopPropagation(); setOpenMenuId(prev => prev === f.id ? null : f.id); }}
                      onRename={() => { setRenameTarget(f); setFolderName(f.name); setOpenMenuId(null); }}
                      onDelete={() => handleDeleteFolder(f)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ── Fichiers ─────────────────────────────────────── */}
            {currentItems.length > 0 || (currentFolders.length === 0 && !search) ? (
              <div>
                {(currentFolders.length > 0 || currentItems.length > 0) && (
                  <p style={{ fontSize: 10, fontWeight: 800, color: T.textMuted, letterSpacing: '0.8px', textTransform: 'uppercase', margin: '0 0 10px 0' }}>
                    FICHIERS
                  </p>
                )}
                {currentItems.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 180, textAlign: 'center' }}>
                    <FolderOpen size={36} color={T.textFaint} style={{ marginBottom: 12 }} />
                    <p style={{ fontSize: 15, fontWeight: 700, color: T.text, margin: 0, marginBottom: 4 }}>
                      {search ? 'Aucun résultat' : 'Dossier vide'}
                    </p>
                    <p style={{ fontSize: 13, color: T.textMuted, margin: 0 }}>
                      {search ? 'Modifie ta recherche.' : 'Ajoute une ressource dans ce dossier.'}
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 16 }}>
                    {currentItems.map(item => (
                      <ContentCard key={item.id} item={item} folders={folders} onDelete={handleDelete} canDelete />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              currentFolders.length === 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 220, textAlign: 'center' }}>
                  <BookOpen size={38} color={T.textFaint} style={{ marginBottom: 14 }} />
                  <p style={{ fontSize: 15, fontWeight: 700, color: T.text, margin: 0, marginBottom: 5 }}>Bibliothèque vide</p>
                  <p style={{ fontSize: 13, color: T.textMuted, margin: 0, maxWidth: 300 }}>Crée un dossier ou ajoute ta première ressource.</p>
                </div>
              )
            )}
          </>
        ))}
      </div>

      {/* ── Modal : ajouter contenu ─────────────────────────────── */}
      {showAddModal && (
        <ModalOverlay onClose={closeAddModal}>
          <h2 style={mStyles.title}>Nouvelle ressource</h2>
          <form onSubmit={handleAdd} style={mStyles.form}>
            <ModalField label="Titre *">
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Analyse défensive" required style={inputStyle} />
            </ModalField>
            <ModalField label="URL *">
              <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://youtube.com/... ou autre lien" required type="url" style={inputStyle} />
              {url && isYoutubeUrl(url) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 5 }}>
                  <Youtube size={11} color={T.red} /><span style={{ fontSize: 11, color: T.red, fontWeight: 600 }}>Vidéo YouTube détectée</span>
                </div>
              )}
            </ModalField>
            <ModalField label="Dossier">
              <select value={addFolderId ?? ''} onChange={e => setAddFolderId(e.target.value || null)} style={{ ...inputStyle, appearance: 'auto' }}>
                <option value="">— Racine (aucun dossier) —</option>
                {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </ModalField>
            <ModalField label="Description (optionnel)">
              <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Contexte, points à observer..." rows={2} style={{ ...inputStyle, resize: 'none', fontFamily: 'inherit' }} />
            </ModalField>
            {formError && <ErrorBox msg={formError} />}
            <ModalActions saving={saving} disabled={!title.trim() || !url.trim()} onCancel={closeAddModal} label="Publier" />
          </form>
        </ModalOverlay>
      )}

      {/* ── Modal : créer dossier ───────────────────────────────── */}
      {showFolderModal && (
        <ModalOverlay onClose={() => { setShowFolderModal(false); setFolderName(''); }}>
          <h2 style={mStyles.title}>Nouveau dossier</h2>
          <form onSubmit={handleCreateFolder} style={mStyles.form}>
            <ModalField label="Nom du dossier *">
              <input value={folderName} onChange={e => setFolderName(e.target.value)} placeholder="Ex: Tactique défensive" required autoFocus style={inputStyle} />
            </ModalField>
            <ModalActions saving={folderSaving} disabled={!folderName.trim()} onCancel={() => { setShowFolderModal(false); setFolderName(''); }} label="Créer" />
          </form>
        </ModalOverlay>
      )}

      {/* ── Modal : renommer dossier ────────────────────────────── */}
      {renameTarget && (
        <ModalOverlay onClose={() => { setRenameTarget(null); setFolderName(''); }}>
          <h2 style={mStyles.title}>Renommer le dossier</h2>
          <form onSubmit={handleRenameFolder} style={mStyles.form}>
            <ModalField label="Nouveau nom *">
              <input value={folderName} onChange={e => setFolderName(e.target.value)} required autoFocus style={inputStyle} />
            </ModalField>
            <ModalActions saving={folderSaving} disabled={!folderName.trim()} onCancel={() => { setRenameTarget(null); setFolderName(''); }} label="Renommer" />
          </form>
        </ModalOverlay>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── FolderCard ───────────────────────────────────────────────────────────────

function FolderCard({ folder, count, isMenuOpen, onOpen, onMenuToggle, onRename, onDelete }: {
  folder: SharedFolder; count: number; isMenuOpen: boolean;
  onOpen: () => void; onMenuToggle: (e: React.MouseEvent) => void;
  onRename: () => void; onDelete: () => void;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={onOpen}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, width: '100%',
          background: T.cardBg, border: `1px solid ${T.border}`, borderLeft: `3px solid ${T.navy}`,
          borderRadius: 10, padding: '12px 14px', cursor: 'pointer', textAlign: 'left',
          boxShadow: '0 1px 3px rgba(15,23,42,0.05)',
        }}
      >
        <div style={{ width: 36, height: 36, borderRadius: 8, background: T.navyLight, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Folder size={16} color={T.navy} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: T.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.name}</p>
          <p style={{ fontSize: 11, color: T.textMuted, margin: 0, marginTop: 2 }}>{count} ressource{count !== 1 ? 's' : ''}</p>
        </div>
        <ChevronRight size={15} color={T.textFaint} style={{ flexShrink: 0 }} />
      </button>

      {/* Menu contextuel */}
      <button
        onClick={onMenuToggle}
        style={{ position: 'absolute', top: 10, right: 36, background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 5, color: T.textFaint }}
      >
        <MoreHorizontal size={14} />
      </button>
      {isMenuOpen && (
        <div style={{ position: 'absolute', top: 36, right: 4, zIndex: 30, background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 8, padding: '4px 0', boxShadow: '0 8px 24px rgba(15,23,42,0.12)', minWidth: 140 }}>
          <button onClick={(e) => { e.stopPropagation(); onRename(); }} style={menuItemStyle}>
            <Pencil size={13} /> Renommer
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }} style={{ ...menuItemStyle, color: T.red }}>
            <Trash2 size={13} /> Supprimer
          </button>
        </div>
      )}
    </div>
  );
}

const menuItemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
  padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer',
  fontSize: 13, fontWeight: 600, color: T.text, textAlign: 'left',
};

// ─── ContentCard ─────────────────────────────────────────────────────────────

export function ContentCard({ item, folders, onDelete, canDelete = false }: {
  item: SharedContent; folders?: SharedFolder[];
  onDelete?: (id: string) => void; canDelete?: boolean;
}) {
  const ytId = item.content_type === 'youtube' ? extractYoutubeId(item.url) : null;
  const folder = folders?.find(f => f.id === item.folder_id);

  return (
    <div style={{ background: T.cardBg, borderRadius: 12, border: `1px solid ${T.border}`, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 1px 3px rgba(15,23,42,0.05)' }}>
      {/* Visual header */}
      {ytId ? (
        <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', position: 'relative', aspectRatio: '16/9', background: '#000', flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(220,38,38,0.90)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 0, height: 0, borderTop: '7px solid transparent', borderBottom: '7px solid transparent', borderLeft: '12px solid white', marginLeft: 3 }} />
            </div>
          </div>
          <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(0,0,0,0.60)', borderRadius: 99, padding: '3px 8px' }}>
            <Youtube size={10} color="#fff" /><span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>Vidéo</span>
          </div>
        </a>
      ) : (
        <div style={{ height: 80, background: 'linear-gradient(135deg, #1a2744 0%, #2d4a7a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', flexShrink: 0 }}>
          <Link2 size={28} color="rgba(255,255,255,0.35)" />
          <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.14)', borderRadius: 99, padding: '3px 8px', border: '1px solid rgba(255,255,255,0.18)' }}>
            <Link2 size={10} color="#fff" /><span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>Lien</span>
          </div>
        </div>
      )}
      {/* Body */}
      <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: T.text, margin: 0, lineHeight: 1.4 }}>{item.title}</p>
        {item.description && (
          <p style={{ fontSize: 12, color: T.textMuted, margin: 0, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties}>
            {item.description}
          </p>
        )}
        {folder && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <Folder size={10} color={T.textFaint} />
            <span style={{ fontSize: 10, color: T.textFaint }}>{folder.name}</span>
          </div>
        )}
      </div>
      {/* Footer */}
      <div style={{ padding: '8px 14px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: `1px solid ${T.border}` }}>
        <span style={{ fontSize: 11, color: T.textFaint }}>{new Date(item.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 11, fontWeight: 600, color: T.navy, textDecoration: 'none' }}>
            <ExternalLink size={11} />Ouvrir
          </a>
          {canDelete && onDelete && (
            <button onClick={() => onDelete(item.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 6, border: 'none', background: 'none', cursor: 'pointer', color: T.textFaint }}>
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Shared modal primitives ──────────────────────────────────────────────────

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: T.cardBg, borderRadius: 16, padding: '28px 28px 24px', width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(15,23,42,0.18)' }} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

function ModalActions({ saving, disabled, onCancel, label }: { saving: boolean; disabled: boolean; onCancel: () => void; label: string }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <button type="submit" disabled={saving || disabled} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: T.navy, color: '#fff', fontSize: 13, fontWeight: 700, opacity: (saving || disabled) ? 0.55 : 1 }}>
        {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : null}
        {label}
      </button>
      <button type="button" onClick={onCancel} style={{ padding: '10px 16px', borderRadius: 8, border: `1px solid ${T.border}`, background: 'none', color: T.textMuted, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
        Annuler
      </button>
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return <div style={{ padding: '8px 12px', borderRadius: 8, background: T.redBg, border: '1px solid #fca5a5' }}><p style={{ fontSize: 12, color: T.red, margin: 0 }}>{msg}</p></div>;
}

const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, boxSizing: 'border-box', border: `1px solid ${T.border}`, fontSize: 13, color: T.text, outline: 'none', background: T.cardBg2 };
const mStyles = {
  title: { fontSize: 16, fontWeight: 800, color: T.text, margin: '0 0 22px 0' } as React.CSSProperties,
  form:  { display: 'flex', flexDirection: 'column', gap: 14 } as React.CSSProperties,
};
