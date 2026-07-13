import type { Player, MatchEventType } from '../types';

// ─── Normalisation ────────────────────────────────────────────────────────────

// Suppression diacritiques après NFD (U+0300 - U+036F)
const DIACRITICS_RE = /[̀-ͯ]/g;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS_RE, '')
    .replace(/['’‘`]/g, "'")
    .trim();
}

// ─── Mapping keywords → eventType ────────────────────────────────────────────

// Ordre décroissant de longueur pour éviter les faux positifs ("tir cadré" avant "tir")
const EVENT_KEYWORDS: { keywords: string[]; eventType: MatchEventType; isOpponent?: boolean }[] = [
  {
    // Nombreuses variantes car l'ASR confond souvent "cadré" avec d'autres phonèmes
    keywords: [
      'tir cadre adverse', 'tir cadree adverse',
      'tir cadre adv', 'tir cadree adv',
      'tir cadre adversaire', 'tir cadree adversaire',
      'cadre adverse', 'cadree adverse',
      'cadre adversaire', 'cadree adversaire',
    ],
    eventType: 'opponent_shot_on_target', isOpponent: true,
  },
  { keywords: ['but adverse', 'but adv', 'but adversaire'],  eventType: 'opponent_goal',  isOpponent: true },
  { keywords: ['tir adverse', 'tir adv', 'tir adversaire'],  eventType: 'opponent_shot',  isOpponent: true },
  { keywords: ['perte de balle', 'perte balle'],            eventType: 'ball_loss' },
  { keywords: ['passe decisive', 'passe dec', 'passe dec.', 'assist'], eventType: 'assist' },
  { keywords: ['carton jaune', 'carton jne'],               eventType: 'yellow_card' },
  { keywords: ['carton rouge', 'carton rge'],               eventType: 'red_card' },
  {
    // Variantes pour l'équipe : ASR supprime parfois "tir" ou transcrit "cadré" différemment
    keywords: [
      'tir cadre', 'tir cadree',
      'tc',
      'cadre', 'cadree',
    ],
    eventType: 'shot_on_target',
  },
  { keywords: ['recuperation', 'recup', 'recupe'],          eventType: 'recovery' },
  { keywords: ['perte'],                                    eventType: 'ball_loss' },
  { keywords: ['jaune'],                                    eventType: 'yellow_card' },
  { keywords: ['rouge'],                                    eventType: 'red_card' },
  { keywords: ['tir'],                                      eventType: 'shot' },
  { keywords: ['but'],                                      eventType: 'goal' },
];

// Mapping eventType → statKey (identique à evToStat dans PhoneMatchRecorder)
export const EVENT_STAT_KEY: Record<string, string> = {
  goal:           'goals',
  shot_on_target: 'shotsOnTarget',
  shot:           'shotsOffTarget',
  recovery:       'ballRecovery',
  ball_loss:      'ballLoss',
  assist:         'assists',
  yellow_card:    '',
  red_card:       '',
};

interface EventMatch {
  eventType: MatchEventType;
  isOpponent: boolean;
  nameFragment: string;
}

function findEventType(normalizedText: string): EventMatch | null {
  for (const entry of EVENT_KEYWORDS) {
    for (const kw of entry.keywords) {
      const idx = normalizedText.indexOf(kw);
      if (idx !== -1) {
        const nameFragment = normalizedText.slice(0, idx).trim();
        return {
          eventType: entry.eventType,
          isOpponent: entry.isOpponent ?? false,
          nameFragment,
        };
      }
    }
  }
  return null;
}

// ─── Matching joueur ──────────────────────────────────────────────────────────

function scoreName(fragment: string, player: Player): number {
  const fn = normalize(player.first_name);
  const ln = normalize(player.last_name);
  const full = `${fn} ${ln}`;
  const fullRev = `${ln} ${fn}`;

  // Exact match (priorité max)
  if (fragment === fn || fragment === ln || fragment === full || fragment === fullRev) return 100;

  // Score par mots communs
  const fragWords = fragment.split(/\s+/).filter(Boolean);
  const nameWords = full.split(/\s+/).filter(Boolean);
  let score = 0;
  for (const fw of fragWords) {
    if (nameWords.some((nw) => nw.startsWith(fw) || fw.startsWith(nw))) score += 10;
  }
  return score;
}

export function findPlayer(nameFragment: string, players: Player[]): Player | null {
  if (!nameFragment || players.length === 0) return null;
  const normalized = normalize(nameFragment);

  let best: Player | null = null;
  let bestScore = 0;

  for (const p of players) {
    const s = scoreName(normalized, p);
    if (s > bestScore) { bestScore = s; best = p; }
  }

  return bestScore >= 10 ? best : null;
}

// ─── Résultat ─────────────────────────────────────────────────────────────────

export type VoiceCommandResult =
  | { kind: 'event'; eventType: MatchEventType; player: Player | null; statKey: string }
  | { kind: 'substitution'; playerOut: Player; playerIn: Player }
  | { kind: 'unknown'; transcript: string };

// ─── Parser principal ─────────────────────────────────────────────────────────

export function parseVoiceCommand(
  rawText: string,
  allPlayers: Player[],
  playersOnField: string[],
): VoiceCommandResult {
  const text = normalize(rawText);

  // ── Changement
  if (text.startsWith('changement')) {
    const afterCmd = text.slice('changement'.length).trim();
    const pourIdx = afterCmd.lastIndexOf(' pour ');
    if (pourIdx !== -1) {
      const nameOut = afterCmd.slice(0, pourIdx).trim();
      const nameIn  = afterCmd.slice(pourIdx + 6).trim();

      const fieldPlayers = allPlayers.filter((p) => playersOnField.includes(p.id));
      const benchPlayers = allPlayers.filter((p) => !playersOnField.includes(p.id));

      const playerOut = findPlayer(nameOut, fieldPlayers);
      const playerIn  = findPlayer(nameIn,  benchPlayers);

      if (playerOut && playerIn) {
        return { kind: 'substitution', playerOut, playerIn };
      }
    }
    // Fallback si parsing incomplet
    return { kind: 'unknown', transcript: rawText };
  }

  // ── Événement
  const match = findEventType(text);
  if (match) {
    if (match.isOpponent) {
      return {
        kind: 'event',
        eventType: match.eventType,
        player: null,
        statKey: EVENT_STAT_KEY[match.eventType] ?? '',
      };
    }

    // Les cartons peuvent toucher un joueur sur le banc (remplaçant, staff) — on cherche dans tous
    // Pour le reste (but, tir, récup, perte, passe) seul un joueur sur le terrain est concerné
    const isCard = match.eventType === 'yellow_card' || match.eventType === 'red_card';
    const searchPool = isCard
      ? allPlayers
      : allPlayers.filter((p) => playersOnField.includes(p.id));

    const player = findPlayer(match.nameFragment, searchPool);
    return {
      kind: 'event',
      eventType: match.eventType,
      player,
      statKey: EVENT_STAT_KEY[match.eventType] ?? '',
    };
  }

  return { kind: 'unknown', transcript: rawText };
}
