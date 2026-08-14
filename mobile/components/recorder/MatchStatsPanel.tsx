/**
 * Bloc de statistiques d'équipe du bilan — tablette
 *
 * ## Ce qui n'allait pas
 *
 * Deux cartes côte à côte, « Notre équipe » avec quatre `Stat` et « Adversaire »
 * avec deux. Trois défauts, tous les mêmes au fond : la donnée était présentée,
 * pas lue.
 *
 * 1. **Nos tirs et les tirs concédés ne se comparaient pas.** Ce sont pourtant
 *    les deux moitiés d'une seule information. Elles vivaient dans deux cartes
 *    de tailles différentes, à des positions différentes, dans un ordre
 *    différent — donc le coach devait retenir un chiffre, traverser l'écran, et
 *    faire la soustraction de tête. C'est le travail que l'écran doit faire.
 * 2. **Aucun référentiel.** `Stat` porte `delta` et `density` précisément pour
 *    ça, et le rappelle dans son propre en-tête : « 4 buts n'est pas une
 *    analyse ». Quatorze tirs non plus.
 * 3. **La précision de tir n'était calculée nulle part** alors qu'elle est la
 *    lecture que le coach fait vraiment de la paire tirs / tirs cadrés, et
 *    qu'elle se déduit de deux nombres déjà présents.
 *
 * ## Ce qui la remplace
 *
 * **Ce qui est symétrique se compare, ce qui ne l'est pas se lit seul.**
 *
 * Tirs et tirs cadrés existent des deux côtés : ils passent en barres de part,
 * une seule piste partagée par les deux équipes. La longueur porte le rapport
 * de force, et se lit sans lire les chiffres.
 *
 * Récupérations et pertes n'ont **pas** d'équivalent adverse — on ne saisit pas
 * les pertes de l'adversaire. Les mettre dans une comparaison aurait fabriqué
 * une symétrie fausse, avec un zéro en face qui se lirait comme « ils n'en ont
 * pas fait » au lieu de « ce n'est pas mesuré ». Elles restent donc dans un bloc
 * à part, avec le seul référentiel honnête dont on dispose : leur solde.
 */

import { View } from 'react-native';
import { useTheme, makeStyles } from '../../contexts/ThemeContext';
import { Text, Card } from '../ui';

/** Les quatre compteurs d'équipe tenus par le recorder. */
export interface TeamStatsShape {
  total: number;
  onTarget: number;
  recoveries: number;
  ballLoss: number;
}

export interface MatchStatsPanelProps {
  teamStats: TeamStatsShape;
  opponentShotsTotal: number;
  opponentShotsOnTarget: number;
  /** Nom réel de l'adversaire. « Adversaire » à défaut. */
  opponentName?: string | null;
}

const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : null);

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ligne de comparaison : une piste unique partagée par les deux équipes.
 *
 * La part est proportionnelle au total des deux, pas à un maximum arbitraire :
 * c'est le rapport de force qui est l'information, pas la valeur absolue, déjà
 * écrite en toutes lettres de part et d'autre.
 *
 * À 0 partout (début de match, ou catégorie non saisie), la piste reste vide et
 * grise plutôt que coupée en deux : une piste à moitié pleine dirait « à
 * égalité » là où il n'y a rien à dire.
 */
function DuelRow({
  label,
  us,
  them,
  emphasis,
}: {
  label: string;
  us: number;
  them: number;
  emphasis?: boolean;
}) {
  const s = useStyles();
  const { theme } = useTheme();
  const c = theme.colors;

  const sum = us + them;
  const share = sum > 0 ? us / sum : 0;

  return (
    <View
      style={s.duelRow}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label} : ${us} pour nous, ${them} pour l'adversaire`}
    >
      <Text
        variant={emphasis ? 'title' : 'headline'}
        numeric
        color={c.accent.default}
        style={s.duelValue}
      >
        {us}
      </Text>

      <View style={s.duelMid}>
        <Text variant="caption" tone="secondary" style={s.duelLabel} numberOfLines={1}>
          {label}
        </Text>
        {/*
          Les deux parts sont peintes, pas seulement la nôtre. La légende
          annonce deux couleurs : n'en rendre qu'une laissait la part adverse se
          confondre avec la piste vide, donc avec « rien ».
        */}
        <View style={s.track}>
          {sum > 0 && (
            <>
              <View
                style={[
                  s.trackFill,
                  { width: `${Math.round(share * 100)}%`, backgroundColor: c.accent.default },
                ]}
              />
              <View style={[s.trackFill, s.trackFillThem, { backgroundColor: c.text.tertiary }]} />
            </>
          )}
        </View>
      </View>

      <Text
        variant={emphasis ? 'title' : 'headline'}
        numeric
        tone="secondary"
        style={s.duelValueRight}
      >
        {them}
      </Text>
    </View>
  );
}

