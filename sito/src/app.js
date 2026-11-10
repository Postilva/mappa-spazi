/* Mappa degli spazi pubblici dei Tamburi – JS vanilla, nessun framework.
   Dati: window.MAPPA_DATI (pagina unica claude.ai) oppure window.MAPPA_DATI_URL (versione normale).
   Navigazione: #mappa, #elenco, #metodo, #edificio-<foglio>-<particella>. */
(function () {
  "use strict";

  var STATI = [
    ["in_uso", "In uso"], ["chiuso", "Chiuso"], ["abbandonato", "Abbandonato"],
    ["rudere", "Rudere"], ["da_verificare", "Da verificare"]
  ];
  var TIPI = [
    ["abitazioni", "Abitazioni"], ["scuole_servizi", "Scuole e servizi"],
    ["negozi_depositi", "Negozi e depositi"], ["altro", "Altro"]
  ];
  var C = {
    blu: "#212D57", rosso: "#CC1417", bianco: "#FFFFFF", chiuso: "#7F8AB0", rudere: "#7A0C0E",
    verificare: "#6B7280", terra: "#F3F1EC", mare: "#D7E3EE", bordo: "#E3E5EC", bordoForte: "#C9CDD9", testo2: "#4A5373"
  };
  var DA_COMPLETARE = "da completare dopo il sopralluogo";
  var riduciMoto = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var edifici = [], perId = {}, base = null, meta = {};
  var mappa = null, marcatori = {}, selezionato = null, primaVista = true;
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
  function catDescr(p) {
    var u = p.unita || [];
    for (var i = 0; i < u.length; i++) if (u[i].categoria === p.categoria_catastale) return u[i].categoria_descrizione;
    return p.categoria_catastale || "Immobile";
  }
  function titolo(p) {
    if (p.nome) return p.nome;
    return catDescr(p) + " · foglio " + p.foglio + ", particella " + p.particella;
  }
  function descrUnita(p) { return p.n_unita === 1 ? "1 unità catastale" : p.n_unita + " unità catastali"; }

  /* ---------- router ---------- */
  function rotta() {
    var h = (location.hash || "").replace(/^#/, "");
    var m = /^edificio-([0-9a-z]+-[0-9a-z]+)$/i.exec(h);
    if (m) return { vista: "scheda", id: m[1] };
    if (h === "elenco" || h === "metodo" || h === "mappa") return { vista: h };
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
    var t = "Spazi pubblici dei Tamburi";
    if (r.vista === "scheda") {
      disegnaScheda(r.id);
      if (r.id) { seleziona(r.id, false); t = titolo(perId[r.id].properties) + " – " + t; }
    } else if (r.vista === "elenco") t = "Elenco – " + t;
    else if (r.vista === "metodo") t = "Metodo e fonti – " + t;
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
  function stileMappa() {
    var haTerra = base.features.some(function (f) { return f.properties.livello === "terra"; });
    function liv(n) { return ["==", ["get", "livello"], n]; }
    return {
      version: 8,
      sources: { base: { type: "geojson", data: base } },
      layers: [
        { id: "mare", type: "background", paint: { "background-color": haTerra ? C.mare : C.bianco } },
        { id: "terra", type: "fill", source: "base", filter: liv("terra"), paint: { "fill-color": C.bianco } },
        { id: "isolati", type: "fill", source: "base", filter: liv("particelle"), paint: { "fill-color": C.terra } },
        { id: "isolati-bordo", type: "line", source: "base", filter: liv("particelle"), paint: { "line-color": C.bordoForte, "line-width": 0.6 } },
        { id: "fuori", type: "fill", source: "base", filter: liv("fuori"), paint: { "fill-color": C.bianco, "fill-opacity": 0.5 } },
        { id: "edifici", type: "fill", source: "base", filter: liv("edificio"), paint: { "fill-color": C.bordoForte } },
        { id: "edifici-bordo", type: "line", source: "base", filter: liv("edificio"), paint: { "line-color": C.testo2, "line-width": 1 } },
        { id: "edificio-sel", type: "line", source: "base", filter: ["all", liv("edificio"), ["==", ["get", "id"], ""]], paint: { "line-color": C.rosso, "line-width": 2.5 } },
        { id: "confine", type: "line", source: "base", filter: liv("confine"), paint: { "line-color": C.blu, "line-width": 2.5, "line-dasharray": [3, 2] } }
      ]
    };
  }
  function limitiEdifici() { // inquadra i 29 edifici (non tutto il confine): simboli meno sovrapposti
    var x0 = 180, y0 = 90, x1 = -180, y1 = -90;
    edifici.forEach(function (f) { var c = f.geometry.coordinates; x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); y0 = Math.min(y0, c[1]); y1 = Math.max(y1, c[1]); });
    return [[x0 - 0.0015, y0 - 0.0015], [x1 + 0.0015, y1 + 0.0015]];
  }
  function attendiLibreria(cb, n) {
    if (window.maplibregl) return cb(true);
    if ((n || 0) > 100) return cb(false);
    setTimeout(function () { attendiLibreria(cb, (n || 0) + 1); }, 100);
  }
  function erroreMappa() {
    var box = $("#mappa-box");
    box.innerHTML = '<p class="mappa-errore">La mappa interattiva non si è caricata in questo browser. Tutti gli edifici sono nella pagina&nbsp;<a href="#elenco">Elenco</a>.</p>';
  }
  function creaMappa() {
    attendiLibreria(function (ok) {
      if (!ok) return erroreMappa();
      var box = $("#mappa-box");
      var b = base.bbox;
      try {
        mappa = new maplibregl.Map({
          container: box, style: stileMappa(),
          bounds: limitiEdifici(),
          fitBoundsOptions: { padding: 40 },
          maxBounds: [[b[0] - 0.02, b[1] - 0.02], [b[2] + 0.02, b[3] + 0.02]],
          minZoom: 11, maxZoom: 19, dragRotate: false, pitchWithRotate: false, touchPitch: false,
          cooperativeGestures: true, attributionControl: false, fadeDuration: 0,
          locale: {
            "CooperativeGesturesHandler.WindowsHelpText": "Usa Ctrl + rotella per ingrandire la mappa",
            "CooperativeGesturesHandler.MacHelpText": "Usa ⌘ + rotella per ingrandire la mappa",
            "CooperativeGesturesHandler.MobileHelpText": "Usa due dita per spostare la mappa",
            "NavigationControl.ZoomIn": "Ingrandisci", "NavigationControl.ZoomOut": "Riduci",
            "NavigationControl.ResetBearing": "Orienta a nord",
            "AttributionControl.ToggleAttribution": "Mostra o nascondi le attribuzioni",
            "Map.Title": "Mappa", "Marker.Title": "Edificio"
          }
        });
      } catch (e) { return erroreMappa(); }
      var att = $(".mappa-attesa"); if (att) att.remove();
      mappa.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      mappa.addControl(new maplibregl.AttributionControl({
        compact: false,
        customAttribution: "© Agenzia delle Entrate – Cartografia catastale, CC BY 4.0 · ISTAT 2021, CC BY 4.0"
      }), "bottom-right");
      mappa.on("error", function (e) { if (window.console) console.warn("Mappa:", e && e.error && e.error.message); });
      edifici.forEach(function (f) {
        var p = f.properties;
        var el = document.createElement("button");
        el.type = "button";
        el.className = "segno";
        el.setAttribute("data-id", p.id);
        el.innerHTML = simbolo(p.stato, 22, false);
        el.addEventListener("click", function (ev) { ev.stopPropagation(); seleziona(p.id, true); });
        marcatori[p.id] = new maplibregl.Marker({ element: el }).setLngLat(f.geometry.coordinates).addTo(mappa);
        el.setAttribute("aria-label", titolo(p) + " – stato: " + etichetta(STATI, p.stato)); // MapLibre lo sovrascrive
      });
      if (selezionato) seleziona(selezionato, false);
      applicaFiltri();
    });
  }

  function seleziona(id, daMappa) {
    var prec = selezionato;
    selezionato = id;
    if (prec && marcatori[prec]) {
      var ep = marcatori[prec].getElement();
      ep.innerHTML = simbolo(perId[prec].properties.stato, 22, false);
      ep.removeAttribute("aria-pressed");
      ep.style.zIndex = "";
    }
    if (marcatori[id]) {
      var e = marcatori[id].getElement();
      e.innerHTML = simbolo(perId[id].properties.stato, 22, true);
      e.setAttribute("aria-pressed", "true");
      e.style.zIndex = "5";
    }
    if (mappa && mappa.getLayer("edificio-sel")) {
      mappa.setFilter("edificio-sel", ["all", ["==", ["get", "livello"], "edificio"], ["==", ["get", "id"], id]]);
    } else if (mappa) {
      mappa.once("load", function () { if (selezionato) seleziona(selezionato, false); });
    }
    disegnaSintesi(id, daMappa);
  }

  function disegnaSintesi(id, daMappa) {
    var p = perId[id].properties, box = $("#sintesi");
    box.innerHTML =
      etichettaStato(p.stato) +
      "<h2>" + esc(titolo(p)) + "</h2>" +
      "<p>" + esc(etichetta(TIPI, p.tipo_bene)) + " · " + esc(descrUnita(p)) + "</p>" +
      "<p>Indirizzo: " + (p.indirizzo ? esc(p.indirizzo) : vuoto()) + "</p>" +
      '<p class="nota">Posizione approssimata: baricentro della particella catastale.</p>' +
      '<div class="azioni"><a class="bottone" href="#edificio-' + esc(p.id) + '">Apri la scheda completa</a></div>';
    if (daMappa && window.innerWidth < 900) {
      box.scrollIntoView({ behavior: riduciMoto ? "auto" : "smooth", block: "nearest" });
    }
  }

  /* ---------- filtri ---------- */
  function contaPer(chiave) {
    var c = {};
    edifici.forEach(function (f) { var k = f.properties[chiave]; c[k] = (c[k] || 0) + 1; });
    return c;
  }
  function disegnaFiltri() {
    var cs = contaPer("stato"), ct = contaPer("tipo_bene");
    $("#filtro-stato").innerHTML = STATI.map(function (s) {
      filtroStato[s[0]] = true;
      return '<label class="opzione"><input type="checkbox" checked data-filtro="stato" value="' + s[0] + '">' +
        simbolo(s[0], 18) + "<span>" + esc(s[1]) + ' <span class="n">(' + (cs[s[0]] || 0) + ")</span></span></label>";
    }).join("");
    $("#filtro-tipo").innerHTML = TIPI.map(function (t) {
      filtroTipo[t[0]] = true;
      return '<label class="opzione"><input type="checkbox" checked data-filtro="tipo" value="' + t[0] + '">' +
        "<span>" + esc(t[1]) + ' <span class="n">(' + (ct[t[0]] || 0) + ")</span></span></label>";
    }).join("");
    $$("[data-filtro]").forEach(function (cb) {
      cb.addEventListener("change", function () {
        (cb.getAttribute("data-filtro") === "stato" ? filtroStato : filtroTipo)[cb.value] = cb.checked;
        applicaFiltri();
      });
    });
  }
  function applicaFiltri() {
    var n = 0;
    edifici.forEach(function (f) {
      var p = f.properties, vis = filtroStato[p.stato] !== false && filtroTipo[p.tipo_bene] !== false;
      if (vis) n++;
      if (marcatori[p.id]) marcatori[p.id].getElement().style.display = vis ? "" : "none";
    });
    $("#conteggio").textContent = "Edifici mostrati: " + n + " di " + edifici.length;
  }

  function disegnaLegenda(sel) {
    $(sel).innerHTML = STATI.map(function (s) { return "<li>" + simbolo(s[0], 20) + "<span>" + esc(s[1]) + "</span></li>"; }).join("");
  }

  /* ---------- elenco ---------- */
  function disegnaElenco() {
    $("#elenco").innerHTML = edifici.map(function (f) {
      var p = f.properties;
      return '<li><a href="#edificio-' + esc(p.id) + '">' + simbolo(p.stato, 20) +
        '<span><span class="titolo">' + esc(titolo(p)) + '</span><span class="meta">' +
        esc(etichetta(STATI, p.stato)) + " · " + esc(etichetta(TIPI, p.tipo_bene)) + " · " + esc(descrUnita(p)) +
        " · ID " + esc(p.id) + "</span></span></a></li>";
    }).join("");
  }

  /* ---------- scheda edificio ---------- */
  function riga(dt, dd) { return "<div><dt>" + esc(dt) + "</dt><dd>" + dd + "</dd></div>"; }
  function sezione(id, tit, corpo, cls) {
    return '<section class="sez ' + (cls || "") + '" aria-labelledby="h-' + id + '"><h2 id="h-' + id + '" tabindex="-1">' + esc(tit) + "</h2>" + corpo + "</section>";
  }
  function link(url, testo) {
    if (!url || !/^https?:\/\//.test(url)) return esc(testo || url || "");
    return '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(testo || url) + "</a>";
  }

  function disegnaScheda(id) {
    var box = $("#scheda");
    if (!id) {
      box.innerHTML = '<div class="gutter"><h1 tabindex="-1">Scheda non trovata</h1><p>Non c\'è un edificio con questo identificativo. Torna alla <a href="#mappa">mappa</a> o all\'<a href="#elenco">elenco</a>.</p></div>';
      return;
    }
    var p = perId[id].properties, h = [];
    var pericolo = p.stato === "chiuso" || p.stato === "abbandonato" || p.stato === "rudere";

    h.push('<nav class="scheda-nav gutter" aria-label="Navigazione"><a href="#mappa">← Torna alla mappa</a><a href="#elenco">Elenco degli edifici</a></nav>');
    h.push('<div class="gutter scheda-corpo">');

    // 1. Foto
    var foto = p.foto || [];
    if (foto.length) {
      h.push('<div class="foto-griglia">' + foto.map(function (f) {
        var src = typeof f === "string" ? f : (f.file || f.url || "");
        return '<figure><img src="' + esc(src) + '" alt="' + esc(f.descrizione || "Foto del sopralluogo") + '" loading="lazy"><figcaption>' +
          esc(dataIt(f.data || p.data_sopralluogo)) + "</figcaption></figure>";
      }).join("") + "</div>");
    } else {
      h.push('<div class="foto-vuota" role="img" aria-label="Nessuna foto"><p>Nessuna foto: <strong>da completare dopo il sopralluogo</strong>.</p></div>');
    }

    // 2. Stato e identità
    h.push('<div class="identita">' + etichettaStato(p.stato) +
      ' <span class="nota">' + (p.data_sopralluogo ? "verificato il " + esc(dataIt(p.data_sopralluogo)) : "non ancora verificato sul posto") + "</span>" +
      '<h1 tabindex="-1">' + esc(titolo(p)) + "</h1>" +
      '<dl class="dati">' +
      riga("Nome", p.nome ? esc(p.nome) : vuoto("non ancora noto – " + DA_COMPLETARE)) +
      riga("Indirizzo", p.indirizzo ? esc(p.indirizzo) : vuoto()) +
      riga("Quartiere", esc(p.quartiere || "Tamburi") + ' <span class="nota">(confine di lavoro, provvisorio)</span>') +
      "</dl>" +
      (pericolo ? '<div class="pericolo" role="note"><p><strong>Attenzione:</strong> edificio ' + esc(etichetta(STATI, p.stato).toLowerCase()) +
        ". Può essere pericoloso: non entrare e non avvicinarti. Questa scheda serve a conoscere il bene, non a visitarlo.</p></div>" : "") +
      "</div>");

    // 3. Menu rapido
    var voci = [["dati", "Dati"], ["storia", "Storia"], ["costi", "Costi"], ["idee", "Idee di riuso"], ["3d", "3D"], ["fonti", "Fonti"], ["segnala", "Segnala un errore"]];
    h.push('<nav class="menu-rapido" aria-label="Sezioni della scheda">' + voci.map(function (v) {
      return '<button type="button" data-vai="h-' + v[0] + '">' + esc(v[1]) + "</button>";
    }).join("") + "</nav>");

    // 4. Dati dell'edificio
    var u = p.unita || [];
    var tab = '<details><summary>Le ' + u.length + ' unità catastali dell\'elenco 2024</summary><div class="tabella-box"><table><thead><tr><th scope="col">Sub.</th><th scope="col">Categoria</th><th scope="col">ID Comune</th></tr></thead><tbody>' +
      u.map(function (x) { return "<tr><td>" + esc(x.subalterno || "–") + "</td><td>" + esc(x.categoria) + " – " + esc(x.categoria_descrizione) + "</td><td>" + esc(x.id) + "</td></tr>"; }).join("") +
      "</tbody></table></div></details>";
    if (u.length === 1) tab = tab.replace("Le 1 unità catastali", "L'unica unità catastale");
    h.push(sezione("dati", "Dati dell'edificio",
      '<dl class="dati">' +
      riga("Proprietà", "Comune di Taranto: il bene compare nell'elenco dei beni immobili comunali 2024") +
      riga("Categoria catastale prevalente", esc(p.descrizione || p.categoria_catastale)) +
      riga("Tipo di bene", esc(etichetta(TIPI, p.tipo_bene))) +
      riga("Foglio e particella", "foglio " + esc(p.foglio) + ", particella " + esc(p.particella)) +
      riga("Unità catastali nell'elenco", esc(String(p.n_unita))) +
      riga("Superficie", p.area_particella_m2 ? "circa " + esc(numIt(p.area_particella_m2)) + " m² <span class=\"nota\">(area della particella sulla mappa catastale, calcolata da Postilva: non è la superficie dell'edificio)</span>" : vuoto()) +
      riga("Uso originario", vuoto("da completare con la ricerca d'archivio")) +
      riga("Ultimo sopralluogo", p.data_sopralluogo ? esc(dataIt(p.data_sopralluogo)) : vuoto("nessuno finora")) +
      riga("Posizione approssimata", "baricentro della particella catastale: " + esc(p.lat.toFixed(5)) + " N, " + esc(p.lon.toFixed(5)) + " E <span class=\"nota\">(da confermare al sopralluogo)</span>") +
      "</dl>" + tab +
      '<p class="fonte">Fonte: Comune di Taranto, elenco beni immobili 2024 (identificativi e categorie); Agenzia delle Entrate, cartografia catastale, CC BY 4.0 (posizione e superficie). Dettagli nella sezione Fonti.</p>'));

    // 5. Storia
    var st = (p.storia || []).filter(function (s) { return s && s.testo; });
    h.push(sezione("storia", "La sua storia", st.length ?
      '<ol class="linea-tempo">' + st.map(function (s) {
        return "<li><strong>" + esc(dataIt(s.data)) + "</strong> – " + esc(s.testo) + (s.fonte ? ' <span class="fonte">Fonte: ' + esc(s.fonte) + "</span>" : "") + "</li>";
      }).join("") + "</ol>" :
      "<p>" + vuoto("Da completare con la ricerca d'archivio e l'accesso agli atti: ogni passaggio della storia avrà la sua fonte.") + "</p>"));

    // 6. Costi
    var sm = p.stima || {};
    var costi = (sm.min_eur != null && sm.max_eur != null) ?
      "<p><strong>Tra " + esc(numIt(sm.min_eur)) + " € e " + esc(numIt(sm.max_eur)) + " €</strong> · livello di stima " + esc(sm.livello || "–") + " su 3</p>" +
      "<p>Prezzario usato: " + (sm.prezzario ? esc(sm.prezzario) : vuoto("da indicare")) + "</p>" :
      "<p>" + vuoto("Stima non ancora disponibile: da completare dopo il sopralluogo e la valutazione di un tecnico.") + "</p>";
    h.push(sezione("costi", "Quanto costa riaprirlo", costi +
      "<p><strong>Stima parametrica di massima, non perizia.</strong> <a href=\"#metodo\">Come si fanno le stime</a></p>", "costi"));

    // 7. Idee di riuso
    var idee = p.idee_riuso || [];
    h.push(sezione("idee", "Idee di riuso dal quartiere",
      (idee.length ? "<ul>" + idee.map(function (i) { return "<li>" + esc(typeof i === "string" ? i : i.testo) + "</li>"; }).join("") + "</ul>" :
        "<p>" + vuoto("Nessuna idea raccolta finora: le idee arriveranno da incontri e segnalazioni, pubblicate dopo verifica.") + "</p>") +
      '<button type="button" class="bottone" data-messaggio="m-idea" aria-expanded="false" aria-controls="m-idea">Proponi un\'idea</button>' +
      '<p class="messaggio" id="m-idea" hidden>Il modulo per proporre idee di riuso non è ancora attivo: arriverà in una prossima versione del sito. Le proposte saranno pubblicate solo dopo una verifica.</p>'));

    // 8. Modello 3D
    h.push(sezione("3d", "Modello 3D", p.modello_3d ?
      "<p>" + link(p.modello_3d, "Apri il modello 3D") + "</p><p><strong>Ipotesi di riuso</strong>: la parte «come potrebbe essere» è un'ipotesi, non un progetto.</p>" :
      "<p>" + vuoto("Nessun modello 3D per ora.") + "</p>"));

    // 9. Fonti
    h.push(sezione("fonti", "Fonti", '<ul class="fonti-lista">' + (p.fonti || []).map(function (f) {
      return "<li><strong>" + esc(f.titolo) + "</strong> – " + esc(f.ente) + (f.data ? ", " + esc(dataIt(f.data)) : "") +
        (f.licenza ? ", licenza " + esc(f.licenza) : "") + (f.uso ? '. <span class="fonte">Uso: ' + esc(f.uso) + ".</span>" : "") +
        (f.url ? "<br>" + link(f.url, f.url) : "") + "</li>";
    }).join("") + "</ul>"));

    // 10. Segnala un errore
    h.push(sezione("segnala", "Segnala un errore",
      "<p>ID della scheda: <strong>" + esc(p.id) + "</strong> · ultima modifica: <strong>" + esc(dataIt(p.ultima_modifica)) + "</strong></p>" +
      '<button type="button" class="bottone secondario" data-messaggio="m-segnala" aria-expanded="false" aria-controls="m-segnala">Segnala un errore</button>' +
      '<p class="messaggio" id="m-segnala" hidden>Il modulo per le segnalazioni non è ancora attivo: arriverà in una prossima versione del sito. Quando ci sarà, indica l\'ID della scheda (' + esc(p.id) + ").</p>"));

    h.push("</div>");
    box.innerHTML = h.join("");
  }

  /* ---------- eventi delegati ---------- */
  document.addEventListener("click", function (ev) {
    var t = ev.target.closest ? ev.target.closest("[data-vai],[data-messaggio],[data-salta]") : null;
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
    var m = document.getElementById(t.getAttribute("data-messaggio"));
    if (m) { m.hidden = !m.hidden; t.setAttribute("aria-expanded", String(!m.hidden)); }
  });

  /* ---------- avvio ---------- */
  function avvia(dati) {
    edifici = dati.edifici.features;
    base = dati.base;
    meta = dati.meta || {};
    edifici.forEach(function (f) { perId[f.properties.id] = f; });
    $$('[data-meta="generato"]').forEach(function (s) { s.textContent = dataIt(meta.generato) || "–"; });
    disegnaLegenda("#legenda");
    disegnaLegenda("#legenda-metodo");
    disegnaFiltri();
    disegnaElenco();
    applicaFiltri();
    window.addEventListener("hashchange", vai);
    vai();
    creaMappa();
  }

  function carica() {
    if (window.MAPPA_DATI) return avvia(window.MAPPA_DATI);
    var u = window.MAPPA_DATI_URL;
    if (!u || !window.fetch) return erroreMappa();
    Promise.all([fetch(u.edifici).then(function (r) { return r.json(); }), fetch(u.base).then(function (r) { return r.json(); })])
      .then(function (r) { avvia({ edifici: r[0], base: r[1], meta: u.meta }); })
      .catch(function () { erroreMappa(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", carica); else carica();
})();
