'use client';

/**
 * "Ajouter des joueurs d'autres équipes" — modal partagée par la convocation
 * match et la convocation entraînement (`calendar/page.tsx`, 3700+ lignes,
 * cf. CLAUDE.md « pièges connus »). Les deux modaux étaient dupliqués à
 * l'identique dans le monolithe ; extraits ici pour ajouter la recherche
 * texte sans dupliquer une troisième fois le même bloc.
 *
 * Le filtre équipe reste piloté par le parent (`filterTeamId`/`candidates`
 * déjà filtrés) : c'est un état partagé entre les deux modaux dans
 * `calendar/page.tsx`, pas quelque chose à changer ici. Seule la recherche
 * texte est un état local à la modale, réinitialisé à chaque ouverture.
 */

import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';

/**
 * Sous-ensemble structurel de `Player` — délibérément pas le type `Player` de
 * `@/types` ni celui, différent, déclaré localement dans `calendar/page.tsx` :
 * la modale n'a besoin que de ces trois champs, autant ne pas se coupler à
 * l'un ou l'autre.
 */
export interface OtherTeamPlayersCandidate {
  player: { id: string; first_name: string; last_name: string };
  teamNames: string[];
}

export interface OtherTeamPlayersModalProps {
  open: boolean;
  teams: { id: string; name: string }[];
  activeTeamId?: string;
  filterTeamId: string;
  onFilterTeamChange: (teamId: string) => void;
  candidates: OtherTeamPlayersCandidate[];
  selectedIds: Record<string, boolean>;
  onToggle: (playerId: string, checked: boolean) => void;
  onClose: () => void;
  onConfirm: () => void;
  dividerBorderColor: string;
  dividerBg: string;
  accentColor: string;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function OtherTeamPlayersModal({
  open,
  teams,
  activeTeamId,
  filterTeamId,
  onFilterTeamChange,
  candidates,
  selectedIds,
  onToggle,
  onClose,
  onConfirm,
  dividerBorderColor,
  dividerBg,
  accentColor,
}: OtherTeamPlayersModalProps) {
  const [search, setSearch] = useState('');

  // La recherche ne doit pas survivre à une fermeture : rouvrir la modale sur
  // un match différent avec un texte déjà tapé masquerait des joueurs sans
  // que le coach comprenne pourquoi.
  useEffect(() => {
    if (open) setSearch('');
  }, [open]);

  if (!open) return null;

  const filtered = search.trim()
    ? candidates.filter(({ player }) => norm(`${player.first_name} ${player.last_name}`).includes(norm(search)))
    : candidates;

  return (
    <div className="fm-overlay fm-overlay-top">
      <div className="fm-modal" style={{ maxWidth: 520 }}>
        <div className="fm-modal-header">
          <div className="fm-modal-title">
            <div className="fm-modal-title-bar" />
            Ajouter des joueurs d&apos;autres équipes
          </div>
          <button type="button" className="fm-modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: '14px 20px', borderBottom: `1.5px solid ${dividerBorderColor}`, background: dividerBg }}>
          <label className="fm-label">Filtrer par équipe</label>
          <select value={filterTeamId} onChange={(e) => onFilterTeamChange(e.target.value)} className="fm-select">
            <option value="all">Toutes les équipes</option>
            {teams.filter((team) => team.id !== activeTeamId).map((team) => (
              <option key={team.id} value={team.id}>{team.name}</option>
            ))}
          </select>
          <div className="relative" style={{ marginTop: 10 }}>
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
            <input
              type="text"
              placeholder="Rechercher un joueur..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="fm-input"
              style={{ paddingLeft: 36 }}
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="border rounded-md divide-y max-h-[320px] overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-sm text-gray-500 p-3">Aucun joueur ne correspond.</p>
            ) : (
              filtered.map(({ player, teamNames }) => (
                <label
                  key={player.id}
                  className="flex items-center justify-between gap-3 p-3 hover:bg-gray-50 cursor-pointer"
                >
                  <span className="text-sm text-gray-900">
                    {player.first_name} {player.last_name}
                    {teamNames.length > 0 && (
                      <span className="text-xs text-gray-500 ml-1">({teamNames.join(', ')})</span>
                    )}
                  </span>
                  <input
                    type="checkbox"
                    checked={!!selectedIds[player.id]}
                    onChange={(e) => onToggle(player.id, e.target.checked)}
                    style={{ accentColor, width: 15, height: 15 }}
                  />
                </label>
              ))
            )}
          </div>
        </div>
        <div className="fm-modal-footer">
          <button type="button" className="fm-btn fm-btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="fm-btn fm-btn-blue" onClick={onConfirm}>
            Ajouter la sélection
          </button>
        </div>
      </div>
    </div>
  );
}
