/* Spazi pubblici di Taranto – JS vanilla, nessun framework.
   Dati: window.MAPPA_DATI (pagina unica claude.ai) oppure window.MAPPA_DATI_URL (versione normale).
   Navigazione: #mappa, #elenco, #cerco-spazio, #esempio, #metodo, #edificio-<foglio>-<particella>. */
(function () {
  "use strict";

  var STATI = [
    ["in_uso", "In uso"], ["chiuso", "Chiuso"], ["abbandonato", "Abbandonato"],
    ["rudere", "Rudere"], ["da_verificare", "Da verificare"]
  ];
  var TIPI = []; // da meta.tipi (scripts/tipi.py)
  var C = {
    blu: "#212D57", rosso: "#CC1417", bianco: "#FFFFFF", chiuso: "#7F8AB0", rudere: "#7A0C0E",
    verificare: "#6B7280", terra: "#F3F1EC", mare: "#D7E3EE", bordo: "#E3E5EC", bordoForte: "#C9CDD9", testo2: "#4A5373"
  };
  var DA_COMPLETARE = "da completare dopo il sopralluogo";
  var riduciMoto = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var edifici = [], perId = {}, base = null, meta = {}, osm = null;
  var mappa = null, mappaPronta = false, selezionato = null, primaVista = true, spazioDaModulo = null;
  var filtroStato = {}, filtroTipo = {};

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function etichetta(lista, k) { for (var i = 0; i < lista.length; i++) if (lista[i][0] === k) return lista[i][1]; return k; }
  function dataIt(s) {
    if (!s) return "";
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    return m ? m[3] + "/" + m[2] + "/" + m[1] : s;
  }
  function numIt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
  function vuoto(s) { return '<span class="da-completare">' + esc(s || DA_COMPLETARE) + "</span>"; }

  /* ---------- simboli degli stati (SVG) ---------- */
  function simbolo(stato, px, sel) {
    var s = px || 22, h = s / 2, r = h - 2, f, forma;
    switch (stato) {
      case "in_uso": f = C.blu; forma = '<circle cx="' + h + '" cy="' + h + '" r="' + r + '"/>'; break;
      case "chiuso": f = C.chiuso; forma = '<rect x="2" y="2" width="' + (s - 4) + '" height="' + (s - 4) + '"/>'; break;
      case "abbandonato": f = C.rosso; forma = '<polygon points="' + h + ',1.5 ' + (s - 1.5) + ',' + (s - 2.5) + ' 1.5,' + (s - 2.5) + '"/>'; break;
      case "rudere": f = C.rudere; forma = '<polygon points="' + h + ',1 ' + (s - 1) + ',' + h + ' ' + h + ',' + (s - 1) + ' 1,' + h + '"/>'; break;
      default: f = null;
    }
    var pad = sel ? 7 : 0, w = s + pad * 2;
    var out = '<svg width="' + w + '" height="' + w + '" viewBox="' + (-pad) + " " + (-pad) + " " + w + " " + w + '" aria-hidden="true" focusable="false">';
    if (sel) out += '<circle cx="' + h + '" cy="' + h + '" r="' + (h + 4.5) + '" fill="none" stroke="' + C.bianco + '" stroke-width="5"/>' +
      '<circle cx="' + h + '" cy="' + h + '" r="' + (h + 4.5) + '" fill="none" stroke="' + C.rosso + '" stroke-width="3"/>';
    if (f) {
      out += '<g fill="' + f + '" stroke="' + C.bianco + '" stroke-width="2" stroke-linejoin="miter">' + forma + "</g>";
    } else { // da verificare: cerchio vuoto tratteggiato con bordo bianco
      out += '<circle cx="' + h + '" cy="' + h + '" r="' + (r - 1) + '" fill="' + C.bianco + '" fill-opacity="0.85" stroke="' + C.bianco + '" stroke-width="6"/>' +
        '<circle cx="' + h + '" cy="' + h + '" r="' + (r - 1) + '" fill="none" stroke="' + C.verificare + '" stroke-width="2.5" stroke-dasharray="3.2 2.2"/>';
    }
    return out + "</svg>";
  }
  function etichettaStato(stato) {
    return '<span class="stato">' + simbolo(stato, 18) + esc(etichetta(STATI, stato)) + "</span>";
  }

  /* ---------- testi delle schede ---------- */
  function via(p) { return p.via_vicina && p.via_vicina.nome ? p.via_vicina.nome : ""; }
  function zona(p) { return p.zona && p.zona.nome ? p.zona.nome : ""; }
  function titolo(p) {
    if (p.nome) return p.nome;
    var t = etichetta(TIPI, p.tipo_bene);
    if (via(p)) return t + " · " + via(p);
    return t + " · foglio " + p.foglio + ", particella " + p.particella;
  }
  function descrLocali(p) {
    var c = {}, out = [];
    (p.locali || []).forEach(function (l) { c[l.tipo] = (c[l.tipo] || 0) + 1; });
    TIPI.forEach(function (t) { if (c[t[0]]) out.push(c[t[0]] === 1 ? "1 " + (UNO[t[0]] || t[1].toLowerCase()) : c[t[0]] + " " + (t[0] === "altro" ? "altri locali" : t[1].toLowerCase())); });
    return out.join(", ");
  }
  var UNO = { negozi: "negozio o bottega", laboratori: "laboratorio", magazzini: "magazzino o deposito", uffici: "ufficio", scuole: "scuola",
    industriali: "opificio o capannone", sport: "impianto sportivo", ruderi: "rudere (unità collabente)", altro: "altro locale" };
  function nLocali(p) { return p.n_locali === 1 ? "1 locale" : p.n_locali + " locali"; }

  /* ---------- router ---------- */
  var VISTE = ["mappa", "elenco", "cerco-spazio", "esempio", "metodo"];
  function rotta() {
    var h = (location.hash || "").replace(/^#/, "");
    var m = /^edificio-([0-9a-z]+-[0-9a-z]+)$/i.exec(h);
    if (m) return { vista: "scheda", id: m[1] };
    if (VISTE.indexOf(h) >= 0) return { vista: h };
    return { vista: "mappa" };
  }
  function vai() {
    var r = rotta();
    if (r.vista === "scheda" && !perId[r.id]) r = { vista: "scheda", id: null };
    $$(".vista").forEach(function (s) { s.hidden = s.getAttribute("data-vista") !== r.vista; });
    $$("[data-nav]").forEach(function (a) {
      var attivo = a.getAttribute("data-nav") === r.vista;
      if (attivo) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    var t = meta.titolo || "Spazi pubblici di Taranto";
    if (r.vista === "scheda") {
      disegnaScheda(r.id ? perId[r.id].properties : null, $("#scheda"), false);
      if (r.id) { seleziona(r.id, false); t = titolo(perId[r.id].properties) + " – " + t; }
    } else if (r.vista === "elenco") t = "Elenco – " + t;
    else if (r.vista === "metodo") t = "Metodo e fonti – " + t;
    else if (r.vista === "cerco-spazio") {
      t = "Cerco uno spazio – " + t;
      if (spazioDaModulo) {
        var campo = $("#m-spazi");
        if (campo.value.split(/[\s,;]+/).indexOf(spazioDaModulo) < 0) campo.value = (campo.value ? campo.value + ", " : "") + spazioDaModulo;
        spazioDaModulo = null;
      }
    } else if (r.vista === "esempio") {
      t = "Scheda di esempio – " + t;
      if (!$("#scheda-esempio").firstChild) { disegnaScheda(ESEMPIO, $("#scheda-esempio"), true); avvia3d(); }
    }
    if (r.vista !== "esempio") ferma3d(); else riprendi3d();
    document.title = t;
    if (r.vista === "mappa" && mappa) setTimeout(function () { mappa.resize(); }, 0);
    if (!primaVista) {
      window.scrollTo(0, 0);
      var h1 = $('.vista:not([hidden]) h1');
      if (h1) { try { h1.focus({ preventScroll: true }); } catch (e) { h1.focus(); } }
    }
    primaVista = false;
  }

  /* ---------- mappa ---------- */
  /* Base OpenStreetMap (tessere vettoriali OpenMapTiles scaricate da scripts/scarica_base_osm.py).
     Pagina unica: tessere e caratteri incorporati (gzip + base64), serviti con il protocollo "incorporato://".
     Versione normale: file in sito/dati/osm/. Le tessere z14 ci sono solo attorno agli spazi: dove mancano
     il protocollo risponde 404 e MapLibre ingrandisce la tessera z13. */
  var B = { // colori della base (stile.md, sezione «Base OpenStreetMap»)
    terra: C.terra, mare: C.mare, verde: "#E1E6D6", industria: "#ECE9E4", costruito: "#E4E0D7",
    costruitoBordo: "#D6D1C6", bordoStrada: "#D3CEC4", ferrovia: "#8F97B0", etichetta: C.testo2
  };
  function b64(s) {
    var bin = atob(s), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u.buffer;
  }
  function gunzip(buf) {
    return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  }
  function sorgentiOsm() {
    if (osm && typeof osm === "object") {
      maplibregl.addProtocol("incorporato", function (params) {
        var k = decodeURIComponent(params.url.replace("incorporato://", ""));
        var tessera = k.charAt(0) === "t", tab = tessera ? osm.tessere : osm.fonts, c = k.slice(2);
        if (!tab[c]) {
          if (!tessera) return Promise.resolve({ data: new ArrayBuffer(0) });
          var e = new Error("tessera non incorporata"); e.status = 404;
          return Promise.reject(e);
        }
        var buf = b64(tab[c]);
        return (osm.gzip ? gunzip(buf) : Promise.resolve(buf)).then(function (d) { return { data: d }; });
      });
      return { tiles: "incorporato://t/{z}/{x}/{y}", glyphs: "incorporato://f/{fontstack}/{range}", zoom: osm.zoom };
    }
    var dir = new URL(osm || "dati/osm/", location.href).href;
    return { tiles: dir + "{z}/{x}/{y}.pbf", glyphs: dir + "fonts/{fontstack}/{range}.pbf", zoom: (meta.osm || {}).zoom || [10, 14] };
  }
  function stileMappa() {
    var o = sorgentiOsm();
    function cls(v) { return ["match", ["get", "class"], v, true, false]; }
    var nome = ["coalesce", ["get", "name:it"], ["get", "name"]];
    var z = function (a) { return ["interpolate", ["exponential", 1.5], ["zoom"]].concat(a); };
    var STRADE = [
      ["minori", ["minor", "service"], [13, 0.8, 16, 6, 19, 22], 13],
      ["secondarie", ["secondary", "tertiary"], [11, 1, 14, 3.5, 16, 9, 19, 30], 10],
      ["principali", ["motorway", "trunk", "primary"], [10, 1.2, 14, 4.5, 16, 11, 19, 36], 10]
    ];
    var L = [
      { id: "fondo", type: "background", paint: { "background-color": B.terra } },
      { id: "uso-suolo", type: "fill", source: "osm", "source-layer": "landuse",
        filter: cls(["industrial", "railway", "commercial", "retail", "quarry"]), paint: { "fill-color": B.industria } },
      { id: "verde", type: "fill", source: "osm", "source-layer": "landcover",
        filter: cls(["grass", "wood", "farmland", "scrub"]), paint: { "fill-color": B.verde, "fill-opacity": 0.8 } },
      { id: "parchi", type: "fill", source: "osm", "source-layer": "park", paint: { "fill-color": B.verde } },
      { id: "acqua", type: "fill", source: "osm", "source-layer": "water", paint: { "fill-color": B.mare } },
      { id: "corsi-acqua", type: "line", source: "osm", "source-layer": "waterway", paint: { "line-color": B.mare, "line-width": 1.5 } },
      { id: "costruito", type: "fill", source: "osm", "source-layer": "building", minzoom: 13,
        paint: { "fill-color": B.costruito, "fill-outline-color": B.costruitoBordo } },
      { id: "pedonali", type: "line", source: "osm", "source-layer": "transportation", minzoom: 15,
        filter: cls(["path", "track"]), paint: { "line-color": B.bordoStrada, "line-width": 1, "line-dasharray": [2, 2] } }
    ];
    STRADE.forEach(function (s) {
      var bordo = s[2].slice();
      for (var i = 1; i < bordo.length; i += 2) bordo[i] = bordo[i] + (bordo[i] < 2 ? 0.8 : 2);
      L.push({ id: "strade-" + s[0] + "-bordo", type: "line", source: "osm", "source-layer": "transportation", minzoom: s[3],
        filter: ["all", cls(s[1]), ["!=", ["get", "brunnel"], "tunnel"]],
        layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": B.bordoStrada, "line-width": z(bordo) } });
    });
    STRADE.forEach(function (s) {
      L.push({ id: "strade-" + s[0], type: "line", source: "osm", "source-layer": "transportation", minzoom: s[3],
        filter: ["all", cls(s[1]), ["!=", ["get", "brunnel"], "tunnel"]],
        layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": C.bianco, "line-width": z(s[2]) } });
    });
    L.push(
      { id: "ferrovia", type: "line", source: "osm", "source-layer": "transportation",
        filter: ["all", cls(["rail"]), ["!=", ["get", "brunnel"], "tunnel"]],
        paint: { "line-color": B.ferrovia, "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.8, 16, 2] } },
      { id: "ferrovia-traversine", type: "line", source: "osm", "source-layer": "transportation", minzoom: 14,
        filter: ["all", cls(["rail"]), ["!=", ["get", "brunnel"], "tunnel"], ["!", ["has", "service"]]],
        paint: { "line-color": B.ferrovia, "line-width": 5, "line-dasharray": [0.15, 2.5] } },
      // particelle degli spazi (catasto)
      { id: "edifici", type: "fill", source: "base", minzoom: 14, paint: { "fill-color": C.chiuso, "fill-opacity": 0.35 } },
      { id: "edifici-bordo", type: "line", source: "base", minzoom: 14, paint: { "line-color": C.blu, "line-width": 1 } },
      { id: "edificio-sel", type: "line", source: "base", filter: ["==", ["get", "id"], ""], paint: { "line-color": C.rosso, "line-width": 2.5 } },
      // etichette
      { id: "nomi-acqua", type: "symbol", source: "osm", "source-layer": "water_name",
        layout: { "text-field": nome, "text-font": ["Noto Sans Italic"], "text-size": 13, "symbol-placement": "point" },
        paint: { "text-color": B.etichetta, "text-halo-color": B.mare, "text-halo-width": 1.5 } },
      { id: "nomi-strade", type: "symbol", source: "osm", "source-layer": "transportation_name", minzoom: 14,
        filter: cls(["motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service"]),
        layout: { "text-field": nome, "text-font": ["Noto Sans Regular"], "symbol-placement": "line",
          "text-size": ["interpolate", ["linear"], ["zoom"], 14, 10.5, 17, 13], "text-max-angle": 30, "text-padding": 4 },
        paint: { "text-color": B.etichetta, "text-halo-color": C.bianco, "text-halo-width": 1.5 } },
      { id: "nomi-luoghi", type: "symbol", source: "osm", "source-layer": "place",
        filter: cls(["suburb", "quarter", "neighbourhood", "village", "hamlet", "town", "city"]),
        layout: { "text-field": ["upcase", nome], "text-font": ["Noto Sans Bold"], "text-letter-spacing": 0.12,
          "text-size": ["match", ["get", "class"], ["city", "town"], 15, 12], "text-max-width": 8, "text-padding": 8 },
        paint: { "text-color": C.blu, "text-halo-color": C.bianco, "text-halo-width": 2 } }
    );
    return {
      version: 8,
      glyphs: o.glyphs,
      sources: {
        osm: { type: "vector", tiles: [o.tiles], minzoom: o.zoom[0], maxzoom: o.zoom[1],
          attribution: "© OpenStreetMap contributors (ODbL) · OpenMapTiles · OpenFreeMap" },
        base: { type: "geojson", data: base }
      },
      layers: L
    };
  }

  /* simboli degli stati disegnati su canvas (per il livello dei punti): stesse forme della legenda */
  function icona(stato) {
    var k = 2, S = 26, c = document.createElement("canvas");
    c.width = c.height = S * k;
    var g = c.getContext("2d"), h = S / 2, r = h - 3;
    g.scale(k, k);
    g.lineJoin = "miter"; g.lineWidth = 2; g.strokeStyle = C.bianco;
    function chiudi(col) { g.closePath(); g.fillStyle = col; g.fill(); g.stroke(); }
    g.beginPath();
    if (stato === "in_uso") { g.arc(h, h, r, 0, 6.2832); chiudi(C.blu); }
    else if (stato === "chiuso") { g.rect(h - r + 1, h - r + 1, 2 * r - 2, 2 * r - 2); chiudi(C.chiuso); }
    else if (stato === "abbandonato") { g.moveTo(h, 2.5); g.lineTo(S - 2.5, S - 4); g.lineTo(2.5, S - 4); chiudi(C.rosso); }
    else if (stato === "rudere") { g.moveTo(h, 2); g.lineTo(S - 2, h); g.lineTo(h, S - 2); g.lineTo(2, h); chiudi(C.rudere); }
    else {
      g.arc(h, h, r - 1, 0, 6.2832); g.fillStyle = "rgba(255,255,255,.9)"; g.fill(); g.lineWidth = 5; g.stroke();
      g.beginPath(); g.arc(h, h, r - 1, 0, 6.2832); g.setLineDash([3.4, 2.3]); g.lineWidth = 2.5; g.strokeStyle = C.verificare; g.stroke();
    }
    return g.getImageData(0, 0, S * k, S * k);
  }
  function visibile(p) {
    if (filtroStato[p.stato] === false) return false;
    return (p.tipi || []).some(function (t) { return filtroTipo[t] !== false; });
  }
  function puntiFiltrati() {
    return { type: "FeatureCollection", features: edifici.filter(function (f) { return visibile(f.properties); }).map(function (f) {
      return { type: "Feature", geometry: f.geometry, properties: { id: f.properties.id, stato: f.properties.stato } };
    }) };
  }
  function limitiEdifici() {
    var x0 = 180, y0 = 90, x1 = -180, y1 = -90;
    edifici.forEach(function (f) { var c = f.geometry.coordinates; x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); y0 = Math.min(y0, c[1]); y1 = Math.max(y1, c[1]); });
    return [[x0 - 0.003, y0 - 0.003], [x1 + 0.003, y1 + 0.003]];
  }
  function attendiLibreria(cb, n) {
    if (window.maplibregl) return cb(true);
    if ((n || 0) > 100) return cb(false);
    setTimeout(function () { attendiLibreria(cb, (n || 0) + 1); }, 100);
  }
  function erroreMappa() {
    var box = $("#mappa-box");
    box.innerHTML = '<p class="mappa-errore">La mappa interattiva non si è caricata in questo browser. Tutti gli spazi sono nella pagina&nbsp;<a href="#elenco">Elenco</a>.</p>';
  }
  function creaMappa() {
    attendiLibreria(function (ok) {
      if (!ok || (osm && osm.gzip && !window.DecompressionStream)) return erroreMappa();
      var box = $("#mappa-box");
      var b = (meta.osm && meta.osm.bbox) || base.bbox;
      try {
        mappa = new maplibregl.Map({
          container: box, style: stileMappa(),
          bounds: limitiEdifici(),
          fitBoundsOptions: { padding: 30 },
          maxBounds: [[b[0], b[1]], [b[2], b[3]]],
          minZoom: 10, maxZoom: 19, dragRotate: false, pitchWithRotate: false, touchPitch: false,
          cooperativeGestures: true, attributionControl: false, fadeDuration: 0,
          locale: {
            "CooperativeGesturesHandler.WindowsHelpText": "Usa Ctrl + rotella per ingrandire la mappa",
            "CooperativeGesturesHandler.MacHelpText": "Usa ⌘ + rotella per ingrandire la mappa",
            "CooperativeGesturesHandler.MobileHelpText": "Usa due dita per spostare la mappa",
            "NavigationControl.ZoomIn": "Ingrandisci", "NavigationControl.ZoomOut": "Riduci",
            "NavigationControl.ResetBearing": "Orienta a nord",
            "AttributionControl.ToggleAttribution": "Mostra o nascondi le attribuzioni",
            "Map.Title": "Mappa"
          }
        });
      } catch (e) { return erroreMappa(); }
      var att = $(".mappa-attesa"); if (att) att.remove();
      mappa.touchZoomRotate.disableRotation();
      mappa.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      mappa.addControl(new maplibregl.AttributionControl({
        customAttribution: "Particelle: © Agenzia delle Entrate, CC BY 4.0"
      }), "bottom-right");
      mappa.on("error", function (e) { if (window.console) console.warn("Mappa:", e && e.error && e.error.message); });
      mappa.on("load", function () {
        STATI.forEach(function (s) { mappa.addImage("st-" + s[0], icona(s[0]), { pixelRatio: 2 }); });
        mappa.addSource("punti", { type: "geojson", data: puntiFiltrati(), cluster: true, clusterRadius: 36, clusterMaxZoom: 15 });
        mappa.addLayer({ id: "gruppi", type: "circle", source: "punti", filter: ["has", "point_count"],
          paint: { "circle-color": C.blu, "circle-stroke-color": C.bianco, "circle-stroke-width": 2,
            "circle-radius": ["step", ["get", "point_count"], 14, 10, 18, 40, 23] } });
        mappa.addLayer({ id: "gruppi-n", type: "symbol", source: "punti", filter: ["has", "point_count"],
          layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Bold"], "text-size": 13, "text-allow-overlap": true },
          paint: { "text-color": C.bianco } });
        mappa.addLayer({ id: "punto-sel", type: "circle", source: "punti", filter: ["==", ["get", "id"], ""],
          paint: { "circle-radius": 16, "circle-color": C.bianco, "circle-opacity": 0.6, "circle-stroke-color": C.rosso, "circle-stroke-width": 3 } });
        mappa.addLayer({ id: "punti", type: "symbol", source: "punti", filter: ["!", ["has", "point_count"]],
          layout: { "icon-image": ["concat", "st-", ["get", "stato"]], "icon-allow-overlap": true } });
        mappaPronta = true;
        if (selezionato) evidenzia(selezionato);
      });
      function sotto(pt) {
        return mappa.queryRenderedFeatures([[pt.x - 14, pt.y - 14], [pt.x + 14, pt.y + 14]], { layers: ["punti", "gruppi"] });
      }
      mappa.on("click", function (e) {
        if (!mappaPronta) return;
        var ff = sotto(e.point);
        if (!ff.length) return;
        var singolo = ff.filter(function (f) { return !f.properties.cluster; })[0];
        if (singolo) return seleziona(singolo.properties.id, true);
        var g = ff[0];
        mappa.getSource("punti").getClusterExpansionZoom(g.properties.cluster_id).then(function (zz) {
          mappa.easeTo({ center: g.geometry.coordinates, zoom: Math.min(zz + 0.3, 18), duration: riduciMoto ? 0 : 400 });
        });
      });
      mappa.on("mousemove", function (e) {
        if (mappaPronta) mappa.getCanvas().style.cursor = sotto(e.point).length ? "pointer" : "";
      });
    });
  }
  function evidenzia(id) {
    if (!mappaPronta) return;
    mappa.setFilter("punto-sel", ["==", ["get", "id"], id]);
    mappa.setFilter("edificio-sel", ["==", ["get", "id"], id]);
  }
  function seleziona(id, daMappa) {
    selezionato = id;
    evidenzia(id);
    disegnaSintesi(id, daMappa);
  }
  function mostraSullaMappa(id) {
    selezionato = id;
    location.hash = "#mappa";
    setTimeout(function () {
      if (!mappa) return;
      mappa.resize();
      mappa.jumpTo({ center: perId[id].geometry.coordinates, zoom: 16.5 });
      seleziona(id, false);
      $("#mappa-box").scrollIntoView({ block: "start" });
    }, 60);
  }

  function rigaVia(p) {
    if (!via(p)) return "Via: " + vuoto("da completare dopo il sopralluogo");
    return "Vicino a <strong>" + esc(via(p)) + "</strong>" + (zona(p) ? ", zona " + esc(zona(p)) : "") + ' <span class="nota">(da OpenStreetMap, da verificare)</span>';
  }
  function disegnaSintesi(id, daMappa) {
    var p = perId[id].properties, box = $("#sintesi");
    box.innerHTML =
      etichettaStato(p.stato) +
      "<h2>" + esc(titolo(p)) + "</h2>" +
      "<p>" + esc(descrLocali(p)) + "</p>" +
      "<p>" + rigaVia(p) + "</p>" +
      '<div class="azioni"><a class="bottone" href="#edificio-' + esc(p.id) + '">Apri la scheda</a>' +
      '<button type="button" class="bottone secondario" data-interesse="' + esc(p.id) + '">Mi interessa</button></div>';
    if (daMappa && window.innerWidth < 900) {
      box.scrollIntoView({ behavior: riduciMoto ? "auto" : "smooth", block: "nearest" });
    }
  }

  /* ---------- filtri ---------- */
  function disegnaFiltri() {
    var cs = {}, ct = {};
    edifici.forEach(function (f) {
      var p = f.properties;
      cs[p.stato] = (cs[p.stato] || 0) + 1;
      (p.tipi || []).forEach(function (t) { ct[t] = (ct[t] || 0) + 1; });
    });
    $("#filtro-stato").innerHTML = STATI.map(function (s) {
      filtroStato[s[0]] = true;
      return '<label class="opzione"><input type="checkbox" checked id="fs-' + s[0] + '" data-filtro="stato" value="' + s[0] + '">' +
        simbolo(s[0], 18) + "<span>" + esc(s[1]) + ' <span class="n">(' + (cs[s[0]] || 0) + ")</span></span></label>";
    }).join("");
    $("#filtro-tipo").innerHTML = TIPI.filter(function (t) { return ct[t[0]]; }).map(function (t) {
      filtroTipo[t[0]] = true;
      return '<label class="opzione"><input type="checkbox" checked id="ft-' + t[0] + '" data-filtro="tipo" value="' + t[0] + '">' +
        "<span>" + esc(t[1]) + ' <span class="n">(' + ct[t[0]] + ")</span></span></label>";
    }).join("");
    $$("[data-filtro]").forEach(function (cb) {
      cb.addEventListener("change", function () {
        (cb.getAttribute("data-filtro") === "stato" ? filtroStato : filtroTipo)[cb.value] = cb.checked;
        applicaFiltri();
      });
    });
  }
  function applicaFiltri() {
    var n = edifici.filter(function (f) { return visibile(f.properties); }).length;
    if (mappaPronta) mappa.getSource("punti").setData(puntiFiltrati());
    $("#conteggio").textContent = "Spazi mostrati: " + n + " di " + edifici.length;
  }

  function disegnaLegenda(sel) {
    $(sel).innerHTML = STATI.map(function (s) { return "<li>" + simbolo(s[0], 20) + "<span>" + esc(s[1]) + "</span></li>"; }).join("");
  }

  /* ---------- elenco (per zona) ---------- */
  function disegnaElenco() {
    var gruppi = {}, ordine = [];
    edifici.forEach(function (f) {
      var z = zona(f.properties) || "Zona non indicata";
      if (!gruppi[z]) { gruppi[z] = []; ordine.push(z); }
      gruppi[z].push(f.properties);
    });
    $("#elenco").innerHTML = ordine.map(function (z) {
      return "<h2>" + esc(z) + ' <span class="n">(' + gruppi[z].length + ')</span></h2><ul class="elenco">' + gruppi[z].map(function (p) {
        return '<li><a href="#edificio-' + esc(p.id) + '">' + simbolo(p.stato, 20) +
          '<span><span class="titolo">' + esc(titolo(p)) + '</span><span class="meta">' +
          esc(etichetta(STATI, p.stato)) + " · " + esc(descrLocali(p)) + " · ID " + esc(p.id) + "</span></span></a></li>";
      }).join("") + "</ul>";
    }).join("");
    var sel = $("#m-zona");
    ordine.filter(function (z) { return z !== "Zona non indicata"; }).forEach(function (z) {
      var o = document.createElement("option"); o.textContent = z; sel.appendChild(o);
    });
  }

  /* ---------- scheda (vera o di esempio) ---------- */
  function riga(dt, dd) { return "<div><dt>" + esc(dt) + "</dt><dd>" + dd + "</dd></div>"; }
  function sezione(id, tit, corpo, cls) {
    return '<section class="sez ' + (cls || "") + '" aria-labelledby="h-' + id + '"><h2 id="h-' + id + '" tabindex="-1">' + esc(tit) + "</h2>" + corpo + "</section>";
  }
  function link(url, testo) {
    if (!url || !/^https?:\/\//.test(url)) return esc(testo || url || "");
    return '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(testo || url) + "</a>";
  }

  function disegnaScheda(p, box, es) {
    if (!p) {
      box.innerHTML = '<div class="gutter"><h1 tabindex="-1">Scheda non trovata</h1><p>Non c\'è uno spazio con questo identificativo. Torna alla <a href="#mappa">mappa</a> o all\'<a href="#elenco">elenco</a>.</p></div>';
      return;
    }
    var h = [], x = es ? "e-" : ""; // prefisso degli id nella scheda di esempio
    var pericolo = p.stato === "chiuso" || p.stato === "abbandonato" || p.stato === "rudere";
    var marca = es ? ' <span class="tag-esempio">esempio</span>' : "";

    h.push('<nav class="scheda-nav gutter" aria-label="Navigazione"><a href="#mappa">← Torna alla mappa</a>' +
      (es ? "" : '<button type="button" class="collegamento" data-mostra="' + esc(p.id) + '">Vedi sulla mappa</button>') +
      '<a href="#elenco">Elenco degli spazi</a></nav>');
    h.push('<div class="gutter scheda-corpo">');

    // 1. Foto
    var foto = p.foto || [];
    if (foto.length) {
      h.push('<div class="foto-griglia' + (es ? " foto-esempio" : "") + '">' + foto.map(function (f) {
        var img = f.svg ? f.svg : '<img src="' + esc(typeof f === "string" ? f : (f.file || f.url || "")) + '" alt="' + esc(f.descrizione || "Foto del sopralluogo") + '" loading="lazy">';
        return "<figure>" + img + "<figcaption>" + esc(f.descrizione ? f.descrizione + " · " : "") + esc(dataIt(f.data || p.data_sopralluogo)) + "</figcaption></figure>";
      }).join("") + "</div>");
    } else {
      h.push('<div class="foto-vuota" role="img" aria-label="Nessuna foto"><p>Nessuna foto: <strong>da completare dopo il sopralluogo</strong>.</p></div>');
    }

    // 2. Stato e identità
    h.push('<div class="identita">' + etichettaStato(p.stato) +
      ' <span class="nota">' + (p.data_sopralluogo ? "verificato sul posto il " + esc(dataIt(p.data_sopralluogo)) : "non ancora verificato sul posto") + "</span>" +
      '<h1 tabindex="-1">' + esc(titolo(p)) + "</h1>" +
      '<dl class="dati">' +
      riga("Nome", p.nome ? esc(p.nome) : vuoto("non ancora noto – " + DA_COMPLETARE)) +
      riga("Indirizzo", p.indirizzo ? esc(p.indirizzo) : vuoto()) +
      riga("Via più vicina", via(p) ? esc(via(p)) + ' <span class="nota">(da OpenStreetMap, a circa ' + esc(String(p.via_vicina.distanza_m)) + " m dalla particella: non è l'indirizzo, da verificare)</span>" : vuoto("nessuna strada con nome entro 60 m")) +
      riga("Zona", zona(p) ? esc(zona(p)) + ' <span class="nota">(indicativa, da OpenStreetMap)</span>' : vuoto()) +
      "</dl>" +
      (pericolo ? '<div class="pericolo" role="note"><p><strong>Attenzione:</strong> spazio ' + esc(etichetta(STATI, p.stato).toLowerCase()) +
        ". Può essere pericoloso: non entrare e non avvicinarti. Questa scheda serve a conoscere il bene, non a visitarlo.</p></div>" : "") +
      "</div>");

    // 3. Menu rapido
    var voci = [["dati", "Dati"], ["storia", "Storia"], ["costi", "Costi"], ["interesse", "Ti interessa?"], ["idee", "Idee di riuso"], ["3d", "3D"], ["fonti", "Fonti"], ["segnala", "Segnala un errore"]];
    h.push('<nav class="menu-rapido" aria-label="Sezioni della scheda">' + voci.map(function (v) {
      return '<button type="button" data-vai="h-' + x + v[0] + '">' + esc(v[1]) + "</button>";
    }).join("") + "</nav>");

    // 4. Dati
    var u = p.locali || [];
    var tab = '<details><summary>' + (u.length === 1 ? "Il locale" : "I " + u.length + " locali") + ' nell\'elenco 2024</summary><div class="tabella-box"><table><thead><tr><th scope="col">Sub.</th><th scope="col">Categoria</th><th scope="col">ID Comune</th></tr></thead><tbody>' +
      u.map(function (l) { return "<tr><td>" + esc(l.subalterno || "–") + "</td><td>" + esc(l.categoria) + " – " + esc(l.categoria_descrizione) + "</td><td>" + esc(l.id) + "</td></tr>"; }).join("") +
      "</tbody></table></div></details>";
    var altro = [];
    if (p.n_abitazioni) altro.push(p.n_abitazioni + (p.n_abitazioni === 1 ? " abitazione" : " abitazioni"));
    if (p.n_pertinenze) altro.push(p.n_pertinenze + (p.n_pertinenze === 1 ? " pertinenza" : " pertinenze") + " (cantine, autorimesse, aree)");
    h.push(sezione(x + "dati", "Dati dello spazio",
      '<dl class="dati">' +
      riga("Proprietà", "Comune di Taranto: il bene compare nell'elenco dei beni immobili comunali 2024") +
      riga("Locali non residenziali", esc(descrLocali(p))) +
      (altro.length ? riga("Nella stessa particella", esc(altro.join(" e ")) + ' <span class="nota">(non mostrate in questo sito)</span>') : "") +
      riga("Foglio e particella", "foglio " + esc(p.foglio) + ", particella " + esc(p.particella)) +
      riga("Superficie", p.superficie_m2 ? "circa " + esc(numIt(p.superficie_m2)) + " m² <span class=\"nota\">(misurata al sopralluogo)</span>" :
        (p.area_particella_m2 ? "particella di circa " + esc(numIt(p.area_particella_m2)) + " m² <span class=\"nota\">(area sulla mappa catastale, calcolata da Postilva: non è la superficie dei locali)</span>" : vuoto())) +
      riga("Uso originario", p.uso_originario ? esc(p.uso_originario) : vuoto("da completare con la ricerca d'archivio")) +
      riga("Ultimo sopralluogo", p.data_sopralluogo ? esc(dataIt(p.data_sopralluogo)) + (p.autori && p.autori.length ? ", a cura di " + esc(p.autori.join(", ")) : "") : vuoto("nessuno finora")) +
      riga("Posizione", "baricentro della particella catastale: " + esc(p.lat.toFixed(5)) + " N, " + esc(p.lon.toFixed(5)) + " E" + (p.data_sopralluogo ? "" : ' <span class="nota">(da confermare al sopralluogo)</span>')) +
      "</dl>" + tab +
      '<p class="fonte">Fonte: Comune di Taranto, elenco beni immobili 2024 (identificativi e categorie); Agenzia delle Entrate, cartografia catastale, CC BY 4.0 (posizione e area). Dettagli nella sezione Fonti.</p>'));

    // 5. Storia
    var st = (p.storia || []).filter(function (s) { return s && s.testo; });
    h.push(sezione(x + "storia", "La sua storia", st.length ?
      '<ol class="linea-tempo">' + st.map(function (s) {
        return '<li' + (s.chiusura ? ' class="chiusura"' : "") + "><strong>" + esc(dataIt(s.data)) + "</strong> – " + esc(s.testo) + (s.fonte ? ' <span class="fonte">Fonte: ' + esc(s.fonte) + "</span>" : "") + "</li>";
      }).join("") + "</ol>" :
      "<p>" + vuoto("Da completare con la ricerca d'archivio e l'accesso agli atti: ogni passaggio della storia avrà la sua fonte.") + "</p>"));

    // 6. Costi
    var sm = p.stima || {};
    var costi = (sm.min_eur != null && sm.max_eur != null) ?
      '<p class="forchetta">Tra ' + esc(numIt(sm.min_eur)) + " € e " + esc(numIt(sm.max_eur)) + " €</p>" +
      "<p>Livello di stima <strong>" + esc(String(sm.livello || "–")) + " su 3</strong>" + (sm.livello_descr ? " (" + esc(sm.livello_descr) + ")" : "") + "</p>" +
      (sm.voci ? '<div class="tabella-box"><table><thead><tr><th scope="col">Voce</th><th scope="col">Stima</th></tr></thead><tbody>' + sm.voci.map(function (v) {
        return "<tr><td>" + esc(v[0]) + "</td><td>" + esc(v[1]) + "</td></tr>"; }).join("") + "</tbody></table></div>" : "") +
      "<p>Prezzario usato: " + (sm.prezzario ? esc(sm.prezzario) : vuoto("da indicare")) + "</p>" :
      "<p>" + vuoto("Stima non ancora disponibile: da completare dopo il sopralluogo e la valutazione di un tecnico.") + "</p>";
    h.push(sezione(x + "costi", "Quanto costa riaprirlo", costi +
      "<p><strong>Stima parametrica di massima, non perizia.</strong> <a href=\"#metodo\">Come si fanno le stime</a></p>", "costi"));

    // 7. Interesse (candidature)
    h.push(sezione(x + "interesse", "Ti interessa questo spazio?",
      (es ? '<p class="forchetta">3 persone interessate' + marca + "</p><p>2 nuove imprese e 1 associazione hanno indicato questo spazio. Nomi e contatti non sono pubblici.</p>" :
        "<p>Persone interessate finora: <strong>nessuna</strong> <span class=\"nota\">(il modulo non è ancora attivo)</span>.</p>") +
      "<p>Se cerchi un posto per avviare un'attività, diccelo: Postilva non assegna spazi, ma porta al Comune le richieste raccolte.</p>" +
      (es ? '<a class="bottone" href="#cerco-spazio">Cerco uno spazio</a>' : '<button type="button" class="bottone" data-interesse="' + esc(p.id) + '">Mi interessa questo spazio</button>')));

    // 8. Idee di riuso
    var idee = p.idee_riuso || [];
    h.push(sezione(x + "idee", "Idee di riuso dal quartiere",
      (idee.length ? "<ul>" + idee.map(function (i) { return "<li>" + esc(typeof i === "string" ? i : i.testo) + "</li>"; }).join("") + "</ul>" :
        "<p>" + vuoto("Nessuna idea raccolta finora: le idee arriveranno da incontri e segnalazioni, pubblicate dopo verifica.") + "</p>") +
      '<button type="button" class="bottone secondario" data-messaggio="m-' + x + 'idea" aria-expanded="false" aria-controls="m-' + x + 'idea">Proponi un\'idea</button>' +
      '<p class="messaggio" id="m-' + x + 'idea" hidden>Il modulo per proporre idee di riuso non è ancora attivo: arriverà in una prossima versione del sito. Le proposte saranno pubblicate solo dopo una verifica.</p>'));

    // 9. Modello 3D
    h.push(sezione(x + "3d", "Modello 3D", es ?
      '<div class="tre-d"><div class="tre-d-scelta" role="group" aria-label="Versione del modello">' +
      '<button type="button" class="bottone" id="tre-d-oggi" data-3d="oggi" aria-pressed="true">Com\'è oggi</button>' +
      '<button type="button" class="bottone secondario" id="tre-d-riuso" data-3d="riuso" aria-pressed="false">Come potrebbe essere</button></div>' +
      '<div class="tre-d-box" id="tre-d-box"><p class="tre-d-attesa">Caricamento del modello…</p><span class="tre-d-etichetta" id="tre-d-etichetta" hidden>Ipotesi di riuso</span></div>' +
      '<p class="nota">Trascina per girare il modello. È un volume schematico disegnato per questo esempio: nelle schede vere il modello nascerà dai rilievi del sopralluogo. «Come potrebbe essere» è sempre un\'ipotesi, non un progetto.</p></div>' :
      (p.modello_3d ? "<p>" + link(p.modello_3d, "Apri il modello 3D") + "</p><p><strong>Ipotesi di riuso</strong>: la parte «come potrebbe essere» è un'ipotesi, non un progetto.</p>" :
        "<p>" + vuoto("Nessun modello 3D per ora.") + ' <a href="#esempio">Guarda com\'è nella scheda di esempio</a>.</p>')));

    // 10. Fonti
    var fonti = p.fonti || (meta.fonti || [])[p.fonti_rif] || [];
    h.push(sezione(x + "fonti", "Fonti", '<ul class="fonti-lista">' + fonti.map(function (f) {
      return "<li><strong>" + esc(f.titolo) + "</strong> – " + esc(f.ente) + (f.data ? ", " + esc(dataIt(f.data)) : "") +
        (f.licenza ? ", licenza " + esc(f.licenza) : "") + (f.uso ? '. <span class="fonte">Uso: ' + esc(f.uso) + ".</span>" : "") +
        (f.url ? "<br>" + link(f.url, f.url) : "") + "</li>";
    }).join("") + "</ul>"));

    // 11. Segnala un errore
    h.push(sezione(x + "segnala", "Segnala un errore",
      "<p>ID della scheda: <strong>" + esc(p.id) + "</strong> · ultima modifica: <strong>" + esc(dataIt(p.ultima_modifica)) + "</strong></p>" +
      '<button type="button" class="bottone secondario" data-messaggio="m-' + x + 'segnala" aria-expanded="false" aria-controls="m-' + x + 'segnala">Segnala un errore</button>' +
      '<p class="messaggio" id="m-' + x + 'segnala" hidden>Il modulo per le segnalazioni non è ancora attivo: arriverà in una prossima versione del sito. Quando ci sarà, indica l\'ID della scheda (' + esc(p.id) + ").</p>"));

    h.push("</div>");
    box.innerHTML = h.join("");
  }

  /* ---------- scheda di esempio: edificio inventato ---------- */
  function disegnoFoto(tipo) { // illustrazioni schematiche al posto delle foto (nessuna foto vera)
    var muro = "#C9CDD9", scuro = C.testo2, cielo = C.mare, s = '<svg viewBox="0 0 320 200" role="img" aria-label="Disegno di esempio, non è una foto"><rect width="320" height="200" fill="' + cielo + '"/><rect y="150" width="320" height="50" fill="' + C.terra + '"/>';
    if (tipo === "fronte") {
      s += '<rect x="30" y="70" width="260" height="85" fill="' + muro + '" stroke="' + scuro + '"/><polygon points="30,70 95,40 160,70" fill="' + C.chiuso + '" stroke="' + scuro + '"/><polygon points="160,70 225,40 290,70" fill="' + C.chiuso + '" stroke="' + scuro + '"/>';
      for (var i = 0; i < 5; i++) s += '<rect x="' + (45 + i * 50) + '" y="100" width="32" height="55" fill="' + (i === 2 ? scuro : C.bordo) + '" stroke="' + scuro + '"/><line x1="' + (45 + i * 50) + '" y1="100" x2="' + (77 + i * 50) + '" y2="155" stroke="' + scuro + '"/>';
    } else if (tipo === "interno") {
      s = '<svg viewBox="0 0 320 200" role="img" aria-label="Disegno di esempio, non è una foto"><rect width="320" height="200" fill="' + C.bordo + '"/><polygon points="0,200 90,130 230,130 320,200" fill="' + C.terra + '" stroke="' + scuro + '"/><polygon points="0,0 90,50 230,50 320,0" fill="' + muro + '" stroke="' + scuro + '"/><rect x="90" y="50" width="140" height="80" fill="' + C.bianco + '" stroke="' + scuro + '"/>';
      for (var j = 0; j < 4; j++) s += '<line x1="' + (20 + j * 20) + '" y1="' + (12 + j * 11) + '" x2="' + (20 + j * 20) + '" y2="' + (185 - j * 16) + '" stroke="' + scuro + '"/><line x1="' + (300 - j * 20) + '" y1="' + (12 + j * 11) + '" x2="' + (300 - j * 20) + '" y2="' + (185 - j * 16) + '" stroke="' + scuro + '"/>';
      s += '<polygon points="120,50 150,50 135,95" fill="' + cielo + '"/>';
    } else {
      s += '<rect x="60" y="60" width="200" height="95" fill="' + muro + '" stroke="' + scuro + '"/><rect x="60" y="48" width="200" height="12" fill="' + C.chiuso + '" stroke="' + scuro + '"/><rect x="135" y="95" width="50" height="60" fill="' + scuro + '"/><path d="M80 80 l30 22 M250 70 l-40 30 l14 8" stroke="' + C.rosso + '" stroke-width="2" fill="none"/>';
    }
    return s + '<text x="160" y="192" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="11" fill="' + scuro + '">DISEGNO DI ESEMPIO</text></svg>';
  }
  var ESEMPIO = {
    id: "esempio", foglio: "000", particella: "000", nome: "Ex mercato coperto «di esempio»", indirizzo: "via dell'Esempio 12, Taranto",
    via_vicina: { nome: "via dell'Esempio", distanza_m: 4 }, zona: { nome: "Quartiere di esempio" },
    stato: "chiuso", tipo_bene: "negozi", tipi: ["negozi", "magazzini"], data_sopralluogo: "2027-01-16", autori: ["Maria", "Luca"],
    locali: [
      { subalterno: "1", categoria: "C01", categoria_descrizione: "Negozi e botteghe", id: "esempio-1", tipo: "negozi" },
      { subalterno: "2", categoria: "C01", categoria_descrizione: "Negozi e botteghe", id: "esempio-2", tipo: "negozi" },
      { subalterno: "3", categoria: "C01", categoria_descrizione: "Negozi e botteghe", id: "esempio-3", tipo: "negozi" },
      { subalterno: "4", categoria: "C02", categoria_descrizione: "Magazzini e locali di deposito", id: "esempio-4", tipo: "magazzini" }
    ],
    n_locali: 4, n_abitazioni: 0, n_pertinenze: 0, superficie_m2: 620, area_particella_m2: 910, lat: 40.4762, lon: 17.2297,
    uso_originario: "mercato rionale coperto, 14 banchi",
    foto: [
      { svg: disegnoFoto("fronte"), descrizione: "Facciata sulla strada", data: "2027-01-16" },
      { svg: disegnoFoto("interno"), descrizione: "Navata centrale, vista dall'ingresso", data: "2027-01-16" },
      { svg: disegnoFoto("retro"), descrizione: "Retro, lesioni sull'intonaco", data: "2027-01-16" }
    ],
    storia: [
      { data: "1963", testo: "Costruzione del mercato rionale coperto.", fonte: "delibera del Consiglio comunale (esempio)" },
      { data: "1964–2009", testo: "In funzione come mercato di quartiere, fino a 14 banchi.", fonte: "registro delle concessioni (esempio)" },
      { data: "2009", testo: "Chiusura per lavori di adeguamento mai avviati.", fonte: "ordinanza dirigenziale (esempio)", chiusura: true },
      { data: "2009–2027", testo: "Chiuso. Nessun intervento registrato.", fonte: "sopralluogo Postilva del 16/01/2027 (esempio)", chiusura: true }
    ],
    stima: { min_eur: 380000, max_eur: 560000, livello: 1, livello_descr: "solo costi parametrici al metro quadro, dall'esterno",
      prezzario: "Prezzario regionale delle opere pubbliche (nell'esempio le cifre sono inventate)",
      voci: [["Copertura e impermeabilizzazione", "120.000 – 170.000 €"], ["Impianti elettrico e idrico", "90.000 – 130.000 €"],
        ["Infissi e serrande", "50.000 – 80.000 €"], ["Finiture, bagni, accessibilità", "120.000 – 180.000 €"]] },
    idee_riuso: ["Botteghe artigiane con un laboratorio condiviso al centro (incontro di quartiere, esempio)",
      "Mercato dei produttori due giorni a settimana e spazio eventi negli altri (segnalazione, esempio)"],
    fonti: [{ titolo: "Tutte le fonti di questa scheda sono inventate", ente: "scheda di esempio", uso: "mostrare come saranno citate: titolo, ente, data, link" }],
    ultima_modifica: "2027-01-20"
  };

  /* modello 3D dell'esempio: volumi schematici con three.js (caricato solo quando serve) */
  var tre = null;
  function caricaThree(cb) {
    if (window.THREE) return cb(true);
    var sc = document.createElement("script");
    sc.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
    sc.onload = function () { cb(!!window.THREE); };
    sc.onerror = function () { cb(false); };
    document.head.appendChild(sc);
  }
  function avvia3d() {
    caricaThree(function (ok) {
      var box = $("#tre-d-box");
      if (!box) return;
      var att = $(".tre-d-attesa", box);
      if (!ok) { att.textContent = "Il modello 3D non si è caricato in questo browser."; return; }
      var T = window.THREE, r;
      try { r = new T.WebGLRenderer({ antialias: true }); } catch (e) { att.textContent = "Questo browser non può mostrare il modello 3D."; return; }
      att.remove();
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      r.setClearColor(C.mare);
      box.insertBefore(r.domElement, box.firstChild);
      r.domElement.setAttribute("role", "img");
      r.domElement.setAttribute("aria-label", "Modello 3D schematico dell'edificio di esempio");
      var scena = new T.Scene(), cam = new T.PerspectiveCamera(35, 1, 0.1, 500);
      scena.add(new T.HemisphereLight(0xffffff, 0x9a968c, 0.72));
      var sole = new T.DirectionalLight(0xffffff, 0.38); sole.position.set(30, 50, 20); scena.add(sole);
      function mat(col) { return new T.MeshLambertMaterial({ color: col }); }
      function cubo(g, w, hh, d, x, y, zz, col) {
        var m = new T.Mesh(new T.BoxGeometry(w, hh, d), mat(col)); m.position.set(x, y + hh / 2, zz); g.add(m); return m;
      }
      function tetto(g, x, col) { // falda a capanna lungo l'asse z
        var sh = new T.Shape(); sh.moveTo(-8, 0); sh.lineTo(0, 3.2); sh.lineTo(8, 0); sh.lineTo(-8, 0);
        var m = new T.Mesh(new T.ExtrudeGeometry(sh, { depth: 20, bevelEnabled: false }), mat(col));
        m.position.set(x, 6, -10); g.add(m); return m;
      }
      var suolo = new T.Mesh(new T.CircleGeometry(40, 48), mat(B.costruito)); suolo.rotation.x = -Math.PI / 2; scena.add(suolo);
      cubo(scena, 46, 0.06, 7, 0, 0, 15.5, C.bianco); // strada
      // com'è oggi: muri grigi, aperture murate, un tetto mancante
      var oggi = new T.Group();
      cubo(oggi, 32, 6, 20, 0, 0, 0, C.bordoForte);
      tetto(oggi, -8, C.chiuso);
      cubo(oggi, 15.6, 0.3, 19.6, 8, 6, 0, C.testo2); // falda crollata: resta il solaio scuro
      for (var i = 0; i < 5; i++) cubo(oggi, 3.6, 3.6, 0.3, -12 + i * 6, 0, 10.1, C.verificare);
      cubo(oggi, 1.2, 1.4, 0.35, 5, 3.9, 10.1, C.rosso); // cartello di chiusura
      // come potrebbe essere: tetti rifatti, botteghe aperte, pannelli, alberi, piazzetta
      var riuso = new T.Group();
      cubo(riuso, 32, 6, 20, 0, 0, 0, C.terra);
      tetto(riuso, -8, C.blu); tetto(riuso, 8, C.blu);
      for (var j = 0; j < 5; j++) {
        cubo(riuso, 3.6, 3.6, 0.3, -12 + j * 6, 0, 10.1, C.mare);
        cubo(riuso, 4.4, 0.25, 2.2, -12 + j * 6, 3.9, 11.2, j % 2 ? C.chiuso : C.blu); // tende delle botteghe
      }
      for (var k = 0; k < 4; k++) { var pn = cubo(riuso, 3, 0.15, 2.4, 4.6 + (k % 2) * 3.6, 7.6 - 0.0, -5 + Math.floor(k / 2) * 4, C.testo2); pn.rotation.z = -0.38; pn.position.y = 7.9 - (k % 2) * 1.35; }
      cubo(riuso, 30, 0.08, 6, 0, 0, 13.4, C.bordoForte); // piazzetta davanti
      [[-19, 6], [19, 6], [-19, -6], [19, -6]].forEach(function (a) {
        cubo(riuso, 0.5, 2.6, 0.5, a[0], 0, a[1], C.testo2);
        var ch = new T.Mesh(new T.SphereGeometry(2.1, 12, 10), mat("#B9C6A4")); ch.position.set(a[0], 4.2, a[1]); riuso.add(ch);
      });
      riuso.visible = false;
      scena.add(oggi); scena.add(riuso);
      var ang = 0.6, alt = 0.42, dist = 62, attivo = true, trascina = null, fermoFino = 0;
      function misura() {
        var w = box.clientWidth, hh = box.clientHeight;
        r.setSize(w, hh, false); cam.aspect = w / hh; cam.updateProjectionMatrix();
      }
      function disegna() {
        cam.position.set(Math.sin(ang) * Math.cos(alt) * dist, Math.sin(alt) * dist, Math.cos(ang) * Math.cos(alt) * dist);
        cam.lookAt(0, 3, 0);
        r.render(scena, cam);
      }
      function giro(t) {
        if (!attivo) return;
        if (!riduciMoto && !trascina && t > fermoFino) ang += 0.0022;
        disegna();
        tre.raf = requestAnimationFrame(giro);
      }
      var el = r.domElement;
      el.style.touchAction = "pan-y";
      el.addEventListener("pointerdown", function (e) { trascina = { x: e.clientX, y: e.clientY }; try { el.setPointerCapture(e.pointerId); } catch (x) {} });
      el.addEventListener("pointermove", function (e) {
        if (!trascina) return;
        ang -= (e.clientX - trascina.x) * 0.008;
        alt = Math.max(0.12, Math.min(1.2, alt + (e.clientY - trascina.y) * 0.005));
        trascina = { x: e.clientX, y: e.clientY };
        if (riduciMoto) disegna();
      });
      function lascia() { trascina = null; fermoFino = performance.now() + 4000; }
      el.addEventListener("pointerup", lascia); el.addEventListener("pointercancel", lascia);
      window.addEventListener("resize", function () { misura(); disegna(); });
      tre = {
        scegli: function (quale) {
          oggi.visible = quale === "oggi"; riuso.visible = quale === "riuso";
          $("#tre-d-etichetta").hidden = quale !== "riuso";
          [["oggi", "#tre-d-oggi"], ["riuso", "#tre-d-riuso"]].forEach(function (b) {
            var bt = $(b[1]), on = b[0] === quale;
            bt.setAttribute("aria-pressed", String(on)); bt.classList.toggle("secondario", !on);
          });
          disegna();
        },
        ferma: function () { attivo = false; cancelAnimationFrame(tre.raf); },
        riprendi: function () { if (attivo) return; attivo = true; misura(); tre.raf = requestAnimationFrame(giro); }
      };
      misura();
      tre.raf = requestAnimationFrame(giro);
    });
  }
  function ferma3d() { if (tre) tre.ferma(); }
  function riprendi3d() { if (tre) tre.riprendi(); }

  /* ---------- modulo «Cerco uno spazio» (bozza: non salva e non invia) ---------- */
  function inviaModulo(ev) {
    ev.preventDefault();
    var f = ev.target, esito = $("#modulo-esito"), manca = [];
    var chi = (f.querySelector('input[name="chi"]:checked') || {}).value;
    var req = $$('input[name="req"]:checked', f).map(function (i) { return i.value; });
    if (!chi) manca.push("chi sei");
    if (!f.attivita.value.trim()) manca.push("che attività vuoi fare");
    if (!f.contatto.value.trim()) manca.push("un'email o un telefono");
    if (manca.length) {
      esito.innerHTML = "<p><strong>Manca qualcosa:</strong> " + esc(manca.join(", ")) + ".</p>";
    } else {
      var righe = [["Chi sei", chi], ["Attività", f.attivita.value.trim()], ["Metri quadri", f.mq.value || "non indicato"],
        ["Persone", f.persone.value || "non indicato"], ["Cosa ti serve", req.join(", ") || "nessun requisito"],
        ["Zona", f.zona.value || "qualsiasi"], ["Tempi", f.tempi.value || "non indicato"], ["Spazi indicati", f.spazi.value.trim() || "nessuno"]];
      esito.innerHTML = "<p><strong>Bozza: non abbiamo salvato né inviato nulla.</strong> Quando il modulo sarà attivo, a Postilva arriverà questo:</p><dl class=\"dati\">" +
        righe.map(function (r) { return riga(r[0], esc(r[1])); }).join("") + riga("Contatto", "nome ed email o telefono <span class=\"nota\">(mai pubblicati)</span>") + "</dl>";
    }
    esito.hidden = false;
    esito.focus();
  }

  /* ---------- eventi delegati ---------- */
  document.addEventListener("click", function (ev) {
    var t = ev.target.closest ? ev.target.closest("[data-vai],[data-messaggio],[data-salta],[data-interesse],[data-mostra],[data-3d]") : null;
    if (!t) return;
    if (t.hasAttribute("data-salta")) {
      ev.preventDefault();
      var h1 = $('.vista:not([hidden]) h1') || $("#contenuto");
      h1.focus();
      return;
    }
    if (t.hasAttribute("data-vai")) {
      var el = document.getElementById(t.getAttribute("data-vai"));
      if (el) { el.scrollIntoView({ behavior: riduciMoto ? "auto" : "smooth", block: "start" }); try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } }
      return;
    }
    if (t.hasAttribute("data-interesse")) { spazioDaModulo = t.getAttribute("data-interesse"); location.hash = "#cerco-spazio"; return; }
    if (t.hasAttribute("data-mostra")) return mostraSullaMappa(t.getAttribute("data-mostra"));
    if (t.hasAttribute("data-3d")) { if (tre) tre.scegli(t.getAttribute("data-3d")); return; }
    var m = document.getElementById(t.getAttribute("data-messaggio"));
    if (m) { m.hidden = !m.hidden; t.setAttribute("aria-expanded", String(!m.hidden)); }
  });

  /* ---------- avvio ---------- */
  function tabellaTipi() {
    var cat = {}, n = (meta.numeri || {}).per_tipo || {};
    edifici.forEach(function (f) { f.properties.locali.forEach(function (l) { (cat[l.tipo] = cat[l.tipo] || {})[l.categoria] = 1; }); });
    $("#tab-tipi tbody").innerHTML = TIPI.filter(function (t) { return n[t[0]]; }).map(function (t) {
      return "<tr><td>" + esc(t[1]) + "</td><td>" + esc(Object.keys(cat[t[0]] || {}).sort().map(function (c) { return c.charAt(0) + "/" + parseInt(c.slice(1), 10); }).join(", ")) + "</td><td>" + numIt(n[t[0]]) + "</td></tr>";
    }).join("");
  }
  function avvia(dati) {
    edifici = dati.edifici.features;
    base = dati.base;
    meta = dati.meta || {};
    osm = dati.osm || null;
    TIPI = meta.tipi || [];
    edifici.forEach(function (f) { perId[f.properties.id] = f; });
    $$('[data-meta="generato"]').forEach(function (s) { s.textContent = dataIt(meta.generato) || "–"; });
    $$("[data-num]").forEach(function (s) { var v = (meta.numeri || {})[s.getAttribute("data-num")]; s.textContent = v == null ? "–" : numIt(v); });
    disegnaLegenda("#legenda");
    disegnaLegenda("#legenda-metodo");
    disegnaFiltri();
    disegnaElenco();
    tabellaTipi();
    applicaFiltri();
    $("#modulo-spazio").addEventListener("submit", inviaModulo);
    window.addEventListener("hashchange", vai);
    vai();
    creaMappa();
  }

  function carica() {
    if (window.MAPPA_DATI) return avvia(window.MAPPA_DATI);
    var u = window.MAPPA_DATI_URL;
    if (!u || !window.fetch) return erroreMappa();
    Promise.all([fetch(u.edifici).then(function (r) { return r.json(); }), fetch(u.base).then(function (r) { return r.json(); })])
      .then(function (r) { avvia({ edifici: r[0], base: r[1], meta: u.meta, osm: u.osm }); })
      .catch(function () { erroreMappa(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", carica); else carica();
})();
