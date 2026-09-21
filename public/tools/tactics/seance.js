/*
 * Assembleur de seances : enchaine des training_procedures (fiches pedagogiques
 * de la bibliotheque du club) en une Session { name, meta, blocks[] }.
 *
 * Fonctionne UNIQUEMENT embarque dans la webapp (iframe de
 * app/webapp/library/sessions, cf PLAN_ASSEMBLEUR_SEANCE_PHASE2_2026-09.md) —
 * pas de mode standalone, pas de bibliotheque locale : la liste des seances
 * vit cote Supabase (training_sessions), la liste des procedes vient du parent
 * (table training_procedures) a chaque INIT/CONTEXT_UPDATE.
 *
 * Un bloc = { id, type, duration, procedureId, intentionPedagogique }. Liste
 * libre (ajout/suppression/reordonnancement, doublons de type possibles) —
 * pas de trame fixe. type reprend l'enum training_type (Echauffement /
 * Exercice / Situation / Jeu).
 *
 * Pont postMessage (meme origine, cf editor.js pour le patron d'origine) :
 *   -> INIT           { clubId, sessionId, session|null, procedures }
 *   -> CONTEXT_UPDATE { clubId, procedures }
 *   -> SAVED          { sessionId }
 *   -> SAVE_ERROR     { message }
 *   <- READY {}
 *   <- SAVE  { session: SessionJSON }
 *   <- CLOSE {}
 */
