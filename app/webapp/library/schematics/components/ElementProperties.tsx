'use client';

import { X } from 'lucide-react';
import type { SchematicElement, StrokeStyle } from '@/types/schematics';

interface ElementPropertiesProps {
  element: SchematicElement | null;
  onClose: () => void;
  onUpdate: (elementId: string, updates: Partial<SchematicElement>) => void;
}

export function ElementProperties({ element, onClose, onUpdate }: ElementPropertiesProps) {
  if (!element) return null;

  const isPlayer = element.type === 'player';
  const isZone = element.type === 'rectangle' || element.type === 'circle' || element.type === 'triangle';
  const isLine = element.type === 'line' || element.type === 'arrow';

  return (
    <div className="px-4 py-2 overflow-x-auto w-full min-w-0 max-w-full">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-900">Propriétés</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-wrap gap-3 items-start">
        {/* Numéro/Lettre pour joueur */}
        {isPlayer && (
          <div className="min-w-[120px]">
            <label className="block text-xs font-medium text-gray-700 mb-0.5">
              Text
            </label>
            <input
              type="text"
              value={element.number}
              onChange={(e) => onUpdate(element.id, { number: e.target.value })}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              maxLength={2}
            />
          </div>
        )}

        {/* Couleur (pour les lignes et zones) */}
        {!isPlayer && (
          <div className="min-w-[120px]">
            <label className="block text-xs font-medium text-gray-700 mb-0.5">
              Couleur
            </label>
            <input
              type="color"
              value={element.color}
              onChange={(e) => onUpdate(element.id, { color: e.target.value })}
              className="w-full h-8 border border-gray-300 rounded-md cursor-pointer"
            />
          </div>
        )}

        {/* Couleurs pour les joueurs */}
        {isPlayer && (
          <>
            <div className="flex-shrink-0 flex-grow-0" style={{ minWidth: '70px' }}>
              <label className="block text-xs font-medium text-gray-700 mb-0.5">
                Color
              </label>
              <input
                type="color"
                value={element.fillColor || element.color}
                onChange={(e) => onUpdate(element.id, { fillColor: e.target.value })}
                className="w-full h-8 border border-gray-300 rounded-md cursor-pointer"
              />
            </div>
            <div className="flex-shrink-0 flex-grow-0" style={{minWidth: '70px'}}>
              <label className="block text-xs font-medium text-gray-700 mb-0.5">
                Text Color
              </label>
              <input
                type="color"
                value={(element as any).textColor || '#ffffff'}
                onChange={(e) => onUpdate(element.id, { textColor: e.target.value })}
                className="w-full h-8 border border-gray-300 rounded-md cursor-pointer"
              />
            </div>
          </>
        )}

        {/* Remplissage (pour zones) */}
        {isZone && (
          <>
            <div className="min-w-[120px]">
              <label className="block text-xs font-medium text-gray-700 mb-0.5">
                Fill Color
              </label>
              <input
                type="color"
                value={element.fillColor || '#000000'}
                onChange={(e) => onUpdate(element.id, { fillColor: e.target.value })}
                className="w-full h-8 border border-gray-300 rounded-md cursor-pointer"
              />
            </div>
            <div className="min-w-[150px]">
              <label className="block text-xs font-medium text-gray-700 mb-0.5">
                Fill Opacity
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={(element.fillOpacity || 0) * 100}
                onChange={(e) => onUpdate(element.id, { fillOpacity: parseInt(e.target.value) / 100 })}
                className="w-full"
              />
              <span className="text-sm text-gray-500">{Math.round((element.fillOpacity || 0) * 100)}%</span>
            </div>
          </>
        )}

        {/* Style de trait */}
        {(isZone || isLine) && (
          <div className="min-w-[120px]">
            <label className="block text-xs font-medium text-gray-700 mb-0.5">
              Stroke Style
            </label>
            <select
              value={element.strokeStyle}
              onChange={(e) => onUpdate(element.id, { strokeStyle: e.target.value as StrokeStyle })}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="solid">Continu</option>
              <option value="dashed">Pointillés</option>
              <option value="dotted">Pointillés fins</option>
            </select>
          </div>
        )}

        {/* Épaisseur du trait */}
        {(isZone || isLine) && (
          <div className="min-w-[150px]">
            <label className="block text-xs font-medium text-gray-700 mb-0.5">
              Stroke Width
            </label>
            <input
              type="range"
              min="1"
              max="10"
              value={element.strokeWidth}
              onChange={(e) => onUpdate(element.id, { strokeWidth: parseInt(e.target.value) })}
              className="w-full"
            />
            <span className="text-sm text-gray-500">{element.strokeWidth}px</span>
          </div>
        )}

        {/* Taille (pour joueur - choix entre normal et grand) */}
        {isPlayer && (
          <div className="min-w-[200px]">
            <label className="block text-xs font-medium text-gray-700 mb-0.5">
              Size
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => onUpdate(element.id, { size: 0.6 })}
                className={`flex-1 px-2 py-1 rounded-md transition-colors text-xs ${
                  element.size === 0.6
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Normal
              </button>
              <button
                onClick={() => onUpdate(element.id, { size: 0.8 })}
                className={`flex-1 px-2 py-1 rounded-md transition-colors text-xs ${
                  element.size === 0.8
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Large
              </button>
            </div>
          </div>
        )}

        {/* Taille (pour ballon, matériel) */}
        {(element.type === 'ball' || element.type === 'goal' || element.type === 'cone' || element.type === 'ladder') && (
          <div className="min-w-[150px]">
            <label className="block text-xs font-medium text-gray-700 mb-0.5">
              Taille (mètres)
            </label>
            <input
              type="range"
              min={element.type === 'ball' ? "0.1" : element.type === 'goal' ? "0.5" : "0.5"}
              max={element.type === 'ball' ? "0.8" : element.type === 'goal' ? "3" : "5"}
              step="0.1"
              value={element.size}
              onChange={(e) => onUpdate(element.id, { size: parseFloat(e.target.value) })}
              className="w-full"
            />
            <span className="text-sm text-gray-500">{element.size.toFixed(1)}m</span>
          </div>
        )}

        {/* Rotation (pour les buts et autres éléments rotables) */}
        {(element.type === 'goal' || element.type === 'cone' || element.type === 'ladder') && (
          <div className="min-w-[200px]">
            <label className="block text-xs font-medium text-gray-700 mb-0.5">
              Rotation
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const currentRotation = element.rotation || 0;
                  onUpdate(element.id, { rotation: (currentRotation + 90) % 360 });
                }}
                className="flex-1 px-2 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-xs"
              >
                +90°
              </button>
              <button
                onClick={() => {
                  const currentRotation = element.rotation || 0;
                  onUpdate(element.id, { rotation: (currentRotation - 90 + 360) % 360 });
                }}
                className="flex-1 px-2 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-xs"
              >
                -90°
              </button>
            </div>
            {element.rotation !== undefined && element.rotation !== 0 && (
              <p className="text-xs text-gray-500 mt-0.5">
                {element.rotation}°
              </p>
            )}
          </div>
        )}

        {/* Dimensions (pour les zones) */}
        {isZone && (
          <>
            <div className="min-w-[120px]">
              <label className="block text-xs font-medium text-gray-700 mb-0.5">
                Largeur (mètres)
              </label>
              <input
                type="number"
                min="0.1"
                max="40"
                step="0.1"
                value={element.width}
                onChange={(e) => {
                  const newWidth = parseFloat(e.target.value) || 0;
                  onUpdate(element.id, { width: newWidth });
                }}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="min-w-[120px]">
              <label className="block text-xs font-medium text-gray-700 mb-0.5">
                Hauteur (mètres)
              </label>
              <input
                type="number"
                min="0.1"
                max="20"
                step="0.1"
                value={element.height}
                onChange={(e) => {
                  const newHeight = parseFloat(e.target.value) || 0;
                  onUpdate(element.id, { height: newHeight });
                }}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {/* Rotation (pour les zones) */}
            <div className="min-w-[200px]">
              <label className="block text-xs font-medium text-gray-700 mb-0.5">
                Rotation
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const currentRotation = element.rotation || 0;
                    onUpdate(element.id, { rotation: (currentRotation + 90) % 360 });
                  }}
                  className="flex-1 px-2 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-xs"
                >
                  +90°
                </button>
                <button
                  onClick={() => {
                    const currentRotation = element.rotation || 0;
                    onUpdate(element.id, { rotation: (currentRotation - 90 + 360) % 360 });
                  }}
                  className="flex-1 px-2 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-xs"
                >
                  -90°
                </button>
              </div>
              {element.rotation !== undefined && element.rotation !== 0 && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {element.rotation}°
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

