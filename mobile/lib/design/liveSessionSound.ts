import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { haptics } from './haptics';

let player: AudioPlayer | null = null;

function getPlayer(): AudioPlayer {
  if (!player) {
    player = createAudioPlayer(require('../../assets/sounds/phase-transition.mp3'));
  }
  return player;
}

/** Signal sonore + haptique à chaque bascule série/repos — le coach regarde le terrain, pas l'écran (design doc §4). */
export async function playPhaseTransitionSound(): Promise<void> {
  haptics.success();
  try {
    const p = getPlayer();
    await p.seekTo(0);
    p.play();
  } catch {
    // le retour haptique a déjà eu lieu — un échec de lecture audio (permissions, asset manquant) ne doit pas remonter d'erreur visible au coach en plein jeu.
  }
}
