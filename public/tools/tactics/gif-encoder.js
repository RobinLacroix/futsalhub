/*
 * Encodeur GIF89a animé, autonome (aucune dépendance).
 * - Quantification par median-cut (palette globale calculée sur toutes les frames).
 * - Compression LZW GIF (paquetage LSB, tailles de code variables facon giflib).
 *
 * API :
 *   GIFEncoder.fromFrames(frames, { width, height, maxColors=64, loop=0 }) -> Uint8Array
 *   frames = [ { data: Uint8ClampedArray (RGBA), delayCs: int (centiemes de s) }, ... ]
 */
(function () {
  "use strict";

  function buildPalette(frames, maxColors) {
    // Echantillonne les couleurs sur toutes les frames (cap ~20000 pour la vitesse).
    var samples = [];
    var totalPx = frames.reduce(function (n, f) { return n + f.data.length / 4; }, 0);
    var step = Math.max(1, Math.floor(totalPx / 20000));
    frames.forEach(function (f) {
      var d = f.data;
      for (var i = 0; i < d.length; i += 4 * step) {
        if (d[i + 3] < 128) continue;
        samples.push([d[i], d[i + 1], d[i + 2]]);
      }
    });
    if (!samples.length) samples.push([0, 0, 0]);
    var boxes = [samples];
    while (boxes.length < maxColors) {
      var bi = -1, brange = -1, bch = 0;
      for (var b = 0; b < boxes.length; b++) {
        var bx = boxes[b];
        if (bx.length < 2) continue;
        var mn = [255, 255, 255], mx = [0, 0, 0];
        for (var j = 0; j < bx.length; j++) {
          for (var c = 0; c < 3; c++) {
            if (bx[j][c] < mn[c]) mn[c] = bx[j][c];
            if (bx[j][c] > mx[c]) mx[c] = bx[j][c];
          }
        }
        var r0 = mx[0] - mn[0], r1 = mx[1] - mn[1], r2 = mx[2] - mn[2];
        var r = Math.max(r0, r1, r2), ch = r0 >= r1 && r0 >= r2 ? 0 : r1 >= r2 ? 1 : 2;
        if (r > brange) { brange = r; bi = b; bch = ch; }
      }
      if (bi < 0) break;
      var box = boxes[bi];
      box.sort(function (a, b) { return a[bch] - b[bch]; });
      var mid = box.length >> 1;
      boxes.splice(bi, 1, box.slice(0, mid), box.slice(mid));
    }
    var pal = boxes.map(function (bx) {
      var s = [0, 0, 0];
      for (var j = 0; j < bx.length; j++) for (var c = 0; c < 3; c++) s[c] += bx[j][c];
      var n = bx.length || 1;
      return [Math.round(s[0] / n), Math.round(s[1] / n), Math.round(s[2] / n)];
    });
    // Taille de table = puissance de 2 (mini 2 bits -> 4 entrees).
    var size = 1;
    while ((1 << size) < pal.length) size++;
    if (size < 2) size = 2;
    while (pal.length < (1 << size)) pal.push([0, 0, 0]);
    return pal;
  }

  function mapFrame(data, pal) {
    var n = data.length / 4, idx = new Uint8Array(n), cache = {};
    for (var i = 0, p = 0; p < data.length; p += 4, i++) {
      var r = data[p], g = data[p + 1], b = data[p + 2];
      var key = (r << 16) | (g << 8) | b, best = cache[key];
      if (best === undefined) {
        var bd = Infinity;
        for (var k = 0; k < pal.length; k++) {
          var dr = r - pal[k][0], dg = g - pal[k][1], db = b - pal[k][2];
          var dist = dr * dr + dg * dg + db * db;
          if (dist < bd) { bd = dist; best = k; }
        }
        cache[key] = best;
      }
      idx[i] = best;
    }
    return idx;
  }

  // LZW GIF (paquetage LSB, croissance de code facon giflib).
  function lzw(indices, minCodeSize) {
    var out = [], cur = 0, nbits = 0;
    var CLEAR = 1 << minCodeSize, EOI = CLEAR + 1;
    var size = minCodeSize + 1, dict, next;
    function reset() { dict = {}; next = EOI + 1; size = minCodeSize + 1; }
    function put(code) {
      cur |= code << nbits; nbits += size;
      while (nbits >= 8) { out.push(cur & 0xff); cur >>= 8; nbits -= 8; }
      if (next >= (1 << size) && size < 12) size++;
    }
    function codeOf(s) { var v = dict[s]; return v === undefined ? +s : v; }
    reset();
    put(CLEAR);
    var w = "" + indices[0];
    for (var i = 1; i < indices.length; i++) {
      var c = indices[i], wc = w + "," + c;
      if (dict[wc] !== undefined) { w = wc; }
      else {
        put(codeOf(w));
        if (next >= 4096) { put(CLEAR); reset(); }
        else { dict[wc] = next++; }
        w = "" + c;
      }
    }
    put(codeOf(w));
    put(EOI);
    if (nbits > 0) out.push(cur & 0xff);
    return out;
  }

  function fromFrames(frames, opts) {
    opts = opts || {};
    var width = opts.width, height = opts.height;
    var maxColors = opts.maxColors || 64, loop = opts.loop || 0;
    var pal = buildPalette(frames, maxColors);
    var gctSize = 1; while ((1 << gctSize) < pal.length) gctSize++;
    var minCode = Math.max(2, gctSize);

    var out = [];
    function byte(v) { out.push(v & 0xff); }
    function word(v) { out.push(v & 0xff, (v >> 8) & 0xff); }
    function str(s) { for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xff); }

    str("GIF89a");
    word(width); word(height);
    byte(0x80 | ((gctSize - 1) << 4) | (gctSize - 1)); // GCT présente, résolution, taille
    byte(0); byte(0);
    for (var i = 0; i < pal.length; i++) { byte(pal[i][0]); byte(pal[i][1]); byte(pal[i][2]); }
    // Boucle NETSCAPE
    byte(0x21); byte(0xff); byte(0x0b); str("NETSCAPE2.0"); byte(0x03); byte(0x01); word(loop); byte(0x00);

    frames.forEach(function (fr) {
      var idx = mapFrame(fr.data, pal);
      byte(0x21); byte(0xf9); byte(0x04); byte(0x00); word(fr.delayCs || 8); byte(0x00); byte(0x00); // GCE
      byte(0x2c); word(0); word(0); word(width); word(height); byte(0x00); // descripteur image
      byte(minCode);
      var bytes = lzw(idx, minCode), p = 0;
      while (p < bytes.length) {
        var n = Math.min(255, bytes.length - p);
        byte(n);
        for (var k = 0; k < n; k++) byte(bytes[p + k]);
        p += n;
      }
      byte(0x00);
    });
    byte(0x3b);
    return new Uint8Array(out);
  }

  window.GIFEncoder = { fromFrames: fromFrames };
})();
