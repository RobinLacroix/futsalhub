'use client';

import { useState, useRef, useCallback, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Field } from './components/Field';
import { SchematicElements } from './components/SchematicElements';
import { Toolbar } from './components/Toolbar';
import { ContextMenu } from './components/ContextMenu';
import { ElementProperties } from './components/ElementProperties';
import { ResizeHandles } from './components/ResizeHandles';
import { DimensionLabels } from './components/DimensionLabels';
import { SequenceTrajectories } from './components/SequenceTrajectories';
import { SaveLoadModal } from './components/SaveLoadModal';
import { useActiveTeam } from '../../hooks/useActiveTeam';
import { schematicsService, type SchematicData } from '@/lib/services/schematicsService';
import type { 
  SchematicElement, 
  ToolType, 
  Position, 
  ContextMenuState,
  ZoneElement,
  LineElement,
  PlayerElement,
  BallElement,
  MaterialElement,
  FieldType
} from '@/types/schematics';

type Circuit = {
  id: string;
  name: string;
  sequences: SchematicElement[][];
};

// Terrain de futsal : 40m (longueur horizontale) x 20m (largeur verticale)
// Format paysage : 40m de gauche à droite, 20m de haut en bas
// Dimensions par défaut (seront dynamiques selon le type de terrain)
const FUTSAL_LENGTH_M = 40; // Longueur (horizontale, gauche-droite)
const FUTSAL_WIDTH_M = 20;  // Largeur (verticale, haut-bas)
const BLANK_LENGTH_M = 20;
const BLANK_WIDTH_M = 20;

