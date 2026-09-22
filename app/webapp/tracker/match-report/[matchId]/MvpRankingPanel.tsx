'use client';

/**
 * Classement des votes MVP — vue staff, pour un match. Composant autonome
 * (même logique que CoachNoteCell dans ce dossier) : sa propre requête, rien
 * à décomposer dans le monolithe match-report pour l'y brancher.
 */

import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { getMatchMvpVotes, type MatchMvpRanking } from '@/lib/services';

export function MvpRankingPanel({ matchId }: { matchId: string }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<MatchMvpRanking | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getMatchMvpVotes(matchId)
      .then(r => { if (!cancelled) setData(r); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Erreur'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [matchId]);

  if (loading) return null;
  if (error) return null;
  if (!data || data.ranking.length === 0) return null;

  const topVotes = data.ranking[0]?.votes ?? 0;

  return (
    <div className="bg-gray-50 rounded-xl p-5 mt-6 print:hidden">
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 flex items-center gap-1.5">
        <Trophy size={12} /> Classement MVP
      </h3>
      <p className="text-xs text-gray-400 mb-4">
        {data.isComplete
          ? `Vote terminé — ${data.votedCount}/${data.totalVoters} réponses.`
          : `Vote en cours — ${data.votedCount}/${data.totalVoters} réponses. Le titre officiel n'est attribué qu'une fois tout le monde voté.`}
      </p>
      <table className="w-full text-sm max-w-md">
        <tbody>
          {data.ranking.map((row, i) => {
            const isTop = data.isComplete && data.mvpPlayerIds.includes(row.player_id);
            return (
              <tr key={row.player_id} className={i % 2 === 0 ? '' : 'bg-white/60'}>
                <td className="py-2 font-semibold text-gray-800 flex items-center gap-1.5">
                  {isTop && <Trophy size={13} className="text-amber-500" />}
                  {row.player_name}
                </td>
                <td className="py-2 text-right w-16 font-mono text-gray-600">
                  {row.votes} vx
                </td>
                <td className="py-2 w-24">
                  <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className="h-full bg-amber-400"
                      style={{ width: topVotes > 0 ? `${Math.round((row.votes / topVotes) * 100)}%` : '0%' }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
