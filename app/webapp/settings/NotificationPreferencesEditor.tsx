'use client';

import { useEffect, useState } from 'react';
import { Bell, Calendar, HeartPulse, ClipboardList, MessageSquare } from 'lucide-react';
import { notificationsService, DEFAULT_NOTIF_PREFS, type CoachNotifType, type NotificationPreferences } from '@/lib/services';

const ROWS: { key: CoachNotifType; label: string; hint: string; Icon: typeof Calendar }[] = [
  { key: 'absence_report',         label: 'Présence / absence',       hint: 'Un joueur se déclare absent ou en retard.',        Icon: Calendar },
  { key: 'injury',                 label: 'Blessure',                 hint: 'Un joueur se déclare blessé.',                     Icon: HeartPulse },
  { key: 'questionnaire_response', label: 'Réponse au questionnaire', hint: 'Un joueur remplit son questionnaire de séance.',   Icon: ClipboardList },
  { key: 'feedback_comment',       label: 'Commentaire',              hint: 'Un joueur laisse un commentaire libre.',           Icon: MessageSquare },
];

export function NotificationPreferencesEditor() {
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_NOTIF_PREFS);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<CoachNotifType | null>(null);

  useEffect(() => {
    notificationsService.getPreferences()
      .then(setPrefs)
      .catch(() => setPrefs(DEFAULT_NOTIF_PREFS))
      .finally(() => setLoading(false));
  }, []);

  const toggle = async (key: CoachNotifType) => {
    const next = !prefs[key];
    const previous = prefs[key];
    setPrefs((p) => ({ ...p, [key]: next }));
    setPending(key);
    try {
      await notificationsService.setPreference(key, next);
    } catch {
      setPrefs((p) => ({ ...p, [key]: previous }));
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="fm-card">
      <div className="fm-card-header">
        <div className="fm-card-accent" style={{ background: '#0EA5E9' }} />
        <div className="fm-card-title"><Bell size={15} /> Notifications</div>
      </div>
      <div className="fm-card-body">
        <p style={{ color: '#6B7280', fontSize: '0.8125rem', marginBottom: 16 }}>
          Choisis les alertes que tu veux recevoir pour tes équipes. Coupe celles qui te
          surchargent, sans impacter les autres coachs.
        </p>
        {loading ? (
          <p style={{ color: '#9CA3AF', fontSize: '0.8125rem' }}>Chargement…</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {ROWS.map((row, idx) => (
              <div
                key={row.key}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0',
                  borderBottom: idx === ROWS.length - 1 ? 'none' : '1px solid #F1F5F9',
                }}
              >
                <row.Icon size={17} color="#64748B" style={{ marginTop: 2, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#0F172A' }}>{row.label}</div>
                  <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: 2 }}>{row.hint}</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={prefs[row.key]}
                  aria-label={row.label}
                  disabled={pending === row.key}
                  onClick={() => toggle(row.key)}
                  style={{
                    position: 'relative', width: 40, height: 22, borderRadius: 999, border: 'none',
                    cursor: pending === row.key ? 'default' : 'pointer', flexShrink: 0,
                    background: prefs[row.key] ? '#0EA5E9' : '#CBD5E1',
                    transition: 'background 0.15s', opacity: pending === row.key ? 0.6 : 1,
                  }}
                >
                  <span
                    style={{
                      position: 'absolute', top: 2, left: prefs[row.key] ? 20 : 2, width: 18, height: 18,
                      borderRadius: '50%', background: '#fff', transition: 'left 0.15s',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                    }}
                  />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
