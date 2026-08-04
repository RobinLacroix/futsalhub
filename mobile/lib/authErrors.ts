/**
 * Messages d'erreur d'authentification, en français
 *
 * ## Pourquoi ce fichier existe
 *
 * `sign-in` et `sign-up` affichaient `e.message` brut. Or Supabase répond en
 * **anglais** : « Invalid login credentials », « Email not confirmed »,
 * « User already registered ». Sur le seul écran qu'un coach extérieur voit
 * avant de décider si le produit est sérieux, dans une application par ailleurs
 * entièrement en français.
 *
 * Pire que la langue : le message est technique et n'indique pas quoi faire.
 * « Email not confirmed » ne dit pas d'aller regarder ses spams.
 *
 * ## Ce qui n'est pas fait, volontairement
 *
 * Aucune distinction entre « cet email n'existe pas » et « le mot de passe est
 * faux ». Supabase renvoie déjà le même code pour les deux, et c'est le bon
 * comportement : les séparer permettrait d'énumérer les comptes existants.
 * Le message reste donc ambigu, à dessein.
 */

/** Correspondances sur le message renvoyé par gotrue, insensible à la casse. */
const PATTERNS: { match: RegExp; message: string }[] = [
  {
    match: /invalid login credentials|invalid grant/i,
    message: 'Email ou mot de passe incorrect.',
  },
  {
    match: /email not confirmed/i,
    message:
      'Ce compte n’est pas encore confirmé. Ouvre le lien reçu par email, puis reconnecte-toi. Pense à regarder tes spams.',
  },
  {
    match: /user already registered|already been registered/i,
    message: 'Un compte existe déjà avec cet email. Connecte-toi plutôt.',
  },
  {
    match: /password should be at least/i,
    message: 'Le mot de passe est trop court : 6 caractères au minimum.',
  },
  {
    match: /unable to validate email address|invalid email/i,
    message: 'Cette adresse email n’est pas valide.',
  },
  {
    match: /email rate limit exceeded|over_email_send_rate_limit/i,
    message: 'Trop de tentatives. Attends quelques minutes avant de réessayer.',
  },
  {
    match: /for security purposes|rate limit/i,
    message: 'Trop de tentatives rapprochées. Attends une minute avant de réessayer.',
  },
  {
    match: /network request failed|fetch failed|timeout/i,
    message: 'Connexion au serveur impossible. Vérifie ta connexion internet.',
  },
  {
    match: /signups not allowed|signup is disabled/i,
    message: 'La création de compte est désactivée. Contacte l’administrateur de ton club.',
  },
];

/**
 * Traduit une erreur d'authentification. Une erreur non répertoriée n'est pas
 * masquée : elle est rendue telle quelle, sinon on perdrait l'information sur
 * un cas qu'on n'a pas prévu.
 */
export function authErrorMessage(e: unknown, fallback: string): string {
  const raw =
    e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  if (!raw) return fallback;
  const hit = PATTERNS.find((p) => p.match.test(raw));
  return hit ? hit.message : raw;
}
