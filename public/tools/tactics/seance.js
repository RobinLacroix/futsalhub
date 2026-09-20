/*
 * Assembleur de seances : enchaine des procedes (Drills) de la bibliotheque en une
 * Session { meta, blocks[] } conforme au schema partage (voir src/schema.ts).
 *
 * Reutilise sans dupliquer :
 *   - DrillRender (render-core.js) pour les miniatures statiques ;
 *   - DrillStore (store.js) pour la bibliotheque de procedes et la persistance des seances.
 *
 * Un bloc = { role, intentionPedagogique, drillId, drill }. drillId est interne
 * (lien vers la bibliotheque pour "editer" / rafraichir) ; a l'export on ne garde
 * que { role, intentionPedagogique, drill } pour rester conforme au schema Session.
 */
(function () {
  "use strict";
  var R = window.DrillRender, S = window.DrillStore;
  var NS = "http://www.w3.org/2000/svg";

  // Trame pedagogique de Robin, dans l'ordre. Les blocs sont editables/reordonnables.
  var ROLES = [
    { id: "echauffement", label: "Échauffement" },
    { id: "rondo", label: "Rondo / Toro" },
    { id: "jeu-introduction", label: "Jeu d'introduction" },
    { id: "situation", label: "Situation" },
    { id: "jeu-fin", label: "Jeu de fin" },
    { id: "match", label: "Match" }
  ];
  var TRAME = ["echauffement", "rondo", "jeu-introduction", "situation", "jeu-fin", "match"];
  var EXPECTED = ["situation", "match"]; // coeur d'une seance : au moins une situation + un match

  var session = defaultSession();
  var currentSessionId = null;

  function roleLabel(id) { for (var i = 0; i < ROLES.length; i++) if (ROLES[i].id === id) return ROLES[i].label; return id; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function hasDrill(b) { return !!(b && b.drill); }
  function blockDur(b) { return hasDrill(b) ? (b.drill.meta.dureeMin || 0) : 0; }
  function computeTotal() { return session.blocks.reduce(function (s, b) { return s + blockDur(b); }, 0); }

  function defaultSession() {
    return {
      meta: { title: "", theme: "", phaseCible: "", objectif: "", effectif: "", dureeTotaleMin: 90, intensite: "elevee", philosophyTags: [] },
      blocks: TRAME.map(function (r) { return { role: r, intentionPedagogique: "", drillId: null, drill: null }; })
    };
  }

  // petit helper DOM
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "class") e.className = attrs[k];
      else if (k === "text") e.textContent = attrs[k];
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function flash(msg, ok) { var s = document.getElementById("status"); s.textContent = msg; s.className = "status " + (ok ? "ok" : "err"); }

  // ---- bibliotheque de procedes ----
  function drillOptionsInto(sel, selectedId) {
    var items = S ? S.listDrills() : [];
    sel.innerHTML = "";
    sel.appendChild(h("option", { value: "" }, ["— choisir un procédé —"]));
    items.forEach(function (it) {
      var lbl = (it.title || "(sans titre)") + (it.theme ? " · " + it.theme : "") + " · " + (it.dureeMin || 0) + "'";
      sel.appendChild(h("option", { value: it.id }, [lbl]));
    });
    sel.value = selectedId || "";
    return items.length;
  }

  // ---- miniature (rendu statique via le moteur partage) ----
  function miniature(drill) {
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "mini");
    svg.setAttribute("xmlns", NS);
    try { R.renderStatic(svg, drill, 0); } catch (e) { /* drill invalide : miniature vide */ }
    return svg;
  }

  // ---- rendu des blocs ----
  function renderBlocks() {
    var host = document.getElementById("blocks");
    host.innerHTML = "";
    session.blocks.forEach(function (b, i) { host.appendChild(blockCard(b, i)); });
    refreshSummary();
  }

  function blockCard(b, i) {
    // colonne miniature
    var miniWrap = h("div", { class: "mini-wrap" });
    if (hasDrill(b)) miniWrap.appendChild(miniature(b.drill));
    else miniWrap.appendChild(h("div", { class: "mini-empty" }, ["Aucun procédé sélectionné"]));

    // selecteur de procede
    var picker = h("select", {
      onchange: function (e) { setBlockDrill(i, e.target.value); }
    });
    var count = drillOptionsInto(picker, b.drillId);
    miniWrap.appendChild(picker);
    if (!count) miniWrap.appendChild(h("div", { class: "hint" }, ["Bibliothèque vide — crée des procédés dans l'éditeur."]));

    // colonne corps
    var roleSel = h("select", { class: "role", onchange: function (e) { b.role = e.target.value; refreshSummary(); } },
      ROLES.map(function (r) { return h("option", { value: r.id }, [r.label]); }));
    roleSel.value = b.role;

    var durInput = h("input", {
      type: "number", min: "1", style: "width:70px",
      value: String(blockDur(b)), disabled: hasDrill(b) ? null : "disabled",
      oninput: function (e) { if (hasDrill(b)) { b.drill.meta.dureeMin = parseInt(e.target.value, 10) || 0; refreshSummary(); } }
    });

    var editBtn = h("button", {
      class: "mini-btn", disabled: b.drillId ? null : "disabled",
      onclick: function () { if (b.drillId) window.open("index.html?drill=" + encodeURIComponent(b.drillId), "_blank"); }
    }, ["Éditer"]);

    var order = h("div", { class: "order" }, [
      h("button", { class: "mini-btn", title: "Monter", disabled: i === 0 ? "disabled" : null, onclick: function () { moveBlock(i, -1); } }, ["↑"]),
      h("button", { class: "mini-btn", title: "Descendre", disabled: i === session.blocks.length - 1 ? "disabled" : null, onclick: function () { moveBlock(i, 1); } }, ["↓"]),
      h("button", { class: "mini-btn danger", title: "Retirer", onclick: function () { removeBlock(i); } }, ["✕"])
    ]);

    var line1 = h("div", { class: "rowline" }, [
      h("label", null, ["Rôle"]), roleSel,
      h("label", null, ["Durée"]), durInput, h("span", { class: "hint" }, ["min"]),
      editBtn, order
    ]);

    var title = hasDrill(b)
      ? h("div", { class: "drill-title" }, [(b.drill.meta.title || "(sans titre)") + (b.drill.meta.theme ? " — " + b.drill.meta.theme : "")])
      : h("div", { class: "drill-title" }, ["—"]);

    var intention = h("textarea", {
      placeholder: "Intention pédagogique du bloc (poser la problématique, correctifs, validation…)",
      oninput: function (e) { b.intentionPedagogique = e.target.value; }
    });
    intention.value = b.intentionPedagogique || "";

    var body = h("div", { class: "body" }, [line1, title, intention]);
    return h("div", { class: "block" }, [miniWrap, body]);
  }

  // ---- actions blocs ----
  function setBlockDrill(i, id) {
    var b = session.blocks[i];
    if (!id) { b.drillId = null; b.drill = null; renderBlocks(); return; }
    var rec = S.getDrill(id);
    if (!rec || !rec.drill) { flash("Procédé introuvable", false); return; }
    b.drillId = id; b.drill = clone(rec.drill);
    renderBlocks();
  }
  function moveBlock(i, dir) {
    var j = i + dir;
    if (j < 0 || j >= session.blocks.length) return;
    var tmp = session.blocks[i]; session.blocks[i] = session.blocks[j]; session.blocks[j] = tmp;
    renderBlocks();
  }
  function removeBlock(i) { session.blocks.splice(i, 1); renderBlocks(); }
  function addBlock() { session.blocks.push({ role: "situation", intentionPedagogique: "", drillId: null, drill: null }); renderBlocks(); }
  function resetTrame() { session.blocks = defaultSession().blocks; renderBlocks(); flash("Trame type réinitialisée", true); }

  // Rafraichit les procedes embarques depuis la bibliotheque (apres edition dans l'editeur).
  function refreshEmbeddedDrills() {
    if (!S) return;
    var changed = false;
    session.blocks.forEach(function (b) {
      if (!b.drillId) return;
      var rec = S.getDrill(b.drillId);
      if (rec && rec.drill) { b.drill = clone(rec.drill); changed = true; }
    });
    if (changed) renderBlocks();
  }

  // ---- garde-fous / resume ----
  function refreshSummary() {
    var total = computeTotal(), target = session.meta.dureeTotaleMin || 0;
    var tl = document.getElementById("totalLabel");
    tl.textContent = "Total " + total + " min / cible " + target + " min";
    tl.className = "total " + (Math.abs(total - target) <= 5 ? "ok" : "off");
    document.getElementById("blockCount").textContent = session.blocks.length + " bloc(s) · " + session.blocks.filter(hasDrill).length + " avec procédé";

    var w = document.getElementById("warnings"); w.innerHTML = "";
    var msgs = [];
    // blocs sans procede
    var empty = session.blocks.filter(function (b) { return !hasDrill(b); }).length;
    if (empty) msgs.push({ t: "err", m: empty + " bloc(s) sans procédé assigné." });
    // roles attendus manquants
    var present = {}; session.blocks.forEach(function (b) { present[b.role] = true; });
    EXPECTED.forEach(function (r) { if (!present[r]) msgs.push({ t: "warn", m: "Rôle attendu manquant : " + roleLabel(r) + "." }); });
    // ecart duree
    if (target && Math.abs(total - target) > 10) msgs.push({ t: "warn", m: "Écart de " + (total - target > 0 ? "+" : "") + (total - target) + " min avec la durée cible." });
    // coherence thematique
    if (session.meta.theme) {
      var off = session.blocks.filter(function (b) { return hasDrill(b) && b.drill.meta.theme && norm(b.drill.meta.theme) !== norm(session.meta.theme); });
      if (off.length) msgs.push({ t: "warn", m: off.length + " procédé(s) d'un thème différent de la séance (« " + session.meta.theme + " »)." });
    }
    if (!msgs.length) msgs.push({ t: "ok", m: "Séance cohérente : trame complète, durées et thème alignés." });
    msgs.forEach(function (x) { w.appendChild(h("li", { class: x.t === "err" ? "err" : x.t === "ok" ? "ok" : "" }, [x.m])); });
  }
  function norm(s) { return String(s).trim().toLowerCase(); }

  // ---- bandeau meta ----
  function bindMeta() {
    map("sTitle", "title"); map("sTheme", "theme"); map("sPhase", "phaseCible"); map("sObjectif", "objectif"); map("sEffectif", "effectif");
    document.getElementById("sDuree").addEventListener("input", function (e) { session.meta.dureeTotaleMin = parseInt(e.target.value, 10) || 0; refreshSummary(); });
    document.getElementById("sIntensite").addEventListener("change", function (e) { session.meta.intensite = e.target.value; });
    document.getElementById("sTags").addEventListener("input", function (e) { session.meta.philosophyTags = e.target.value.split(",").map(function (s) { return s.trim(); }).filter(Boolean); });
    function map(id, key) { document.getElementById(id).addEventListener("input", function (e) { session.meta[key] = e.target.value; if (key === "theme") refreshSummary(); }); }
  }
  function fillMeta() {
    var m = session.meta;
    document.getElementById("sTitle").value = m.title || "";
    document.getElementById("sTheme").value = m.theme || "";
    document.getElementById("sPhase").value = m.phaseCible || "";
    document.getElementById("sObjectif").value = m.objectif || "";
    document.getElementById("sEffectif").value = m.effectif || "";
    document.getElementById("sDuree").value = m.dureeTotaleMin || 0;
    document.getElementById("sIntensite").value = m.intensite || "elevee";
    document.getElementById("sTags").value = (m.philosophyTags || []).join(", ");
  }

  // ---- IO : Session conforme au schema (sans drillId interne) ----
  function cleanSession() {
    return {
      meta: clone(Object.assign({}, session.meta, { dureeTotaleMin: computeTotal() || session.meta.dureeTotaleMin })),
      blocks: session.blocks.filter(hasDrill).map(function (b) {
        return { role: b.role, intentionPedagogique: b.intentionPedagogique || "", drill: clone(b.drill) };
      })
    };
  }
  function validate() {
    var e = [];
    if (!session.meta.title) e.push("titre");
    if (!session.meta.theme) e.push("thème");
    if (!session.meta.objectif) e.push("objectif");
    if (!session.blocks.filter(hasDrill).length) e.push("au moins un procédé");
    return e;
  }

  function exportJSON() {
    var errs = validate();
    if (errs.length) { flash("À compléter : " + errs.join(", "), false); return; }
    var blob = new Blob([JSON.stringify(cleanSession(), null, 2)], { type: "application/json" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = (session.meta.title || "seance").toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".json";
    a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    flash("Séance exportée ✓", true);
  }

  function saveToLibrary() {
    if (!S || !S.available()) { flash("Stockage local indisponible", false); return; }
    if (!session.meta.title) { flash("Donne un titre à la séance avant d'enregistrer", false); return; }
    var payload = { meta: clone(session.meta), blocks: session.blocks.map(function (b) { return { role: b.role, intentionPedagogique: b.intentionPedagogique || "", drillId: b.drillId, drill: b.drill ? clone(b.drill) : null }; }) };
    payload.meta.dureeTotaleMin = computeTotal() || payload.meta.dureeTotaleMin;
    currentSessionId = S.saveSession(payload, currentSessionId);
    refreshSessionList(currentSessionId);
    flash("Séance enregistrée ✓", true);
  }
  function loadFromLibrary(id) {
    if (!S) return;
    id = id || document.getElementById("sessSelect").value;
    if (!id) { flash("Choisis une séance", false); return; }
    var rec = S.getSession(id);
    if (!rec || !rec.session) { flash("Séance introuvable", false); return; }
    var s = rec.session;
    session = { meta: Object.assign(defaultSession().meta, s.meta || {}), blocks: (s.blocks || []).map(function (b) { return { role: b.role, intentionPedagogique: b.intentionPedagogique || "", drillId: b.drillId || null, drill: b.drill || null }; }) };
    currentSessionId = id;
    fillMeta(); renderBlocks(); refreshSessionList(id);
    flash("Séance chargée ✓", true);
  }
  function deleteFromLibrary() {
    if (!S) return;
    var id = document.getElementById("sessSelect").value;
    if (!id) { flash("Choisis une séance à supprimer", false); return; }
    S.deleteSession(id);
    if (currentSessionId === id) currentSessionId = null;
    refreshSessionList(); flash("Séance supprimée", true);
  }
  function refreshSessionList(selectId) {
    var sel = document.getElementById("sessSelect"); if (!sel || !S) return;
    var items = S.listSessions(); sel.innerHTML = "";
    if (!items.length) { sel.appendChild(h("option", { value: "" }, ["(aucune séance)"])); return; }
    items.forEach(function (it) { sel.appendChild(h("option", { value: it.id }, [(it.title || "(sans titre)") + " · " + (it.dureeTotaleMin || 0) + "'"])); });
    sel.value = selectId || "";
  }
  function newSession() { session = defaultSession(); currentSessionId = null; fillMeta(); renderBlocks(); flash("Nouvelle séance", true); }

  // ---- fiche imprimable (HTML -> PDF via impression navigateur) ----
  function printFiche() {
    var errs = validate();
    if (errs.length) { flash("À compléter avant impression : " + errs.join(", "), false); return; }
    var m = session.meta, total = computeTotal();
    var blocksHTML = session.blocks.filter(hasDrill).map(function (b) {
      var d = b.drill, mini = miniature(d);
      var rules = d.rules || {};
      function list(arr, title) { return (arr && arr.length) ? "<div class='sub'><b>" + title + "</b><ul>" + arr.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>" : ""; }
      var meca = (rules.mecanismes && rules.mecanismes.length) ? "<div class='sub'><b>Mécanismes</b><ul>" + rules.mecanismes.map(function (x) { return "<li>" + esc(x.regle) + " → " + esc(x.induit) + "</li>"; }).join("") + "</ul></div>" : "";
      return "<section class='fb'>"
        + "<div class='fh'><span class='role'>" + esc(roleLabel(b.role)) + "</span><span class='dur'>" + (d.meta.dureeMin || 0) + " min</span></div>"
        + "<h3>" + esc(d.meta.title || "(sans titre)") + "</h3>"
        + (b.intentionPedagogique ? "<p class='intent'>" + esc(b.intentionPedagogique) + "</p>" : "")
        + "<div class='fbody'><div class='fmini'>" + mini.outerHTML + "</div><div class='finfo'>"
        + (d.meta.objectif ? "<p><b>Objectif :</b> " + esc(d.meta.objectif) + "</p>" : "")
        + list(rules.scoring, "Scoring") + list(rules.comportements, "Comportements attendus") + meca
        + "<div class='vars'>" + list(rules.variablesPlus, "Variables +") + list(rules.variablesMinus, "Variables −") + "</div>"
        + "</div></div></section>";
    }).join("");

    var doc = "<!doctype html><html lang='fr'><head><meta charset='utf-8'><title>" + esc(m.title) + "</title><style>"
      + "*{box-sizing:border-box} body{font-family:-apple-system,Arial,sans-serif;color:#1c1e1a;margin:24px;font-size:12px;line-height:1.45}"
      + "h1{font-size:20px;margin:0 0 4px} .meta{color:#555;margin:0 0 16px;font-size:12px}"
      + ".meta b{color:#1c1e1a} .tags{color:#1d9e75}"
      + ".fb{border:1px solid #ddd;border-radius:8px;padding:12px;margin-bottom:12px;page-break-inside:avoid}"
      + ".fh{display:flex;justify-content:space-between;align-items:center} .fh .role{background:#eef0ec;border-radius:10px;padding:2px 10px;font-weight:600}"
      + ".fh .dur{color:#555;font-weight:600} h3{margin:6px 0} .intent{color:#555;font-style:italic;margin:0 0 8px}"
      + ".fbody{display:grid;grid-template-columns:300px 1fr;gap:14px;align-items:start}"
      + ".fmini svg{width:100%;height:auto;border-radius:6px;background:#2f8f4e} .finfo p{margin:0 0 6px}"
      + ".sub{margin:6px 0} .sub b{display:block} .sub ul{margin:2px 0 0 16px;padding:0} .vars{display:grid;grid-template-columns:1fr 1fr;gap:10px}"
      + "@media print{body{margin:12mm}}"
      + "</style></head><body>"
      + "<h1>" + esc(m.title) + "</h1>"
      + "<p class='meta'><b>Thème :</b> " + esc(m.theme) + (m.phaseCible ? " · <b>Phase :</b> " + esc(m.phaseCible) : "")
      + " · <b>Objectif :</b> " + esc(m.objectif)
      + (m.effectif ? " · <b>Effectif :</b> " + esc(m.effectif) : "")
      + " · <b>Durée :</b> " + total + " min · <b>Intensité :</b> " + esc(m.intensite)
      + ((m.philosophyTags && m.philosophyTags.length) ? " · <span class='tags'>" + esc(m.philosophyTags.join(", ")) + "</span>" : "")
      + "</p>" + blocksHTML + "</body></html>";

    var w = window.open("", "_blank");
    if (!w) { flash("Autorise les pop-ups pour la fiche", false); return; }
    w.document.open(); w.document.write(doc); w.document.close();
    w.onload = function () { w.focus(); w.print(); };
    flash("Fiche générée (fenêtre d'impression)", true);
  }

  // ---- wire up ----
  document.getElementById("addBlock").addEventListener("click", addBlock);
  document.getElementById("resetTrame").addEventListener("click", resetTrame);
  document.getElementById("saveSessBtn").addEventListener("click", saveToLibrary);
  document.getElementById("loadSessBtn").addEventListener("click", function () { loadFromLibrary(); });
  document.getElementById("delSessBtn").addEventListener("click", deleteFromLibrary);
  document.getElementById("exportBtn").addEventListener("click", exportJSON);
  document.getElementById("printBtn").addEventListener("click", printFiche);
  document.getElementById("newBtn").addEventListener("click", newSession);
  window.addEventListener("focus", refreshEmbeddedDrills); // rafraichit les minis apres edition d'un procede

  bindMeta(); fillMeta(); renderBlocks(); refreshSessionList(currentSessionId);
})();
