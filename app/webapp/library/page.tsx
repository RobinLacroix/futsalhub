'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Search, Filter, X, Loader2, Plus, Layout, ExternalLink, Edit, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useActiveTeam } from '../hooks/useActiveTeam';
import { schematicsService, type SchematicRecord, type SchematicData } from '@/lib/services/schematicsService';
import { trainingsService } from '@/lib/services/trainingsService';
import { SchematicPreview } from './components/SchematicPreview';

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
  schematic_id?: string | null;
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
  schematic_id: string;
}

const THEMES: TrainingTheme[] = ['Offensif', 'Defensif', 'Transition', 'CPA'];
const TYPES: TrainingType[] = ['Echauffement', 'Exercice', 'Situation', 'Jeu'];

export default function LibraryPage() {
  const router = useRouter();
  const { activeTeam } = useActiveTeam();
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
  const [availableSchematics, setAvailableSchematics] = useState<SchematicRecord[]>([]);
  const [isSchematicModalOpen, setIsSchematicModalOpen] = useState(false);
  const [selectedSchematic, setSelectedSchematic] = useState<SchematicRecord | null>(null);
  const [editingProcedure, setEditingProcedure] = useState<TrainingProcedure | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [previewSchematicData, setPreviewSchematicData] = useState<SchematicData | null>(null);
  const [procedureUsageCount, setProcedureUsageCount] = useState<number | null>(null);

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
    schematic_id: '',
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

  // Charger les schémas disponibles quand le modal s'ouvre
  useEffect(() => {
    const loadSchematics = async () => {
      if (isCreateModalOpen || isSchematicModalOpen) {
        try {
          console.log('Chargement de tous les schémas disponibles');
          // Récupérer tous les schémas (accessibles à toutes les équipes)
          const schematics = await schematicsService.getSchematicsByTeam();
          console.log('Schémas chargés:', schematics);
          setAvailableSchematics(schematics);
        } catch (err) {
          console.error('Erreur lors du chargement des schémas:', err);
        }
      } else if (!isCreateModalOpen && !isSchematicModalOpen) {
        // Réinitialiser la liste si les modals sont fermés
        setAvailableSchematics([]);
      }
    };
    loadSchematics();
  }, [isCreateModalOpen, isSchematicModalOpen]);

  // Charger le schéma pour la prévisualisation quand un procédé est sélectionné
  useEffect(() => {
    if (selectedProcedure?.schematic_id && activeTeam?.id) {
      schematicsService.getSchematicById(selectedProcedure.schematic_id)
        .then((schematic) => {
          if (schematic) {
            setPreviewSchematicData(schematic.data);
          } else {
            setPreviewSchematicData(null);
          }
        })
        .catch((err) => {
          console.error('Erreur lors du chargement du schéma pour la prévisualisation:', err);
          setPreviewSchematicData(null);
        });
    } else {
      setPreviewSchematicData(null);
    }
  }, [selectedProcedure?.schematic_id, activeTeam?.id]);

  // Charger le nombre d'utilisations du procédé quand il est sélectionné
  useEffect(() => {
    if (selectedProcedure?.id) {
      trainingsService.getProcedureUsageCount(selectedProcedure.id)
        .then((count) => {
          setProcedureUsageCount(count);
        })
        .catch((err) => {
          console.error('Erreur lors du chargement du nombre d\'utilisations:', err);
          setProcedureUsageCount(0);
        });
    } else {
      setProcedureUsageCount(null);
    }
  }, [selectedProcedure?.id]);

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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-600" />
            <input
              type="search"
              placeholder="Rechercher par titre ou objectifs..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full pl-10 pr-4 py-2 border-2 border-gray-400 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900"
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4 gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Filter className="h-4 w-4 text-gray-600" />
              <span className="text-sm font-medium text-gray-800">Filtres</span>
            </div>
            <button
              onClick={() => {
                setCreateError(null);
                setEditingProcedure(null);
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
                  schematic_id: '',
                });
                setSelectedSchematic(null);
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
            <h3 className="text-sm font-semibold text-gray-800 mb-3 uppercase tracking-wide">
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
                        : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
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
            <h3 className="text-sm font-semibold text-gray-800 mb-3 uppercase tracking-wide">
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
                        : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
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
        <div className="bg-white border border-dashed border-gray-400 rounded-xl p-10 text-center text-gray-600">
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
                  <p className="mt-1 text-sm text-gray-600 line-clamp-3">{procedure.objectives}</p>
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
                  <dt className="font-medium text-gray-600">Nb joueurs min.</dt>
                  <dd className="mt-1 text-gray-900">
                    {procedure.min_players ? `${procedure.min_players}` : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-gray-600">Durée (min)</dt>
                  <dd className="mt-1 text-gray-900">
                    {procedure.duration_minutes ? `${procedure.duration_minutes}` : '—'}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="font-medium text-gray-600">Dimension terrain</dt>
                  <dd className="mt-1 text-gray-900">
                    {procedure.field_dimensions || '—'}
                  </dd>
                </div>
              </dl>

              <div className="text-xs text-gray-600">
                Cliquer pour voir les consignes, variantes et correctifs
              </div>
            </article>
          ))}
        </section>
      )}

      {selectedProcedure && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-start gap-4 border-b px-6 py-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">{selectedProcedure.title}</h2>
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
                  {procedureUsageCount !== null && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                      Utilisé {procedureUsageCount} {procedureUsageCount === 1 ? 'fois' : 'fois'}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSelectedProcedure(null)}
                className="text-gray-600 hover:text-gray-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Colonne gauche : Texte */}
                <div className="space-y-4">
                  {selectedProcedure.image_url && (
                    <div className="relative w-full h-40 rounded-xl overflow-hidden border border-gray-200">
                      <Image
                        src={selectedProcedure.image_url}
                        alt={`Illustration pour ${selectedProcedure.title}`}
                        fill
                        className="object-cover"
                      />
                    </div>
                  )}

                  <section>
                    <h3 className="text-xs font-semibold text-gray-800 uppercase tracking-wide">
                      Objectifs
                    </h3>
                    <p className="mt-1 text-sm text-gray-800 whitespace-pre-line">{selectedProcedure.objectives}</p>
                  </section>

                  <section>
                    <h3 className="text-xs font-semibold text-gray-800 uppercase tracking-wide">
                      Consignes / Règles
                    </h3>
                    <p className="mt-1 text-sm text-gray-800 whitespace-pre-line">{selectedProcedure.instructions}</p>
                  </section>

                  {selectedProcedure.variants && (
                    <section>
                      <h3 className="text-xs font-semibold text-gray-800 uppercase tracking-wide">
                        Variantes
                      </h3>
                      <p className="mt-1 text-sm text-gray-800 whitespace-pre-line">{selectedProcedure.variants}</p>
                    </section>
                  )}

                  {selectedProcedure.corrections && (
                    <section>
                      <h3 className="text-xs font-semibold text-gray-800 uppercase tracking-wide">
                        Correctifs / Comportements attendus
                      </h3>
                      <p className="mt-1 text-sm text-gray-800 whitespace-pre-line">{selectedProcedure.corrections}</p>
                    </section>
                  )}

                  {(selectedProcedure.field_dimensions || selectedProcedure.duration_minutes || selectedProcedure.min_players) && (
                    <section className="grid gap-3 sm:grid-cols-3">
                      {selectedProcedure.field_dimensions && (
                        <div className="bg-gray-50 rounded-lg border border-gray-200 px-3 py-2">
                          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                            Dimension du terrain
                          </div>
                          <div className="mt-1 text-sm text-gray-800">{selectedProcedure.field_dimensions}</div>
                        </div>
                      )}
                      {selectedProcedure.duration_minutes && (
                        <div className="bg-gray-50 rounded-lg border border-gray-200 px-3 py-2">
                          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                            Durée indicative
                          </div>
                          <div className="mt-1 text-sm text-gray-800">{selectedProcedure.duration_minutes} minutes</div>
                        </div>
                      )}
                      {selectedProcedure.min_players && (
                        <div className="bg-gray-50 rounded-lg border border-gray-200 px-3 py-2">
                          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                            Nombre de joueurs minimum
                          </div>
                          <div className="mt-1 text-sm text-gray-800">{selectedProcedure.min_players}</div>
                        </div>
                      )}
                    </section>
                  )}
                </div>

                {/* Colonne droite : Schéma */}
                <div className="space-y-4">
                  {selectedProcedure.schematic_id && previewSchematicData && (
                    <section>
                      <h3 className="text-xs font-semibold text-gray-800 uppercase tracking-wide mb-2">
                        Schéma tactique
                      </h3>
                      <SchematicPreview data={previewSchematicData} />
                      <button
                        onClick={() => router.push(`/webapp/library/schematics?schematic=${selectedProcedure.schematic_id}`)}
                        className="mt-2 w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                      >
                        <Layout className="h-3 w-3" />
                        Ouvrir dans l'éditeur
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    </section>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t px-6 py-4 bg-gray-50 flex justify-between items-center">
              <button
                onClick={async () => {
                  if (!confirm('Êtes-vous sûr de vouloir supprimer ce procédé ? Cette action est irréversible.')) {
                    return;
                  }
                  setIsDeleting(true);
                  try {
                    const { error: deleteError } = await supabase
                      .from('training_procedures')
                      .delete()
                      .eq('id', selectedProcedure.id);

                    if (deleteError) {
                      throw deleteError;
                    }

                    setProcedures((prev) => prev.filter((p) => p.id !== selectedProcedure.id));
                    setSelectedProcedure(null);
                  } catch (err) {
                    console.error('Erreur lors de la suppression:', err);
                    alert('Impossible de supprimer le procédé. Réessayez plus tard.');
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                disabled={isDeleting}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Trash2 className="h-4 w-4" />
                {isDeleting ? 'Suppression...' : 'Supprimer'}
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    // Charger les données du procédé dans le formulaire
                    setFormData({
                      title: selectedProcedure.title,
                      objectives: selectedProcedure.objectives,
                      instructions: selectedProcedure.instructions,
                      variants: selectedProcedure.variants || '',
                      corrections: selectedProcedure.corrections || '',
                      theme: selectedProcedure.theme,
                      type: selectedProcedure.type,
                      min_players: selectedProcedure.min_players?.toString() || '',
                      field_dimensions: selectedProcedure.field_dimensions || '',
                      duration_minutes: selectedProcedure.duration_minutes?.toString() || '',
                      image_url: selectedProcedure.image_url || '',
                      schematic_id: selectedProcedure.schematic_id || '',
                    });
                    // Charger le schéma associé si présent
                    if (selectedProcedure.schematic_id && activeTeam?.id) {
                      schematicsService.getSchematicById(selectedProcedure.schematic_id)
                        .then((schematic) => {
                          if (schematic) {
                            setSelectedSchematic(schematic);
                          }
                        })
                        .catch(console.error);
                    }
                    setEditingProcedure(selectedProcedure);
                    setSelectedProcedure(null);
                    setIsCreateModalOpen(true);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-800 bg-white border-2 border-gray-400 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Edit className="h-4 w-4" />
                  Modifier
                </button>
                <button
                  onClick={() => setSelectedProcedure(null)}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-start gap-4 border-b px-6 py-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  {editingProcedure ? 'Modifier le procédé' : 'Ajouter un procédé'}
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  {editingProcedure
                    ? 'Modifiez les informations puis validez pour enregistrer les changements.'
                    : 'Renseignez les informations principales puis validez pour l\'enregistrer dans la bibliothèque.'}
                </p>
              </div>
              <button
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setEditingProcedure(null);
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
                    schematic_id: '',
                  });
                  setSelectedSchematic(null);
                }}
                className="text-gray-600 hover:text-gray-600 transition-colors"
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
                  <label className="block text-sm font-medium text-gray-800 mb-1">Titre *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(event) => setFormData((prev) => ({ ...prev, title: event.target.value }))}
                    className="w-full rounded-lg border-2 border-gray-400 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                    placeholder="Nom du procédé"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-800 mb-1">Objectifs *</label>
                  <textarea
                    value={formData.objectives}
                    onChange={(event) => setFormData((prev) => ({ ...prev, objectives: event.target.value }))}
                    rows={3}
                    className="w-full rounded-lg border-2 border-gray-400 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                    placeholder="Décrire les objectifs principaux"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-800 mb-1">Consignes / Règles *</label>
                  <textarea
                    value={formData.instructions}
                    onChange={(event) => setFormData((prev) => ({ ...prev, instructions: event.target.value }))}
                    rows={4}
                    className="w-full rounded-lg border-2 border-gray-400 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                    placeholder="Décrire précisément le déroulement et les règles"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-800 mb-1">Thème *</label>
                  <select
                    value={formData.theme}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, theme: event.target.value as TrainingTheme }))
                    }
                    className="w-full rounded-lg border-2 border-gray-400 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                  >
                    {THEMES.map((theme) => (
                      <option key={theme} value={theme}>
                        {theme}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-800 mb-1">Type *</label>
                  <select
                    value={formData.type}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, type: event.target.value as TrainingType }))
                    }
                    className="w-full rounded-lg border-2 border-gray-400 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                  >
                    {TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-800 mb-1">Nb joueurs minimum</label>
                  <input
                    type="number"
                    min={0}
                    value={formData.min_players}
                    onChange={(event) => setFormData((prev) => ({ ...prev, min_players: event.target.value }))}
                    className="w-full rounded-lg border-2 border-gray-400 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                    placeholder="Ex: 8"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-800 mb-1">Durée (min)</label>
                  <input
                    type="number"
                    min={0}
                    value={formData.duration_minutes}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, duration_minutes: event.target.value }))
                    }
                    className="w-full rounded-lg border-2 border-gray-400 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                    placeholder="Ex: 15"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-800 mb-1">Dimension du terrain</label>
                  <input
                    type="text"
                    value={formData.field_dimensions}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, field_dimensions: event.target.value }))
                    }
                    className="w-full rounded-lg border-2 border-gray-400 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                    placeholder="Ex: 20m x 15m"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-800 mb-1">Variantes</label>
                  <textarea
                    value={formData.variants}
                    onChange={(event) => setFormData((prev) => ({ ...prev, variants: event.target.value }))}
                    rows={3}
                    className="w-full rounded-lg border-2 border-gray-400 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                    placeholder="Variantes possibles du procédé"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-800 mb-1">
                    Correctifs / Comportements attendus
                  </label>
                  <textarea
                    value={formData.corrections}
                    onChange={(event) => setFormData((prev) => ({ ...prev, corrections: event.target.value }))}
                    rows={3}
                    className="w-full rounded-lg border-2 border-gray-400 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                    placeholder="Points de coaching importants"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-800 mb-1">URL image</label>
                  <input
                    type="text"
                    value={formData.image_url}
                    onChange={(event) => setFormData((prev) => ({ ...prev, image_url: event.target.value }))}
                    className="w-full rounded-lg border-2 border-gray-400 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                    placeholder="https://..."
                  />
                </div>

                <div className="sm:col-span-2 border-t pt-4">
                  <label className="block text-sm font-medium text-gray-800 mb-2">Schéma tactique</label>
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          // Ouvrir l'éditeur de schémas dans un nouvel onglet
                          const newWindow = window.open('/webapp/library/schematics', '_blank');
                          if (newWindow) {
                            // Attendre que l'utilisateur crée/sauvegarde un schéma
                            // On pourrait utiliser un message postMessage pour communiquer
                          }
                        }}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                      >
                        <Layout className="h-4 w-4" />
                        Créer un nouveau schéma
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (activeTeam?.id) {
                            try {
                              // Recharger les schémas avant d'ouvrir le modal
                              // Récupérer tous les schémas (accessibles à toutes les équipes)
                              const schematics = await schematicsService.getSchematicsByTeam();
                              setAvailableSchematics(schematics);
                              setIsSchematicModalOpen(true);
                            } catch (err) {
                              console.error('Erreur lors du chargement des schémas:', err);
                              setIsSchematicModalOpen(true); // Ouvrir quand même le modal
                            }
                          } else {
                            setIsSchematicModalOpen(true);
                          }
                        }}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-800 bg-white border-2 border-gray-400 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Charger un schéma existant
                      </button>
                    </div>
                    {selectedSchematic && (
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="flex items-center gap-2">
                          <Layout className="h-4 w-4 text-gray-600" />
                          <span className="text-sm text-gray-800">{selectedSchematic.name}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSchematic(null);
                            setFormData((prev) => ({ ...prev, schematic_id: '' }));
                          }}
                          className="text-gray-600 hover:text-gray-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t px-6 py-4 bg-gray-50 flex justify-end gap-3">
              <button
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setEditingProcedure(null);
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
                    schematic_id: '',
                  });
                  setSelectedSchematic(null);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-800 bg-white border-2 border-gray-400 rounded-lg hover:bg-gray-100 transition-colors"
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
                    // Préparer les données à insérer
                    const insertData: any = {
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
                    };

                    // Ajouter schematic_id seulement s'il n'est pas vide
                    if (formData.schematic_id && formData.schematic_id.trim()) {
                      insertData.schematic_id = formData.schematic_id.trim();
                    }

                    console.log('Données à insérer/modifier:', insertData);

                    let data: TrainingProcedure | null = null;
                    let error: any = null;

                    if (editingProcedure) {
                      // Mise à jour
                      const { data: updateData, error: updateError } = await supabase
                        .from('training_procedures')
                        .update(insertData)
                        .eq('id', editingProcedure.id)
                        .select()
                        .single();

                      data = updateData as TrainingProcedure | null;
                      error = updateError;
                    } else {
                      // Création
                      const { data: insertDataResult, error: insertError } = await supabase
                        .from('training_procedures')
                        .insert([insertData])
                        .select()
                        .single();

                      data = insertDataResult as TrainingProcedure | null;
                      error = insertError;
                    }

                    if (error) {
                      console.error('Erreur Supabase complète:', JSON.stringify(error, null, 2));
                      console.error('Code:', error.code);
                      console.error('Message:', error.message);
                      console.error('Details:', error.details);
                      console.error('Hint:', error.hint);
                      throw error;
                    }

                    if (data) {
                      if (editingProcedure) {
                        // Mise à jour de la liste
                        setProcedures((prev) =>
                          prev.map((p) => (p.id === editingProcedure.id ? data! : p))
                        );
                      } else {
                        // Ajout à la liste
                        setProcedures((prev) => [data, ...prev]);
                      }
                      setIsCreateModalOpen(false);
                      setEditingProcedure(null);
                      // Réinitialiser le formulaire
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
                        schematic_id: '',
                      });
                      setSelectedSchematic(null);
                    }
                  } catch (err: any) {
                    console.error('Erreur lors de la création du procédé:', err);
                    console.error('Type d\'erreur:', typeof err);
                    console.error('Erreur stringifiée:', JSON.stringify(err, null, 2));
                    
                    let errorMessage = 'Erreur inconnue';
                    if (err?.message) {
                      errorMessage = err.message;
                    } else if (err?.details) {
                      errorMessage = err.details;
                    } else if (err?.code) {
                      errorMessage = `Code d'erreur: ${err.code}`;
                    } else if (typeof err === 'string') {
                      errorMessage = err;
                    } else {
                      errorMessage = JSON.stringify(err);
                    }
                    
                    setCreateError(`Impossible d'enregistrer le procédé: ${errorMessage}`);
                  } finally {
                    setIsCreating(false);
                  }
                }}
                disabled={isCreating}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isCreating && <Loader2 className="h-4 w-4 animate-spin" />}
                {isCreating
                  ? editingProcedure
                    ? 'Modification...'
                    : 'Enregistrement...'
                  : editingProcedure
                  ? 'Enregistrer les modifications'
                  : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de sélection de schéma */}
      {isSchematicModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-start gap-4 border-b px-6 py-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Sélectionner un schéma</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Choisissez un schéma tactique existant à associer à cette procédure.
                </p>
              </div>
              <button
                onClick={() => setIsSchematicModalOpen(false)}
                className="text-gray-600 hover:text-gray-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {!activeTeam?.id ? (
                <div className="text-center py-10 text-gray-600">
                  <p>Veuillez sélectionner une équipe pour charger les schémas.</p>
                </div>
              ) : availableSchematics.length === 0 ? (
                <div className="text-center py-10 text-gray-600">
                  <Layout className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>Aucun schéma disponible.</p>
                  <p className="text-sm mt-2">Créez d'abord un schéma dans l'éditeur de schémas tactiques.</p>
                  <p className="text-xs mt-2 text-gray-600">Équipe: {activeTeam.name}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {availableSchematics.map((schematic) => (
                    <button
                      key={schematic.id}
                      onClick={() => {
                        setSelectedSchematic(schematic);
                        setFormData((prev) => ({ ...prev, schematic_id: schematic.id }));
                        setIsSchematicModalOpen(false);
                      }}
                      className={`w-full text-left p-4 rounded-lg border transition-colors ${
                        selectedSchematic?.id === schematic.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Layout className="h-5 w-5 text-gray-600" />
                          <div>
                            <div className="font-medium text-gray-900">{schematic.name}</div>
                            <div className="text-sm text-gray-600">
                              {schematic.data.circuits.length} circuit{schematic.data.circuits.length > 1 ? 's' : ''}
                            </div>
                          </div>
                        </div>
                        {selectedSchematic?.id === schematic.id && (
                          <div className="text-blue-600 font-medium">Sélectionné</div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t px-6 py-4 bg-gray-50 flex justify-end">
              <button
                onClick={() => setIsSchematicModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-800 bg-white border-2 border-gray-400 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

