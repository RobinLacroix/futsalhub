'use client';

/**
 * Grille de saisie des tests physiques — surface de rattrapage.
 *
 * Le terrain se saisit sur mobile, une main sur le chrono. Cette grille sert à
 * l'autre moitié du travail : reprendre une feuille papier ou un tableur le
 * soir, corriger une valeur, compléter les absents. D'où trois choix qui
 * n'auraient aucun sens sur téléphone.
 *
 * 1. **Plusieurs tests affichés en même temps.** Un tableur a une colonne par
 *    test ; imposer un test à la fois obligerait à recoller sept fois.
 * 2. **Le collage tableur est la fonction principale**, pas un bonus. Coller
 *    depuis la cellule du premier joueur remplit vers la droite puis vers le
 *    bas.
 * 3. **Entrée descend d'une ligne**, convention tableur, pendant que Tab garde
 *    son déplacement horizontal natif. Les flèches haut et bas naviguent aussi ;
 *    gauche et droite sont laissées au curseur dans le champ.
 *
 * ## Les cellules illisibles sont montrées, jamais avalées
 *
 * `parseTestInput` renvoie `null` sur ce qu'il ne sait pas lire et le service
 * traduit `null` par une suppression : un collage décalé d'une colonne
 * effacerait des résultats en silence. Une cellule non numérique reste donc
 * affichée, encadrée en rouge, et comptée dans le bandeau. C'est la même
 * famille de faute que `parseFloat('0,5')` valant 0 sur les `RatingScaleEditor`.
 */

import { useCallback, useMemo, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  formatTestValue,
  parsePastedGrid,
  type PhysicalTestType,
} from '@/lib/physicalTests';
import type { Player } from '@/types';
import { entryKey, type GridColumn } from '../hooks/useTestCapture';

interface TestGridProps {
  players: Player[];
  selectedTypes: PhysicalTestType[];
  columns: GridColumn[];
  entries: Record<string, string[]>;
  unreadableKeys: Set<string>;
  onCellChange: (testTypeId: string, playerId: string, attemptIndex: number, raw: string) => void;
  onPaste: (anchorRow: number, anchorCol: number, grid: string[][], columns: GridColumn[]) => number;
  onPasted: (cellCount: number) => void;
  retainedFor: (testTypeId: string, playerId: string) => number | null;
}

const cellRefKey = (row: number, col: number) => `${row}:${col}`;

