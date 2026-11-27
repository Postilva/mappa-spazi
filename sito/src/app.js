/* Patrimonio comune – il censimento degli edifici del Comune di Taranto. JS vanilla, nessun framework.
   Dati: window.MAPPA_DATI (pagina unica claude.ai) oppure window.MAPPA_DATI_URL (versione normale).
   Navigazione: #inizio, #mappa, #esempio, #metodo, #edificio-<foglio>-<particella>.
   Segno dello strumento: il quadratino (un immobile). Vuoto = da verificare; con il centro pieno = secondo le
   fonti online è chiuso o probabilmente abbandonato; pieno = visto sul posto. */
(function () {
  "use strict";

  var STATI = [
    ["in_uso", "In uso"], ["chiuso", "Chiuso"], ["abbandonato", "Abbandonato"],
    ["rudere", "Rudere"], ["da_verificare", "Da verificare"]
  ];
  var TIPI = []; // da meta.tipi (scripts/tipi.py)
  var C = { // stessi valori di app.css (:root)
    acc: "#e0b56a", accSoft: "#2a2213", onAcc: "#111111", bg: "#0b0b0c", sup: "#151517", sup2: "#1f1f22", linea: "#27272a",
    ink: "#f4f4f5", ink2: "#a1a1aa", ink3: "#8b8b94", rosso: "#cc1417", bianco: "#ffffff",
    // usati dai disegni della scheda di esempio
    blu: "#3a4466", chiuso: "#7f8ab0", rudere: "#7a0c0e", verificare: "#8b8b94", terra: "#141416", mare: "#1d2a36",
    bordo: "#27272a", bordoForte: "#3a3a40", testo2: "#a1a1aa"
  };
  var DA_COMPLETARE = "da completare dopo il sopralluogo";
  var riduciMoto = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var edifici = [], perId = {}, base = null, meta = {}, osm = null;
  var mappa = null, mappaPronta = false, selezionato = null, primaVista = true;
  var filtroT = "", filtroO = "", testo = "", dopo = null;
  // colori e filtri per «uso» o per «tipo» di locale, come «Tappa · Gruppo» nelle bonifiche (Antonio, 27/11/2026). Si ricorda la scelta.
  var modo = "uso";
  try { if (localStorage.getItem("patrimonio-colori") === "tipo") modo = "tipo"; } catch (e) {}
  function stretto() { return window.matchMedia("(max-width: 860px)").matches; }

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

  /* ---------- simboli: quadratini (SVG) ---------- */
  function segnalato(p) { var i = p && p.online && p.online.indicazione; return i === "chiuso" || i === "probabile_abbandono"; }
  /* uso conosciuto: un solo valore per edificio, in quest'ordine di priorità.
     Colore = uso; quadratino pieno = visto sul posto, solo bordo = da fonti (atti, catasto, online). */
  var USI = [
    ["piano", "Nel piano delle alienazioni", "#e0b56a", "in vendita o da dare in affitto secondo il Comune"],
    ["rudere", "Rudere", "#b0846c", "locali in categoria catastale F/2"],
    ["chiuso", "Chiuso o inutilizzato", "#e36f5a", "secondo atti o notizie"],
    ["in_uso", "In uso", "#5fb3a1", "scuole, uffici, sedi, impianti: secondo le fonti"],
    ["da_capire", "Da capire", "#7ea6e0", "fonti incerte o in contrasto"],
    ["non_noto", "Uso non noto", "#6b6b74", "solo l'elenco del Comune e il catasto"]
  ];
  function verificato(p) { return !!(p.data_sopralluogo || p.verifica); }
  function uso(p) {
    if (p.uso_verificato) return p.uso_verificato;
    if (p.verifica && p.verifica.uso) return p.verifica.uso;
    var o = p.online || {}, i = o.indicazione;
    if (o.piano) return "piano";
    if ((p.locali || []).some(function (l) { return l.categoria === "F02"; })) return "rudere";
    if (i === "chiuso" || i === "probabile_abbandono") return "chiuso";
    if (i === "in_uso" || i === "riconvertito") return "in_uso";
    if (i === "da_capire" || i === "in_lavori") return "da_capire";
    return "non_noto";
  }
  /* colori per tipo di locale (Antonio, 27/11/2026: interruttore Uso · Tipo). Valgono solo per la mappa in modalità «Tipo». */
  var COLORI_TIPO = { negozi: "#e0b56a", laboratori: "#d68fb8", magazzini: "#b0846c", uffici: "#7ea6e0", scuole: "#5fb3a1",
    industriali: "#e36f5a", sport: "#a6c86b", ruderi: "#9a8fd0", altro: "#6b6b74" };
  function coloreTipo(t) { return COLORI_TIPO[t] || C.ink3; }
  function tipoPrevalente(p) { // il tipo con più locali; a parità vince il primo nell'ordine dei tipi
    var c = {}, best = "altro", n = 0;
    (p.locali || []).forEach(function (l) { c[l.tipo] = (c[l.tipo] || 0) + 1; });
    TIPI.forEach(function (t) { if ((c[t[0]] || 0) > n) { n = c[t[0]]; best = t[0]; } });
    if (!n && p.tipi && p.tipi.length) best = p.tipi[0];
    return best;
  }
  function chiave(p) { return modo === "tipo" ? "t-" + tipoPrevalente(p) : "u-" + uso(p); }
  function coloreChiave(k) { return k.charAt(0) === "t" ? coloreTipo(k.slice(2)) : coloreUso(k.slice(2)); }
  function coloreDi(p) { return coloreChiave(chiave(p)); }
  function coloreUso(u) { for (var i = 0; i < USI.length; i++) if (USI[i][0] === u) return USI[i][2]; return C.ink3; }
  function nomeUso(u) { return etichetta(USI, u); }
  function simbolo(u, px, visto, colore) {
    var s = px || 18, c = colore || coloreUso(u), o = '<svg width="' + s + '" height="' + s + '" viewBox="0 0 20 20" aria-hidden="true" focusable="false">';
    o += visto ? '<rect x="2" y="2" width="16" height="16" rx="3" fill="' + c + '"/>'
      : '<rect x="2.5" y="2.5" width="15" height="15" rx="3" fill="' + C.bg + '" stroke="' + c + '" stroke-width="2.8"/>';
    return o + "</svg>";
  }
  function etichettaUso(p) {
    var u = uso(p), visto = !!p.data_sopralluogo;
    return '<span class="stato" style="color:' + coloreUso(u) + '">' + simbolo(u, 16, verificato(p)) + esc(nomeUso(u)) +
      '<span class="fonte-uso">' + (visto ? " · visto sul posto" : p.verifica ? " · verificato su fonte ufficiale" : u === "non_noto" ? "" : " · da fonti") + "</span></span>";
  }

  /* ---------- testi delle schede ---------- */
  function via(p) { return p.via_vicina && p.via_vicina.nome ? p.via_vicina.nome : ""; }
  function zona(p) { return p.zona && p.zona.nome ? p.zona.nome : ""; }
  var INDICAZIONI = { in_uso: "Probabilmente in uso", probabile_abbandono: "Probabile abbandono", chiuso: "Probabilmente chiuso",
    riconvertito: "Probabilmente usato per altro", in_lavori: "Probabilmente in lavori", da_capire: "Da capire", nessuna_info: "Nessuna notizia online" };
  function titolo(p) {
    if (p.nome) return p.nome;
    if (p.online && p.online.nome_probabile) return p.online.nome_probabile;
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
  var VISTE = ["inizio", "mappa", "esempio", "metodo", "privacy"];
  function rotta(hash) {
    var h = (hash == null ? location.hash : hash || "").replace(/^#/, "");
    var par = {}, i = h.indexOf("?");
    if (i >= 0) { // #mappa?tipo=scuole&uso=in_uso&q=tamburi&z=15.2&c=17.23,40.47
      h.slice(i + 1).split("&").forEach(function (kv) {
        var j = kv.indexOf("="); if (j > 0) { try { par[kv.slice(0, j)] = decodeURIComponent(kv.slice(j + 1)); } catch (e) {} }
      });
      h = h.slice(0, i);
    }
    var m = /^edificio-([0-9a-z]+-[0-9a-z]+)$/i.exec(h);
    if (m) return { vista: "scheda", id: m[1], par: par };
    if (VISTE.indexOf(h) >= 0) return { vista: h, par: par };
    if (h === "elenco") return { vista: "mappa", par: par };
    return { vista: "inizio", par: par };
  }

  /* ---------- torna indietro (Antonio, 25/11/2026) ----------
     Ogni passo nella cronologia del browser ricorda da dove si veniva (state.da) e dove si era
     nella pagina (state.y, e per la mappa: scorrimento dell'elenco, quanti ne erano aperti).
     Filtri e inquadratura della mappa stanno nell'indirizzo (#mappa?…), aggiornato con
     replaceState: ricaricare o condividere il link mostra la stessa mappa, e il tasto
     indietro non ripercorre i filtri uno per uno. «#mappa» senza parametri = mappa pulita. */
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  var correnteHash = null, timerSalva = null, mossa = false, vistaDaURL = null;
  function num(v, d) { return Math.round(v * Math.pow(10, d)) / Math.pow(10, d); }
  function hashMappa() {
    var q = [];
    if (modo === "tipo" && !filtroT) q.push("colori=tipo");
    if (filtroT) q.push("tipo=" + encodeURIComponent(filtroT));
    if (filtroO) q.push("uso=" + encodeURIComponent(filtroO));
    if (testo) q.push("q=" + encodeURIComponent(testo));
    if (mossa && mappa) { var c = mappa.getCenter(); q.push("z=" + num(mappa.getZoom(), 2), "c=" + num(c.lng, 5) + "," + num(c.lat, 5)); }
    return "#mappa" + (q.length ? "?" + q.join("&") : "");
  }
  function salvaStato(subito) {
    clearTimeout(timerSalva);
    if (!subito) { timerSalva = setTimeout(function () { salvaStato(true); }, 250); return; }
    if (correnteHash === null) return; // la pagina non è ancora partita
    if (location.hash.split("?")[0] !== correnteHash.split("?")[0]) return; // si è già cambiato pagina
    var s = {}, v = history.state || {};
    for (var k in v) s[k] = v[k];
    s.pc = 1; s.y = Math.round(window.scrollY || 0);
    var lato = $("#lista");
    var hash = location.hash;
    if (rotta().vista === "mappa") {
      s.lt = lato ? lato.scrollTop : 0; s.lim = limite;
      hash = hashMappa();
      var nav = $('[data-nav="mappa"]'); if (nav) nav.setAttribute("href", hash); // «Mappa» nel menu torna alla mappa com'era
    }
    correnteHash = hash;
    try { history.replaceState(s, "", location.pathname + location.search + hash); } catch (e) {}
  }
  function applicaStatoMappa(par) {
    var nT = par.tipo || "", nO = par.uso || "", nQ = par.q || "";
    var nM = nT || par.colori === "tipo" ? "tipo" : nO ? "uso" : (par.colori === "uso" ? "uso" : modo);
    if (nM !== modo) setModo(nM, false);
    if (nT !== filtroT || nO !== filtroO || nQ !== testo) {
      filtroT = nT; filtroO = nO; testo = nQ; $("#cerca").value = testo;
      disegnaFiltri();
      applicaFiltri();
    }
    var c = (par.c || "").split(","), z = parseFloat(par.z), lng = parseFloat(c[0]), lat = parseFloat(c[1]);
    if (isFinite(z) && isFinite(lng) && isFinite(lat)) {
      var ora = mappa && mossa ? mappa.getCenter() : null;
      if (!ora || num(ora.lng, 5) !== lng || num(ora.lat, 5) !== lat || num(mappa.getZoom(), 2) !== z) vistaDaURL = { center: [lng, lat], zoom: z };
    } else if (mossa) { mossa = false; vistaFatta = false; deseleziona(); } // mappa pulita: torna a mostrare tutto
  }
  function applicaVista() {
    if (!mappa || !vistaDaURL) return;
    mappa.resize();
    if (!vistaFatta) inquadraTutti();
    var v = vistaDaURL; vistaDaURL = null;
    mappa.jumpTo(v, { utente: true });
    mossa = true;
  }
  var NOMI_VISTE = { inizio: "Inizio", mappa: "Mappa", metodo: "Come lavoriamo", privacy: "Privacy", esempio: "Scheda di esempio" };
  function etichettaIndietro() { // dove porta «← …» nella scheda
    var s = history.state;
    if (!s || s.da == null) return { href: "#mappa", testo: "Mappa", storia: false };
    var r = rotta(s.da);
    return { href: s.da, testo: r.vista === "scheda" ? "Scheda " + r.id : NOMI_VISTE[r.vista] || "Indietro", storia: true };
  }
  window.addEventListener("scroll", function () { salvaStato(); }, { passive: true });
  document.addEventListener("click", function () { salvaStato(true); }, true); // prima che un link cambi pagina
  window.addEventListener("pagehide", function () { salvaStato(true); });

  function vai() {
    clearTimeout(timerSalva);
    var r = rotta();
    var st = history.state, nuovo = !(st && st.pc);
    if (nuovo) { // un passo nuovo nella cronologia: ricorda da dove si arriva
      st = { pc: 1, da: correnteHash };
      try { history.replaceState(st, "", location.href); } catch (e) {}
    }
    if (r.vista === "mappa") applicaStatoMappa(r.par);
    if (r.vista === "scheda" && !perId[r.id]) r = { vista: "scheda", id: null };
    $$(".vista").forEach(function (s) { s.hidden = s.getAttribute("data-vista") !== r.vista; });
    document.body.classList.toggle("in-mappa", r.vista === "mappa"); // mappa a tutto schermo
    $$("details.hmenu").forEach(function (d) { d.open = false; }); // il menù del telefono si chiude a ogni cambio di pagina
    $$("[data-nav]").forEach(function (a) {
      var attivo = a.getAttribute("data-nav") === r.vista;
      if (attivo) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    var t = meta.titolo || "Patrimonio comune";
    if (r.vista === "scheda") {
      disegnaScheda(r.id ? perId[r.id].properties : null, $("#scheda"), false);
      if (r.id) { seleziona(r.id, false); t = titolo(perId[r.id].properties) + " – " + t; } else t = "Scheda non trovata – " + t;
    } else if (r.vista === "mappa") t = "Mappa – " + t;
    else if (r.vista === "metodo") t = "Come lavoriamo – " + t;
    else if (r.vista === "privacy") t = "Privacy e crediti – " + t;
    else if (r.vista === "esempio") {
      t = "Scheda di esempio – " + t;
      if (!$("#scheda-esempio").firstChild) { disegnaScheda(ESEMPIO, $("#scheda-esempio"), true); avvia3d(); }
      var ie = $("#scheda-esempio a.indietro"), ind = etichettaIndietro();
      if (ie) { ie.setAttribute("href", ind.href); ie.textContent = "← " + ind.testo; if (ind.storia) ie.setAttribute("data-indietro", ""); else ie.removeAttribute("data-indietro"); }
    }
    if (r.vista !== "esempio") ferma3d(); else riprendi3d();
    document.title = t;
    correnteHash = location.hash;
    if (r.vista === "mappa") {
      var nav = $('[data-nav="mappa"]'); if (nav) nav.setAttribute("href", location.hash || "#mappa");
      if (mappa) setTimeout(function () { if (vistaDaURL) applicaVista(); else if (!vistaFatta && !selezionato) inquadraTutti(); else mappa.resize(); }, 0);
    }
    if (dopo) {
      var el = document.getElementById(dopo); dopo = null; primaVista = false;
      if (el) { setTimeout(function () { el.scrollIntoView({ block: "start" }); try { el.focus({ preventScroll: true }); } catch (e) {} }, 0); return; }
    }
    var h1 = $('.vista:not([hidden]) h1');
    if (!nuovo && st.y != null) { // si torna su una pagina già vista: dove si era
      if (r.vista === "mappa" && st.lim > limite) { limite = st.lim; disegnaLista(); disegnaSintesi(selezionato); }
      setTimeout(function () {
        window.scrollTo(0, st.y);
        var lato = $("#lista"); if (lato && r.vista === "mappa") lato.scrollTop = st.lt || 0;
        if (h1 && !primaVista) { try { h1.focus({ preventScroll: true }); } catch (e) {} }
      }, 0);
    } else if (!primaVista) {
      window.scrollTo(0, 0);
      if (h1) { try { h1.focus({ preventScroll: true }); } catch (e) { h1.focus(); } }
    }
    primaVista = false;
  }

  /* ---------- mappa ---------- */
  /* Base OpenStreetMap (tessere vettoriali OpenMapTiles scaricate da scripts/scarica_base_osm.py).
     Pagina unica: tessere e caratteri incorporati (gzip + base64), serviti con il protocollo "incorporato://".
     Versione normale: file in sito/dati/osm/. Le tessere z14 ci sono solo attorno agli spazi: dove mancano
     il protocollo risponde 404 e MapLibre ingrandisce la tessera z13. */
  var B = { // base scura, in tono con il portale
    terra: "#141416", mare: "#0e1820", verde: "#151c17", industria: "#19191c", costruito: "#1f1f23",
    costruitoBordo: "#2a2a30", bordoStrada: "#101012", strada: "#2c2c32", ferrovia: "#4b4f5c", etichetta: "#8b8b94"
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
        layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": B.strada, "line-width": z(s[2]) } });
    });
    L.push(
      { id: "ferrovia", type: "line", source: "osm", "source-layer": "transportation",
        filter: ["all", cls(["rail"]), ["!=", ["get", "brunnel"], "tunnel"]],
        paint: { "line-color": B.ferrovia, "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.8, 16, 2] } },
      { id: "ferrovia-traversine", type: "line", source: "osm", "source-layer": "transportation", minzoom: 14,
        filter: ["all", cls(["rail"]), ["!=", ["get", "brunnel"], "tunnel"], ["!", ["has", "service"]]],
        paint: { "line-color": B.ferrovia, "line-width": 5, "line-dasharray": [0.15, 2.5] } },
      // particelle degli spazi (catasto)
      { id: "edifici", type: "fill", source: "base", minzoom: 14, paint: { "fill-color": C.acc, "fill-opacity": 0.14 } },
      { id: "edifici-bordo", type: "line", source: "base", minzoom: 14, paint: { "line-color": C.acc, "line-width": 1, "line-opacity": 0.7 } },
      { id: "edificio-sel", type: "line", source: "base", filter: ["==", ["get", "id"], ""], paint: { "line-color": C.ink, "line-width": 2.5 } },
      // etichette
      { id: "nomi-acqua", type: "symbol", source: "osm", "source-layer": "water_name",
        layout: { "text-field": nome, "text-font": ["Noto Sans Italic"], "text-size": 13, "symbol-placement": "point" },
        paint: { "text-color": B.etichetta, "text-halo-color": B.mare, "text-halo-width": 1.5 } },
      { id: "nomi-strade", type: "symbol", source: "osm", "source-layer": "transportation_name", minzoom: 14,
        filter: cls(["motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service"]),
        layout: { "text-field": nome, "text-font": ["Noto Sans Regular"], "symbol-placement": "line",
          "text-size": ["interpolate", ["linear"], ["zoom"], 14, 10.5, 17, 13], "text-max-angle": 30, "text-padding": 4 },
        paint: { "text-color": B.etichetta, "text-halo-color": B.terra, "text-halo-width": 1.5 } },
      { id: "nomi-luoghi", type: "symbol", source: "osm", "source-layer": "place",
        filter: cls(["suburb", "quarter", "neighbourhood", "village", "hamlet", "town", "city"]),
        layout: { "text-field": ["upcase", nome], "text-font": ["Noto Sans Bold"], "text-letter-spacing": 0.12,
          "text-size": ["match", ["get", "class"], ["city", "town"], 15, 12], "text-max-width": 8, "text-padding": 8 },
        paint: { "text-color": C.ink2, "text-halo-color": B.terra, "text-halo-width": 2 } }
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

  /* quadratini disegnati su canvas per il livello dei punti: stesse forme di simbolo() */
  function tela(S) { var k = 2, c = document.createElement("canvas"); c.width = c.height = S * k; var g = c.getContext("2d"); g.scale(k, k); return { g: g, S: S, k: k }; }
  function quadro(g, x, y, w, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + w, r); g.arcTo(x + w, y + w, x, y + w, r); g.arcTo(x, y + w, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function icona(u, visto) { // u = chiave «u-…» o «t-…»
    var t = tela(22), g = t.g, c = coloreChiave(u);
    if (visto) { quadro(g, 2.5, 2.5, 17, 3); g.fillStyle = c; g.fill(); g.lineWidth = 1.5; g.strokeStyle = C.bg; g.stroke(); }
    else { quadro(g, 3.5, 3.5, 15, 3); g.fillStyle = C.bg; g.fill(); g.lineWidth = 3.2; g.strokeStyle = c; g.stroke(); }
    return g.getImageData(0, 0, t.S * t.k, t.S * t.k);
  }
  function iconaGruppo(S, u) { // bordo nel colore dell'uso più frequente nel gruppo
    var t = tela(S), g = t.g; quadro(g, 2, 2, S - 4, 6); g.fillStyle = C.sup2; g.fill(); g.lineWidth = 2.4; g.strokeStyle = u === "u-non_noto" || u === "t-altro" ? C.ink3 : coloreChiave(u); g.stroke();
    return g.getImageData(0, 0, t.S * t.k, t.S * t.k);
  }
  function iconaSel() {
    var t = tela(36), g = t.g; quadro(g, 3, 3, 30, 6); g.lineWidth = 3; g.strokeStyle = C.ink; g.stroke();
    return g.getImageData(0, 0, t.S * t.k, t.S * t.k);
  }
  function gruppoOn(p, gr) { return !gr || uso(p) === gr; }
  /* ricerca: senza maiuscole né accenti; ogni parola deve comparire; «scuola» trova anche «scuole» */
  function norma(t) {
    t = String(t || "").toLowerCase();
    if (t.normalize) t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return t;
  }
  function parole(t) {
    return norma(t).split(/[^a-z0-9°-]+/).filter(Boolean).map(function (w) { return w.length >= 4 ? w.replace(/[aeiou]$/, "") : w; });
  }
  var pagliai = {};
  function pagliaio(p) {
    if (pagliai[p.id] == null) pagliai[p.id] = norma(p.id + " " + titolo(p) + " " + via(p) + " " + zona(p) + " " + (p.quartiere || "") + " " +
      ((p.online && p.online.nome_probabile) || "") + " " + (p.tipi || []).map(function (t) { return etichetta(TIPI, t) + " " + (UNO[t] || ""); }).join(" ") +
      " " + nomeUso(uso(p)));
    return pagliai[p.id];
  }
  function visibile(p) {
    if (filtroT && tipoPrevalente(p) !== filtroT && (p.tipi || []).indexOf(filtroT) < 0) return false;
    if (!gruppoOn(p, filtroO)) return false;
    if (!testo) return true;
    var pg = pagliaio(p);
    return parole(testo).every(function (w) { return pg.indexOf(w) >= 0; });
  }
  function puntiFiltrati() {
    return { type: "FeatureCollection", features: edifici.filter(function (f) { return visibile(f.properties); }).map(function (f) {
      return { type: "Feature", geometry: f.geometry, properties: { id: f.properties.id, u: uso(f.properties), t: tipoPrevalente(f.properties), k: chiave(f.properties), v: verificato(f.properties) ? 1 : 0 } };
    }) };
  }
  function limitiCitta() { // il 76% centrale dei punti: la vista parte sulla città, non sui punti isolati
    var xs = edifici.map(function (f) { return f.geometry.coordinates[0]; }).sort(function (a, b) { return a - b; });
    var ys = edifici.map(function (f) { return f.geometry.coordinates[1]; }).sort(function (a, b) { return a - b; });
    var q = function (v, t) { return v[Math.min(v.length - 1, Math.max(0, Math.round(t * (v.length - 1))))]; };
    return [[q(xs, 0.12), q(ys, 0.12)], [q(xs, 0.88), q(ys, 0.88)]];
  }
  var vistaFatta = false;
  function larghezzaPannello() { var p = $("#panel"); return p && !stretto() && !document.body.classList.contains("panel-off") ? p.offsetWidth + 24 : 0; }
  function margini() { return stretto() ? { top: 70, bottom: 90, left: 24, right: 24 } : { top: 40, bottom: 40, left: 40 + larghezzaPannello(), right: 40 }; }
  function inquadraTutti() { // tutti gli immobili nello schermo; va fatto quando la mappa è visibile e ha le sue dimensioni
    if (!mappa) return;
    mappa.resize();
    var c = mappa.getContainer();
    if (!c.clientWidth || !c.clientHeight) return;
    // blocca l'allontanamento: non si può andare oltre la vista che mostra tutti gli immobili
    mappa.setMaxBounds(null);
    mappa.setMinZoom(8);
    var cam = mappa.cameraForBounds(limitiEdifici(), { padding: margini() });
    if (!cam) return;
    mappa.jumpTo(cam);
    // mai oltre la mappa di base: dove finiscono le tessere resterebbe un fondo nero (Antonio, 27/11/2026, come nelle bonifiche).
    // Se il riquadro è più alto o più largo della zona coperta, ci si avvicina quanto basta.
    var t = (meta.osm && (meta.osm.bbox_largo || meta.osm.bbox)) || base.bbox, W = c.clientWidth, H = c.clientHeight; // zona coperta dagli zoom 10–12
    var p1 = mappa.project([t[0], t[1]]), p2 = mappa.project([t[2], t[3]]);
    var dz = Math.log(Math.max(W / Math.abs(p2.x - p1.x), H / Math.abs(p1.y - p2.y), 1)) / Math.LN2;
    if (dz > 0) mappa.jumpTo({ zoom: mappa.getZoom() + dz + 0.02 });
    var bb = mappa.getBounds(), dx = (bb.getEast() - bb.getWest()) * 0.08, dy = (bb.getNorth() - bb.getSouth()) * 0.08;
    mappa.setMinZoom(mappa.getZoom());
    mappa.setMaxBounds([[Math.max(t[0], bb.getWest() - dx), Math.max(t[1], bb.getSouth() - dy)], [Math.min(t[2], bb.getEast() + dx), Math.min(t[3], bb.getNorth() + dy)]]);
    vistaFatta = true;
  }
  var attesaRidimensiona = null;
  window.addEventListener("resize", function () { // se cambia la finestra (o si gira il telefono) ricalcola il limite
    clearTimeout(attesaRidimensiona);
    attesaRidimensiona = setTimeout(function () { if (mappa && vistaFatta && !$('[data-vista="mappa"]').hidden) { var c = mappa.getCenter(), z = mappa.getZoom(); inquadraTutti(); if (z > mappa.getZoom()) mappa.jumpTo({ center: c, zoom: z }); } }, 250);
  });
  function limitiEdifici() {
    var x0 = 180, y0 = 90, x1 = -180, y1 = -90;
    edifici.forEach(function (f) { var c = f.geometry.coordinates; x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); y0 = Math.min(y0, c[1]); y1 = Math.max(y1, c[1]); });
    return [[x0 - 0.002, y0 - 0.002], [x1 + 0.002, y1 + 0.002]];
  }
  function attendiLibreria(cb, n) {
    if (window.maplibregl) return cb(true);
    if ((n || 0) > 100) return cb(false);
    setTimeout(function () { attendiLibreria(cb, (n || 0) + 1); }, 100);
  }
  function erroreMappa() {
    var box = $("#mappa-box");
    box.innerHTML = '<p class="mappa-errore">La mappa interattiva non si è caricata in questo browser. Tutti gli edifici sono nell\'elenco.</p>';
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
          fitBoundsOptions: { padding: margini() },
          maxBounds: [[b[0] - 0.25, b[1] - 0.12], [b[2] + 0.25, b[3] + 0.12]], // largo: su schermi larghi tutti gli immobili devono entrare
          minZoom: 10, maxZoom: 19, dragRotate: false, pitchWithRotate: false, touchPitch: false,
          cooperativeGestures: !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches), attributionControl: false, fadeDuration: 0,
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
        compact: true, customAttribution: "Particelle: © Agenzia delle Entrate, CC BY 4.0"
      }), "bottom-right");
      mappa.on("error", function (e) { if (window.console) console.warn("Mappa:", e && e.error && e.error.message); });
      mappa.on("load", function () {
        var contaGruppo = {};
        chiaviTutte().forEach(function (k) {
          mappa.addImage(k, icona(k, false), { pixelRatio: 2 });
          mappa.addImage(k + "-v", icona(k, true), { pixelRatio: 2 });
          contaGruppo["n_" + k] = ["+", ["case", ["==", ["get", "k"], k], 1, 0]];
          [28, 34, 42].forEach(function (S, i) { mappa.addImage("gr-" + i + "-" + k, iconaGruppo(S, k), { pixelRatio: 2 }); });
        });
        mappa.addImage("sel", iconaSel(), { pixelRatio: 2 });
        mappa.addSource("punti", { type: "geojson", data: puntiFiltrati(), cluster: true, clusterRadius: 36, clusterMaxZoom: 15, clusterProperties: contaGruppo });
        mappa.addLayer({ id: "gruppi", type: "symbol", source: "punti", filter: ["has", "point_count"],
          layout: { "icon-image": immagineGruppo(), "icon-allow-overlap": true,
            "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Bold"], "text-size": 13, "text-allow-overlap": true },
          paint: { "text-color": C.ink } });
        mappa.addLayer({ id: "punto-sel", type: "symbol", source: "punti", filter: ["==", ["get", "id"], ""],
          layout: { "icon-image": "sel", "icon-allow-overlap": true } });
        mappa.addLayer({ id: "punti", type: "symbol", source: "punti", filter: ["!", ["has", "point_count"]],
          layout: { "icon-image": ["concat", ["get", "k"], ["case", ["==", ["get", "v"], 1], "-v", ""]], "icon-allow-overlap": true,
            "symbol-sort-key": ["match", ["get", "k"], ["u-non_noto", "t-altro"], 0, 1] } });
        mappaPronta = true;
        var att = document.querySelector(".maplibregl-ctrl-attrib"); // attribuzioni chiuse nel pulsante «i»
        if (att) att.classList.remove("maplibregl-compact-show");
        if (!$('[data-vista="mappa"]').hidden) { if (vistaDaURL) applicaVista(); else if (!vistaFatta && !selezionato) inquadraTutti(); }
        if (selezionato) evidenzia(selezionato);
      });
      function sotto(pt) {
        return mappa.queryRenderedFeatures([[pt.x - 14, pt.y - 14], [pt.x + 14, pt.y + 14]], { layers: ["punti", "gruppi"] });
      }
      mappa.on("click", function (e) {
        if (!mappaPronta) return;
        var ff = sotto(e.point);
        if (!ff.length) return deseleziona();
        var singolo = ff.filter(function (f) { return !f.properties.cluster; })[0];
        if (singolo) return seleziona(singolo.properties.id, true);
        var g = ff[0];
        mappa.getSource("punti").getClusterExpansionZoom(g.properties.cluster_id).then(function (zz) {
          mappa.easeTo({ center: g.geometry.coordinates, zoom: Math.min(zz + 0.3, 18), duration: riduciMoto ? 0 : 400 }, { utente: true });
        });
      });
      mappa.on("moveend", function (e) {
        if (e.originalEvent || e.utente) mossa = true;
        if (mossa && rotta().vista === "mappa") salvaStato();
      });
      mappa.on("move", piazzaPv);
      // la mappa segue sempre le dimensioni del suo riquadro: se la pagina cambia altezza dopo la partenza
      // (anteprime, barra del browser che sparisce) non resta un fondo nero sotto la mappa (Antonio, 27/11/2026)
      if (window.ResizeObserver) new ResizeObserver(function () { if (!mappa) return; mappa.resize(); if (vistaFatta && !mossa && !selezionato && !$('[data-vista="mappa"]').hidden) inquadraTutti(); piazzaPv(); }).observe(box);
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
  /* anteprima di un punto, come nelle bonifiche (Antonio, 27/11/2026): in alto la fascia nel colore dell'uso (o del tipo),
     sotto codice, nome, una riga e «Apri la scheda». Telefono: cassetto in basso (tirato giù si chiude). Computer: riquadro accanto al punto. */
  var pvBox = null;
  function chiaroSuScuro(hex) { var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; return (0.299 * r + 0.587 * g + 0.114 * b) < 140; }
  function pvHtml(p) {
    var k = chiave(p), col = coloreChiave(k), tipo = k.charAt(0) === "t";
    var on = p.online && p.online.indicazione && p.online.indicazione !== "nessuna_info";
    return '<div class="band" style="background:' + col + ";color:" + (chiaroSuScuro(col) ? "#ffffff" : "#111111") + '">' +
      '<span class="grip" aria-hidden="true"></span><button type="button" class="x" aria-label="Chiudi">✕</button>' +
      '<span class="k">' + (tipo ? "Tipo di locale" : verificato(p) ? "Uso verificato" : "Uso secondo le fonti") + "</span>" +
      '<span class="big">' + esc(tipo ? etichetta(TIPI, k.slice(2)) : nomeUso(uso(p))) + "</span></div>" +
      '<div class="body"><span class="grp"><b>' + esc(p.id) + "</b>" + (zona(p) ? "zona " + esc(zona(p)) : "") + "</span>" +
      '<span class="nm">' + esc(titolo(p)) + "</span>" +
      '<p class="vd">' + esc(descrLocali(p)) + (tipo ? " · " + esc(nomeUso(uso(p)).toLowerCase()) : "") + "</p>" +
      (on ? '<p class="vd">Online: <strong>' + esc(INDICAZIONI[p.online.indicazione] || "") + "</strong></p>" : "") +
      '<a class="go" href="#edificio-' + esc(p.id) + '">Apri la scheda →</a></div>';
  }
  function piazzaPv() { // computer: il riquadro sta accanto al punto, dal lato con più spazio
    if (!pvBox || pvBox.hidden || !selezionato || !mappa || stretto()) return;
    var box = $("#mappa-box"), W = box.clientWidth, H = box.clientHeight, pt = mappa.project(perId[selezionato].geometry.coordinates);
    var w = pvBox.offsetWidth, h = pvBox.offsetHeight, minL = 12 + larghezzaPannello();
    var left = pt.x + 24 + w <= W - 12 ? pt.x + 24 : pt.x - 24 - w;
    left = Math.max(minL, Math.min(left, W - w - 12));
    pvBox.style.left = left + "px"; pvBox.style.top = Math.max(12, Math.min(pt.y - h / 2, H - h - 12)) + "px";
  }
  function centraPv(c, avvicina) { // telefono: il punto al centro dello spazio sopra il cassetto; computer: nello spazio fuori dal pannello. Lo zoom non cambia
    if (!mappa) return;
    var box = $("#mappa-box"), W = box.clientWidth, H = box.clientHeight, pt = mappa.project(c), tx, ty, dentro;
    if (stretto()) { var libero = H - pvBox.offsetHeight; tx = W / 2; ty = libero / 2; dentro = pt.y > 40 && pt.y < libero - 40 && pt.x > 30 && pt.x < W - 30; }
    else { var L = 40 + larghezzaPannello(); tx = (L + W) / 2; ty = H / 2; dentro = pt.x > L && pt.x < W - 400 && pt.y > 40 && pt.y < H - 40; }
    // dentro un gruppo il quadratino non si vede: ci si avvicina finché si separa (i gruppi finiscono allo zoom 15)
    var z = mappa.getZoom(), zz = avvicina && z < 15.6 ? 16 : z;
    if (!dentro || zz !== z) mappa.easeTo({ center: c, zoom: zz, offset: [tx - W / 2, ty - H / 2], duration: riduciMoto ? 0 : 400 });
  }
  function seleziona(id, conAnteprima, avvicina) {
    selezionato = id;
    evidenzia(id);
    disegnaSintesi(id);
    if (conAnteprima && mappa) apriPv(id, avvicina);
  }
  function apriPv(id, avvicina) {
    var p = perId[id].properties;
    if (stretto()) { setPanel(false); var lg = $("#legenda"); if (lg) lg.open = false; }
    pvBox.innerHTML = pvHtml(p); pvBox.hidden = false;
    document.body.classList.add("pv-on");
    centraPv(perId[id].geometry.coordinates, avvicina);
    piazzaPv();
  }
  function deseleziona() {
    var c = selezionato;
    selezionato = null; evidenzia("");
    if (pvBox) pvBox.hidden = true;
    document.body.classList.remove("pv-on");
    if (c) disegnaSintesi(null);
  }
  function chiudiPopup() { deseleziona(); }
  function mostraSullaMappa(id) {
    selezionato = id;
    var c = perId[id].geometry.coordinates;
    location.hash = "#mappa?z=16.5&c=" + num(c[0], 5) + "," + num(c[1], 5);
    setTimeout(function () { if (mappa) seleziona(id, true); }, 60);
  }

  function rigaVia(p) {
    if (!via(p)) return vuoto("via da completare dopo il sopralluogo");
    return "Vicino a " + esc(via(p)) + (zona(p) ? ", zona " + esc(zona(p)) : "") + ' <span class="nota">(da OpenStreetMap)</span>';
  }
  function disegnaSintesi(id) { // segna nell'elenco a fianco lo spazio scelto sulla mappa
    $$("#lista a[aria-current]").forEach(function (a) { a.removeAttribute("aria-current"); });
    if (id) { // se la voce è oltre il blocco mostrato, allunga l'elenco fino a lei
      for (var i = 0; i < visibili.length; i++) if (visibili[i].properties.id === id) { if (i >= limite) { limite = Math.ceil((i + 1) / PASSO) * PASSO; disegnaLista(); } break; }
    }
    var voce = id && $('#lista a[href="#edificio-' + id + '"]');
    if (voce) { voce.setAttribute("aria-current", "true"); if (window.innerWidth >= 860) voce.scrollIntoView({ block: "nearest" }); }
  }

  /* ---------- filtri, elenco a fianco della mappa ---------- */
  function chips(sel, voci, attivo, cb) {
    var box = $(sel);
    box.innerHTML = voci.map(function (v) {
      return '<button type="button" data-v="' + esc(v[0]) + '" aria-pressed="' + (v[0] === attivo) + '">' +
        (v[3] ? '<i class="pallino" style="border-color:' + v[3] + '"></i>' : "") + esc(v[1]) +
        (v[2] != null ? '<span class="n">' + v[2] + "</span>" : "") + "</button>";
    }).join("");
    box.onclick = function (e) {
      var b = e.target.closest("button"); if (!b) return;
      $$("button", box).forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      cb(b.getAttribute("data-v"));
    };
  }
  function disegnaFiltri() { // i filtri seguono l'interruttore: gli usi o i tipi di locale, con quanti sono
    if (modo === "tipo") {
      var ct = {};
      edifici.forEach(function (f) { var t = tipoPrevalente(f.properties); ct[t] = (ct[t] || 0) + 1; });
      chips("#filtri-chips", [["", "Tutti", null]].concat(TIPI.filter(function (t) { return ct[t[0]]; }).map(function (t) { return [t[0], t[1], ct[t[0]], coloreTipo(t[0])]; })),
        filtroT, function (v) { filtroT = v; applicaFiltri(); });
    } else {
      chips("#filtri-chips", [["", "Tutti", null]].concat(USI.map(function (u) { return [u[0], u[1], contaUso(u[0]), u[2]]; })),
        filtroO, function (v) { filtroO = v; applicaFiltri(); });
    }
  }
  function setModo(m, ricorda) {
    modo = m; filtroT = ""; filtroO = "";
    $$(".seg button").forEach(function (b) { b.setAttribute("aria-checked", String(b.getAttribute("data-c") === m)); });
    if (ricorda !== false) { try { localStorage.setItem("patrimonio-colori", m); } catch (e) {} }
    disegnaFiltri(); disegnaLegendaMappa();
    if (mappaPronta) mappa.setLayoutProperty("gruppi", "icon-image", immagineGruppo());
    if (selezionato && pvBox && !pvBox.hidden) pvBox.innerHTML = pvHtml(perId[selezionato].properties);
    if (edifici.length) applicaFiltri();
  }
  function chiaviTutte() { return USI.map(function (u) { return "u-" + u[0]; }).concat(TIPI.map(function (t) { return "t-" + t[0]; })); }
  function immagineGruppo() { // il gruppo prende il colore della chiave più frequente (a parità vince la prima nell'ordine)
    var ks = modo === "tipo" ? TIPI.map(function (t) { return "t-" + t[0]; }) : USI.map(function (u) { return "u-" + u[0]; });
    var prev = ["case"];
    ks.slice(0, -1).forEach(function (k) {
      prev.push(["all"].concat(ks.filter(function (v) { return v !== k; }).map(function (v) { return [">=", ["get", "n_" + k], ["get", "n_" + v]]; })), k);
    });
    prev.push(ks[ks.length - 1]);
    return ["concat", ["step", ["get", "point_count"], "gr-0-", 10, "gr-1-", 40, "gr-2-"], prev];
  }
  function disegnaLegendaMappa() { // legenda sulla mappa con i numeri, come «Tappa da fare» nelle bonifiche
    var voci;
    if (modo === "tipo") {
      var ct = {};
      edifici.forEach(function (f) { var t = tipoPrevalente(f.properties); ct[t] = (ct[t] || 0) + 1; });
      voci = TIPI.filter(function (t) { return ct[t[0]]; }).map(function (t) { return [simbolo("", 15, false, coloreTipo(t[0])), t[1], ct[t[0]]]; });
      $("#lg-t").textContent = "Tipo di locale (il più presente)";
    } else {
      voci = USI.map(function (u) { return [simbolo(u[0], 15, false), u[1], contaUso(u[0])]; });
      $("#lg-t").textContent = "Uso conosciuto";
    }
    $("#lg-voci").innerHTML = voci.map(function (v) { return "<li>" + v[0] + "<span>" + esc(v[1]) + '</span><span class="n">' + v[2] + "</span></li>"; }).join("");
    $("#lg-x").innerHTML = '<p class="lg-x">' + simbolo("non_noto", 15, false, C.ink2) + "<span>solo bordo: secondo le fonti</span></p>" +
      '<p class="lg-x">' + simbolo("non_noto", 15, true, C.ink2) + "<span>pieno: verificato, sul posto o su una fonte ufficiale</span></p>";
  }
  function applicaFiltri() {
    var vis = edifici.filter(function (f) { return visibile(f.properties); });
    if (mappaPronta) mappa.getSource("punti").setData(puntiFiltrati());
    $("#conteggio").textContent = edifici.length + " edifici";
    $("#lcount").textContent = vis.length + (vis.length === 1 ? " edificio mostrato" : " edifici mostrati");
    if (selezionato && !vis.some(function (f) { return f.properties.id === selezionato; })) deseleziona();
    limite = PASSO;
    disegnaLista(vis);
    segnaFiltri();
    disegnaSintesi(selezionato);
    if (rotta().vista === "mappa") salvaStato();
  }
  var PASSO = 30, limite = PASSO, visibili = [];
  function disegnaLista(vis) {
    if (vis) visibili = vis; else vis = visibili;
    $("#lista").innerHTML = vis.length ? vis.slice(0, limite).map(function (f) {
      var p = f.properties, on = p.online && p.online.indicazione && p.online.indicazione !== "nessuna_info";
      var u = uso(p), col = coloreDi(p);
      return '<li><a href="#edificio-' + esc(p.id) + '" data-sel="' + esc(p.id) + '"><span class="cod" style="border-color:' + col + ';color:' + col + '">' + esc(p.id) + "</span><span><b>" + esc(titolo(p)) +
        '</b><span class="meta">' + esc(nomeUso(u)) + " · " + esc(descrLocali(p)) + (zona(p) ? " · zona " + esc(zona(p)) : "") + "</span></span></a></li>";
    }).join("") + (vis.length > limite ? '<li class="altri"><button type="button" class="bottone secondario" data-altri>Mostra altri ' +
      Math.min(PASSO, vis.length - limite) + " (" + (vis.length - limite) + " rimasti)</button></li>" : "")
      : '<li class="altri nota">Nessun edificio con questi filtri. <button type="button" class="collegamento" data-azzera>Togli i filtri</button></li>';
  }
  function azzeraFiltri() {
    filtroT = ""; filtroO = ""; testo = ""; $("#cerca").value = "";
    disegnaFiltri();
    applicaFiltri();
  }
  function segnaFiltri() { // (il pulsante «Filtri» del telefono non c'è più: i filtri stanno nel pannello, 27/11/2026)
    var b = $("#apri-filtri"); if (!b) return;
    var n = (filtroT ? 1 : 0) + (filtroO ? 1 : 0);
    b.querySelector("span").textContent = n ? "Filtri · " + n + (n === 1 ? " attivo" : " attivi") : "Filtri";
    b.classList.toggle("attivo", n > 0);
  }
  function cimaElenco() { // l'elenco torna all'inizio
    limite = PASSO; disegnaLista();
    var l = $("#lista"); if (l) l.scrollTop = 0;
  }

  function contaUso(u) { return edifici.filter(function (f) { return uso(f.properties) === u; }).length; }
  function disegnaLegenda() {
    if ($("#legenda") && !$("#lg-voci")) $("#legenda").innerHTML = USI.map(function (u) { return "<div>" + simbolo(u[0], 15, false) + "<span>" + esc(u[1]) + " · " + contaUso(u[0]) + "</span></div>"; }).join("") +
      '<p class="nota">Bordo: uso secondo le fonti. Pieno: verificato, sul posto o su una fonte ufficiale.</p>';
    $("#legenda-metodo").innerHTML = USI.map(function (u) {
      return "<li>" + simbolo(u[0], 20, false) + "<span><b>" + esc(u[1]) + "</b> (" + contaUso(u[0]) + "): " + esc(u[3]) + "</span></li>";
    }).join("") + "<li>" + simbolo("in_uso", 20, true) + "<span>Quadratino pieno: uso <b>verificato</b>, visto sul posto (" +
      edifici.filter(function (f) { return f.properties.data_sopralluogo; }).length + ") o confermato da una fonte ufficiale, come le scuole in uso nell'anagrafe del Ministero dell'Istruzione (" +
      edifici.filter(function (f) { return f.properties.verifica && !f.properties.data_sopralluogo; }).length + ").</span></li>";
  }
  /* ---------- notizie in primo piano (dati/notizie.json): fascia a scorrimento ---------- */
  function riempi(t) { // {chiave} = meta.numeri, {uso:chiave} = edifici con quell'uso
    return String(t || "").replace(/\{(uso:)?([a-z_]+)\}/g, function (m, u, k) {
      var v = u ? contaUso(k) : (meta.numeri || {})[k]; return v == null ? m : numIt(v);
    });
  }
  function disegnaNotizie() {
    var N = meta.notizie || [], box = $("#notizie");
    if (!box) return;
    if (!N.length) { $(".fascia").hidden = true; return; }
    box.innerHTML = N.map(function (n, i) {
      var p = n.pulsante || {}, attr = p.filtro_uso ? ' data-online="' + esc(p.filtro_uso) + '"' : p.zona ? ' data-zona="' + esc(p.zona) + '"' : "";
      return '<article class="notizia" id="notizia-' + i + '" aria-roledescription="notizia" aria-label="' + (i + 1) + " di " + N.length + '">' +
        '<p class="kicker">' + esc(n.etichetta || "") + (n.data ? " · " + esc(dataIt(n.data)) : "") + "</p>" +
        "<h2>" + riempi(n.titolo) + "</h2>" + (n.testo ? "<p>" + esc(riempi(n.testo)) + "</p>" : "") +
        '<div class="azioni-pp">' + (p.testo ? '<a class="bottone" href="' + esc(p.href || "#mappa") + '"' + attr + "><span>" + esc(riempi(p.testo)) + "</span></a>" : "") +
        (n.link ? '<a class="link-fonte" href="' + esc(n.link.url) + '" target="_blank" rel="noopener">' + esc(n.link.testo) + " ›</a>" : "") + "</div>" +
        (n.nota ? '<p class="nota">' + esc(riempi(n.nota)) + "</p>" : "") + "</article>";
    }).join("");
    var pt = $("#notizie-puntini");
    pt.innerHTML = N.map(function (n, i) { return '<button type="button" data-n="' + i + '" aria-label="Notizia ' + (i + 1) + '"></button>'; }).join("");
    var att = 0;
    function segna() { $$("button", pt).forEach(function (b, i) { b.setAttribute("aria-current", i === att ? "true" : "false"); }); $("#notizia-prima").disabled = att === 0; $("#notizia-dopo").disabled = att === N.length - 1; }
    function vaiA(i) { att = Math.max(0, Math.min(N.length - 1, i)); box.scrollTo({ left: box.clientWidth * att, behavior: riduciMoto ? "auto" : "smooth" }); segna(); }
    pt.onclick = function (e) { var b = e.target.closest("button"); if (b) vaiA(+b.getAttribute("data-n")); };
    $("#notizia-prima").onclick = function () { vaiA(att - 1); };
    $("#notizia-dopo").onclick = function () { vaiA(att + 1); };
    box.addEventListener("keydown", function (e) { if (e.key === "ArrowRight") { vaiA(att + 1); e.preventDefault(); } if (e.key === "ArrowLeft") { vaiA(att - 1); e.preventDefault(); } });
    var t0 = null;
    box.addEventListener("scroll", function () { clearTimeout(t0); t0 = setTimeout(function () { var i = Math.round(box.scrollLeft / Math.max(1, box.clientWidth)); if (i !== att) { att = i; segna(); } }, 80); });
    if (N.length < 2) $(".notizie-nav").hidden = true;
    segna();
  }

  function disegnaUsi() { // barra degli usi in home
    var tot = edifici.length, box = $("#usi");
    if (!box) return;
    box.innerHTML = '<div class="barra-usi" role="img" aria-label="Edifici per uso conosciuto">' + USI.map(function (u) {
      var n = contaUso(u[0]); return n ? '<i style="flex:' + n + ';background:' + u[2] + '" title="' + esc(u[1]) + ": " + n + '"></i>' : "";
    }).join("") + '</div><div class="usi-righe">' + USI.map(function (u) {
      return '<a href="#mappa" data-online="' + u[0] + '"><i style="background:' + u[2] + '"></i><b>' + contaUso(u[0]) + "</b><span>" + esc(u[1]) + '<small>' + esc(u[3]) + "</small></span></a>";
    }).join("") + "</div>";
  }

  /* ---------- pagina iniziale ---------- */
  var ICO = { negozi: '<path d="M4 9h16l-1-4H5zM5 9v10h14V9M10 19v-5h4v5"/>', scuole: '<path d="M3 9l9-5 9 5-9 5zM7 11v5c3 2 7 2 10 0v-5"/>',
    uffici: '<path d="M6 3h12v18H6zM9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>', ruderi: '<path d="M4 20h16M6 20V9l4-3v14M14 20v-7l4 2v5"/>',
    industriali: '<path d="M3 20V10l5 3V10l5 3V6h3v14zM3 20h18"/>', magazzini: '<path d="M3 9l9-5 9 5v11H3zM7 20v-7h10v7M7 16h10"/>',
    laboratori: '<path d="M9 3h6M10 3v6l-5 10h14l-5-10V3"/>', sport: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c3 3 3 13 0 16M12 4c-3 3-3 13 0 16"/>',
    altro: '<path d="M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5zM13 13h6v6h-6z"/>' };
  function disegnaInizio() {
    // costellazione: gli immobili nella loro posizione (proiezione semplice, nord in alto)
    var lo0 = 180, lo1 = -180, la0 = 90, la1 = -90;
    edifici.forEach(function (f) { var c = f.geometry.coordinates; lo0 = Math.min(lo0, c[0]); lo1 = Math.max(lo1, c[0]); la0 = Math.min(la0, c[1]); la1 = Math.max(la1, c[1]); });
    var cs = Math.cos((la0 + la1) / 2 * Math.PI / 180), sc = Math.min(960 / ((lo1 - lo0) * cs), 1080 / (la1 - la0));
    if ($("#costellazione")) $("#costellazione").innerHTML = edifici.map(function (f, i) {
      var c = f.geometry.coordinates, x = 20 + (c[0] - lo0) * cs * sc, y = 20 + (la1 - c[1]) * sc, s = segnalato(f.properties);
      return '<rect x="' + (x - 7).toFixed(1) + '" y="' + (y - 7).toFixed(1) + '" width="14" height="14" rx="2.5" style="--k:' + i + '" fill="' +
        (s || f.properties.data_sopralluogo ? C.acc : C.bg) + '" stroke="' + C.acc + '" stroke-width="2.5"' + (s ? "" : ' opacity=".8"') + "/>";
    }).join("");
    $("#quadri").innerHTML = edifici.map(function (f) {
      var p = f.properties; return "<i" + (p.data_sopralluogo ? ' class="v"' : p.online ? ' class="c"' : "") + "></i>";
    }).join("");
    var n = (meta.numeri || {}).per_tipo || {};
    $("#tipi").innerHTML = TIPI.filter(function (t) { return n[t[0]]; }).map(function (t) {
      return '<a class="tipo" href="#mappa" data-tipo="' + t[0] + '"><span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
        (ICO[t[0]] || ICO.altro) + '</svg></span><span><b>' + esc(t[1]) + '</b><span class="sub">locali</span></span><span class="num">' + numIt(n[t[0]]) + "</span></a>";
    }).join("");
    var ord = { alta: 0, media: 1, bassa: 2 };
    var seg = edifici.filter(function (f) { return segnalato(f.properties); }).sort(function (a, b) {
      var x = ord[a.properties.online.certezza], y = ord[b.properties.online.certezza]; return (x == null ? 3 : x) - (y == null ? 3 : y);
    });
    if ($("#segnalati")) $("#segnalati").innerHTML = seg.map(function (f) {
      var p = f.properties, o = p.online;
      return '<a href="#edificio-' + esc(p.id) + '"><span class="cod pieno">' + esc(p.id) + "</span><div><b>" + esc(titolo(p)) + "</b><span>" +
        esc(INDICAZIONI[o.indicazione]) + (o.certezza ? ", certezza " + esc(o.certezza) : "") + (zona(p) ? " · zona " + esc(zona(p)) : "") + '</span></div><span class="freccia">›</span></a>';
    }).join("");
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

  /* ---------- contatti (dati/contatti.json): modulo se c'è, altrimenti email ---------- */
  function contatti() { return meta.contatti || {}; }
  function linkScrivici(id) {
    var c = contatti();
    if (c.modulo) {
      var u = c.modulo + (id && c.modulo_campo_scheda ? (c.modulo.indexOf("?") < 0 ? "?" : "&") + "usp=pp_url&" + c.modulo_campo_scheda + "=" + encodeURIComponent(id) : "");
      return 'href="' + esc(u) + '" target="_blank" rel="noopener"';
    }
    if (c.email) return 'href="mailto:' + esc(c.email) + (id ? "?subject=" + encodeURIComponent("Patrimonio comune, scheda " + id) : "") + '"';
    return 'href="#privacy"';
  }
  function disegnaContatti() {
    var c = contatti();
    $$('[data-contatto="testo"]').forEach(function (el) {
      el.innerHTML = (c.modulo ? 'con il <a href="' + esc(c.modulo) + '" target="_blank" rel="noopener">modulo «Scrivici»</a>, oppure ' : "") +
        (c.email ? 'a <a href="mailto:' + esc(c.email) + '">' + esc(c.email) + "</a>" : "") +
        (c.pec ? " (posta certificata: " + esc(c.pec) + ")" : "");
    });
    $$('[data-contatto="nota-modulo"]').forEach(function (el) {
      el.innerHTML = c.modulo ? 'Il modulo «Scrivici» è un modulo di Google (Google Moduli): quello che scrivi passa da Google e arriva all\'associazione. Nome ed email sono facoltativi e servono solo a risponderti. <a href="https://policies.google.com/privacy?hl=it" target="_blank" rel="noopener">Informativa di Google</a>.' : "";
    });
    $$('[data-contatto="scrivici"]').forEach(function (a) {
      if (c.modulo) { a.setAttribute("href", c.modulo); a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener"); a.removeAttribute("data-vai-dopo"); }
    });
  }

  function pianta(id, pe) { // pe: scheda con un contorno suo (la scheda di esempio)
    var f = null;
    if (pe && pe.contorno) f = { geometry: { type: "Polygon", coordinates: [pe.contorno] } };
    else (base && base.features || []).forEach(function (b) { if (b.properties.id === id) f = b; });
    if (!f) return "";
    var g = f.geometry, anelli = g.type === "Polygon" ? g.coordinates : [].concat.apply([], g.coordinates);
    var pts = [].concat.apply([], anelli), x0 = 180, x1 = -180, y0 = 90, y1 = -90;
    pts.forEach(function (c) { x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); y0 = Math.min(y0, c[1]); y1 = Math.max(y1, c[1]); });
    var cs = Math.cos((y0 + y1) / 2 * Math.PI / 180), w = Math.max((x1 - x0) * cs, 1e-6), hh = Math.max(y1 - y0, 1e-6), sc = Math.min(360 / w, 220 / hh);
    var ox = 200 - w * sc / 2, oy = 130 - hh * sc / 2;
    function P(c) { return (ox + (c[0] - x0) * cs * sc).toFixed(1) + "," + (oy + (y1 - c[1]) * sc).toFixed(1); }
    var c = pe && pe.contorno ? [pe.lon, pe.lat] : perId[id].geometry.coordinates, q = P(c).split(","), griglia = "";
    for (var i = 0; i <= 400; i += 40) griglia += '<line x1="' + i + '" y1="0" x2="' + i + '" y2="260" stroke="#1d1d20"/>';
    for (i = 0; i <= 260; i += 40) griglia += '<line x1="0" y1="' + i + '" x2="400" y2="' + i + '" stroke="#1d1d20"/>';
    var a = (pe && pe.contorno ? pe : perId[id].properties).area_particella_m2;
    return '<svg viewBox="0 0 400 260" role="img" aria-label="Contorno della particella ' + esc(id) + '">' + griglia +
      anelli.map(function (r) { return '<polygon points="' + r.map(P).join(" ") + '" fill="' + C.accSoft + '" stroke="' + C.acc + '" stroke-width="2.5"/>'; }).join("") +
      '<rect x="' + (q[0] - 7) + '" y="' + (q[1] - 7) + '" width="14" height="14" rx="2.5" fill="none" stroke="' + C.acc + '" stroke-width="2.5"/>' +
      '<text x="392" y="252" text-anchor="end" font-family="IBM Plex Mono,monospace" font-size="11" fill="' + C.ink3 + '">' + (a ? "≈ " + numIt(a) + " m² · " : "") + "N ↑</text></svg>";
  }

  function disegnaScheda(p, box, es) {
    if (!p) {
      box.innerHTML = '<div class="g"><div class="w testo"><h1 tabindex="-1">Scheda non trovata</h1><p>Non c\'è un edificio con questo codice: controlla l\'indirizzo, oppure cercalo sulla <a href="#mappa">mappa</a>.</p></div></div>';
      return;
    }
    var h = [], x = es ? "e-" : ""; // prefisso degli id nella scheda di esempio
    var pericolo = p.stato === "chiuso" || p.stato === "abbandonato" || p.stato === "rudere";
    var on = p.online || null;

    h.push('<div class="g"><div class="w scheda-g"><div>');
    var ind = etichettaIndietro();
    h.push('<a class="indietro" href="' + esc(ind.href) + '"' + (ind.storia ? " data-indietro" : "") + ">← " + esc(ind.testo) + "</a>" + (es ? "" : '<button type="button" class="indietro" data-mostra="' + esc(p.id) + '">Vedi sulla mappa</button>'));
    h.push('<p class="meta-s"><b>' + esc(p.id) + "</b> · foglio " + esc(p.foglio) + ", particella " + esc(p.particella) +
      (p.quartiere ? " · " + esc(p.quartiere) : zona(p) ? " · zona " + esc(zona(p)) : "") + "</p>");
    h.push('<h1 tabindex="-1">' + esc(titolo(p)) + "</h1>");
    h.push('<p class="uso-scheda">' + etichettaUso(p) + "</p>");
    var sintesi;
    if (p.data_sopralluogo) sintesi = "Visto sul posto il " + esc(dataIt(p.data_sopralluogo)) + ": " + esc(etichetta(STATI, p.stato).toLowerCase()) + ".";
    else if (p.verifica)
      sintesi = "Verificato: " + esc(nomeUso(uso(p)).toLowerCase()) + ". Fonte: " + esc(p.verifica.come) + (p.verifica.codici ? " (codice " + esc(p.verifica.codici) + ")" : "") +
        (p.verifica.conferma ? "; confermato su " + esc(p.verifica.conferma) : "") + " il " + esc(dataIt(p.verifica.data)) + ". Non serve il sopralluogo.";
    else if (on && on.indicazione && on.indicazione !== "nessuna_info")
      sintesi = "Non ancora visto sul posto. Secondo le fonti online: " + esc((INDICAZIONI[on.indicazione] || "").toLowerCase()) + (on.certezza ? " (certezza " + esc(on.certezza) + ")" : "") + ".";
    else sintesi = "Non ancora visto sul posto. Sappiamo che è del Comune e dove si trova sul catasto; non sappiamo se è in uso.";
    h.push('<div class="richiamo"><p>' + sintesi + "</p>" + (!verificato(p) && on ? '<span class="nota">Le indicazioni online non sono verifiche: le fonti sono qui sotto.</span>' : "") + "</div>");
    if (pericolo) h.push('<div class="pericolo" role="note"><p><strong>Attenzione:</strong> edificio ' + esc(etichetta(STATI, p.stato).toLowerCase()) +
      ". Può essere pericoloso: non entrare e non avvicinarti. Questa scheda serve a conoscere il bene, non a visitarlo.</p></div>");

    // Foto (solo se ci sono: quelle che mancano sono in «Cosa manca ancora»)
    var foto = p.foto || [];
    if (foto.length) {
      h.push('<div class="foto-griglia' + (es ? " foto-esempio" : "") + '">' + foto.map(function (f) {
        var src = typeof f === "string" ? f : (f.file || f.url || "");
        if (window.MAPPA_DATI && !/^https?:/.test(src)) src = "https://patrimonio.postilva.it/" + src; // pagina unica: le foto stanno sul sito
        var img = f.svg ? f.svg : '<img src="' + esc(src) + '" alt="' + esc(f.descrizione || "Foto del sopralluogo") + '" loading="lazy">';
        var cred = f.autore ? "<br>Foto: " + (f.pagina ? link(f.pagina, f.autore) : esc(f.autore)) + (f.licenza ? ", " + esc(f.licenza) : "") +
          (f.origine === "online" ? " · trovata online, non è del sopralluogo" : "") : "";
        return "<figure>" + img + "<figcaption>" + esc(f.descrizione ? f.descrizione + " · " : "") + esc(dataIt(f.data || p.data_sopralluogo)) + cred + "</figcaption></figure>";
      }).join("") + "</div>");
    }
    var conIdee = es || (p.idee_riuso || []).length > 0, con3d = es || !!p.modello_3d;

    // 4b. Cercato online
    if (on || !es) h.push(sezione(x + "online", "Cercato online", on ?
      (on.indicazione ? '<p class="indicazione"><strong>' + esc(INDICAZIONI[on.indicazione] || on.indicazione) + "</strong>" +
        (on.certezza ? ' <span class="nota">(certezza ' + esc(on.certezza) + ")</span>" : "") + "</p>" : "") +
      (on.nome_probabile && !p.nome ? "<p>Nome probabile: <strong>" + esc(on.nome_probabile) + "</strong></p>" : "") +
      (on.note && on.note.length ? '<ul class="online-note">' + on.note.map(function (n) {
        return "<li>" + esc(n.testo) + ' <span class="fonte">Fonte: ' + (n.url ? link(n.url, n.fonte) : esc(n.fonte || "")) + (n.data ? ", " + esc(dataIt(n.data)) : "") + "</span></li>";
      }).join("") + "</ul>" : "<p>" + vuoto("Online non abbiamo trovato nulla su questo edificio.") + "</p>") +
      '<p class="nota">' + (p.data_sopralluogo ? "Sono le indicazioni trovate online prima del sopralluogo: quello che abbiamo visto sul posto è in cima alla scheda." :
        "Sono indicazioni trovate online prima del sopralluogo, non dati verificati: lo stato resta «da verificare» finché non andiamo a vedere.") + "</p>" :
      "<p>" + vuoto("Non ancora cercato online.") + "</p>"));

    // 4. Dati
    var u = p.locali || [];
    var tab = '<details><summary>' + (u.length === 1 ? "Il locale" : "I " + u.length + " locali") + ' nell\'elenco 2024</summary><div class="tabella-box"><table><thead><tr><th scope="col">Sub.</th><th scope="col">Categoria</th><th scope="col">ID Comune</th></tr></thead><tbody>' +
      u.map(function (l) { return "<tr><td>" + esc(l.subalterno || "–") + "</td><td>" + esc(l.categoria) + " – " + esc(l.categoria_descrizione) + "</td><td>" + esc(l.id) + "</td></tr>"; }).join("") +
      "</tbody></table></div></details>";
    var altro = [];
    if (p.n_abitazioni) altro.push(p.n_abitazioni + (p.n_abitazioni === 1 ? " abitazione" : " abitazioni"));
    if (p.n_pertinenze) altro.push(p.n_pertinenze + (p.n_pertinenze === 1 ? " pertinenza" : " pertinenze") + " (cantine, autorimesse, aree)");
    h.push(sezione(x + "dati", "Che posto è",
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
    if (st.length) h.push(sezione(x + "storia", "La sua storia",
      '<ol class="linea-tempo">' + st.map(function (s) {
        return '<li' + (s.chiusura ? ' class="chiusura"' : "") + "><strong>" + esc(dataIt(s.data)) + "</strong> – " + esc(s.testo) + (s.fonte ? ' <span class="fonte">Fonte: ' + esc(s.fonte) + "</span>" : "") + "</li>";
      }).join("") + "</ol>"));

    // 6. Costi
    var sm = p.stima || {};
    var conStima = sm.min_eur != null && sm.max_eur != null;
    var costi = conStima ?
      '<p class="forchetta">Tra ' + esc(numIt(sm.min_eur)) + " € e " + esc(numIt(sm.max_eur)) + " €</p>" +
      "<p>Livello di stima <strong>" + esc(String(sm.livello || "–")) + " su 3</strong>" + (sm.livello_descr ? " (" + esc(sm.livello_descr) + ")" : "") + "</p>" +
      (sm.voci ? '<div class="tabella-box"><table><thead><tr><th scope="col">Voce</th><th scope="col">Stima</th></tr></thead><tbody>' + sm.voci.map(function (v) {
        return "<tr><td>" + esc(v[0]) + "</td><td>" + esc(v[1]) + "</td></tr>"; }).join("") + "</tbody></table></div>" : "") +
      "<p>Prezzario usato: " + (sm.prezzario ? esc(sm.prezzario) : vuoto("da indicare")) + "</p>" :
      "<p>" + vuoto("Stima non ancora disponibile: da completare dopo il sopralluogo e la valutazione di un tecnico.") + "</p>";
    if (conStima) h.push(sezione(x + "costi", "Quanto costa riaprirlo", costi +
      "<p><strong>Stima parametrica di massima, non perizia.</strong> <a href=\"#metodo\">Come si fanno le stime</a></p>", "costi"));
    var manca = [];
    if (!verificato(p)) manca.push(["Il sopralluogo", "andiamo a vedere dall'esterno com'è e se è usato: solo allora la scheda è «verificata»."]);
    var fotoNostre = foto.filter(function (f) { return f.origine !== "online"; });
    if (!fotoNostre.length && !p.verifica) manca.push([foto.length ? "Le foto del sopralluogo" : "Le foto", "facciata, ingresso e intorno, solo dall'esterno e senza persone né targhe."]);
    if (!st.length) manca.push(["La storia", "dalla ricerca d'archivio e dall'accesso agli atti: ogni passaggio con la sua fonte."]);
    if (!conStima) manca.push(["La stima dei costi per riaprirlo", 'dopo il sopralluogo, con un tecnico: una stima di massima, non una perizia. <a href="#metodo">Come si fanno le stime</a>']);
    if (manca.length) h.push(sezione(x + "manca", "Cosa manca ancora", '<ul class="manca">' + manca.map(function (m) {
      return "<li><i></i><div><b>" + esc(m[0]) + "</b><span>" + m[1] + "</span></div></li>"; }).join("") + "</ul>" +
      (es ? "" : '<p class="nota">Lo conosci? <a ' + linkScrivici(p.id) + ">Raccontaci questo edificio</a>.</p>")));

    // 7. Idee di riuso
    var idee = p.idee_riuso || [];
    if (conIdee) h.push(sezione(x + "idee", "Idee di riuso dal quartiere",
      (idee.length ? "<ul>" + idee.map(function (i) { return "<li>" + esc(typeof i === "string" ? i : i.testo) + "</li>"; }).join("") + "</ul>" :
        "<p>" + vuoto("Nessuna idea raccolta finora: le idee arriveranno da incontri e segnalazioni, pubblicate dopo verifica.") + "</p>") +
      (es ? "" : '<a class="bottone secondario" ' + linkScrivici(p.id) + ">Proponi un'idea per questo edificio</a>") +
      '<p class="nota">Le idee raccolte saranno pubblicate qui solo dopo una verifica.</p>'));

    // 8. Modello 3D
    if (con3d) h.push(sezione(x + "3d", "Modello 3D", es ?
      '<div class="tre-d"><div class="tre-d-scelta" role="group" aria-label="Versione del modello">' +
      '<button type="button" class="bottone" id="tre-d-oggi" data-3d="oggi" aria-pressed="true">Com\'è oggi</button>' +
      '<button type="button" class="bottone secondario" id="tre-d-riuso" data-3d="riuso" aria-pressed="false">Come potrebbe essere</button></div>' +
      '<div class="tre-d-box" id="tre-d-box"><p class="tre-d-attesa">Caricamento del modello…</p><span class="tre-d-etichetta" id="tre-d-etichetta" hidden>Ipotesi di riuso</span></div>' +
      '<p class="nota">Trascina per girare il modello. È un volume schematico disegnato per questo esempio: nelle schede vere il modello nascerà dai rilievi del sopralluogo. «Come potrebbe essere» è sempre un\'ipotesi, non un progetto.</p></div>' :
      (p.modello_3d ? "<p>" + link(p.modello_3d, "Apri il modello 3D") + "</p><p><strong>Ipotesi di riuso</strong>: la parte «come potrebbe essere» è un'ipotesi, non un progetto.</p>" :
        "<p>" + vuoto("Nessun modello 3D per ora.") + ' <a href="#esempio">Guarda com\'è nella scheda di esempio</a>.</p>')));

    // 9. Fonti
    var fonti = p.fonti || (meta.fonti || [])[p.fonti_rif] || [];
    h.push(sezione(x + "fonti", "Fonti", '<ul class="fonti-lista">' + fonti.map(function (f) {
      return "<li><strong>" + esc(f.titolo) + "</strong> – " + esc(f.ente) + (f.data ? ", " + esc(dataIt(f.data)) : "") +
        (f.licenza ? ", licenza " + esc(f.licenza) : "") + (f.uso ? '. <span class="fonte">Uso: ' + esc(f.uso) + ".</span>" : "") +
        (f.url ? "<br>" + link(f.url, f.url) : "") + "</li>";
    }).join("") + "</ul>"));

    // 10. Segnala un errore
    h.push(sezione(x + "segnala", "Segnala un errore",
      "<p>ID della scheda: <strong>" + esc(p.id) + "</strong> · ultima modifica: <strong>" + esc(dataIt(p.ultima_modifica)) + "</strong></p>" +
      (es ? '<p class="nota">Nelle schede vere qui c\'è il pulsante per segnalare un errore o raccontarci l\'edificio: ci arriva il codice della scheda, non serve altro.</p>' :
        '<a class="bottone secondario" ' + linkScrivici(p.id) + ">Segnala un errore o raccontaci questo edificio</a>" +
        '<p class="nota">Ci arriva il codice ' + esc(p.id) + ': non serve altro. Le segnalazioni servono a correggere la scheda e non vengono pubblicate.</p>')));

    h.push("</div><aside>");
    var pi = pianta(p.id, es ? p : null);
    if (pi) h.push('<section class="sez pianta"><h2>Sul catasto</h2>' + pi + '<p class="nota">' + (es ? "Contorno inventato per l'esempio. Nelle schede vere è quello della particella sul catasto." : "Contorno della particella (Agenzia delle Entrate, CC BY 4.0). Il quadratino è il punto usato sulla mappa.") + "</p></section>");
    var passi = [[true, "Nell'elenco del Comune", "elenco beni immobili 2024"], [true, "Trovato sul catasto", "posizione e contorno"],
      [!!on, "Cercato online", on ? ((on.note || []).length === 1 ? "1 indicazione con fonte" : (on.note || []).length + " indicazioni con fonte") : "atti, scuole, notizie"],
      p.verifica && !p.data_sopralluogo ? [true, "Verificato su fonte ufficiale", dataIt(p.verifica.data)] :
      [!!p.data_sopralluogo, "Visto sul posto", p.data_sopralluogo ? dataIt(p.data_sopralluogo) : "stato, dall'esterno"],
      [foto.filter(function (f) { return f.origine !== "online"; }).length > 0, "Foto del sopralluogo", "senza persone né targhe"], [(p.storia || []).length > 0, "Storia", "archivio e accesso agli atti"],
      [p.stima && p.stima.min_eur != null, "Stima dei costi", "con un tecnico"]];
    h.push('<section class="sez"><h2>A che punto è</h2><ul class="tracc">' + passi.map(function (s) {
      return "<li" + (s[0] ? ' class="si"' : "") + "><i>" + (s[0] ? "✓" : "") + "</i><div><b>" + esc(s[1]) + "</b><span>" + esc(s[2]) + "</span></div></li>";
    }).join("") + "</ul></section>");
    h.push("</aside></div></div>");
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
    uso_originario: "mercato rionale coperto, 14 banchi", uso_verificato: "chiuso",
    contorno: [[17.22948, 40.47606], [17.22996, 40.47612], [17.22992, 40.47634], [17.22944, 40.47628], [17.22948, 40.47606]],
    online: { indicazione: "chiuso", certezza: "media", note: [
      { testo: "Nell'anagrafe dei mercati comunali il mercato risulta «sospeso» dal 2009.", fonte: "elenco dei mercati del Comune (esempio)", data: "2026-10-02" },
      { testo: "Un articolo racconta la raccolta di firme del quartiere per riaprirlo.", fonte: "testata locale (esempio)", data: "2024-05-14" }
    ] },
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
    sc.src = window.THREE_URL || "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
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
      r.setClearColor("#101012");
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
      cubo(scena, 46, 0.06, 7, 0, 0, 15.5, B.ferrovia); // strada
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
        var ch = new T.Mesh(new T.SphereGeometry(2.1, 12, 10), mat(B.verde)); ch.position.set(a[0], 4.2, a[1]); riuso.add(ch);
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

  /* ---------- eventi delegati ---------- */
  document.addEventListener("click", function (ev) {
    var t = ev.target.closest ? ev.target.closest("[data-altri],[data-azzera],[data-filtri],[data-vai],[data-messaggio],[data-salta],[data-mostra],[data-3d],[data-vai-dopo],[data-tipo],[data-zona],[data-online],[data-indietro]") : null;
    if (!t) return;
    if (t.hasAttribute("data-altri")) {
      var primaNuova = limite; limite += PASSO; disegnaLista();
      var a = $$("#lista a")[primaNuova]; if (a) { try { a.focus({ preventScroll: true }); } catch (e) {} }
      return;
    }
    if (t.hasAttribute("data-azzera")) return azzeraFiltri();
    if (t.hasAttribute("data-filtri")) {
      var corpoF = $("#filtri"), aperto = corpoF.classList.toggle("aperto");
      t.setAttribute("aria-expanded", String(aperto));
      return;
    }
    if (t.hasAttribute("data-vai-dopo")) { dopo = t.getAttribute("data-vai-dopo"); return; }
    if (t.hasAttribute("data-tipo") || t.hasAttribute("data-zona") || t.hasAttribute("data-online")) {
      ev.preventDefault();
      var q = [];
      if (t.getAttribute("data-tipo")) q.push("tipo=" + encodeURIComponent(t.getAttribute("data-tipo")));
      if (t.getAttribute("data-online")) q.push("uso=" + encodeURIComponent(t.getAttribute("data-online")));
      if (t.hasAttribute("data-zona")) q.push("q=tamburi");
      location.hash = "#mappa" + (q.length ? "?" + q.join("&") : "");
      return;
    }
    if (t.hasAttribute("data-indietro")) { // «← …» nella scheda: come il tasto indietro del browser
      if (history.state && history.state.da != null) { ev.preventDefault(); history.back(); }
      return;
    }
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
  /* pannello dell'elenco come nelle bonifiche (Antonio, 27/11/2026): sul telefono si parte dalla mappa e l'elenco sale col bottone;
     «Allarga»: sul telefono sale fino in cima, sul computer si allarga su due colonne */
  function setPanel(on) {
    document.body.classList.toggle("panel-off", !on);
    setTimeout(function () { if (mappa) mappa.resize(); piazzaPv(); }, 220);
  }
  function avviaPannello() {
    $("#panel-close").addEventListener("click", function () { setPanel(false); });
    $("#panel-open").addEventListener("click", function () { setPanel(true); });
    $("#panel-big").addEventListener("click", function (e) {
      var on = document.body.classList.toggle("panel-big");
      e.currentTarget.textContent = on ? "Riduci" : "Allarga"; e.currentTarget.setAttribute("aria-pressed", String(on));
      setTimeout(function () { if (mappa) mappa.resize(); piazzaPv(); }, 220);
    });
    if (stretto()) setPanel(false);
    $$(".seg button").forEach(function (b) { b.addEventListener("click", function () { setModo(b.getAttribute("data-c")); salvaStato(); }); });
    var c = $("#cerca");
    c.addEventListener("input", function () { testo = c.value.trim(); applicaFiltri(); });
    // computer: legenda sempre aperta; telefono: chiusa, si apre col tocco
    var pc = window.matchMedia("(min-width: 861px)"), apriLg = function () { if (pc.matches) $("#legenda").open = true; };
    if (pc.addEventListener) pc.addEventListener("change", apriLg); apriLg();
    // anteprima del punto
    pvBox = $("#pv");
    pvBox.addEventListener("click", function (e) { if (e.target.closest(".x")) deseleziona(); });
    var y0 = null, dy = 0; // cassetto del telefono: segue il dito verso il basso e, tirato giù, si chiude
    pvBox.addEventListener("pointerdown", function (e) { if (stretto() && e.target.closest(".band") && !e.target.closest("button")) { y0 = e.clientY; dy = 0; pvBox.setPointerCapture(e.pointerId); } });
    pvBox.addEventListener("pointermove", function (e) { if (y0 === null) return; dy = Math.max(0, e.clientY - y0); pvBox.style.transform = dy ? "translateY(" + dy + "px)" : ""; });
    var lascia = function () { if (y0 === null) return; y0 = null; pvBox.style.transform = ""; if (dy > 60) deseleziona(); };
    pvBox.addEventListener("pointerup", lascia); pvBox.addEventListener("pointercancel", lascia);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && selezionato && !pvBox.hidden) deseleziona(); });
    // un edificio dell'elenco: si apre sulla mappa (come nelle bonifiche); con Ctrl o ⌘ si apre la scheda
    $("#lista").addEventListener("click", function (e) {
      var a = e.target.closest("a[data-sel]"); if (!a || e.ctrlKey || e.metaKey || e.shiftKey || !mappa) return;
      e.preventDefault();
      var id = a.getAttribute("data-sel");
      if (stretto()) setPanel(false);
      setTimeout(function () { seleziona(id, true, true); }, stretto() ? 230 : 0);
    });
    // «Cosa non è sulla mappa?»
    var n = meta.numeri || {}, f = function (k) { return n[k] == null ? "–" : numIt(n[k]); };
    $("#fuori").innerHTML = "<p>La mappa mostra " + f("in_mappa") + " edifici del Comune di Taranto con " + f("locali") + " locali non residenziali (elenco dei beni immobili 2024). Non ci sono:</p><ul>" +
      "<li><b>" + f("solo_abitazioni") + " particelle con sole abitazioni</b> e loro pertinenze: il censimento riguarda gli spazi per attività, non gli alloggi;</li>" +
      "<li><b>" + f("da_localizzare") + " particelle dell'elenco non ancora trovate</b> sulla cartografia catastale: le chiederemo al Comune;</li>" +
      "<li><b>" + f("nascosti") + " particelle tolte</b> perché cabine, magazzini o scantinati: si rimettono se al sopralluogo risultano altro;</li>" +
      "<li>autorimesse, tettoie, aree urbane, lastrici solari e i magazzini negli edifici con abitazioni, quasi sempre cantine (regola di lavoro di Postilva, da rivedere);</li>" +
      "<li>i beni di altri enti (Stato, Regione, Provincia, ASL, Marina) e i beni confiscati alla criminalità.</li></ul>" +
      '<p><a href="#metodo" data-vai-dopo="m-fuori">Tutti i dettagli in «Come lavoriamo» →</a></p>';
    var dlg = $("#fuori-dlg");
    $("#fuori-open").addEventListener("click", function () { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", ""); });
    $("#fuori-close").addEventListener("click", function () { dlg.close(); });
    dlg.addEventListener("click", function (e) { if (e.target === dlg || e.target.closest("a")) dlg.close(); });
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
    disegnaLegenda();
    avviaPannello();
    setModo(modo, false);
    disegnaInizio();
    disegnaUsi();
    disegnaNotizie();
    disegnaContatti();
    tabellaTipi();
    applicaFiltri();
    window.addEventListener("hashchange", vai);
    vai();
    creaMappa();
    var lato = $("#lista"); if (lato) lato.addEventListener("scroll", function () { salvaStato(); }, { passive: true });
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
