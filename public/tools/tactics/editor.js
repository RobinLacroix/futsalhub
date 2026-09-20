(function () {
  "use strict";
  var K = window.FUTSAL_KNOWLEDGE || { levers: [], corridorPresets: {} };
  var svg = document.getElementById("pitch");
  // Cible d'ajout des elements dessines : svg lui-meme en vue normale, ou un
  // groupe pivote (demi-terrain portrait) — voir render(). Les evenements et
  // createSVGPoint() restent sur svg (seul le vrai <svg> racine les expose).
  var rt = svg;
  // Moteur de rendu partage : source de verite unique (voir render-core.js).
  var R = window.DrillRender;
  var M = 38;
  var COL = R.COL, ZFILL = R.ZFILL;
  var selEntity = null, selZone = null, pendingTool = null, armedBtn = null, zid = 1, lid = 1, tid = 1, pid = 1, vid = 1, clipboard = null;
  // Mode avance (SPEC_TIMELINE_AVANCEE) : timeline libre en lecture seule pour
  // l'instant (Milestone 4) — le glisser de clip arrive au Milestone 5, avec le
  // passage du stockage canonique en clips (Milestone 3).
  var advancedMode = false;
  var curKf = 0, playing = false, rafId = null, selAnno = null, selLine = null, selText = null, selPulse = null, playSpeed = 1;
  var polyDraft = null; // dessin en cours d'une zone libre (jonction de traits)
  var currentDrillId = null; // id du procede en cours dans la bibliotheque (null = non enregistre)
  // Embarque dans la webapp (iframe de app/webapp/library/schematics) : la
  // sauvegarde/le chargement passent par le parent (postMessage) au lieu de
  // DrillStore/localStorage, qui restent la source de verite en usage
  // standalone (cf PLAN_INTEGRATION_EDITEUR_TACTIQUE_PHASE0_2026-09.md,
  // etape 3). teamId/embeddedDrillId arrivent avec le message INIT.
  var embedded = window.parent !== window;
  var embeddedTeamId = null, embeddedDrillId = null;
  // Selection multiple : [{kind:'entity'|'zone'|'line'|'text'|'pulse', ref}]. Active
  // des qu'on utilise Maj+clic ou une zone de selection ; independante des variables
  // selEntity/selZone/... qui restent la source de verite pour la selection simple
  // (et son inspecteur detaille par type).
  var multiSel = [];

  var drill = defaultDrill();

  function defaultDrill() {
    var kfs = [{ label: "Dispositif", durationMs: 1500, entities: [], annotations: [], lines: [], texts: [], pulses: [] }];
    return {
      meta: { category: "entrainement", subcategory: "", title: "", theme: "", phase: "situation", phaseCible: "", formeJouee: true, objectif: "", nbJoueurs: 8, dureeMin: 20, intensite: "elevee", philosophyTags: [], moyensTechnicoTactiques: [] },
      pitch: { length: 40, width: 20, markings: "full" },
      zones: [],
      keyframes: kfs,
      // variants : autres suites possibles a partir du meme procede (ex : 2 combinaisons
      // differentes sur le meme corner). drill.keyframes est toujours LA MEME reference
      // que variants[activeVariantIndex].keyframes — voir ensureVariants() — donc tout le
      // code existant qui lit/mute drill.keyframes reste valable sans changement.
      variants: [{ id: "var-" + (vid++), name: "Variante 1", keyframes: kfs }],
      activeVariantIndex: 0,
      rules: { scoring: [], comportements: [], mecanismes: [], variablesPlus: [], variablesMinus: [] }
    };
  }
  // Garantit drill.variants/activeVariantIndex coherents et drill.keyframes ==
  // (meme reference que) variants[activeVariantIndex].keyframes. A appeler apres
  // toute (re)affectation complete de `drill` (chargement, import, undo/redo...).
  function ensureVariants() {
    if (!drill.variants || !drill.variants.length) {
      drill.variants = [{ id: "var-" + (vid++), name: "Variante 1", keyframes: drill.keyframes }];
      drill.activeVariantIndex = 0;
      return;
    }
    if (typeof drill.activeVariantIndex !== "number" || drill.activeVariantIndex < 0 || drill.activeVariantIndex >= drill.variants.length) {
      drill.activeVariantIndex = 0;
    }
    drill.keyframes = drill.variants[drill.activeVariantIndex].keyframes;
    // PAS de ensureTimeline() ici : cette fonction tourne AVANT
    // ensureAnnotations() a chaque point de chargement (import, undo,
    // reset...), qui migre encore ctrl->ctrls sur les entites brutes —
    // construire la timeline ici la figerait sur des donnees non migrees.
    // ensureTimeline() est donc appelee explicitement apres ensureAnnotations()
    // a chaque site de chargement, et directement dans switchVariant/
    // addVariant/deleteVariant (donnees deja en memoire, deja migrees).
  }
  // Timeline canonique des entites (SPEC_TIMELINE_AVANCEE, Milestone 3) : vit
  // sur la variante active (drill.variants[i].timeline), meme principe d'alias
  // que drill.keyframes == variants[i].keyframes. Construite paresseusement
  // (une seule fois par variante, puis mise a jour incrementalement par
  // commitEntityStateAt/addEntityToTimeline — jamais reconstruite en entier
  // apres modification, pour ne pas ecraser un decalage du mode avance).
  function ensureTimeline() {
    var v = drill.variants ? drill.variants[drill.activeVariantIndex] : null;
    if (v) { if (!v.timeline) v.timeline = R.buildEntityTimeline(drill); drill.timeline = v.timeline; }
    else if (!drill.timeline) drill.timeline = R.buildEntityTimeline(drill);
  }
  // Meme mecanique qu'ensureTimeline, pour les traits libres, les pulses et
  // les textes (Phase 2) : drill.lines/drill.pulses/drill.texts deviennent
  // globaux (une fenetre de presence par objet, cf visibleAt), plus per-etape.
  // Les textes avaient un mecanisme different (grille "Apparait sur" par
  // groupId, presence non contigue + position independante par etape) mais
  // Robin a prefere le remplacer par cette meme fenetre continue, plus simple
  // et coherente avec zones/traits/pulses — au prix de cette flexibilite.
  var OVERLAY_KEYS = ["lines", "pulses", "texts"];
  function ensureOverlays() {
    var v = drill.variants ? drill.variants[drill.activeVariantIndex] : null;
    OVERLAY_KEYS.forEach(function (key) {
      var gkey = key + "Global";
      if (v) { if (!v[gkey]) v[gkey] = R.buildOverlayGlobal(drill, key); drill[key] = v[gkey]; }
      else if (!drill[key]) drill[key] = R.buildOverlayGlobal(drill, key);
    });
  }
  function boundaryMs() { return R.stepBoundariesMs(drill); }
  // Index d'etape (0-based) couvrant l'instant ms, sur les frontieres bm de
  // stepBoundariesMs — utilise pour traduire visibleFrom/visibleTo (ms) d'un
  // trait libre en un couple d'etapes affichable en mode simple (cf
  // buildLineEditPop). Tolere un ms non aligne sur une frontiere (ex: fenetre
  // posee en mode avance) en retombant sur l'etape qui la contient.
  function stepIdxAtMs(bm, ms) {
    for (var i = 0; i < bm.length - 1; i++) { if (ms < bm[i + 1]) return i; }
    return bm.length - 1;
  }
  // Fenetre de presence -> couple d'etapes [from, to] (inclusif), pour peupler
  // les deux listes deroulantes du panneau. Absence de visibleFrom/visibleTo
  // (comportement historique) = presence sur toute la duree = [0, N-1].
  function lineVisibleStepRange(o, bm, N) {
    var from = o.visibleFrom != null ? stepIdxAtMs(bm, o.visibleFrom) : 0;
    var to = o.visibleTo != null ? stepIdxAtMs(bm, Math.max(0, o.visibleTo - 1)) : N - 1;
    return { from: from, to: Math.max(from, to) };
  }
  // Inverse : ecrit visibleFrom/visibleTo a partir d'un couple d'etapes.
  // Couvrir [0, N-1] (toutes les etapes) retire les deux champs au lieu de les
  // ecrire explicitement, pour rester identique au comportement par defaut
  // (et ne pas polluer l'export d'un procede qui n'utilise pas cette fenetre).
  function setLineVisibleStepRange(o, bm, N, from, to) {
    if (from > 0) o.visibleFrom = bm[from]; else delete o.visibleFrom;
    if (to < N - 1) o.visibleTo = bm[to + 1]; else delete o.visibleTo;
  }
  // Un mouvement "desynchronise" (au moins un clip dont le debut ou la fin ne
  // tombe pas pile sur une frontiere d'etape du mode simple) trahit un
  // procede construit en mode avance — l'ouvrir en mode simple casserait
  // visuellement l'affichage (curKf ne represente alors plus un instant
  // coherent pour tout le monde a la fois), cf remontee de Robin ("ça casse
  // tout en mode simple"). Detecte a chaque chargement (cf applyDrill/
  // loadExample) pour rouvrir directement dans le bon mode.
  function drillHasDesyncedMovement() {
    var tl = drill.timeline; if (!tl) return false;
    var bmSet = {}; boundaryMs().forEach(function (ms) { bmSet[ms] = true; });
    return Object.keys(tl.entities).some(function (id) {
      return tl.entities[id].clips.some(function (c) { return !bmSet[c.startMs] || !bmSet[c.startMs + c.durationMs]; });
    });
  }
  function enterAdvancedModeIfDesynced() {
    advancedMode = drillHasDesyncedMovement();
    selClip = null; advCursorMs = null; multiSelClips = [];
    document.getElementById("simpleSeqbar").classList.toggle("hidden", advancedMode);
  }
  // Materialise l'etat (position + style) de toutes les entites A LA
  // FRONTIERE curKf, dans un tableau au meme format que l'ancien
  // keyframes[curKf].entities — code de lecture/edition existant (drag,
  // inspecteur, roster...) continue de fonctionner sans modification, tant
  // qu'il mute les objets renvoyes par ents() puis que commitEnts() est
  // appele (cf syncJSON) pour ecrire les changements dans drill.timeline.
  // Cache par curKf : necessaire pour que deux appels a ents() DURANT un
  // meme geste (ex. drag : plusieurs render() avant le pointerup) voient et
  // mutent les memes objets, pas des copies fraiches a chaque fois.
  var entsCache = { kfIdx: -1, arr: null, N: -1 };
  function invalidateEntsCache() { entsCache.kfIdx = -1; }
  function ents() {
    var N = drill.keyframes.length;
    if (entsCache.kfIdx === curKf && entsCache.N === N) return entsCache.arr;
    ensureTimeline(); ensureOverlays();
    var bm = boundaryMs(), tl = drill.timeline;
    var arr = Object.keys(tl.entities).map(function (id) { return R.entityStateAt(tl, id, curKf, bm); }).filter(Boolean);
    entsCache = { kfIdx: curKf, arr: arr, N: N };
    return arr;
  }
  // Ecrit l'etat courant de ents() (eventuellement mute par l'appelant) dans
  // drill.timeline — appele au debut de render(), donc apres toute mutation
  // (le code existant mute toujours puis appelle render()). L'ajout passe par
  // addEntityAllKf et la suppression par removeEntityAllKf (pas par diff ici) :
  // les deux invalident le cache pour eviter qu'une entite tout juste
  // supprimee soit "ressuscitee" par un commit qui la trouverait encore dans
  // entsCache.arr.
  function commitEnts() {
    if (entsCache.kfIdx !== curKf) return; // rien materialise pour cette frontiere : rien a ecrire
    var tl = drill.timeline, N = drill.keyframes.length;
    entsCache.arr.forEach(function (e) { if (tl.entities[e.id]) R.commitEntityStateAt(tl, e.id, curKf, N, e); });
  }
  function entsAt(seg) {
    if (seg === curKf) return ents();
    ensureTimeline(); ensureOverlays();
    var bm = boundaryMs(), tl = drill.timeline;
    return Object.keys(tl.entities).map(function (id) { return R.entityStateAt(tl, id, seg, bm); }).filter(Boolean);
  }
  function annos() { var kf = drill.keyframes[curKf]; if (!kf.annotations) kf.annotations = []; return kf.annotations; }
  // Migre l'ancien point de controle unique `ctrl` vers `ctrls` (tableau, 0+
  // points) — permet plusieurs points de courbure par trait/segment au lieu
  // d'un seul. Le point existant est conserve en premier point du tableau (le
  // trait passera desormais exactement par lui, au lieu d'etre seulement
  // "tire" vers lui : leger changement visuel assume pour les traits courbes
  // deja crees, en echange de la liberte de rajouter des points).
  function migrateCtrl(obj) {
    if (obj.ctrl && !obj.ctrls) obj.ctrls = [{ x: obj.ctrl.x, y: obj.ctrl.y }];
    if (!obj.ctrls) obj.ctrls = [];
    delete obj.ctrl;
  }
  function ensureAnnotations() {
    (drill.variants || [{ keyframes: drill.keyframes }]).forEach(function (v) {
      v.keyframes.forEach(function (kf) {
        if (!kf.annotations) kf.annotations = []; if (!kf.lines) kf.lines = []; if (!kf.texts) kf.texts = []; if (!kf.pulses) kf.pulses = [];
        kf.entities.forEach(migrateCtrl);
        kf.lines.forEach(migrateCtrl);
      });
    });
  }
  // Globaux (Phase 2, cf ensureOverlays) : retourne drill.lines/drill.texts/
  // drill.pulses tel quel, non filtre par presence — l'appelant (render,
  // hit-test, creation, suppression) decide s'il veut filtrer.
  function linesArr() { ensureOverlays(); return drill.lines; }
  function textsArr() { ensureOverlays(); return drill.texts; }
  function pulsesArr() { ensureOverlays(); return drill.pulses; }
  function findById(arr, id) { for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i]; return null; }
  // Plusieurs ballons peuvent coexister (sources de balle) : retrouve celui
  // qu'un joueur donne porte reellement (attachedTo), plutot que de supposer
  // "le" ballon comme avant (premier ballon trouve, faux des qu'il y en a
  // plusieurs — cf onEntityDown, resetEntityToPrevPosition, drawCtrlHandle).
  function ballCarriedBy(ents, playerId) {
    for (var i = 0; i < ents.length; i++) { var e = ents[i]; if (e.type === "ball" && e.attachedTo === playerId) return e; }
    return null;
  }
  // Ajoute une entite, presente identiquement sur toute la duree du procede —
  // equivalent a l'ancien "push dans chaque keyframes[i].entities", porte par
  // la timeline canonique (une entite existe globalement ou pas du tout, plus
  // de divergence possible entre etapes a synchroniser).
  function addEntityAllKf(base) {
    ensureTimeline(); ensureOverlays();
    var full = JSON.parse(JSON.stringify(base));
    R.addEntityToTimeline(drill.timeline, drill, boundaryMs(), full);
    invalidateEntsCache();
    return R.entityStateAt(drill.timeline, full.id, curKf, boundaryMs());
  }
  function removeEntityAllKf(id) {
    ensureTimeline(); ensureOverlays();
    delete drill.timeline.entities[id];
    invalidateEntsCache();
    // Le clip edite dans la timeline avancee (selClip) garde une reference
    // directe a l'objet rec de cette entite — le supprimer de la timeline ne
    // le rend pas faux (JS le garde vivant en memoire), mais l'inspecteur de
    // clip continuerait d'afficher/modifier un clip fantome, sans plus aucun
    // effet visible. A vider si c'est justement cette entite qui est editee.
    if (selClip && selClip.id === id) selClip = null;
    multiSelClips = multiSelClips.filter(function (s) { return s.id !== id; });
  }
  // Ancien garde-fou de coherence entre etapes (keyframes[].entities pouvait
  // diverger) — sans objet avec la timeline canonique (une entite existe
  // globalement, cf addEntityAllKf/removeEntityAllKf), conservee vide pour ne
  // pas toucher tous ses points d'appel.
  function syncCast() {}
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sign(v) { return v < 0 ? -1 : 1; }
  function round1(v) { return R.round1(v); }
  function el(tag, attrs) { return R.el(tag, attrs); }

  function geo() { return R.geo(drill); }
  // Marge (en metres) au-dela des lignes de touche/de but que peuvent atteindre
  // les entites (joueur/ballon/but/...) — pour poser une touche ou un corner un
  // peu en dehors du terrain. Plafonnee a 2.5m et calculee a partir de M (marge
  // reelle du viewBox) pour rester toujours visible, meme sur un petit terrain
  // custom ou l'echelle (g.sc) est plus grande.
  // 24 = rayon max de l'anneau de selection (15 * 1.6, la plus grande taille de
  // joueur possible) : il faut le soustraire de M, sinon un joueur agrandi et
  // selectionne pres du bord "un peu en dehors" se retrouve rogne par le canvas.
  function oobMargin() { return Math.min(2.2, Math.max(0, M - 24) / geo().sc); }
  function clientToMeters(evt, margin) {
    margin = margin || 0;
    var pt = svg.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
    // getScreenCTM() sur la cible reelle (rt) : elle absorbe automatiquement la
    // rotation/le cadrage du mode demi-terrain, donc le calcul metres ci-dessous
    // reste inchange, comme si on etait toujours en vue pleine largeur.
    var loc = pt.matrixTransform(rt.getScreenCTM().inverse());
    var g = geo(), p = drill.pitch;
    return { x: clamp((loc.x - M) / g.sc, -margin, p.length + margin), y: clamp(p.width - (loc.y - M) / g.sc, -margin, p.width + margin) };
  }

  function textNode(x, y, str, size, fill, opts) { return R.textNode(x, y, str, size, fill, opts); }

  // Fleches entre l'etape N et N+1 (mouvement ballon / course / conduite) : moteur partage.
  // R.computeArrows (et curvePoints/entityAt qu'elle appelle) lit encore
  // drill.keyframes[N/N+1].entities directement — on les resynchronise depuis
  // la timeline canonique juste avant, sinon les fleches resteraient figees
  // sur l'etat au dernier chargement/import au lieu de suivre les edits en
  // cours (ex. pendant un glisser). Cout negligeable : quelques entites, deux
  // etapes, a chaque appel.
  function computeArrows(N) {
    ensureTimeline(); ensureOverlays();
    var bm = boundaryMs(), tl = drill.timeline;
    [N, N + 1].forEach(function (kfIdx) {
      if (kfIdx < 0 || kfIdx >= drill.keyframes.length) return;
      drill.keyframes[kfIdx].entities = Object.keys(tl.entities).map(function (id) { return R.entityStateAt(tl, id, kfIdx, bm); }).filter(Boolean);
    });
    return R.computeArrows(drill, N);
  }

  // Rendu interactif de l'etape courante : dispositif partage (render-core) + surcouches
  // d'edition (poignees de courbe, poignees de redimensionnement de zone).
  // Cadre/pivote la cible de rendu pour le mode demi-terrain portrait : le
  // contenu est dessine exactement comme en vue pleine (memes coordonnees
  // g.px/g.py), seul un groupe <g> pivote + le viewBox racine changent ce qui
  // est visible. getScreenCTM() sur ce groupe absorbe la rotation, donc les
  // interactions (clic, glisser) restent justes sans aucun autre changement.
  function setupRenderTarget(g) {
    var view = drill.pitch.view || "full";
    if (view !== "half-left" && view !== "half-right") { rt = svg; return; }
    var wrap = el("g", {});
    svg.appendChild(wrap);
    rt = wrap;
    var half = g.px(drill.pitch.length / 2);
    if (view === "half-right") {
      wrap.setAttribute("transform", "rotate(-90)");
      svg.setAttribute("viewBox", "0 " + (-g.W) + " " + g.H + " " + (g.W - half));
    } else {
      wrap.setAttribute("transform", "rotate(90)");
      svg.setAttribute("viewBox", (-g.H) + " 0 " + g.H + " " + half);
    }
  }
  // Le panneau calques suit le terrain : tout rendu peut avoir ajoute, supprime
  // ou reordonne un objet. Declaree ici, definie plus bas (hoisting).
  function refreshLayersPanel() {
    var panel = document.getElementById("layersPanel");
    if (panel && !panel.classList.contains("hidden")) renderLayersPanel();
  }
  function render() {
    if (playing) return;
    commitEnts(); // ecrit toute mutation en attente (drag, inspecteur...) dans drill.timeline avant de (re)lire quoi que ce soit
    R.clear(svg);
    var g = geo();
    svg.style.cursor = pendingTool ? "crosshair" : "default";
    svg.setAttribute("viewBox", "0 0 " + g.W + " " + g.H); // vue pleine par defaut ; recadree ci-dessous si demi-terrain
    setupRenderTarget(g);
    R.drawPitchBase(rt, drill, g);
    // Instant de reference pour la fenetre de presence des zones/traits/
    // pulses (Phase 2, cf visibleAt) : le curseur/clip edite en mode avance,
    // sinon la frontiere de l'etape courante — meme logique que les entites.
    var overlayMs = advPitchViewActive() ? advEditTimeMs() : boundaryMs()[curKf];
    // Empilement : meme regle que render-core (drill.zOrder, defauts par
    // categorie), appliquee ici aussi pour que la vue d'edition montre
    // exactement ce que produiront la lecture et l'export.
    var layerTasks = [];
    drill.zones.filter(function (z) { return R.visibleAt(z, overlayMs); }).forEach(function (z, i) {
      layerTasks.push({ z: R.zOf(drill, "zone", z.id, i), run: function () {
        R.drawZone(rt, drill, g, z, { selected: selZone === z || isMultiSelected("zone", z), onDown: function (ev) { onZoneDown(ev, z); } });
      } });
    });
    linesArr().filter(function (ln) { return R.visibleAt(ln, overlayMs); }).forEach(function (ln, i) {
      layerTasks.push({ z: R.zOf(drill, "line", ln.id, i), run: function () {
        R.drawFreeLine(rt, g, ln, ln.id, { selected: selLine === ln || isMultiSelected("line", ln), onDown: function (ev) { onLineDown(ev, ln); } });
      } });
    });
    textsArr().filter(function (tx) { return R.visibleAt(tx, overlayMs); }).forEach(function (tx, i) {
      layerTasks.push({ z: R.zOf(drill, "text", tx.id, i), run: function () {
        R.drawFreeText(rt, g, tx, { selected: selText === tx || isMultiSelected("text", tx), onDown: function (ev) { onTextDown(ev, tx); } });
      } });
    });
    var arrows = [];
    if (advPitchViewActive()) {
      // Mode avance avec un clip selectionne OU un curseur pose sur la regle :
      // le terrain n'affiche plus l'etape courante (curKf, mode simple) mais
      // l'instant choisi — c'est le coeur de la demande de Robin : poser une
      // position d'arrivee en glissant l'entite sur le terrain SANS repasser
      // par le mode simple, et voir la position de tout le monde a n'importe
      // quel instant meme sans rien avoir selectionne, qui n'aurait de toute
      // facon aucun sens des que plusieurs entites ont des timings
      // desynchronises (l'etape "curKf" ne peut pas representer "le bon
      // instant" pour tout le monde a la fois).
      layerTasks.push({ z: R.Z_BASE.entity, run: function () { renderAdvancedPitchEntities(g); } });
    } else {
      // Fleche entrante (mouvement qui vient d'amener l'etape courante) + sortante
      // (aperçu du prochain mouvement) : les deux sont editables depuis ici.
      if (curKf > 0) arrows = arrows.concat(computeArrows(curKf - 1).map(function (a) { a.incoming = true; return a; }));
      arrows = arrows.concat(computeArrows(curKf));
      layerTasks.push({ z: R.Z_BASE.arrow, run: function () {
        arrows.forEach(function (a, i) { R.drawAnnotation(rt, g, a, i, { dim: a.incoming }); });
      } });
      var carried = R.carrierMap(ents());
      ents().forEach(function (e, i) {
        layerTasks.push({ z: R.zOf(drill, "entity", e.id, i), run: function () {
          R.drawEntity(rt, drill, g, e, { selected: selEntity === e || isMultiSelected("entity", e), carrier: !!carried[e.id], onDown: function (ev) { onEntityDown(ev, e); } });
        } });
      });
    }
    pulsesArr().filter(function (pu) { return R.visibleAt(pu, overlayMs); }).forEach(function (pu, i) {
      layerTasks.push({ z: R.zOf(drill, "pulse", pu.id, i), run: function () {
        R.drawPulse(rt, g, pu, { selected: selPulse === pu || isMultiSelected("pulse", pu), onDown: function (ev) { onPulseDown(ev, pu); } });
      } });
    });
    layerTasks.sort(function (a, b) { return a.z - b.z; });
    layerTasks.forEach(function (t) { t.run(); });
    refreshLayersPanel();
    // Poignees d'edition : toujours au-dessus de la pile, elles ne sont pas
    // un calque mais un outil. Aucune poignee de DEPLACEMENT pour un objet
    // verrouille — les points de courbure de trajectoire (drawCtrlHandle)
    // restent volontairement disponibles, cf le commentaire sur isLocked().
    if (selLine && !isLocked(selLine.id)) drawLineHandles(selLine, g);
    // Forme resolue, pas e.shape : une equipe reglee sur "corps oriente" rend
    // des joueurs pivotables sans que l'entite porte elle-meme shape:"body".
    if (!advPitchViewActive() && selEntity && isRotatable(selEntity) && !isLocked(selEntity.id)) drawFacingHandle(selEntity, g);
    arrows.forEach(function (a) { if (!a.pts) drawCtrlHandle(a, g); });
    if (selZone && !isLocked(selZone.id)) { if (selZone.shape === "polygon") drawPolyHandles(selZone, g); else drawHandles(selZone, g); }
    if (polyDraft) drawPolyDraft(g);
    drawDragGuides(g);
  }

  // Points par lesquels passe un trait/une trajectoire courbee (extremites +
  // points de courbure intermediaires, dans l'ordre) — sert au rendu (via le
  // moteur partage) ET a localiser ou inserer un nouveau point ici.
  function waypointsOf(x1, y1, x2, y2, ctrls) {
    return [{ x: x1, y: y1 }].concat(ctrls || []).concat([{ x: x2, y: y2 }]);
  }
  // Plus grand segment du trace actuel (entre deux points consecutifs) : c'est
  // la qu'un nouveau point de courbure s'insere par defaut, pour rester visible
  // et immediatement saisissable. `idx` est directement l'index d'insertion
  // dans le tableau `ctrls` (splice(idx,0,pt)).
  function biggestGap(wp) {
    var best = 0, bestLen = -1;
    for (var i = 0; i < wp.length - 1; i++) {
      var d = Math.hypot(wp[i + 1].x - wp[i].x, wp[i + 1].y - wp[i].y);
      if (d > bestLen) { bestLen = d; best = i; }
    }
    return { idx: best, x: (wp[best].x + wp[best + 1].x) / 2, y: (wp[best].y + wp[best + 1].y) / 2 };
  }
  // Detection manuelle du double-clic sur les poignees de courbure : leur
  // pointerdown appelle preventDefault() (necessaire pour le drag), ce qui
  // empeche le navigateur de synthetiser les evenements souris de compat
  // (click/dblclick) — un vrai <dblclick> natif ne se declenche donc jamais
  // dessus. `key` identifie la poignee (ex: "ln1#0").
  var lastHandleClick = { key: null, time: 0 };
  function isDoubleClick(key) {
    var now = Date.now();
    var dbl = lastHandleClick.key === key && (now - lastHandleClick.time) < 400;
    lastHandleClick = dbl ? { key: null, time: 0 } : { key: key, time: now };
    return dbl;
  }
  // Poignee "+" (vert) qui ajoute un point de courbure au milieu du plus grand
  // segment du trace. `onAdd(gap)` recoit {idx,x,y} et fait l'insertion metier
  // (differente pour une ligne libre vs un segment de mouvement avec mirroir
  // ballon en conduite).
  function drawAddPointHandle(g, wp, onAdd) {
    var gap = biggestGap(wp);
    var ax = g.px(gap.x), ay = g.py(gap.y);
    var addBtn = el("g", { cursor: "pointer" });
    addBtn.appendChild(el("circle", { cx: ax, cy: ay, r: 7, fill: "#2fd992", stroke: "#062015", "stroke-width": 1.5 }));
    addBtn.appendChild(el("line", { x1: ax - 3, y1: ay, x2: ax + 3, y2: ay, stroke: "#062015", "stroke-width": 1.6 }));
    addBtn.appendChild(el("line", { x1: ax, y1: ay - 3, x2: ax, y2: ay + 3, stroke: "#062015", "stroke-width": 1.6 }));
    addBtn.addEventListener("pointerdown", function (ev) { ev.preventDefault(); ev.stopPropagation(); onAdd(gap); });
    rt.appendChild(addBtn);
  }

  function drawCtrlHandle(a, g) {
    var src = findById(entsAt(a.seg), a.srcId); if (!src) return;
    var ctrls = src.ctrls || [];
    ctrls.forEach(function (pt, i) {
      var hit = el("circle", { cx: g.px(pt.x), cy: g.py(pt.y), r: 13, fill: "transparent", cursor: "grab" });
      var h = el("circle", { cx: g.px(pt.x), cy: g.py(pt.y), r: 6, fill: "#fff", stroke: COL.sel, "stroke-width": 2, cursor: "grab", "pointer-events": "none" });
      hit.addEventListener("pointerdown", function (ev) { onCtrlDown(ev, a, i); });
      rt.appendChild(hit); rt.appendChild(h);
    });
    drawAddPointHandle(g, waypointsOf(a.from.x, a.from.y, a.to.x, a.to.y, ctrls), function (gap) {
      pushHistory();
      var s = findById(entsAt(a.seg), a.srcId); if (!s) return;
      if (!s.ctrls) s.ctrls = [];
      s.ctrls.splice(gap.idx, 0, { x: round1(gap.x), y: round1(gap.y) });
      if (a.type === "dribble") {
        var ball = ballCarriedBy(entsAt(a.seg), s.id);
        if (ball) {
          if (!ball.ctrls) ball.ctrls = [];
          ball.ctrls.splice(gap.idx, 0, { x: round1(gap.x + (ball.x - s.x)), y: round1(gap.y + (ball.y - s.y)) });
        }
      }
      render(); syncJSON();
    });
  }

  function onCtrlDown(ev, a, idx) {
    if (pendingTool) return;
    ev.preventDefault(); ev.stopPropagation();
    var src = findById(entsAt(a.seg), a.srcId); if (!src) return;
    // Ne mirrorer la courbe sur le ballon que pour une vraie conduite (ballon et
    // joueur bougent ensemble sur ce segment) : un flèche "run" ou "pass" reste
    // independante, meme si le joueur portait le ballon juste avant ce segment.
    var mirror = null;
    if (a.type === "dribble") {
      mirror = ballCarriedBy(entsAt(a.seg), src.id);
    }
    var offx = mirror ? mirror.x - src.x : 0, offy = mirror ? mirror.y - src.y : 0;
    var moved = false;
    var margin = oobMargin();
    dragLoop(function (mv) {
      moved = true;
      var m = clientToMeters(mv, margin);
      if (!src.ctrls) src.ctrls = [];
      src.ctrls[idx] = { x: round1(m.x), y: round1(m.y) };
      if (mirror) { if (!mirror.ctrls) mirror.ctrls = []; mirror.ctrls[idx] = { x: round1(m.x + offx), y: round1(m.y + offy) }; }
      render();
    }, function () {
      // Un clic sans deplacement suivi d'un second dans les 400ms = double-clic
      // : supprime ce point (voir isDoubleClick, le <dblclick> natif ne se
      // declenche jamais ici a cause du preventDefault plus haut).
      if (moved || !isDoubleClick(a.srcId + "#" + a.seg + "#" + idx)) return;
      var s = findById(entsAt(a.seg), a.srcId); if (!s || !s.ctrls) return;
      s.ctrls.splice(idx, 1);
      // Le ballon n'est detache en meme temps que le porteur qu'en cas de reelle
      // conduite (ballon et joueur qui bougent ensemble) — pas sur une passe ou une
      // course independante, meme si le joueur portait le ballon avant ce segment.
      if (a.type === "dribble") {
        var ball = ballCarriedBy(entsAt(a.seg), s.id);
        if (ball && ball.ctrls) ball.ctrls.splice(idx, 1);
      }
    });
  }

  // Poignee de rotation pour la forme "corps oriente" : un point que l'on
  // fait tourner autour du joueur, comme le magnet physique. 0° = vers le haut
  // du terrain ; angle mesure dans le sens horaire (convention rotate() SVG),
  // meme convention que la barre d'epaules dessinee par drawEntity.
  // ---- reperes d'alignement pendant un glisser ----
  // Aligner deux joueurs sur la meme ligne ou la meme colonne se faisait a
  // l'oeil, avec un arrondi au decimetre qui ne garantissait rien. On aimante
  // sur les coordonnees des autres entites et sur les axes du terrain, et on
  // montre le repere retenu. DESACTIVEE par defaut, activee tant que Maj est
  // enfoncee (Robin : l'aimantation se declenchait trop souvent sans qu'on la
  // demande) — meme touche que "aligner sur l'axe" (cf onEntityDown), les
  // deux se combinent naturellement sous Maj = "aide a l'alignement".
  var dragGuides = null; // { xs: [m], ys: [m] } ou null
  // Valeur au repos = desactivee ; chaque move callback la reecrit de toute
  // facon (!mv.shiftKey) avant le moindre appel a snapDrag/snapGroupDelta.
  var snapDisabled = true;
  function nearestWithin(list, v, tol) {
    var best = null, bd = tol;
    list.forEach(function (c) { var d = Math.abs(c - v); if (d < bd) { bd = d; best = c; } });
    return best;
  }
  // Renvoie la position aimantee et memorise les reperes a dessiner.
  function snapDrag(target, nx, ny, skipIds) {
    dragGuides = null;
    if (snapDisabled) return { x: nx, y: ny };
    var g = geo(), p = drill.pitch;
    // Tolerance exprimee en pixels puis convertie : l'aimantation doit se
    // sentir pareil quel que soit le zoom ou la taille du terrain.
    var tol = 7 / g.sc;
    var xs = [p.length / 2], ys = [p.width / 2];
    ents().forEach(function (o) {
      if (o === target || (skipIds && skipIds.indexOf(o.id) >= 0)) return;
      xs.push(o.x); ys.push(o.y);
    });
    var bx = nearestWithin(xs, nx, tol), by = nearestWithin(ys, ny, tol);
    var gx = [], gy = [];
    if (bx != null) { nx = bx; gx.push(bx); }
    if (by != null) { ny = by; gy.push(by); }
    if (gx.length || gy.length) dragGuides = { xs: gx, ys: gy };
    return { x: nx, y: ny };
  }
  // Aimantation d'un groupe : le groupe se deplace d'un bloc, donc on ne peut
  // pas aimanter chaque membre separement sans le deformer. On cherche la plus
  // petite correction du deplacement (dx, dy) qui aligne AU MOINS un membre sur
  // une cible, et on l'applique a tout le monde : c'est le membre le plus
  // proche d'un alignement qui tire le groupe.
  function snapGroupDelta(dx, dy, origins) {
    dragGuides = null;
    if (snapDisabled) return { dx: dx, dy: dy };
    var g = geo(), p = drill.pitch, tol = 7 / g.sc;
    var selIds = {};
    multiSel.forEach(function (s) { if (s.kind === "entity") selIds[s.ref.id] = true; });
    var xs = [p.length / 2], ys = [p.width / 2];
    ents().forEach(function (o) { if (!selIds[o.id]) { xs.push(o.x); ys.push(o.y); } });
    var corrX = 0, absX = tol, guideX = null;
    var corrY = 0, absY = tol, guideY = null;
    multiSel.forEach(function (s, i) {
      if (s.kind !== "entity") return;
      var o = origins[i], nx = o.x + dx, ny = o.y + dy;
      xs.forEach(function (c) { var d = c - nx; if (Math.abs(d) < absX) { absX = Math.abs(d); corrX = d; guideX = c; } });
      ys.forEach(function (c) { var d = c - ny; if (Math.abs(d) < absY) { absY = Math.abs(d); corrY = d; guideY = c; } });
    });
    var gx = [], gy = [];
    if (guideX != null) gx.push(guideX);
    if (guideY != null) gy.push(guideY);
    if (gx.length || gy.length) dragGuides = { xs: gx, ys: gy };
    return { dx: dx + corrX, dy: dy + corrY };
  }
  function drawDragGuides(g) {
    if (!dragGuides) return;
    var a = { stroke: COL.sel, "stroke-width": 1.2, "stroke-dasharray": "5 4", "stroke-opacity": 0.85, "pointer-events": "none" };
    dragGuides.xs.forEach(function (x) {
      rt.appendChild(R.el("line", Object.assign({ x1: g.px(x), y1: 0, x2: g.px(x), y2: g.H }, a)));
    });
    dragGuides.ys.forEach(function (y) {
      rt.appendChild(R.el("line", Object.assign({ x1: 0, y1: g.py(y), x2: g.W, y2: g.py(y) }, a)));
    });
  }

  // Un jeton est pivotable si sa forme RESOLUE est "corps oriente" : soit
  // e.shape, soit la forme par defaut de son equipe (cf R.teamStyle).
  function isBodyShaped(e) {
    if (e.type !== "player" && e.type !== "support") return false;
    return R.teamStyle(drill, e).shape === "body";
  }
  // Tout ce qui porte une orientation : joueur "corps", but, et le materiel
  // dont le sens de pose compte (haie, echelle, mini-but).
  function isRotatable(e) {
    return isBodyShaped(e) || e.type === "goal" || !!(R.EQUIP[e.type] && R.EQUIP[e.type].rot);
  }
  function drawFacingHandle(e, g) {
    // Le but a une empreinte reelle (3m x 1m, cf drawEntity) bien plus grande
    // qu'un joueur — la poignee doit depasser le coin le plus eloigne du filet
    // pour rester cliquable/visible en dehors du maillage, quelle que soit la
    // rotation courante.
    var dist;
    var eq = R.EQUIP[e.type];
    if (e.type === "goal") dist = Math.hypot(1 * g.sc, 1.5 * g.sc) + 12;
    else if (eq && eq.real) {
      // Meme raison que pour le but : la poignee doit sortir de l'emprise
      // reelle de l'objet, qui peut faire 4 m de long (echelle de rythme).
      var es = e.size || 1;
      dist = Math.hypot((eq.real.w / 2) * g.sc * es, eq.real.h * g.sc * es) + 14;
    } else { var scale = e.size || ((e.type === "player" || e.type === "support") ? 0.9 : 1), r = 11 * scale; dist = r * 2.3; }
    var cx = g.px(e.x), cy = g.py(e.y);
    var rad = ((e.facing || 0) * Math.PI) / 180;
    var hx = cx + Math.sin(rad) * dist, hy = cy - Math.cos(rad) * dist;
    rt.appendChild(el("line", { x1: cx, y1: cy, x2: hx, y2: hy, stroke: COL.sel, "stroke-width": 1.5, "stroke-dasharray": "3 3" }));
    // Cible de 13 px invisible sous la pastille de 6 px : attrapable au doigt
    // et a la souris sans grossir la poignee, qui masquerait le jeton.
    var hit = el("circle", { cx: hx, cy: hy, r: 13, fill: "transparent", cursor: "grab" });
    var h = el("circle", { cx: hx, cy: hy, r: 6, fill: "#fff", stroke: COL.sel, "stroke-width": 2, cursor: "grab", "pointer-events": "none" });
    hit.addEventListener("pointerdown", function (ev) { onFacingDown(ev, e); });
    // Pas de listener "dblclick" ici : onFacingDown appelle preventDefault(),
    // donc le dblclick natif n'est jamais synthetise (cf isDoubleClick). Il
    // etait pose sur cette poignee depuis l'origine et ne se declenchait pas ;
    // la remise a 0° passe desormais par isDoubleClick dans onFacingDown.
    var tip = el("title", {}); tip.textContent = "Glisser pour pivoter — Maj : par pas de 15°, double-clic : remettre à 0°";
    hit.appendChild(tip);
    rt.appendChild(hit); rt.appendChild(h);
    // Angle chiffre pendant le geste seulement : reproduire une orientation
    // precise d'un joueur a l'autre demande de lire la valeur, pas de l'estimer.
    if (facingDragId === e.id) {
      var lx = cx + Math.sin(rad) * (dist + 22), ly = cy - Math.cos(rad) * (dist + 22);
      rt.appendChild(el("rect", { x: lx - 17, y: ly - 9, width: 34, height: 18, rx: 4, fill: "#101214", stroke: COL.sel, "stroke-width": 1 }));
      rt.appendChild(R.textNode(lx, ly + 4, (e.facing || 0) + "°", 11, "#fff", { bold: true }));
    }
  }
  var facingDragId = null;
  function onFacingDown(ev, e) {
    if (pendingTool) return;
    if (isLocked(e.id)) return; // en pratique la poignee n'est meme plus dessinee (cf render())
    ev.preventDefault(); ev.stopPropagation();
    if (isDoubleClick("facing#" + e.id)) { pushHistory(); e.facing = 0; render(); syncJSON(); return; }
    var g = geo();
    facingDragId = e.id;
    dragLoop(function (mv) {
      var cx = g.px(e.x), cy = g.py(e.y);
      var pt = svg.createSVGPoint(); pt.x = mv.clientX; pt.y = mv.clientY;
      var loc = pt.matrixTransform(rt.getScreenCTM().inverse());
      var ang = Math.atan2(loc.x - cx, -(loc.y - cy)) * 180 / Math.PI;
      ang = ((ang % 360) + 360) % 360;
      // Maj : pas de 15°, pour aligner plusieurs joueurs sur la meme
      // orientation (dos au but, profil, etc.) sans viser au pixel.
      e.facing = mv.shiftKey ? Math.round(ang / 15) * 15 % 360 : Math.round(ang);
      render();
    }, function () { facingDragId = null; }); // dragLoop re-rend et resynchronise apres onDrop
  }

  // Rendu interpole (lecture / export) : delegue au moteur partage.
  function renderAnimated(p) { R.renderAnimated(svg, drill, p); }

  function drawHandles(z, g) {
    var corners = [["bl", z.x, z.y], ["br", z.x + z.w, z.y], ["tl", z.x, z.y + z.h], ["tr", z.x + z.w, z.y + z.h]];
    corners.forEach(function (c) {
      var hx = g.px(c[1]), hy = g.py(c[2]);
      var cur = (c[0] === "bl" || c[0] === "tr") ? "nesw-resize" : "nwse-resize";
      // Cible invisible de 26 px sous la poignee de 12 : attrapable sans viser,
      // sans grossir la poignee qui masquerait le coin de la zone.
      var hit = el("rect", { x: hx - 13, y: hy - 13, width: 26, height: 26, fill: "transparent", cursor: cur });
      var hnd = el("rect", { x: hx - 6, y: hy - 6, width: 12, height: 12, fill: COL.handle, stroke: COL.sel, "stroke-width": 2, rx: 2, cursor: cur, "pointer-events": "none" });
      hit.addEventListener("pointerdown", function (ev) { onResizeDown(ev, z, c[0]); });
      rt.appendChild(hit); rt.appendChild(hnd);
    });
  }

  function drawPolyHandles(z, g) {
    (z.pts || []).forEach(function (p, i) {
      var hx = g.px(p.x), hy = g.py(p.y);
      var hnd = el("rect", { x: hx - 6, y: hy - 6, width: 12, height: 12, fill: COL.handle, stroke: COL.sel, "stroke-width": 2, rx: 2, cursor: "grab" });
      hnd.addEventListener("pointerdown", function (ev) { onPolyVertexDown(ev, z, i); });
      rt.appendChild(hnd);
    });
  }
  function onPolyVertexDown(ev, z, idx) {
    if (pendingTool) return;
    if (isLocked(z.id)) return;
    ev.preventDefault(); ev.stopPropagation();
    dragLoop(function (mv) {
      var m = clientToMeters(mv);
      z.pts[idx] = { x: clamp(round1(m.x), 0, drill.pitch.length), y: clamp(round1(m.y), 0, drill.pitch.width) };
      render();
    });
  }

  function annoColor(type) { return R.annoColor(type); }
  function annoDash(type) { return R.annoDash(type); }

  // Maj enfoncee : bride le point d'arrivee sur l'axe dominant (horizontal si
  // le deplacement est plus large que haut, sinon vertical) — pratique pour
  // aligner une passe/course bien droite sans viser au pixel pres.
  function axisSnap(start, m, shiftHeld) {
    if (!shiftHeld) return m;
    var dx = m.x - start.x, dy = m.y - start.y;
    return Math.abs(dx) >= Math.abs(dy) ? { x: m.x, y: start.y } : { x: start.x, y: m.y };
  }
  function startDrawArrow(ev, type) {
    ev.preventDefault();
    var g = geo(), start = clientToMeters(ev), color = annoColor(type);
    var line = el("line", { x1: g.px(start.x), y1: g.py(start.y), x2: g.px(start.x), y2: g.py(start.y), stroke: color, "stroke-width": 2, "stroke-dasharray": annoDash(type) });
    rt.appendChild(line);
    var dim = textNode(0, 0, "", 12, "#fff", { bold: true });
    dim.style.pointerEvents = "none";
    rt.appendChild(dim);
    function endpoint(mv) { return axisSnap(start, clientToMeters(mv), mv.shiftKey); }
    function move(mv) {
      var m = endpoint(mv);
      line.setAttribute("x2", g.px(m.x)); line.setAttribute("y2", g.py(m.y));
      var dist = Math.hypot(m.x - start.x, m.y - start.y);
      dim.setAttribute("x", g.px((start.x + m.x) / 2)); dim.setAttribute("y", g.py((start.y + m.y) / 2) - 8);
      dim.textContent = round1(dist) + " m";
    }
    function up(uv) {
      document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up);
      dim.remove();
      var m = endpoint(uv), dist = Math.sqrt((m.x - start.x) * (m.x - start.x) + (m.y - start.y) * (m.y - start.y));
      if (dist >= 1) {
        var a = { type: type, from: { x: round1(start.x), y: round1(start.y) }, to: { x: round1(m.x), y: round1(m.y) } };
        // La fleche n'est pas cliquable sur le terrain (trace non interactif) :
        // sans ce panneau a la creation, son type/label/epaisseur ne seraient
        // plus reglables nulle part depuis que l'inspecteur ne s'ouvre plus.
        annos().push(a); render(); syncJSON(); selectAnno(a);
        openEditPop(a, uv.clientX, uv.clientY, "arrow");
      } else render();
      disarm();
    }
    document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
  }

  // ---- historique (undo/redo) : pile de snapshots JSON du drill, sur les
  // actions spatiales/structurelles (placer, deplacer, dessiner, supprimer,
  // etapes, flip, reset) — pas sur la frappe continue dans les champs texte.
  var undoStack = [], redoStack = [], HISTORY_MAX = 80, histSuppress = false;
  function snapshotNow() { return { d: JSON.stringify(drill), libId: currentDrillId }; }
  function pushHistory() {
    if (histSuppress) return;
    undoStack.push(snapshotNow());
    if (undoStack.length > HISTORY_MAX) undoStack.shift();
    redoStack.length = 0;
    updateHistoryBtns();
  }
  function clearHistory() { undoStack.length = 0; redoStack.length = 0; updateHistoryBtns(); }
  function restoreDrillState(snap) {
    var keepKf = curKf;
    drill = JSON.parse(snap.d);
    ensureVariants();
    currentDrillId = snap.libId;
    curKf = clamp(keepKf, 0, drill.keyframes.length - 1);
    ensureAnnotations(); ensureTimeline(); ensureOverlays(); invalidateEntsCache();
    selEntity = null; selZone = null; selAnno = null; selLine = null; selText = null; selPulse = null; multiSel = []; hideInspectors();
    fillMeta(); refreshAllLists(); renderVariants(); renderSteps(); render(); syncJSON();
  }
  function undo() {
    if (!undoStack.length) return;
    stopPlay();
    redoStack.push(snapshotNow());
    var prev = undoStack.pop();
    histSuppress = true; restoreDrillState(prev); histSuppress = false;
    updateHistoryBtns(); flash("Annulé", true);
  }
  function redo() {
    if (!redoStack.length) return;
    stopPlay();
    undoStack.push(snapshotNow());
    var next = redoStack.pop();
    histSuppress = true; restoreDrillState(next); histSuppress = false;
    updateHistoryBtns(); flash("Rétabli", true);
  }
  function updateHistoryBtns() {
    var u = document.getElementById("undoBtn"), r = document.getElementById("redoBtn");
    if (u) u.disabled = !undoStack.length;
    if (r) r.disabled = !redoStack.length;
  }

  // ---- drag helpers (document-level, no pointer capture) ----
  // `selInfo` ({kind, ref}), optionnel : si le geste s'avere etre un clic SANS
  // glisser reel (aucun pointermove recu avant le pointerup — un vrai glisser en
  // emet toujours au moins un), on bascule la selection multiple au lieu de
  // valider un deplacement nul. Ca laisse Maj+glisser (alignement sur l'axe,
  // verifie a chaque pointermove par l'appelant) totalement intact : des qu'un
  // seul pointermove arrive, ce n'est plus un "clic", donc plus une bascule.
  function dragLoop(onMove, onDrop, selInfo) {
    pushHistory();
    var moved = false;
    function move(mv) { moved = true; onMove(mv); }
    function up() {
      document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up);
      if (selInfo && !moved) toggleMultiSelect(selInfo.kind, selInfo.ref);
      else if (onDrop) onDrop();
      // Les reperes d'alignement n'existent que pendant le geste : les effacer
      // ici couvre tous les glissers, pas seulement ceux qui ont un onDrop.
      dragGuides = null; snapDisabled = true;
      render(); syncJSON(); if (selZone) refreshZoneDims();
    }
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  }

  // Etapes suivantes ou l'entite `id` est restee immobile (meme position qu'en
  // curKf) : elle "tient" cette position par inertie plutot que d'avoir vraiment
  // ete replacee. La chaine s'arrete a la premiere etape ou la position differe
  // (= un deplacement volontaire deja pose), qu'on ne doit pas toucher.
  // `requireAttachedTo` : n'inclut l'etape que si l'entite y est bien attachee a
  // ce porteur (utilise pour le ballon porte).
  function forwardHoldChain(id, ox, oy, requireAttachedTo) {
    // Lit directement la timeline canonique (via entityStateAt, qui renvoie
    // des references LIVES vers drill.timeline) plutot que
    // drill.keyframes[k].entities — ce tableau n'est resynchronise qu'au
    // voisinage immediat de curKf (cf syncEntitiesFromTimeline), donc perime
    // pour la plupart des k parcourus ici. Muter ent.x/y sur les objets
    // renvoyes met donc bien a jour drill.timeline sans etape de commit.
    var list = [];
    ensureTimeline(); ensureOverlays();
    var bm = boundaryMs();
    for (var k = curKf + 1; k < drill.keyframes.length; k++) {
      var ent = R.entityStateAt(drill.timeline, id, k, bm);
      if (!ent || ent.x !== ox || ent.y !== oy) break;
      if (requireAttachedTo && ent.attachedTo !== requireAttachedTo) break;
      list.push(ent);
    }
    return list;
  }

  // ---- selection multiple : Maj+clic pour ajouter/retirer, glisser un element
  // deja selectionne pour deplacer tout le groupe, zone de selection sur le vide ----
  // ---- verrouillage : proteger un objet d'un deplacement accidentel ----
  // drill.locked = { id: true }, plat et hors timeline (cf cleanDrill) : un
  // objet verrouille reste selectionnable et editable (couleur, panneau...),
  // seul son DEPLACEMENT est bloque (position, redimensionnement de zone,
  // extremites de trait, rotation). Les points de courbure d'une trajectoire
  // de mouvement (drawCtrlHandle) ne sont volontairement pas couverts : c'est
  // une autre surface d'edition, distincte de la position au repos.
  function isLocked(id) { return !!(drill.locked && drill.locked[id]); }
  function setLocked(id, val) {
    if (val) { if (!drill.locked) drill.locked = {}; drill.locked[id] = true; }
    else if (drill.locked) {
      delete drill.locked[id];
      if (!Object.keys(drill.locked).length) delete drill.locked;
    }
  }
  function toggleLocked(id) { pushHistory(); setLocked(id, !isLocked(id)); render(); syncJSON(); }

  function isMultiSelected(kind, ref) {
    for (var i = 0; i < multiSel.length; i++) if (multiSel[i].kind === kind && multiSel[i].ref === ref) return true;
    return false;
  }
  function clearSingleSelections() { selEntity = null; selZone = null; selAnno = null; selLine = null; selText = null; selPulse = null; }
  function currentSingleSelection() {
    if (selEntity) return { kind: "entity", ref: selEntity };
    if (selZone) return { kind: "zone", ref: selZone };
    if (selLine) return { kind: "line", ref: selLine };
    if (selText) return { kind: "text", ref: selText };
    if (selPulse) return { kind: "pulse", ref: selPulse };
    return null;
  }
  function selectSingleFromMulti(entry) {
    if (entry.kind === "entity") selectEntity(entry.ref);
    else if (entry.kind === "zone") selectZone(entry.ref);
    else if (entry.kind === "line") selectLine(entry.ref);
    else if (entry.kind === "text") selectText(entry.ref);
    else if (entry.kind === "pulse") selectPulse(entry.ref);
  }
  function showMultiInspector() {
    showInspector("multiInspector");
    document.getElementById("multiCount").textContent = multiSel.length + " éléments sélectionnés";
  }
  // Maj+clic sur un element : le fait basculer dans/hors de la selection multiple.
  // Repart de la selection simple en cours s'il n'y avait encore rien en multi.
  function toggleMultiSelect(kind, ref) {
    if (!multiSel.length) {
      var cur = currentSingleSelection();
      clearSingleSelections();
      if (cur && !(cur.kind === kind && cur.ref === ref)) multiSel.push(cur);
    }
    var idx = -1;
    for (var i = 0; i < multiSel.length; i++) if (multiSel[i].kind === kind && multiSel[i].ref === ref) { idx = i; break; }
    if (idx >= 0) multiSel.splice(idx, 1); else multiSel.push({ kind: kind, ref: ref });
    if (multiSel.length === 1) { var only = multiSel[0]; multiSel = []; selectSingleFromMulti(only); }
    else if (multiSel.length > 1) { hideInspectors(); showMultiInspector(); render(); }
    else { hideInspectors(); render(); }
  }
  // Point d'entree partage par chaque onXDown : gere Maj+clic (toggle) et le clic
  // sur un element deja dans le groupe (deplace tout le groupe). Retourne true si
  // l'appelant doit s'arreter la (ne pas continuer sa logique de clic simple).
  function beginItemDrag(ev, kind, ref) {
    // Maj est gere plus finement par dragLoop (clic sans glisser => bascule ;
    // glisser reel => laisse l'appelant faire son geste normal, alignement sur
    // l'axe compris) : on ne l'intercepte pas ici.
    if (ev.shiftKey) return false;
    if (multiSel.length && isMultiSelected(kind, ref)) { ev.preventDefault(); ev.stopPropagation(); startGroupDrag(ev); return true; }
    if (multiSel.length) { multiSel = []; }
    return false;
  }
  function startGroupDrag(ev) {
    var margin = oobMargin();
    var start = clientToMeters(ev, margin);
    var origins = multiSel.map(function (s) {
      if (s.kind === "zone" && s.ref.shape === "polygon") return { pts: s.ref.pts.map(function (p) { return { x: p.x, y: p.y }; }) };
      if (s.kind === "line") return { x1: s.ref.x1, y1: s.ref.y1, x2: s.ref.x2, y2: s.ref.y2, ctrls: (s.ref.ctrls || []).map(function (p) { return { x: p.x, y: p.y }; }) };
      return { x: s.ref.x, y: s.ref.y };
    });
    dragLoop(function (mv) {
      var m = clientToMeters(mv, margin), dx = m.x - start.x, dy = m.y - start.y;
      snapDisabled = !mv.shiftKey;
      var sd = snapGroupDelta(dx, dy, origins);
      dx = sd.dx; dy = sd.dy;
      multiSel.forEach(function (s, i) {
        // Membre verrouille : reste selectionne et visible dans le groupe,
        // mais ne bouge pas avec les autres — verrouiller doit proteger meme
        // depuis un glisser de groupe, pas seulement un glisser individuel.
        if (isLocked(s.ref.id)) return;
        var o = origins[i];
        if (s.kind === "zone" && s.ref.shape === "polygon") {
          s.ref.pts = o.pts.map(function (p) { return { x: round1(p.x + dx), y: round1(p.y + dy) }; });
        } else if (s.kind === "line") {
          s.ref.x1 = round1(o.x1 + dx); s.ref.y1 = round1(o.y1 + dy);
          s.ref.x2 = round1(o.x2 + dx); s.ref.y2 = round1(o.y2 + dy);
          if (o.ctrls.length) s.ref.ctrls = o.ctrls.map(function (p) { return { x: round1(p.x + dx), y: round1(p.y + dy) }; });
        } else if (s.kind === "zone") {
          s.ref.x = round1(o.x + dx); s.ref.y = round1(o.y + dy);
        } else {
          var m2 = s.kind === "entity" ? margin : 0;
          s.ref.x = clamp(round1(o.x + dx), -m2, drill.pitch.length + m2);
          s.ref.y = clamp(round1(o.y + dy), -m2, drill.pitch.width + m2);
        }
      });
      render();
    });
  }
  function deleteMultiSelected() {
    if (!multiSel.length) return;
    pushHistory();
    multiSel.forEach(function (s) {
      if (s.kind === "entity") removeEntityAllKf(s.ref.id);
      else if (s.kind === "zone") drill.zones = drill.zones.filter(function (x) { return x !== s.ref; });
      // Retrait en place (splice), pas reassignation d'un tableau filtre :
      // drill.lines/drill.pulses sont alias de v.linesGlobal/v.pulsesGlobal
      // (cf ensureOverlays) — les reassigner casserait cet alias.
      else if (s.kind === "line") { var li = linesArr().indexOf(s.ref); if (li >= 0) drill.lines.splice(li, 1); }
      else if (s.kind === "text") { var ti = textsArr().indexOf(s.ref); if (ti >= 0) drill.texts.splice(ti, 1); }
      else if (s.kind === "pulse") { var pi = pulsesArr().indexOf(s.ref); if (pi >= 0) drill.pulses.splice(pi, 1); }
    });
    multiSel = [];
    hideInspectors(); render(); syncJSON();
  }
  function zoneCenter(z) {
    if (z.shape === "polygon") {
      var sx = 0, sy = 0; z.pts.forEach(function (p) { sx += p.x; sy += p.y; });
      return { x: sx / z.pts.length, y: sy / z.pts.length };
    }
    return { x: z.x + z.w / 2, y: z.y + z.h / 2 };
  }
  // Zone de selection (glisser sur le vide) : remplace la selection (ou l'etend
  // si Maj est maintenu). Un simple clic sans glisser (donc sans zone reelle)
  // se comporte comme avant : deselectionne tout.
  function startMarquee(ev) {
    var addMode = ev.shiftKey;
    var g = geo(), start = clientToMeters(ev);
    var rectEl = el("rect", { fill: "rgba(90,167,255,0.15)", stroke: "#5aa7ff", "stroke-width": 1.2, "stroke-dasharray": "4 3", "pointer-events": "none" });
    rt.appendChild(rectEl);
    var moved = false;
    function box(mv) {
      var m = clientToMeters(mv);
      return { x0: Math.min(start.x, m.x), x1: Math.max(start.x, m.x), y0: Math.min(start.y, m.y), y1: Math.max(start.y, m.y) };
    }
    function move(mv) {
      var b = box(mv);
      if ((b.x1 - b.x0) > 0.15 || (b.y1 - b.y0) > 0.15) moved = true;
      rectEl.setAttribute("x", g.px(b.x0)); rectEl.setAttribute("y", g.py(b.y1));
      rectEl.setAttribute("width", (b.x1 - b.x0) * g.sc); rectEl.setAttribute("height", (b.y1 - b.y0) * g.sc);
    }
    function up(uv) {
      document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up);
      rectEl.remove();
      if (!moved) {
        if (!addMode) { multiSel = []; clearSingleSelections(); hideInspectors(); render(); }
        return;
      }
      var b = box(uv), picked = [];
      ents().forEach(function (e) { if (e.x >= b.x0 && e.x <= b.x1 && e.y >= b.y0 && e.y <= b.y1) picked.push({ kind: "entity", ref: e }); });
      drill.zones.forEach(function (z) { var c = zoneCenter(z); if (c.x >= b.x0 && c.x <= b.x1 && c.y >= b.y0 && c.y <= b.y1) picked.push({ kind: "zone", ref: z }); });
      linesArr().forEach(function (ln) { var mx = (ln.x1 + ln.x2) / 2, my = (ln.y1 + ln.y2) / 2; if (mx >= b.x0 && mx <= b.x1 && my >= b.y0 && my <= b.y1) picked.push({ kind: "line", ref: ln }); });
      textsArr().forEach(function (tx) { if (tx.x >= b.x0 && tx.x <= b.x1 && tx.y >= b.y0 && tx.y <= b.y1) picked.push({ kind: "text", ref: tx }); });
      pulsesArr().forEach(function (pu) { if (pu.x >= b.x0 && pu.x <= b.x1 && pu.y >= b.y0 && pu.y <= b.y1) picked.push({ kind: "pulse", ref: pu }); });
      if (!addMode) multiSel = [];
      picked.forEach(function (p) { if (!isMultiSelected(p.kind, p.ref)) multiSel.push(p); });
      clearSingleSelections();
      if (multiSel.length === 1) { var only = multiSel[0]; multiSel = []; selectSingleFromMulti(only); }
      else if (multiSel.length > 1) { hideInspectors(); showMultiInspector(); render(); }
      else { hideInspectors(); render(); }
    }
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  }

  // ---- menu contextuel (clic droit) generique ----
  var ctxMenuEl = null;
  function onContextMenuKey(ev) { if (ev.key === "Escape") closeContextMenu(); }
  function closeContextMenu() {
    if (ctxMenuEl) { ctxMenuEl.remove(); ctxMenuEl = null; }
    document.removeEventListener("pointerdown", onOutsidePointerDown, true);
    document.removeEventListener("keydown", onContextMenuKey, true);
  }
  // Un pointerdown sur le bouton du menu lui-meme ne doit PAS le fermer avant
  // que son propre "click" ait pu s'executer — sinon closeContextMenu() retire
  // le bouton du DOM entre le pointerdown (capture, ici) et le click (bulle,
  // sur le bouton), qui ne se declenche alors jamais : le bouton "ne fait
  // rien" en apparence alors que la logique est correcte.
  function onOutsidePointerDown(ev) {
    if (ctxMenuEl && ctxMenuEl.contains(ev.target)) return;
    closeContextMenu();
  }
  function showContextMenu(x, y, items) {
    closeContextMenu();
    var m = document.createElement("div");
    m.className = "ctx-menu";
    items.forEach(function (it) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = it.label;
      btn.addEventListener("click", function (ev) { ev.stopPropagation(); closeContextMenu(); it.onClick(); });
      m.appendChild(btn);
    });
    document.body.appendChild(m);
    ctxMenuEl = m;
    var mw = m.offsetWidth, mh = m.offsetHeight;
    m.style.left = Math.max(4, Math.min(x, window.innerWidth - mw - 8)) + "px";
    m.style.top = Math.max(4, Math.min(y, window.innerHeight - mh - 8)) + "px";
    // Laisse le clic-droit courant se terminer avant d'armer la fermeture au
    // clic exterieur, sinon le meme pointerdown la ferme instantanement.
    setTimeout(function () {
      document.addEventListener("pointerdown", onOutsidePointerDown, true);
      document.addEventListener("keydown", onContextMenuKey, true);
    }, 0);
  }
  // Clic droit delegue sur le SVG entier plutot que sur chaque element : Safari
  // ne livre pas toujours l'evenement "contextmenu" aux elements enfants d'un
  // <svg> (bug WebKit connu, surtout sur des noeuds recrees a chaque render()
  // comme ici) — un seul listener pose une fois sur la racine, jamais recreee,
  // est beaucoup plus fiable. On retrouve l'element vise via ses attributs
  // data-*id (poses par chaque fonction de dessin dans render-core.js).
  function onPitchContextMenu(ev) {
    if (pendingTool) return;
    var t = ev.target, g;
    var found = null;
    if ((g = t.closest && t.closest("[data-eid]"))) found = { kind: "entity", ref: findById(ents(), g.getAttribute("data-eid")) };
    else if ((g = t.closest && t.closest("[data-lid]"))) found = { kind: "line", ref: findById(linesArr(), g.getAttribute("data-lid")) };
    else if ((g = t.closest && t.closest("[data-zid]"))) found = { kind: "zone", ref: findById(drill.zones, g.getAttribute("data-zid")) };
    else if ((g = t.closest && t.closest("[data-tid]"))) found = { kind: "text", ref: findById(textsArr(), g.getAttribute("data-tid")) };
    else if ((g = t.closest && t.closest("[data-pid]"))) found = { kind: "pulse", ref: findById(pulsesArr(), g.getAttribute("data-pid")) };
    if (!found || !found.ref) {
      // Clic droit dans le vide : propose seulement Coller, si le presse-papiers a quelque chose.
      if (clipboard) { ev.preventDefault(); showContextMenu(ev.clientX, ev.clientY, [{ label: "Coller", onClick: pasteSel }]); }
      return;
    }
    ev.preventDefault(); ev.stopPropagation();
    // Clic droit sur un membre d'une selection multiple : on ne casse pas le
    // groupe pour editer un seul element, on ouvre le panneau du groupe.
    if (multiSel.length && isMultiSelected(found.kind, found.ref)) {
      openEditPop(null, ev.clientX, ev.clientY, "multi");
      return;
    }
    // Selectionne l'element vise, comme le ferait un vrai clic droit — copier/
    // couper/coller/supprimer agissent tous sur la selection courante.
    if (found.kind === "entity") selectEntity(found.ref);
    else if (found.kind === "line") selectLine(found.ref);
    else if (found.kind === "zone") selectZone(found.ref);
    else if (found.kind === "text") selectText(found.ref);
    else if (found.kind === "pulse") selectPulse(found.ref);
    // Clic droit : panneau de modification complet sous le curseur, pour tous
    // les types cliquables. Il remplace l'inspecteur flottant, qui ne s'ouvre
    // plus au clic gauche (cf showInspector).
    openEditPop(found.ref, ev.clientX, ev.clientY, found.kind === "entity" ? null : found.kind);
  }
  // ---- panneau de modification au clic droit ----
  // Les reglages vivaient uniquement dans l'inspecteur flottant, a l'autre bout
  // du terrain de ce qu'on vient de cliquer. Ce panneau les pose sous le
  // curseur. Il n'a pas d'etat propre : il ecrit dans la meme entite et appelle
  // les memes render()/syncJSON(), donc inspecteur et panneau restent d'accord.
  var editPopEl = null;
  function closeEditPop() {
    if (editPopEl) { editPopEl.remove(); editPopEl = null; }
    document.removeEventListener("pointerdown", onOutsideEditPop, true);
    document.removeEventListener("keydown", onEditPopKey, true);
  }
  function onEditPopKey(ev) { if (ev.key === "Escape") { ev.stopPropagation(); closeEditPop(); } }
  function onOutsideEditPop(ev) {
    if (editPopEl && editPopEl.contains(ev.target)) return;
    closeEditPop();
  }
  function epEl(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function epSection(title) {
    var s = epEl("div", "ep-sect");
    s.appendChild(epEl("h4", null, title));
    return s;
  }
  function epRow(parent, label) {
    var r = epEl("div", "ep-row");
    if (label) r.appendChild(epEl("span", "ep-lab", label));
    parent.appendChild(r);
    return r;
  }
  // Interrupteur : lit/ecrit un booleen, et re-rend. onSet recoit la valeur.
  function epSwitch(row, get, onSet) {
    var b = epEl("button", "ep-sw");
    b.type = "button";
    b.setAttribute("aria-pressed", get() ? "true" : "false");
    b.addEventListener("click", function () {
      pushHistory();
      var v = !get();
      onSet(v);
      b.setAttribute("aria-pressed", v ? "true" : "false");
      render(); syncJSON();
    });
    row.appendChild(b);
    return b;
  }
  // Briques communes aux panneaux. Toutes suivent la meme convention : elles
  // ecrivent dans l'objet, puis render() + syncJSON(). Les reglages continus
  // (curseurs, champs texte) n'empilent pas d'historique a chaque pixel — seuls
  // les changements discrets (interrupteur, liste, bouton) appellent
  // pushHistory(), comme le faisait deja l'inspecteur.
  function epRange(sect, label, min, max, step, value, fmt, onInput) {
    var row = epRow(sect, label);
    var sl = document.createElement("input");
    sl.type = "range"; sl.min = min; sl.max = max; sl.step = step; sl.value = value;
    var out = document.createElement("input");
    out.type = "text"; out.className = "ep-num"; out.readOnly = true; out.value = fmt(value);
    sl.addEventListener("input", function () {
      var v = parseFloat(sl.value); out.value = fmt(v); onInput(v); render(); syncJSON();
    });
    row.appendChild(sl); row.appendChild(out);
    return row;
  }
  function epColor(sect, label, value, onInput, resetLabel, onReset) {
    var row = epRow(sect, label);
    var c = document.createElement("input");
    c.type = "color"; c.value = value;
    c.addEventListener("input", function () { onInput(c.value); render(); syncJSON(); });
    row.appendChild(c);
    if (onReset) {
      var b = epEl("button", null, resetLabel || "Défaut");
      b.type = "button";
      b.addEventListener("click", function () { pushHistory(); onReset(); render(); syncJSON(); });
      row.appendChild(b);
    }
    return row;
  }
  function epTextInput(sect, label, value, placeholder, onInput) {
    var row = epRow(sect, label);
    var i = document.createElement("input");
    i.type = "text"; i.value = value || ""; i.placeholder = placeholder || "";
    i.style.flex = "1"; i.style.minWidth = "0";
    i.addEventListener("input", function () { onInput(i.value); render(); syncJSON(); });
    row.appendChild(i);
    return row;
  }
  // Choix par icone plutot que par texte : Robin lit peu confortablement de
  // longues listes de mots, la representation graphique va plus vite.
  // Remplace epSelect() partout ou une icone dit la meme chose qu'un mot
  // (style de trait, remplissage, tete de fleche, type de fleche, porteur du
  // ballon). onClick fait pushHistory lui-meme quand il a besoin de rouvrir
  // le panneau (ex: reconstruire apres un changement qui affiche/masque une
  // autre ligne) ; sinon epIconBtn s'en charge.
  function epIconRow(sect, label) {
    var row = epRow(sect, label);
    var wrap = epEl("div", "ep-icon-row");
    row.appendChild(wrap);
    return wrap;
  }
  function epIconBtn(wrap, on, title, node, onClick) {
    var b = epEl("button", "ep-icon-btn" + (on ? " on" : ""));
    b.type = "button";
    if (title) b.title = title;
    b.appendChild(node);
    b.addEventListener("click", onClick);
    wrap.appendChild(b);
    return b;
  }
  // Variante simple : chaque option porte sa propre valeur/icone/titre, la
  // sequence pushHistory -> onChange -> re-render est generique. A utiliser
  // quand aucun effet de bord (masquer une autre ligne, etc.) n'est necessaire.
  function epIconPick(sect, label, options, value, onChange) {
    var wrap = epIconRow(sect, label);
    options.forEach(function (o) {
      epIconBtn(wrap, o.value === value, o.title, o.icon(), function () {
        pushHistory(); onChange(o.value);
        Array.from(wrap.children).forEach(function (c) { c.classList.remove("on"); });
        this.classList.add("on");
        render(); syncJSON();
      });
    });
    return wrap;
  }
  function icoSvg(w, h) { return el("svg", { viewBox: "0 0 " + w + " " + h, width: w, height: h }); }
  // Cadenas ferme/ouvert pour le bouton de verrouillage du titre de panneau.
  // "currentColor" pour heriter la couleur du bouton (etat repos/actif via
  // CSS) — pas d'icone sur le terrain lui-meme (retire a la demande de
  // Robin : trop de bruit visuel sur un schema charge).
  function icoLock(open) {
    var s = icoSvg(16, 16);
    var shackleD = open ? "M 5 7 V 5.4 A 3 3 0 0 1 10.6 4" : "M 5 7 V 5 A 3 3 0 0 1 11 5 V 7";
    s.appendChild(el("path", { d: shackleD, fill: "none", stroke: "currentColor", "stroke-width": 1.6, "stroke-linecap": "round" }));
    s.appendChild(el("rect", { x: 3.5, y: 7, width: 9, height: 7, rx: 1.6, fill: "currentColor" }));
    return s;
  }
  function icoLineStyle(dashed) {
    var s = icoSvg(30, 18);
    s.appendChild(el("line", { x1: 3, y1: 9, x2: 27, y2: 9, stroke: "#e9ebe6", "stroke-width": 2.5, "stroke-dasharray": dashed ? "4 3" : "0", "stroke-linecap": "round" }));
    return s;
  }
  function icoFillStyle(mode) {
    var s = icoSvg(28, 20);
    s.appendChild(el("rect", { x: 2, y: 2, width: 24, height: 16, rx: 2, fill: "none", stroke: "var(--line-strong)", "stroke-width": 1.3 }));
    if (mode === "solid") s.appendChild(el("rect", { x: 4, y: 4, width: 20, height: 12, rx: 1, fill: "#e9ebe6", opacity: 0.6 }));
    else if (mode === "hatch") {
      var pid = "epHatch";
      if (!document.getElementById(pid)) {
        var defs = el("defs", {});
        var pat = el("pattern", { id: pid, width: 5, height: 5, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" });
        // Meme ratio que R.hatchFill (40% pleine / 60% vide) : le choix
        // ressemble a ce qu'il produira reellement sur la zone.
        pat.appendChild(el("line", { x1: 0, y1: 0, x2: 0, y2: 5, stroke: "#e9ebe6", "stroke-width": 2 }));
        defs.appendChild(pat); s.appendChild(defs);
      }
      s.appendChild(el("rect", { x: 4, y: 4, width: 20, height: 12, rx: 1, fill: "url(#" + pid + ")", opacity: 0.85 }));
    } else {
      s.appendChild(el("line", { x1: 5, y1: 15, x2: 23, y2: 5, stroke: "#8b9086", "stroke-width": 1.4 }));
    }
    return s;
  }
  function icoHeadStyle(kind) {
    var s = icoSvg(30, 18);
    s.appendChild(el("line", { x1: 3, y1: 9, x2: kind === "none" ? 27 : 20, y2: 9, stroke: "#e9ebe6", "stroke-width": 2.2, "stroke-linecap": "round" }));
    if (kind === "arrow") s.appendChild(el("polygon", { points: "20,4 28,9 20,14", fill: "#e9ebe6" }));
    else if (kind === "bar") s.appendChild(el("line", { x1: 26, y1: 3, x2: 26, y2: 15, stroke: "#e9ebe6", "stroke-width": 3.5, "stroke-linecap": "round" }));
    return s;
  }
  // Meme couleur/pointille que le rendu reel (cf R.annoColor/R.annoDash) : le
  // choix se voit d'avance comme il apparaitra sur le terrain.
  function icoArrowType(type) {
    var s = icoSvg(30, 18);
    var color = R.annoColor(type), dash = R.annoDash(type);
    s.appendChild(el("line", { x1: 3, y1: 9, x2: 20, y2: 9, stroke: color, "stroke-width": 2.2, "stroke-dasharray": dash, "stroke-linecap": "round" }));
    s.appendChild(el("polygon", { points: "20,4 28,9 20,14", fill: color }));
    // Le rendu ne distingue pas passe/tir (meme couleur pleine) : un petit but
    // derriere la pointe suffit a lever l'ambiguite au choix, sans mentir sur
    // ce qui apparaitra reellement sur le terrain.
    if (type === "shot") s.appendChild(el("rect", { x: 25, y: 3, width: 4, height: 12, fill: "none", stroke: color, "stroke-width": 1, opacity: 0.6 }));
    return s;
  }
  // Reprend la silhouette reelle du jeton (cf drawEntity/shape "body") en
  // miniature, plutot qu'un mot : "rond" et "corps oriente" se distinguent au
  // premier coup d'oeil sans avoir a lire.
  function icoTokenShape(shape) {
    var s = icoSvg(24, 24);
    if (shape === "body") {
      s.appendChild(el("path", { d: "M5,17 A8 8 0 0 1 19,17", fill: "none", stroke: "#e9ebe6", "stroke-width": 3, "stroke-linecap": "round" }));
      s.appendChild(el("polygon", { points: "12,3 8.5,9 15.5,9", fill: "none", stroke: "#e9ebe6", "stroke-width": 1.5, "stroke-linejoin": "round" }));
    }
    if (shape === "square") s.appendChild(el("rect", { x: 5.5, y: 6.5, width: 13, height: 13, rx: 3.5, fill: "#e9ebe6", stroke: "#12140f", "stroke-width": 1.3 }));
    else s.appendChild(el("circle", { cx: 12, cy: 13, r: 6.5, fill: "#e9ebe6", stroke: "#12140f", "stroke-width": 1.3 }));
    return s;
  }
  function icoCarrierToken(pl) {
    var ts = R.teamStyle(drill, pl);
    var s = icoSvg(24, 24);
    s.appendChild(el("circle", { cx: 12, cy: 12, r: 9.5, fill: ts.fill, stroke: ts.stroke, "stroke-width": 1.4 }));
    var t = el("text", { x: 12, y: 16, "font-size": 10, "font-family": "Arial", "font-weight": "bold", "text-anchor": "middle", fill: ts.text });
    t.textContent = pl.label || "";
    s.appendChild(t);
    return s;
  }
  function icoCarrierNone() {
    var s = icoSvg(24, 24);
    s.appendChild(el("circle", { cx: 12, cy: 12, r: 9.5, fill: "none", stroke: "#8b9086", "stroke-width": 1.4 }));
    s.appendChild(el("line", { x1: 6, y1: 18, x2: 18, y2: 6, stroke: "#8b9086", "stroke-width": 1.4 }));
    return s;
  }

  function buildEntityEditPop(e) {
    var pop = epEl("div", "edit-pop");
    var ts = R.teamStyle(drill, e);
    var isPlayer = e.type === "player" || e.type === "support";
    var eq = R.EQUIP[e.type], isEquip = !!eq || e.type === "cone";
    // Le nom d'equipe ne titre que les joueurs : un ballon ou un plot ne
    // "porte" pas un maillot, meme si teamStyle leur resout une couleur.
    var title = isPlayer ? ts.name + (e.label ? " · " + e.label : "")
      : eq ? eq.label
      : e.type === "cone" ? "Plot"
      : e.type === "ball" ? "Ballon"
      : e.type === "goal" ? "But"
      : "Élément";
    pop.appendChild(epEl("h3", null, title));

    if (isPlayer) {
      var s1 = epSection("Apparence");
      epIconPick(s1, "Jeton",
        [{ value: "circle", title: "Rond", icon: function () { return icoTokenShape("circle"); } },
         { value: "square", title: "Carré", icon: function () { return icoTokenShape("square"); } },
         { value: "body", title: "Corps orienté", icon: function () { return icoTokenShape("body"); } }],
        ts.shape,
        function (v) {
          e.shape = v;
          if (v === "body" && typeof e.facing !== "number") e.facing = 0;
          openEditPop(e, lastPopXY.x, lastPopXY.y);
        });
      var r2 = epRow(s1, "Taille");
      var sz = document.createElement("input");
      sz.type = "range"; sz.min = "0.7"; sz.max = "1.6"; sz.step = "0.1"; sz.value = e.size || 0.9;
      var szv = document.createElement("input");
      szv.type = "text"; szv.className = "ep-num"; szv.readOnly = true; szv.value = (e.size || 0.9).toFixed(1);
      sz.addEventListener("input", function () {
        e.size = parseFloat(sz.value); szv.value = e.size.toFixed(1);
        render(); syncJSON();
      });
      r2.appendChild(sz); r2.appendChild(szv);
      var r3 = epRow(s1, "Couleur");
      var col = document.createElement("input");
      col.type = "color"; col.value = ts.fill;
      col.addEventListener("input", function () { e.color = col.value; render(); syncJSON(); });
      var creset = epEl("button", null, "Équipe");
      creset.type = "button"; creset.title = "Revenir à la couleur de l'équipe";
      creset.addEventListener("click", function () {
        pushHistory(); delete e.color; render(); syncJSON(); openEditPop(e, lastPopXY.x, lastPopXY.y);
      });
      r3.appendChild(col); r3.appendChild(creset);
      pop.appendChild(s1);

      var s2 = epSection("Style");
      epSwitch(epRow(s2, "Chasuble"), function () { return !!e.bib; }, function (v) {
        if (v) e.bib = true; else delete e.bib;
        bibColorRow.style.display = v ? "" : "none";
      });
      var bibColorRow = epColor(s2, "Couleur", e.bibColor || R.BIB, function (v) { e.bibColor = v; }, "Défaut", function () { delete e.bibColor; });
      bibColorRow.style.display = e.bib ? "" : "none";
      epSwitch(epRow(s2, "Surbrillance"), function () { return !!e.highlight; }, function (v) { if (v) e.highlight = true; else delete e.highlight; });
      var visRow = epRow(s2, "Vision");
      var visSw = epSwitch(visRow, function () { return !!e.vision; }, function (v) { if (v) e.vision = true; else delete e.vision; });
      // Le cone de vision n'a de sens qu'avec une orientation : sur un jeton
      // rond il serait dessine nulle part, autant le dire.
      if (ts.shape !== "body") {
        visSw.disabled = true;
        visRow.title = "Disponible sur un jeton « corps orienté »";
        visRow.style.opacity = "0.5";
      }
      pop.appendChild(s2);

      var s3 = epSection("Identité");
      var nRow = epRow(s3, "Nom");
      var nInp = document.createElement("input");
      nInp.type = "text"; nInp.value = e.role || ""; nInp.placeholder = "ex: pivot";
      nInp.style.flex = "1"; nInp.style.minWidth = "0";
      nInp.addEventListener("input", function () { e.role = nInp.value; render(); syncJSON(); });
      nRow.appendChild(nInp);
      epSwitch(nRow, function () { return !!e.showName; }, function (v) { if (v) e.showName = true; else delete e.showName; });
      var numRow = epRow(s3, "Numéro");
      var numInp = document.createElement("input");
      numInp.type = "text"; numInp.className = "ep-num"; numInp.value = e.label || "";
      numInp.addEventListener("input", function () { e.label = numInp.value; render(); syncJSON(); });
      numRow.appendChild(numInp);
      epSwitch(numRow, function () { return e.showNumber !== false; }, function (v) { if (v) delete e.showNumber; else e.showNumber = false; });
      pop.appendChild(s3);
    } else if (e.type === "ball") {
      var b1 = epSection("Ballon");
      // Chaque joueur est son propre pictogramme (couleur + numero d'equipe) :
      // reconnaitre "7 en bleu" va plus vite que lire une liste de noms.
      var carriers = ents().filter(function (pl) { return pl.type === "player" || pl.type === "support"; });
      epIconPick(b1, "Porteur",
        [{ value: "", title: "Aucun (libre)", icon: icoCarrierNone }].concat(carriers.map(function (pl) {
          return { value: pl.id, title: (pl.label || pl.id) + (pl.role ? " · " + pl.role : ""), icon: function () { return icoCarrierToken(pl); } };
        })),
        e.attachedTo || "", function (v) { if (v) e.attachedTo = v; else delete e.attachedTo; });
      if (drill.keyframes.length > 1) {
        epSwitch(epRow(b1, "En l'air"), function () { return !!e.aerial; }, function (v) { if (v) e.aerial = true; else delete e.aerial; });
      }
      pop.appendChild(b1);
    }

    // Reglages de mouvement : n'ont de sens qu'a partir de deux etapes, et
    // seulement pour ce qui se deplace. Ils vivaient dans l'inspecteur, ils
    // doivent suivre ici sinon le clic droit serait une regression.
    var canMove = e.type === "player" || e.type === "support" || e.type === "ball";
    if (canMove && drill.keyframes.length > 1) {
      var sm = epSection("Mouvement");
      epSwitch(epRow(sm, "Courbe lissée"), function () { return !!e.curve; }, function (v) { if (v) e.curve = true; else delete e.curve; });
      epRange(sm, "Épaisseur", 1, 7, 0.5, e.arrowWidth || 2, function (v) { return v.toFixed(1); }, function (v) { e.arrowWidth = v; });
      pop.appendChild(sm);
    }

    if (isEquip || e.type === "goal") {
      var q1 = epSection("Apparence");
      if (isEquip) {
        var qc = epRow(q1, "Couleur");
        var qcol = document.createElement("input");
        qcol.type = "color"; qcol.value = e.color || (eq ? eq.color : COL.cone);
        qcol.addEventListener("input", function () { e.color = qcol.value; render(); syncJSON(); });
        var qreset = epEl("button", null, "Défaut");
        qreset.type = "button";
        qreset.addEventListener("click", function () {
          pushHistory(); delete e.color; render(); syncJSON(); openEditPop(e, lastPopXY.x, lastPopXY.y);
        });
        qc.appendChild(qcol); qc.appendChild(qreset);
      }
      var qs = epRow(q1, "Taille");
      var qsz = document.createElement("input");
      qsz.type = "range"; qsz.min = "0.7"; qsz.max = "1.6"; qsz.step = "0.1"; qsz.value = e.size || 1;
      var qszv = document.createElement("input");
      qszv.type = "text"; qszv.className = "ep-num"; qszv.readOnly = true; qszv.value = (e.size || 1).toFixed(1);
      qsz.addEventListener("input", function () { e.size = parseFloat(qsz.value); qszv.value = e.size.toFixed(1); render(); syncJSON(); });
      qs.appendChild(qsz); qs.appendChild(qszv);
      if (isRotatable(e)) {
        var qr = epRow(q1, "Orientation");
        var ang = document.createElement("input");
        ang.type = "range"; ang.min = "0"; ang.max = "345"; ang.step = "15"; ang.value = e.facing || 0;
        var angv = document.createElement("input");
        angv.type = "text"; angv.className = "ep-num"; angv.readOnly = true; angv.value = (e.facing || 0) + "°";
        ang.addEventListener("input", function () { e.facing = parseInt(ang.value, 10); angv.value = e.facing + "°"; render(); syncJSON(); });
        qr.appendChild(ang); qr.appendChild(angv);
      }
      pop.appendChild(q1);
    }
    return pop;
  }
  function buildZoneEditPop(z) {
    var pop = epEl("div", "edit-pop");
    var h3 = epEl("h3", null, z.label || "Zone");
    pop.appendChild(h3);
    var s0 = epSection("Nom");
    epTextInput(s0, "Nom", z.label, "ex: Zone de finition", function (v) { z.label = v; h3.textContent = v || "Zone"; });
    pop.appendChild(s0);
    var s1 = epSection("Contour");
    epIconPick(s1, "Style",
      [{ value: "dash", title: "Pointillé", icon: function () { return icoLineStyle(true); } },
       { value: "solid", title: "Continu", icon: function () { return icoLineStyle(false); } }],
      z.stroke === "solid" ? "solid" : "dash",
      function (v) { if (v === "solid") z.stroke = "solid"; else delete z.stroke; if (selZone === z) fillZoneStyle(z); });
    var r2 = epRow(s1, "Épaisseur");
    var sw = document.createElement("input");
    sw.type = "range"; sw.min = "0.5"; sw.max = "6"; sw.step = "0.5";
    sw.value = typeof z.strokeWidth === "number" ? z.strokeWidth : 1.5;
    var swv = document.createElement("input");
    swv.type = "text"; swv.className = "ep-num"; swv.readOnly = true; swv.value = parseFloat(sw.value).toFixed(1);
    sw.addEventListener("input", function () {
      var v = parseFloat(sw.value); swv.value = v.toFixed(1);
      if (v === 1.5) delete z.strokeWidth; else z.strokeWidth = v;
      render(); syncJSON(); if (selZone === z) fillZoneStyle(z);
    });
    r2.appendChild(sw); r2.appendChild(swv);
    var r3 = epRow(s1, "Couleur");
    var col = document.createElement("input");
    col.type = "color"; col.value = z.color || "#ffffff";
    col.addEventListener("input", function () { z.color = col.value; render(); syncJSON(); });
    var creset = epEl("button", null, "Défaut");
    creset.type = "button";
    creset.addEventListener("click", function () {
      pushHistory(); delete z.color; render(); syncJSON(); openEditPop(z, lastPopXY.x, lastPopXY.y, "zone");
    });
    r3.appendChild(col); r3.appendChild(creset);
    pop.appendChild(s1);

    var s2 = epSection("Remplissage");
    epIconPick(s2, "Style",
      [{ value: "solid", title: "Plein", icon: function () { return icoFillStyle("solid"); } },
       { value: "hatch", title: "Hachuré", icon: function () { return icoFillStyle("hatch"); } },
       { value: "none", title: "Aucun", icon: function () { return icoFillStyle("none"); } }],
      z.fill || "solid",
      function (v) {
        if (v === "solid") delete z.fill; else z.fill = v;
        // L'opacite par defaut differe entre plein et hachure : on repart du
        // defaut du nouveau mode au lieu de traîner celle de l'ancien.
        delete z.fillOpacity;
        if (selZone === z) fillZoneStyle(z);
        openEditPop(z, lastPopXY.x, lastPopXY.y, "zone");
      });
    var r5 = epRow(s2, "Opacité");
    var op = document.createElement("input");
    op.type = "range"; op.min = "0"; op.max = "1"; op.step = "0.02";
    var defOp = (z.fill || "solid") === "hatch" ? 0.55 : 0.28;
    op.value = typeof z.fillOpacity === "number" ? z.fillOpacity : defOp;
    var opv = document.createElement("input");
    opv.type = "text"; opv.className = "ep-num"; opv.readOnly = true; opv.value = parseFloat(op.value).toFixed(2);
    op.addEventListener("input", function () {
      var v = parseFloat(op.value); opv.value = v.toFixed(2);
      z.fillOpacity = v; render(); syncJSON(); if (selZone === z) fillZoneStyle(z);
    });
    r5.appendChild(op); r5.appendChild(opv);
    r5.style.display = (z.fill || "solid") === "none" ? "none" : "";
    pop.appendChild(s2);
    return pop;
  }
  function buildLineEditPop(ln) {
    var pop = epEl("div", "edit-pop");
    pop.appendChild(epEl("h3", null, "Trait"));
    var s = epSection("Tracé");
    epColor(s, "Couleur", ln.color || "#ffffff", function (v) { ln.color = v; });
    epRange(s, "Épaisseur", 1, 7, 0.5, ln.width || 2, function (v) { return v.toFixed(1); }, function (v) { ln.width = v; });
    epSwitch(epRow(s, "Pointillé"), function () { return !!ln.dash; }, function (v) { if (v) ln.dash = true; else delete ln.dash; });
    epSwitch(epRow(s, "En l'air"), function () { return !!ln.aerial; }, function (v) { if (v) ln.aerial = true; else delete ln.aerial; });
    epIconPick(s, "Tête",
      [{ value: "none", title: "Aucune", icon: function () { return icoHeadStyle("none"); } },
       { value: "arrow", title: "Flèche", icon: function () { return icoHeadStyle("arrow"); } },
       { value: "bar", title: "Barre (bloc)", icon: function () { return icoHeadStyle("bar"); } }],
      ln.head || "arrow", function (v) { ln.head = v; });
    pop.appendChild(s);
    // Choix des etapes d'apparition : uniquement utile a partir de 2 etapes,
    // et seulement en mode simple (le mode avance a deja sa propre edition
    // fine, au ms pres, via les poignees de la timeline avancee).
    if (!advancedMode && drill.keyframes.length > 1) {
      var s2 = epSection("Apparaît");
      var bm = boundaryMs(), N = drill.keyframes.length;
      var range = lineVisibleStepRange(ln, bm, N);
      function stepLabel(i) { return drill.keyframes[i].label || ("Étape " + (i + 1)); }
      function fillSteps(sel, selected) {
        for (var i = 0; i < N; i++) {
          var o = document.createElement("option");
          o.value = String(i); o.textContent = stepLabel(i);
          if (i === selected) o.selected = true;
          sel.appendChild(o);
        }
      }
      var fromSel = document.createElement("select");
      var toSel = document.createElement("select");
      fillSteps(fromSel, range.from);
      fillSteps(toSel, range.to);
      fromSel.addEventListener("change", function () {
        pushHistory();
        var f = parseInt(fromSel.value, 10), t = Math.max(f, parseInt(toSel.value, 10));
        setLineVisibleStepRange(ln, bm, N, f, t);
        render(); syncJSON(); openEditPop(ln, lastPopXY.x, lastPopXY.y, "line");
      });
      toSel.addEventListener("change", function () {
        pushHistory();
        var t = parseInt(toSel.value, 10), f = Math.min(t, parseInt(fromSel.value, 10));
        setLineVisibleStepRange(ln, bm, N, f, t);
        render(); syncJSON(); openEditPop(ln, lastPopXY.x, lastPopXY.y, "line");
      });
      epRow(s2, "De l'étape").appendChild(fromSel);
      epRow(s2, "à l'étape").appendChild(toSel);
      pop.appendChild(s2);
    }
    var hint = epEl("div", "ep-sect");
    hint.appendChild(epEl("div", null, "Glisse les carrés pour les extrémités, le rond pour courber."));
    hint.style.color = "var(--muted)"; hint.style.fontSize = "11px";
    pop.appendChild(hint);
    return pop;
  }
  function buildTextEditPop(tx) {
    var pop = epEl("div", "edit-pop");
    pop.appendChild(epEl("h3", null, "Texte"));
    var s = epSection("Contenu");
    var ta = document.createElement("textarea");
    ta.rows = 2; ta.value = tx.text || ""; ta.placeholder = "Ton texte (Entrée = retour à la ligne)";
    ta.style.width = "100%"; ta.style.resize = "vertical";
    ta.addEventListener("input", function () { tx.text = ta.value; render(); syncJSON(); });
    s.appendChild(ta);
    pop.appendChild(s);
    var s2 = epSection("Style");
    epColor(s2, "Couleur", tx.color || "#ffffff", function (v) { tx.color = v; });
    epRange(s2, "Taille", 8, 28, 1, tx.size || 13, function (v) { return v + "px"; }, function (v) { tx.size = v; });
    epSwitch(epRow(s2, "Contour"), function () { return tx.outline !== false; }, function (v) { if (v) delete tx.outline; else tx.outline = false; });
    epSwitch(epRow(s2, "Gras"), function () { return tx.bold !== false; }, function (v) { if (v) delete tx.bold; else tx.bold = false; });
    var ar = epRow(s2, "Aligner");
    var seg = epEl("div", "ep-seg");
    [["left", "gauche"], ["center", "centré"], ["right", "droite"]].forEach(function (o) {
      var b = epEl("button", null, o[1]);
      b.type = "button";
      if ((tx.align || "center") === o[0]) b.className = "on";
      b.addEventListener("click", function () {
        pushHistory();
        if (o[0] === "center") delete tx.align; else tx.align = o[0];
        render(); syncJSON(); openEditPop(tx, lastPopXY.x, lastPopXY.y, "text");
      });
      seg.appendChild(b);
    });
    ar.appendChild(seg);
    pop.appendChild(s2);
    return pop;
  }
  function buildPulseEditPop(pu) {
    var pop = epEl("div", "edit-pop");
    pop.appendChild(epEl("h3", null, "Pulse"));
    var s = epSection("Apparence");
    epColor(s, "Couleur", pu.color || "#ff3b30", function (v) { pu.color = v; });
    epRange(s, "Taille", 0.6, 2.5, 0.1, pu.size || 1, function (v) { return v.toFixed(1) + "×"; }, function (v) { pu.size = v; });
    pop.appendChild(s);
    var hint = epEl("div", "ep-sect");
    hint.appendChild(epEl("div", null, "Clignote en continu, en édition comme à l'export."));
    hint.style.color = "var(--muted)"; hint.style.fontSize = "11px";
    pop.appendChild(hint);
    return pop;
  }
  function buildArrowEditPop(a) {
    var pop = epEl("div", "edit-pop");
    pop.appendChild(epEl("h3", null, "Flèche"));
    var s = epSection("Tracé");
    epIconPick(s, "Type",
      [{ value: "pass", title: "Passe", icon: function () { return icoArrowType("pass"); } },
       { value: "run", title: "Course", icon: function () { return icoArrowType("run"); } },
       { value: "dribble", title: "Conduite", icon: function () { return icoArrowType("dribble"); } },
       { value: "shot", title: "Tir", icon: function () { return icoArrowType("shot"); } }],
      a.type, function (v) { a.type = v; });
    epTextInput(s, "Label", a.label, "ex: passe dans le dos", function (v) { a.label = v; });
    epRange(s, "Épaisseur", 1, 7, 0.5, a.width || 2, function (v) { return v.toFixed(1); }, function (v) { a.width = v; });
    pop.appendChild(s);
    return pop;
  }
  function buildMultiEditPop() {
    var pop = epEl("div", "edit-pop");
    pop.appendChild(epEl("h3", null, multiSel.length + " éléments sélectionnés"));
    var s = epEl("div", "ep-sect");
    s.appendChild(epEl("div", null, "Glisse un des éléments sélectionnés pour déplacer tout le groupe."));
    s.style.color = "var(--muted)"; s.style.fontSize = "11px";
    pop.appendChild(s);
    return pop;
  }

  var lastPopXY = { x: 0, y: 0 };
  function openEditPop(ref, x, y, kind) {
    closeEditPop(); closeContextMenu();
    lastPopXY = { x: x, y: y };
    var pop = kind === "zone" ? buildZoneEditPop(ref)
      : kind === "line" ? buildLineEditPop(ref)
      : kind === "text" ? buildTextEditPop(ref)
      : kind === "pulse" ? buildPulseEditPop(ref)
      : kind === "arrow" ? buildArrowEditPop(ref)
      : kind === "multi" ? buildMultiEditPop()
      : buildEntityEditPop(ref);

    // Verrou : dans le titre plutot qu'en pied, pour rester visible et
    // accessible d'un coup d'oeil meme sur un panneau long (Apparence/Style/
    // Identite...). Absent pour "arrow" : une fleche derivee du mouvement
    // n'a pas d'id stable a verrouiller (cf computeArrows, regenere a
    // chaque enregistrement).
    if (kind !== "arrow") {
      var h3 = pop.querySelector("h3");
      if (h3) {
        h3.classList.add("ep-title-row");
        var lockBtn = epEl("button", "ep-lock-toggle");
        lockBtn.type = "button";
        function curLockState() {
          return kind === "multi" ? multiSel.length > 0 && multiSel.every(function (s) { return isLocked(s.ref.id); }) : isLocked(ref.id);
        }
        function paintLock() {
          var on = curLockState();
          lockBtn.innerHTML = "";
          lockBtn.appendChild(icoLock(!on));
          lockBtn.classList.toggle("on", on);
          lockBtn.title = (on ? "Déverrouiller" : "Verrouiller") + " (K)";
        }
        paintLock();
        // pointerdown stoppe la propagation pour ne pas declencher le glisser
        // du panneau (h3 entier est la poignee, cf wireEditPopDrag).
        lockBtn.addEventListener("pointerdown", function (ev) { ev.stopPropagation(); });
        lockBtn.addEventListener("click", function (ev) {
          ev.stopPropagation();
          if (kind === "multi") {
            var target = !curLockState();
            pushHistory();
            multiSel.forEach(function (s) { setLocked(s.ref.id, target); });
            render(); syncJSON();
          } else {
            toggleLocked(ref.id);
          }
          paintLock();
        });
        h3.appendChild(lockBtn);
      }
    }

    var foot = epEl("div", "ep-foot");
    if (!kind && curKf > 0) {
      var prev = findById(drill.keyframes[curKf - 1].entities, ref.id);
      if (prev && (prev.x !== ref.x || prev.y !== ref.y)) {
        var rb = epEl("button", null, "↺ Réinitialiser la position");
        rb.type = "button";
        rb.addEventListener("click", function () { closeEditPop(); resetEntityToPrevPosition(ref, prev); });
        foot.appendChild(rb);
      }
    }
    // Couper/copier/coller restent accessibles : le panneau remplace l'ancien
    // menu contextuel pour ces types, il ne doit rien lui retirer.
    // Copier/couper : memes types que Cmd/Ctrl+C (copySel) — les proposer sur
    // un texte ou un pulse les laisserait sans effet, comme dans l'ancien menu.
    var copyable = !kind || kind === "zone" || kind === "line";
    if (copyable || clipboard) {
      var cutRow = epEl("div", "ep-row");
      cutRow.style.gap = "6px";
      if (copyable) {
        [["Copier", function () { copySel(); }], ["Couper", function () { copySel(); deleteSelected(); }]].forEach(function (a) {
          var b = epEl("button", null, a[0]);
          b.type = "button"; b.style.flex = "1";
          b.addEventListener("click", function () { closeEditPop(); a[1](); });
          cutRow.appendChild(b);
        });
      }
      if (clipboard) {
        var pb = epEl("button", null, "Coller");
        pb.type = "button"; pb.style.flex = "1";
        pb.addEventListener("click", function () { closeEditPop(); pasteSel(); });
        cutRow.appendChild(pb);
      }
      foot.appendChild(cutRow);
    }
    var db = epEl("button", "danger", kind === "multi" ? "Tout supprimer" : "Supprimer");
    db.type = "button";
    db.addEventListener("click", function () { closeEditPop(); deleteSelected(); });
    foot.appendChild(db);
    pop.appendChild(foot);

    document.body.appendChild(pop);
    editPopEl = pop;
    var pw = pop.offsetWidth, ph = pop.offsetHeight;
    pop.style.left = Math.max(6, Math.min(x, window.innerWidth - pw - 10)) + "px";
    pop.style.top = Math.max(6, Math.min(y, window.innerHeight - ph - 10)) + "px";
    wireEditPopDrag(pop);
    // Meme precaution que le menu contextuel : laisser le clic droit courant se
    // terminer avant d'armer la fermeture au clic exterieur.
    setTimeout(function () {
      document.addEventListener("pointerdown", onOutsideEditPop, true);
      document.addEventListener("keydown", onEditPopKey, true);
    }, 0);
  }
  // Le panneau se pose la ou on a clique, ce qui cache parfois exactement ce
  // qu'on voulait regarder en le reglant. Glisser par le titre pour le
  // deplacer, comme l'ancien inspecteur flottant avec sa poignee.
  function wireEditPopDrag(pop) {
    var handle = pop.querySelector("h3");
    if (!handle) return;
    handle.classList.add("ep-drag-handle");
    handle.title = "Glisser pour déplacer";
    var startX = 0, startY = 0, startLeft = 0, startTop = 0;
    function onMove(ev) {
      var dx = ev.clientX - startX, dy = ev.clientY - startY;
      var maxLeft = Math.max(4, window.innerWidth - pop.offsetWidth - 4);
      var maxTop = Math.max(4, window.innerHeight - pop.offsetHeight - 4);
      pop.style.left = Math.max(4, Math.min(startLeft + dx, maxLeft)) + "px";
      pop.style.top = Math.max(4, Math.min(startTop + dy, maxTop)) + "px";
    }
    function onUp() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      handle.classList.remove("dragging");
      // Un reglage qui doit reconstruire tout le panneau (changement de forme,
      // de remplissage...) rouvre via openEditPop(lastPopXY) — sans mettre a
      // jour ces coordonnees ici, le panneau sauterait a l'endroit du clic
      // droit d'origine a chaque reglage de ce type, effaçant le glisser.
      lastPopXY = { x: parseFloat(pop.style.left), y: parseFloat(pop.style.top) };
    }
    handle.addEventListener("pointerdown", function (ev) {
      if (ev.button !== 0 && ev.pointerType === "mouse") return;
      ev.preventDefault(); ev.stopPropagation();
      var rect = pop.getBoundingClientRect();
      startLeft = rect.left; startTop = rect.top;
      startX = ev.clientX; startY = ev.clientY;
      handle.classList.add("dragging");
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    });
  }

  function resetEntityToPrevPosition(e, prev) {
    pushHistory();
    e.x = prev.x; e.y = prev.y;
    // Le ballon porte suit son joueur pour rester coherent, comme lors d'un
    // deplacement classique (cf onEntityDown / carried).
    if (e.type === "player" || e.type === "support") {
      var ball = ballCarriedBy(ents(), e.id);
      if (ball) {
        var prevBall = findById(drill.keyframes[curKf - 1].entities, ball.id);
        if (prevBall) { ball.x = prevBall.x; ball.y = prevBall.y; }
      }
    }
    render(); syncJSON();
  }

  function onEntityDown(ev, e, node) {
    if (ev.button === 2) return; // clic droit : laisse passer vers le menu contextuel (onEntityContextMenu)
    if (pendingTool) return;
    if (beginItemDrag(ev, "entity", e)) return;
    ev.preventDefault(); ev.stopPropagation();
    var target = e;
    if (ev.ctrlKey || ev.metaKey) { // Ctrl/Cmd + drag : dupliquer (dans toutes les etapes)
      var base = JSON.parse(JSON.stringify(e));
      base.id = (base.type || "e") + "-" + (Date.now() % 10000);
      target = addEntityAllKf(base);
    }
    if (!ev.shiftKey) selectEntity(target);
    // Verrouille : ni le lu de la boucle en bas (dragLoop) ni son "onDrop" ne
    // touchent la position — mais on laisse dragLoop tourner normalement,
    // sinon un Maj+clic sur un objet verrouille ne basculerait plus la
    // selection multiple (ce basculement vit dans dragLoop.up(), au clic sans
    // glisser reel).
    var lockedNow = isLocked(target.id);
    var margin = oobMargin();
    var start = clientToMeters(ev, margin), ox = target.x, oy = target.y;
    // Conduite : si on deplace un joueur qui porte un ballon, ce ballon suit.
    var carried = (target.type === "player" || target.type === "support") ? ballCarriedBy(ents(), target.id) : null;
    var box = carried ? carried.x : 0, boy = carried ? carried.y : 0;
    // Meme position tenue sur les etapes suivantes : le deplacement se propage
    // jusqu'a la premiere etape ou l'entite (ou le ballon porte) a deja bouge.
    var holdChain = forwardHoldChain(target.id, ox, oy);
    var ballHoldChain = carried ? forwardHoldChain(carried.id, box, boy, target.id) : [];
    // Si on deplace le ballon : a la depose il s'associe au joueur le plus proche (sinon libre).
    var onDrop = lockedNow ? null : target.type === "ball" ? function () {
      var nearest = null, nd = 1.8;
      ents().forEach(function (pl) { if (pl.type !== "player" && pl.type !== "support") return; var d = Math.hypot(pl.x - target.x, pl.y - target.y); if (d < nd) { nd = d; nearest = pl; } });
      if (nearest) target.attachedTo = nearest.id; else delete target.attachedTo;
      if (selEntity === target) fillBallCarrier(target);
    } : null;
    dragLoop(function (mv) {
      if (lockedNow) return;
      var m = clientToMeters(mv, margin), nx = ox + (m.x - start.x), ny = oy + (m.y - start.y);
      if (mv.shiftKey) { if (Math.abs(m.x - start.x) >= Math.abs(m.y - start.y)) ny = oy; else nx = ox; } // Maj : aligner sur l'axe
      // Le ballon porte suit le joueur : l'exclure des cibles d'aimantation,
      // sinon le joueur s'aimante sur son propre ballon et se fige.
      snapDisabled = !mv.shiftKey;
      var sn = snapDrag(target, nx, ny, carried ? [carried.id] : null);
      nx = sn.x; ny = sn.y;
      target.x = clamp(round1(nx), -margin, drill.pitch.length + margin);
      target.y = clamp(round1(ny), -margin, drill.pitch.width + margin);
      if (carried) { carried.x = clamp(round1(box + (target.x - ox)), -margin, drill.pitch.length + margin); carried.y = clamp(round1(boy + (target.y - oy)), -margin, drill.pitch.width + margin); }
      holdChain.forEach(function (ent) { ent.x = target.x; ent.y = target.y; });
      ballHoldChain.forEach(function (ent) { ent.x = carried.x; ent.y = carried.y; });
      render();
    }, onDrop, ev.shiftKey ? { kind: "entity", ref: target } : null);
  }

  function onZoneDown(ev, z) {
    if (ev.button === 2) return; // clic droit : laisse passer vers le menu contextuel
    if (pendingTool) return;
    if (beginItemDrag(ev, "zone", z)) return;
    ev.preventDefault(); ev.stopPropagation();
    var target = z;
    if (ev.ctrlKey || ev.metaKey) { // Ctrl/Cmd + drag : dupliquer la zone
      target = JSON.parse(JSON.stringify(z));
      target.id = "z" + (zid++);
      drill.zones.push(target);
    }
    if (!ev.shiftKey) selectZone(target);
    var lockedNow = isLocked(target.id);
    var start = clientToMeters(ev);
    var selInfo = ev.shiftKey ? { kind: "zone", ref: target } : null;
    if (target.shape === "polygon") {
      var origPts = target.pts.map(function (p) { return { x: p.x, y: p.y }; });
      dragLoop(function (mv) {
        if (lockedNow) return;
        var m = clientToMeters(mv), dx = m.x - start.x, dy = m.y - start.y;
        target.pts = origPts.map(function (p) { return { x: clamp(round1(p.x + dx), 0, drill.pitch.length), y: clamp(round1(p.y + dy), 0, drill.pitch.width) }; });
        render();
      }, null, selInfo);
      return;
    }
    var ox = target.x, oy = target.y;
    dragLoop(function (mv) {
      if (lockedNow) return;
      var m = clientToMeters(mv), nx = ox + (m.x - start.x), ny = oy + (m.y - start.y);
      if (mv.shiftKey) { if (Math.abs(m.x - start.x) >= Math.abs(m.y - start.y)) ny = oy; else nx = ox; }
      target.x = clamp(round1(nx), 0, drill.pitch.length - target.w);
      target.y = clamp(round1(ny), 0, drill.pitch.width - target.h);
      render();
    }, null, selInfo);
  }

  function onResizeDown(ev, z, corner) {
    if (pendingTool) return;
    if (isLocked(z.id)) return; // en pratique la poignee n'est meme plus dessinee (cf render())
    ev.preventDefault(); ev.stopPropagation();
    var anchor = corner === "bl" ? { x: z.x + z.w, y: z.y + z.h } : corner === "br" ? { x: z.x, y: z.y + z.h } : corner === "tl" ? { x: z.x + z.w, y: z.y } : { x: z.x, y: z.y };
    var ratio = z.w / z.h;
    dragLoop(function (mv) {
      var m = clientToMeters(mv), nx = m.x, ny = m.y;
      if (mv.shiftKey) {
        var dw = Math.abs(nx - anchor.x), dh = Math.abs(ny - anchor.y);
        if (dh > 0 && dw / dh > ratio) dh = dw / ratio; else dw = dh * ratio;
        nx = anchor.x + sign(nx - anchor.x) * dw;
        ny = anchor.y + sign(ny - anchor.y) * dh;
      }
      z.x = round1(Math.max(0, Math.min(anchor.x, nx)));
      z.y = round1(Math.max(0, Math.min(anchor.y, ny)));
      z.w = round1(Math.max(0.5, Math.abs(nx - anchor.x)));
      z.h = round1(Math.max(0.5, Math.abs(ny - anchor.y)));
      if (z.x + z.w > drill.pitch.length) z.w = round1(drill.pitch.length - z.x);
      if (z.y + z.h > drill.pitch.width) z.h = round1(drill.pitch.width - z.y);
      render();
    });
  }

  // ---- traits libres (droits/courbés, pointillés, couleur et tête au choix) ----
  function onLineDown(ev, ln) {
    if (ev.button === 2) return; // clic droit : laisse passer vers le menu contextuel
    if (pendingTool) return;
    if (beginItemDrag(ev, "line", ln)) return;
    ev.preventDefault(); ev.stopPropagation();
    if (!ev.shiftKey) selectLine(ln);
    var lockedNow = isLocked(ln.id);
    var start = clientToMeters(ev), ox1 = ln.x1, oy1 = ln.y1, ox2 = ln.x2, oy2 = ln.y2, octrls = (ln.ctrls || []).map(function (p) { return { x: p.x, y: p.y }; });
    dragLoop(function (mv) {
      if (lockedNow) return;
      var m = clientToMeters(mv), dx = m.x - start.x, dy = m.y - start.y;
      ln.x1 = clamp(round1(ox1 + dx), 0, drill.pitch.length); ln.y1 = clamp(round1(oy1 + dy), 0, drill.pitch.width);
      ln.x2 = clamp(round1(ox2 + dx), 0, drill.pitch.length); ln.y2 = clamp(round1(oy2 + dy), 0, drill.pitch.width);
      if (octrls.length) ln.ctrls = octrls.map(function (p) { return { x: round1(p.x + dx), y: round1(p.y + dy) }; });
      render();
    }, null, ev.shiftKey ? { kind: "line", ref: ln } : null);
  }
  function onLineEndDown(ev, ln, which) {
    if (isLocked(ln.id)) return;
    ev.preventDefault(); ev.stopPropagation();
    dragLoop(function (mv) {
      var m = clientToMeters(mv);
      ln[which === "start" ? "x1" : "x2"] = round1(m.x);
      ln[which === "start" ? "y1" : "y2"] = round1(m.y);
      render();
    });
  }
  function onLineCtrlDown(ev, ln, idx) {
    if (isLocked(ln.id)) return;
    ev.preventDefault(); ev.stopPropagation();
    var moved = false;
    var margin = oobMargin();
    dragLoop(function (mv) {
      moved = true;
      var m = clientToMeters(mv, margin); ln.ctrls[idx] = { x: round1(m.x), y: round1(m.y) }; render();
    }, function () {
      // Voir isDoubleClick : le <dblclick> natif ne se declenche jamais ici a
      // cause du preventDefault sur pointerdown, donc detection manuelle.
      if (moved || !isDoubleClick(ln.id + "#" + idx)) return;
      ln.ctrls.splice(idx, 1);
    });
  }
  function drawLineHandles(ln, g) {
    var s = el("rect", { x: g.px(ln.x1) - 5, y: g.py(ln.y1) - 5, width: 10, height: 10, fill: COL.handle, stroke: COL.sel, "stroke-width": 2, rx: 2, cursor: "grab" });
    s.addEventListener("pointerdown", function (ev) { onLineEndDown(ev, ln, "start"); }); rt.appendChild(s);
    var e2 = el("rect", { x: g.px(ln.x2) - 5, y: g.py(ln.y2) - 5, width: 10, height: 10, fill: COL.handle, stroke: COL.sel, "stroke-width": 2, rx: 2, cursor: "grab" });
    e2.addEventListener("pointerdown", function (ev) { onLineEndDown(ev, ln, "end"); }); rt.appendChild(e2);
    (ln.ctrls || []).forEach(function (pt, i) {
      var c = el("circle", { cx: g.px(pt.x), cy: g.py(pt.y), r: 6, fill: "#fff", stroke: COL.sel, "stroke-width": 2, cursor: "grab" });
      c.addEventListener("pointerdown", function (ev) { onLineCtrlDown(ev, ln, i); });
      rt.appendChild(c);
    });
    drawAddPointHandle(g, waypointsOf(ln.x1, ln.y1, ln.x2, ln.y2, ln.ctrls), function (gap) {
      pushHistory();
      if (!ln.ctrls) ln.ctrls = [];
      ln.ctrls.splice(gap.idx, 0, { x: round1(gap.x), y: round1(gap.y) });
      render(); syncJSON();
    });
  }
  function startDrawLine(ev) {
    ev.preventDefault();
    var g = geo(), start = clientToMeters(ev);
    var line = el("line", { x1: g.px(start.x), y1: g.py(start.y), x2: g.px(start.x), y2: g.py(start.y), stroke: "#ffffff", "stroke-width": 2 });
    rt.appendChild(line);
    var dim = textNode(0, 0, "", 12, "#fff", { bold: true });
    dim.style.pointerEvents = "none";
    rt.appendChild(dim);
    function endpoint(mv) { return axisSnap(start, clientToMeters(mv), mv.shiftKey); }
    function move(mv) {
      var m = endpoint(mv);
      line.setAttribute("x2", g.px(m.x)); line.setAttribute("y2", g.py(m.y));
      var dist = Math.hypot(m.x - start.x, m.y - start.y);
      dim.setAttribute("x", g.px((start.x + m.x) / 2)); dim.setAttribute("y", g.py((start.y + m.y) / 2) - 8);
      dim.textContent = round1(dist) + " m";
    }
    function up(uv) {
      document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up);
      dim.remove();
      var m = endpoint(uv), dist = Math.hypot(m.x - start.x, m.y - start.y);
      if (dist >= 1) {
        var ln = { id: "ln" + (lid++), x1: round1(start.x), y1: round1(start.y), x2: round1(m.x), y2: round1(m.y), color: "#ffffff", dash: false, aerial: false, ctrls: [], head: "arrow" };
        pushHistory();
        linesArr().push(ln); render(); syncJSON(); selectLine(ln);
      } else render();
      disarm();
    }
    document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
  }
  function armLine(btn) { pendingTool = { kind: "line" }; setArmed(btn); render(); }

  // ---- texte libre posé sur le terrain (étiquette, consigne) ----
  function onTextDown(ev, tx) {
    if (ev.button === 2) return; // clic droit : laisse passer vers le menu contextuel
    if (pendingTool) return;
    if (beginItemDrag(ev, "text", tx)) return;
    ev.preventDefault(); ev.stopPropagation();
    if (!ev.shiftKey) selectText(tx);
    var lockedNow = isLocked(tx.id);
    var start = clientToMeters(ev), ox = tx.x, oy = tx.y;
    dragLoop(function (mv) {
      if (lockedNow) return;
      var m = clientToMeters(mv);
      tx.x = clamp(round1(ox + (m.x - start.x)), 0, drill.pitch.length);
      tx.y = clamp(round1(oy + (m.y - start.y)), 0, drill.pitch.width);
      render();
    }, null, ev.shiftKey ? { kind: "text", ref: tx } : null);
  }
  function placeText(ev) {
    var m = clientToMeters(ev);
    var newId = "tx" + (tid++);
    var tx = { id: newId, x: round1(m.x), y: round1(m.y), text: "Texte", color: "#ffffff", size: 13, outline: true, align: "center", bold: true };
    pushHistory();
    textsArr().push(tx); render(); syncJSON(); selectText(tx);
    var inp = document.getElementById("textContent"); inp.focus(); inp.select();
  }
  function armText(btn) { pendingTool = { kind: "text" }; setArmed(btn); render(); }

  // ---- pulse : point clignotant pose sur le terrain pour attirer l'attention ----
  function onPulseDown(ev, pu) {
    if (ev.button === 2) return; // clic droit : laisse passer vers le menu contextuel
    if (pendingTool) return;
    if (beginItemDrag(ev, "pulse", pu)) return;
    ev.preventDefault(); ev.stopPropagation();
    if (!ev.shiftKey) selectPulse(pu);
    var lockedNow = isLocked(pu.id);
    var start = clientToMeters(ev), ox = pu.x, oy = pu.y;
    dragLoop(function (mv) {
      if (lockedNow) return;
      var m = clientToMeters(mv);
      pu.x = clamp(round1(ox + (m.x - start.x)), 0, drill.pitch.length);
      pu.y = clamp(round1(oy + (m.y - start.y)), 0, drill.pitch.width);
      render();
    }, null, ev.shiftKey ? { kind: "pulse", ref: pu } : null);
  }
  function placePulse(ev) {
    var m = clientToMeters(ev);
    var pu = { id: "pu" + (pid++), x: round1(m.x), y: round1(m.y), color: "#ff3b30", size: 1 };
    pushHistory();
    pulsesArr().push(pu); render(); syncJSON(); selectPulse(pu);
  }
  function armPulse(btn) { pendingTool = { kind: "pulse" }; setArmed(btn); render(); }

  // ---- pitch pointerdown : place an armed tool, or deselect on background ----
  svg.addEventListener("pointerdown", function (ev) {
    if (pendingTool) {
      if (pendingTool.kind === "entity") { placeEntity(pendingTool.type, ev); disarm(); }
      else if (pendingTool.kind === "zone") { startDrawZone(ev, pendingTool.zoneKind, pendingTool.shape); }
      else if (pendingTool.kind === "polygon") { addPolyPoint(ev); }
      else if (pendingTool.kind === "arrow") { startDrawArrow(ev, pendingTool.arrowType); }
      else if (pendingTool.kind === "line") { startDrawLine(ev); }
      else if (pendingTool.kind === "text") { placeText(ev); disarm(); }
      else if (pendingTool.kind === "pulse") { placePulse(ev); disarm(); }
      return;
    }
    if (ev.target && ev.target.getAttribute && ev.target.getAttribute("data-bg") === "1") {
      if (polyDraft) { cancelPolygon(); return; }
      startMarquee(ev);
    }
  });

  function startDrawZone(ev, kind, shape) {
    ev.preventDefault();
    shape = shape === "ellipse" ? "ellipse" : "rect";
    var g = geo(), start = clientToMeters(ev);
    var shp = shape === "ellipse"
      ? el("ellipse", { fill: ZFILL[kind] || ZFILL.area, stroke: "#fff", "stroke-width": 1.5, "stroke-dasharray": "4 4" })
      : el("rect", { fill: ZFILL[kind] || ZFILL.area, stroke: "#fff", "stroke-width": 1.5, "stroke-dasharray": "4 4" });
    var dim = textNode(0, 0, "", 12, "#fff", { bold: true });
    rt.appendChild(shp); rt.appendChild(dim);
    function box(mv) {
      var m = clientToMeters(mv), dx = m.x - start.x, dy = m.y - start.y;
      if (mv.shiftKey) { var s = Math.max(Math.abs(dx), Math.abs(dy)); dx = sign(dx) * s; dy = sign(dy) * s; }
      var ex = clamp(start.x + dx, 0, drill.pitch.length), ey = clamp(start.y + dy, 0, drill.pitch.width);
      return { x0: Math.min(start.x, ex), x1: Math.max(start.x, ex), y0: Math.min(start.y, ey), y1: Math.max(start.y, ey) };
    }
    function move(mv) {
      var b = box(mv), w = (b.x1 - b.x0) * g.sc, h = (b.y1 - b.y0) * g.sc;
      if (shape === "ellipse") {
        shp.setAttribute("cx", g.px((b.x0 + b.x1) / 2)); shp.setAttribute("cy", g.py((b.y0 + b.y1) / 2));
        shp.setAttribute("rx", w / 2); shp.setAttribute("ry", h / 2);
      } else {
        shp.setAttribute("x", g.px(b.x0)); shp.setAttribute("y", g.py(b.y1));
        shp.setAttribute("width", w); shp.setAttribute("height", h);
      }
      dim.setAttribute("x", g.px((b.x0 + b.x1) / 2)); dim.setAttribute("y", g.py((b.y0 + b.y1) / 2) + 4);
      dim.textContent = round1(b.x1 - b.x0) + " × " + round1(b.y1 - b.y0) + " m";
    }
    function up(uv) {
      document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up);
      var b = box(uv);
      if ((b.x1 - b.x0) >= 1 && (b.y1 - b.y0) >= 1) {
        var z = { id: "z" + (zid++), kind: kind, shape: shape, label: "", x: round1(b.x0), y: round1(b.y0), w: round1(b.x1 - b.x0), h: round1(b.y1 - b.y0) };
        pushHistory();
        drill.zones.push(z); render(); syncJSON(); selectZone(z);
      } else render();
      disarm();
    }
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  }

  // ---- zone libre (polygone) : clic par clic, fermeture pres du point de depart ou Entree ----
  function addPolyPoint(ev) {
    ev.preventDefault();
    var m = clientToMeters(ev);
    if (!polyDraft) polyDraft = { zoneKind: pendingTool.zoneKind, pts: [] };
    if (polyDraft.pts.length >= 3) {
      var p0 = polyDraft.pts[0];
      if (Math.hypot(m.x - p0.x, m.y - p0.y) < 1.2) { finishPolygon(); return; }
    }
    polyDraft.pts.push({ x: round1(m.x), y: round1(m.y) });
    render();
  }
  function finishPolygon() {
    if (polyDraft && polyDraft.pts.length >= 3) {
      var z = { id: "z" + (zid++), kind: polyDraft.zoneKind, shape: "polygon", label: "", pts: polyDraft.pts };
      pushHistory();
      drill.zones.push(z); syncJSON(); selectZone(z);
    }
    polyDraft = null; disarm();
  }
  function cancelPolygon() { polyDraft = null; disarm(); }
  function drawPolyDraft(g) {
    if (!polyDraft.pts.length) return;
    var ptsAttr = polyDraft.pts.map(function (p) { return g.px(p.x) + "," + g.py(p.y); }).join(" ");
    rt.appendChild(el("polyline", { points: ptsAttr, fill: "none", stroke: "#fff", "stroke-width": 2, "stroke-dasharray": "4 4" }));
    polyDraft.pts.forEach(function (p, i) {
      rt.appendChild(el("circle", { cx: g.px(p.x), cy: g.py(p.y), r: i === 0 ? 6 : 4, fill: "#fff", stroke: COL.sel, "stroke-width": 1.5 }));
    });
    if (polyDraft.mouse) {
      var last = polyDraft.pts[polyDraft.pts.length - 1];
      rt.appendChild(el("line", { x1: g.px(last.x), y1: g.py(last.y), x2: g.px(polyDraft.mouse.x), y2: g.py(polyDraft.mouse.y), stroke: "#fff", "stroke-width": 1.5, "stroke-dasharray": "2 3" }));
    }
  }
  svg.addEventListener("pointermove", function (ev) {
    if (!polyDraft) return;
    polyDraft.mouse = clientToMeters(ev);
    render();
  });

  // ---- armed tools (place entity / draw zone on next pitch action) ----
  function setArmed(btn) { if (armedBtn) { armedBtn.classList.remove("primary"); armedBtn.removeAttribute("aria-pressed"); } armedBtn = btn || null; if (armedBtn) { armedBtn.classList.add("primary"); armedBtn.setAttribute("aria-pressed", "true"); } }
  function armEntity(type, btn) { pendingTool = { kind: "entity", type: type }; setArmed(btn); render(); }
  function armZone(kind, shape, btn) { pendingTool = { kind: "zone", zoneKind: kind, shape: shape }; setArmed(btn); render(); }
  function armPolygon(kind, btn) { polyDraft = null; pendingTool = { kind: "polygon", zoneKind: kind }; setArmed(btn); render(); }
  function armArrow(type, btn) { pendingTool = { kind: "arrow", arrowType: type }; setArmed(btn); render(); }
  function disarm() { pendingTool = null; polyDraft = null; setArmed(document.getElementById("selectToolBtn")); render(); }

  function placeEntity(type, ev) {
    var m = clientToMeters(ev, oobMargin()), e;
    var homeN = ents().filter(function (x) { return x.team === "home" && x.type === "player"; }).length;
    var awayN = ents().filter(function (x) { return x.team === "away"; }).length;
    var x = round1(m.x), y = round1(m.y);
    // Meme aimantation qu'un glisser, sur la meme touche : poser un joueur
    // juste a cote d'un autre doit pouvoir s'aligner sans avoir a le glisser
    // ensuite. dragGuides est efface juste apres : pas de dragLoop.up() ici
    // pour le faire, il resterait affiche indefiniment sinon.
    if (ev.shiftKey) {
      snapDisabled = false;
      var sn = snapDrag(null, x, y, null);
      x = sn.x; y = sn.y;
      dragGuides = null;
    }
    if (type === "home") e = { id: "h" + (homeN + 1), type: "player", team: "home", label: String(homeN + 1), x: x, y: y };
    else if (type === "away") e = { id: "a" + (awayN + 1), type: "player", team: "away", label: String(awayN + 1), x: x, y: y };
    else if (type === "support") e = { id: "s" + (Date.now() % 1000), type: "support", team: "neutral", label: "J", x: x, y: y };
    else if (type === "ball") {
      // Plusieurs ballons possibles (sources de balle a montrer en meme
      // temps) : id "ball" fixe avant ecrasait le precedent a chaque pose
      // (meme cle dans drill.timeline.entities). Numerote comme les joueurs
      // (homeN/awayN juste au-dessus) pour rester lisible dans le panneau
      // des calques une fois qu'il y en a plusieurs.
      var ballN = ents().filter(function (x) { return x.type === "ball"; }).length;
      e = { id: "ball" + (Date.now() % 100000), type: "ball", team: "none", x: x, y: y, label: String(ballN + 1) };
    }
    else if (type === "goal") e = { id: "g" + (Date.now() % 1000), type: "goal", team: "none", x: x, y: y };
    else if (R.EQUIP[type]) {
      e = { id: type.charAt(0) + (Date.now() % 100000), type: type, team: "none", x: x, y: y };
      if (R.EQUIP[type].rot) e.facing = 0;
    }
    else e = { id: "c" + (Date.now() % 1000), type: "cone", team: "none", x: x, y: y };
    if (pendingTool && pendingTool.presetLabel) { e.label = pendingTool.presetLabel; if (pendingTool.presetRole) e.role = pendingTool.presetRole; }
    pushHistory();
    var ref = addEntityAllKf(e); render(); syncJSON(); selectEntity(ref);
  }

  // ---- selection / inspectors (panneau flottant au-dessus du terrain) ----
  // L'inspecteur flottant ne s'ouvre plus au clic gauche : toute l'edition
  // passe par le panneau du clic droit (cf openEditPop), pose sous le curseur
  // plutot qu'a l'autre bout du terrain. Le clic gauche ne fait plus que
  // selectionner et deplacer.
  //
  // Les fonctions select*() continuent d'appeler showInspector et de remplir
  // les champs du panneau : elles restent la source unique de la selection
  // (poignees, glisser de groupe, listes laterales, mode avance), et leurs
  // ecritures dans des champs masques sont sans effet. Les vider aurait
  // demande de toucher a chaque appelant pour un gain nul.
  function showInspector() {
    hideInspectors();
  }
  function selectEntity(e) {
    multiSel = []; selEntity = e; selZone = null; selAnno = null; selLine = null; selText = null; selPulse = null;
    showInspector("inspector");
    document.getElementById("selLabel").value = e.label || "";
    document.getElementById("selRole").value = e.role || "";
    var isPropShape = e.type === "player" || e.type === "support";
    // Le materiel (et le plot) se recolore et se redimensionne comme un jeton —
    // deux jeux de plots de couleurs differentes est un besoin courant — mais
    // n'a pas de "forme" a choisir : son dessin lui est propre.
    var isEquip = !!R.EQUIP[e.type] || e.type === "cone";
    ["selStyleRow", "selStyleRow2"].forEach(function (id) { document.getElementById(id).style.display = isPropShape || isEquip ? "" : "none"; });
    document.getElementById("selStyleRow3").style.display = isPropShape ? "" : "none";
    if (isEquip) {
      var spec = R.EQUIP[e.type];
      document.getElementById("selColor").value = e.color || (spec ? spec.color : COL.cone);
      var esz = e.size || 1;
      document.getElementById("selSize").value = esz;
      document.getElementById("selSizeVal").textContent = esz.toFixed(1) + "×";
    }
    if (isPropShape) {
      // Meme resolution que le rendu (R.teamStyle) : la pastille de l'inspecteur
      // montre la couleur d'equipe reellement appliquee, pas la couleur d'usine.
      var ts = R.teamStyle(drill, e);
      document.getElementById("selColor").value = ts.fill;
      document.getElementById("selSize").value = e.size || 0.9;
      document.getElementById("selSizeVal").textContent = (e.size || 0.9).toFixed(1) + "×";
      document.getElementById("selShape").value = ts.shape;
    }
    var canCurve = e.type === "player" || e.type === "support" || e.type === "ball";
    document.getElementById("selCurveRow").style.display = canCurve && drill.keyframes.length > 1 ? "" : "none";
    if (canCurve) { var cb = document.getElementById("selCurve"); cb.setAttribute("aria-pressed", e.curve ? "true" : "false"); cb.classList.toggle("primary", !!e.curve); }
    document.getElementById("selArrowWidthRow").style.display = canCurve && drill.keyframes.length > 1 ? "" : "none";
    if (canCurve) {
      var aw = e.arrowWidth || 2;
      document.getElementById("selArrowWidth").value = aw;
      document.getElementById("selArrowWidthVal").textContent = aw.toFixed(1);
    }
    var isBall = e.type === "ball";
    document.getElementById("selAerialRow").style.display = isBall && drill.keyframes.length > 1 ? "" : "none";
    if (isBall) { var ab = document.getElementById("selAerial"); ab.setAttribute("aria-pressed", e.aerial ? "true" : "false"); ab.classList.toggle("primary", !!e.aerial); }
    if (isBall) { document.getElementById("ballCarrierRow").style.display = ""; fillBallCarrier(e); }
    else document.getElementById("ballCarrierRow").style.display = "none";
  }
  function fillBallCarrier(ball) {
    var sel = document.getElementById("ballCarrier"); sel.innerHTML = "";
    var o0 = document.createElement("option"); o0.value = ""; o0.textContent = "aucun (libre)"; sel.appendChild(o0);
    ents().forEach(function (pl) {
      if (pl.type !== "player" && pl.type !== "support") return;
      var o = document.createElement("option"); o.value = pl.id; o.textContent = (pl.label || pl.id) + (pl.team && pl.team !== "none" ? " (" + pl.team + ")" : ""); sel.appendChild(o);
    });
    sel.value = ball.attachedTo || "";
  }
  function selectAnno(a) {
    multiSel = []; selAnno = a; selEntity = null; selZone = null; selLine = null; selText = null; selPulse = null;
    showInspector("arrowInspector");
    document.getElementById("arrowType").value = a.type;
    document.getElementById("arrowLabel").value = a.label || "";
    var aw = a.width || 2;
    document.getElementById("arrowWidth").value = aw;
    document.getElementById("arrowWidthVal").textContent = aw.toFixed(1);
    render();
  }
  function selectZone(z) {
    multiSel = []; selZone = z; selEntity = null; selAnno = null; selLine = null; selText = null; selPulse = null;
    advGroupOpen["Zones"] = true; // une fois, a la selection — pas a chaque rendu (cf selectClip)
    showInspector("zoneInspector");
    document.getElementById("zoneLabel").value = z.label || "";
    document.getElementById("zoneKind").value = z.kind;
    document.getElementById("zoneColor").value = z.color || "#ffffff";
    fillZoneStyle(z);
    refreshZoneDims();
    render();
  }
  // Etat des reglages de contour/remplissage. Les valeurs par defaut affichees
  // sont celles que drawZone applique en l'absence des champs, pour que le
  // panneau dise la verite sur une zone jamais stylisee.
  function fillZoneStyle(z) {
    document.getElementById("zoneStroke").value = z.stroke === "solid" ? "solid" : "dash";
    var sw = typeof z.strokeWidth === "number" ? z.strokeWidth : 1.5;
    document.getElementById("zoneStrokeWidth").value = sw;
    document.getElementById("zoneStrokeWidthVal").textContent = sw.toFixed(1);
    var mode = z.fill || "solid";
    document.getElementById("zoneFill").value = mode;
    var defOp = mode === "hatch" ? 0.55 : 0.28;
    var op = typeof z.fillOpacity === "number" ? z.fillOpacity : defOp;
    document.getElementById("zoneFillOpacity").value = op;
    document.getElementById("zoneFillOpacityVal").textContent = op.toFixed(2);
    // Sans remplissage, le curseur d'opacite ne commande rien : on le masque
    // plutot que de laisser un reglage sans effet.
    document.getElementById("zoneFillOpacityRow").style.display = mode === "none" ? "none" : "";
  }
  function selectLine(ln) {
    multiSel = []; selLine = ln; selEntity = null; selZone = null; selAnno = null; selText = null; selPulse = null;
    advGroupOpen["Traits"] = true;
    showInspector("lineInspector");
    document.getElementById("lineColor").value = ln.color || "#ffffff";
    var lw = ln.width || 2;
    document.getElementById("lineWidth").value = lw;
    document.getElementById("lineWidthVal").textContent = lw.toFixed(1);
    document.getElementById("lineDash").checked = !!ln.dash;
    document.getElementById("lineAerial").checked = !!ln.aerial;
    document.getElementById("lineHead").value = ln.head || "arrow";
    render();
  }
  function updateTextAlignButtons(align) {
    align = align || "center";
    [["textAlignLeft", "left"], ["textAlignCenter", "center"], ["textAlignRight", "right"]].forEach(function (pair) {
      var b = document.getElementById(pair[0]), on = pair[1] === align;
      b.setAttribute("aria-pressed", on ? "true" : "false"); b.classList.toggle("primary", on);
    });
  }
  function updateTextBoldButton(bold) {
    var b = document.getElementById("textBold");
    b.setAttribute("aria-pressed", bold ? "true" : "false"); b.classList.toggle("primary", bold);
  }
  function selectText(tx) {
    multiSel = []; selText = tx; selEntity = null; selZone = null; selAnno = null; selLine = null; selPulse = null;
    showInspector("textInspector");
    document.getElementById("textContent").value = tx.text || "";
    document.getElementById("textColor").value = tx.color || "#ffffff";
    document.getElementById("textSize").value = tx.size || 13;
    document.getElementById("textSizeVal").textContent = (tx.size || 13) + "px";
    document.getElementById("textOutline").checked = tx.outline !== false;
    updateTextAlignButtons(tx.align);
    updateTextBoldButton(tx.bold !== false);
    render();
  }
  function selectPulse(pu) {
    multiSel = []; selPulse = pu; selEntity = null; selZone = null; selAnno = null; selLine = null; selText = null;
    advGroupOpen["Pulses"] = true;
    showInspector("pulseInspector");
    document.getElementById("pulseColor").value = pu.color || "#ff3b30";
    var ps = pu.size || 1;
    document.getElementById("pulseSize").value = ps;
    document.getElementById("pulseSizeVal").textContent = ps.toFixed(1) + "×";
    render();
  }
  function refreshZoneDims() {
    if (!selZone) return;
    document.getElementById("zoneDims").textContent = selZone.shape === "polygon" ? "(" + selZone.pts.length + " points)" : "(" + round1(selZone.w) + " × " + round1(selZone.h) + " m)";
  }
  function hideInspectors() {
    document.getElementById("inspector").classList.add("hidden");
    document.getElementById("zoneInspector").classList.add("hidden");
    document.getElementById("arrowInspector").classList.add("hidden");
    document.getElementById("lineInspector").classList.add("hidden");
    document.getElementById("textInspector").classList.add("hidden");
    document.getElementById("pulseInspector").classList.add("hidden");
    document.getElementById("multiInspector").classList.add("hidden");
    var h = document.getElementById("inspectorDragHandle"); if (h) h.classList.add("hidden");
  }

  // ---- keyboard ----
  document.addEventListener("keydown", function (e) {
    // Bibliotheque ouverte : elle capte le clavier, aucun raccourci d'edition
    // ne doit atteindre le schema qui reste vivant derriere l'overlay.
    var libOv = document.getElementById("libOverlay");
    if (libOv && !libOv.classList.contains("hidden")) {
      if (e.key === "Escape") { closeLibrary(); e.preventDefault(); }
      return;
    }
    if (e.key === "Enter" && polyDraft) { if (polyDraft.pts.length >= 3) finishPolygon(); e.preventDefault(); return; }
    if (e.key === "Escape") { if (polyDraft) { cancelPolygon(); } else if (pendingTool) disarm(); selEntity = null; selZone = null; selAnno = null; selLine = null; selText = null; selPulse = null; selClip = null; multiSel = []; multiSelClips = []; hideInspectors(); renderAdvancedTimeline(); render(); return; }
    var t = document.activeElement;
    if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
    var meta = e.ctrlKey || e.metaKey;
    if (e.key === "Delete" || e.key === "Backspace") { deleteSelected(); e.preventDefault(); }
    else if (meta && (e.key === "c" || e.key === "C")) { copySel(); e.preventDefault(); }
    else if (meta && (e.key === "v" || e.key === "V")) { pasteSel(); e.preventDefault(); }
    else if (meta && (e.key === "z" || e.key === "Z") && e.shiftKey) { redo(); e.preventDefault(); }
    else if (meta && (e.key === "z" || e.key === "Z")) { undo(); e.preventDefault(); }
    else if (meta && (e.key === "y" || e.key === "Y")) { redo(); e.preventDefault(); }
    else if (!meta && (e.key === "l" || e.key === "L")) { openLibrary(); e.preventDefault(); }
    else if (!meta && (e.key === "k" || e.key === "K")) { toggleLockSelection(); e.preventDefault(); }
  });
  // K sur la selection courante : verrouille/deverrouille en un geste. Sur un
  // groupe, l'etat de depart est "au moins un membre deverrouille" pour que
  // le premier appui verrouille tout le monde plutot que de melanger deux
  // etats — le second appui deverrouille alors tout le monde d'un coup.
  function toggleLockSelection() {
    if (multiSel.length) {
      var anyUnlocked = multiSel.some(function (s) { return !isLocked(s.ref.id); });
      pushHistory();
      multiSel.forEach(function (s) { setLocked(s.ref.id, anyUnlocked); });
      render(); syncJSON();
      return;
    }
    var cur = currentSingleSelection();
    if (!cur) return;
    toggleLocked(cur.ref.id);
  }
  function deleteSelected() {
    if (multiSel.length) { deleteMultiSelected(); return; }
    if (multiSelClips.length) { deleteMultiSelectedClips(); return; }
    // Clip de la timeline avancee (mode avance) : selection distincte de
    // selEntity/selZone/etc. (cf selClip), sinon Suppr n'avait aucun effet
    // tant qu'on n'ouvrait pas l'inspecteur de clip pour cliquer son bouton.
    if (selClip) { deleteSelectedClip(); return; }
    if (!selEntity && !selZone && !selAnno && !selLine && !selText && !selPulse) return;
    pushHistory();
    if (selEntity) { removeEntityAllKf(selEntity.id); selEntity = null; }
    else if (selZone) { drill.zones = drill.zones.filter(function (x) { return x !== selZone; }); selZone = null; }
    else if (selAnno) { var kf = drill.keyframes[curKf]; kf.annotations = (kf.annotations || []).filter(function (x) { return x !== selAnno; }); selAnno = null; }
    else if (selLine) { var li2 = linesArr().indexOf(selLine); if (li2 >= 0) drill.lines.splice(li2, 1); selLine = null; }
    else if (selText) { var ti2 = textsArr().indexOf(selText); if (ti2 >= 0) drill.texts.splice(ti2, 1); selText = null; }
    else if (selPulse) { var pi2 = pulsesArr().indexOf(selPulse); if (pi2 >= 0) drill.pulses.splice(pi2, 1); selPulse = null; }
    else return;
    hideInspectors(); renderAdvancedTimeline(); render(); syncJSON();
  }
  function deleteSelectedClip() {
    if (!selClip) return;
    pushHistory();
    selClip.rec.clips.splice(selClip.ci, 1);
    selClip = null;
    recomputeTotalMs(drill.timeline); invalidateEntsCache(); render(); renderAdvancedTimeline(); syncJSON();
  }
  function copySel() {
    if (selEntity) clipboard = { t: "entity", data: JSON.parse(JSON.stringify(selEntity)) };
    else if (selZone) clipboard = { t: "zone", data: JSON.parse(JSON.stringify(selZone)) };
    else if (selLine) clipboard = { t: "line", data: JSON.parse(JSON.stringify(selLine)) };
    if (clipboard) flash("Copié (Cmd/Ctrl+V pour coller)", true);
  }
  function pasteSel() {
    if (!clipboard) return;
    pushHistory();
    var d = JSON.parse(JSON.stringify(clipboard.data));
    if (clipboard.t === "entity") {
      d.id = (d.type || "e") + "-" + (Date.now() % 10000);
      var pm = oobMargin();
      d.x = clamp(round1((d.x || 0) + 2), -pm, drill.pitch.length + pm); d.y = clamp(round1((d.y || 0) + 2), -pm, drill.pitch.width + pm);
      var ref = addEntityAllKf(d); render(); syncJSON(); selectEntity(ref);
    } else if (clipboard.t === "line") {
      d.id = "ln" + (lid++);
      d.x1 = clamp(round1(d.x1 + 2), 0, drill.pitch.length); d.y1 = clamp(round1(d.y1 + 2), 0, drill.pitch.width);
      d.x2 = clamp(round1(d.x2 + 2), 0, drill.pitch.length); d.y2 = clamp(round1(d.y2 + 2), 0, drill.pitch.width);
      if (d.ctrls && d.ctrls.length) d.ctrls = d.ctrls.map(function (p) { return { x: round1(p.x + 2), y: round1(p.y + 2) }; });
      linesArr().push(d); render(); syncJSON(); selectLine(d);
    } else {
      d.id = "z" + (zid++);
      if (d.shape === "polygon") d.pts = d.pts.map(function (p) { return { x: clamp(round1(p.x + 2), 0, drill.pitch.length), y: clamp(round1(p.y + 2), 0, drill.pitch.width) }; });
      else { d.x = clamp(round1(d.x + 2), 0, drill.pitch.length - d.w); d.y = clamp(round1(d.y + 2), 0, drill.pitch.width - d.h); }
      drill.zones.push(d); render(); syncJSON(); selectZone(d);
    }
    flash("Collé", true);
  }

  // ---- lists ----
  function listArray(key) { if (key === "varPlus") return drill.rules.variablesPlus; if (key === "varMinus") return drill.rules.variablesMinus; return drill.rules[key]; }
  function renderList(key, containerId) {
    var arr = listArray(key), c = document.getElementById(containerId); c.innerHTML = "";
    arr.forEach(function (v, i) {
      var row = document.createElement("div"); row.className = "list-row";
      var inp = document.createElement("input"); inp.value = v;
      inp.addEventListener("input", function () { arr[i] = inp.value; syncJSON(); });
      var del = document.createElement("button"); del.textContent = "✕"; del.className = "danger";
      del.addEventListener("click", function () { arr.splice(i, 1); renderList(key, containerId); syncJSON(); });
      row.appendChild(inp); row.appendChild(del); c.appendChild(row);
    });
  }
  function renderMeca() {
    var arr = drill.rules.mecanismes, c = document.getElementById("mecanismesList"); c.innerHTML = "";
    arr.forEach(function (m, i) {
      var row = document.createElement("div"); row.className = "meca-row";
      var r = document.createElement("input"); r.placeholder = "règle"; r.value = m.regle;
      var ind = document.createElement("input"); ind.placeholder = "ce que ça induit"; ind.value = m.induit;
      r.addEventListener("input", function () { m.regle = r.value; syncJSON(); });
      ind.addEventListener("input", function () { m.induit = ind.value; syncJSON(); });
      var del = document.createElement("button"); del.textContent = "✕"; del.className = "danger";
      del.addEventListener("click", function () { arr.splice(i, 1); renderMeca(); syncJSON(); });
      row.appendChild(r); row.appendChild(ind); row.appendChild(del); c.appendChild(row);
    });
  }

  // ---- knowledge panel ----
  function renderLevers(phase) {
    var c = document.getElementById("leversPanel"); c.innerHTML = "";
    (K.levers || []).filter(function (l) { return phase === "all" || l.phase === phase || (phase === "offensive" && !l.phase); }).forEach(function (l) {
      var d = document.createElement("div"); d.className = "lever";
      var ph = l.phase || "offensive";
      d.innerHTML = '<span class="tag ' + ph + '">' + ph + " · " + l.categorie + '</span><div class="meca">' + l.mecanisme + '</div><div class="induit">→ ' + l.induit + "</div>";
      d.addEventListener("click", function () { drill.rules.mecanismes.push({ regle: l.mecanisme, induit: l.induit }); renderMeca(); syncJSON(); flash("Levier ajouté aux mécanismes", true); });
      c.appendChild(d);
    });
  }

  // ---- meta binding ----
  var SUBCATS = {
    cpa: ["Corner off", "Touche Off", "Touche Milieu", "Touche sortie de pression", "Sortie de pression GB", "Coup franc"],
    animation: ["Animation off sortie de press", "Animation off finition", "Animation off Powerplay", "Animation Off 4v3", "Animation Off Transition"]
  };
  function refreshSubcategoryOptions(preserveValue) {
    var cat = drill.meta.category || "entrainement";
    var wrap = document.getElementById("mSubcategoryField");
    var sel = document.getElementById("mSubcategory");
    var list = SUBCATS[cat];
    if (!list) { wrap.style.display = "none"; drill.meta.subcategory = ""; return; }
    wrap.style.display = "";
    sel.innerHTML = "";
    list.forEach(function (label) { var o = document.createElement("option"); o.value = label; o.textContent = label; sel.appendChild(o); });
    var want = preserveValue && list.indexOf(drill.meta.subcategory) !== -1 ? drill.meta.subcategory : list[0];
    sel.value = want; drill.meta.subcategory = want;
  }
  // Champs de conception pedagogique (phase/objectif/effectif/scoring/mecanismes/leviers) :
  // pertinents pour un procede d'entrainement, pas pour un CPA (combinaison sur coup de pied arrete).
  function applyCategoryVisibility() {
    var hideDesignFields = drill.meta.category === "cpa" || drill.meta.category === "animation";
    ["fieldPhaseCible", "fieldObjectif", "fieldNbJoueurs", "fieldDuree", "fieldIntensite", "fieldFormeJouee", "listsBlock", "leversPanelWrap"].forEach(function (id) {
      var el = document.getElementById(id); if (el) el.classList.toggle("hidden", hideDesignFields);
    });
  }
  function bindMeta() {
    document.getElementById("mCategory").addEventListener("change", function (e) { drill.meta.category = e.target.value; refreshSubcategoryOptions(false); applyCategoryVisibility(); syncJSON(); });
    document.getElementById("mSubcategory").addEventListener("change", function (e) { drill.meta.subcategory = e.target.value; syncJSON(); });
    map("mTitle", "title"); map("mTheme", "theme"); map("mPhaseCible", "phaseCible"); map("mObjectif", "objectif");
    numMap("mNbJoueurs", "nbJoueurs"); numMap("mDuree", "dureeMin");
    document.getElementById("mIntensite").addEventListener("change", function (e) { drill.meta.intensite = e.target.value; syncJSON(); });
    document.getElementById("mFormeJouee").addEventListener("change", function (e) { drill.meta.formeJouee = e.target.value === "true"; syncJSON(); });
    function map(id, key) { document.getElementById(id).addEventListener("input", function (e) { drill.meta[key] = e.target.value; syncJSON(); }); }
    function numMap(id, key) { document.getElementById(id).addEventListener("input", function (e) { drill.meta[key] = parseInt(e.target.value, 10) || 0; syncJSON(); }); }
  }
  function fillMeta() {
    document.getElementById("mCategory").value = drill.meta.category || "entrainement";
    refreshSubcategoryOptions(true);
    applyCategoryVisibility();
    document.getElementById("mTitle").value = drill.meta.title || "";
    document.getElementById("mTheme").value = drill.meta.theme || "";
    document.getElementById("mPhaseCible").value = drill.meta.phaseCible || "";
    document.getElementById("mObjectif").value = drill.meta.objectif || "";
    document.getElementById("mNbJoueurs").value = drill.meta.nbJoueurs || 0;
    document.getElementById("mDuree").value = drill.meta.dureeMin || 0;
    document.getElementById("mIntensite").value = drill.meta.intensite || "elevee";
    document.getElementById("mFormeJouee").value = String(drill.meta.formeJouee !== false);
    document.getElementById("pitchLen").value = drill.pitch.length;
    document.getElementById("pitchWid").value = drill.pitch.width;
    document.getElementById("pitchMark").value = drill.pitch.markings;
    document.getElementById("pitchColor").value = drill.pitch.color || "#2f8f4e";
    document.getElementById("pitchSurface").value = drill.pitch.surface || "flat";

    document.getElementById("pitchOuterColor").value = drill.pitch.outerColor || "#171a15";
    document.getElementById("pitchLineColor").value = drill.pitch.lineColor || "#eafff0";
    document.getElementById("pitchGoalAreaColor").value = drill.pitch.goalAreaColor || drill.pitch.lineColor || "#eafff0";
    document.getElementById("pitchGoalAreaOpacity").value = typeof drill.pitch.goalAreaOpacity === "number" ? drill.pitch.goalAreaOpacity : 0.16;
    document.getElementById("pitchLogoFile").value = "";
    document.getElementById("pitchPattern").value = drill.pitch.pattern || "none";
    if (typeof syncPitchThumbs === "function") syncPitchThumbs();
    document.getElementById("pitchView").value = drill.pitch.view || "full";
    document.getElementById("pitchImageFile").value = "";
    document.getElementById("pitchImgScale").value = drill.pitch.imageScale || 1;
    document.getElementById("pitchImgScaleVal").textContent = (drill.pitch.imageScale || 1).toFixed(2) + "×";
    document.getElementById("pitchImgOffX").value = drill.pitch.imageOffsetX || 0;
    document.getElementById("pitchImgOffY").value = drill.pitch.imageOffsetY || 0;
  }
  function refreshAllLists() { renderList("scoring", "scoringList"); renderList("comportements", "comportementsList"); renderList("varPlus", "varPlusList"); renderList("varMinus", "varMinusList"); renderMeca(); }

  // ---- io ----
  function syncJSON() { document.getElementById("json").value = JSON.stringify(cleanDrill(), null, 2); }
  function cleanDrill() {
    var zones = drill.zones.map(function (z) {
      var o = { id: z.id, kind: z.kind, label: z.label, shape: z.shape || "rect" };
      if (o.shape === "polygon") o.pts = z.pts; else { o.x = z.x; o.y = z.y; o.w = z.w; o.h = z.h; }
      if (z.color) o.color = z.color;
      // Style de contour/remplissage : ecrits seulement s'ils s'ecartent du
      // defaut, donc une zone jamais stylisee garde exactement son JSON
      // d'avant cette fonctionnalite.
      if (z.stroke === "solid") o.stroke = "solid";
      if (typeof z.strokeWidth === "number" && z.strokeWidth !== 1.5) o.strokeWidth = z.strokeWidth;
      if (z.fill && z.fill !== "solid") o.fill = z.fill;
      if (typeof z.fillOpacity === "number") o.fillOpacity = z.fillOpacity;
      if (z.visibleFrom != null) o.visibleFrom = z.visibleFrom;
      if (z.visibleTo != null) o.visibleTo = z.visibleTo;
      return o;
    });
    // computeArrows(i) resynchronise au passage keyframes[i]/[i+1].entities
    // depuis drill.timeline (cf sa definition) — parcourir tous les i "aplatit"
    // ainsi la timeline canonique dans keyframes[].entities pour toutes les
    // etapes de la variante active, sans fonction dediee. Meme principe pour
    // keyframes[i].lines/pulses/textes, aplatis depuis drill.lines/drill.pulses/
    // drill.texts (globaux, cf ensureOverlays) selon leur fenetre de presence a
    // chaque frontiere d'etape — format d'export inchange
    // (keyframes[].lines/pulses/texts), aucun consommateur externe (mobile,
    // assembleur) n'a besoin de connaitre visibleFrom/visibleTo. Les variantes
    // non actives gardent ce qui a ete ecrit la derniere fois qu'elles
    // etaient actives (meme regle que pour les entites : l'edition ne porte
    // jamais que sur la variante active).
    var bmExport = boundaryMs();
    function stripOverlayMeta(o) { var c = Object.assign({}, o); delete c.visibleFrom; delete c.visibleTo; delete c.groupId; return c; }
    drill.keyframes.forEach(function (kf, i) {
      kf.annotations = computeArrows(i); // fleches derivees du mouvement (variante active)
      var t = bmExport[i];
      kf.lines = drill.lines.filter(function (ln) { return R.visibleAt(ln, t); }).map(stripOverlayMeta);
      kf.pulses = drill.pulses.filter(function (pu) { return R.visibleAt(pu, t); }).map(stripOverlayMeta);
      kf.texts = drill.texts.filter(function (tx) { return R.visibleAt(tx, t); }).map(stripOverlayMeta);
    });
    // keyframes racine = alias de la variante active (compat avec le reste de
    // l'outil — bibliotheque, miniatures, mobile — qui ne connaissent que ce
    // champ, toujours a jour et suffisant pour un procede simple). `.timeline`
    // EST desormais conserve dans l'export (champ additif ignorable par ces
    // consommateurs) : un clip "desynchronise" (mode avance) ne tombe pas
    // forcement sur une frontiere d'etape, et keyframes[] ne peut echantillonner
    // qu'aux frontieres — sans ce champ, sauvegarder puis recharger un procede
    // avance APLATISSAIT silencieusement chaque clip sur le segment entier de
    // l'etape qui le contient (perte reelle de la donnee temporelle fine,
    // remontee par Robin comme "des decalages" apres rechargement). ensureTimeline
    // relit ce champ tel quel s'il est present, sans reconstruire depuis keyframes.
    var variantsOut = (drill.variants || []).map(function (v) {
      var o = { id: v.id, name: v.name, keyframes: v.keyframes };
      if (v.timeline) o.timeline = v.timeline;
      return o;
    });
    var out = { meta: drill.meta, pitch: drill.pitch, zones: zones, keyframes: drill.keyframes, variants: variantsOut, activeVariantIndex: drill.activeVariantIndex, rules: drill.rules };
    // zOrder n'est ecrit que s'il existe : un procede sans calque reordonne
    // garde exactement le JSON qu'il avait avant cette fonctionnalite.
    if (drill.zOrder && Object.keys(drill.zOrder).length) out.zOrder = drill.zOrder;
    // Idem pour teams : seules les equipes reellement personnalisees sont
    // ecrites, donc un procede aux couleurs d'usine garde son ancien JSON.
    var teamsOut = cleanTeams();
    if (teamsOut) out.teams = teamsOut;
    // Meme regle que zOrder : un objet a la fois. Le verrou vit HORS de la
    // timeline (drill.locked = {id: true}, pas dans les etats par etape),
    // volontairement — verrouiller un but doit le proteger a TOUTE etape, pas
    // seulement a celle en cours d'edition. La cle est plate (pas de
    // namespace par type) parce que zOrder prouve deja que les id sont
    // uniques tous types confondus (entite/zone/trait/texte/pulse).
    if (drill.locked && Object.keys(drill.locked).length) out.locked = drill.locked;
    return out;
  }
  function validate() {
    var errs = [];
    if (!drill.meta.title) errs.push("titre manquant");
    if (!drill.meta.theme) errs.push("thème manquant");
    if (!drill.meta.objectif) errs.push("objectif manquant");
    if (ents().length === 0) errs.push("aucun élément sur le terrain");
    return errs;
  }
  function flash(msg, ok) { var s = document.getElementById("status"); s.textContent = msg; s.className = "status " + (ok ? "ok" : "err"); }
  function exportJSON() {
    var errs = validate(); syncJSON();
    if (errs.length) { flash("À compléter : " + errs.join(", "), false); return; }
    var blob = new Blob([JSON.stringify(cleanDrill(), null, 2)], { type: "application/json" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = (drill.meta.title || "procede").toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".json";
    a.click(); flash("Procédé exporté ✓", true);
  }
  // Charge un objet drill quelconque dans l'editeur (fusion avec les defauts + resync).
  function applyDrill(obj) {
    drill = Object.assign(defaultDrill(), obj);
    drill.meta = Object.assign(defaultDrill().meta, obj.meta || {});
    drill.rules = Object.assign(defaultDrill().rules, obj.rules || {});
    if (!drill.keyframes || !drill.keyframes.length) drill.keyframes = defaultDrill().keyframes;
    // Si le JSON importe n'a pas explicitement de variantes (ancien format), on
    // ignore celles que defaultDrill() a mises par defaut (elles pointent vers son
    // propre keyframes jetable, pas vers celui reellement importe) et on laisse
    // ensureVariants() en reconstruire une seule a partir du vrai drill.keyframes.
    if (!obj.variants || !obj.variants.length) drill.variants = null;
    ensureVariants();
    curKf = 0; syncCast(); ensureAnnotations(); ensureTimeline(); ensureOverlays(); invalidateEntsCache(); clearHistory();
    selEntity = null; selZone = null; selAnno = null; selLine = null; selText = null; selPulse = null; multiSel = []; hideInspectors();
    enterAdvancedModeIfDesynced();
    fillTeamsPanel();
    fillMeta(); refreshAllLists(); renderVariants(); renderSteps(); renderAdvancedTimeline(); render(); syncJSON();
  }
  function importJSON() {
    try {
      var obj = JSON.parse(document.getElementById("json").value);
      applyDrill(obj); currentDrillId = null; refreshLibrary(); flash("Procédé importé ✓ (nouveau — enregistre-le pour l'ajouter à la bibliothèque)", true);
    } catch (e) { flash("JSON invalide : " + e.message, false); }
  }

  // ---- bibliotheque locale (store.js) ----
  // Ecran plein qui recouvre l'editeur : vignettes rendues avec le vrai moteur
  // de rendu (R.renderStatic) plutot qu'une liste de titres, recherche plein
  // texte et filtre par categorie. L'editeur reste intact derriere l'overlay.
  // libFolder : null = tous, "" = sans dossier, sinon l'id d'un dossier.
  var libQuery = "", libCat = "", libFolder = null;

  // Etiquette du procede courant dans la barre d'actions : dit si ce qu'on edite
  // vient de la bibliotheque ou n'y a jamais ete enregistre.
  function refreshLibrary() {
    var lbl = document.getElementById("libCurrent");
    if (lbl) {
      if (currentDrillId) lbl.textContent = "Bibliothèque : " + (drill.meta.title || "(sans titre)");
      else lbl.textContent = "Non enregistré";
    }
    var ov = document.getElementById("libOverlay");
    if (ov && !ov.classList.contains("hidden")) { renderFolderList(); renderLibraryGrid(); }
  }
  // Poste une demande de sauvegarde au parent (webapp) au lieu d'ecrire dans
  // DrillStore : en contexte embarque, le parent est seul a parler a Supabase
  // (cf PLAN_INTEGRATION_EDITEUR_TACTIQUE_PHASE0_2026-09.md, etape 3). asNew
  // force la creation d'une nouvelle entree (equivalent embarque de "Enregistrer sous...").
  function saveToParent(asNew) {
    syncJSON();
    if (!drill.meta.title) { flash("Donne un titre au procédé avant de l'enregistrer", false); return; }
    flash("Enregistrement…", true);
    window.parent.postMessage({ type: "SAVE", drillId: asNew ? null : embeddedDrillId, drill: cleanDrill() }, window.location.origin);
  }
  function saveToLibrary() {
    if (embedded) { saveToParent(false); return; }
    if (!window.DrillStore || !DrillStore.available()) { flash("Stockage local indisponible", false); return; }
    syncJSON();
    if (!drill.meta.title) { flash("Donne un titre au procédé avant de l'enregistrer", false); return; }
    currentDrillId = DrillStore.saveDrill(cleanDrill(), currentDrillId);
    refreshLibrary();
    flash("Enregistré dans la bibliothèque ✓", true);
  }
  // Detache le procede courant de son entree de bibliotheque : le prochain
  // enregistrement en cree une nouvelle au lieu d'ecraser l'originale.
  function saveAsToLibrary() {
    if (embedded) { saveToParent(true); return; }
    if (!window.DrillStore || !DrillStore.available()) { flash("Stockage local indisponible", false); return; }
    syncJSON();
    if (!drill.meta.title) { flash("Donne un titre au procédé avant de l'enregistrer", false); return; }
    currentDrillId = DrillStore.saveDrill(cleanDrill(), null);
    refreshLibrary();
    flash("Copie enregistrée dans la bibliothèque ✓", true);
  }
  function loadFromLibrary(id) {
    if (!window.DrillStore || !id) return;
    var rec = DrillStore.getDrill(id);
    if (!rec || !rec.drill) { flash("Procédé introuvable", false); return; }
    applyDrill(rec.drill); currentDrillId = id; refreshLibrary();
    flash("Chargé depuis la bibliothèque ✓", true);
  }
  function deleteFromLibrary(id, title) {
    if (!window.DrillStore || !id) return;
    if (!window.confirm("Supprimer définitivement « " + (title || "ce procédé") + " » de la bibliothèque ?")) return;
    DrillStore.deleteDrill(id);
    if (currentDrillId === id) currentDrillId = null;
    renderFolderList(); refreshLibrary(); flash("Supprimé de la bibliothèque", true);
  }
  function duplicateInLibrary(id) {
    if (!window.DrillStore || !id) return;
    var rec = DrillStore.getDrill(id);
    if (!rec || !rec.drill) return;
    var copy = JSON.parse(JSON.stringify(rec.drill));
    copy.meta = copy.meta || {};
    copy.meta.title = (copy.meta.title || "Sans titre") + " (copie)";
    var newId = DrillStore.saveDrill(copy, null);
    // La copie reste rangee avec son original : dupliquer sert a faire varier
    // un procede, pas a le sortir de son dossier.
    if (newId && rec.folderId) DrillStore.setDrillFolder(newId, rec.folderId);
    renderFolderList(); renderLibraryGrid(); flash("Procédé dupliqué ✓", true);
  }
  function exportFromLibrary(id) {
    if (!window.DrillStore || !id) return;
    var rec = DrillStore.getDrill(id);
    if (!rec || !rec.drill) return;
    var blob = new Blob([JSON.stringify(rec.drill, null, 2)], { type: "application/json" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = ((rec.drill.meta && rec.drill.meta.title) || "procede").toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".json";
    a.click(); flash("Procédé exporté ✓", true);
  }

  // Vignette : premiere etape du procede, rendue par le moteur d'export. On
  // travaille sur une copie profonde car renderStatic reecrit
  // keyframes[].entities a partir de la timeline.
  function libThumbSvg(rec) {
    var d;
    try { d = JSON.parse(JSON.stringify(rec.drill)); } catch (e) { return null; }
    if (!d || !d.pitch || !d.keyframes || !d.keyframes.length) return null;
    try {
      var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      var g = R.renderStatic(svg, d, 0);
      svg.setAttribute("viewBox", "0 0 " + g.W + " " + g.H);
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      return svg;
    } catch (e) { return null; }
  }
  function libCatLabel(cat) {
    return cat === "cpa" ? "CPA" : cat === "animation" ? "Animation" : "Entraînement";
  }
  function libMatches(it) {
    if (libCat && (it.category || "entrainement") !== libCat) return false;
    if (libFolder !== null && (it.folderId || "") !== libFolder) return false;
    if (!libQuery) return true;
    var hay = ((it.title || "") + " " + (it.theme || "") + " " + (it.subcategory || "")).toLowerCase();
    return hay.indexOf(libQuery) >= 0;
  }
  // Barre laterale : "Tous", "Sans dossier", puis les dossiers du coach avec
  // leur nombre de procedes. Le comptage ignore la recherche et la categorie
  // pour rester un reperage stable du contenu, pas un resultat de filtre.
  function renderFolderList() {
    var box = document.getElementById("libFolders");
    if (!box || !window.DrillStore) return;
    var all = DrillStore.listDrills(), folders = DrillStore.listFolders();
    box.innerHTML = "";
    function row(key, name, count, folderId) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "lib-folder" + (libFolder === key ? " active" : "");
      var n = document.createElement("span"); n.className = "fname"; n.textContent = name; n.title = name;
      var c = document.createElement("span"); c.className = "fcount"; c.textContent = count;
      b.appendChild(n); b.appendChild(c);
      if (folderId) {
        var ren = document.createElement("button");
        ren.type = "button"; ren.className = "fbtn"; ren.textContent = "✎"; ren.title = "Renommer le dossier";
        ren.addEventListener("click", function (ev) {
          ev.stopPropagation();
          var nn = window.prompt("Renommer le dossier", name);
          if (nn && nn.trim()) { DrillStore.renameFolder(folderId, nn); renderFolderList(); renderLibraryGrid(); }
        });
        var del = document.createElement("button");
        del.type = "button"; del.className = "fbtn"; del.textContent = "×"; del.title = "Supprimer le dossier (les procédés sont conservés)";
        del.addEventListener("click", function (ev) {
          ev.stopPropagation();
          if (!window.confirm("Supprimer le dossier « " + name + " » ?\nLes procédés qu'il contient sont conservés et retournent dans « Sans dossier ».")) return;
          DrillStore.deleteFolder(folderId);
          if (libFolder === folderId) libFolder = null;
          renderFolderList(); renderLibraryGrid();
        });
        b.appendChild(ren); b.appendChild(del);
      }
      b.addEventListener("click", function () { libFolder = key; renderFolderList(); renderLibraryGrid(); });
      box.appendChild(b);
    }
    row(null, "Tous", all.length, null);
    row("", "Sans dossier", all.filter(function (d) { return !d.folderId; }).length, null);
    folders.forEach(function (f) {
      row(f.id, f.name, all.filter(function (d) { return d.folderId === f.id; }).length, f.id);
    });
  }
  function renderLibraryGrid() {
    var grid = document.getElementById("libGrid");
    if (!grid || !window.DrillStore) return;
    var all = DrillStore.listDrills();
    var folders = DrillStore.listFolders();
    var items = all.filter(libMatches);
    var count = document.getElementById("libCount");
    if (count) count.textContent = items.length === all.length ? all.length + " procédé" + (all.length > 1 ? "s" : "") : items.length + " / " + all.length;
    grid.innerHTML = "";

    var neuf = document.createElement("button");
    neuf.type = "button"; neuf.className = "lib-new";
    neuf.innerHTML = '<span style="font-size:22px;line-height:1">+</span><span>Nouveau procédé</span>';
    neuf.addEventListener("click", function () { closeLibrary(); resetCanvas(); });
    grid.appendChild(neuf);

    if (!all.length) {
      var em = document.createElement("div");
      em.className = "lib-empty"; em.style.gridColumn = "1 / -1";
      em.textContent = "Bibliothèque vide — enregistre un procédé depuis l'éditeur pour le retrouver ici.";
      grid.appendChild(em); return;
    }
    if (!items.length) {
      var nores = document.createElement("div");
      nores.className = "lib-empty"; nores.style.gridColumn = "1 / -1";
      nores.textContent = "Aucun procédé ne correspond à cette recherche.";
      grid.appendChild(nores); return;
    }

    items.forEach(function (it) {
      var rec = DrillStore.getDrill(it.id);
      var card = document.createElement("div");
      card.className = "lib-card" + (it.id === currentDrillId ? " current" : "");

      var thumb = document.createElement("button");
      thumb.type = "button"; thumb.className = "lib-thumb";
      thumb.title = "Ouvrir « " + (it.title || "sans titre") + " »";
      var svg = rec ? libThumbSvg(rec) : null;
      if (svg) thumb.appendChild(svg);
      else thumb.innerHTML = '<span class="lib-thumb-na">aperçu indisponible</span>';
      thumb.addEventListener("click", function () { loadFromLibrary(it.id); closeLibrary(); });
      card.appendChild(thumb);

      var meta = document.createElement("div"); meta.className = "lib-meta";
      var t = document.createElement("div"); t.className = "lib-title";
      t.textContent = it.title || "(sans titre)"; t.title = it.title || "";
      meta.appendChild(t);
      var bits = [];
      if (it.theme) bits.push(it.theme);
      if (it.nbJoueurs) bits.push(it.nbJoueurs + " j.");
      if (it.dureeMin) bits.push(it.dureeMin + " min");
      bits.push(it.keyframes + " étape" + (it.keyframes > 1 ? "s" : ""));
      var s = document.createElement("div"); s.className = "lib-sub"; s.textContent = bits.join(" · ");
      meta.appendChild(s);
      var b = document.createElement("span"); b.className = "lib-badge";
      b.textContent = libCatLabel(it.category) + (it.subcategory ? " · " + it.subcategory : "");
      meta.appendChild(b);
      // Ranger un procede : un select plutot qu'un glisser-deposer, parce qu'il
      // marche aussi au doigt et qu'il dit ou est la carte sans avoir a la
      // survoler.
      var fsel = document.createElement("select");
      fsel.className = "lib-card-folder"; fsel.title = "Dossier";
      var o0 = document.createElement("option"); o0.value = ""; o0.textContent = "— sans dossier —";
      fsel.appendChild(o0);
      folders.forEach(function (f) {
        var o = document.createElement("option"); o.value = f.id; o.textContent = f.name;
        fsel.appendChild(o);
      });
      fsel.value = it.folderId || "";
      fsel.addEventListener("change", function () {
        DrillStore.setDrillFolder(it.id, fsel.value || null);
        renderFolderList(); renderLibraryGrid();
      });
      meta.appendChild(fsel);
      card.appendChild(meta);

      var acts = document.createElement("div"); acts.className = "lib-actions";
      var open = document.createElement("button"); open.type = "button"; open.className = "open"; open.textContent = "Ouvrir";
      open.addEventListener("click", function () { loadFromLibrary(it.id); closeLibrary(); });
      var dup = document.createElement("button"); dup.type = "button"; dup.textContent = "Dupliquer"; dup.title = "Créer une copie dans la bibliothèque";
      dup.addEventListener("click", function () { duplicateInLibrary(it.id); });
      var exp = document.createElement("button"); exp.type = "button"; exp.textContent = "JSON"; exp.title = "Exporter en JSON";
      exp.addEventListener("click", function () { exportFromLibrary(it.id); });
      var del = document.createElement("button"); del.type = "button"; del.className = "danger"; del.textContent = "×"; del.title = "Supprimer de la bibliothèque";
      del.addEventListener("click", function () { deleteFromLibrary(it.id, it.title); });
      acts.appendChild(open); acts.appendChild(dup); acts.appendChild(exp); acts.appendChild(del);
      card.appendChild(acts);

      grid.appendChild(card);
    });
  }
  function openLibrary() {
    document.getElementById("libOverlay").classList.remove("hidden");
    renderFolderList(); renderLibraryGrid();
    var s = document.getElementById("libSearch"); if (s) s.focus();
  }
  function closeLibrary() {
    document.getElementById("libOverlay").classList.add("hidden");
  }

  // ---- identite d'equipe (maillot, contour, numero, forme) ----
  // Regle par procede dans drill.teams, avec un preset reutilisable en
  // localStorage pour ne pas re-saisir les couleurs du club a chaque fois.
  var TEAM_KEYS = ["home", "away", "support"];
  var TEAM_PROPS = ["name", "fill", "stroke", "text", "shape", "size"];
  // "size" est le seul reglage numerique : sa valeur brute vient d'un input
  // range/texte (chaine), il faut la convertir avant de la comparer au defaut
  // ou de l'ecrire dans le procede — sinon "0.9" !== 0.9 empeche a jamais de
  // detecter qu'on est revenu a la valeur d'usine.
  function teamCoerce(prop, raw) { return prop === "size" ? parseFloat(raw) : raw; }
  function teamDefault(key, prop) {
    if (prop === "shape") return key === "support" ? "square" : "circle";
    return R.TEAM_DEFAULTS[key][prop];
  }
  // N'ecrit que ce qui differe de l'usine : un procede aux couleurs par defaut
  // ne porte aucun champ teams, et son JSON reste celui d'avant.
  function cleanTeams() {
    if (!drill.teams) return null;
    var out = {}, any = false;
    TEAM_KEYS.forEach(function (key) {
      var t = drill.teams[key]; if (!t) return;
      var o = {}, kept = false;
      TEAM_PROPS.forEach(function (p) {
        if (t[p] && t[p] !== teamDefault(key, p)) { o[p] = t[p]; kept = true; }
      });
      if (kept) { out[key] = o; any = true; }
    });
    return any ? out : null;
  }
  // Ecriture pure, sans historique : appelee a chaque "input" d'un curseur ou
  // d'un champ texte, elle ne doit pas empiler un etat par pixel/caractere
  // (meme convention que epRange/epColor/epSelect du panneau de clic droit).
  // setTeamProp, plus bas, l'entoure d'un pushHistory() pour les changements
  // discrets (couleur relachee, select, reinitialisation).
  function applyTeamProp(key, prop, value) {
    var v = teamCoerce(prop, value);
    if (!drill.teams) drill.teams = {};
    if (!drill.teams[key]) drill.teams[key] = {};
    if (v === "" || v == null || (typeof v === "number" && isNaN(v)) || v === teamDefault(key, prop)) delete drill.teams[key][prop];
    else drill.teams[key][prop] = v;
    if (!Object.keys(drill.teams[key]).length) delete drill.teams[key];
    if (!Object.keys(drill.teams).length) delete drill.teams;
    render(); syncJSON();
    // Lecture live du curseur pendant le glisser, sans repasser par
    // fillTeamsPanel() (qui re-synchroniserait tous les champs a chaque tick).
    if (prop === "size") {
      var vv = document.getElementById("team_" + key + "_sizeVal");
      if (vv) vv.textContent = (isNaN(v) ? teamDefault(key, prop) : v).toFixed(1) + "×";
    }
  }
  function setTeamProp(key, prop, value) {
    pushHistory();
    applyTeamProp(key, prop, value);
    fillTeamsPanel();
  }
  // Un procede vierge herite des couleurs du club ; un procede charge garde les
  // siennes. Sans cette distinction, ouvrir un ancien schema le recolorerait.
  function seedTeamsFromPreset() {
    if (drill.teams || !window.DrillStore) return;
    var preset = DrillStore.getTeamsPreset();
    if (preset && Object.keys(preset).length) drill.teams = JSON.parse(JSON.stringify(preset));
  }
  function resetTeams() {
    pushHistory();
    delete drill.teams;
    render(); syncJSON(); fillTeamsPanel();
    flash("Identités d'équipe réinitialisées", true);
  }
  function fillTeamsPanel() {
    TEAM_KEYS.forEach(function (key) {
      var t = (drill.teams && drill.teams[key]) || {};
      TEAM_PROPS.forEach(function (prop) {
        var input = document.getElementById("team_" + key + "_" + prop);
        if (!input) return;
        var val = t[prop] || teamDefault(key, prop);
        if (input.type === "color") input.value = val;
        else if (input.tagName === "SELECT") input.value = val;
        else if (input.value !== val) input.value = val;
      });
      var sizeVal = document.getElementById("team_" + key + "_sizeVal");
      if (sizeVal) sizeVal.textContent = (t.size || teamDefault(key, "size")).toFixed(1) + "×";
      var sw = document.getElementById("teamSwatch_" + key);
      if (sw) sw.style.background = t.fill || teamDefault(key, "fill");
    });
  }
  function wireTeamsPanel() {
    TEAM_KEYS.forEach(function (key) {
      TEAM_PROPS.forEach(function (prop) {
        var input = document.getElementById("team_" + key + "_" + prop);
        if (!input) return;
        // Les color pickers et les selects emettent (ou se figent) en un seul
        // "change" au relachement : un pushHistory() par evenement est le bon
        // grain. Texte et curseur emettent "input" en continu — pas d'appel a
        // l'historique a chaque caractere/pixel, meme convention que le
        // panneau de clic droit (cf epRange/epColor/epSelect).
        if (input.type === "color" || input.tagName === "SELECT") {
          input.addEventListener("change", function () { setTeamProp(key, prop, input.value); });
        } else {
          input.addEventListener("input", function () { applyTeamProp(key, prop, input.value); });
        }
      });
    });
    var reset = document.getElementById("teamsReset");
    if (reset) reset.addEventListener("click", resetTeams);
    var save = document.getElementById("teamsSavePreset");
    if (save) save.addEventListener("click", function () {
      if (!window.DrillStore) return;
      DrillStore.saveTeamsPreset(cleanTeams());
      flash(cleanTeams() ? "Identités enregistrées comme défaut ✓" : "Défaut remis aux couleurs d'usine", true);
    });
    var apply = document.getElementById("teamsApplyPreset");
    if (apply) apply.addEventListener("click", function () {
      if (!window.DrillStore) return;
      var preset = DrillStore.getTeamsPreset();
      if (!preset) { flash("Aucune identité enregistrée par défaut", false); return; }
      pushHistory();
      drill.teams = JSON.parse(JSON.stringify(preset));
      render(); syncJSON(); fillTeamsPanel();
      flash("Identités par défaut appliquées ✓", true);
    });
  }

  // ---- trousseau de joueurs (numeros reutilisables, persiste hors des procedes) ----
  var roster = [];
  function loadRoster() { roster = (window.DrillStore && DrillStore.listRoster()) || []; }
  function persistRoster() { if (window.DrillStore) DrillStore.saveRoster(roster); }
  function renderRoster() {
    var c = document.getElementById("rosterList"); if (!c) return;
    c.innerHTML = "";
    if (!roster.length) {
      var e = document.createElement("div"); e.className = "roster-empty"; e.textContent = "Aucun joueur — ajoute un numéro ci-dessous.";
      c.appendChild(e); return;
    }
    roster.forEach(function (p) {
      var chip = document.createElement("div"); chip.className = "roster-chip";
      var hit = document.createElement("button"); hit.type = "button"; hit.className = "rc-hit";
      hit.innerHTML = '<span class="rc-label">' + p.label + '</span><span class="rc-role">' + (p.role || "") + "</span>";
      hit.addEventListener("click", function () { armRosterPlayer(p, hit); });
      var del = document.createElement("button"); del.type = "button"; del.className = "rc-del"; del.title = "Retirer du trousseau"; del.textContent = "×";
      del.addEventListener("click", function (e) { e.stopPropagation(); removeRosterPlayer(p.id); });
      chip.appendChild(hit); chip.appendChild(del); c.appendChild(chip);
    });
  }
  function addRosterPlayer(label, role) {
    label = (label || "").trim(); if (!label) return;
    roster.push({ id: "r" + Date.now() + Math.random().toString(36).slice(2, 5), label: label, role: (role || "").trim() });
    persistRoster(); renderRoster();
  }
  function removeRosterPlayer(id) { roster = roster.filter(function (p) { return p.id !== id; }); persistRoster(); renderRoster(); }
  function armRosterPlayer(p, btn) { pendingTool = { kind: "entity", type: "home", presetLabel: p.label, presetRole: p.role }; setArmed(btn); render(); }

  function loadExample() {
    drill = {
      meta: { title: "Forcer le pressing (sortie de pression)", theme: "Sortie de pression", phase: "situation", phaseCible: "Sortie de pression sous pression haute", formeJouee: true, objectif: "Faire émerger la sortie de pression en forçant l'adversaire à presser.", nbJoueurs: 9, dureeMin: 20, intensite: "elevee", philosophyTags: [], moyensTechnicoTactiques: [] },
      pitch: { length: 34, width: 20, markings: "minimal" },
      zones: [{ id: "relance", kind: "area", label: "Zone de relance", x: 0, y: 0, w: 11, h: 20 }, { id: "cible", kind: "target", label: "Zone cible", x: 27, y: 0, w: 7, h: 20 }],
      keyframes: [{ label: "Dispositif", durationMs: 1500, entities: [
        { id: "gk", type: "player", team: "home", role: "GK", label: "GK", x: 2, y: 10 },
        { id: "f1", type: "player", team: "home", label: "F", x: 8, y: 4 }, { id: "f2", type: "player", team: "home", label: "F", x: 8, y: 16 },
        { id: "re", type: "player", team: "home", label: "R", x: 15, y: 10 }, { id: "po", type: "player", team: "home", label: "P", x: 23, y: 10 },
        { id: "a1", type: "player", team: "away", label: "1", x: 11, y: 6 }, { id: "a2", type: "player", team: "away", label: "2", x: 11, y: 14 },
        { id: "a3", type: "player", team: "away", label: "3", x: 17, y: 10 }, { id: "a4", type: "player", team: "away", label: "4", x: 24, y: 10 },
        { id: "ball", type: "ball", team: "none", x: 2.7, y: 10 }
      ], annotations: [] }],
      rules: { scoring: ["Home : atteindre la zone cible en conservant (min 4 passes) = 1 pt", "Away : récupération = 2 pts ; toucher le porteur = 1 pt"], comportements: ["Ressortir par appuis-soutiens et renversement"], mecanismes: [{ regle: "Récupération adverse = 2 pts", induit: "Pousse l'adversaire à presser haut → crée le problème de sortie" }], variablesPlus: ["Retirer un soutien"], variablesMinus: ["Ajouter un appui neutre au centre"] }
    };
    ensureVariants();
    curKf = 0; selEntity = null; selZone = null; selAnno = null; selLine = null; selText = null; selPulse = null; multiSel = []; ensureAnnotations(); ensureTimeline(); ensureOverlays(); invalidateEntsCache(); hideInspectors();
    enterAdvancedModeIfDesynced();
    seedTeamsFromPreset(); fillTeamsPanel();
    fillMeta(); refreshAllLists(); renderVariants(); renderSteps(); renderAdvancedTimeline(); render(); syncJSON(); clearHistory();
    currentDrillId = null; refreshLibrary(); flash("Exemple chargé", true);
  }

  // ---- terrain : miroir horizontal et reinitialisation rapide ----
  function flipPitch() {
    pushHistory(); commitEnts();
    var L = drill.pitch.length;
    function fx(x) { return round1(L - x); }
    // Entites : portees par la timeline canonique desormais, pas par
    // keyframes[].entities (qui n'est fiable qu'a proximite de curKf, cf
    // syncEntitiesFromTimeline) — on retourne spawn + chaque clip directement.
    ensureTimeline(); ensureOverlays();
    var tl = drill.timeline;
    function flipState(s) { s.x = fx(s.x); if (isRotatable(s)) s.facing = (360 - (s.facing || 0)) % 360; }
    Object.keys(tl.entities).forEach(function (id) {
      var rec = tl.entities[id];
      flipState(rec.spawn);
      rec.clips.forEach(function (c) {
        c.toX = fx(c.toX); flipState(c.to);
        if (c.ctrls) c.ctrls.forEach(function (p) { p.x = fx(p.x); });
      });
    });
    invalidateEntsCache();
    // Traits/pulses/textes : globaux desormais (cf ensureOverlays), un seul passage.
    drill.lines.forEach(function (ln) { ln.x1 = fx(ln.x1); ln.x2 = fx(ln.x2); (ln.ctrls || []).forEach(function (p) { p.x = fx(p.x); }); });
    drill.pulses.forEach(function (pu) { pu.x = fx(pu.x); });
    drill.texts.forEach(function (tx) { tx.x = fx(tx.x); });
    drill.zones.forEach(function (z) {
      if (z.shape === "polygon") z.pts = z.pts.map(function (p) { return { x: fx(p.x), y: p.y }; });
      else z.x = round1(L - (z.x + z.w));
    });
    selEntity = null; selZone = null; selAnno = null; selLine = null; selText = null; selPulse = null; multiSel = []; hideInspectors();
    render(); syncJSON(); flash("Terrain retourné (Ctrl/Cmd+Z pour annuler)", true); closeFlyouts();
  }
  function resetCanvas() {
    pushHistory();
    drill.zones = [];
    var kfs = [{ label: "Dispositif", durationMs: 1500, entities: [], annotations: [], lines: [], texts: [], pulses: [] }];
    drill.keyframes = kfs;
    drill.variants = [{ id: "var-" + (vid++), name: "Variante 1", keyframes: kfs }];
    drill.activeVariantIndex = 0;
    curKf = 0;
    ensureTimeline(); ensureOverlays(); invalidateEntsCache();
    selEntity = null; selZone = null; selAnno = null; selLine = null; selText = null; selPulse = null; multiSel = []; hideInspectors();
    currentDrillId = null;
    renderVariants(); renderSteps(); render(); syncJSON(); refreshLibrary(); flash("Terrain vidé (Ctrl/Cmd+Z pour annuler)", true);
  }

  // ---- variantes : autres suites possibles a partir du meme procede (ex : deux
  // combinaisons differentes sur le meme corner). Chaque variante a sa propre
  // sequence d'etapes complete ; dupliquer une variante permet de reprendre un
  // dispositif deja pose et de le faire diverger a partir d'un certain point.
  function renderVariants() {
    var c = document.getElementById("variantTabs"); if (!c) return;
    c.innerHTML = "";
    drill.variants.forEach(function (v, i) {
      var chip = document.createElement("div");
      chip.className = "step-chip variant-chip" + (i === drill.activeVariantIndex ? " active" : "");
      var inp = document.createElement("input");
      inp.value = v.name || ("Variante " + (i + 1));
      inp.size = Math.max(4, inp.value.length);
      inp.title = "Double-clic pour renommer";
      inp.readOnly = true;
      inp.addEventListener("dblclick", function (ev) { ev.stopPropagation(); inp.readOnly = false; inp.focus(); inp.select(); });
      inp.addEventListener("click", function (ev) { if (inp.readOnly) { ev.stopPropagation(); switchVariant(i); } });
      inp.addEventListener("blur", function () { inp.readOnly = true; renameVariant(i, inp.value); });
      inp.addEventListener("keydown", function (ev) { if (ev.key === "Enter") inp.blur(); if (ev.key === "Escape") { inp.value = v.name || ("Variante " + (i + 1)); inp.blur(); } });
      chip.appendChild(inp);
      if (drill.variants.length > 1) {
        var del = document.createElement("button");
        del.className = "vc-del"; del.textContent = "✕"; del.title = "Supprimer cette variante";
        del.addEventListener("click", function (ev) { ev.stopPropagation(); deleteVariant(i); });
        chip.appendChild(del);
      }
      c.appendChild(chip);
    });
    var mp4Wrap = document.getElementById("mp4AllVariantsWrap");
    if (mp4Wrap) mp4Wrap.style.display = drill.variants.length > 1 ? "flex" : "none";
  }
  function switchVariant(idx) {
    if (idx === drill.activeVariantIndex || idx < 0 || idx >= drill.variants.length) return;
    stopPlay(); commitEnts();
    drill.activeVariantIndex = idx;
    drill.keyframes = drill.variants[idx].keyframes;
    ensureTimeline(); ensureOverlays(); invalidateEntsCache();
    curKf = 0;
    selEntity = null; selZone = null; selAnno = null; selLine = null; selText = null; selPulse = null; multiSel = []; hideInspectors();
    document.getElementById("scrub").value = 0;
    renderVariants(); renderSteps(); render(); syncJSON();
  }
  function addVariant() {
    stopPlay(); commitEnts(); pushHistory();
    var src = drill.variants[drill.activeVariantIndex];
    var copy = { id: "var-" + (vid++), name: "Variante " + (drill.variants.length + 1), keyframes: JSON.parse(JSON.stringify(src.keyframes)) };
    drill.variants.push(copy);
    drill.activeVariantIndex = drill.variants.length - 1;
    drill.keyframes = copy.keyframes;
    ensureTimeline(); ensureOverlays(); invalidateEntsCache();
    curKf = 0;
    selEntity = null; selZone = null; selAnno = null; selLine = null; selText = null; selPulse = null; multiSel = []; hideInspectors();
    document.getElementById("scrub").value = 0;
    renderVariants(); renderSteps(); render(); syncJSON();
    flash("Variante dupliquée — modifie-la à partir d'où elle doit diverger", true);
  }
  function deleteVariant(idx) {
    if (drill.variants.length <= 1) { flash("Il faut au moins une variante", false); return; }
    commitEnts(); pushHistory();
    var wasActive = idx === drill.activeVariantIndex;
    drill.variants.splice(idx, 1);
    if (wasActive) {
      drill.activeVariantIndex = clamp(idx, 0, drill.variants.length - 1);
      drill.keyframes = drill.variants[drill.activeVariantIndex].keyframes;
      ensureTimeline(); ensureOverlays(); invalidateEntsCache();
      curKf = 0;
      selEntity = null; selZone = null; selAnno = null; selLine = null; selText = null; selPulse = null; multiSel = []; hideInspectors();
    } else if (idx < drill.activeVariantIndex) {
      drill.activeVariantIndex -= 1;
    }
    renderVariants(); renderSteps(); render(); syncJSON(); flash("Variante supprimée", true);
  }
  function renameVariant(idx, name) {
    name = (name || "").trim();
    drill.variants[idx].name = name || ("Variante " + (idx + 1));
    renderVariants(); syncJSON();
  }

  // ---- sequence / animation ----
  function renderSteps() {
    var c = document.getElementById("seqSteps"); c.innerHTML = "";
    drill.keyframes.forEach(function (kf, i) {
      var chip = document.createElement("div");
      chip.className = "step-chip" + (i === curKf ? " active" : "");
      chip.textContent = i + 1; chip.title = kf.label || ("Étape " + (i + 1));
      chip.addEventListener("click", function () { selectStep(i); });
      c.appendChild(chip);
    });
    document.getElementById("stepLabel").textContent = drill.keyframes.length > 1
      ? ("Étape " + (curKf + 1) + " / " + drill.keyframes.length)
      : "1 seule étape — ajoute une étape pour animer";
    document.getElementById("stepDur").value = (drill.keyframes[curKf].durationMs || 1500) / 1000;
    renderAdvancedTimeline();
  }
  // ---- timeline du mode avance (lecture seule, Milestone 4) ----
  var ENTITY_TL_COLORS = { home: "#1e63d6", away: "#d63b2f", support: "#e0a021" };
  function entityTlColor(e) {
    if (e.type === "ball") return "#eeeeee";
    if (e.type === "goal" || e.type === "cone") return "#8b9086";
    return ENTITY_TL_COLORS[e.team] || "#8b9086";
  }
  function entityTlLabel(e) {
    var kind = e.type === "player" ? "" : e.type === "support" ? "Appui " : e.type === "ball" ? "Ballon" : e.type === "goal" ? "But" : e.type === "cone" ? "Plot" : e.type;
    return (kind + " " + (e.label || "")).trim() || e.id;
  }
  // tl.totalMs est calcule une fois par buildEntityTimeline (a partir des
  // etapes du mode simple) — un glisser en mode avance peut repousser la fin
  // d'un clip au-dela, donc au-dela de la duree totale connue. A rappeler
  // apres tout glisser qui touche startMs/durationMs.
  function recomputeTotalMs(tl) {
    var max = 0;
    Object.keys(tl.entities).forEach(function (id) {
      tl.entities[id].clips.forEach(function (c) { max = Math.max(max, c.startMs + c.durationMs); });
    });
    drill.zones.concat(drill.lines).concat(drill.pulses).forEach(function (o) { if (o.visibleTo != null) max = Math.max(max, o.visibleTo); });
    tl.totalMs = max;
    ensureKeyframeCapacity(tl);
  }
  // La lecture/le scrub/les exports restent bases sur une position fractionnaire
  // p in [0, keyframes.length-1], convertie en ms via Σ keyframes[i].durationMs
  // (cf onScrub/play/pAtReal, et renderAnimated cote render-core.js) — pas
  // encore migres vers la timeline canonique en ms absolus (refonte plus large,
  // hors scope ici). Consequence concrete : si le mode avance a etire un clip
  // au-dela de cette somme (ou cree le tout premier mouvement d'un procede qui
  // n'a encore qu'une seule etape — Σ vaut alors 0), aucune lecture ne peut
  // jamais atteindre cet instant, quelle que soit la donnee reelle dans
  // drill.timeline. Ce correctif etend silencieusement drill.keyframes (une
  // etape de capacite, sans toucher aux positions/styles deja en place — ils
  // sont recalcules a la volee depuis la timeline par syncEntitiesFromTimeline)
  // pour que Σ durationMs couvre toujours au moins tl.totalMs.
  function ensureKeyframeCapacity(tl) {
    var bm = boundaryMs();
    var simpleTotal = bm.length ? bm[bm.length - 1] : 0;
    if (tl.totalMs > simpleTotal) {
      var kfs = drill.keyframes;
      // boundaryMs ne lit JAMAIS le durationMs du DERNIER keyframe (il n'a pas
      // de "segment sortant" par definition) — la duree qui compte pour
      // repousser la frontiere finale est celle de l'actuel dernier keyframe,
      // qu'on met a jour ICI, avant de pousser un nouveau terminal derriere.
      kfs[kfs.length - 1].durationMs = tl.totalMs - simpleTotal;
      kfs.push({ label: "Étape " + (kfs.length + 1), durationMs: 1500, annotations: [], lines: [], texts: [], pulses: [] });
    }
  }
  var MIN_CLIP_MS = 150, DEFAULT_CLIP_MS = 1500;
  // Clip selectionne dans le panneau avance : {rec, ci} (rec = entree
  // tl.entities[id], ci = index dans rec.clips). Survit aux re-rendus du
  // panneau (rec/ci restent valides tant qu'aucune insertion/suppression
  // n'a lieu AVANT ci sur cette meme entite).
  var selClip = null;
  // Groupes par typologie d'objet, tel que convenu dans la spec (§4) :
  // repliés par défaut, un aperçu miniature de leurs clips quand repliés,
  // dépliables pour révéler une piste par objet individuel.
  var advGroupOpen = {};
  // Curseur independant de la timeline avancee : l'instant (ms) affiche sur
  // le terrain, deplacable en cliquant/glissant la regle sans perdre le clip
  // en cours d'edition (cf onRulerScrub). advTimelineTotalMs est recalcule a
  // chaque renderAdvancedTimeline() — le gestionnaire de la regle (lie une
  // seule fois) le relit a chaque clic pour rester a jour.
  var advCursorMs = null, advTimelineTotalMs = 3000;
  // Selection multiple de clips (Maj+clic, cf toggleClipMultiSelect) : meme
  // schema que multiSel pour les objets du terrain (kind/ref -> ici rec/clip
  // directement, un clip retrouve son index courant via rec.clips.indexOf
  // plutot que de garder un ci fige, fragile des qu'un splice ailleurs dans
  // le meme rec decale les indices). Mutuellement exclusif avec selClip : la
  // multi-selection vide selClip, et retomber a 1 seul element repasse par
  // selectClip (cf toggleClipMultiSelect).
  var multiSelClips = [];
  function entityGroupKey(e) {
    if (e.type === "player" || e.type === "support") return "Joueurs";
    if (e.type === "ball") return "Ballon";
    return "Buts & plots";
  }
  function renderAdvancedTimeline() {
    var wrap = document.getElementById("advTimeline");
    if (!advancedMode) { if (wrap) wrap.classList.add("hidden"); return; }
    wrap.classList.remove("hidden");
    var ruler = document.getElementById("advRuler"), tracks = document.getElementById("advTracks");
    ruler.innerHTML = ""; tracks.innerHTML = "";
    // drill.timeline (canonique) plutot qu'une reconstruction depuis
    // drill.keyframes : ce dernier n'est a jour qu'au voisinage de curKf (cf
    // syncEntitiesFromTimeline), donc perime pour la plupart des entites/
    // etapes affichees ici.
    ensureTimeline(); ensureOverlays();
    var tl = drill.timeline;
    // Plancher de 2 etapes par defaut (3000ms) : sans lui, une timeline encore
    // vide (aucun deplacement nulle part, ex. un seul point de depart) n'aurait
    // qu'un pixel de large et rendrait la creation d'un premier clip impossible
    // a viser — c'est precisement le cas qui bloquait avant ce correctif.
    var totalMs = Math.max(DEFAULT_CLIP_MS * 2, tl.totalMs);
    advTimelineTotalMs = totalMs; // relu par onRulerScrub (lie une seule fois) a chaque clic
    var bm = boundaryMs();
    // Reperes verticaux aux frontieres d'etapes du mode simple — purement
    // visuels : un clip glisse hors de ces reperes n'y "raccroche" plus, c'est
    // precisement ce qui le fait passer en desynchronise (mode avance).
    bm.forEach(function (ms) {
      var pct = (ms / totalMs) * 100;
      var gd = document.createElement("div"); gd.className = "tl-guide"; gd.style.left = pct + "%"; ruler.appendChild(gd);
      var lbl = document.createElement("span"); lbl.style.left = "calc(" + pct + "% + 2px)"; lbl.textContent = (ms / 1000).toFixed(1) + "s"; ruler.appendChild(lbl);
    });
    var ids = Object.keys(tl.entities);
    if (selClip && !ids.some(function (id) { return tl.entities[id] === selClip.rec; })) selClip = null;
    // Meme garde que selClip ci-dessus, pour la selection multiple : une
    // entite supprimee ailleurs (ex. Ctrl+Z externe au clip) ne doit pas
    // laisser trainer une reference vers un rec qui n'existe plus.
    multiSelClips = multiSelClips.filter(function (s) { return ids.indexOf(s.id) >= 0 && s.rec.clips.indexOf(s.clip) >= 0; });
    if (multiSelClips.length < 2) { multiSelClips = []; hideClipMultiBar(); }
    else showClipMultiBar();
    var entityGroups = { "Joueurs": [], "Ballon": [], "Buts & plots": [] };
    ids.forEach(function (id) {
      var e = R.entityStateAtMs(tl, id, 0);
      if (!e) return;
      entityGroups[entityGroupKey(e)].push({ id: id, e: e, rec: tl.entities[id] });
    });
    ["Joueurs", "Ballon", "Buts & plots"].forEach(function (key) {
      var list = entityGroups[key];
      if (!list.length) return;
      var open = advGroupHeader(key, list.length, tracks);
      if (open) {
        list.forEach(function (item) { renderEntityRow(item.id, item.rec, item.e, totalMs, tracks); });
      } else {
        var mini = [];
        list.forEach(function (item) {
          var color = entityTlColor(item.e);
          item.rec.clips.forEach(function (c) { mini.push({ start: c.startMs, dur: c.durationMs, color: color }); });
        });
        renderGroupSummaryRow(tracks, totalMs, mini, function () { advGroupOpen[key] = true; renderAdvancedTimeline(); });
      }
    });
    // Zones/traits/pulses/textes (Phase 2) : une seule fenetre de presence
    // par objet (pas plusieurs clips comme les entites — aucun ne "bouge"
    // dans le temps, cf hors-perimetre du spec), par defaut sur toute la
    // largeur (visibleFrom/visibleTo absents = toujours visible, comportement
    // historique). Glisser le corps decale la fenetre, les poignees gauche/
    // droite en changent le debut/la fin.
    renderOverlayGroup("Zones", drill.zones, function (z) { return z.label || z.kind || z.id; }, function (z) { return z.color || "#8b9086"; }, function (z) { return selZone === z; }, selectZone, totalMs, tracks);
    renderOverlayGroup("Traits", drill.lines, function (ln) { return ln.label || "Trait " + ln.id; }, function (ln) { return ln.color || "#ffffff"; }, function (ln) { return selLine === ln; }, selectLine, totalMs, tracks);
    renderOverlayGroup("Pulses", drill.pulses, function (pu) { return "Pulse " + pu.id; }, function (pu) { return pu.color || "#ff3b30"; }, function (pu) { return selPulse === pu; }, selectPulse, totalMs, tracks);
    renderOverlayGroup("Textes", drill.texts, function (tx) { return (tx.text || "Texte").slice(0, 14); }, function (tx) { return tx.color || "#ffffff"; }, function (tx) { return selText === tx; }, selectText, totalMs, tracks);
    updateClipInspector();
    // Curseur : instant affiche sur le terrain (cf advEditTimeMs), deplacable
    // en cliquant/glissant la regle (onRulerScrub, lie une seule fois plus
    // bas). Rattache a advTimeline (pas a advRuler) et etire sur toute sa
    // hauteur en CSS pur (top:0;bottom:0, cf .tl-cursor) — Robin la voulait
    // visible sur toute la timeline, pas juste la bande de la regle. Seul le
    // `left` est calcule ici (position horizontale = instant sur l'axe des
    // temps) ; la hauteur n'a pas besoin d'etre mesuree en JS (fragile : elle
    // se figerait a la hauteur du moment du calcul, avant que l'inspecteur de
    // clip ne finisse de s'afficher/masquer) — bottom:0 s'adapte tout seul.
    // wrap n'est jamais vide comme ruler/tracks ci-dessus : sans ce retrait
    // explicite, chaque pointermove pendant un glisser (cf onRulerScrub)
    // empilait un nouveau .tl-cursor sans jamais retirer le precedent —
    // des dizaines de barres accent s'accumulaient et se fondaient en un
    // bloc plein, exactement le bug rapporte par Robin.
    var oldCursor = wrap.querySelector(".tl-cursor");
    if (oldCursor) oldCursor.remove();
    if (advCursorMs != null) {
      var cursorPct = Math.max(0, Math.min(100, advCursorMs / totalMs * 100));
      var cursor = document.createElement("div"); cursor.className = "tl-cursor";
      var wrapRect = wrap.getBoundingClientRect(), rulerRect = ruler.getBoundingClientRect();
      // Position en pixels, pas en % de advTimeline : la regle/les pistes ont
      // une marge fixe (colonne d'etiquettes) que advTimeline n'a pas — un %
      // direct de sa largeur totale desalignerait le curseur vers la gauche.
      cursor.style.left = ((rulerRect.left - wrapRect.left) + cursorPct / 100 * rulerRect.width) + "px";
      wrap.appendChild(cursor);
    }
  }
  // En-tete de groupe cliquable (chevron + nom + compte) qui bascule
  // advGroupOpen[label] et redessine — replie par defaut (cf spec §4).
  function advGroupHeader(label, count, tracks) {
    var open = !!advGroupOpen[label];
    var header = document.createElement("div"); header.className = "tl-group-header";
    var chevron = document.createElement("span"); chevron.className = "tl-group-chevron"; chevron.textContent = open ? "▾" : "▸";
    var title = document.createElement("span"); title.className = "tl-group-title"; title.textContent = label;
    var count_ = document.createElement("span"); count_.className = "tl-group-count"; count_.textContent = count;
    header.appendChild(chevron); header.appendChild(title); header.appendChild(count_);
    header.addEventListener("click", function () { advGroupOpen[label] = !open; renderAdvancedTimeline(); });
    tracks.appendChild(header);
    return open;
  }
  // Piste repliee d'un groupe : tous les clips de tous ses objets, superposes
  // sur une seule ligne — un aperçu (cf spec "aperçu miniature de ses clips"),
  // pas un editeur, mais cliquable pour deplier (comme l'en-tete) : sans ça,
  // cliquer une zone qui RESSEMBLE a une piste vide ne faisait rien, et le
  // clic tombait a travers jusqu'a l'entite en dessous — glissee via le
  // mecanisme du mode simple (curKf) plutot que cree comme clip avance, d'ou
  // le bug signale (curseur jamais pose, mouvement "editable" mais sans
  // fleche/clip associe).
  function renderGroupSummaryRow(tracks, totalMs, clipsMini, onExpand) {
    var row = document.createElement("div"); row.className = "tl-track tl-track-summary";
    var label = document.createElement("div"); label.className = "tl-label"; row.appendChild(label);
    var lane = document.createElement("div"); lane.className = "tl-lane";
    lane.title = "Clique pour déplier ce groupe";
    lane.addEventListener("pointerdown", function (ev) { if (ev.target === lane) onExpand(); });
    clipsMini.forEach(function (c) {
      var clip = document.createElement("div"); clip.className = "tl-clip tl-clip-mini";
      clip.style.left = (c.start / totalMs * 100) + "%";
      clip.style.width = Math.max(1, c.dur / totalMs * 100) + "%";
      clip.style.background = c.color;
      lane.appendChild(clip);
    });
    row.appendChild(lane);
    tracks.appendChild(row);
  }
  function renderEntityRow(id, rec, e, totalMs, tracks) {
    var color = entityTlColor(e);
    var row = document.createElement("div"); row.className = "tl-track";
    var label = document.createElement("div"); label.className = "tl-label"; label.textContent = entityTlLabel(e); row.appendChild(label);
    var lane = document.createElement("div"); lane.className = "tl-lane";
    lane.title = "Clique une zone vide pour creer un deplacement";
    lane.addEventListener("pointerdown", function (ev) { if (ev.target === lane) onLaneCreateDown(ev, rec, id, lane, totalMs); });
    rec.clips.forEach(function (c, ci) {
      var clip = document.createElement("div"); clip.className = "tl-clip";
      if (selClip && selClip.rec === rec && selClip.ci === ci) clip.classList.add("selected");
      if (isClipMultiSelected(c)) clip.classList.add("selected");
      clip.style.left = (c.startMs / totalMs * 100) + "%";
      clip.style.width = Math.max(1.5, c.durationMs / totalMs * 100) + "%";
      clip.style.background = color;
      clip.title = round1(c.durationMs / 1000) + "s — glisser pour decaler, poignee droite pour la duree, clic pour regler precisement, Maj+clic pour multi-selection";
      var handle = document.createElement("div"); handle.className = "tl-clip-handle";
      clip.appendChild(handle);
      clip.addEventListener("pointerdown", function (ev) {
        ev.stopPropagation();
        if (ev.shiftKey) { ev.preventDefault(); toggleClipMultiSelect(rec, ci, id); return; }
        if (multiSelClips.length && isClipMultiSelected(c)) { onGroupClipMoveDown(ev, lane, totalMs); return; }
        // Ne PAS re-rendre ici : lane/clip (fermeture de ce handler) seraient
        // detaches par le tracks.innerHTML="" de renderAdvancedTimeline, et
        // onClipMoveDown s'appuie dessus (getBoundingClientRect) pendant le
        // glisser qui suit immediatement — le prochain rendu naturel (a
        // l'intérieur meme de onClipMoveDown) suffit a refleter l'array vide.
        if (multiSelClips.length) multiSelClips = [];
        onClipMoveDown(ev, rec, ci, lane, totalMs, id);
      });
      handle.addEventListener("pointerdown", function (ev) { ev.stopPropagation(); onClipResizeDown(ev, rec, ci, lane, totalMs, id); });
      lane.appendChild(clip);
    });
    row.appendChild(lane);
    tracks.appendChild(row);
  }
  function renderOverlayGroup(label, items, getLabel, getColor, isSelected, onSelect, totalMs, tracks) {
    if (!items.length) return;
    var open = advGroupHeader(label, items.length, tracks);
    if (open) {
      items.forEach(function (o) { renderOverlayRow(o, getLabel, getColor, isSelected, onSelect, totalMs, tracks); });
    } else {
      var mini = items.map(function (o) {
        var oStart = o.visibleFrom != null ? o.visibleFrom : 0, oEnd = o.visibleTo != null ? o.visibleTo : totalMs;
        return { start: oStart, dur: oEnd - oStart, color: getColor(o) };
      });
      renderGroupSummaryRow(tracks, totalMs, mini, function () { advGroupOpen[label] = true; renderAdvancedTimeline(); });
    }
  }
  function renderOverlayRow(o, getLabel, getColor, isSelected, onSelect, totalMs, tracks) {
    var oStart = o.visibleFrom != null ? o.visibleFrom : 0;
    var oEnd = o.visibleTo != null ? o.visibleTo : totalMs;
    var row = document.createElement("div"); row.className = "tl-track";
    var label = document.createElement("div"); label.className = "tl-label"; label.textContent = getLabel(o); row.appendChild(label);
    var lane = document.createElement("div"); lane.className = "tl-lane"; lane.title = "";
    var clip = document.createElement("div"); clip.className = "tl-clip";
    if (isSelected(o)) clip.classList.add("selected");
    clip.style.left = (oStart / totalMs * 100) + "%";
    clip.style.width = Math.max(1.5, (oEnd - oStart) / totalMs * 100) + "%";
    clip.style.background = getColor(o);
    clip.title = round1((oEnd - oStart) / 1000) + "s de visibilite — glisser pour decaler, poignees pour le debut/la fin, clic pour l'inspecteur";
    var handleL = document.createElement("div"); handleL.className = "tl-clip-handle-left";
    var handleR = document.createElement("div"); handleR.className = "tl-clip-handle";
    clip.appendChild(handleL); clip.appendChild(handleR);
    clip.addEventListener("pointerdown", function (ev) { if (ev.target === clip) onOverlayClipMoveDown(ev, o, lane, totalMs, onSelect); });
    handleL.addEventListener("pointerdown", function (ev) { ev.stopPropagation(); onOverlayClipResizeDown(ev, o, lane, totalMs, "left", onSelect); });
    handleR.addEventListener("pointerdown", function (ev) { ev.stopPropagation(); onOverlayClipResizeDown(ev, o, lane, totalMs, "right", onSelect); });
    lane.appendChild(clip);
    row.appendChild(lane);
    tracks.appendChild(row);
  }
  function onOverlayClipMoveDown(ev, o, lane, totalMs, onSelect) {
    ev.preventDefault();
    var laneW = lane.getBoundingClientRect().width, startX = ev.clientX;
    var oStart = o.visibleFrom != null ? o.visibleFrom : 0, oEnd = o.visibleTo != null ? o.visibleTo : totalMs;
    var dur = oEnd - oStart;
    pushHistory();
    var moved = false;
    function move(mv) {
      moved = true;
      var deltaMs = (mv.clientX - startX) / laneW * totalMs;
      var newStart = Math.max(0, Math.min(totalMs - dur, Math.round(oStart + deltaMs)));
      o.visibleFrom = newStart; o.visibleTo = newStart + dur;
      renderAdvancedTimeline();
    }
    function up() {
      document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up);
      if (!moved) { undoStack.pop(); updateHistoryBtns(); onSelect(o); render(); renderAdvancedTimeline(); return; }
      render(); renderAdvancedTimeline(); syncJSON();
    }
    document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
  }
  function onOverlayClipResizeDown(ev, o, lane, totalMs, edge, onSelect) {
    ev.preventDefault();
    var laneW = lane.getBoundingClientRect().width, startX = ev.clientX;
    var oStart = o.visibleFrom != null ? o.visibleFrom : 0, oEnd = o.visibleTo != null ? o.visibleTo : totalMs;
    pushHistory();
    var moved = false;
    function move(mv) {
      moved = true;
      var deltaMs = (mv.clientX - startX) / laneW * totalMs;
      if (edge === "left") o.visibleFrom = Math.max(0, Math.min(oEnd - MIN_CLIP_MS, Math.round(oStart + deltaMs)));
      else o.visibleTo = Math.max(oStart + MIN_CLIP_MS, Math.round(oEnd + deltaMs));
      renderAdvancedTimeline();
    }
    function up() {
      document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up);
      if (!moved) { undoStack.pop(); updateHistoryBtns(); onSelect(o); render(); renderAdvancedTimeline(); return; }
      recomputeTotalMs(drill.timeline); render(); renderAdvancedTimeline(); syncJSON();
    }
    document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
  }
  // Instant (ms) que le terrain doit representer pendant l'edition avancee :
  // le curseur pose sur la regle (advCursorMs) si l'utilisateur en a deplace
  // un, sinon la fin du clip selectionne par defaut (l'endroit dont on pose
  // la position d'arrivee) — cf onRulerScrub pour deplacer le curseur.
  function advEditTimeMs() {
    if (advCursorMs != null) return Math.max(0, Math.min(advTimelineTotalMs, advCursorMs));
    if (!selClip) return null;
    var clip = selClip.rec.clips[selClip.ci];
    return clip ? (clip.startMs + clip.durationMs) : null;
  }
  // Vrai des qu'il y a un instant a montrer sur le terrain en mode avance —
  // un clip selectionne (comportement d'origine) OU un curseur pose sur la
  // regle, meme sans rien selectionner (cf demande de Robin : voir la
  // position de tous les elements a n'importe quel instant, pas seulement
  // en editant un clip precis).
  function advPitchViewActive() {
    return !!(advancedMode && (advCursorMs != null || (selClip && selClip.rec.clips[selClip.ci])));
  }
  // Clip actif d'une entite a l'instant t (celui qui est EN COURS, ni pas
  // encore demarre ni deja termine) — sert a savoir quelle entite est en
  // mouvement "en ce moment" pour lui dessiner sa fleche, pas seulement
  // celle du clip selectionne (cf renderAdvancedPitchEntities).
  function activeClipAt(rec, t) {
    // Bornes inclusives des deux cotes : au tout dernier instant d'un clip
    // (le cas par defaut quand on selectionne un clip, cf selectClip qui pose
    // le curseur pile sur sa fin), le mouvement vient tout juste de se
    // terminer — son trait doit rester visible, pas disparaitre pile a ce
    // moment-la. Une borne exclusive ratait ce cas des que plusieurs entites
    // partagent la meme fin de segment (mouvements synchronises).
    for (var i = 0; i < rec.clips.length; i++) {
      var c = rec.clips[i];
      if (t >= c.startMs && t <= c.startMs + c.durationMs) return { clip: c, ci: i };
    }
    return null;
  }
  // Rendu du terrain en mode avance (clip selectionne) : chaque entite est
  // affichee a sa position interpolee au meme instant (advEditTimeMs), pour
  // que le coach voie le dispositif complet a ce moment-la — mais SEULE
  // l'entite du clip edite est glissable ; les autres ne sont que du contexte
  // (pas d'ecriture accidentelle sur une entite dont ce n'est pas le clip).
  // Chaque entite EN MOUVEMENT a cet instant recoit sa propre fleche pointillee
  // (pas seulement celle du clip selectionne, cf bug signale par Robin —
  // les autres semblaient statiques alors qu'elles bougeaient aussi) ; celle
  // du clip edite reste a pleine opacite avec ses poignees, les autres sont
  // attenuees (contexte, non editables directement).
  function renderAdvancedPitchEntities(g) {
    // Rien selectionne mais un curseur pose (cf advPitchViewActive) : simple
    // aperçu en lecture seule de l'instant choisi, sans entite "editee" —
    // chacune recoit sa propre fleche si elle est en mouvement, comme les
    // autres, mais aucune n'a de poignee de glisser/courbure tant qu'on ne
    // selectionne pas explicitement un de ses clips.
    var tl = drill.timeline, t = advEditTimeMs(), editId = selClip ? selClip.id : null;
    // Etats resolus d'abord, dessin ensuite : la marque du porteur se deduit de
    // l'ensemble des entites a cet instant, pas de l'entite courante seule.
    var advStates = Object.keys(tl.entities).map(function (id) {
      var pos = R.sampleEntityAt(tl, id, t), style = R.entityStateAtMs(tl, id, t);
      if (!pos || !style) return null;
      return { id: id, e: Object.assign({}, style, { x: pos.x, y: pos.y }) };
    }).filter(Boolean);
    var advCarried = R.carrierMap(advStates.map(function (s) { return s.e; }));
    advStates.forEach(function (st) {
      var id = st.id, e = st.e;
      var isEditing = id === editId;
      R.drawEntity(rt, drill, g, e, { selected: isEditing, carrier: !!advCarried[id], onDown: isEditing ? onAdvClipEntityDown : null });
      if (isEditing) return;
      var rec = tl.entities[id], active = activeClipAt(rec, t);
      if (!active) return;
      var from = fromStateOf(rec, active.ci);
      if (from.x !== active.clip.to.x || from.y !== active.clip.to.y) {
        R.drawAnnotation(rt, g, { type: "run", from: { x: from.x, y: from.y }, to: { x: active.clip.to.x, y: active.clip.to.y }, ctrls: active.clip.ctrls, width: 2 }, 0, { dim: true });
      }
    });
    if (!selClip) return;
    var clip = selClip.rec.clips[selClip.ci], from = fromStateOf(selClip.rec, selClip.ci);
    if (from.x !== clip.to.x || from.y !== clip.to.y) {
      R.drawAnnotation(rt, g, { type: "run", from: { x: from.x, y: from.y }, to: { x: clip.to.x, y: clip.to.y }, ctrls: clip.ctrls, width: 2 }, 0, {});
      drawAdvCtrlHandle(g, clip, from);
    }
  }
  // Points de courbure du clip selectionne, en mode avance — pendant de
  // drawCtrlHandle (mode simple) : meme "+" pour ajouter, meme poignee
  // glisser/double-clic-supprime, mais lit/ecrit clip.ctrls directement
  // (pas d'entite materialisee via entsAt/curKf, qui n'a pas de sens ici
  // puisque ce clip peut n'etre synchronise avec aucune etape).
  // `from` (l'etat au DEBUT du clip, cf fromStateOf) porte sa propre copie de
  // ctrls — c'est elle que relit entityStateAt (donc l'export JSON et la
  // synchro keyframes[].entities) — il faut la reecrire en meme temps que
  // clip.ctrls a chaque mutation, sinon la courbe reste correcte a l'ecran
  // (sampleEntityAt lit clip.ctrls) mais disparait de l'export.
  function drawAdvCtrlHandle(g, clip, from) {
    var ctrls = clip.ctrls || [];
    ctrls.forEach(function (pt, i) {
      var h = el("circle", { cx: g.px(pt.x), cy: g.py(pt.y), r: 6, fill: "#fff", stroke: COL.sel, "stroke-width": 2, cursor: "grab" });
      h.addEventListener("pointerdown", function (ev) { onAdvCtrlDown(ev, clip, from, i); });
      rt.appendChild(h);
    });
    drawAddPointHandle(g, waypointsOf(from.x, from.y, clip.to.x, clip.to.y, ctrls), function (gap) {
      pushHistory();
      if (!clip.ctrls) clip.ctrls = [];
      clip.ctrls.splice(gap.idx, 0, { x: round1(gap.x), y: round1(gap.y) });
      from.ctrls = clip.ctrls;
      render(); syncJSON();
    });
  }
  function onAdvCtrlDown(ev, clip, from, idx) {
    if (pendingTool) return;
    ev.preventDefault(); ev.stopPropagation();
    var moved = false;
    var margin = oobMargin();
    dragLoop(function (mv) {
      moved = true;
      var m = clientToMeters(mv, margin);
      clip.ctrls[idx] = { x: round1(m.x), y: round1(m.y) };
      from.ctrls = clip.ctrls;
      render();
    }, function () {
      if (moved || !isDoubleClick("advctrl#" + selClip.id + "#" + selClip.ci + "#" + idx)) return;
      clip.ctrls.splice(idx, 1);
      from.ctrls = clip.ctrls;
    });
  }
  // Glisser l'entite du clip selectionne directement sur le terrain, en mode
  // avance : ecrit sa position d'arrivee (clip.to), sans passer par curKf/
  // ents()/commitEnts() — c'est le pendant "geste naturel" des champs
  // Arrivee X/Y du panneau, qui restent l'alternative precise.
  function onAdvClipEntityDown(ev) {
    if (ev.button === 2 || pendingTool || !selClip) return;
    var clip = selClip.rec.clips[selClip.ci];
    if (!clip) return;
    ev.preventDefault(); ev.stopPropagation();
    // Selectionne l'entite pour l'inspecteur de style (couleur/role/taille/
    // forme), comme onEntityDown en mode simple — sur clip.to, l'etat
    // d'arrivee de CE clip (pas un etat materialise via entsAt/curKf, qui n'a
    // pas de sens ici). Les champs de l'inspecteur mutent selEntity en place ;
    // comme clip.to EST l'objet canonique dans drill.timeline (pas une copie),
    // ces mutations persistent directement, sans passage par commitEnts().
    selectEntity(clip.to);
    var start = clientToMeters(ev), ox = clip.to.x, oy = clip.to.y;
    pushHistory();
    var moved = false;
    function move(mv) {
      moved = true;
      var m = clientToMeters(mv);
      clip.to.x = clamp(round1(ox + (m.x - start.x)), 0, drill.pitch.length);
      clip.to.y = clamp(round1(oy + (m.y - start.y)), 0, drill.pitch.width);
      clip.toX = clip.to.x; clip.toY = clip.to.y;
      render();
    }
    function up() {
      document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up);
      if (!moved) { undoStack.pop(); updateHistoryBtns(); return; }
      renderAdvancedTimeline(); syncJSON();
    }
    document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
  }
  // Etat "de depart" du clip ci d'une entite : l'arrivee du clip precedent, ou
  // le point de depart initial (spawn) pour le tout premier — jamais stocke
  // sur le clip lui-meme, toujours derive de son voisin. C'est cet objet que
  // les champs "Depart X/Y" du panneau lisent ET ecrivent : le modifier
  // deplace donc le clip precedent (ou le point de depart), pas le clip
  // selectionne — exactement l'egalite arrivee(N-1) = depart(N) demandee.
  function fromStateOf(rec, ci) { return ci > 0 ? rec.clips[ci - 1].to : rec.spawn; }
  // Le clip precedent lui-meme (pas son .to) : necessaire pour tenir a jour
  // son toX/toY, un miroir de to.x/to.y stocke a part sur le clip (lu par
  // sampleEntityAt) — absent quand ci===0 (le depart est alors rec.spawn, qui
  // n'a pas ce miroir).
  function fromClipOf(rec, ci) { return ci > 0 ? rec.clips[ci - 1] : null; }
  function updateClipInspector() {
    var box = document.getElementById("advClipInspector");
    var clip = selClip && selClip.rec.clips[selClip.ci];
    if (!clip) { selClip = null; box.classList.add("hidden"); return; }
    box.classList.remove("hidden");
    var from = fromStateOf(selClip.rec, selClip.ci);
    document.getElementById("advClipStart").value = round1(clip.startMs / 1000);
    document.getElementById("advClipDur").value = round1(clip.durationMs / 1000);
    document.getElementById("advClipFromX").value = from.x;
    document.getElementById("advClipFromY").value = from.y;
    document.getElementById("advClipX").value = clip.to.x;
    document.getElementById("advClipY").value = clip.to.y;
  }
  function selectClip(rec, ci, id) {
    selClip = { rec: rec, ci: ci, id: id };
    // L'inspecteur de style (cf onAdvClipEntityDown) pointe sur clip.to d'un
    // clip precis — en changer sans le fermer laisserait le panneau afficher
    // (et modifier) l'etat de l'ancien clip. L'utilisateur re-clique l'entite
    // du nouveau clip s'il veut a nouveau editer son style.
    if (selEntity) { selEntity = null; document.getElementById("inspector").classList.add("hidden"); }
    // Deplie le groupe de CETTE entite une fois, au moment de la selection —
    // pas a chaque rendu (ce qui empecherait de replier manuellement le
    // groupe tant que ce clip reste selectionne, cf bug trouve en testant).
    if (rec.spawn) advGroupOpen[entityGroupKey(rec.spawn)] = true;
    // Recentre le curseur sur la fin de ce clip (comportement par defaut) —
    // l'utilisateur peut ensuite le deplacer independamment via la regle.
    var newClip = rec.clips[ci];
    if (newClip) advCursorMs = newClip.startMs + newClip.durationMs;
    renderAdvancedTimeline(); render();
  }
  // ---- selection multiple de clips (Maj+clic, cf multiSelClips) : meme
  // logique que toggleMultiSelect pour les objets du terrain, adaptee aux
  // clips (rec+objet clip plutot que kind+ref) ----
  function isClipMultiSelected(clip) {
    for (var i = 0; i < multiSelClips.length; i++) if (multiSelClips[i].clip === clip) return true;
    return false;
  }
  function showClipMultiBar() {
    document.getElementById("advClipInspector").classList.add("hidden");
    var bar = document.getElementById("advClipMultiBar");
    bar.classList.remove("hidden");
    document.getElementById("advClipMultiLabel").textContent = multiSelClips.length + " clips sélectionnés";
  }
  function hideClipMultiBar() { document.getElementById("advClipMultiBar").classList.add("hidden"); }
  function toggleClipMultiSelect(rec, ci, id) {
    var clip = rec.clips[ci];
    if (!multiSelClips.length) {
      // Repart du clip simple deja selectionne (comme toggleMultiSelect pour
      // le terrain) : Maj+clic sur un DEUXIEME clip demarre la multi-selection
      // a partir de celui qui etait deja ouvert dans l'inspecteur.
      if (selClip && !(selClip.rec === rec && selClip.ci === ci)) {
        multiSelClips.push({ rec: selClip.rec, clip: selClip.rec.clips[selClip.ci], id: selClip.id });
      }
      selClip = null;
    }
    var idx = -1;
    for (var i = 0; i < multiSelClips.length; i++) if (multiSelClips[i].clip === clip) { idx = i; break; }
    if (idx >= 0) multiSelClips.splice(idx, 1); else multiSelClips.push({ rec: rec, clip: clip, id: id });
    if (multiSelClips.length === 1) {
      var only = multiSelClips[0];
      multiSelClips = [];
      selectClip(only.rec, only.rec.clips.indexOf(only.clip), only.id);
    } else {
      renderAdvancedTimeline(); render();
    }
  }
  // Glisser un clip qui fait partie de la selection multiple : decale TOUS
  // les clips selectionnes du meme delta, chacun borne par ses propres
  // voisins (memes regles de non-chevauchement que onClipMoveDown, mais
  // evaluees clip par clip puisque deux entites differentes peuvent se
  // chevaucher librement — seul l'ordre au sein d'une meme entite compte).
  function onGroupClipMoveDown(ev, lane, totalMs) {
    ev.preventDefault();
    var laneW = lane.getBoundingClientRect().width, startX = ev.clientX;
    pushHistory();
    var moved = false;
    var items = multiSelClips.map(function (s) {
      var ci = s.rec.clips.indexOf(s.clip);
      var minStart = ci > 0 ? (s.rec.clips[ci - 1].startMs + s.rec.clips[ci - 1].durationMs) : 0;
      var maxStart = ci < s.rec.clips.length - 1 ? (s.rec.clips[ci + 1].startMs - s.clip.durationMs) : Infinity;
      return { clip: s.clip, origStart: s.clip.startMs, minStart: minStart, maxStart: maxStart };
    });
    function move(mv) {
      moved = true;
      var deltaMs = (mv.clientX - startX) / laneW * totalMs;
      var lo = -Infinity, hi = Infinity;
      items.forEach(function (it) {
        lo = Math.max(lo, it.minStart - it.origStart);
        hi = Math.min(hi, it.maxStart - it.origStart);
      });
      deltaMs = Math.max(lo, Math.min(hi, deltaMs));
      items.forEach(function (it) { it.clip.startMs = Math.round(it.origStart + deltaMs); });
      renderAdvancedTimeline();
    }
    function up() {
      document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up);
      if (!moved) return;
      recomputeTotalMs(drill.timeline); invalidateEntsCache(); render(); renderAdvancedTimeline(); syncJSON();
    }
    document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
  }
  function deleteMultiSelectedClips() {
    if (!multiSelClips.length) return;
    pushHistory();
    var byRec = multiSelClips.map(function (s) { return { rec: s.rec, ci: s.rec.clips.indexOf(s.clip) }; }).filter(function (x) { return x.ci >= 0; });
    // Tri par ci decroissant avant de spliceer : deux clips de la MEME entite
    // ne doivent pas se decaler l'un l'autre pendant la suppression (un rec
    // different n'est jamais affecte par le splice d'un autre rec).
    byRec.sort(function (a, b) { return b.ci - a.ci; });
    byRec.forEach(function (x) { x.rec.clips.splice(x.ci, 1); });
    multiSelClips = [];
    recomputeTotalMs(drill.timeline); invalidateEntsCache();
    render(); renderAdvancedTimeline(); syncJSON();
  }
  // "Aligner" (demande par Robin) : cale le debut de chaque clip selectionne
  // sur le plus precoce d'entre eux. Borne individuellement par les voisins
  // de CHAQUE clip (memes regles que le glisser de groupe) — un clip qui ne
  // peut pas atteindre la cible sans chevaucher son voisin s'arrete au plus
  // pres au lieu d'etre force en incoherence.
  function alignSelectedClips() {
    if (multiSelClips.length < 2) return;
    pushHistory();
    var target = Math.min.apply(null, multiSelClips.map(function (s) { return s.clip.startMs; }));
    multiSelClips.forEach(function (s) {
      var ci = s.rec.clips.indexOf(s.clip);
      var minStart = ci > 0 ? (s.rec.clips[ci - 1].startMs + s.rec.clips[ci - 1].durationMs) : 0;
      var maxStart = ci < s.rec.clips.length - 1 ? (s.rec.clips[ci + 1].startMs - s.clip.durationMs) : Infinity;
      s.clip.startMs = Math.max(minStart, Math.min(maxStart, target));
    });
    recomputeTotalMs(drill.timeline); invalidateEntsCache();
    render(); renderAdvancedTimeline(); syncJSON();
  }
  document.getElementById("advClipAlign").addEventListener("click", alignSelectedClips);
  document.getElementById("advClipMultiDelete").addEventListener("click", deleteMultiSelectedClips);
  // Clic sur une zone vide de la piste : cree un nouveau clip "hold" (arrivee
  // = etat qui tient deja a cet instant, donc aucun mouvement au depart) a
  // l'instant clique, pour que le mode avance puisse creer un deplacement de
  // zero sans etre passe par le mode simple au prealable. Le clip cree est
  // aussitot selectionne : le terrain affiche alors CETTE entite en glisser
  // direct (cf render()/renderAdvancedPitchEntities) pour poser sa position
  // d'arrivee sans quitter le mode avance — les champs X/Y du panneau restent
  // l'alternative precise.
  function onLaneCreateDown(ev, rec, id, lane, totalMs) {
    if (ev.button === 2) return;
    var laneRect = lane.getBoundingClientRect();
    var clickMs = Math.round((ev.clientX - laneRect.left) / laneRect.width * totalMs);
    var ci = 0; while (ci < rec.clips.length && rec.clips[ci].startMs < clickMs) ci++;
    var prevEnd = ci > 0 ? (rec.clips[ci - 1].startMs + rec.clips[ci - 1].durationMs) : 0;
    var nextStart = ci < rec.clips.length ? rec.clips[ci].startMs : Infinity;
    var startMs = Math.max(prevEnd, Math.min(clickMs, nextStart - MIN_CLIP_MS));
    var durationMs = Math.max(MIN_CLIP_MS, Math.min(DEFAULT_CLIP_MS, nextStart - startMs));
    var tl = drill.timeline;
    var state = R.entityStateAtMs(tl, id, startMs) || rec.spawn;
    var to = JSON.parse(JSON.stringify(state));
    pushHistory();
    rec.clips.splice(ci, 0, { startMs: startMs, durationMs: durationMs, toX: to.x, toY: to.y, to: to });
    recomputeTotalMs(tl); invalidateEntsCache();
    // selectClip (pas une affectation directe de selClip) : pose aussi le
    // curseur sur la fin de ce nouveau clip, sinon il reste a sa valeur
    // precedente (perimee ou absente) — cf bug signale par Robin.
    selectClip(rec, ci, id);
    syncJSON();
    flash("Déplacement créé — glisse le joueur sur le terrain pour poser son arrivée", true);
  }
  document.getElementById("advClipStart").addEventListener("input", function (e) {
    if (!selClip) return;
    var rec = selClip.rec, ci = selClip.ci, clip = rec.clips[ci];
    var minStart = ci > 0 ? (rec.clips[ci - 1].startMs + rec.clips[ci - 1].durationMs) : 0;
    var maxStart = ci < rec.clips.length - 1 ? (rec.clips[ci + 1].startMs - clip.durationMs) : Infinity;
    var v = Math.round((parseFloat(e.target.value) || 0) * 1000);
    clip.startMs = Math.max(minStart, Math.min(maxStart, v));
    recomputeTotalMs(drill.timeline); invalidateEntsCache(); render(); renderAdvancedTimeline(); syncJSON();
  });
  document.getElementById("advClipDur").addEventListener("input", function (e) {
    if (!selClip) return;
    var rec = selClip.rec, ci = selClip.ci, clip = rec.clips[ci];
    var maxDur = ci < rec.clips.length - 1 ? (rec.clips[ci + 1].startMs - clip.startMs) : Infinity;
    var v = Math.round((parseFloat(e.target.value) || 0) * 1000);
    clip.durationMs = Math.max(MIN_CLIP_MS, Math.min(maxDur, v));
    recomputeTotalMs(drill.timeline); invalidateEntsCache(); render(); renderAdvancedTimeline(); syncJSON();
  });
  document.getElementById("advClipFromX").addEventListener("input", function (e) {
    if (!selClip) return;
    var from = fromStateOf(selClip.rec, selClip.ci), prevClip = fromClipOf(selClip.rec, selClip.ci);
    var v = parseFloat(e.target.value);
    if (isNaN(v)) return;
    from.x = v; if (prevClip) prevClip.toX = v;
    invalidateEntsCache(); render(); renderAdvancedTimeline(); syncJSON();
  });
  document.getElementById("advClipFromY").addEventListener("input", function (e) {
    if (!selClip) return;
    var from = fromStateOf(selClip.rec, selClip.ci), prevClip = fromClipOf(selClip.rec, selClip.ci);
    var v = parseFloat(e.target.value);
    if (isNaN(v)) return;
    from.y = v; if (prevClip) prevClip.toY = v;
    invalidateEntsCache(); render(); renderAdvancedTimeline(); syncJSON();
  });
  document.getElementById("advClipX").addEventListener("input", function (e) {
    if (!selClip) return;
    var clip = selClip.rec.clips[selClip.ci], v = parseFloat(e.target.value);
    if (isNaN(v)) return;
    clip.to.x = v; clip.toX = v;
    invalidateEntsCache(); render(); renderAdvancedTimeline(); syncJSON();
  });
  document.getElementById("advClipY").addEventListener("input", function (e) {
    if (!selClip) return;
    var clip = selClip.rec.clips[selClip.ci], v = parseFloat(e.target.value);
    if (isNaN(v)) return;
    clip.to.y = v; clip.toY = v;
    invalidateEntsCache(); render(); renderAdvancedTimeline(); syncJSON();
  });
  document.getElementById("advClipDelete").addEventListener("click", deleteSelectedClip);
  // Regle de la timeline avancee : clic/glisser deplace le curseur (advCursorMs)
  // — lie une seule fois ici (la regle elle-meme n'est jamais recreee, seul
  // son contenu l'est a chaque renderAdvancedTimeline) ; relit advTimelineTotalMs
  // a chaque clic pour rester coherent avec le rendu courant.
  document.getElementById("advRuler").addEventListener("pointerdown", function (ev) {
    ev.preventDefault();
    var ruler = document.getElementById("advRuler");
    function setFromEvent(e2) {
      var r = ruler.getBoundingClientRect();
      var frac = Math.max(0, Math.min(1, (e2.clientX - r.left) / r.width));
      advCursorMs = Math.round(frac * advTimelineTotalMs);
      render(); renderAdvancedTimeline();
    }
    setFromEvent(ev);
    function move(mv) { setFromEvent(mv); }
    function up() { document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); }
    document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
  });
  // Glisser le CORPS d'un clip : decale startMs, duree inchangee. Borne pour
  // ne jamais chevaucher le clip precedent/suivant de la MEME entite (les
  // clips restent tries, sans recouvrement — invariant dont depend
  // sampleEntityAt). Les autres entites ne sont pas concernees : deux clips
  // de deux entites differentes peuvent librement se chevaucher dans le
  // temps, c'est le but du mode avance.
  function onClipMoveDown(ev, rec, ci, lane, totalMs, id) {
    ev.preventDefault();
    var clip = rec.clips[ci];
    var laneW = lane.getBoundingClientRect().width;
    var startX = ev.clientX, origStart = clip.startMs;
    var minStart = ci > 0 ? (rec.clips[ci - 1].startMs + rec.clips[ci - 1].durationMs) : 0;
    var maxStart = ci < rec.clips.length - 1 ? (rec.clips[ci + 1].startMs - clip.durationMs) : Infinity;
    pushHistory();
    var moved = false;
    function move(mv) {
      moved = true;
      var deltaMs = (mv.clientX - startX) / laneW * totalMs;
      clip.startMs = Math.max(minStart, Math.min(maxStart, Math.round(origStart + deltaMs)));
      renderAdvancedTimeline();
    }
    function up() {
      document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up);
      if (!moved) { undoStack.pop(); updateHistoryBtns(); selectClip(rec, ci, id); return; } // pas de deplacement reel : annule le snapshot pris pour rien, selectionne au lieu
      recomputeTotalMs(drill.timeline); invalidateEntsCache(); render(); renderAdvancedTimeline(); syncJSON();
    }
    document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
  }
  // Glisser la poignee droite : change durationMs (donc la fin du clip),
  // debut inchange. Bornee au debut du clip suivant (ou libre si dernier —
  // recomputeTotalMs etend alors la duree totale de la timeline).
  function onClipResizeDown(ev, rec, ci, lane, totalMs, id) {
    ev.preventDefault();
    var clip = rec.clips[ci];
    var laneW = lane.getBoundingClientRect().width;
    var startX = ev.clientX, origDur = clip.durationMs;
    var maxDur = ci < rec.clips.length - 1 ? (rec.clips[ci + 1].startMs - clip.startMs) : Infinity;
    pushHistory();
    var moved = false;
    function move(mv) {
      moved = true;
      var deltaMs = (mv.clientX - startX) / laneW * totalMs;
      clip.durationMs = Math.max(MIN_CLIP_MS, Math.min(maxDur, Math.round(origDur + deltaMs)));
      renderAdvancedTimeline();
    }
    function up() {
      document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up);
      if (!moved) { undoStack.pop(); updateHistoryBtns(); selectClip(rec, ci, id); return; }
      recomputeTotalMs(drill.timeline); invalidateEntsCache(); render(); renderAdvancedTimeline(); syncJSON();
    }
    document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
  }
  document.getElementById("advToggle").addEventListener("click", function () {
    advancedMode = true;
    invalidateEntsCache(); // evite qu'un commitEnts() perime (curKf du mode simple) n'ecrive au mauvais endroit pendant l'edition avancee
    selEntity = null; selZone = null; selAnno = null; selLine = null; selText = null; selPulse = null; multiSel = []; hideInspectors();
    document.getElementById("simpleSeqbar").classList.add("hidden");
    renderAdvancedTimeline(); render();
  });
  document.getElementById("advToggleBack").addEventListener("click", function () {
    advancedMode = false;
    selClip = null; advCursorMs = null; multiSelClips = [];
    // selEntity peut pointer sur clip.to d'un clip du mode avance (cf
    // onAdvClipEntityDown) — objet perime des qu'on repasse en mode simple.
    selEntity = null; selZone = null; selAnno = null; selLine = null; selText = null; selPulse = null; multiSel = []; hideInspectors();
    invalidateEntsCache();
    document.getElementById("simpleSeqbar").classList.remove("hidden");
    renderAdvancedTimeline();
    renderSteps(); // rafraichit les chips si le mode avance a ajoute une etape de capacite (cf ensureKeyframeCapacity)
    render();
  });
  function selectStep(i) {
    stopPlay(); commitEnts(); curKf = clamp(i, 0, drill.keyframes.length - 1);
    selEntity = null; selZone = null; selAnno = null; selLine = null; selText = null; selPulse = null; multiSel = []; hideInspectors();
    document.getElementById("scrub").value = drill.keyframes.length > 1 ? Math.round(curKf / (drill.keyframes.length - 1) * 1000) : 0;
    renderSteps(); render();
  }
  // Change la duree de l'etape kfIdx (mode simple, champ "Duree"). L'ancien
  // code ecrivait uniquement drill.keyframes[kfIdx].durationMs — un champ
  // d'AFFICHAGE, mirror de ce que porte reellement la timeline canonique
  // (drill.timeline.entities[id].clips[kfIdx].durationMs). stepBoundariesMs()
  // (qui place chaque etape dans le temps pour la lecture/le scrub) lit ce
  // champ d'affichage, mais entityStateAt() (qui donne la position REELLE
  // d'un joueur a cet instant) lit les clips de la timeline — jamais mis a
  // jour. Les deux divergeaient donc des le premier changement de duree :
  // "frontiere d'etape" et "endroit ou la timeline dit que le joueur se
  // trouve" ne coincidaient plus, d'ou position figee, saut en arriere a
  // l'etape suivante, ou saccades en lecture (symptomes remontes par Robin).
  // Ici, on decale explicitement tout ce qui suit dans le temps (clips de
  // chaque entite + fenetres de presence des traits/pulses/textes), meme
  // logique que addStep/delStep juste en dessous.
  function setStepDuration(kfIdx, newDurationMs) {
    var N = drill.keyframes.length;
    // Le DERNIER keyframe n'a pas de "segment sortant" (stepBoundariesMs ne
    // lit jamais son durationMs, cf ensureKeyframeCapacity) : rien dans la
    // timeline ne depend de sa valeur, une simple ecriture suffit.
    if (kfIdx < 0 || kfIdx >= N - 1) { drill.keyframes[kfIdx].durationMs = newDurationMs; return; }
    ensureTimeline(); ensureOverlays();
    var tl = drill.timeline, bmOld = boundaryMs();
    var oldDurationMs = drill.keyframes[kfIdx].durationMs || 1500;
    var delta = newDurationMs - oldDurationMs;
    drill.keyframes[kfIdx].durationMs = newDurationMs;
    if (!delta) return;
    var cutMs = bmOld[kfIdx + 1];
    Object.keys(tl.entities).forEach(function (id) {
      var rec = tl.entities[id];
      if (rec.clips[kfIdx]) rec.clips[kfIdx].durationMs = newDurationMs;
      rec.clips.forEach(function (c) { if (c.startMs >= cutMs) c.startMs += delta; });
    });
    function shiftOverlay(o) {
      if (o.visibleFrom != null && o.visibleFrom >= cutMs) o.visibleFrom += delta;
      if (o.visibleTo != null && o.visibleTo >= cutMs) o.visibleTo += delta;
    }
    drill.lines.forEach(shiftOverlay);
    drill.pulses.forEach(shiftOverlay);
    drill.texts.forEach(shiftOverlay);
    recomputeTotalMs(tl); invalidateEntsCache();
  }
  // Insere une nouvelle frontiere temporelle juste apres curKf : chaque
  // entite gagne un clip "hold" (meme position/style qu'a curKf, aucun
  // mouvement) sur la duree inseree, et tout ce qui suivait dans le temps est
  // decale d'autant — matche exactement l'ancien comportement (cloner l'etape
  // courante = les joueurs ne bougent pas pendant la nouvelle etape).
  function addStep() {
    stopPlay(); commitEnts(); pushHistory();
    ensureTimeline(); ensureOverlays();
    var tl = drill.timeline, bmOld = boundaryMs();
    var insertDurationMs = drill.keyframes[curKf].durationMs || 1500;
    var cutMs = bmOld[curKf + 1];
    Object.keys(tl.entities).forEach(function (id) {
      var rec = tl.entities[id];
      var stateAtCurKf = R.entityStateAt(tl, id, curKf, bmOld);
      var holdClip = { startMs: bmOld[curKf], durationMs: insertDurationMs, toX: stateAtCurKf.x, toY: stateAtCurKf.y, to: JSON.parse(JSON.stringify(stateAtCurKf)) };
      var shifted = rec.clips.map(function (c) {
        if (c.startMs >= cutMs) { var c2 = Object.assign({}, c); c2.startMs += insertDurationMs; return c2; }
        return c;
      });
      shifted.splice(curKf, 0, holdClip);
      rec.clips = shifted;
    });
    // Traits/pulses/textes (globaux, cf ensureOverlays) : une fenetre qui
    // commence apres le point d'insertion se decale de la meme duree que les
    // clips d'entite (sinon elle resterait "en retard" par rapport aux etapes
    // qu'elle etait censee suivre) ; une fenetre qui couvre deja ce point
    // s'etend d'autant, pour rester visible durant l'etape nouvellement
    // inseree — meme logique qu'un hold d'entite qui traverse l'insertion.
    function shiftOverlay(o) {
      if (o.visibleFrom != null && o.visibleFrom >= cutMs) o.visibleFrom += insertDurationMs;
      if (o.visibleTo != null && o.visibleTo >= cutMs) o.visibleTo += insertDurationMs;
    }
    drill.lines.forEach(shiftOverlay);
    drill.pulses.forEach(shiftOverlay);
    drill.texts.forEach(shiftOverlay);
    var copy = JSON.parse(JSON.stringify(drill.keyframes[curKf]));
    copy.label = "Étape " + (drill.keyframes.length + 1);
    copy.annotations = [];
    delete copy.entities; // porte par la timeline desormais, pas par ce clone
    delete copy.lines; delete copy.pulses; delete copy.texts; // globaux desormais (cf ensureOverlays), pas par ce clone
    drill.keyframes.splice(curKf + 1, 0, copy);
    invalidateEntsCache();
    selectStep(curKf + 1); syncJSON(); flash("Étape ajoutée (déplace les joueurs)", true);
  }
  // Duplique curKf et ajoute la copie a la toute fin de la sequence, au lieu
  // de l'inserer juste apres (cf addStep) — utile pour boucler l'animation
  // sur une formation deja construite sans la reconstruire au dernier pas.
  // Plus simple que addStep/delStep : ajouter APRES tout ce qui existe ne
  // decale rien (aucun clip ni fenetre de presence anterieure a toucher), il
  // suffit de creer le segment manquant qui menait jusqu'ici a rien (le
  // dernier keyframe n'a jamais de segment sortant, cf setStepDuration) puis
  // de pousser la nouvelle etape. Reutilise pour ce segment le durationMs de
  // l'ancien dernier keyframe, jusque-la sans aucun effet (stepBoundariesMs
  // ne le lit jamais) : il prend enfin un sens des qu'une etape le suit.
  function duplicateStepToEnd() {
    stopPlay(); commitEnts(); pushHistory();
    ensureTimeline(); ensureOverlays();
    var tl = drill.timeline, bm = boundaryMs(), N = drill.keyframes.length, srcIdx = curKf;
    var insertDurationMs = drill.keyframes[N - 1].durationMs || 1500;
    var startMs = bm[N - 1];
    Object.keys(tl.entities).forEach(function (id) {
      var rec = tl.entities[id];
      var srcState = R.entityStateAt(tl, id, srcIdx, bm);
      rec.clips.push({ startMs: startMs, durationMs: insertDurationMs, toX: srcState.x, toY: srcState.y, to: JSON.parse(JSON.stringify(srcState)) });
    });
    var copy = JSON.parse(JSON.stringify(drill.keyframes[srcIdx]));
    copy.label = "Étape " + (N + 1);
    copy.annotations = [];
    delete copy.entities; delete copy.lines; delete copy.pulses; delete copy.texts;
    drill.keyframes.push(copy);
    invalidateEntsCache(); recomputeTotalMs(tl);
    selectStep(N); syncJSON(); flash("Étape dupliquée en fin de séquence", true);
  }
  // Retire la frontiere curKf. Le clip qui y menait et celui qui en repartait
  // fusionnent en un seul (garde le debut/la duree/le style de mouvement du
  // premier, prend la destination du second) — meme resultat que l'ancien
  // modele ou seul l'objet keyframes[curKf] disparaissait sans redistribuer
  // les durees. Cas particuliers : premiere etape (rien a fusionner en amont,
  // juste un nouveau point de depart) et derniere etape (rien a fusionner en
  // aval, le dernier clip est simplement retire).
  function delStep() {
    if (drill.keyframes.length <= 1) { flash("Il faut au moins une étape", false); return; }
    stopPlay(); commitEnts(); pushHistory();
    ensureTimeline(); ensureOverlays();
    var tl = drill.timeline, bmOld = boundaryMs(), N = drill.keyframes.length;
    if (curKf === 0) {
      var shiftAmt0 = drill.keyframes[0].durationMs || 1500;
      Object.keys(tl.entities).forEach(function (id) {
        var rec = tl.entities[id];
        if (rec.clips.length) {
          rec.spawn = rec.clips[0].to;
          rec.clips = rec.clips.slice(1).map(function (c) { var c2 = Object.assign({}, c); c2.startMs -= shiftAmt0; return c2; });
        }
      });
      // Traits/pulses (globaux) : meme decalage arriere, borne a 0 (une
      // fenetre qui commencait dans l'etape supprimee redevient visible des
      // le debut plutot que de passer en negatif).
      drill.lines.concat(drill.pulses).concat(drill.texts).forEach(function (o) {
        if (o.visibleFrom != null) o.visibleFrom = Math.max(0, o.visibleFrom - shiftAmt0);
        if (o.visibleTo != null) o.visibleTo = Math.max(0, o.visibleTo - shiftAmt0);
      });
    } else if (curKf === N - 1) {
      Object.keys(tl.entities).forEach(function (id) { var rec = tl.entities[id]; rec.clips = rec.clips.slice(0, curKf - 1); });
    } else {
      var removedDur = drill.keyframes[curKf].durationMs || 1500;
      var cutMs2 = bmOld[curKf + 1];
      Object.keys(tl.entities).forEach(function (id) {
        var rec = tl.entities[id], keep = rec.clips[curKf - 1], removed = rec.clips[curKf];
        if (keep && removed) { keep.to = removed.to; keep.toX = removed.toX; keep.toY = removed.toY; }
        var newClips = [];
        rec.clips.forEach(function (c, i) {
          if (i === curKf) return;
          var c2 = Object.assign({}, c);
          if (c2.startMs >= cutMs2) c2.startMs -= removedDur;
          newClips.push(c2);
        });
        rec.clips = newClips;
      });
      // Meme decalage arriere que les clips d'entite (cf addStep, sens inverse).
      drill.lines.concat(drill.pulses).concat(drill.texts).forEach(function (o) {
        if (o.visibleFrom != null && o.visibleFrom >= cutMs2) o.visibleFrom -= removedDur;
        if (o.visibleTo != null && o.visibleTo >= cutMs2) o.visibleTo -= removedDur;
      });
    }
    drill.keyframes.splice(curKf, 1);
    invalidateEntsCache();
    selectStep(clamp(curKf, 0, drill.keyframes.length - 1)); syncJSON();
  }
  function setPlayBtn(isPlaying) {
    var label = document.getElementById("playLabel"); if (label) label.textContent = isPlaying ? "Pause" : "Lecture";
    var icon = document.getElementById("playIcon");
    if (icon) icon.innerHTML = isPlaying
      ? '<rect x="5" y="4" width="3.5" height="12" fill="currentColor" /><rect x="11.5" y="4" width="3.5" height="12" fill="currentColor" />'
      : '<polygon points="6,4 16,10 6,16" fill="currentColor" />';
  }
  function stopPlay() { if (!playing && !rafId) return; playing = false; if (rafId) cancelAnimationFrame(rafId); rafId = null; setPlayBtn(false); }
  function play() {
    var N = drill.keyframes.length;
    if (N < 2) { flash("Ajoute une 2e étape pour animer", false); return; }
    if (playing) { stopPlay(); render(); return; }
    syncCast(); playing = true; setPlayBtn(true);
    selEntity = null; selZone = null; selAnno = null; selLine = null; selText = null; selPulse = null; multiSel = []; hideInspectors();
    var t0 = null, total = 0, i;
    for (i = 0; i < N - 1; i++) total += (drill.keyframes[i].durationMs || 1500) / playSpeed;
    function pAt(elapsed) {
      var acc = 0;
      for (var j = 0; j < N - 1; j++) { var dur = (drill.keyframes[j].durationMs || 1500) / playSpeed; if (elapsed < acc + dur) return j + (elapsed - acc) / dur; acc += dur; }
      return N - 1;
    }
    function frame(ts) {
      if (!playing) return;
      if (t0 == null) t0 = ts;
      var elapsed = ts - t0, pp = pAt(elapsed);
      document.getElementById("scrub").value = Math.round(pp / (N - 1) * 1000); renderAnimated(pp);
      if (elapsed < total) rafId = requestAnimationFrame(frame);
      else { playing = false; rafId = null; setPlayBtn(false); renderAnimated(N - 1); }
    }
    rafId = requestAnimationFrame(frame);
  }
  function onScrub() {
    stopPlay(); var N = drill.keyframes.length;
    if (N < 2) { render(); return; }
    renderAnimated((+document.getElementById("scrub").value / 1000) * (N - 1));
  }

  // ---- export image / GIF anime ----
  function fileBase() { return (drill.meta.title || "procede").toLowerCase().replace(/[^a-z0-9]+/g, "-"); }
  function downloadBlob(blob, name) {
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  // Position temporelle (etape.fraction) a l'instant t ms, timing REEL (durationMs), sans playSpeed.
  function pAtReal(elapsed) {
    var N = drill.keyframes.length, acc = 0;
    for (var j = 0; j < N - 1; j++) { var dur = drill.keyframes[j].durationMs || 1500; if (elapsed < acc + dur) return j + (elapsed - acc) / dur; acc += dur; }
    return N - 1;
  }
  // Rasterise le SVG courant (tel qu'il est dessine) vers un canvas EW x EH.
  function rasterize(EW, EH, cb) {
    var xml = new XMLSerializer().serializeToString(svg);
    if (!/xmlns=/.test(xml)) xml = xml.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    var url = "data:image/svg+xml;charset=utf-8;base64," + btoa(unescape(encodeURIComponent(xml)));
    var img = new Image();
    img.onload = function () {
      var cv = document.createElement("canvas"); cv.width = EW; cv.height = EH;
      var ctx = cv.getContext("2d"); ctx.drawImage(img, 0, 0, EW, EH);
      cb(ctx.getImageData(0, 0, EW, EH), cv);
    };
    img.onerror = function () { cb(null, null); };
    img.src = url;
  }
  // Reglages d'export partages par PNG/GIF/MP4 (cf #exportSettingsFlyout).
  // Qualite : multiplicateur applique par-dessus l'echelle par defaut de
  // chaque format (baseScale) — "Standard" (x1) reproduit exactement le
  // rendu d'avant ces reglages, aucune regression pour qui ne les touche pas.
  function exportScale(baseScale) {
    var q = parseFloat(document.getElementById("exportQuality").value) || 1;
    return baseScale * q;
  }
  // Vitesse : ne recapture pas plus/moins d'images, rejoue les memes plus
  // vite ou plus lentement — multiplie le fps effectif declare a l'encodage
  // (GIF: delai entre images, MP4: -framerate), le contenu des frames ne
  // change pas. 1x (defaut) = comportement identique a avant ce reglage.
  function exportSpeedMult() {
    return parseFloat(document.getElementById("exportSpeed").value) || 1;
  }
  function exportPNG() {
    stopPlay();
    var sE = selEntity, sZ = selZone, sA = selAnno, sL = selLine, sT = selText, sP = selPulse, sM = multiSel; multiSel = [];
    selEntity = null; selZone = null; selAnno = null; selLine = null; selText = null; selPulse = null; multiSel = [];
    renderAnimated(curKf); // rendu propre (sans poignees ni sélection)
    var g = geo(), EW = Math.round(g.W * exportScale(1.4)), EH = Math.round(g.H * exportScale(1.4));
    rasterize(EW, EH, function (imgData, cv) {
      selEntity = sE; selZone = sZ; selAnno = sA; selLine = sL; selText = sT; selPulse = sP; multiSel = sM; render();
      if (!cv) { flash("Rendu PNG impossible", false); return; }
      cv.toBlob(function (blob) { downloadBlob(blob, fileBase() + "-etape" + (curKf + 1) + ".png"); flash("PNG exporté ✓", true); }, "image/png");
    });
  }
  // Plafond de securite (pas une limite de confort) : evite qu'une sequence
  // demesuree ou un fps eleve ne fasse tenter une allocation qui plante l'onglet.
  // A ce nombre d'images, une sequence de plusieurs minutes passe sans etre
  // degradee — au-dela, le fps effectif redescend plutot que d'echouer.
  var MAX_EXPORT_FRAMES = 3000;
  function exportGIF() {
    var N = drill.keyframes.length;
    if (N < 2) { flash("Ajoute une 2e étape pour un GIF animé (sinon utilise PNG)", false); return; }
    stopPlay(); syncCast();
    var sE = selEntity, sZ = selZone, sA = selAnno, sL = selLine, sT = selText, sP = selPulse, sM = multiSel; multiSel = [];
    selEntity = null; selZone = null; selAnno = null; selLine = null; selText = null; selPulse = null; multiSel = [];
    var fps = parseInt(document.getElementById("gifFps").value, 10) || 12;
    var total = 0; for (var i = 0; i < N - 1; i++) total += drill.keyframes[i].durationMs || 1500;
    var frameCount = Math.max(2, Math.min(MAX_EXPORT_FRAMES, Math.round(total / 1000 * fps)));
    // Le delai par image se cale sur la duree reelle de la sequence, pas sur le
    // fps nominal choisi : sinon, des que le plafond de 150 images tronque le
    // nombre d'images necessaires (sequence longue et/ou fps eleve), le GIF
    // s'accelere au lieu de rester fluide-mais-a-fps-reduit sur la bonne duree.
    // Vitesse : rejoue les memes images captures plus vite/lentement, sans
    // en capturer plus ou moins (cf exportSpeedMult) — s'applique donc apres
    // le calcul de effFps ci-dessus, jamais avant (frameCount/total restent
    // fondes sur la duree REELLE de la sequence).
    var speedMult = exportSpeedMult();
    var effFps = (frameCount / (total / 1000)) * speedMult;
    var delayCs = Math.max(2, Math.round(100 / effFps));
    var g = geo(), EW = Math.round(g.W * exportScale(0.9)), EH = Math.round(g.H * exportScale(0.9));
    var frames = [];
    flash("Génération du GIF… 0/" + frameCount, true);
    (function loop(fi) {
      if (fi >= frameCount) { encode(); return; }
      var t = total * fi / (frameCount - 1);
      renderAnimated(pAtReal(t));
      rasterize(EW, EH, function (imgData) {
        if (imgData) frames.push({ data: imgData.data, delayCs: (fi === frameCount - 1) ? delayCs + 60 : delayCs });
        if (fi % 4 === 0 || fi === frameCount - 1) flash("Génération du GIF… " + (fi + 1) + "/" + frameCount, true);
        loop(fi + 1);
      });
    })(0);
    function encode() {
      flash("Encodage du GIF…", true);
      setTimeout(function () {
        try {
          var bytes = window.GIFEncoder.fromFrames(frames, { width: EW, height: EH, maxColors: 64, loop: 0 });
          downloadBlob(new Blob([bytes], { type: "image/gif" }), fileBase() + ".gif");
          // Compare a fps*vitesse (l'effFps attendu quand le budget d'images n'a
          // pas ete tronque), pas au fps brut : sinon la vitesse choisie serait
          // a tort signalee comme une degradation "plafond atteint".
          var expectedFps = fps * speedMult;
          var fpsNote = Math.round(effFps) === Math.round(expectedFps)
            ? (fps + " fps" + (speedMult !== 1 ? " × " + speedMult : ""))
            : (Math.round(effFps * 10) / 10 + " fps effectif, " + fps + " fps demandé — séquence longue, plafond d'images atteint");
          flash("GIF exporté ✓ (" + frames.length + " images, " + EW + "×" + EH + ", " + fpsNote + ")", true);
        } catch (e) { flash("Échec de l'encodage GIF : " + e.message, false); }
        selEntity = sE; selZone = sZ; selAnno = sA; selLine = sL; selText = sT; selPulse = sP; multiSel = sM; render();
      }, 40);
    }
  }

  // ---- export video MP4 (vrai .mp4, via ffmpeg.wasm charge a la demande depuis un CDN) ----
  var ffmpegInstance = null, ffmpegLoading = null;
  function ensureFFmpeg() {
    if (ffmpegInstance) return Promise.resolve(ffmpegInstance);
    if (ffmpegLoading) return ffmpegLoading;
    if (!window.FFmpegWASM || !window.FFmpegUtil) return Promise.reject(new Error("Encodeur MP4 indisponible (pas de connexion internet ?)"));
    ffmpegLoading = (function () {
      // Coeur en version ESM (pas UMD) : le worker interne de @ffmpeg/ffmpeg le
      // charge via import() dynamique et attend un "export default" — seul le
      // build ESM le fournit, le build UMD laisse createFFmpegCore a undefined.
      var CORE = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
      var FF = "https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd";
      var ffmpeg = new window.FFmpegWASM.FFmpeg();
      // Le worker interne de @ffmpeg/ffmpeg est charge par defaut depuis une URL
      // cross-origin (unpkg) — les navigateurs interdisent un Worker classique
      // cross-origin. On le recupere nous-memes en blob: (comme le coeur wasm
      // ci-dessous) puis on le passe via classWorkerURL pour rester same-origin.
      return Promise.all([
        window.FFmpegUtil.toBlobURL(CORE + "/ffmpeg-core.js", "text/javascript"),
        window.FFmpegUtil.toBlobURL(CORE + "/ffmpeg-core.wasm", "application/wasm"),
        window.FFmpegUtil.toBlobURL(FF + "/814.ffmpeg.js", "text/javascript")
      ]).then(function (urls) {
        return ffmpeg.load({ coreURL: urls[0], wasmURL: urls[1], classWorkerURL: urls[2] });
      }).then(function () { ffmpegInstance = ffmpeg; return ffmpeg; });
    })();
    return ffmpegLoading;
  }
  // Largeur cible ~1920px (le viewBox de base fait toujours 700 de large quelle
  // que soit la longueur du terrain, cf geo() dans render-core.js) : la scene est
  // vectorielle donc ce facteur d'echelle ne coute rien en nettete, seulement en
  // temps d'encodage.
  var MP4_SCALE = 2.75;
  var mp4ExportSeq = 0;
  function exportMP4() {
    // Mode "toutes les variantes" : concatene les variantes dans une seule video,
    // dans l'ordre de leurs onglets, chacune jouant sa propre sequence de bout en
    // bout (pas de fondu ni d'interpolation entre variantes, coupe directe).
    var allVariants = !!(document.getElementById("mp4AllVariants") && document.getElementById("mp4AllVariants").checked && drill.variants && drill.variants.length > 1);
    var originalKeyframes = drill.keyframes, originalTimeline = drill.timeline;
    var segSrc = allVariants ? drill.variants.map(function (v) { return v.keyframes; }) : [drill.keyframes];
    // Timeline canonique par variante (SPEC_TIMELINE_AVANCEE) : chaque variante
    // porte la sienne (comme keyframes) — construite si jamais visitee (donc
    // jamais migree) depuis sa propre sequence, sans toucher aux autres.
    var segTl = allVariants ? drill.variants.map(function (v) { if (!v.timeline) v.timeline = R.buildEntityTimeline({ keyframes: v.keyframes }); return v.timeline; }) : [drill.timeline];
    var totals = segSrc.map(function (kfs) {
      if (!kfs || kfs.length < 2) return 0;
      var t = 0; for (var i = 0; i < kfs.length - 1; i++) t += kfs[i].durationMs || 1500;
      return t;
    });
    var validIdx = []; for (var vi = 0; vi < segSrc.length; vi++) if (totals[vi] > 0) validIdx.push(vi);
    if (!validIdx.length) { flash("Ajoute une 2e étape pour une vidéo animée (sinon utilise PNG)", false); return; }
    stopPlay(); syncCast();
    var sE = selEntity, sZ = selZone, sA = selAnno, sL = selLine, sT = selText, sP = selPulse, sM = multiSel; multiSel = [];
    selEntity = null; selZone = null; selAnno = null; selLine = null; selText = null; selPulse = null; multiSel = [];
    var fps = parseInt(document.getElementById("gifFps").value, 10) || 12;
    var grandTotal = validIdx.reduce(function (s, i) { return s + totals[i]; }, 0);
    var budget = Math.max(2 * validIdx.length, Math.min(MAX_EXPORT_FRAMES, Math.round(grandTotal / 1000 * fps)));
    // Repartit le budget d'images entre variantes au prorata de leur duree (2 mini
    // chacune), puis absorbe l'arrondi sur la derniere pour retomber pile sur le budget.
    var fcs = validIdx.map(function (i) { return Math.max(2, Math.round(budget * totals[i] / grandTotal)); });
    var allocated = fcs.reduce(function (a, b) { return a + b; }, 0);
    fcs[fcs.length - 1] = Math.max(2, fcs[fcs.length - 1] + (budget - allocated));
    var frames = [];
    validIdx.forEach(function (i, k) {
      var kfs = segSrc[i], tl = segTl[i], totalV = totals[i], fc = fcs[k];
      for (var fi = 0; fi < fc; fi++) frames.push({ kf: kfs, tl: tl, t: totalV * fi / (fc - 1) });
    });
    var frameCount = frames.length;
    // Framerate d'encodage cale sur la duree reelle plutot que sur le fps nominal :
    // sinon, quand le plafond d'images tronque le compte necessaire (sequence
    // longue et/ou fps eleve), la video déclarée à `fps` joue ses images bien plus
    // vite que prevu et dure beaucoup moins longtemps que la sequence editee.
    // Vitesse : cf meme principe que exportGIF (rejoue les memes images
    // capturees plus vite/lentement, applique apres le calcul base sur la
    // duree reelle, jamais avant).
    var speedMult = exportSpeedMult();
    var effFps = (frameCount / (grandTotal / 1000)) * speedMult;
    var g = geo();
    var EW = Math.round(g.W * exportScale(MP4_SCALE)), EH = Math.round(g.H * exportScale(MP4_SCALE));
    if (EW % 2) EW++; if (EH % 2) EH++; // h264/yuv420p exige des dimensions paires
    function restore() { drill.keyframes = originalKeyframes; drill.timeline = originalTimeline; selEntity = sE; selZone = sZ; selAnno = sA; selLine = sL; selText = sT; selPulse = sP; multiSel = sM; render(); }
    var written = [];
    // Prefixe unique par export : le nettoyage en fin d'export precedent n'est
    // qu'une bonne pratique, pas une garantie de timing — sans prefixe, un
    // deleteFile encore en vol au moment ou un nouvel export ecrit le meme nom de
    // fichier peut corrompre l'etat du systeme de fichiers virtuel de ffmpeg
    // (observe : "Maximum call stack size exceeded" au 2e export d'affilee).
    var runPrefix = "e" + (mp4ExportSeq++) + "-";
    // Chaque image est ecrite en PNG (compresse) directement sur le systeme de
    // fichiers virtuel de ffmpeg au fur et a mesure — pas de gros buffer RGBA brut
    // accumule cote JS. A haute resolution et sur une longue sequence, un buffer
    // brut unique (ancienne approche) representerait plusieurs Go ; des PNG d'un
    // dessin vectoriel plat (terrain, joueurs, traits) pesent eux quelques dizaines
    // de Ko chacun, ce qui rend HD + longue duree tenable en memoire navigateur.
    flash("Chargement de l'encodeur MP4 (premier export seulement)…", true);
    ensureFFmpeg().then(function (ffmpeg) {
      flash("Génération de la vidéo… 0/" + frameCount, true);
      return new Promise(function (resolve, reject) {
        // setTimeout(...,0) force chaque image a repartir sur une pile d'appel
        // vide : sans ca, si le navigateur resout toBlob/arrayBuffer/writeFile de
        // facon synchrone ou quasi (cache d'image chaud, execution suivante plus
        // rapide), les callbacks imbriques s'empilent d'image en image jusqu'a
        // "Maximum call stack size exceeded" — reproduit sur un 2e export d'affilee
        // avec le meme contenu (cache navigateur plus chaud que le tout premier).
        function next(fi) { setTimeout(function () { loop(fi); }, 0); }
        function loop(fi) {
          if (fi >= frameCount) { resolve(); return; }
          drill.keyframes = frames[fi].kf; drill.timeline = frames[fi].tl;
          renderAnimated(pAtReal(frames[fi].t));
          rasterize(EW, EH, function (imgData, cv) {
            if (!cv) { next(fi + 1); return; }
            cv.toBlob(function (blob) {
              if (!blob) { next(fi + 1); return; }
              blob.arrayBuffer().then(function (buf) {
                var name = runPrefix + String(fi).padStart(5, "0") + ".png";
                ffmpeg.writeFile(name, new Uint8Array(buf)).then(function () {
                  written.push(name);
                  if (fi % 4 === 0 || fi === frameCount - 1) flash("Génération de la vidéo… " + (fi + 1) + "/" + frameCount, true);
                  next(fi + 1);
                }).catch(reject);
              });
            }, "image/png");
          });
        }
        loop(0);
      }).then(function () {
        flash("Encodage MP4…", true);
        var outName = runPrefix + "out.mp4";
        return ffmpeg.exec(["-framerate", String(effFps), "-i", runPrefix + "%05d.png", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-movflags", "+faststart", outName])
          .then(function () { return ffmpeg.readFile(outName); })
          .then(function (data) {
            var multi = validIdx.length > 1;
            downloadBlob(new Blob([data.buffer], { type: "video/mp4" }), fileBase() + (multi ? "-toutes-variantes" : "") + ".mp4");
            var expectedFps = fps * speedMult;
            var fpsNote = Math.round(effFps) === Math.round(expectedFps)
              ? (fps + " fps" + (speedMult !== 1 ? " × " + speedMult : ""))
              : (Math.round(effFps * 10) / 10 + " fps effectif, " + fps + " fps demandé — séquence longue, plafond d'images atteint");
            var variantNote = multi ? (" — " + validIdx.length + " variantes" + (validIdx.length < segSrc.length ? " (" + (segSrc.length - validIdx.length) + " ignorée(s), 1 seule étape)" : "")) : "";
            flash("Vidéo MP4 exportée ✓ (" + frameCount + " images " + EW + "×" + EH + ", " + fpsNote + variantNote + ")", true);
            written.push(outName);
          });
      })
        .catch(function (e) {
          flash("Échec de l'export MP4 : " + (e && e.message ? e.message : e), false);
        })
        .then(function () {
          // Nettoie le systeme de fichiers virtuel (attend la fin reelle du nettoyage,
          // pas un fire-and-forget) : l'instance ffmpeg est reutilisee d'un export a
          // l'autre dans la session, sans ca les images s'accumuleraient.
          return Promise.all(written.map(function (name) { return ffmpeg.deleteFile(name).catch(function () {}); }));
        })
        .then(restore);
    }).catch(function (e) {
      flash("Échec de l'export MP4 : " + (e && e.message ? e.message : e), false);
      restore();
    });
  }

  // ---- wire up ----
  svg.addEventListener("contextmenu", onPitchContextMenu);
  document.getElementById("undoBtn").addEventListener("click", undo);
  document.getElementById("redoBtn").addEventListener("click", redo);
  document.getElementById("resetBtn").addEventListener("click", resetCanvas);
  document.getElementById("pitchFlip").addEventListener("click", flipPitch);
  document.getElementById("rosterAddBtn").addEventListener("click", function () {
    addRosterPlayer(document.getElementById("rosterNum").value, document.getElementById("rosterRole").value);
    document.getElementById("rosterNum").value = ""; document.getElementById("rosterRole").value = "";
    document.getElementById("rosterNum").focus();
  });
  document.getElementById("rosterNum").addEventListener("keydown", function (e) { if (e.key === "Enter") document.getElementById("rosterAddBtn").click(); });
  document.getElementById("rosterRole").addEventListener("keydown", function (e) { if (e.key === "Enter") document.getElementById("rosterAddBtn").click(); });
  document.getElementById("pngBtn").addEventListener("click", exportPNG);
  document.getElementById("gifBtn").addEventListener("click", exportGIF);
  document.getElementById("mp4Btn").addEventListener("click", exportMP4);
  document.getElementById("addVariant").addEventListener("click", addVariant);
  document.getElementById("addStep").addEventListener("click", addStep);
  document.getElementById("dupStepEnd").addEventListener("click", duplicateStepToEnd);
  document.getElementById("delStep").addEventListener("click", delStep);
  document.getElementById("playBtn").addEventListener("click", play);
  document.getElementById("scrub").addEventListener("input", onScrub);
  document.getElementById("playSpeed").addEventListener("change", function (e) { playSpeed = parseFloat(e.target.value) || 1; });
  document.getElementById("stepDur").addEventListener("input", function (e) {
    var s = parseFloat(e.target.value);
    if (!(s > 0)) return;
    setStepDuration(curKf, Math.round(s * 1000)); // invalidateEntsCache deja fait en interne
    render(); renderAdvancedTimeline(); syncJSON();
  });
  document.querySelectorAll("[data-add]").forEach(function (b) {
    // Les objets du flyout "Matériel" arment l'outil puis referment le menu :
    // le marqueur d'outil armé va sur le bouton du rail, sinon il resterait
    // caché dans un panneau fermé et on ne saurait plus ce qui est armé.
    var inEquip = !!b.closest("#equipFlyout");
    b.addEventListener("click", function () {
      armEntity(b.getAttribute("data-add"), inEquip ? document.getElementById("equipToggle") : b);
      if (inEquip) closeFlyouts();
    });
  });
  document.getElementById("selectToolBtn").addEventListener("click", disarm);
  setArmed(document.getElementById("selectToolBtn"));

  // ---- panneau flottant (inspecteur) : deplacable par sa poignee ----
  (function () {
    var col = document.getElementById("inspectorCol");
    var handle = document.getElementById("inspectorDragHandle");
    var canvasCard = document.querySelector(".canvas-card");
    if (!col || !handle || !canvasCard) return;
    var startX = 0, startY = 0, startLeft = 0, startTop = 0;
    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
    function onMove(ev) {
      var dx = ev.clientX - startX, dy = ev.clientY - startY;
      var maxLeft = Math.max(4, canvasCard.clientWidth - col.offsetWidth - 4);
      var maxTop = Math.max(4, canvasCard.clientHeight - col.offsetHeight - 4);
      col.style.left = clamp(startLeft + dx, 4, maxLeft) + "px";
      col.style.top = clamp(startTop + dy, 4, maxTop) + "px";
    }
    function onUp() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      handle.classList.remove("dragging");
      try { localStorage.setItem("inspectorColPos", JSON.stringify({ left: parseFloat(col.style.left), top: parseFloat(col.style.top) })); } catch (e) {}
    }
    handle.addEventListener("pointerdown", function (ev) {
      ev.preventDefault();
      var rect = col.getBoundingClientRect(), parentRect = canvasCard.getBoundingClientRect();
      startLeft = rect.left - parentRect.left; startTop = rect.top - parentRect.top;
      startX = ev.clientX; startY = ev.clientY;
      handle.classList.add("dragging");
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    });
    try {
      var saved = JSON.parse(localStorage.getItem("inspectorColPos") || "null");
      if (saved && typeof saved.left === "number" && typeof saved.top === "number") {
        var maxL = Math.max(4, canvasCard.clientWidth - col.offsetWidth - 4);
        var maxT = Math.max(4, canvasCard.clientHeight - col.offsetHeight - 4);
        col.style.left = clamp(saved.left, 4, maxL) + "px";
        col.style.top = clamp(saved.top, 4, maxT) + "px";
      }
    } catch (e) {}
  })();
  document.getElementById("clearZones").addEventListener("click", function () { pushHistory(); drill.zones = []; selZone = null; hideInspectors(); render(); syncJSON(); closeFlyouts(); });
  document.getElementById("drawRect").addEventListener("click", function () { armZone(document.getElementById("drawKind").value, "rect", this); closeFlyouts(); });
  document.getElementById("drawEllipse").addEventListener("click", function () { armZone(document.getElementById("drawKind").value, "ellipse", this); closeFlyouts(); });
  document.getElementById("drawPoly").addEventListener("click", function () { armPolygon(document.getElementById("drawKind").value, this); closeFlyouts(); });
  // ---- sous-menu (flyout) du rail d'icônes ----
  function closeFlyouts() { document.querySelectorAll(".flyout").forEach(function (f) { f.classList.add("hidden"); }); }
  function wireFlyoutToggle(toggleId, flyoutId) {
    document.getElementById(toggleId).addEventListener("click", function (e) {
      e.stopPropagation();
      var open = !document.getElementById(flyoutId).classList.contains("hidden");
      closeFlyouts();
      if (!open) document.getElementById(flyoutId).classList.remove("hidden");
    });
    document.getElementById(flyoutId).addEventListener("click", function (e) { e.stopPropagation(); });
  }
  wireFlyoutToggle("zonesToggle", "zonesFlyout");
  wireFlyoutToggle("pitchToggle", "pitchFlyout");
  wireFlyoutToggle("teamsToggle", "teamsFlyout");
  wireFlyoutToggle("equipToggle", "equipFlyout");
  wireFlyoutToggle("rosterToggle", "rosterFlyout");
  wireFlyoutToggle("exportSettingsToggle", "exportSettingsFlyout");
  document.addEventListener("click", closeFlyouts);
  document.querySelectorAll("[data-addlist]").forEach(function (b) { b.addEventListener("click", function () { var k = b.getAttribute("data-addlist"); listArray(k).push(""); renderList(k, k === "varPlus" ? "varPlusList" : k === "varMinus" ? "varMinusList" : k + "List"); syncJSON(); }); });
  document.querySelector("[data-addmeca]").addEventListener("click", function () { drill.rules.mecanismes.push({ regle: "", induit: "" }); renderMeca(); syncJSON(); });
  document.getElementById("leverFilters").addEventListener("click", function (e) {
    if (e.target.tagName !== "BUTTON") return;
    this.querySelectorAll("button").forEach(function (b) { b.classList.remove("on"); });
    e.target.classList.add("on"); renderLevers(e.target.getAttribute("data-ph"));
  });
  document.getElementById("selLabel").addEventListener("input", function (e) { if (selEntity) { selEntity.label = e.target.value; render(); syncJSON(); } });
  document.getElementById("selRole").addEventListener("input", function (e) { if (selEntity) { selEntity.role = e.target.value; syncJSON(); } });
  document.getElementById("selColor").addEventListener("input", function (e) { if (selEntity) { selEntity.color = e.target.value; render(); syncJSON(); } });
  document.getElementById("selColorReset").addEventListener("click", function () { if (selEntity) { delete selEntity.color; selectEntity(selEntity); render(); syncJSON(); } });
  document.getElementById("selSize").addEventListener("input", function (e) {
    if (!selEntity) return;
    var v = parseFloat(e.target.value) || 1; selEntity.size = v;
    document.getElementById("selSizeVal").textContent = v.toFixed(1) + "×";
    render(); syncJSON();
  });
  document.getElementById("selShape").addEventListener("change", function (e) { if (selEntity) { selEntity.shape = e.target.value; render(); syncJSON(); } });
  document.getElementById("selCurve").addEventListener("click", function () {
    if (!selEntity) return;
    selEntity.curve = !selEntity.curve;
    this.setAttribute("aria-pressed", selEntity.curve ? "true" : "false"); this.classList.toggle("primary", !!selEntity.curve);
    render(); syncJSON();
  });
  document.getElementById("selArrowWidth").addEventListener("input", function (e) {
    if (!selEntity) return;
    var v = parseFloat(e.target.value);
    selEntity.arrowWidth = v;
    document.getElementById("selArrowWidthVal").textContent = v.toFixed(1);
    render(); syncJSON();
  });
  document.getElementById("selAerial").addEventListener("click", function () {
    if (!selEntity) return;
    selEntity.aerial = !selEntity.aerial;
    this.setAttribute("aria-pressed", selEntity.aerial ? "true" : "false"); this.classList.toggle("primary", !!selEntity.aerial);
    render(); syncJSON();
  });
  document.getElementById("delEntity").addEventListener("click", deleteSelected);
  document.getElementById("ballCarrier").addEventListener("change", function (e) { if (selEntity && selEntity.type === "ball") { if (e.target.value) selEntity.attachedTo = e.target.value; else delete selEntity.attachedTo; render(); syncJSON(); } });
  document.getElementById("zoneLabel").addEventListener("input", function (e) { if (selZone) { selZone.label = e.target.value; render(); syncJSON(); } });
  document.getElementById("zoneKind").addEventListener("change", function (e) { if (selZone) { selZone.kind = e.target.value; render(); syncJSON(); } });
  document.getElementById("zoneColor").addEventListener("input", function (e) { if (selZone) { selZone.color = e.target.value; render(); syncJSON(); } });
  document.getElementById("zoneColorReset").addEventListener("click", function () { if (selZone) { delete selZone.color; render(); syncJSON(); } });
  document.getElementById("zoneStroke").addEventListener("change", function (e) {
    if (!selZone) return;
    // "dash" est le defaut historique : on efface le champ plutot que de
    // l'ecrire, pour qu'une zone non stylisee garde son JSON d'avant.
    if (e.target.value === "solid") selZone.stroke = "solid"; else delete selZone.stroke;
    render(); syncJSON();
  });
  document.getElementById("zoneStrokeWidth").addEventListener("input", function (e) {
    if (!selZone) return;
    var v = parseFloat(e.target.value);
    document.getElementById("zoneStrokeWidthVal").textContent = v.toFixed(1);
    if (v === 1.5) delete selZone.strokeWidth; else selZone.strokeWidth = v;
    render(); syncJSON();
  });
  document.getElementById("zoneFill").addEventListener("change", function (e) {
    if (!selZone) return;
    if (e.target.value === "solid") delete selZone.fill; else selZone.fill = e.target.value;
    // L'opacite par defaut differe entre plein et hachure : on repart du defaut
    // du nouveau mode au lieu de traîner celle de l'ancien.
    delete selZone.fillOpacity;
    fillZoneStyle(selZone); render(); syncJSON();
  });
  document.getElementById("zoneFillOpacity").addEventListener("input", function (e) {
    if (!selZone) return;
    var v = parseFloat(e.target.value);
    document.getElementById("zoneFillOpacityVal").textContent = v.toFixed(2);
    selZone.fillOpacity = v;
    render(); syncJSON();
  });
  document.getElementById("delZone").addEventListener("click", deleteSelected);
  document.querySelectorAll("[data-arrow]").forEach(function (b) { b.addEventListener("click", function () { armArrow(b.getAttribute("data-arrow"), b); }); });
  document.getElementById("arrowType").addEventListener("change", function (e) { if (selAnno) { selAnno.type = e.target.value; render(); syncJSON(); } });
  document.getElementById("arrowLabel").addEventListener("input", function (e) { if (selAnno) { selAnno.label = e.target.value; render(); syncJSON(); } });
  document.getElementById("arrowWidth").addEventListener("input", function (e) {
    if (!selAnno) return;
    var v = parseFloat(e.target.value);
    selAnno.width = v;
    document.getElementById("arrowWidthVal").textContent = v.toFixed(1);
    render(); syncJSON();
  });
  document.getElementById("delArrow").addEventListener("click", deleteSelected);
  document.getElementById("lineToggle").addEventListener("click", function () { armLine(this); });
  document.getElementById("lineColor").addEventListener("input", function (e) { if (selLine) { selLine.color = e.target.value; render(); syncJSON(); } });
  document.getElementById("lineWidth").addEventListener("input", function (e) {
    if (!selLine) return;
    var v = parseFloat(e.target.value);
    selLine.width = v;
    document.getElementById("lineWidthVal").textContent = v.toFixed(1);
    render(); syncJSON();
  });
  document.getElementById("lineDash").addEventListener("change", function (e) { if (selLine) { selLine.dash = e.target.checked; render(); syncJSON(); } });
  document.getElementById("lineAerial").addEventListener("change", function (e) { if (selLine) { selLine.aerial = e.target.checked; render(); syncJSON(); } });
  document.getElementById("lineHead").addEventListener("change", function (e) { if (selLine) { selLine.head = e.target.value; render(); syncJSON(); } });
  document.getElementById("delLine").addEventListener("click", deleteSelected);
  document.getElementById("textToggle").addEventListener("click", function () { armText(this); });
  document.getElementById("textContent").addEventListener("input", function (e) { if (selText) { selText.text = e.target.value; render(); syncJSON(); } });
  document.getElementById("textColor").addEventListener("input", function (e) { if (selText) { selText.color = e.target.value; render(); syncJSON(); } });
  document.getElementById("textSize").addEventListener("input", function (e) {
    if (!selText) return;
    var v = parseInt(e.target.value, 10) || 13; selText.size = v;
    document.getElementById("textSizeVal").textContent = v + "px";
    render(); syncJSON();
  });
  document.getElementById("textOutline").addEventListener("change", function (e) { if (selText) { selText.outline = e.target.checked; render(); syncJSON(); } });
  [["textAlignLeft", "left"], ["textAlignCenter", "center"], ["textAlignRight", "right"]].forEach(function (pair) {
    document.getElementById(pair[0]).addEventListener("click", function () {
      if (!selText) return;
      selText.align = pair[1];
      updateTextAlignButtons(pair[1]);
      render(); syncJSON();
    });
  });
  document.getElementById("textBold").addEventListener("click", function () {
    if (!selText) return;
    selText.bold = selText.bold === false;
    updateTextBoldButton(selText.bold);
    render(); syncJSON();
  });
  document.getElementById("delText").addEventListener("click", deleteSelected);
  document.getElementById("pulseToggle").addEventListener("click", function () { armPulse(this); });
  document.getElementById("pulseColor").addEventListener("input", function (e) { if (selPulse) { selPulse.color = e.target.value; render(); syncJSON(); } });
  document.getElementById("pulseSize").addEventListener("input", function (e) {
    if (!selPulse) return;
    var v = parseFloat(e.target.value) || 1; selPulse.size = v;
    document.getElementById("pulseSizeVal").textContent = v.toFixed(1) + "×";
    render(); syncJSON();
  });
  document.getElementById("delPulse").addEventListener("click", deleteSelected);
  document.getElementById("delMulti").addEventListener("click", deleteMultiSelected);
  ["pitchLen", "pitchWid"].forEach(function (id) { document.getElementById(id).addEventListener("input", function () { drill.pitch.length = parseInt(document.getElementById("pitchLen").value, 10) || 34; drill.pitch.width = parseInt(document.getElementById("pitchWid").value, 10) || 20; render(); syncJSON(); }); });
  document.getElementById("pitchMark").addEventListener("change", function (e) { drill.pitch.markings = e.target.value; render(); syncJSON(); });
  document.getElementById("pitchColor").addEventListener("input", function (e) { drill.pitch.color = e.target.value; render(); syncJSON(); });
  document.getElementById("pitchColorReset").addEventListener("click", function () { delete drill.pitch.color; document.getElementById("pitchColor").value = "#2f8f4e"; render(); syncJSON(); });
  var PITCH_GREEN = "#2f8f4e";
  document.getElementById("pitchSurface").addEventListener("change", function (e) {
    var was = drill.pitch.surface || "flat";
    drill.pitch.surface = e.target.value;
    // La couleur pilote desormais le parquet comme le reste. Passer du vert de
    // terrain a un parquet vert n'a aucun sens : on sème la teinte bois par
    // defaut, et symetriquement au retour. Une couleur choisie a la main (ni
    // l'un ni l'autre des defauts) n'est jamais ecrasee.
    var cur = drill.pitch.color;
    if (e.target.value === "wood" && (!cur || cur === PITCH_GREEN)) drill.pitch.color = R.WOOD_DEFAULT;
    else if (was === "wood" && e.target.value !== "wood" && cur === R.WOOD_DEFAULT) delete drill.pitch.color;
    document.getElementById("pitchColor").value = drill.pitch.color || PITCH_GREEN;
    // Meme regle pour les lignes : le blanc par defaut disparait sur un parquet
    // clair, c'est d'ailleurs pour ca que les vraies salles les tracent en
    // sombre. Une couleur de ligne choisie a la main n'est jamais touchee.
    var curLine = drill.pitch.lineColor;
    if (e.target.value === "wood" && !curLine) drill.pitch.lineColor = R.WOOD_LINE_DEFAULT;
    else if (was === "wood" && e.target.value !== "wood" && curLine === R.WOOD_LINE_DEFAULT) delete drill.pitch.lineColor;
    document.getElementById("pitchLineColor").value = drill.pitch.lineColor || "#eafff0";
    render(); syncJSON();
  });
  document.getElementById("pitchOuterColor").addEventListener("input", function (e) { drill.pitch.outerColor = e.target.value; render(); syncJSON(); });
  document.getElementById("pitchOuterColorReset").addEventListener("click", function () { delete drill.pitch.outerColor; document.getElementById("pitchOuterColor").value = "#171a15"; render(); syncJSON(); });
  document.getElementById("pitchLineColor").addEventListener("input", function (e) { drill.pitch.lineColor = e.target.value; render(); syncJSON(); });
  document.getElementById("pitchGoalAreaColor").addEventListener("input", function (e) { drill.pitch.goalAreaColor = e.target.value; render(); syncJSON(); });
  document.getElementById("pitchGoalAreaOpacity").addEventListener("input", function (e) { drill.pitch.goalAreaOpacity = parseFloat(e.target.value); render(); syncJSON(); });
  // Retour au defaut : la surface reprend la couleur des lignes, comme avant
  // que ce reglage existe — on supprime les cles plutot que d'y ecrire une
  // valeur, pour que le JSON reste identique a celui d'un procede jamais touche.
  document.getElementById("pitchGoalAreaReset").addEventListener("click", function () {
    delete drill.pitch.goalAreaColor; delete drill.pitch.goalAreaOpacity;
    document.getElementById("pitchGoalAreaColor").value = drill.pitch.lineColor || "#eafff0";
    document.getElementById("pitchGoalAreaOpacity").value = 0.16;
    render(); syncJSON();
  });
  document.getElementById("pitchLineColorReset").addEventListener("click", function () { delete drill.pitch.lineColor; document.getElementById("pitchLineColor").value = "#eafff0"; render(); syncJSON(); });
  document.getElementById("pitchLogoFile").addEventListener("change", function (e) {
    var file = e.target.files[0]; if (!file) return;
    var reader = new FileReader();
    reader.onload = function () { drill.pitch.centerLogo = reader.result; render(); syncJSON(); flash("Logo appliqué au rond central ✓", true); };
    reader.readAsDataURL(file);
  });
  document.getElementById("pitchLogoClear").addEventListener("click", function () {
    delete drill.pitch.centerLogo; document.getElementById("pitchLogoFile").value = ""; render(); syncJSON();
  });
  document.getElementById("pitchImageFile").addEventListener("change", function (e) {
    var file = e.target.files[0]; if (!file) return;
    var reader = new FileReader();
    reader.onload = function () { drill.pitch.image = reader.result; render(); syncJSON(); flash("Image de fond appliquée ✓", true); };
    reader.readAsDataURL(file);
  });
  document.getElementById("pitchImageClear").addEventListener("click", function () {
    delete drill.pitch.image; delete drill.pitch.imageScale; delete drill.pitch.imageOffsetX; delete drill.pitch.imageOffsetY;
    document.getElementById("pitchImageFile").value = "";
    document.getElementById("pitchImgScale").value = 1; document.getElementById("pitchImgScaleVal").textContent = "1.00×";
    document.getElementById("pitchImgOffX").value = 0; document.getElementById("pitchImgOffY").value = 0;
    render(); syncJSON();
  });
  document.getElementById("pitchPattern").addEventListener("change", function (e) { drill.pitch.pattern = e.target.value; render(); syncJSON(); });
  document.getElementById("pitchView").addEventListener("change", function (e) { drill.pitch.view = e.target.value; selEntity = null; selZone = null; selAnno = null; selLine = null; selText = null; selPulse = null; multiSel = []; hideInspectors(); render(); syncJSON(); });
  document.getElementById("pitchImgScale").addEventListener("input", function (e) {
    var v = parseFloat(e.target.value) || 1; drill.pitch.imageScale = v;
    document.getElementById("pitchImgScaleVal").textContent = v.toFixed(2) + "×";
    render(); syncJSON();
  });
  document.getElementById("pitchImgOffX").addEventListener("input", function (e) { drill.pitch.imageOffsetX = parseFloat(e.target.value) || 0; render(); syncJSON(); });
  document.getElementById("pitchImgOffY").addEventListener("input", function (e) { drill.pitch.imageOffsetY = parseFloat(e.target.value) || 0; render(); syncJSON(); });
  document.getElementById("pitchImgReset").addEventListener("click", function () {
    delete drill.pitch.imageScale; delete drill.pitch.imageOffsetX; delete drill.pitch.imageOffsetY;
    document.getElementById("pitchImgScale").value = 1; document.getElementById("pitchImgScaleVal").textContent = "1.00×";
    document.getElementById("pitchImgOffX").value = 0; document.getElementById("pitchImgOffY").value = 0;
    render(); syncJSON();
  });
  document.getElementById("exportBtn").addEventListener("click", exportJSON);
  document.getElementById("copyBtn").addEventListener("click", function () { syncJSON(); navigator.clipboard.writeText(document.getElementById("json").value).then(function () { flash("Copié ✓", true); }, function () { flash("Copie impossible (utilise l'export)", false); }); });
  document.getElementById("importBtn").addEventListener("click", importJSON);
  document.getElementById("loadExample").addEventListener("click", loadExample);
  document.getElementById("saveLibBtn").addEventListener("click", saveToLibrary);
  document.getElementById("saveAsLibBtn").addEventListener("click", saveAsToLibrary);
  document.getElementById("libOpenBtn").addEventListener("click", openLibrary);
  document.getElementById("libCloseBtn").addEventListener("click", closeLibrary);
  document.getElementById("libSearch").addEventListener("input", function (e) {
    libQuery = (e.target.value || "").trim().toLowerCase(); renderLibraryGrid();
  });
  document.getElementById("libFolderAdd").addEventListener("click", function () {
    var name = window.prompt("Nom du nouveau dossier");
    if (!name || !name.trim()) return;
    var id = DrillStore.createFolder(name);
    if (id) libFolder = id;
    renderFolderList(); renderLibraryGrid();
  });
  document.getElementById("libFilters").addEventListener("click", function (e) {
    var btn = e.target.closest(".lib-chip"); if (!btn) return;
    libCat = btn.getAttribute("data-cat") || "";
    Array.prototype.forEach.call(this.querySelectorAll(".lib-chip"), function (b) { b.classList.toggle("active", b === btn); });
    renderLibraryGrid();
  });

  seedTeamsFromPreset(); wireTeamsPanel(); fillTeamsPanel();
  bindMeta(); ensureAnnotations(); ensureTimeline(); ensureOverlays(); fillMeta(); refreshAllLists(); renderLevers("all"); renderVariants(); renderSteps(); render(); syncJSON();
  loadRoster(); renderRoster(); updateHistoryBtns();

  // Handshake assembleur -> editeur : ?drill=<id> ouvre un procede de la bibliotheque.
  (function initFromURL() {
    try {
      var id = new URLSearchParams(location.search).get("drill");
      if (id && window.DrillStore) {
        var rec = DrillStore.getDrill(id);
        if (rec && rec.drill) { applyDrill(rec.drill); currentDrillId = id; flash("Procédé ouvert depuis la bibliothèque", true); }
      }
    } catch (e) { /* pas de handshake */ }
  })();

  // Pont postMessage avec la webapp (iframe de app/webapp/library/schematics,
  // cf PLAN_INTEGRATION_EDITEUR_TACTIQUE_PHASE0_2026-09.md). Verification
  // d'origine stricte : meme origine que la page (outil servi en statique par
  // Next.js sous /tools/tactics/, meme domaine que la webapp).
  //   -> INIT  { teamId, drillId, drill|null, roster, teamColors }
  //   -> SAVED { drillId }              (confirme une sauvegarde, donne l'id definitif)
  //   -> SAVE_ERROR { message }
  //   <- SAVE  { drillId|null, drill }  (null = nouvelle entree)
  //   <- CLOSE {}
  (function initEmbedded() {
    if (!embedded) return;
    window.addEventListener("message", function (ev) {
      if (ev.origin !== window.location.origin || !ev.data) return;
      var msg = ev.data;
      if (msg.type === "INIT") {
        embeddedTeamId = msg.teamId || null;
        embeddedDrillId = msg.drillId || null;
        if (msg.drill) { applyDrill(msg.drill); currentDrillId = embeddedDrillId; }
        if (msg.teamColors && !drill.teams) drill.teams = JSON.parse(JSON.stringify(msg.teamColors));
        if (Array.isArray(msg.roster)) { roster = msg.roster; renderRoster(); }
        fillTeamsPanel(); render(); syncJSON(); refreshLibrary();
      } else if (msg.type === "SAVED") {
        embeddedDrillId = msg.drillId || embeddedDrillId;
        currentDrillId = embeddedDrillId;
        refreshLibrary();
        flash("Enregistré ✓", true);
      } else if (msg.type === "SAVE_ERROR") {
        flash("Échec de l'enregistrement" + (msg.message ? " : " + msg.message : ""), false);
      }
    });
    document.body.classList.add("embedded");
    var closeBtn = document.getElementById("embeddedCloseBtn");
    if (closeBtn) closeBtn.addEventListener("click", function () {
      window.parent.postMessage({ type: "CLOSE" }, window.location.origin);
    });
    window.parent.postMessage({ type: "READY" }, window.location.origin);
  })();

  // ---- panneau calques ----
  // L'empilement reel est decide par render-core (drill.zOrder, defauts par
  // categorie). Ce panneau se contente de lire cet ordre et de le reecrire :
  // aucune regle d'empilement n'est dupliquee ici.
  function layerItems() {
    var items = [];
    (drill.zones || []).forEach(function (z, i) {
      items.push({ id: z.id, kind: "zone", type: "Zone", label: z.label || z.kind || z.id, color: z.color || "#8b9086", ref: z, select: selectZone, index: i });
    });
    (drill.lines || []).forEach(function (ln, i) {
      items.push({ id: ln.id, kind: "line", type: "Trait", label: ln.label || "Trait", color: ln.color || "#ffffff", ref: ln, select: selectLine, index: i });
    });
    (drill.texts || []).forEach(function (tx, i) {
      items.push({ id: tx.id, kind: "text", type: "Texte", label: (tx.text || "Texte").slice(0, 18), color: tx.color || "#ffffff", ref: tx, select: selectText, index: i });
    });
    (drill.keyframes[curKf] ? drill.keyframes[curKf].entities : []).forEach(function (e, i) {
      items.push({ id: e.id, kind: "entity", type: entityTlLabel(e), label: e.label || e.id, color: entityTlColor(e), ref: e, select: selectEntity, index: i });
    });
    (drill.pulses || []).forEach(function (pu, i) {
      items.push({ id: pu.id, kind: "pulse", type: "Pulse", label: pu.label || "Pulse", color: pu.color || "#ff3b30", ref: pu, select: selectPulse, index: i });
    });
    items.forEach(function (it) { it.z = R.zOf(drill, it.kind, it.id, it.index); });
    // Le panneau se lit comme une pile vue de face : le dessus en haut.
    items.sort(function (a, b) { return b.z - a.z; });
    return items;
  }
  // Reecrit zOrder pour TOUS les objets a chaque deplacement : sans cette
  // normalisation, un objet encore sur son rang par defaut et un objet deplace
  // se compareraient sur des echelles differentes.
  function applyLayerOrder(items) {
    drill.zOrder = {};
    items.slice().reverse().forEach(function (it, i) { drill.zOrder[it.id] = 1000 + i * 10; });
  }
  function moveLayer(id, dir) {
    var items = layerItems();
    var i = items.findIndex(function (it) { return it.id === id; });
    var j = i + dir;
    if (i < 0 || j < 0 || j >= items.length) return;
    pushHistory();
    var tmp = items[i]; items[i] = items[j]; items[j] = tmp;
    applyLayerOrder(items);
    renderLayersPanel(); render(); syncJSON();
  }
  function renderLayersPanel() {
    var list = document.getElementById("layersList");
    if (!list) return;
    list.innerHTML = "";
    var items = layerItems();
    if (!items.length) {
      var empty = document.createElement("div");
      empty.className = "hint"; empty.style.margin = "0";
      empty.textContent = "Rien sur le terrain pour l'instant.";
      list.appendChild(empty);
      return;
    }
    items.forEach(function (it, i) {
      var row = document.createElement("div");
      row.className = "layer-row" + (it.ref === selZone || it.ref === selLine || it.ref === selText || it.ref === selPulse || it.ref === selEntity ? " active" : "");
      var swatch = document.createElement("span");
      swatch.className = "layer-swatch"; swatch.style.background = it.color;
      var name = document.createElement("button");
      name.className = "layer-name";
      name.innerHTML = "";
      name.appendChild(document.createTextNode(it.label));
      var kind = document.createElement("span");
      kind.className = "layer-kind"; kind.textContent = it.type;
      name.appendChild(kind);
      name.addEventListener("click", function () { it.select(it.ref); renderLayersPanel(); });
      var up = document.createElement("button");
      up.className = "icon-btn layer-move"; up.title = "Monter d'un cran"; up.setAttribute("aria-label", "Monter " + it.label);
      up.textContent = "↑"; up.disabled = i === 0;
      up.addEventListener("click", function () { moveLayer(it.id, -1); });
      var down = document.createElement("button");
      down.className = "icon-btn layer-move"; down.title = "Descendre d'un cran"; down.setAttribute("aria-label", "Descendre " + it.label);
      down.textContent = "↓"; down.disabled = i === items.length - 1;
      down.addEventListener("click", function () { moveLayer(it.id, 1); });
      row.appendChild(swatch); row.appendChild(name); row.appendChild(up); row.appendChild(down);
      list.appendChild(row);
    });
  }
  (function wireLayersPanel() {
    var toggle = document.getElementById("layersToggle");
    var panel = document.getElementById("layersPanel");
    if (!toggle || !panel) return;
    toggle.addEventListener("click", function () {
      var opening = panel.classList.contains("hidden");
      panel.classList.toggle("hidden", !opening);
      toggle.classList.toggle("primary", opening);
      if (opening) renderLayersPanel();
    });
    document.getElementById("layersClose").addEventListener("click", function () {
      panel.classList.add("hidden"); toggle.classList.remove("primary");
    });
  })();
  // Le panneau "Seance & donnees" (position fixed) recouvre son propre
  // <summary> au meme coin de l'ecran : une fois ouvert, cliquer le
  // <summary> pour refermer ne l'atteint plus (cf commentaire CSS de
  // .drawer-panel). Bouton de fermeture dedie, meme convention que layersClose.
  (function wireSeanceDrawer() {
    var drawer = document.getElementById("seanceDrawer");
    var close = document.getElementById("drawerClose");
    if (!drawer || !close) return;
    close.addEventListener("click", function () { drawer.open = false; });
  })();


  // ---- selecteurs visuels du terrain ----
  // Les <select> restent la source de verite (toute la logique existante y est
  // deja branchee) ; les vignettes ne font que les piloter et refleter leur
  // valeur. Aucun comportement duplique.
  (function wireThumbPickers() {
    document.querySelectorAll(".thumb-pick").forEach(function (pick) {
      var select = document.getElementById(pick.getAttribute("data-target"));
      if (!select) return;
      var thumbs = pick.querySelectorAll("[data-thumb]");
      function sync() {
        thumbs.forEach(function (t) { t.classList.toggle("active", t.getAttribute("data-thumb") === select.value); });
      }
      thumbs.forEach(function (t) {
        t.addEventListener("click", function () {
          select.value = t.getAttribute("data-thumb");
          select.dispatchEvent(new Event("change", { bubbles: true }));
          sync();
        });
      });
      select.addEventListener("change", sync);
      pick._syncThumbs = sync;
      sync();
    });
  })();
  // Le panneau terrain se rouvre sur l'etat courant (chargement d'un procede,
  // import JSON, annulation) : les vignettes doivent suivre le <select>.
  function syncPitchThumbs() {
    document.querySelectorAll(".thumb-pick").forEach(function (p) { if (p._syncThumbs) p._syncThumbs(); });
  }

  refreshLibrary(currentDrillId);
})();