export default function TestGrid({
  players,
  selectedTypes,
  columns,
  entries,
  unreadableKeys,
  onCellChange,
  onPaste,
  onPasted,
  retainedFor,
}: TestGridProps) {
  const inputs = useRef(new Map<string, HTMLInputElement>());

  /**
   * Position d'une cellule dans `columns`, donc son ancre de collage. Calculée
   * une fois plutôt qu'incrémentée au fil du rendu : un compteur qui dépend de
   * l'ordre d'évaluation du JSX se décale au premier `map` réordonné.
   */
  const colIndexOf = useMemo(() => {
    const map = new Map<string, number>();
    columns.forEach((column, index) =>
      map.set(`${column.testTypeId}:${column.attemptIndex}`, index),
    );
    return map;
  }, [columns]);

  const focusCell = useCallback((row: number, col: number) => {
    const target = inputs.current.get(cellRefKey(row, col));
    if (!target) return;
    target.focus();
    target.select();
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>, row: number, col: number) => {
      if (event.key === 'Enter' || event.key === 'ArrowDown') {
        event.preventDefault();
        focusCell(row + 1, col);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        focusCell(row - 1, col);
      }
    },
    [focusCell],
  );

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLInputElement>, row: number, col: number) => {
      const text = event.clipboardData.getData('text');
      if (!text) return;
      event.preventDefault();
      onPasted(onPaste(row, col, parsePastedGrid(text), columns));
    },
    [columns, onPaste, onPasted],
  );

  if (selectedTypes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-400 bg-white py-12 text-center">
        <p className="text-gray-600">Choisissez au moins un test à saisir.</p>
      </div>
    );
  }

  if (players.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-400 bg-white py-12 text-center">
        <p className="text-gray-600">
          Cette campagne n&apos;a aucun joueur rattaché. Vérifiez la convocation de la séance ou
          l&apos;effectif de l&apos;équipe.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-50">
            <th
              rowSpan={2}
              scope="col"
              className="sticky left-0 z-20 min-w-[200px] border-b border-r border-gray-200 bg-gray-50 px-3 py-2 text-left font-semibold text-gray-900"
            >
              Joueur
            </th>
            {selectedTypes.map((type) => (
              <th
                key={type.id}
                scope="colgroup"
                colSpan={type.attempts + 1}
                className="border-b border-l border-gray-200 px-3 py-2 text-center font-semibold text-gray-900"
              >
                {type.label}
                <span className="ml-1 font-normal text-gray-500">({type.unit})</span>
              </th>
            ))}
          </tr>
          <tr className="bg-gray-50">
            {selectedTypes.map((type) => (
              <FragmentHeader key={type.id} type={type} />
            ))}
          </tr>
        </thead>

        {/* Fond opaque obligatoire sur les lignes : la première colonne est
            collante, une teinte translucide laisserait défiler les chronos
            par-dessous le nom du joueur. */}
        <tbody>
          {players.map((player, rowIndex) => (
            <tr key={player.id} className="bg-white even:bg-gray-50">
              <th
                scope="row"
                className="sticky left-0 z-10 border-b border-r border-gray-200 bg-inherit px-3 py-1.5 text-left font-medium text-gray-900"
              >
                <span className="tabular-nums text-gray-500">
                  {player.number != null ? `${player.number}. ` : ''}
                </span>
                {player.first_name} {player.last_name}
              </th>

              {selectedTypes.map((type) => {
                const key = entryKey(type.id, player.id);
                const values = entries[key] ?? Array(type.attempts).fill('');
                const retained = retainedFor(type.id, player.id);

                return (
                  <FragmentRow key={type.id}>
                    {values.slice(0, type.attempts).map((raw, attemptIndex) => {
                      const col = colIndexOf.get(`${type.id}:${attemptIndex}`) ?? 0;
                      const unreadable = unreadableKeys.has(`${key}:${attemptIndex}`);
                      return (
                        <td
                          key={attemptIndex}
                          className={`border-b border-gray-200 p-0 ${attemptIndex === 0 ? 'border-l' : ''}`}
                        >
                          <input
                            ref={(node) => {
                              if (node) inputs.current.set(cellRefKey(rowIndex, col), node);
                              else inputs.current.delete(cellRefKey(rowIndex, col));
                            }}
                            value={raw}
                            onChange={(e) =>
                              onCellChange(type.id, player.id, attemptIndex, e.target.value)
                            }
                            onKeyDown={(e) => handleKeyDown(e, rowIndex, col)}
                            onPaste={(e) => handlePaste(e, rowIndex, col)}
                            onFocus={(e) => e.target.select()}
                            inputMode="decimal"
                            aria-label={`${player.first_name} ${player.last_name}, ${type.label}, essai ${attemptIndex + 1}`}
                            aria-invalid={unreadable}
                            title={
                              unreadable
                                ? "Valeur illisible : elle ne sera pas enregistrée. Utilisez un nombre, la virgule est acceptée."
                                : undefined
                            }
                            className={`w-20 bg-transparent px-2 py-1.5 text-center tabular-nums outline-none focus:bg-blue-50 focus:ring-2 focus:ring-inset focus:ring-blue-500 ${
                              unreadable ? 'bg-red-50 text-red-700 ring-2 ring-inset ring-red-400' : ''
                            }`}
                          />
                        </td>
                      );
                    })}
                    <td className="border-b border-gray-200 px-2 py-1.5 text-center tabular-nums text-gray-500">
                      {retained !== null ? formatTestValue(retained, type) : '—'}
                    </td>
                  </FragmentRow>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Deuxième ligne d'en-tête : les essais du test, puis la valeur retenue. */
function FragmentHeader({ type }: { type: PhysicalTestType }) {
  return (
    <>
      {Array.from({ length: type.attempts }, (_, index) => (
        <th
          key={index}
          scope="col"
          className={`border-b border-gray-200 px-2 py-1.5 text-center text-xs font-medium text-gray-500 ${
            index === 0 ? 'border-l' : ''
          }`}
        >
          Essai {index + 1}
        </th>
      ))}
      <th
        scope="col"
        className="border-b border-gray-200 px-2 py-1.5 text-center text-xs font-semibold text-gray-700"
        title={retainedHint(type)}
      >
        Retenu
      </th>
    </>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/**
 * La règle de rétention n'est pas devinable : sur un catalogue qui mélange
 * chronos et hauteurs, « meilleur essai » veut dire le plus petit ici et le plus
 * grand là. L'infobulle le dit, plutôt que de laisser le coach conclure.
 */
function retainedHint(type: PhysicalTestType): string {
  if (type.aggregation === 'mean') return 'Moyenne des essais.';
  if (type.aggregation === 'last') return 'Dernier essai.';
  return type.direction === 'lower_is_better'
    ? 'Meilleur essai : la valeur la plus basse.'
    : type.direction === 'higher_is_better'
      ? 'Meilleur essai : la valeur la plus haute.'
      : 'Premier essai exploitable.';
}

/** Bandeau d'alerte sur les cellules illisibles, posé par la page au-dessus. */
export function UnreadableBanner({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <div className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>
        {count} cellule{count > 1 ? 's' : ''} illisible{count > 1 ? 's' : ''} : ces valeurs ne
        seront pas enregistrées. Un nombre est attendu, la virgule décimale est acceptée.
      </span>
    </div>
  );
}

