'use client';

import { useState, useEffect } from 'react';
import { X, Save, Trash2, Download } from 'lucide-react';
import { schematicsService, type SchematicRecord } from '@/lib/services/schematicsService';

interface SaveLoadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoad: (data: SchematicRecord['data']) => void;
  onSave: (name: string) => Promise<string | null>; // Retourne l'ID du schéma sauvegardé
  teamId: string;
  currentSchematicId?: string | null;
}

export function SaveLoadModal({
  isOpen,
  onClose,
  onLoad,
  onSave,
  teamId,
  currentSchematicId
}: SaveLoadModalProps) {
  const [schematics, setSchematics] = useState<SchematicRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadSchematics();
    }
  }, [isOpen]);

  const loadSchematics = async () => {
    setLoading(true);
    setError(null);
    try {
      // Récupérer tous les schémas (accessibles à toutes les équipes)
      const data = await schematicsService.getSchematicsByTeam();
      setSchematics(data);
    } catch (err: any) {
      setError(err.message || 'Erreur lors du chargement des schémas');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!saveName.trim()) {
      setError('Veuillez entrer un nom pour le schéma');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(saveName.trim());
      setSaveName('');
      await loadSchematics();
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const handleLoad = async (schematic: SchematicRecord) => {
    setError(null);
    try {
      onLoad(schematic.data);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erreur lors du chargement');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce schéma ?')) {
      return;
    }
    setError(null);
    try {
      await schematicsService.deleteSchematic(id);
      await loadSchematics();
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la suppression');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col text-gray-900">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Enregistrer / Charger un schéma</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 text-gray-900">
          {/* Section Sauvegarder */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold mb-2 text-gray-900">Enregistrer le schéma actuel</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                placeholder="Nom du schéma"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm text-gray-900 placeholder:text-gray-400"
              />
              <button
                onClick={handleSave}
                disabled={saving || !saveName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>

          {/* Section Charger */}
          <div>
            <h3 className="text-sm font-semibold mb-2 text-gray-900">Schémas enregistrés</h3>
            {error && (
              <div className="mb-3 p-2 bg-red-100 text-red-700 rounded text-sm">
                {error}
              </div>
            )}
            {loading ? (
              <div className="text-center py-8 text-gray-600">Chargement...</div>
            ) : schematics.length === 0 ? (
              <div className="text-center py-8 text-gray-600">Aucun schéma enregistré</div>
            ) : (
              <div className="space-y-2">
                {schematics.map((schematic) => (
                  <div
                    key={schematic.id}
                    className={`flex items-center justify-between p-3 border rounded-md ${
                      currentSchematicId === schematic.id ? 'bg-blue-50 border-blue-300' : 'bg-gray-50'
                    }`}
                  >
                    <div className="flex-1">
                      <div className="font-medium text-sm">{schematic.name}</div>
                      <div className="text-xs text-gray-500">
                        {new Date(schematic.updated_at).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleLoad(schematic)}
                        className="p-2 bg-green-600 text-white rounded hover:bg-green-700"
                        title="Charger"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(schematic.id)}
                        className="p-2 bg-red-600 text-white rounded hover:bg-red-700"
                        title="Supprimer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