/**
 * Deux jauges indépendantes, pour les grandeurs qui ne se partagent pas un
 * total. Une piste de part serait un contresens ici : 57 % et 44 % de précision
 * ne font pas 100 % à eux deux.
 */
function AccuracyRow({ us, them }: { us: number | null; them: number | null }) {
  const s = useStyles();
  const { theme } = useTheme();
  const c = theme.colors;

  const Gauge = ({ value, color, align }: { value: number | null; color: string; align: 'left' | 'right' }) => (
    <View style={[s.gaugeTrack, align === 'right' && s.gaugeTrackRight]}>
      {value != null && (
        <View style={[s.gaugeFill, { width: `${value}%`, backgroundColor: color }]} />
      )}
    </View>
  );

  return (
    <View
      style={s.duelRow}
      accessible
      accessibilityRole="text"
      accessibilityLabel={
        `Précision de tir : ${us == null ? 'non mesurable' : `${us} %`} pour nous, ` +
        `${them == null ? 'non mesurable' : `${them} %`} pour l'adversaire`
      }
    >
      <Text variant="headline" numeric color={us == null ? c.text.tertiary : c.accent.default} style={s.duelValue}>
        {us == null ? '—' : `${us}%`}
      </Text>

      <View style={s.duelMid}>
        <Text variant="caption" tone="secondary" style={s.duelLabel} numberOfLines={1}>
          Précision
        </Text>
        <View style={s.gaugePair}>
          <Gauge value={us} color={c.accent.default} align="left" />
          <Gauge value={them} color={c.text.tertiary} align="right" />
        </View>
      </View>

      <Text variant="headline" numeric tone={them == null ? 'tertiary' : 'secondary'} style={s.duelValueRight}>
        {them == null ? '—' : `${them}%`}
      </Text>
    </View>
  );
}

/**
 * Compteur sans contrepartie adverse : valeur, libellé, pas de comparaison.
 *
 * Même taille que la ligne de tirs du duel, et pas `display` : deux
 * récupérations ne doivent pas peser plus lourd à l'écran que huit tirs. En 30
 * px face aux 20 px du duel, elles capturaient le regard en premier alors
 * qu'elles sont la statistique secondaire des deux.
 */
