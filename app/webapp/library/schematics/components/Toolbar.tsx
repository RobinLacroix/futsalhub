'use client';

import { 
  MousePointer2, 
  Square, 
  Circle, 
  Minus, 
  ArrowRight, 
  Users, 
  CircleDot,
  Goal,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Play,
  Pause,
  Trash2,
  Save,
  Grid3x3,
  Copy
} from 'lucide-react';
import type { ToolType, FieldType } from '@/types/schematics';

interface ToolbarProps {
  selectedTool: ToolType;
  onToolSelect: (tool: ToolType) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  scale: number;
  currentSequence: number;
  totalSequences: number;
  onAddSequence: () => void;
  onSelectSequence: (index: number) => void;
  isPlaying: boolean;
  onPlayPause: () => void;
  onDeleteSequence: () => void;
  circuitName: string;
  onCircuitNameChange: (name: string) => void;
  circuits: { id: string; name: string }[];
  currentCircuitIndex: number;
  onSelectCircuit: (index: number) => void;
  onAddCircuit: () => void;
  onDuplicateCircuit: () => void;
  onDeleteCircuit: () => void;
  onOpenSaveLoad: () => void;
  fieldType: FieldType;
  onFieldTypeChange: (type: FieldType) => void;
}

export function Toolbar({
  selectedTool,
  onToolSelect,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  scale,
  currentSequence,
  totalSequences,
  onAddSequence,
  onSelectSequence,
  isPlaying,
  onPlayPause,
  onDeleteSequence,
  circuitName,
  onCircuitNameChange,
  circuits,
  currentCircuitIndex,
  onSelectCircuit,
  onAddCircuit,
  onDuplicateCircuit,
  onDeleteCircuit,
  onOpenSaveLoad,
  fieldType,
  onFieldTypeChange
}: ToolbarProps) {
  const tools: { type: ToolType; icon: React.ReactNode; label: string }[] = [
    { type: 'select', icon: <MousePointer2 className="h-5 w-5" />, label: 'Sélectionner' },
    { type: 'rectangle', icon: <Square className="h-5 w-5" />, label: 'Rectangle' },
    { type: 'circle', icon: <Circle className="h-5 w-5" />, label: 'Cercle' },
    { type: 'line', icon: <Minus className="h-5 w-5" />, label: 'Ligne' },
    { type: 'arrow', icon: <ArrowRight className="h-5 w-5" />, label: 'Flèche' },
    { type: 'player', icon: <Users className="h-5 w-5" />, label: 'Joueur' },
    { type: 'ball', icon: <CircleDot className="h-5 w-5" />, label: 'Ballon' },
    { type: 'goal', icon: <Goal className="h-5 w-5" />, label: 'But' },
  ];

  return (
    <div className="bg-white border-b border-gray-200 p-2 flex items-center gap-2 flex-wrap">
      {/* Sélecteur de type de terrain - sans texte */}
      <div className="flex items-center gap-1 border-r border-gray-300 pr-2">
        <button
          onClick={() => onFieldTypeChange('futsal')}
          className={`p-1.5 rounded-md transition-colors ${
            fieldType === 'futsal'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          title="Terrain Futsal (40x20m)"
        >
          <Grid3x3 className="h-4 w-4" />
        </button>
        <button
          onClick={() => onFieldTypeChange('blank')}
          className={`p-1.5 rounded-md transition-colors ${
            fieldType === 'blank'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          title="Terrain vierge (20x20m)"
        >
          <Square className="h-4 w-4" />
        </button>
      </div>

      {/* Outils */}
      <div className="flex items-center gap-1 border-r border-gray-300 pr-2">
        {tools.map(tool => (
          <button
            key={tool.type}
            onClick={() => onToolSelect(tool.type)}
            className={`p-1.5 rounded-md transition-colors ${
              selectedTool === tool.type
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            title={tool.label}
          >
            {tool.icon}
          </button>
        ))}
      </div>

      {/* Zoom */}
      <div className="flex items-center gap-1 border-r border-gray-300 pr-2">
        <button
          onClick={onZoomOut}
          className="p-1.5 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
          title="Dézoomer"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="text-xs text-gray-600 min-w-[50px] text-center">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={onZoomIn}
          className="p-1.5 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
          title="Zoomer"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
      </div>

      {/* Bouton Enregistrer/Charger */}
      <div className="flex items-center border-r border-gray-300 pr-2">
        <button
          onClick={onOpenSaveLoad}
          className="p-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700"
          title="Enregistrer / Charger un schéma"
        >
          <Save className="h-4 w-4" />
        </button>
      </div>

      {/* Gestion des séquences - AVANT les circuits */}
      <div className="flex items-center gap-1 border-r border-gray-300 pr-2">
        <button
          onClick={onPlayPause}
          className={`p-1.5 rounded-md transition-colors ${
            isPlaying
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-green-600 text-white hover:bg-green-700'
          }`}
          title={isPlaying ? 'Pause' : 'Lecture'}
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <span className="text-xs text-gray-600">Séquence</span>
        <div className="flex items-center gap-0.5">
          {Array.from({ length: totalSequences }, (_, i) => i).map(index => (
            <button
              key={index}
              onClick={() => onSelectSequence(index)}
              className={`px-1.5 py-0.5 rounded text-xs ${
                currentSequence === index
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {index}
            </button>
          ))}
          <button
            onClick={onAddSequence}
            className="px-1.5 py-0.5 rounded text-xs bg-green-500 text-white hover:bg-green-600"
            title="Ajouter une séquence"
          >
            +
          </button>
          <button
            onClick={onDeleteSequence}
            disabled={totalSequences <= 1 || currentSequence === 0}
            className={`px-1.5 py-0.5 rounded text-xs flex items-center justify-center ${
              totalSequences <= 1 || currentSequence === 0
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-red-500 text-white hover:bg-red-600'
            }`}
            title={currentSequence === 0 ? "Impossible de supprimer la séquence 0" : "Supprimer la séquence actuelle"}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Gestion des circuits - APRÈS les séquences */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-600">Circuit</span>
        <div className="flex items-center gap-0.5">
          {circuits.map((circuit, index) => (
            <button
              key={circuit.id}
              onClick={() => onSelectCircuit(index)}
              className={`px-1.5 py-0.5 rounded text-xs ${
                currentCircuitIndex === index
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              title={circuit.name}
            >
              {index + 1}
            </button>
          ))}
          <button
            onClick={onAddCircuit}
            className="px-1.5 py-0.5 rounded text-xs bg-purple-500 text-white hover:bg-purple-600"
            title="Ajouter un circuit"
          >
            +
          </button>
          <button
            onClick={onDuplicateCircuit}
            className="px-1.5 py-0.5 rounded text-xs bg-purple-500 text-white hover:bg-purple-600 flex items-center justify-center"
            title="Dupliquer le circuit"
          >
            <Copy className="h-3 w-3" />
          </button>
          <button
            onClick={onDeleteCircuit}
            disabled={circuits.length <= 1}
            className={`px-1.5 py-0.5 rounded text-xs flex items-center justify-center ${
              circuits.length <= 1
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-red-500 text-white hover:bg-red-600'
            }`}
            title="Supprimer le circuit courant"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
        <input
          type="text"
          value={circuitName}
          onChange={(e) => onCircuitNameChange(e.target.value)}
          className="px-1.5 py-0.5 text-xs border border-gray-300 rounded-md w-24 focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 placeholder:text-gray-400"
          placeholder="Nom"
        />
      </div>
    </div>
  );
}

