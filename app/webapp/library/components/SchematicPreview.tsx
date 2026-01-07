'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Field } from '../../library/schematics/components/Field';
import { SchematicElements } from '../../library/schematics/components/SchematicElements';
import { SequenceTrajectories } from '../../library/schematics/components/SequenceTrajectories';
import type { SchematicElement, FieldType, LineElement } from '@/types/schematics';
import type { SchematicData } from '@/lib/services/schematicsService';
import { Play, Pause, ChevronLeft, ChevronRight } from 'lucide-react';

interface SchematicPreviewProps {
  data: SchematicData;
  fieldType?: FieldType;
}

export function SchematicPreview({ data, fieldType = 'futsal' }: SchematicPreviewProps) {
  const [currentCircuitIndex, setCurrentCircuitIndex] = useState(data.currentCircuitIndex || 0);
  const [currentSequenceIndex, setCurrentSequenceIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [elements, setElements] = useState<SchematicElement[]>([]);
  const isPlayingRef = useRef(false);
  const currentSequenceIndexRef = useRef(0);
  
  // Échelle pour la prévisualisation (plus petite que l'éditeur)
  const scale = 8; // 8 pixels par mètre
  const svgWidth = 400;
  const svgHeight = 300;

  // Récupérer le circuit et les séquences actuels
  const currentCircuit = data.circuits?.[currentCircuitIndex];
  const sequences = currentCircuit?.sequences || [[]];

  // Initialiser les éléments avec la séquence 0
  useEffect(() => {
    const seq0 = sequences[0] || [];
    setElements(seq0.map(el => ({ ...el })));
    setCurrentSequenceIndex(0);
    setIsPlaying(false);
  }, [currentCircuitIndex, data.circuits, sequences]);

  // Mettre à jour les éléments quand la séquence change manuellement (hors lecture)
  useEffect(() => {
    if (isPlaying) return;
    const targetSequence = sequences[currentSequenceIndex];
    if (targetSequence && targetSequence.length >= 0) {
      setElements(targetSequence.map(el => ({ ...el })));
    }
  }, [currentSequenceIndex, sequences, isPlaying]);

  // Synchroniser les refs avec l'état
  useEffect(() => {
    isPlayingRef.current = isPlaying;
    currentSequenceIndexRef.current = currentSequenceIndex;
  }, [isPlaying, currentSequenceIndex]);

  // Animation entre les séquences
  useEffect(() => {
    if (!isPlaying) {
      return;
    }
    
    if (sequences.length <= 1) {
      setIsPlaying(false);
      return;
    }

    let animationFrameId: number | null = null;
    const segmentDuration = 1000; // durée d'une transition entre deux séquences (ms)

    // Utiliser l'index actuel depuis la ref pour éviter les problèmes de closure
    let fromIndex = currentSequenceIndexRef.current;
    let toIndex = Math.min(fromIndex + 1, sequences.length - 1);
    let startTime: number | null = null;
    
    // Si on est déjà à la dernière séquence, ne pas démarrer
    if (fromIndex >= sequences.length - 1) {
      setIsPlaying(false);
      return;
    }

    const animate = (timestamp: number) => {
      if (!isPlayingRef.current) {
        return;
      }
      
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      let t = Math.min(elapsed / segmentDuration, 1);

      const fromSeq = sequences[fromIndex] || [];
      const toSeq = sequences[toIndex] || fromSeq;

      // Conserver les éléments verrouillés depuis la séquence de départ
      const lockedElements = fromSeq.filter((el: SchematicElement) => el.isLocked);
      const lockedById = new Map(lockedElements.map((el: SchematicElement) => [el.id, el]));

      const toMap = new Map<string, SchematicElement>();
      toSeq.forEach(el => toMap.set(el.id, el));

      const interpolated = fromSeq.map(fromEl => {
        // Si l'élément est verrouillé, ne pas l'interpoler
        if (fromEl.isLocked) {
          const locked = lockedById.get(fromEl.id);
          return locked || fromEl;
        }
        
        const toEl = toMap.get(fromEl.id) || fromEl;

        // Interpolation linéaire
        const lerp = (a: number, b: number) => a + (b - a) * t;

        if (fromEl.type === 'line' || fromEl.type === 'arrow') {
          const f: LineElement = fromEl as LineElement;
          const tEl: LineElement = toEl as LineElement;
          return {
            ...f,
            x: lerp(f.x, tEl.x),
            y: lerp(f.y, tEl.y),
            endX: lerp(f.endX, tEl.endX),
            endY: lerp(f.endY, tEl.endY),
          } as LineElement;
        }

        const hasWidthHeight = (fromEl as any).width !== undefined && (fromEl as any).height !== undefined;

        const base: any = { ...fromEl };
        base.x = lerp(fromEl.x, toEl.x);
        base.y = lerp(fromEl.y, toEl.y);

        if (hasWidthHeight) {
          base.width = lerp((fromEl as any).width, (toEl as any).width);
          base.height = lerp((fromEl as any).height, (toEl as any).height);
        }

        if ((fromEl as any).size !== undefined) {
          base.size = lerp((fromEl as any).size, (toEl as any).size);
        }

        return base as SchematicElement;
      });

      // Ajouter les éléments verrouillés qui n'existent pas dans la séquence
      lockedElements.forEach((locked: SchematicElement) => {
        if (!interpolated.some((el: SchematicElement) => el.id === locked.id)) {
          interpolated.push(locked);
        }
      });

      setElements(interpolated);

      if (t < 1) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        // Fin de la transition
        const finalElements = [...interpolated];
        lockedElements.forEach((locked: SchematicElement) => {
          if (!finalElements.some((el: SchematicElement) => el.id === locked.id)) {
            finalElements.push(locked);
          }
        });
        setElements(finalElements);
        
        const newIndex = toIndex;
        
        // Mettre à jour l'index de séquence de manière synchrone (état et ref)
        setCurrentSequenceIndex(newIndex);
        currentSequenceIndexRef.current = newIndex;

        if (newIndex >= sequences.length - 1) {
          // Dernière séquence atteinte : arrêter
          setIsPlaying(false);
          isPlayingRef.current = false;
          return;
        }

        // Préparer le segment suivant immédiatement
        fromIndex = newIndex;
        toIndex = Math.min(newIndex + 1, sequences.length - 1);
        startTime = null;

        // Continuer l'animation immédiatement si on est toujours en mode play
        if (isPlayingRef.current) {
          // Utiliser requestAnimationFrame pour la prochaine frame
          animationFrameId = requestAnimationFrame(animate);
        }
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      isPlayingRef.current = false;
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isPlaying, sequences]);

  const handlePlayPause = useCallback(() => {
    setIsPlaying(prev => {
      const newValue = !prev;
      isPlayingRef.current = newValue;
      // Si on démarre la lecture, s'assurer qu'on est à la séquence 0 si on est à la fin
      if (newValue && currentSequenceIndex >= sequences.length - 1) {
        setCurrentSequenceIndex(0);
      }
      return newValue;
    });
  }, [currentSequenceIndex, sequences.length]);

  const handlePreviousSequence = useCallback(() => {
    if (currentSequenceIndex > 0) {
      setIsPlaying(false);
      setCurrentSequenceIndex(prev => prev - 1);
    }
  }, [currentSequenceIndex]);

  const handleNextSequence = useCallback(() => {
    if (currentSequenceIndex < sequences.length - 1) {
      setIsPlaying(false);
      setCurrentSequenceIndex(prev => prev + 1);
    }
  }, [currentSequenceIndex, sequences.length]);

  const handleSelectCircuit = useCallback((index: number) => {
    setIsPlaying(false);
    setCurrentCircuitIndex(index);
    setCurrentSequenceIndex(0);
  }, []);

  const handleSelectSequence = useCallback((index: number) => {
    setIsPlaying(false);
    setCurrentSequenceIndex(index);
  }, []);

  return (
    <div className="w-full space-y-2">
      {/* Contrôles du circuit */}
      {data.circuits && data.circuits.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-700">Circuit:</span>
          <div className="flex gap-1">
            {data.circuits.map((circuit, index) => (
              <button
                key={circuit.id}
                onClick={() => handleSelectCircuit(index)}
                className={`px-2 py-1 text-xs rounded ${
                  index === currentCircuitIndex
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {index + 1}
              </button>
            ))}
          </div>
          <span className="text-xs text-gray-600 ml-2">
            {currentCircuit?.name || `Circuit ${currentCircuitIndex + 1}`}
          </span>
        </div>
      )}

      {/* Schéma SVG */}
      <div className="w-full bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
        <svg
          width={svgWidth}
          height={svgHeight}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-full"
        >
          <Field width={svgWidth} height={svgHeight} scale={scale} fieldType={fieldType} />
          {/* Trajets entre séquences */}
          {currentSequenceIndex < sequences.length - 1 && sequences[currentSequenceIndex] && sequences[currentSequenceIndex + 1] && (
            <SequenceTrajectories
              previous={sequences[currentSequenceIndex]}
              current={sequences[currentSequenceIndex + 1]}
              scale={scale}
              svgWidth={svgWidth}
              svgHeight={svgHeight}
              fieldType={fieldType}
            />
          )}
          <SchematicElements
            elements={elements}
            scale={scale}
            svgWidth={svgWidth}
            svgHeight={svgHeight}
            fieldType={fieldType}
          />
        </svg>
      </div>

      {/* Contrôles de séquence */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={handlePreviousSequence}
            disabled={currentSequenceIndex === 0}
            className="p-1 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Séquence précédente"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          
          <div className="flex gap-1">
            {sequences.map((_, index) => (
              <button
                key={index}
                onClick={() => handleSelectSequence(index)}
                className={`px-2 py-1 text-xs rounded ${
                  index === currentSequenceIndex
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
                title={`Séquence ${index}`}
              >
                {index}
              </button>
            ))}
          </div>

          <button
            onClick={handleNextSequence}
            disabled={currentSequenceIndex >= sequences.length - 1}
            className="p-1 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Séquence suivante"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Bouton Play/Pause */}
        {sequences.length > 1 && (
          <button
            onClick={handlePlayPause}
            className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
          >
            {isPlaying ? (
              <>
                <Pause className="h-3 w-3" />
                Pause
              </>
            ) : (
              <>
                <Play className="h-3 w-3" />
                Play
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
