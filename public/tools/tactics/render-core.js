/*
 * Moteur de rendu partagé d'un Drill (SVG).
 * Source de vérité unique du rendu : utilisé par l'éditeur (canvas interactif),
 * l'assembleur (miniatures) et l'export (frames GIF, PNG de fiche).
 *
 * Aucune dépendance. Les primitives prennent l'élément SVG cible en paramètre —
 * elles ne s'appuient sur aucune globale de module.
 *
 * Repère : origine coin bas-gauche, x = longueur, y = largeur, en mètres.
 */
window.DrillRender = (function () {
  "use strict";
  // M : marge (unites SVG) tout autour du terrain dans le viewBox. Doit rester
  // assez large pour qu'un joueur/ballon/but place "un peu en dehors" (touche,
  // corner) reste visible et ne soit pas rogne par le cadrage du canvas — voir
  // oobMargin() dans editor.js, qui calcule la marge en metres a partir de M.
  var NS = "http://www.w3.org/2000/svg", TARGET = 660, M = 38;
  var COL = { pitch: "#2f8f4e", line: "#eafff0", home: "#1e63d6", away: "#d63b2f", support: "#e0a021", ball: "#fff", cone: "#ff8c1a", sel: "#ffd21f", handle: "#fff" };
  var ZFILL = { corridor: "rgba(255,255,255,0.06)", area: "rgba(255,255,255,0.10)", target: "rgba(242,193,78,0.18)", neutral: "rgba(255,255,255,0.05)" };

  function round1(v) { return Math.round(v * 10) / 10; }
  function findById(arr, id) { for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i]; return null; }
  function el(tag, attrs) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  function clear(svg) { while (svg.firstChild) svg.removeChild(svg.firstChild); }

  // Catmull-Rom 1D (spline lissee passant par p1..p2, influencee par les voisins p0/p3).
  function catmullRom1D(p0, p1, p2, p3, u) {
    return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
  }
  // Bezier quadratique : p0/p2 = extremites (le trait les touche exactement),
  // c = point de controle qui "tire" la courbe sans que le trait passe par lui.
  function quadBezierPoint(p0, c, p1, u) {
    var mu = 1 - u;
    return { x: mu * mu * p0.x + 2 * mu * u * c.x + u * u * p1.x, y: mu * mu * p0.y + 2 * mu * u * c.y + u * u * p1.y };
  }
  // Chaine de bezier quadratiques a plusieurs points de courbure, construction
  // classique des polices (TrueType) : chaque point de courbure "tire" la
  // courbe localement sans jamais etre touche par elle (comme a un seul point),
  // et entre deux points de courbure consecutifs on insere un point milieu
  // implicite sur la courbe — la jonction entre les deux arcs y est lisse par
  // construction (meme tangente des deux cotes), sans aucun reglage de
  // magnitude/plafond a faire. Avec un seul point de courbure, ceci degenere
  // exactement vers la bezier a un point (meme comportement, garanti par
  // construction plutot que par un cas particulier code a part).
  function quadChainSegments(from, ctrls, to) {
    if (!ctrls || !ctrls.length) return [{ p0: from, c: null, p1: to }];
    var segs = [], onCurve = from;
    for (var i = 0; i < ctrls.length; i++) {
      var c = ctrls[i];
      var nextOn = (i < ctrls.length - 1) ? { x: (c.x + ctrls[i + 1].x) / 2, y: (c.y + ctrls[i + 1].y) / 2 } : to;
      segs.push({ p0: onCurve, c: c, p1: nextOn });
      onCurve = nextOn;
    }
    return segs;
  }
  function quadSegPoint(seg, u) {
    return seg.c ? quadBezierPoint(seg.p0, seg.c, seg.p1, u) : { x: seg.p0.x + (seg.p1.x - seg.p0.x) * u, y: seg.p0.y + (seg.p1.y - seg.p0.y) * u };
  }
  function quadChainPath(from, ctrls, to, stepsPerSeg) {
    var segs = quadChainSegments(from, ctrls, to), out = [segs[0].p0];
    segs.forEach(function (seg) {
      for (var s = 1; s <= stepsPerSeg; s++) out.push(quadSegPoint(seg, s / stepsPerSeg));
    });
    return out;
  }
  // Position a la fraction globale f (0..1) le long de la chaine : chaque
  // segment (entre deux points on-curve, reels ou implicites) recoit une part
  // de temps egale — meme convention que l'ancien montage multi-points.
  function quadChainPointAt(from, ctrls, to, f) {
    var segs = quadChainSegments(from, ctrls, to), n = segs.length, segF = f * n;
    var si = Math.max(0, Math.min(n - 1, Math.floor(segF))), u = segF - si;
    return quadSegPoint(segs[si], u);
  }
  // Position d'une entite dans une keyframe donnee (avec clamp aux bornes de la sequence).
  function entityAt(drill, id, kfIdx) {
    var kfs = drill.keyframes, i = Math.max(0, Math.min(kfs.length - 1, kfIdx));
    return findById(kfs[i].entities, id);
  }
  // Echantillonne la spline lissee d'une entite entre les keyframes seg et seg+1.
  function curvePoints(drill, id, seg, ea, eb, steps) {
    var p0 = entityAt(drill, id, seg - 1) || ea, p3 = entityAt(drill, id, seg + 2) || eb;
    var pts = [];
    for (var i = 0; i <= steps; i++) {
      var u = i / steps;
      pts.push({ x: catmullRom1D(p0.x, ea.x, eb.x, p3.x, u), y: catmullRom1D(p0.y, ea.y, eb.y, p3.y, u) });
    }
    return pts;
  }
  function geo(drill) {
    var p = drill.pitch, sc = TARGET / p.length;
    return { sc: sc, px: function (x) { return M + x * sc; }, py: function (y) { return M + (p.width - y) * sc; }, W: p.length * sc + M * 2, H: p.width * sc + M * 2 };
  }

  function penArea(drill, g, goalX, dir) {
    var R = 6, cy = drill.pitch.width / 2, N = 14, pts = [], i, a;
    for (i = 0; i <= N; i++) { a = (-90 + 90 * i / N) * Math.PI / 180; pts.push(g.px(goalX + dir * R * Math.cos(a)) + "," + g.py(cy - 1.5 + R * Math.sin(a))); }
    for (i = 0; i <= N; i++) { a = (90 * i / N) * Math.PI / 180; pts.push(g.px(goalX + dir * R * Math.cos(a)) + "," + g.py(cy + 1.5 + R * Math.sin(a))); }
    return pts.join(" ");
  }

  function textNode(x, y, str, size, fill, opts) {
    opts = opts || {};
    var t = el("text", { x: x, y: y, "font-size": size, "font-family": "Arial", fill: fill, "text-anchor": opts.anchor || "middle" });
    if (opts.opacity) t.setAttribute("opacity", opts.opacity);
    if (opts.bold) t.setAttribute("font-weight", "bold");
    // Lisere sombre peint SOUS le remplissage (paint-order) : un nom de joueur
    // doit rester lisible sur un parquet clair comme sur une pelouse foncee.
    if (opts.halo) {
      t.setAttribute("stroke", opts.halo);
      t.setAttribute("stroke-width", Math.max(2, size * 0.26));
      t.setAttribute("stroke-linejoin", "round");
      t.setAttribute("paint-order", "stroke");
    }
    t.style.pointerEvents = "none";
    t.textContent = str;
    return t;
  }

  // Flèches entre l'étape N et N+1 : mouvement ballon (passe/tir), course des
  // joueurs, conduite (joueur porteur qui se déplace avec le ballon).
  // Plusieurs ballons peuvent coexister (sources de balle) : chacun a sa
  // propre fleche (passe ou conduite avec son porteur), independamment des
  // autres — carriers associe chaque joueur porteur AU ballon qu'il porte
  // (et non plus "le" ballon, unique avant).
  function computeArrows(drill, N) {
    var out = [], A = drill.keyframes[N], B = drill.keyframes[N + 1];
    if (!B) return out;
    var MOVED = 0.3;
    var balls = A.entities.filter(function (e) { return e.type === "ball"; });
    var carriers = {};
    balls.forEach(function (b) { if (b.attachedTo) carriers[b.attachedTo] = b; });
    var ballHandled = {};
    A.entities.forEach(function (ea) {
      if (ea.type !== "player" && ea.type !== "support") return;
      var eb = findById(B.entities, ea.id); if (!eb) return;
      var d = Math.hypot(eb.x - ea.x, eb.y - ea.y); if (d < MOVED) return;
      var ballA = carriers[ea.id], ballB = ballA ? findById(B.entities, ballA.id) : null;
      if (ballA && ballB) {
        var bd = Math.hypot(ballB.x - ballA.x, ballB.y - ballA.y);
        var together = Math.hypot((ballB.x - ballA.x) - (eb.x - ea.x), (ballB.y - ballA.y) - (eb.y - ea.y)) < 0.7;
        if (bd >= MOVED && together) { out.push({ type: "dribble", from: { x: ea.x, y: ea.y }, to: { x: eb.x, y: eb.y }, actorId: ea.id, srcId: ea.id, seg: N, ctrls: ea.ctrls, width: ea.arrowWidth, pts: ea.curve ? curvePoints(drill, ea.id, N, ea, eb, 16) : null }); ballHandled[ballA.id] = true; return; }
      }
      out.push({ type: "run", from: { x: ea.x, y: ea.y }, to: { x: eb.x, y: eb.y }, actorId: ea.id, srcId: ea.id, seg: N, ctrls: ea.ctrls, width: ea.arrowWidth, pts: ea.curve ? curvePoints(drill, ea.id, N, ea, eb, 16) : null });
    });
    balls.forEach(function (ballA) {
      if (ballHandled[ballA.id]) return;
      var ballB = findById(B.entities, ballA.id); if (!ballB) return;
      var bd2 = Math.hypot(ballB.x - ballA.x, ballB.y - ballA.y);
      if (bd2 >= MOVED) out.push({ type: "pass", from: { x: ballA.x, y: ballA.y }, to: { x: ballB.x, y: ballB.y }, srcId: ballA.id, seg: N, ctrls: ballA.ctrls, width: ballA.arrowWidth, pts: ballA.curve ? curvePoints(drill, ballA.id, N, ballA, ballB, 16) : null, aerial: !!ballA.aerial });
    });
    return out;
  }

  // Clip actif d'une entite a l'instant t, sur la timeline canonique (tl) —
  // pendant de computeArrows mais precis a la milliseconde plutot que par
  // etape entiere : necessaire pour que la fleche d'un mouvement desynchronise
  // (mode avance) apparaisse EXACTEMENT quand il demarre, pas seulement quand
  // toute l'etape qui le contient commence (cf renderAnimated ci-dessous).
  // Borne HAUTE exclusive : au ms partage entre un clip qui se termine et le
  // suivant qui demarre (deplacements consecutifs), on bascule immediatement
  // sur le nouveau plutot que de laisser trainer l'ancien une image de plus —
  // c'est precisement l'inverse qui causait le decalage signale par Robin
  // (la fleche du nouveau mouvement n'apparaissait qu'a l'image suivante).
  // Exception : sur l'image de fin de la SEQUENCE COMPLETE (t >= totalMs), on
  // garde le dernier clip actif au lieu de rendre -1, pour que la derniere
  // fleche ne disparaisse pas pile sur l'image figee finale.
  function activeClipIndexAt(rec, t, totalMs) {
    for (var i = 0; i < rec.clips.length; i++) {
      var c = rec.clips[i];
      if (t >= c.startMs && t < c.startMs + c.durationMs) return i;
    }
    var n = rec.clips.length;
    if (n && t >= totalMs) return n - 1;
    return -1;
  }
  // Etat "de depart" du clip ci d'une entite — meme definition que
  // fromStateOf cote editeur (arrivee du clip precedent, ou spawn pour le
  // premier), necessaire ici puisque render-core n'a pas acces a la closure
  // de l'editeur.
  function clipFromState(rec, ci) { return ci > 0 ? rec.clips[ci - 1].to : rec.spawn; }
  // Meme spline Catmull-Rom que curvePoints, mais a partir des voisins de la
  // CHAINE DE CLIPS (comme sampleEntityAt) plutot que des keyframes — la
  // fleche suit alors exactement la trajectoire echantillonnee pour la
  // position du jeton, y compris en mode avance ou clip et etape ne
  // coincident plus.
  function curvePointsForClip(rec, ci, steps) {
    var clips = rec.clips, c = clips[ci], from = clipFromState(rec, ci);
    var p0 = (ci >= 2) ? { x: clips[ci - 2].toX, y: clips[ci - 2].toY } : { x: rec.spawn.x, y: rec.spawn.y };
    var p3 = (ci + 1 < clips.length) ? { x: clips[ci + 1].toX, y: clips[ci + 1].toY } : { x: c.toX, y: c.toY };
    var pts = [];
    for (var i = 0; i <= steps; i++) {
      var u = i / steps;
      pts.push({ x: catmullRom1D(p0.x, from.x, c.toX, p3.x, u), y: catmullRom1D(p0.y, from.y, c.toY, p3.y, u) });
    }
    return pts;
  }
  // Fleches visibles a l'instant absolu t (ms), a partir de la timeline
  // canonique — remplace computeArrows(drill, seg) dans renderAnimated : ce
  // dernier derive les fleches des positions aux FRONTIERES d'etape, donc les
  // affiche pendant toute la duree de l'etape meme quand le clip d'une entite
  // (mode avance, desynchronise) ne demarre qu'en cours d'etape — la fleche
  // apparaissait alors avant que le jeton ne bouge reellement, et restait
  // affichee apres son arrivee jusqu'a la fin de l'etape. Ici chaque entite
  // n'a une fleche que pendant la fenetre [startMs, startMs+durationMs) de
  // son propre clip actif, exactement synchronisee avec sampleEntityAt qui
  // deplace son jeton.
  function computeArrowsAtMs(drill, tl, t) {
    var out = [], ids = Object.keys(tl.entities), MOVED = 0.3;
    var states = {};
    ids.forEach(function (id) { states[id] = entityStateAtMs(tl, id, t); });
    var carriers = {};
    ids.forEach(function (id) {
      var st = states[id];
      if (st && st.type === "ball" && st.attachedTo) carriers[st.attachedTo] = id;
    });
    var ballHandled = {};
    ids.forEach(function (id) {
      var st = states[id];
      if (!st || (st.type !== "player" && st.type !== "support")) return;
      var rec = tl.entities[id], ci = activeClipIndexAt(rec, t, tl.totalMs);
      if (ci < 0) return;
      var clip = rec.clips[ci], from = clipFromState(rec, ci);
      var d = Math.hypot(clip.toX - from.x, clip.toY - from.y);
      if (d < MOVED) return;
      var ballId = carriers[id], brec = ballId ? tl.entities[ballId] : null;
      var bci = brec ? activeClipIndexAt(brec, t, tl.totalMs) : -1;
      if (brec && bci >= 0) {
        var bclip = brec.clips[bci], bfrom = clipFromState(brec, bci);
        var bd = Math.hypot(bclip.toX - bfrom.x, bclip.toY - bfrom.y);
        var together = Math.hypot((bclip.toX - bfrom.x) - (clip.toX - from.x), (bclip.toY - bfrom.y) - (clip.toY - from.y)) < 0.7;
        if (bd >= MOVED && together) {
          out.push({ type: "dribble", from: { x: from.x, y: from.y }, to: { x: clip.toX, y: clip.toY }, actorId: id, srcId: id, ctrls: clip.ctrls, width: st.arrowWidth, pts: clip.curve ? curvePointsForClip(rec, ci, 16) : null });
          ballHandled[ballId] = true;
          return;
        }
      }
      out.push({ type: "run", from: { x: from.x, y: from.y }, to: { x: clip.toX, y: clip.toY }, actorId: id, srcId: id, ctrls: clip.ctrls, width: st.arrowWidth, pts: clip.curve ? curvePointsForClip(rec, ci, 16) : null });
    });
    ids.forEach(function (id) {
      if (ballHandled[id]) return;
      var st = states[id];
      if (!st || st.type !== "ball") return;
      var rec = tl.entities[id], ci = activeClipIndexAt(rec, t, tl.totalMs);
      if (ci < 0) return;
      var clip = rec.clips[ci], from = clipFromState(rec, ci);
      var d = Math.hypot(clip.toX - from.x, clip.toY - from.y);
      if (d < MOVED) return;
      out.push({ type: "pass", from: { x: from.x, y: from.y }, to: { x: clip.toX, y: clip.toY }, srcId: id, ctrls: clip.ctrls, width: st.arrowWidth, pts: clip.curve ? curvePointsForClip(rec, ci, 16) : null, aerial: !!st.aerial });
    });
    return out;
  }

  // Symbole du but (cadre schématique) à l'endroit réel des buts, indépendant de
  // l'entité "But" que le coach peut placer et déplacer librement à la main.
  // But futsal vu de dessus, aux dimensions reglementaires (3 m d'ouverture,
  // 1 m de profondeur au sol). La hauteur de 2 m ne se projette pas en vue de
  // dessus : elle est suggeree par la densite du maillage, comme pour le but
  // posable (cf drawEntity). Le filet se developpe HORS du terrain, dir donnant
  // le sens. Le but n'est PAS un trace au sol : c'est une structure, blanche
  // comme sur un vrai terrain, et non de la couleur des lignes — sinon il
  // disparait des que les lignes sont sombres, puisqu'il est dessine hors du
  // terrain, sur le fond exterieur. Un voile sombre derriere le filet le rend
  // lisible aussi sur un fond clair.
  function drawGoalMark(svg, g, goalX, dir, cy) {
    var halfW = 1.5, depth = 1;
    var x0 = g.px(goalX), x1 = g.px(goalX + dir * depth);
    var yTop = g.py(cy + halfW), yBot = g.py(cy - halfW);
    var frame = "#f4f4f1";
    var grp = el("g", {});
    grp.appendChild(el("rect", {
      x: Math.min(x0, x1), y: Math.min(yTop, yBot),
      width: Math.abs(x1 - x0), height: Math.abs(yBot - yTop),
      fill: "#000", "fill-opacity": 0.22
    }));
    var i, cols = 9, rows = 3;
    for (i = 1; i < cols; i++) {
      var yy = yTop + (yBot - yTop) * i / cols;
      grp.appendChild(el("line", { x1: x0, y1: yy, x2: x1, y2: yy, stroke: frame, "stroke-opacity": 0.5, "stroke-width": 0.6 }));
    }
    for (i = 1; i < rows; i++) {
      var xx = x0 + (x1 - x0) * i / rows;
      grp.appendChild(el("line", { x1: xx, y1: yTop, x2: xx, y2: yBot, stroke: frame, "stroke-opacity": 0.5, "stroke-width": 0.6 }));
    }
    // Montants lateraux et barre de fond : l'ossature du but.
    grp.appendChild(el("line", { x1: x0, y1: yTop, x2: x1, y2: yTop, stroke: frame, "stroke-width": 2 }));
    grp.appendChild(el("line", { x1: x0, y1: yBot, x2: x1, y2: yBot, stroke: frame, "stroke-width": 2 }));
    grp.appendChild(el("line", { x1: x1, y1: yTop, x2: x1, y2: yBot, stroke: frame, "stroke-width": 2 }));
    // Poteaux, sur la ligne de but : ce sont eux qui donnent l'echelle du but.
    [yTop, yBot].forEach(function (y) {
      grp.appendChild(el("circle", { cx: x0, cy: y, r: 2.1, fill: frame }));
    });
    svg.appendChild(grp);
  }

  // Assombrit/eclaircit une couleur hex d'un facteur (1 = inchange, <1 = plus sombre).
  function shadeColor(hex, factor) {
    hex = String(hex || "#c99a5b").replace("#", "");
    if (hex.length === 3) hex = hex.split("").map(function (c) { return c + c; }).join("");
    var r = Math.min(255, Math.round(parseInt(hex.substr(0, 2), 16) * factor));
    var gr = Math.min(255, Math.round(parseInt(hex.substr(2, 2), 16) * factor));
    var b = Math.min(255, Math.round(parseInt(hex.substr(4, 2), 16) * factor));
    return "rgb(" + r + "," + gr + "," + b + ")";
  }

  var WOOD_DEFAULT = "#e2c393", WOOD_LINE_DEFAULT = "#2b2117";
  // Surface parquet : lattes en calepinage brique (rangees decalees d'une
  // demi-latte, comme un vrai parquet de salle), avec joints et fil du bois —
  // vise le rendu d'un sol de salle omnisport (cf. reference terrain jaune/bois).
  function woodPatternFill(svg, base) {
    var id = "woodPattern";
    base = base || WOOD_DEFAULT;
    // Aucun joint trace : ce sont les ecarts de teinte entre lattes voisines
    // qui dessinent le calepinage, comme sur un parquet vitrifie vu de loin.
    // L'ecart est volontairement tenu (moins de 3%) : les lattes doivent se
    // deviner, pas se decouper. Le fil du bois porte l'essentiel de la matiere.
    var tones = [1.018, 0.992, 1.028, 0.982, 1.005, 0.997, 1.022, 0.988, 1.012, 0.978]
      .map(function (k) { return shadeColor(base, k); });
    var grainDark = "rgba(120,80,34,0.16)", grainSoft = "rgba(120,80,34,0.09)";
    var sheen = "rgba(255,250,236,0.12)";
    // Lattes plus courtes et plus fines : ~47 rangees sur la largeur du terrain.
    var rowH = 9, tileW = 390, rows = [
      [0, 62, 148, 226, 318], [0, 88, 162, 274, 344], [0, 54, 134, 240, 312],
      [0, 96, 176, 252, 330], [0, 70, 142, 218, 296], [0, 48, 126, 208, 286, 356],
      [0, 82, 154, 232, 304], [0, 58, 138, 246, 322], [0, 104, 184, 258, 334],
      [0, 76, 156, 228, 300, 368]
    ];
    var tileH = rowH * rows.length;
    var defs = el("defs", {});
    var pat = el("pattern", { id: id, width: tileW, height: tileH, patternUnits: "userSpaceOnUse" });
    function rect(x, y, w, h, fill) { pat.appendChild(el("rect", { x: x, y: y, width: w, height: h, fill: fill })); }
    function line(x1, y1, x2, y2, color, w) {
      pat.appendChild(el("line", { x1: x1, y1: y1, x2: x2, y2: y2, stroke: color, "stroke-width": w }));
    }
    rows.forEach(function (cuts, r) {
      var y = r * rowH;
      cuts.forEach(function (x, i) {
        var next = i + 1 < cuts.length ? cuts[i + 1] : tileW;
        var len = next - x;
        rect(x, y, len, rowH, tones[(r * 3 + i) % tones.length]);
        // Fil du bois : quatre veines par latte, positions et longueurs
        // proportionnelles pour qu'une latte courte ne soit pas surchargee.
        [[0.07, 1.8, 0.6], [0.30, 3.6, 0.5], [0.05, 5.4, 0.45], [0.42, 7.2, 0.44]]
          .forEach(function (v, k) {
            var vx = x + len * v[0];
            line(vx, y + v[1], vx + len * v[2], y + v[1], k % 2 ? grainSoft : grainDark, 0.55);
          });
        line(x + len * 0.2, y + 4.5, x + len * 0.2 + len * 0.35, y + 4.5, sheen, 0.8);
      });
    });
    defs.appendChild(pat);
    svg.appendChild(defs);
    return "url(#" + id + ")";
  }

  // Revetements derives de la couleur choisie (a l'inverse du parquet, dont les
  // teintes sont fixes) : deux nuances de la meme couleur, en bandes ou en
  // damier. C'est l'equivalent futsal des motifs de tonte d'un terrain engazonne.
  function surfacePatternFill(svg, kind, base) {
    var id = "surfacePattern_" + kind;
    var light = shadeColor(base, 1.07), dark = shadeColor(base, 0.93);
    var tile = 46;
    var defs = el("defs", {});
    var pat = el("pattern", { id: id, width: tile * 2, height: kind === "checker" ? tile * 2 : tile, patternUnits: "userSpaceOnUse" });
    function rect(x, y, w, h, fill) { pat.appendChild(el("rect", { x: x, y: y, width: w, height: h, fill: fill })); }
    rect(0, 0, tile, tile, light);
    rect(tile, 0, tile, tile, dark);
    if (kind === "checker") { rect(0, tile, tile, tile, dark); rect(tile, tile, tile, tile, light); }
    defs.appendChild(pat);
    svg.appendChild(defs);
    return "url(#" + id + ")";
  }

  // Motif fixe (non éditable) tracé sur le terrain — repère visuel figé, distinct
  // des zones interactives (déplaçables/redimensionnables).
  function drawPitchPattern(svg, drill, g) {
    var p = drill.pitch, pattern = p.pattern;
    if (!pattern || pattern === "none") return;
    // Meme couleur que les traces officiels : ce sont des lignes du terrain,
    // pas une surcouche d'un autre systeme. Seule l'opacite les distingue,
    // pour qu'elles restent lisibles comme des reperes secondaires.
    var attrs = { stroke: p.lineColor || COL.line, "stroke-opacity": 0.55, "stroke-width": 1.5, "stroke-dasharray": "5 4" };
    // Couloirs : 5 m le long de chaque touche, le couloir central absorbe le
    // reste de la largeur (5/10/5 sur un terrain reglementaire de 20 m).
    function corridors() {
      if (p.width <= 10) return;
      [5, p.width - 5].forEach(function (yPos) {
        var y = g.py(yPos);
        svg.appendChild(el("line", Object.assign({ x1: g.px(0), y1: y, x2: g.px(p.length), y2: y }, attrs)));
      });
    }
    // Zones en profondeur : n tranches egales de but a but.
    function depthZones(n) {
      var w = p.length / n;
      for (var j = 1; j < n; j++) {
        var x = g.px(w * j);
        svg.appendChild(el("line", Object.assign({ x1: x, y1: g.py(p.width), x2: x, y2: g.py(0) }, attrs)));
      }
    }
    if (pattern === "corridors3") corridors();
    else if (pattern === "zones3") depthZones(3);
    else if (pattern === "zones4") depthZones(4);
    else if (pattern === "grid") { corridors(); depthZones(3); }
  }

  function drawPitchBase(svg, drill, g) {
    var p = drill.pitch;
    svg.setAttribute("viewBox", "0 0 " + g.W + " " + g.H);
    // Une seule couleur pour tous les TRACES officiels (touche, but, surface de
    // but, mediane, cercle central, points de penalty) — c'est la meme sur un
    // vrai terrain. Seul le REMPLISSAGE de la surface de but se distingue, pour
    // la faire ressortir sur un schema sans toucher aux lignes elles-memes.
    var lineColor = p.lineColor || COL.line;
    var goalAreaFill = p.goalAreaColor || lineColor;
    var goalAreaOpacity = typeof p.goalAreaOpacity === "number" ? p.goalAreaOpacity : 0.16;
    if (p.image) {
      // Image de fond : couvre tout le canvas (exterieur + surface), comme une
      // photo d'un vrai terrain — les couleurs exterieur/surface ne s'appliquent
      // qu'en l'absence d'image.
      var iscale = p.imageScale || 1, iw = g.W * iscale, ih = g.H * iscale;
      var ix = (g.W - iw) / 2 + (p.imageOffsetX || 0), iy = (g.H - ih) / 2 + (p.imageOffsetY || 0);
      svg.appendChild(el("image", { href: p.image, x: ix, y: iy, width: iw, height: ih, preserveAspectRatio: "xMidYMid slice", "data-bg": "1" }));
    } else {
      svg.appendChild(el("rect", { x: 0, y: 0, width: g.W, height: g.H, fill: p.outerColor || "#171a15", "data-bg": "1" }));
      var surfaceFill = p.surface === "wood" ? woodPatternFill(svg, p.color)
        : (p.surface === "stripes" || p.surface === "checker") ? surfacePatternFill(svg, p.surface, p.color || COL.pitch)
        : (p.color || COL.pitch);
      svg.appendChild(el("rect", { x: g.px(0), y: g.py(p.width), width: p.length * g.sc, height: p.width * g.sc, fill: surfaceFill, "data-bg": "1" }));
    }
    svg.appendChild(el("rect", { x: g.px(0), y: g.py(p.width), width: p.length * g.sc, height: p.width * g.sc, fill: "none", stroke: lineColor, "stroke-width": 2 }));
    svg.appendChild(el("line", { x1: g.px(p.length / 2), y1: g.py(p.width), x2: g.px(p.length / 2), y2: g.py(0), stroke: lineColor, "stroke-width": 2 }));
    if (p.centerLogo) {
      var lcx = g.px(p.length / 2), lcy = g.py(p.width / 2), lr = 3 * g.sc;
      var clipId = "centerLogoClip";
      var cdefs = el("defs", {});
      var clip = el("clipPath", { id: clipId });
      clip.appendChild(el("circle", { cx: lcx, cy: lcy, r: lr * 0.92 }));
      cdefs.appendChild(clip); svg.appendChild(cdefs);
      svg.appendChild(el("image", { href: p.centerLogo, x: lcx - lr, y: lcy - lr, width: lr * 2, height: lr * 2, preserveAspectRatio: "xMidYMid slice", "clip-path": "url(#" + clipId + ")", "pointer-events": "none" }));
    }
    svg.appendChild(el("circle", { cx: g.px(p.length / 2), cy: g.py(p.width / 2), r: 3 * g.sc, fill: "none", stroke: lineColor, "stroke-width": 2 }));
    drawGoalMark(svg, g, 0, -1, p.width / 2);
    drawGoalMark(svg, g, p.length, 1, p.width / 2);
    if (p.markings === "full") {
      svg.appendChild(el("polygon", { points: penArea(drill, g, 0, 1), fill: goalAreaFill, "fill-opacity": goalAreaOpacity, stroke: lineColor, "stroke-width": 2, "pointer-events": "none" }));
      svg.appendChild(el("polygon", { points: penArea(drill, g, p.length, -1), fill: goalAreaFill, "fill-opacity": goalAreaOpacity, stroke: lineColor, "stroke-width": 2, "pointer-events": "none" }));
      var cy2 = p.width / 2;
      [0, p.length].forEach(function (goalX, i) {
        var dir = i === 0 ? 1 : -1;
        [6, 10].forEach(function (dist) {
          if (dist * 2 >= p.length) return;
          svg.appendChild(el("circle", { cx: g.px(goalX + dir * dist), cy: g.py(cy2), r: 1.6, fill: lineColor, "pointer-events": "none" }));
        });
      });
    }
    drawPitchPattern(svg, drill, g);
  }

  // Fenetre de presence d'un objet (zone, trait libre, pulse) sur la timeline
  // (mode avance, Phase 2) : visibleFrom/visibleTo (ms), toutes deux absentes
  // par defaut = visible sur tout le procede (comportement historique, avant
  // l'ajout de cette capacite — aucune migration necessaire pour les
  // procedes existants). Generique : pas specifique aux zones malgre le nom
  // d'origine, reutilise pour lines/pulses (cf buildOverlayGlobal).
  function visibleAt(o, t) {
    return (o.visibleFrom == null || t >= o.visibleFrom) && (o.visibleTo == null || t < o.visibleTo);
  }
  // Reconstruit le tableau global (avec fenetres de presence) d'un type de
  // survol par-etape (lignes ou pulses) a partir de drill.keyframes[].<key> —
  // utilise l'id pour retrouver la continuite d'un objet d'une etape a
  // l'autre (addStep clone les etapes en gardant les ids, donc un meme id
  // present sur plusieurs etapes consecutives designe le meme objet). Prend
  // la PREMIERE et la DERNIERE apparition comme bornes d'une fenetre unique —
  // une disparition puis reapparition (trou) se traduit en fenetre continue
  // qui couvre le trou, simplification deliberee (pas de fenetres multiples
  // en v1). Fallback utilise quand drill.lines/drill.pulses n'existent pas
  // encore (procede jamais migre, ou rendu ici sans passer par editor.js —
  // cf renderStatic/renderAnimated, meme convention que buildEntityTimeline).
  function buildOverlayGlobal(drill, key) {
    var kfs = drill.keyframes, bm = stepBoundariesMs(drill);
    var byId = {}, order = [];
    kfs.forEach(function (kf, i) {
      (kf[key] || []).forEach(function (o) {
        if (!byId[o.id]) { byId[o.id] = { obj: JSON.parse(JSON.stringify(o)), first: i, last: i }; order.push(o.id); }
        else byId[o.id].last = i;
      });
    });
    return order.map(function (id) {
      var e = byId[id], o = e.obj;
      if (e.first > 0) o.visibleFrom = bm[e.first];
      if (e.last < kfs.length - 1) o.visibleTo = bm[e.last + 1];
      return o;
    });
  }
  // opts : { selected: bool, onDown: fn(ev)|null }. z.shape : "rect" (defaut) | "ellipse" | "polygon".
  // Hachures : une trame de traits a 45°, une par couleur. L'id derive de la
  // couleur, donc deux zones de meme teinte partagent la meme trame et un
  // reste de <defs> d'un rendu precedent n'est jamais reutilise a tort (chaque
  // passe repart d'un svg vide, cf clear()).
  // Tuile de 10 px, bande de 4 px : 40% pleine / 60% vide, demande explicite
  // de Robin ("beaucoup plus epais") apres une premiere version trop fine
  // (32.5% a l'ancien 2.6/8).
  function hatchFill(svg, color) {
    var id = "zoneHatch_" + String(color).replace(/[^a-z0-9]/gi, "");
    if (!svg.querySelector("#" + id)) {
      var defs = el("defs", {});
      var pat = el("pattern", { id: id, width: 10, height: 10, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" });
      pat.appendChild(el("line", { x1: 0, y1: 0, x2: 0, y2: 10, stroke: color, "stroke-width": 4 }));
      defs.appendChild(pat);
      svg.appendChild(defs);
    }
    return "url(#" + id + ")";
  }
  function drawZone(svg, drill, g, z, opts) {
    opts = opts || {};
    var isSel = !!opts.selected, shape = z.shape || "rect";
    // Champs de style optionnels (z.stroke, z.strokeWidth, z.fill,
    // z.fillOpacity). Absents, on retrouve exactement l'ancien rendu :
    // pointille, 1.5 px, remplissage plein a 0.28 (ou la teinte ZFILL du
    // type de zone quand aucune couleur n'est choisie).
    var baseW = typeof z.strokeWidth === "number" ? z.strokeWidth : 1.5;
    var fillAttrs = { "stroke-width": isSel ? baseW + 1 : baseW };
    if (z.stroke !== "solid") fillAttrs["stroke-dasharray"] = "5 5";
    var mode = z.fill || "solid";
    var tint = z.color || null;
    fillAttrs.stroke = isSel ? COL.sel : (tint || "rgba(255,255,255,0.6)");
    if (mode === "none") fillAttrs.fill = "none";
    else if (mode === "hatch") {
      fillAttrs.fill = hatchFill(svg, tint || "#ffffff");
      fillAttrs["fill-opacity"] = typeof z.fillOpacity === "number" ? z.fillOpacity : 0.55;
    } else if (tint) {
      fillAttrs.fill = tint;
      fillAttrs["fill-opacity"] = typeof z.fillOpacity === "number" ? z.fillOpacity : 0.28;
    } else {
      fillAttrs.fill = ZFILL[z.kind] || ZFILL.neutral;
      if (typeof z.fillOpacity === "number") fillAttrs["fill-opacity"] = z.fillOpacity;
    }

    if (shape === "polygon") {
      var pts = (z.pts || []).map(function (p) { return g.px(p.x) + "," + g.py(p.y); }).join(" ");
      var node = el("g", { cursor: opts.onDown ? "move" : "default", "data-zid": z.id });
      node.appendChild(el("polygon", Object.assign({ points: pts }, fillAttrs)));
      if (z.label) {
        var cx = (z.pts || []).reduce(function (s, p) { return s + p.x; }, 0) / Math.max(1, (z.pts || []).length);
        var cy = (z.pts || []).reduce(function (s, p) { return s + p.y; }, 0) / Math.max(1, (z.pts || []).length);
        node.appendChild(textNode(g.px(cx), g.py(cy) + 4, z.label, 11, z.color ? "#fff" : COL.line, { bold: true, opacity: 0.9 }));
      }
      if (opts.onDown) node.addEventListener("pointerdown", opts.onDown);
      else node.style.pointerEvents = "none";
      svg.appendChild(node);
      return;
    }

    var w = z.w * g.sc, h = z.h * g.sc;
    var node = el("g", { transform: "translate(" + g.px(z.x) + "," + g.py(z.y + z.h) + ")", cursor: opts.onDown ? "move" : "default", "data-zid": z.id });
    if (shape === "ellipse") node.appendChild(el("ellipse", Object.assign({ cx: w / 2, cy: h / 2, rx: w / 2, ry: h / 2 }, fillAttrs)));
    else node.appendChild(el("rect", Object.assign({ x: 0, y: 0, width: w, height: h }, fillAttrs)));
    node.appendChild(textNode(w / 2, h / 2 + 4, round1(z.w) + " × " + round1(z.h) + " m", 12, z.color ? "#fff" : COL.line, { bold: true, opacity: 0.9 }));
    if (z.label) node.appendChild(textNode(6, 14, z.label, 11, COL.line, { anchor: "start", opacity: 0.85 }));
    if (opts.onDown) node.addEventListener("pointerdown", opts.onDown);
    else node.style.pointerEvents = "none";
    svg.appendChild(node);
  }

  // ---- identite d'equipe ----
  // Jusqu'ici la couleur d'un jeton etait resolue en dur a deux endroits
  // (drawEntity et l'inspecteur), le contour et le numero etaient toujours
  // blancs. drill.teams[key] permet de regler maillot, contour, numero, forme
  // par defaut et nom, par equipe et pour tout le procede. Champ purement
  // additif : sans drill.teams, teamStyle rend exactement les anciennes
  // valeurs, donc un procede existant est dessine au pixel pres comme avant.
  // Teinte chair des mains du modele oriente : volontairement hors palette
  // d'equipe, pour rester distincte quel que soit le maillot choisi.
  var SKIN = "#e3c09a";
  // Chasuble : hors palette d'equipe, pour ne jamais se confondre avec un maillot.
  var BIB = "#c8f24e";
  var TEAM_DEFAULTS = {
    home: { name: "Nous", fill: COL.home, stroke: "#ffffff", text: "#ffffff", size: 0.9 },
    away: { name: "Adversaire", fill: COL.away, stroke: "#ffffff", text: "#ffffff", size: 0.9 },
    support: { name: "Appuis", fill: COL.support, stroke: "#ffffff", text: "#ffffff", size: 0.9 }
  };
  // Quelle entree de drill.teams s'applique a cette entite. Regle reprise telle
  // quelle de l'ancien calcul de couleur : un joueur "none" retombe sur appuis.
  function teamKeyOf(e) {
    if (e.type === "support") return "support";
    return e.team === "home" ? "home" : e.team === "away" ? "away" : "support";
  }
  function teamStyle(drill, e) {
    var key = teamKeyOf(e), d = TEAM_DEFAULTS[key];
    var t = (drill && drill.teams && drill.teams[key]) || {};
    return {
      key: key,
      name: t.name || d.name,
      // e.color reste prioritaire : un jeton recolore a la main ne bouge pas
      // quand on change la couleur de l'equipe.
      fill: e.color || t.fill || d.fill,
      stroke: t.stroke || d.stroke,
      text: t.text || d.text,
      // Meme priorite que la couleur : une entite dont la taille a ete tiree
      // a la main garde sa taille quand la taille par defaut de l'equipe change.
      size: e.size || t.size || d.size,
      // La forme par defaut depend du TYPE (appui = carre), pas de l'equipe —
      // c'etait deja le cas avant, et un joueur "none" doit rester un rond
      // meme s'il emprunte la couleur des appuis.
      shape: e.shape || t.shape || (e.type === "support" ? "square" : "circle")
    };
  }

  // Qui porte le ballon, pour une liste d'entites donnee. Le lien existe deja
  // dans la donnee (ball.attachedTo), il n'etait simplement jamais dessine.
  // Calcule une fois par rendu et passe via opts.carrier, plutot qu'un etat
  // de module : chaque passe de rendu (export, lecture, edition, timeline
  // avancee) a sa propre liste d'entites et reste ainsi exacte.
  function carrierMap(entities) {
    var m = {};
    (entities || []).forEach(function (e) {
      if (e && e.type === "ball" && e.attachedTo) m[e.attachedTo] = true;
    });
    return m;
  }

  // ---- materiel de seance ----
  // Le plot etait le seul objet posable. Ces six-la couvrent ce qu'un coach a
  // reellement sous la main en salle. Ceux qui ont une emprise au sol
  // significative (haie, cerceau, echelle, mini-but) sont dessines a leur
  // taille reelle en metres, comme le but : un schema doit dire si le materiel
  // rentre dans l'espace prevu. La coupelle et le piquet, eux, sont des
  // reperes ponctuels : taille fixe en pixels, comme le plot, sinon ils
  // deviendraient invisibles sur un grand terrain.
  //   real : dimensions en metres { w, h } ou null si repere ponctuel
  //   rot  : l'objet a une orientation (poignee de pivot)
  var EQUIP = {
    saucer: { label: "Coupelle", real: null, rot: false, color: "#f2c14e" },
    pole: { label: "Piquet", real: null, rot: false, color: "#e8503a" },
    hoop: { label: "Cerceau", real: { w: 0.6, h: 0.6 }, rot: false, color: "#3fc2d6" },
    hurdle: { label: "Haie", real: { w: 0.5, h: 0.3 }, rot: true, color: "#f2c14e" },
    ladder: { label: "Échelle", real: { w: 4, h: 0.5 }, rot: true, color: "#e6e2d6" },
    minigoal: { label: "Mini-but", real: { w: 1.2, h: 0.5 }, rot: true, front: true, color: "#f4f4f1" }
  };
  function drawEquipment(node, g, e, scale) {
    var spec = EQUIP[e.type], col = e.color || spec.color, ink = "#12140f";
    var grp = spec.rot ? el("g", { transform: "rotate(" + (e.facing || 0) + ")" }) : el("g", {});
    if (e.type === "saucer") {
      // Coupelle : disque plat, lu de dessus comme un anneau plein.
      var sr = 7 * scale;
      grp.appendChild(el("circle", { cx: 0, cy: 0, r: sr, fill: col, stroke: ink, "stroke-width": 1 }));
      grp.appendChild(el("circle", { cx: 0, cy: 0, r: sr * 0.48, fill: shadeColor(col, 0.8), stroke: "none" }));
    } else if (e.type === "pole") {
      // Piquet vu de dessus : une section, donc un petit disque cercle — le
      // liseré clair le distingue d'un ballon a taille comparable.
      var pr = 5 * scale;
      grp.appendChild(el("circle", { cx: 0, cy: 0, r: pr, fill: col, stroke: "#fff", "stroke-width": 1.6 }));
      grp.appendChild(el("circle", { cx: 0, cy: 0, r: pr * 0.4, fill: "#fff", stroke: "none" }));
    } else if (e.type === "hoop") {
      var hr = (spec.real.w / 2) * g.sc * scale;
      grp.appendChild(el("circle", { cx: 0, cy: 0, r: hr, fill: "none", stroke: ink, "stroke-width": Math.max(3.4, hr * 0.32) }));
      grp.appendChild(el("circle", { cx: 0, cy: 0, r: hr, fill: "none", stroke: col, "stroke-width": Math.max(2, hr * 0.2) }));
    } else if (e.type === "hurdle") {
      // Haie basse : barre transversale + deux pieds. L'orientation compte,
      // on la franchit perpendiculairement a la barre.
      var hw = (spec.real.w / 2) * g.sc * scale, hd = (spec.real.h / 2) * g.sc * scale;
      grp.appendChild(el("line", { x1: -hw, y1: -hd, x2: -hw, y2: hd, stroke: ink, "stroke-width": 2.4 }));
      grp.appendChild(el("line", { x1: hw, y1: -hd, x2: hw, y2: hd, stroke: ink, "stroke-width": 2.4 }));
      grp.appendChild(el("line", { x1: -hw, y1: 0, x2: hw, y2: 0, stroke: ink, "stroke-width": Math.max(4.2, hd * 1.1) }));
      grp.appendChild(el("line", { x1: -hw, y1: 0, x2: hw, y2: 0, stroke: col, "stroke-width": Math.max(2.6, hd * 0.7) }));
    } else if (e.type === "ladder") {
      var lw = (spec.real.w / 2) * g.sc * scale, lh = (spec.real.h / 2) * g.sc * scale, k;
      grp.appendChild(el("rect", { x: -lw, y: -lh, width: 2 * lw, height: 2 * lh, fill: "#000", "fill-opacity": 0.18 }));
      // Barreaux tous les 40 cm environ, la maille reelle d'une echelle de rythme.
      var rungs = Math.max(2, Math.round(spec.real.w / 0.4));
      for (k = 0; k <= rungs; k++) {
        var rx = -lw + (2 * lw * k) / rungs;
        grp.appendChild(el("line", { x1: rx, y1: -lh, x2: rx, y2: lh, stroke: col, "stroke-width": 1.6 }));
      }
      grp.appendChild(el("line", { x1: -lw, y1: -lh, x2: lw, y2: -lh, stroke: col, "stroke-width": 2 }));
      grp.appendChild(el("line", { x1: -lw, y1: lh, x2: lw, y2: lh, stroke: col, "stroke-width": 2 }));
    } else if (e.type === "minigoal") {
      // Meme lecture que le but reglementaire (cf branche goal) mais a
      // l'echelle d'une porte reduite : ouverture sur +/-w/2, filet vers -y.
      var gw = (spec.real.w / 2) * g.sc * scale, gd = spec.real.h * g.sc * scale, j;
      grp.appendChild(el("rect", { x: -gw, y: -gd, width: 2 * gw, height: gd, fill: "#000", "fill-opacity": 0.22 }));
      for (j = 1; j < 6; j++) {
        var mx = -gw + (2 * gw * j) / 6;
        grp.appendChild(el("line", { x1: mx, y1: -gd, x2: mx, y2: 0, stroke: col, "stroke-opacity": 0.5, "stroke-width": 0.6 }));
      }
      for (j = 1; j < 3; j++) {
        var my = -gd + (gd * j) / 3;
        grp.appendChild(el("line", { x1: -gw, y1: my, x2: gw, y2: my, stroke: col, "stroke-opacity": 0.5, "stroke-width": 0.6 }));
      }
      grp.appendChild(el("line", { x1: -gw, y1: -gd, x2: gw, y2: -gd, stroke: col, "stroke-width": 1.8 }));
      grp.appendChild(el("line", { x1: -gw, y1: -gd, x2: -gw, y2: 0, stroke: col, "stroke-width": 1.8 }));
      grp.appendChild(el("line", { x1: gw, y1: -gd, x2: gw, y2: 0, stroke: col, "stroke-width": 1.8 }));
      [-gw, gw].forEach(function (px) { grp.appendChild(el("circle", { cx: px, cy: 0, r: 2.1, fill: col })); });
    }
    node.appendChild(grp);
  }

  function shapePoints(shape, r) {
    if (shape === "triangle") return (0) + "," + (-1.2 * r) + " " + (-1.05 * r) + "," + (0.75 * r) + " " + (1.05 * r) + "," + (0.75 * r);
    if (shape === "diamond") return (0) + "," + (-1.25 * r) + " " + (1.25 * r) + "," + 0 + " " + 0 + "," + (1.25 * r) + " " + (-1.25 * r) + "," + 0;
    return null;
  }

  // opts : { selected: bool, onDown: fn(ev)|null }
  function drawEntity(svg, drill, g, e, opts) {
    opts = opts || {};
    // Joueur/appui : la taille par defaut vient de l'equipe (reglable dans le
    // panneau Equipes), calculee une seule fois ici et reutilisee plus bas —
    // teamStyle() resout deja e.size en priorite (cf sa definition), inutile
    // de le refaire. Les autres types (ballon, but, plot...) n'ont pas de
    // taille d'equipe et gardent leur echelle 1 par defaut, comme avant.
    var isTeamScaled = e.type === "player" || e.type === "support";
    var ts0 = isTeamScaled ? teamStyle(drill, e) : null;
    var scale = isTeamScaled ? ts0.size : (e.size || 1);
    var node = el("g", { transform: "translate(" + g.px(e.x) + "," + g.py(e.y) + ")", cursor: opts.onDown ? "grab" : "default", "data-eid": e.id });
    // Le but dessine sa propre bague de selection (rectangle, taille reelle du
    // filet) plus bas — la bague circulaire generique ne lui convient pas.
    // Materiel a emprise reelle (echelle, mini-but...) : la bague circulaire
    // generique serait plus petite que l'objet. Cadre rectangulaire aligne sur
    // son orientation, comme pour le but.
    var eqReal = EQUIP[e.type] && EQUIP[e.type].real;
    if (opts.selected && eqReal) {
      var sw = (eqReal.w / 2) * g.sc * scale + 5, sd = eqReal.h * g.sc * scale;
      // Le mini-but s'etend vers l'arriere depuis sa ligne (y de -profondeur a
      // 0), les autres sont centres sur leur point : le cadre suit.
      var sy0 = EQUIP[e.type].front ? -sd - 5 : -sd / 2 - 5;
      var sy1 = EQUIP[e.type].front ? 5 : sd / 2 + 5;
      var selGrp = el("g", { transform: "rotate(" + (EQUIP[e.type].rot ? e.facing || 0 : 0) + ")" });
      selGrp.appendChild(el("rect", { x: -sw, y: sy0, width: 2 * sw, height: sy1 - sy0, fill: "none", stroke: COL.sel, "stroke-width": 2 }));
      node.appendChild(selGrp);
    } else if (opts.selected && e.type !== "goal") {
      node.appendChild(el("circle", { cx: 0, cy: 0, r: 15 * scale, fill: "none", stroke: COL.sel, "stroke-width": 2 }));
    }
    if (e.type === "ball") {
      // liftScale (rendu anime uniquement, cf renderAnimated) grossit le ballon
      // en vol pour simuler la hauteur, en complement de l'ombre au sol qui
      // retrecit en meme temps — convention 2D classique (cf jeux vus de haut).
      var br = 6 * (opts.liftScale || 1);
      node.appendChild(el("circle", { cx: 0, cy: 0, r: br, fill: COL.ball, stroke: "#111", "stroke-width": 1.5 }));
    } else if (e.type === "cone") {
      node.appendChild(el("polygon", { points: "0,-7 -6,6 6,6", fill: e.color || COL.cone, stroke: "#111", "stroke-width": 1 }));
    } else if (EQUIP[e.type]) {
      drawEquipment(node, g, e, scale);
    } else if (e.type === "goal") {
      // But realiste vu de dessus, a la taille reelle du terrain (regle FIFA
      // futsal : 3 m de large x 1 m de profondeur — la hauteur de 2 m ne se
      // projette pas en vue de dessus, elle est suggeree par la densite du
      // maillage). x=0 est la ligne de but (poteaux), le filet s'etend en -X ;
      // tourne autour du centre (ligne de but) pour reorienter le but une fois
      // deplace, independant des buts fixes du terrain (cf drawPitchBase).
      var goalGrp = el("g", { transform: "rotate(" + (e.facing || 0) + ")" });
      var halfW = 1.5 * g.sc, dep = 1 * g.sc, netCols = 8, netRows = 3, i;
      goalGrp.appendChild(el("rect", { x: -dep, y: -halfW, width: dep, height: 2 * halfW, fill: "rgba(255,255,255,0.10)" }));
      for (i = 1; i < netCols; i++) {
        var yy = -halfW + (2 * halfW * i) / netCols;
        goalGrp.appendChild(el("line", { x1: -dep, y1: yy, x2: 0, y2: yy, stroke: "rgba(255,255,255,0.45)", "stroke-width": 0.6 }));
      }
      for (i = 1; i < netRows; i++) {
        var xx = -dep + (dep * i) / netRows;
        goalGrp.appendChild(el("line", { x1: xx, y1: -halfW, x2: xx, y2: halfW, stroke: "rgba(255,255,255,0.45)", "stroke-width": 0.6 }));
      }
      goalGrp.appendChild(el("line", { x1: -dep, y1: -halfW, x2: 0, y2: -halfW, stroke: COL.line, "stroke-width": 1.3 }));
      goalGrp.appendChild(el("line", { x1: -dep, y1: halfW, x2: 0, y2: halfW, stroke: COL.line, "stroke-width": 1.3 }));
      goalGrp.appendChild(el("line", { x1: -dep, y1: -halfW, x2: -dep, y2: halfW, stroke: COL.line, "stroke-width": 1.3 }));
      goalGrp.appendChild(el("line", { x1: 0, y1: -halfW, x2: 0, y2: halfW, stroke: COL.line, "stroke-width": 4 }));
      goalGrp.appendChild(el("circle", { cx: 0, cy: -halfW, r: 3, fill: "#fff", stroke: "#111", "stroke-width": 1 }));
      goalGrp.appendChild(el("circle", { cx: 0, cy: halfW, r: 3, fill: "#fff", stroke: "#111", "stroke-width": 1 }));
      if (opts.selected) goalGrp.appendChild(el("rect", { x: -dep - 4, y: -halfW - 4, width: dep + 8, height: 2 * halfW + 8, fill: "none", stroke: COL.sel, "stroke-width": 2 }));
      node.appendChild(goalGrp);
    } else {
      var ts = ts0; // deja resolu plus haut (isTeamScaled est vrai ici)
      var fill = ts.fill, ink = ts.stroke, shape = ts.shape, r = 11 * scale;
      // Porteur du ballon : anneau clair double d'un liseré sombre, pose AVANT
      // le jeton pour rester derriere lui. Dans un schema dense, retrouver qui
      // a le ballon a l'oeil est plus rapide que de suivre la petite sphere.
      // Cone de vision : ce que le joueur voit devant lui. Pose en premier,
      // donc derriere tout le reste, et seulement s'il a une orientation.
      if (e.vision && ts.shape === "body") {
        var vr = r * 4.2, vh = (52 * Math.PI) / 180;
        node.appendChild(el("g", { transform: "rotate(" + (e.facing || 0) + ")" }))
          .appendChild(el("path", {
            d: "M 0 0 L " + (-vr * Math.sin(vh)) + " " + (-vr * Math.cos(vh)) +
               " A " + vr + " " + vr + " 0 0 1 " + (vr * Math.sin(vh)) + " " + (-vr * Math.cos(vh)) + " Z",
            fill: fill, "fill-opacity": 0.17, stroke: fill, "stroke-opacity": 0.35, "stroke-width": 1
          }));
      }
      // Surbrillance : halo pour pointer un joueur du doigt pendant un brief.
      if (e.highlight) {
        node.appendChild(el("circle", { cx: 0, cy: 0, r: r * 2.05, fill: COL.sel, "fill-opacity": 0.16 }));
        node.appendChild(el("circle", { cx: 0, cy: 0, r: r * 1.68, fill: COL.sel, "fill-opacity": 0.22 }));
      }
      if (opts.carrier) {
        node.appendChild(el("circle", { cx: 0, cy: 0, r: r * 1.44, fill: "none", stroke: "#000", "stroke-width": 4, "stroke-opacity": 0.35 }));
        node.appendChild(el("circle", { cx: 0, cy: 0, r: r * 1.44, fill: "none", stroke: COL.ball, "stroke-width": 2 }));
      }
      if (shape === "body") {
        // Modele repris de la reference choisie par Robin : bande d'epaules
        // courbee qui enveloppe l'arriere de la tete, mains en bout de bande,
        // et triangle d'orientation detache devant. Le triangle est dessine
        // dans la couleur de contour de l'equipe et non dans celle de la
        // selection : sur la reference il n'apparait que sur un jeton
        // selectionne, mais le garder en permanence est ce qui rend le sens
        // lisible a l'export et en lecture, la ou aucune poignee n'existe.
        var bodyGrp = el("g", { transform: "rotate(" + (e.facing || 0) + ")" });
        // Bande d'epaules : arc de cercle epais derriere la tete (+y = arriere,
        // le groupe etant oriente vers -y). Trace en trait epais a bouts ronds
        // plutot qu'en forme pleine — les bouts ronds donnent les epaules sans
        // geometrie supplementaire.
        var ar = r * 1.22, half = (64 * Math.PI) / 180, bw = r * 0.46;
        var ax = ar * Math.sin(half), ay = ar * Math.cos(half);
        var armD = "M " + (-ax) + " " + ay + " A " + ar + " " + ar + " 0 0 0 " + ax + " " + ay;
        // Contour d'abord, maillot par-dessus : donne un lisere net sans avoir
        // a construire la bande comme une forme fermee.
        bodyGrp.appendChild(el("path", { d: armD, fill: "none", stroke: ink, "stroke-width": bw + 2.2, "stroke-linecap": "round" }));
        bodyGrp.appendChild(el("path", { d: armD, fill: "none", stroke: fill, "stroke-width": bw, "stroke-linecap": "round" }));
        // Mains : bout de chaque epaule, en teinte chair pour se distinguer du
        // maillot quelle que soit la couleur d'equipe.
        [-1, 1].forEach(function (s) {
          bodyGrp.appendChild(el("circle", { cx: s * ax, cy: ay, r: bw * 0.58, fill: SKIN, stroke: ink, "stroke-width": 1 }));
        });
        bodyGrp.appendChild(el("polygon", {
          points: "0," + (-r * 2.06) + " " + (-r * 0.5) + "," + (-r * 1.46) + " " + (r * 0.5) + "," + (-r * 1.46),
          fill: "none", stroke: ink, "stroke-width": 1.8, "stroke-linejoin": "round"
        }));
        node.appendChild(bodyGrp);
      }
      var pts = shapePoints(shape, r);
      if (pts) node.appendChild(el("polygon", { points: pts, fill: fill, stroke: ink, "stroke-width": 2 }));
      else if (shape === "square") node.appendChild(el("rect", { x: -r, y: -r, width: 2 * r, height: 2 * r, rx: 4 * scale, fill: fill, stroke: ink, "stroke-width": 2 }));
      else node.appendChild(el("circle", { cx: 0, cy: 0, r: r, fill: fill, stroke: ink, "stroke-width": 2 }));
      // Chasuble : plaque INTERIEURE au jeton, pas un anneau exterieur — un
      // anneau exterieur pouvait se confondre avec le maillot d'une autre
      // equipe si la teinte se ressemblait. En restant a l'interieur, le
      // contour du jeton (rond/carre) garde seul la couleur d'equipe qui dit
      // l'appartenance ; la chasuble ne peut plus etre lue comme une couleur
      // d'equipe. Reprend la meme silhouette que le jeton, reduite, pour
      // rester coherente quelle que soit la forme (rond, carre, triangle...).
      if (e.bib) {
        var bibCol = e.bibColor || BIB, br = r * 0.72;
        var bibPts = shapePoints(shape, br);
        if (bibPts) node.appendChild(el("polygon", { points: bibPts, fill: bibCol, stroke: ink, "stroke-width": 1.2 }));
        else if (shape === "square") node.appendChild(el("rect", { x: -br, y: -br, width: 2 * br, height: 2 * br, rx: 3 * scale, fill: bibCol, stroke: ink, "stroke-width": 1.2 }));
        else node.appendChild(el("circle", { cx: 0, cy: 0, r: br, fill: bibCol, stroke: ink, "stroke-width": 1.2 }));
      }
      // showNumber absent = numero affiche : c'etait le comportement d'avant,
      // seul un false explicite le masque. Lisere sombre uniquement avec
      // chasuble : le numero doit rester lisible sur une plaque interieure de
      // couleur quelconque, claire comme foncee.
      if (e.label && e.showNumber !== false) {
        var fs = r * 0.9;
        node.appendChild(textNode(0, fs * 0.35, e.label, fs, ts.text, e.bib ? { bold: true, halo: "#12140f" } : { bold: true }));
      }
      if (e.showName && e.role) {
        var nf = Math.max(8, r * 0.72);
        node.appendChild(textNode(0, r * 1.62 + nf, e.role, nf, "#ffffff", { bold: true, halo: "#12140f" }));
      }
    }
    if (opts.onDown) node.addEventListener("pointerdown", opts.onDown);
    else node.style.pointerEvents = "none";
    if (opts.onContextMenu) node.addEventListener("contextmenu", opts.onContextMenu);
    svg.appendChild(node);
  }

  function annoColor(type) { return (type === "pass" || type === "shot") ? "#ffe14d" : "#ffffff"; }
  function annoDash(type) { return type === "run" ? "7 5" : type === "dribble" ? "2 4" : "0"; }
  // Opacite des fleches de mouvement (demande Robin 2026-09-26) — DIM garde le
  // meme ratio qu'avant (moitie moins visible) pour les fleches de contexte
  // du mode avance (cf renderAdvancedPitchEntities, editor.js).
  var ARROW_OPACITY = 0.7, ARROW_OPACITY_DIM = 0.35;

  function drawAnnotation(svg, g, a, i, opts) {
    opts = opts || {};
    var x1 = g.px(a.from.x), y1 = g.py(a.from.y), x2 = g.px(a.to.x), y2 = g.py(a.to.y);
    var color = annoColor(a.type), mid = "mk" + i + "-" + Math.round(x2) + "-" + Math.round(y2);
    var sw = a.width || 2, k = sw / 2.5;
    var dash = annoDash(a.type);
    var defs = el("defs", {});
    var marker = el("marker", { id: mid, markerWidth: 9 * k, markerHeight: 9 * k, refX: 7 * k, refY: 3 * k, orient: "auto" });
    marker.appendChild(el("path", { d: "M0,0 L" + (7 * k) + "," + (3 * k) + " L0," + (6 * k) + " Z", fill: color }));
    defs.appendChild(marker); svg.appendChild(defs);
    // a.pts (spline lissee sur toutes les images cles, cf a.curve) est prioritaire
    // sur a.ctrls (points de courbure poses juste sur ce segment) — les deux
    // modes ne se combinent pas. Chaine de bezier quadratiques (cf
    // quadChainSegments) : chaque point "tire" la courbe sans y etre touche.
    var wayPts = a.pts && a.pts.length > 1 ? a.pts
      : (a.ctrls && a.ctrls.length ? quadChainPath({ x: a.from.x, y: a.from.y }, a.ctrls, { x: a.to.x, y: a.to.y }, 16) : null);
    function pathD(sx, sy) {
      if (wayPts) return wayPts.map(function (p, pi) { return (pi === 0 ? "M" : "L") + (g.px(p.x) + sx) + "," + (g.py(p.y) + sy); }).join(" ");
      return "M" + (x1 + sx) + "," + (y1 + sy) + " L" + (x2 + sx) + "," + (y2 + sy);
    }
    if (a.aerial) {
      // Ballon en l'air : ombre portee (decalage constant bas-droite, repere
      // ecran) derriere le trait normal — meme logique que l'ombre au sol du
      // ballon en vol pendant la lecture (cf renderAnimated).
      var off = sw * 1.1 + 3.5;
      var shadow = el("path", { d: pathD(off, off), fill: "none", stroke: "#000", "stroke-width": sw + 1.5, "stroke-dasharray": dash, opacity: 0.35 });
      shadow.style.pointerEvents = "none";
      svg.appendChild(shadow);
    }
    var shape = el("path", { d: pathD(0, 0), fill: "none", stroke: color, "stroke-width": sw, "stroke-dasharray": dash, "marker-end": "url(#" + mid + ")" });
    shape.style.pointerEvents = "none";
    // Fleches moins opaques par defaut (demande Robin 2026-09-26, ex-pleine
    // opacite) : moins criardes sur un schema charge. Les fleches de contexte
    // (opts.dim, mode avance) gardent le meme ratio qu'avant (moitie moins
    // visibles que les fleches normales).
    shape.setAttribute("opacity", opts.dim ? ARROW_OPACITY_DIM : ARROW_OPACITY);
    svg.appendChild(shape);
    if (a.label) svg.appendChild(textNode((x1 + x2) / 2, (y1 + y2) / 2 - 6, a.label, 11, color, { bold: true, opacity: opts.dim ? ARROW_OPACITY_DIM : ARROW_OPACITY }));
  }

  // Traits libres (droits ou courbés) que le coach dessine à la main : annotations
  // statiques, indépendantes du mouvement des entités. opts : { selected, onDown }
  function drawFreeLine(svg, g, ln, idx, opts) {
    opts = opts || {};
    var x1 = g.px(ln.x1), y1 = g.py(ln.y1), x2 = g.px(ln.x2), y2 = g.py(ln.y2);
    var color = ln.color || "#ffffff", head = ln.head || "arrow";
    var sampled = ln.ctrls && ln.ctrls.length ? quadChainPath({ x: ln.x1, y: ln.y1 }, ln.ctrls, { x: ln.x2, y: ln.y2 }, 14) : null;
    var d = sampled ? sampled.map(function (p, pi) { return (pi === 0 ? "M" : "L") + g.px(p.x) + "," + g.py(p.y); }).join(" ") : null;
    var sw = ln.width || 2, k = sw / 2.5;
    var markerAttr = {};
    if (head !== "none") {
      var mid = "fl-" + idx + "-" + head + "-" + color.replace(/[^a-z0-9]/gi, "") + "-" + sw;
      var defs = el("defs", {});
      var marker = el("marker", { id: mid, markerWidth: 9 * k, markerHeight: 9 * k, refX: (head === "bar" ? 4 : 7) * k, refY: 4 * k, orient: "auto" });
      if (head === "bar") marker.appendChild(el("line", { x1: 4 * k, y1: 0, x2: 4 * k, y2: 8 * k, stroke: color, "stroke-width": 1.8 * k }));
      else marker.appendChild(el("path", { d: "M0,0 L" + (8 * k) + "," + (4 * k) + " L0," + (8 * k) + " Z", fill: color }));
      defs.appendChild(marker); svg.appendChild(defs);
      markerAttr["marker-end"] = "url(#" + mid + ")";
    }
    if (opts.selected) {
      var haloW = sw + 3.5;
      var halo = d ? el("path", { d: d, fill: "none", stroke: COL.sel, "stroke-width": haloW, opacity: 0.5 }) : el("line", { x1: x1, y1: y1, x2: x2, y2: y2, stroke: COL.sel, "stroke-width": haloW, opacity: 0.5 });
      halo.style.pointerEvents = "none"; svg.appendChild(halo);
    }
    if (ln.aerial) {
      // Ombre portee, meme traitement que la trajectoire aerienne du ballon
      // (cf drawAnnotation) : decalage constant bas-droite (repere ecran)
      // derriere le trait normal.
      var off = sw * 1.1 + 3.5;
      var shadowD = sampled
        ? sampled.map(function (p, pi) { return (pi === 0 ? "M" : "L") + (g.px(p.x) + off) + "," + (g.py(p.y) + off); }).join(" ")
        : "M" + (x1 + off) + "," + (y1 + off) + " L" + (x2 + off) + "," + (y2 + off);
      var shadow = el("path", { d: shadowD, fill: "none", stroke: "#000", "stroke-width": sw + 1.5, "stroke-dasharray": ln.dash ? "7 5" : "none", opacity: 0.35 });
      shadow.style.pointerEvents = "none";
      svg.appendChild(shadow);
    }
    var baseAttrs = Object.assign({ fill: "none", stroke: color, "stroke-width": sw, "stroke-dasharray": ln.dash ? "7 5" : "none" }, markerAttr);
    var shape = d ? el("path", Object.assign({ d: d }, baseAttrs)) : el("line", Object.assign({ x1: x1, y1: y1, x2: x2, y2: y2 }, baseAttrs));
    shape.style.pointerEvents = "none";
    svg.appendChild(shape);
    var hit = d ? el("path", { d: d, fill: "none", stroke: "transparent", "stroke-width": 14, "data-lid": ln.id }) : el("line", { x1: x1, y1: y1, x2: x2, y2: y2, stroke: "transparent", "stroke-width": 14, cursor: opts.onDown ? "pointer" : "default", "data-lid": ln.id });
    if (opts.onDown) { hit.addEventListener("pointerdown", opts.onDown); hit.style.cursor = "pointer"; }
    else hit.style.pointerEvents = "none";
    svg.appendChild(hit);
  }

  // Texte libre posé sur le terrain (étiquette, consigne), multi-lignes possible.
  // opts : { selected, onDown }
  function drawFreeText(svg, g, tx, opts) {
    opts = opts || {};
    var size = tx.size || 13, color = tx.color || "#ffffff";
    var anchor = tx.align === "left" ? "start" : tx.align === "right" ? "end" : "middle";
    var lines = String(tx.text || "").split("\n");
    var lineH = size * 1.2, blockH = (lines.length - 1) * lineH;
    var node = el("g", { transform: "translate(" + g.px(tx.x) + "," + g.py(tx.y) + ")", cursor: opts.onDown ? "grab" : "default", "data-tid": tx.id });
    if (opts.selected) node.appendChild(el("circle", { cx: 0, cy: 0, r: size * 0.9 + 8 + blockH / 2, fill: "none", stroke: COL.sel, "stroke-width": 2 }));
    var attrs = { x: 0, y: size * 0.35 - blockH / 2, "font-size": size, "font-family": "Arial", "font-weight": tx.bold === false ? "normal" : "bold", fill: color, "text-anchor": anchor };
    if (tx.outline !== false) { attrs.stroke = "rgba(0,0,0,0.55)"; attrs["stroke-width"] = 3; attrs["paint-order"] = "stroke"; }
    var t = el("text", attrs);
    lines.forEach(function (ln, i) {
      var tsp = el("tspan", { x: 0, dy: i === 0 ? 0 : lineH });
      tsp.textContent = ln;
      t.appendChild(tsp);
    });
    node.appendChild(t);
    if (opts.onDown) node.addEventListener("pointerdown", opts.onDown);
    else node.style.pointerEvents = "none";
    svg.appendChild(node);
  }

  // Pulse : point qui clignote pour mettre un endroit en évidence (tablette
  // tactile en discussion live, ou reperage sur une image d'export). opts :
  // - { selected, onDown } en rendu interactif : clignotement perpetuel via
  //   SMIL (<animate>), independant de toute boucle JS.
  // - { phase } (0..1) en rendu anime (lecture/export) : rayon/opacite calcules
  //   explicitement a partir du temps ecoule reel, pour un clignotement
  //   deterministe et correctement cadence sur les images exportees (GIF/MP4).
  function drawPulse(svg, g, pu, opts) {
    opts = opts || {};
    var cx = g.px(pu.x), cy = g.py(pu.y);
    var color = pu.color || "#ff3b30";
    var baseR = 6 * (pu.size || 1);
    var node = el("g", { cursor: opts.onDown ? "grab" : "default", "data-pid": pu.id });
    if (opts.selected) node.appendChild(el("circle", { cx: cx, cy: cy, r: baseR + 16, fill: "none", stroke: COL.sel, "stroke-width": 2 }));
    if (typeof opts.phase === "number") {
      var ringR = baseR + opts.phase * baseR * 2.6;
      var ringOp = 0.8 * (1 - opts.phase);
      node.appendChild(el("circle", { cx: cx, cy: cy, r: ringR, fill: "none", stroke: color, "stroke-width": 2.5, opacity: ringOp }));
    } else {
      var maxR = baseR + baseR * 2.6;
      var ring = el("circle", { cx: cx, cy: cy, r: baseR, fill: "none", stroke: color, "stroke-width": 2.5, opacity: 0.8 });
      ring.appendChild(el("animate", { attributeName: "r", values: baseR + ";" + maxR + ";" + baseR, dur: (PULSE_PERIOD_MS / 1000) + "s", repeatCount: "indefinite" }));
      ring.appendChild(el("animate", { attributeName: "opacity", values: "0.8;0;0.8", dur: (PULSE_PERIOD_MS / 1000) + "s", repeatCount: "indefinite" }));
      node.appendChild(ring);
    }
    node.appendChild(el("circle", { cx: cx, cy: cy, r: baseR * 0.55, fill: color, opacity: 0.95 }));
    if (opts.onDown) node.addEventListener("pointerdown", opts.onDown);
    else node.style.pointerEvents = "none";
    svg.appendChild(node);
  }

  // Resynchronise drill.keyframes[kfIdx].entities depuis la timeline canonique
  // (SPEC_TIMELINE_AVANCEE) — computeArrows/curvePoints/entityAt lisent encore
  // ce tableau directement ; sans ca, un rendu apres edition (drag en cours,
  // export juste apres une modif) afficherait un etat perime au lieu de l'etat
  // courant. No-op si drill.timeline n'existe pas (drill jamais migre).
  function syncEntitiesFromTimeline(drill, kfIdx) {
    var tl = drill.timeline;
    if (!tl || kfIdx < 0 || kfIdx >= drill.keyframes.length) return;
    var bm = stepBoundariesMs(drill);
    drill.keyframes[kfIdx].entities = Object.keys(tl.entities).map(function (id) { return entityStateAt(tl, id, kfIdx, bm); }).filter(Boolean);
  }
  // Rendu statique (non interactif) d'une keyframe : dispositif + flèches du segment.
  // ---- Ordre d'empilement (calques) ----
  // L'empilement etait jusqu'ici fige par l'ordre des appels : fond, zones,
  // fleches, traits, textes, entites, pulses. Ces rangs deviennent de simples
  // valeurs par defaut, qu'une carte drill.zOrder (id -> rang) surcharge objet
  // par objet. Un procede sans zOrder retombe exactement sur l'ordre historique,
  // donc aucun rendu existant ne bouge.
  var Z_BASE = { zone: 1000, arrow: 2000, line: 3000, text: 4000, entity: 5000, pulse: 6000 };
  function zOf(drill, kind, id, index) {
    var custom = drill.zOrder && drill.zOrder[id];
    return typeof custom === "number" ? custom : Z_BASE[kind] + index;
  }
  // Les fleches sont derivees du mouvement, pas des objets poses par le coach :
  // elles gardent leur rang fixe et n'apparaissent pas dans le panneau calques.
  function runLayered(tasks) {
    tasks.sort(function (a, b) { return a.z - b.z; });
    tasks.forEach(function (t) { t.run(); });
  }

  function renderStatic(svg, drill, kfIndex) {
    kfIndex = Math.max(0, Math.min(kfIndex || 0, drill.keyframes.length - 1));
    clear(svg);
    var g = geo(drill);
    syncEntitiesFromTimeline(drill, kfIndex); syncEntitiesFromTimeline(drill, kfIndex - 1);
    drawPitchBase(svg, drill, g);
    var zoneT = stepBoundariesMs(drill)[kfIndex] || 0;
    var tasks = [];
    (drill.zones || []).filter(function (z) { return visibleAt(z, zoneT); }).forEach(function (z, i) {
      tasks.push({ z: zOf(drill, "zone", z.id, i), run: function () { drawZone(svg, drill, g, z, {}); } });
    });
    computeArrows(drill, kfIndex).forEach(function (a, i) {
      tasks.push({ z: Z_BASE.arrow + i, run: function () { drawAnnotation(svg, g, a, i); } });
    });
    var linesG = drill.lines || buildOverlayGlobal(drill, "lines");
    linesG.filter(function (ln) { return visibleAt(ln, zoneT); }).forEach(function (ln, i) {
      tasks.push({ z: zOf(drill, "line", ln.id, i), run: function () { drawFreeLine(svg, g, ln, i, {}); } });
    });
    var textsG = drill.texts || buildOverlayGlobal(drill, "texts");
    textsG.filter(function (tx) { return visibleAt(tx, zoneT); }).forEach(function (tx, i) {
      tasks.push({ z: zOf(drill, "text", tx.id, i), run: function () { drawFreeText(svg, g, tx, {}); } });
    });
    var carriedS = carrierMap(drill.keyframes[kfIndex].entities);
    drill.keyframes[kfIndex].entities.forEach(function (e, i) {
      tasks.push({ z: zOf(drill, "entity", e.id, i), run: function () { drawEntity(svg, drill, g, e, { carrier: !!carriedS[e.id] }); } });
    });
    var pulsesG = drill.pulses || buildOverlayGlobal(drill, "pulses");
    pulsesG.filter(function (pu) { return visibleAt(pu, zoneT); }).forEach(function (pu, i) {
      tasks.push({ z: zOf(drill, "pulse", pu.id, i), run: function () { drawPulse(svg, g, pu, {}); } });
    });
    runLayered(tasks);
    return g;
  }

  // Duree du pulse (aller-retour du clignotement), en ms. Partagee entre le
  // rendu interactif (SMIL, cf drawPulse) et l'export/lecture (phase calculee).
  var PULSE_PERIOD_MS = 1400;

  // Rendu interpolé (non interactif) : p dans [0, N-1]. Entités appariées par id.
  function renderAnimated(svg, drill, p) {
    clear(svg);
    var g = geo(drill), N = drill.keyframes.length;
    var seg = Math.max(0, Math.min(Math.floor(p), N - 2)), f = p - seg;
    syncEntitiesFromTimeline(drill, seg); syncEntitiesFromTimeline(drill, seg + 1);
    drawPitchBase(svg, drill, g);
    // Temps ecoule reel (pas de f seul) : coherent entre lecture live et export
    // image par image (GIF/MP4) — sert aussi bien a la phase du pulse qu'a la
    // fenetre de presence des zones/traits/pulses (cf visibleAt).
    var elapsedMs = 0;
    for (var k = 0; k < seg; k++) elapsedMs += drill.keyframes[k].durationMs || 1500;
    elapsedMs += f * (drill.keyframes[seg].durationMs || 1500);
    // drill.timeline (canonique) prefere a une reconstruction fraiche — lu ici
    // deja (avant, seule la resolution de position plus bas s'en servait) pour
    // que les fleches (computeArrowsAtMs) soient calculees sur les memes clips
    // per-entite que la position des jetons, avec la meme precision a la ms.
    var tl = drill.timeline || buildEntityTimeline(drill);
    var tasks = [];
    (drill.zones || []).filter(function (z) { return visibleAt(z, elapsedMs); }).forEach(function (z, i) {
      tasks.push({ z: zOf(drill, "zone", z.id, i), run: function () { drawZone(svg, drill, g, z, {}); } });
    });
    computeArrowsAtMs(drill, tl, elapsedMs).forEach(function (a, i) {
      tasks.push({ z: Z_BASE.arrow + i, run: function () { drawAnnotation(svg, g, a, i); } });
    });
    var linesG2 = drill.lines || buildOverlayGlobal(drill, "lines");
    linesG2.filter(function (ln) { return visibleAt(ln, elapsedMs); }).forEach(function (ln, i) {
      tasks.push({ z: zOf(drill, "line", ln.id, i), run: function () { drawFreeLine(svg, g, ln, i, {}); } });
    });
    var textsG2 = drill.texts || buildOverlayGlobal(drill, "texts");
    textsG2.filter(function (tx) { return visibleAt(tx, elapsedMs); }).forEach(function (tx, i) {
      tasks.push({ z: zOf(drill, "text", tx.id, i), run: function () { drawFreeText(svg, g, tx, {}); } });
    });
    var pulsePhase = (elapsedMs % PULSE_PERIOD_MS) / PULSE_PERIOD_MS;
    var A = drill.keyframes[seg].entities, B = drill.keyframes[seg + 1] ? drill.keyframes[seg + 1].entities : A;
    // Position resolue par le meme moteur de timeline (tl, clips par entite,
    // instant absolu elapsedMs, cf plus haut) — remplace l'ancienne resolution
    // inline hold/curve/ctrls/lineaire par segment. Parite verifiee (cf
    // SPEC_TIMELINE_AVANCEE).
    var carriedA = carrierMap(A);
    A.forEach(function (ea, ei) {
      var eb = findById(B, ea.id) || ea;
      var e = JSON.parse(JSON.stringify(ea));
      var pos = sampleEntityAt(tl, ea.id, elapsedMs) || ea;
      e.x = pos.x; e.y = pos.y;
      var liftScale = 1;
      if (ea.type === "ball" && ea.aerial && (ea.x !== eb.x || ea.y !== eb.y)) {
        // Cloche parabolique (monte puis redescend, max a mi-trajet) + ombre au
        // sol qui retrecit a mesure que le ballon "monte" — a l'inverse du
        // ballon qui grossit. Vu de haut il n'y a pas de vraie 3e dimension,
        // mais grossir/retrecir en tandem est la convention 2D la plus lisible
        // pour suggerer la hauteur (cf jeux de plateforme vus du dessus).
        liftScale = 1 + 0.9 * Math.sin(Math.PI * Math.max(0, Math.min(1, f)));
      }
      var shadow = liftScale !== 1 ? Math.max(0.35, 1 / liftScale) : 0;
      // L'ombre au sol et son ballon forment une seule tache : les separer les
      // laisserait s'intercaler autour d'un autre objet au tri.
      tasks.push({ z: zOf(drill, "entity", ea.id, ei), run: function () {
        if (shadow) svg.appendChild(el("ellipse", { cx: g.px(e.x), cy: g.py(e.y), rx: 6 * shadow, ry: 6 * shadow * 0.45, fill: "#000", opacity: 0.28 }));
        drawEntity(svg, drill, g, e, { liftScale: liftScale, carrier: !!carriedA[ea.id] });
      } });
    });
    var pulsesG2 = drill.pulses || buildOverlayGlobal(drill, "pulses");
    pulsesG2.filter(function (pu) { return visibleAt(pu, elapsedMs); }).forEach(function (pu, i) {
      tasks.push({ z: zOf(drill, "pulse", pu.id, i), run: function () { drawPulse(svg, g, pu, { phase: pulsePhase }); } });
    });
    runLayered(tasks);
    return g;
  }

  // ---- Timeline (clips) : fondation du mode avance (SPEC_TIMELINE_AVANCEE) ----
  // Nouveau moteur base sur une position temporelle absolue (ms) plutot que sur
  // un index d'etape fractionnaire — chaque entite pourra a terme demarrer/finir
  // independamment des autres. Purement additif pour l'instant : n'est branche
  // sur aucun chemin de rendu existant (renderAnimated/renderStatic inchanges).
  //
  // Migre le modele actuel (keyframes[] de snapshots) vers une liste de clips par
  // entite. Un clip n'est cree que si la position change reellement entre deux
  // etapes consecutives — entre deux clips (ou avant le premier), l'entite tient
  // simplement sa derniere position ("hold"), sans clip dedie : c'est deja le
  // comportement du modele actuel (cf forwardHoldChain dans editor.js), rendu
  // explicite ici plutot qu'implicite.
  // Un clip est cree pour CHAQUE segment ou l'entite existe des deux cotes —
  // meme sans mouvement (contrairement a une version precedente qui omettait
  // les segments immobiles). Deux raisons : (1) ca garantit une correspondance
  // 1-a-1 entre index de clip et index d'etape, ce qui evite une classe de bug
  // deja rencontree (voisins de tangente `curve` mal alignes quand des holds
  // decalent les index) ; (2) le style d'une entite (couleur/forme/taille/role)
  // peut aujourd'hui varier d'une etape a l'autre meme sans deplacement — sans
  // clip pour ce segment, un changement de style sans mouvement serait perdu a
  // la migration. `to` porte donc l'etat COMPLET de l'entite (pas seulement
  // x/y) atteint a la fin du clip ; `toX`/`toY` restent exposes a part pour le
  // rendu interpole (sampleEntityAt), qui n'a besoin que de la position.
  function buildEntityTimeline(drill) {
    var kfs = drill.keyframes, N = kfs.length;
    var ids = {};
    kfs.forEach(function (kf) { kf.entities.forEach(function (e) { ids[e.id] = true; }); });
    var startMsAt = [0];
    for (var k = 0; k < N - 1; k++) startMsAt.push(startMsAt[k] + (kfs[k].durationMs || 1500));
    var entities = {};
    Object.keys(ids).forEach(function (id) {
      var clips = [], spawn = null;
      for (var seg = 0; seg < N - 1; seg++) {
        var ea = findById(kfs[seg].entities, id), eb = findById(kfs[seg + 1].entities, id);
        if (!ea || !eb) continue;
        if (spawn === null) spawn = JSON.parse(JSON.stringify(ea));
        var clip = { startMs: startMsAt[seg], durationMs: kfs[seg].durationMs || 1500, toX: eb.x, toY: eb.y, to: JSON.parse(JSON.stringify(eb)) };
        if (ea.x !== eb.x || ea.y !== eb.y) {
          if (ea.curve) clip.curve = true;
          if (ea.ctrls && ea.ctrls.length) clip.ctrls = ea.ctrls;
        }
        clips.push(clip);
      }
      if (spawn === null) { var first = findById(kfs[0].entities, id); spawn = first ? JSON.parse(JSON.stringify(first)) : { x: 0, y: 0 }; }
      entities[id] = { spawn: spawn, clips: clips };
    });
    return { totalMs: startMsAt[N - 1] || 0, entities: entities };
  }
  // Etat complet (position + style) d'une entite exactement a la frontiere
  // d'etape kfIdx — utilise par le mode simple (materialise une vue
  // "keyframes[kfIdx].entities"-compatible depuis la timeline canonique).
  function entityStateAt(tl, id, kfIdx, boundaryMs) { return entityStateAtMs(tl, id, boundaryMs[kfIdx]); }
  // Meme logique qu'entityStateAt mais parametree par un instant absolu (ms)
  // plutot qu'un index d'etape — necessaire pour le mode avance, ou un clic
  // sur une piste vide (donc necessairement dans un "hold") doit retrouver
  // l'etat qui y tient, sans passer par une frontiere d'etape.
  function entityStateAtMs(tl, id, t) {
    var rec = tl.entities[id];
    if (!rec) return null;
    var state = rec.spawn;
    for (var i = 0; i < rec.clips.length; i++) {
      var c = rec.clips[i];
      if (c.startMs + c.durationMs > t) break;
      state = c.to;
    }
    return state;
  }
  // Frontieres temporelles (ms) de chaque etape courante — memes valeurs que
  // startMsAt dans buildEntityTimeline, exposees a part pour que le mode
  // simple (editor.js) puisse localiser "la frontiere kfIdx" sans dupliquer
  // le calcul de marche cumulee des durationMs.
  function stepBoundariesMs(drill) {
    var kfs = drill.keyframes, out = [0];
    for (var k = 0; k < kfs.length - 1; k++) out.push(out[k] + (kfs[k].durationMs || 1500));
    return out;
  }
  // Ecrit l'etat COMPLET (position + style, meme forme qu'un entityStateAt) a
  // la frontiere kfIdx dans la timeline canonique tl — l'inverse d'entityStateAt.
  // Met a jour le clip ENTRANT (arrivee a kfIdx) pour la position/le style, et
  // le clip SORTANT (depart de kfIdx) pour le style de mouvement (ctrls/curve),
  // exactement comme l'ancien modele ou ces deux informations vivaient sur le
  // meme objet keyframes[kfIdx].entities[id] mais decrivaient deux segments
  // differents. N = nombre d'etapes courant.
  function commitEntityStateAt(tl, id, kfIdx, N, fullSnapshot) {
    var rec = tl.entities[id];
    if (!rec) return;
    var full = JSON.parse(JSON.stringify(fullSnapshot));
    if (kfIdx === 0) rec.spawn = full;
    else { var incoming = rec.clips[kfIdx - 1]; if (incoming) { incoming.to = full; incoming.toX = full.x; incoming.toY = full.y; } }
    if (kfIdx < N - 1) {
      var outgoing = rec.clips[kfIdx];
      if (outgoing) {
        if (full.curve) outgoing.curve = true; else delete outgoing.curve;
        if (full.ctrls && full.ctrls.length) outgoing.ctrls = full.ctrls; else delete outgoing.ctrls;
      }
    }
  }
  // Ajoute une entite a la timeline, presente identiquement (meme etat) sur
  // toute la duree courante — equivalent timeline de l'ancien addEntityAllKf
  // (qui poussait une copie dans CHAQUE keyframes[i].entities). boundaryMs
  // vient de stepBoundariesMs(drill).
  function addEntityToTimeline(tl, drill, boundaryMs, fullSnapshot) {
    var kfs = drill.keyframes, N = kfs.length, full = JSON.parse(JSON.stringify(fullSnapshot));
    var clips = [];
    for (var seg = 0; seg < N - 1; seg++) {
      clips.push({ startMs: boundaryMs[seg], durationMs: kfs[seg].durationMs || 1500, toX: full.x, toY: full.y, to: JSON.parse(JSON.stringify(full)) });
    }
    tl.entities[full.id] = { spawn: full, clips: clips };
  }
  // Position d'une entite a l'instant absolu t (ms), a partir d'une timeline
  // construite par buildEntityTimeline. Meme mathematique de courbe que
  // renderAnimated (curve : Catmull-Rom sur les voisins temporels ; ctrls :
  // meme bezier quadratique a point unique que drawAnnotation) — parite
  // verifiee point par point contre l'ancien moteur (cf ecran de test).
  function sampleEntityAt(tl, id, t) {
    var rec = tl.entities[id];
    if (!rec) return null;
    var clips = rec.clips, pos = { x: rec.spawn.x, y: rec.spawn.y };
    for (var i = 0; i < clips.length; i++) {
      var c = clips[i];
      if (t < c.startMs) break;
      var end = c.startMs + c.durationMs;
      if (t >= end) { pos = { x: c.toX, y: c.toY }; continue; }
      var f = c.durationMs > 0 ? (t - c.startMs) / c.durationMs : 1;
      var fromX = pos.x, fromY = pos.y;
      if (c.curve) {
        // Voisins de tangente au sens des ETAPES (comme l'ancien entityAt) :
        // calcules a la volee via l'index de clip (correspondance 1-a-1 avec
        // les segments, cf buildEntityTimeline), donc toujours a jour meme
        // apres une edition — pas de valeur figee a rafraichir.
        var p0 = (i >= 2) ? { x: clips[i - 2].toX, y: clips[i - 2].toY } : { x: rec.spawn.x, y: rec.spawn.y };
        var p3 = (i + 1 < clips.length) ? { x: clips[i + 1].toX, y: clips[i + 1].toY } : { x: c.toX, y: c.toY };
        return { x: catmullRom1D(p0.x, fromX, c.toX, p3.x, f), y: catmullRom1D(p0.y, fromY, c.toY, p3.y, f) };
      }
      if (c.ctrls && c.ctrls.length) {
        return quadChainPointAt({ x: fromX, y: fromY }, c.ctrls, { x: c.toX, y: c.toY }, f);
      }
      return { x: fromX + (c.toX - fromX) * f, y: fromY + (c.toY - fromY) * f };
    }
    return pos;
  }

  return {
    COL: COL, ZFILL: ZFILL, el: el, clear: clear, round1: round1, findById: findById,
    geo: geo, penArea: penArea, textNode: textNode, computeArrows: computeArrows,
    drawPitchBase: drawPitchBase, drawZone: drawZone, drawEntity: drawEntity, visibleAt: visibleAt, buildOverlayGlobal: buildOverlayGlobal,
    annoColor: annoColor, annoDash: annoDash, drawAnnotation: drawAnnotation, drawFreeLine: drawFreeLine, drawFreeText: drawFreeText, drawPulse: drawPulse,
    zOf: zOf, Z_BASE: Z_BASE, WOOD_DEFAULT: WOOD_DEFAULT, WOOD_LINE_DEFAULT: WOOD_LINE_DEFAULT,
    TEAM_DEFAULTS: TEAM_DEFAULTS, teamKeyOf: teamKeyOf, teamStyle: teamStyle, carrierMap: carrierMap, EQUIP: EQUIP, BIB: BIB,
    renderStatic: renderStatic, renderAnimated: renderAnimated,
    buildEntityTimeline: buildEntityTimeline, sampleEntityAt: sampleEntityAt, entityStateAt: entityStateAt,
    stepBoundariesMs: stepBoundariesMs, commitEntityStateAt: commitEntityStateAt, addEntityToTimeline: addEntityToTimeline, entityStateAtMs: entityStateAtMs
  };
})();
