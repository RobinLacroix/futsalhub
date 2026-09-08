'use client';

/**
 * Équipe de landing par défaut (admin) — réglable dans les paramètres.
 *
 * Sans réglage, l'app retombe sur l'équipe mémorisée localement (dernière
 * consultée), et à défaut sur un choix automatique (première équipe
 * alphabétique). Ce composant permet à un admin de club de fixer ce choix
 * automatique plutôt que de le subir — la mémorisation locale garde priorité
 * quand elle existe déjà, ce réglage ne joue que pour la retomber.
 *
 * RPC déjà en place : `get_my_default_team_id` / `set_my_default_team_id`
 * (`supabase/migrations/20260907120000_admin_default_team.sql`), écriture
 * restreinte aux admins du club côté serveur. `teams` est passé par la page
 * parente (déjà chargé pour l'affectation des membres), pas re-fetché ici.
 */

import { useEffect, useState } from 'react';
import { Home } from 'lucide-react';
import { teamsService } from '@/lib/services';

interface DefaultTeamEditorProps {
  teams: { id: string; name: string }[];
}

export function DefaultTeamEditor({ teams }: DefaultTeamEditorProps) {
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setSelected((await teamsService.getMyDefaultTeamId()) ?? '');
      } catch {
        setSelected('');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async (teamId: string) => {
    const previous = selected;
    setSelected(teamId);
    setSaving(true);
    setFeedback(null);
    try {
      await teamsService.setMyDefaultTeamId(teamId || null);
      setFeedback({
        tone: 'ok',
        text: teamId ? 'Équipe par défaut enregistrée.' : 'Retour au choix automatique.',
      });
    } catch {
      setSelected(previous);
      setFeedback({ tone: 'error', text: "Échec de l'enregistrement." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fm-card">
      <div className="fm-card-header">
        <div className="fm-card-accent" />
        <div className="fm-card-title"><Home size={15} /> Équipe par défaut à l&apos;ouverture</div>
      </div>
      <div className="fm-card-body">
        <p style={{ fontSize: '0.8125rem', color: '#6B7280', marginTop: 0, marginBottom: 14 }}>
          Équipe sur laquelle tu atterris quand l&apos;app s&apos;ouvre sans équipe déjà mémorisée sur cet
          appareil (première connexion, nouvel appareil, cache vidé). Le reste du temps, l&apos;app
          rouvre là où tu l&apos;as laissée.
        </p>
        {loading ? (
          <p style={{ fontSize: '0.8125rem', color: '#6B7280' }}>Chargement…</p>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <select
              value={selected}
              onChange={e => save(e.target.value)}
              disabled={saving}
              style={{
                padding: '8px 12px', borderRadius: 8, border: '1px solid #E2E8F0',
                fontSize: '0.8125rem', color: '#0F172A', minWidth: 240,
                background: '#fff', opacity: saving ? 0.6 : 1,
              }}
            >
              <option value="">Choix automatique</option>
              {teams.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {feedback && (
              <span
                style={{
                  fontSize: '0.8125rem',
                  fontWeight: feedback.tone === 'error' ? 700 : 400,
                  color: feedback.tone === 'error' ? '#DC2626' : '#6B7280',
                }}
              >
                {feedback.text}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
