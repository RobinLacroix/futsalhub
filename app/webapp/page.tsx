'use client';

export default function WebApp() {
  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold text-center mb-8">
        Bienvenue sur FutsalHub
      </h1>
      <p className="text-xl text-center text-gray-600 mb-8">
        La plateforme digitale pour les coachs de futsal
      </p>
      <p className="text-lg text-center text-gray-500 mb-12">
        Donnez à votre équipe l&apos;avantage du digital
      </p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Carte Manager */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Manager</h2>
          <p className="text-gray-600 mb-4">
            Gérez votre équipe, votre calendrier et vos effectifs.
          </p>
          <div className="space-y-2">
            <a
              href="/webapp/manager/calendar"
              className="block text-blue-600 hover:text-blue-700"
            >
              → Voir le calendrier
            </a>
            <div className="text-center">
      
              <a href="/webapp/manager/squad" 
              className="block text-blue-600 hover:text-blue-700">
                → Gérer l&apos;effectif
              </a>
            </div>
            <a
              href="/webapp/manager/dashboard"
              className="block text-blue-600 hover:text-blue-700"
            >
              → Voir le dashboard
            </a>
          </div>
        </div>

        {/* Carte Tracker */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Tracker</h2>
          <p className="text-gray-600 mb-4">
            Suivez vos matchs en direct et analysez les performances.
          </p>
          <div className="space-y-2">
            <a
              href="/webapp/tracker"
              className="block text-blue-600 hover:text-blue-700"
            >
              → Voir le dashboard
            </a>
            <a
              href="/webapp/tracker/matchrecorder"
              className="block text-blue-600 hover:text-blue-700"
            >
              → Enregistrer un match
            </a>
          </div>
        </div>

        {/* Carte Scout */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Scout</h2>
          <p className="text-gray-600 mb-4">
            Recrutez de nouveaux joueurs et staff.
          </p>
          <div className="space-y-2">
            <a
              href="/webapp/scout/opening"
              className="block text-blue-600 hover:text-blue-700"
            >
              → Publier une annonce
            </a>
            <a
              href="/webapp/scout/profiles"
              className="block text-blue-600 hover:text-blue-700"
            >
              → Voir les profils
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