function SoloStat({ value, label, color }: { value: number; label: string; color: string }) {
  const s = useStyles();
  return (
    <View style={s.solo} accessible accessibilityRole="text" accessibilityLabel={`${label} : ${value}`}>
      <Text variant="title" numeric color={color}>
        {value}
      </Text>
      <Text variant="caption" tone="secondary" numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function MatchStatsPanel({
  teamStats,
  opponentShotsTotal,
  opponentShotsOnTarget,
  opponentName,
}: MatchStatsPanelProps) {
  const s = useStyles();
  const { theme } = useTheme();
  const c = theme.colors;

  const them = opponentName?.trim() || 'Adversaire';
  const balance = teamStats.recoveries - teamStats.ballLoss;
  const balanceColor =
    balance > 0 ? c.positive.default : balance < 0 ? c.negative.default : c.text.tertiary;

  return (
    <View style={s.row}>
      <Card variant="flat" padding="lg" style={s.duelCard}>
        {/*
          La légende porte les deux noms une seule fois, en tête. Répéter
          « nous / eux » sur chaque ligne aurait triplé le texte pour une
          information que la position et la couleur donnent déjà.
        */}
        <View style={s.legend}>
          <View style={s.legendSide}>
            <View style={[s.dot, { backgroundColor: c.accent.default }]} />
            <Text variant="headline" numberOfLines={1}>
              Notre équipe
            </Text>
          </View>
          <View style={[s.legendSide, s.legendSideRight]}>
            <Text variant="headline" tone="secondary" numberOfLines={1}>
              {them}
            </Text>
            <View style={[s.dot, { backgroundColor: c.text.tertiary }]} />
          </View>
        </View>

        <DuelRow label="Tirs" us={teamStats.total} them={opponentShotsTotal} emphasis />
        <DuelRow label="Tirs cadrés" us={teamStats.onTarget} them={opponentShotsOnTarget} />
        <AccuracyRow
          us={pct(teamStats.onTarget, teamStats.total)}
          them={pct(opponentShotsOnTarget, opponentShotsTotal)}
        />
      </Card>

      <Card variant="flat" padding="lg" style={s.possCard}>
        <View style={s.possHead}>
          <Text variant="headline">Possession</Text>
          {/*
            Le solde est la seule lecture qui vaille sur ces deux compteurs :
            douze récupérations ne disent rien tant qu'on ignore combien de
            ballons ont été rendus dans le même match.
          */}
          <View style={[s.balanceChip, { borderColor: balanceColor }]}>
            <Text variant="caption" weight="700" numeric color={balanceColor}>
              {balance > 0 ? `+${balance}` : balance}
            </Text>
          </View>
        </View>

        <View style={s.possGrid}>
          <SoloStat value={teamStats.recoveries} label="Récupérations" color={c.positive.default} />
          <SoloStat value={teamStats.ballLoss} label="Pertes de balle" color={c.negative.default} />
        </View>

        {/*
          Sans cette ligne, l'absence de colonne adverse se lit comme un oubli
          d'affichage. C'est une limite de la saisie, pas de l'écran.
        */}
        <Text variant="caption" tone="tertiary">
          Non mesuré côté adverse.
        </Text>
      </Card>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.md },
  // Le duel prend deux fois plus de largeur que la possession : il porte trois
  // lignes et deux colonnes de chiffres, elle en porte deux côte à côte.
  duelCard: { flexGrow: 2, flexBasis: 420, gap: t.space.md },
  possCard: { flexGrow: 1, flexBasis: 240, gap: t.space.md },

  legend: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
  legendSide: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: t.space.xs, minWidth: 0 },
  legendSideRight: { justifyContent: 'flex-end' },
  dot: { width: 9, height: 9, borderRadius: 5 },

  duelRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  // Largeur fixe des deux côtés : sans elle, la piste se décale d'une ligne à
  // l'autre dès qu'un compteur passe à deux chiffres, et les barres ne sont
  // plus superposables — ce qui est tout l'intérêt de les empiler.
  duelValue: { width: 46, textAlign: 'left' },
  duelValueRight: { width: 46, textAlign: 'right' },
  duelMid: { flex: 1, minWidth: 0, gap: 3 },
  duelLabel: { textAlign: 'center' },

  track: {
    height: 10,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 2,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.bg.sunken,
    overflow: 'hidden',
  },
  trackFill: { height: '100%', borderRadius: t.radius.pill },
  // La part adverse prend ce qui reste, sans largeur calculée : deux
  // pourcentages arrondis séparément laissaient un liseré de piste nue à
  // certaines valeurs.
  trackFillThem: { flex: 1 },

  gaugePair: { flexDirection: 'row', gap: 3 },
  gaugeTrack: {
    flex: 1,
    height: 10,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.bg.sunken,
    overflow: 'hidden',
  },
  // La jauge adverse se remplit depuis la droite, pour que les deux progressent
  // en s'éloignant du centre comme les valeurs qu'elles portent.
  gaugeTrackRight: { flexDirection: 'row', justifyContent: 'flex-end' },
  gaugeFill: { height: '100%', borderRadius: t.radius.pill },

  possHead: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
  balanceChip: {
    minWidth: 34,
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: t.radius.pill,
    borderWidth: 1,
  },
  possGrid: { flexDirection: 'row', gap: t.space.lg },
  solo: { flex: 1, minWidth: 0, gap: t.space.xs },
}));
