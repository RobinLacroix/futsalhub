'use client';

interface FieldProps {
  width: number;
  height: number;
  scale: number;
}

// Terrain de futsal : 40m (longueur horizontale) x 20m (largeur verticale)
// Format paysage : 40m de gauche à droite, 20m de haut en bas
const FIELD_LENGTH_M = 40; // Longueur (horizontale, gauche-droite)
const FIELD_WIDTH_M = 20;  // Largeur (verticale, haut-bas)

export function Field({ width, height, scale }: FieldProps) {
  // Dimensions en pixels (format paysage : longueur horizontale, largeur verticale)
  const fieldLength = FIELD_LENGTH_M * scale; // 40m horizontal (gauche-droite)
  const fieldWidth = FIELD_WIDTH_M * scale;   // 20m vertical (haut-bas)
  
  // Centrer le terrain
  const offsetX = (width - fieldLength) / 2;
  const offsetY = (height - fieldWidth) / 2;

  // Dimensions selon les spécifications FIFA
  const lineWidth = 0.08 * scale; // Épaisseur des lignes : 0.08m
  const penaltyRadius = 6 * scale; // Rayon zone de réparation : 6m
  const centerCircleRadius = 3 * scale; // Rayon cercle central : 3m
  const cornerArcRadius = 0.25 * scale; // Rayon arc de coin : 0.25m
  const goalWidth = 3 * scale; // Largeur but : 3m
  const goalHeight = 1 * scale; // Hauteur but : 2m
  const penaltyMark1 = 6 * scale; // Premier point de réparation : 6m
  const penaltyMark2 = 10 * scale; // Deuxième point de réparation : 10m
  const substitutionZoneLength = 5 * scale; // Zone de remplacement : 5m
  const substitutionZoneWidth = 0.75 * scale; // Largeur zone de remplacement : 0.75m
  const goalkeeperLineDistance = 5 * scale; // Distance ligne gardien : 5m du but
  const goalkeeperLineWidth = 0.08 * scale; // Largeur ligne gardien : 0,08m

  return (
    <g transform={`translate(${offsetX}, ${offsetY})`}>
      {/* Fond du terrain */}
      <rect
        x={0}
        y={0}
        width={fieldLength}
        height={fieldWidth}
        fill="#f4d5b8"
        stroke="#000000"
        strokeWidth={3}
      />

      {/* Lignes du terrain - périmètre */}
      <rect
        x={0}
        y={0}
        width={fieldLength}
        height={fieldWidth}
        fill="none"
        stroke="#ffffff"
        strokeWidth={lineWidth}
      />

      {/* Ligne médiane (verticale) */}
      <line
        x1={fieldLength / 2}
        y1={0}
        x2={fieldLength / 2}
        y2={fieldWidth}
        stroke="#ffffff"
        strokeWidth={lineWidth}
      />

      {/* Cercle central (rayon 3m) */}
      <circle
        cx={fieldLength / 2}
        cy={fieldWidth / 2}
        r={centerCircleRadius}
        fill="none"
        stroke="#ffffff"
        strokeWidth={lineWidth}
      />

      {/* Point central */}
      <circle
        cx={fieldLength / 2}
        cy={fieldWidth / 2}
        r={3}
        fill="#ffffff"
      />

      {/* Zones de réparation */}
      {(() => {
        // Poteaux du but (en Y, verticalement car buts à gauche et droite)
        const goalTopPostY = fieldWidth / 2 - goalWidth / 2;
        const goalBottomPostY = fieldWidth / 2 + goalWidth / 2;
        
        return (
          <>
            {/* Zone de réparation gauche (noire) - forme unie */}
            <path
              d={`M 0 ${goalTopPostY} 
                  L 0 ${goalTopPostY - penaltyRadius} 
                  A ${penaltyRadius} ${penaltyRadius} 0 0 1 ${penaltyRadius} ${goalTopPostY} 
                  L ${penaltyRadius} ${goalBottomPostY} 
                  A ${penaltyRadius} ${penaltyRadius} 0 0 1 0 ${goalBottomPostY + penaltyRadius} 
                  L 0 ${goalTopPostY} Z`}
              fill="#000000"
              stroke="#ffffff"
              strokeWidth={lineWidth}
            />
            
            {/* Ligne verticale blanche dans la zone de réparation gauche (limite gardien à 5m) */}
            <rect
              x={goalkeeperLineDistance - goalkeeperLineWidth / 2}
              y={fieldWidth / 2 - (goalkeeperLineWidth * 5) / 2}
              width={goalkeeperLineWidth}
              height={goalkeeperLineWidth * 5}
              fill="#ffffff"
            />

            {/* Zone de réparation droite (noire) - forme unie */}
            <path
              d={`M ${fieldLength} ${goalTopPostY} 
                  L ${fieldLength} ${goalTopPostY - penaltyRadius} 
                  A ${penaltyRadius} ${penaltyRadius} 0 0 0 ${fieldLength - penaltyRadius} ${goalTopPostY} 
                  L ${fieldLength - penaltyRadius} ${goalBottomPostY} 
                  A ${penaltyRadius} ${penaltyRadius} 0 0 0 ${fieldLength} ${goalBottomPostY + penaltyRadius} 
                  L ${fieldLength} ${goalTopPostY} Z`}
              fill="#000000"
              stroke="#ffffff"
              strokeWidth={lineWidth}
            />
            
            {/* Ligne verticale blanche dans la zone de réparation droite (limite gardien à 5m) */}
            <rect
              x={fieldLength - goalkeeperLineDistance - goalkeeperLineWidth / 2}
              y={fieldWidth / 2 - (goalkeeperLineWidth * 5) / 2}
              width={goalkeeperLineWidth}
              height={goalkeeperLineWidth * 5}
              fill="#ffffff"
            />
          </>
        );
      })()}

      {/* Points de réparation */}
      {/* Premier point (6m) - gauche */}
      <circle cx={penaltyMark1} cy={fieldWidth / 2} r={2} fill="#ffffff" />
      {/* Premier point (6m) - droite */}
      <circle cx={fieldLength - penaltyMark1} cy={fieldWidth / 2} r={2} fill="#ffffff" />
      
      {/* Deuxième point (10m) - gauche */}
      <circle cx={penaltyMark2} cy={fieldWidth / 2} r={2} fill="#ffffff" />
      {/* Deuxième point (10m) - droite */}
      <circle cx={fieldLength - penaltyMark2} cy={fieldWidth / 2} r={2} fill="#ffffff" />
      
      {/* Points latéraux (5m de chaque côté du deuxième point) - gauche */}
      <circle cx={penaltyMark2} cy={fieldWidth / 2 - 5 * scale} r={2} fill="#ffffff" />
      <circle cx={penaltyMark2} cy={fieldWidth / 2 + 5 * scale} r={2} fill="#ffffff" />
      {/* Points latéraux (5m de chaque côté du deuxième point) - droite */}
      <circle cx={fieldLength - penaltyMark2} cy={fieldWidth / 2 - 5 * scale} r={2} fill="#ffffff" />
      <circle cx={fieldLength - penaltyMark2} cy={fieldWidth / 2 + 5 * scale} r={2} fill="#ffffff" />

      {/* Arcs de coin (rayon 0.25m) */}
      {/* Coin haut gauche */}
      <path
        d={`M ${cornerArcRadius} 0 A ${cornerArcRadius} ${cornerArcRadius} 0 0 1 0 ${cornerArcRadius}`}
        fill="none"
        stroke="#ffffff"
        strokeWidth={lineWidth}
      />
      {/* Coin haut droit */}
      <path
        d={`M ${fieldLength - cornerArcRadius} 0 A ${cornerArcRadius} ${cornerArcRadius} 0 0 0 ${fieldLength} ${cornerArcRadius}`}
        fill="none"
        stroke="#ffffff"
        strokeWidth={lineWidth}
      />
      {/* Coin bas gauche */}
      <path
        d={`M ${cornerArcRadius} ${fieldWidth} A ${cornerArcRadius} ${cornerArcRadius} 0 0 0 0 ${fieldWidth - cornerArcRadius}`}
        fill="none"
        stroke="#ffffff"
        strokeWidth={lineWidth}
      />
      {/* Coin bas droit */}
      <path
        d={`M ${fieldLength - cornerArcRadius} ${fieldWidth} A ${cornerArcRadius} ${cornerArcRadius} 0 0 1 ${fieldLength} ${fieldWidth - cornerArcRadius}`}
        fill="none"
        stroke="#ffffff"
        strokeWidth={lineWidth}
      />

      {/* Buts (3m x 2m) */}
      {/* But gauche */}
      <g>
        <defs>
          <pattern id="goalPatternLeft" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
            <rect width="8" height="8" fill="#ffffff" />
            <path d="M 0 0 L 8 8 M -2 2 L 2 -2 M 6 10 L 10 6" stroke="#3b82f6" strokeWidth="1" />
          </pattern>
        </defs>
        <rect
          x={-goalHeight}
          y={fieldWidth / 2 - goalWidth / 2}
          width={goalHeight}
          height={goalWidth}
          fill="url(#goalPatternLeft)"
          stroke="#000000"
          strokeWidth={1}
        />
      </g>
      
      {/* But droite */}
      <g>
        <defs>
          <pattern id="goalPatternRight" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
            <rect width="8" height="8" fill="#ffffff" />
            <path d="M 0 0 L 8 8 M -2 2 L 2 -2 M 6 10 L 10 6" stroke="#3b82f6" strokeWidth="1" />
          </pattern>
        </defs>
        <rect
          x={fieldLength}
          y={fieldWidth / 2 - goalWidth / 2}
          width={goalHeight}
          height={goalWidth}
          fill="url(#goalPatternRight)"
          stroke="#000000"
          strokeWidth={1}
        />
      </g>


      {/* Grille de distance (optionnelle, peut être activée/désactivée) */}
      {/* Lignes verticales tous les 5m */}
      {Array.from({ length: 8 }, (_, i) => i + 1).map(i => (
        <g key={`v-${i}`} opacity={0.1}>
          <line
            x1={(fieldLength / 8) * i}
            y1={0}
            x2={(fieldLength / 8) * i}
            y2={fieldWidth}
            stroke="#ffffff"
            strokeWidth={1}
          />
          <text
            x={(fieldLength / 8) * i}
            y={fieldWidth + 15}
            fill="#666"
            fontSize={10}
            textAnchor="middle"
          >
            {i * 5}m
          </text>
        </g>
      ))}

      {/* Lignes horizontales tous les 5m */}
      {Array.from({ length: 4 }, (_, i) => i + 1).map(i => (
        <g key={`h-${i}`} opacity={0.1}>
          <line
            x1={0}
            y1={(fieldWidth / 4) * i}
            x2={fieldLength}
            y2={(fieldWidth / 4) * i}
            stroke="#ffffff"
            strokeWidth={1}
          />
          <text
            x={-15}
            y={(fieldWidth / 4) * i}
            fill="#666"
            fontSize={10}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {i * 5}m
          </text>
        </g>
      ))}
    </g>
  );
}