(function () {
  "use strict";

  var TYPES = [
    { id: "Echauffement", label: "Échauffement" },
    { id: "Exercice", label: "Exercice" },
    { id: "Situation", label: "Situation" },
    { id: "Jeu", label: "Jeu" }
  ];
  // Coeur d'une seance (heritage de la trame de Robin : au moins une situation
  // + un jeu/match) — garde-fou souple, pas une contrainte de structure.
  var EXPECTED = ["Situation", "Jeu"];

  var clubId = null, sessionId = null, procedures = [];
  var session = defaultSession();

  function typeLabel(id) { for (var i = 0; i < TYPES.length; i++) if (TYPES[i].id === id) return TYPES[i].label; return id; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function newBlockId() { return "b" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function hasProc(b) { return !!(b && b.procedureId); }
  function findProc(id) { for (var i = 0; i < procedures.length; i++) if (procedures[i].id === id) return procedures[i]; return null; }
  function computeTotal() { return session.blocks.reduce(function (s, b) { return s + (b.duration || 0); }, 0); }

  function defaultSession() {
    return {
      name: "",
      meta: { theme: "", phaseCible: "", objectif: "", effectif: "", dureeTotaleMin: 90, intensite: "elevee", philosophyTags: [] },
      blocks: []
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

  // ---- rendu des blocs ----
  function renderBlocks() {
    var host = document.getElementById("blocks");
    host.innerHTML = "";
    session.blocks.forEach(function (b, i) { host.appendChild(blockCard(b, i)); });
    refreshSummary();
  }

  function blockCard(b, i) {
    var p = hasProc(b) ? findProc(b.procedureId) : null;

    // colonne miniature (illustration de la fiche procede, si elle en a une)
    var thumb = p && p.image_url
      ? h("div", { class: "thumb" }, [(function () { var img = document.createElement("img"); img.src = p.image_url; img.alt = ""; return img; })()])
      : h("div", { class: "thumb empty" }, [hasProc(b) ? "Aucune illustration" : "Aucun procédé sélectionné"]);

    var picker = h("select", { onchange: function (e) { setBlockProcedure(i, e.target.value); } });
    var count = procedureOptionsInto(picker, b.procedureId);
    var side = h("div", { class: "side" }, [thumb, picker]);
    if (!count) side.appendChild(h("div", { class: "hint" }, ["Bibliothèque vide — crée des procédés dans la bibliothèque."]));

    // colonne corps
    var typeSel = h("select", { class: "type", onchange: function (e) { b.type = e.target.value; refreshSummary(); } },
      TYPES.map(function (t) { return h("option", { value: t.id }, [t.label]); }));
    typeSel.value = b.type;

    var durInput = h("input", {
      type: "number", min: "0", style: "width:70px", value: String(b.duration || 0),
      oninput: function (e) { b.duration = parseInt(e.target.value, 10) || 0; refreshSummary(); }
    });

    var schemaBtn = h("button", {
      class: "mini-btn", disabled: (p && p.schematic_id) ? null : "disabled",
      onclick: function () { if (p && p.schematic_id) window.open("/webapp/library/schematics?schematic=" + encodeURIComponent(p.schematic_id), "_blank"); }
    }, ["Voir le schéma"]);

    var order = h("div", { class: "order" }, [
      h("button", { class: "mini-btn", title: "Monter", disabled: i === 0 ? "disabled" : null, onclick: function () { moveBlock(i, -1); } }, ["↑"]),
      h("button", { class: "mini-btn", title: "Descendre", disabled: i === session.blocks.length - 1 ? "disabled" : null, onclick: function () { moveBlock(i, 1); } }, ["↓"]),
      h("button", { class: "mini-btn danger", title: "Retirer", onclick: function () { removeBlock(i); } }, ["✕"])
    ]);

    var line1 = h("div", { class: "rowline" }, [
      h("label", null, ["Type"]), typeSel,
      h("label", null, ["Durée"]), durInput, h("span", { class: "hint" }, ["min"]),
      schemaBtn, order
    ]);

    var title = p
      ? h("div", { class: "proc-title" }, [(p.title || "(sans titre)") + (p.theme ? " — " + p.theme : "")])
      : h("div", { class: "proc-title" }, ["—"]);

    var intention = h("textarea", {
      placeholder: "Intention pédagogique du bloc (poser la problématique, correctifs, validation…)",
      oninput: function (e) { b.intentionPedagogique = e.target.value; }
    });
    intention.value = b.intentionPedagogique || "";

    var body = h("div", { class: "body" }, [line1, title, intention]);
    return h("div", { class: "block" }, [side, body]);
  }

  // ---- bibliotheque de procedes (injectee par le parent) ----
  function procedureOptionsInto(sel, selectedId) {
    sel.innerHTML = "";
    sel.appendChild(h("option", { value: "" }, ["— choisir un procédé —"]));
    procedures.forEach(function (it) {
      var lbl = (it.title || "(sans titre)") + (it.theme ? " · " + it.theme : "") + " · " + (it.duration_minutes || 0) + "'";
      sel.appendChild(h("option", { value: it.id }, [lbl]));
    });
    sel.value = selectedId || "";
    return procedures.length;
  }

  // ---- actions blocs ----
  function setBlockProcedure(i, id) {
    var b = session.blocks[i];
    if (!id) { b.procedureId = null; renderBlocks(); return; }
    var p = findProc(id);
    if (!p) { flash("Procédé introuvable", false); return; }
    b.procedureId = id;
    if (p.duration_minutes) b.duration = p.duration_minutes;
    renderBlocks();
  }
  function moveBlock(i, dir) {
    var j = i + dir;
    if (j < 0 || j >= session.blocks.length) return;
    var tmp = session.blocks[i]; session.blocks[i] = session.blocks[j]; session.blocks[j] = tmp;
    renderBlocks();
  }
  function removeBlock(i) { session.blocks.splice(i, 1); renderBlocks(); }
  function addBlock() { session.blocks.push({ id: newBlockId(), type: "Exercice", duration: 15, procedureId: null, intentionPedagogique: "" }); renderBlocks(); }

  // ---- garde-fous / resume ----
  function refreshSummary() {
    var total = computeTotal(), target = session.meta.dureeTotaleMin || 0;
    var tl = document.getElementById("totalLabel");
    tl.textContent = "Total " + total + " min / cible " + target + " min";
    tl.className = "total " + (Math.abs(total - target) <= 5 ? "ok" : "off");
    document.getElementById("blockCount").textContent = session.blocks.length + " bloc(s) · " + session.blocks.filter(hasProc).length + " avec procédé";

    var w = document.getElementById("warnings"); w.innerHTML = "";
    var msgs = [];
    var empty = session.blocks.filter(function (b) { return !hasProc(b); }).length;
    if (empty) msgs.push({ t: "warn", m: empty + " bloc(s) sans procédé assigné." });
    var present = {}; session.blocks.forEach(function (b) { present[b.type] = true; });
    EXPECTED.forEach(function (t) { if (!present[t]) msgs.push({ t: "warn", m: "Type attendu manquant : " + typeLabel(t) + "." }); });
    if (target && Math.abs(total - target) > 10) msgs.push({ t: "warn", m: "Écart de " + (total - target > 0 ? "+" : "") + (total - target) + " min avec la durée cible." });
    if (session.meta.theme) {
      var off = session.blocks.filter(function (b) { var p = hasProc(b) ? findProc(b.procedureId) : null; return p && p.theme && norm(p.theme) !== norm(session.meta.theme); });
      if (off.length) msgs.push({ t: "warn", m: off.length + " procédé(s) d'un thème différent de la séance (« " + session.meta.theme + " »)." });
    }
    if (!session.blocks.length) msgs.push({ t: "err", m: "Aucun bloc — ajoute au moins un bloc à la séance." });
    if (!msgs.length) msgs.push({ t: "ok", m: "Séance cohérente : durées et thème alignés." });
    msgs.forEach(function (x) { w.appendChild(h("li", { class: x.t === "err" ? "err" : x.t === "ok" ? "ok" : "" }, [x.m])); });
  }
  function norm(s) { return String(s).trim().toLowerCase(); }

  // ---- bandeau meta ----
  function bindMeta() {
    document.getElementById("sTitle").addEventListener("input", function (e) { session.name = e.target.value; });
    map("sTheme", "theme"); map("sPhase", "phaseCible"); map("sObjectif", "objectif"); map("sEffectif", "effectif");
    document.getElementById("sDuree").addEventListener("input", function (e) { session.meta.dureeTotaleMin = parseInt(e.target.value, 10) || 0; refreshSummary(); });
    document.getElementById("sIntensite").addEventListener("change", function (e) { session.meta.intensite = e.target.value; });
    document.getElementById("sTags").addEventListener("input", function (e) { session.meta.philosophyTags = e.target.value.split(",").map(function (s) { return s.trim(); }).filter(Boolean); });
    function map(id, key) { document.getElementById(id).addEventListener("input", function (e) { session.meta[key] = e.target.value; if (key === "theme") refreshSummary(); }); }
  }
  function fillMeta() {
    var m = session.meta;
    document.getElementById("sTitle").value = session.name || "";
    document.getElementById("sTheme").value = m.theme || "";
    document.getElementById("sPhase").value = m.phaseCible || "";
    document.getElementById("sObjectif").value = m.objectif || "";
    document.getElementById("sEffectif").value = m.effectif || "";
    document.getElementById("sDuree").value = m.dureeTotaleMin || 0;
    document.getElementById("sIntensite").value = m.intensite || "elevee";
    document.getElementById("sTags").value = (m.philosophyTags || []).join(", ");
  }

  // ---- IO ----
  function cleanSession() {
    return {
      id: sessionId,
      name: session.name,
      meta: clone(Object.assign({}, session.meta, { dureeTotaleMin: computeTotal() || session.meta.dureeTotaleMin })),
      blocks: session.blocks.map(function (b) {
        return { id: b.id, type: b.type, duration: b.duration || 0, procedureId: b.procedureId || null, intentionPedagogique: b.intentionPedagogique || "" };
      })
    };
  }
  function validate() {
    var e = [];
    if (!session.name) e.push("titre");
    if (!session.meta.theme) e.push("thème");
    if (!session.meta.objectif) e.push("objectif");
    if (!session.blocks.length) e.push("au moins un bloc");
    return e;
  }

  function exportJSON() {
    var errs = validate();
    if (errs.length) { flash("À compléter : " + errs.join(", "), false); return; }
    var blob = new Blob([JSON.stringify(cleanSession(), null, 2)], { type: "application/json" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = (session.name || "seance").toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".json";
    a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    flash("Séance exportée ✓", true);
  }

  function saveSession() {
    var errs = validate();
    if (errs.length) { flash("À compléter avant d'enregistrer : " + errs.join(", "), false); return; }
    window.parent.postMessage({ type: "SAVE", session: cleanSession() }, window.location.origin);
  }

  // ---- fiche imprimable (HTML -> PDF via impression navigateur) ----
  function printFiche() {
    var errs = validate();
    if (errs.length) { flash("À compléter avant impression : " + errs.join(", "), false); return; }
    var m = session.meta, total = computeTotal();
    var blocksHTML = session.blocks.map(function (b) {
      var p = hasProc(b) ? findProc(b.procedureId) : null;
      var img = p && p.image_url ? "<div class='fmini'><img src='" + esc(p.image_url) + "' alt='' /></div>" : "";
      var info = p
        ? "<div class='finfo'>"
          + (p.objectives ? "<p><b>Objectifs :</b> " + esc(p.objectives) + "</p>" : "")
          + (p.instructions ? "<p><b>Consignes :</b> " + esc(p.instructions) + "</p>" : "")
          + (p.variants ? "<p><b>Variantes :</b> " + esc(p.variants) + "</p>" : "")
          + (p.corrections ? "<p><b>Corrections :</b> " + esc(p.corrections) + "</p>" : "")
          + "</div>"
        : "<div class='finfo'><p class='hint'>(bloc libre, sans procédé associé)</p></div>";
      return "<section class='fb'>"
        + "<div class='fh'><span class='role'>" + esc(typeLabel(b.type)) + "</span><span class='dur'>" + (b.duration || 0) + " min</span></div>"
        + "<h3>" + esc(p ? (p.title || "(sans titre)") : "Bloc libre") + "</h3>"
        + (b.intentionPedagogique ? "<p class='intent'>" + esc(b.intentionPedagogique) + "</p>" : "")
        + "<div class='fbody" + (img ? "" : " no-img") + "'>" + img + info + "</div>"
        + "</section>";
    }).join("");

    var doc = "<!doctype html><html lang='fr'><head><meta charset='utf-8'><title>" + esc(session.name) + "</title><style>"
      + "*{box-sizing:border-box} body{font-family:-apple-system,Arial,sans-serif;color:#1c1e1a;margin:24px;font-size:12px;line-height:1.45}"
      + "h1{font-size:20px;margin:0 0 4px} .meta{color:#555;margin:0 0 16px;font-size:12px}"
      + ".meta b{color:#1c1e1a} .tags{color:#1d9e75}"
      + ".fb{border:1px solid #ddd;border-radius:8px;padding:12px;margin-bottom:12px;page-break-inside:avoid}"
      + ".fh{display:flex;justify-content:space-between;align-items:center} .fh .role{background:#eef0ec;border-radius:10px;padding:2px 10px;font-weight:600}"
      + ".fh .dur{color:#555;font-weight:600} h3{margin:6px 0} .intent{color:#555;font-style:italic;margin:0 0 8px}"
      + ".fbody{display:grid;grid-template-columns:200px 1fr;gap:14px;align-items:start} .fbody.no-img{grid-template-columns:1fr}"
      + ".fmini img{width:100%;border-radius:6px;object-fit:cover} .finfo p{margin:0 0 6px} .finfo .hint{color:#888;font-style:italic}"
      + "@media print{body{margin:12mm}}"
      + "</style></head><body>"
      + "<h1>" + esc(session.name) + "</h1>"
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

  // ---- pont postMessage avec la webapp ----
  function applyProcedures(list) { procedures = Array.isArray(list) ? list : []; }
  function applySessionData(s) {
    session = {
      name: s.name || "",
      meta: Object.assign(defaultSession().meta, s.meta || {}),
      blocks: (s.blocks || []).map(function (b) {
        return { id: b.id || newBlockId(), type: b.type || "Exercice", duration: b.duration || 0, procedureId: b.procedureId || null, intentionPedagogique: b.intentionPedagogique || "" };
      })
    };
  }

  window.addEventListener("message", function (ev) {
    if (ev.origin !== window.location.origin || !ev.data) return;
    var msg = ev.data;
    if (msg.type === "INIT") {
      clubId = msg.clubId || null;
      sessionId = msg.sessionId || null;
      applyProcedures(msg.procedures);
      if (msg.session) applySessionData(msg.session);
      fillMeta(); renderBlocks();
    } else if (msg.type === "CONTEXT_UPDATE") {
      clubId = msg.clubId || clubId;
      applyProcedures(msg.procedures);
      renderBlocks();
    } else if (msg.type === "SAVED") {
      sessionId = msg.sessionId || sessionId;
      flash("Enregistré ✓", true);
    } else if (msg.type === "SAVE_ERROR") {
      flash("Échec de l'enregistrement" + (msg.message ? " : " + msg.message : ""), false);
    }
  });

  document.getElementById("closeBtn").addEventListener("click", function () {
    window.parent.postMessage({ type: "CLOSE" }, window.location.origin);
  });

  // ---- wire up ----
  document.getElementById("addBlock").addEventListener("click", addBlock);
  document.getElementById("saveBtn").addEventListener("click", saveSession);
  document.getElementById("exportBtn").addEventListener("click", exportJSON);
  document.getElementById("printBtn").addEventListener("click", printFiche);

  bindMeta(); fillMeta(); renderBlocks();
  window.parent.postMessage({ type: "READY" }, window.location.origin);
})();
