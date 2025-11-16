'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Search, Filter, X, Loader2, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

type TrainingTheme = 'Offensif' | 'Defensif' | 'Transition' | 'CPA';
type TrainingType = 'Echauffement' | 'Exercice' | 'Situation' | 'Jeu';

interface TrainingProcedure {
  id: string;
  title: string;
  objectives: string;
  instructions: string;
  variants?: string | null;
  corrections?: string | null;
  theme: TrainingTheme;
  type: TrainingType;
  min_players?: number | null;
  field_dimensions?: string | null;
  duration_minutes?: number | null;
  image_url?: string | null;
  created_at?: string;
}

interface NewProcedureForm {
  title: string;
  objectives: string;
  instructions: string;
  variants: string;
  corrections: string;
  theme: TrainingTheme;
  type: TrainingType;
  min_players: string;
  field_dimensions: string;
  duration_minutes: string;
  image_url: string;
}

const THEMES: TrainingTheme[] = ['Offensif', 'Defensif', 'Transition', 'CPA'];
const TYPES: TrainingType[] = ['Echauffement', 'Exercice', 'Situation', 'Jeu'];

export default function LibraryPage() {
  const [procedures, setProcedures] = useState<TrainingProcedure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedThemes, setSelectedThemes] = useState<TrainingTheme[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<TrainingType[]>([]);
  const [selectedProcedure, setSelectedProcedure] = useState<TrainingProcedure | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [formData, setFormData] = useState<NewProcedureForm>({
    title: '',
    objectives: '',
    instructions: '',
    variants: '',
    corrections: '',
    theme: 'Offensif',
    type: 'Exercice',
    min_players: '',
    field_dimensions: '',
    duration_minutes: '',
    image_url: '',
  });

  useEffect(() => {
    const fetchProcedures = async () => {
      try {
        setLoading(true);
        setError(null);
        const { data, error: fetchError } = await supabase
          .from('training_procedures')
          .select('*')
          .order('created_at', { ascending: false });

        if (fetchError) {
          throw fetchError;
        }

        setProcedures((data || []) as TrainingProcedure[]);
      } catch (err) {
        console.error('Erreur lors du chargement des procédés:', err);
        setError('Impossible de charger la bibliothèque pour le moment.');
      } finally {
        setLoading(false);
      }
    };

    fetchProcedures();
  }, []);

  const filteredProcedures = useMemo(() => {
    return procedures.filter((procedure) => {
      const matchesSearch =
        procedure.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        procedure.objectives.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesTheme =
        selectedThemes.length === 0 || selectedThemes.includes(procedure.theme);

      const matchesType =
        selectedTypes.length === 0 || selectedTypes.includes(procedure.type);

      return matchesSearch && matchesTheme && matchesType;
    });
  }, [procedures, searchTerm, selectedThemes, selectedTypes]);

  const toggleTheme = (theme: TrainingTheme) => {
    setSelectedThemes((prev) =>
      prev.includes(theme) ? prev.filter((item) => item !== theme) : [...prev, theme]
    );
  };

  const toggleType = (type: TrainingType) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((item) => item !== type) : [...prev, type]
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Bibliothèque de procédés d&apos;entraînement</h1>
        <p className="mt-2 text-gray-600 max-w-3xl">
          Explorez et filtrez les procédés enregistrés. Accédez rapidement aux informations essentielles
          et ouvrez chaque fiche pour consulter les consignes, variantes et points clés.
        </p>
      </header>

      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 mb-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="search"
              placeholder="Rechercher par titre ou objectifs..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4 gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Filter className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Filtres</span>
            </div>
            <button
              onClick={() => {
                setCreateError(null);
                setFormData({
                  title: '',
                  objectives: '',
                  instructions: '',
                  variants: '',
                  corrections: '',
                  theme: 'Offensif',
                  type: 'Exercice',
                  min_players: '',
                  field_dimensions: '',
                  duration_minutes: '',
                  image_url: '',
                });
                setIsCreateModalOpen(true);
              }}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium shadow-sm hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Ajouter un procédé
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
              Thèmes
            </h3>
            <div className="flex flex-wrap gap-2">
              {THEMES.map((theme) => {
                const isActive = selectedThemes.includes(theme);
                return (
                  <button
                    key={theme}
                    onClick={() => toggleTheme(theme)}
                    className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {theme}
                  </button>
                );
              })}
              {selectedThemes.length > 0 && (
                <button
                  onClick={() => setSelectedThemes([])}
                  className="px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 flex items-center gap-1"
                >
                  <X className="h-3 w-3" />
                  Réinitialiser
                </button>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
              Types
            </h3>
            <div className="flex flex-wrap gap-2">
              {TYPES.map((type) => {
                const isActive = selectedTypes.includes(type);
                return (
                  <button
                    key={type}
                    onClick={() => toggleType(type)}
                    className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {type}
                  </button>
                );
              })}
              {selectedTypes.length > 0 && (
                <button
                  onClick={() => setSelectedTypes([])}
                  className="px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 flex items-center gap-1"
                >
                  <X className="h-3 w-3" />
                  Réinitialiser
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-5 rounded-lg">
          {error}
        </div>
      ) : filteredProcedures.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-10 text-center text-gray-500">
          Aucun procédé ne correspond à votre recherche. Essayez d&apos;ajuster les filtres ou d&apos;ajouter un nouveau contenu.
        </div>
      ) : (
        <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filteredProcedures.map((procedure) => (
            <article
              key={procedure.id}
              onClick={() => setSelectedProcedure(procedure)}
              className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-pointer p-5 flex flex-col gap-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 line-clamp-2">{procedure.title}</h2>
                  <p className="mt-1 text-sm text-gray-500 line-clamp-3">{procedure.objectives}</p>
                </div>
                <div className="flex flex-col gap-2 items-end shrink-0">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                    {procedure.theme}
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                    {procedure.type}
                  </span>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-4 text-sm text-gray-600">
                <div>
                  <dt className="font-medium text-gray-500">Nb joueurs min.</dt>
                  <dd className="mt-1 text-gray-900">
                    {procedure.min_players ? `${procedure.min_players}` : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-gray-500">Durée (min)</dt>
                  <dd className="mt-1 text-gray-900">
                    {procedure.duration_minutes ? `${procedure.duration_minutes}` : '—'}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="font-medium text-gray-500">Dimension terrain</dt>
                  <dd className="mt-1 text-gray-900">
                    {procedure.field_dimensions || '—'}
                  </dd>
                </div>
              </dl>

              <div className="text-xs text-gray-400">
                Cliquer pour voir les consignes, variantes et correctifs
              </div>
            </article>
          ))}
        </section>
      )}

      {selectedProcedure && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-start gap-4 border-b px-6 py-4">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900">{selectedProcedure.title}</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                    {selectedProcedure.theme}
                  </span>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                    {selectedProcedure.type}
                  </span>
                  {selectedProcedure.duration_minutes && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                      {selectedProcedure.duration_minutes} min
                    </span>
                  )}
                  {selectedProcedure.min_players && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                      {selectedProcedure.min_players} joueurs minimum
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSelectedProcedure(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              {selectedProcedure.image_url && (
                <div className="relative w-full h-56 rounded-xl overflow-hidden border border-gray-200">
                  <Image
                    src={selectedProcedure.image_url}
                    alt={`Illustration pour ${selectedProcedure.title}`}
                    fill
                    className="object-cover"
                  />
                </div>
              )}

              <section>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                  Objectifs
                </h3>
                <p className="mt-2 text-gray-800 whitespace-pre-line">{selectedProcedure.objectives}</p>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                  Consignes / Règles
                </h3>
                <p className="mt-2 text-gray-800 whitespace-pre-line">{selectedProcedure.instructions}</p>
              </section>

              {selectedProcedure.variants && (
                <section>
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                    Variantes
                  </h3>
                  <p className="mt-2 text-gray-800 whitespace-pre-line">{selectedProcedure.variants}</p>
                </section>
              )}

              {selectedProcedure.corrections && (
                <section>
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                    Correctifs / Comportements attendus
                  </h3>
                  <p className="mt-2 text-gray-800 whitespace-pre-line">{selectedProcedure.corrections}</p>
                </section>
              )}

              {(selectedProcedure.field_dimensions || selectedProcedure.duration_minutes || selectedProcedure.min_players) && (
                <section className="grid gap-3 sm:grid-cols-2">
                  {selectedProcedure.field_dimensions && (
                    <div className="bg-gray-50 rounded-lg border border-gray-200 px-4 py-3">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Dimension du terrain
                      </div>
                      <div className="mt-1 text-gray-800">{selectedProcedure.field_dimensions}</div>
                    </div>
                  )}
                  {selectedProcedure.duration_minutes && (
                    <div className="bg-gray-50 rounded-lg border border-gray-200 px-4 py-3">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Durée indicative
                      </div>
                      <div className="mt-1 text-gray-800">{selectedProcedure.duration_minutes} minutes</div>
                    </div>
                  )}
                  {selectedProcedure.min_players && (
                    <div className="bg-gray-50 rounded-lg border border-gray-200 px-4 py-3">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Nombre de joueurs minimum
                      </div>
                      <div className="mt-1 text-gray-800">{selectedProcedure.min_players}</div>
                    </div>
                  )}
                </section>
              )}
            </div>

            <div className="border-t px-6 py-4 bg-gray-50 flex justify-end">
              <button
                onClick={() => setSelectedProcedure(null)}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-start gap-4 border-b px-6 py-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Ajouter un procédé</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Renseignez les informations principales puis validez pour l&apos;enregistrer dans la bibliothèque.
                </p>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              {createError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm">
                  {createError}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Titre *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(event) => setFormData((prev) => ({ ...prev, title: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    placeholder="Nom du procédé"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Objectifs *</label>
                  <textarea
                    value={formData.objectives}
                    onChange={(event) => setFormData((prev) => ({ ...prev, objectives: event.target.value }))}
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    placeholder="Décrire les objectifs principaux"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Consignes / Règles *</label>
                  <textarea
                    value={formData.instructions}
                    onChange={(event) => setFormData((prev) => ({ ...prev, instructions: event.target.value }))}
                    rows={4}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    placeholder="Décrire précisément le déroulement et les règles"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Thème *</label>
                  <select
                    value={formData.theme}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, theme: event.target.value as TrainingTheme }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                  >
                    {THEMES.map((theme) => (
                      <option key={theme} value={theme}>
                        {theme}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                  <select
                    value={formData.type}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, type: event.target.value as TrainingType }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                  >
                    {TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nb joueurs minimum</label>
                  <input
                    type="number"
                    min={0}
                    value={formData.min_players}
                    onChange={(event) => setFormData((prev) => ({ ...prev, min_players: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    placeholder="Ex: 8"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Durée (min)</label>
                  <input
                    type="number"
                    min={0}
                    value={formData.duration_minutes}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, duration_minutes: event.target.value }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    placeholder="Ex: 15"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dimension du terrain</label>
                  <input
                    type="text"
                    value={formData.field_dimensions}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, field_dimensions: event.target.value }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    placeholder="Ex: 20m x 15m"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Variantes</label>
                  <textarea
                    value={formData.variants}
                    onChange={(event) => setFormData((prev) => ({ ...prev, variants: event.target.value }))}
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    placeholder="Variantes possibles du procédé"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Correctifs / Comportements attendus
                  </label>
                  <textarea
                    value={formData.corrections}
                    onChange={(event) => setFormData((prev) => ({ ...prev, corrections: event.target.value }))}
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    placeholder="Points de coaching importants"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">URL image</label>
                  <input
                    type="text"
                    value={formData.image_url}
                    onChange={(event) => setFormData((prev) => ({ ...prev, image_url: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    placeholder="https://..."
                  />
                </div>
              </div>
            </div>

            <div className="border-t px-6 py-4 bg-gray-50 flex justify-end gap-3">
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
                disabled={isCreating}
              >
                Annuler
              </button>
              <button
                onClick={async () => {
                  if (!formData.title.trim() || !formData.objectives.trim() || !formData.instructions.trim()) {
                    setCreateError('Veuillez renseigner les champs obligatoires (titre, objectifs, consignes).');
                    return;
                  }

                  setIsCreating(true);
                  setCreateError(null);
                  try {
                    const { data, error: insertError } = await supabase
                      .from('training_procedures')
                      .insert([
                        {
                          title: formData.title.trim(),
                          objectives: formData.objectives.trim(),
                          instructions: formData.instructions.trim(),
                          variants: formData.variants.trim() || null,
                          corrections: formData.corrections.trim() || null,
                          theme: formData.theme,
                          type: formData.type,
                          min_players: formData.min_players ? Number(formData.min_players) : null,
                          field_dimensions: formData.field_dimensions.trim() || null,
                          duration_minutes: formData.duration_minutes ? Number(formData.duration_minutes) : null,
                          image_url: formData.image_url.trim() || null,
                        },
                      ])
                      .select()
                      .single();

                    if (insertError) {
                      throw insertError;
                    }

                    if (data) {
                      setProcedures((prev) => [data as TrainingProcedure, ...prev]);
                      setIsCreateModalOpen(false);
                    }
                  } catch (err) {
                    console.error('Erreur lors de la création du procédé:', err);
                    setCreateError('Impossible d\'enregistrer le procédé. Réessayez plus tard.');
                  } finally {
                    setIsCreating(false);
                  }
                }}
                disabled={isCreating}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isCreating && <Loader2 className="h-4 w-4 animate-spin" />}
                {isCreating ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

