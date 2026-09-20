/*
 * Bibliotheque locale (localStorage) des procedes (Drills) et des seances (Sessions).
 * C'est la "bibliotheque de procedes" de la roadmap produit et le corpus seed qui
 * nourrira l'IA plus tard : chaque procede cree s'accumule au lieu d'etre un fichier perdu.
 *
 * Aucune dependance. Deux entites, meme API CRUD :
 *   listDrills / getDrill / saveDrill / deleteDrill
 *   listSessions / getSession / saveSession / deleteSession
 * Plus un "slot" localStorage pour le handshake editeur<->assembleur (passer un
 * procede en cours d'edition sans backend ni parametre d'URL lourd).
 *
 * Stockage : une cle par entite, contenant un objet { [id]: record }.
 * record = { id, updatedAt, createdAt, drill|session }.
 */
window.DrillStore = (function () {
  "use strict";
  var DKEY = "futsalhub.drills.v1";
  var SKEY = "futsalhub.sessions.v1";
  var SLOT = "futsalhub.editor.slot.v1";
  var RKEY = "futsalhub.roster.v1";
  var TKEY = "futsalhub.teams.v1";
  var FKEY = "futsalhub.folders.v1";

  function available() {
    try { var k = "__fh_test__"; localStorage.setItem(k, "1"); localStorage.removeItem(k); return true; }
    catch (e) { return false; }
  }
  function readMap(key) {
    try { var raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) || {}) : {}; }
    catch (e) { return {}; }
  }
  function writeMap(key, map) {
    try { localStorage.setItem(key, JSON.stringify(map)); return true; }
    catch (e) { return false; }
  }
  function genId(prefix) {
    return (prefix || "id") + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function byUpdatedDesc(a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); }

  // ---- Procedes (Drills) ----
  function drillSummary(rec) {
    var m = (rec.drill && rec.drill.meta) || {};
    return {
      id: rec.id, updatedAt: rec.updatedAt || 0,
      title: m.title || "", theme: m.theme || "", category: m.category || "entrainement", subcategory: m.subcategory || "",
      dureeMin: m.dureeMin || 0, nbJoueurs: m.nbJoueurs || 0,
      keyframes: (rec.drill && rec.drill.keyframes && rec.drill.keyframes.length) || 0,
      // Classement libre du coach, porte par l'ENREGISTREMENT et non par le
      // procede : c'est une donnee de bibliotheque, elle n'a rien a faire dans
      // le JSON exporte ni chez un consommateur externe.
      folderId: rec.folderId || null
    };
  }
  function listDrills() {
    var map = readMap(DKEY);
    return Object.keys(map).map(function (id) { return drillSummary(map[id]); }).sort(byUpdatedDesc);
  }
  function getDrill(id) {
    var map = readMap(DKEY);
    return map[id] ? clone(map[id]) : null;
  }
  // Upsert. id optionnel : si absent (ou inconnu), cree une nouvelle entree. Retourne l'id.
  function saveDrill(drill, id) {
    var map = readMap(DKEY), now = Date.now();
    if (!id || !map[id]) { id = id || genId("drill"); map[id] = { id: id, createdAt: now }; }
    map[id].drill = clone(drill);
    map[id].updatedAt = now;
    writeMap(DKEY, map);
    return id;
  }
  function deleteDrill(id) {
    var map = readMap(DKEY);
    if (map[id]) { delete map[id]; writeMap(DKEY, map); return true; }
    return false;
  }

  // ---- Dossiers de bibliotheque ----
  // Classement libre, en plus des categories (qui decrivent la nature du
  // procede). Un dossier est { id, name } ; l'appartenance vit sur
  // l'enregistrement (rec.folderId), pas dans le procede lui-meme.
  function listFolders() {
    try { var raw = localStorage.getItem(FKEY); return raw ? (JSON.parse(raw) || []) : []; }
    catch (e) { return []; }
  }
  function writeFolders(list) {
    try { localStorage.setItem(FKEY, JSON.stringify(list || [])); return true; }
    catch (e) { return false; }
  }
  function createFolder(name) {
    name = String(name || "").trim(); if (!name) return null;
    var list = listFolders(), f = { id: genId("fold"), name: name };
    list.push(f); writeFolders(list); return f.id;
  }
  function renameFolder(id, name) {
    name = String(name || "").trim(); if (!name) return false;
    var list = listFolders(), hit = false;
    list.forEach(function (f) { if (f.id === id) { f.name = name; hit = true; } });
    if (hit) writeFolders(list);
    return hit;
  }
  // Supprime le dossier, pas son contenu : les procedes retournent dans
  // "Sans dossier". Un dossier est un rangement, jamais une corbeille.
  function deleteFolder(id) {
    var list = listFolders().filter(function (f) { return f.id !== id; });
    writeFolders(list);
    var map = readMap(DKEY), touched = false;
    Object.keys(map).forEach(function (k) { if (map[k].folderId === id) { delete map[k].folderId; touched = true; } });
    if (touched) writeMap(DKEY, map);
    return true;
  }
  function setDrillFolder(drillId, folderId) {
    var map = readMap(DKEY);
    if (!map[drillId]) return false;
    if (folderId) map[drillId].folderId = folderId; else delete map[drillId].folderId;
    writeMap(DKEY, map);
    return true;
  }

  // ---- Seances (Sessions) ----
  function sessionSummary(rec) {
    var m = (rec.session && rec.session.meta) || {};
    return {
      id: rec.id, updatedAt: rec.updatedAt || 0,
      title: m.title || "", theme: m.theme || "",
      dureeTotaleMin: m.dureeTotaleMin || 0,
      blocks: (rec.session && rec.session.blocks && rec.session.blocks.length) || 0
    };
  }
  function listSessions() {
    var map = readMap(SKEY);
    return Object.keys(map).map(function (id) { return sessionSummary(map[id]); }).sort(byUpdatedDesc);
  }
  function getSession(id) {
    var map = readMap(SKEY);
    return map[id] ? clone(map[id]) : null;
  }
  function saveSession(session, id) {
    var map = readMap(SKEY), now = Date.now();
    if (!id || !map[id]) { id = id || genId("session"); map[id] = { id: id, createdAt: now }; }
    map[id].session = clone(session);
    map[id].updatedAt = now;
    writeMap(SKEY, map);
    return id;
  }
  function deleteSession(id) {
    var map = readMap(SKEY);
    if (map[id]) { delete map[id]; writeMap(SKEY, map); return true; }
    return false;
  }

  // ---- Trousseau de joueurs (roster reutilisable, independant des procedes) ----
  function listRoster() {
    try { var raw = localStorage.getItem(RKEY); return raw ? (JSON.parse(raw) || []) : []; }
    catch (e) { return []; }
  }
  function saveRoster(list) {
    try { localStorage.setItem(RKEY, JSON.stringify(list || [])); return true; }
    catch (e) { return false; }
  }

  // ---- Identite d'equipe par defaut (reutilisable d'un procede a l'autre) ----
  // Meme logique que le trousseau de joueurs : le club a des couleurs, elles
  // n'ont pas a etre re-saisies a chaque nouveau procede.
  function getTeamsPreset() {
    try { var raw = localStorage.getItem(TKEY); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  }
  function saveTeamsPreset(teams) {
    try {
      if (!teams) localStorage.removeItem(TKEY);
      else localStorage.setItem(TKEY, JSON.stringify(teams));
      return true;
    } catch (e) { return false; }
  }

  // ---- Slot de handshake editeur<->assembleur ----
  // L'assembleur depose un procede a editer ; l'editeur le reprend puis le vide.
  function setEditorSlot(payload) {
    try { localStorage.setItem(SLOT, JSON.stringify({ at: Date.now(), payload: payload })); return true; }
    catch (e) { return false; }
  }
  function getEditorSlot() {
    try { var raw = localStorage.getItem(SLOT); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  }
  function clearEditorSlot() {
    try { localStorage.removeItem(SLOT); } catch (e) {}
  }

  return {
    available: available, genId: genId,
    listDrills: listDrills, getDrill: getDrill, saveDrill: saveDrill, deleteDrill: deleteDrill,
    listSessions: listSessions, getSession: getSession, saveSession: saveSession, deleteSession: deleteSession,
    listRoster: listRoster, saveRoster: saveRoster,
    getTeamsPreset: getTeamsPreset, saveTeamsPreset: saveTeamsPreset,
    listFolders: listFolders, createFolder: createFolder, renameFolder: renameFolder, deleteFolder: deleteFolder, setDrillFolder: setDrillFolder,
    setEditorSlot: setEditorSlot, getEditorSlot: getEditorSlot, clearEditorSlot: clearEditorSlot
  };
})();
