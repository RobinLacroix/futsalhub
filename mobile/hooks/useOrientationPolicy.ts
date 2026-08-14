/**
 * Politique d'orientation par famille d'appareil (P0-6)
 *
 * `app.json` ne permet qu'un réglage global. Il était à `"portrait"` alors que
 * `supportsTablet: true`, ce qui cumulait trois problèmes :
 *   - motif de rejet App Store, une app déclarée compatible iPad doit se
 *     comporter comme une app iPad ;
 *   - faute fonctionnelle, le match recorder tablette est un outil de bord de
 *     terrain, posé sur un banc, donc utilisé en paysage ;
 *   - ni Split View ni Slide Over possibles, un coach ne pouvait pas mettre
 *     FutsalHub à côté de sa vidéo.
 *
 * `app.json` passe donc à `"default"` et la politique fine est appliquée ici :
 * **iPad libre, iPhone verrouillé en portrait**. Le verrouillage iPhone est
 * délibéré : les 39 écrans ont été dessinés pour du portrait, les libérer d'un
 * coup produirait des mises en page cassées sans bénéfice utilisateur.
 *
 * Quand un écran iPhone sera prêt pour le paysage (le recorder en priorité), il
 * pourra lever la contrainte localement via `unlockForScreen`.
 */

import { useEffect } from 'react';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useIsTablet } from './useIsTablet';

/** Applique la politique globale. À monter une seule fois, à la racine. */
export function useOrientationPolicy(): void {
  const isTablet = useIsTablet();

  useEffect(() => {
    let cancelled = false;
    const apply = async () => {
      try {
        if (isTablet) {
          await ScreenOrientation.unlockAsync();
        } else {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        }
      } catch {
        // Certaines configurations (simulateur, iPad en multitâche) refusent le
        // verrouillage. Sans conséquence : on retombe sur le comportement natif.
      }
      if (cancelled) return;
    };
    void apply();
    return () => { cancelled = true; };
  }, [isTablet]);
}

/**
 * Autorise le paysage sur un écran précis, y compris sur iPhone, et restaure la
 * politique globale au démontage.
 *
 * Prévu pour le match recorder : c'est le seul écran téléphone où le paysage a
 * un intérêt réel. Non branché pour l'instant, l'écran n'est pas encore adapté.
 */
export function useUnlockOrientationForScreen(enabled: boolean): void {
  const isTablet = useIsTablet();

  useEffect(() => {
    if (!enabled) return;
    void ScreenOrientation.unlockAsync().catch(() => {});
    return () => {
      if (isTablet) return;
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, [enabled, isTablet]);
}
