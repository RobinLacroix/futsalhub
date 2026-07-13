/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react/no-unescaped-entities */
import { AlertTriangle, ArrowRight, Clock, RefreshCw, Target, Trophy } from 'lucide-react';
import type { MatchData, Player, TeamStats } from '../types';
import { formatClock } from '../utils';

interface LiveSummaryProps {
  matchData: MatchData;
  getTeamStats: () => TeamStats;
  getTopPlayers: (statKey: keyof Player['stats'], limit?: number) => Player[];
  getTopPlayersByTotalShots: (limit?: number) => Player[];
  getTopPlayersByTime: (limit?: number) => Player[];
}

export default function LiveSummary({
  matchData,
  getTeamStats,
  getTopPlayers,
  getTopPlayersByTotalShots,
  getTopPlayersByTime,
}: LiveSummaryProps) {
  return (
    <div className="space-y-3">
      {/* Statistiques générales */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 border border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <Trophy className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          Bilan du Match
        </h2>
        
        {/* Statistiques des tirs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          {/* Notre équipe */}
          <div className="bg-blue-50 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-600 rounded p-3 shadow-sm">
            <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-1">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              Notre Équipe
            </h3>
            <div className="space-y-1">
              <div className="flex justify-between items-center py-1 px-2 bg-blue-100 dark:bg-blue-800/60 rounded border border-blue-200 dark:border-blue-700">
                <span className="text-xs font-medium text-blue-800 dark:text-blue-200">Tirs totaux</span>
                <span className="font-bold text-blue-950 dark:text-white text-sm">{getTeamStats().totalShots}</span>
              </div>
              <div className="flex justify-between items-center py-1 px-2 bg-green-100 dark:bg-green-800/60 rounded border border-green-200 dark:border-green-700">
                <span className="text-xs font-medium text-green-800 dark:text-green-200">Tirs cadrés</span>
                <span className="font-bold text-green-950 dark:text-white text-sm">{getTeamStats().totalShotsOnTarget}</span>
              </div>
              <div className="flex justify-between items-center py-1 px-2 bg-yellow-100 dark:bg-yellow-800/60 rounded border border-yellow-200 dark:border-yellow-700">
                <span className="text-xs font-medium text-yellow-800 dark:text-yellow-200">Tirs non cadrés</span>
                <span className="font-bold text-yellow-950 dark:text-white text-sm">{getTeamStats().totalShotsOffTarget}</span>
              </div>
            </div>
          </div>

          {/* Équipe adverse */}
          <div className="bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-600 rounded p-3 shadow-sm">
            <h3 className="text-sm font-semibold text-red-900 dark:text-red-100 mb-2 flex items-center gap-1">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              Équipe Adverse
            </h3>
            <div className="space-y-1">
              <div className="flex justify-between items-center py-1 px-2 bg-red-100 dark:bg-red-800/60 rounded border border-red-200 dark:border-red-700">
                <span className="text-xs font-medium text-red-800 dark:text-red-200">Total tirs</span>
                <span className="font-bold text-red-950 dark:text-white text-sm">
                  {getTeamStats().opponentShots}
                  {matchData.currentHalf === 2 && matchData.firstHalfOpponentActions.shotsOnTarget + matchData.firstHalfOpponentActions.shotsOffTarget > 0 && (
                    <span className="text-xs text-red-600 dark:text-red-400 ml-1">
                      ({matchData.firstHalfOpponentActions.shotsOnTarget + matchData.firstHalfOpponentActions.shotsOffTarget})
                    </span>
                  )}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 px-2 bg-orange-100 dark:bg-orange-800/60 rounded border border-orange-200 dark:border-orange-700">
                <span className="text-xs font-medium text-orange-800 dark:text-orange-200">Tirs cadrés</span>
                <span className="font-bold text-orange-950 dark:text-orange-200 text-sm">
                  {getTeamStats().opponentShotsOnTarget}
                  {matchData.currentHalf === 2 && matchData.firstHalfOpponentActions.shotsOnTarget > 0 && (
                    <span className="text-xs text-orange-600 dark:text-orange-400 ml-1">
                      ({matchData.firstHalfOpponentActions.shotsOnTarget})
                    </span>
                  )}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 px-2 bg-yellow-100 dark:bg-yellow-800/60 rounded border border-yellow-200 dark:border-yellow-700">
                <span className="text-xs font-medium text-yellow-800 dark:text-yellow-200">Tirs non cadrés</span>
                <span className="font-bold text-yellow-950 dark:text-white text-sm">
                  {getTeamStats().opponentShotsOffTarget}
                  {matchData.currentHalf === 2 && matchData.firstHalfOpponentActions.shotsOffTarget > 0 && (
                    <span className="text-xs text-yellow-600 dark:text-yellow-400 ml-1">
                      ({matchData.firstHalfOpponentActions.shotsOffTarget})
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Top joueurs par catégorie */}
        <div className="grid grid-cols-2 gap-3">
          {/* Temps de jeu */}
          <div className="bg-green-50 dark:bg-green-900/40 border border-green-200 dark:border-green-600 rounded p-3 shadow-sm">
            <h3 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-2 flex items-center gap-1">
              <Clock className="h-4 w-4" />
              Plus de temps de jeu
            </h3>
            <div className="space-y-1">
              {getTopPlayersByTime().map((player, index) => (
                <div key={player.id} className="flex justify-between items-center py-1 px-2 bg-green-100 dark:bg-green-800/60 rounded border border-green-200 dark:border-green-700">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-medium text-green-800 dark:text-green-200">
                      {index + 1}. {player.name}
                    </span>
                  </div>
                  <span className="font-mono text-xs font-bold text-green-950 dark:text-white">
                    {formatClock(player.totalTime)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Tirs */}
          <div className="bg-yellow-50 dark:bg-yellow-900/40 border border-yellow-200 dark:border-yellow-600 rounded p-3 shadow-sm">
            <h3 className="text-sm font-semibold text-yellow-900 dark:text-yellow-100 mb-2 flex items-center gap-1">
              <Target className="h-4 w-4" />
              Plus de tirs
            </h3>
            <div className="space-y-1">
              {getTopPlayersByTotalShots().map((player, index) => {
                const totalShots = (player.stats.shotsOnTarget || 0) + (player.stats.shotsOffTarget || 0);
                return (
                  <div key={player.id} className="flex justify-between items-center py-1 px-2 bg-yellow-100 dark:bg-yellow-800/60 rounded border border-yellow-200 dark:border-yellow-700">
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-medium text-yellow-800 dark:text-yellow-200">
                        {index + 1}. {player.name}
                      </span>
                    </div>
                    <span className="font-mono text-xs font-bold text-yellow-950 dark:text-white">
                      {totalShots} ({player.stats.shotsOnTarget || 0} cadrés)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Récupérations */}
          <div className="bg-blue-50 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-600 rounded p-3 shadow-sm">
            <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-1">
              <RefreshCw className="h-4 w-4" />
              Plus de récupérations
            </h3>
            <div className="space-y-1">
              {getTopPlayers('ballRecovery').map((player, index) => (
                <div key={player.id} className="flex justify-between items-center py-1 px-2 bg-blue-100 dark:bg-blue-800/60 rounded border border-blue-200 dark:border-blue-700">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-medium text-blue-800 dark:text-blue-200">
                      {index + 1}. {player.name}
                    </span>
                  </div>
                  <span className="font-mono text-xs font-bold text-blue-950 dark:text-white">
                    {player.stats.ballRecovery || 0}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Pertes de balle */}
          <div className="bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-600 rounded p-3 shadow-sm">
            <h3 className="text-sm font-semibold text-red-900 dark:text-red-100 mb-2 flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" />
              Plus de pertes de balle
            </h3>
            <div className="space-y-1">
              {getTopPlayers('ballLoss').map((player, index) => (
                <div key={player.id} className="flex justify-between items-center py-1 px-2 bg-red-100 dark:bg-red-800/60 rounded border border-red-200 dark:border-red-700">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-medium text-red-800 dark:text-red-200">
                      {index + 1}. {player.name}
                    </span>
                  </div>
                  <span className="font-mono text-xs font-bold text-red-950 dark:text-white">
                    {player.stats.ballLoss || 0}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Passes décisives */}
          <div className="bg-purple-50 dark:bg-purple-900/40 border border-purple-200 dark:border-purple-600 rounded p-3 shadow-sm">
            <h3 className="text-sm font-semibold text-purple-900 dark:text-purple-100 mb-2 flex items-center gap-1">
              <ArrowRight className="h-4 w-4" />
              Plus de passes décisives
            </h3>
            <div className="space-y-1">
              {getTopPlayers('assists').map((player, index) => (
                <div key={player.id} className="flex justify-between items-center py-1 px-2 bg-purple-100 dark:bg-purple-800/60 rounded border border-purple-200 dark:border-purple-700">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-medium text-purple-800 dark:text-purple-200">
                      {index + 1}. {player.name}
                    </span>
                  </div>
                  <span className="font-mono text-xs font-bold text-purple-950 dark:text-white">
                    {player.stats.assists || 0}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 1v1 perdus */}
          <div className="bg-orange-50 dark:bg-orange-900/40 border border-orange-200 dark:border-orange-600 rounded p-3 shadow-sm">
            <h3 className="text-sm font-semibold text-orange-900 dark:text-orange-100 mb-2 flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" />
              Plus de 1v1 perdus
            </h3>
            <div className="space-y-1">
              {getTopPlayers('oneOnOneDefLost').map((player, index) => (
                <div key={player.id} className="flex justify-between items-center py-1 px-2 bg-orange-100 dark:bg-orange-800/60 rounded border border-orange-200 dark:border-orange-700">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-medium text-orange-800 dark:text-orange-200">
                      {index + 1}. {player.name}
                    </span>
                  </div>
                  <span className="font-mono text-xs font-bold text-orange-950 dark:text-white">
                    {player.stats.oneOnOneDefLost || 0}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
