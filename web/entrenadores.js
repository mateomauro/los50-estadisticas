/* Los 50 · Entrenadores — los datos vienen cifrados en window.ENTRENADORES (exportar_entrenadores.py).
   Se abren con la clave (PBKDF2 + AES-GCM, WebCrypto). Pantallas: elegir categoría, la categoría (5 preguntas), Todo el club, Consejos
   y la guía del club (qué aprende cada categoría, cantos y zonas, scrum), que sale del material de Coordinación. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const deB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const aB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const SOBRE = window.ENTRENADORES;
  let LLAVE_ACTUAL = null; // la llave abierta, para las fotos (que van cifradas aparte)
  const LLAVE = "los50-ent-llave";
  const FICHA = "los50-ent-ficha"; // para los videos: Cloudflare la pide para entregar cada pedacito (functions/videos)

  // ---------- abrir con la clave ----------
  async function derivar(clave) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(clave), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt: deB64(SOBRE.sal), iterations: SOBRE.vueltas, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, true, ["decrypt"]);
  }
  async function descifrar(llave) {
    const plano = await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64(SOBRE.iv) }, llave, deB64(SOBRE.datos));
    const txt = await new Response(new Blob([plano]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
    return JSON.parse(txt);
  }
  const guardada = () => { try { return localStorage.getItem(LLAVE) || sessionStorage.getItem(LLAVE); } catch (e) { return null; } };
  const hexDe = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const fichaDe = async (clave) => hexDe(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${clave}:los50-videos`)));
  /** la ficha va en una cookie que solo se manda a /videos (así la pide el reproductor del teléfono también) */
  function ponerFicha(ficha, siempre) {
    if (ficha) document.cookie = `los50v=${ficha}; Path=/videos; SameSite=Strict${location.protocol === "https:" ? "; Secure" : ""}${siempre ? "; Max-Age=31536000" : ""}`;
  }
  function guardar(raw, siempre, ficha) {
    try { const s = siempre ? localStorage : sessionStorage; s.setItem(LLAVE, raw); s.setItem(FICHA, ficha); } catch (e) { /* sin almacenamiento: pide la clave cada vez */ }
    ponerFicha(ficha, siempre);
  }
  function olvidar() {
    try { [localStorage, sessionStorage].forEach((s) => { s.removeItem(LLAVE); s.removeItem(FICHA); }); } catch (e) { /* nada */ }
    document.cookie = "los50v=; Path=/videos; Max-Age=0";
  }

  async function intentarGuardada() {
    const raw = guardada();
    if (!raw || !SOBRE) return false;
    try {
      const llave = await crypto.subtle.importKey("raw", deB64(raw), "AES-GCM", true, ["decrypt"]);
      const datos = await descifrar(llave);
      LLAVE_ACTUAL = llave;
      try { ponerFicha(localStorage.getItem(FICHA) || sessionStorage.getItem(FICHA), !!localStorage.getItem(LLAVE)); } catch (e) { /* nada */ }
      iniciar(datos);
      return true;
    } catch (e) { olvidar(); return false; } // los datos se actualizaron con otra clave: se pide de nuevo
  }

  $("#ver-clave").addEventListener("click", (e) => {
    const b = e.currentTarget, ver = b.getAttribute("aria-pressed") !== "true";
    b.setAttribute("aria-pressed", ver); $("#clave").type = ver ? "text" : "password";
    b.setAttribute("aria-label", ver ? "Ocultar la clave" : "Mostrar la clave");
  });
  $("#form-clave").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#error-clave"), btn = $("#entrar");
    err.hidden = true; btn.disabled = true; btn.textContent = "Abriendo…";
    try {
      if (!SOBRE) throw new Error("sin datos");
      const llave = await derivar($("#clave").value);
      const datos = await descifrar(llave);
      LLAVE_ACTUAL = llave;
      guardar(aB64(await crypto.subtle.exportKey("raw", llave)), $("#recordar").checked, await fichaDe($("#clave").value));
      iniciar(datos);
    } catch (e2) {
      err.textContent = SOBRE ? "La clave no es correcta. Probá de nuevo." : "No se encontraron los datos de esta sección.";
      err.hidden = false; $("#clave").select();
    } finally { btn.disabled = false; btn.textContent = "Entrar"; }
  });
  $("#salir").addEventListener("click", () => { olvidar(); location.href = "index.html"; });


  // ---------- la sección ----------
  let D, S;
  const obj = (t) => t.f.map((f) => Object.fromEntries(t.c.map((c, i) => [c, f[i]])));
  const fmt = (v, tipo) => {
    if (v == null) return "–";
    if (tipo === "%") return `${Math.round(v)}%`;
    if (tipo === "d") return (+v).toFixed(Number.isInteger(+v) ? 0 : 1).replace(".", ",");
    return String(v);
  };
  const fecha = (iso) => { const [a, m, d] = iso.split("-"); return `${d}/${m}/${a.slice(2)}`; };
  const slug = (c) => c.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const PS = ["Primera", "Intermedia", "Pre-Intermedia", "M23"];
  const prom = (vals) => { const v = vals.filter((x) => typeof x === "number"); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  // íconos de Lucide (lucide.dev, licencia ISC: web/vendor/lucide-LICENSE.txt), todos con el mismo trazo
  const IC = {
    atras: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
    adelante: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
    alerta: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>',
    bien: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
    medir: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M12 11h4M12 16h4M8 11h.01M8 16h.01"/></svg>',
    gente: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    idea: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5M9 18h6M10 22h4"/></svg>',
    libro: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7v14M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>',
    canto: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 18-5v12L3 14v-3zM11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>',
    escudo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>',
    cono: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.3 6.2a4.55 4.55 0 0 0 5.4 0M7.9 10.7c.9.8 2.4 1.3 4.1 1.3s3.2-.5 4.1-1.3M13.9 3.5a1.93 1.93 0 0 0-3.8-.1l-3 10c-.1.2-.1.4-.1.6 0 1.7 2.2 3 5 3s5-1.3 5-3c0-.2 0-.4-.1-.5ZM7.5 12.2l-4.7 2.7c-.5.3-.8.7-.8 1.1s.3.8.8 1.1l7.6 4.5c.9.5 2.1.5 3 0l7.6-4.5c.7-.3 1-.7 1-1.1s-.3-.8-.8-1.1l-4.7-2.8"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3l14 9-14 9z"/></svg>',
    lista: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/></svg>',
    cruz: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    mas: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M12 5v14"/></svg>',
    reloj: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
    tilde: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
    calendario: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2v4M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/></svg>',
    gota: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>',
    compartir: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98"/></svg>',
    camiseta: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/></svg>',
    buscar: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
    barras: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3v16a2 2 0 0 0 2 2h16M18 17V9M13 17V5M8 17v-3"/></svg>',
    sube: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 7-7 7 7M12 19V5"/></svg>',
    baja: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>',
  };

  function iniciar(datos) {
    const t = (k) => obj(datos[k]);
    D = {
      cats: datos.categorias, act: datos.actualizado,
      res: t("resumen"), torneos: t("torneos"), rivales: t("rivales"), ret: t("retencion"),
      camino: t("camino"), era: t("edad_relativa"), fis: t("fisico"), partidos: t("partidos"), jug: t("jugadores"), noSig: t("no_siguieron"),
      diag: datos.diag_web, expertos: datos.expertos, medir: datos.a_medir, fuentes: datos.fuentes, glosario: datos.glosario,
      guia: datos.guia || null, tries: datos.tries || null, prox: datos.proximos || [], fichados: datos.fichados || null,
    };
    const anios = D.res.map((r) => r["Año"]);
    D.desde = Math.min(...anios); D.hasta = Math.max(...anios);
    $("#sub").textContent = `Planillas oficiales UAR · ${D.desde}–${D.hasta}`;
    $("#actualizado").textContent = D.act;
    $("#candado").hidden = true;
    $("#app").hidden = false;
    S = { ver: "inicio", cat: null, temp: null, gcat: null, tab: null, q: "", ordenJ: "pj", verJ: false, verP: false, verN: false, verR: false, rol: null, para: null, ej: null, puesto: null, practica: null, pgrupo: null, qp: "", qe: "", abiertos: new Set(),
      acat: null, afecha: null, aform: null, marcas: null, base: null, aviso: null, estadoLista: null, recien: new Set(), cambiarNombre: false };
    leerURL();
    render();
    addEventListener("popstate", () => {
      if (ayudaAbierta()) { cerrarAyuda(false); return; } // el "atrás" del celular cierra la ayuda y deja la pantalla como estaba
      if (saltarPop) { saltarPop = false; return; }        // la ayuda se cerró con "Entendido": no hay que redibujar
      leerURL(); render();
    });
  }

  // ---------- URL: ?cat=m17&temp=2026 · ?ver=club · ?ver=consejos · ?ver=guia · ?guia=m10 · ?ver=cantos&tab=zonas · ?ver=scrum · ?ver=puestos · ?puesto=10 ----------
  function leerURL() {
    const p = new URLSearchParams(location.search);
    const c = D.cats.find((x) => slug(x) === p.get("cat"));
    const g = D.guia ? gCats().find((x) => slug(x) === p.get("guia")) : null;
    const hayPuestos = !!(D.guia && D.guia.puestos), hayPr = !!(D.guia && D.guia.practicas && D.guia.practicas.length);
    const vistas = ["club", "consejos", "proximos"].concat(D.guia ? ["guia", "cantos", "scrum"] : [], D.guia && D.guia.ejercicios ? ["ejercicios"] : [], hayPuestos ? ["puestos"] : [], hayPr ? ["practicas"] : []);
    const ej = D.guia && D.guia.ejercicios ? D.guia.ejercicios.find((x) => x.id === p.get("ejercicio")) : null;
    const pu = hayPuestos && puestoDe(+p.get("puesto")) ? +p.get("puesto") : null;
    const pr = hayPr ? D.guia.practicas.find((x) => x.id === p.get("practica")) : null;
    S.cat = c || null;
    S.gcat = g || null;
    S.ej = ej ? ej.id : null;
    S.puesto = pu;
    S.practica = pr ? pr.id : null;
    S.pgrupo = hayPr ? P_GRUPOS.find((x) => slug(x) === p.get("grupo")) || null : null;
    S.fcat = [...new Set(D.prox.map((x) => x.cat))].find((x) => slug(x) === p.get("categoria")) || null;
    const ac = D.fichados ? ASIS_CATS.find((x) => slug(x) === p.get("asistencia")) : null;
    S.acat = ac || null;
    S.afecha = ac && /^\d{4}-\d{2}-\d{2}$/.test(p.get("fecha") || "") ? p.get("fecha") : null;
    S.aform = null; S.marcas = null;
    if (D.fichados) vistas.push("asistencia");
    S.ver = c ? "cat" : g ? "guia" : ej ? "ejercicio" : pu ? "puesto" : pr ? "practica" : ac ? (S.afecha ? "lista" : p.get("chicos") ? "chicos" : "asis")
      : vistas.includes(p.get("ver")) ? p.get("ver") : "inicio";
    S.temp = /^\d{4}$/.test(p.get("temp") || "") ? +p.get("temp") : null;
    S.tab = p.get("tab");
    S.rol = p.get("rol");
    S.para = p.get("para");
  }
  function url() {
    const p = new URLSearchParams();
    if (S.ver === "cat") { p.set("cat", slug(S.cat)); if (S.temp) p.set("temp", S.temp); }
    else if (S.ver === "guia" && S.gcat) p.set("guia", slug(S.gcat));
    else if (S.ver === "ejercicio") p.set("ejercicio", S.ej);
    else if (S.ver === "puesto") p.set("puesto", S.puesto);
    else if (S.ver === "practica") p.set("practica", S.practica);
    else if (S.ver === "practicas") { p.set("ver", S.ver); if (S.pgrupo) p.set("grupo", slug(S.pgrupo)); }
    else if (S.ver === "proximos") { p.set("ver", S.ver); if (S.fcat) p.set("categoria", slug(S.fcat)); }
    else if (["asis", "lista", "chicos"].includes(S.ver)) { p.set("asistencia", slug(S.acat)); if (S.ver === "lista") p.set("fecha", S.afecha); if (S.ver === "chicos") p.set("chicos", "1"); }
    else if (S.ver === "ejercicios") { p.set("ver", S.ver); if (S.tab) p.set("tab", S.tab); if (S.rol) p.set("rol", S.rol); if (S.para) p.set("para", S.para); }
    else if (S.ver !== "inicio") { p.set("ver", S.ver); if (S.tab) p.set("tab", S.tab); }
    const qs = p.toString();
    return location.pathname + (qs ? "?" + qs : "");
  }
  function irA(cambios, empujar = true) {
    Object.assign(S, cambios);
    history[empujar ? "pushState" : "replaceState"]({}, "", url());
    render();
    if (empujar) { scrollTo({ top: 0 }); $("#vista").focus({ preventScroll: true }); }
  }

  // ---------- datos de una categoría ----------
  const filasCat = (cat) => D.res.filter((r) => r["Categoría"] === cat).sort((a, b) => a["Año"] - b["Año"]);
  const ultimaTemp = (cat) => filasCat(cat).at(-1)["Año"];
  const pl = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

  // ---------- gráficos (Chart.js, servido desde web/vendor) ----------
  // Cada gráfico se arma como un <canvas> dentro del texto de la pantalla y se dibuja después de pintarla (dibujarGraficos).
  // Al tocar una barra se ve el número exacto. Mismos colores que el resto de la sección (styles.css / entrenadores.css).
  const COL = { azul: "#1b5fd1", claro: "#c3d0ea", rojo: "#d9483b", texto: "#0b0d12", suave: "#545d6e", linea: "#c9d1de", banda: "#e9edf4", sup: "#ffffff" };
  const LETRA = '"Barlow", system-ui, sans-serif', LETRA_C = '"Barlow Condensed", "Arial Narrow", sans-serif';
  const quieto = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const GRAF = { pend: [], vivos: [] };

  // los números arriba de cada barra, con un borde del color del fondo para que se lean aunque les pase la línea de lo normal
  const pValores = { id: "valores", afterDatasetsDraw(ch, _a, o) {
    const { ctx } = ch;
    ch.data.datasets.forEach((ds, k) => ch.getDatasetMeta(k).data.forEach((barra, i) => {
      const v = ds.data[i];
      if (v == null) return;
      const sel = ch.data.labels[i] === o.sel, txt = o.texto(v, barra.width);
      ctx.save();
      ctx.font = `${sel ? 700 : 600} ${o.chico ? (sel ? 12 : 11) : (sel ? 13 : 12)}px ${LETRA}`;
      ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.lineJoin = "round";
      ctx.lineWidth = 4; ctx.strokeStyle = sel && o.banda ? COL.banda : COL.sup;
      ctx.strokeText(txt, barra.x, barra.y - 5);
      ctx.fillStyle = sel ? COL.texto : COL.suave;
      ctx.fillText(txt, barra.x, barra.y - 5);
      ctx.restore();
    }));
  } };
  // la línea punteada de lo normal (el promedio de todos los años), con su número escrito en la punta
  const pNormal = { id: "normal",
    beforeDatasetsDraw(ch, _a, o) {
      const { ctx, chartArea: a, scales: { y } } = ch;
      (o.lineas || []).forEach(({ v, color }) => {
        const yy = y.getPixelForValue(v);
        ctx.save(); ctx.setLineDash([5, 5]); ctx.lineWidth = 1.5; ctx.strokeStyle = color; ctx.globalAlpha = .6;
        ctx.beginPath(); ctx.moveTo(a.left, yy); ctx.lineTo(a.right + (o.etiqueta ? 6 : 0), yy); ctx.stroke(); ctx.restore();
      });
    },
    afterDraw(ch, _a, o) {
      if (!o.etiqueta || !(o.lineas || []).length) return;
      const { ctx, chartArea: a, scales: { y } } = ch, yy = y.getPixelForValue(o.lineas[0].v);
      ctx.save(); ctx.textAlign = "left";
      ctx.font = `600 11px ${LETRA}`; ctx.fillStyle = COL.suave; ctx.fillText("Lo normal", a.right + 12, yy - 4);
      ctx.font = `700 15px ${LETRA_C}`; ctx.fillStyle = COL.texto; ctx.fillText(o.etiqueta, a.right + 12, yy + 13);
      ctx.restore();
    } };
  // en el de puntos, el año elegido va con un fondo gris detrás (se pinta antes que todo, así no tapa el año de abajo)
  const pBanda = { id: "banda", beforeDraw(ch, _a, o) {
    const i = ch.data.labels.indexOf(o.sel);
    if (i < 0) return;
    const { ctx, chartArea: a, scales: { x } } = ch, w = x.width / ch.data.labels.length, cx = x.getPixelForValue(i);
    ctx.save(); ctx.fillStyle = COL.banda; ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(cx - w / 2 + 2, a.top - 16, w - 4, a.bottom - a.top + 38, 8);
    else ctx.rect(cx - w / 2 + 2, a.top - 16, w - 4, a.bottom - a.top + 38);
    ctx.fill(); ctx.restore();
  } };

  /** opciones comunes: sin ejes ni grilla (los números van arriba de las barras), los años abajo y el elegido en negrita */
  function opciones({ sel, derecha = 0, tooltip }) {
    const elegido = (c) => c.tick && c.tick.label === sel;
    return {
      responsive: true, maintainAspectRatio: false,
      animation: quieto ? false : { duration: 500, easing: "easeOutQuart" },
      layout: { padding: { top: 24, right: derecha } },
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { grid: { display: false }, border: { color: COL.linea },
          // los años siempre derechos (en el celular, un poco más chicos para que entren)
          ticks: { maxRotation: 0, autoSkip: false, color: (c) => (elegido(c) ? COL.texto : COL.suave),
            font: (c) => ({ family: LETRA, size: c.chart.width < 420 ? 11 : 12, weight: elegido(c) ? 700 : 500 }) } },
        y: { display: false, beginAtZero: true, grace: "6%" },
      },
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: COL.texto, padding: 10, cornerRadius: 8, boxPadding: 5, usePointStyle: true,
          titleFont: { family: LETRA, size: 13, weight: "700" }, bodyFont: { family: LETRA, size: 13 }, footerFont: { family: LETRA, size: 12, weight: "500" },
          footerColor: "#c3cad6", ...tooltip },
      },
    };
  }
  const lienzo = (id, txt, doble) => `<div class="graf-caja${doble ? " graf-caja--doble" : ""}"><canvas id="${id}" role="img" aria-label="${esc(txt)}">${esc(txt)}</canvas></div>`;

  /** barras por año; la del año elegido en azul y una línea punteada con lo normal (el promedio de todos los años) */
  function barras(datos, { sel, tipo = "d", promedio = null } = {}) {
    const id = `graf-${GRAF.pend.length}`, s = String(sel), labels = datos.map((d) => String(d.x));
    const o = opciones({ sel: s, derecha: promedio != null ? 70 : 0, tooltip: { displayColors: false, callbacks: {
      label: (c) => fmt(c.raw, tipo), footer: () => (promedio != null ? `Lo normal: ${fmt(promedio, tipo)}` : "") } } });
    o.plugins.valores = { sel: s, texto: (v) => fmt(v, tipo) };
    o.plugins.normal = { lineas: promedio != null ? [{ v: promedio, color: COL.texto }] : [], etiqueta: promedio != null ? fmt(promedio, tipo) : "" };
    GRAF.pend.push({ id, config: {
      type: "bar",
      data: { labels, datasets: [{ data: datos.map((d) => d.y), backgroundColor: labels.map((l) => (l === s ? COL.azul : COL.claro)),
        hoverBackgroundColor: labels.map((l) => (l === s ? "#164fb0" : "#a9bce2")), borderRadius: 4, maxBarThickness: 30, categoryPercentage: .72, barPercentage: .82 }] },
      options: o,
      plugins: [pNormal, pValores],
    } });
    return lienzo(id, datos.map((d) => `${d.x}: ${fmt(d.y, tipo)}`).join(", ") + (promedio != null ? `. Lo normal: ${fmt(promedio, tipo)}` : ""));
  }

  /** puntos por partido: dos barras por año (azul = los que hace, roja = los que le hacen), siempre los mismos dos colores.
      El año elegido va con un fondo gris detrás; las líneas punteadas son lo normal de cada una. */
  function barrasDobles(datos, { sel } = {}) {
    const id = `graf-${GRAF.pend.length}`, s = String(sel), labels = datos.map((d) => String(d.x));
    const pa = prom(datos.map((d) => d.a)), pb = prom(datos.map((d) => d.b));
    const barra = (k, color, nombre, tocada) => ({ label: nombre, data: datos.map((d) => d[k]), backgroundColor: color, hoverBackgroundColor: tocada, borderRadius: 3, maxBarThickness: 20,
      categoryPercentage: .72, barPercentage: .9, pointStyle: "rectRounded" });
    const o = opciones({ sel: s, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt(c.raw, "d")}`,
      footer: () => `Lo normal: hace ${fmt(pa, "d")} y le hacen ${fmt(pb, "d")}` } } });
    // con barras finitas (celular) los números van redondeados, para que entren
    o.plugins.valores = { sel: s, chico: true, banda: true, texto: (v, w) => (w >= 16 ? fmt(v, "d") : String(Math.round(v))) };
    o.plugins.normal = { lineas: [{ v: pa, color: COL.azul }, { v: pb, color: COL.rojo }] };
    o.plugins.banda = { sel: s };
    GRAF.pend.push({ id, config: {
      type: "bar",
      data: { labels, datasets: [barra("a", COL.azul, "Hizo", "#164fb0"), barra("b", COL.rojo, "Le hicieron", "#c23a2e")] },
      options: o,
      plugins: [pBanda, pNormal, pValores],
    } });
    return lienzo(id, datos.map((d) => `${d.x}: hace ${fmt(d.a, "d")}, le hacen ${fmt(d.b, "d")}`).join("; ") + `. Lo normal: hace ${fmt(pa, "d")}, le hacen ${fmt(pb, "d")}`, true);
  }

  /** después de pintar la pantalla: se borran los gráficos de antes y se dibujan los nuevos */
  function dibujarGraficos() {
    GRAF.vivos.forEach((g) => g.destroy());
    GRAF.vivos = !window.Chart ? [] : GRAF.pend.filter((g) => document.getElementById(g.id)).map((g) => new Chart(document.getElementById(g.id), g.config));
    GRAF.pend = [];
  }

  // ---------- pantallas ----------
  function render() {
    $("#app").classList.toggle("app--ancha", S.ver === "inicio"); // el inicio usa dos columnas en la compu (y el pie se alinea con eso)
    GRAF.pend = [];
    soltarVideos();
    $("#vista").dataset.ver = S.ver;
    ({ inicio: vInicio, cat: vCategoria, club: vClub, consejos: vConsejos, guia: vGuia, cantos: vCantos, scrum: vScrum, ejercicios: vEjercicios, ejercicio: vEjercicio, puestos: vPuestos, puesto: vPuesto, practicas: vPracticas, practica: vPractica, proximos: vProximos,
      asistencia: vAsistencia, asis: vAsis, lista: vLista, chicos: vChicos })[S.ver]();
    dibujarGraficos();
    ponerFotos();
  }
  /** sección desplegable: arranca cerrada y recuerda si la abriste (al ordenar o "ver todos" no se cierra).
      Con "dato" se muestra a la derecha del título el número principal de adentro ("18 partidos", "78% volvió"). */
  const desple = (id, titulo, contenido, dato = "") =>
    `<details class="mas mas--grande" data-sec="${id}"${S.abiertos.has(id) ? " open" : ""}><summary><span class="mas__tit">${titulo}</span>${dato ? `<span class="mas__dato num">${dato}</span>` : ""}</summary><div class="mas__in">${contenido}</div></details>`;
  /** al lado de la respuesta: si fue mejor o peor que lo normal (el promedio de todos los años), con lo normal entre paréntesis */
  const tendencia = (dif, umbral, normal) => dif > umbral ? `<p class="tend tend--mejor">${IC.sube}Mejor que lo normal (${normal})</p>`
    : dif < -umbral ? `<p class="tend tend--peor">${IC.baja}Peor que lo normal (${normal})</p>` : `<p class="tend">Como lo normal (${normal})</p>`;
  const volver = (txt = "Inicio", a = "inicio") => `<button type="button" class="volver" data-ir="${a}">${IC.atras}${txt}</button>`;

  // ---------- ayuda: el "?" al lado de un título abre la explicación (en el celular sale desde abajo) ----------
  // así la pantalla queda limpia: el número y la frase que lo dice en palabras quedan a la vista, el "cómo se lee" va acá
  const AYUDA = {
    categorias: () => ["Elegí tu categoría", ["Tocá una categoría para ver sus partidos, sus jugadores y qué tiene que aprender.",
      `Los números son de ${D.hasta}: los partidos oficiales que están cargados en la página de la UAR.`,
      "Los infantiles no juegan partidos oficiales: ahí se ve qué tiene que aprender cada categoría."]],
    asistencia: () => ["Asistencia", ["Para tomar lista en cada entrenamiento y ver cuánto viene cada chico.",
      "El porcentaje es sobre los entrenamientos en los que se tomó lista. Los cancelados no cuentan.",
      "La lista de chicos arranca con los fichados en la UAR para este año. Cada entrenador puede sumar o sacar chicos."]],
    asisCat: () => ["Cómo se lee", ["Al lado de cada chico: a cuántos entrenamientos vino, de los que se tomó lista.",
      "Verde: viene el 80% o más. Amarillo: entre 60% y 80%. Rojo: menos del 60%. Los que menos vienen están arriba.",
      "Los entrenamientos cancelados no cuentan, y un día que no se tomó lista tampoco. Un chico sumado a mano cuenta desde el día que se sumó.",
      "Lo que se carga acá (listas, días, cancelados) lo ven todos los entrenadores."]],
    proximos: () => ["Próximos partidos", ["Los partidos que la UAR ya cargó para las próximas fechas, con el día y la hora.",
      "Se actualiza solo los lunes, martes y miércoles. Si un partido no aparece, es porque la UAR todavía no lo cargó.",
      "La UAR no dice en qué cancha se juega."]],
    ultimos: () => ["Últimos partidos cargados", [`Datos al ${D.act}.`,
      "Si un partido del fin de semana no aparece, es porque todavía no cargaron su planilla en la página de la UAR."]],
    comparar: () => ["Cómo se leen estos gráficos", ["Cada barra es un año. La que está resaltada es el año que estás mirando: se cambia con las flechas de arriba.",
      "La línea punteada es lo normal: el promedio de todos los años. Si la barra pasa la línea, ese año estuvo por encima de lo normal.",
      "En el de puntos, la barra azul son los que hizo y la roja los que le hicieron, cada una con su línea de lo normal.",
      "Arriba de cada gráfico dice si fue mejor o peor que lo normal."]],
    siguenCat: () => ["¿Los chicos siguen?", ["De los chicos que estuvieron en la planilla de la categoría cada año (jugando o en el banco), qué parte volvió a aparecer en una planilla del club al año siguiente, en cualquier categoría.",
      "El año que está en curso todavía no se puede saber: hay que esperar a que arranque la temporada que viene.",
      "Un chico que sigue entrenando pero no entró en ninguna planilla, o que se fue a otro club, cuenta como que no siguió."]],
    tries: () => ["Los tries: quién y cuándo", ["Sale de las planillas de la UAR: la camiseta del que hizo cada try y el minuto.",
      "La planilla no dice de qué jugada vino el try (line, scrum, contraataque), así que eso no se puede saber.",
      "Si el que lo hizo entró del banco, cuenta en el puesto donde más veces fue titular. El try penal no tiene jugador.",
      "En juveniles la camiseta no siempre es el puesto: ahí solo se ve cuándo fueron los tries."]],
    pase: () => ["¿Llegan a Primera?", ["De los M19 de cada año, qué parte apareció en planillas de Primera, Intermedia o Pre-Intermedia en los 2 años siguientes."]],
    siguen: () => {
      const u = Math.max(...D.ret.map((r) => r["Año"]));
      return ["¿Los chicos siguen jugando?", ["De los chicos que estuvieron en la planilla de cada categoría ese año (jugando o en el banco), qué parte volvió a aparecer en una planilla del club al año siguiente.",
        "Verde es lo mejor, amarillo es regular y rojo quiere decir que se están yendo muchos chicos.", "Una raya (–) quiere decir que no hay datos de esa categoría ese año.",
        ...(u < D.hasta ? [`${D.hasta} todavía no aparece: recién se va a saber quién volvió cuando arranque la temporada que viene.`] : [])]];
    },
    camino: () => ["Camino a Primera", ["Cuántos jugadores debutaron en Primera cada año, la edad promedio de los titulares y cuántos partidos tenían antes, en promedio.",
      "Si debutan pocos y los titulares tienen cada vez más partidos, el equipo envejece y no se renueva."]],
    nacieron: () => ["¿En qué parte del año nacieron?", ["En muchos clubes juegan más los nacidos en enero, febrero y marzo, porque a esa edad son más grandes, y se pierden los de fin de año.",
      "Si las 4 partes son parecidas, el club no está dejando afuera a los más chicos."]],
    peso: () => ["Peso promedio", ["Lo que dice la ficha de la UAR de los que jugaron este año.", "Es un solo dato por jugador y sin fecha: sirve para arrancar a trabajar con la nutricionista."]],
    consejos: () => ["Consejos", ["Lo que muestran los datos del club y qué hacer con eso.",
      "Para trabajar: lo que conviene mejorar. Está bien: lo que hay que mantener. Falta medir: lo que todavía no se puede saber con las planillas de la UAR."]],
    guiaCats: () => ["Qué aprende cada categoría", ["Lo que el club busca enseñar en cada categoría, de M6 a M19: la frase guía, qué priorizar en ataque y en defensa, y qué evitar.",
      "Lo definió la Coordinación de Rugby del club (Magali Fazzi) en 2026."]],
    guiaCat: () => ["De dónde sale esto", ["Es lo que la Coordinación de Rugby del club (Magali Fazzi) definió para esta categoría en 2026.",
      "Las frases de arriba son las frases guía: lo que el chico tiene que poder decir y hacer en esta categoría."]],
    cantos: () => ["Cantos y zonas", ["Los cantos del club con lo que quiere decir cada uno, las zonas y los canales de la cancha, y el modelo de juego.",
      "Sale del material de la Coordinación de Rugby del club (Magali Fazzi), 2026."]],
    scrum: () => ["Scrum seguro", ["Qué se puede hacer en cada edad, cómo se enseña, el set up del club, la entrada y el empuje.",
      "En Sesiones: las sesiones de scrum que planificó la Coordinación para M13 a M19, en el orden en que se hicieron. Muestran cómo se va sumando de a poco, hasta llegar al set up.",
      "Sale del protocolo y del plan de scrum de la Coordinación de Rugby del club (Magali Fazzi), 2026."]],
    ejercicios: () => ["Ejercicios", ["Los ejercicios de line y maul de la Coordinación de Rugby (Magali Fazzi) y los juegos que más usan los entrenadores de infantiles en sus planificaciones.",
      "Los de line están en orden, de lo más fácil a lo más difícil para cada rol.", "Tocá uno para ver cómo se hace, en qué fijarse y qué material hace falta."]],
    practicas: () => ["Prácticas", ["Las prácticas que armaron los entrenadores del club en 2026, día por día, de las planillas de Coordinación.",
      "Sirven para repetir una que salió bien o para ver cómo se arma una práctica en el club: entrada en calor, destrezas, juego integrado y cierre.",
      "Están como las escribieron los entrenadores. Adentro de cada una, con el botón de abajo se manda por WhatsApp."]],
    puestos: () => ["Los puestos", ["Lo que el club espera de cada puesto, del 1 al 15: qué tiene que saber hacer, lo mental y lo ideal en un partido.",
      "Sale del perfil del jugador de la Coordinación de Rugby del club (Magali Fazzi)."]],
    partidoPuesto: () => ["En un partido", ["Lo ideal para este puesto en un partido entero: por ejemplo, cuántos tackles tiene que hacer.",
      "Sirve para mirar los videos de los partidos y ver si el jugador llega.",
      "Rucks en ataque: las veces que entra a un ruck cuando el equipo tiene la pelota. Contactos: las veces que lleva la pelota al choque. Quiebres: las veces que pasa la línea de defensa. Recuperadas: las pelotas que le gana al rival."]],
    medir: () => ["Qué empezar a medir", ["Son datos que las planillas de la UAR no tienen y que sirven para saber si los chicos mejoran.",
      "Tocá cada uno para ver qué medir, cada cuánto, quién y cómo."]],
  };
  const ayudaBtn = (k) => `<button type="button" class="ayuda-btn" data-ayuda="${k}" aria-haspopup="dialog" aria-label="Qué quiere decir: ${esc(AYUDA[k]()[0])}">?</button>`;
  const cabTit = (texto, k) => `<h2 class="cab__cat">${texto}${k ? ayudaBtn(k) : ""}</h2>`;
  const tit = (texto, k) => `<div class="tit"><h2 class="h2">${texto}${k ? ayudaBtn(k) : ""}</h2></div>`;
  let ayudaDesde = null, saltarPop = false;
  const ayudaAbierta = () => { const c = $("#ayuda"); return !!c && !c.hidden; };
  function abrirAyuda(k, boton) {
    const [t, parrafos] = AYUDA[k]();
    let caja = $("#ayuda");
    if (!caja) {
      document.body.insertAdjacentHTML("beforeend", `<div class="ayuda" id="ayuda" hidden><div class="ayuda__fondo" data-cerrar-ayuda></div>
        <div class="ayuda__caja" role="dialog" aria-modal="true" aria-labelledby="ayuda-t"><h2 class="ayuda__t" id="ayuda-t"></h2><div class="ayuda__txt"></div>
        <button type="button" class="ayuda__ok" data-cerrar-ayuda>Entendido</button></div></div>`);
      caja = $("#ayuda");
    }
    $("#ayuda-t").textContent = t;
    $(".ayuda__txt", caja).innerHTML = parrafos.map((p) => `<p>${esc(p)}</p>`).join("");
    caja.hidden = false;
    ayudaDesde = boton;
    history.pushState({ ayuda: true }, "", location.href); // así el "atrás" del celular la cierra
    $(".ayuda__ok", caja).focus();
  }
  function cerrarAyuda(desdeBoton = true) {
    if (!ayudaAbierta()) return;
    $("#ayuda").hidden = true;
    if (ayudaDesde && ayudaDesde.isConnected) ayudaDesde.focus();
    if (desdeBoton && history.state && history.state.ayuda) { saltarPop = true; history.back(); }
  }
  /** una opción de menú: ícono, nombre, una línea que dice qué hay y la flecha (mismo estilo que las filas de categoría) */
  const opcion = (ir, ic, nom, que) => `<li><button type="button" class="menu__it" data-ir="${ir}"><span class="menu__ic">${ic}</span>
    <span class="menu__txt"><b>${nom}</b><small>${que}</small></span>${IC.adelante}</button></li>`;

  // inicio: a la izquierda lo principal (elegir la categoría); a la derecha, la guía, los últimos partidos y todo el club.
  // En el celular va todo en una columna, en ese orden.
  function vInicio() {
    // las categorías como una tabla de posiciones: una fila por categoría, con ganados, empatados y perdidos
    // en los mismos colores que adentro de la categoría. Toda la fila se toca.
    const fila = (cat) => {
      const r = filasCat(cat).at(-1);
      const n = (k, v) => `<span class="fila-cat__n fila-cat__n--${k}${v ? "" : " fila-cat__n--cero"} num">${v}</span>`;
      return `<li><button type="button" class="fila-cat" data-ir-cat="${esc(cat)}"
        aria-label="${esc(cat)}, ${r["Año"]}: ${pl(r.PJ, "partido", "partidos")}. Ganó ${r.G}, empató ${r.E}, perdió ${r.P}">
        <span class="fila-cat__nom">${esc(cat)}<small>${r["Año"] !== D.hasta ? `${r["Año"]} · ` : ""}${pl(r.PJ, "partido", "partidos")}</small></span>
        ${n("g", r.G)}${n("e", r.E)}${n("p", r.P)}${IC.adelante}</button></li>`;
    };
    const tabla = (titulo, cats) => `<div class="grupo-cat">
        <div class="grupo-cat__cab"><h3 class="grupo-cat__tit">${titulo}</h3><span aria-hidden="true">Ganó</span><span aria-hidden="true">Empató</span><span aria-hidden="true">Perdió</span></div>
        <ul class="filas-cat">${cats.map(fila).join("")}</ul></div>`;
    // los infantiles no tienen partidos en la UAR: su fila lleva directo a lo que tienen que aprender
    const filaInf = (c) => `<li><button type="button" class="fila-cat fila-cat--inf" data-ir-guia="${esc(c.cat)}">
        <span class="fila-cat__nom">${esc(c.cat)}${c.apodo ? `<small>${esc(c.apodo)}</small>` : ""}</span>
        <span class="fila-cat__etapa">${esc(c.etapa)}</span>${IC.adelante}</button></li>`;
    $("#vista").innerHTML = `${D.fichados ? hoyInicio() : ""}<div class="inicio">
      <section class="sec">
        ${tit("Elegí tu categoría", "categorias")}
        ${tabla("Plantel superior", D.cats.filter((c) => PS.includes(c)))}
        ${tabla("Juveniles", D.cats.filter((c) => !PS.includes(c)))}
        ${D.guia ? `<div class="grupo-cat">
          <div class="grupo-cat__cab"><h3 class="grupo-cat__tit">Infantiles</h3></div>
          <ul class="filas-cat">${D.guia.infantiles.slice().reverse().map(filaInf).join("")}</ul></div>` : ""}
      </section>
      <div class="inicio__lado">
        ${D.guia ? `<section class="sec">
          ${tit("Guía del club")}
          <ul class="menu">
            ${opcion("guia", IC.libro, "Qué aprende cada categoría", "Frase guía, prioridades y qué evitar")}
            ${D.guia.puestos ? opcion("puestos", IC.camiseta, "Los puestos", "Qué se espera del 1 al 15") : ""}
            ${opcion("cantos", IC.canto, "Cantos y zonas", `Los ${D.guia.cantos.length} cantos y las zonas de la cancha`)}
            ${opcion("scrum", IC.escudo, "Scrum seguro", "Qué se hace en cada edad y el set up")}
            ${D.guia.ejercicios ? opcion("ejercicios", IC.cono, "Ejercicios", "Line, maul y juegos para entrenar") : ""}
            ${D.guia.practicas && D.guia.practicas.length ? opcion("practicas", IC.calendario, "Prácticas", "Las que armaron los entrenadores, día por día") : ""}
          </ul>
        </section>` : ""}
        <section class="sec">
          ${tit("Últimos partidos cargados", "ultimos")}
          <ol class="resultados">${D.partidos.slice(0, 5).map((p) => partidoHTML(p, true)).join("")}</ol>
        </section>
        <section class="sec">
          ${tit("Todo el club")}
          <ul class="menu">
            ${D.fichados ? opcion("asistencia", IC.lista, "Asistencia", "Tomar lista y ver cuánto viene cada chico") : ""}
            ${proxTodos().length ? opcion("proximos", IC.calendario, "Próximos partidos", `El próximo es el ${esc(cuandoP(proxTodos()[0]).replace(/ de \S+$/, ""))}`) : ""}
            ${opcion("club", IC.gente, "¿Los chicos siguen?", "Cuántos siguen y llegan a Primera")}
            ${opcion("consejos", IC.idea, "Consejos", "Qué trabajar y qué empezar a medir")}
          </ul>
        </section>
      </div>
    </div>`;
  }

  // categoría: las 5 preguntas
  function vCategoria() {
    const cat = S.cat, filas = filasCat(cat), anios = filas.map((r) => r["Año"]);
    if (!S.temp || !anios.includes(S.temp)) S.temp = ultimaTemp(cat);
    const a = S.temp, r = filas.find((x) => x["Año"] === a), i = anios.indexOf(a), px = proxDe(cat)[0];

    // 1. cómo le fue
    const duelo = (lbl, hizo, recibio) => {
      const tot = hizo + recibio || 1;
      return `<div class="duelo"><span class="duelo__lbl">${lbl}</span>
        <span class="duelo__n duelo__n--a num"><strong>${hizo}</strong><small>hizo</small></span>
        <span class="duelo__barra" aria-hidden="true"><i style="flex-grow:${hizo || 0.001}"></i><i style="flex-grow:${recibio || 0.001}"></i></span>
        <span class="duelo__n duelo__n--b num"><strong>${recibio}</strong><small>le hicieron</small></span></div>`;
    };
    const pos = (t) => { const m = (t["Posición en la tabla"] || "").split(" | ").at(-1).match(/(\d+)º de (\d+)/); return m ? `Terminó ${m[1]}º de ${m[2]}` : ""; };
    const tor = D.torneos.filter((x) => x["Categoría"] === cat && x["Año"] === a);

    // 2. comparado con todos los años: arriba de cada gráfico, la respuesta en palabras y si fue mejor o peor que lo normal
    const promGan = prom(filas.map((x) => x["% victorias"]));
    const pf = r["PF por partido"], pc = r["PC por partido"];
    const promPF = prom(filas.map((x) => x["PF por partido"])), promPC = prom(filas.map((x) => x["PC por partido"]));
    const titGan = r["% victorias"] == null ? "" : `<p class="titular">Ganó el <b>${fmt(r["% victorias"], "%")}</b> de los partidos</p>
      ${tendencia(r["% victorias"] - promGan, 3, fmt(promGan, "%"))}`;
    const titPts = pf == null || pc == null ? "" : `<p class="titular">Hizo <span class="junto"><i class="punto punto--a"></i><b>${fmt(pf, "d")}</b></span> y le hicieron <span class="junto"><i class="punto punto--b"></i><b>${fmt(pc, "d")}</b></span> puntos por partido</p>
      ${tendencia((pf - pc) - (promPF - promPC), 2, `${fmt(promPF, "d")} y ${fmt(promPC, "d")}`)}`;
    // 3. partidos y rivales
    const parts = D.partidos.filter((x) => x.cat === cat && x.anio === a), verP = S.verP ? parts : parts.slice(0, 6);
    const riv = D.rivales.filter((x) => x["Categoría"] === cat);
    // 4. jugadores
    const jug = D.jug.filter((x) => x.cat === cat && x.anio === a).sort((x, y) => y[S.ordenJ] - x[S.ordenJ] || y.pj - x.pj || x.nombre.localeCompare(y.nombre, "es"));
    const verJ = S.verJ ? jug : jug.slice(0, 12);
    // 5. siguen jugando
    const ret = D.ret.filter((x) => x["Categoría"] === cat).sort((x, y) => x["Año"] - y["Año"]);
    const retSel = ret.filter((x) => x["Año"] <= a).at(-1);
    const sigTemp = (an) => anios.find((x) => x > an) || an + 1;
    const pase = ret.filter((x) => x["% pasaje a plantel superior"] != null);
    const paseSel = pase.filter((x) => x["Año"] <= a).at(-1);

    // local, visitante y más
    // un renglón por dato: la barra azul es el año elegido y la rayita, lo normal (el promedio de todos los años).
    // Abajo del título va una línea solo si agrega algo para leer el número (no si repite el título).
    const masFila = (lbl, k, nota = "") => {
      const v = r[k], p = prom(filas.map((x) => x[k]));
      if (v == null) return "";
      const pos = (x) => `${Math.max(0, Math.min(100, x))}%`;
      return `<li class="dato-e"><b class="dato-e__tit">${lbl}</b>
        <span class="dato-e__val num"><strong>${fmt(v, "%")}</strong><small>lo normal: ${fmt(p, "%")}</small></span>
        ${nota ? `<span class="dato-e__exp">${nota}</span>` : ""}
        <span class="dato-e__barra" aria-hidden="true"><i style="width:${pos(v)}"></i>${p != null ? `<b style="left:${pos(p)}"></b>` : ""}</span></li>`;
    };
    const verR = S.verR ? riv : riv.slice(0, 8);

    // los tries: quién los hace y cuándo (en juveniles, solo cuándo: la camiseta no siempre es el puesto)
    const tr = D.tries && D.tries[cat] && D.tries[cat][a];
    let triesHTML = "";
    if (tr) {
      const af = tr.a_favor, ec = tr.en_contra;
      // un renglón por dato con lo que hizo (azul) y lo que le hicieron (rojo); arriba, una sola vez, qué es cada número
      const fila = (lbl, x, y) => `<div class="duelo duelo--c"><span class="duelo__lbl">${lbl}</span>
        <strong class="duelo__n duelo__n--a num">${x}</strong>
        <span class="duelo__barra" aria-hidden="true"><i style="flex-grow:${x || 0.001}"></i><i style="flex-grow:${y || 0.001}"></i></span>
        <strong class="duelo__n duelo__n--b num">${y}</strong></div>`;
      const tabla = (filas) => `<div class="duelos duelos--c"><div class="duelo duelo--c duelo--cab" aria-hidden="true"><span></span><span class="duelo__n--a">Hizo</span><span></span><span class="duelo__n--b">Le hicieron</span></div>
        ${filas.filter(Boolean).map(([l, k, sub]) => fila(l, sub ? af.lineas[k] : af[k], sub ? ec.lineas[k] : ec[k])).join("")}</div>`;
      const mas = (x) => (x.forwards > x.backs ? "forwards" : x.backs > x.forwards ? "backs" : "");
      const quien = af.lineas && ec.lineas ? `<h3 class="grupo">¿Quién los hace?</h3>
        <p class="titular">${!af.tries ? "No hizo tries" : mas(af) ? `Hace más tries con los <b>${mas(af)}</b>` : "Hace tries parejo con forwards y backs"}
          y ${!ec.tries ? "no le hicieron tries" : mas(ec) ? `se los hacen más los <b>${mas(ec)}</b>` : "se los hacen parejo forwards y backs"}</p>
        ${tabla([["Forwards", "forwards"], ["Backs", "backs"],
          ["Primera línea<small>1 al 3</small>", "primera", 1], ["Segunda línea<small>4 y 5</small>", "segunda", 1], ["Tercera línea<small>6 al 8</small>", "tercera", 1],
          ["Medios<small>9 y 10</small>", "medios", 1], ["Centros<small>12 y 13</small>", "centros", 1], ["Wings y fullback<small>11, 14 y 15</small>", "wings_fullback", 1],
          af.try_penal || ec.try_penal ? ["Try penal", "try_penal"] : null])}` : "";
      triesHTML = desple("tries", "Los tries: quién y cuándo", `
        ${quien}
        <h3 class="grupo">¿Cuándo?</h3>
        <p class="titular">En los últimos 10 minutos hizo <b>${af.ultimos10}</b> y le hicieron <b>${ec.ultimos10}</b>${ayudaBtn("tries")}</p>
        ${tabla([["1er tiempo", "t1"], ["2º tiempo", "t2"], ["Últimos 10 minutos", "ultimos10"], ["Entrando del banco", "banco"]])}`);
    }

    $("#vista").innerHTML = `
      <div class="cab">
        ${volver()}
        <div class="cab__fila">
          <h2 class="cab__cat">${esc(cat)}</h2>
          <div class="anio" role="group" aria-label="Año">
            <button type="button" data-anio="${i > 0 ? anios[i - 1] : ""}" aria-label="Año anterior"${i > 0 ? "" : " disabled"}>${IC.atras}</button>
            <span class="anio__n num" aria-live="polite"><small>Año</small>${a}</span>
            <button type="button" data-anio="${i < anios.length - 1 ? anios[i + 1] : ""}" aria-label="Año siguiente"${i < anios.length - 1 ? "" : " disabled"}>${IC.adelante}</button>
          </div>
        </div>
        ${px ? `<div class="prox">${IC.calendario}<span class="prox__txt"><span class="prox__lbl">Próximo partido</span>
          <b>${esc(mayus(cuandoP(px)))}${px.hora ? ` · ${esc(px.hora)}` : ""}</b>
          <span class="prox__vs">${vsHTML(px)}</span>
          <span>${subProx(px)}</span></span></div>` : ""}
        ${D.guia && gDe(cat) ? `<button type="button" class="atajo" data-ir-guia="${esc(cat)}">${IC.libro}<span>Qué tiene que aprender ${esc(cat)}</span>${IC.adelante}</button>` : ""}
        ${D.guia ? atajoPr(cat) : ""}
        ${atajoAsis(cat)}
      </div>

      <section class="sec">
        <div class="tit"><h2 class="h2">Cómo le fue en ${a}</h2><span class="tit__meta num">${pl(r.PJ, "partido", "partidos")}</span></div>
        ${r.PJ < 5 ? `<p class="tend tend--ojo">Son pocos partidos: los números pueden engañar</p>` : ""}
        <div class="gep">
          <div class="gep__c gep--g"><strong class="num">${r.G}</strong><span>${r.G === 1 ? "ganado" : "ganados"}</span></div>
          <div class="gep__c gep--e"><strong class="num">${r.E}</strong><span>${r.E === 1 ? "empatado" : "empatados"}</span></div>
          <div class="gep__c gep--p"><strong class="num">${r.P}</strong><span>${r.P === 1 ? "perdido" : "perdidos"}</span></div>
        </div>
        <div class="duelos">
          ${duelo("Puntos", r["Puntos a favor"], r["Puntos en contra"])}
          ${duelo("Tries", r["Tries a favor"], r["Tries en contra"])}
        </div>
        ${tor.length ? `<h3 class="grupo">Torneos</h3><ul class="lista">${tor.map((t) => `<li><span class="lista__txt">${esc(t.Torneo.replace(/^\d+\/\d{4}\s*/, ""))}<small class="num">${pl(t.G, "ganado", "ganados")} · ${pl(t.P, "perdido", "perdidos")}${t.E ? ` · ${pl(t.E, "empatado", "empatados")}` : ""}</small></span>${pos(t) ? `<span class="chip">${pos(t)}</span>` : ""}</li>`).join("")}</ul>` : ""}
      </section>

      <section class="sec">
        ${tit("¿Mejor o peor que otros años?", "comparar")}
        <div class="bloque-graf">${titGan}
          <div class="graf-wrap">${barras(filas.map((x) => ({ x: x["Año"], y: x["% victorias"] })), { sel: a, tipo: "%", promedio: promGan })}</div></div>
        <div class="bloque-graf">${titPts}
          <div class="graf-wrap">${barrasDobles(filas.map((x) => ({ x: x["Año"], a: x["PF por partido"], b: x["PC por partido"] })), { sel: a })}</div></div>
      </section>

      <section class="sec desplegables">
        ${videosDe("cats", cat).length ? desple("videos", "Videos de partidos", `<div class="videos-ej">${videosDe("cats", cat).map(tarjetaVideo).join("")}</div>`,
          pl(videosDe("cats", cat).length, "video", "videos")) : ""}
        ${desple("partidos", "Contra quién jugó", `
          <ol class="resultados">${verP.map(partidoHTML).join("")}</ol>
          ${parts.length > 6 ? `<button type="button" class="btn btn--ancho" data-ver="P">${S.verP ? "Ver menos" : `Ver los ${parts.length} partidos`}</button>` : ""}
          ${riv.length ? `<div class="grupo-fila"><h3 class="grupo">Contra cada rival, todos los años</h3>
            <p class="ley"><span><i class="ley--g"></i>ganamos</span><span><i class="ley--e"></i>empatamos</span><span><i class="ley--p"></i>perdimos</span></p></div>
            <ul class="rivales-e">${verR.map((x) => `<li><div class="rivales-e__fila"><b>${esc(x.Rival)}</b><span class="num">${x.PJ} partidos</span></div>
              <div class="rivales-e__barra num" role="img" aria-label="Ganamos ${x.G}, empatamos ${x.E}, perdimos ${x.P}">${[["g", x.G], ["e", x.E], ["p", x.P]].filter(([, n]) => n).map(([k, n]) => `<i class="${k}" style="flex-grow:${n}">${n}</i>`).join("")}</div></li>`).join("")}</ul>
            ${riv.length > 8 ? `<button type="button" class="btn btn--ancho" data-ver="R">${S.verR ? "Ver menos" : `Ver los ${riv.length} rivales`}</button>` : ""}` : ""}`,
          pl(parts.length, "partido", "partidos"))}

        ${desple("jugadores", "Quiénes jugaron", `
          <div class="tabla-e-wrap"><table class="tabla-e">
            <thead><tr><th scope="col" class="izq">Jugador</th>${[["pj", "Partidos"], ["tries", "Tries"], ["pts", "Puntos"]].map(([k, l]) =>
              `<th scope="col"${k === S.ordenJ ? ' aria-sort="descending"' : ""}><button type="button" data-ordj="${k}">${l}</button></th>`).join("")}</tr></thead>
            <tbody>${verJ.map((j) => `<tr><td class="izq">${nombreHTML(j.nombre)}</td><td>${j.pj}</td><td>${j.tries}</td><td>${j.pts}</td></tr>`).join("")}</tbody>
          </table></div>
          ${jug.length > 12 ? `<button type="button" class="btn btn--ancho" data-ver="J">${S.verJ ? "Ver menos" : `Ver los ${jug.length} jugadores`}</button>` : ""}`,
          pl(jug.length, "jugador", "jugadores"))}

        ${triesHTML}

        ${ret.length ? desple("siguen", "¿Los chicos siguen?", `
          ${retSel ? `<p class="titular">De los <b>${retSel.Jugadores}</b> de ${retSel["Año"]}, volvieron <b>${retSel["Siguen la temporada siguiente"]}</b> en ${sigTemp(retSel["Año"])}${ayudaBtn("siguenCat")}</p>` : ""}
          <div class="graf-wrap">${barras(ret.map((x) => ({ x: x["Año"], y: x["% retención"] })), { sel: retSel ? retSel["Año"] : null, tipo: "%", promedio: prom(ret.map((x) => x["% retención"])) })}</div>
          ${retSel ? listaNoSiguieron(cat, retSel["Año"], sigTemp(retSel["Año"])) : ""}
          ${pase.length ? `<h3 class="grupo grupo--sep">¿Llegan a Primera?</h3>
            ${paseSel ? `<p class="titular">De los <b>${paseSel.Jugadores}</b> M19 de ${paseSel["Año"]}, <b>${paseSel["Pasaron a plantel superior (en 2 temporadas)"]}</b> ya jugaron en el plantel superior${ayudaBtn("pase")}</p>` : ""}
            <div class="graf-wrap">${barras(pase.map((x) => ({ x: x["Año"], y: x["% pasaje a plantel superior"] })), { sel: paseSel ? paseSel["Año"] : null, tipo: "%", promedio: prom(pase.map((x) => x["% pasaje a plantel superior"])) })}</div>` : ""}`,
          retSel ? `${fmt(retSel["% retención"], "%")} volvió` : "") : ""}

        ${desple("mas", "Local, visitante y más", `
          <ul class="datos-e">
            ${masFila("Hizo el primer tanto del partido", "% marcamos primero",
              r["% victorias cuando marcamos primero"] != null ? `Cuando lo hizo, ganó el ${fmt(r["% victorias cuando marcamos primero"], "%")}.` : "")}
            ${masFila("Ganó jugando en casa", "% victorias de local")}
            ${masFila("Ganó jugando afuera", "% victorias de visitante")}
            ${masFila("Conversiones que entraron", "% conversiones", "El try penal no cuenta, porque no se patea.")}
            ${masFila("Puntos en contra en el 2º tiempo", "% PC en 2º tiempo", "Más de 60% puede ser cansancio.")}
          </ul>`)}
      </section>`;
  }
  /** los que estuvieron en planillas ese año y no volvieron a aparecer el año siguiente */
  function listaNoSiguieron(cat, anio, sig) {
    const l = D.noSig.filter((x) => x.cat === cat && x.anio === anio);
    if (!l.length) return `<p class="frase">Todos volvieron a aparecer en ${sig}.</p>`;
    const ver = S.verN ? l : l.slice(0, 8);
    const detalle = (x) => x.jugo ? `${x.jugo === 1 ? "jugó 1 partido" : `jugó ${x.jugo} partidos`}` : `solo en el banco (${x.planillas === 1 ? "1 partido" : `${x.planillas} partidos`})`;
    return `<h3 class="grupo">Los que no volvieron a aparecer en ${sig} (${l.length})</h3>
      <ul class="lista">${ver.map((x) => `<li><span class="lista__txt"><span>${nombreHTML(x.nombre)}</span><small>${detalle(x)}</small></span>
        <span class="chip chip--gris">último partido: ${fecha(x.ultimo)}</span></li>`).join("")}</ul>
      ${l.length > 8 ? `<button type="button" class="btn btn--ancho" data-ver="N">${S.verN ? "Ver menos" : `Ver los ${l.length}`}</button>` : ""}`;
  }
  function nombreHTML(n) {
    const i = n.indexOf(",");
    return i < 0 ? `<b>${esc(n)}</b>` : `<b>${esc(n.slice(0, i))}</b>, ${esc(n.slice(i + 1).trim())}`;
  }
  // ---------- próximos partidos (el fixture que ya cargó la UAR; proximos_partidos.py) ----------
  // Solo de hoy en adelante: si la actualización se atrasa, no quedan partidos viejos a la vista.
  const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const proxTodos = () => D.prox.filter((x) => x.fecha >= hoyISO());
  const proxDe = (cat) => proxTodos().filter((x) => x.cat === cat);
  const condTxt = (c) => (c === "L" ? "Local" : "Visitante");
  // siempre dice Los 50, con el local primero, así se ve que es un partido nuestro
  const vsHTML = (x) => (x.cond === "L" ? `<span class="nos">LOS 50</span> vs ${esc(x.rival)}` : `${esc(x.rival)} vs <span class="nos">LOS 50</span>`);
  /** abajo del partido: de local o de visitante y la instancia */
  const subProx = (x) => `De ${condTxt(x.cond).toLowerCase()}${x.inst ? ` · ${esc(x.inst)}` : ""}`;
  /** agrupados por día: la hora, la categoría, el rival y si es de local o de visitante */
  function proxHTML(lista) {
    const dias = [...new Set(lista.map((x) => x.fecha))];
    return dias.map((f) => `<h3 class="grupo">${esc(mayus(cuandoP({ fecha: f })))}</h3>
      <ol class="resultados">${lista.filter((x) => x.fecha === f).map((x) => `<li class="res">
        <span class="res__fecha num">${esc(x.hora || "–")}</span>
        <span class="res__cuerpo">${S.fcat ? "" : `<span class="chip chip--cat">${esc(x.cat)}</span>`}<span class="res__rival">${vsHTML(x)}</span><span class="res__sub">${subProx(x)}</span></span></li>`).join("")}</ol>`).join("");
  }

  // las categorías que tienen partidos por delante, en el orden de siempre (las que no están en la lista, al final)
  const proxCats = () => [...new Set(proxTodos().map((x) => x.cat))].sort((a, b) => ((D.cats.indexOf(a) + 1) || 99) - ((D.cats.indexOf(b) + 1) || 99));
  function vProximos() {
    const cats = proxCats();
    if (S.fcat && !cats.includes(S.fcat)) S.fcat = null;
    const lista = proxTodos().filter((x) => !S.fcat || x.cat === S.fcat);
    $("#vista").innerHTML = `
      <div class="cab">${volver()}${cabTit("Próximos partidos", "proximos")}</div>
      ${cats.length > 1 ? `<div class="chips-g" role="group" aria-label="Categoría">${[["", "Todas"], ...cats.map((c) => [c, c])].map(([v, l]) =>
        `<button type="button" data-fcat="${esc(v)}" aria-pressed="${(S.fcat || "") === v}">${esc(l)}</button>`).join("")}</div>` : ""}
      <section class="sec sec--pegada">
        ${lista.length ? proxHTML(lista) : `<p class="vacio-g">Todavía no hay partidos cargados en la UAR para las próximas fechas.</p>`}
      </section>`;
  }

  const partidoHTML = (p, conCat) => `<li class="res">
      <span class="res__fecha">${fecha(p.fecha)}<small>${p.cond === "L" ? "Local" : "Visitante"}</small></span>
      <span class="res__cuerpo">${conCat ? `<span class="chip chip--cat">${esc(p.cat)}</span>` : ""}<span class="res__rival">${esc(p.rival)}</span></span>
      <span class="res__marcador res--${p.res}"><b class="num">${p.pf}–${p.pc}</b><i>${({ G: "Ganó", E: "Empató", P: "Perdió" })[p.res]}</i></span></li>`;

  // todo el club: siguen jugando, camino a Primera, nacimiento y peso
  function vClub() {
    const ultimos = [...new Set(D.ret.map((r) => r["Año"]))].sort((a, b) => a - b).slice(-4);
    const celda = (v) => v == null ? "<td>–</td>" : `<td><span class="pct ${v >= 80 ? "pct--a" : v >= 65 ? "pct--b" : "pct--c"}">${Math.round(v)}%</span></td>`;
    const fisCats = [...new Set(D.fis.map((f) => f["Categoría"]))];
    const kg = (c, l) => fmt((D.fis.find((x) => x["Categoría"] === c && x["Línea"] === l) || {})["Peso promedio (kg)"], "d");
    // las respuestas en palabras, arriba de cada tabla
    const u = ultimos.at(-1), delAnio = D.ret.filter((x) => x["Año"] === u && x["% retención"] != null);
    const peor = delAnio.sort((x, y) => x["% retención"] - y["% retención"])[0];
    const titRet = peor ? `<p class="titular">En ${u}, la que más chicos perdió fue <b>${esc(peor["Categoría"])}</b>: volvió el <b>${fmt(peor["% retención"], "%")}</b></p>` : "";
    // "despareja" = muchos más nacidos a principio de año (ene-mar) que a fin de año (oct-dic)
    const desp = D.era.filter((x) => x["Nacidos ene-mar %"] - x["oct-dic %"] >= 15).map((x) => x["Categoría"]);
    const titEra = `<p class="titular">${desp.length ? `En <b>${esc(desp.join(", ").replace(/, ([^,]*)$/, " y $1"))}</b> hay muchos más nacidos a principio de año`
      : "En todas las categorías las 4 partes son parecidas: <b>está bien</b>"}</p>`;
    $("#vista").innerHTML = `
      <div class="cab">${volver()}<h2 class="cab__cat">Todo el club</h2></div>

      <section class="sec">
        ${tit("¿Los chicos siguen jugando?", "siguen")}
        ${titRet}
        <p class="ley"><span class="pct pct--a">80% o más</span><span class="pct pct--b">65 a 79%</span><span class="pct pct--c">menos de 65%</span></p>
        <div class="tabla-e-wrap"><table class="tabla-e"><thead><tr><th scope="col" class="izq">Categoría</th>${ultimos.map((a) => `<th scope="col">${a}</th>`).join("")}</tr></thead>
          <tbody>${D.cats.map((c) => `<tr><th scope="row" class="izq">${esc(c)}</th>${ultimos.map((a) => celda((D.ret.find((r) => r["Categoría"] === c && r["Año"] === a) || {})["% retención"])).join("")}</tr>`).join("")}</tbody></table></div>
      </section>

      <section class="sec">
        ${tit("Camino a Primera", "camino")}
        ${fraseCamino()}
        <div class="tabla-e-wrap"><table class="tabla-e"><thead><tr><th scope="col" class="izq">Año</th><th scope="col">Debutaron</th><th scope="col">Edad titulares</th><th scope="col">Partidos previos</th></tr></thead>
          <tbody>${D.camino.filter((r) => r["Año"] >= 2019).map((r) => `<tr><th scope="row" class="izq">${r["Año"]}</th><td>${r["Debutaron en Primera"] ?? "–"}</td><td>${fmt(r["Edad promedio del XV titular"], "d")}</td><td>${r["Partidos previos en plantel superior del XV (promedio)"] ?? "–"}</td></tr>`).join("")}</tbody></table></div>
      </section>

      <section class="sec">
        ${tit("¿En qué parte del año nacieron?", "nacieron")}
        ${titEra}
        <p class="ley"><i class="q1"></i>ene-mar <i class="q2"></i>abr-jun <i class="q3"></i>jul-sep <i class="q4"></i>oct-dic</p>
        <ul class="era">${D.era.map((r) => {
          const q = [r["Nacidos ene-mar %"], r["abr-jun %"], r["jul-sep %"], r["oct-dic %"]];
          return `<li><span class="era__cat">${esc(r["Categoría"] === "Pre-Intermedia" ? "Pre-Inter." : r["Categoría"])}</span><span class="era__bar" role="img" aria-label="${q.map((v) => Math.round(v) + "%").join(", ")}">${q.map((v, i) => `<i class="q${i + 1}" style="width:${v}%">${v >= 14 ? Math.round(v) + "%" : ""}</i>`).join("")}</span></li>`;
        }).join("")}</ul>
      </section>

      ${D.fis.length ? `<section class="sec">
        ${tit(`Peso promedio ${D.fis[0].Temporada}`, "peso")}
        <div class="tabla-e-wrap"><table class="tabla-e"><thead><tr><th scope="col" class="izq">Categoría</th><th scope="col">Forwards</th><th scope="col">Backs</th></tr></thead>
          <tbody>${fisCats.map((c) => `<tr><th scope="row" class="izq">${esc(c)}</th><td>${kg(c, "Forward")} kg</td><td>${kg(c, "Back")} kg</td></tr>`).join("")}</tbody></table></div>
      </section>` : ""}`;
  }

  /** el último año del camino a Primera dicho en palabras, comparado con 4 años antes */
  function fraseCamino() {
    const k = "Partidos previos en plantel superior del XV (promedio)";
    const filas = D.camino.filter((r) => r["Año"] >= 2019 && r[k] != null).sort((x, y) => x["Año"] - y["Año"]), u = filas.at(-1);
    if (!u) return "";
    const antes = filas.find((r) => r["Año"] === u["Año"] - 4);
    return `<p class="titular">En ${u["Año"]} debutaron <b>${u["Debutaron en Primera"] ?? 0}</b> en Primera, y los titulares ya tenían <b>${u[k]}</b> partidos cada uno${antes ? ` (en ${antes["Año"]}, ${antes[k]})` : ""}</p>`;
  }

  // consejos
  function vConsejos() {
    const grupo = (tipo, h) => { const it = D.diag.filter((d) => d[0] === tipo); return it.length ? `<h3 class="grupo">${h}</h3><ul class="diag">${it.map(diagItem).join("")}</ul>` : ""; };
    const pri = { Alta: "alta", Media: "media", Baja: "baja" };
    $("#vista").innerHTML = `
      <div class="cab">${volver()}${cabTit("Consejos", "consejos")}</div>
      <section class="sec">
        ${grupo("alerta", "Para trabajar")}${grupo("bien", "Está bien")}${grupo("medir", "Falta medir")}
      </section>
      <section class="sec">
        ${tit("Qué empezar a medir", "medir")}
        <div class="acordeon">${D.medir.map(([q, quien, cada, como, cats]) => `<details><summary><span>${esc(q.split(" (")[0].split(":")[0])}</span></summary>
          <dl class="mini-dl"><div><dt>Qué</dt><dd>${esc(q)}</dd></div><div><dt>Cada cuánto</dt><dd>${esc(cada)}</dd></div><div><dt>Quién</dt><dd>${esc(quien)}</dd></div><div><dt>Cómo</dt><dd>${esc(como)}</dd></div><div><dt>Categorías</dt><dd>${esc(cats)}</dd></div></dl></details>`).join("")}</div>
      </section>
      <section class="sec">
        <h2 class="h2">Para leer más</h2>
        <div class="acordeon">
          <details><summary><span>Qué recomiendan los expertos</span></summary><ul class="expertos">${D.expertos.map(([m, ev, , hacer, prio, fu]) => `<li><b>${esc(m)}</b> <span class="prio prio--${pri[prio] || "media"}">${esc(prio)}</span><p>${esc(ev)} <small>[${esc(fu)}]</small></p>${hacer && hacer !== "-" ? `<p class="expertos__hacer">${esc(hacer)}</p>` : ""}</li>`).join("")}</ul></details>
          <details><summary><span>Fuentes</span></summary><ol class="fuentes-e">${D.fuentes.map(([n, f, u]) => `<li value="${esc(n)}"><a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(f)}</a></li>`).join("")}</ol></details>
        </div>
      </section>`;
  }
  const diagItem = ([tipo, t, dato, hacer]) => `<li class="diag__it diag--${tipo}">
    <span class="diag__ic">${IC[tipo]}</span>
    <span class="diag__txt"><b>${esc(t)}</b><span>${esc(dato)}</span><strong>${esc(hacer)}</strong></span></li>`;

  // ---------- videos (Cloudflare R2, los entrega functions/videos solo con la ficha de la clave) ----------
  // Cada video muestra su tapa con un botón grande de play; el video recién se baja al tocarlo, así no gasta datos.
  // En el iPhone lo reproduce el propio teléfono; en el resto, hls.js (web/vendor), que se baja la primera vez que hace falta.
  const durTxt = (s) => s >= 3600 ? `${Math.floor(Math.round(s / 60) / 60)} h ${Math.round(s / 60) % 60} min` // un partido entero
    : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
  const videosDe = (campo, valor) => Object.entries((D.guia && D.guia.videos) || {}).filter(([, v]) => v[campo].includes(valor)).map(([id, v]) => ({ id, ...v }));
  const tarjetaVideo = (v) => `<figure class="video-ej" data-video="${esc(v.id)}">
      <button type="button" class="video-ej__tapa" data-play="${esc(v.id)}" aria-label="Ver el video: ${esc(v.titulo)} (${durTxt(v.duracion)})">
        <img src="${VACIA}" data-foto="video-${esc(v.id)}" alt="" width="560" height="315"><span class="video-ej__play">${IC.play}</span></button>
      <figcaption><b>${esc(v.titulo)}</b><span class="num">${durTxt(v.duracion)}</span></figcaption></figure>`;
  let hlsProm = null;
  const cargarHls = () => (hlsProm ??= new Promise((ok, mal) => {
    const s = document.createElement("script");
    s.src = "vendor/hls.light.min.js";
    s.onload = () => ok(window.Hls);
    s.onerror = () => { hlsProm = null; mal(new Error("sin hls.js")); };
    document.head.append(s);
  }));
  const REPRODUCTORES = new Map(); // se sueltan al cambiar de pantalla
  function soltarVideos() { REPRODUCTORES.forEach((h) => h.destroy()); REPRODUCTORES.clear(); }
  async function reproducir(id) {
    const fig = document.querySelector(`.video-ej[data-video="${CSS.escape(id)}"]`);
    const tapa = fig && fig.querySelector(".video-ej__tapa");
    if (!tapa) return;
    const url = `videos/${id}/master.m3u8`, img = tapa.querySelector("img");
    const video = document.createElement("video");
    video.controls = true; video.playsInline = true; video.setAttribute("playsinline", ""); video.preload = "auto";
    if (img && img.src.startsWith("data:image/webp")) video.poster = img.src;
    const aviso = (txt) => { fig.querySelector(".video-ej__error")?.remove(); fig.insertAdjacentHTML("beforeend", `<p class="video-ej__error" role="alert">${txt}</p>`); };
    // quien guardó la clave antes de que hubiera videos no tiene la ficha: con un toque la vuelve a poner
    const sinPermiso = () => aviso(`Para ver los videos hay que volver a poner la clave. <button type="button" class="link" data-reclave>Poner la clave</button>`);
    const NO_ABRE = "No se pudo abrir el video. Revisá la señal y probá de nuevo.";
    tapa.replaceWith(video);
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      // el reproductor del iPhone no dice por qué falló: se le pregunta a la web
      video.addEventListener("error", () => fetch(url, { cache: "no-store" }).then((r) => (r.status === 403 ? sinPermiso() : aviso(NO_ABRE)), () => aviso(NO_ABRE)), { once: true });
    } else {
      try {
        const Hls = await cargarHls();
        if (!Hls.isSupported()) return aviso("Este navegador no puede mostrar el video. Probá con Chrome o Safari.");
        const h = new Hls({ capLevelToPlayerSize: true });
        h.on(Hls.Events.ERROR, (_e, d) => {
          if (!d.fatal) return;
          if (d.response && d.response.code === 403) sinPermiso(); else aviso(NO_ABRE);
          h.destroy(); REPRODUCTORES.delete(id);
        });
        h.loadSource(url); h.attachMedia(video); REPRODUCTORES.set(id, h);
      } catch (e) { return aviso("No se pudo cargar el reproductor. Revisá la señal y probá de nuevo."); }
    }
    video.play().catch(() => { /* si el teléfono no deja arrancar solo, queda el botón de play del video */ });
  }

  // ---------- ejercicios: line, maul y los juegos de las planificaciones ----------
  // Pensado para usar en la cancha con el celular: filtros grandes arriba, una fila por ejercicio y, al tocarlo,
  // el ejercicio en pantalla completa con "Anterior / Siguiente" para recorrerlos con una mano.
  const TIPOS_EJ = [["todos", "Todos"], ["line", "Line"], ["maul", "Maul"], ["juegos", "Juegos"]];
  const ROLES_LINE = ["Lanzador", "Saltador", "Levantador", "Tríos"];
  const tabEj = () => (["line", "maul", "juegos"].includes(S.tab) ? S.tab : "todos");
  /** los ejercicios que se ven con los filtros de arriba (sin contar lo que se escribe en el buscador), en el orden de la lista */
  const ejLista = () => D.guia.ejercicios.filter((e) => {
    const tab = tabEj();
    if (tab !== "todos" && norm(e.tipo) !== tab) return false;
    if (tab === "line" && S.rol && e.grupo !== S.rol) return false;
    return !S.para || e.cats.includes(S.para);
  });

  function vEjercicios() {
    const tab = tabEj(), grupos = [];
    ejLista().forEach((e) => {
      const k = `${e.tipo} · ${e.grupo}`;
      let gr = grupos.find((x) => x.k === k);
      if (!gr) grupos.push((gr = { k, items: [] }));
      gr.items.push(e);
    });
    const fila = (e) => `<li data-q="${esc(norm([e.nombre, e.grupo, e.tipo, e.material, ...e.foco, ...e.como, videosDe("ejercicios", e.id).length ? "video" : ""].join(" ")))}">
      <button type="button" class="ej${e.paso ? "" : " ej--sin-paso"}" data-ir-ej="${esc(e.id)}">
        ${e.paso ? `<span class="ej__paso num">${e.paso}</span>` : ""}
        <span class="ej__txt"><b>${esc(e.nombre)}</b>${e.foco[0] ? `<small>${conCantos(e.foco[0])}</small>` : ""}${e.material ? `<span class="ej__mat">${IC.cono}${esc(e.material)}</span>` : ""}${videosDe("ejercicios", e.id).length ? `<span class="ej__video">${IC.play}Con video</span>` : ""}</span>
        ${IC.adelante}</button></li>`;
    $("#vista").innerHTML = `
      <div class="cab">${volver()}${cabTit("Ejercicios", "ejercicios")}</div>
      ${pestanas(TIPOS_EJ, tab)}
      ${tab === "line" ? `<div class="chips-g" role="group" aria-label="Rol en el line">${[["", "Todos"], ...ROLES_LINE.map((r) => [r, r])].map(([v, l]) =>
        `<button type="button" data-rol="${v}" aria-pressed="${(S.rol || "") === v}">${l}</button>`).join("")}</div>` : ""}
      ${S.para ? `<p class="filtro-g"><span>Solo los juegos que usan en <b>${esc(S.para)}</b></span><button type="button" class="link" data-quitar-para>Ver todos</button></p>` : ""}
      <section class="sec sec--pegada">
        <label class="buscar-g"><span class="sr">Buscar un ejercicio</span>${IC.buscar}<input type="search" id="buscar-ej" value="${esc(S.qe)}" placeholder="Buscar: salto, tackle, conos…" autocomplete="off" enterkeyhint="search"></label>
        ${grupos.map((gr) => `<div class="grupo-ej"><div class="grupo-ej__cab"><h3 class="grupo-cat__tit">${esc(gr.k)}</h3><span class="num">${gr.items[0].tipo === "Juegos" ? pl(gr.items.length, "juego", "juegos") : pl(gr.items.length, "ejercicio", "ejercicios")}</span></div>
          <ul class="filas-cat">${gr.items.map(fila).join("")}</ul></div>`).join("")}
        <p class="vacio-g" id="sin-ej" hidden>No hay ningún ejercicio con esa palabra.</p>
      </section>`;
    filtrarEj();
  }
  function filtrarEj() {
    const q = norm((S.qe || "").trim());
    let n = 0;
    document.querySelectorAll(".grupo-ej").forEach((gr) => {
      let vis = 0;
      gr.querySelectorAll("li[data-q]").forEach((li) => { const ok = !q || li.dataset.q.includes(q); li.hidden = !ok; vis += ok; });
      gr.hidden = !vis; n += vis;
    });
    const v = $("#sin-ej");
    if (v) v.hidden = n > 0;
  }

  // un ejercicio en pantalla completa
  function vEjercicio() {
    const todos = D.guia.ejercicios, e = todos.find((x) => x.id === S.ej);
    // se recorre la misma lista que se estaba mirando (si se entró con un link directo, todos)
    const vistos = ejLista(), orden = vistos.some((x) => x.id === e.id) ? vistos : todos, j = orden.findIndex((x) => x.id === e.id);
    const total = todos.filter((x) => x.tipo === e.tipo && x.grupo === e.grupo).length;
    const salto = (k, der) => {
      const ok = k >= 0 && k < orden.length;
      return `<button type="button"${ok ? ` data-ir-ej="${esc(orden[k].id)}" aria-label="${der ? "Siguiente" : "Anterior"}: ${esc(orden[k].nombre)}"` : " disabled"}>${der ? "" : IC.atras}<span>${der ? "Siguiente" : "Anterior"}</span>${der ? IC.adelante : ""}</button>`;
    };
    const bloque = (t, h) => `<h3 class="grupo">${t}</h3>${h}`, vids = videosDe("ejercicios", e.id);
    $("#vista").innerHTML = `
      <div class="cab">
        <div class="cab__fila"><button type="button" class="volver" data-volver-ej>${IC.atras}Ejercicios</button>
          <div class="saltos saltos--ej" role="group" aria-label="Otros ejercicios">${salto(j - 1)}${salto(j + 1, true)}</div></div>
        <p class="ej-tag">${esc(e.tipo)} · ${esc(e.grupo)}${e.paso ? ` · paso ${e.paso} de ${total}` : ""}</p>
        <h2 class="ej-tit">${esc(e.nombre)}</h2>
      </div>
      <section class="sec sec--pegada ej-det">
        ${vids.length ? bloque(vids.length === 1 ? "Video" : "Videos", `<div class="videos-ej">${vids.map(tarjetaVideo).join("")}</div>`) : ""}
        ${e.como.length ? bloque("Cómo se hace", `<div class="txt-g">${e.como.map((p) => `<p>${conCantos(p)}</p>`).join("")}</div>`) : ""}
        ${e.foco.length ? bloque(e.tipo === "Juegos" ? "Qué se trabaja" : "En qué fijarse", lista(e.foco, "check-g")) : ""}
        ${e.material ? bloque("Material", `<p class="ej-mat">${IC.cono}<span>${esc(e.material)}</span></p>`) : ""}
        ${e.cats.length ? bloque("Lo usan en", `<p class="claves-g">${e.cats.map((c) => `<span class="chip">${esc(c)}</span>`).join("")}</p>`) : ""}
        ${e.fotos.length ? bloque("Fotos", `<div class="fotos-ej">${e.fotos.map((f, n) =>
          `<figure><img src="${VACIA}" data-foto="${esc(f)}" alt="Foto ${n + 1} de la actividad «${esc(e.nombre)}»" width="560" height="340" decoding="async"></figure>`).join("")}</div>`) : ""}
      </section>`;
  }

  // mientras se abren las fotos, cada lugar muestra una imagen transparente sobre el fondo gris (nunca un cuadro roto)
  const VACIA = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  // las fotos van cifradas en un archivo aparte: se bajan y se abren (con la misma llave) la primera vez que hacen falta
  let fotosProm = null;
  const fotos = () => (fotosProm ??= fetch("entrenadores.fotos.json", { cache: "no-cache" })
    .then((r) => r.json())
    .then(async (f) => {
      const plano = await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64(f.iv) }, LLAVE_ACTUAL, deB64(f.datos));
      return JSON.parse(await new Response(new Blob([plano]).stream().pipeThrough(new DecompressionStream("gzip"))).text());
    })
    .catch(() => { fotosProm = null; return {}; }));
  function ponerFotos() {
    const imgs = document.querySelectorAll("img[data-foto]");
    if (!imgs.length) return;
    // una foto que falta se saca; un video sin tapa queda igual (fondo oscuro con el play)
    fotos().then((f) => imgs.forEach((img) => { if (f[img.dataset.foto]) img.src = f[img.dataset.foto]; else if (!img.closest(".video-ej")) img.closest("figure").remove(); }));
  }

  // ---------- guía del club (material de Coordinación de Rugby) ----------
  const gCats = () => [...D.guia.infantiles, ...D.guia.juveniles].map((c) => c.cat);
  const gDe = (cat) => D.guia.infantiles.find((c) => c.cat === cat) || D.guia.juveniles.find((c) => c.cat === cat);
  const esInf = (cat) => D.guia.infantiles.some((c) => c.cat === cat);
  const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  /** los cantos del club que aparecen en un texto se resaltan (MALÓN, CONTROL…) */
  let reCantos;
  const conCantos = (txt) => {
    reCantos ??= new RegExp(`(^|[^\\p{L}])(${D.guia.cantos.map((c) => c[2]).sort((a, b) => b.length - a.length).join("|")})(?![\\p{L}])`, "gu");
    return esc(txt).replace(reCantos, '$1<b class="canto-i">$2</b>');
  };
  /** texto de las planillas: viñetas, párrafos y subtítulos */
  function textoHTML(bl) {
    let h = "", ul = false;
    for (const [t, x] of bl) {
      if (t === "li") { h += `${ul ? "" : '<ul class="txt-g__ul">'}<li>${conCantos(x)}</li>`; ul = true; continue; }
      if (ul) { h += "</ul>"; ul = false; }
      h += t === "h" ? `<h4 class="txt-g__h">${esc(x)}</h4>` : `<p>${conCantos(x)}</p>`;
    }
    return `<div class="txt-g">${h}${ul ? "</ul>" : ""}</div>`;
  }
  const lista = (items, cls = "txt-g__ul") => `<ul class="${cls}">${items.map((x) => `<li>${conCantos(x)}</li>`).join("")}</ul>`;
  const scrumDe = (cat) => {
    const e = D.guia.scrum.edades;
    return e.find((x) => x[0] === cat) || (+cat.slice(1) >= 15 ? e.find((x) => x[0].startsWith("M15")) : null);
  };
  const pestanas = (tabs, sel) => `<div class="seg seg--g${tabs.length === 4 ? " seg--4" : ""}" role="group" aria-label="Qué ver">${tabs.map(([k, l]) =>
    `<button type="button" data-tab="${k}" aria-pressed="${k === sel}">${l}</button>`).join("")}</div>`;

  function vGuia() { return S.gcat ? vGuiaCat() : vGuiaLista(); }

  // la lista de categorías, con su frase guía
  function vGuiaLista() {
    const g = D.guia;
    // una fila por categoría, igual que en el inicio: el nombre y su frase guía
    const fila = (c, txt) => `<li><button type="button" class="fila-cat fila-cat--inf" data-ir-guia="${esc(c.cat)}">
        <span class="fila-cat__nom">${esc(c.cat)}${c.apodo ? `<small>${esc(c.apodo)}</small>` : ""}</span>
        <span class="fila-cat__etapa">${txt}</span>${IC.adelante}</button></li>`;
    const grupo = (titulo, filas) => `<div class="grupo-cat"><div class="grupo-cat__cab"><h3 class="grupo-cat__tit">${titulo}</h3></div><ul class="filas-cat">${filas}</ul></div>`;
    $("#vista").innerHTML = `
      <div class="cab">${volver()}${cabTit("Qué aprende cada categoría", "guiaCats")}</div>
      <section class="sec sec--pegada">
        ${grupo("Infantiles", g.infantiles.map((c) => fila(c, `“${esc(c.semillas.ataque[0] || "")}”`)).join(""))}
        ${grupo("Juveniles", g.juveniles.map((c) => fila(c, esc(g.lemas_juv[c.cat] || ""))).join(""))}
      </section>
      <section class="sec">
        <h2 class="h2">En infantiles, siempre</h2>
        ${lista(g.valores, "check-g")}
      </section>
      <section class="sec">
        <h2 class="h2">Lo que tiene que saber al llegar a M13</h2>
        ${lista(g.llegar_m13, "check-g")}
      </section>`;
  }

  // una categoría: frases guía, cómo son, ataque, defensa, qué cambia y qué evitar
  /** en la guía de una categoría: los juegos que usan en esa categoría, o (juveniles) los ejercicios de line y maul */
  function atajoEj(cat) {
    if (!D.guia.ejercicios) return "";
    const jg = D.guia.ejercicios.filter((e) => e.cats.includes(cat)).length;
    return jg ? `<button type="button" class="atajo" data-ir-ej-para="${esc(cat)}">${IC.cono}<span>Juegos que usan en ${esc(cat)} (${jg})</span>${IC.adelante}</button>`
      : esInf(cat) ? "" : `<button type="button" class="atajo" data-ir-ej-tab="line">${IC.cono}<span>Ejercicios de line y maul</span>${IC.adelante}</button>`;
  }
  function vGuiaCat() {
    const g = D.guia, cat = S.gcat, c = gDe(cat), cats = gCats(), i = cats.indexOf(cat), inf = esInf(cat), sc = scrumDe(cat);
    const salto = (j, lbl) => {
      const ok = j >= 0 && j < cats.length;
      return `<button type="button" data-ir-guia="${ok ? esc(cats[j]) : ""}"${ok ? ` aria-label="${lbl}: ${esc(cats[j])}"` : " disabled"}>${j < i ? IC.atras : ""}<span>${ok ? esc(cats[j]) : ""}</span>${j > i ? IC.adelante : ""}</button>`;
    };
    // las frases guía de infantiles van entre comillas (son textuales); el resumen de juveniles no
    const semilla = (lbl, frases, comillas = true) => frases.length ? `<div class="semilla"><span class="semilla__lbl">${lbl}</span>${frases.map((f) =>
      `<b class="semilla__txt">${comillas ? `“${esc(f)}”` : esc(f)}</b>`).join("")}</div>` : "";
    const secciones = inf
      ? [["como", "Cómo son a esta edad", c.como_son], ["objetivo", "Qué buscamos", c.objetivo], ["ataque", "En ataque", c.ataque],
        ["defensa", "En defensa", c.defensa], ["progresion", `Qué cambia desde ${i > 0 ? cats[i - 1] : ""}`, c.progresion]]
      : [["ataque", "En ataque", c.ataque.concat(c.ataque_ojo.length ? [["h", "Atención"], ...c.ataque_ojo] : [])],
        ["defensa", "En defensa", c.defensa.concat(c.defensa_ojo.length ? [["h", "Atención"], ...c.defensa_ojo] : [])]];
    $("#vista").innerHTML = `
      <div class="cab">
        ${volver("Todas las categorías", "guia")}
        <div class="cab__fila">
          <h2 class="cab__cat">${esc(cat)}${c.apodo ? `<small>${esc(c.apodo)}</small>` : ""}${ayudaBtn("guiaCat")}</h2>
          <div class="saltos" role="group" aria-label="Otras categorías">${salto(i - 1, "Categoría anterior")}${salto(i + 1, "Categoría siguiente")}</div>
        </div>
        ${c.etapa ? `<p class="etapa">${esc(c.etapa)}</p>` : ""}
      </div>

      <section class="sec sec--pegada">
        ${inf
          ? `<div class="semillas">${semilla("En ataque", c.semillas.ataque)}${semilla("En defensa", c.semillas.defensa)}</div>`
          : `<div class="semillas semillas--una">${semilla("En pocas palabras", [g.lemas_juv[cat]].filter(Boolean), false)}</div>
             <h3 class="grupo">Palabras clave de juveniles</h3>
             <p class="claves-g"><span class="claves-g__lbl">Ataque</span>${g.claves.ataque.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</p>
             <p class="claves-g"><span class="claves-g__lbl">Defensa</span>${g.claves.defensa.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</p>`}
        ${sc ? `<button type="button" class="atajo" data-ir="scrum">${IC.escudo}<span><b>Scrum en ${esc(cat)}:</b> ${esc(sc[1])}${sc[2] ? ` ${esc(sc[2])}` : ""}</span>${IC.adelante}</button>` : ""}
        ${atajoEj(cat)}
        ${atajoPr(cat)}
        ${atajoAsis(cat)}
        ${D.cats.includes(cat) ? `<button type="button" class="atajo" data-ir-cat="${esc(cat)}">${IC.barras}<span>Cómo le fue a ${esc(cat)} en los partidos</span>${IC.adelante}</button>` : ""}
      </section>

      <section class="sec desplegables">
        ${secciones.filter(([, , bl]) => bl.length).map(([id, t, bl]) => desple(`g-${id}`, t, textoHTML(bl))).join("")}
      </section>

      ${inf && c.evitar.length ? `<section class="sec">
        <h2 class="h2">Lo que hay que evitar</h2>
        <ul class="evitar-g">${c.evitar.map(([, x]) => `<li>${IC.alerta}<span>${conCantos(x)}</span></li>`).join("")}</ul>
      </section>` : ""}`;
  }

  /** la cancha vista desde arriba, atacando hacia arriba: las 4 zonas (a lo largo) o los 4 canales (a lo ancho) */
  function cancha(modo) {
    const W = 240, H = 400, x0 = 12, x1 = W - 12, u = (H - 8) / 120, y = (m) => 4 + m * u, cx = W / 2;
    // metros desde la línea de pelota muerta rival: ingoal rival 0-10, 22 rival 32, 10 rival 50, mitad 60, nuestros 10 70, nuestras 22 88, ingoal 110-120
    // zona: [desde, hasta, dónde va el nombre] (el de la amarilla va arriba de los 10 rivales para no quedar sobre la línea)
    const zonas = { verde: [10, 32, 21], amarilla: [32, 70, 41], azul: [70, 88, 79], roja: [88, 110, 99] };
    let h = `<svg class="cancha" viewBox="0 0 ${W} ${H}" role="img" aria-label="${modo === "zonas"
      ? "Cancha atacando hacia arriba. Desde nuestro ingoal: zona roja hasta nuestras 22, zona azul hasta nuestros 10, zona amarilla hasta las 22 rivales y zona verde hasta el ingoal rival."
      : "Cancha vista desde arriba con los 4 canales a lo ancho, numerados del 1 al 4."}">`;
    h += `<rect class="cancha__piso" x="${x0}" y="${y(0)}" width="${x1 - x0}" height="${y(120) - y(0)}" rx="6"/>`;
    if (modo === "zonas") {
      for (const [k, [a, b, t]] of Object.entries(zonas)) {
        h += `<rect class="cancha__z cancha__z--${k}" x="${x0}" y="${y(a)}" width="${x1 - x0}" height="${y(b) - y(a)}"/>`;
        h += `<text class="cancha__t${k === "amarilla" ? " cancha__t--osc" : ""}" x="${cx}" y="${y(t) + 6}">${k.toUpperCase()}</text>`;
      }
    } else {
      const an = (x1 - x0) / 4;
      for (let k = 0; k < 4; k++) {
        h += `<rect class="cancha__c cancha__c--${k + 1}" x="${x0 + an * k}" y="${y(10)}" width="${an}" height="${y(110) - y(10)}"/>`;
        h += `<circle class="cancha__nc" cx="${x0 + an * (k + 0.5)}" cy="${y(41)}" r="15"/><text class="cancha__n" x="${x0 + an * (k + 0.5)}" y="${y(41) + 6}">${k + 1}</text>`;
      }
    }
    [[10, ""], [32, "22"], [50, "10"], [60, "50"], [70, "10"], [88, "22"], [110, ""]].forEach(([m, n]) => {
      h += `<line class="cancha__l${n === "10" ? " cancha__l--p" : ""}" x1="${x0}" x2="${x1}" y1="${y(m)}" y2="${y(m)}"/>`;
      // el número va arriba de la línea: de los 10 rivales a nuestros 10 cae sobre la zona amarilla, donde el blanco no se lee
      if (n) h += `<text class="cancha__m${modo === "zonas" && m >= 50 && m <= 70 ? " cancha__m--osc" : ""}" x="${x0 + 5}" y="${y(m) - 4}">${n}</text>`;
    });
    [10, 110].forEach((m) => { h += `<path class="cancha__palos" d="M${cx - 8} ${y(m) - 7}V${y(m) + 7}M${cx + 8} ${y(m) - 7}V${y(m) + 7}M${cx - 8} ${y(m)}H${cx + 8}"/>`; });
    h += `<text class="cancha__ig" x="${cx}" y="${y(5) + 4}">Ingoal rival</text><text class="cancha__ig" x="${cx}" y="${y(115) + 4}">Nuestro ingoal</text>`;
    return h + "</svg>";
  }

  // cantos, zonas de la cancha y cómo decidimos
  function vCantos() {
    const g = D.guia, tab = ["cantos", "zonas", "decisiones"].includes(S.tab) ? S.tab : "cantos";
    let cuerpo;
    if (tab === "cantos") {
      cuerpo = `<section class="sec sec--pegada">
        <label class="buscar-g"><span class="sr">Buscar un canto</span>${IC.buscar}<input type="search" id="buscar-canto" value="${esc(S.q)}" placeholder="Buscar: tren, pick and go, lado…" autocomplete="off" enterkeyhint="search"></label>
        ${["Ataque", "Lados", "Defensa"].map((gr) => `<div class="cantos-g"><h3 class="grupo">${gr}</h3><ul class="cantos">${g.cantos.filter((x) => x[0] === gr).map(([, sit, cod, sig]) =>
          `<li data-q="${esc(norm(`${cod} ${sit} ${sig} ${gr}`))}"><span class="canto__cod">${esc(cod)}</span>${sit !== gr ? `<span class="chip chip--gris">${esc(sit)}</span>` : ""}<p>${esc(sig)}</p></li>`).join("")}</ul></div>`).join("")}
        <p class="vacio-g" id="sin-cantos" hidden>No hay ningún canto con esa palabra.</p>
      </section>`;
    } else if (tab === "zonas") {
      const items = (t, l) => l.length ? `<h4 class="txt-g__h">${t}</h4>${lista(l)}` : "";
      cuerpo = `<section class="sec sec--pegada">
        <h2 class="h2">Las 4 zonas</h2>
        <div class="cancha-g">${cancha("zonas")}
          <ul class="zonas-g">${g.zonas.slice().reverse().map(([k, rango, nombre, con, sin]) => `<li class="zona-g zona-g--${k}">
            <b class="zona-g__nom">Zona ${k}</b><span class="zona-g__sub">${esc(nombre)} · ${esc(rango)}</span>
            ${items("Con pelota", con)}${items("Sin pelota", sin)}</li>`).join("")}</ul>
        </div>
      </section>
      <section class="sec">
        <h2 class="h2">Los 4 canales</h2>
        <div class="cancha-g">${cancha("canales")}
          <ol class="canales-g">${g.canales.map((x, i) => `<li><span class="canales-g__n">${i + 1}</span>${esc(x)}</li>`).join("")}</ol>
        </div>
      </section>`;
    } else {
      cuerpo = `<section class="sec sec--pegada">
        <div class="semillas">${[["ataque", "Con pelota"], ["defensa", "Sin pelota"]].map(([k, lbl]) => `<div class="semilla"><span class="semilla__lbl">${lbl}</span>
          <b class="semilla__txt">${esc(g.filosofia[k][0])}</b><p>${esc(g.filosofia[k][1])}</p></div>`).join("")}</div>
      </section>
      <section class="sec">
        <h2 class="h2">¿Cuándo hay oportunidad?</h2>
        ${lista(g.oportunidad, "check-g")}
      </section>
      <section class="sec">
        <h2 class="h2">Qué decidimos</h2>
        <h3 class="grupo">En ataque</h3><div class="txt-g">${lista(g.decisiones.ataque)}</div>
        <h3 class="grupo">En defensa</h3><div class="txt-g">${lista(g.decisiones.defensa)}</div>
      </section>
      <section class="sec">
        <h2 class="h2">Los 5 pilares del club</h2>
        <ul class="pilares-g">${g.pilares.map(([p, t]) => `<li><b>${esc(p)}</b><span>${esc(t)}</span></li>`).join("")}</ul>
      </section>`;
    }
    $("#vista").innerHTML = `
      <div class="cab">${volver()}${cabTit("Cantos y zonas", "cantos")}</div>
      ${pestanas([["cantos", "Cantos"], ["zonas", "Zonas"], ["decisiones", "Modelo"]], tab)}
      ${cuerpo}`;
    if (tab === "cantos") filtrarCantos();
  }
  function filtrarCantos() {
    const q = norm(S.q.trim());
    let n = 0;
    document.querySelectorAll(".cantos-g").forEach((gr) => {
      let vis = 0;
      gr.querySelectorAll("li[data-q]").forEach((li) => { const ok = !q || li.dataset.q.includes(q); li.hidden = !ok; vis += ok; });
      gr.hidden = !vis; n += vis;
    });
    const v = $("#sin-cantos");
    if (v) v.hidden = n > 0;
  }

  // scrum: regla de oro, qué se hace en cada edad, el set up y la entrada
  function vScrum() {
    const s = D.guia.scrum, haySes = !!(s.sesiones && s.sesiones.length);
    const tab = ["edad", "setup", "entrada"].concat(haySes ? ["sesiones"] : []).includes(S.tab) ? S.tab : "edad";
    const pasos = (items) => `<ol class="pasos">${items.map(([t, d], i) => `<li><span class="pasos__n">${i + 1}</span><span class="pasos__t">${esc(t)}</span>${d ? `<div class="pasos__d">${d}</div>` : ""}</li>`).join("")}</ol>`;
    let cuerpo;
    if (tab === "edad") {
      cuerpo = `<section class="sec sec--pegada">
        <h2 class="h2">Qué se hace en cada edad</h2>
        <ul class="edades-g">${s.edades.map(([c, q, nota]) => `<li><b class="edades-g__cat">${esc(c)}</b><span>${esc(q)}${nota ? `<small>${esc(nota)}</small>` : ""}</span></li>`).join("")}</ul>
      </section>
      <section class="sec">
        <h2 class="h2">Cómo se enseña</h2>
        ${pasos(s.metodo.map(([t, d]) => [t, esc(d)]))}
      </section>`;
    } else if (tab === "setup") {
      cuerpo = `<section class="sec sec--pegada">
        <h2 class="h2">Antes de empezar</h2>
        ${lista(s.principios, "check-g")}
      </section>
      <section class="sec">
        <h2 class="h2">El set up, paso a paso</h2>
        <ol class="setup-g">${s.setup.map(([p, canto, items], i) => `<li><details data-sec="su${i}"${S.abiertos.has(`su${i}`) ? " open" : ""}><summary>
          <span class="pasos__n">${i + 1}</span><span class="setup-g__p">${esc(p)}</span>${canto ? `<span class="chip">Canto: ${esc(canto)}</span>` : ""}</summary>
          <div class="setup-g__in">${lista(items)}</div></details></li>`).join("")}</ol>
      </section>`;
    } else if (tab === "sesiones") {
      // las sesiones de scrum que planificó Coordinación, por grupo y en el orden en que se hicieron: cada una se abre y se ve entera
      const grupos = [...new Set(s.sesiones.map((x) => x.grupo))];
      cuerpo = `<section class="sec sec--pegada desplegables">
        ${grupos.map((g) => `<h3 class="grupo">${esc(g)}</h3>
          ${s.sesiones.filter((x) => x.grupo === g).map((x, n) => desple(`ss-${slug(g)}-${n}`, `Sesión ${n + 1}<small>${esc(mayus(cuandoP(x)))}</small>`,
            `<ul class="prac-g">${x.bloques.filter((b) => !b.agua).flatMap((b) => b.items).map(itemPr).join("")}</ul>`, x.min ? `${x.min} min` : "")).join("")}`).join("")}
      </section>`;
    } else {
      cuerpo = `<section class="sec sec--pegada">
        <h2 class="h2">La entrada</h2>
        <p class="titular titular--abre">El impacto es una acción coordinada de todo el pack</p>
        ${pasos(s.entrada.map(([c, items]) => [c, lista(items)]))}
      </section>
      <section class="sec">
        <h2 class="h2">El empuje</h2>
        <div class="empuje-g">${s.empuje.map(([c, t]) => `<div><b>${esc(c)}</b><span>${esc(t)}</span></div>`).join("")}</div>
        <div class="txt-g">${lista(s.empuje_notas)}</div>
      </section>`;
    }
    $("#vista").innerHTML = `
      <div class="cab">${volver()}${cabTit("Scrum seguro", "scrum")}</div>
      <section class="sec sec--pegada">
        <h2 class="h2">Regla de oro</h2>
        ${pasos(s.regla.map((x, i) => [x, s.regla_txt[i] ? esc(s.regla_txt[i]) : ""]))}
      </section>
      ${pestanas([["edad", "Por edad"], ["setup", "Set up"], ["entrada", "Entrada"]].concat(haySes ? [["sesiones", "Sesiones"]] : []), tab)}
      ${cuerpo}`;
  }

  // ---------- los puestos (perfil del jugador de Coordinación) ----------
  // El equipo dibujado como se para en la cancha: cada número se toca y lleva a lo que se espera de ese puesto.
  const puestoDe = (n) => D.guia.puestos.find((p) => p.n.includes(n));
  const FORMACION = [[1, 2, 3], [4, 5], [6, 8, 7], [9], [10], [11, 12, 13, 14], [15]];
  // lo ideal en un partido, en este orden (NORTE VERDE no se muestra hasta saber qué es)
  const PARTIDO = [["tackles", "Tackles"], ["rucks", "Rucks en ataque"], ["contactos", "Contactos"], ["pases", "Pases"], ["quiebres", "Quiebres"], ["recuperadas", "Recuperadas"]];
  // a qué ejercicios de line lleva cada puesto (el rol que cumple en el line)
  const LINE_DE = { 2: "Lanzador", 4: "Saltador", 5: "Saltador", 7: "Saltador", 8: "Levantador" };

  function vPuestos() {
    const boton = (n) => {
      const p = puestoDe(n);
      return `<button type="button" class="puesto" data-ir-puesto="${n}" aria-label="${n}, ${esc(p.nombre)}"><b class="num">${n}</b><small>${esc(p.corto)}</small></button>`;
    };
    const fila = (ns) => `<div class="formacion__fila${ns.length === 4 ? " formacion__fila--linea" : ""}">${ns.map(boton).join("")}</div>`;
    $("#vista").innerHTML = `
      <div class="cab">${volver()}${cabTit("Los puestos", "puestos")}</div>
      <section class="sec sec--pegada">
        <div class="formacion">
          <h3 class="formacion__tit">Forwards</h3>${FORMACION.slice(0, 3).map(fila).join("")}
          <h3 class="formacion__tit">Backs</h3>${FORMACION.slice(3).map(fila).join("")}
        </div>
      </section>`;
  }

  // un puesto: qué tiene que saber hacer, lo ideal en un partido, lo mental y con qué entrenarlo
  function vPuesto() {
    const todos = D.guia.puestos, p = puestoDe(S.puesto), j = todos.indexOf(p), n = p.n[0];
    const salto = (k, der) => {
      const q = todos[k];
      return `<button type="button"${q ? ` data-ir-puesto="${q.n[0]}" aria-label="${der ? "Siguiente" : "Anterior"}: ${esc(q.nombre)}"` : " disabled"}>${der ? "" : IC.atras}<span>${der ? "Siguiente" : "Anterior"}</span>${der ? IC.adelante : ""}</button>`;
    };
    const atajos = (n <= 8 ? `<button type="button" class="atajo" data-ir="scrum">${IC.escudo}<span><b>Scrum seguro:</b> qué se hace en cada edad y el set up</span>${IC.adelante}</button>` : "")
      + (LINE_DE[n] ? `<button type="button" class="atajo" data-ir-line="${LINE_DE[n]}">${IC.cono}<span><b>Ejercicios de line</b> del ${LINE_DE[n].toLowerCase()}</span>${IC.adelante}</button>` : "");
    $("#vista").innerHTML = `
      <div class="cab">
        <div class="cab__fila">${volver("Puestos", "puestos")}
          <div class="saltos saltos--ej" role="group" aria-label="Otros puestos">${salto(j - 1)}${salto(j + 1, true)}</div></div>
        <p class="ej-tag">${n <= 8 ? "Forward" : "Back"}</p>
        <h2 class="ej-tit puesto-tit"><span class="puesto-tit__n num">${p.n.join(" y ")}</span>${esc(p.nombre)}</h2>
      </div>
      <section class="sec sec--pegada">
        <h3 class="grupo">Qué tiene que saber hacer</h3>
        <ul class="pilares-g">${p.destrezas.map(([d, t]) => `<li><b>${esc(d)}</b><span>${esc(t)}</span></li>`).join("")}</ul>
        <h3 class="grupo grupo--ayuda">En un partido${ayudaBtn("partidoPuesto")}</h3>
        <ul class="partido-g">${PARTIDO.map(([k, l]) => `<li><b class="num">${p.partido[k]}</b><span>${l}</span></li>`).join("")}</ul>
        <h3 class="grupo">Lo mental</h3>
        <p class="claves-g">${p.mental.map((m) => `<span class="chip">${esc(m)}</span>`).join("")}</p>
        ${atajos ? `<h3 class="grupo">Para entrenarlo</h3>${atajos}` : ""}
      </section>`;
  }

  // ---------- prácticas de los entrenadores (planillas de PLANIFICACIONES, practicas_entrenadores.py) ----------
  // Una lista por mes, de la más nueva a la más vieja, con filtro por categoría y buscador; al tocar una se ve entera,
  // con "Anterior / Siguiente" por fecha y el botón para mandarla por WhatsApp.
  const P_GRUPOS = ["Plantel superior", "M17 a M19", "M15 y M16", "M13 y M14", "M11 y M12", "M9 y M10", "M8", "M7", "M6"];
  const DIA_S = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const MES_S = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const dia = (iso) => new Date(`${iso}T12:00:00`);
  const cuandoP = (p) => p.fecha ? `${DIA_S[dia(p.fecha).getDay()]} ${dia(p.fecha).getDate()} de ${MES_S[dia(p.fecha).getMonth()]}`
    : p.semana ? `semana ${p.semana} de la temporada` : "sin fecha";
  const mayus = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const grupoDeCat = (cat) => { const p = (D.guia && D.guia.practicas || []).find((x) => x.cats.includes(cat)); return p ? p.grupo : null; };
  const nPr = (g) => D.guia.practicas.filter((p) => p.grupo === g).length;
  const atajoPr = (cat) => { const g = grupoDeCat(cat); return g ? `<button type="button" class="atajo" data-ir-practicas="${esc(g)}">${IC.calendario}<span>Prácticas de ${esc(g)} (${nPr(g)})</span>${IC.adelante}</button>` : ""; };
  // las sin fecha van al final
  const prLista = () => D.guia.practicas.filter((p) => !S.pgrupo || p.grupo === S.pgrupo)
    .sort((a, b) => (b.orden === "9" ? "0" : b.orden).localeCompare(a.orden === "9" ? "0" : a.orden));
  /** una actividad de una práctica (o de una sesión de scrum): los minutos a la izquierda; el objetivo, qué se hace y cómo */
  const itemPr = (it) => `<li class="prac-it"><span class="prac-it__min num">${it.min ? `${it.min}'` : ""}</span><div class="prac-it__txt">
      ${it.obj ? `<span class="prac-it__obj">${conCantos(it.obj)}</span>` : ""}
      ${it.act ? `<p class="prac-it__act">${conCantos(it.act)}</p>` : ""}
      ${it.det ? `<p class="prac-it__det">${conCantos(it.det)}</p>` : ""}
      ${it.grupo ? `<span class="chip chip--gris">${esc(it.grupo)}</span>` : ""}</div></li>`;
  let Q_PR = null; // lo que se busca de cada práctica (se arma la primera vez que se usa el buscador)
  const textoBusca = (p) => norm([p.foco, p.grupo, p.quien, ...p.objetivos, ...p.bloques.flatMap((b) => (b.items || []).map((it) => `${it.obj || ""} ${it.act || ""} ${it.det || ""}`))].join(" "));

  function vPracticas() {
    const meses = [];
    prLista().forEach((p) => {
      const k = p.orden === "9" ? "sin" : p.orden.slice(0, 7);
      let m = meses.find((x) => x.k === k);
      if (!m) meses.push((m = { k, items: [] }));
      m.items.push(p);
    });
    const fila = (p) => {
      const d = p.fecha ? dia(p.fecha) : null;
      return `<li data-pr="${esc(p.id)}"><button type="button" class="ej prac" data-ir-practica="${esc(p.id)}">
        <span class="prac__dia">${d ? `<b class="num">${d.getDate()}</b><small>${DIA_S[d.getDay()].slice(0, 3)}</small>` : `<small>${p.semana ? `Sem. ${p.semana}` : "Sin fecha"}</small>`}</span>
        <span class="ej__txt"><b>${esc(p.foco || "Práctica")}</b><small>${S.pgrupo ? "" : `${esc(p.grupo)} · `}${esc(p.quien)}${p.min ? ` · ${p.min} min` : ""}</small></span>
        ${IC.adelante}</button></li>`;
    };
    const grupos = P_GRUPOS.filter((g) => nPr(g));
    $("#vista").innerHTML = `
      <div class="cab">${volver()}${cabTit("Prácticas", "practicas")}</div>
      <div class="chips-g" role="group" aria-label="Categoría">${[["", "Todas"], ...grupos.map((g) => [g, g])].map(([v, l]) =>
        `<button type="button" data-pgrupo="${esc(v)}" aria-pressed="${(S.pgrupo || "") === v}">${esc(l)}</button>`).join("")}</div>
      <section class="sec sec--pegada">
        <label class="buscar-g"><span class="sr">Buscar una práctica</span>${IC.buscar}<input type="search" id="buscar-pr" value="${esc(S.qp)}" placeholder="Buscar: tackle, ruck, pase…" autocomplete="off" enterkeyhint="search"></label>
        ${meses.map((m) => `<div class="grupo-ej"><div class="grupo-ej__cab"><h3 class="grupo-cat__tit">${m.k === "sin" ? "Sin fecha" : mayus(MES_S[+m.k.slice(5, 7) - 1])}</h3><span class="num">${pl(m.items.length, "práctica", "prácticas")}</span></div>
          <ul class="filas-cat">${m.items.map(fila).join("")}</ul></div>`).join("")}
        <p class="vacio-g" id="sin-pr" hidden>No hay ninguna práctica con esa palabra.</p>
      </section>`;
    filtrarPr();
  }
  function filtrarPr() {
    const q = norm((S.qp || "").trim());
    if (q && !Q_PR) Q_PR = new Map(D.guia.practicas.map((p) => [p.id, textoBusca(p)]));
    let n = 0;
    document.querySelectorAll(".grupo-ej").forEach((gr) => {
      let vis = 0;
      gr.querySelectorAll("li[data-pr]").forEach((li) => { const ok = !q || Q_PR.get(li.dataset.pr).includes(q); li.hidden = !ok; vis += ok; });
      gr.hidden = !vis; n += vis;
    });
    const v = $("#sin-pr");
    if (v) v.hidden = n > 0;
  }

  // una práctica entera, como la escribió el entrenador
  function vPractica() {
    const todos = D.guia.practicas, p = todos.find((x) => x.id === S.practica);
    // "Anterior / Siguiente" por fecha, dentro de la misma lista que se estaba mirando
    const vistos = prLista(), base = vistos.some((x) => x.id === p.id) ? vistos : todos;
    const cron = base.filter((x) => x.orden !== "9" || x.id === p.id).sort((a, b) => a.orden.localeCompare(b.orden)), j = cron.indexOf(p);
    const salto = (k, der) => {
      const q = cron[k];
      return `<button type="button"${q ? ` data-ir-practica="${esc(q.id)}" aria-label="${der ? "Siguiente" : "Anterior"}: ${esc(q.foco)}"` : " disabled"}>${der ? "" : IC.atras}<span>${der ? "Siguiente" : "Anterior"}</span>${der ? IC.adelante : ""}</button>`;
    };
    const minB = (b) => b.items.reduce((s, it) => s + (it.min || 0), 0);
    const cuerpo = p.bloques.map((b) => b.agua ? `<p class="prac-agua">${IC.gota}<span>Agua${b.min ? ` · ${b.min} min` : ""}</span></p>`
      : `${b.b ? `<h3 class="grupo grupo--fila"><span>${esc(b.b)}</span>${minB(b) ? `<span class="num">${minB(b)} min</span>` : ""}</h3>` : ""}
        <ul class="prac-g">${b.items.map(itemPr).join("")}</ul>`).join("");
    $("#vista").innerHTML = `
      <div class="cab">
        <div class="cab__fila"><button type="button" class="volver" data-volver-pr>${IC.atras}Prácticas</button>
          <div class="saltos saltos--ej" role="group" aria-label="Otras prácticas">${salto(j - 1)}${salto(j + 1, true)}</div></div>
        <p class="ej-tag">${esc(p.grupo)} · ${esc(p.quien)}</p>
        <h2 class="ej-tit">${esc(p.foco || "Práctica")}</h2>
        <p class="prac-cuando">${IC.calendario}<span>${mayus(cuandoP(p))}${p.min ? ` · ${p.min} minutos` : ""}</span></p>
      </div>
      <section class="sec sec--pegada ej-det">
        ${p.objetivos.length ? `<h3 class="grupo">Objetivos</h3>${lista(p.objetivos, "check-g")}` : ""}
        ${cuerpo}
        ${p.cierre ? `<p class="prac-agua prac-agua--fin">${IC.bien}<span>Charla final y elongación</span></p>` : ""}
        <button type="button" class="btn btn--ancho btn--wa" data-compartir-pr>${IC.compartir}Mandar por WhatsApp</button>
      </section>`;
  }
  // ---------- asistencia a los entrenamientos (functions/api/asistencia.js, guarda en Cloudflare D1) ----------
  // Pensada para la cancha: con una mano, al sol y con poca señal. Lo marcado queda guardado en el celular hasta que se envía,
  // cómo va el guardado se ve en la barra de abajo y, si dos entrenadores toman la lista del mismo día, se juntan.
  // La lista arranca con los fichados en la UAR (vienen cifrados con los datos). Los días, los suspendidos, las listas y los chicos
  // que se suman o ya no vienen se guardan en Cloudflare, así los ven todos los entrenadores.
  // El porcentaje es sobre los entrenamientos con lista (los suspendidos y los días sin lista no cuentan), y los colores y el orden
  // por porcentaje aparecen desde la tercera lista: antes, cualquier número asusta.
  const ASIS_CATS = ["Plantel superior", "M19", "M17", "M16", "M15", "M14", "M13", "M12", "M11", "M10", "M9", "M8", "M7", "M6"];
  const NOMBRE = "los50-ent-nombre", ULTIMA = "los50-ent-asis"; // quién toma lista y la última categoría (quedan en el celular)
  const LISTAS_MIN = 3;
  const asisDe = (cat) => (PS.includes(cat) ? "Plantel superior" : ASIS_CATS.includes(cat) ? cat : null);
  const asisTxt = (a) => (a === "Plantel superior" ? "del plantel superior" : `de ${a}`);
  const atajoAsis = (cat) => { const a = D.fichados && asisDe(cat); return a ? `<button type="button" class="atajo" data-ir-asis="${esc(a)}">${IC.lista}<span>Asistencia ${esc(asisTxt(a))}</span>${IC.adelante}</button>` : ""; };
  const ASIS = { resumen: null, cats: {}, error: {}, cargando: new Set() };
  const isoDe = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const masDias = (iso, n) => { const d = dia(iso); d.setDate(d.getDate() + n); return isoDe(d); };
  const corta = (iso) => `${DIA_S[dia(iso).getDay()].slice(0, 3)} ${dia(iso).getDate()}/${dia(iso).getMonth() + 1}`;
  const diaMes = (iso) => cuandoP({ fecha: iso }).replace(/ de \S+$/, ""); // "jueves 22"
  const horaDe = (ts) => { const d = new Date(ts); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
  const enCel = {
    get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } },
  };
  const fichaGuardada = () => { try { return localStorage.getItem(FICHA) || sessionStorage.getItem(FICHA) || ""; } catch (e) { return ""; } };
  const nombreGuardado = () => enCel.get(NOMBRE) || "";
  const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, "es");
  const colorPct = (p) => (p == null ? "gris" : p >= 80 ? "verde" : p >= 60 ? "ambar" : "rojo");
  /** el porcentaje en un recuadro: con color desde la tercera lista; antes, gris */
  const porcHTML = (p, conColor) => `<span class="porc porc--${conColor ? colorPct(p) : "gris"} num">${p == null ? "–" : `${p}%`}</span>`;
  // lo marcado y todavía no guardado: queda en el celular aunque se cierre la página, se bloquee el teléfono o no haya señal
  const claveBorrador = (cat, f) => `los50-lista:${cat}:${f}`;
  const borrador = (cat, f) => { try { return JSON.parse(enCel.get(claveBorrador(cat, f)) || "null"); } catch (e) { return null; } };
  const guardarBorrador = (cat, f, b) => enCel.set(claveBorrador(cat, f), b ? JSON.stringify(b) : null);

  async function api(cuerpo, cat) {
    const r = await fetch(`api/asistencia${cat ? `?cat=${encodeURIComponent(cat)}` : ""}`, {
      method: cuerpo ? "POST" : "GET", cache: "no-store",
      headers: { "x-ficha": fichaGuardada(), ...(cuerpo ? { "content-type": "application/json" } : {}) },
      body: cuerpo ? JSON.stringify({ por: nombreGuardado(), ...cuerpo }) : undefined,
    });
    if (r.status === 401) throw new Error("clave");
    if (!r.ok) throw new Error("red");
    return r.json();
  }
  const avisoError = (e) => (e.message === "clave"
    ? `Para usar la asistencia hay que volver a poner la clave. <button type="button" class="link" data-reclave>Poner la clave</button>`
    : "No se pudo guardar: no hay señal. Probá de nuevo en un rato.");
  /** trae los datos de una categoría (o el resumen de todas) y vuelve a dibujar si se sigue en esa pantalla */
  function cargarAsis(cat) {
    const k = cat || "*";
    if (ASIS.cargando.has(k)) return;
    ASIS.cargando.add(k);
    api(null, cat).then((d) => { if (cat) ASIS.cats[cat] = d; else ASIS.resumen = d; })
      .catch((e) => { ASIS.error[k] = e.message === "clave" ? avisoError(e) : "No se pudo cargar: no hay señal."; })
      .finally(() => {
        ASIS.cargando.delete(k);
        const aca = cat ? (S.acat === cat && ["asis", "lista", "chicos"].includes(S.ver)) || (S.ver === "inicio" && enCel.get(ULTIMA) === cat) : S.ver === "asistencia";
        if (aca) render();
      });
  }
  /** avisa abajo de la pantalla (se ve aunque estés más abajo); el de "listo" se va solo */
  function avisar(tipo, txt) {
    const a = (S.aviso = { tipo, txt });
    if (tipo === "ok") setTimeout(() => { if (S.aviso === a) { S.aviso = null; const el = $(".aviso"); if (el) el.remove(); } }, 4000);
  }
  /** guarda un cambio (días, suspendido, chicos…), vuelve a traer la categoría y avisa cómo salió */
  async function guardarAsis(cuerpo, ok, despues) {
    const cat = S.acat;
    avisar("espera", "Guardando…");
    render();
    try {
      await api({ cat, ...cuerpo });
      ASIS.cats[cat] = await api(null, cat);
      ASIS.resumen = null;
      avisar("ok", ok);
      S.aform = null;
      if (despues) { despues(); return; }
    } catch (e) { avisar("error", avisoError(e)); }
    render();
  }
  const avisoHTML = () => (S.aviso ? `<p class="aviso aviso--${S.aviso.tipo}" role="status">${S.aviso.tipo === "ok" ? IC.tilde : ""}<span>${S.aviso.txt}</span></p>` : "");
  const cargandoHTML = (k) => (ASIS.error[k] ? `<div class="hoy hoy--error"><p class="hoy__canc">${ASIS.error[k]}</p>
      <button type="button" class="btn-sec" data-reintentar="${esc(k)}">Probar de nuevo</button></div>` : `<p class="cargando">Cargando…</p>`);

  /** los chicos de la categoría: los fichados menos los que ya no vienen, más los sumados a mano (cuentan desde ese día) */
  function chicosDe(cat, d) {
    const bajas = new Set(d.chicos.filter((c) => c.estado === "baja").map((c) => c.id));
    const todos = [...(D.fichados[cat] || []).map(([id, nombre]) => ({ id, nombre, desde: "" })),
      ...d.chicos.filter((c) => c.id.startsWith("m")).map((c) => ({ id: c.id, nombre: c.nombre, desde: c.ts.slice(0, 10), mano: true }))];
    return { activos: todos.filter((c) => !bajas.has(c.id)).sort(porNombre), fuera: todos.filter((c) => bajas.has(c.id)).sort(porNombre) };
  }
  /** los entrenamientos entre dos fechas: los de siempre (por los días cargados) con sus cambios, los agregados y los días con lista */
  function sesiones(d, desde, hasta) {
    const out = new Map();
    for (let f = desde; f <= hasta; f = masDias(f, 1)) {
      const h = d.horarios.find((x) => x.dia === dia(f).getDay());
      if (h) out.set(f, { fecha: f, hora: h.hora, estado: "normal" });
    }
    d.entrenamientos.filter((e) => e.fecha >= desde && e.fecha <= hasta).forEach((e) => {
      const s = out.get(e.fecha);
      if (e.estado === "extra") out.set(e.fecha, { fecha: e.fecha, hora: e.hora, estado: "extra" });
      else if (s) Object.assign(s, { estado: e.estado, motivo: e.motivo, antes: s.hora, hora: e.estado === "movido" ? e.hora : s.hora });
    });
    const listas = new Map(d.listas.map((l) => [l.fecha, l]));
    listas.forEach((l, f) => { if (f >= desde && f <= hasta && !out.has(f)) out.set(f, { fecha: f, hora: "", estado: "extra" }); });
    return [...out.values()].map((s) => ({ ...s, lista: listas.get(s.fecha) || null })).sort((a, b) => a.fecha.localeCompare(b.fecha));
  }
  const listasValidas = (d) => {
    const canc = new Set(d.entrenamientos.filter((e) => e.estado === "cancelado").map((e) => e.fecha));
    return d.listas.filter((l) => !canc.has(l.fecha));
  };
  /** a cuántos entrenamientos con lista vino cada chico */
  function porcentajes(d, chicos) {
    const ls = listasValidas(d);
    return chicos.map((c) => {
      const base = ls.filter((l) => l.fecha >= c.desde), vino = base.filter((l) => l.presentes.includes(c.id)).length;
      return { ...c, vino, de: base.length, pct: base.length ? Math.round((vino / base.length) * 100) : null };
    });
  }
  /** "martes y jueves a las 18:30" (de lunes a domingo) */
  function horariosTxt(hs) {
    const porHora = new Map();
    hs.slice().sort((a, b) => ((a.dia + 6) % 7) - ((b.dia + 6) % 7)).forEach((h) => porHora.set(h.hora, [...(porHora.get(h.hora) || []), DIA_S[h.dia]]));
    return [...porHora].map(([hora, ds]) => `${ds.length > 1 ? `${ds.slice(0, -1).join(", ")} y ${ds.at(-1)}` : ds[0]} a las ${hora}`).join(" · ");
  }
  /** cuántos vinieron, contando solo a los chicos que hoy están en la lista (los que ya no vienen no suman) */
  const vinieron = (l, activos) => { const ids = new Set(activos.map((c) => c.id)); return l.presentes.filter((id) => ids.has(id)).length; };
  /** quién tomó la lista y a qué hora */
  const tomoTxt = (l) => (l.por ? `tomó lista ${esc(l.por)} a las ${horaDe(l.ts)}` : `se guardó a las ${horaDe(l.ts)}`);
  /** cómo está un entrenamiento, en pocas palabras */
  function estadoTxt(s, activos, cat) {
    if (s.estado === "cancelado") return `Suspendido${s.motivo ? `: ${esc(s.motivo)}` : ""}`;
    if (s.lista) return `Vinieron ${vinieron(s.lista, activos)} de ${activos.length}`;
    if (borrador(cat, s.fecha)) return "Lista sin guardar";
    return s.fecha > hoyISO() ? "Próximo" : s.fecha === hoyISO() ? "Falta la lista" : "Sin lista";
  }

  // los formularios chicos (suspender, cambiar la hora, agregar, días, borrar): aparecen en el lugar, sin ventanas
  const volverBtn = `<button type="button" class="btn-sec" data-form="">Volver</button>`;
  const formSuspender = (s, activos) => `<div class="asis-form"><span class="asis-form__l">¿Por qué se suspende?</span>
      <div class="chips-g chips-g--asis" role="group" aria-label="Motivo">${["Lluvia", "Cancha en mal estado", "Otro"].map((m) =>
        `<button type="button" data-motivo="${m}" aria-pressed="false">${m === "Otro" ? "Otro motivo" : m}</button>`).join("")}</div>
      <label class="asis-form__campo" id="motivo-otro" hidden>Contá por qué<input id="motivo" class="asis-input" maxlength="120" autocomplete="off"></label>
      ${s.lista ? `<p class="asis-form__aviso">Este día ya tiene lista (vinieron ${vinieron(s.lista, activos)} de ${activos.length}). Si lo suspendés, esa lista no cuenta.</p>` : ""}
      <div class="asis-form__btns"><button type="button" class="btn btn--peligro btn--alto" data-cancelar-ok="${s.fecha}">Suspender el entrenamiento</button>${volverBtn}</div></div>`;
  const formHora = (s) => `<div class="asis-form"><label class="asis-form__campo">Nueva hora para el ${esc(cuandoP(s))}
      <input id="hora-nueva" class="asis-input asis-input--hora" type="time" value="${esc(s.hora || "")}" required></label>
      <div class="asis-form__btns"><button type="button" class="btn btn--ok btn--alto" data-hora-ok="${s.fecha}">Cambiar la hora</button>${volverBtn}</div></div>`;
  const formBorrarExtra = (s) => `<div class="asis-form"><span class="asis-form__l">¿Borrar el entrenamiento agregado del ${esc(cuandoP(s))}?</span>
      <div class="asis-form__btns"><button type="button" class="btn btn--peligro btn--alto" data-deshacer="${s.fecha}">Borrarlo</button>${volverBtn}</div></div>`;
  /** el primer día desde mañana que no tiene entrenamiento: así "agregar" no propone uno que ya existe */
  const diaLibre = (d) => { let f = masDias(hoyISO(), 1); while (sesiones(d, f, f).length) f = masDias(f, 1); return f; };
  const formAgregar = (d) => `<div class="asis-form"><span class="asis-form__l">Un entrenamiento que no está en los días de siempre</span>
      <div class="asis-form__fila"><label class="asis-form__campo">Día<input id="fecha-nueva" class="asis-input" type="date" value="${diaLibre(d)}" required></label>
        <label class="asis-form__campo">Hora<input id="hora-agregar" class="asis-input asis-input--hora" type="time" value="${esc((d.horarios[0] || {}).hora || "18:00")}" required></label></div>
      <div class="asis-form__btns"><button type="button" class="btn btn--ok btn--alto" data-agregar-ok>${IC.mas}Agregar</button>${volverBtn}</div></div>`;
  const formDias = (d) => `<div class="asis-form"><span class="asis-form__l">Tocá los días que entrena</span>
      <div class="chips-g chips-g--asis chips-g--dias" role="group" aria-label="Días">${[1, 2, 3, 4, 5, 6, 0].map((n) =>
        `<button type="button" data-dia="${n}" aria-pressed="${d.horarios.some((h) => h.dia === n)}">${mayus(DIA_S[n].slice(0, 3))}</button>`).join("")}</div>
      <label class="asis-form__campo">A qué hora<input id="hora-dias" class="asis-input asis-input--hora" type="time" value="${esc((d.horarios[0] || {}).hora || "18:00")}" required></label>
      <div class="asis-form__btns"><button type="button" class="btn btn--ok btn--alto" data-horarios-ok>Guardar los días</button>${d.horarios.length ? volverBtn : ""}</div></div>`;

  /** el entrenamiento de hoy (o el próximo): lo primero, con un solo botón grande */
  function tarjetaHoy(cat, s, activos) {
    const hoy = hoyISO(), b = borrador(cat, s.fecha);
    const estado = s.estado === "cancelado" ? `<p class="hoy__canc">Suspendido${s.motivo ? `: ${esc(s.motivo)}` : ""}</p>`
      : b ? `<p class="hoy__estado hoy__estado--ojo">${IC.alerta}<span>Tenés la lista sin guardar (${b.marcas.length} marcados)</span></p>`
      : s.lista ? `<p class="hoy__estado">${IC.tilde}<span>Vinieron <b>${vinieron(s.lista, activos)} de ${activos.length}</b> · ${tomoTxt(s.lista)}</span></p>`
      : s.estado === "movido" ? `<p class="hoy__nota">Cambió la hora (antes ${esc(s.antes)})</p>` : "";
    const principal = s.estado === "cancelado" ? `<button type="button" class="btn-sec btn-sec--ancho" data-deshacer="${s.fecha}">Deshacer: vuelve a haber entrenamiento</button>`
      : s.fecha <= hoy ? `<button type="button" class="btn btn--ok btn--grande" data-ir-lista="${s.fecha}">${IC.lista}${b ? "Seguir la lista" : s.lista ? "Corregir la lista" : "Tomar lista"}</button>` : "";
    const otras = s.estado === "cancelado" ? "" : `<div class="acc-2">
        <button type="button" class="btn-sec" data-form="suspender:${s.fecha}">${s.estado === "extra" ? "Borrarlo" : "Suspender"}</button>
        <button type="button" class="btn-sec" data-form="hora:${s.fecha}">Cambiar la hora</button></div>`;
    const form = S.aform === `suspender:${s.fecha}` ? (s.estado === "extra" ? formBorrarExtra(s) : formSuspender(s, activos)) : S.aform === `hora:${s.fecha}` ? formHora(s) : "";
    return `<div class="hoy${s.estado === "cancelado" ? " hoy--canc" : ""}">
      <p class="hoy__lbl">${s.fecha === hoy ? "Hoy" : "Próximo entrenamiento"}</p>
      <h3 class="hoy__dia">${esc(mayus(cuandoP(s)))}${s.hora ? ` · ${esc(s.hora)}` : ""}</h3>
      ${estado}${principal}${otras}${form}</div>`;
  }

  // la lista de categorías, con cuánto viene cada una
  function vAsistencia() {
    const r = ASIS.resumen;
    if (!r && !ASIS.error["*"]) cargarAsis(null);
    const fila = (cat) => {
      const res = r && r.resumen[cat], ch = (r && r.chicos[cat]) || { alta: 0, baja: 0 };
      const n = (D.fichados[cat] || []).length + ch.alta - ch.baja, p = res && n ? Math.round((res.presentes / (res.listas * n)) * 100) : null;
      return `<li><button type="button" class="fila-cat fila-cat--asis" data-ir-asis="${esc(cat)}">
        <span class="fila-cat__nom">${esc(cat)}<small>${!r ? "…" : res ? `${pl(res.listas, "lista", "listas")} · la última, ${corta(res.ultima)}` : "Todavía sin listas"}</small></span>
        ${r && res ? porcHTML(p, res.listas >= LISTAS_MIN) : ""}${IC.adelante}</button></li>`;
    };
    $("#vista").innerHTML = `
      <div class="cab">${volver()}${cabTit("Asistencia", "asistencia")}</div>
      <section class="sec sec--pegada asis-v">
        ${ASIS.error["*"] ? cargandoHTML("*") : ""}
        <ul class="filas-cat">${ASIS_CATS.filter((c) => D.fichados[c] || (r && r.resumen[c])).map(fila).join("")}</ul>
      </section>`;
  }

  // una categoría: hoy, cómo viene la asistencia, los chicos, los entrenamientos y los días
  function vAsis() {
    const cat = S.acat, d = ASIS.cats[cat];
    const cab = `<div class="cab">${volver("Asistencia", "asistencia")}${cabTit(esc(cat), "asisCat")}</div>`;
    if (!d) {
      if (!ASIS.error[cat]) cargarAsis(cat);
      $("#vista").innerHTML = `${cab}<section class="sec sec--pegada asis-v">${cargandoHTML(cat)}</section>`;
      return;
    }
    enCel.set(ULTIMA, cat);
    const hoy = hoyISO(), { activos } = chicosDe(cat, d), total = activos.length;
    // los de antes se muestran desde que se empezó a usar (la primera lista o el primer cambio), hasta 6 semanas para atrás
    const primero = [...d.listas, ...d.entrenamientos].map((x) => x.fecha).filter((f) => f < hoy).sort()[0] || hoy;
    const ses = sesiones(d, primero > masDias(hoy, -42) ? primero : masDias(hoy, -42), masDias(hoy, 14));
    const actual = ses.find((s) => s.fecha === hoy) || ses.find((s) => s.fecha > hoy && s.estado !== "cancelado");
    const validas = listasValidas(d), nListas = validas.length, conColor = nListas >= LISTAS_MIN;
    const pc = porcentajes(d, activos), tot = pc.reduce((t, c) => [t[0] + c.vino, t[1] + c.de], [0, 0]);
    const ult = validas.at(-1);
    const resumen = !nListas ? `<p class="asis-nada">Todavía no se tomó ninguna lista.</p>`
      : !conColor ? `<p class="titular">${nListas === 1 ? "Primera lista" : "Última lista"}: vinieron <b>${vinieron(ult, activos)} de ${total}</b></p>
          <p class="asis-nota">Desde la tercera lista se ve cuánto viene cada chico.</p>`
      : `<p class="titular">Viene el <b>${Math.round((tot[0] / tot[1]) * 100)}%</b> de las veces</p>
          <p class="asis-nota">En ${pl(nListas, "entrenamiento", "entrenamientos")} con lista</p>
          <h3 class="grupo">Los que menos vienen</h3>
          <ul class="asis-chicos">${pc.filter((c) => c.de).sort((a, b) => a.pct - b.pct || porNombre(a, b)).slice(0, 5).map((c) =>
            `<li><span class="asis-chicos__nom">${nombreHTML(c.nombre)}<small>Vino ${c.vino} de ${c.de}</small></span>${porcHTML(c.pct, true)}</li>`).join("")}</ul>`;
    const proximos = ses.filter((s) => s.fecha >= hoy), pasados = ses.filter((s) => s.fecha < hoy).reverse();
    const filaSes = (s) => `<li><button type="button" class="fila-cat fila-cat--ses${s.fecha === hoy ? " fila-cat--hoy" : ""}${s.estado === "cancelado" ? " fila-cat--canc" : ""}" data-ir-lista="${s.fecha}">
        <span class="fila-cat__nom">${s.fecha === hoy ? "Hoy" : esc(mayus(corta(s.fecha)))}<small>${s.hora ? esc(s.hora) : "Sin hora"}${s.estado === "extra" ? " · agregado" : s.estado === "movido" ? " · cambió la hora" : ""}</small></span>
        <span class="ses-estado">${estadoTxt(s, activos, cat)}</span>${IC.adelante}</button></li>`;
    $("#vista").innerHTML = `${cab}
      <section class="sec sec--pegada asis-v">
        ${!d.horarios.length && !actual ? `<div class="hoy"><p class="hoy__lbl">Para empezar</p><h3 class="hoy__dia">¿Qué días entrena ${esc(cat)}?</h3>${formDias(d)}
            <button type="button" class="btn-sec btn-sec--ancho" data-ir-lista="${hoy}">O tomar lista hoy igual</button></div>`
          : actual ? tarjetaHoy(cat, actual, activos) : ""}
      </section>
      <section class="sec asis-v">
        ${resumen}
        <ul class="filas-cat asis-ir"><li><button type="button" class="fila-cat fila-cat--asis" data-ir-chicos>
          <span class="fila-cat__nom">Los chicos (${total})<small>Ver todos, sumar a uno nuevo o sacar a uno que ya no viene</small></span>${IC.adelante}</button></li></ul>
      </section>
      <section class="sec asis-v">
        <h2 class="h2">Entrenamientos</h2>
        ${proximos.length ? `<h3 class="grupo">Próximos</h3><ul class="filas-cat">${proximos.map(filaSes).join("")}</ul>` : ""}
        ${pasados.length ? `<h3 class="grupo">Anteriores</h3><ul class="filas-cat">${pasados.map(filaSes).join("")}</ul>` : ""}
        ${!ses.length ? `<p class="asis-nada">Cuando cargues los días, acá aparecen los entrenamientos.</p>` : ""}
        ${S.aform === "agregar" ? formAgregar(d) : `<button type="button" class="btn-sec btn-sec--ancho asis-mas" data-form="agregar">${IC.mas}Agregar un entrenamiento</button>`}
        ${d.horarios.length ? `<ul class="filas-cat asis-ir"><li><button type="button" class="fila-cat fila-cat--asis" data-form="dias" aria-expanded="${S.aform === "dias"}">
          <span class="fila-cat__nom">Días de entrenamiento<small>${esc(mayus(horariosTxt(d.horarios)))}</small></span><span class="ses-estado">Cambiar</span></button></li></ul>
          ${S.aform === "dias" ? formDias(d) : ""}` : ""}
      </section>
      ${avisoHTML()}`;
  }

  // los chicos de la categoría: en orden alfabético, para sumar a uno nuevo o sacar a uno que ya no viene (con deshacer ahí mismo)
  function vChicos() {
    const cat = S.acat, d = ASIS.cats[cat];
    const cab = `<div class="cab"><button type="button" class="volver" data-volver-asis>${IC.atras}${esc(cat)}</button><h2 class="ej-tit">Los chicos de ${esc(cat)}</h2></div>`;
    if (!d) {
      if (!ASIS.error[cat]) cargarAsis(cat);
      $("#vista").innerHTML = `${cab}<section class="sec sec--pegada asis-v">${cargandoHTML(cat)}</section>`;
      return;
    }
    const { activos, fuera } = chicosDe(cat, d), conColor = listasValidas(d).length >= LISTAS_MIN;
    const pc = new Map(porcentajes(d, activos).map((c) => [c.id, c]));
    // los que se acaban de sacar quedan en su lugar, con "Deshacer"
    const filas = [...activos, ...fuera.filter((c) => S.recien.has(c.id))].sort(porNombre);
    const fila = (c) => S.recien.has(c.id) && !pc.has(c.id)
      ? `<li class="asis-chicos__fuera" data-q="${esc(norm(c.nombre))}"><span class="asis-chicos__nom">${nombreHTML(c.nombre)}<small>Ya no está en la lista</small></span>
          <button type="button" class="btn-sec btn-sec--chico" data-volver-chico="${esc(c.id)}">Deshacer</button></li>`
      : `<li data-q="${esc(norm(c.nombre))}"><span class="asis-chicos__nom">${nombreHTML(c.nombre)}<small>${c.mano ? "Sumado a mano · " : ""}${pc.get(c.id).de ? `Vino ${pc.get(c.id).vino} de ${pc.get(c.id).de}` : "Todavía sin listas"}</small></span>
          ${conColor && pc.get(c.id).de ? porcHTML(pc.get(c.id).pct, true) : ""}
          <button type="button" class="btn-sec btn-sec--chico" data-sacar="${esc(c.id)}" data-nombre="${esc(c.nombre)}">Ya no viene</button></li>`;
    const otrosFuera = fuera.filter((c) => !S.recien.has(c.id));
    $("#vista").innerHTML = `${cab}
      <section class="sec sec--pegada asis-v">
        <div class="asis-form asis-form--suelto"><label class="asis-form__campo" for="nuevo-chico">Sumar a un chico nuevo</label>
          <div class="asis-form__fila"><input id="nuevo-chico" class="asis-input" maxlength="80" placeholder="Apellido, nombre" autocomplete="off">
          <button type="button" class="btn btn--ok btn--alto" data-sumar-chico>${IC.mas}Sumar</button></div></div>
        ${activos.length > 20 ? `<label class="buscar-g asis-buscar"><span class="sr">Buscar un chico</span>${IC.buscar}<input type="search" id="buscar-chico" placeholder="Buscar por apellido" autocomplete="off" enterkeyhint="search"></label>` : ""}
        <h3 class="grupo">En la lista (${activos.length})</h3>
        <ul class="asis-chicos asis-chicos--editar" id="lista-chicos">${filas.map(fila).join("")}</ul>
        ${otrosFuera.length ? `<h3 class="grupo">Ya no vienen (${otrosFuera.length})</h3>
          <ul class="asis-chicos asis-chicos--editar">${otrosFuera.map((c) => `<li><span class="asis-chicos__nom">${nombreHTML(c.nombre)}</span>
            <button type="button" class="btn-sec btn-sec--chico" data-volver-chico="${esc(c.id)}">Volver a sumar</button></li>`).join("")}</ul>` : ""}
      </section>
      ${avisoHTML()}`;
  }

  // tomar lista: un toque por chico (verde con tilde = vino). Abajo, fijo, cuántos vinieron y guardar, con cómo va el guardado.
  function vLista() {
    const cat = S.acat, f = S.afecha, d = ASIS.cats[cat];
    const cab = (hora) => `<div class="cab"><button type="button" class="volver" data-volver-asis>${IC.atras}${esc(cat)}</button>
      <h2 class="ej-tit">Lista de ${esc(cat)}</h2><p class="prac-cuando">${IC.calendario}<span>${esc(mayus(cuandoP({ fecha: f })))}${hora ? ` · ${esc(hora)}` : ""}</span></p></div>`;
    if (!d) {
      if (!ASIS.error[cat]) cargarAsis(cat);
      $("#vista").innerHTML = `${cab()}<section class="sec sec--pegada asis-v">${cargandoHTML(cat)}</section>`;
      return;
    }
    enCel.set(ULTIMA, cat);
    const s = sesiones(d, f, f)[0] || { fecha: f, hora: "", estado: "nuevo", lista: null };
    const { activos } = chicosDe(cat, d), total = activos.length, futuro = f > hoyISO(), canc = s.estado === "cancelado";
    if (!S.marcas) {
      // lo que quedó marcado en el celular sin guardar tiene prioridad; si no, lo que ya está guardado
      const b = borrador(cat, f), guardados = s.lista ? s.lista.presentes : [];
      S.marcas = new Set(b ? b.marcas : guardados);
      S.base = b ? b.base : guardados;
    }
    const n = activos.filter((c) => S.marcas.has(c.id)).length, nombre = nombreGuardado();
    const acciones = s.estado === "nuevo" ? "" : S.aform === `suspender:${f}` ? (s.estado === "extra" ? formBorrarExtra(s) : formSuspender(s, activos))
      : S.aform === `hora:${f}` ? formHora(s)
      : `<div class="acc-2"><button type="button" class="btn-sec" data-form="suspender:${f}">${s.estado === "extra" ? "Borrar este entrenamiento" : "Suspender"}</button>
          <button type="button" class="btn-sec" data-form="hora:${f}">Cambiar la hora</button></div>`;
    let cuerpo;
    if (canc) {
      cuerpo = `<div class="hoy hoy--canc"><p class="hoy__canc">Este entrenamiento se suspendió${s.motivo ? `: ${esc(s.motivo)}` : ""}</p>
        <button type="button" class="btn-sec btn-sec--ancho" data-deshacer="${f}">Deshacer: vuelve a haber entrenamiento</button></div>`;
    } else if (futuro) {
      cuerpo = `<div class="hoy"><p class="hoy__nota">La lista se toma el día del entrenamiento.</p>${acciones}</div>`;
    } else {
      const borrarForm = S.aform === "borrar-lista" ? `<div class="asis-form"><span class="asis-form__l">¿Borrar la lista de este día? Se pierden los ${s.lista ? vinieron(s.lista, activos) : 0} que vinieron.</span>
          <div class="asis-form__btns"><button type="button" class="btn btn--peligro btn--alto" data-borrar-lista-ok>Borrar la lista</button>${volverBtn}</div></div>` : "";
      cuerpo = `
        ${!nombre || S.cambiarNombre ? `<label class="asis-form__campo lista-quien">¿Quién toma lista?<input id="por" class="asis-input" maxlength="60" value="${esc(nombre)}" placeholder="Tu nombre" autocomplete="name"></label>` : ""}
        ${s.lista ? `<p class="lista-info">Ya hay una lista guardada: vinieron ${vinieron(s.lista, activos)} de ${total}, ${tomoTxt(s.lista)}. Lo que cambies se suma a esa lista.</p>` : ""}
        <div class="lista-cab"><span>Tocá a los que vinieron</span>${n ? "" : `<button type="button" class="btn-sec btn-sec--chico" data-todos>Marcar a todos</button>`}</div>
        ${total > 30 ? `<label class="buscar-g asis-buscar"><span class="sr">Buscar un chico</span>${IC.buscar}<input type="search" id="buscar-chico" placeholder="Buscar por apellido" autocomplete="off" enterkeyhint="search"></label>` : ""}
        <ul class="lista-g" id="lista-chicos">${activos.map((c) => `<li data-q="${esc(norm(c.nombre))}"><button type="button" class="lista-it" data-marca="${esc(c.id)}" aria-pressed="${S.marcas.has(c.id)}">
          <span class="lista-it__ic">${IC.tilde}</span><span class="lista-it__nom">${nombreHTML(c.nombre)}</span></button></li>`).join("")}</ul>
        ${nombre && !S.cambiarNombre ? `<p class="lista-por">Toma lista <b>${esc(nombre)}</b> <button type="button" class="link" data-cambiar-nombre>Cambiar</button></p>` : ""}
        <div class="lista-mas"><span class="asis-form__l">¿No hubo entrenamiento o cambió la hora?</span>${acciones}
          ${s.lista && S.aform !== "borrar-lista" ? `<button type="button" class="btn-sec btn-sec--ancho" data-form="borrar-lista">Borrar la lista de este día</button>` : ""}${borrarForm}</div>
        <div class="lista-pie" id="pie-lista" role="status">${pieHTML(n, total)}</div>`;
    }
    $("#vista").innerHTML = `${cab(s.hora)}<section class="sec sec--pegada asis-v">${cuerpo}</section>${avisoHTML()}`;
  }
  /** la barra fija de abajo: cuántos vinieron y guardar; mientras guarda, si falla o si hay que volver a poner la clave */
  function pieHTML(n, total) {
    if (S.estadoLista === "guardando") return `<span><b class="num">${n}</b> de ${total} vinieron</span>
      <button type="button" class="btn btn--ok btn--grande" disabled><span class="girando" aria-hidden="true"></span>Guardando…</button>`;
    if (S.estadoLista === "error") return `<span class="lista-pie__error">No se guardó: no hay señal. Lo marcado queda en el celular.</span>
      <button type="button" class="btn btn--peligro btn--grande" data-guardar-lista>Probar de nuevo</button>`;
    if (S.estadoLista === "clave") return `<span class="lista-pie__error">Hay que volver a poner la clave. Lo marcado queda en el celular.</span>
      <button type="button" class="btn btn--peligro btn--grande" data-reclave>Poner la clave</button>`;
    return `<span><b class="num" id="cont">${n}</b> de ${total} vinieron</span>
      <button type="button" class="btn btn--ok btn--grande" data-guardar-lista>${IC.tilde}Guardar la lista</button>`;
  }
  function pintarPie() {
    const pie = $("#pie-lista");
    if (!pie) return;
    pie.classList.toggle("lista-pie--error", S.estadoLista === "error" || S.estadoLista === "clave");
    pie.innerHTML = pieHTML(document.querySelectorAll(".lista-it[aria-pressed='true']").length, document.querySelectorAll(".lista-it").length);
  }
  /** guarda la lista: manda solo lo que cambió (así si otro entrenador también tomó lista, se juntan) y, si no hay señal, no se pierde nada */
  async function guardarLista() {
    const cat = S.acat, f = S.afecha, por = $("#por");
    if (por) enCel.set(NOMBRE, por.value.trim() || null);
    const b = borrador(cat, f) || { marcas: [...S.marcas], base: S.base || [] };
    S.estadoLista = "guardando"; pintarPie();
    try {
      await api({ cat, accion: "lista", fecha: f, presentes: b.marcas, base: b.base });
      guardarBorrador(cat, f, null);
      ASIS.cats[cat] = await api(null, cat);
      ASIS.resumen = null;
      S.estadoLista = null;
      const { activos } = chicosDe(cat, ASIS.cats[cat]), l = ASIS.cats[cat].listas.find((x) => x.fecha === f);
      avisar("ok", `Lista guardada: vinieron ${l ? vinieron(l, activos) : 0} de ${activos.length}`);
      irA({ ver: "asis", afecha: null, aform: null, marcas: null, cambiarNombre: false });
    } catch (e) {
      S.estadoLista = e.message === "clave" ? "clave" : "error";
      pintarPie();
    }
  }
  // si se cortó la señal mientras guardaba, apenas vuelve lo intenta solo
  addEventListener("online", () => { if (S && S.ver === "lista" && S.estadoLista === "error") guardarLista(); });

  /** en el inicio, los días que entrena la última categoría en la que tomaste lista: el atajo para tomarla en 2 toques */
  function hoyInicio() {
    const cat = D.fichados && enCel.get(ULTIMA);
    if (!cat || !ASIS_CATS.includes(cat)) return "";
    const d = ASIS.cats[cat];
    if (!d) { if (!ASIS.error[cat]) cargarAsis(cat); return ""; }
    const hoy = hoyISO(), s = sesiones(d, hoy, hoy)[0], b = borrador(cat, hoy);
    if (!s && !b) return "";
    const { activos } = chicosDe(cat, d);
    if (s && s.estado === "cancelado") {
      return `<section class="sec hoy-inicio"><div class="hoy hoy--canc"><p class="hoy__lbl">Hoy · ${esc(cat)}</p>
        <h3 class="hoy__dia">No hay entrenamiento</h3><p class="hoy__canc">Suspendido${s.motivo ? `: ${esc(s.motivo)}` : ""}</p>
        <button type="button" class="btn-sec btn-sec--ancho" data-ir-asis="${esc(cat)}">Ver ${esc(cat)}</button></div></section>`;
    }
    return `<section class="sec hoy-inicio"><div class="hoy"><p class="hoy__lbl">Hoy entrena ${esc(cat)}</p>
      <h3 class="hoy__dia">${s && s.hora ? `A las ${esc(s.hora)}` : esc(mayus(cuandoP({ fecha: hoy })))}</h3>
      ${b ? `<p class="hoy__estado hoy__estado--ojo">${IC.alerta}<span>Tenés la lista sin guardar (${b.marcas.length} marcados)</span></p>`
        : s && s.lista ? `<p class="hoy__estado">${IC.tilde}<span>Vinieron <b>${vinieron(s.lista, activos)} de ${activos.length}</b> · ${tomoTxt(s.lista)}</span></p>` : ""}
      <button type="button" class="btn btn--ok btn--grande" data-ir-hoy="${esc(cat)}|${hoy}">${IC.lista}${b ? "Seguir la lista" : s && s.lista ? "Corregir la lista" : "Tomar lista"}</button>
      <button type="button" class="link hoy__otra" data-ir="asistencia">Otra categoría</button></div></section>`;
  }

  /** la práctica en texto, para WhatsApp */
  function textoPractica(p) {
    const l = [`*${p.foco || "Práctica"}*`, `${p.grupo} · ${cuandoP(p)}${p.min ? ` · ${p.min} min` : ""}`];
    if (p.objetivos.length) l.push("", "Objetivos:", ...p.objetivos.map((o) => `• ${o}`));
    p.bloques.forEach((b) => {
      if (b.agua) { l.push(`(Agua${b.min ? ` ${b.min}'` : ""})`); return; }
      if (b.b) l.push("", `*${b.b}*`);
      b.items.forEach((it) => l.push(`${it.min ? `${it.min}' ` : "• "}${[it.obj, it.act, it.det].filter(Boolean).join(". ") || b.b || "—"}${it.grupo ? ` (${it.grupo})` : ""}`));
    });
    if (p.cierre) l.push("", "Charla final y elongación");
    l.push("", `Práctica de ${p.quien} · Club Los 50`);
    return l.join("\n");
  }
  async function compartirPractica() {
    const p = D.guia.practicas.find((x) => x.id === S.practica), txt = textoPractica(p);
    // en el celular abre el menú de compartir (WhatsApp, mail…); en la compu, WhatsApp Web
    if (navigator.share) {
      try { await navigator.share({ title: p.foco, text: txt }); return; } catch (e) { if (e.name === "AbortError") return; }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, "_blank", "noopener");
  }

  // ---------- eventos ----------
  document.addEventListener("click", (e) => {
    if (!S) return;
    const t = e.target.closest("[data-play],[data-reclave],[data-ayuda],[data-cerrar-ayuda],[data-ir],[data-ir-cat],[data-ir-guia],[data-ir-ej],[data-ir-ej-para],[data-ir-ej-tab],[data-ir-line],[data-ir-puesto],[data-ir-practica],[data-ir-practicas],[data-pgrupo],[data-fcat],[data-ir-asis],[data-ir-hoy],[data-ir-lista],[data-ir-chicos],[data-volver-asis],[data-form],[data-reintentar],[data-motivo],[data-dia],[data-marca],[data-todos],[data-cancelar-ok],[data-deshacer],[data-hora-ok],[data-agregar-ok],[data-horarios-ok],[data-guardar-lista],[data-borrar-lista-ok],[data-cambiar-nombre],[data-sacar],[data-volver-chico],[data-sumar-chico],[data-volver-pr],[data-compartir-pr],[data-volver-ej],[data-rol],[data-quitar-para],[data-tab],[data-anio],[data-ver],[data-ordj]");
    if (!t || t.disabled) return;
    const ds = t.dataset;
    if (ds.play) reproducir(ds.play);
    else if ("reclave" in ds) { olvidar(); location.reload(); } // vuelve a la misma pantalla después de la clave
    else if (ds.ayuda) abrirAyuda(ds.ayuda, t);
    else if ("cerrarAyuda" in ds) cerrarAyuda();
    else if (ds.ir) irA({ ver: ds.ir, cat: null, temp: null, gcat: null, tab: null, rol: null, para: null, qe: "", pgrupo: null, qp: "", fcat: null, aform: null, aviso: null });
    else if (ds.irEj) irA({ ver: "ejercicio", ej: ds.irEj });
    else if (ds.irEjPara) irA({ ver: "ejercicios", tab: "juegos", rol: null, para: ds.irEjPara, gcat: null, qe: "" });
    else if (ds.irEjTab) irA({ ver: "ejercicios", tab: ds.irEjTab, rol: null, para: null, gcat: null, qe: "" });
    else if (ds.irLine) irA({ ver: "ejercicios", tab: "line", rol: ds.irLine, para: null, gcat: null, qe: "" });
    else if (ds.irPuesto) irA({ ver: "puesto", puesto: +ds.irPuesto });
    else if (ds.irPractica) irA({ ver: "practica", practica: ds.irPractica });
    else if (ds.irPracticas) irA({ ver: "practicas", pgrupo: ds.irPracticas, qp: "", cat: null, gcat: null, temp: null });
    else if (ds.irAsis) irA({ ver: "asis", acat: ds.irAsis, afecha: null, aform: null, marcas: null, aviso: null, estadoLista: null, cat: null, gcat: null, temp: null });
    else if (ds.irHoy) { const [acat, afecha] = ds.irHoy.split("|"); irA({ ver: "lista", acat, afecha, aform: null, marcas: null, aviso: null, estadoLista: null, cambiarNombre: false }); }
    else if (ds.irLista) irA({ ver: "lista", afecha: ds.irLista, aform: null, marcas: null, aviso: null, estadoLista: null, cambiarNombre: false });
    else if ("irChicos" in ds) irA({ ver: "chicos", aform: null, aviso: null, recien: new Set() });
    else if ("volverAsis" in ds) irA({ ver: "asis", afecha: null, aform: null, marcas: null, aviso: null, estadoLista: null, cambiarNombre: false });
    else if ("form" in ds) { S.aform = S.aform === ds.form || !ds.form ? null : ds.form; S.aviso = null; render(); }
    else if (ds.reintentar) { delete ASIS.error[ds.reintentar]; render(); }
    else if (ds.motivo) {
      // un solo motivo elegido; "Otro motivo" abre el campo para escribirlo
      t.closest(".chips-g").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === t));
      const otro = $("#motivo-otro");
      otro.hidden = ds.motivo !== "Otro";
      if (!otro.hidden) $("#motivo").focus();
    } else if (ds.dia) t.setAttribute("aria-pressed", t.getAttribute("aria-pressed") !== "true");
    else if (ds.marca) {
      // tomar lista sin volver a dibujar la pantalla (no salta el scroll); lo marcado queda guardado en el celular
      const on = !S.marcas.has(ds.marca);
      if (on) S.marcas.add(ds.marca); else S.marcas.delete(ds.marca);
      t.setAttribute("aria-pressed", on);
      guardarBorrador(S.acat, S.afecha, { marcas: [...S.marcas], base: S.base || [] });
      const c = $("#cont");
      if (c) c.textContent = document.querySelectorAll(".lista-it[aria-pressed='true']").length;
      const todos = $("[data-todos]");
      if (todos) todos.hidden = true;
    } else if ("todos" in ds) {
      S.marcas = new Set([...document.querySelectorAll(".lista-it")].map((x) => x.dataset.marca));
      guardarBorrador(S.acat, S.afecha, { marcas: [...S.marcas], base: S.base || [] });
      render();
    } else if (ds.cancelarOk) {
      const elegido = $("[data-motivo][aria-pressed='true']");
      const motivo = !elegido ? "" : elegido.dataset.motivo === "Otro" ? $("#motivo").value.trim() : elegido.dataset.motivo;
      guardarAsis({ accion: "entrenamiento", fecha: ds.cancelarOk, estado: "cancelado", motivo }, "Entrenamiento suspendido");
    } else if (ds.deshacer) {
      const fecha = ds.deshacer, s = sesiones(ASIS.cats[S.acat], fecha, fecha)[0], extra = s && s.estado === "extra";
      guardarAsis({ accion: "entrenamiento", fecha, estado: "normal" }, extra ? "Entrenamiento borrado" : "Listo: vuelve a haber entrenamiento",
        extra && S.ver === "lista" ? () => irA({ ver: "asis", afecha: null, aform: null, marcas: null }) : null);
    } else if (ds.horaOk) {
      const hora = $("#hora-nueva").value, s = sesiones(ASIS.cats[S.acat], ds.horaOk, ds.horaOk)[0];
      if (!hora) { $("#hora-nueva").focus(); return; }
      guardarAsis({ accion: "entrenamiento", fecha: ds.horaOk, estado: s && s.estado === "extra" ? "extra" : "movido", hora }, `Ahora es a las ${hora}`);
    } else if ("agregarOk" in ds) {
      const fecha = $("#fecha-nueva").value, hora = $("#hora-agregar").value;
      if (!fecha || !hora) { $(fecha ? "#hora-agregar" : "#fecha-nueva").focus(); return; }
      guardarAsis({ accion: "entrenamiento", fecha, estado: "extra", hora }, `Entrenamiento agregado: ${diaMes(fecha)} a las ${hora}`);
    } else if ("horariosOk" in ds) {
      const dias = [...document.querySelectorAll("[data-dia][aria-pressed='true']")].map((x) => +x.dataset.dia), hora = $("#hora-dias").value;
      if (!hora) { $("#hora-dias").focus(); return; }
      guardarAsis({ accion: "horarios", horarios: dias.map((dia) => ({ dia, hora })) }, dias.length ? "Días guardados" : "Se sacaron los días");
    } else if ("guardarLista" in ds) guardarLista();
    else if ("borrarListaOk" in ds) {
      guardarAsis({ accion: "borrar_lista", fecha: S.afecha }, "Lista borrada", () => {
        guardarBorrador(S.acat, S.afecha, null);
        irA({ ver: "asis", afecha: null, aform: null, marcas: null });
      });
    } else if ("cambiarNombre" in ds) { S.cambiarNombre = true; render(); $("#por").focus(); }
    else if (ds.sacar) {
      const id = ds.sacar;
      guardarAsis({ accion: "chico", id, estado: "baja" }, `${esc(ds.nombre)} ya no está en la lista`, () => { S.recien.add(id); render(); });
    } else if (ds.volverChico) {
      const id = ds.volverChico;
      guardarAsis({ accion: "chico", id, estado: "activo" }, "Volvió a la lista", () => { S.recien.delete(id); render(); });
    } else if ("sumarChico" in ds) {
      const nombre = $("#nuevo-chico").value.trim();
      if (nombre.length < 2) { $("#nuevo-chico").focus(); return; }
      guardarAsis({ accion: "chico", estado: "alta", nombre }, `${esc(nombre)} se sumó a la lista`);
    }
    else if ("pgrupo" in ds) irA({ pgrupo: ds.pgrupo || null }, false);
    else if ("fcat" in ds) irA({ fcat: ds.fcat || null }, false);
    else if ("volverPr" in ds) irA({ ver: "practicas", practica: null }); // vuelve a la lista con el mismo filtro
    else if ("compartirPr" in ds) compartirPractica();
    else if ("volverEj" in ds) irA({ ver: "ejercicios", ej: null }); // vuelve a la lista con los mismos filtros
    else if ("rol" in ds) irA({ rol: ds.rol || null }, false);
    else if ("quitarPara" in ds) irA({ para: null }, false);
    else if (ds.irCat) irA({ ver: "cat", cat: ds.irCat, temp: null, verJ: false, verP: false, verN: false, verR: false });
    else if (ds.irGuia) irA({ ver: "guia", gcat: ds.irGuia, cat: null, temp: null });
    else if (ds.tab) { irA({ tab: ds.tab, rol: null, para: null }, false); $(`[data-tab="${ds.tab}"]`).focus(); }
    else if (ds.anio) irA({ temp: +ds.anio, verJ: false, verP: false, verN: false, verR: false }, false);
    else if (ds.ver) { S["ver" + ds.ver] = !S["ver" + ds.ver]; render(); }
    else if (ds.ordj) { S.ordenJ = ds.ordj; render(); }
  });

  document.addEventListener("toggle", (e) => {
    const d = e.target;
    if (!S || !d.dataset || !d.dataset.sec) return;
    if (d.open) S.abiertos.add(d.dataset.sec); else S.abiertos.delete(d.dataset.sec);
  }, true);

  // la ayuda se cierra con Escape; mientras está abierta, el foco no se va a la pantalla de atrás (solo tiene el botón "Entendido")
  document.addEventListener("keydown", (e) => {
    const caja = $("#ayuda");
    if (!caja || caja.hidden) return;
    if (e.key === "Escape") cerrarAyuda();
    else if (e.key === "Tab") { e.preventDefault(); $(".ayuda__ok", caja).focus(); }
  });

  // buscador de cantos: filtra sin volver a dibujar la pantalla (así no se pierde el teclado)
  document.addEventListener("input", (e) => {
    if (!S) return;
    if (e.target.id === "buscar-canto") { S.q = e.target.value; filtrarCantos(); }
    if (e.target.id === "buscar-ej") { S.qe = e.target.value; filtrarEj(); }
    if (e.target.id === "buscar-pr") { S.qp = e.target.value; filtrarPr(); }
    if (e.target.id === "buscar-chico") {
      const q = norm(e.target.value.trim());
      document.querySelectorAll("#lista-chicos li[data-q]").forEach((li) => { li.hidden = !!q && !li.dataset.q.includes(q); });
    }
  });

  // ---------- inicio ----------
  intentarGuardada().then((ok) => { if (!ok) $("#clave").focus(); });
})();
