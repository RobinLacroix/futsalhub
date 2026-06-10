'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { usePlayerProfile } from '../../hooks/usePlayerProfile';
import type { SharedContent, SharedFolder } from '@/types';
import {
  BookOpen, ChevronLeft, ChevronRight, ExternalLink,
  Folder, Link2, Loader2, Youtube,
} from 'lucide-react';

// ─── Theme FM light ───────────────────────────────────────────────────────────

const T = {
  pageBg:    '#EEF0F5',
  cardBg:    '#FFFFFF',
  cardBg2:   '#F8FAFC',
  border:    '#DDE1EA',
  divider:   '#E8EDF4',
  text:      '#1A2332',
  textMuted: '#697585',
  textFaint: '#94a3b8',
  navy:      '#1a2744',
  navyLight: '#e8eef8',
  red:       '#dc2626',
  redBg:     '#fef2f2',
  blue:      '#1e40af',
  blueBg:    '#eff6ff',
  blueBorder:'#bfdbfe',
};

type ContentFilter = 'all' | 'youtube' | 'link';

function extractYoutubeId(url: string): string | null {
  const patterns = [/[?&]v=([a-zA-Z0-9_-]{11})/, /youtu\.be\/([a-zA-Z0-9_-]{11})/, /embed\/([a-zA-Z0-9_-]{11})/];
  for (const p of patterns) { const m = url.match(p); if (m) return m[1]; }
  return null;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PlayerSharedPage() {
  const { player, loading: playerLoading } = usePlayerProfile();

  const [folders, setFolders] = useState<SharedFolder[]>([]);
  const [items,   setItems]   = useState<SharedContent[]>([]);
  const [loading, setLoading] = useState(true);

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath,       setFolderPath]       = useState<SharedFolder[]>([]);
  const [filter,           setFilter]           = useState<ContentFilter>('all');

  useEffect(() => {
    if (playerLoading) return;
    if (!player) { setLoading(false); return; }
    (async () => {
      const [fRes, iRes] = await Promise.all([
        supabase.rpc('get_my_shared_folders'),
        supabase.rpc('get_my_shared_content'),
      ]);
      setFolders((fRes.data ?? []) as SharedFolder[]);
      setItems((iRes.data ?? []) as SharedContent[]);
      setLoading(false);
    })();
  }, [player, playerLoading]);

  // Reset filter on folder change
  useEffect(() => { setFilter('all'); }, [currentFolderId]);

  const currentFolders = useMemo(
    () => folders.filter(f => f.parent_id === currentFolderId),
    [folders, currentFolderId]
  );

  const currentItems = useMemo(() => {
    let out = items.filter(i => (i.folder_id ?? null) === currentFolderId);
    if (filter !== 'all') out = out.filter(i => i.content_type === filter);
    return out;
  }, [items, currentFolderId, filter]);

  const countInFolder = useCallback((fid: string | null): number => {
    const direct = items.filter(i => (i.folder_id ?? null) === fid).length;
    const children = folders.filter(f => f.parent_id === fid).reduce((sum, f) => sum + countInFolder(f.id), 0);
    return direct + children;
  }, [items, folders]);

  const enterFolder = (f: SharedFolder) => {
    setCurrentFolderId(f.id);
    setFolderPath(prev => [...prev, f]);
  };

  const navigateTo = (index: number) => {
    if (index < 0) { setCurrentFolderId(null); setFolderPath([]); }
    else { const p = folderPath.slice(0, index + 1); setFolderPath(p); setCurrentFolderId(p[p.length - 1].id); }
  };

  if (playerLoading || loading) {
    return (
      <div style={{ background: T.pageBg, minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 240 }}>
        <Loader2 size={24} color={T.textFaint} style={{ animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!player) {
    return (
      <div style={{ background: T.pageBg, minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 240 }}>
        <p style={{ color: T.textMuted, fontSize: 14 }}>Profil joueur introuvable.</p>
      </div>
    );
  }

  const totalItems = items.length;
  const ytCount   = items.filter(i => (i.folder_id ?? null) === currentFolderId && i.content_type === 'youtube').length;
  const linkCount = items.filter(i => (i.folder_id ?? null) === currentFolderId && i.content_type === 'link').length;
  const directCount = items.filter(i => (i.folder_id ?? null) === currentFolderId).length;

  return (
    <div style={{ background: T.pageBg, minHeight: '100%' }}>

      {/* ── Sticky header ─────────────────────────────────────────── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: T.cardBg, borderBottom: `1px solid ${T.border}` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 10 }}>

          {/* Back button or library icon */}
          {folderPath.length > 0 ? (
            <button
              onClick={() => navigateTo(folderPath.length - 2)}
              style={{ width: 34, height: 34, borderRadius: 9, background: T.navyLight, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >
              <ChevronLeft size={18} color={T.navy} />
            </button>
          ) : (
            <div style={{ width: 34, height: 34, borderRadius: 9, background: T.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <BookOpen size={15} color="#fff" />
            </div>
          )}

          {/* Breadcrumb */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              <button onClick={() => navigateTo(-1)} style={{ background: 'none', border: 'none', padding: 0, cursor: folderPath.length > 0 ? 'pointer' : 'default' }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: folderPath.length > 0 ? T.textMuted : T.text, letterSpacing: '-0.2px' }}>
                  Bibliothèque
                </span>
              </button>
              {folderPath.map((f, i) => (
                <span key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <ChevronRight size={13} color={T.textFaint} />
                  <button onClick={() => navigateTo(i)} style={{ background: 'none', border: 'none', padding: 0, cursor: i < folderPath.length - 1 ? 'pointer' : 'default' }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: i === folderPath.length - 1 ? T.text : T.textMuted, letterSpacing: '-0.2px' }}>
                      {f.name}
                    </span>
                  </button>
                </span>
              ))}
            </div>
            <p style={{ fontSize: 11, color: T.textFaint, margin: 0, marginTop: 1 }}>
              {folderPath.length === 0
                ? `${totalItems} ressource${totalItems !== 1 ? 's' : ''}`
                : `${currentItems.length} fichier${currentItems.length !== 1 ? 's' : ''} dans ce dossier`}
            </p>
          </div>
        </div>

        {/* ── Filter chips ──────────────────────────────────────── */}
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 12px', display: 'flex', gap: 6 }}>
          {([
            { value: 'all',     label: 'Tous',  count: directCount },
            { value: 'youtube', label: 'Vidéo', count: ytCount },
            { value: 'link',    label: 'Lien',  count: linkCount },
          ] as const).map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 11px', borderRadius: 7, cursor: 'pointer',
                fontSize: 12, fontWeight: 600, border: '1px solid',
                background: filter === f.value ? T.navy : T.cardBg,
                borderColor: filter === f.value ? T.navy : T.border,
                color: filter === f.value ? '#fff' : T.textMuted,
              }}
            >
              {f.label}
              {f.count > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700, borderRadius: 10, padding: '1px 5px',
                  background: filter === f.value ? 'rgba(255,255,255,0.18)' : '#e4e9f0',
                  color: filter === f.value ? '#fff' : T.textMuted,
                }}>
                  {f.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 24px 40px' }}>

        {/* Dossiers */}
        {currentFolders.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <p style={sectionLabel}>DOSSIERS</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
              {currentFolders.map(f => {
                const count = countInFolder(f.id);
                return (
                  <button
                    key={f.id}
                    onClick={() => enterFolder(f)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      background: T.cardBg, border: `1px solid ${T.border}`,
                      borderLeft: `3px solid ${T.navy}`, borderRadius: 10,
                      padding: '11px 13px', cursor: 'pointer', textAlign: 'left',
                      boxShadow: '0 1px 3px rgba(15,23,42,0.05)',
                    }}
                  >
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: T.navyLight, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Folder size={15} color={T.navy} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: T.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</p>
                      <p style={{ fontSize: 11, color: T.textFaint, margin: 0, marginTop: 1 }}>{count} ressource{count !== 1 ? 's' : ''}</p>
                    </div>
                    <ChevronRight size={14} color={T.textFaint} style={{ flexShrink: 0 }} />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Fichiers */}
        {(currentFolders.length > 0 || currentItems.length > 0) && (
          <p style={sectionLabel}>FICHIERS</p>
        )}

        {currentItems.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: 60, paddingBottom: 60, textAlign: 'center' }}>
            <BookOpen size={38} color={T.textFaint} style={{ marginBottom: 14 }} />
            <p style={{ fontSize: 15, fontWeight: 700, color: T.text, margin: 0, marginBottom: 5 }}>
              {currentFolders.length === 0 && totalItems === 0 ? 'Aucune ressource partagée' : 'Aucun fichier ici'}
            </p>
            <p style={{ fontSize: 13, color: T.textMuted, margin: 0 }}>
              {currentFolders.length === 0 && totalItems === 0
                ? 'Ton staff n\'a pas encore publié de ressources.'
                : filter !== 'all' ? 'Aucun résultat pour ce filtre.' : 'Ce dossier ne contient pas de fichiers directs.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 14 }}>
            {currentItems.map(item => <PlayerContentCard key={item.id} item={item} />)}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── PlayerContentCard ────────────────────────────────────────────────────────

function PlayerContentCard({ item }: { item: SharedContent }) {
  const ytId = item.content_type === 'youtube' ? extractYoutubeId(item.url) : null;
  const isYt = item.content_type === 'youtube';
  const [expanded, setExpanded] = useState(false);

  const logView = () => {
    supabase.rpc('log_shared_content_view', { p_content_id: item.id }).then(null, () => {});
  };

  return (
    <div style={{ background: T.cardBg, borderRadius: 12, border: `1px solid ${T.border}`, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 1px 3px rgba(15,23,42,0.05)' }}>

      {/* ── Visual header ─────────────────── */}
      {ytId ? (
        <button
          onClick={() => { if (!expanded) logView(); setExpanded(v => !v); }}
          style={{ display: 'block', width: '100%', position: 'relative', aspectRatio: '16/9', background: '#000', flexShrink: 0, border: 'none', padding: 0, cursor: 'pointer' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: expanded ? 0.6 : 1, transition: 'opacity 0.15s' }}
          />
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: expanded ? 'rgba(80,80,80,0.88)' : 'rgba(220,38,38,0.90)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.2s',
            }}>
              {expanded ? (
                <div style={{ display: 'flex', gap: 4 }}>
                  <div style={{ width: 4, height: 14, background: '#fff', borderRadius: 1 }} />
                  <div style={{ width: 4, height: 14, background: '#fff', borderRadius: 1 }} />
                </div>
              ) : (
                <div style={{ width: 0, height: 0, borderTop: '8px solid transparent', borderBottom: '8px solid transparent', borderLeft: '14px solid white', marginLeft: 4 }} />
              )}
            </div>
          </div>
          {/* Type pill */}
          <div style={{ position: 'absolute', bottom: 10, left: 10, display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(0,0,0,0.60)', borderRadius: 99, padding: '3px 8px' }}>
            <Youtube size={10} color="#fff" />
            <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>Vidéo</span>
          </div>
        </button>
      ) : (
        <div style={{ height: 80, background: 'linear-gradient(135deg, #1a2744 0%, #2d4a7a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', flexShrink: 0 }}>
          <Link2 size={28} color="rgba(255,255,255,0.3)" />
          <div style={{ position: 'absolute', bottom: 10, left: 10, display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.14)', borderRadius: 99, padding: '3px 8px', border: '1px solid rgba(255,255,255,0.18)' }}>
            <Link2 size={10} color="#fff" />
            <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>Lien externe</span>
          </div>
        </div>
      )}

      {/* ── YouTube embed ──────────────────── */}
      {expanded && ytId && (
        <div style={{ aspectRatio: '16/9', width: '100%' }}>
          <iframe
            src={`https://www.youtube.com/embed/${ytId}?autoplay=1`}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}

      {/* ── Body ──────────────────────────── */}
      <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {/* Badge lien (comme mobile) */}
        {!isYt && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, alignSelf: 'flex-start', padding: '3px 8px', borderRadius: 5, border: `1px solid ${T.blueBorder}`, background: T.blueBg }}>
            <ExternalLink size={11} color={T.blue} />
            <span style={{ fontSize: 10, fontWeight: 700, color: T.blue, letterSpacing: '0.3px' }}>Lien externe</span>
          </div>
        )}
        <p style={{ fontSize: 13, fontWeight: 700, color: T.text, margin: 0, lineHeight: 1.4 }}>{item.title}</p>
        {item.description && (
          <p style={{ fontSize: 12, color: T.textMuted, margin: 0, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties}>
            {item.description}
          </p>
        )}
      </div>

      {/* ── Footer ────────────────────────── */}
      <div style={{ padding: '8px 14px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: `1px solid ${T.divider}`, marginTop: 'auto' }}>
        <span style={{ fontSize: 11, color: T.textFaint }}>
          {new Date(item.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
        </span>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={logView}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 12px', borderRadius: 8,
            background: T.navy, color: '#fff',
            fontSize: 12, fontWeight: 700, textDecoration: 'none',
          }}
        >
          Ouvrir
          <ExternalLink size={11} />
        </a>
      </div>
    </div>
  );
}

// ─── Shared ───────────────────────────────────────────────────────────────────

const sectionLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 800, color: T.textFaint,
  letterSpacing: '0.8px', textTransform: 'uppercase',
  margin: '0 0 8px 0',
};