function SchematicsPageContent() {
  const searchParams = useSearchParams();
  const { activeTeam } = useActiveTeam();
  const [fieldType, setFieldType] = useState<FieldType>('futsal');
  const [hasLoadedFromUrl, setHasLoadedFromUrl] = useState(false);
  const [elements, setElements] = useState<SchematicElement[]>([]);
  const [circuits, setCircuits] = useState<Circuit[]>([{
    id: 'circuit-1',
    name: 'Circuit 1',
    sequences: [[]], // Séquence 0 = position de départ
  }]);
  const [currentCircuitIndex, setCurrentCircuitIndex] = useState(0);
  const [currentSequenceIndex, setCurrentSequenceIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [saveLoadModalOpen, setSaveLoadModalOpen] = useState(false);
  const [currentSchematicId, setCurrentSchematicId] = useState<string | null>(null);
  const [selectedTool, setSelectedTool] = useState<ToolType>('select');
  const [selectedElements, setSelectedElements] = useState<SchematicElement[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    elementId: null
  });
  const [scale, setScale] = useState(20); // 20 pixels par mètre (2000% de zoom)
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<Position | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<Position | null>(null);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionBox, setSelectionBox] = useState<{ start: Position; end: Position } | null>(null);
  const [draggedElements, setDraggedElements] = useState<{ ids: string[]; offsetX: number; offsetY: number; initialPositions: Map<string, { x: number; y: number; endX?: number; endY?: number }> } | null>(null);
  const [draggedElement, setDraggedElement] = useState<{ id: string; offsetX: number; offsetY: number; isMovingEnd?: boolean; isMovingLine?: boolean; initialStartX?: number; initialStartY?: number; initialEndX?: number; initialEndY?: number } | null>(null);
  const [resizingHandle, setResizingHandle] = useState<{ id: string; handleType: string; initialPos: Position; initialElement: SchematicElement } | null>(null);
  const resizingHandleRef = useRef<{ id: string; handleType: string; initialPos: Position; initialElement: SchematicElement } | null>(null);
  const isMultiDragRef = useRef<boolean>(false);
  const activeTouchIdRef = useRef<number | null>(null);
  const [copiedElement, setCopiedElement] = useState<SchematicElement | null>(null);
  const [copiedElements, setCopiedElements] = useState<SchematicElement[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);
  
  // Historique pour undo/redo
  const [history, setHistory] = useState<SchematicElement[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const historyIndexRef = useRef(0);
  const maxHistorySize = 50;
  
  // Synchroniser la ref avec l'état
  useEffect(() => {
    historyIndexRef.current = historyIndex;
  }, [historyIndex]);

  // Accès pratique au circuit et aux séquences courants
  const currentCircuit = circuits[currentCircuitIndex] || circuits[0];
  const sequences = currentCircuit?.sequences || [[]];

  // Arrondir au décimètre (0.1 mètre)
  const roundToDecimeter = useCallback((value: number): number => {
    return Math.round(value * 10) / 10;
  }, []);

  // Sauvegarder l'état actuel dans l'historique
  const saveToHistory = useCallback((newElements: SchematicElement[]) => {
    setHistory(prev => {
      const currentIndex = historyIndexRef.current;
      const newHistory = prev.slice(0, currentIndex + 1); // Supprimer les états futurs si on est au milieu de l'historique
      newHistory.push(newElements.map(el => JSON.parse(JSON.stringify(el)))); // Deep copy
      // Limiter la taille de l'historique
      if (newHistory.length > maxHistorySize) {
        newHistory.shift();
        setHistoryIndex(prevIndex => {
          const newIndex = Math.max(0, prevIndex - 1);
          historyIndexRef.current = newIndex;
          return newIndex;
        });
        return newHistory;
      }
      setHistoryIndex(prevIndex => {
        const newIndex = Math.min(prevIndex + 1, maxHistorySize - 1);
        historyIndexRef.current = newIndex;
        return newIndex;
      });
      return newHistory;
    });
  }, []);

  // Annuler (undo)
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      historyIndexRef.current = newIndex;
      setElements(history[newIndex].map(el => JSON.parse(JSON.stringify(el))));
      setSelectedElements([]);
    }
  }, [historyIndex, history]);

  // Refaire (redo)
  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      historyIndexRef.current = newIndex;
      setElements(history[newIndex].map(el => JSON.parse(JSON.stringify(el))));
      setSelectedElements([]);
    }
  }, [historyIndex, history]);

  // Ajouter une nouvelle séquence (copie de la séquence actuelle) dans le circuit courant
  const handleAddSequence = useCallback(() => {
    setCircuits(prev => {
      const updated = [...prev];
      const circuit = updated[currentCircuitIndex];
      if (!circuit) return prev;

      const seqs = [...circuit.sequences];
      // Sauvegarder l'état courant dans la séquence actuelle
      seqs[currentSequenceIndex] = elements.map(el => ({ ...el }));
      // Nouvelle séquence initialisée avec la position actuelle (les éléments verrouillés restent à leur position)
      const newSeq = elements.map(el => ({ ...el }));
      seqs.push(newSeq);

      updated[currentCircuitIndex] = { ...circuit, sequences: seqs };
      return updated;
    });
    setCurrentSequenceIndex(prev => prev + 1);
    // La séquence suivante commence avec les mêmes éléments (y compris les verrouillés)
    setElements(elements.map(el => ({ ...el })));
    setSelectedElements([]);
  }, [elements, currentCircuitIndex, currentSequenceIndex]);

  // Changer de séquence dans le circuit courant
  const handleSelectSequence = useCallback((index: number) => {
    // Arrêter la lecture si elle est en cours
    if (isPlaying) {
      setIsPlaying(false);
    }

    setCircuits(prev => {
      const updated = [...prev];
      const circuit = updated[currentCircuitIndex];
      if (!circuit) return prev;

      const seqs = [...circuit.sequences];
      // Sauvegarder la séquence actuelle
      seqs[currentSequenceIndex] = elements.map(el => ({ ...el }));

      updated[currentCircuitIndex] = { ...circuit, sequences: seqs };
      return updated;
    });

    const targetSequence = sequences[index];
    // Conserver les éléments verrouillés de la séquence actuelle
    const lockedElements = elements.filter((el: SchematicElement) => el.isLocked);
    const lockedById = new Map(lockedElements.map((el: SchematicElement) => [el.id, el]));
    
    const newElements = targetSequence.map((el: SchematicElement) => {
      // Si l'élément existe dans la séquence cible et est verrouillé, garder la version verrouillée
      const locked = lockedById.get(el.id);
      return locked || el;
    });
    
    // Ajouter les éléments verrouillés qui n'existent pas dans la séquence cible
    lockedElements.forEach((locked: SchematicElement) => {
      if (!newElements.some((el: SchematicElement) => el.id === locked.id)) {
        newElements.push(locked);
      }
    });
    
    setElements(newElements);
    setCurrentSequenceIndex(index);
  }, [currentCircuitIndex, currentSequenceIndex, elements, isPlaying, sequences]);

  // Gérer play/pause
  const handlePlayPause = useCallback(() => {
    setIsPlaying(prev => {
      if (!prev) {
        // Démarrer la lecture depuis la séquence actuelle
        // Sauvegarder d'abord la séquence actuelle dans le circuit courant (incluant les éléments verrouillés)
        setCircuits(prevCircuits => {
          const updated = [...prevCircuits];
          const circuit = updated[currentCircuitIndex];
          if (!circuit) return prevCircuits;

          const seqs = [...circuit.sequences];
          // Inclure tous les éléments (y compris les verrouillés) dans la séquence
          seqs[currentSequenceIndex] = elements.map(el => ({ ...el }));

          updated[currentCircuitIndex] = { ...circuit, sequences: seqs };
          return updated;
        });
      }
      return !prev;
    });
  }, [currentCircuitIndex, currentSequenceIndex, elements]);

  // Supprimer la séquence actuelle (sauf la séquence 0) dans le circuit courant
  const handleDeleteSequence = useCallback(() => {
    if (sequences.length <= 1) return;
    if (currentSequenceIndex === 0) return;

    // Arrêter la lecture si elle est en cours
    if (isPlaying) {
      setIsPlaying(false);
    }

    setCircuits(prev => {
      const updated = [...prev];
      const circuit = updated[currentCircuitIndex];
      if (!circuit) return prev;

      const seqs = [...circuit.sequences];
      seqs.splice(currentSequenceIndex, 1);

      const newIndex = Math.min(currentSequenceIndex, seqs.length - 1);
      updated[currentCircuitIndex] = { ...circuit, sequences: seqs };

      // Mettre à jour les éléments pour la nouvelle séquence courante
      const targetSequence = seqs[newIndex] || [];
      setElements(targetSequence.map(el => ({ ...el })));
      setSelectedElements([]);
      setCurrentSequenceIndex(newIndex);

      return updated;
    });
  }, [sequences.length, currentCircuitIndex, currentSequenceIndex, isPlaying]);

  // Ajouter un nouveau circuit (copie vide avec une séquence 0, mais incluant les éléments verrouillés)
  const handleAddCircuit = useCallback(() => {
    // Conserver les éléments verrouillés du circuit actuel
    const lockedElements = elements.filter((el: SchematicElement) => el.isLocked);
    
    setCircuits(prev => {
      const newCircuit: Circuit = {
        id: `circuit-${Date.now()}-${Math.random()}`,
        name: `Circuit ${prev.length + 1}`,
        sequences: [lockedElements.map(el => ({ ...el }))], // Inclure les éléments verrouillés dans la séquence 0
      };
      return [...prev, newCircuit];
    });
    setCurrentCircuitIndex(prev => prev + 1);
    setCurrentSequenceIndex(0);
    setElements(lockedElements.map(el => ({ ...el }))); // Initialiser avec les éléments verrouillés
    setSelectedElements([]);
    setIsPlaying(false);
  }, [elements]);

  // Supprimer le circuit courant
  const handleDuplicateCircuit = useCallback(() => {
    setCircuits(prev => {
      const circuit = prev[currentCircuitIndex];
      if (!circuit) return prev;

      // Sauvegarder l'état actuel du circuit avant de le dupliquer
      const currentSequences = [...circuit.sequences];
      currentSequences[currentSequenceIndex] = elements.map(el => ({ ...el }));

      // Créer une copie profonde du circuit avec toutes ses séquences
      const duplicatedCircuit: Circuit = {
        id: `circuit-${Date.now()}-${Math.random()}`,
        name: `${circuit.name} (copie)`,
        sequences: currentSequences.map(seq => seq.map(el => JSON.parse(JSON.stringify(el))))
      };

      // Insérer le circuit dupliqué juste après le circuit actuel
      const newCircuits = [...prev];
      newCircuits.splice(currentCircuitIndex + 1, 0, duplicatedCircuit);
      
      // Passer au circuit dupliqué
      setCurrentCircuitIndex(currentCircuitIndex + 1);
      setCurrentSequenceIndex(0);
      setElements(duplicatedCircuit.sequences[0].map(el => JSON.parse(JSON.stringify(el))));
      setSelectedElements([]);
      setIsPlaying(false);

      return newCircuits;
    });
  }, [elements, currentCircuitIndex, currentSequenceIndex]);

  const handleDeleteCircuit = useCallback(() => {
    setCircuits(prev => {
      if (prev.length <= 1) return prev;

      const newCircuits = [...prev];
      newCircuits.splice(currentCircuitIndex, 1);

      const newIndex = Math.min(currentCircuitIndex, newCircuits.length - 1);
      setCurrentCircuitIndex(newIndex);
      setCurrentSequenceIndex(0);

      const targetCircuit = newCircuits[newIndex];
      const targetSeq = targetCircuit.sequences[0] || [];
      setElements(targetSeq.map(el => ({ ...el })));
      setSelectedElements([]);
      setIsPlaying(false);

      return newCircuits;
    });
  }, [currentCircuitIndex]);

  // Sélectionner un circuit
  const handleSelectCircuit = useCallback((index: number) => {
    setCircuits(prev => {
      const updated = [...prev];
      const circuit = updated[currentCircuitIndex];
      if (circuit) {
        const seqs = [...circuit.sequences];
        seqs[currentSequenceIndex] = elements.map(el => ({ ...el }));
        updated[currentCircuitIndex] = { ...circuit, sequences: seqs };
      }
      return updated;
    });

    // Conserver les éléments verrouillés lors du changement de circuit
    const lockedElements = elements.filter((el: SchematicElement) => el.isLocked);
    const lockedById = new Map(lockedElements.map((el: SchematicElement) => [el.id, el]));

    setCurrentCircuitIndex(index);
    setCurrentSequenceIndex(0);

    const targetCircuit = circuits[index];
    const targetSeq = targetCircuit?.sequences[0] || [];
    
    // Conserver les éléments verrouillés
    const newElements = targetSeq.map((el: SchematicElement) => {
      const locked = lockedById.get(el.id);
      return locked || el;
    });
    
    // Ajouter les éléments verrouillés qui n'existent pas dans la séquence cible
    lockedElements.forEach((locked: SchematicElement) => {
      if (!newElements.some((el: SchematicElement) => el.id === locked.id)) {
        newElements.push(locked);
      }
    });
    
    setElements(newElements);
    setSelectedElements([]);
    setIsPlaying(false);
  }, [circuits, currentCircuitIndex, currentSequenceIndex, elements]);

  // Lecture automatique des séquences avec animation continue
  useEffect(() => {
    if (!isPlaying || sequences.length <= 1) {
      return;
    }

    let animationFrameId: number | null = null;
    const segmentDuration = 1000; // durée d'une transition entre deux séquences (ms)

    let fromIndex = currentSequenceIndex;
    let toIndex = Math.min(fromIndex + 1, sequences.length - 1);
    let startTime: number | null = null;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      let t = Math.min(elapsed / segmentDuration, 1);

      const fromSeq = sequences[fromIndex] || [];
      const toSeq = sequences[toIndex] || fromSeq;

      // Conserver les éléments verrouillés de la séquence actuelle
      const lockedElements = elements.filter((el: SchematicElement) => el.isLocked);
      const lockedById = new Map(lockedElements.map((el: SchematicElement) => [el.id, el]));

      const toMap = new Map<string, SchematicElement>();
      toSeq.forEach(el => toMap.set(el.id, el));

      const interpolated = fromSeq.map(fromEl => {
        // Si l'élément est verrouillé, ne pas l'interpoler, garder sa position
        if (fromEl.isLocked) {
          return fromEl;
        }
        
        const toEl = toMap.get(fromEl.id) || fromEl;

        // Interpolation linéaire des positions principales
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

      if (t < 1 && isPlaying) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        // Fin de la transition vers toIndex
        // S'assurer que les éléments verrouillés sont présents dans la séquence finale
        const finalElements = [...interpolated];
        lockedElements.forEach((locked: SchematicElement) => {
          if (!finalElements.some((el: SchematicElement) => el.id === locked.id)) {
            finalElements.push(locked);
          }
        });
        setElements(finalElements);
        setCurrentSequenceIndex(toIndex);

        if (toIndex >= sequences.length - 1) {
          // Dernière séquence atteinte : arrêter la lecture
          setIsPlaying(false);
          return;
        }

        // Préparer le segment suivant
        fromIndex = toIndex;
        toIndex = Math.min(toIndex + 1, sequences.length - 1);
        startTime = null;

        if (isPlaying) {
          animationFrameId = requestAnimationFrame(animate);
        }
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isPlaying, sequences, currentSequenceIndex]);

  // Mettre à jour les éléments quand la séquence change manuellement (hors lecture)
  useEffect(() => {
    if (isPlaying) return;
    const targetSequence = sequences[currentSequenceIndex];
    if (targetSequence && targetSequence.length >= 0) {
      setElements(targetSequence.map(el => ({ ...el })));
      setSelectedElements([]);
    }
  }, [currentSequenceIndex, sequences, isPlaying]);

  // Obtenir les dimensions du terrain selon le type
  const getFieldDimensions = useCallback(() => {
    if (fieldType === 'futsal') {
      return { length: FUTSAL_LENGTH_M, width: FUTSAL_WIDTH_M };
    } else {
      return { length: BLANK_LENGTH_M, width: BLANK_WIDTH_M };
    }
  }, [fieldType]);

  // Obtenir les offsets pour centrer le terrain (identique à Field et SchematicElements)
  const fieldOffsets = useMemo(() => {
    const { length: FIELD_LENGTH_M, width: FIELD_WIDTH_M } = getFieldDimensions();
    const fieldLength = FIELD_LENGTH_M * scale;
    const fieldWidth = FIELD_WIDTH_M * scale;
    const offsetX = (1000 - fieldLength) / 2;
    const offsetY = (600 - fieldWidth) / 2;
    return { offsetX, offsetY };
  }, [fieldType, scale, getFieldDimensions]);

  // Convertir les coordonnées de la souris en coordonnées du terrain
  const getFieldCoordinates = useCallback((clientX: number, clientY: number): Position => {
    if (!svgRef.current) return { x: 0, y: 0 };
    
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    
    // ViewBox du SVG
    const viewBoxWidth = 1000;
    const viewBoxHeight = 600;
    const viewBoxAspect = viewBoxWidth / viewBoxHeight;
    const rectAspect = rect.width / rect.height;
    
    // Calculer la zone réelle du viewBox dans le viewport (prendre en compte preserveAspectRatio="xMidYMid meet")
    let actualWidth: number;
    let actualHeight: number;
    let offsetX: number;
    let offsetY: number;
    
    if (rectAspect > viewBoxAspect) {
      // Le viewport est plus large que le viewBox -> letterboxing horizontal
      actualHeight = rect.height;
      actualWidth = actualHeight * viewBoxAspect;
      offsetX = (rect.width - actualWidth) / 2;
      offsetY = 0;
    } else {
      // Le viewport est plus haut que le viewBox -> letterboxing vertical
      actualWidth = rect.width;
      actualHeight = actualWidth / viewBoxAspect;
      offsetX = 0;
      offsetY = (rect.height - actualHeight) / 2;
    }
    
    // Coordonnées relatives à la zone réelle du viewBox
    const svgX = clientX - rect.left - offsetX;
    const svgY = clientY - rect.top - offsetY;
    
    // Convertir en coordonnées du viewBox
    const viewBoxX = (svgX / actualWidth) * viewBoxWidth;
    const viewBoxY = (svgY / actualHeight) * viewBoxHeight;
    
    // Dimensions du terrain dans le viewBox (dynamiques selon le type)
    const { length: FIELD_LENGTH_M, width: FIELD_WIDTH_M } = getFieldDimensions();
    const fieldLength = FIELD_LENGTH_M * scale;
    const fieldWidth = FIELD_WIDTH_M * scale;
    const fieldOffsetX = (viewBoxWidth - fieldLength) / 2;
    const fieldOffsetY = (viewBoxHeight - fieldWidth) / 2;
    
    // Convertir en mètres (coordonnées du terrain)
    const x = (viewBoxX - fieldOffsetX) / scale;
    const y = (viewBoxY - fieldOffsetY) / scale;
    
    return { x, y };
  }, [scale, fieldType]);
  
  // Trouver un joueur proche d'une position
  const findPlayerNearPosition = useCallback((pos: Position, excludeId?: string): PlayerElement | null => {
    const tolerance = 1.0; // 1 mètre de tolérance
    for (const element of elements) {
      if (element.type === 'player' && element.id !== excludeId) {
        const player = element as PlayerElement;
        const dist = Math.sqrt(Math.pow(pos.x - player.x, 2) + Math.pow(pos.y - player.y, 2));
        const radius = player.size; // Taille du joueur en mètres
        if (dist <= radius + tolerance) {
          return player;
        }
      }
    }
    return null;
  }, [elements]);

  // Calculer la distance d'un point à un segment de ligne
  const distanceToLineSegment = useCallback((point: Position, lineStart: Position, lineEnd: Position): number => {
    const A = point.x - lineStart.x;
    const B = point.y - lineStart.y;
    const C = lineEnd.x - lineStart.x;
    const D = lineEnd.y - lineStart.y;
    
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    
    if (lenSq !== 0) {
      param = dot / lenSq;
    }
    
    let xx, yy;
    
    if (param < 0) {
      xx = lineStart.x;
      yy = lineStart.y;
    } else if (param > 1) {
      xx = lineEnd.x;
      yy = lineEnd.y;
    } else {
      xx = lineStart.x + param * C;
      yy = lineStart.y + param * D;
    }
    
    const dx = point.x - xx;
    const dy = point.y - yy;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  // Trouver l'élément à une position donnée
  const findElementAtPosition = useCallback((pos: Position, elementsList: SchematicElement[]): SchematicElement | null => {
    // Tolérance améliorée: ~8px convertis en mètres, pour faciliter la sélection des lignes/flèches
    const tolerance = 8 / scale;
    
    // Parcourir les éléments dans l'ordre inverse (du plus récent au plus ancien)
    for (let i = elementsList.length - 1; i >= 0; i--) {
      const element = elementsList[i];
      
      if (element.type === 'rectangle') {
        const rect = element as ZoneElement;
        if (pos.x >= rect.x - tolerance && pos.x <= rect.x + rect.width + tolerance &&
            pos.y >= rect.y - tolerance && pos.y <= rect.y + rect.height + tolerance) {
          return element;
        }
      } else if (element.type === 'circle') {
        const circle = element as ZoneElement;
        const centerX = circle.x + circle.width / 2;
        const centerY = circle.y + circle.height / 2;
        const radius = circle.width / 2;
        const dist = Math.sqrt(Math.pow(pos.x - centerX, 2) + Math.pow(pos.y - centerY, 2));
        if (dist <= radius + tolerance) {
          return element;
        }
      } else if (element.type === 'line' || element.type === 'arrow') {
        const line = element as LineElement;
        if (line.isCurved && line.controlPoint) {
          // Approximer la distance à une courbe quadratique en échantillonnant des segments
          const samples = 24;
          let prevPoint = { x: line.x, y: line.y };
          for (let i = 1; i <= samples; i++) {
            const t = i / samples;
            const xt = (1 - t) * (1 - t) * line.x + 2 * (1 - t) * t * line.controlPoint.x + t * t * line.endX;
            const yt = (1 - t) * (1 - t) * line.y + 2 * (1 - t) * t * line.controlPoint.y + t * t * line.endY;
            const currPoint = { x: xt, y: yt };
            const distSeg = distanceToLineSegment(pos, prevPoint, currPoint);
            if (distSeg <= tolerance) {
              return element;
            }
            prevPoint = currPoint;
          }
        } else {
          // Vérifier la distance à la ligne droite
          const dist = distanceToLineSegment(pos, { x: line.x, y: line.y }, { x: line.endX, y: line.endY });
          if (dist <= tolerance) {
            return element;
          }
        }
      } else if (element.type === 'player') {
        // La taille est en mètres pour les joueurs
        const dist = Math.sqrt(Math.pow(pos.x - element.x, 2) + Math.pow(pos.y - element.y, 2));
        const radius = element.size; // Déjà en mètres
        if (dist <= radius + tolerance) {
          return element;
        }
      } else if (element.type === 'ball') {
        const dist = Math.sqrt(Math.pow(pos.x - element.x, 2) + Math.pow(pos.y - element.y, 2));
        const radius = element.size / 2; // En mètres (diamètre / 2)
        if (dist <= radius + tolerance) {
          return element;
        }
      } else if (element.type === 'goal' || element.type === 'cone' || element.type === 'ladder') {
        const dist = Math.sqrt(Math.pow(pos.x - element.x, 2) + Math.pow(pos.y - element.y, 2));
        const radius = element.size; // En mètres
        if (dist <= radius + tolerance) {
          return element;
        }
      }
    }
    
    return null;
  }, [scale, distanceToLineSegment]);

  // Type pour souris ou événement tactile synthétique (tablette)
  type ElementPointerEvent = React.MouseEvent | { clientX: number; clientY: number; button?: number; shiftKey?: boolean; preventDefault?: () => void; stopPropagation?: () => void };

  // Gérer le clic sur un élément (souris ou touch)
  const handleElementMouseDown = useCallback((elementId: string, e: ElementPointerEvent) => {
    if ('button' in e && e.button !== 0) return; // Seulement clic gauche (ignorer pour touch)
    e.preventDefault?.(); // Empêcher la sélection de texte / scroll tactile
    
    const element = elements.find(el => el.id === elementId);
    if (!element) return;
    
    // Ne pas permettre de déplacer un élément verrouillé
    if (element.isLocked) {
      // Permettre seulement la sélection
      const pos = getFieldCoordinates(e.clientX, e.clientY);
      if (e.shiftKey) {
        e.stopPropagation?.(); // Empêcher la propagation vers handleMouseDown
        setSelectedElements(prev => {
          const isSelected = prev.some(el => el.id === elementId);
          if (isSelected) {
            return prev.filter(el => el.id !== elementId);
          } else {
            return [...prev, element];
          }
        });
      } else {
        e.stopPropagation?.(); // Empêcher la propagation vers handleMouseDown
        setSelectedElements([element]);
      }
      return;
    }
    
    const pos = getFieldCoordinates(e.clientX, e.clientY);
    
    // Gérer Maj+clic pour sélection multiple
    if (e.shiftKey) {
      e.stopPropagation?.(); // Empêcher la propagation vers handleMouseDown
      e.preventDefault?.(); // Empêcher le comportement par défaut
      setSelectedElements(prev => {
        const isSelected = prev.some(el => el.id === elementId);
        if (isSelected) {
          // Retirer de la sélection
          return prev.filter(el => el.id !== elementId);
        } else {
          // Ajouter à la sélection
          return [...prev, element];
        }
      });
      return;
    }
    
    // Vérifier la sélection actuelle
    const isInSelection = selectedElements.some(el => el.id === elementId);
    
    // Si l'élément n'est pas dans la sélection, le sélectionner seul et le déplacer
    if (!isInSelection) {
      setSelectedElements([element]);
      // Calculer l'offset pour le déplacement d'un seul élément
      let offsetX = 0;
      let offsetY = 0;
      let isMovingEnd = false;
      
      // Pour les lignes, déterminer si on déplace le début, la fin, ou toute la ligne
      if (element.type === 'line' || element.type === 'arrow') {
        const lineElement = element as LineElement;
        const distToStart = Math.sqrt(
          Math.pow(pos.x - lineElement.x, 2) + Math.pow(pos.y - lineElement.y, 2)
        );
        const distToEnd = Math.sqrt(
          Math.pow(pos.x - lineElement.endX, 2) + Math.pow(pos.y - lineElement.endY, 2)
        );
        
        // Tolérance pour considérer qu'on clique sur un point (1 mètre)
        const pointTolerance = 1.0;
        
        // Si on clique très proche d'un point, déplacer seulement ce point
        if (distToStart < pointTolerance) {
          offsetX = pos.x - lineElement.x;
          offsetY = pos.y - lineElement.y;
          isMovingEnd = false;
        } else if (distToEnd < pointTolerance) {
          offsetX = pos.x - lineElement.endX;
          offsetY = pos.y - lineElement.endY;
          isMovingEnd = true;
        } else {
          // Sinon, déplacer toute la ligne
          const midX = (lineElement.x + lineElement.endX) / 2;
          const midY = (lineElement.y + lineElement.endY) / 2;
          offsetX = pos.x - midX;
          offsetY = pos.y - midY;
          
          setDraggedElement({
            id: element.id,
            offsetX,
            offsetY,
            isMovingLine: true,
            initialStartX: lineElement.x,
            initialStartY: lineElement.y,
            initialEndX: lineElement.endX,
            initialEndY: lineElement.endY
          });
          setSelectedTool('select');
          return;
        }
      } else {
        // Pour les autres éléments, calculer l'offset normal
        if (element.type === 'rectangle' || element.type === 'circle') {
          const zoneElement = element as ZoneElement;
          offsetX = pos.x - zoneElement.x;
          offsetY = pos.y - zoneElement.y;
        } else {
          // Pour les éléments ponctuels, utiliser le centre
          offsetX = pos.x - element.x;
          offsetY = pos.y - element.y;
        }
      }
      
      setDraggedElement({ 
        id: element.id, 
        offsetX, 
        offsetY,
        ...(element.type === 'line' || element.type === 'arrow' ? { isMovingEnd } : {})
      });
      setSelectedTool('select');
      return;
    } else if (selectedElements.length > 1) {
      // Si plusieurs éléments sont sélectionnés et que l'élément cliqué est dans la sélection, déplacer tous
      // Récupérer les éléments actuels depuis le tableau elements
      const currentSelectedElements = selectedElements.map(selEl => elements.find(el => el.id === selEl.id)).filter((el): el is SchematicElement => el !== undefined);
      
      // Calculer l'offset minimum pour tous les éléments sélectionnés
      const minX = Math.min(...currentSelectedElements.map(el => {
        if (el.type === 'rectangle' || el.type === 'circle') {
          return (el as ZoneElement).x;
        } else if (el.type === 'line' || el.type === 'arrow') {
          return Math.min((el as LineElement).x, (el as LineElement).endX);
        }
        return el.x;
      }));
      const minY = Math.min(...currentSelectedElements.map(el => {
        if (el.type === 'rectangle' || el.type === 'circle') {
          return (el as ZoneElement).y;
        } else if (el.type === 'line' || el.type === 'arrow') {
          return Math.min((el as LineElement).y, (el as LineElement).endY);
        }
        return el.y;
      }));
      
      // Filtrer les éléments verrouillés - ne pas les déplacer
      const elementsToMove = currentSelectedElements.filter((el: SchematicElement) => !el.isLocked);
      if (elementsToMove.length > 0) {
        // Stocker les positions initiales de tous les éléments
        const initialPositions = new Map<string, { x: number; y: number; endX?: number; endY?: number }>();
        elementsToMove.forEach((el: SchematicElement) => {
          if (el.type === 'line' || el.type === 'arrow') {
            const lineEl = el as LineElement;
            initialPositions.set(el.id, { x: lineEl.x, y: lineEl.y, endX: lineEl.endX, endY: lineEl.endY });
          } else if (el.type === 'rectangle' || el.type === 'circle') {
            const zoneEl = el as ZoneElement;
            initialPositions.set(el.id, { x: zoneEl.x, y: zoneEl.y });
          } else {
            initialPositions.set(el.id, { x: el.x, y: el.y });
          }
        });
        
        // Déclencher le déplacement immédiatement
        isMultiDragRef.current = true; // Marquer qu'on est en train de déplacer plusieurs éléments
        setDraggedElements({
          ids: elementsToMove.map((el: SchematicElement) => el.id),
          offsetX: pos.x - minX,
          offsetY: pos.y - minY,
          initialPositions
        });
        // Réinitialiser le flag après un court délai
        setTimeout(() => {
          isMultiDragRef.current = false;
        }, 100);
        return; // Sortir pour ne pas continuer avec le déplacement d'un seul élément
      }
    }
    
    // Si un seul élément est sélectionné, le déplacer
    setSelectedElements(prev => {
      if (prev.length === 1 && prev[0].id === elementId) {
        // Calculer l'offset pour le déplacement d'un seul élément
        let offsetX = 0;
        let offsetY = 0;
        let isMovingEnd = false;
        
        // Pour les lignes, déterminer si on déplace le début, la fin, ou toute la ligne
        if (element.type === 'line' || element.type === 'arrow') {
          const lineElement = element as LineElement;
          const distToStart = Math.sqrt(
            Math.pow(pos.x - lineElement.x, 2) + Math.pow(pos.y - lineElement.y, 2)
          );
          const distToEnd = Math.sqrt(
            Math.pow(pos.x - lineElement.endX, 2) + Math.pow(pos.y - lineElement.endY, 2)
          );
          
          // Tolérance pour considérer qu'on clique sur un point (1 mètre)
          const pointTolerance = 1.0;
          
          // Calculer la distance du point au segment de ligne
          const lineLength = Math.sqrt(
            Math.pow(lineElement.endX - lineElement.x, 2) + Math.pow(lineElement.endY - lineElement.y, 2)
          );
          
          // Vecteur de la ligne
          const dx = lineElement.endX - lineElement.x;
          const dy = lineElement.endY - lineElement.y;
          
          // Vecteur du point de départ au point cliqué
          const px = pos.x - lineElement.x;
          const py = pos.y - lineElement.y;
          
          // Projection du point sur la ligne
          const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (lineLength * lineLength)));
          const projX = lineElement.x + t * dx;
          const projY = lineElement.y + t * dy;
          const distToLine = Math.sqrt(
            Math.pow(pos.x - projX, 2) + Math.pow(pos.y - projY, 2)
          );
          
          // Si on clique très proche d'un point, déplacer seulement ce point
          if (distToStart < pointTolerance) {
            offsetX = pos.x - lineElement.x;
            offsetY = pos.y - lineElement.y;
            isMovingEnd = false;
          } else if (distToEnd < pointTolerance) {
            offsetX = pos.x - lineElement.endX;
            offsetY = pos.y - lineElement.endY;
            isMovingEnd = true;
          } else {
            // Sinon, déplacer toute la ligne
            // Utiliser le point le plus proche comme référence pour l'offset
            const midX = (lineElement.x + lineElement.endX) / 2;
            const midY = (lineElement.y + lineElement.endY) / 2;
            offsetX = pos.x - midX;
            offsetY = pos.y - midY;
            
            setDraggedElement({
              id: element.id,
              offsetX,
              offsetY,
              isMovingLine: true,
              initialStartX: lineElement.x,
              initialStartY: lineElement.y,
              initialEndX: lineElement.endX,
              initialEndY: lineElement.endY
            });
            return prev;
          }
        } else {
          // Pour les autres éléments, calculer l'offset normal
          // Pour les zones, utiliser le coin supérieur gauche
          if (element.type === 'rectangle' || element.type === 'circle') {
            const zoneElement = element as ZoneElement;
            offsetX = pos.x - zoneElement.x;
            offsetY = pos.y - zoneElement.y;
          } else {
            // Pour les éléments ponctuels, utiliser le centre
            offsetX = pos.x - element.x;
            offsetY = pos.y - element.y;
          }
        }
        
        setDraggedElement({ 
          id: element.id, 
          offsetX, 
          offsetY,
          ...(element.type === 'line' || element.type === 'arrow' ? { isMovingEnd } : {})
        });
      }
      
      return prev;
    });
    
    setSelectedTool('select'); // Passer en mode sélection quand on clique sur un élément
  }, [elements, getFieldCoordinates]);

  // Démarrer le drag depuis un touch (tablette)
  const handleElementTouchStart = useCallback((elementId: string, e: React.TouchEvent) => {
    if (e.touches.length === 0) return;
    const touch = e.touches[0];
    activeTouchIdRef.current = touch.identifier;
    handleElementMouseDown(elementId, {
      clientX: touch.clientX,
      clientY: touch.clientY,
      button: 0,
      shiftKey: false,
      preventDefault: () => e.preventDefault(),
      stopPropagation: () => e.stopPropagation(),
    });
    e.preventDefault();
  }, [handleElementMouseDown]);

  // Créer un nouvel élément
  const createElement = useCallback((
    tool: ToolType,
    start: Position,
    end: Position,
    shiftKey: boolean = false
  ): SchematicElement | null => {
    // Arrondir les positions de départ et d'arrivée au décimètre
    const roundedStart = { x: roundToDecimeter(start.x), y: roundToDecimeter(start.y) };
    const roundedEnd = { x: roundToDecimeter(end.x), y: roundToDecimeter(end.y) };
    const id = `element-${Date.now()}-${Math.random()}`;
    const defaultColor = '#000000';
    const defaultSize = 20;

    switch (tool) {
      case 'rectangle':
        let rectX = roundToDecimeter(Math.min(roundedStart.x, roundedEnd.x));
        let rectY = roundToDecimeter(Math.min(roundedStart.y, roundedEnd.y));
        let rectWidth = roundToDecimeter(Math.abs(roundedEnd.x - roundedStart.x));
        let rectHeight = roundToDecimeter(Math.abs(roundedEnd.y - roundedStart.y));
        
        // Si Maj est pressé, forcer un carré (même largeur et hauteur)
        if (shiftKey) {
          const size = Math.max(rectWidth, rectHeight);
          rectWidth = size;
          rectHeight = size;
          // Recentrer le rectangle pour qu'il parte du point de départ
          // Calculer la nouvelle position en gardant le point de départ comme coin
          if (roundedEnd.x < roundedStart.x) {
            rectX = roundToDecimeter(roundedStart.x - size);
          } else {
            rectX = roundedStart.x;
          }
          if (roundedEnd.y < roundedStart.y) {
            rectY = roundToDecimeter(roundedStart.y - size);
          } else {
            rectY = roundedStart.y;
          }
        }
        
        return {
          id,
          type: 'rectangle',
          x: rectX,
          y: rectY,
          width: rectWidth,
          height: rectHeight,
          color: defaultColor,
          strokeWidth: 2,
          strokeStyle: 'solid',
          fillColor: '#000000',
          fillOpacity: 0.3
        } as ZoneElement;

      case 'circle':
        const radius = roundToDecimeter(Math.sqrt(Math.pow(roundedEnd.x - roundedStart.x, 2) + Math.pow(roundedEnd.y - roundedStart.y, 2)));
        const circleX = roundToDecimeter(roundedStart.x - radius);
        const circleY = roundToDecimeter(roundedStart.y - radius);
        const circleDiameter = roundToDecimeter(radius * 2);
        return {
          id,
          type: 'circle',
          x: circleX,
          y: circleY,
          width: circleDiameter,
          height: circleDiameter,
          color: defaultColor,
          strokeWidth: 2,
          strokeStyle: 'solid',
          fillColor: '#000000',
          fillOpacity: 0.3
        } as ZoneElement;

      case 'line': {
        let endX = roundedEnd.x;
        let endY = roundedEnd.y;
        
        // Si Maj est pressé, forcer horizontal ou vertical selon ce qui est le plus proche
        if (shiftKey) {
          const dx = Math.abs(roundedEnd.x - roundedStart.x);
          const dy = Math.abs(roundedEnd.y - roundedStart.y);
          if (dx > dy) {
            // Plus horizontal, forcer horizontal
            endY = roundedStart.y;
          } else {
            // Plus vertical, forcer vertical
            endX = roundedStart.x;
          }
        }
        
        // Détecter si le début ou la fin de la ligne est proche d'un joueur
        const startPlayer = findPlayerNearPosition(roundedStart);
        const endPlayer = findPlayerNearPosition({ x: endX, y: endY });
        return {
          id,
          type: 'line',
          x: roundedStart.x,
          y: roundedStart.y,
          endX: endX,
          endY: endY,
          color: defaultColor,
          strokeWidth: 2,
          strokeStyle: 'solid',
          startPlayerId: startPlayer?.id,
          endPlayerId: endPlayer?.id
        } as LineElement;
      }

      case 'arrow': {
        let endX = roundedEnd.x;
        let endY = roundedEnd.y;
        
        // Si Maj est pressé, forcer horizontal ou vertical selon ce qui est le plus proche
        if (shiftKey) {
          const dx = Math.abs(roundedEnd.x - roundedStart.x);
          const dy = Math.abs(roundedEnd.y - roundedStart.y);
          if (dx > dy) {
            // Plus horizontal, forcer horizontal
            endY = roundedStart.y;
          } else {
            // Plus vertical, forcer vertical
            endX = roundedStart.x;
          }
        }
        
        // Détecter si le début ou la fin de la flèche est proche d'un joueur
        const startPlayer = findPlayerNearPosition(roundedStart);
        const endPlayer = findPlayerNearPosition({ x: endX, y: endY });
        return {
          id,
          type: 'arrow',
          x: roundedStart.x,
          y: roundedStart.y,
          endX: endX,
          endY: endY,
          color: defaultColor,
          strokeWidth: 2,
          strokeStyle: 'solid',
          startPlayerId: startPlayer?.id,
          endPlayerId: endPlayer?.id
        } as LineElement;
      }

      case 'player':
        return {
          id,
          type: 'player',
          x: roundedStart.x,
          y: roundedStart.y,
          number: '1',
          size: 0.6, // Taille par défaut : normal (0.6m de rayon)
          color: '#3B82F6',
          strokeWidth: 2,
          strokeStyle: 'solid',
          fillColor: '#3B82F6',
          fillOpacity: 1,
          textColor: '#ffffff' // Couleur du texte par défaut
        } as PlayerElement;

      case 'ball':
        return {
          id,
          type: 'ball',
          x: roundedStart.x,
          y: roundedStart.y,
          size: 0.7, // Taille en mètres (diamètre d'un ballon de futsal agrandi pour visibilité)
          color: '#000000',
          strokeWidth: 2,
          strokeStyle: 'solid'
        } as BallElement;

      case 'goal':
        return {
          id,
          type: 'goal',
          x: roundedStart.x,
          y: roundedStart.y,
          size: 3,
          color: '#8B4513',
          strokeWidth: 2,
          strokeStyle: 'solid'
        } as MaterialElement;

      case 'cone':
        return {
          id,
          type: 'cone',
          x: roundedStart.x,
          y: roundedStart.y,
          size: 0.3,
          color: '#FFD700',
          strokeWidth: 2,
          strokeStyle: 'solid'
        } as MaterialElement;

      case 'ladder':
        return {
          id,
          type: 'ladder',
          x: roundedStart.x,
          y: roundedStart.y,
          size: 0.4,
          color: '#FF6347',
          strokeWidth: 2,
          strokeStyle: 'solid'
        } as MaterialElement;

      default:
        return null;
    }
  }, [roundToDecimeter]);

  // Logique commune clic/touch sur le terrain (souris ou tablette)
  const handlePointerDownOnField = useCallback((clientX: number, clientY: number, shiftKey: boolean) => {
    const pos = getFieldCoordinates(clientX, clientY);
    
    if (selectedTool === 'select') {
      const clickedElement = findElementAtPosition(pos, elements);
      if (clickedElement) return;
      if (!shiftKey) {
        setSelectedElements([]);
        setIsSelecting(true);
        setSelectionBox({ start: pos, end: pos });
      }
      return;
    }

    if (isDrawing && drawStart && (selectedTool === 'line' || selectedTool === 'arrow')) {
      const newElement = createElement(selectedTool, drawStart, pos, shiftKey);
      if (newElement) {
        saveToHistory(elements);
        setElements(prev => [...prev, newElement]);
      }
      setIsDrawing(false);
      setDrawStart(null);
      setDrawCurrent(null);
      setSelectedTool('select');
      return;
    }

    const pointElements: ToolType[] = ['player', 'ball', 'goal', 'cone', 'ladder'];
    if (pointElements.includes(selectedTool)) {
      const newElement = createElement(selectedTool, pos, pos);
      if (newElement) {
        saveToHistory(elements);
        setElements(prev => [...prev, newElement]);
      }
      return;
    }

    setIsDrawing(true);
    setDrawStart(pos);
    setDrawCurrent(pos);
  }, [selectedTool, getFieldCoordinates, elements, findElementAtPosition, isDrawing, drawStart, createElement]);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    if (e.defaultPrevented) return;
    handlePointerDownOnField(e.clientX, e.clientY, e.shiftKey);
  }, [handlePointerDownOnField]);

  const handleTouchStartOnField = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    if (e.defaultPrevented) return;
    if (e.touches.length === 0) return;
    const touch = e.touches[0];
    activeTouchIdRef.current = touch.identifier;
    handlePointerDownOnField(touch.clientX, touch.clientY, false);
    e.preventDefault();
  }, [handlePointerDownOnField]);

  // Logique de déplacement global (souris ou tactile) — partagée pour tablette
  const applyGlobalMove = useCallback((clientX: number, clientY: number) => {
    if (!svgRef.current) return;
    
    const pos = getFieldCoordinates(clientX, clientY);
    
    // Si on redimensionne un élément (vérifier que resizingHandle existe toujours via la ref)
    const currentResizingHandle = resizingHandleRef.current;
    if (currentResizingHandle && currentResizingHandle.id) {
      setElements(prev => {
        const element = prev.find(el => el.id === currentResizingHandle.id);
        if (!element) return prev;
        
        const handleType = currentResizingHandle.handleType;
        
        if (element.type === 'rectangle') {
          const rect = element as ZoneElement;
          const initial = currentResizingHandle.initialElement as ZoneElement;
          let newX = rect.x;
          let newY = rect.y;
          let newWidth = rect.width;
          let newHeight = rect.height;
          
          switch (handleType) {
            case 'nw':
              newWidth = (initial.x + initial.width) - pos.x;
              newHeight = (initial.y + initial.height) - pos.y;
              newX = pos.x;
              newY = pos.y;
              break;
            case 'ne':
              newWidth = pos.x - initial.x;
              newHeight = (initial.y + initial.height) - pos.y;
              newY = pos.y;
              break;
            case 'se':
              newWidth = pos.x - initial.x;
              newHeight = pos.y - initial.y;
              break;
            case 'sw':
              newWidth = (initial.x + initial.width) - pos.x;
              newHeight = pos.y - initial.y;
              newX = pos.x;
              break;
            case 'n':
              newHeight = (initial.y + initial.height) - pos.y;
              newY = pos.y;
              break;
            case 's':
              newHeight = pos.y - initial.y;
              break;
            case 'e':
              newWidth = pos.x - initial.x;
              break;
            case 'w':
              newWidth = (initial.x + initial.width) - pos.x;
              newX = pos.x;
              break;
          }
          
          // Empêcher les dimensions négatives et arrondir au décimètre
          if (newWidth < 0.1) newWidth = 0.1;
          if (newHeight < 0.1) newHeight = 0.1;
          newX = roundToDecimeter(newX);
          newY = roundToDecimeter(newY);
          newWidth = roundToDecimeter(newWidth);
          newHeight = roundToDecimeter(newHeight);
          
          return prev.map(el => 
            el.id === currentResizingHandle.id 
              ? { ...el, x: newX, y: newY, width: newWidth, height: newHeight } as ZoneElement
              : el
          );
        }
        
        if (element.type === 'circle') {
          const circle = element as ZoneElement;
          const initial = currentResizingHandle.initialElement as ZoneElement;
          const centerX = initial.x + initial.width / 2;
          const centerY = initial.y + initial.height / 2;
          let newRadius = 0;
          
          switch (handleType) {
            case 'n':
              newRadius = Math.abs(centerY - pos.y);
              break;
            case 's':
              newRadius = Math.abs(pos.y - centerY);
              break;
            case 'e':
              newRadius = Math.abs(pos.x - centerX);
              break;
            case 'w':
              newRadius = Math.abs(centerX - pos.x);
              break;
          }
          
          if (newRadius < 0.1) newRadius = 0.1;
          newRadius = roundToDecimeter(newRadius);
          const diameter = roundToDecimeter(newRadius * 2);
          const newX = roundToDecimeter(centerX - newRadius);
          const newY = roundToDecimeter(centerY - newRadius);
          
          return prev.map(el => 
            el.id === currentResizingHandle.id 
              ? { ...el, x: newX, y: newY, width: diameter, height: diameter } as ZoneElement
              : el
          );
        }
        
        if (element.type === 'line' || element.type === 'arrow') {
          const line = element as LineElement;
          if (handleType === 'start') {
            // Vérifier si on peut associer le début à un joueur
            const newX = roundToDecimeter(pos.x);
            const newY = roundToDecimeter(pos.y);
            const startPlayer = findPlayerNearPosition({ x: newX, y: newY });
            
            return prev.map(el => 
              el.id === currentResizingHandle.id 
                ? { 
                    ...el, 
                    x: newX, 
                    y: newY,
                    // Si on trouve un joueur, l'associer, sinon désassocier si on était associé
                    startPlayerId: startPlayer?.id
                  } as LineElement
                : el
            );
          } else if (handleType === 'end') {
            // Vérifier si on peut associer la fin à un joueur
            const newEndX = roundToDecimeter(pos.x);
            const newEndY = roundToDecimeter(pos.y);
            const endPlayer = findPlayerNearPosition({ x: newEndX, y: newEndY });
            
            return prev.map(el => 
              el.id === currentResizingHandle.id 
                ? { 
                    ...el, 
                    endX: newEndX, 
                    endY: newEndY,
                    // Si on trouve un joueur, l'associer, sinon désassocier si on était associé
                    endPlayerId: endPlayer?.id
                  } as LineElement
                : el
            );
          } else if (handleType === 'control') {
            // Déplacer le point de contrôle pour courber la ligne
            // Le point de contrôle suit directement la position de la souris
            return prev.map(el => 
              el.id === currentResizingHandle.id 
                ? { 
                    ...el, 
                    isCurved: true,
                    controlPoint: {
                      x: roundToDecimeter(pos.x),
                      y: roundToDecimeter(pos.y)
                    }
                  } as LineElement
                : el
            );
          }
        }
        
        return prev;
      });
      
      return;
    }
    
    // Si on déplace plusieurs éléments
    if (draggedElements) {
      setElements(prev => {
        // Calculer le point de référence minimum initial
        const initialMinX = Math.min(...Array.from(draggedElements.initialPositions.values()).map(p => p.x));
        const initialMinY = Math.min(...Array.from(draggedElements.initialPositions.values()).map(p => p.y));
        
        // Calculer le delta depuis la position initiale
        const deltaX = roundToDecimeter((pos.x - draggedElements.offsetX) - initialMinX);
        const deltaY = roundToDecimeter((pos.y - draggedElements.offsetY) - initialMinY);
        
        // D'abord, mettre à jour tous les éléments déplacés
        let updatedElements = prev.map(el => {
          if (!draggedElements.ids.includes(el.id)) return el;
          
          const initialPos = draggedElements.initialPositions.get(el.id);
          if (!initialPos) return el;
          
          if (el.type === 'rectangle' || el.type === 'circle') {
            return { ...el, x: roundToDecimeter(initialPos.x + deltaX), y: roundToDecimeter(initialPos.y + deltaY) } as ZoneElement;
          } else if (el.type === 'line' || el.type === 'arrow') {
            const line = el as LineElement;
            // Si la ligne est associée à un joueur, ne pas la déplacer (elle suivra le joueur)
            if (line.startPlayerId || line.endPlayerId) {
              return el;
            }
            return { ...el, x: roundToDecimeter(initialPos.x + deltaX), y: roundToDecimeter(initialPos.y + deltaY), endX: roundToDecimeter((initialPos.endX || 0) + deltaX), endY: roundToDecimeter((initialPos.endY || 0) + deltaY) } as LineElement;
          } else if (el.type === 'player') {
            // Pour les joueurs, déplacer
            return { ...el, x: roundToDecimeter(initialPos.x + deltaX), y: roundToDecimeter(initialPos.y + deltaY) };
          } else {
            return { ...el, x: roundToDecimeter(initialPos.x + deltaX), y: roundToDecimeter(initialPos.y + deltaY) };
          }
        });
        
        // Ensuite, mettre à jour les lignes associées aux joueurs déplacés
        const movedPlayers = updatedElements.filter(el => 
          el.type === 'player' && draggedElements.ids.includes(el.id)
        ) as PlayerElement[];
        
        return updatedElements.map(el => {
          if (el.type === 'line' || el.type === 'arrow') {
            const line = el as LineElement;
            let updated = false;
            let newLine = { ...line };
            
            // Vérifier si cette ligne est associée à un joueur déplacé
            for (const player of movedPlayers) {
              if (line.startPlayerId === player.id) {
                newLine.x = player.x;
                newLine.y = player.y;
                updated = true;
              }
              if (line.endPlayerId === player.id) {
                newLine.endX = player.x;
                newLine.endY = player.y;
                updated = true;
              }
            }
            
            return updated ? newLine : el;
          }
          return el;
        });
      });
      return;
    }
    
    // Si on déplace un élément
    if (draggedElement) {
      setElements(prev => {
        const element = prev.find(el => el.id === draggedElement.id);
        if (!element) return prev;
        
        if (element.type === 'line' || element.type === 'arrow') {
          const lineElement = element as LineElement;
          // Si la ligne est associée à un joueur, ne pas permettre de la déplacer manuellement
          // (elle suit automatiquement le joueur)
          if (lineElement.startPlayerId || lineElement.endPlayerId) {
            return prev;
          }
          
          // Si on déplace toute la ligne
          if (draggedElement.isMovingLine && draggedElement.initialStartX !== undefined && draggedElement.initialStartY !== undefined && draggedElement.initialEndX !== undefined && draggedElement.initialEndY !== undefined) {
            const deltaX = roundToDecimeter(pos.x - draggedElement.offsetX - (draggedElement.initialStartX + draggedElement.initialEndX) / 2);
            const deltaY = roundToDecimeter(pos.y - draggedElement.offsetY - (draggedElement.initialStartY + draggedElement.initialEndY) / 2);
            
            const newX = roundToDecimeter(draggedElement.initialStartX + deltaX);
            const newY = roundToDecimeter(draggedElement.initialStartY + deltaY);
            const newEndX = roundToDecimeter(draggedElement.initialEndX + deltaX);
            const newEndY = roundToDecimeter(draggedElement.initialEndY + deltaY);
            
            // Vérifier si on peut associer les points à des joueurs
            const startPlayer = findPlayerNearPosition({ x: newX, y: newY });
            const endPlayer = findPlayerNearPosition({ x: newEndX, y: newEndY });
            
            return prev.map(el => 
              el.id === draggedElement.id 
                ? { 
                    ...el, 
                    x: newX, 
                    y: newY,
                    endX: newEndX,
                    endY: newEndY,
                    startPlayerId: startPlayer?.id,
                    endPlayerId: endPlayer?.id
                  } as LineElement
                : el
            );
          }
          
          // Utiliser le flag isMovingEnd pour savoir quel point déplacer
          if (draggedElement.isMovingEnd) {
            // Déplacer la fin - vérifier si on peut l'associer à un joueur
            const newEndX = roundToDecimeter(pos.x - draggedElement.offsetX);
            const newEndY = roundToDecimeter(pos.y - draggedElement.offsetY);
            const endPlayer = findPlayerNearPosition({ x: newEndX, y: newEndY });
            
            return prev.map(el => 
              el.id === draggedElement.id 
                ? { 
                    ...el, 
                    endX: newEndX, 
                    endY: newEndY,
                    // Si on trouve un joueur, l'associer, sinon désassocier si on était associé
                    endPlayerId: endPlayer?.id
                  } as LineElement
                : el
            );
          } else {
            // Déplacer le début - vérifier si on peut l'associer à un joueur
            const newX = roundToDecimeter(pos.x - draggedElement.offsetX);
            const newY = roundToDecimeter(pos.y - draggedElement.offsetY);
            const startPlayer = findPlayerNearPosition({ x: newX, y: newY });
            
            return prev.map(el => 
              el.id === draggedElement.id 
                ? { 
                    ...el, 
                    x: newX, 
                    y: newY,
                    // Si on trouve un joueur, l'associer, sinon désassocier si on était associé
                    startPlayerId: startPlayer?.id
                  } as LineElement
                : el
            );
          }
        } else if (element.type === 'rectangle' || element.type === 'circle') {
          // Pour les zones, déplacer en gardant la taille
          return prev.map(el => 
            el.id === draggedElement.id 
              ? { ...el, x: roundToDecimeter(pos.x - draggedElement.offsetX), y: roundToDecimeter(pos.y - draggedElement.offsetY) } as ZoneElement
              : el
          );
        } else if (element.type === 'player') {
          // Pour les joueurs, déplacer et mettre à jour les lignes associées
          const newX = roundToDecimeter(pos.x - draggedElement.offsetX);
          const newY = roundToDecimeter(pos.y - draggedElement.offsetY);
          const player = element as PlayerElement;
          
          return prev.map(el => {
            if (el.id === draggedElement.id) {
              return { ...el, x: newX, y: newY };
            }
            // Mettre à jour les lignes associées à ce joueur
            if (el.type === 'line' || el.type === 'arrow') {
              const line = el as LineElement;
              let updated = false;
              let newLine = { ...line };
              
              if (line.startPlayerId === player.id) {
                newLine.x = newX;
                newLine.y = newY;
                updated = true;
              }
              if (line.endPlayerId === player.id) {
                newLine.endX = newX;
                newLine.endY = newY;
                updated = true;
              }
              
              return updated ? newLine : el;
            }
            return el;
          });
        } else {
          // Pour les autres éléments (ballon, matériel), déplacer directement
          return prev.map(el => 
            el.id === draggedElement.id 
              ? { ...el, x: roundToDecimeter(pos.x - draggedElement.offsetX), y: roundToDecimeter(pos.y - draggedElement.offsetY) }
              : el
          );
        }
      });
      
      return;
    }
    
    // Zone de sélection (tactile)
    if (isSelecting && selectionBox) {
      setSelectionBox(prev => prev ? { ...prev, end: pos } : null);
      return;
    }
    // Si on dessine
    if (isDrawing && drawStart) {
      setDrawCurrent(pos);
    }
  }, [isDrawing, drawStart, draggedElement, draggedElements, isSelecting, selectionBox, resizingHandleRef, getFieldCoordinates, elements, findPlayerNearPosition]);

  const handleGlobalMouseMove = useCallback((e: MouseEvent) => {
    applyGlobalMove(e.clientX, e.clientY);
  }, [applyGlobalMove]);

  const handleGlobalTouchMove = useCallback((e: TouchEvent) => {
    e.preventDefault();
    const t = Array.from(e.touches).find(touch => touch.identifier === activeTouchIdRef.current);
    if (!t) return;
    applyGlobalMove(t.clientX, t.clientY);
  }, [applyGlobalMove]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const pos = getFieldCoordinates(e.clientX, e.clientY);
    
    // Si on dessine une zone de sélection
    if (isSelecting && selectionBox) {
      setSelectionBox(prev => prev ? { ...prev, end: pos } : null);
      return;
    }
    
    // Si on dessine (pas de drag)
    if (isDrawing && drawStart && !draggedElement && !draggedElements) {
      setDrawCurrent(pos);
    }
  }, [isDrawing, drawStart, draggedElement, draggedElements, isSelecting, selectionBox, getFieldCoordinates]);

  const handleTouchMoveOnField = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    const t = Array.from(e.touches).find(touch => touch.identifier === activeTouchIdRef.current);
    if (!t) return;
    const pos = getFieldCoordinates(t.clientX, t.clientY);
    if (isSelecting && selectionBox) {
      setSelectionBox(prev => prev ? { ...prev, end: pos } : null);
      return;
    }
    if (isDrawing && drawStart && !draggedElement && !draggedElements) {
      setDrawCurrent(pos);
    }
  }, [isDrawing, drawStart, draggedElement, draggedElements, isSelecting, selectionBox, getFieldCoordinates]);

  // Gérer le début du redimensionnement
  const handleResizeHandleMouseDown = useCallback((handleType: string, e: React.MouseEvent) => {
    if (selectedElements.length === 0) return;
    const elementToResize = selectedElements[0]; // Redimensionner seulement le premier élément
    e.stopPropagation();
    e.preventDefault();
    
    const pos = getFieldCoordinates(e.clientX, e.clientY);
    
    // Si on déplace le point de contrôle d'une ligne et qu'elle n'est pas encore courbe, l'initialiser
    if (handleType === 'control' && (elementToResize.type === 'line' || elementToResize.type === 'arrow')) {
      const line = elementToResize as LineElement;
      if (!line.isCurved || !line.controlPoint) {
        // Initialiser le point de contrôle au milieu de la ligne
        const midX = (line.x + line.endX) / 2;
        const midY = (line.y + line.endY) / 2;
        setElements(prev => prev.map(el => 
          el.id === elementToResize.id 
            ? { ...el, isCurved: true, controlPoint: { x: midX, y: midY } } as LineElement
            : el
        ));
        // Mettre à jour l'élément pour le handle avec le point de contrôle initialisé
        const updatedElement = { ...elementToResize, isCurved: true, controlPoint: { x: midX, y: midY } } as LineElement;
        const handleData = {
          id: updatedElement.id,
          handleType,
          initialPos: { x: midX, y: midY }, // Position initiale du point de contrôle
          initialElement: updatedElement
        };
        resizingHandleRef.current = handleData;
        setResizingHandle(handleData);
        return;
      } else {
        // La ligne est déjà courbe, utiliser le point de contrôle actuel comme référence
        const handleData = {
          id: elementToResize.id,
          handleType,
          initialPos: line.controlPoint, // Position initiale du point de contrôle
          initialElement: { ...elementToResize }
        };
        resizingHandleRef.current = handleData;
        setResizingHandle(handleData);
        return;
      }
    }
    
    const handleData = {
      id: elementToResize.id,
      handleType,
      initialPos: pos,
      initialElement: { ...elementToResize }
    };
    resizingHandleRef.current = handleData;
    setResizingHandle(handleData);
  }, [selectedElements, getFieldCoordinates, elements]);

  // Gestion du relâchement de la souris (global pour le drag and drop)
  const handleGlobalMouseUp = useCallback(() => {
    // Arrêter le redimensionnement
    const currentResizingHandle = resizingHandleRef.current;
    if (currentResizingHandle) {
      const resizingId = currentResizingHandle.id;
      resizingHandleRef.current = null;
      setResizingHandle(null);
      // Mettre à jour l'élément sélectionné avec les valeurs finales arrondies et sauvegarder l'historique
      setElements(prev => {
        const element = prev.find(el => el.id === resizingId);
        if (element) {
          setSelectedElements([element]);
        }
        // Sauvegarder l'historique après le redimensionnement
        saveToHistory(prev);
        return prev;
      });
      return;
    }
    
    // Arrêter le déplacement de plusieurs éléments
    if (draggedElements) {
      // Sauvegarder l'historique après le déplacement
      setElements(prev => {
        saveToHistory(prev);
        return prev;
      });
      setDraggedElements(null);
      return;
    }
    
    // Arrêter le déplacement
    if (draggedElement) {
      // Sauvegarder l'historique après le déplacement
      setElements(prev => {
        saveToHistory(prev);
        return prev;
      });
      setDraggedElement(null);
      return;
    }
    
    // Finir le dessin - Ne pas sauvegarder ici car handleMouseUp le fera
    // Cette fonction est appelée pour les événements globaux, mais handleMouseUp gère déjà le dessin
    if (!isDrawing || !drawStart || !drawCurrent) return;
    
    // Ne rien faire ici, handleMouseUp s'en occupe
  }, [isDrawing, drawStart, drawCurrent, selectedTool, draggedElement, draggedElements]);

  // Finalisation sélection / dessin (partagée souris et tactile)
  const finalizePointerUp = useCallback((shiftKey: boolean) => {
    if (isSelecting && selectionBox) {
      const minX = Math.min(selectionBox.start.x, selectionBox.end.x);
      const maxX = Math.max(selectionBox.start.x, selectionBox.end.x);
      const minY = Math.min(selectionBox.start.y, selectionBox.end.y);
      const maxY = Math.max(selectionBox.start.y, selectionBox.end.y);
      const selectedInBox = elements.filter(element => {
        if (element.type === 'rectangle' || element.type === 'circle') {
          const zone = element as ZoneElement;
          const elemMinX = zone.x;
          const elemMaxX = zone.x + zone.width;
          const elemMinY = zone.y;
          const elemMaxY = zone.y + zone.height;
          return !(elemMaxX < minX || elemMinX > maxX || elemMaxY < minY || elemMinY > maxY);
        } else if (element.type === 'line' || element.type === 'arrow') {
          const line = element as LineElement;
          const lineMinX = Math.min(line.x, line.endX);
          const lineMaxX = Math.max(line.x, line.endX);
          const lineMinY = Math.min(line.y, line.endY);
          const lineMaxY = Math.max(line.y, line.endY);
          return !(lineMaxX < minX || lineMinX > maxX || lineMaxY < minY || lineMinY > maxY);
        } else {
          return element.x >= minX && element.x <= maxX && element.y >= minY && element.y <= maxY;
        }
      });
      setSelectedElements(selectedInBox);
      setIsSelecting(false);
      setSelectionBox(null);
      return;
    }
    if (isDrawing && drawStart && drawCurrent && !draggedElement && !draggedElements) {
      const newElement = createElement(selectedTool, drawStart, drawCurrent, shiftKey);
      if (newElement) {
        saveToHistory(elements);
        setElements(prev => [...prev, newElement]);
      }
      setIsDrawing(false);
      setDrawStart(null);
      setDrawCurrent(null);
    }
  }, [isDrawing, drawStart, drawCurrent, selectedTool, draggedElement, draggedElements, isSelecting, selectionBox, elements, createElement, saveToHistory]);

  const handleMouseUp = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    finalizePointerUp(e.shiftKey);
  }, [finalizePointerUp]);

  const handleTouchEndOnField = useCallback(() => {
    finalizePointerUp(false);
  }, [finalizePointerUp]);

  const handleGlobalTouchEnd = useCallback((e: TouchEvent) => {
    const released = Array.from(e.changedTouches).some(t => t.identifier === activeTouchIdRef.current);
    if (released) {
      activeTouchIdRef.current = null;
      handleGlobalMouseUp();
      handleTouchEndOnField();
    }
  }, [handleGlobalMouseUp, handleTouchEndOnField]);

  // Gérer le menu contextuel
  const handleElementContextMenu = useCallback((elementId: string, position: Position) => {
    setContextMenu({
      visible: true,
      x: position.x,
      y: position.y,
      elementId
    });
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(prev => ({ ...prev, visible: false }));
  }, []);

  const handleCopy = useCallback(() => {
    // Copier tous les éléments sélectionnés ou l'élément du menu contextuel
    if (selectedElements.length > 0) {
      // Stocker tous les éléments copiés
      setCopiedElements(selectedElements);
      setCopiedElement(selectedElements[0]); // Pour compatibilité
    } else if (contextMenu.elementId) {
      const element = elements.find(e => e.id === contextMenu.elementId);
      if (element) {
        setCopiedElements([element]);
        setCopiedElement(element);
      }
    }
  }, [selectedElements, contextMenu.elementId, elements]);

  const handlePaste = useCallback(() => {
    if (copiedElements.length === 0) return;
    
    // Coller tous les éléments copiés
    const pastedElements = copiedElements.map((element, index) => ({
      ...element,
      id: `element-${Date.now()}-${index}-${Math.random()}`,
      x: element.x + 2,
      y: element.y + 2
    }));
    
    setElements(prev => [...prev, ...pastedElements]);
    setSelectedElements(pastedElements);
  }, [copiedElements]);

  const handleRotate90 = useCallback(() => {
    // Faire tourner tous les éléments sélectionnés ou l'élément du menu contextuel
    const idsToRotate = selectedElements.length > 0 
      ? selectedElements.map(el => el.id)
      : contextMenu.elementId 
        ? [contextMenu.elementId]
        : [];
    
    if (idsToRotate.length === 0) return;
    
    setElements(prev => {
      const updated = prev.map(el => {
        if (idsToRotate.includes(el.id)) {
          return { ...el, rotation: ((el.rotation || 0) + 90) % 360 };
        }
        return el;
      });
      // Mettre à jour les éléments sélectionnés
      if (selectedElements.length > 0) {
        setSelectedElements(updated.filter(el => idsToRotate.includes(el.id)));
      } else if (contextMenu.elementId) {
        const updatedElement = updated.find(el => el.id === contextMenu.elementId);
        if (updatedElement) {
          setSelectedElements([updatedElement]);
        }
      }
      return updated;
    });
  }, [selectedElements, contextMenu.elementId]);

  // Verrouiller/Déverrouiller un élément
  const handleToggleLock = useCallback(() => {
    const elementId = contextMenu.elementId;
    if (!elementId) return;
    
    saveToHistory(elements); // Sauvegarder avant la modification
    
    setElements(prev => prev.map(el => {
      if (el.id === elementId) {
        return { ...el, isLocked: !el.isLocked };
      }
      return el;
    }));
    
    // Mettre à jour la sélection si l'élément est sélectionné
    setSelectedElements(prev => prev.map(el => {
      if (el.id === elementId) {
        return { ...el, isLocked: !el.isLocked };
      }
      return el;
    }));
  }, [contextMenu.elementId, elements, saveToHistory]);

  const handleDelete = useCallback(() => {
    // Supprimer tous les éléments sélectionnés ou l'élément du menu contextuel
    if (selectedElements.length > 0) {
      saveToHistory(elements); // Sauvegarder avant la suppression
      const idsToDelete = selectedElements.map(el => el.id);
      setElements(prev => prev.filter(e => !idsToDelete.includes(e.id)));
      setSelectedElements([]);
    } else if (contextMenu.elementId) {
      saveToHistory(elements); // Sauvegarder avant la suppression
      setElements(prev => prev.filter(e => e.id !== contextMenu.elementId));
    }
    handleCloseContextMenu();
  }, [selectedElements, contextMenu.elementId, handleCloseContextMenu, elements, saveToHistory]);

  const handleDrawLine = useCallback(() => {
    if (!contextMenu.elementId) return;
    const element = elements.find(e => e.id === contextMenu.elementId);
    if (!element) return;
    
    // Obtenir la position de l'élément (centre pour joueur/ballon)
    let startX = element.x;
    let startY = element.y;
    
    // Pour les zones, utiliser le centre
    if (element.type === 'rectangle' || element.type === 'circle') {
      const zoneElement = element as ZoneElement;
      startX = zoneElement.x + zoneElement.width / 2;
      startY = zoneElement.y + zoneElement.height / 2;
    }
    
    // Mode dessin de ligne depuis l'élément
    setSelectedTool('line');
    setIsDrawing(true);
    setDrawStart({ x: startX, y: startY });
    setDrawCurrent({ x: startX, y: startY });
  }, [contextMenu.elementId, elements]);

  const handleDrawArrow = useCallback(() => {
    if (!contextMenu.elementId) return;
    const element = elements.find(e => e.id === contextMenu.elementId);
    if (!element) return;
    
    // Obtenir la position de l'élément (centre pour joueur/ballon)
    let startX = element.x;
    let startY = element.y;
    
    // Pour les zones, utiliser le centre
    if (element.type === 'rectangle' || element.type === 'circle') {
      const zoneElement = element as ZoneElement;
      startX = zoneElement.x + zoneElement.width / 2;
      startY = zoneElement.y + zoneElement.height / 2;
    }
    
    // Mode dessin de flèche depuis l'élément
    setSelectedTool('arrow');
    setIsDrawing(true);
    setDrawStart({ x: startX, y: startY });
    setDrawCurrent({ x: startX, y: startY });
  }, [contextMenu.elementId, elements]);

  // Mettre à jour un élément
  const handleUpdateElement = useCallback((elementId: string, updates: Partial<SchematicElement>) => {
    // Arrondir les dimensions au décimètre
    const roundedUpdates: Partial<SchematicElement> = { ...updates };
    if ('x' in roundedUpdates && typeof roundedUpdates.x === 'number') {
      roundedUpdates.x = roundToDecimeter(roundedUpdates.x);
    }
    if ('y' in roundedUpdates && typeof roundedUpdates.y === 'number') {
      roundedUpdates.y = roundToDecimeter(roundedUpdates.y);
    }
    if ('width' in roundedUpdates && typeof roundedUpdates.width === 'number') {
      roundedUpdates.width = roundToDecimeter(roundedUpdates.width);
    }
    if ('height' in roundedUpdates && typeof roundedUpdates.height === 'number') {
      roundedUpdates.height = roundToDecimeter(roundedUpdates.height);
    }
    if ('endX' in roundedUpdates && typeof roundedUpdates.endX === 'number') {
      roundedUpdates.endX = roundToDecimeter(roundedUpdates.endX);
    }
    if ('endY' in roundedUpdates && typeof roundedUpdates.endY === 'number') {
      roundedUpdates.endY = roundToDecimeter(roundedUpdates.endY);
    }
    if ('size' in roundedUpdates && typeof roundedUpdates.size === 'number') {
      roundedUpdates.size = roundToDecimeter(roundedUpdates.size);
    }
    if ('points' in roundedUpdates && Array.isArray(roundedUpdates.points)) {
      roundedUpdates.points = roundedUpdates.points.map(p => ({
        x: roundToDecimeter(p.x),
        y: roundToDecimeter(p.y)
      }));
    }
    
    setElements(prev => {
      // Sauvegarder l'historique avant la modification
      saveToHistory(prev);
      return prev.map(e => {
        if (e.id === elementId) {
          return { ...e, ...roundedUpdates } as SchematicElement;
        }
        return e;
      });
    });
    // Mettre à jour la sélection
    setSelectedElements(prev => {
      const updated = prev.map(el => {
        if (el.id === elementId) {
          return { ...el, ...roundedUpdates } as SchematicElement;
        }
        return el;
      });
      return updated as SchematicElement[];
    });
  }, [roundToDecimeter, saveToHistory]);

  // Zoom
  const handleZoomIn = useCallback(() => {
    setScale(prev => Math.min(prev + 2, 50));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale(prev => Math.max(prev - 2, 5));
  }, []);

  const handleResetZoom = useCallback(() => {
    setScale(20);
  }, []);

  // Sauvegarder le schéma
  const handleSaveSchematic = useCallback(async (name: string): Promise<string | null> => {
    if (!activeTeam?.id) {
      throw new Error('Aucune équipe sélectionnée');
    }

    // Récupérer les éléments verrouillés pour les inclure dans toutes les séquences
    const lockedElements = elements.filter((el: SchematicElement) => el.isLocked);

    // Fonction pour calculer les circuits mis à jour
    const calculateUpdatedCircuits = (currentCircuits: Circuit[]): Circuit[] => {
      const updatedCircuits = [...currentCircuits];
      const circuit = updatedCircuits[currentCircuitIndex];
      if (circuit) {
        const seqs = [...circuit.sequences];
        // Sauvegarder la séquence actuelle avec tous les éléments (y compris verrouillés)
        seqs[currentSequenceIndex] = elements.map(el => ({ ...el }));
        
        // S'assurer que les éléments verrouillés sont présents dans toutes les séquences
        seqs.forEach((seq, index) => {
          const lockedById = new Map(lockedElements.map((el: SchematicElement) => [el.id, el]));
          const newSeq = seq.map((el: SchematicElement) => {
            const locked = lockedById.get(el.id);
            return locked || el;
          });
          
          // Ajouter les éléments verrouillés qui n'existent pas dans cette séquence
          lockedElements.forEach((locked: SchematicElement) => {
            if (!newSeq.some((el: SchematicElement) => el.id === locked.id)) {
              newSeq.push(locked);
            }
          });
          
          seqs[index] = newSeq;
        });
        
        updatedCircuits[currentCircuitIndex] = { ...circuit, sequences: seqs };
      }
      return updatedCircuits;
    };

    // Calculer les circuits mis à jour directement depuis l'état actuel
    const updatedCircuits = calculateUpdatedCircuits(circuits);
    
    // Mettre à jour l'état pour la cohérence
    setCircuits(updatedCircuits);

    const data: SchematicData = {
      circuits: updatedCircuits.map(c => ({
        id: c.id,
        name: c.name,
        sequences: c.sequences
      })),
      currentCircuitIndex
    };

    const result = await schematicsService.saveSchematic({
      id: currentSchematicId || undefined,
      teamId: activeTeam.id,
      name,
      data
    });

    setCurrentSchematicId(result.id);
    return result.id;
  }, [activeTeam, currentCircuitIndex, currentSequenceIndex, elements, currentSchematicId, circuits]);

  // Charger un schéma
  const handleLoadSchematic = useCallback((data: SchematicData) => {
    if (data.circuits && data.circuits.length > 0) {
      setCircuits(data.circuits);
      setCurrentCircuitIndex(data.currentCircuitIndex || 0);
      const targetCircuit = data.circuits[data.currentCircuitIndex || 0];
      const seq0 = targetCircuit?.sequences?.[0] || [];
      const loadedElements = seq0.map(el => ({ ...el }));
      setElements(loadedElements);
      setCurrentSequenceIndex(0);
      setSelectedElements([]);
      // Réinitialiser l'historique avec les éléments chargés
      setHistory([loadedElements.map(el => JSON.parse(JSON.stringify(el)))]);
      setHistoryIndex(0);
    }
  }, []);

  // Charger automatiquement le schéma depuis l'URL si présent
  useEffect(() => {
    const schematicId = searchParams.get('schematic');
    if (schematicId && !hasLoadedFromUrl) {
      const loadSchematicFromUrl = async () => {
        try {
          const schematic = await schematicsService.getSchematicById(schematicId);
          if (schematic) {
            handleLoadSchematic(schematic.data);
            setCurrentSchematicId(schematic.id);
            setHasLoadedFromUrl(true);
          }
        } catch (err) {
          console.error('Erreur lors du chargement du schéma depuis l\'URL:', err);
        }
      };
      loadSchematicFromUrl();
    }
  }, [searchParams, hasLoadedFromUrl, handleLoadSchematic]);

  // Initialiser l'historique au chargement
  useEffect(() => {
    if (elements.length === 0 && history.length === 1 && history[0].length === 0) {
      // Initialiser avec un état vide
      setHistory([[]]);
      setHistoryIndex(0);
    }
  }, []);

  // Gérer les événements globaux pour le drag and drop, redimensionnement, sélection et dessin (souris + tactile tablette)
  useEffect(() => {
    if (draggedElement || draggedElements || resizingHandle || isSelecting || isDrawing) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
      document.addEventListener('touchmove', handleGlobalTouchMove, { passive: false });
      document.addEventListener('touchend', handleGlobalTouchEnd, { passive: false });
      document.addEventListener('touchcancel', handleGlobalTouchEnd, { passive: false });
      return () => {
        document.removeEventListener('mousemove', handleGlobalMouseMove);
        document.removeEventListener('mouseup', handleGlobalMouseUp);
        document.removeEventListener('touchmove', handleGlobalTouchMove);
        document.removeEventListener('touchend', handleGlobalTouchEnd);
        document.removeEventListener('touchcancel', handleGlobalTouchEnd);
      };
    }
  }, [draggedElement, draggedElements, resizingHandle, isSelecting, isDrawing, handleGlobalMouseMove, handleGlobalMouseUp, handleGlobalTouchMove, handleGlobalTouchEnd]);

  // Fermer le menu contextuel en cliquant ailleurs
  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu.visible) {
        handleCloseContextMenu();
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [contextMenu.visible, handleCloseContextMenu]);

  // Gérer les raccourcis clavier
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignorer si l'utilisateur est en train de taper dans un champ de saisie
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      
      // Détecter Ctrl (Windows/Linux) ou Cmd (Mac)
      const isModifierPressed = e.ctrlKey || e.metaKey;
      
      // Ctrl+C ou Cmd+C : Copier
      if (isModifierPressed && e.key === 'c' && selectedElements.length > 0) {
        e.preventDefault();
        handleCopy();
        return;
      }
      
      // Ctrl+V ou Cmd+V : Coller
      if (isModifierPressed && e.key === 'v' && copiedElements.length > 0) {
        e.preventDefault();
        handlePaste();
        return;
      }
      
      // Touche Suppr : Supprimer
      // Sur Mac, la touche Delete peut être "Delete" ou "Backspace"
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElements.length > 0) {
        e.preventDefault();
        handleDelete();
        return;
      }
      
      // Ctrl+Z ou Cmd+Z : Annuler (undo)
      if (isModifierPressed && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }
      
      // Ctrl+Y ou Cmd+Y : Refaire (redo) - raccourci alternatif
      if (isModifierPressed && e.key === 'y' && !e.shiftKey) {
        e.preventDefault();
        handleRedo();
        return;
      }
      
      // Ctrl+Shift+Z ou Cmd+Shift+Z : Refaire (redo)
      if (isModifierPressed && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
        return;
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedElements, copiedElements, handleCopy, handlePaste, handleDelete, handleUndo, handleRedo]);

  // Détecter la touche Maj pour les contraintes de dessin
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(true);
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(false);
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  return (
    <div className="h-screen flex flex-col w-full min-w-0 relative">
      <Toolbar
        selectedTool={selectedTool}
        onToolSelect={setSelectedTool}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetZoom={handleResetZoom}
        scale={scale}
        currentSequence={currentSequenceIndex}
        totalSequences={sequences.length}
        onAddSequence={handleAddSequence}
        onSelectSequence={handleSelectSequence}
        isPlaying={isPlaying}
        onPlayPause={handlePlayPause}
        onDeleteSequence={handleDeleteSequence}
        circuitName={currentCircuit?.name || ''}
        onCircuitNameChange={(name) => {
          setCircuits(prev => {
            const updated = [...prev];
            if (!updated[currentCircuitIndex]) return prev;
            updated[currentCircuitIndex] = { ...updated[currentCircuitIndex], name };
            return updated;
          });
        }}
        circuits={circuits.map(c => ({ id: c.id, name: c.name }))}
        currentCircuitIndex={currentCircuitIndex}
        onSelectCircuit={handleSelectCircuit}
        onAddCircuit={handleAddCircuit}
        onDuplicateCircuit={handleDuplicateCircuit}
        onDeleteCircuit={handleDeleteCircuit}
        onOpenSaveLoad={() => setSaveLoadModalOpen(true)}
        fieldType={fieldType}
        onFieldTypeChange={setFieldType}
      />

      {/* Modal Enregistrer/Charger */}
      {activeTeam && (
        <SaveLoadModal
          isOpen={saveLoadModalOpen}
          onClose={() => setSaveLoadModalOpen(false)}
          onLoad={handleLoadSchematic}
          onSave={handleSaveSchematic}
          teamId={activeTeam.id}
          currentSchematicId={currentSchematicId}
        />
      )}

      {/* Panneau de propriétés collé à la toolbar */}
      {selectedElements.length === 1 && (
        <div 
          className="absolute top-[44px] left-0 right-0 z-50 border-b border-gray-200 shadow-sm bg-white"
        >
          <ElementProperties
            element={selectedElements[0]}
            onClose={() => setSelectedElements([])}
            onUpdate={handleUpdateElement}
          />
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 relative bg-gray-100 min-h-0 overflow-hidden" style={{ zIndex: 1 }}>
          <svg
            ref={svgRef}
            className="w-full h-full touch-none"
            viewBox="0 0 1000 600"
            preserveAspectRatio="xMidYMid meet"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStartOnField}
            onTouchMove={handleTouchMoveOnField}
            style={{ pointerEvents: 'auto', touchAction: 'none' }}
          >
            <Field width={1000} height={600} scale={scale} fieldType={fieldType} />
            {/* Trajets entre la séquence N et la séquence N+1 */}
            {currentSequenceIndex < sequences.length - 1 && sequences[currentSequenceIndex] && sequences[currentSequenceIndex + 1] && (
              <SequenceTrajectories
                previous={sequences[currentSequenceIndex]}
                current={sequences[currentSequenceIndex + 1]}
                scale={scale}
                svgWidth={1000}
                svgHeight={600}
                fieldType={fieldType}
              />
            )}
            <SchematicElements
              elements={elements}
              scale={scale}
              svgWidth={1000}
              svgHeight={600}
              selectedElementIds={selectedElements.map(el => el.id)}
              fieldType={fieldType}
              onElementClick={(id) => {
                const element = elements.find(e => e.id === id);
                if (element) {
                  // Si on vient de déclencher un déplacement multi-éléments, ne pas modifier la sélection
                  if (isMultiDragRef.current) {
                    return;
                  }
                  
                  // Si on est en train de déplacer des éléments, ne pas modifier la sélection
                  if (draggedElements || draggedElement) {
                    return;
                  }
                  
                  // Vérifier si l'élément est déjà dans une sélection multiple
                  // Si c'est le cas, ne rien faire (le déplacement est géré par onMouseDown)
                  setSelectedElements(prev => {
                    // Si l'élément est déjà dans la sélection et qu'il y a plusieurs éléments, ne rien changer
                    // Cela signifie qu'on vient de cliquer sur un élément déjà sélectionné pour le déplacer
                    if (prev.length > 1 && prev.some(el => el.id === id)) {
                      return prev; // Garder la sélection multiple
                    }
                    // Sinon, sélectionner uniquement cet élément
                    return [element];
                  });
                  setSelectedTool('select');
                }
              }}
              onElementMouseDown={handleElementMouseDown}
              onElementTouchStart={handleElementTouchStart}
              onElementContextMenu={handleElementContextMenu}
            />
            
            {/* Handles de redimensionnement pour les éléments sélectionnés (seulement le premier) */}
            {selectedElements.length === 1 && (selectedElements[0].type === 'rectangle' || 
                                selectedElements[0].type === 'circle' || 
                                selectedElements[0].type === 'line' || 
                                selectedElements[0].type === 'arrow') && (
              <g transform={`translate(${fieldOffsets.offsetX}, ${fieldOffsets.offsetY})`}>
                {(() => {
                  // Pendant le redimensionnement ou le déplacement, utiliser l'élément actuel depuis elements
                  const currentElement = (resizingHandle || draggedElement)
                    ? elements.find(el => el.id === (resizingHandle?.id || draggedElement?.id)) || selectedElements[0]
                    : selectedElements[0];
                  
                  return (
                    <>
                      <ResizeHandles
                        element={currentElement}
                        scale={scale}
                        onHandleMouseDown={handleResizeHandleMouseDown}
                      />
                      <DimensionLabels
                        element={currentElement}
                        scale={scale}
                      />
                    </>
                  );
                })()}
              </g>
            )}
            
            {/* Zone de sélection */}
            {isSelecting && selectionBox && (
              <g transform={`translate(${fieldOffsets.offsetX}, ${fieldOffsets.offsetY})`}>
                <rect
                  x={Math.min(selectionBox.start.x, selectionBox.end.x) * scale}
                  y={Math.min(selectionBox.start.y, selectionBox.end.y) * scale}
                  width={Math.abs(selectionBox.end.x - selectionBox.start.x) * scale}
                  height={Math.abs(selectionBox.end.y - selectionBox.start.y) * scale}
                  fill="rgba(59, 130, 246, 0.1)"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  strokeDasharray="5,5"
                  pointerEvents="none"
                />
              </g>
            )}
            
            {/* Aperçu du dessin en cours */}
            {isDrawing && drawStart && drawCurrent && (
              <g opacity={0.5}>
                {(() => {
                  const preview = createElement(selectedTool, drawStart, drawCurrent, isShiftPressed);
                  if (!preview) return null;
                  return (
                    <>
                      <SchematicElements
                        elements={[preview]}
                        scale={scale}
                        svgWidth={1000}
                        svgHeight={600}
                        fieldType={fieldType}
                      />
                      <g transform={`translate(${fieldOffsets.offsetX}, ${fieldOffsets.offsetY})`}>
                        <DimensionLabels
                          element={preview}
                          scale={scale}
                        />
                      </g>
                    </>
                  );
                })()}
              </g>
            )}
          </svg>
        </div>
      </div>

      <ContextMenu
        menu={contextMenu}
        onClose={handleCloseContextMenu}
        onCopy={handleCopy}
        onDelete={handleDelete}
        onDrawLine={handleDrawLine}
        onDrawArrow={handleDrawArrow}
        onRotate90={handleRotate90}
        canRotate={(() => {
          if (!contextMenu.elementId) return false;
          const element = elements.find(e => e.id === contextMenu.elementId);
          if (!element) return false;
          // Les buts, rectangles peuvent être tournés
          return element.type === 'goal' || 
                 element.type === 'rectangle' || 
                 element.type === 'cone' ||
                 element.type === 'ladder';
        })()}
        onToggleLock={handleToggleLock}
        isLocked={(() => {
          if (!contextMenu.elementId) return false;
          const element = elements.find(e => e.id === contextMenu.elementId);
          return element?.isLocked || false;
        })()}
      />
    </div>
  );
}

export default function SchematicsPage() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center">Chargement...</div>}>
      <SchematicsPageContent />
    </Suspense>
  );
}

