export const metadata = {
  title: "Politique de confidentialité — FutsalHub",
  description: "Politique de confidentialité de l'application FutsalHub.",
};

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "Responsable du traitement",
    body: (
      <p>
        FutsalHub est édité par Robin Lacroix, à titre individuel. Pour toute question relative
        à vos données personnelles, contactez{" "}
        <a href="mailto:robin.j.lacroix@gmail.com" className="text-[#FFB020] underline">
          robin.j.lacroix@gmail.com
        </a>
        .
      </p>
    ),
  },
  {
    title: "Données collectées",
    body: (
      <>
        <p>FutsalHub collecte les données suivantes, strictement nécessaires au fonctionnement du service :</p>
        <ul className="list-disc pl-6 space-y-1 mt-2">
          <li>Données de compte : adresse e-mail, nom, mot de passe (stocké de façon chiffrée).</li>
          <li>
            Données saisies par les coachs dans le cadre de la gestion d&apos;équipe : profils joueurs (nom,
            poste), présences, évaluations, données de séances et de matchs (statistiques d&apos;entraînement
            et de match saisies manuellement).
          </li>
          <li>Jeton de notification push, si vous autorisez les notifications sur l&apos;application mobile.</li>
        </ul>
        <p className="mt-2">
          FutsalHub n&apos;utilise aucun outil d&apos;analytics ou de tracking publicitaire tiers.
        </p>
      </>
    ),
  },
  {
    title: "Finalité du traitement",
    body: (
      <p>
        Ces données sont utilisées exclusivement pour faire fonctionner le service : gestion des équipes et
        des joueurs, suivi des séances et des matchs, envoi de notifications liées à l&apos;activité de votre
        club (convocations, rappels). Aucune donnée n&apos;est utilisée à des fins publicitaires.
      </p>
    ),
  },
  {
    title: "Base légale",
    body: (
      <p>
        Le traitement repose sur l&apos;exécution du service auquel vous ou votre club avez souscrit
        (exécution du contrat) et, pour les notifications, sur votre consentement explicite.
      </p>
    ),
  },
  {
    title: "Hébergement et sécurité",
    body: (
      <p>
        Les données sont hébergées et sécurisées via Supabase (base de données et authentification). Les
        échanges entre l&apos;application et les serveurs sont chiffrés (HTTPS). L&apos;accès aux données
        d&apos;un club est restreint par des règles d&apos;isolation au niveau de la base de données, garantissant
        qu&apos;un utilisateur ne peut accéder qu&apos;aux données de son ou ses club(s).
      </p>
    ),
  },
  {
    title: "Partage des données",
    body: (
      <p>
        FutsalHub ne vend aucune donnée personnelle et ne les partage avec aucun tiers à des fins commerciales
        ou publicitaires. Les seuls sous-traitants techniques sont ceux nécessaires au fonctionnement du
        service (hébergement de la base de données, envoi des notifications push).
      </p>
    ),
  },
  {
    title: "Durée de conservation",
    body: (
      <p>
        Les données sont conservées tant que le compte ou le club reste actif sur FutsalHub. En cas de
        suppression d&apos;un joueur, les données sont conservées en statut &laquo; Parti &raquo; (aucune perte
        d&apos;historique) sauf demande explicite de suppression définitive.
      </p>
    ),
  },
  {
    title: "Vos droits",
    body: (
      <p>
        Conformément au RGPD, vous disposez d&apos;un droit d&apos;accès, de rectification, d&apos;effacement et
        de portabilité de vos données. Pour exercer ces droits, contactez{" "}
        <a href="mailto:robin.j.lacroix@gmail.com" className="text-[#FFB020] underline">
          robin.j.lacroix@gmail.com
        </a>
        .
      </p>
    ),
  },
  {
    title: "Modifications",
    body: (
      <p>
        Cette politique peut être mise à jour. La date de dernière mise à jour figure en haut de cette page.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#0E0E10] text-white px-6 py-16">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Politique de confidentialité</h1>
        <p className="text-white/50 text-sm mb-10">Dernière mise à jour : juillet 2026</p>

        <div className="space-y-8">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-semibold mb-2 text-[#FFB020]">{section.title}</h2>
              <div className="text-white/80 leading-relaxed text-sm">{section.body}</div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
