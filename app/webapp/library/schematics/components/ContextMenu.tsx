'use client';

import { X, Copy, Trash2, ArrowRight, Minus, RotateCw } from 'lucide-react';
import type { ContextMenuState } from '@/types/schematics';

interface ContextMenuProps {
  menu: ContextMenuState;
  onClose: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onDrawLine: () => void;
  onDrawArrow: () => void;
  onRotate90?: () => void;
  canRotate?: boolean;
}

export function ContextMenu({ 
  menu, 
  onClose, 
  onCopy, 
  onDelete, 
  onDrawLine, 
  onDrawArrow,
  onRotate90,
  canRotate = false
}: ContextMenuProps) {
  if (!menu.visible) return null;

  return (
    <div
      className="fixed bg-white border border-gray-300 rounded-lg shadow-lg z-50 py-2 min-w-[180px]"
      style={{ left: menu.x, top: menu.y }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-4 py-2 border-b border-gray-200 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">Actions</span>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      
      <div className="py-1">
        <button
          onClick={() => {
            onCopy();
            onClose();
          }}
          className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
        >
          <Copy className="h-4 w-4" />
          Copier
        </button>
        
        <button
          onClick={() => {
            onDrawLine();
            onClose();
          }}
          className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
        >
          <Minus className="h-4 w-4" />
          Tracer une ligne
        </button>
        
        <button
          onClick={() => {
            onDrawArrow();
            onClose();
          }}
          className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
        >
          <ArrowRight className="h-4 w-4" />
          Tracer une flèche
        </button>
        
        {canRotate && onRotate90 && (
          <button
            onClick={() => {
              onRotate90();
              onClose();
            }}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
          >
            <RotateCw className="h-4 w-4" />
            Rotation 90°
          </button>
        )}
        
        <div className="border-t border-gray-200 my-1" />
        
        <button
          onClick={() => {
            onDelete();
            onClose();
          }}
          className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
        >
          <Trash2 className="h-4 w-4" />
          Supprimer
        </button>
      </div>
    </div>
  );
}

