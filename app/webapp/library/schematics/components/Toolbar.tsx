'use client';

import { 
  MousePointer2, 
  Square, 
  Circle, 
  Triangle, 
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
  Save
} from 'lucide-react';
import type { ToolType } from '@/types/schematics';

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
  onDeleteCircuit: () => void;
  onOpenSaveLoad: () => void;
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
  onDeleteCircuit,
  onOpenSaveLoad
}: ToolbarProps) {
  const tools: { type: ToolType; icon: React.ReactNode; label: string }[] = [
    { type: 'select', icon: <MousePointer2 className="h-5 w-5" />, label: 'Sélectionner' },
    { type: 'rectangle', icon: <Square className="h-5 w-5" />, label: 'Rectangle' },
    { type: 'circle', icon: <Circle className="h-5 w-5" />, label: 'Cercle' },
    { type: 'triangle', icon: <Triangle className="h-5 w-5" />, label: 'Triangle' },
    { type: 'line', icon: <Minus className="h-5 w-5" />, label: 'Ligne' },
    { type: 'arrow', icon: <ArrowRight className="h-5 w-5" />, label: 'Flèche' },
    { type: 'player', icon: <Users className="h-5 w-5" />, label: 'Joueur' },
    { type: 'ball', icon: <CircleDot className="h-5 w-5" />, label: 'Ballon' },
    { type: 'goal', icon: <Goal className="h-5 w-5" />, label: 'But' },
  ];

  return (
    <div className="bg-white border-b border-gray-200 p-4 flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2 border-r border-gray-300 pr-4">
        {tools.map(tool => (
          <button
            key={tool.type}
            onClick={() => onToolSelect(tool.type)}
            className={`p-2 rounded-md transition-colors ${
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

      <div className="flex items-center gap-2 border-r border-gray-300 pr-4">
        <button
          onClick={onZoomOut}
          className="p-2 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
          title="Dézoomer"
        >
          <ZoomOut className="h-5 w-5" />
        </button>
        <span className="text-sm text-gray-600 min-w-[60px] text-center">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={onZoomIn}
          className="p-2 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
          title="Zoomer"
        >
          <ZoomIn className="h-5 w-5" />
        </button>
      </div>

      {/* Bouton Enregistrer/Charger */}
      <div className="flex items-center gap-2 border-r border-gray-300 pr-4">
        <button
          onClick={onOpenSaveLoad}
          className="p-2 rounded-md bg-blue-600 text-white hover:bg-blue-700"
          title="Enregistrer / Charger un schéma"
        >
          <Save className="h-5 w-5" />
        </button>
      </div>

      {/* Gestion des circuits */}
      <div className="flex items-center gap-2 border-r border-gray-300 pr-4">
        <span className="text-xs text-gray-600">Circuit</span>
        <div className="flex items-center gap-1">
          {circuits.map((circuit, index) => (
            <button
              key={circuit.id}
              onClick={() => onSelectCircuit(index)}
              className={`px-2 py-1 rounded-md text-xs ${
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
            className="px-2 py-1 rounded-md text-xs bg-purple-500 text-white hover:bg-purple-600"
            title="Ajouter un circuit"
          >
            +
          </button>
          <button
            onClick={onDeleteCircuit}
            disabled={circuits.length <= 1}
            className={`px-2 py-1 rounded-md text-xs flex items-center justify-center ${
              circuits.length <= 1
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-red-500 text-white hover:bg-red-600'
            }`}
            title="Supprimer le circuit courant"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        <input
          type="text"
          value={circuitName}
          onChange={(e) => onCircuitNameChange(e.target.value)}
          className="px-2 py-1 text-xs border border-gray-300 rounded-md w-32 focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 placeholder:text-gray-400"
          placeholder="Nom du circuit"
        />
      </div>

      {/* Gestion des séquences */}
      <div className="flex items-center gap-2">
        <button
          onClick={onPlayPause}
          className={`p-2 rounded-md transition-colors ${
            isPlaying
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-green-600 text-white hover:bg-green-700'
          }`}
          title={isPlaying ? 'Pause' : 'Lecture'}
        >
          {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </button>
        <span className="text-xs text-gray-600">Séquence</span>
        <div className="flex items-center gap-1">
          {Array.from({ length: totalSequences }, (_, i) => i).map(index => (
            <button
              key={index}
              onClick={() => onSelectSequence(index)}
              className={`px-2 py-1 rounded-md text-xs ${
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
            className="px-2 py-1 rounded-md text-xs bg-green-500 text-white hover:bg-green-600"
            title="Ajouter une séquence"
          >
            +
          </button>
          <button
            onClick={onDeleteSequence}
            disabled={totalSequences <= 1 || currentSequence === 0}
            className={`px-2 py-1 rounded-md text-xs flex items-center justify-center ${
              totalSequences <= 1 || currentSequence === 0
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-red-500 text-white hover:bg-red-600'
            }`}
            title={currentSequence === 0 ? "Impossible de supprimer la séquence 0" : "Supprimer la séquence actuelle"}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

