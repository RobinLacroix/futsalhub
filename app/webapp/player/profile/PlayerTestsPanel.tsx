/**
 * Tests physiques sur la fiche joueur — miroir de
 * mobile/components/players/PlayerTestsSection.tsx.
 *
 * Le repère de groupe n'est affiché qu'à l'encadrement (showSquadReference) :
 * RLS n'ouvre les résultats d'un joueur qu'à lui-même et au staff, donc une
 * « moyenne du groupe » calculée par un joueur vaudrait sa propre valeur.
 */
'use client';

import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Loader2, Gauge } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { physicalTestsService } from '@/lib/services/physicalTestsService';
import {
  buildPlayerSeries,
  carriesJudgement,
  compareValues,
  formatTestValue,
  formatTestValueWithUnit,
  measureKey,
  rawDelta,
  squadAverages,
  CATEGORY_LABELS,
  MIN_SQUAD_REFERENCE,
  type PlayerTestSeries,
  type SquadReference,
} from '@/lib/physicalTests';

const MAX_POINTS = 8;

const fmtShort = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
const fmtLong = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export function PlayerTestsPanel({ playerId, showSquadReference }: { playerId: string; showSquadReference: boolean }) {
  const { theme } = useTheme();
  const c = theme.colors;

  const [series, setSeries] = useState<PlayerTestSeries[]>([]);
  const [squad, setSquad] = useState<Map<string, SquadReference>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const rows = await physicalTestsService.getPlayerResults(playerId);
        if (cancelled) return;

        if (rows.length === 0) {
          setSeries([]);
          setSquad(new Map());
          return;
        }

        const testTypeIds = [...new Set(rows.map(r => r.test_type_id))];
        const types = await physicalTestsService.getTestTypesByIds(testTypeIds);
        if (cancelled) return;

        const measures = rows.map(r => ({
          session_id: r.session_id,
          test_type_id: r.test_type_id,
          value: r.value,
          date: r.session.date,
        }));
        const built = buildPlayerSeries(measures, types);
        setSeries(built);

        if (!showSquadReference) {
          setSquad(new Map());
          return;
        }

        const latestSessionIds = [...new Set(built.map(s => s.latest.sessionId))];
        const squadRows = await physicalTestsService.getSquadRetainedResults(latestSessionIds, testTypeIds);
        if (cancelled) return;

        setSquad(
          squadAverages(
            squadRows.map(r => ({
              session_id: r.session_id,
              test_type_id: r.test_type_id,
              player_id: r.player_id,
              value: r.value,
              date: '',
            })),
            types,
          ),
        );
      } catch {
        if (!cancelled) { setSeries([]); setSquad(new Map()); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [playerId, showSquadReference]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
        <Loader2 size={20} color={c.text.tertiary} style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (series.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <Gauge size={32} color={c.text.tertiary} style={{ marginBottom: 10 }} />
        <p style={{ fontSize: 13, fontWeight: 700, color: c.text.primary, margin: 0, marginBottom: 4 }}>Aucun test physique</p>
        <p style={{ fontSize: 12, color: c.text.tertiary, margin: 0 }}>
          Les résultats apparaissent après une campagne de tests saisie depuis une séance.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {series.map((s, i) => (
        <TestBlock
          key={s.type.id}
          series={s}
          reference={squad.get(measureKey(s.latest.sessionId, s.type.id)) ?? null}
          isLast={i === series.length - 1}
        />
      ))}
    </div>
  );
}

function TestBlock({ series, reference, isLast }: { series: PlayerTestSeries; reference: SquadReference | null; isLast: boolean }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const { type, points, latest, previous, best, delta } = series;
  const judges = carriesJudgement(type.direction);

  let trend: { text: string; color: string } | null = null;
  if (previous) {
    if (!judges) {
      const raw = rawDelta(previous.value, latest.value);
      trend = raw === 0
        ? { text: `stable depuis le ${fmtShort(previous.date)}`, color: c.text.tertiary }
        : { text: `${raw > 0 ? '+' : '−'}${Math.abs(raw).toFixed(type.decimals)} ${type.unit} depuis le ${fmtShort(previous.date)}`, color: c.text.tertiary };
    } else if (delta === null || delta === 0) {
      trend = { text: `stable depuis le ${fmtShort(previous.date)}`, color: c.text.tertiary };
    } else {
      const amount = `${Math.abs(delta).toFixed(type.decimals)} ${type.unit}`;
      trend = delta > 0
        ? { text: `en progrès de ${amount} depuis le ${fmtShort(previous.date)}`, color: c.positive.default }
        : { text: `en recul de ${amount} depuis le ${fmtShort(previous.date)}`, color: c.negative.default };
    }
  }

  let groupLine: { text: string; color: string } | null = null;
  if (reference && reference.count >= MIN_SQUAD_REFERENCE) {
    const value = `Groupe ${formatTestValueWithUnit(reference.mean, type)} · ${reference.count} joueurs`;
    if (!judges) {
      groupLine = { text: value, color: c.text.tertiary };
    } else {
      const cmp = compareValues(latest.value, reference.mean, type.direction);
      groupLine = cmp === 'better' ? { text: `${value} · au-dessus du groupe`, color: c.positive.default }
        : cmp === 'worse' ? { text: `${value} · en dessous du groupe`, color: c.negative.default }
        : { text: `${value} · dans la moyenne`, color: c.text.tertiary };
    }
  }

  const chartPoints = points.slice(-MAX_POINTS);

  return (
    <div style={{ padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 8, borderBottom: isLast ? 'none' : `1px solid ${c.border.subtle}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: c.text.primary, margin: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{type.label}</p>
        <span style={{ fontSize: 10, fontWeight: 700, color: c.text.secondary, background: c.bg.sunken, border: `1px solid ${c.border.subtle}`, borderRadius: 6, padding: '2px 7px' }}>
          {CATEGORY_LABELS[type.category]}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4 }}>
        <span style={{ fontSize: 26, fontWeight: 800, color: c.text.primary, lineHeight: 1 }}>{formatTestValue(latest.value, type)}</span>
        <span style={{ fontSize: 12, color: c.text.tertiary, marginBottom: 3 }}>{type.unit}</span>
        {trend && <span style={{ fontSize: 11, fontWeight: 700, color: trend.color, marginLeft: 'auto', marginBottom: 3, textAlign: 'right' }}>{trend.text}</span>}
      </div>

      {groupLine && <p style={{ fontSize: 11, fontWeight: 600, color: groupLine.color, margin: 0 }}>{groupLine.text}</p>}

      {chartPoints.length > 1 && (
        <div style={{ height: 90, marginTop: 2 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartPoints.map(pt => ({ date: fmtShort(pt.date), value: pt.value }))} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: c.text.tertiary }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(v: number) => [formatTestValueWithUnit(v, type), type.label]}
                contentStyle={{ background: c.bg.surface, border: `1px solid ${c.border.subtle}`, borderRadius: 8, fontSize: 12 }}
              />
              <Line type="linear" dataKey="value" stroke={c.accent.default} strokeWidth={2} dot={{ r: 3, fill: c.accent.default }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <p style={{ fontSize: 11, color: c.text.tertiary, margin: 0 }}>
        {points.length} mesure{points.length > 1 ? 's' : ''} depuis le {fmtShort(points[0].date)}
        {points.length > 1 && judges ? ` · meilleure ${formatTestValueWithUnit(best, type)}` : ''}
      </p>

      {type.protocol_note ? <p style={{ fontSize: 11, color: c.text.tertiary, margin: 0 }}>{type.protocol_note}</p> : null}
    </div>
  );
}
