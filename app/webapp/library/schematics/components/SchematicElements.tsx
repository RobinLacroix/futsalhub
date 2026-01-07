'use client';

import type { SchematicElement, Position, PlayerElement } from '@/types/schematics';

interface SchematicElementsProps {
  elements: SchematicElement[];
  scale: number;
  svgWidth?: number;
  svgHeight?: number;
  selectedElementIds?: string[];
  onElementClick?: (elementId: string) => void;
  onElementMouseDown?: (elementId: string, e: React.MouseEvent) => void;
  onElementContextMenu?: (elementId: string, position: Position) => void;
}

// Terrain de futsal : 40m (longueur horizontale) x 20m (largeur verticale)
// Format paysage : 40m de gauche à droite, 20m de haut en bas
const FIELD_LENGTH_M = 40; // Longueur (horizontale, gauche-droite)
const FIELD_WIDTH_M = 20;  // Largeur (verticale, haut-bas)

export function SchematicElements({ 
  elements, 
  scale,
  svgWidth = 1000,
  svgHeight = 600,
  selectedElementIds = [],
  onElementClick,
  onElementMouseDown,
  onElementContextMenu 
}: SchematicElementsProps) {
  // Calculer l'offset pour centrer le terrain (identique à Field)
  const fieldLength = FIELD_LENGTH_M * scale; // 40m horizontal (gauche-droite)
  const fieldWidth = FIELD_WIDTH_M * scale;   // 20m vertical (haut-bas)
  const offsetX = (svgWidth - fieldLength) / 2;
  const offsetY = (svgHeight - fieldWidth) / 2;
  const getStrokeDashArray = (style: string) => {
    switch (style) {
      case 'dashed':
        return '5,5';
      case 'dotted':
        return '2,2';
      default:
        return 'none';
    }
  };

  const handleContextMenu = (e: React.MouseEvent, elementId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (onElementContextMenu) {
      onElementContextMenu(elementId, { x: e.clientX, y: e.clientY });
    }
  };

  // Séparer les éléments en deux groupes : formes (zones, lignes) et éléments ponctuels
  const shapeElements = elements.filter(element => 
    element.type === 'rectangle' || 
    element.type === 'circle' || 
    element.type === 'triangle' || 
    element.type === 'line' || 
    element.type === 'arrow'
  );
  
  const pointElements = elements.filter(element => 
    element.type === 'player' || 
    element.type === 'ball' || 
    element.type === 'goal' || 
    element.type === 'cone' || 
    element.type === 'ladder'
  );

  const renderHighlight = (element: SchematicElement) => {
    if (!selectedElementIds.includes(element.id)) return null;
    
    const highlightPadding = 0.3; // 30cm de padding en mètres
    const highlightScale = scale;
    
    switch (element.type) {
      case 'rectangle': {
        const zone = element as any;
        const rectCenterX = (zone.x + zone.width / 2) * highlightScale;
        const rectCenterY = (zone.y + zone.height / 2) * highlightScale;
        return (
          <g transform={`translate(${rectCenterX}, ${rectCenterY}) rotate(${zone.rotation || 0}) translate(${-rectCenterX}, ${-rectCenterY})`}>
            <rect
              x={(zone.x - highlightPadding) * highlightScale}
              y={(zone.y - highlightPadding) * highlightScale}
              width={(zone.width + highlightPadding * 2) * highlightScale}
              height={(zone.height + highlightPadding * 2) * highlightScale}
              fill="rgba(255, 235, 59, 0.3)"
              stroke="#FFC107"
              strokeWidth={3}
              strokeDasharray="5,5"
              pointerEvents="none"
            />
          </g>
        );
      }
      
      case 'circle': {
        const zone = element as any;
        const centerX = (zone.x + zone.width / 2) * highlightScale;
        const centerY = (zone.y + zone.height / 2) * highlightScale;
        const radius = (zone.width / 2 + highlightPadding) * highlightScale;
        return (
          <g>
            <circle
              cx={centerX}
              cy={centerY}
              r={radius}
              fill="rgba(255, 235, 59, 0.3)"
              stroke="#FFC107"
              strokeWidth={3}
              strokeDasharray="5,5"
              pointerEvents="none"
            />
          </g>
        );
      }
      
      case 'triangle': {
        const zone = element as any;
        const points = zone.points || [
          { x: zone.x, y: zone.y + zone.height },
          { x: zone.x + zone.width / 2, y: zone.y },
          { x: zone.x + zone.width, y: zone.y + zone.height }
        ];
        const triangleCenterX = (points[0].x + points[1].x + points[2].x) / 3 * highlightScale;
        const triangleCenterY = (points[0].y + points[1].y + points[2].y) / 3 * highlightScale;
        // Calculer les points avec padding
        const centerX = (points[0].x + points[1].x + points[2].x) / 3;
        const centerY = (points[0].y + points[1].y + points[2].y) / 3;
        const highlightedPoints = points.map(p => {
          const dx = p.x - centerX;
          const dy = p.y - centerY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const newDist = dist + highlightPadding;
          const angle = Math.atan2(dy, dx);
          return {
            x: (centerX + newDist * Math.cos(angle)) * highlightScale,
            y: (centerY + newDist * Math.sin(angle)) * highlightScale
          };
        });
        return (
          <g transform={`translate(${triangleCenterX}, ${triangleCenterY}) rotate(${zone.rotation || 0}) translate(${-triangleCenterX}, ${-triangleCenterY})`}>
            <polygon
              points={highlightedPoints.map(p => `${p.x},${p.y}`).join(' ')}
              fill="rgba(255, 235, 59, 0.3)"
              stroke="#FFC107"
              strokeWidth={3}
              strokeDasharray="5,5"
              pointerEvents="none"
            />
          </g>
        );
      }
      
      case 'line':
      case 'arrow': {
        const line = element as any;
        if (line.isCurved && line.controlPoint) {
          // Pour une ligne courbe, créer un rectangle englobant tous les points
          const allX = [line.x, line.endX, line.controlPoint.x];
          const allY = [line.y, line.endY, line.controlPoint.y];
          const minX = Math.min(...allX) - highlightPadding;
          const maxX = Math.max(...allX) + highlightPadding;
          const minY = Math.min(...allY) - highlightPadding;
          const maxY = Math.max(...allY) + highlightPadding;
          return (
            <g>
              <rect
                x={minX * highlightScale}
                y={minY * highlightScale}
                width={(maxX - minX) * highlightScale}
                height={(maxY - minY) * highlightScale}
                fill="rgba(255, 235, 59, 0.3)"
                stroke="#FFC107"
                strokeWidth={3}
                strokeDasharray="5,5"
                pointerEvents="none"
              />
            </g>
          );
        } else {
          const minX = Math.min(line.x, line.endX) - highlightPadding;
          const maxX = Math.max(line.x, line.endX) + highlightPadding;
          const minY = Math.min(line.y, line.endY) - highlightPadding;
          const maxY = Math.max(line.y, line.endY) + highlightPadding;
          return (
            <g>
              <rect
                x={minX * highlightScale}
                y={minY * highlightScale}
                width={(maxX - minX) * highlightScale}
                height={(maxY - minY) * highlightScale}
                fill="rgba(255, 235, 59, 0.3)"
                stroke="#FFC107"
                strokeWidth={3}
                strokeDasharray="5,5"
                pointerEvents="none"
              />
            </g>
          );
        }
      }
      
      case 'player':
      case 'ball': {
        const radius = (element.size / 2 + highlightPadding) * highlightScale;
        return (
          <g>
            <circle
              cx={element.x * highlightScale}
              cy={element.y * highlightScale}
              r={radius}
              fill="rgba(255, 235, 59, 0.3)"
              stroke="#FFC107"
              strokeWidth={3}
              strokeDasharray="5,5"
              pointerEvents="none"
            />
          </g>
        );
      }
      
      case 'goal':
      case 'cone':
      case 'ladder': {
        const size = element.size * highlightScale;
        const padding = highlightPadding * highlightScale;
        return (
          <g transform={`translate(${element.x * highlightScale}, ${element.y * highlightScale}) rotate(${element.rotation || 0})`}>
            <rect
              x={-size / 2 - padding}
              y={-size / 2 - padding}
              width={size + padding * 2}
              height={size + padding * 2}
              fill="rgba(255, 235, 59, 0.3)"
              stroke="#FFC107"
              strokeWidth={3}
              strokeDasharray="5,5"
              pointerEvents="none"
            />
          </g>
        );
      }
      
      default:
        return null;
    }
  };

  const renderElement = (element: SchematicElement) => {
        const elementGroupKey = `element-${element.id}`;
        const isSelected = selectedElementIds.includes(element.id);
        const commonProps = {
          stroke: element.color,
          strokeWidth: element.strokeWidth,
          strokeDasharray: getStrokeDashArray(element.strokeStyle),
          fill: element.fillColor || 'none',
          fillOpacity: element.fillOpacity || 0,
          style: { cursor: 'pointer' },
          onClick: (e: React.MouseEvent) => {
            e.stopPropagation();
            onElementClick?.(element.id);
          },
          onMouseDown: (e: React.MouseEvent) => {
            e.stopPropagation();
            onElementMouseDown?.(element.id, e);
          },
          onContextMenu: (e: React.MouseEvent) => handleContextMenu(e, element.id)
        };

        switch (element.type) {
          case 'rectangle':
            const rectCenterX = (element.x + element.width / 2) * scale;
            const rectCenterY = (element.y + element.height / 2) * scale;
            return (
              <g key={element.id} data-element={element.id} transform={`translate(${rectCenterX}, ${rectCenterY}) rotate(${element.rotation || 0}) translate(${-rectCenterX}, ${-rectCenterY})`}>
                <rect
                  x={element.x * scale}
                  y={element.y * scale}
                  width={element.width * scale}
                  height={element.height * scale}
                  {...commonProps}
                />
              </g>
            );

          case 'circle':
            // Les cercles n'ont pas besoin de rotation car ils sont symétriques
            return (
              <g key={element.id} data-element={element.id}>
                {renderHighlight(element)}
                <circle
                  cx={(element.x + element.width / 2) * scale}
                  cy={(element.y + element.height / 2) * scale}
                  r={(element.width / 2) * scale}
                  {...commonProps}
                />
              </g>
            );

          case 'triangle':
            const trianglePoints = element.points || [
              { x: element.x, y: element.y + element.height },
              { x: element.x + element.width / 2, y: element.y },
              { x: element.x + element.width, y: element.y + element.height }
            ];
            // Calculer le centre du triangle pour la rotation
            const triangleCenterX = (trianglePoints[0].x + trianglePoints[1].x + trianglePoints[2].x) / 3 * scale;
            const triangleCenterY = (trianglePoints[0].y + trianglePoints[1].y + trianglePoints[2].y) / 3 * scale;
            return (
              <g 
                key={element.id} 
                data-element={element.id} 
                transform={`translate(${triangleCenterX}, ${triangleCenterY}) rotate(${element.rotation || 0}) translate(${-triangleCenterX}, ${-triangleCenterY})`}
              >
                {renderHighlight(element)}
                <polygon
                  points={trianglePoints.map(p => `${p.x * scale},${p.y * scale}`).join(' ')}
                  fill={element.fillColor || 'none'}
                  fillOpacity={element.fillOpacity || 0}
                  stroke={element.color}
                  strokeWidth={element.strokeWidth}
                  strokeDasharray={getStrokeDashArray(element.strokeStyle)}
                  style={{ cursor: 'pointer' }}
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    onElementClick?.(element.id);
                  }}
                  onMouseDown={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onElementMouseDown?.(element.id, e);
                  }}
                  onContextMenu={(e: React.MouseEvent) => handleContextMenu(e, element.id)}
                  pointerEvents="all"
                />
              </g>
            );

          case 'line':
          case 'arrow':
            if (element.type === 'line' || element.type === 'arrow') {
              if (element.isCurved && element.controlPoint) {
                // Ligne courbe (quadratique)
                // Calculer l'angle à la fin pour la flèche
                const dx = element.endX - element.controlPoint.x;
                const dy = element.endY - element.controlPoint.y;
                const angle = Math.atan2(dy, dx);
                return (
                  <g key={element.id} data-element={element.id}>
                    {/* Hit-area invisible et épaisse pour faciliter la sélection */}
                    <path
                      d={`M ${element.x * scale} ${element.y * scale} Q ${element.controlPoint.x * scale} ${element.controlPoint.y * scale} ${element.endX * scale} ${element.endY * scale}`}
                      stroke="rgba(0,0,0,0)"
                      strokeWidth={Math.max(10, (element.strokeWidth || 2) * 2)}
                      fill="none"
                      pointerEvents="stroke"
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        onElementClick?.(element.id);
                      }}
                      onMouseDown={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        onElementMouseDown?.(element.id, e);
                      }}
                      onContextMenu={(e: React.MouseEvent) => handleContextMenu(e, element.id)}
                    />
                    {renderHighlight(element)}
                    <path
                      d={`M ${element.x * scale} ${element.y * scale} Q ${element.controlPoint.x * scale} ${element.controlPoint.y * scale} ${element.endX * scale} ${element.endY * scale}`}
                      {...commonProps}
                    />
                    {element.type === 'arrow' && (
                      <Arrowhead
                        x={element.endX * scale}
                        y={element.endY * scale}
                        angle={angle}
                        color={element.color}
                      />
                    )}
                  </g>
                );
              } else {
                // Ligne droite
                const angle = Math.atan2(
                  element.endY - element.y,
                  element.endX - element.x
                );
                return (
                  <g key={element.id} data-element={element.id}>
                    {/* Hit-area invisible et épaisse pour faciliter la sélection */}
                    <line
                      x1={element.x * scale}
                      y1={element.y * scale}
                      x2={element.endX * scale}
                      y2={element.endY * scale}
                      stroke="rgba(0,0,0,0)"
                      strokeWidth={Math.max(10, (element.strokeWidth || 2) * 2)}
                      pointerEvents="stroke"
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        onElementClick?.(element.id);
                      }}
                      onMouseDown={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        onElementMouseDown?.(element.id, e);
                      }}
                      onContextMenu={(e: React.MouseEvent) => handleContextMenu(e, element.id)}
                    />
                    {renderHighlight(element)}
                    <line
                      x1={element.x * scale}
                      y1={element.y * scale}
                      x2={element.endX * scale}
                      y2={element.endY * scale}
                      {...commonProps}
                    />
                    {element.type === 'arrow' && (
                      <Arrowhead
                        x={element.endX * scale}
                        y={element.endY * scale}
                        angle={angle}
                        color={element.color}
                      />
                    )}
                  </g>
                );
              }
            }
            return null;

          case 'player':
            // La taille est en mètres, donc on multiplie par scale pour obtenir les pixels
            const playerRadius = element.size * scale;
            const playerElement = element as PlayerElement;
            return (
              <g key={element.id} data-element={element.id}>
                {renderHighlight(element)}
                <circle
                  cx={element.x * scale}
                  cy={element.y * scale}
                  r={playerRadius}
                  fill={element.fillColor || element.color}
                  stroke="none"
                  strokeWidth={0}
                  style={{ cursor: 'pointer' }}
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    onElementClick?.(element.id);
                  }}
                  onMouseDown={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    onElementMouseDown?.(element.id, e);
                  }}
                  onContextMenu={(e: React.MouseEvent) => handleContextMenu(e, element.id)}
                />
                <text
                  x={element.x * scale}
                  y={element.y * scale}
                  fill={playerElement.textColor || '#ffffff'}
                  fontSize={Math.max(8, playerRadius * 0.8)}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontWeight="bold"
                  pointerEvents="none"
                >
                  {element.number}
                </text>
              </g>
            );

          case 'ball':
            // La taille est en mètres (diamètre)
            const ballSize = element.size * scale;
            const ballX = element.x * scale;
            const ballY = element.y * scale;
            const ballRadius = ballSize / 2;
            return (
              <g 
                key={element.id} 
                data-element={element.id}
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  onElementClick?.(element.id);
                }}
                onMouseDown={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  onElementMouseDown?.(element.id, e);
                }}
                onContextMenu={(e: React.MouseEvent) => handleContextMenu(e, element.id)}
              >
                {renderHighlight(element)}
                {/* Cercle invisible pour la détection de clic */}
                <circle
                  cx={ballX}
                  cy={ballY}
                  r={ballRadius}
                  fill="transparent"
                  stroke="none"
                  pointerEvents="all"
                />
                {/* Icône SVG standardisée de ballon de football */}
                <g
                  transform={`translate(${ballX - ballRadius}, ${ballY - ballRadius})`}
                  pointerEvents="none"
                >
                  <svg
                    width={ballSize}
                    height={ballSize}
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    {/* Ballon de football - motif standardisé (pattern classique) */}
                    <circle cx="12" cy="12" r="11" fill="#ffffff" stroke="#000000" strokeWidth="1"/>
                    {/* Lignes principales du ballon */}
                    <path d="M 12 1 L 12 23 M 1 12 L 23 12" stroke="#000000" strokeWidth="1.2"/>
                    {/* Motif hexagonal/pentagonal stylisé */}
                    <path d="M 6.5 4 L 17.5 4 L 20 7.5 L 17.5 12 L 6.5 12 L 4 7.5 Z" fill="#000000" opacity="0.4"/>
                    <path d="M 6.5 20 L 17.5 20 L 20 16.5 L 17.5 12 L 6.5 12 L 4 16.5 Z" fill="#000000" opacity="0.4"/>
                    <path d="M 4 16.5 L 6.5 12 L 4 7.5 L 1 12 Z" fill="#000000" opacity="0.4"/>
                    <path d="M 20 16.5 L 17.5 12 L 20 7.5 L 23 12 Z" fill="#000000" opacity="0.4"/>
                    <path d="M 12 1 L 6.5 4 L 4 7.5 L 6.5 12 L 12 12 Z" fill="#000000" opacity="0.25"/>
                    <path d="M 12 23 L 6.5 20 L 4 16.5 L 6.5 12 L 12 12 Z" fill="#000000" opacity="0.25"/>
                    <path d="M 12 1 L 17.5 4 L 20 7.5 L 17.5 12 L 12 12 Z" fill="#000000" opacity="0.25"/>
                    <path d="M 12 23 L 17.5 20 L 20 16.5 L 17.5 12 L 12 12 Z" fill="#000000" opacity="0.25"/>
                  </svg>
                </g>
              </g>
            );

          case 'goal':
            // La taille est en mètres (largeur du but)
            // Largeur: 0.5m à 3m, Hauteur: max 1m
            const goalWidth = element.size * scale;
            const goalHeight = Math.min(goalWidth * 0.6, 1 * scale); // Max 1m de hauteur
            const goalId = `goal-${element.id}`;
            return (
              <g key={element.id} data-element={element.id}>
                {renderHighlight(element)}
                {/* Définir le pattern de filet */}
                <defs>
                  <pattern
                    id={`netPattern-${goalId}`}
                    x="0"
                    y="0"
                    width={goalWidth * 0.1}
                    height={goalHeight * 0.1}
                    patternUnits="userSpaceOnUse"
                  >
                    {/* Lignes horizontales du filet */}
                    <line
                      x1="0"
                      y1="0"
                      x2={goalWidth * 0.1}
                      y2="0"
                      stroke={element.color}
                      strokeWidth={Math.max(0.5, element.strokeWidth * 0.3)}
                      opacity="0.6"
                    />
                    {/* Lignes verticales du filet */}
                    <line
                      x1="0"
                      y1="0"
                      x2="0"
                      y2={goalHeight * 0.1}
                      stroke={element.color}
                      strokeWidth={Math.max(0.5, element.strokeWidth * 0.3)}
                      opacity="0.6"
                    />
                  </pattern>
                </defs>
                <g transform={`translate(${element.x * scale}, ${element.y * scale}) rotate(${element.rotation || 0})`}>
                  {/* Rectangle avec texture de filet */}
                  <rect
                    x={-goalWidth * 0.5}
                    y={-goalHeight * 0.5}
                    width={goalWidth}
                    height={goalHeight}
                    fill={`url(#netPattern-${goalId})`}
                    stroke={element.color}
                    strokeWidth={element.strokeWidth}
                    strokeDasharray={getStrokeDashArray(element.strokeStyle)}
                    style={{ cursor: 'pointer' }}
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      onElementClick?.(element.id);
                    }}
                    onMouseDown={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      onElementMouseDown?.(element.id, e);
                    }}
                    onContextMenu={(e: React.MouseEvent) => handleContextMenu(e, element.id)}
                  />
                </g>
              </g>
            );

          case 'cone':
            // La taille est en mètres (hauteur de la coupelle)
            const coneHeight = element.size * scale;
            const coneWidth = coneHeight * 0.6;
            return (
              <g key={element.id} data-element={element.id} transform={`translate(${element.x * scale}, ${element.y * scale}) rotate(${element.rotation || 0})`}>
                {renderHighlight(element)}
                <polygon
                  points={[
                    `0,${-coneHeight * 0.5}`,
                    `${-coneWidth * 0.5},${coneHeight * 0.5}`,
                    `${coneWidth * 0.5},${coneHeight * 0.5}`
                  ].join(' ')}
                  fill={element.fillColor || element.color}
                  stroke={element.color}
                  strokeWidth={Math.max(1, element.strokeWidth * (scale / 10))}
                  fillOpacity={element.fillOpacity || 1}
                  {...commonProps}
                />
              </g>
            );

          case 'ladder':
            // La taille est en mètres (longueur de l'échelle)
            const ladderLength = element.size * scale;
            const ladderWidth = ladderLength * 0.4;
            return (
              <g key={element.id} data-element={element.id} transform={`translate(${element.x * scale}, ${element.y * scale}) rotate(${element.rotation || 0})`}>
                {renderHighlight(element)}
                <rect
                  x={-ladderLength * 0.5}
                  y={-ladderWidth * 0.5}
                  width={ladderLength}
                  height={ladderWidth}
                  fill="none"
                  stroke={element.color}
                  strokeWidth={element.strokeWidth}
                  strokeDasharray={getStrokeDashArray(element.strokeStyle)}
                  {...commonProps}
                />
                {Array.from({ length: 5 }, (_, i) => (
                  <line
                    key={i}
                    x1={-ladderLength * 0.5}
                    y1={-ladderWidth * 0.5 + (ladderWidth / 5) * i}
                    x2={ladderLength * 0.5}
                    y2={-ladderWidth * 0.5 + (ladderWidth / 5) * i}
                    stroke={element.color}
                    strokeWidth={Math.max(1, element.strokeWidth * 0.5 * (scale / 10))}
                    strokeDasharray={getStrokeDashArray(element.strokeStyle)}
                  />
                ))}
              </g>
            );

          default:
            return null;
        }
  };

  return (
    <g transform={`translate(${offsetX}, ${offsetY})`}>
      {/* D'abord les formes (zones, lignes, flèches) */}
      {shapeElements.map(element => renderElement(element))}
      {/* Ensuite les éléments ponctuels (joueurs, ballons, matériel) */}
      {pointElements.map(element => renderElement(element))}
    </g>
  );
}

function Arrowhead({ x, y, angle, color }: { x: number; y: number; angle: number; color: string }) {
  const size = 8;
  const arrowPoints = [
    { x: x, y: y },
    { x: x - size * Math.cos(angle - Math.PI / 6), y: y - size * Math.sin(angle - Math.PI / 6) },
    { x: x - size * Math.cos(angle + Math.PI / 6), y: y - size * Math.sin(angle + Math.PI / 6) }
  ];

  return (
    <polygon
      points={arrowPoints.map(p => `${p.x},${p.y}`).join(' ')}
      fill={color}
    />
  );
}

