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
  try { if (localStorage.getItem("los50-ent-recordar") === "1") $("#recordar").checked = true; } catch (e) { /* nada */ }
  function guardar(raw, siempre, ficha) {
    try { const s = siempre ? localStorage : sessionStorage; s.setItem(LLAVE, raw); s.setItem(FICHA, ficha); localStorage.setItem("los50-ent-recordar", siempre ? "1" : "0"); } catch (e) { /* sin almacenamiento: pide la clave cada vez */ }
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
      const llave = await derivar($("#clave").value.trim());
      const datos = await descifrar(llave);
      LLAVE_ACTUAL = llave;
      guardar(aB64(await crypto.subtle.exportKey("raw", llave)), $("#recordar").checked, await fichaDe($("#clave").value.trim()));
      iniciar(datos);
    } catch (e2) {
      err.textContent = SOBRE ? "La clave no es correcta. Probá de nuevo." : "No se encontraron los datos de esta sección.";
      err.hidden = false; $("#clave").select();
    } finally { btn.disabled = false; btn.textContent = "Entrar"; }
  });
  $("#salir").addEventListener("click", () => { olvidar(); location.replace(location.pathname); }); // vuelve a la clave de esta misma web


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
    abajo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    deshacer: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
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
    nota: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M7 8h10M7 12h6"/></svg>',
    doc: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4M9 15l2 2 4-4"/></svg>',
    trofeo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>',
  };

  // la copia de la página para abrirla sin señal (sw-entrenadores.js)
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "127.0.0.1" || location.hostname === "localhost")) {
    addEventListener("load", () => navigator.serviceWorker.register("sw-entrenadores.js").catch(() => { /* sin copia: anda igual con señal */ }));
  }
  function iniciar(datos) {
    const t = (k) => obj(datos[k]);
    D = {
      cats: datos.categorias, act: datos.actualizado,
      res: t("resumen"), torneos: t("torneos"), rivales: t("rivales"), ret: t("retencion"),
      camino: t("camino"), era: t("edad_relativa"), fis: t("fisico"), partidos: t("partidos"), jug: t("jugadores"), noSig: t("no_siguieron"),
      diag: datos.diag_web, expertos: datos.expertos, medir: datos.a_medir, fuentes: datos.fuentes, glosario: datos.glosario,
      guia: datos.guia || null, cam: datos.camisetas || {}, pase: datos.pase || null, alertas: datos.alertas || null, tries: datos.tries || null, prox: datos.proximos || [], fichados: datos.fichados || null,
    };
    const anios = D.res.map((r) => r["Año"]);
    D.desde = Math.min(...anios); D.hasta = Math.max(...anios);
    $("#sub").textContent = `Planillas oficiales UAR · ${D.desde}–${D.hasta}`;
    $("#actualizado").textContent = D.act;
    $("#candado").hidden = true;
    $("#app").hidden = false;
    S = { ver: "inicio", cat: null, temp: null, gcat: null, tab: null, q: "", ordenJ: "pj", verJ: false, verP: false, verN: false, verR: false, rol: null, para: null, ej: null, puesto: null, practica: null, pgrupo: null, qp: "", qe: "", abiertos: new Set(),
      acat: null, afecha: null, aform: null, marcas: null, base: null, aviso: null, estadoLista: null, recien: new Set(), area: null, pcat: null, mcat: null, alcat: null, pedad: null, ncat: null, eqcat: null, eqfecha: null, eqn: null, eqmas: 0, eqfoco: null, tcat: null, ttest: null, tfecha: null, tver: null, tdia: null, dcat: null, ddoc: null, dmarcas: new Set(), chico: null, chcat: null, eqcontar: false, cacc: "tackles", cres: null };
    // al abrir la sección (un link, la dirección escrita o que el navegador completó) arranca en el inicio;
    // al recargar o al volver con "atrás" sigue donde estaba (por ejemplo, en medio de una lista)
    const nav = performance.getEntriesByType ? performance.getEntriesByType("navigation")[0] : null;
    if (nav && nav.type === "navigate" && location.search) history.replaceState(null, "", location.pathname);
    leerURL();
    render();
    addEventListener("popstate", () => {
      if (ayudaAbierta()) { cerrarAyuda(false); return; } // el "atrás" del celular cierra la ayuda y deja la pantalla como estaba
      if ($("#foto-eq")) { cerrarImagen(false); return; } // y la imagen del equipo
      if (saltarPop) { saltarPop = false; return; }        // la ayuda se cerró con "Entendido": no hay que redibujar
      leerURL(); render(); volverAFila();
    });
  }

  // ---------- URL: ?cat=m17&temp=2026 · ?ver=club · ?ver=consejos · ?ver=guia · ?guia=m10 · ?ver=cantos&tab=zonas · ?ver=scrum · ?ver=puestos · ?puesto=10 ----------
  function leerURL() {
    const p = new URLSearchParams(location.search);
    const c = D.cats.find((x) => slug(x) === p.get("cat"));
    const g = D.guia ? gCats().find((x) => slug(x) === p.get("guia")) : null;
    const hayPuestos = !!(D.guia && D.guia.puestos), hayPr = !!(D.guia && D.guia.practicas && D.guia.practicas.length);
    const vistas = ["club", "consejos", "guiaclub", "alertas"].concat(D.pase ? ["pase"] : [], D.guia ? ["guia", "cantos", "scrum"] : [], D.guia && D.guia.ejercicios ? ["ejercicios"] : [], hayPuestos ? ["puestos"] : [], hayPr ? ["practicas"] : []);
    const ej = D.guia && D.guia.ejercicios ? D.guia.ejercicios.find((x) => x.id === p.get("ejercicio")) : null;
    const pu = hayPuestos && puestoDe(+p.get("puesto")) ? +p.get("puesto") : null;
    const pr = hayPr ? todasPr().find((x) => x.id === p.get("practica")) : null;
    S.cat = c || null;
    S.gcat = g || null;
    S.ej = ej ? ej.id : null;
    S.puesto = pu;
    S.practica = pr ? pr.id : null;
    S.pgrupo = hayPr ? P_GRUPOS.find((x) => slug(x) === p.get("grupo")) || null : null;
    if (p.has("q")) S.qp = p.get("q").slice(0, 60);
    const ac = D.fichados ? ASIS_CATS.find((x) => slug(x) === p.get("asistencia")) : null;
    S.acat = ac || null;
    S.afecha = ac && fechaOk(p.get("fecha") || "") ? p.get("fecha") : null;
    S.aform = null; S.marcas = null;
    if (D.fichados) vistas.push("asistencia", "notas");
    // las áreas: ?ver=area&area=asistencia · ?plan=m15 (Planificación de M15) · ?partidos=m15 (o todas)
    S.area = AREAS[p.get("area")] ? p.get("area") : null;
    S.pcat = D.guia ? ASIS_CATS.find((x) => slug(x) === p.get("plan")) || null : null;
    S.mcat = ["Todas", "Plantel superior", ...D.cats.filter((x) => !PS.includes(x))].find((x) => slug(x) === p.get("partidos")) || null;
    if (S.area) vistas.push("area");
    // la ficha de un chico: ?chico=245421&de=m16
    S.chico = D.fichados && /^[\w-]{1,40}$/.test(p.get("chico") || "") ? p.get("chico") : null;
    S.chcat = S.chico ? ASIS_CATS.find((x) => slug(x) === p.get("de")) || (eqTodos().get(S.chico) || {}).cat || null : null;
    // documentos y cursos: ?docs=m16 (y &doc=medica mientras se marca uno)
    S.dcat = D.fichados ? ASIS_CATS.find((x) => slug(x) === p.get("docs")) || null : null;
    S.ddoc = S.dcat && docsDe(S.dcat).some((d) => d.k === p.get("doc")) ? p.get("doc") : null;
    // los tests físicos: ?tests=m16 (y &test=m10&fecha=2026-10-26 mientras se carga uno)
    S.tcat = D.fichados ? testCats().find((x) => slug(x) === p.get("tests")) || null : null;
    S.ttest = S.tcat && testDe(p.get("test")) ? p.get("test") : null;
    S.tfecha = S.ttest && fechaOk(p.get("fecha") || "") && p.get("fecha") <= hoyISO() ? p.get("fecha") : null;
    // el equipo de un partido: ?equipo=m16&fecha=2026-11-01 (y &n=9 mientras se elige quién juega de 9)
    const eqc = D.fichados && p.get("equipo") ? [...new Set([...D.prox.map((x) => x.cat), ...D.cats])].find((x) => slug(x) === p.get("equipo") && eqAsis(x)) : null;
    S.eqcat = eqc || null;
    S.eqfecha = eqc && fechaOk(p.get("fecha") || "") ? p.get("fecha") : null;
    S.eqn = S.eqfecha && +p.get("n") >= 1 && +p.get("n") <= EQ_MAX ? +p.get("n") : null;
    S.eqcontar = !!S.eqfecha && !S.eqn && p.get("contar") === "1";
    S.cres = S.eqcontar && p.get("resumen") ? p.get("resumen") === "1" : null;
    S.cntOtro = S.eqcontar && p.get("otro") === "1";
    S.cntCorr = S.eqcontar && p.get("corregir") === "1";
    S.ver = c ? "cat" : g ? "guia" : ej ? "ejercicio" : pu ? "puesto" : S.practica ? "practica" : ac ? (S.afecha ? "lista" : p.get("chicos") ? "chicos" : "asis")
      : S.chico ? "chico" : S.dcat ? (S.ddoc ? "doclista" : "docs") : S.tcat ? (S.tfecha ? "toma" : "tests") : S.eqfecha ? "equipo" : S.pcat ? "plan" : S.mcat ? "partidos" : vistas.includes(p.get("ver")) ? p.get("ver") : "inicio";
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
    else if (S.ver === "practica") {
      p.set("practica", S.practica);
      const pr = todasPr().find((x) => x.id === S.practica);
      if (S.pgrupo) p.set("grupo", slug(S.pgrupo));
      if (S.pcat && pr && grupoPlan(S.pcat) === pr.grupo) p.set("plan", slug(S.pcat));
      if (S.qp) p.set("q", S.qp);
    }
    else if (S.ver === "practicas") { p.set("ver", S.ver); if (S.pgrupo) p.set("grupo", slug(S.pgrupo)); }
    else if (S.ver === "area") { p.set("ver", "area"); p.set("area", S.area); }
    else if (S.ver === "plan") p.set("plan", slug(S.pcat));
    else if (S.ver === "partidos") p.set("partidos", slug(S.mcat));
    else if (S.ver === "chico") { p.set("chico", S.chico); if (S.chcat) p.set("de", slug(S.chcat)); }
    else if (S.ver === "docs" || S.ver === "doclista") { p.set("docs", slug(S.dcat)); if (S.ver === "doclista") p.set("doc", S.ddoc); }
    else if (S.ver === "tests" || S.ver === "toma") { p.set("tests", slug(S.tcat)); if (S.ver === "toma") { p.set("test", S.ttest); p.set("fecha", S.tfecha); } }
    else if (S.ver === "equipo") { p.set("equipo", slug(S.eqcat)); p.set("fecha", S.eqfecha); if (S.eqn) p.set("n", S.eqn); if (S.eqcontar) { p.set("contar", "1"); if (S.cres != null) p.set("resumen", S.cres ? "1" : "0"); if (S.cntOtro) p.set("otro", "1"); if (S.cntCorr) p.set("corregir", "1"); } }
    else if (["asis", "lista", "chicos"].includes(S.ver)) { p.set("asistencia", slug(S.acat)); if (S.ver === "lista") p.set("fecha", S.afecha); if (S.ver === "chicos") p.set("chicos", "1"); }
    else if (S.ver === "ejercicios") { p.set("ver", S.ver); if (S.tab) p.set("tab", S.tab); if (S.rol) p.set("rol", S.rol); if (S.para) p.set("para", S.para); }
    else if (S.ver !== "inicio") { p.set("ver", S.ver); if (S.tab) p.set("tab", S.tab); if (S.ver === "scrum" && S.para) p.set("para", S.para); }
    const qs = p.toString();
    return location.pathname + (qs ? "?" + qs : "");
  }
  function irA(cambios, empujar = true) {
    // cada paso guarda cuántos pasos hay adentro de la sección y de qué pantalla se vino: así "Volver" sabe adónde va y lo dice
    const desde = empujar ? tituloDe() : null;
    Object.assign(S, cambios);
    history[empujar ? "pushState" : "replaceState"](empujar ? { n: ((history.state && history.state.n) || 0) + 1, desde } : history.state, "", url());
    render();
    if (empujar) { scrollTo({ top: 0 }); $("#vista").focus({ preventScroll: true }); }
  }
  /** cambia de pantalla sin sumar un paso: para Anterior / Siguiente (así "Volver" no las recorre una por una) */
  function irSinPaso(cambios) {
    irA(cambios, false);
    scrollTo({ top: 0 }); $("#vista").focus({ preventScroll: true });
  }
  /** el nombre corto de la pantalla en la que se está: es lo que dice el botón "Volver" de la pantalla siguiente */
  function tituloDe() {
    const ej = S.ver === "ejercicio" && D.guia.ejercicios.find((x) => x.id === S.ej), pu = S.ver === "puesto" && puestoDe(S.puesto);
    return ({ inicio: "Inicio", cat: S.cat, club: "Todo el club", consejos: "Consejos", guia: S.gcat || "Qué aprende cada categoría",
      cantos: "Cantos y zonas", scrum: "Scrum seguro", ejercicios: S.para ? `Juegos de ${S.para}` : "Ejercicios", ejercicio: ej && ej.nombre, puestos: "Los puestos", puesto: pu && pu.nombre,
      practicas: "Prácticas", practica: (todasPr().find((x) => x.id === S.practica) || {}).foco || "Práctica", pase: "De M19 a plantel superior", alertas: "Para mirar", area: AREAS[S.area], plan: `Planificación de ${S.pcat}`, partidos: S.mcat === "Todas" ? "Partidos" : `Partidos de ${S.mcat}`, guiaclub: "Guía del club", notas: "Notas", equipo: S.eqn ? `El ${S.eqn}` : S.eqcontar ? cntTitulo() : S.eqfecha < hoyISO() ? `Quién jugó en ${S.eqcat}` : `Equipo de ${S.eqcat}`, chico: ((S.chico && chicoDe(S.chico, S.chcat)) || { nombre: "Ficha" }).nombre.split(",")[0], tests: `Tests de ${S.tcat}`, docs: `Documentos de ${S.dcat}`, doclista: S.ddoc && docDe(S.ddoc).nom, toma: S.ttest && testDe(S.ttest).nom,
      asistencia: "Todas las categorías", asis: S.acat, lista: `Lista de ${S.acat}`, chicos: `Los chicos de ${S.acat}` })[S.ver] || "Volver";
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
  let listaAbierta = null; // la lista que estaba en pantalla: si se deja con cambios sin guardar, se avisa
  let eqAbierto = null; // lo mismo con el equipo de un partido y lo contado
  function render() {
    if (listaAbierta && S.ver !== "lista") {
      const { cat, fecha } = listaAbierta, d = ASIS.cats[cat], s = (d && sesiones(d, fecha, fecha)[0]) || { fecha, lista: null };
      if (sinGuardar(cat, s)) avisar("ojo", `La lista de ${cat} del ${diaMes(fecha)} quedó sin guardar`);
    }
    listaAbierta = S.ver === "lista" ? { cat: S.acat, fecha: S.afecha } : null;
    if (eqAbierto && S.ver !== "equipo") {
      const { cat, fecha } = eqAbierto, p = pendientes(), k = `${cat}|${fecha}`;
      if (cntSinGuardar(cat, fecha) && !p.includes(`cnt:${k}`)) { if (navigator.onLine === false) ponerPend(`cnt:${k}`, true); else guardarCntSolo(cat, fecha); }
      if (eqSinGuardar(cat, fecha) && !p.includes(`eq:${k}`)) { clearTimeout(EQ_T[k]); if (navigator.onLine === false) ponerPend(`eq:${k}`, true); else guardarEqSolo(cat, fecha); }
    }
    eqAbierto = S.ver === "equipo" ? { cat: S.eqcat, fecha: S.eqfecha } : null;
    // la misma pantalla que se vuelve a dibujar (llegaron datos): el campo en el que se estaba escribiendo sigue con el foco
    const f = document.activeElement, sigue = f && f.id && /^(INPUT|TEXTAREA)$/.test(f.tagName) && $("#vista").contains(f) && $("#vista").dataset.pantalla === S.ver
      ? { id: f.id, a: f.selectionStart, b: f.selectionEnd } : null;
    // todo el ancho en la compu (y el pie se alinea con eso); la tabla de estadísticas no, que queda muy estirada
    $("#app").classList.toggle("app--ancha", S.ver === "inicio" || S.ver === "partidos" || S.ver === "plan" || S.ver === "pase" || (S.ver === "equipo" && !S.eqn) || S.ver === "tests" || S.ver === "docs" || S.ver === "chico" || (S.ver === "area" && S.area !== "estadisticas"));
    GRAF.pend = [];
    soltarVideos();
    $("#vista").dataset.pantalla = S.ver; // ojo: no "data-ver", que es el de los botones "Ver todos"
    $("#vista").dataset.cnt = S.ver === "equipo" && S.eqcontar ? "1" : "";
    document.title = S.ver === "inicio" ? "Los 50 · Entrenadores" : `${tituloDe()} · Los 50 Entrenadores`;
    ({ inicio: vInicio, cat: vCategoria, club: vClub, consejos: vConsejos, guia: vGuia, cantos: vCantos, scrum: vScrum, ejercicios: vEjercicios, ejercicio: vEjercicio, puestos: vPuestos, puesto: vPuesto, practicas: vPracticas, practica: vPractica,
      asistencia: vAsistencia, asis: vAsis, lista: vLista, chicos: vChicos, area: vArea, plan: vPlan, partidos: vPartidos, guiaclub: vGuiaClub, pase: vPase, alertas: vAlertas, notas: vNotas, equipo: vEquipo, tests: vTests, toma: vToma, docs: vDocs, doclista: vDocLista, chico: vChico })[S.ver]();
    if (S.aviso && !$("#vista .aviso")) $("#vista").insertAdjacentHTML("beforeend", avisoHTML());
    ubicarAviso();
    dibujarGraficos();
    ponerFotos();
    document.querySelectorAll("#vista [data-form]").forEach((b) => { if (b.dataset.form) b.setAttribute("aria-expanded", S.aform === b.dataset.form); });
    const g = sigue && document.getElementById(sigue.id);
    if (g) { g.focus({ preventScroll: true }); try { g.setSelectionRange(sigue.a, sigue.b); } catch (e) { /* campos sin cursor */ } }
  }
  /** sección desplegable: arranca cerrada y recuerda si la abriste (al ordenar o "ver todos" no se cierra).
      Con "dato" se muestra a la derecha del título el número principal de adentro ("18 partidos", "78% volvió"). */
  const desple = (id, titulo, contenido, dato = "") =>
    `<details class="mas mas--grande" data-sec="${id}"${S.abiertos.has(id) ? " open" : ""}><summary><span class="mas__tit">${titulo}</span>${dato ? `<span class="mas__dato num">${dato}</span>` : ""}</summary><div class="mas__in">${contenido}</div></details>`;
  /** al lado de la respuesta: si fue mejor o peor que lo normal (el promedio de todos los años), con lo normal entre paréntesis */
  const tendencia = (dif, umbral, normal) => dif > umbral ? `<p class="tend tend--mejor">${IC.sube}Mejor que lo normal (${normal})</p>`
    : dif < -umbral ? `<p class="tend tend--peor">${IC.baja}Peor que lo normal (${normal})</p>` : `<p class="tend">Como lo normal (${normal})</p>`;
  /** ir a una de las pantallas principales: sin categoría, filtros ni formularios abiertos */
  const LIMPIO = { ncat: null, alcat: null, cat: null, temp: null, gcat: null, tab: null, rol: null, para: null, qe: "", pgrupo: null, qp: "", aform: null, aviso: null, eqcontar: false };
  /** "Volver": lleva a la pantalla de la que se vino y dice cuál es ("‹ M13"), igual que el botón atrás del celular.
      Si no hay de dónde (se recargó sin historial), va a la de arriba ("txt"; "a" es la pantalla o los cambios) sin sumar un paso */
  const hayAtras = () => !!(history.state && history.state.n > 0);
  let SUBIR = null;
  const volver = (txt = "Inicio", a = "inicio") => {
    const a11y = '<span class="sr">Volver a </span>';
    if (hayAtras()) return `<button type="button" class="volver" data-atras>${IC.atras}<span class="volver__txt">${history.state.desde ? a11y + esc(history.state.desde) : "Volver"}</span></button>`;
    SUBIR = typeof a === "string" ? { ver: a, ...LIMPIO } : a;
    return `<button type="button" class="volver" data-subir>${IC.atras}<span class="volver__txt">${a11y}${txt}</span></button>`;
  };
  /** después de guardar o borrar, vuelve a la pantalla de antes (si no hay, a "alt") */
  const volverAtras = (alt) => (hayAtras() ? history.back() : irSinPaso(alt));

  // ---------- ayuda: el "?" al lado de un título abre la explicación (en el celular sale desde abajo) ----------
  // así la pantalla queda limpia: el número y la frase que lo dice en palabras quedan a la vista, el "cómo se lee" va acá
  const AYUDA = {
    categorias: () => ["Las categorías", ["Tocá una categoría para ver cómo le fue, sus jugadores y sus tries.",
      `Los números son de ${D.hasta}: los partidos oficiales que están cargados en la página de la UAR.`]],
    equipo: () => ["El equipo del partido", ["Tocá cada número para elegir quién juega: en la cancha los titulares, abajo los suplentes.",
      "Se guarda solo y lo ven los otros entrenadores. Sin señal queda en el celular y se manda cuando vuelve.",
      "En rojo, los que no deberían jugar: sancionados o lesionados. En amarillo, los que no tienen la ficha médica (hay que pedírsela).",
      "“Mandar al grupo” manda la imagen del equipo por WhatsApp."]],
    jugados: () => ["Jugados, sin resultado", ["Los partidos que ya se jugaron y todavía no tienen resultado: los de la UAR hasta que lo cargue, los amistosos hasta que cargues cómo salió.",
      "Ahí está su equipo y lo que se contó."]],
    partidosCats: () => ["¿Qué categoría?", ["Debajo de cada categoría, el día de su próximo partido.",
      "En “Todas las categorías”, los partidos de todo el club juntos."]],
    chico: () => ["La ficha", ["Todo lo que hay de este chico en un lugar: cuánto viene a entrenar, sus partidos oficiales, sus tests, sus papeles, en qué equipos está y lo que se contó en los partidos.",
      "Los partidos y las tarjetas salen de las planillas de la UAR; lo demás, de lo que cargan los entrenadores en esta app."]],
    corregir: () => ["Corregir lo contado", ["Cada toque en un botón le saca uno a ese jugador (el número es lo que tiene ahora).",
      "Si sacaste de más, “Deshacer” lo devuelve. Cuando termines, “Listo” vuelve a contar."]],
    quienEntro: () => ["¿Quién entró?", ["Elegí al chico que entró y no estaba en el equipo: queda en el primer número libre del banco y ya lo podés contar.",
      "Si subió de otra categoría, buscalo por el nombre."]],
    comoSalio: () => ["Cómo salió", ["Los tackles bien hechos de todos los intentados, los lines y scrums ganados con nuestra pelota, y cada jugador.",
      "Si es un partido de la UAR, el resultado que cargó un entrenador queda como provisorio hasta que la UAR lo cargue. “Mandar al grupo” lo manda por WhatsApp."]],
    comoVa: () => ["Cómo va", ["Los tackles bien hechos de todos los intentados, los lines y scrums ganados con nuestra pelota, y cada jugador.",
      "Si escribís el tanteador, va en el mensaje al grupo. Cuando termina, “Terminó: es el resultado final” lo guarda (si es de la UAR, provisorio hasta que la UAR lo cargue)."]],
    contar: () => ["Contar el partido", ["En cada jugador: el tilde cuando hace un tackle bien y la cruz cuando lo erra. En “Line y scrum”, los ganados y los perdidos cuando la pelota es nuestra; en “Contactos y más”, contactos, rucks, pases, quiebres de línea y pelotas recuperadas.",
      "Si te equivocás, “Deshacer” saca el último toque; “Corregir” (abajo) saca uno de cualquier jugador. Si entra un chico que no estaba, “Sumar a uno que entró”.",
      "Se guarda solo, también sin señal (se manda cuando vuelve). Pueden contar dos a la vez: se suma todo.",
      "“Cómo va” muestra el resultado, el porcentaje de tackles bien hechos y el line y el scrum, para mandarlo al grupo."]],
    docs: () => ["Documentos y cursos", ["Para saber quién tiene al día los papeles que pide la UAR y quién hizo los cursos.",
      "La ficha médica y la autorización son de cada año: el año que viene arrancan vacías. El DNI y los cursos quedan marcados.",
      "La autorización de los padres no se pide en el plantel superior; los cursos y la acreditación de primera línea, no en infantiles."]],
    docsFaltan: () => ["A quién le falta", ["Cada chico con lo que le falta entregar.",
      "Solo cuenta lo que ya se empezó a marcar en la categoría: si nadie tiene marcado el DNI, no aparece como que falta.",
      "La acreditación de primera línea solo se pide a pilares y hookers (los que jugaron de 1, 2 o 3 o lo dice su ficha de la UAR)."]],
    docLista: () => ["Cómo marcar", ["Tocá a cada chico que ya lo tiene: queda en verde. Si te equivocás, tocalo de nuevo.",
      "Lo que marcás queda en el celular hasta que tocás “Guardar”. Si dos marcan a la vez, no se pisan: se guarda lo que cambió cada uno."]],
    tests: () => ["Tests físicos", ["Se toman dos veces al año, en marzo y en septiembre, como en las academias de la UAR: 10 metros, 30 metros (forwards), 40 metros (backs), salto horizontal y Bronco. El salto vertical, si hay una app para medirlo.",
      "Para cargar, tocá un test y anotá el resultado de cada chico. Lo que cargás queda en el celular hasta que tocás “Guardar”: no se pierde si en la cancha no hay señal."]],
    testsColor: () => ["Los colores", ["Cada chico se compara con los de su categoría ese mismo día: el tercio mejor en verde, el del medio en amarillo y el de abajo en rojo. Con menos de 6 chicos no hay color.",
      "Las referencias de la UAR son de M18 en adelante (están en Guía del club → Los puestos → Tests físicos). Para los más chicos sirve más compararlos entre ellos y con ellos mismos.",
      "Si un chico ya tenía una toma anterior de ese test, abajo de su nombre dice si mejoró o empeoró."]],
    toma: () => ["Cómo cargar", ["10, 30 y 40 metros: en segundos, por ejemplo 1,85. Salto horizontal: en metros (2,10) o en centímetros (210). Salto vertical: en centímetros.",
      "Bronco: en minutos y segundos, por ejemplo 5,20 o 5:20 (5 minutos y 20 segundos).",
      "Al que no hizo el test, dejalo vacío. Si un número no tiene sentido para ese test, se marca en rojo y no se guarda hasta corregirlo."]],
    notas: () => ["Notas", ["Para dejarles un mensaje corto a los otros entrenadores: lo que salió bien, lo que habría que cambiar, algo que viste en un entrenamiento o en un partido.",
      "Las notas las puede leer cualquiera que entre con la clave. Quedan guardadas para siempre.", "Podés borrar solo las que escribiste vos, desde este mismo celular."]],
    asistencia: () => ["Asistencia", ["Para tomar lista en cada entrenamiento y ver cuánto viene cada chico.",
      "El porcentaje es sobre los entrenamientos de este año en los que se tomó lista. Los suspendidos no cuentan.",
      "La lista de chicos arranca con los fichados en la UAR para este año. Cada entrenador puede sumar o sacar chicos.",
      "Lesionado: vino pero no entrena. Arriba de la lista elegí “Lesionado” y tocalo. Ese día no le cuenta en el porcentaje.",
      "Si dos categorías entrenan juntas (M15 y M16, por ejemplo), en la lista de una tocá “Tomar las dos listas juntas”: se marca a todos en una sola lista y se guarda cada una por su lado.",
      "Si un chico que venía faltó a los últimos 3 entrenamientos, aparece en “Para mirar” para que lo llamen."]],
    asisCat: () => ["Cómo se lee", ["Al lado de cada chico: a cuántos entrenamientos vino, de los que se tomó lista.",
      "Verde: viene el 80% o más. Amarillo: entre 60% y 80%. Rojo: menos del 60%. Los que menos vienen están arriba.",
      "Los entrenamientos suspendidos no cuentan, y un día que no se tomó lista tampoco. Un chico sumado a mano cuenta desde el día que se sumó.",
      "El porcentaje de cada chico aparece desde la tercera lista: con menos, los números engañan.",
      "Cuenta solo este año: cada temporada arranca de cero (las listas de antes quedan guardadas).",
      "Lo que se carga acá (listas, días, suspendidos) lo ven todos los entrenadores."]],
    nunca: () => ["Nunca vinieron", ["Son chicos de la lista que no vinieron a ninguno de los entrenamientos con lista. Muchas veces son fichados de la UAR que ya no juegan.",
      "Si ya no vienen, tocá “Ya no viene”. Si siguen en el equipo, tocá “Sigue”.",
      "Hasta que se conteste, no cuentan en el porcentaje de la categoría."]],
    perfilCuerpo: () => ["Cómo es el cuerpo", ["Es el perfil corporal de los Pumas para cada puesto, del área de nutrición de la UAR.",
      "Masa ósea y masa muscular, en kilos. El índice músculo-óseo es la masa muscular dividida por la ósea.",
      "Son medidas de jugadores adultos: en juveniles sirven para ver hacia dónde va el cuerpo de cada puesto, no como meta."]],
    perfilFisico: () => ["Tests físicos", ["Son los valores del Plan de Alto Rendimiento de la UAR para cada puesto y edad (M18, M20 y Senior).",
      "Mínimo: el piso. Objetivo bajo y objetivo alto: los dos niveles que se buscan. En fuerza, el objetivo es un múltiplo del peso del jugador (1,1 × peso = 1,1 veces lo que pesa).",
      "Salen de los tests de más de 2.000 jugadores entre 2013 y 2020: el rojo es por debajo del 27% de ese grupo y el verde, por encima del 73%.",
      "En el Bronco, menos tiempo es mejor. Son valores de 18 años en adelante: para M13 a M16 no hay."]],
    pase: () => ["De M19 a plantel superior", ["Cuenta los chicos que jugaron al menos un partido oficial en M19 en cada año y mira qué hicieron la temporada siguiente.",
      "“Jugaron en plantel superior”: jugaron en Primera, Intermedia o Pre-Intermedia. “No volvieron a jugar”: no aparecen en ninguna planilla del club ese año (pueden seguir entrenando o haberse ido).",
      "“Llegaron al club”: su primer fichaje en Los 50 fue ese año o el anterior. En 2020 no hubo partidos: de 2019 se pasa a 2021. La temporada en curso no terminó, así que el número todavía puede subir.",
      "Los datos empiezan en 2017 y salen de las planillas oficiales de la UAR."]],
    alertas: () => ["Para mirar", ["Sale de los listados y las planillas de la UAR, que se actualizan lunes, martes y miércoles.",
      "Importante: sanción vigente, conmoción sin alta y roja de los últimos 21 días. Para tener en cuenta: 2 o más amarillas en los últimos 60 días.",
      "Lo que ya se habilitó o ya pasó, no aparece."]],
    dibujo: () => ["El dibujo", ["Se dibuja como en las fichas de World Rugby: la cancha vista desde arriba. El ataque va hacia arriba; en line y maul, el lateral es el borde de la izquierda.",
      "Azul: ataque. Rojo: defensa. Flecha llena: carrera. Flecha punteada: pase (y si es curva, patada).",
      "Si son varios cuadros, es el ejercicio paso a paso: 1, 2, 3.",
      "“Para revisar”: es un primer dibujo hecho a partir de lo que está escrito; falta que Coordinación lo confirme."]],
    proximos: () => ["Próximos partidos", ["Los que cargó la UAR, con el día y la hora (la cancha no la dice). Se actualiza los lunes, martes y miércoles.",
      "Los amistosos los sumás vos, con “Sumar un amistoso”.",
      "Tocá “Equipo” en cada partido para elegir quién juega y mandarlo al grupo. El día del partido aparece “Contar el partido” y, cuando empieza, “Cargar el resultado”."]],
    ultimos: () => ["Últimos resultados", [`Datos al ${D.act}.`,
      "Si un partido del fin de semana no aparece, es porque todavía no cargaron su planilla en la página de la UAR.",
      "Primero va el local: de visitante, Los 50 está a la derecha. El resultado va en el mismo orden.",
      "Los amistosos aparecen acá cuando les cargás el resultado."]],
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
      S.gcat && !esInf(S.gcat) ? "Arriba, en pocas palabras, lo que tiene que lograr la categoría y sus palabras clave; abajo, el detalle de cada parte del juego."
        : "Las frases de arriba son las frases guía: lo que el chico tiene que poder decir y hacer en esta categoría."]],
    cantos: () => ["Cantos y zonas", ["Los cantos del club con lo que quiere decir cada uno, las zonas y los canales de la cancha, y el modelo de juego.",
      "Sale del material de la Coordinación de Rugby del club (Magali Fazzi), 2026."]],
    scrum: () => ["Scrum seguro", ["Qué se puede hacer en cada edad, cómo se enseña, el set up del club, la entrada y el empuje.",
      "En Sesiones: las sesiones de scrum que planificó la Coordinación para M13 a M19, en el orden en que se hicieron. Muestran cómo se va sumando de a poco, hasta llegar al set up.",
      "Sale del protocolo y del plan de scrum de la Coordinación de Rugby del club (Magali Fazzi), 2026."]],
    ejercicios: () => ["Ejercicios", ["Los ejercicios de line y maul de la Coordinación de Rugby (Magali Fazzi) y los juegos que más usan los entrenadores de infantiles en sus planificaciones.",
      "Los de line están en orden, de lo más fácil a lo más difícil para cada rol.", "Tocá uno para ver cómo se hace, en qué fijarse y qué material hace falta."]],
    plan: () => ["Planificación", ["Las prácticas las escriben los coordinadores en sus planillas del Drive de Coordinación y la app las toma de ahí. Si falta una, pedísela al que escribe las de tu categoría (el nombre está en cada práctica).",
      "Esta semana: los días que entrena la categoría (los de Asistencia; si no hay, los que suele entrenar), con la práctica de cada día. Hoy, marcado en azul.",
      "“Sin práctica”: ese día todavía no hay práctica en la planilla. Debajo de la semana queda la última que se escribió, para repetirla o seguir desde ahí.",
      "“Cómo salió” y “La semana pasada”: lo que anotaron en Asistencia ese día o el mismo día de la semana anterior.",
      "La temporada: todas las prácticas del año, mes por mes."]],
    planCats: () => ["¿Qué categoría?", ["Debajo de cada categoría, el día de su última práctica escrita. Con el signo de atención, las que no tienen ninguna en las últimas dos semanas.",
      "Las prácticas las escriben los coordinadores en las planillas del Drive de Coordinación."]],
    practica: () => ["La práctica", ["Está como la escribió el coordinador en su planilla.",
      "A la izquierda, los minutos de cada actividad. Arriba, en azul, para qué es; abajo, qué se hace y cómo. Si es un juego de la app, “Ver cómo se juega” lleva a su ficha.",
      "G1, G2…: los grupos en que se divide el plantel. FW: forwards. BK: backs.",
      "Arriba, las flechas llevan a la práctica del día anterior y a la del día siguiente."]],
    practicas: () => ["Prácticas", ["Las prácticas que escribieron los coordinadores del club en 2026, día por día, en las planillas de Coordinación.",
      "Sirven para repetir una que salió bien o para ver cómo se arma una práctica en el club: entrada en calor, destrezas, juego integrado y cierre.",
      "Están como las escribieron. Adentro de cada una, con el botón de abajo se manda por WhatsApp."]],
    puestos: () => ["Los puestos", ["Lo que el club espera de cada puesto, del 1 al 15: qué tiene que saber hacer, lo mental y lo ideal en un partido.",
      "Sale del perfil del jugador de la Coordinación de Rugby del club (Magali Fazzi)."]],
    partidoPuesto: () => ["En un partido", ["Lo ideal para este puesto en un partido entero: por ejemplo, cuántos tackles tiene que hacer.",
      "Sirve para mirar los videos de los partidos y ver si el jugador llega.",
      "Rucks en ataque: las veces que entra a un ruck cuando el equipo tiene la pelota. Contactos: las veces que lleva la pelota al choque. Quiebres: las veces que pasa la línea de defensa. Recuperadas: las pelotas que le gana al rival."]],
    medir: () => ["Qué empezar a medir", ["Son datos que las planillas de la UAR no tienen y que sirven para saber si los chicos mejoran.",
      "Tocá cada uno para ver qué medir, cada cuánto, quién y cómo."]],
  };
  const ayudaBtn = (k) => `<button type="button" class="ayuda-btn" data-ayuda="${k}" aria-haspopup="dialog" aria-label="Qué quiere decir: ${esc(AYUDA[k]()[0])}">?</button>`;
  /** el "?" va pegado a la última palabra del título (si no, en el celular puede quedar solo en un renglón) */
  const conAyuda = (texto, k) => (k ? texto.replace(/(\S+)$/, (w) => `<span class="junto">${w}${ayudaBtn(k)}</span>`) : texto);
  const cabTit = (texto, k) => `<h2 class="cab__cat">${conAyuda(texto, k)}</h2>`;
  const tit = (texto, k) => `<div class="tit"><h2 class="h2">${conAyuda(texto, k)}</h2></div>`;
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
  /** una opción de menú: ícono, nombre, una línea que dice qué hay y la flecha (mismo estilo que las filas de categoría).
      opcionDe lleva el atributo entero (para ir a una práctica, a la guía de una categoría…); opcion va a una pantalla */
  const opcionDe = (attr, ic, nom, que) => `<li><button type="button" class="menu__it" ${attr}><span class="menu__ic">${ic}</span>
    <span class="menu__txt"><b>${nom}</b><small>${que}</small></span>${IC.adelante}</button></li>`;
  const opcion = (ir, ic, nom, que) => opcionDe(`data-ir="${ir}"`, ic, nom, que);

  // las categorías como una tabla de posiciones: una fila por categoría, con ganados, empatados y perdidos
  // en los mismos colores que adentro de la categoría. Toda la fila se toca.
  function filaCatHTML(cat, conUltimo) {
    const r = filasCat(cat).at(-1), u = conUltimo && D.partidos.find((x) => x.cat === cat);
    const n = (k, v) => `<span class="fila-cat__n fila-cat__n--${k}${v ? "" : " fila-cat__n--cero"} num">${v}</span>`;
    return `<li><button type="button" class="fila-cat" data-ir-cat="${esc(cat)}"
      aria-label="${esc(cat)}, ${r["Año"]}: ${pl(r.PJ, "partido", "partidos")}. Ganó ${r.G}, empató ${r.E}, perdió ${r.P}">
      <span class="fila-cat__nom">${esc(cat)}<small>${u ? `Último: ${({ G: "ganó", E: "empató", P: "perdió" })[u.res]} ${u.pf}–${u.pc}`
        : `${r["Año"] !== D.hasta ? `${r["Año"]} · ` : ""}${pl(r.PJ, "partido", "partidos")}`}</small></span>
      ${n("g", r.G)}${n("e", r.E)}${n("p", r.P)}${IC.adelante}</button></li>`;
  }
  const tablaCats = (titulo, cats, conUltimo) => `<div class="grupo-cat">
      <div class="grupo-cat__cab"><h3 class="grupo-cat__tit">${titulo}</h3><span aria-hidden="true">Ganó</span><span aria-hidden="true">Empató</span><span aria-hidden="true">Perdió</span></div>
      <ul class="filas-cat">${cats.map((c) => filaCatHTML(c, conUltimo)).join("")}</ul></div>`;

  // ---------- el inicio: primero qué querés hacer, después la categoría ----------
  // Seis áreas, una por cosa que hace un entrenador. Asistencia, Planificación y Partidos piden la categoría
  // (con botones grandes; queda marcada la última que elegiste); Estadísticas muestra la tabla de categorías;
  // Ejercicios y la Guía del club son iguales para todos.
  const AREAS = { asistencia: "Asistencia", planificacion: "Planificación", partidos: "Partidos", estadisticas: "Estadísticas", tests: "Tests físicos", docs: "Documentos" };
  const AREA_IR = (a) => ({ ver: "area", area: a, ...LIMPIO });
  /** la última categoría que se eligió en cada área (queda en el celular) */
  const claveArea = (a) => `los50-ent-cat:${a}`;
  /** las categorías de la UAR (partidos y números) de una categoría: el plantel superior son varias; los infantiles, ninguna */
  const catsUAR = (c) => (c === "Plantel superior" ? PS : [c]).filter((x) => D.cats.includes(x));
  /** una tarjeta grande: ícono, nombre y una línea */
  const botonArea = (attr, ic, nom, que, cls = "") => `<button type="button" class="area${cls}" ${attr}><span class="area__ic">${ic}</span>
    <span class="area__txt"><b>${nom}</b><small>${que}</small></span></button>`;
  const tarjeta = (...a) => `<li>${botonArea(...a)}</li>`;

  function vInicio() {
    // si la última categoría en la que tomaste lista entrena hoy, la tarjeta de Asistencia lo dice
    const ult = D.fichados && enCel.get(ULTIMA), d = ult && ASIS_CATS.includes(ult) ? ASIS.cats[ult] : null;
    if (ult && ASIS_CATS.includes(ult) && !d && !ASIS.error[ult]) cargarAsis(ult);
    // el resumen de todas: trae a los que dejaron de venir de cada categoría (para "Para mirar")
    if (D.fichados && !ASIS.resumen && !ASIS.error["*"] && Date.now() - (ASIS.ts["*"] || 0) > 60000) cargarAsis();
    const s = d && sesiones(d, hoyISO(), hoyISO())[0], hoy = s && s.estado !== "cancelado";
    const g = D.guia;
    // el día del partido: el de tu categoría, arriba de todo (un toque para el equipo y para contar)
    if (D.fichados && !EQ.lista && !EQ.error) cargarEquipos();
    const yo = enCel.get(claveNombreNota), enPartidos = enCel.get(claveArea("partidos")), deEq = (EQ.lista || []).filter((x) => yo && x.por === yo).map((x) => x.cat);
    const misCats = [...new Set([...D.prox.map((x) => x.cat), ...(EQ.lista || []).map((x) => x.cat)])]
      .filter((c) => (ult && eqAsis(c) === ult) || (enPartidos && enPartidos !== "Todas" && catsUAR(enPartidos).includes(c)) || deEq.includes(c));
    const juega = misCats.length ? [...proxTodos().filter((x) => x.fecha === hoyISO() && misCats.includes(x.cat)), ...(EQ.lista ? amistosos(misCats, true).filter((x) => x.fecha === hoyISO()) : [])][0] : null;
    // si todavía no se sabe cuál es tu categoría: las que juegan hoy, para elegir
    const hoyHay = juega || misCats.length ? [] : [...new Set(proxTodos().filter((x) => x.fecha === hoyISO() && eqAsis(x.cat)).map((x) => x.cat))];
    const ij = juega && eqInfo(juega.cat, juega.fecha), rfh = juega && (D.partidos.find((p) => p.cat === juega.cat && p.fecha === juega.fecha) || (ij.pf !== "" && ij.pf != null ? { pf: +ij.pf, pc: +ij.pc } : null));
    const enJuego = juega && !rfh && empezo(juega) && Object.keys(eqActual(juega.cat, juega.fecha).jugadores).length > 0;
    const provH = rfh && !D.partidos.some((p) => p.cat === juega.cat && p.fecha === juega.fecha) && !ij.amistoso;
    const resHoy = rfh ? `${rfh.pf > rfh.pc ? "Ganó" : rfh.pf < rfh.pc ? "Perdió" : "Empató"} ${rfh.pf}–${rfh.pc}${provH ? " (provisorio)" : ""}` : "";
    $("#vista").innerHTML = `
      <div class="cab">${cabTit("¿Qué querés hacer?")}</div>${avisoHTML()}
      ${juega ? `<section class="sec sec--pegada"><button type="button" class="hoy-juega" data-ir-${resHoy ? "salio" : enJuego ? "contar" : "equipo"}="${esc(juega.cat)}|${juega.fecha}">${IC.trofeo}<span class="hoy-juega__txt"><b>${resHoy ? `Hoy jugó ${esc(juega.cat)}` : enJuego ? `Jugando ahora: ${esc(juega.cat)}` : `Hoy juega ${esc(juega.cat)}`}</b><small>${resHoy ? `${esc(resHoy)} vs ${esc(nombreRival(juega.rival))}` : `vs ${esc(nombreRival(juega.rival))}${juega.hora ? ` · ${esc(juega.hora)}` : ""} · ${dondeTxt(juega)}`}</small></span><span class="hoy-juega__acc">${resHoy ? "Mandar cómo salió" : enJuego ? "Contar el partido" : "El equipo y contar"}${IC.adelante}</span></button>${!resHoy && porTerminar(juega) ? `<button type="button" class="btn-sec btn-sec--ancho hoy-juega__res" data-ir-res="${esc(juega.cat)}|${juega.fecha}">${IC.trofeo}¿Terminó? Cargar el resultado</button>` : ""}</section>`
        : hoyHay.length ? `<section class="sec sec--pegada"><button type="button" class="hoy-juega" data-area="partidos">${IC.trofeo}<span class="hoy-juega__txt"><b>Hoy hay partido</b><small>${esc(hoyHay.join(" · "))}</small></span><span class="hoy-juega__acc">Elegí tu categoría${IC.adelante}</span></button></section>` : ""}
      ${alertasInicio()}
      <section class="sec sec--pegada"><ul class="areas areas--6">
        ${!D.fichados ? "" : !hoy ? tarjeta('data-area="asistencia"', IC.lista, "Asistencia", "Tomar lista")
          : `<li class="area-li">${botonArea(`data-ir-hoy="${esc(ult)}|${hoyISO()}"`, IC.lista, "Asistencia", `Hoy entrena ${esc(ult)}${s.hora ? ` · ${esc(s.hora)}` : ""}${sinGuardar(ult, s) ? " · lista sin guardar" : ""}`, " area--hoy")}
            <button type="button" class="link area__otra" data-area="asistencia">Otra categoría</button></li>`}
        ${g ? tarjeta('data-area="planificacion"', IC.calendario, "Planificación", "Prácticas y objetivos") : ""}
        ${g && g.ejercicios ? tarjeta('data-ir="ejercicios"', IC.cono, "Ejercicios", "Line, maul y juegos") : ""}
        ${tarjeta('data-area="partidos"', IC.trofeo, "Partidos", "Próximos y resultados")}
        ${tarjeta('data-area="estadisticas"', IC.barras, "Estadísticas", "Números y jugadores")}
        ${g ? tarjeta('data-ir="guiaclub"', IC.libro, "Guía del club", "Puestos, scrum y cantos") : ""}
        ${D.fichados ? tarjeta('data-area="tests"', IC.reloj, "Tests físicos", "10 m, salto y Bronco") : ""}
        ${D.fichados ? tarjeta('data-area="docs"', IC.doc, "Documentos", "Ficha médica y cursos") : ""}
        ${D.fichados ? tarjeta('data-ir="notas"', IC.nota, "Notas", "Lo que viste en los entrenamientos") : ""}
      </ul></section>`;
  }

  // ---------- la ficha de un chico: todo lo que hay de él en un lugar (como Kitman Labs o Smartabase) ----------
  // Asistencia, partidos de la UAR, tests, papeles, en qué equipos está y lo contado en los partidos. Se abre tocando su nombre
  // (en Asistencia, en los tests, en Documentos o en "Quiénes jugaron").
  /** el chico: de los fichados (con su categoría) o uno sumado a mano en la asistencia de esa categoría */
  function chicoDe(id, cat) {
    const f = D.fichados && eqTodos().get(id);
    if (f) return f;
    const d = cat && ASIS.cats[cat], c = d && d.chicos.find((x) => x.id === id);
    return c ? { id, nombre: c.nombre, cat } : null;
  }
  let POR_NOMBRE = null;
  const idPorNombre = (n) => (POR_NOMBRE ??= new Map([...eqTodos().values()].map((c) => [claveNombre(c.nombre), c.id]))).get(claveNombre(n)) || null;
  /** el nombre que lleva a la ficha */
  const linkChico = (id, nombre, cat) => `<button type="button" class="link-chico" data-ir-chico="${esc(id)}|${esc(cat || "")}">${nombreHTML(nombre)}</button>`;
  /** en "Quiénes jugaron": el nombre lleva a la ficha si el chico está fichado este año */
  const jugLink = (j) => {
    const id = D.fichados ? (eqTodos().has(String(j.pid)) ? String(j.pid) : idPorNombre(j.nombre)) : null;
    return id ? linkChico(id, j.nombre, eqTodos().get(id).cat) : nombreHTML(j.nombre);
  };
  function vChico() {
    const id = S.chico, cat = S.chcat;
    if (cat && !ASIS.cats[cat] && !ASIS.error[cat]) cargarAsis(cat);
    if (cat && testCats().includes(cat) && !TST.cats[cat] && !TST.error[cat]) cargarTests(cat);
    if (!DOC.lista && !DOC.error) cargarDocs();
    if (!EQ.lista && !EQ.error) cargarEquipos();
    if (!CNT.lista && !CNT.error) cargarConteos();
    const c = chicoDe(id, cat), espera = `<p class="cargando">Cargando…</p>`, nada = (t) => `<p class="vacio-g">${t}</p>`;
    if (!c) {
      $("#vista").innerHTML = `<div class="cab">${volver()}${cabTit("Ficha")}</div><section class="sec sec--pegada">${cat && !ASIS.cats[cat] && !ASIS.error[cat] ? espera : nada("No encontramos a este chico")}</section>`;
      return;
    }
    const [ape, nom = ""] = c.nombre.split(",").map((x) => x.trim()), a = alertasHoy().find((x) => claveNombre(x.j) === claveNombre(c.nombre));
    const caja = (t, cuerpo) => `<section class="ficha-c">${tit(t)}${cuerpo}</section>`;
    // cuánto viene a entrenar
    const d = cat && ASIS.cats[cat];
    let asis = cat && ASIS.error[cat] ? nada("No se pudo cargar la asistencia") : espera;
    if (d) {
      const act = chicosDe(cat, d).activos.find((x) => x.id === id);
      const p = act && porcentajes(d, [act])[0], ult = listasValidas(d).filter((l) => l.presentes.includes(id)).map((l) => l.fecha).sort().at(-1);
      asis = !act ? nada("Ya no está en la lista de asistencia") : !p.de ? nada("Todavía no hay listas este año")
        : `<div class="ficha-n">${porcHTML(p.pct, p.de >= 3)}<span>Vino a <b>${p.vino}</b> de ${p.de} entrenamientos este año${ult ? `<small>La última vez: ${corta(ult)}</small>` : ""}</span></div>`;
      const ul = listasValidas(d).filter((l) => l.fecha <= hoyISO()).sort((x, y) => x.fecha.localeCompare(y.fecha)).at(-1);
      if (act && ul && ul.presentes.includes(LES(id))) asis += `<p class="ficha-les">Estuvo lesionado en el último entrenamiento (${corta(ul.fecha)})</p>`;
    }
    // sus partidos oficiales (planillas de la UAR)
    const jr = D.jug.filter((j) => String(j.pid) === id || claveNombre(j.nombre) === claveNombre(c.nombre)).sort((x, y) => y.anio - x.anio || y.pj - x.pj);
    const tarj = (j) => [j.am ? `${j.am} amarilla${j.am > 1 ? "s" : ""}` : "", j.ro ? `${j.ro} roja${j.ro > 1 ? "s" : ""}` : ""].filter(Boolean).join(" · ") || "–";
    const part = jr.length ? `<div class="tabla-e-wrap"><table class="tabla-e"><thead><tr><th scope="col" class="izq">Temporada</th><th scope="col">Partidos</th><th scope="col">Tries</th><th scope="col">Tarjetas</th></tr></thead>
      <tbody>${jr.slice(0, 6).map((j) => `<tr><td class="izq"><span class="num">${j.anio}</span> · ${esc(j.cat)}</td><td>${j.pj}</td><td>${j.tries}</td><td>${tarj(j)}</td></tr>`).join("")}</tbody></table></div>`
      : nada("No jugó partidos oficiales de la UAR");
    // sus tests: el último de cada uno, en qué lugar quedó en la categoría y si mejoró
    let tests = "";
    if (cat && testCats().includes(cat)) {
      tests = TST.error[cat] ? nada("No se pudieron cargar los tests") : !TST.cats[cat] ? espera : TESTS.map((t) => {
        const tomas = tomasDe(cat, t.k).filter(([, m]) => m.has(id));
        if (!tomas.length) return "";
        const [f, m] = tomas[0], v = m.get(id), prev = tomas[1] && tomas[1][1].get(id), orden = [...m.values()].sort((x, y) => (t.menos ? x - y : y - x));
        const r = orden.indexOf(v), n = orden.length, col = n < 6 ? "gris" : r < n / 3 ? "verde" : r < (2 * n) / 3 ? "ambar" : "rojo";
        const dif = prev != null ? Math.round((v - prev) * 100) / 100 : 0, mejor = t.menos ? dif < 0 : dif > 0;
        return `<li class="test-f test-f--2"><span class="test-f__nom"><b>${t.nom}</b><small>${corta(f)} · ${r + 1}º de ${n}${dif
          ? ` · <span class="${mejor ? "test-f__mejor" : "test-f__peor"}">${mejor ? "mejoró" : "empeoró"} ${verValor(t, Math.abs(dif))} ${t.u}</span>` : ""}</small></span><span class="porc porc--${col} num">${verValor(t, v)}</span></li>`;
      }).join("");
      if (tests && !tests.startsWith("<p")) tests = `<ul class="test-r ficha-tests">${tests}</ul>`;
      if (!tests) tests = nada("Todavía no hizo tests");
    }
    // los papeles de su categoría
    const docs = DOC.error ? nada("No se pudieron cargar los documentos") : !DOC.lista ? espera
      : `<ul class="ficha-docs">${docsDe(cat).filter((x) => !x.primera || esPrimera(id)).map((x) => { const t = docTienen(x.k);
        return `<li class="${t.has(id) ? "si" : "no"}">${t.has(id) ? IC.tilde : IC.cruz}<span>${x.nom}${t.has(id) ? `<small>Desde el ${corta(t.get(id))}</small>` : "<small>Falta</small>"}</span></li>`; }).join("")}</ul>`;
    // los equipos armados donde está
    const eqs = (EQ.lista || []).flatMap((q) => Object.entries(q.jugadores).filter(([, x]) => x === id).map(([n]) => ({ ...q, n: +n }))).sort((x, y) => y.fecha.localeCompare(x.fecha)).slice(0, 5);
    const equipos = EQ.error ? nada("No se pudieron cargar los equipos") : !EQ.lista ? espera : !eqs.length ? nada("No está en ningún equipo armado")
      : `<ul class="ficha-l">${eqs.map((q) => `<li><b>${q.n <= 15 ? `Titular de ${q.n}` : `Suplente (${q.n})`}</b><small>${esc(q.cat)}${q.rival ? ` vs ${esc(q.rival)}` : ""} · ${corta(q.fecha)}</small></li>`).join("")}</ul>`;
    // lo contado en los partidos
    const pc = new Map();
    (CNT.lista || []).filter((r) => r.id === id).forEach((r) => { const k = `${r.cat}|${r.fecha}`; if (!pc.has(k)) pc.set(k, {}); pc.get(k)[r.accion] = r.n; });
    const sumado = {};
    pc.forEach((o) => Object.entries(o).forEach(([x, n]) => { sumado[x] = (sumado[x] || 0) + n; }));
    const conteos = CNT.error ? nada("No se pudo cargar lo contado") : !CNT.lista ? espera : !pc.size ? nada("Todavía no se contó ningún partido suyo")
      : `${tklPct(sumado) ? `<p class="cnt-pct">Tackles efectivos: <b>${tklPct(sumado)}</b></p>` : ""}<ul class="ficha-l">${[...pc].sort((x, y) => y[0].split("|")[1].localeCompare(x[0].split("|")[1])).slice(0, 6).map(([k, o]) => { const [qc, f] = k.split("|"), q = eqGuardado(qc, f) || eqPartido(qc, f);
        return `<li><b>${corta(f)} · ${esc(qc)}${q && q.rival ? ` vs ${esc(q.rival)}` : ""}</b><small>${[tklPct(o) && `${tklPct(o).replace(/^.* \((\d+ %)\)$/, "$1")} de tackles efectivos`, ...ACCIONES.filter(([x]) => o[x]).map(([x, , pl]) => `${o[x]} ${pl}`)].filter(Boolean).join(" · ")}</small></li>`; }).join("")}</ul>`;
    $("#vista").innerHTML = `
      <div class="cab">${volver()}${cabTit(esc(ape), "chico")}</div>
      <p class="titular eq-partido">${[nom && esc(nom), esc(cat || c.cat || ""), esc(eqJuegaTxt(id))].filter(Boolean).join(" · ")}</p>
      ${a ? `<ul class="eq-avisos"><li class="eq-avisos--${a.n}">${esc(a.t)}</li></ul>` : ""}
      <div class="ficha-g">
        ${caja("Asistencia", asis)}${caja("Partidos de la UAR", part)}
        ${tests ? caja("Tests físicos", tests) : ""}${caja("Documentos", docs)}
        ${caja("En los equipos", equipos)}${caja("Lo contado en los partidos", conteos)}
      </div>`;
  }

  // ---------- contar el partido (functions/api/asistencia.js, tabla "conteos" de D1) ----------
  // Como Statline o Rugby+: alguien desde el costado (un padre, un suplente) toca la camiseta cada vez que pasa.
  // Lo tocado queda en el celular al instante y se manda solo (a los 2 segundos, al salir de la pantalla y cuando vuelve la señal).
  // Se manda lo nuevo y no el total: dos que cuentan el mismo partido se suman. Un partido que ya pasó se abre en "Cómo salió".
  const ACCIONES = [["tackles", "Tackle", "tackles", "hace un tackle"], ["errados", "Tackle errado", "tackles errados", "erra un tackle"],
    ["contactos", "Contacto", "contactos", "lleva la pelota al contacto"], ["rucks", "Ruck", "rucks", "entra a un ruck"], ["pases", "Pase", "pases", "da un pase"],
    ["quiebres", "Quiebre", "quiebres", "quiebra la línea"], ["recuperadas", "Recuperada", "pelotas recuperadas", "recupera una pelota"]];
  // la formación fija se cuenta para el equipo (id "equipo"): line y scrum con nuestra pelota, ganados y perdidos
  const FIJA = [["line_g", "Line ganado"], ["line_p", "Line perdido"], ["scrum_g", "Scrum ganado"], ["scrum_p", "Scrum perdido"]];
  /** uno de cada cosa, para decirlo en una frase ("le sacaste un tackle errado") */
  const UNO_C = { tackles: "tackle", errados: "tackle errado", contactos: "contacto", rucks: "ruck", pases: "pase", quiebres: "quiebre de línea", recuperadas: "pelota recuperada", line_g: "line ganado", line_p: "line perdido", scrum_g: "scrum ganado", scrum_p: "scrum perdido" };
  /** "5 de 6 (83%)": cuántos salieron bien de los intentados */
  const deCuantos = (bien, mal) => (bien + mal ? `${bien} de ${bien + mal} (${Math.round((100 * bien) / (bien + mal))}%)` : "");
  /** los tackles bien hechos: los que salieron bien de todos los intentados (con los errados) */
  const tklPct = (o) => deCuantos(o.tackles || 0, o.errados || 0);
  const pctDe = (bien, mal) => (bien + mal ? Math.round((100 * bien) / (bien + mal)) : null);
  /** los nombres cortos de un grupo de chicos (la cancha, el contador y la imagen dicen lo mismo): el apellido y, si dos lo comparten, la inicial del nombre ("Garcia T.") */
  const nombresCortos = (ids, pl) => {
    const base = new Map(ids.map((id) => [id, apellido(eqQuien(id, pl).nombre)])), cuenta = {};
    base.forEach((a) => { cuenta[a] = (cuenta[a] || 0) + 1; });
    return (id) => { const a = base.get(id) || apellido(eqQuien(id, pl).nombre), n = (eqQuien(id, pl).nombre.split(",")[1] || "").trim(); return cuenta[a] > 1 && n ? `${a} ${n[0]}.` : a; };
  };
  /** "Line 5 de 6 · Scrum 3 de 4" */
  const fijaTxt = (k) => { const q = k.c.equipo || {}, t = (g, p, n) => (g + p ? `${n} ${g} de ${g + p}` : "");
    return [t(q.line_g || 0, q.line_p || 0, "Line"), t(q.scrum_g || 0, q.scrum_p || 0, "Scrum")].filter(Boolean).join(" · "); };
  /** lo de todo el equipo sumado (sin la formación fija) */
  const cntEquipo = (k) => { const t = {}; Object.entries(k.c).forEach(([id, o]) => { if (id !== "equipo") ACCIONES.forEach(([x]) => { t[x] = (t[x] || 0) + (o[x] || 0); }); }); return t; };
  const CNT = { lista: null, error: null, cargando: false, guardando: false, delCel: false };
  const cntClave = (cat, f) => `los50-conteo:${cat}|${f}`;
  const cntBorr = (cat, f) => { try { return JSON.parse(enCel.get(cntClave(cat, f)) || "null"); } catch (e) { return null; } };
  const hayAlgo = (d) => !!d && Object.values(d).some((o) => Object.values(o).some((n) => n));
  /** lo de un partido: c = lo guardado más lo que se tocó en este celular ({ id: { tackles: 3, … } }); h = los toques de esta visita (para deshacer).
      En el celular queda solo lo tocado desde el último envío (d) y lo que salió y todavía no se sabe si llegó (envio, con su código) */
  const cntActual = (cat, f) => {
    const b = cntBorr(cat, f) || {}, c = {};
    if (b.c) return { c: b.c, h: b.h || [], viejo: true }; // de la página anterior: lo contado entero (se manda así una vez)
    (CNT.lista || []).filter((r) => r.cat === cat && r.fecha === f).forEach((r) => { (c[r.id] ??= {})[r.accion] = r.n; });
    [b.envio && b.envio.d, b.d].forEach((d) => d && Object.entries(d).forEach(([id, o]) => Object.entries(o).forEach(([x, n]) => { const t = (c[id] ??= {}); t[x] = Math.max(0, (t[x] || 0) + n); })));
    return { c, h: b.h || [] };
  };
  const cntSinGuardar = (cat, f) => { const b = cntBorr(cat, f); return !!b && (!!b.c || !!b.envio || hayAlgo(b.d)); };
  /** un toque (n = 1) o deshacer uno (n = -1) */
  function cntSumar(cat, f, id, x, n, hist) { // hist: "quita" (se sacó en "Corregir": se puede deshacer) o "no" (deshaciendo)
    const b = cntBorr(cat, f) || { d: {}, h: [] };
    if (b.c) { const o = (b.c[id] ??= {}); o[x] = Math.max(0, (o[x] || 0) + n); } else { const o = ((b.d ??= {})[id] ??= {}); o[x] = (o[x] || 0) + n; }
    b.h = b.h || [];
    if (hist === "quita") b.h.push([id, x, "-"]); else if (n > 0 && hist !== "no") b.h.push([id, x]);
    if (b.h.length > 300) b.h.shift();
    enCel.set(cntClave(cat, f), JSON.stringify(b));
  }
  const nuevoLote = () => [...crypto.getRandomValues(new Uint8Array(12))].map((x) => x.toString(16).padStart(2, "0")).join("");
  /** lo que devolvió la base de un partido queda como lo guardado (y en la copia del celular, para verlo sin señal) */
  const CNT_AL = {}; // cuándo se actualizó cada partido con lo que devolvió un envío (una carga que salió antes no lo pisa)
  function ponerConteos(cat, f, filas) {
    CNT_AL[`${cat}|${f}`] = Date.now();
    CNT.lista = (CNT.lista || []).filter((r) => !(r.cat === cat && r.fecha === f)).concat(filas);
    enCel.set("los50-conteos", JSON.stringify(CNT.lista));
  }
  /** manda lo contado en este celular: lo que ya había salido va primero con su mismo código (si ya había llegado, no se suma dos veces) */
  async function mandarConteo(cat, f) {
    const por = enCel.get(claveNombreNota) || "";
    const b = cntBorr(cat, f);
    if (!b) return;
    if (b.c) {
      const conteos = {};
      Object.entries(b.c).forEach(([id, o]) => { const v = Object.fromEntries(Object.entries(o).filter(([, n]) => n > 0)); if (Object.keys(v).length) conteos[id] = v; });
      await apiD1({ accion: "conteo", equipo: cat, fecha: f, conteos, por });
      ponerConteos(cat, f, Object.entries(conteos).flatMap(([id, o]) => Object.entries(o).map(([accion, n]) => ({ cat, fecha: f, id, accion, n }))));
      enCel.set(cntClave(cat, f), JSON.stringify({ d: {}, h: [] }));
      return;
    }
    if (!b.envio) {
      if (!hayAlgo(b.d)) return;
      b.envio = { lote: nuevoLote(), d: b.d }; b.d = {};
      enCel.set(cntClave(cat, f), JSON.stringify(b));
    }
    const r = await apiD1({ accion: "conteo", equipo: cat, fecha: f, sumar: b.envio.d, lote: b.envio.lote, por });
    ponerConteos(cat, f, r.conteos || []);
    const ahora = cntBorr(cat, f) || {}; // lo que se tocó mientras se mandaba queda para el próximo envío
    enCel.set(cntClave(cat, f), JSON.stringify({ d: ahora.d || {}, h: ahora.h || [] }));
  }
  function cargarConteos() {
    if (CNT.cargando) return;
    CNT.cargando = true; CNT.error = null;
    const t0 = Date.now();
    apiD1(null, "conteos=1").then((d) => {
      const nuevos = new Set(Object.keys(CNT_AL).filter((k) => CNT_AL[k] > t0)), de = (r) => nuevos.has(`${r.cat}|${r.fecha}`);
      CNT.lista = d.conteos.filter((r) => !de(r)).concat((CNT.lista || []).filter(de)); CNT.delCel = false; enCel.set("los50-conteos", JSON.stringify(CNT.lista));
    })
      .catch((e) => {
        if (e.message === "clave") { CNT.error = errNotas(e, "No se pudo cargar lo contado", "contar el partido"); return; }
        // sin señal: lo último que se trajo en este celular (y se puede seguir contando)
        let c = null;
        try { c = JSON.parse(enCel.get("los50-conteos") || "null"); } catch (x) { /* nada guardado */ }
        CNT.lista = c || []; CNT.delCel = true;
      })
      .finally(() => { CNT.cargando = false; if (S.ver === "chico" || S.ver === "partidos" || S.ver === "equipo") render(); });
  }
  /** lo que se guardó sin señal se manda solo cuando vuelve (equipos y lo contado): "eq:M16|2026-11-01" o "cnt:…" */
  const PEND = "los50-pendientes";
  const pendientes = () => { try { return JSON.parse(enCel.get(PEND) || "[]"); } catch (e) { return []; } };
  const ponerPend = (k, si) => { const p = pendientes().filter((x) => x !== k); if (si) p.push(k); enCel.set(PEND, p.length ? JSON.stringify(p) : null); };
  const esRed = (e) => !["clave", "servidor", "choque"].includes(e.message);
  const cntPend = (cat, f) => pendientes().includes(`cnt:${cat}|${f}`);
  let MANDANDO = false, CNT_T = 0;
  /** lo contado se manda solo: 2 segundos después del último toque (así diez toques seguidos van en un solo envío) */
  const cntProgramar = (cat, f) => { clearTimeout(CNT_T); CNT_T = setTimeout(() => guardarCntSolo(cat, f), 2000); };
  async function guardarCntSolo(cat, f) {
    if (!cntSinGuardar(cat, f)) return;
    if (CNT.guardando) { cntProgramar(cat, f); return; }
    if (navigator.onLine === false) { ponerPend(`cnt:${cat}|${f}`, true); pintarPieCnt(); return; }
    CNT.guardando = true; pintarPieCnt();
    const estaba = cntPend(cat, f);
    try { await mandarConteo(cat, f); ponerPend(`cnt:${cat}|${f}`, false); if (estaba && S.ver === "equipo") avisoSuelto("Volvió la señal: se mandó lo que contaste", "ok"); } catch (e) { if (esRed(e)) ponerPend(`cnt:${cat}|${f}`, true); }
    finally { CNT.guardando = false; pintarPieCnt(); }
  }
  async function mandarPendientes() {
    if (MANDANDO || !S || navigator.onLine === false || !pendientes().length) return;
    MANDANDO = true;
    let hubo = false;
    try {
      for (const k of pendientes()) {
        const [tipo, resto] = [k.slice(0, k.indexOf(":")), k.slice(k.indexOf(":") + 1)], [cat, fecha] = resto.split("|");
        try {
          if (tipo === "eq") await mandarEquipo(cat, fecha); else await mandarConteo(cat, fecha);
          ponerPend(k, false); hubo = true;
          avisar("ok", `Volvió la señal: se guardó ${tipo === "eq" ? "el equipo" : "lo contado"} de ${esc(cat)}`);
        } catch (e) {
          if (esRed(e)) break; // sigue sin señal: se prueba de nuevo en un rato
          ponerPend(k, false); hubo = true;
          if (e.message === "choque") await resolverChoque(cat, fecha, e.info || {});
          else avisar("error", errEq(e, `No se pudo guardar lo de ${esc(cat)}`));
        }
      }
    } finally { MANDANDO = false; if (hubo && ["equipo", "partidos", "inicio"].includes(S.ver)) render(); }
  }
  // arriba: "Tackles" y "Line y scrum" (lo que más se cuenta); lo demás, en "Más"
  const CHIPS_C = [["tackles", "Tackles"], ["fija", "Line y scrum"]];
  const OTRAS_C = [["contactos", "Contactos"], ["rucks", "Rucks"], ["pases", "Pases"], ["quiebres", "Quiebres de línea"], ["recuperadas", "Pelotas recuperadas"]];
  const modoCnt = () => ([...CHIPS_C, ...OTRAS_C].some(([x]) => x === S.cacc) ? S.cacc : "tackles");
  /** cómo va el guardado de lo contado, en palabras */
  const estadoCnt = (cat, f) => (CNT.guardando ? ["va", "Guardando…"] : !cntSinGuardar(cat, f) ? ["ok", "Guardado"]
    : navigator.onLine === false || cntPend(cat, f) ? ["ojo", "Sin señal: queda en el celular"] : ["va", "Guardando…"]);
  /** abajo: cuánto va y si está guardado (sin volver a dibujar todo en cada toque) */
  function pintarPieCnt() {
    if (!(S && S.ver === "equipo" && S.eqcontar)) return;
    const cat = S.eqcat, f = S.eqfecha, k = cntActual(cat, f), e = eqActual(cat, f), modo = modoCnt();
    const tot = cntEquipo(k), sum = (x) => tot[x] || 0, acc = ACCIONES.find((a) => a[0] === modo) || ACCIONES[0]; // los mismos números que "Cómo va" (también los que salieron)
    const p = $("#cnt-pie-txt");
    if (p) p.textContent = modo === "tackles" ? `Tackles: ${sum("tackles")} bien · ${pl(sum("errados"), "errado", "errados")}`
      : modo === "fija" ? fijaTxt(k) || "Line y scrum" : pl(sum(modo), acc[1].toLowerCase(), acc[2]);
    const s = $("#cnt-estado"), [c, t] = estadoCnt(cat, f);
    if (s) { s.className = `cnt-estado cnt-estado--${c}`; s.innerHTML = `${c === "ok" ? IC.tilde : c === "ojo" ? IC.alerta : ""}${t}`; }
    const d = $("[data-cdeshacer]"), u = k.h[k.h.length - 1];
    if (d) { d.disabled = !u; const quien = u && u[0] !== "equipo" ? esc(apellido(eqQuien(u[0], eqPlantel(cat)).nombre)) : "";
      d.innerHTML = `${IC.deshacer}<span>Deshacer${u ? `<small>${u[2] === "-" ? `devolver ${UNO_C[u[1]] || ""}${quien ? ` a ${quien}` : ""}` : `${UNO_C[u[1]] || ""}${quien ? ` de ${quien}` : ""}`}</small>` : ""}</span>`; }
  }
  function vContar() {
    const cat = S.eqcat, f = S.eqfecha, modo = modoCnt(), acc = ACCIONES.find((x) => x[0] === modo) || ACCIONES[0], hoy = hoyISO();
    if (!CNT.lista && !CNT.error) cargarConteos();
    const inf = eqInfo(cat, f);
    // el resultado (de la UAR o el que se cargó en el amistoso)
    const pu = D.partidos.find((p) => p.cat === cat && p.fecha === f), rf = pu ? [pu.pf, pu.pc] : inf.pf !== "" && inf.pf != null ? [+inf.pf, +inf.pc] : null;
    const resTxt = rf ? `${rf[0] > rf[1] ? "Ganó" : rf[0] < rf[1] ? "Perdió" : "Empató"} ${rf[0]}–${rf[1]}` : "";
    const salio = f < hoy || !!rf;
    // un partido que ya pasó se abre en el resumen ("Cómo salió"); el del día, contando (aunque ya tenga el resultado)
    const ver = !S.cntCorr && !S.cntOtro && (S.cres == null ? f < hoy : S.cres); // "Corregir" y "¿Quién entró?" van primero
    const prov = rf && !pu && !inf.amistoso; // de la UAR, cargado por un entrenador hasta que lo cargue la UAR
    const cab = `<div class="cab cab--corta">${volver(`Equipo de ${esc(cat)}`, { ver: "equipo", eqcontar: false, cres: null })}<h2 class="cab__cat cab__cat--chica">${conAyuda(S.cntCorr ? "Corregir lo contado" : S.cntOtro ? "¿Quién entró?" : ver ? (salio ? "Cómo salió" : "Cómo va") : "Contar el partido", S.cntCorr ? "corregir" : S.cntOtro ? "quienEntro" : ver ? (salio ? "comoSalio" : "comoVa") : "contar")}</h2>
      <p class="eq-donde">${esc(cat)}${inf.rival ? ` vs ${esc(inf.rival)}` : ""} · ${f === hoy ? "Hoy" : esc(corta(f))}</p></div>`;
    if ((!CNT.lista && !cntBorr(cat, f)) || (!EQ.lista && !eqBorr.get(eqClave(cat, f)))) {
      const err = CNT.error || EQ.error;
      $("#vista").innerHTML = `${cab}<section class="sec sec--pegada">${err ? `<div class="hoy hoy--error"><p class="hoy__canc">${err}</p><button type="button" class="btn-sec" data-reintentar-cnt>Probar de nuevo</button></div>` : `<p class="cargando">Cargando…</p>`}</section>`;
      return;
    }
    const e = eqActual(cat, f), pl = eqPlantel(cat), ns = Object.keys(e.jugadores).map(Number).sort((x, y) => x - y), k = cntActual(cat, f), val = (id, x) => (k.c[id] && k.c[id][x]) || 0;
    if (!ns.length) { $("#vista").innerHTML = `${cab}<section class="sec sec--pegada"><p class="vacio-g">Primero elegí quién juega</p><button type="button" class="btn-sec btn-sec--ancho" data-subir>${IC.camiseta}Armar el equipo</button></section>`; SUBIR = { ver: "equipo", eqcontar: false }; return; }
    const ap = nombresCortos([...new Set([...Object.values(e.jugadores), ...Object.keys(k.c).filter((x) => x !== "equipo")])], pl), v0 = (n) => (n ? "" : " cnt-b__v--0"); // el primer apellido: entra en la tarjeta
    const sinSenal = navigator.onLine === false || CNT.delCel ? `<p class="lista-info lista-info--ojo">${IC.alerta}<span>Sin señal: lo que contás queda en el celular y se manda solo.</span></p>` : "";
    if (ver) {
      // el resumen: tres números grandes, la tabla de tackles y lo demás en una línea por acción
      const tot = cntEquipo(k), q = k.c.equipo || {}, enEq = new Map(ns.map((n) => [e.jugadores[n], n])), va = vaDe(cat, f);
      // los tantos: al terminar, el resultado; mientras se juega, cómo va (opcional: solo para el mensaje)
      const resCaja = (t, b, mientras) => `<div class="asis-form eq-res"><p class="asis-form__l">${t}</p>
            <div class="asis-form__fila"><label class="asis-form__campo">Los 50<input id="eq-pf" class="asis-input" type="number" inputmode="numeric" min="0" max="300" aria-describedby="eq-res-error" value="${mientras && va ? va[0] : ""}"></label>
              <label class="asis-form__campo">${esc(inf.rival || "Rival")}<input id="eq-pc" class="asis-input" type="number" inputmode="numeric" min="0" max="300" aria-describedby="eq-res-error" value="${mientras && va ? va[1] : ""}"></label></div>
            ${mientras ? `<p class="asis-nota">Va en el mensaje al grupo. Cuando termina, guardalo como resultado.</p>` : ""}
            <p class="asis-form__error" id="eq-res-error" role="alert" hidden></p>
            <div class="asis-form__btns"><button type="button" class="${mientras ? "btn-sec" : "btn btn--ok"} btn--alto" data-eq-res-ok>${IC.tilde}${b}</button></div></div>`;
      const big = [pctDe(tot.tackles || 0, tot.errados || 0) != null && [`${pctDe(tot.tackles || 0, tot.errados || 0)}%`, "Tackles bien hechos", `${tot.tackles || 0} de ${(tot.tackles || 0) + (tot.errados || 0)}`],
        (q.line_g || q.line_p) && [`${q.line_g || 0} de ${(q.line_g || 0) + (q.line_p || 0)}`, "Lines ganados", ""],
        (q.scrum_g || q.scrum_p) && [`${q.scrum_g || 0} de ${(q.scrum_g || 0) + (q.scrum_p || 0)}`, "Scrums ganados", ""]].filter(Boolean);
      const ids = [...ns.map((n) => e.jugadores[n]), ...Object.keys(k.c).filter((id) => id !== "equipo" && !enEq.has(id))];
      const quien = (id) => (enEq.has(id) ? `${enEq.get(id)}. ${esc(ap(id))}` : `${esc(ap(id))} <small>(salió del equipo)</small>`);
      const tk = ids.filter((id) => val(id, "tackles") || val(id, "errados"));
      const otras = ACCIONES.slice(2).map(([x, , plu]) => [plu, ids.filter((id) => val(id, x)).sort((a, b) => val(b, x) - val(a, x)).map((id) => `${esc(ap(id))} ${val(id, x)}`)]).filter(([, l]) => l.length);
      $("#vista").innerHTML = `${cab}${sinSenal}
        <section class="sec sec--pegada">
          ${resTxt ? `<p class="cnt-resultado cnt-resultado--${rf[0] > rf[1] ? "G" : rf[0] < rf[1] ? "P" : "E"}">${IC.trofeo}<b>${resTxt}</b>${prov ? "<small>provisorio, falta la UAR</small>" : ""}${pu ? "" : `<button type="button" class="link" data-ir-res="${esc(cat)}|${f}" aria-label="Cambiar el resultado">Cambiar</button>`}</p>` : ""}
          ${!rf ? (f < hoy ? resCaja("¿Cómo salió?", "Guardar el resultado") : resCaja("El tanteador", "Terminó: es el resultado final", true)) : ""}
          ${big.length ? `<ul class="cnt-big cnt-big--${big.length}">${big.map(([n, l, s]) => `<li><b class="num">${n}</b><span>${l}</span>${s ? `<small>${s}</small>` : ""}</li>`).join("")}</ul>` : `<p class="vacio-g">Todavía no se contó nada</p>`}
          ${tk.length ? `<h3 class="grupo" id="cnt-tk-t">Tackles, jugador por jugador</h3><div class="tabla-e-wrap cnt-res" tabindex="0" role="region" aria-labelledby="cnt-tk-t"><table class="tabla-e"><thead><tr><th scope="col" class="izq">Jugador</th><th scope="col"><span class="sr">Bien hechos</span>${IC.tilde}</th><th scope="col"><span class="sr">Errados</span>${IC.cruz}</th><th scope="col">%</th></tr></thead>
            <tbody>${tk.map((id) => `<tr><td class="izq">${quien(id)}</td><td>${val(id, "tackles")}</td><td>${val(id, "errados")}</td><td><b>${pctDe(val(id, "tackles"), val(id, "errados"))}%</b></td></tr>`).join("")}</tbody></table></div>` : ""}
          ${otras.length ? `<h3 class="grupo">Lo demás</h3><ul class="cnt-otras-l">${otras.map(([plu, l]) => `<li><b>${mayus(plu)}:</b> ${l.join(" · ")}</li>`).join("")}</ul>` : ""}
          <div class="cnt-res-acc lista-pie">
            ${f >= hoy ? `<button type="button" class="btn btn--ok btn--alto" data-cres="0">${IC.barras}Seguir contando</button>` : ""}
            ${big.length || rf || f >= hoy ? `<button type="button" class="${f >= hoy ? "btn-sec cnt-wa" : "btn btn--wa btn--alto"}" data-cres-compartir>${IC.compartir}Mandar al grupo</button>` : ""}
            ${f < hoy && big.length ? `<button type="button" class="btn-sec" data-cnt-corr="1">Corregir lo contado</button>` : ""}
          </div>
        </section>${avisoHTML()}`;
      return;
    }
    // contando: dos columnas en el celular, siempre igual (en "Tackles", el tilde y la cruz; en lo demás, un botón)
    const tarjeta = (n) => {
      const id = typeof n === "string" ? n : e.jugadores[n], nom = esc(ap(id)), cab2 = typeof n === "string" ? `<span class="cnt-p__cab"><span class="cnt-p__nom">${nom}</span></span>` : `<span class="cnt-p__cab"><b class="cnt-p__n num">${n}</b><span class="cnt-p__nom">${nom}</span></span>`;
      if (modo === "tackles") return `<li class="cnt-p">${cab2}<span class="cnt-p__btns">
        <button type="button" class="cnt-t cnt-t--ok" data-cuenta="${esc(id)}" data-cacion="tackles" data-nom="${nom}" aria-label="${typeof n === "string" ? "" : `${n}, `}${nom}: tackle bien hecho. Lleva ${val(id, "tackles")}">${IC.tilde}<b class="cnt-b__v${v0(val(id, "tackles"))} num">${val(id, "tackles")}</b></button>
        <button type="button" class="cnt-t cnt-t--mal" data-cuenta="${esc(id)}" data-cacion="errados" data-nom="${nom}" aria-label="${typeof n === "string" ? "" : `${n}, `}${nom}: tackle errado. Lleva ${val(id, "errados")}">${IC.cruz}<b class="cnt-b__v${v0(val(id, "errados"))} num">${val(id, "errados")}</b></button></span></li>`;
      return `<li class="cnt-p">${cab2}<span class="cnt-p__btns cnt-p__btns--uno"><button type="button" class="cnt-t cnt-t--mas" data-cuenta="${esc(id)}" data-cacion="${modo}" data-nom="${nom}" aria-label="${typeof n === "string" ? "" : `${n}, `}${nom}: ${esc(acc[1].toLowerCase())}. Lleva ${val(id, modo)}">${IC.mas}<b class="cnt-b__v${v0(val(id, modo))} num">${val(id, modo)}</b></button></span></li>`;
    };
    const fila = (t, g, p) => `<div class="cnt-fila"><b class="cnt-fila__t">${t}</b>
      <button type="button" class="cnt-t cnt-t--ok" data-cuenta="equipo" data-cacion="${g}" data-nom="${t} ganado" aria-label="${t} ganado. Van ${val("equipo", g)}">${IC.tilde}Ganado<b class="cnt-b__v${v0(val("equipo", g))} num">${val("equipo", g)}</b></button>
      <button type="button" class="cnt-t cnt-t--mal" data-cuenta="equipo" data-cacion="${p}" data-nom="${t} perdido" aria-label="${t} perdido. Van ${val("equipo", p)}">${IC.cruz}Perdido<b class="cnt-b__v${v0(val("equipo", p))} num">${val("equipo", p)}</b></button></div>`;
    const otra = OTRAS_C.find(([x]) => x === modo), enEq0 = new Set(Object.values(e.jugadores));
    const salieron = Object.keys(k.c).filter((id) => id !== "equipo" && !enEq0.has(id) && ACCIONES.some(([x]) => val(id, x))); // contados que ya no están en el equipo
    // corregir: cada jugador con lo que tiene contado y un "Sacar uno" por cada cosa
    if (S.cntCorr) {
      const numDe = new Map(Object.entries(e.jugadores).map(([n, id]) => [id, +n])), nomN = (id) => `${numDe.has(id) ? `${numDe.get(id)} ` : ""}${ap(id)}`;
      const fil = [...new Set([...Object.values(e.jugadores), ...Object.keys(k.c).filter((x) => x !== "equipo")])].filter((id) => ACCIONES.some(([x]) => val(id, x))).sort((a, b) => (numDe.get(a) || 99) - (numDe.get(b) || 99));
      const ult = [...new Map(k.h.filter((u) => u[2] !== "-" && val(u[0], u[1])).reverse().map((u) => [`${u[0]}|${u[1]}`, u])).values()].slice(0, 4);
      const quitar = (id, x, l) => `<button type="button" class="btn-sec cnt-quitar" data-cnt-quita="${esc(id)}|${x}" aria-label="${id === "equipo" ? `Sacar un ${UNO_C[x]}` : `Sacarle un ${UNO_C[x]} a ${esc(ap(id))}`}. Tiene ${val(id, x)}">${l} <b class="num">${val(id, x)}</b> <span aria-hidden="true">−</span></button>`;
      $("#vista").innerHTML = `${cab}<section class="sec sec--pegada">
        <p class="asis-nota">Tocá lo que quieras sacar: se saca uno por toque.</p>
        ${fil.length || FIJA.some(([x]) => val("equipo", x)) ? `${ult.length ? `<h3 class="grupo">Lo último que tocaste</h3><ul class="cnt-corr cnt-corr--ult">${ult.map(([id, x]) => `<li>${quitar(id, x, `${id === "equipo" ? "" : `${esc(nomN(id))} · `}${mayus(UNO_C[x])}`)}</li>`).join("")}</ul><h3 class="grupo">Todos</h3>` : ""}<ul class="cnt-corr">${fil.map((id) => `<li><b>${esc(nomN(id))}</b><span>${ACCIONES.filter(([x]) => val(id, x)).map(([x, l]) => quitar(id, x, x === "tackles" ? "Tackles" : x === "errados" ? "Errados" : (OTRAS_C.find((o) => o[0] === x) || [, l])[1])).join("")}</span></li>`).join("")}
          ${FIJA.some(([x]) => val("equipo", x)) ? `<li><b>Line y scrum</b><span>${FIJA.filter(([x]) => val("equipo", x)).map(([x, l]) => quitar("equipo", x, l)).join("")}</span></li>` : ""}</ul>` : `<p class="vacio-g">Todavía no se contó nada</p>`}
        <div class="lista-pie cnt-pie"><div class="cnt-pie__btns"><button type="button" class="btn-sec cnt-deshacer" data-cdeshacer${k.h.length ? "" : " disabled"}>${IC.deshacer}Deshacer</button><button type="button" class="btn btn--ok cnt-volver" data-cnt-corr="0">${IC.tilde}Listo</button></div></div></section>${avisoHTML()}`;
      pintarPieCnt();
      return;
    }
    // uno que entró y no estaba en el equipo: se elige y queda en el primer número libre del banco
    if (S.cntOtro) {
      const cx = eqCtx(), enEq = new Set(Object.values(e.jugadores)), noP = (c) => (eqAvisos(c.id, c, cx).some((a) => a.duro) ? 1 : 0), libres = pl.filter((c) => !enEq.has(c.id)).sort((a, b) => noP(a) - noP(b) || porNombre(a, b));
      $("#vista").innerHTML = `${cab}<section class="sec sec--pegada">
        <label class="buscar-g eq-buscar"><span class="sr">Buscar un chico</span>${IC.buscar}<input type="search" id="buscar-entra" placeholder="Buscar un chico" autocomplete="off" enterkeyhint="search"></label>
        <p class="asis-nota eq-buscar-nota">¿Es de ${esc(vecinas(eqAsis(cat)).join(" o "))}? Escribí el apellido.</p>
        ${libres.length ? `<ul class="eq-l" data-filtro-entra>${libres.map((c) => `<li data-q="${esc(qNom(c.nombre))}"><button type="button" class="eq-it eq-it--elegir" data-cnt-entra="${esc(c.id)}"><span class="eq-it__txt"><span class="eq-it__nom">${nombreHTML(c.nombre)}</span>${eqAvisos(c.id, c, cx).filter((a) => a.duro).map((a) => `<small class="eq-it__no">${esc(a.t)}</small>`).join("")}</span>${IC.mas}</button></li>`).join("")}</ul>` : `<p class="vacio-g">Ya están todos en el equipo</p>`}
        <div id="entra-ya"></div><p class="vacio-g" id="entra-nadie" hidden>Nadie con ese nombre</p><div id="entra-otros"></div>
        <button type="button" class="btn-sec btn-sec--ancho cnt-volver" data-cnt-otro="0">Volver a contar</button></section>${avisoHTML()}`;
      $("#vista").dataset.cnt = "otro";
      return;
    }
    $("#vista").innerHTML = `${cab}
      <div class="cnt-acc" role="group" aria-label="Qué contás">
        <div class="seg seg--g cnt-tabs">${CHIPS_C.map(([x, l]) => `<button type="button" data-cacc="${x}" aria-pressed="${x === modo}">${l}</button>`).join("")}
          <button type="button" data-cmas aria-expanded="${!!S.cmas}" aria-pressed="${!!otra}">${otra ? otra[1] : "Contactos y más"}${IC.abajo}</button></div>
        ${S.cmas ? `<div class="chips-g cnt-otras">${OTRAS_C.map(([x, l]) => `<button type="button" data-cacc="${x}" aria-pressed="${x === modo}">${l}</button>`).join("")}</div>` : ""}
      </div>
      <section class="sec sec--pegada cnt-sec">
        <p class="asis-nota cnt-ayuda">${modo === "tackles" ? `${IC.tilde}bien hecho · ${IC.cruz}errado` : modo === "fija" ? "Cuando la pelota es nuestra" : `Tocá al jugador cada vez que ${acc[3]}`}</p>
        ${modo === "fija" ? `<div class="cnt-fija2">${fila("Line", "line_g", "line_p")}${fila("Scrum", "scrum_g", "scrum_p")}</div>` : `<ul class="cnt-g cnt-g--par">${ns.filter((n) => n <= 15).map(tarjeta).join("")}${ns.some((n) => n > 15) ? `<li class="cnt-g__sep">Suplentes</li>${ns.filter((n) => n > 15).map(tarjeta).join("")}` : ""}${salieron.length ? `<li class="cnt-g__sep">Salieron del equipo</li>${salieron.map(tarjeta).join("")}` : ""}</ul>
          <button type="button" class="btn-sec btn-sec--ancho cnt-otro" data-cnt-otro="1">${IC.mas}Sumar a uno que entró</button>`}
      </section>
      <div class="lista-pie cnt-pie"><div class="cnt-pie__fila"><div class="cnt-pie__txt"><b id="cnt-pie-txt"></b><span id="cnt-estado" class="cnt-estado"></span></div><button type="button" class="btn-sec cnt-corr-b" data-cnt-corr="1">Corregir</button></div>
        <div class="cnt-pie__btns"><button type="button" class="btn-sec cnt-deshacer" data-cdeshacer${k.h.length ? "" : " disabled"}>${IC.deshacer}Deshacer</button>
          <button type="button" class="btn btn--ok cnt-va" data-cres="1">${IC.barras}${f < hoy ? "Cómo salió" : "Cómo va"}</button></div></div>
      <p class="sr" aria-live="polite" id="cnt-voz"></p>
      ${avisoHTML()}`;
    pintarPieCnt();
    // el que recién entró: a la vista y marcado
    if (S.cntNuevo) { const c = $(`[data-cuenta="${CSS.escape(S.cntNuevo)}"]`); S.cntNuevo = null; if (c) { const li = c.closest(".cnt-p"); li.classList.add("cnt-p--nuevo"); requestAnimationFrame(() => li.scrollIntoView({ block: "center" })); } }
  }
  /** cómo va el tanteador mientras se juega (solo en este celular, para el mensaje al grupo) */
  const vaClave = (cat, f) => `los50-va:${cat}|${f}`;
  const vaDe = (cat, f) => { try { const v = JSON.parse(enCel.get(vaClave(cat, f)) || "null"); return Array.isArray(v) ? v : null; } catch (e) { return null; } };
  /** lo contado, en texto para WhatsApp */
  function textoConteo() {
    const cat = S.eqcat, f = S.eqfecha, pl = eqPlantel(cat), k = cntActual(cat, f), inf = eqInfo(cat, f), ap = (id) => eqQuien(id, pl).nombre.split(",")[0], tot = cntEquipo(k);
    const l = [`*Los 50 · ${cat}*`, [inf.rival && `vs ${inf.rival}`, mayus(cuandoP({ fecha: f })), ...infoTxt(inf)].filter(Boolean).join(" · "), ""];
    const pu = D.partidos.find((p) => p.cat === cat && p.fecha === f), rf = pu ? [pu.pf, pu.pc] : inf.pf !== "" && inf.pf != null ? [inf.pf, inf.pc] : null;
    const va = !rf && vaDe(cat, f);
    if (rf) l.push(`${+rf[0] > +rf[1] ? "Ganamos" : +rf[0] < +rf[1] ? "Perdimos" : "Empatamos"} ${rf[0]} a ${rf[1]}${inf.rival ? ` contra ${inf.rival}` : ""}`);
    else if (va) l.push(`Así vamos: ${va[0]} a ${va[1]}${inf.rival ? ` contra ${inf.rival}` : ""} (sigue el partido)`);
    else if (f === hoyISO()) l.push("Así vamos (sigue el partido)");
    if (tot.tackles || tot.errados) l.push(`Tackles bien hechos: ${tklPct(tot)}`);
    if (fijaTxt(k)) l.push(fijaTxt(k));
    ACCIONES.filter(([x]) => x !== "errados").forEach(([x, , plu]) => { // los errados de cada chico no van al grupo de los padres
      const q = Object.entries(k.c).filter(([id]) => id !== "equipo").map(([id, o]) => [id, o[x] || 0]).filter(([, n]) => n).sort((p, q2) => q2[1] - p[1]);
      if (q.length) l.push("", `*${mayus(plu)}* (${q.reduce((s, [, n]) => s + n, 0)}): ${q.map(([id, n]) => `${ap(id)} ${n}`).join(" · ")}`);
    });
    return l.join("\n");
  }

  // ---------- el equipo como imagen: la cancha con los apellidos, los suplentes y el escudo (como Rugby Animator) ----------
  async function imagenEquipo() {
    const cat = S.eqcat, f = S.eqfecha, e = eqActual(cat, f), pl = eqPlantel(cat), inf = eqInfo(cat, f), nom = nombresCortos(Object.values(e.jugadores), pl); // como en la cancha
    try { await Promise.all(['700 60px "Barlow Condensed"', '600 30px "Barlow"', '500 24px "Barlow"'].map((x) => document.fonts.load(x))); } catch (err) { /* sin las letras del club: las del sistema */ }
    const escudo = await new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = "img/escudo-160.webp"; });
    const sup = Object.keys(e.jugadores).map(Number).filter((n) => n > 15).sort((x, y) => x - y);
    const citaH = 0, W = 1080, campoY = 210 + citaH, campoH = 1200, supY = campoY + campoH + 30, H = supY + (sup.length ? 80 + Math.ceil(sup.length / 2) * 52 : 0) + 70;
    const cv = Object.assign(document.createElement("canvas"), { width: W, height: H }), x = cv.getContext("2d");
    const COND = '"Barlow Condensed", "Arial Narrow", sans-serif', BASE = '"Barlow", system-ui, sans-serif';
    x.fillStyle = "#0b0d12"; x.fillRect(0, 0, W, H);
    if (escudo) x.drawImage(escudo, 56, 36, 120, 130);
    x.textAlign = "left"; x.textBaseline = "alphabetic";
    x.fillStyle = "#fff"; x.font = `700 68px ${COND}`; x.fillText(`LOS 50 · ${cat.toUpperCase()}`, 204, 110, W - 250);
    x.fillStyle = "#fff"; x.font = `600 38px ${BASE}`;
    x.fillText([inf.rival && `vs ${inf.rival}`, mayus(cuandoP({ fecha: f })), ...infoTxt(inf)].filter(Boolean).join(" · "), 204, 158, W - 250);
    // la cancha: forwards arriba y backs abajo, como en la app
    x.fillStyle = "#2b7443"; x.beginPath();
    if (x.roundRect) x.roundRect(40, campoY, W - 80, campoH, 28); else x.rect(40, campoY, W - 80, campoH);
    x.fill();
    x.fillStyle = "#fff"; x.font = `600 24px ${BASE}`;
    x.fillText("FORWARDS", 72, campoY + 46); x.fillText("BACKS", 72, campoY + 566);
    x.strokeStyle = "rgba(255,255,255,.45)"; x.lineWidth = 3; x.setLineDash([14, 12]);
    x.beginPath(); x.moveTo(72, campoY + 522); x.lineTo(W - 72, campoY + 522); x.stroke(); x.setLineDash([]);
    const ys = [campoY + 112, campoY + 257, campoY + 402, campoY + 645, campoY + 790, campoY + 935, campoY + 1080]; // una fila cada 145 px: el apellido no pisa la de abajo
    const xs = { 1: [540], 2: [420, 660], 3: [300, 540, 780], 4: [180, 420, 660, 900] };
    CANCHA.forEach((fila, i) => fila.forEach((n, j) => {
      const cx = fila[0] === 11 ? [200, 880][j] : xs[fila.length][j], cy = ys[i], id = e.jugadores[n];
      x.beginPath(); x.arc(cx, cy, 42, 0, Math.PI * 2);
      if (id) { x.fillStyle = "#fff"; x.fill(); } else { x.setLineDash([8, 8]); x.strokeStyle = "rgba(255,255,255,.75)"; x.lineWidth = 3; x.stroke(); x.setLineDash([]); }
      x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = id ? "#1b5fd1" : "#fff"; x.font = `700 46px ${COND}`; x.fillText(String(n), cx, cy + 3);
      if (id) { x.textBaseline = "alphabetic"; x.fillStyle = "#fff"; x.font = `600 30px ${BASE}`; x.fillText(nom(id), cx, cy + 80, 230); }
    }));
    // los suplentes, en dos columnas, con por quién entran
    x.textAlign = "left"; x.textBaseline = "alphabetic";
    if (sup.length) {
      x.fillStyle = "#fff"; x.font = `700 42px ${COND}`; x.fillText("SUPLENTES", 56, supY + 44);
      sup.forEach((n, i) => {
        const sx = 56 + (i % 2) * 500, sy = supY + 104 + Math.floor(i / 2) * 52, c = e.cambios[n];
        x.fillStyle = "#9db8ff"; x.font = `700 36px ${COND}`; x.fillText(String(n), sx, sy);
        x.fillStyle = "#fff"; x.font = `600 30px ${BASE}`; x.fillText(`${nom(e.jugadores[n])}${c && c.por ? ` (por el ${c.por}${c.min ? `, ${c.min}'` : ""})` : ""}`, sx + 58, sy, 420);
      });
    }
    x.textAlign = "right"; x.fillStyle = "rgba(255,255,255,.6)"; x.font = `500 24px ${BASE}`; x.fillText("Club Los 50", W - 56, H - 30);
    return new Promise((ok) => cv.toBlob(ok, "image/png"));
  }
  let ARMANDO = false;
  /** manda la imagen del equipo (con el texto); si el celular no tiene "Compartir", la muestra para mandarla a mano */
  async function compartirEquipo() {
    if (ARMANDO) return;
    const titulo = `Equipo de ${S.eqcat}`, archivo = `los50-${slug(S.eqcat)}-${S.eqfecha}.png`, txt = textoEquipo();
    let blob = null;
    ARMANDO = true;
    avisoSuelto("Armando la imagen…", "espera");
    try { blob = await imagenEquipo(); } catch (e) { blob = null; } finally { ARMANDO = false; S.aviso = null; const a = $(".aviso"); if (a) a.remove(); }
    if (!blob) { compartir(titulo, txt); return; }
    const file = new File([blob], archivo, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      const datos = navigator.canShare({ files: [file], text: txt }) ? { files: [file], title: titulo, text: txt } : { files: [file], title: titulo };
      try { await navigator.share(datos); return; } catch (e) { if (e.name === "AbortError") return; }
    }
    mostrarImagen(blob, archivo);
  }
  function mostrarImagen(blob, archivo) {
    cerrarImagen();
    const url = URL.createObjectURL(blob);
    document.body.insertAdjacentHTML("beforeend", `<div class="ayuda foto-eq" id="foto-eq"><div class="ayuda__fondo" data-cerrar-foto></div>
      <div class="ayuda__caja" role="dialog" aria-modal="true" aria-labelledby="foto-t"><h2 class="ayuda__t" id="foto-t">El equipo, listo para mandar</h2>
        <img class="foto-eq__img" src="${url}" alt="El equipo de ${esc(S.eqcat)} en la cancha">
        <p class="foto-eq__txt">Mantené apretada la imagen y elegí “Compartir”. En la compu, bajala y adjuntala en WhatsApp.</p>
        <div class="asis-form__btns"><a class="btn btn--ok btn--alto" href="${url}" download="${archivo}">Bajar la imagen</a><button type="button" class="btn-sec btn--alto" data-eq-texto>Mandar como texto</button></div>
        <button type="button" class="ayuda__ok" data-cerrar-foto>Cerrar</button></div></div>`);
    $("#foto-eq .ayuda__ok").focus();
    history.pushState({ foto: true }, "", location.href); // así el "atrás" del celular la cierra (como la ayuda)
  }
  function cerrarImagen(desdeBoton = true) {
    const c = $("#foto-eq");
    if (!c) return;
    if (desdeBoton && history.state && history.state.foto) { saltarPop = true; history.back(); }
    const i = $("img", c); if (i) setTimeout(() => URL.revokeObjectURL(i.src), 5000);
    c.remove();
    const b = $("[data-eq-mandar]"); if (b) b.focus();
  }

  // ---------- documentos y cursos (functions/api/asistencia.js, tabla "docs" de D1) ----------
  // Quién tiene al día la ficha médica, la autorización y el DNI, y quién hizo los cursos de la UAR. Se marca como la lista
  // de asistencia: un papel o un curso y todos los chicos de la categoría. La ficha médica y la autorización son del año (el año
  // que viene arrancan vacías); el DNI y los cursos quedan. Lo marcado queda en el celular hasta tocar "Guardar".
  const DOCS = [
    { k: "medica", nom: "Ficha médica", que: "Con el apto del médico, de este año", anual: true },
    { k: "autoriza", nom: "Autorización", que: "Firmada por los padres, de este año", anual: true, menores: true },
    { k: "dni", nom: "DNI", que: "La fotocopia" },
    { k: "conmocion", nom: "Curso de conmoción", que: "El de la UAR", juv: true },
    { k: "antidoping", nom: "Curso de antidopaje", que: "El de la UAR", juv: true },
    { k: "primera", nom: "Primera línea", que: "Acreditación para pilares y hookers", juv: true, primera: true },
  ];
  const DOC = { lista: null, error: null, cargando: false, guardando: false };
  const docDe = (k) => DOCS.find((d) => d.k === k);
  /** los papeles de cada categoría: la autorización no es para el plantel superior; los cursos, no para infantiles */
  const docsDe = (cat) => DOCS.filter((d) => !(d.menores && cat === "Plantel superior") && !(d.juv && ASIS_CATS.indexOf(cat) >= 7));
  /** quiénes lo tienen: id → el día en que se marcó (la ficha médica y la autorización, solo las de este año) */
  const docTienen = (k) => {
    const a = docDe(k).anual ? hoyISO().slice(0, 4) : "siempre", m = new Map();
    (DOC.lista || []).forEach((r) => { if (r.doc === k && r.anio === a) m.set(r.id, r.fecha); });
    return m;
  };
  /** pilar o hooker: jugó de 1, 2 o 3 o lo dice su ficha de la UAR */
  const esPrimera = (id) => { const c = D.cam[id] || {}; return (c.j || []).some((n) => n <= 3) || (!!c.f && c.f <= 3); };
  const docChicos = (d, pl) => (d.primera ? pl.filter((c) => esPrimera(c.id)) : pl);
  const docClave = (cat, k) => `los50-docs:${cat}|${k}`;
  const docBorr = (cat, k) => { try { return JSON.parse(enCel.get(docClave(cat, k)) || "null"); } catch (e) { return null; } };
  function cargarDocs() {
    if (DOC.cargando) return;
    DOC.cargando = true; DOC.error = null;
    apiD1(null, "docs=1").then((d) => { DOC.lista = d.docs; })
      .catch((e) => { DOC.error = errNotas(e, "No se pudieron cargar los documentos", "ver los documentos"); })
      .finally(() => { DOC.cargando = false; if (["docs", "doclista", "equipo", "chico"].includes(S.ver)) render(); });
  }
  const esperaDocs = (cat) => {
    if (!DOC.lista && !DOC.error) cargarDocs();
    if (!ASIS.cats[cat] && !ASIS.error[cat]) cargarAsis(cat);
    if (DOC.error) return `<div class="hoy hoy--error"><p class="hoy__canc">${DOC.error}</p><button type="button" class="btn-sec" data-reintentar-docs>Probar de nuevo</button></div>`;
    return !DOC.lista || (!ASIS.cats[cat] && !ASIS.error[cat]) ? `<p class="cargando">Cargando…</p>` : "";
  };

  // una categoría: cuántos tienen cada papel y, chico por chico, lo que le falta
  function vDocs() {
    const cat = S.dcat, espera = esperaDocs(cat);
    const cab = `<div class="cab">${volver(AREAS.docs, AREA_IR("docs"))}${cabTit(`Documentos de ${esc(cat)}`, "docs")}</div>`;
    if (espera) { $("#vista").innerHTML = `${cab}<section class="sec sec--pegada">${espera}</section>`; return; }
    const pl = testPlantel(cat), ds = docsDe(cat), T = Object.fromEntries(ds.map((d) => [d.k, docTienen(d.k)]));
    const tarjeta = (d) => {
      const quienes = docChicos(d, pl), n = quienes.filter((c) => T[d.k].has(c.id)).length, tot = quienes.length, p = tot ? Math.round((100 * n) / tot) : null;
      return `<li><button type="button" class="doc-t" data-ir-doc="${d.k}"><span class="doc-t__txt"><b>${d.nom}</b><small>${d.que}</small></span>
        <span class="doc-t__n">${tot ? `<b class="num">${n}</b> de ${tot}` : "Sin pilares ni hookers"}</span>
        <span class="doc-t__barra" aria-hidden="true"><i class="doc-t__barra--${colorPct(p)}" style="width:${p || 0}%"></i></span>${docBorr(cat, d.k) ? `<small class="doc-t__ojo">Sin guardar</small>` : ""}</button></li>`;
    };
    // solo cuenta lo que ya se empezó a marcar en la categoría (si el club no pide el DNI, no aparece como que falta)
    const enUso = ds.filter((d) => pl.some((c) => T[d.k].has(c.id)));
    const faltan = pl.map((c) => [c, enUso.filter((d) => (!d.primera || esPrimera(c.id)) && !T[d.k].has(c.id))]).filter(([, f]) => f.length);
    const falta = !enUso.length ? `<p class="vacio-g">Cuando marques un papel o un curso, acá aparece a quién le falta</p>`
      : !faltan.length ? `<p class="vacio-g">Nadie debe nada</p>`
      : `<p class="titular test-tit"><b>${faltan.length}</b> de ${pl.length} ${faltan.length === 1 ? "chico debe" : "chicos deben"} algo</p>
        <ul class="eq-l">${faltan.map(([c, f]) => `<li class="falta-f"><span class="falta-f__nom">${linkChico(c.id, c.nombre, cat)}</span><small>Falta: ${f.map((d) => d.nom).join(" · ")}</small></li>`).join("")}</ul>`;
    $("#vista").innerHTML = `${cab}
      <div class="dos">
        <section class="sec sec--pegada">${tit("Papeles y cursos")}<ul class="docs-t">${ds.map(tarjeta).join("")}</ul></section>
        <section class="sec sec--pegada">${tit("A quién le falta", "docsFaltan")}${falta}</section>
      </div>${avisoHTML()}`;
  }
  // un papel o un curso: la lista de chicos para marcar a los que lo tienen
  function vDocLista() {
    const cat = S.dcat, d = docDe(S.ddoc), espera = esperaDocs(cat);
    const cab = `<div class="cab">${volver(`Documentos de ${esc(cat)}`, { ver: "docs", ddoc: null })}${cabTit(`${d.nom} · ${esc(cat)}`, "docLista")}</div>`;
    if (espera) { $("#vista").innerHTML = `${cab}<section class="sec sec--pegada">${espera}</section>`; return; }
    const pl = testPlantel(cat), t = docTienen(d.k), b = docBorr(cat, d.k);
    S.dmarcas = new Set(b || pl.filter((c) => t.has(c.id)).map((c) => c.id));
    const quienes = docChicos(d, pl), n = quienes.filter((c) => S.dmarcas.has(c.id)).length;
    const item = (c) => `<li data-q="${esc(qNom(c.nombre))}"><button type="button" class="lista-it" data-dmarca="${esc(c.id)}" aria-pressed="${S.dmarcas.has(c.id)}">
      <span class="lista-it__ic">${IC.tilde}</span><span class="lista-it__nom">${nombreHTML(c.nombre)}${t.has(c.id) ? `<small class="doc-desde">Desde el ${corta(t.get(c.id))}</small>` : ""}</span></button></li>`;
    const grupos = d.primera ? [["Pilares y hookers", quienes], ["Los demás", pl.filter((c) => !esPrimera(c.id))]] : [["", pl]];
    $("#vista").innerHTML = `${cab}
      <section class="sec sec--pegada asis-v">
        <p class="asis-nota">${d.anual ? "Tocá a los que ya lo entregaron este año." : "Tocá a los que ya lo tienen."}</p>
        ${pl.length > 30 ? `<label class="buscar-g asis-buscar"><span class="sr">Buscar un chico</span>${IC.buscar}<input type="search" id="buscar-chico" placeholder="Buscar por nombre o apellido" autocomplete="off" enterkeyhint="search"></label>` : ""}
        ${grupos.filter(([, l]) => l.length).map(([g, l]) => `${g ? `<h3 class="grupo">${g}</h3>` : ""}<ul class="lista-g" data-filtro>${l.map(item).join("")}</ul>`).join("")}
        <p class="vacio-g" id="sin-chicos" hidden>Nadie con ese apellido</p>
        <div class="lista-pie" role="status"><span><b class="num" id="dcont">${n}</b> de ${quienes.length} lo tienen<small class="lista-pie__ojo" id="dsin"${b ? "" : " hidden"}>Sin guardar</small></span>
          <button type="button" class="btn btn--ok btn--grande" data-docs-guardar>${IC.tilde}Guardar</button></div>
      </section>${avisoHTML()}`;
  }
  async function guardarDocs() {
    if (DOC.guardando) return;
    const cat = S.dcat, d = docDe(S.ddoc), t = docTienen(d.k), ids = new Set(testPlantel(cat).map((c) => c.id));
    const sumar = [...S.dmarcas].filter((id) => !t.has(id)), sacar = [...t.keys()].filter((id) => ids.has(id) && !S.dmarcas.has(id));
    const volverA = () => volverAtras({ ver: "docs", ddoc: null });
    if (!sumar.length && !sacar.length) { enCel.set(docClave(cat, d.k), null); avisar("ok", "No había cambios"); volverA(); return; }
    DOC.guardando = true;
    avisoSuelto("Guardando…", "espera");
    try {
      await apiD1({ accion: "docs", cat, doc: d.k, fecha: hoyISO(), sumar, sacar, por: enCel.get(claveNombreNota) || "" });
      enCel.set(docClave(cat, d.k), null);
      DOC.lista = (await apiD1(null, "docs=1")).docs;
      avisar("ok", `${d.nom}: guardado`);
      volverA();
    } catch (e) { avisoSuelto(`${errNotas(e, "No se pudo guardar", "guardar los documentos")} Lo marcado queda en el celular.`); }
    finally { DOC.guardando = false; }
  }

  // ---------- tests de campo (functions/api/asistencia.js, tabla "tests" de D1) ----------
  // Dos veces al año (marzo y septiembre), como en las academias de la UAR: 10 m, 30 m (forwards), 40 m (backs), salto horizontal,
  // Bronco y, si hay con qué, salto vertical. Se carga por estación: un test y todos los chicos (la lista de Asistencia).
  // El color compara con los chicos de la misma categoría ese día (las referencias de la UAR son desde M18): el tercio mejor en verde,
  // el del medio en amarillo y el de abajo en rojo. Lo cargado queda en el celular hasta guardarlo (en la cancha suele no haber señal).
  const TESTS = [
    { k: "m10", nom: "10 metros", u: "s", menos: true, min: 1, max: 4, ej: "1,85" },
    { k: "m30", nom: "30 metros", u: "s", menos: true, min: 3, max: 8, ej: "4,60", quien: "Forwards" },
    { k: "m40", nom: "40 metros", u: "s", menos: true, min: 4, max: 10, ej: "5,90", quien: "Backs" },
    { k: "salto", nom: "Salto horizontal", u: "m", menos: false, min: 0.8, max: 3.5, ej: "2,10" },
    { k: "bronco", nom: "Bronco", u: "min", menos: true, min: 180, max: 720, ej: "5,20" },
    { k: "cmj", nom: "Salto vertical", u: "cm", menos: false, min: 10, max: 90, ej: "38", quien: "Con una app" },
  ];
  const testCats = () => ASIS_CATS.slice(0, 7); // del plantel superior a M13
  const testDe = (k) => TESTS.find((t) => t.k === k);
  const TST = { cats: {}, error: {}, cargando: new Set(), guardando: false };
  const UNIDAD = { s: "segundos", m: "metros", cm: "centímetros", min: "minutos y segundos" };
  /** lo que se escribe: "1,85" o "1.85"; el Bronco "5,20" o "5:20" (minutos y segundos) o "320" (segundos); el salto en metros o en centímetros.
      Si no es un número que tenga sentido para ese test, da NaN */
  function leerValor(t, txt) {
    const s = String(txt).trim().replace(",", ".");
    if (!s) return null;
    let v = +s;
    if (t.k === "bronco") {
      const [m, sg = "0"] = s.split(/[.:]/);
      if (+m < 15) v = /^\d+$/.test(m) && /^\d{1,2}$/.test(sg) && +sg < 60 ? +m * 60 + +sg : NaN;
    }
    if (t.k === "salto" && v > 50) v /= 100; // lo escribió en centímetros
    return Number.isFinite(v) && v >= t.min && v <= t.max ? Math.round(v * 100) / 100 : NaN;
  }
  const verValor = (t, v) => (t.k === "bronco" ? `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")}`
    : t.k === "cmj" ? String(Math.round(v * 10) / 10).replace(".", ",") : v.toFixed(2).replace(".", ","));
  function cargarTests(cat) {
    if (TST.cargando.has(cat)) return;
    TST.cargando.add(cat); delete TST.error[cat];
    apiD1(null, `tests=1&cat=${encodeURIComponent(cat)}`).then((d) => { TST.cats[cat] = d.tests; })
      .catch((e) => { TST.error[cat] = errNotas(e, "No se pudieron cargar los tests", "ver los tests"); })
      .finally(() => { TST.cargando.delete(cat); if ((["tests", "toma"].includes(S.ver) && S.tcat === cat) || (S.ver === "chico" && S.chcat === cat)) render(); });
  }
  /** las tomas de un test: [fecha, Map(id → valor)], de la más nueva a la más vieja */
  function tomasDe(cat, k) {
    const out = new Map();
    (TST.cats[cat] || []).filter((r) => r.test === k).forEach((r) => { if (!out.has(r.fecha)) out.set(r.fecha, new Map()); out.get(r.fecha).set(r.id, r.valor); });
    return [...out].sort((a, b) => b[0].localeCompare(a[0]));
  }
  const testPlantel = (cat) => { const d = ASIS.cats[cat]; return d ? chicosDe(cat, d).activos : (D.fichados[cat] || []).map(([id, nombre]) => ({ id, nombre })).sort(porNombre); };
  const testQuien = (id, pl) => pl.find((c) => c.id === id) || eqTodos().get(id) || { id, nombre: "Ya no está en la lista" };
  const tomaClave = (cat, f, k) => `los50-test:${cat}|${f}|${k}`;
  const tomaBorr = (cat, f, k) => { try { return JSON.parse(enCel.get(tomaClave(cat, f, k)) || "null"); } catch (e) { return null; } };
  /** mientras se cargan los tests o la lista de chicos: "Cargando…" o el error */
  const esperaTests = (cat) => {
    if (!TST.cats[cat] && !TST.error[cat]) cargarTests(cat);
    if (!ASIS.cats[cat] && !ASIS.error[cat]) cargarAsis(cat);
    if (TST.error[cat]) return `<div class="hoy hoy--error"><p class="hoy__canc">${TST.error[cat]}</p><button type="button" class="btn-sec" data-reintentar-tests>Probar de nuevo</button></div>`;
    return !TST.cats[cat] || (!ASIS.cats[cat] && !ASIS.error[cat]) ? `<p class="cargando">Cargando…</p>` : "";
  };

  // una categoría: un botón por test para cargarlo y los resultados (de mejor a peor, con el color y si mejoró)
  function vTests() {
    const cat = S.tcat, espera = esperaTests(cat);
    const cab = `<div class="cab">${volver(AREAS.tests, AREA_IR("tests"))}${cabTit(`Tests físicos de ${esc(cat)}`, "tests")}</div>`;
    if (espera) { $("#vista").innerHTML = `${cab}<section class="sec sec--pegada">${espera}</section>`; return; }
    const pl = testPlantel(cat), hechos = TESTS.filter((t) => tomasDe(cat, t.k).length);
    if (!hechos.some((t) => t.k === S.tver)) S.tver = hechos[0] ? hechos[0].k : null;
    const boton = (t) => { const u = tomasDe(cat, t.k)[0];
      return `<li><button type="button" class="test-t" data-tomar="${t.k}"><b>${t.nom}</b><small>${[t.quien, u ? `Último: ${corta(u[0])}` : "Sin tomar"].filter(Boolean).join(" · ")}</small></button></li>`; };
    let res = `<p class="vacio-g">Todavía no hay tests cargados</p>`;
    const t = testDe(S.tver);
    if (t) {
      const tomas = tomasDe(cat, t.k);
      if (!tomas.some(([f]) => f === S.tdia)) S.tdia = tomas[0][0];
      const i = tomas.findIndex(([f]) => f === S.tdia), [fecha, vals] = tomas[i], antes = tomas[i + 1];
      const orden = [...vals].sort((a, b) => (t.menos ? a[1] - b[1] : b[1] - a[1])), n = orden.length;
      const color = (r) => (n < 6 ? "gris" : r < n / 3 ? "verde" : r < (2 * n) / 3 ? "ambar" : "rojo");
      const fila = ([id, v], r) => {
        const prev = antes && antes[1].get(id), dif = prev != null ? Math.round((v - prev) * 100) / 100 : 0, mejor = t.menos ? dif < 0 : dif > 0;
        return `<li class="test-f"><span class="test-f__pos num">${r + 1}</span><span class="test-f__nom"><span>${linkChico(id, testQuien(id, pl).nombre, cat)}</span>${dif
          ? `<small class="${mejor ? "test-f__mejor" : "test-f__peor"}">${mejor ? "Mejoró" : "Empeoró"} ${verValor(t, Math.abs(dif))} ${t.u} desde el ${corta(antes[0])}</small>` : ""}</span>
          <span class="porc porc--${color(r)} num">${verValor(t, v)}</span></li>`;
      };
      res = `<div class="chips-g" role="group" aria-label="Test">${hechos.map((x) => `<button type="button" data-tver="${x.k}" aria-pressed="${x.k === t.k}">${x.nom}</button>`).join("")}</div>
        ${tomas.length > 1 ? `<div class="chips-g chips-g--asis" role="group" aria-label="Día">${tomas.map(([f]) => `<button type="button" data-tdia="${f}" aria-pressed="${f === fecha}">${corta(f)}</button>`).join("")}</div>` : ""}
        <p class="titular test-tit">${t.nom} del ${esc(cuandoP({ fecha }))}: <b>${n}</b> ${n === 1 ? "chico" : "chicos"}, en ${UNIDAD[t.u]}</p>
        <ul class="test-r">${orden.map(fila).join("")}</ul>
        <button type="button" class="link" data-tomar="${t.k}|${fecha}">Corregir esta toma</button>`;
    }
    $("#vista").innerHTML = `${cab}
      <div class="dos">
        <section class="sec sec--pegada">${tit("Cargar un test")}<ul class="tests-t">${TESTS.map(boton).join("")}</ul></section>
        <section class="sec sec--pegada">${tit("Resultados", "testsColor")}${res}</section>
      </div>${avisoHTML()}`;
  }
  // cargar un test: un renglón por chico con su resultado
  function vToma() {
    const cat = S.tcat, t = testDe(S.ttest), f = S.tfecha, espera = esperaTests(cat);
    const cab = `<div class="cab">${volver(`Tests de ${esc(cat)}`, { ver: "tests", ttest: null, tfecha: null })}${cabTit(`${t.nom} · ${esc(cat)}`, "toma")}</div>`;
    if (espera) { $("#vista").innerHTML = `${cab}<section class="sec sec--pegada">${espera}</section>`; return; }
    const pl = testPlantel(cat), b = tomaBorr(cat, f, t.k), g = (tomasDe(cat, t.k).find(([x]) => x === f) || [])[1];
    // los de la lista y los que tienen algo guardado ese día aunque ya no estén
    const lista = [...pl, ...(g ? [...g.keys()].filter((id) => !pl.some((c) => c.id === id)).map((id) => testQuien(id, pl)) : [])];
    const val = (id) => (b ? b[id] || "" : g && g.has(id) ? verValor(t, g.get(id)) : "");
    const n = lista.filter((c) => val(c.id)).length;
    $("#vista").innerHTML = `${cab}
      <section class="sec sec--pegada">
        <div class="asis-form__fila toma-cab"><label class="asis-form__campo">Día<input id="toma-fecha" class="asis-input" type="date" value="${f}" max="${hoyISO()}"></label>
          <p class="asis-nota">En ${UNIDAD[t.u]}, por ejemplo ${t.ej}. Al que no lo hizo, dejalo vacío.</p></div>
        <ul class="toma-l">${lista.map((c) => { const v = val(c.id), mal = v && Number.isNaN(leerValor(t, v));
          return `<li class="toma-f"><label for="tv-${esc(c.id)}">${nombreHTML(c.nombre)}</label><input id="tv-${esc(c.id)}" class="asis-input toma-in${mal ? " toma-in--mal" : ""}" data-tv="${esc(c.id)}" inputmode="decimal" autocomplete="off" enterkeyhint="next" placeholder="${t.ej}" value="${esc(v)}"></li>`; }).join("")}</ul>
      </section>
      <div class="lista-pie" role="status"><span><b class="num" id="toma-n">${n}</b> de ${lista.length} cargados<small class="lista-pie__ojo" id="toma-sin"${b ? "" : " hidden"}>Sin guardar</small></span>
        <button type="button" class="btn btn--ok btn--grande" data-toma-guardar>${IC.tilde}Guardar</button></div>
      ${avisoHTML()}`;
  }
  async function guardarToma() {
    if (TST.guardando) return;
    const cat = S.tcat, t = testDe(S.ttest), f = S.tfecha, valores = {}, malos = [];
    document.querySelectorAll("[data-tv]").forEach((i) => { const txt = i.value.trim(), v = leerValor(t, txt); if (!txt) return; if (Number.isNaN(v)) malos.push(i); else valores[i.dataset.tv] = v; });
    if (malos.length) {
      avisoSuelto(`${malos.length === 1 ? "Hay un resultado" : `Hay ${malos.length} resultados`} que no ${malos.length === 1 ? "parece" : "parecen"} de ${t.nom.toLowerCase()} (en rojo). Escribilo en ${UNIDAD[t.u]}, por ejemplo ${t.ej}.`);
      malos[0].focus();
      return;
    }
    if (!Object.keys(valores).length && !tomasDe(cat, t.k).some(([x]) => x === f)) { avisoSuelto("Anotá el resultado de al menos un chico."); return; }
    TST.guardando = true;
    avisoSuelto("Guardando…", "espera");
    try {
      await apiD1({ accion: "test", cat, fecha: f, test: t.k, valores, por: enCel.get(claveNombreNota) || "" });
      enCel.set(tomaClave(cat, f, t.k), null);
      TST.cats[cat] = (await apiD1(null, `tests=1&cat=${encodeURIComponent(cat)}`)).tests;
      const n = Object.keys(valores).length;
      avisar("ok", n ? `${t.nom}: ${n} ${n === 1 ? "chico guardado" : "chicos guardados"}` : `Se borró ${t.nom.toLowerCase()} de ese día`);
      S.tver = t.k; S.tdia = f;
      volverAtras({ ver: "tests", ttest: null, tfecha: null });
    } catch (e) { avisoSuelto(`${errNotas(e, "No se pudo guardar", "guardar los tests")} Lo cargado queda en el celular.`); }
    finally { TST.guardando = false; }
  }

  // ---------- el equipo de un partido: titulares, suplentes y cambios (functions/api/asistencia.js, tabla "equipos" de D1) ----------
  // Se arma desde Partidos, en cada partido (de la UAR o un amistoso). Los chicos salen de la lista de Asistencia de la categoría
  // (el plantel superior es uno solo para Primera, Intermedia…). Para cada número sugiere a los que jugaron ahí y avisa en rojo
  // a los que no deberían jugar (sancionados, lesionados, sin ficha médica). Se guarda solo, un segundo y medio después de cada cambio;
  // si otro entrenador cambió el mismo equipo, se juntan los cambios y solo se pregunta por los números que tocaron los dos.
  const EQ = { lista: null, error: null, cargando: false, guardando: false, delCel: false };
  const EQ_AL = {}; // como CNT_AL: cuándo se mandó cada equipo
  const EQ_T = {}; // el guardado que espera (uno por partido)
  const EQ_MAX = 30; // del 16 al 23 son los 8 suplentes; en juveniles se pueden sumar más, hasta el 30
  const DATOS = ["rival", "hora", "cond", "cita", "pf", "pc", "lugar"]; // los datos del partido que se cargan acá (en uno de la UAR, solo la citación)
  const eqAsis = (cat) => (PS.includes(cat) ? "Plantel superior" : ASIS_CATS.includes(cat) ? cat : null);
  const eqClave = (cat, f) => `${cat}|${f}`;
  const eqBorr = {
    get: (k) => { try { return JSON.parse(enCel.get(`los50-equipo:${k}`) || "null"); } catch (e) { return null; } },
    set: (k, v) => enCel.set(`los50-equipo:${k}`, v ? JSON.stringify(v) : null),
  };
  /** los equipos que quedaron en el celular sin mandar (para que un amistoso nuevo aparezca en Partidos aunque no haya señal) */
  const eqBorradores = () => {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("los50-equipo:")) { const [cat, fecha] = k.slice(13).split("|"), b = eqBorr.get(`${cat}|${fecha}`); if (b) out.push([cat, fecha, b]); }
      }
    } catch (e) { /* sin almacenamiento */ }
    return out;
  };
  const eqGuardado = (cat, f) => (EQ.lista || []).find((e) => e.cat === cat && e.fecha === f) || null;
  const eqPartido = (cat, f) => D.prox.find((x) => x.cat === cat && x.fecha === f) || null;
  // en un partido de la UAR, de lo que se carga acá solo cuentan la citación y la cancha (rival, hora y lugar los pone la UAR)
  const datosDe = (x, oficial) => (oficial ? ["cita", "lugar", "pf", "pc"] : DATOS).map((k) => (x && x[k] != null && x[k] !== "" ? String(x[k]) : ""));
  const copiaEq = (g) => ({ jugadores: { ...g.jugadores }, cambios: { ...(g.cambios || {}) }, ...Object.fromEntries(DATOS.map((k) => [k, g[k] ?? ""])), ts: g.ts });
  /** lo que se está armando: lo del celular (si hay algo sin mandar) o lo guardado */
  function eqActual(cat, f) {
    const b = eqBorr.get(eqClave(cat, f)), g = eqGuardado(cat, f);
    if (b) return { jugadores: {}, cambios: {}, ...b };
    return { jugadores: { ...(g ? g.jugadores : {}) }, cambios: { ...(g ? g.cambios || {} : {}) }, ...Object.fromEntries(DATOS.map((k) => [k, g && g[k] != null ? g[k] : ""])) };
  }
  /** los datos del partido: los de la UAR o, en un amistoso, los que se cargaron (rival, hora, de local o de visitante, resultado) */
  function eqInfo(cat, f) {
    const px = eqPartido(cat, f), e = eqActual(cat, f);
    if (px) return { rival: nombreRival(px.rival), hora: px.hora || "", cond: px.cond, amistoso: false, cita: e.cita || "", pf: e.pf, pc: e.pc, lugar: e.lugar || "" };
    return { rival: e.rival || "", hora: e.hora || "", cond: e.cond || "", amistoso: true, cita: e.cita || "", pf: e.pf, pc: e.pc, lugar: e.lugar || "" };
  }
  /** "15:30 · Local" o "Amistoso · Visitante" */
  const infoTxt = (i) => [i.hora, i.amistoso && "Amistoso", i.cond && condTxt(i.cond)].filter(Boolean);
  const mismoEq = (a, g, oficial) => JSON.stringify([a.jugadores, a.cambios || {}, datosDe(a, oficial)]) === JSON.stringify([g ? g.jugadores : {}, g ? g.cambios || {} : {}, datosDe(g, oficial)]);
  const eqSinGuardar = (cat, f) => { const b = eqBorr.get(eqClave(cat, f)); return !!b && !mismoEq(b, eqGuardado(cat, f), !!eqPartido(cat, f)); };
  /** anota un cambio en el celular y lo manda en un rato; "base" es lo guardado que había cuando se empezó a cambiar (para juntar con otro) */
  function eqAnotar(e, cat = S.eqcat, f = S.eqfecha) {
    const k = eqClave(cat, f), g = eqGuardado(cat, f), b = eqBorr.get(k);
    Object.keys(e.cambios).forEach((n) => { if (!e.jugadores[n] || +n <= 15) delete e.cambios[n]; });
    e.base = b && "base" in b ? b.base : g ? copiaEq(g) : null;
    eqBorr.set(k, g && mismoEq(e, g, !!eqPartido(cat, f)) ? null : e);
    eqProgramar(cat, f);
  }
  function eqProgramar(cat, f) { const k = eqClave(cat, f); clearTimeout(EQ_T[k]); EQ_T[k] = setTimeout(() => guardarEqSolo(cat, f), 1500); }
  let TODOS_ID = null;
  /** todos los fichados del club por número de jugador: para el nombre y para buscar a uno de otra categoría */
  const eqTodos = () => (TODOS_ID ??= new Map(Object.entries(D.fichados).flatMap(([c, l]) => l.map(([id, nombre]) => [id, { id, nombre, cat: c }]))));
  /** los chicos de la categoría, con cuánto vienen a entrenar (mientras carga la asistencia, los fichados) */
  function eqPlantel(cat) {
    const ac = eqAsis(cat), d = ASIS.cats[ac];
    if (!d && !ASIS.error[ac]) cargarAsis(ac);
    return d ? porcentajes(d, chicosDe(ac, d).activos) : (D.fichados[ac] || []).map(([id, nombre]) => ({ id, nombre, desde: "" })).sort(porNombre);
  }
  const eqQuien = (id, pl) => pl.find((c) => c.id === id) || eqTodos().get(id) || { id, nombre: "Ya no está en la lista" };
  const apellido = (n) => n.split(",")[0].trim();
  const eqAlertas = () => { const m = new Map(); alertasHoy().forEach((a) => { const k = claveNombre(a.j); if (!m.has(k)) m.set(k, a); }); return m; };
  const eqPuesto = (n) => (n > 15 ? "Suplente" : ((D.guia && D.guia.puestos && puestoDe(n)) || {}).nombre || "");
  const eqCorto = (n) => (n > 15 ? "" : ((D.guia && D.guia.puestos && puestoDe(n)) || {}).corto || "");
  const eqJuega = (id) => D.cam[id] || {};
  const eqJuegaTxt = (id) => { const c = eqJuega(id), j = c.j || []; return j.length ? `Jugó de ${j.join(" y ")}` : c.f ? `Puesto en su ficha: ${c.f}` : ""; };
  // el banco: los ocho del 16 al 23 (y más si se suman, hasta el 30)
  const eqHasta = (e) => Math.min(EQ_MAX, Math.max(23 + S.eqmas, ...Object.keys(e.jugadores).map(Number)));
  const errEq = (e, que) => errNotas(e, que, "guardar el equipo");

  function cargarEquipos() {
    if (EQ.cargando) return;
    EQ.cargando = true; EQ.error = null;
    const t0 = Date.now();
    let sinCambio = false;
    apiD1(null, "equipos=1").then((d) => {
      // un equipo que se mandó mientras se traía la lista queda como se mandó
      const nuevos = new Set(Object.keys(EQ_AL).filter((k) => EQ_AL[k] > t0)), de = (x) => nuevos.has(eqClave(x.cat, x.fecha));
      const k0 = S.eqAntes && S.eqAntes.k, antes = k0 && (EQ.lista || []).find((x) => eqClave(x.cat, x.fecha) === k0);
      EQ.lista = d.equipos.filter((x) => !de(x)).concat((EQ.lista || []).filter(de)); EQ.delCel = false; EQ.ts = Date.now(); enCel.set("los50-equipos", JSON.stringify(EQ.lista));
      // si otro cambió ese equipo, "Deshacer" ya no aplica (pisaría lo suyo)
      const ahora = k0 && EQ.lista.find((x) => eqClave(x.cat, x.fecha) === k0);
      if (k0 && (antes ? antes.ts : null) !== (ahora ? ahora.ts : null) && !nuevos.has(k0)) S.eqAntes = null;
    })
      .catch((e) => {
        if (e.message === "clave") { EQ.error = errNotas(e, "No se pudieron cargar los equipos", "ver los equipos"); return; }
        // sin señal: los últimos que se trajeron en este celular (y se puede seguir armando)
        EQ.ts = Date.now(); // se vuelve a probar en un minuto (o al volver la señal), no enseguida
        if (EQ.delCel && EQ.lista) { sinCambio = true; return; } // ya se ve la copia del celular: nada que redibujar
        let c = null;
        try { c = JSON.parse(enCel.get("los50-equipos") || "null"); } catch (x) { /* nada guardado */ }
        EQ.lista = c || []; EQ.delCel = true;
      })
      .finally(() => { EQ.cargando = false; if (sinCambio) return; if (["equipo", "chico", "inicio"].includes(S.ver) || (S.ver === "partidos" && S.aform !== "amistoso") || (S.ver === "area" && S.area === "partidos")) render(); });
  }
  /** en cada partido: el equipo (cuántos hay) y, si ya se jugó, cómo salió lo contado; el día del partido, "Contar el partido" */
  /** el nombre de la pantalla de contar en la que se está (para el título y para el "Volver" de la siguiente) */
  function cntTitulo() {
    const f = S.eqfecha, i = eqInfo(S.eqcat, f), salio = f < hoyISO() || D.partidos.some((p) => p.cat === S.eqcat && p.fecha === f) || (i.pf != null && i.pf !== "");
    const ver = S.cres == null ? f < hoyISO() : S.cres;
    return S.cntCorr ? "Corregir lo contado" : S.cntOtro ? "¿Quién entró?" : ver ? (salio ? "Cómo salió" : "Cómo va") : "Contar el partido";
  }
  /** ya empezó (o no se sabe a qué hora): se puede cargar el resultado */
  const empezo = (x) => x.fecha < hoyISO() || (x.fecha === hoyISO() && (!x.hora || new Date().toTimeString().slice(0, 5) >= x.hora));
  /** ya está por terminar (una hora después de empezar, o no se sabe la hora): se ofrece cargar el resultado */
  const porTerminar = (x) => { if (!empezo(x) || x.fecha < hoyISO() || !x.hora) return empezo(x); const [h, m] = x.hora.split(":").map(Number), t = h * 60 + m + 60; return new Date().toTimeString().slice(0, 5) >= `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
  function eqBtn(x) {
    const e = eqActual(x.cat, x.fecha), t15 = Object.keys(e.jugadores).filter((n) => +n <= 15).length, sup = Object.keys(e.jugadores).length - t15, k = `${x.cat}|${x.fecha}`, p = pendientes(), hoy = hoyISO();
    const ojo = p.includes(`eq:${k}`) || p.includes(`cnt:${k}`) ? "Sin señal: se manda solo cuando vuelva" : eqSinGuardar(x.cat, x.fecha) ? "Guardando…" : "";
    const c = {}, eqp = {};
    if (x.fecha <= hoy) (CNT.lista || []).filter((r) => r.cat === x.cat && r.fecha === x.fecha).forEach((r) => { if (r.id === "equipo") eqp[r.accion] = r.n; else c[r.accion] = (c[r.accion] || 0) + r.n; });
    const cont = [pctDe(c.tackles || 0, c.errados || 0) != null && `Tackles ${pctDe(c.tackles || 0, c.errados || 0)}%`, (eqp.line_g || eqp.line_p) && `Line ${eqp.line_g || 0} de ${(eqp.line_g || 0) + (eqp.line_p || 0)}`].filter(Boolean).join(" · ");
    const txt = !t15 && !sup ? (x.fecha < hoy || (x.pf != null ? x : eqInfo(x.cat, x.fecha)).pf != null && (x.pf != null ? x : eqInfo(x.cat, x.fecha)).pf !== "" ? "Cargar quién jugó" : "Equipo: sin armar todavía") : t15 === 15 ? `Equipo: 15${sup ? ` + ${pl(sup, "suplente", "suplentes")}` : " titulares"}` : `Equipo: faltan ${pl(15 - t15, "titular", "titulares")}`;
    const ii = x.pf != null ? x : eqInfo(x.cat, x.fecha), salio = ii.pf != null && ii.pf !== ""; // con el resultado ya cargado
    const resB = !salio && porTerminar(x) ? `<button type="button" class="btn-sec btn--alto res__contar" data-ir-res="${esc(x.cat)}|${x.fecha}">${IC.trofeo}Cargar el resultado</button>` : "";
    const contarB = t15 && x.fecha === hoy ? `<button type="button" class="${salio ? "btn-sec" : "btn btn--ok"} btn--alto res__contar" data-ir-${salio ? "salio" : "contar"}="${esc(x.cat)}|${x.fecha}">${IC.barras}${salio ? "Cómo salió" : "Contar el partido"}</button>` : "";
    const contar = contarB && resB ? `<span class="res__dos">${contarB}${resB}</span>` : contarB || resB;
    return `<button type="button" class="res__eq" data-ir-equipo="${esc(x.cat)}|${x.fecha}">${IC.camiseta}<span>${txt}${cont ? `<small class="res__eq-cnt">${cont}</small>` : ""}${ojo ? `<small class="res__eq-ojo">${ojo}</small>` : ""}</span>${IC.adelante}</button>${contar}`;
  }
  /** los ya jugados sin resultado: los de la UAR hasta que lo carguen (dos semanas), los amistosos hasta que se cargue cómo salió (dos meses) */
  function jugados(cs) {
    const hoy = hoyISO(), vistos = new Set(), out = [];
    const sumar = (cat, fecha) => {
      const k = eqClave(cat, fecha), px = eqPartido(cat, fecha);
      if (vistos.has(k) || !cs.includes(cat) || fecha >= hoy || fecha < masDias(hoy, px ? -14 : -60) || D.partidos.some((p) => p.cat === cat && p.fecha === fecha)) return;
      const i = eqInfo(cat, fecha);
      if (i.pf !== "" && i.pf != null) return; // con resultado (el de un amistoso o el que cargó un entrenador) va en "Últimos resultados"
      vistos.add(k);
      out.push(px ? { ...px } : amistosoDe(cat, fecha));
    };
    D.prox.forEach((x) => { if (eqAsis(x.cat)) sumar(x.cat, x.fecha); });
    (EQ.lista || []).forEach((e) => sumar(e.cat, e.fecha));
    eqBorradores().forEach(([cat, fecha]) => sumar(cat, fecha));
    return out.sort((a, b) => b.fecha.localeCompare(a.fecha));
  }
  /** los amistosos que vienen (guardados o en el celular) */
  function amistosos(cs, conJugados) { // un amistoso de hoy con resultado ya va con los resultados (salvo en el inicio: "Hoy jugó")
    const hoy = hoyISO(), vistos = new Set(), out = [];
    const sumar = (cat, fecha) => {
      const k = eqClave(cat, fecha);
      if (vistos.has(k) || !cs.includes(cat) || fecha < hoy || eqPartido(cat, fecha)) return;
      const i = eqInfo(cat, fecha);
      if (!conJugados && i.pf !== "" && i.pf != null) return;
      vistos.add(k);
      out.push(amistosoDe(cat, fecha));
    };
    (EQ.lista || []).forEach((e) => sumar(e.cat, e.fecha));
    eqBorradores().forEach(([cat, fecha]) => sumar(cat, fecha));
    return out;
  }
  /** los amistosos con resultado (y los de la UAR con el que cargó un entrenador, hasta que lo cargue la UAR), como un resultado más */
  function amistososJugados(cs) {
    const out = [], vistos = new Set();
    [...(EQ.lista || []).map((e) => [e.cat, e.fecha]), ...eqBorradores().map(([c, f]) => [c, f])].forEach(([cat, fecha]) => {
      const k = eqClave(cat, fecha);
      if (vistos.has(k) || !cs.includes(cat) || D.partidos.some((p) => p.cat === cat && p.fecha === fecha) || fecha > hoyISO()) return;
      const i = eqInfo(cat, fecha);
      if (i.pf === "" || i.pf == null || i.pc === "" || i.pc == null) return;
      vistos.add(k);
      const pf = +i.pf, pc = +i.pc;
      out.push({ cat, fecha, rival: i.rival || "Rival", cond: i.cond || "", pf, pc, res: pf > pc ? "G" : pf < pc ? "P" : "E", amistoso: i.amistoso, prov: !i.amistoso });
    });
    return out;
  }
  /** un amistoso como un partido más de la lista; si no se sabe dónde se juega, "Los 50 – rival" y "cancha a confirmar" */
  const amistosoDe = (cat, fecha) => { const i = eqInfo(cat, fecha); return { cat, fecha, hora: i.hora, cond: i.cond || "", rival: i.rival || "Rival a definir", lugar: i.lugar, inst: "Amistoso", amistoso: true }; };
  const condCampo = (nom, v) => `<fieldset class="asis-form__campo eq-cond"><legend>¿Dónde se juega?</legend><div class="seg seg--g eq-cond__op">
      ${[["L", "Local"], ["V", "Visitante"], ["", "No sé"]].map(([x, l]) => `<label><input type="radio" name="${nom}" value="${x}"${(v || "") === x ? " checked" : ""}><span>${l}</span></label>`).join("")}</div></fieldset>`;
  /** el próximo sábado (el día en que se juega casi siempre) */
  const proxSabado = () => { const h = dia(hoyISO()); return masDias(hoyISO(), (6 - h.getDay() + 7) % 7 || 7); };
  /** el próximo sábado que esa categoría tiene libre (sin partido ni amistoso) */
  const sabadoLibre = (cs) => { let f = proxSabado(); for (let i = 0; i < 8 && cs.some((c) => eqPartido(c, f) || eqGuardado(c, f) || eqBorr.get(eqClave(c, f))); i++) f = masDias(f, 7); return f; };
  // un amistoso: el equipo, el día (también uno ya jugado, para cargarle el resultado o contarlo), la hora, el rival y dónde
  const formAmistoso = (cs) => { const ok = cs.filter(eqAsis), mia = enCel.get(ULTIMA); return `<div class="asis-form"><p class="asis-form__l">Nuevo amistoso</p>
      ${ok.length > 1 ? `<label class="asis-form__campo">¿Qué equipo?<select id="am-cat" class="asis-input">${ok.map((c) => `<option value="${esc(c)}"${eqAsis(c) === mia ? " selected" : ""}>${esc(c)}</option>`).join("")}</select></label>`
        : `<input type="hidden" id="am-cat" value="${esc(ok[0])}">`}
      <div class="asis-form__fila"><label class="asis-form__campo">Día<input id="am-fecha" class="asis-input" type="date" value="${sabadoLibre(ok)}" min="${masDias(hoyISO(), -30)}" max="${masDias(hoyISO(), DIAS_ADELANTE)}" aria-describedby="am-error am-dia"></label>
        <label class="asis-form__campo">Hora<input id="am-hora" class="asis-input" type="time" step="900"></label></div>
      <p class="am-dia" id="am-dia">${esc(mayus(cuandoP({ fecha: sabadoLibre(ok) })))}</p>
      <div class="asis-form__error" id="am-error" role="alert" hidden></div>
      <label class="asis-form__campo">Rival<input id="am-rival" class="asis-input" maxlength="60" autocomplete="off" placeholder="Contra quién"></label>
      ${condCampo("am-cond", "")}
      <fieldset class="asis-form__campo am-res" id="am-res" hidden><legend>¿Cómo salió?</legend><div class="asis-form__fila"><label class="asis-form__campo">Los 50<input id="am-pf" class="asis-input" type="number" inputmode="numeric" min="0" max="300"></label>
        <label class="asis-form__campo"><span id="am-pc-l">El rival</span><input id="am-pc" class="asis-input" type="number" inputmode="numeric" min="0" max="300"></label></div></fieldset>
      <div class="asis-form__btns"><button type="button" class="btn btn--ok btn--alto" data-amistoso-ok>${IC.tilde}Guardar el amistoso</button>${cerrarBtn}</div></div>`; };

  /** el suplente: por quién entra y en qué minuto (se elige al tocar su número) */
  const eqCambioHTML = (num, e, pl) => {
    const cb = e.cambios[num] || {}, ap = (id) => esc(apellido(eqQuien(id, pl).nombre));
    return `<div class="eq-cambio"><p class="eq-cambio__t">¿Por quién entra? <small>(si ya lo sabés)</small></p>
      <label>Entra por<select class="asis-input" data-eq-por="${num}"><option value="">Sin decidir</option>${Array.from({ length: 15 }, (_, i) => i + 1).map((t) =>
        `<option value="${t}"${cb.por === t ? " selected" : ""}>${t}${e.jugadores[t] ? ` · ${ap(e.jugadores[t])}` : ""}</option>`).join("")}</select></label>
      <label>Minuto<select class="asis-input" data-eq-min="${num}"><option value="">Sin decidir</option>${Array.from({ length: 16 }, (_, i) => (i + 1) * 5).map((m) =>
        `<option value="${m}"${cb.min === m ? " selected" : ""}>${m}'</option>`).join("")}</select></label></div>`;
  };
  /** los avisos de un chico: "no" son los que no deberían jugar (en rojo, con una palabra en la camiseta); los demás, para tener en cuenta */
  function eqAvisos(id, c, x) {
    const a = x.al.get(claveNombre(c.nombre)), r = [];
    if (a) r.push(a.n === 3 ? { no: true, duro: true, t: a.t, corto: /conmoci/i.test(a.t) ? "Conmoción" : "Sancionado" } : { no: false, t: a.t });
    const ul = x.recientes && [...x.recientes].reverse().find((l) => l.presentes.includes(id) || l.presentes.includes(LES(id)));
    if (ul && ul.presentes.includes(LES(id))) r.push({ no: true, duro: true, t: `Lesionado (${corta(ul.fecha)})`, corto: "Lesionado" });
    if (x.usaMed && !x.med.has(id)) r.push({ no: true, ficha: true, t: "Sin ficha médica", corto: "Sin ficha" });
    const peso = (z) => (z.duro ? 2 : z.no ? 1 : 0);
    return r.sort((p, q) => peso(q) - peso(p));
  }
  /** cómo va el guardado del equipo, en palabras */
  const estadoEq = (cat, f) => {
    const k = eqClave(cat, f), g = eqGuardado(cat, f);
    if (S.eqChoque && S.eqChoque.k === k) return ["ojo", "Falta elegir: mirá arriba"];
    const sinS = pendientes().includes(`eq:${k}`) || (eqSinGuardar(cat, f) && navigator.onLine === false), va = EQ.guardando || eqSinGuardar(cat, f);
    if (S.eqAntes && S.eqAntes.k === k && S.eqAntes.txt) return [sinS ? "ojo" : va ? "va" : "ok", `${sinS ? "Sin señal" : va ? "Guardando" : "Guardado"} · ${S.eqAntes.txt}`, true];
    if (EQ.guardando) return ["va", "Guardando…"];
    if (pendientes().includes(`eq:${k}`) || (eqSinGuardar(cat, f) && navigator.onLine === false)) return ["ojo", "Sin señal: queda en el celular"];
    if (eqSinGuardar(cat, f)) return ["va", "Guardando…"];
    const d = g && isoDe(new Date(g.ts));
    return g ? ["ok", `Guardado ${d === hoyISO() ? "hoy" : `el ${corta(d)}`} ${horaDe(g.ts)}${g.por ? ` · ${g.por}` : ""}`] : ["", ""];
  };
  /** el estado en la barra; el último cambio, con su "Deshacer" (queda hasta el próximo cambio) */
  const estadoHTML = (c, t, d) => (!t ? "" : `${c === "ok" ? IC.tilde : c === "ojo" ? IC.alerta : ""}<span class="cnt-estado__t">${d ? t : esc(t)}</span>${d ? `<button type="button" class="btn-sec eq-deshacer" data-eq-deshacer>${IC.deshacer}Deshacer</button>` : ""}`);
  function pintarPieEq() {
    if (!(S && S.ver === "equipo" && !S.eqn && !S.eqcontar)) return;
    const s = $("#eq-estado"), [c, t, d] = estadoEq(S.eqcat, S.eqfecha);
    if (s) { s.className = `cnt-estado cnt-estado--${c}`; s.innerHTML = estadoHTML(c, t, d); }
  }
  function vEquipo() {
    const cat = S.eqcat, f = S.eqfecha, hoy = hoyISO();
    if ((!EQ.lista && !EQ.error) || (EQ.lista && !EQ.cargando && Date.now() - (EQ.ts || 0) > 60000)) cargarEquipos();
    if (!DOC.lista && !DOC.error) cargarDocs();
    if (!CNT.lista && !CNT.error) cargarConteos();
    if (S.eqn) return vElegir();
    if (S.eqcontar) return vContar();
    const mc = PS.includes(cat) ? "Plantel superior" : cat;
    const cab = `<div class="cab">${volver(`Partidos de ${esc(mc)}`, { ver: "partidos", mcat: mc, aform: null })}${cabTit(f < hoy ? `Quién jugó en ${esc(cat)}` : `Equipo de ${esc(cat)}`, "equipo")}</div>`;
    if (EQ.error || !EQ.lista) { // solo sin la clave (sin señal se ve lo del celular) o mientras carga la primera vez
      $("#vista").innerHTML = `${cab}<section class="sec sec--pegada">${EQ.error ? `<div class="hoy hoy--error"><p class="hoy__canc">${EQ.error}</p>
        <button type="button" class="btn-sec" data-reintentar-eq>Probar de nuevo</button></div>` : `<p class="cargando">Cargando…</p>`}</section>`;
      return;
    }
    const e = eqActual(cat, f), g = eqGuardado(cat, f), px = eqPartido(cat, f), plt = eqPlantel(cat), cx = eqCtx(), inf = eqInfo(cat, f), amis = !px;
    const n = Object.keys(e.jugadores).length, t15 = Object.keys(e.jugadores).filter((x) => +x <= 15).length, sup = n - t15, hasta = eqHasta(e), corto = nombresCortos(Object.values(e.jugadores), plt);
    const jug = (num, banco) => {
      const id = e.jugadores[num], c = id && eqQuien(id, plt), as = c ? eqAvisos(id, c, cx) : [], no = as.find((a) => a.no);
      return `<button type="button" class="eq-jug${id ? "" : " eq-jug--vacio"}${no ? (no.ficha ? " eq-jug--ficha" : " eq-jug--no") : ""}" data-eq-n="${num}"
        aria-label="${num}${banco ? ", suplente" : `, ${esc(eqPuesto(num))}`}: ${c ? esc(c.nombre) : "sin elegir"}${as.map((a) => `. ${esc(a.t)}`).join("")}"><span class="eq-jug__n num">${num}</span>
        <span class="eq-jug__nom">${c ? esc(corto(id)) : esc(eqCorto(num))}</span>${no ? `<span class="eq-jug__tag${no.ficha ? " eq-jug__tag--ficha" : ""}">${esc(no.corto)}</span>` : ""}</button>`;
    };
    const filaC = (ns) => `<div class="eq-cancha__fila${ns.length === 4 ? " eq-cancha__fila--linea" : ns[0] === 11 ? " eq-cancha__fila--alas" : ""}">${ns.map((x) => jug(x)).join("")}</div>`;
    // el 9 y el 10 en una misma fila: la cancha entra más en la pantalla
    const FILAS = CANCHA;
    // abajo de la cancha: los que no deberían jugar (rojo) y lo que hay que tener en cuenta (amarillo)
    const conAv = Array.from({ length: hasta }, (_, i) => i + 1).filter((num) => e.jugadores[num]).map((num) => { const c = eqQuien(e.jugadores[num], plt); return [num, c, eqAvisos(e.jugadores[num], c, cx)]; }).filter(([, , as]) => as.length);
    const noJ = conAv.filter(([, , as]) => as.some((a) => a.duro)), fichaJ = conAv.filter(([, , as]) => !as.some((a) => a.duro) && as.some((a) => a.ficha)), ojoJ = conAv.filter(([, , as]) => !as.some((a) => a.no));
    const lAv = (l, cls) => `<ul class="eq-avisos${cls}">${l.map(([num, c, as]) => `<li>${cls ? `<button type="button" class="eq-aviso-b" data-eq-n="${num}" aria-label="Cambiar al ${num}, ${esc(c.nombre)}: ${esc(as.map((a) => a.t).join(", "))}">` : ""}<span class="eq-aviso-b__t"><b>${num}. ${esc(corto(c.id))}</b>: ${esc(as.map((a) => a.t).join(" · "))}</span>${cls ? `<span class="eq-aviso-b__acc">Cambiarlo${IC.adelante}</span></button>` : ""}</li>`).join("")}</ul>`;
    const avisos = `${noJ.length ? `<h3 class="grupo grupo--no">No deberían jugar</h3>${lAv(noJ, " eq-avisos--no")}` : t15 ? `<p class="eq-ok">${IC.tilde}<span>Nadie del equipo está anotado como lesionado ni sancionado${cx.usaMed ? "" : " · Las fichas médicas todavía no se cargaron"}</span></p>` : ""}${fichaJ.length ? `<h3 class="grupo">Falta la ficha médica</h3>${lAv(fichaJ, "")}` : ""}${ojoJ.length ? `<h3 class="grupo">Para tener en cuenta</h3>${lAv(ojoJ, "")}` : ""}`;
    // otro entrenador cambió los mismos números: se pregunta solo por esos
    const ch = S.eqChoque && S.eqChoque.k === eqClave(cat, f) ? S.eqChoque : null, apN = (id) => (id ? esc(apellido(eqQuien(id, plt).nombre)) : "nadie");
    const PREG = { rival: "¿Contra quién juegan?", hora: "¿A qué hora?", cond: "¿Dónde se juega?", cita: "¿Cuál es la citación?", pf: "¿Cuántos tantos hizo Los 50?", pc: "¿Cuántos tantos hizo el rival?" };
    const valDato = (k2, v) => (k2 === "cond" ? (v === "L" ? "De local" : v === "V" ? "De visitante" : "No se sabe") : v === "" || v == null ? "Nada" : esc(v));
    const choque = ch ? `<div class="eq-choque" role="alert"><p><b>${ch.por ? esc(ch.por) : "Otro entrenador"} también cambió este partido.</b> Lo demás ya se juntó; falta elegir:</p>
        ${ch.choques.map((x) => `<div class="eq-choque__fila"><p>${x.campo ? PREG[x.campo] : `¿Quién juega de <b>${x.n}</b>?`}</p><div class="asis-form__btns">
          <button type="button" class="btn-sec btn--alto" data-eq-elige="${x.campo ? `d:${x.campo}` : x.n}|${esc(x.mio ?? "")}">${x.campo ? valDato(x.campo, x.mio) : apN(x.mio)} <small>(vos)</small></button>
          <button type="button" class="btn-sec btn--alto" data-eq-elige="${x.campo ? `d:${x.campo}` : x.n}|${esc(x.suyo ?? "")}">${x.campo ? valDato(x.campo, x.suyo) : apN(x.suyo)} <small>(${ch.por ? esc(ch.por) : "el otro"})</small></button></div></div>`).join("")}</div>` : "";
    // el nombre, una sola vez y sin cortar nada: para que los demás sepan quién armó el equipo
    // el nombre se pide abajo, una sola vez (no tapa la cancha)
    const pideNombre = n && !enCel.get(claveNombreNota) && !enCel.get("los50-ent-sin-nombre") ? `<div class="eq-nombre-b"><label class="asis-form__campo">Tu nombre<input id="eq-nombre" class="asis-input" maxlength="60" autocomplete="given-name" placeholder="Por ejemplo: Juan"></label>
        <p class="asis-nota">Lo ven los otros entrenadores: así saben quién armó el equipo.</p>
        <div class="asis-form__btns"><button type="button" class="btn btn--ok btn--alto" data-eq-nombre-ok>${IC.tilde}Listo</button><button type="button" class="link" data-eq-nombre-no>No, gracias</button></div></div>` : "";
    // los datos del partido: en un amistoso, rival, hora y dónde (en uno de la UAR los pone la UAR); y cómo salió
    const deUAR = D.partidos.some((p) => p.cat === cat && p.fecha === f), conRes = deUAR || (inf.pf !== "" && inf.pf != null), res = !deUAR && (f < hoy || (f === hoy && (S.aform === "res-eq" || (inf.pf !== "" && inf.pf != null)))), jugado = f < hoy || (inf.pf !== "" && inf.pf != null) || deUAR;
    const datosForm = S.aform === "datos-eq" && amis ? `<div class="asis-form"><label class="asis-form__campo">Rival<input id="eq-rival" class="asis-input" maxlength="60" autocomplete="off" value="${esc(inf.rival)}"></label>
        <label class="asis-form__campo">Hora del partido<input id="eq-hora" class="asis-input" type="time" step="900" value="${esc(inf.hora)}"></label>${condCampo("eq-cond", inf.cond)}
        <div class="asis-form__btns"><button type="button" class="btn btn--ok btn--alto" data-eq-datos-ok>${IC.tilde}Guardar</button>${cerrarBtn}</div></div>` : "";
    const resForm = res && (inf.pf === "" || inf.pf == null || S.aform === "res-eq") ? `<div class="asis-form eq-res"><p class="asis-form__l">¿Cómo salió?</p>
        <div class="asis-form__fila"><label class="asis-form__campo">Los 50<input id="eq-pf" class="asis-input" type="number" inputmode="numeric" min="0" max="300" aria-describedby="eq-res-error" value="${esc(inf.pf ?? "")}"></label>
          <label class="asis-form__campo">${esc(inf.rival || "Rival")}<input id="eq-pc" class="asis-input" type="number" inputmode="numeric" min="0" max="300" aria-describedby="eq-res-error" value="${esc(inf.pc ?? "")}"></label></div>
        <p class="asis-form__error" id="eq-res-error" role="alert" hidden></p>
        <div class="asis-form__btns"><button type="button" class="btn btn--ok btn--alto" data-eq-res-ok>${IC.tilde}Guardar el resultado</button>${S.aform === "res-eq" ? cerrarBtn : ""}</div>
        ${S.aform === "res-eq" && inf.pf !== "" && inf.pf != null ? `<button type="button" class="link eq-res-borrar" data-eq-res-borrar>Borrar el resultado</button>` : ""}</div>` : "";
    const resTxt = res && !resForm ? `<p class="eq-dato">${IC.trofeo}<span><b>${+inf.pf > +inf.pc ? "Ganó" : +inf.pf < +inf.pc ? "Perdió" : "Empató"} ${esc(inf.pf)}–${esc(inf.pc)}</b>${amis ? "" : " <small>(provisorio, falta la UAR)</small>"}</span><button type="button" class="link" data-form="res-eq" aria-label="Cambiar el resultado">Cambiar</button></p>` : "";
    const datos = datosForm || (resTxt || amis ? `<div class="eq-datos">${resTxt}
        ${amis ? `<button type="button" class="atajo eq-fila-b" data-form="datos-eq">${IC.reloj}<span>Cambiar el rival, la hora o dónde se juega</span>${IC.adelante}</button>` : ""}</div>` : "");
    // contar: el día del partido (o después, para ver cómo salió)
    const cuenta = t15 && (f < hoy || conRes) ? `<button type="button" class="atajo eq-contar" data-eq-contar="salio">${IC.barras}<span>Ver cómo salió</span>${IC.adelante}</button>` : "";
    const siempreB = t15 < 15 ? `<button type="button" class="btn-sec btn-sec--ancho eq-siempre-b" data-eq-siempre>${IC.camiseta}<span>Completar con los de siempre<small>El que más jugó en cada número</small></span></button>` : "";
    const faltan = Array.from({ length: 15 }, (_, i) => i + 1).filter((x) => !e.jugadores[x]);
    const [ce, te, de] = estadoEq(cat, f), hoyJ = f === hoy && t15;
    const noD = S.aform === "faltan" ? noDeberian(cat, f) : [];
    const pie = S.aform === "faltan" ? `<div class="lista-pie eq-pie eq-pie--pregunta" role="alert"><p>${faltan.length ? `Faltan ${pl(faltan.length, "titular", "titulares")} (${faltan.length > 5 ? `${faltan.slice(0, 5).join(", ")}…` : faltan.join(", ").replace(/, (\d+)$/, " y $1")}). ` : ""}${noD.length ? `<span class="eq-pie__no">${noD.map(([num, c, a]) => `${num}. ${esc(corto(c.id))} (${esc(a.corto.toLowerCase())})`).join(", ")}: no debería${noD.length > 1 ? "n" : ""} jugar.</span> ` : ""}¿Mandarlo igual?</p>
        <div class="cnt-pie__btns"><button type="button" class="btn-sec" data-form="">No, todavía no</button><button type="button" class="btn btn--wa" data-eq-mandar="si">Mandarlo igual</button></div></div>`
      : `<div class="lista-pie eq-pie${hoyJ ? " eq-pie--hoy" : ""}"><div class="cnt-pie__txt"><b>${esc(cat)} · <span class="num">${t15}</span> de 15 titulares${sup ? ` + ${pl(sup, "suplente", "suplentes")}` : ""}</b><span id="eq-estado" tabindex="-1" class="cnt-estado cnt-estado--${ce}">${estadoHTML(ce, te, de)}</span></div>
        ${hoyJ ? `<div class="cnt-pie__btns">${conRes ? `<button type="button" class="btn-sec eq-wa-sec" data-cres-compartir aria-label="Mandar cómo salió">${IC.compartir}<span>Mandar<span class="larga"> cómo salió</span></span></button>` : `<button type="button" class="btn-sec eq-wa-sec" data-eq-mandar aria-label="Mandar al grupo">${IC.compartir}<span>Mandar<span class="larga"> al grupo</span></span></button>`}<button type="button" class="btn btn--ok" data-eq-contar aria-label="Contar el partido">${IC.barras}<span>Contar<span class="larga"> el partido</span></span></button></div>`
          : jugado && res && !conRes ? `<button type="button" class="btn btn--ok btn--grande" data-ir-resultado>${IC.trofeo}Cargar el resultado</button>`
          : jugado && (t15 || conRes) ? `<button type="button" class="btn btn--wa btn--grande" data-cres-compartir>${IC.compartir}Mandar cómo salió</button>`
          : jugado ? ""
          : `<button type="button" class="btn btn--wa btn--grande" data-eq-mandar${n ? "" : " disabled"}>${IC.compartir}Mandar al grupo</button>`}</div>`;
    const borrar = S.aform === "borrar-eq" ? `<div class="asis-form"><span class="asis-form__l">${amis ? "¿Borrar este amistoso, su equipo y lo que se contó?" : "¿Borrar el equipo de este partido?"}</span>
        <div class="asis-form__btns"><button type="button" class="btn-sec btn--alto" data-eq-no-borrar>No, dejarlo</button><button type="button" class="btn btn--peligro btn--alto" data-eq-borrar>Borrarlo</button></div></div>`
      : `<button type="button" class="link" data-form="borrar-eq">${amis ? "Borrar este amistoso" : "Borrar este equipo"}</button>`;
    $("#vista").innerHTML = `${cab}
      <p class="titular eq-partido">${[inf.rival ? `vs <b>${esc(inf.rival)}</b>` : "", f === hoy ? "<b>Hoy</b>" : esc(mayus(cuandoP({ fecha: f }))), ...infoTxt(inf).map(esc)].filter(Boolean).join(" · ")}</p>
      ${EQ.delCel || navigator.onLine === false ? `<p class="lista-info lista-info--ojo">${IC.alerta}<span>Sin señal: lo que armes queda en el celular y se manda solo cuando vuelva.</span></p>` : ""}
      ${choque}${n || S.aform === "res-eq" ? resForm : ""}${cuenta}${datos}
      <div class="dos">
        <section class="sec sec--pegada">${tit("Titulares")}${siempreB}
          <div class="eq-cancha"><span class="eq-cancha__tit">Forwards</span>${FILAS.slice(0, 3).map(filaC).join("")}
            <span class="eq-cancha__tit eq-cancha__tit--backs">Backs</span>${FILAS.slice(3).map(filaC).join("")}</div>
          ${avisos}
        </section>
        <section class="sec sec--pegada">${tit("Suplentes")}
          <div class="eq-banco">${Array.from({ length: hasta - 15 }, (_, i) => jug(i + 16, true)).join("")}</div>
          <div class="eq-acc">
            ${hasta < EQ_MAX ? `<button type="button" class="btn-sec btn-sec--ancho" data-eq-mas>${IC.mas}Sumar un suplente</button>` : ""}
            ${jugado && n ? `<button type="button" class="link" data-eq-mandar>Mandar el equipo al grupo</button>` : n ? `<button type="button" class="link" data-eq-texto>Mandar como texto</button>` : ""}
            ${g || n || eqBorr.get(eqClave(cat, f)) ? borrar : ""}
          </div>
          ${pideNombre}
        </section>
      </div>
      ${!n && S.aform !== "res-eq" ? resForm : ""}
      ${pie}
      ${avisoHTML()}`;
    // al volver de elegir, queda a la vista el número que se tocó
    if (S.eqfoco) {
      const b = $(`[data-eq-n="${S.eqfoco}"]`);
      S.eqfoco = null;
      if (b) requestAnimationFrame(() => { b.scrollIntoView({ block: "center" }); b.focus({ preventScroll: true }); });
    }
  }
  /** lo que se necesita para dibujar cada chico: cuánto viene (las últimas 6 prácticas), si está lesionado y si tiene la ficha médica */
  function eqCtx() {
    const e = eqActual(S.eqcat, S.eqfecha);
    const pl = eqPlantel(S.eqcat), med = DOC.lista ? docTienen("medica") : new Map(), da = ASIS.cats[eqAsis(S.eqcat)];
    const ls = da ? listasValidas(da).filter((l) => l.fecha <= hoyISO()).sort((a, b) => a.fecha.localeCompare(b.fecha)) : [];
    return { num: S.eqn, pl, al: eqAlertas(), en: new Map(Object.entries(e.jugadores).map(([n, id]) => [id, +n])), med, usaMed: pl.some((c) => med.has(c.id)),
      ultimas: ls.slice(-6), recientes: ls.filter((l) => l.fecha >= masDias(hoyISO(), -21)) };
  }
  /** "Vino a 4 de 6 prácticas" (de las últimas 6; en amarillo y con "poco" si fue a menos de la mitad) */
  const vinoHTML = (id, x) => {
    const ls = x.ultimas;
    if (!ls || ls.length < 4) return ""; // con pocas listas, cualquier número asusta
    const v = ls.filter((l) => l.presentes.includes(id)).length, poco = v * 2 < ls.length;
    return poco ? `<span class="eq-poco">Vino poco: ${v} de ${ls.length} prácticas</span>` : `Vino a ${v} de ${ls.length} prácticas`;
  };
  // cada chico: su nombre, dónde jugó y cuánto viene; arriba en rojo si no debería jugar
  function eqFila(c, otra, x) {
    const as = otra ? [] : eqAvisos(c.id, c, x), duro = as.filter((a) => a.duro), ficha = as.filter((a) => a.ficha), ojo = as.filter((a) => !a.no), ya = x.en.get(c.id);
    const siempre = !otra && !ya && x.num <= 15 && (eqJuega(c.id).j || [])[0] === x.num;
    const det = [ya ? `<b class="eq-ya">${ya === x.num ? "Está en este número" : `Ya está de ${ya}`}</b>` : esc(eqJuegaTxt(c.id)), otra ? "" : vinoHTML(c.id, x)].filter(Boolean);
    return `<li data-q="${esc(qNom(c.nombre))}"><button type="button" class="eq-it eq-it--elegir${ya === x.num ? " eq-it--este" : ya ? " eq-it--ya" : ""}${duro.length ? " eq-it--no" : ""}" data-eq-id="${esc(c.id)}"${duro.length ? ` data-eq-no="${esc(duro.map((a) => a.t).join(" · "))}"` : ""}>
      <span class="eq-it__txt">${duro.length || ficha.length || siempre ? `<span class="eq-it__tags">${siempre ? `<span class="eq-tag eq-tag--siempre">El de siempre</span>` : ""}${duro.map((a) => `<span class="eq-tag eq-tag--no">${esc(a.corto)}</span>`).join("")}${ficha.length ? `<span class="eq-tag eq-tag--ficha">Sin ficha médica</span>` : ""}</span>` : ""}
        <span class="eq-it__nom">${nombreHTML(c.nombre)}${otra ? ` <span class="chip chip--cat">${esc(otra)}</span>` : ""}</span>
        ${det.length ? `<small>${det.join(" · ")}</small>` : ""}${ojo.length ? `<small class="eq-it__ojo">${esc(ojo.map((a) => a.t).join(" · "))}</small>` : ""}</span>${IC.adelante}</button></li>`;
  }
  /** las categorías de al lado (para buscar a alguien que suba o baje): M15 y M17 para M16; M19 para el plantel superior */
  const vecinas = (ac) => { const i = ASIS_CATS.indexOf(ac); return [ASIS_CATS[i - 1], ASIS_CATS[i + 1]].filter(Boolean); };
  // elegir quién juega en un número: primero los que juegan ahí, después el resto (los que más vienen primero); los que no deberían jugar, al final
  function vElegir() {
    const x = eqCtx(), num = x.num, ac = eqAsis(S.eqcat), e = eqActual(S.eqcat, S.eqfecha), inf = eqInfo(S.eqcat, S.eqfecha), j = (c) => eqJuega(c.id);
    // primero los que pueden jugar y no están en otro número; "Sin ficha" no los manda al fondo (es un aviso, no un impedimento del día)
    const no = (c) => (eqAvisos(c.id, c, x).some((a) => a.duro) ? 1 : 0), enOtro = (c) => (x.en.has(c.id) && x.en.get(c.id) !== num ? 1 : 0);
    const orden = (c) => ((j(c).j || [])[0] === num ? 0 : (j(c).j || []).includes(num) ? 1 : 2);
    const sug = num > 15 ? [] : x.pl.filter((c) => orden(c) < 2 || j(c).f === num).sort((a, b) => enOtro(a) - enOtro(b) || no(a) - no(b) || orden(a) - orden(b) || (b.pct ?? -1) - (a.pct ?? -1) || porNombre(a, b));
    const resto = x.pl.filter((c) => !sug.includes(c)).sort((a, b) => enOtro(a) - enOtro(b) || no(a) - no(b) || (b.pct ?? -1) - (a.pct ?? -1) || porNombre(a, b));
    const actual = e.jugadores[num] && eqQuien(e.jugadores[num], x.pl), conf = S.eqConfirmar;
    const confirma = conf ? `<div class="eq-confirmar" role="alert"><p><b>${esc(apellido(eqQuien(conf.id, x.pl).nombre))}</b>: ${esc(conf.t)}. ¿Lo ponés igual?</p>
        <div class="asis-form__btns"><button type="button" class="btn-sec btn--alto" data-eq-no-confirmar>Elegir otro</button><button type="button" class="btn btn--peligro btn--alto" data-eq-id="${esc(conf.id)}" data-eq-forzar>Ponerlo igual</button></div></div>` : "";
    $("#vista").innerHTML = `
      <div class="cab">${volver(`Equipo de ${esc(S.eqcat)}`, { ver: "equipo", eqn: null })}${cabTit(`¿Quién juega de ${num}?`)}</div>
      <p class="titular eq-partido">${esc(eqPuesto(num))} · ${esc(S.eqcat)}${inf.rival ? ` vs ${esc(inf.rival)}` : ""}</p>
      ${actual ? `<div class="eq-ahora"><p>Ahora: <b>${nombreHTML(actual.nombre)}</b>${eqAvisos(actual.id, actual, x).filter((a) => a.no).map((a) => ` <span class="eq-tag ${a.ficha ? "eq-tag--ficha" : "eq-tag--no"}">${esc(a.corto)}</span>`).join("")}</p><button type="button" class="btn-sec" data-eq-vaciar>Sacarlo</button></div>` : ""}
      ${confirma}
      ${num > 15 && actual ? eqCambioHTML(num, e, x.pl) : ""}
      <section class="sec sec--pegada">
        <label class="buscar-g eq-buscar"><span class="sr">Buscar un chico</span>${IC.buscar}<input type="search" id="buscar-eq" placeholder="Buscar un chico" autocomplete="off" enterkeyhint="search"></label>
        ${sug.length ? `<h3 class="grupo">Juegan de ${num}</h3><ul class="eq-l" data-filtro-eq>${sug.map((c) => eqFila(c, "", x)).join("")}</ul>` : ""}
        <h3 class="grupo">${sug.length ? "Los demás" : "Todos"} de ${esc(ac)}</h3><ul class="eq-l" data-filtro-eq>${resto.map((c) => eqFila(c, "", x)).join("")}</ul>
        <p class="vacio-g" id="eq-nadie" hidden>Nadie con ese nombre en ${esc(ac)} ni en ${esc(vecinas(ac).join(" ni en "))}</p>
        <div id="eq-otros"></div>
      </section>`;
    if (conf) { const b = $(".eq-confirmar button"); if (b) { scrollTo({ top: 0 }); b.focus({ preventScroll: true }); } }
  }
  const numONull = (v) => (v === "" || v == null ? null : +v);
  /** manda el equipo (o lo borra). "base": lo guardado que tenía este celular; si otro lo cambió después, el servidor no lo pisa (409) */
  async function mandarEquipo(cat, fecha, borrar) {
    const k = eqClave(cat, fecha), g = eqGuardado(cat, fecha), px = eqPartido(cat, fecha), b = eqBorr.get(k), e = eqActual(cat, fecha);
    const por = enCel.get(claveNombreNota) || "", base = b && "base" in b ? (b.base ? b.base.ts : null) : g ? g.ts : null;
    const datos = px ? { rival: px.rival, cita: e.cita || "", lugar: e.lugar || "", pf: numONull(e.pf), pc: numONull(e.pc) } : { rival: e.rival || "", hora: e.hora || "", cond: e.cond || "", cita: e.cita || "", lugar: e.lugar || "", pf: numONull(e.pf), pc: numONull(e.pc) };
    const r = await apiD1(borrar ? { accion: "equipo", equipo: cat, fecha, borrar: true, amistoso: !px, jugadores: {}, por, base: g ? g.ts : null }
      : { accion: "equipo", equipo: cat, fecha, ...datos, jugadores: e.jugadores, cambios: e.cambios, amistoso: !px, por, base });
    // queda como guardado aunque después no se pueda volver a traer la lista
    EQ_AL[k] = Date.now();
    EQ.lista = (EQ.lista || []).filter((x) => !(x.cat === cat && x.fecha === fecha));
    const nuevo = !borrar && (Object.keys(e.jugadores).length || !px) ? { cat, fecha, ...datos, jugadores: e.jugadores, cambios: e.cambios, por, ts: r.ts || new Date().toISOString() } : null;
    if (nuevo) EQ.lista.push(nuevo);
    enCel.set("los50-equipos", JSON.stringify(EQ.lista));
    // lo que se cambió mientras se mandaba queda para el próximo envío (con lo recién guardado como base)
    const ahora = eqBorr.get(k);
    if (borrar || !ahora || mismoEq(ahora, nuevo, !!px)) eqBorr.set(k, null); else { ahora.base = nuevo ? copiaEq(nuevo) : null; eqBorr.set(k, ahora); eqProgramar(cat, fecha); }
  }
  /** se guarda solo; sin señal queda para mandar; si otro lo cambió, se juntan los cambios */
  async function guardarEqSolo(cat, f) {
    const k = eqClave(cat, f);
    if (!eqBorr.get(k) || (S.eqChoque && S.eqChoque.k === k)) return;
    if (!eqSinGuardar(cat, f) && eqGuardado(cat, f)) { eqBorr.set(k, null); return; }
    if (EQ.guardando) { eqProgramar(cat, f); return; }
    if (navigator.onLine === false) { ponerPend(`eq:${k}`, true); pintarPieEq(); return; }
    EQ.guardando = true; pintarPieEq();
    try { await mandarEquipo(cat, f); ponerPend(`eq:${k}`, false); }
    catch (err) {
      if (err.message === "choque") { EQ.guardando = false; await resolverChoque(cat, f, err.info || {}); }
      else if (esRed(err)) ponerPend(`eq:${k}`, true);
      else avisar("error", errEq(err, "No se pudo guardar el equipo"));
    } finally { EQ.guardando = false; pintarPieEq(); }
  }
  /** junta lo mío (m) con lo que guardó otro (t), sabiendo de qué partimos (b): de cada número queda el que cambió; si cambiaron los dos, se pregunta */
  function mezclar(m, b, t) {
    const out = { jugadores: {}, cambios: {} }, choques = [], J = (o) => (o && o.jugadores) || {};
    new Set([...Object.keys(J(m)), ...Object.keys(J(b)), ...Object.keys(J(t))]).forEach((n) => {
      const mi = J(m)[n] || "", ba = J(b)[n] || "", su = J(t)[n] || "", v = mi === ba ? su : su === ba || mi === su ? mi : null;
      if (v === null) { choques.push({ n, mio: mi, suyo: su }); if (mi) out.jugadores[n] = mi; } else if (v) out.jugadores[n] = v;
    });
    // un chico que quedó en dos números: queda donde lo puse yo (o donde lo puso el otro, si yo no lo moví)
    const pos = {};
    Object.entries(out.jugadores).forEach(([n, id]) => (pos[id] ??= []).push(n));
    // (si ese chico está en un número que hay que elegir, queda en los dos hasta que se elija: al elegir, sale del otro)
    const enChoque = new Set(choques.filter((c) => !c.campo).flatMap((c) => [c.mio, c.suyo]));
    Object.entries(pos).forEach(([id, ns]) => { if (ns.length > 1 && !enChoque.has(id)) { const deja = ns.find((n) => J(m)[n] === id) || ns[0]; ns.filter((n) => n !== deja).forEach((n) => delete out.jugadores[n]); } });
    const C = (o, n) => JSON.stringify(((o && o.cambios) || {})[n] || null);
    new Set([...Object.keys((m && m.cambios) || {}), ...Object.keys((t && t.cambios) || {})]).forEach((n) => { const de = C(m, n) === C(b, n) ? t : m; if (de.cambios && de.cambios[n]) out.cambios[n] = de.cambios[n]; });
    DATOS.forEach((x) => {
      const s = (o) => (o && o[x] != null ? String(o[x]) : ""), cm = s(m) !== s(b), ct = s(t) !== s(b);
      if (cm && ct && s(m) !== s(t)) { choques.push({ campo: x, mio: m[x] ?? "", suyo: t[x] ?? "" }); out[x] = m[x]; }
      else out[x] = cm ? m[x] : t ? t[x] ?? "" : "";
    });
    return { e: out, choques };
  }
  async function resolverChoque(cat, f, info) {
    const k = eqClave(cat, f);
    try { const d = await apiD1(null, "equipos=1"); EQ.lista = d.equipos; enCel.set("los50-equipos", JSON.stringify(d.equipos)); } catch (x) { ponerPend(`eq:${k}`, true); return; }
    const b = eqBorr.get(k), t = eqGuardado(cat, f);
    if (!b) return;
    S.eqAntes = null; // "Deshacer" después de juntar pisaría lo del otro
    const { e, choques } = mezclar(b, b.base, t);
    e.base = t ? copiaEq(t) : null;
    eqBorr.set(k, t && mismoEq(e, t, !!eqPartido(cat, f)) ? null : e);
    const quien = info.por || (t && t.por) || "";
    if (choques.length) {
      S.eqChoque = { k, por: quien, choques };
      avisar("ojo", `${quien ? esc(quien) : "Otro entrenador"} también cambió este partido: arriba elegís con qué quedarte.`);
    } else {
      const nums = Object.keys({ ...((t && t.jugadores) || {}), ...((b.base && b.base.jugadores) || {}) }).filter((n) => ((t && t.jugadores[n]) || "") !== ((b.base && b.base.jugadores[n]) || ""));
      avisar("ok", `${quien ? esc(quien) : "Otro entrenador"} también cambió el equipo${nums.length ? ` (${nums.slice(0, 4).join(", ")}${nums.length > 4 ? "…" : ""})` : ""}: se juntaron los cambios`);
      eqProgramar(cat, f);
    }
    if (S.ver === "equipo" && S.eqcat === cat && S.eqfecha === f) render();
  }
  async function borrarEquipo() {
    const cat = S.eqcat, fecha = S.eqfecha, k = eqClave(cat, fecha), g = eqGuardado(cat, fecha), amis = !eqPartido(cat, fecha);
    clearTimeout(EQ_T[k]);
    const listo = () => { eqBorr.set(k, null); enCel.set(cntClave(cat, fecha), null); ponerPend(`eq:${k}`, false); S.aform = null; avisar("ok", amis ? "Amistoso borrado" : "Equipo borrado"); if (amis) volverAtras(AREA_IR("partidos")); else render(); };
    if (!g) { listo(); return; } // estaba solo en este celular: no hace falta señal
    EQ.guardando = true;
    try { await mandarEquipo(cat, fecha, true); EQ.guardando = false; listo(); }
    catch (err) { EQ.guardando = false; avisar("error", err.message === "choque" ? "Otro entrenador cambió este equipo recién: miralo antes de borrarlo." : errEq(err, "No se pudo borrar")); if (err.message === "choque") cargarEquipos(); render(); }
  }
  /** completa los titulares que faltan con "los de siempre": el que más juega de ese número, no está en otro y no está sancionado ni lesionado */
  function completarDeSiempre() {
    const x = eqCtx(), e = eqActual(S.eqcat, S.eqfecha), usados = new Set(Object.values(e.jugadores)), j = (c) => eqJuega(c.id).j || [];
    const duro = (c) => eqAvisos(c.id, c, x).some((a) => a.duro);
    let n = 0;
    for (let num = 1; num <= 15; num++) {
      if (e.jugadores[num]) continue;
      const c = x.pl.filter((y) => !usados.has(y.id) && !duro(y) && (j(y).includes(num) || eqJuega(y.id).f === num))
        .sort((a, b) => (j(a)[0] === num ? 0 : 1) - (j(b)[0] === num ? 0 : 1) || (b.pct ?? -1) - (a.pct ?? -1))[0];
      if (c) { e.jugadores[num] = c.id; usados.add(c.id); n++; }
    }
    // el de siempre de cada número que no va por lesionado o sancionado
    const afuera = x.pl.filter((y) => !usados.has(y.id) && duro(y) && j(y)[0] && j(y)[0] <= 15).map((y) => `${apellido(y.nombre)} (${eqAvisos(y.id, y, x).find((a) => a.duro).corto.toLowerCase()})`);
    return { e, n, afuera };
  }
  /** "Mandar al grupo": si faltan titulares se pregunta; se guarda lo pendiente y se manda la imagen con el texto */
  /** los del equipo que no deberían jugar (lesionado, sancionado): [número, chico, aviso] */
  const noDeberian = (cat, f) => { const e = eqActual(cat, f), pl = eqPlantel(cat), cx = eqCtx();
    return Object.keys(e.jugadores).map(Number).sort((a, b) => a - b).map((n) => { const c = eqQuien(e.jugadores[n], pl); return [n, c, eqAvisos(c.id, c, cx).find((a) => a.duro)]; }).filter(([, , a]) => a); };
  function mandarAlGrupo(si) {
    const cat = S.eqcat, f = S.eqfecha, e = eqActual(cat, f);
    if (!si && (Array.from({ length: 15 }, (_, i) => i + 1).some((x) => !e.jugadores[x]) || noDeberian(cat, f).length)) { S.aform = "faltan"; render(); const b = $(".eq-pie--pregunta button"); if (b) b.focus(); return; }
    if (S.aform === "faltan") { S.aform = null; render(); }
    if (eqSinGuardar(cat, f)) { clearTimeout(EQ_T[eqClave(cat, f)]); guardarEqSolo(cat, f); }
    compartirEquipo();
  }
  /** el equipo en texto, para WhatsApp */
  function textoEquipo() {
    const cat = S.eqcat, f = S.eqfecha, e = eqActual(cat, f), pl = eqPlantel(cat), inf = eqInfo(cat, f);
    const ns = Object.keys(e.jugadores).map(Number).sort((a, b) => a - b), sup = ns.filter((n) => n > 15);
    const nom = (id) => { const [ape, n = ""] = eqQuien(id, pl).nombre.split(",").map((x) => x.trim()); return n ? `${n} ${ape}` : ape; }; // "Bautista Llanos", como se dice
    const l = [`*Los 50 · ${cat}*`, [inf.rival ? `vs ${inf.rival}` : "", mayus(cuandoP({ fecha: f })), ...infoTxt(inf)].filter(Boolean).join(" · ")];
    l.push("");
    ns.filter((n) => n <= 15).forEach((n) => l.push(`${n}. ${nom(e.jugadores[n])}`));
    if (sup.length) l.push("", "*Suplentes*");
    sup.forEach((n) => {
      const c = e.cambios[n], cuando = c ? [c.por ? `entra por el ${c.por}` : "", c.min ? `${c.min}'` : ""].filter(Boolean).join(", ") : "";
      l.push(`${n}. ${nom(e.jugadores[n])}${cuando ? ` (${cuando})` : ""}`);
    });
    return l.join("\n");
  }

  // ---------- notas entre entrenadores (functions/api/asistencia.js, tabla "notas" de D1) ----------
  // Cualquiera con la clave las lee. Cada nota guarda el nombre de quien la escribió (queda en el celular para no repetirlo)
  // y un código del celular: con ese código, y solo con ese, se puede borrar la propia.
  const NOTAS = { lista: null, error: null, cargando: false };
  const claveNombreNota = "los50-ent-nombre", claveDueno = "los50-ent-dueno";
  const duenoDeNotas = () => {
    let d = enCel.get(claveDueno);
    if (!d) { d = [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, "0")).join(""); enCel.set(claveDueno, d); }
    return d;
  };
  async function apiD1(cuerpo, q = "notas=1") {
    // con señal mala, sin respuesta en un rato es como sin señal ("Cargando…" no queda para siempre)
    const ctl = typeof AbortController === "function" ? new AbortController() : null, t = ctl && setTimeout(() => ctl.abort(), cuerpo ? 20000 : 10000);
    let r;
    try {
      r = await fetch(cuerpo ? "api/asistencia" : `api/asistencia?${q}`, {
        method: cuerpo ? "POST" : "GET", cache: "no-store", signal: ctl ? ctl.signal : undefined,
        headers: { "x-ficha": fichaGuardada(), "x-dueno": duenoDeNotas(), ...(cuerpo ? { "content-type": "application/json" } : {}) },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      });
    } finally { clearTimeout(t); }
    if (r.status === 401) throw new Error("clave");
    if (r.status === 409) { const e = new Error("choque"); e.info = await r.json().catch(() => ({})); throw e; }
    if (!r.ok) throw new Error("servidor");
    return r.json();
  }
  const errNotas = (e, que, para = "usar las notas") => (e.message === "clave" ? `Para ${para} hay que volver a poner la clave. <button type="button" class="link" data-reclave>Poner la clave</button>`
    : `${que}${e.message === "servidor" ? "." : ": no hay señal."} Probá de nuevo en un rato.`);
  function cargarNotas() {
    if (NOTAS.cargando) return;
    NOTAS.cargando = true; NOTAS.error = null;
    apiD1().then((d) => { NOTAS.lista = d.notas; enCel.set("los50-notas", JSON.stringify(d.notas)); })
      .catch((e) => {
        let c = null;
        try { c = JSON.parse(enCel.get("los50-notas") || "null"); } catch (x) { /* nada guardado */ }
        if (c && S.ver !== "notas") NOTAS.lista = c; else NOTAS.error = errNotas(e, "No se pudieron cargar las notas");
      })
      .finally(() => { NOTAS.cargando = false; if (["notas", "plan", "practica"].includes(S.ver) || (S.ver === "lista" && S.aform !== "como-salio")) render(); });
  }
  /** guarda o borra una nota; si falla no se vuelve a dibujar, así lo escrito no se pierde */
  async function guardarNota(cuerpo, ok) {
    if (NOTAS.guardando) return;
    NOTAS.guardando = true;
    avisoSuelto("Guardando…", "espera");
    try {
      await apiD1({ dueno: duenoDeNotas(), ...cuerpo });
      NOTAS.lista = (await apiD1()).notas;
      avisar("ok", ok);
      const nt = $("#nota-texto");
      if (cuerpo.accion === "nota" && nt) nt.value = "";
      S.aform = null;
      render();
    } catch (e) { avisoSuelto(errNotas(e, "No se pudo guardar")); }
    finally { NOTAS.guardando = false; }
  }
  /** las notas de una categoría de ese día (las de "¿Cómo salió?" y las que se escribieron ese día en Notas) */
  const notasDe = (cat, f) => (NOTAS.lista || []).filter((n) => n.cat === cat && n.fecha === f);
  const formComoSalio = () => `<div class="asis-form">
      <label class="asis-form__campo">Lo que anduvo bien y lo que hay que volver a trabajar<textarea id="cs-texto" class="asis-input asis-input--nota" maxlength="600" rows="3" placeholder="Por ejemplo: el ruck salió lento; repetir el juego de pases">${esc(S.csTexto || "")}</textarea></label>
      ${enCel.get(claveNombreNota) ? "" : `<label class="asis-form__campo">Tu nombre<input id="cs-por" class="asis-input" maxlength="60" autocomplete="given-name"></label>`}
      <div class="asis-form__btns"><button type="button" class="btn btn--ok btn--alto" data-cs-ok>${IC.tilde}Guardar</button>${cerrarBtn}</div></div>`;
  /** en la lista de un día: lo que se anotó de cómo salió y para anotar */
  function comoSalioHTML(cat, f) {
    if (!NOTAS.lista && !NOTAS.error) cargarNotas();
    const ns = notasDe(cat, f);
    return `${ns.length ? `<ul class="cs-l">${ns.map((n) => `<li><p>${esc(n.texto)}</p><small>${esc(n.por || "")}</small></li>`).join("")}</ul>` : ""}
      ${S.aform === "como-salio" ? formComoSalio() : `<button type="button" class="btn-sec btn-sec--ancho" data-form="como-salio">${IC.nota}${ns.length ? "Sumar otra nota" : "Anotar cómo salió"}</button>`}`;
  }
  /** en la semana de Planificación: cómo salió ese día o, si todavía no hay nada, el mismo día de la semana pasada */
  function notaDia(cat, f) {
    if (!NOTAS.lista) return "";
    const h = f <= hoyISO() ? notasDe(cat, f) : [], p = h.length ? [] : notasDe(cat, masDias(f, -7)), ns = h.length ? h : p;
    return ns.length ? `<small class="prac__nota">${IC.nota}<span>${h.length ? "Cómo salió" : "La semana pasada"}: ${ns.map((n) => esc(n.texto)).join(" · ")}</span></small>` : "";
  }
  const formNota = (b) => `<div class="asis-form">
      <label class="asis-form__campo">¿De qué categoría?<select id="nota-cat" class="asis-input">${["General", ...ASIS_CATS].map((c) => `<option value="${esc(c)}"${(b.cat || S.ncat || enCel.get(ULTIMA) || "General") === c ? " selected" : ""}>${c === "General" ? "General (todo el club)" : esc(c)}</option>`).join("")}</select></label>
      <label class="asis-form__campo">Tu nota<textarea id="nota-texto" class="asis-input asis-input--nota" maxlength="600" rows="4" placeholder="Por ejemplo: el ejercicio del cono quedó largo">${esc(b.texto || "")}</textarea></label>
      <label class="asis-form__campo">Tu nombre<input id="nota-por" class="asis-input" maxlength="60" autocomplete="given-name" value="${esc(b.por || enCel.get(claveNombreNota) || "")}"></label>
      <div class="asis-form__btns"><button type="button" class="btn btn--ok btn--alto" data-nota-ok>${IC.tilde}Guardar la nota</button>${cerrarBtn}</div></div>`;
  function vNotas() {
    const t0 = $("#nota-texto");
    if (t0) NOTAS.borrador = { texto: t0.value, por: $("#nota-por").value, cat: $("#nota-cat").value };
    if (!NOTAS.lista && !NOTAS.error) cargarNotas();
    const todas = NOTAS.lista || [], cats = ["General", ...ASIS_CATS].filter((c) => todas.some((n) => n.cat === c));
    if (S.ncat && !cats.includes(S.ncat)) S.ncat = null;
    const ver = todas.filter((n) => !S.ncat || n.cat === S.ncat);
    const fila = (n) => `<li class="nota"><div class="nota__cab"><b>${n.cat === "General" ? "Todo el club" : esc(n.cat)}</b><span>${esc(n.por || "")} · ${esc(cuandoP({ fecha: n.fecha }))}${n.fecha.slice(0, 4) === hoyISO().slice(0, 4) ? "" : ` de ${n.fecha.slice(0, 4)}`}</span></div>
      <p class="nota__txt">${esc(n.texto)}</p>
      ${!n.mia ? "" : S.aform === `borrar-nota:${n.id}` ? `<div class="asis-form"><span class="asis-form__l">¿Borrar esta nota?</span>
        <div class="asis-form__btns"><button type="button" class="btn btn--peligro btn--alto" data-borrar-nota-ok="${n.id}">Borrarla</button>${cerrarBtn}</div></div>`
        : `<button type="button" class="link nota__borrar" data-form="borrar-nota:${n.id}">Borrar mi nota</button>`}</li>`;
    $("#vista").innerHTML = `
      <div class="cab">${volver()}${cabTit("Notas", "notas")}</div>
      <section class="sec sec--pegada">
        ${S.aform === "nota" ? formNota(NOTAS.borrador || {}) : `<button type="button" class="btn-sec btn-sec--ancho asis-mas" data-form="nota">${IC.mas}Escribir una nota</button>`}
        ${cats.length > 1 ? `<div class="chips-g" role="group" aria-label="Categoría">${[["", "Todas"], ...cats.map((c) => [c, c === "General" ? "Todo el club" : c])].map(([v, l]) =>
          `<button type="button" data-ncat="${esc(v)}" aria-pressed="${(S.ncat || "") === v}">${esc(l)}</button>`).join("")}</div>` : ""}
        ${NOTAS.error ? `<div class="hoy hoy--error"><p class="hoy__canc">${NOTAS.error}</p><button type="button" class="btn-sec" data-reintentar-notas>Probar de nuevo</button></div>`
          : !NOTAS.lista ? `<p class="cargando">Cargando…</p>`
          : ver.length ? `<ul class="notas">${ver.map(fila).join("")}</ul>` : `<p class="vacio-g">Todavía no hay notas</p>`}
      </section>${avisoHTML()}`;
  }

  // ---------- de M19 a plantel superior (pase_y_alertas.py) ----------
  // Cuántos chicos que jugaron en M19 jugaron en plantel superior la temporada siguiente, de dónde vienen los del plantel superior y quiénes son.
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
  /** una barra con partes (el número adentro, si entra) */
  const barraPase = (partes, aria) => `<div class="pase-barra" role="img" aria-label="${esc(aria)}">${partes.map(([n, cls]) => (n ? `<i class="${cls}" style="flex-grow:${n}">${n}</i>` : "")).join("")}</div>`;
  const leyPase = (items) => `<ul class="pase-ley">${items.map(([cls, t]) => `<li><i class="${cls}"></i>${t}</li>`).join("")}</ul>`;
  function vPase() {
    const P = D.pase, cerradas = P.cohortes.filter((c) => c.sig && !c.en_curso), ult = cerradas.at(-1), curso = P.cohortes.find((c) => c.en_curso);
    const por = (c) => pct(c.subieron, c.m19), n3 = cerradas.slice(-3).map(por);
    const tend = n3.length === 3 && n3[2] <= n3[0] - 10 ? `Viene bajando: ${n3.join("% → ")}%` : n3.length === 3 && n3[2] >= n3[0] + 10 ? `Viene subiendo: ${n3.join("% → ")}%` : "";
    const filaC = (c) => `<li class="pase-f"><div class="pase-f__cab"><b>${c.anio} → ${c.sig}</b><span>${c.m19} en M19${c.en_curso ? " · sigue la temporada" : ""}</span><strong class="num">${por(c)}%</strong></div>
      ${barraPase([[c.subieron, "s1"], [c.juveniles, "s2"], [c.no, "s3"]], `${c.subieron} jugaron en plantel superior, ${c.juveniles} siguen en juveniles, ${c.no} no volvieron a jugar`)}</li>`;
    const o = P.origen.at(-1), filaO = (x) => `<li class="pase-f"><div class="pase-f__cab"><b>${x.anio}</b><span>${x.total} jugadores</span><strong class="num">${pct(x.juveniles, x.total)}%</strong></div>
      ${barraPase([[x.juveniles, "s1"], [x.llegaron, "s4"], [x.ya, "s2"]], `${x.juveniles} salieron de las juveniles, ${x.llegaron} llegaron al club, ${x.ya} ya estaban`)}</li>`;
    const nm = P.nombres, lista = (xs) => (xs.length ? `<ul class="nombres-p">${xs.map((n) => `<li>${nombreHTML(n)}</li>`).join("")}</ul>` : `<p class="vacio-g">Nadie</p>`);
    $("#vista").innerHTML = `
      <div class="cab">${volver(AREAS.estadisticas, AREA_IR("estadisticas"))}${cabTit("De M19 a plantel superior", "pase")}</div>
      <div class="dos">
        <section class="sec sec--pegada">${tit("Los de M19: ¿qué hicieron después?")}
          ${ult ? `<p class="titular">De los <b>${ult.m19}</b> que jugaron en M19 en ${ult.anio}, <b>${ult.subieron}</b> (<b>${por(ult)}%</b>) jugaron en plantel superior en ${ult.sig}${tend ? `. <span class="junto">${tend}</span>` : ""}</p>` : ""}
          ${curso ? `<p class="titular">Este año, hasta ahora: <b>${curso.subieron}</b> de los <b>${curso.m19}</b> de M19 de ${curso.anio} jugaron en plantel superior en ${curso.sig} (<b>${por(curso)}%</b>)</p>` : ""}
          ${leyPase([["s1", "Jugaron en plantel superior"], ["s2", "Siguen en juveniles"], ["s3", "No volvieron a jugar"]])}
          <ul class="pase-g">${P.cohortes.filter((c) => c.sig).slice().reverse().map(filaC).join("")}</ul>
        </section>
        <section class="sec sec--pegada">${tit("¿De dónde vienen los del plantel superior?")}
          ${o ? `<p class="titular">En ${o.anio}, <b>${o.juveniles}</b> de los <b>${o.total}</b> jugadores (<b>${pct(o.juveniles, o.total)}%</b>) pasaron por las juveniles del club${o.llegaron ? `; <b>${o.llegaron}</b> llegaron de afuera` : ""}</p>` : ""}
          ${leyPase([["s1", "Salieron de las juveniles"], ["s4", "Llegaron al club"], ["s2", "Ya estaban"]])}
          <ul class="pase-g">${P.origen.slice().reverse().map(filaO).join("")}</ul>
        </section>
      </div>
      <section class="sec">${tit("Quiénes son")}
        ${desple("pase-act", `M19 de ${nm.actual.anio}`, `<h3 class="grupo">Ya jugaron en plantel superior (${nm.actual.ya.length})</h3>${lista(nm.actual.ya)}
          <h3 class="grupo">Todavía no (${nm.actual.todavia.length})</h3>${lista(nm.actual.todavia)}`, `${nm.actual.ya.length} de ${nm.actual.ya.length + nm.actual.todavia.length}`)}
        ${nm.anterior ? desple("pase-ant", `M19 de ${nm.anterior.anio}`, `<h3 class="grupo">Jugaron en plantel superior (${nm.anterior.subieron.length})</h3>${lista(nm.anterior.subieron)}
          <h3 class="grupo">Siguen en juveniles (${nm.anterior.juveniles.length})</h3>${lista(nm.anterior.juveniles)}
          <h3 class="grupo">No volvieron a jugar este año (${nm.anterior.no.length})</h3>${lista(nm.anterior.no)}`, `${nm.anterior.subieron.length} de ${nm.anterior.subieron.length + nm.anterior.juveniles.length + nm.anterior.no.length}`) : ""}
      </section>`;
  }

  // ---------- para mirar: sanciones, conmociones, rojas y amarillas (se calcula con el día de hoy, no con el día en que se armó el archivo) ----------
  const NIVEL = { 3: "Importante", 2: "Para tener en cuenta" };
  /** "falta la práctica": un grupo que hoy entrena (en sus días de las últimas seis semanas) y no tiene la práctica de hoy.
      Solo si las planillas del Drive se leyeron hoy: con planillas de antes, la de hoy puede estar escrita y no haber llegado.
      Un grupo sin prácticas en el último mes no se avisa todos los días (eso se ve en Planificación) */
  function faltanPracticas() {
    const g = D.guia, hoy = hoyISO();
    if (!g || !g.practicas || g.practicas_al !== hoy) return [];
    const out = [];
    [...new Set(g.practicas.map((p) => p.grupo))].forEach((gr) => {
      const ps = g.practicas.filter((p) => p.grupo === gr && p.fecha && p.fecha >= masDias(hoy, -42));
      if (!ps.some((p) => p.fecha >= masDias(hoy, -30)) || ps.some((p) => p.fecha === hoy)) return;
      if (diasHabituales(ps).has(dia(hoy).getDay())) out.push({ n: 2, j: gr, c: null, t: "Entrena hoy y todavía no tiene la práctica en la planilla" });
    });
    return out;
  }
  /** al elegir la categoría en Planificación: de cuándo son las planillas del Drive (si no se leyeron hace poco, lo nuevo no aparece) */
  const avisoPracticas = () => {
    const al = D.guia && D.guia.practicas_al;
    return al && al < masDias(hoyISO(), -2) ? `<p class="lista-info">${IC.alerta}<span>La app leyó las planillas del Drive el ${esc(corta(al))}: lo que se escribió después todavía no se ve acá.</span></p>` : "";
  };
  /** arriba de la planificación de una categoría: hasta cuándo hay prácticas y a quién pedirle las que faltan */
  const avisoPlan = (u) => {
    const al = D.guia.practicas_al, hoy = hoyISO(), tarde = !!al && al < masDias(hoy, -2);
    if (!u) return "";
    // atrasado: la última es de bastante antes de que se leyeran las planillas (o, si se leyeron hace poco, de hace más de una semana)
    if (u.fecha < masDias(tarde ? al : hoy, tarde ? -10 : -7))
      return `<p class="lista-info lista-info--ojo">${IC.alerta}<span>La última práctica en la planilla es del ${esc(corta(u.fecha))}. Si hay nuevas, pedíselas a ${esc(u.quien)}.</span></p>`;
    return tarde ? `<p class="lista-info">${IC.alerta}<span>La app leyó las planillas el ${esc(corta(al))}: si ${esc(u.quien)} escribió prácticas después, todavía no se ven acá.</span></p>` : "";
  };
  function alertasHoy() {
    const A_ = D.alertas;
    if (!A_) return [];
    const hoy = hoyISO(), out = [], sancionados = new Set();
    A_.sanciones.filter((s) => s.hasta >= hoy && (!s.desde || s.desde <= hoy)).forEach((s) => {
      sancionados.add(s.j);
      out.push({ n: 3, j: s.j, c: s.c, t: `Sancionado hasta el ${corta(s.hasta)}${s.art ? ` (${s.art})` : ""}` });
    });
    A_.conmociones.filter((x) => x.alta && x.alta >= hoy && x.f <= hoy).forEach((x) =>
      out.push({ n: 3, j: x.j, c: x.c, t: `En protocolo de conmoción. Alta prevista: ${corta(x.alta)}` }));
    A_.tarjetas.filter((x) => x.t === "R" && x.f >= masDias(hoy, -21) && !sancionados.has(x.j)).forEach((x) =>
      out.push({ n: 2, j: x.j, c: x.c, t: `Roja el ${corta(x.f)}: fijate si quedó suspendido` }));
    const am = {};
    A_.tarjetas.filter((x) => x.t === "A" && x.f >= masDias(hoy, -60)).forEach((x) => (am[x.j] ??= []).push(x));
    Object.entries(am).filter(([, v]) => v.length >= 2).forEach(([j, v]) =>
      out.push({ n: 2, j, c: v[0].c, t: `${v.length} amarillas en los últimos 60 días (la última, el ${corta(v[0].f)})` }));
    out.push(...faltanPracticas());
    // los que dejaron de venir: de las categorías abiertas, con todo; de las demás, lo que dice el resumen
    const vistas = new Set();
    Object.entries(ASIS.cats).forEach(([cat, d]) => { if (d) { vistas.add(cat); dejaronDe(cat, d).forEach((c) => out.push({ n: 2, j: c.nombre, c: cat, t: "Faltó a los últimos 3 entrenamientos: llamalo" })); } });
    const r = ASIS.resumen;
    if (r && r.dejaron && D.fichados) Object.entries(r.dejaron).forEach(([cat, ids]) => { if (!vistas.has(cat)) ids.forEach((id) => {
      const n = (eqTodos().get(id) || {}).nombre || (r.nombres || {})[id];
      if (n) out.push({ n: 2, j: n, c: cat, t: "Faltó a los últimos 3 entrenamientos: llamalo" });
    }); });
    return out.sort((a, b) => b.n - a.n || (a.c || "").localeCompare(b.c || "") || a.j.localeCompare(b.j, "es"));
  }
  const alertaFila = (a) => `<li class="alerta alerta--${a.n}"><span class="alerta__ic">${IC.alerta}</span><span class="alerta__txt">
    <span class="alerta__j">${nombreHTML(a.j)}${a.c ? `<span class="chip chip--cat">${esc(a.c)}</span>` : ""}</span><small>${esc(a.t)}</small></span></li>`;
  /** la tarjeta del inicio: las 3 más importantes; se toca y abre todas */
  function alertasInicio() {
    const al = alertasHoy();
    if (!al.length) return "";
    return `<section class="sec sec--pegada"><button type="button" class="alertas-c" data-ir="alertas" aria-label="Para mirar: ${al.length}. Ver todas">
      <span class="alertas-c__cab"><b>Para mirar</b><span class="alertas-c__n num">${al.length}</span>${IC.adelante}</span>
      <ul class="alertas-c__l">${al.slice(0, 3).map(alertaFila).join("")}</ul></button></section>`;
  }
  function vAlertas() {
    const todas = alertasHoy(), cats = [...new Set(todas.map((a) => a.c).filter(Boolean))].sort((a, b) => ((D.cats.indexOf(a) + 1) || 99) - ((D.cats.indexOf(b) + 1) || 99));
    if (S.alcat && !cats.includes(S.alcat)) S.alcat = null;
    const al = todas.filter((a) => !S.alcat || a.c === S.alcat), grupo = (n) => (al.some((a) => a.n === n)
      ? `<h3 class="grupo">${NIVEL[n]}</h3><ul class="alertas-g">${al.filter((a) => a.n === n).map(alertaFila).join("")}</ul>` : "");
    $("#vista").innerHTML = `
      <div class="cab">${volver()}${cabTit("Para mirar", "alertas")}</div>
      ${cats.length > 1 ? `<div class="chips-g" role="group" aria-label="Categoría">${[["", "Todas"], ...cats.map((c) => [c, c])].map(([v, l]) =>
        `<button type="button" data-alcat="${esc(v)}" aria-pressed="${(S.alcat || "") === v}">${esc(l)}</button>`).join("")}</div>` : ""}
      <section class="sec sec--pegada">${al.length ? grupo(3) + grupo(2) : `<p class="vacio-g">Nada para mirar por ahora</p>`}</section>`;
  }

  // la categoría, adentro de un área: botones grandes, de a tres por fila (de a cuatro en infantiles); la última que elegiste, marcada
  function vArea() {
    // en Asistencia, la última categoría es la última en la que se entró (la misma que usa el inicio)
    const a = S.area, ult = a === "asistencia" ? enCel.get(ULTIMA) : enCel.get(claveArea(a));
    const cab = (t, k) => `<div class="cab">${volver()}${cabTit(t, k)}</div>`;
    if (a === "estadisticas") {
      // en estadísticas, la tabla de categorías con ganados, empatados y perdidos (ya es un dato) y lo del club
      $("#vista").innerHTML = `${cab(AREAS.estadisticas, "categorias")}
        <section class="sec sec--pegada">
          ${tablaCats("Plantel superior", D.cats.filter((c) => PS.includes(c)))}
          ${tablaCats("Juveniles", D.cats.filter((c) => !PS.includes(c)))}
          <h3 class="grupo">Todo el club</h3>
          <ul class="menu">${D.pase ? opcion("pase", IC.sube, "De M19 a plantel superior", "Cuántos suben cada año y de dónde vienen") : ""}${opcion("club", IC.gente, "¿Los chicos siguen?", "Cuántos siguen y llegan a Primera")}${opcion("consejos", IC.idea, "Consejos", "Qué trabajar y qué empezar a medir")}</ul>
        </section>`;
      return;
    }
    // en Planificación, debajo de cada categoría, el día de su última práctica (en amarillo si no hay ninguna en dos semanas)
    const ultDe = (c) => (a === "planificacion" ? ultimaPr(grupoPlan(c)) : null);
    const proxCat = (c) => (a === "partidos" && c !== "Todas" ? [...proxTodos().filter((x) => catsUAR(c).includes(x.cat)), ...(EQ.lista ? amistosos(catsUAR(c)) : [])].sort((x, y) => x.fecha.localeCompare(y.fecha))[0] : null);
    const boton = ([v, txt = v]) => {
      const u = ultDe(v), d = u && dia(u.fecha), px = proxCat(v), dp = px && dia(px.fecha);
      const viejo = u && u.fecha < masDias(hoyISO(), -14);
      const faltan = a === "partidos" && v !== "Todas" && EQ.lista ? jugados(catsUAR(v)).filter((x) => x.amistoso) : [];
      const jugoHoy = px && px.fecha === hoyISO() && !px.amistoso && eqInfo(px.cat, px.fecha).pf != null && eqInfo(px.cat, px.fecha).pf !== "";
      if (jugoHoy) return `<button type="button" class="elegir__cat" data-area-cat="${esc(v)}"${ult === v ? ' aria-current="true"' : ""} aria-label="${esc(txt)}: jugó hoy">${esc(txt)}<small>Jugó hoy</small></button>`;
      if (px && px.fecha === hoyISO()) return `<button type="button" class="elegir__cat elegir__cat--hoy" data-area-cat="${esc(v)}"${ult === v ? ' aria-current="true"' : ""} aria-label="${esc(txt)}: juega hoy">${esc(txt)}<small>Juega hoy</small></button>`;
      if (faltan.length) return `<button type="button" class="elegir__cat" data-area-cat="${esc(v)}"${ult === v ? ' aria-current="true"' : ""} aria-label="${esc(txt)}: ${faltan.length === 1 ? `falta el resultado del ${esc(cuandoP(faltan[0]))}` : `faltan ${faltan.length} resultados`}">${esc(txt)}<small class="viejo">${IC.alerta}${faltan.length === 1 ? "Falta 1 resultado" : `Faltan ${faltan.length} resultados`}</small></button>`;
      if (px) return `<button type="button" class="elegir__cat" data-area-cat="${esc(v)}"${ult === v ? ' aria-current="true"' : ""} aria-label="${esc(txt)}: próximo partido el ${esc(cuandoP(px))}">${esc(txt)}<small>Juega ${px.fecha === hoyISO() ? "hoy" : `${dia(px.fecha).getDate()}/${dia(px.fecha).getMonth() + 1}`}</small></button>`;
      return `<button type="button" class="elegir__cat" data-area-cat="${esc(v)}"${ult === v ? ' aria-current="true"' : ""}${u ? ` aria-label="${esc(txt)}: última práctica el ${esc(cuandoP(u))}${viejo ? ", hace más de dos semanas" : ""}"` : ""}>${esc(txt)}${u
        ? `<small${viejo ? ' class="viejo"' : ""}>${viejo ? IC.alerta : ""}${d.getDate()}/${d.getMonth() + 1}</small>` : ""}</button>`;
    };
    // un título solo si agrupa a varias (sobre un solo botón repetiría lo mismo)
    const grupo = (t, items, cls = "") => (items.length ? `${items.length > 1 ? `<h3 class="grupo">${t}</h3>` : ""}<div class="elegir${cls}">${items.map(boton).join("")}</div>` : "");
    if (a === "partidos" && D.fichados && !EQ.lista && !EQ.error) cargarEquipos();
    const juv = a === "partidos" ? D.cats.filter((c) => !PS.includes(c)) : ASIS_CATS.slice(1, 7);
    $("#vista").innerHTML = `${cab(`${AREAS[a]}: ¿qué categoría?`, a === "planificacion" ? "planCats" : a === "partidos" ? "partidosCats" : undefined)}
      ${a === "planificacion" ? avisoPracticas() : ""}
      <section class="sec sec--pegada">
        ${a === "partidos" ? grupo("Todo el club", [["Todas", "Todas las categorías"]]) : ""}
        ${grupo("Plantel superior", [["Plantel superior"]])}
        ${grupo("Juveniles", juv.map((c) => [c]))}
        ${a === "partidos" || a === "tests" ? "" : grupo("Infantiles", ASIS_CATS.slice(7).map((c) => [c]), " elegir--4")}
        ${a === "asistencia" ? `<button type="button" class="btn-sec btn-sec--ancho area-todas" data-ir="asistencia">Ver todas, con su porcentaje</button>` : ""}
        ${a === "planificacion" && todasPr().length ? `<button type="button" class="btn-sec btn-sec--ancho area-todas" data-ir="practicas">Ver las prácticas de todas</button>` : ""}
      </section>`;
  }

  /** arriba de las prácticas de una categoría (Planificación): qué tiene que aprender, el scrum de su edad y sus juegos */
  function atajosPlan(cat) {
    const g = D.guia, gc = gDe(cat), sc = scrumDe(cat === "Plantel superior" ? "M19" : cat);
    const jg = g.ejercicios ? g.ejercicios.filter((e) => e.cats.includes(cat)).length : 0;
    const lema = !gc ? "" : esInf(cat) ? (gc.semillas.ataque[0] ? `“${esc(gc.semillas.ataque[0])}”` : "") : esc(g.lemas_juv[cat] || "");
    // el scrum solo desde M8 (antes no hay); lleva a la fila de su edad
    const items = [gc ? opcionDe(`data-ir-guia="${esc(cat)}"`, IC.libro, `Qué tiene que aprender ${esc(cat)}`, lema || "Frase guía, prioridades y qué evitar") : "",
      sc ? opcionDe(`data-ir-scrum="${esc(cat)}"`, IC.escudo, "Scrum seguro", `En ${esc(cat)}: ${esc(minus(sc[1]))}`) : "",
      jg ? opcionDe(`data-ir-ej-para="${esc(cat)}"`, IC.cono, `Juegos de ${esc(cat)}`, jg === 1 ? "1 juego, con cómo se juega" : `${jg} juegos, cada uno con cómo se juega`) : ""].join("");
    return items ? `<ul class="menu">${items}</ul>` : "";
  }
  /** los días que el grupo suele entrenar, según sus prácticas (los que tienen al menos una de cada siete) */
  function diasHabituales(lista) {
    const c = Array(7).fill(0), f = lista.filter((p) => p.fecha);
    f.forEach((p) => c[dia(p.fecha).getDay()]++);
    return new Set(c.flatMap((n, i) => (n >= Math.max(2, f.length / 7) ? [i] : [])));
  }
  // Planificación de una categoría: la semana (los días que entrena, con la práctica de cada uno; el de hoy, pintado),
  // lo que tiene que aprender y la temporada (las prácticas de su grupo: M11 y M12…). En la compu, la semana queda fija a la izquierda.
  function vPlan() {
    const cat = S.pcat, hoy = hoyISO();
    S.pgrupo = grupoPlan(cat);
    const todas = S.pgrupo ? prLista() : [], conFecha = todas.filter((p) => p.fecha), u = S.pgrupo ? ultimaPr(S.pgrupo) : null;
    // los días que entrena: los que cargó el entrenador en Asistencia (con su hora, suspendidos y agregados);
    // si todavía no los cargó, los que suele entrenar según sus prácticas
    const d = D.fichados && ASIS_CATS.includes(cat) ? ASIS.cats[cat] : null;
    if (D.fichados && ASIS_CATS.includes(cat) && !d && !ASIS.error[cat]) cargarAsis(cat);
    if (D.fichados && !NOTAS.lista && !NOTAS.error) cargarNotas();
    const lunes = masDias(hoy, -((dia(hoy).getDay() + 6) % 7)), domingo = masDias(lunes, 6);
    const ses = d && d.horarios.length ? new Map(sesiones(d, lunes, domingo).map((s) => [s.fecha, s])) : null, habit = diasHabituales(todas);
    const semana = Array.from({ length: 7 }, (_, i) => masDias(lunes, i)).flatMap((f) => {
      const ps = conFecha.filter((p) => p.fecha === f), s = ses && ses.get(f), dd = dia(f), esHoy = f === hoy;
      if (!ps.length && !(ses ? s : habit.has(dd.getDay()))) return [];
      const canc = !!s && s.estado === "cancelado", susp = canc ? `Suspendido${s.motivo ? `: ${esc(s.motivo)}` : ""}` : "";
      const hora = !s || !s.hora || canc ? "" : s.estado === "movido" && s.antes && s.antes !== s.hora ? `${esc(s.hora)} (cambió: era ${esc(s.antes)})` : esc(s.hora);
      // hoy va pintado de azul solo si se puede tocar (tiene práctica y no se suspendió); si no, con un borde. Los días que ya pasaron, en gris
      const cls = `${esHoy ? (ps.length && !canc ? " ej--hoy" : " ej--hoy-vacio") : f < hoy ? " ej--pasado" : ""}${canc ? " ej--canc" : ""}`;
      const badge = `<span class="prac__dia" aria-hidden="true"><b class="num">${dd.getDate()}</b><small>${esHoy ? "hoy" : DIA_S[dd.getDay()].slice(0, 3)}</small></span><span class="sr">${esHoy ? "Hoy, " : ""}${esc(cuandoP({ fecha: f }))}: </span>`;
      if (ps.length) return ps.map((p) => `<li data-pr="${esc(p.id)}"><button type="button" class="ej prac${cls}" data-ir-practica="${esc(p.id)}">${badge}
        <span class="ej__txt"><b>${canc ? susp : esc(p.foco || "Práctica")}</b><small>${[hora, canc ? esc(p.foco || "Práctica") : "", esc(p.quien), minDe(p) ? `${minDe(p)} min` : ""].filter(Boolean).join(" · ")}</small>${canc ? "" : notaDia(cat, f)}</span>${IC.adelante}</button></li>`);
      return [`<li><div class="ej prac ej--vacio${cls}">${badge}<span class="ej__txt"><b>${canc ? susp : f < hoy ? "Sin práctica" : "Sin práctica todavía"}</b>${hora ? `<small>${hora}</small>` : ""}${canc ? "" : notaDia(cat, f)}</span><span></span></div></li>`];
    });
    // si esta semana no hay ninguna, la última que se escribió (para repetirla o seguir desde ahí)
    const ultima = u && !conFecha.some((p) => p.fecha >= lunes && p.fecha <= domingo)
      ? `<h3 class="grupo">La última que se escribió</h3><ul class="filas-cat">${filaPr(u, "", true)}</ul>` : "";
    const at = atajosPlan(cat);
    $("#vista").innerHTML = `
      <div class="cab">${volver(AREAS.planificacion, AREA_IR("planificacion"))}${cabTit(`Planificación de ${esc(cat)}`, "plan")}</div>
      ${avisoPlan(u)}
      <div class="plan">
        <div class="plan__lado">
          <section class="sec sec--pegada">${tit("Esta semana")}${semana.length ? `<ul class="filas-cat">${semana.join("")}</ul>` : `<p class="vacio-g">Sin entrenamientos esta semana</p>`}${ultima}</section>
          ${at ? `<section class="sec">${tit("Antes de entrenar")}${at}</section>` : ""}
        </div>
        <section class="sec sec--pegada">${tit(S.pgrupo ? `La temporada de ${esc(S.pgrupo)}` : "La temporada")}
          ${todas.length ? `${todas.length >= 8 ? buscadorPr(cat) : ""}${mesesPr(todas, true)}${sinPr()}` : `<p class="vacio-g">Todavía no hay prácticas en la planilla</p>`}</section>
      </div>${avisoHTML()}`;
    filtrarPr();
  }

  // los partidos de una categoría (o de todas): los próximos que cargó la UAR y los últimos resultados; en la compu, uno al lado del otro
  function vPartidos() {
    const m = S.mcat, cs = m === "Todas" ? D.cats : catsUAR(m), varias = cs.length > 1;
    const conEq = !!D.fichados && cs.some(eqAsis);
    if (conEq && !EQ.lista && !EQ.error) cargarEquipos();
    if (conEq && !CNT.lista && !CNT.error) cargarConteos();
    const prox = [...proxTodos().filter((x) => cs.includes(x.cat) && !(conEq && x.fecha === hoyISO() && eqInfo(x.cat, x.fecha).pf != null && eqInfo(x.cat, x.fecha).pf !== "")), ...(conEq ? amistosos(cs) : [])].sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.hora || "").localeCompare(b.hora || ""));
    const hoyL = prox.filter((x) => x.fecha === hoyISO()), resto = prox.filter((x) => x.fecha !== hoyISO()); // el día del partido, "Hoy" va aparte
    // los resultados: los de la UAR y los amistosos con su resultado; arriba, los ya jugados que todavía no tienen resultado
    const ult = [...D.partidos.filter((x) => cs.includes(x.cat)), ...(conEq ? amistososJugados(cs) : [])].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 10), jug = conEq ? jugados(cs) : [];
    $("#vista").innerHTML = `
      <div class="cab">${volver(AREAS.partidos, AREA_IR("partidos"))}${cabTit(m === "Todas" ? "Partidos de todo el club" : `Partidos de ${esc(m)}`)}</div>
      ${conEq && (EQ.delCel || navigator.onLine === false) ? `<p class="lista-info lista-info--ojo">${IC.alerta}<span>Sin señal: los equipos son los últimos que se cargaron en este celular.</span></p>` : ""}
      <div class="dos">
        <section class="sec">${hoyL.length ? `${tit("Hoy", "proximos")}${proxHTML(hoyL, varias, conEq)}` : ""}${!hoyL.length || resto.length ? `${tit("Próximos", "proximos")}${resto.length ? proxHTML(resto, varias, conEq) : `<p class="vacio-g">La UAR todavía no cargó el próximo partido</p>`}` : ""}
          ${!conEq ? "" : S.aform === "amistoso" ? formAmistoso(cs) : `<button type="button" class="btn-sec btn-sec--ancho eq-otro" data-form="amistoso">${IC.mas}Sumar un amistoso</button>`}</section>
        <section class="sec">${jug.length ? `${tit("Jugados, sin resultado", "jugados")}${proxHTML(jug, varias, conEq)}` : ""}
          <div${jug.length ? ' class="eq-jugados"' : ""}>${tit("Últimos resultados", "ultimos")}${ult.length ? `<ol class="resultados">${ult.map((x, i) => `${i && ult[i - 1].fecha.slice(0, 7) === x.fecha.slice(0, 7) ? "" : `<li class="res-mes" aria-hidden="true">${mayus(MES_S[+x.fecha.slice(5, 7) - 1])}</li>`}${partidoHTML(x, varias, conEq)}`).join("")}</ol>` : `<p class="vacio-g">Todavía sin partidos</p>`}</div></section>
      </div>`;
  }

  // la guía del club: lo que es igual para todas las categorías
  function vGuiaClub() {
    const g = D.guia;
    $("#vista").innerHTML = `
      <div class="cab">${volver()}${cabTit("Guía del club")}</div>
      <section class="sec sec--pegada"><ul class="areas">
        ${tarjeta('data-ir="guia"', IC.libro, "Qué aprende cada categoría", "Frase guía y prioridades")}
        ${g.puestos ? tarjeta('data-ir="puestos"', IC.camiseta, "Los puestos", "Qué se espera del 1 al 15") : ""}
        ${tarjeta('data-ir="scrum"', IC.escudo, "Scrum seguro", "Cada edad y el set up")}
        ${tarjeta('data-ir="cantos"', IC.canto, "Cantos y zonas", `Los ${g.cantos.length} cantos y las zonas`)}
      </ul></section>`;
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
      // la tabla siempre suma el total: lo que no tiene puesto en la planilla (sin camiseta) va en su propio renglón
      const sinPuesto = (x) => ({ ...x, sinpuesto: x.lineas ? x.tries - x.forwards - x.backs - x.try_penal : 0 });
      const af = sinPuesto(tr.a_favor), ec = sinPuesto(tr.en_contra);
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
          af.try_penal || ec.try_penal ? ["Try penal", "try_penal"] : null,
          af.sinpuesto || ec.sinpuesto ? ["Sin dato del puesto", "sinpuesto"] : null])}` : "";
      triesHTML = desple("tries", "Los tries: quién y cuándo", `
        ${quien}
        <h3 class="grupo">¿Cuándo?</h3>
        <p class="titular">En los últimos 10 minutos hizo <b>${af.ultimos10}</b> y le hicieron <b>${ec.ultimos10}</b>${ayudaBtn("tries")}</p>
        ${tabla([["1er tiempo", "t1"], ["2º tiempo", "t2"], ["Últimos 10 minutos", "ultimos10"], ["Entrando del banco", "banco"]])}`);
    }

    $("#vista").innerHTML = `
      <div class="cab">
        ${volver(AREAS.estadisticas, AREA_IR("estadisticas"))}
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
        ${tor.length ? `<h3 class="grupo">Torneos</h3><ul class="lista">${tor.map((t) => `<li><span class="lista__txt">${esc(t.Torneo.replace(/^\d+\/\d{4}\s*/, ""))}<small class="num">${pl(t.G, "ganado", "ganados")}${t.E ? ` · ${pl(t.E, "empatado", "empatados")}` : ""} · ${pl(t.P, "perdido", "perdidos")}</small></span>${pos(t) ? `<span class="chip">${pos(t)}</span>` : ""}</li>`).join("")}</ul>` : ""}
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
          <ol class="resultados">${verP.map((p) => partidoHTML(p)).join("")}</ol>
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
            <tbody>${verJ.map((j) => `<tr><td class="izq">${jugLink(j)}</td><td>${j.pj}</td><td>${j.tries}</td><td>${j.pts}</td></tr>`).join("")}</tbody>
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
  // los nombres de la UAR vienen en mayúsculas ("UNION DEL SUR"): se muestran como se escriben ("Union del Sur")
  const CONECT = new Set(["de", "del", "la", "las", "los", "y", "el", "en"]);
  const nombreRival = (t) => (!t || /[a-zà-ÿ]/.test(t) ? t || "" : t.toLowerCase().replace(/\S+/g, (w, i) => (i && CONECT.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))));
  // primero el local: de visitante, Los 50 va a la derecha (y el tanteo en el mismo orden)
  const vsHTML = (x) => (x.cond === "V" ? `${esc(nombreRival(x.rival))} vs <span class="nos">LOS 50</span>` : `<span class="nos">LOS 50</span> vs ${esc(nombreRival(x.rival))}`);
  /** abajo del partido: de local o de visitante y la instancia */
  /** dónde se juega: en el club o en la cancha del rival */
  const dondeTxt = (x) => { const l = x.lugar || (x.amistoso ? "" : (eqGuardado(x.cat, x.fecha) || {}).lugar);
    return l ? esc(l) : x.cond === "L" ? "en el club" : x.cond === "V" ? `en cancha de ${esc(nombreRival(x.rival))}` : x.fecha < hoyISO() ? "" : "cancha a confirmar"; };
  /** abajo del partido, siempre en el mismo orden: amistoso, local o visitante, la cancha (y la instancia) */
  const subProx = (x) => mayus([x.amistoso && "Amistoso", x.cond && condTxt(x.cond), dondeTxt(x), !x.amistoso && x.inst && esc(x.inst)].filter(Boolean).join(" · "));
  const DIA3 = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  /** la fecha, lo primero que se busca: "Sáb", "31/10" grande y la hora (o "Hora a confirmar") */
  const diaBloque = (f, hora, conHora) => { const d = dia(f); return `<span class="res__dia"><small${f === hoyISO() ? ' class="res__dia-hoy"' : ""}>${f === hoyISO() ? "Hoy" : DIA3[d.getDay()]}</small><b class="num">${d.getDate()}/${d.getMonth() + 1}</b>${conHora && (hora || f >= hoyISO()) ? `<small class="res__dia-h${hora ? "" : " res__dia-h--sin"}">${hora ? esc(hora) : "Hora a confirmar"}</small>` : ""}</span>`; };
  const proxFila = (x, conCat, conEq) => `<li class="res res--prox">${diaBloque(x.fecha, x.hora, true)}
      <span class="res__cuerpo">${conCat ? `<span class="chip chip--cat">${esc(x.cat)}</span>` : ""}<span class="res__rival">${vsHTML(x)}</span><span class="res__sub">${subProx(x)}</span></span>${conEq && eqAsis(x.cat) ? eqBtn(x) : ""}</li>`;
  function proxHTML(lista, conCat = true, conEq = false) { return `<ol class="resultados">${lista.map((x) => proxFila(x, conCat, conEq)).join("")}</ol>`; }

  // con "conEq": si ese partido tuvo equipo armado en la app, se puede volver a verlo (y lo contado)
  const partidoHTML = (p, conCat, conEq) => `<li class="res res--jugado">${diaBloque(p.fecha, "", false)}
      <span class="res__cuerpo">${conCat ? `<span class="chip chip--cat">${esc(p.cat)}</span>` : ""}<span class="res__rival">${vsHTML(p)}</span><span class="res__sub">${[p.amistoso && "Amistoso", p.cond && condTxt(p.cond), p.prov && "provisorio, falta la UAR"].filter(Boolean).join(" · ")}</span></span>
      <span class="res__marcador res--${p.res}"><b class="num">${p.cond === "V" ? `${p.pc}–${p.pf}` : `${p.pf}–${p.pc}`}</b><i>${({ G: "Ganó", E: "Empató", P: "Perdió" })[p.res]}</i></span>${conEq && eqAsis(p.cat) && (eqGuardado(p.cat, p.fecha) || eqBorr.get(eqClave(p.cat, p.fecha))) ? eqBtn(p) : ""}</li>`;

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
  /** el texto en el que busca el buscador de ejercicios */
  const textoEj = (e) => norm([e.nombre, e.grupo, e.tipo, e.material, ...e.foco, ...e.como, videosDe("ejercicios", e.id).length ? "video" : ""].join(" "));
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
    const fila = (e) => `<li data-q="${esc(textoEj(e))}">
      <button type="button" class="ej${e.paso ? "" : " ej--sin-paso"}" data-ir-ej="${esc(e.id)}">
        ${e.paso ? `<span class="ej__paso num">${e.paso}</span>` : ""}
        <span class="ej__txt"><b>${esc(e.nombre)}</b>${e.foco[0] ? `<small>${conCantos(e.foco[0])}</small>` : ""}${e.material ? `<span class="ej__mat">${IC.cono}${esc(e.material)}</span>` : ""}${e.dibujo ? `<span class="ej__video">${IC.cono}Con dibujo</span>` : ""}${videosDe("ejercicios", e.id).length ? `<span class="ej__video">${IC.play}Con video</span>` : ""}</span>
        ${IC.adelante}</button></li>`;
    $("#vista").innerHTML = `
      <div class="cab">${volver()}${cabTit(S.para ? `Juegos de ${esc(S.para)}` : "Ejercicios", "ejercicios")}</div>
      ${S.para ? "" : pestanas(TIPOS_EJ, tab)}
      ${tab === "line" ? `<div class="chips-g" role="group" aria-label="Rol en el line">${[["", "Todos"], ...ROLES_LINE.map((r) => [r, r])].map(([v, l]) =>
        `<button type="button" data-rol="${v}" aria-pressed="${(S.rol || "") === v}">${l}</button>`).join("")}</div>` : ""}
      ${S.para ? `<p class="filtro-g"><span>Solo los juegos que usan en <b>${esc(S.para)}</b></span><button type="button" class="link" data-quitar-para>Ver todos</button></p>` : ""}
      <section class="sec sec--pegada">
        <label class="buscar-g"><span class="sr">Buscar un ejercicio</span>${IC.buscar}<input type="search" id="buscar-ej" value="${esc(S.qe)}" placeholder="Buscar: salto, tackle, conos…" autocomplete="off" enterkeyhint="search"></label>
        ${grupos.map((gr) => `<div class="grupo-ej"><div class="grupo-ej__cab"><h3 class="grupo-cat__tit">${esc(gr.k)}</h3>${cuenta(gr.items.length, gr.items[0].tipo === "Juegos" ? ["juego", "juegos"] : ["ejercicio", "ejercicios"])}</div>
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
      contar(gr, q, vis);
    });
    const v = $("#sin-ej");
    if (v) v.hidden = n > 0;
  }

  // un ejercicio en pantalla completa
  // ---------- el dibujo de un ejercicio, como las fichas de World Rugby (T1 Rugby) y de la RFL ----------
  // La cancha vista desde arriba (con sus medidas, si el ejercicio las dice), el ataque en azul y la defensa en rojo,
  // carrera = flecha llena, pase = flecha punteada, patada = punteada y curva; el ejercicio en cuadros, paso a paso,
  // y abajo la leyenda (solo con lo que se usa). Los dibujos salen de diagramas_entrenadores.py.
  const DIB = { pasto: "#3d8b4f", raya: "#ffffff", ataque: "#1b5fd1", defensa: "#d9483b", entrenador: "#f5c518", cono: "#ff8a1f", escudo: "#23262d", tinta: "#0b0d12", suave: "#545d6e" };
  let dibN = 0; // para que cada cuadro tenga sus propias puntas de flecha
  /** un cuadro del ejercicio, en SVG. "medidas": los metros a los costados (solo en el primero) */
  function cuadroSVG(dib, c, medidas) {
    const [w, h] = dib.cancha, K = 10, W0 = w * K, H0 = h * K;
    // el tamaño de jugadores y conos no depende del tamaño de la cancha: se ve parecido en una de 8 m y en una de 36 m
    const u = 1 / Math.min(330 / (W0 + 40), 440 / (H0 + 40)), M = 20 * u, W = W0 + 2 * M, H = H0 + 2 * M;
    const X = (x) => +(M + x * K).toFixed(1), Y = (y) => +(M + y * K).toFixed(1), n = ++dibN;
    const linea = (pts, cls) => {
      const p = pts.map(([x, y]) => [X(x), Y(y)]);
      // carrera: llena y oscura; pase y patada: punteadas y blancas (como en las fichas de World Rugby y de la RFL)
      const at = `stroke="${cls === "corre" ? DIB.tinta : DIB.raya}"${cls === "corre" ? "" : ` stroke-dasharray="${(5 * u).toFixed(1)} ${(4 * u).toFixed(1)}"`} marker-end="url(#d${n}-${cls})"`;
      if (cls === "patea" && p.length === 2) { // la patada va en curva
        const [[x1, y1], [x2, y2]] = p, mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1;
        return `<path d="M${x1} ${y1} Q${(mx - dy * 0.3).toFixed(1)} ${(my + dx * 0.3).toFixed(1)} ${x2} ${y2}" ${at}/>`;
      }
      const d = p.length === 3 ? `M${p[0]} Q${p[1]} ${p[2]}` : `M${p.map((q) => q.join(" ")).join(" L")}`;
      return `<path d="${d}" ${at}/>`;
    };
    const jug = ([x, y, t], col) => `<g class="d-jug"><circle cx="${X(x)}" cy="${Y(y)}" r="${8 * u}" fill="${col}" stroke="#fff" stroke-width="${1.6 * u}"/>${t ? `<text x="${X(x)}" y="${Y(y)}" font-size="${(t.length > 1 ? 7.5 : 9) * u}">${esc(t)}</text>` : ""}</g>`;
    const punta = (cls, col) => `<marker id="d${n}-${cls}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.2" markerHeight="4.2" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${col}"/></marker>`;
    const s = (k) => c[k] || [];
    return `<svg viewBox="0 0 ${W.toFixed(1)} ${H.toFixed(1)}" role="img" aria-label="${esc(c.txt || "Dibujo del ejercicio")}">
      <defs>${punta("corre", DIB.tinta)}${punta("pasa", DIB.raya)}${punta("patea", DIB.raya)}
        <pattern id="d${n}-ray" width="${6 * u}" height="${6 * u}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="${6 * u}" height="${6 * u}" fill="none"/><line x1="0" y1="0" x2="0" y2="${6 * u}" stroke="#fff" stroke-opacity=".35" stroke-width="${2 * u}"/></pattern></defs>
      <rect x="${M}" y="${M}" width="${W0}" height="${H0}" rx="${3 * u}" fill="${DIB.pasto}"/>
      <rect x="${M}" y="${M}" width="${W0}" height="${H0}" rx="${3 * u}" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="${1.2 * u}"/>
      ${medidas && dib.medidas ? `<g class="d-med" font-size="${9 * u}"><line x1="${M}" y1="${H - 8 * u}" x2="${M + W0}" y2="${H - 8 * u}"/><text x="${M + W0 / 2}" y="${H - 11 * u}">${w} m</text>
        <line x1="${8 * u}" y1="${M}" x2="${8 * u}" y2="${M + H0}"/><text x="${11 * u}" y="${M + H0 / 2}" transform="rotate(-90 ${11 * u} ${M + H0 / 2})">${h} m</text></g>` : ""}
      ${s("area").map(([x, y, aw, ah, t]) => `<rect class="d-area" x="${X(x)}" y="${Y(y)}" width="${aw * K}" height="${ah * K}" fill="url(#d${n}-ray)" stroke-width="${1.2 * u}"/>${t ? `<text class="d-txt" x="${X(x) + 4 * u}" y="${Y(y) + 10 * u}" font-size="${8 * u}" text-anchor="start">${esc(t)}</text>` : ""}`).join("")}
      ${s("lin").map(([x1, y1, x2, y2, t]) => `<line class="d-lin" x1="${X(x1)}" y1="${Y(y1)}" x2="${X(x2)}" y2="${Y(y2)}" stroke-width="${1.6 * u}"/>${t ? `<text class="d-txt" x="${X(x1) + 4 * u}" y="${Y(y1) + (y1 === y2 ? -4 : 12) * u}" font-size="${9 * u}" text-anchor="start">${esc(t)}</text>` : ""}`).join("")}
      ${s("escalera").map(([x, y, l]) => `<g class="d-esc"><rect x="${X(x) - 0.48 * K}" y="${Y(y)}" width="${0.96 * K}" height="${l * K}" fill="none" stroke-width="${1.4 * u}"/>${Array.from({ length: Math.floor(l / 0.6) }, (_, i) => `<line x1="${X(x) - 0.48 * K}" x2="${X(x) + 0.48 * K}" y1="${Y(y + 0.6 * (i + 1))}" y2="${Y(y + 0.6 * (i + 1))}" stroke-width="${1.2 * u}"/>`).join("")}</g>`).join("")}
      ${s("conos").map(([x, y]) => `<path class="d-cono" d="M${X(x)} ${Y(y) - 5 * u}L${X(x) + 4.5 * u} ${Y(y) + 3.5 * u}L${X(x) - 4.5 * u} ${Y(y) + 3.5 * u}z" stroke-width="${0.8 * u}"/>`).join("")}
      ${s("esc").map(([x, y]) => `<rect class="d-escudo" x="${X(x) - 8 * u}" y="${Y(y) - 3.5 * u}" width="${16 * u}" height="${7 * u}" rx="${2 * u}" stroke-width="${0.8 * u}"/>`).join("")}
      <g stroke-width="${2 * u}" fill="none" stroke-linecap="round" stroke-linejoin="round">${s("corre").map((p) => linea(p, "corre")).join("")}${s("pasa").map((p) => linea(p, "pasa")).join("")}${s("patea").map((p) => linea(p, "patea")).join("")}</g>
      ${s("a").map((j) => jug(j, DIB.ataque)).join("")}${s("d").map((j) => jug(j, DIB.defensa)).join("")}
      ${s("e").map(([x, y]) => `<g class="d-jug"><rect x="${X(x) - 7 * u}" y="${Y(y) - 7 * u}" width="${14 * u}" height="${14 * u}" rx="${2 * u}" fill="${DIB.entrenador}" stroke="${DIB.tinta}" stroke-width="${1 * u}"/><text x="${X(x)}" y="${Y(y)}" font-size="${8.5 * u}" fill="${DIB.tinta}">E</text></g>`).join("")}
      ${s("p").map(([x, y]) => `<ellipse class="d-pelota" cx="${X(x)}" cy="${Y(y)}" rx="${4.6 * u}" ry="${3.1 * u}" transform="rotate(-30 ${X(x)} ${Y(y)})" stroke-width="${1 * u}"/>`).join("")}
      ${s("rot").map(([x, y, t]) => `<text class="d-txt" x="${X(x)}" y="${Y(y)}" font-size="${10 * u}">${esc(t)}</text>`).join("")}
    </svg>`;
  }
  /** un ícono chico para la leyenda */
  const iconoLey = (k) => `<svg viewBox="0 0 28 16" aria-hidden="true">${({
    a: `<circle cx="14" cy="8" r="6" fill="${DIB.ataque}"/>`, d: `<circle cx="14" cy="8" r="6" fill="${DIB.defensa}"/>`,
    e: `<rect x="8" y="2" width="12" height="12" rx="2" fill="${DIB.entrenador}" stroke="${DIB.tinta}"/>`,
    p: `<ellipse cx="14" cy="8" rx="6" ry="4" transform="rotate(-30 14 8)" fill="#fff" stroke="${DIB.tinta}"/>`,
    conos: `<path d="M14 2L20 13H8z" fill="${DIB.cono}" stroke="${DIB.tinta}" stroke-width=".8"/>`,
    esc: `<rect x="5" y="4.5" width="18" height="7" rx="2" fill="${DIB.escudo}"/>`,
    escalera: `<rect x="9" y="1" width="10" height="14" fill="none" stroke="${DIB.tinta}"/><path d="M9 5.5h10M9 10h10" stroke="${DIB.tinta}"/>`,
    area: `<rect x="3" y="3" width="22" height="10" fill="#e8eef9" stroke="${DIB.suave}" stroke-dasharray="3 2"/>`,
    corre: `<path d="M2 8h20" stroke="${DIB.tinta}" stroke-width="2"/><path d="M20 4l6 4-6 4z" fill="${DIB.tinta}"/>`,
    pasa: `<path d="M2 8h18" stroke="${DIB.tinta}" stroke-width="2" stroke-dasharray="3 3"/><path d="M20 4l6 4-6 4z" fill="${DIB.tinta}"/>`,
    patea: `<path d="M2 13Q12 0 21 9" fill="none" stroke="${DIB.tinta}" stroke-width="2" stroke-dasharray="3 3"/><path d="M19 5l6 6-7 1z" fill="${DIB.tinta}"/>`,
  })[k]}</svg>`;
  const LEY = [["a", "Ataque"], ["d", "Defensa"], ["e", "Entrenador"], ["p", "Pelota"], ["conos", "Cono"], ["esc", "Escudo o bolsa"],
    ["escalera", "Escalera"], ["area", "Área"], ["corre", "Carrera"], ["pasa", "Pase"], ["patea", "Patada"]];
  /** el dibujo entero: los cuadros paso a paso (numerados si son varios) y la leyenda */
  function dibujoHTML(dib) {
    const cs = dib.cuadros, usa = (k) => cs.some((c) => c[k] && c[k].length);
    const letras = Object.entries(dib.letras || {}).filter(([l]) => cs.some((c) => [...(c.a || []), ...(c.d || [])].some((j) => j[2] === l)));
    return `<div class="dib">
      <div class="dib__cuadros dib__cuadros--${cs.length}">${cs.map((c, i) => `<figure>${cuadroSVG(dib, c, i === 0)}
        ${c.txt ? `<figcaption>${cs.length > 1 ? `<b class="num">${i + 1}</b>` : ""}<span>${esc(c.txt)}</span></figcaption>` : ""}</figure>`).join("")}</div>
      <ul class="dib__ley">${LEY.filter(([k]) => usa(k)).map(([k, t]) => `<li>${iconoLey(k)}${t}</li>`).join("")}
        ${letras.map(([l, t]) => `<li><b class="dib__letra">${esc(l)}</b>${esc(t)}</li>`).join("")}</ul>
    </div>`;
  }

  function vEjercicio() {
    const todos = D.guia.ejercicios, e = todos.find((x) => x.id === S.ej);
    // se recorre la misma lista que se estaba mirando (si se entró con un link directo, todos)
    const q = norm((S.qe || "").trim()), vistos = ejLista().filter((x) => !q || textoEj(x).includes(q));
    const orden = vistos.some((x) => x.id === e.id) ? vistos : todos, j = orden.findIndex((x) => x.id === e.id);
    const total = todos.filter((x) => x.tipo === e.tipo && x.grupo === e.grupo).length;
    const salto = (k, der) => {
      const ok = k >= 0 && k < orden.length;
      return `<button type="button"${ok ? ` data-lado data-ir-ej="${esc(orden[k].id)}" aria-label="${der ? "Siguiente" : "Anterior"}: ${esc(orden[k].nombre)}"` : " disabled"}>${der ? "" : IC.atras}<span>${der ? "Siguiente" : "Anterior"}</span>${der ? IC.adelante : ""}</button>`;
    };
    const bloque = (t, h) => `<h3 class="grupo">${t}</h3>${h}`, vids = videosDe("ejercicios", e.id);
    // la ficha, en el orden de las de World Rugby: qué se aprende y cómo se organiza, el dibujo paso a paso,
    // cómo se juega y los puntos clave. Sin dibujo (técnica del cuerpo), el video va primero
    const juego = e.tipo === "Juegos", dib = e.dibujo;
    const org = [juego && e.foco[0] ? ["Qué se aprende", e.foco[0]] : null, dib && dib.jugadores ? ["Jugadores", dib.jugadores] : null,
      e.material ? ["Material", e.material] : null].filter(Boolean);
    const vidHTML = vids.length ? bloque(vids.length === 1 ? "Video" : "Videos", `<div class="videos-ej">${vids.map(tarjetaVideo).join("")}</div>`) : "";
    $("#vista").innerHTML = `
      <div class="cab">
        <div class="cab__fila">${volver("Ejercicios", { ver: "ejercicios", ej: null })}
          <div class="saltos saltos--ej" role="group" aria-label="Otros ejercicios">${salto(j - 1)}${salto(j + 1, true)}</div></div>
        <p class="ej-tag">${esc(e.tipo)} · ${esc(e.grupo)}${e.paso ? ` · paso ${e.paso} de ${total}` : ""}</p>
        <h2 class="ej-tit">${esc(e.nombre)}</h2>
      </div>
      <section class="sec sec--pegada ej-det">
        ${org.length ? `<dl class="ficha-org">${org.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
        ${dib ? `<div class="dib-cab"><span class="dib-cab__t"><h3 class="grupo">El dibujo</h3>${ayudaBtn("dibujo")}</span>${dib.revisar ? `<span class="chip chip--revisar">Para revisar</span>` : ""}</div>${dibujoHTML(dib)}` : vidHTML}
        ${e.como.length ? bloque(juego ? "Cómo se juega" : "Cómo se hace", `<div class="txt-g">${e.como.map((x) => `<p>${conCantos(x)}</p>`).join("")}</div>`) : ""}
        ${!juego && e.foco.length ? bloque("Puntos clave", lista(e.foco, "check-g")) : ""}
        ${dib ? vidHTML : ""}
        ${e.fotos.length ? bloque("Fotos", `<div class="fotos-ej">${e.fotos.map((f, n) =>
          `<figure><img src="${VACIA}" data-foto="${esc(f)}" alt="Foto ${n + 1} de la actividad «${esc(e.nombre)}»" width="560" height="340" decoding="async"></figure>`).join("")}</div>`) : ""}
        ${e.cats.length ? bloque("Lo usan en", `<p class="claves-g">${e.cats.map((c) => `<span class="chip">${esc(c)}</span>`).join("")}</p>`) : ""}
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
  /** para buscar un nombre: sin tildes, sin la coma y con un solo espacio ("Núñez, Agustín" → "nunez agustin") */
  const qNom = (s) => norm(s).replace(/[^a-z0-9ñ]+/g, " ").trim();
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
      : esInf(cat) ? "" : `<button type="button" class="atajo" data-ir-ej-tab="todos">${IC.cono}<span>Ejercicios de line y maul</span>${IC.adelante}</button>`;
  }
  function vGuiaCat() {
    const g = D.guia, cat = S.gcat, c = gDe(cat), cats = gCats(), i = cats.indexOf(cat), inf = esInf(cat), sc = scrumDe(cat);
    const salto = (j, lbl) => {
      const ok = j >= 0 && j < cats.length;
      return `<button type="button" data-lado data-ir-guia="${ok ? esc(cats[j]) : ""}"${ok ? ` aria-label="${lbl}: ${esc(cats[j])}"` : " disabled"}>${j < i ? IC.atras : ""}<span>${ok ? esc(cats[j]) : ""}</span>${j > i ? IC.adelante : ""}</button>`;
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
      contar(gr, q, vis);
    });
    const v = $("#sin-cantos");
    if (v) v.hidden = n > 0;
  }

  // scrum: regla de oro, qué se hace en cada edad, el set up y la entrada
  function vScrum() {
    const s = D.guia.scrum, haySes = !!(s.sesiones && s.sesiones.length);
    const tab = ["edad", "setup", "entrada"].concat(haySes ? ["sesiones"] : []).includes(S.tab) ? S.tab : "edad";
    const mia = S.para ? scrumDe(S.para === "Plantel superior" ? "M19" : S.para) : null;
    const pasos = (items) => `<ol class="pasos">${items.map(([t, d], i) => `<li><span class="pasos__n">${i + 1}</span><span class="pasos__t">${esc(t)}</span>${d ? `<div class="pasos__d">${d}</div>` : ""}</li>`).join("")}</ol>`;
    let cuerpo;
    if (tab === "edad") {
      cuerpo = `<section class="sec sec--pegada">
        <h2 class="h2">Qué se hace en cada edad</h2>
        <ul class="edades-g">${s.edades.map(([c, q, nota]) => `<li${mia && mia[0] === c ? ' class="edades-g__mia"' : ""}><b class="edades-g__cat">${esc(c)}</b><span>${esc(q)}${nota ? `<small>${esc(nota)}</small>` : ""}</span></li>`).join("")}</ul>
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
            `<ul class="prac-g">${x.bloques.filter((b) => !b.agua).flatMap((b) => b.items).map(itemPr).join("")}</ul>`, minDe(x) ? `${minDe(x)} min` : "")).join("")}`).join("")}
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
      ${mia ? `<p class="lista-info">${IC.escudo}<span><b>En ${esc(S.para)}:</b> ${esc(minus(mia[1]))}${mia[2] ? ` ${esc(mia[2])}` : ""}</span></p>` : ""}
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
  /** la cancha del equipo (pantalla e imagen): los wings abiertos, en una fila aparte de los centros */
  const CANCHA = [[1, 2, 3], [4, 5], [6, 8, 7], [9, 10], [12, 13], [11, 14], [15]];
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
  // ---------- los puestos: cómo es el cuerpo y los tests físicos (perfiles de los Pumas / UAR, perfiles_pumas.py) ----------
  const FIS_EDADES = ["M18", "M20", "Senior"];
  const FIS_FUERZA = [["banco", "Press de banco"], ["dominadas", "Dominadas"], ["sentadilla", "Sentadilla"]];
  const FIS_POTENCIA = [["salto_h", "Salto horizontal", "m"], ["salto_v", "Salto vertical", "cm"]];
  /** "Cómo es el cuerpo": peso, altura, masa ósea y muscular, IMO y la forma */
  function cuerpoHTML(c) {
    const caja = ([k, v]) => (v ? `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>` : "");
    return `<div class="dib-cab"><span class="chip chip--gris">Pumas · jugadores adultos</span>${ayudaBtn("perfilCuerpo")}</div>
      <dl class="ficha-org">${[["Peso", c.peso], ["Altura", c.altura], ["Masa ósea (kg)", c.mo], ["Masa muscular (kg)", c.mm], ["Índice músculo-óseo", c.imo]].map(caja).join("")}</dl>
      <h3 class="grupo">Forma del cuerpo</h3>${lista(c.forma, "check-g")}`;
  }
  /** "Tests físicos": una tabla por edad (M18, M20, Senior); fuerza, potencia, velocidad y resistencia */
  function fisicoHTML(f) {
    const i = Math.max(0, FIS_EDADES.indexOf(S.pedad || "M18")), kg = (r) => `${r[0]} kg`, x = (r) => `${r} × peso`;
    const fila = (nom, a, b, c) => `<tr><th scope="row" class="izq">${nom}</th><td>${a}</td><td>${b}</td><td>${c}</td></tr>`;
    const un = (k, nom, u) => fila(nom, `${f[k][i][0]} ${u}`, `${f[k][i][1]} ${u}`, `${f[k][i][2]} ${u}`);
    const v = f.velocidad;
    return `<div class="dib-cab"><span class="chip chip--gris">Referencia de la UAR · desde M18</span>${ayudaBtn("perfilFisico")}</div>
      <div class="chips-g" role="group" aria-label="Edad">${FIS_EDADES.map((e) => `<button type="button" data-edad="${e}" aria-pressed="${e === FIS_EDADES[i]}">${e === "Senior" ? "Senior" : e}</button>`).join("")}</div>
      <div class="tabla-e-wrap"><table class="tabla-e fis"><thead><tr><th class="izq">Test</th><th scope="col">Mínimo</th><th scope="col">Objetivo bajo</th><th scope="col">Objetivo alto</th></tr></thead><tbody>
        <tr class="fis-g"><th colspan="4">Fuerza</th></tr>
        ${FIS_FUERZA.map(([k, nom]) => fila(nom, kg(f[k][i]), x(f[k][i][1]), x(f[k][i][2]))).join("")}
        <tr class="fis-g"><th colspan="4">Potencia</th></tr>
        ${FIS_POTENCIA.map(([k, nom, u]) => un(k, nom, u)).join("")}
        ${v ? `<tr class="fis-g"><th colspan="4">Velocidad</th></tr>
          <tr><th scope="row" class="izq">10 metros</th><td colspan="3">${v.m10[i]} s</td></tr>
          <tr><th scope="row" class="izq">30 metros</th><td colspan="3">${v.m30[i]} s</td></tr>
          <tr><th scope="row" class="izq">Velocidad máxima</th><td colspan="3">${v.vmax[i]} km/h</td></tr>` : ""}
      </tbody></table></div>
      <div class="tabla-e-wrap"><table class="tabla-e fis"><thead><tr><th class="izq">Resistencia</th><th scope="col">Objetivo bajo</th><th scope="col">Objetivo alto</th><th scope="col">Máximo</th></tr></thead><tbody>
        ${fila("Bronco", `${f.bronco[i][0]} s`, `${f.bronco[i][1]} s`, `${f.bronco[i][2]} s`)}</tbody></table></div>`;
  }

  function vPuesto() {
    const todos = D.guia.puestos, p = puestoDe(S.puesto), j = todos.indexOf(p), n = p.n[0];
    const salto = (k, der) => {
      const q = todos[k];
      return `<button type="button"${q ? ` data-lado data-ir-puesto="${q.n[0]}" aria-label="${der ? "Siguiente" : "Anterior"}: ${esc(q.nombre)}"` : " disabled"}>${der ? "" : IC.atras}<span>${der ? "Siguiente" : "Anterior"}</span>${der ? IC.adelante : ""}</button>`;
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
      </section>
      ${p.cuerpo ? `<section class="sec desplegables">${desple("p-cuerpo", "Cómo es el cuerpo", cuerpoHTML(p.cuerpo))}${desple("p-fisico", "Tests físicos", fisicoHTML(p.fisico), p.fisico.nombre)}</section>` : ""}`;
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
  const minus = (t) => t.charAt(0).toLowerCase() + t.slice(1);
  const grupoDeCat = (cat) => { const p = (D.guia && D.guia.practicas || []).find((x) => x.cats.includes(cat)); return p ? p.grupo : null; };
  /** el grupo de prácticas de una categoría de Planificación (el plantel superior escribe las suyas como "Primera") */
  const grupoPlan = (cat) => grupoDeCat(cat === "Plantel superior" ? "Primera" : cat);
  /** la última práctica escrita de un grupo, hasta hoy */
  const ultimaPr = (gr) => todasPr().reduce((a, p) => (p.grupo === gr && p.fecha && p.fecha <= hoyISO() && (!a || p.fecha > a.fecha) ? p : a), null);
  const nPr = (g) => D.guia.practicas.filter((p) => p.grupo === g).length;
  const atajoPr = (cat) => { const g = grupoDeCat(cat); return g ? `<button type="button" class="atajo" data-ir-practicas="${esc(g)}">${IC.calendario}<span>Prácticas de ${esc(g)} (${nPr(g)})</span>${IC.adelante}</button>` : ""; };
  // las sin fecha van al final
  const ordenPr = (a, b) => (b.orden === "9" ? "0" : b.orden).localeCompare(a.orden === "9" ? "0" : a.orden);
  const prLista = () => D.guia.practicas.filter((p) => !S.pgrupo || p.grupo === S.pgrupo).sort(ordenPr);
  /** una actividad de una práctica (o de una sesión de scrum): los minutos a la izquierda; el objetivo, qué se hace y cómo */
  // un texto largo de "qué se hace" va en letra normal (un párrafo entero en negrita no se lee); si es un juego de la app, el link a su ficha
  const itemPr = (it) => `<li class="prac-it"><span class="prac-it__min">${it.min ? `<b class="num">${it.min}</b><small>min</small>` : ""}</span><div class="prac-it__txt">
      ${it.obj ? `<span class="prac-it__obj">${conCantos(it.obj)}</span>` : ""}
      ${it.act ? `<p class="prac-it__act${it.act.length > 90 ? " prac-it__act--largo" : ""}">${conCantos(it.act)}</p>` : ""}
      ${it.det ? `<p class="prac-it__det">${conCantos(it.det)}</p>` : ""}
      ${it.ej && D.guia.ejercicios && D.guia.ejercicios.some((e) => e.id === it.ej) ? `<button type="button" class="link prac-it__ej" data-ir-ej="${esc(it.ej)}">${IC.cono}Ver cómo se juega</button>` : ""}
      ${it.grupo ? `<span class="chip chip--gris">${esc(it.grupo)}</span>` : ""}</div></li>`;
  /** el número de cada grupo; mientras se busca dice cuántos se ven ("6 de 15") */
  const cuenta = (n, [uno, varios]) => `<span class="num" data-n="${n}" data-txt="${pl(n, uno, varios)}">${pl(n, uno, varios)}</span>`;
  function contar(gr, q, vis) {
    const c = gr.querySelector(".grupo-ej__cab .num, summary .num");
    if (c && c.dataset.n) c.textContent = q ? `${vis} de ${c.dataset.n}` : c.dataset.txt;
  }
  /** los minutos de una práctica o sesión: solo si todas las actividades tienen sus minutos */
  const minDe = (p) => (p.min && !p.bloques.some((b) => !b.agua && b.items.some((it) => !it.min)) ? p.min : null);
  let Q_PR = null; // lo que se busca de cada práctica (se arma la primera vez que se usa el buscador)
  /** cada palabra con sus formas en singular: "pases" → "pase"; "decisiones" → "decisione" o "decision" (el "es" solo después de l, n, r, d, z o j) */
  const formas = (w) => (w.length > 4 && /[lnrdzj]es$/.test(w) ? [w.slice(0, -1), w.slice(0, -2)] : w.length > 3 && w.endsWith("s") ? [w.slice(0, -1)] : [w]);
  const palabrasPr = () => norm((S.qp || "").trim()).split(/\s+/).filter(Boolean).map(formas);
  const coincidePr = (t, ws) => ws.every((fs) => fs.some((w) => t.includes(w)));
  const textoBusca = (p) => norm([p.foco, p.grupo, p.quien, ...p.objetivos, ...p.bloques.flatMap((b) => (b.items || []).map((it) => `${it.obj || ""} ${it.act || ""} ${it.det || ""}`))].join(" "));

  /** una práctica en la lista: el día (número y día de la semana), el foco y quién la armó */
  // con "largo", la fecha entera abajo (para "La última que se escribió", que puede ser de otro mes). El lector de pantalla oye "martes 20 de octubre", no "20 mar"
  const filaPr = (p, cls = "", largo = false) => {
    const d = p.fecha ? dia(p.fecha) : null;
    const dato = [largo && d ? mayus(cuandoP(p)) : "", S.pgrupo ? "" : p.grupo, p.quien, minDe(p) ? `${minDe(p)} min` : ""].filter(Boolean).map(esc).join(" · ");
    return `<li data-pr="${esc(p.id)}"><button type="button" class="ej prac${cls}" data-ir-practica="${esc(p.id)}">
      <span class="prac__dia"${d ? ' aria-hidden="true"' : ""}>${d ? `<b class="num">${d.getDate()}</b><small>${DIA_S[d.getDay()].slice(0, 3)}</small>` : `<small>${p.semana ? `Sem. ${p.semana}` : "Sin fecha"}</small>`}</span>${d && !largo ? `<span class="sr">${esc(cuandoP(p))}: </span>` : ""}
      <span class="ej__txt"><b>${esc(p.foco || "Práctica")}</b><small>${dato}</small></span>
      ${IC.adelante}</button></li>`;
  };
  /** las prácticas por mes, la más nueva arriba; en Planificación cada mes se abre y se cierra (el último, abierto) */
  function mesesPr(lista, plegar) {
    const meses = [];
    lista.forEach((p) => {
      const k = p.orden === "9" ? "sin" : p.orden.slice(0, 7);
      let m = meses.find((x) => x.k === k);
      if (!m) meses.push((m = { k, items: [] }));
      m.items.push(p);
    });
    const nom = (k) => (k === "sin" ? "Sin fecha" : mayus(MES_S[+k.slice(5, 7) - 1]));
    const filas = (m) => `<ul class="filas-cat">${m.items.map((x) => filaPr(x)).join("")}</ul>`;
    // la primera vez, el mes más nuevo abierto; después quedan como los dejaste (y, al volver de una práctica, abierto el mes de esa práctica)
    const pref = `mes-${slug(S.pgrupo || "todas")}`, k = (m) => `${pref}-${m.k}`;
    if (plegar && !S.abiertos.has(`${pref}-ini`)) { S.abiertos.add(`${pref}-ini`); if (meses[0]) S.abiertos.add(k(meses[0])); }
    if (plegar && S.abrirMes) { meses.filter((m) => m.items.some((x) => x.id === S.ultPr)).forEach((m) => S.abiertos.add(k(m))); S.abrirMes = false; }
    return meses.map((m) => (plegar
      ? `<details class="grupo-ej mas mes" data-sec="${k(m)}"${S.abiertos.has(k(m)) ? " open" : ""}><summary><span class="mas__tit">${nom(m.k)}</span><span class="mas__dato">${cuenta(m.items.length, ["práctica", "prácticas"])}</span></summary>${filas(m)}</details>`
      : `<div class="grupo-ej"><div class="grupo-ej__cab"><h3 class="grupo-cat__tit">${nom(m.k)}</h3>${cuenta(m.items.length, ["práctica", "prácticas"])}</div>${filas(m)}</div>`)).join("");
  }
  const buscadorPr = (cat) => `<label class="buscar-g"><span class="sr">Buscar una práctica</span>${IC.buscar}<input type="search" id="buscar-pr" value="${esc(S.qp)}" placeholder="${cat && esInf(cat) ? "Buscar: manchas, pase, tackle…" : "Buscar: tackle, ruck, pase…"}" autocomplete="off" enterkeyhint="search"></label>`;
  // sin resultados: cómo salir; y cuántas hay, para el lector de pantalla
  const sinPr = () => `<div class="vacio-g" id="sin-pr" hidden><p>No hay ninguna práctica con esas palabras.</p><button type="button" class="btn-sec" data-borrar-qp>Borrar la búsqueda</button></div><p class="sr" role="status" id="cuenta-pr"></p>`;

  function vPracticas() {
    const grupos = P_GRUPOS.filter((g) => nPr(g));
    $("#vista").innerHTML = `
      <div class="cab">${volver()}${cabTit("Prácticas", "practicas")}</div>
      <div class="chips-g" role="group" aria-label="Categoría">${[["", "Todas"], ...grupos.map((g) => [g, g])].map(([v, l]) =>
        `<button type="button" data-pgrupo="${esc(v)}" aria-pressed="${(S.pgrupo || "") === v}">${esc(l)}</button>`).join("")}</div>
      <section class="sec sec--pegada">${buscadorPr()}${mesesPr(prLista(), true)}${sinPr()}</section>`;
    filtrarPr();
  }
  let MESES_ANTES = null; // los meses abiertos antes de buscar: al borrar la búsqueda quedan como estaban
  function filtrarPr() {
    const ws = palabrasPr(), q = ws.length > 0;
    if (q && !Q_PR) Q_PR = new Map(todasPr().map((p) => [p.id, textoBusca(p)]));
    if (q && !MESES_ANTES) MESES_ANTES = [...S.abiertos].filter((k) => k.startsWith("mes-"));
    if (!q && MESES_ANTES) { [...S.abiertos].filter((k) => k.startsWith("mes-")).forEach((k) => S.abiertos.delete(k)); MESES_ANTES.forEach((k) => S.abiertos.add(k)); MESES_ANTES = null; }
    let n = 0;
    document.querySelectorAll(".grupo-ej").forEach((gr) => {
      let vis = 0;
      gr.querySelectorAll("li[data-pr]").forEach((li) => { const ok = !q || coincidePr(Q_PR.get(li.dataset.pr), ws); li.hidden = !ok; vis += ok; });
      gr.hidden = !vis; n += vis;
      // al buscar, se abren los meses que tienen algo; al borrar, vuelven como estaban
      if (gr.tagName === "DETAILS" && gr.dataset.sec) { if (q && vis) gr.open = true; else if (!q) gr.open = S.abiertos.has(gr.dataset.sec); }
      contar(gr, q, vis);
    });
    const v = $("#sin-pr"), c = $("#cuenta-pr");
    if (v) v.hidden = n > 0;
    if (c) c.textContent = q ? (n ? `${pl(n, "práctica", "prácticas")}` : "Ninguna práctica") : "";
  }
  /** al volver de una práctica, el foco (y la vista, si quedó lejos) en la fila que se había abierto */
  function volverAFila() {
    const sel = S.ultPr && ["plan", "practicas"].includes(S.ver) ? `[data-ir-practica="${CSS.escape(S.ultPr)}"]`
      : S.ver === "practica" && S.ultEj ? `[data-ir-ej="${CSS.escape(S.ultEj)}"]` : S.ver === "area" && S.area === "planificacion" && S.pcat ? `[data-area-cat="${CSS.escape(S.pcat)}"]` : null;
    if (!sel) return;
    const b = [...document.querySelectorAll(`#vista ${sel}`)].find((x) => !x.closest("[hidden]"));
    if (!b) return;
    requestAnimationFrame(() => { const r = b.getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight) b.scrollIntoView({ block: "center" }); b.focus({ preventScroll: true }); });
  }

  // una práctica entera, como la escribió el entrenador
  function vPractica() {
    const p = todasPr().find((x) => x.id === S.practica);
    S.ultPr = p.id; S.abrirMes = true; // al volver a la lista: abierto su mes y el foco en su fila
    if (D.fichados && !NOTAS.lista && !NOTAS.error) cargarNotas();
    // Anterior = el día de antes, Siguiente = el día de después (la lista va de la más nueva a la más vieja), dentro de la lista que se estaba mirando
    const ws = palabrasPr(), vistos = prLista().filter((x) => !ws.length || coincidePr(textoBusca(x), ws));
    const cron = vistos.some((x) => x.id === p.id) ? vistos : todasPr().filter((x) => x.grupo === p.grupo).sort(ordenPr), j = cron.indexOf(p);
    const salto = (k, der) => {
      const o = cron[k], lado = der ? "Siguiente" : "Anterior", txt = o && (o.fecha ? corta(o.fecha) : o.semana ? `Sem. ${o.semana}` : lado);
      return `<button type="button"${o ? ` data-lado="${der ? "sig" : "ant"}" data-ir-practica="${esc(o.id)}" aria-label="${lado}: ${esc(o.fecha ? cuandoP(o) : txt)}, ${esc(o.foco || "Práctica")}"` : " disabled"}>${der ? "" : IC.atras}<span>${esc(txt || lado)}</span>${der ? IC.adelante : ""}</button>`;
    };
    const minB = (b) => b.items.reduce((s, it) => s + (it.min || 0), 0);
    // las actividades sin nada escrito no se muestran (sus minutos quedan en el total del bloque)
    // dos "Agua" seguidas van juntas; un bloque con minutos y nada escrito lo dice; sin minutos en todo el bloque, no queda la columna vacía
    const bloques = p.bloques.reduce((a, b) => { const u = a[a.length - 1]; if (b.agua && u && u.agua) a[a.length - 1] = { ...u, min: (u.min || 0) + (b.min || 0) || null }; else a.push(b); return a; }, []);
    const cuerpo = bloques.map((b) => {
      if (b.agua) return `<p class="prac-agua">${IC.gota}<span>Agua${b.min ? ` · ${b.min} min` : ""}</span></p>`;
      const its = b.items.filter((it) => it.obj || it.act || it.det), sinMin = !its.some((it) => it.min);
      return `${b.b ? `<h3 class="grupo grupo--fila"><span>${esc(b.b)}</span>${minB(b) ? `<span class="num"><span class="sr">: </span>${minB(b)} min</span>` : ""}</h3>` : ""}
        ${its.length ? `<ul class="prac-g${sinMin ? " prac-g--sin-min" : ""}">${its.map(itemPr).join("")}</ul>` : b.b ? `<p class="prac-sin">Sin detalle en la planilla</p>` : ""}`;
    }).join("");
    // lo que anotaron en Asistencia ese día ("¿Cómo salió?"), de las categorías de esta práctica
    const cats = new Set(p.cats.map(asisDe).filter(Boolean));
    const ns = p.fecha && NOTAS.lista ? NOTAS.lista.filter((n) => n.fecha === p.fecha && cats.has(n.cat)) : [];
    const notas = ns.length ? `<h3 class="grupo">Cómo salió</h3><ul class="cs-l">${ns.map((n) => `<li><p>${esc(n.texto)}</p><small>${[cats.size > 1 ? n.cat : "", n.por].filter(Boolean).map(esc).join(" · ")}</small></li>`).join("")}</ul>` : "";
    const vuelve = S.pcat && grupoPlan(S.pcat) === p.grupo ? volver(`Planificación de ${esc(S.pcat)}`, { ver: "plan", practica: null }) : volver("Prácticas", { ver: "practicas", practica: null });
    $("#vista").innerHTML = `
      <div class="cab">
        ${vuelve}
        <p class="ej-tag">${esc(p.grupo)} · ${esc(p.quien)}</p>
        <h2 class="ej-tit">${conAyuda(esc(p.foco || "Práctica"), "practica")}</h2>
        <p class="prac-cuando">${IC.calendario}<span>${mayus(cuandoP(p))}${minDe(p) ? ` · ${minDe(p)} min` : ""}</span></p>
        <div class="saltos saltos--pr" role="group" aria-label="Otras prácticas">${salto(j + 1)}${salto(j - 1, true)}</div>
      </div>
      <section class="sec sec--pegada ej-det">
        ${p.objetivos.length ? `<h3 class="grupo">Objetivos</h3><ol class="obj-g">${p.objetivos.map((o) => `<li>${conCantos(o)}</li>`).join("")}</ol>` : ""}
        ${cuerpo}
        ${p.cierre ? `<p class="prac-agua prac-agua--fin">${IC.bien}<span>Charla final y elongación</span></p>` : ""}
        ${notas}
        <div class="pie-wa"><button type="button" class="btn btn--ancho btn--wa" data-compartir-pr>${IC.compartir}Mandar por WhatsApp</button></div>
      </section>${avisoHTML()}`;
  }
  const todasPr = () => (D.guia && D.guia.practicas) || [];
  // ---------- asistencia a los entrenamientos (functions/api/asistencia.js, guarda en Cloudflare D1) ----------
  // Pensada para la cancha: con una mano, al sol y con poca señal. Lo marcado queda guardado en el celular hasta que se envía,
  // cómo va el guardado se ve en la barra de abajo y, si dos entrenadores toman la lista del mismo día, se juntan.
  // La lista arranca con los fichados en la UAR (vienen cifrados con los datos). Los días, los suspendidos, las listas y los chicos
  // que se suman o ya no vienen se guardan en Cloudflare, así los ven todos los entrenadores.
  // El porcentaje es sobre los entrenamientos con lista (los suspendidos y los días sin lista no cuentan), y los colores y el orden
  // por porcentaje aparecen desde la tercera lista: antes, cualquier número asusta.
  const ASIS_CATS = ["Plantel superior", "M19", "M17", "M16", "M15", "M14", "M13", "M12", "M11", "M10", "M9", "M8", "M7", "M6"];
  const ULTIMA = "los50-ent-asis"; // la última categoría en la que se tomó lista (queda en el celular)
  const LISTAS_MIN = 3;
  const asisDe = (cat) => (PS.includes(cat) ? "Plantel superior" : ASIS_CATS.includes(cat) ? cat : null);
  const asisTxt = (a) => (a === "Plantel superior" ? "del plantel superior" : `de ${a}`);
  const atajoAsis = (cat) => { const a = D.fichados && asisDe(cat); return a ? `<button type="button" class="atajo" data-ir-asis="${esc(a)}">${IC.lista}<span>Asistencia ${esc(asisTxt(a))}</span>${IC.adelante}</button>` : ""; };
  const ASIS = { resumen: null, cats: {}, error: {}, cargando: new Set(), delCel: {}, ts: {} };
  const isoDe = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const masDias = (iso, n) => { const d = dia(iso); d.setDate(d.getDate() + n); return isoDe(d); };
  /** los días que se pueden usar en la asistencia: que existan (no un 30 de febrero), del último año y hasta 4 meses para adelante */
  const DIAS_ATRAS = 366, DIAS_ADELANTE = 120;
  const fechaOk = (f) => /^\d{4}-\d{2}-\d{2}$/.test(f) && isoDe(dia(f)) === f && f >= masDias(hoyISO(), -DIAS_ATRAS) && f <= masDias(hoyISO(), DIAS_ADELANTE);
  const ahoraHora = () => new Date().toTimeString().slice(0, 5);
  /** para ver si un chico ya está: sin tildes, mayúsculas ni comas, y en cualquier orden ("Pérez, Tomás" = "tomas perez") */
  const claveNombre = (n) => norm(n).replace(/[^a-z0-9]+/g, " ").trim().split(" ").sort().join(" ");
  const corta = (iso) => `${DIA_S[dia(iso).getDay()].slice(0, 3)} ${dia(iso).getDate()}/${dia(iso).getMonth() + 1}`;
  const diaMes = (iso) => cuandoP({ fecha: iso }).replace(/ de \S+$/, ""); // "jueves 22"
  const horaDe = (ts) => { const d = new Date(ts); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
  const enCel = {
    get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } },
  };
  const fichaGuardada = () => { try { return localStorage.getItem(FICHA) || sessionStorage.getItem(FICHA) || ""; } catch (e) { return ""; } };
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
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    if (r.status === 401) throw new Error("clave");
    if (!r.ok) throw new Error("servidor");
    return r.json();
  }
  const avisoError = (e) => (e.message === "clave"
    ? `Para usar la asistencia hay que volver a poner la clave. <button type="button" class="link" data-reclave>Poner la clave</button>`
    : e.message === "servidor" ? "No se pudo guardar. Probá de nuevo en un rato." : "No se pudo guardar: no hay señal. Probá de nuevo en un rato.");
  /** trae los datos de una categoría (o el resumen de todas) y vuelve a dibujar si se sigue en esa pantalla */
  /** lo último que se cargó de cada categoría queda en el celular: sin señal, la lista se abre igual con eso */
  const asisClave = (cat) => `los50-asis:${cat}`;
  const ponerAsis = (cat, d) => { ASIS.cats[cat] = d; delete ASIS.delCel[cat]; enCel.set(asisClave(cat), JSON.stringify(d)); };
  const asisDelCel = (cat) => { try { return JSON.parse(enCel.get(asisClave(cat)) || "null"); } catch (e) { return null; } };
  function cargarAsis(cat) {
    const k = cat || "*";
    if (ASIS.cargando.has(k)) return;
    ASIS.cargando.add(k);
    ASIS.ts[k] = Date.now();
    api(null, cat).then((d) => { if (cat) ponerAsis(cat, d); else ASIS.resumen = d; })
      .catch((e) => {
        const c = cat && e.message !== "clave" && asisDelCel(cat);
        if (c) { ASIS.cats[cat] = c; ASIS.delCel[cat] = true; return; }
        ASIS.error[k] = e.message === "clave" ? avisoError(e) : e.message === "servidor" ? "No se pudo cargar. Probá de nuevo en un rato." : "No se pudo cargar: no hay señal.";
      })
      .finally(() => {
        ASIS.cargando.delete(k);
        const aca = cat ? (S.acat === cat && ["asis", "lista", "chicos"].includes(S.ver)) || (S.ver === "inicio" && enCel.get(ULTIMA) === cat) || (S.ver === "plan" && S.pcat === cat) || (S.ver === "equipo" && eqAsis(S.eqcat) === cat) || (["tests", "toma"].includes(S.ver) && S.tcat === cat) || (["docs", "doclista"].includes(S.ver) && S.dcat === cat) || (S.ver === "chico" && S.chcat === cat) || (S.ver === "lista" && S.ajunta && compa(S.acat) === cat) || S.ver === "asistencia" : S.ver === "asistencia" || S.ver === "inicio";
        if (aca) renderPronto();
      });
  }
  /** varias categorías que llegan juntas se dibujan una sola vez (la pantalla no salta mientras cargan) */
  let PRONTO = 0;
  const renderPronto = () => { if (!PRONTO) PRONTO = requestAnimationFrame(() => { PRONTO = 0; render(); }); };
  /** sin señal: lo que se ve es lo último que se cargó en este celular */
  const avisoDelCel = (cat) => (ASIS.delCel[cat] ? `<p class="lista-info lista-info--ojo">${IC.alerta}<span>Sin señal: estás viendo lo último que se cargó en este celular. Tomá lista igual: queda guardada acá y la mandás cuando vuelva la señal.</span></p>` : "");
  /** avisa abajo de la pantalla (se ve aunque estés más abajo); el de "listo" se va solo */
  function avisar(tipo, txt) {
    const a = (S.aviso = { tipo, txt });
    if (tipo === "ok" || tipo === "ojo") setTimeout(() => { if (S.aviso === a) { S.aviso = null; const el = $(".aviso"); if (el) el.remove(); } }, tipo === "ok" && !txt.includes("aviso__accion") ? 4000 : 7000);
  }
  /** guarda un cambio (días, suspendido, chicos…), vuelve a traer la categoría y avisa cómo salió.
      Mientras guarda y si falla, la pantalla no se vuelve a dibujar: lo elegido o escrito en el formulario no se pierde */
  async function guardarAsis(cuerpo, ok, despues) {
    if (ASIS.guardando) return; // un toque de más mientras guarda no manda lo mismo dos veces
    const cat = S.acat;
    ASIS.guardando = true;
    avisoSuelto("Guardando…", "espera");
    try {
      await api({ cat, ...cuerpo });
      ponerAsis(cat, await api(null, cat));
      ASIS.resumen = null;
      avisar("ok", ok);
      S.aform = null; S.amotivo = null;
      if (despues) despues(); else render();
    } catch (e) { avisoSuelto(avisoError(e)); }
    finally { ASIS.guardando = false; }
  }
  /** un aviso que se muestra sin volver a dibujar, así no se pierde lo que ya se eligió */
  function avisoSuelto(txt, tipo = "error") {
    avisar(tipo, txt);
    const viejo = $(".aviso");
    if (viejo) viejo.remove();
    $("#vista").insertAdjacentHTML("beforeend", avisoHTML());
    ubicarAviso();
  }
  /** en el equipo y al contar, el aviso va pegado arriba de la barra de abajo: nunca tapa "Deshacer" ni "Mandar al grupo" */
  function ubicarAviso() {
    const a = $("#vista .aviso"), p = S && S.ver === "equipo" && [...document.querySelectorAll("#vista .lista-pie")].pop();
    if (a && p && a.parentNode !== p) p.appendChild(a);
  }
  const avisoHTML = () => (S.aviso ? `<p class="aviso aviso--${S.aviso.tipo}" role="${S.aviso.tipo === "error" ? "alert" : "status"}">${S.aviso.tipo === "ok" ? IC.tilde : ""}<span>${S.aviso.txt}</span>${S.aviso.tipo === "error" ? `<button type="button" class="aviso__x" data-cerrar-aviso aria-label="Cerrar el aviso">${IC.cruz}</button>` : ""}</p>` : "");
  const cargandoHTML = (k) => (ASIS.error[k] ? `<div class="hoy hoy--error"><p class="hoy__canc">${ASIS.error[k]}</p>
      <button type="button" class="btn-sec" data-reintentar="${esc(k)}">Probar de nuevo</button></div>` : `<p class="cargando">Cargando…</p>`);

  /** los chicos de la categoría: los fichados menos los que ya no vienen, más los sumados a mano (cuentan desde ese día) */
  function chicosDe(cat, d) {
    const bajas = new Set(d.chicos.filter((c) => c.estado === "baja").map((c) => c.id));
    const todos = [...(D.fichados[cat] || []).map(([id, nombre]) => ({ id, nombre, desde: "" })),
      ...d.chicos.filter((c) => c.id.startsWith("m")).map((c) => ({ id: c.id, nombre: c.nombre, desde: isoDe(new Date(c.ts)), mano: true }))];
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
  // los porcentajes son de la temporada (el año): el año que viene los chicos cambian de categoría y se arranca de cero.
  // Las listas de antes quedan guardadas (y en la copia de seguridad), solo que no cuentan
  const listasValidas = (d) => {
    const canc = new Set(d.entrenamientos.filter((e) => e.estado === "cancelado").map((e) => e.fecha)), anio = hoyISO().slice(0, 4);
    return d.listas.filter((l) => !canc.has(l.fecha) && l.fecha.startsWith(anio));
  };
  /** a cuántos entrenamientos con lista vino cada chico */
  function porcentajes(d, chicos) {
    const ls = listasValidas(d);
    return chicos.map((c) => {
      const base = ls.filter((l) => (l.fecha > c.desde || (l.fecha === c.desde && (!c.mano || l.presentes.includes(c.id)))) && !l.presentes.includes(LES(c.id)));
      const vino = base.filter((l) => l.presentes.includes(c.id)).length;
      return { ...c, vino, de: base.length, pct: base.length ? Math.round((vino / base.length) * 100) : null };
    });
  }
  // las categorías que entrenan juntas (los grupos de las prácticas de Magali): se puede tomar una sola lista con las dos
  const JUNTAS = [["M17", "M19"], ["M15", "M16"], ["M13", "M14"], ["M11", "M12"], ["M9", "M10"]];
  const compa = (cat) => { const j = JUNTAS.find((x) => x.includes(cat)); return j ? j.find((x) => x !== cat) : null; };
  // los lesionados van en la lista como "les-<id>": vino pero no entrena; ese entrenamiento no le cuenta en el porcentaje
  const LES = (id) => `les-${id}`;
  /** de una lista, solo los de una categoría (los presentes y los lesionados) */
  const soloDe = (cat, xs) => { const d = ASIS.cats[cat], ids = new Set(d ? chicosDe(cat, d).activos.map((c) => c.id) : []); return xs.filter((x) => ids.has(x.startsWith("les-") ? x.slice(4) : x)); };
  /** lo que queda en el celular mientras se toma lista (con la base de la otra categoría si se toman juntas) */
  const borrLista = () => ({ marcas: [...S.marcas], base: S.base || [], ...(S.ajunta && compa(S.acat) ? { base2: S.base2 || [] } : {}) });
  /** los que dejaron de venir: venían y faltaron a los últimos 3 entrenamientos con lista (sin contar si estaban lesionados) */
  function dejaronDe(cat, d) {
    const ls = listasValidas(d).filter((l) => l.fecha <= hoyISO()).sort((a, b) => a.fecha.localeCompare(b.fecha));
    if (ls.length < 4) return [];
    const ult = ls.slice(-3), antes = ls.slice(0, -3);
    return chicosDe(cat, d).activos.filter((c) => antes.some((l) => l.fecha >= c.desde && l.presentes.includes(c.id))
      && ult.every((l) => !l.presentes.includes(c.id) && !l.presentes.includes(LES(c.id))));
  }
  /** un chico en la lista: verde si vino; naranja si está lesionado */
  function pintarItem(t, id) {
    const les = S.marcas.has(LES(id)), s = t.querySelector(".lista-it__les");
    t.setAttribute("aria-pressed", S.marcas.has(id));
    t.classList.toggle("lista-it--les", les);
    t.querySelector(".lista-it__ic").innerHTML = les ? IC.alerta : IC.tilde;
    if (les && !s) t.querySelector(".lista-it__nom").insertAdjacentHTML("beforeend", `<small class="lista-it__les">Lesionado</small>`);
    if (!les && s) s.remove();
  }
  /** "martes y jueves a las 18:30" (de lunes a domingo) */
  function horariosTxt(hs) {
    const porHora = new Map();
    hs.slice().sort((a, b) => ((a.dia + 6) % 7) - ((b.dia + 6) % 7)).forEach((h) => porHora.set(h.hora, [...(porHora.get(h.hora) || []), DIA_S[h.dia]]));
    return [...porHora].map(([hora, ds]) => `${ds.length > 1 ? `${ds.slice(0, -1).join(", ")} y ${ds.at(-1)}` : ds[0]} a las ${hora}`).join(" · ");
  }
  /** cuántos vinieron, contando solo a los chicos que hoy están en la lista (los que ya no vienen no suman) */
  /** los chicos que estaban en la lista ese día: un chico sumado a mano no aparece en las listas de antes */
  const chicosEn = (activos, f) => activos.filter((c) => !c.desde || c.desde <= f);
  const vinieron = (l, activos) => { const ids = new Set(activos.map((c) => c.id)); return l.presentes.filter((id) => ids.has(id)).length; };
  /** a qué hora se guardó la lista */
  const tomoTxt = (l) => `guardada a las ${horaDe(l.ts)}`;
  /** si dos listas de chicos son la misma (en cualquier orden) */
  const mismos = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
  /** hay cambios marcados en el celular que todavía no se guardaron (si quedó igual a lo guardado, no cuenta) */
  const sinGuardar = (cat, s) => {
    const b = borrador(cat, s.fecha), o = compa(cat);
    if (!b) return false;
    if (!mismos(soloDe(cat, b.marcas), soloDe(cat, s.lista ? s.lista.presentes : []))) return true;
    return !!(o && b.base2 && ASIS.cats[o] && !mismos(soloDe(o, b.marcas), soloDe(o, b.base2)));
  };
  /** cómo está un entrenamiento, en pocas palabras */
  function estadoTxt(s, activos, cat) {
    // el motivo largo se corta: si no, en el celular tapa la fecha del renglón
    const mot = s.motivo && s.motivo.length > 22 ? `${s.motivo.slice(0, 21).trim()}…` : s.motivo;
    if (s.estado === "cancelado") return `Suspendido${mot ? `: ${esc(mot)}` : ""}`;
    if (sinGuardar(cat, s)) return "Sin guardar";
    if (s.lista) { const ch = chicosEn(activos, s.fecha); return `Vinieron ${vinieron(s.lista, ch)} de ${ch.length}`; }
    // hoy, antes de la hora del entrenamiento, todavía no "falta" la lista
    return s.fecha > hoyISO() ? "Próximo" : s.fecha === hoyISO() ? (s.hora > ahoraHora() ? "Más tarde" : "Falta la lista") : "Sin lista";
  }

  // los formularios chicos (suspender, cambiar la hora, agregar, días, borrar): aparecen en el lugar, sin ventanas
  // la hora se elige de una lista (de 7 a 23, cada 15 minutos): más fácil que escribirla y igual en todos los celulares
  const HORAS = Array.from({ length: 65 }, (_, i) => { const m = 7 * 60 + i * 15; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; });
  const elegirHora = (id, valor) => `<select id="${id}" class="asis-input asis-input--hora">${[...new Set([...HORAS, valor].filter(Boolean))].sort()
    .map((h) => `<option${h === valor ? " selected" : ""}>${esc(h)}</option>`).join("")}</select>`;
  const cerrarBtn = `<button type="button" class="btn-sec" data-form="">Cerrar</button>`;
  // si no se pudo guardar (sin señal), el motivo elegido sigue elegido (S.amotivo)
  const formSuspender = (s, activos) => { const am = S.amotivo || {}; return `<div class="asis-form"><span class="asis-form__l">¿Por qué se suspende?</span>
      <div class="chips-g chips-g--asis" role="group" aria-label="Motivo">${["Lluvia", "Cancha en mal estado", "Otro"].map((m) =>
        `<button type="button" data-motivo="${m}" aria-pressed="${am.m === m}">${m === "Otro" ? "Otro motivo" : m}</button>`).join("")}</div>
      <label class="asis-form__campo" id="motivo-otro"${am.m === "Otro" ? "" : " hidden"}>Contá por qué<input id="motivo" class="asis-input" maxlength="120" autocomplete="off" value="${esc(am.txt || "")}"></label>
      ${s.lista ? `<p class="asis-form__aviso">Este día ya tiene lista (vinieron ${vinieron(s.lista, chicosEn(activos, s.fecha))} de ${chicosEn(activos, s.fecha).length}). Si lo suspendés, esa lista no cuenta.</p>`
        : borrador(S.acat, s.fecha) ? `<p class="asis-form__aviso">Tenés una lista sin guardar de este día. Si lo suspendés, esa lista no cuenta.</p>` : ""}
      <div class="asis-form__btns"><button type="button" class="btn btn--peligro btn--alto" data-cancelar-ok="${s.fecha}">Suspender el entrenamiento</button>${cerrarBtn}</div></div>`; };
  const formHora = (s) => `<div class="asis-form"><label class="asis-form__campo">Nueva hora para el ${esc(cuandoP(s))}
      ${elegirHora("hora-nueva", s.hora || "18:00")}</label>
      <div class="asis-form__btns"><button type="button" class="btn btn--ok btn--alto" data-hora-ok="${s.fecha}">Cambiar la hora</button>${cerrarBtn}</div></div>`;
  const formBorrarExtra = (s) => `<div class="asis-form"><span class="asis-form__l">¿Borrar el entrenamiento agregado del ${esc(cuandoP(s))}?</span>
      <div class="asis-form__btns"><button type="button" class="btn btn--peligro btn--alto" data-deshacer="${s.fecha}">Borrarlo</button>${cerrarBtn}</div></div>`;
  /** el primer día desde mañana que no tiene entrenamiento: así "agregar" no propone uno que ya existe */
  const diaLibre = (d) => { let f = masDias(hoyISO(), 1); while (sesiones(d, f, f).length) f = masDias(f, 1); return f; };
  const formAgregar = (d) => `<div class="asis-form"><div class="asis-form__fila"><label class="asis-form__campo">Día<input id="fecha-nueva" class="asis-input" type="date" value="${diaLibre(d)}" min="${masDias(hoyISO(), -60)}" max="${masDias(hoyISO(), DIAS_ADELANTE)}" required></label>
        <label class="asis-form__campo">Hora${elegirHora("hora-agregar", (d.horarios[0] || {}).hora || "18:00")}</label></div>
      <div class="asis-form__btns"><button type="button" class="btn btn--ok btn--alto" data-agregar-ok>${IC.mas}Agregar</button>${cerrarBtn}</div></div>`;
  // los días que entrena, cada uno con su hora (martes y jueves 18:30, sábado 10:00): al tocar un día, aparece su hora
  const SEMANA = [1, 2, 3, 4, 5, 6, 0];
  const formDias = (d) => `<div class="asis-form"><span class="asis-form__l">Tocá los días que entrena</span>
      <div class="chips-g chips-g--asis chips-g--dias" role="group" aria-label="Días">${SEMANA.map((n) =>
        `<button type="button" data-dia="${n}" aria-pressed="${d.horarios.some((h) => h.dia === n)}">${mayus(DIA_S[n].slice(0, 3))}</button>`).join("")}</div>
      <div class="asis-dias">${SEMANA.map((n) => { const h = d.horarios.find((x) => x.dia === n);
        return `<label class="asis-dia" data-dia-hora="${n}"${h ? " data-guardada" : " hidden"}><span>${mayus(DIA_S[n])}</span>${elegirHora(`hora-dia-${n}`, h ? h.hora : (d.horarios[0] || {}).hora || "18:00")}</label>`; }).join("")}</div>
      <div class="asis-form__btns"><button type="button" class="btn btn--ok btn--alto" data-horarios-ok>Guardar los días</button>${d.horarios.length ? cerrarBtn : ""}</div></div>`;

  /** suspender uno de siempre, o borrar uno agregado (si ya tiene lista, primero hay que borrar la lista: si no, no desaparece) */
  const botonQuitar = (s, borrar) => (s.estado !== "extra" ? `<button type="button" class="btn-sec" data-form="suspender:${s.fecha}">Suspender</button>`
    : s.lista ? "" : `<button type="button" class="btn-sec" data-form="suspender:${s.fecha}">${borrar}</button>`);
  /** el entrenamiento de hoy (o el próximo): lo primero, con un solo botón grande */
  function tarjetaHoy(cat, s, activos) {
    const hoy = hoyISO(), b = sinGuardar(cat, s) && borrador(cat, s.fecha);
    const estado = s.estado === "cancelado" ? `<p class="hoy__canc">Suspendido${s.motivo ? `: ${esc(s.motivo)}` : ""}</p>`
      : b ? `<p class="hoy__estado hoy__estado--ojo">${IC.alerta}<span>Tenés la lista sin guardar (${soloDe(cat, b.marcas).filter((x) => !x.startsWith("les-")).length} marcados${soloDe(cat, b.marcas).some((x) => x.startsWith("les-")) ? ` y ${soloDe(cat, b.marcas).filter((x) => x.startsWith("les-")).length} ${soloDe(cat, b.marcas).filter((x) => x.startsWith("les-")).length === 1 ? "lesionado" : "lesionados"}` : ""})</span></p>`
      : s.lista ? `<p class="hoy__estado">${IC.tilde}<span>Vinieron <b>${vinieron(s.lista, chicosEn(activos, s.fecha))} de ${chicosEn(activos, s.fecha).length}</b> · ${tomoTxt(s.lista)}</span></p>`
      : s.estado === "movido" ? `<p class="hoy__nota">Cambió la hora (antes ${esc(s.antes)})</p>` : "";
    const principal = s.estado === "cancelado" ? `<button type="button" class="btn-sec btn-sec--ancho" data-deshacer="${s.fecha}">Deshacer: vuelve a haber entrenamiento</button>`
      : s.fecha <= hoy ? `<button type="button" class="btn btn--ok btn--grande" data-ir-lista="${s.fecha}">${IC.lista}${b ? "Seguir la lista" : s.lista ? "Sumar a alguien que llegó tarde" : "Tomar lista"}</button>` : "";
    const otras = s.estado === "cancelado" || s.estado === "nuevo" ? "" : `<div class="acc-2">${botonQuitar(s, "Borrarlo")}
        <button type="button" class="btn-sec" data-form="hora:${s.fecha}">Cambiar la hora</button></div>`;
    const form = S.aform === `suspender:${s.fecha}` ? (s.estado === "extra" ? formBorrarExtra(s) : formSuspender(s, activos)) : S.aform === `hora:${s.fecha}` ? formHora(s) : "";
    return `<div class="hoy${s.estado === "cancelado" ? " hoy--canc" : ""}">
      <h3 class="hoy__dia">${s.fecha === hoy ? "Hoy" : `Próximo: ${esc(diaMes(s.fecha))}`}${s.hora ? ` · ${esc(s.hora)}` : ""}</h3>
      ${estado}${principal}${otras}${form}</div>`;
  }

  /** los que no vinieron a ningún entrenamiento desde la tercera lista (y nadie dijo que siguen): se pregunta por ellos y,
      hasta que se conteste, no cuentan en el porcentaje (suelen ser fichados de la UAR que ya no vienen) */
  function nuncaVinieron(cat, d) {
    const siguen = new Set(d.chicos.filter((c) => c.estado === "sigue").map((c) => c.id));
    return porcentajes(d, chicosDe(cat, d).activos).filter((c) => c.de >= LISTAS_MIN && !c.vino && !siguen.has(c.id));
  }
  /** cuánto viene la categoría: de todas las veces que un chico pudo venir (con lista), cuántas vino. Igual en todas las pantallas */
  function promedioCat(cat, d) {
    const nunca = new Set(nuncaVinieron(cat, d).map((c) => c.id)), ls = listasValidas(d);
    const tot = porcentajes(d, chicosDe(cat, d).activos).filter((c) => !nunca.has(c.id)).reduce((t, c) => [t[0] + c.vino, t[1] + c.de], [0, 0]);
    return { p: tot[1] ? Math.round((tot[0] / tot[1]) * 100) : null, nListas: ls.length, ultima: ls.length ? ls.at(-1).fecha : null };
  }

  // la lista de categorías, con cuánto viene cada una
  function vAsistencia() {
    const r = ASIS.resumen;
    if (!r && !ASIS.error["*"]) cargarAsis(null);
    const fila = (cat) => {
      // el porcentaje se calcula con los datos de cada categoría, igual que adentro (se traen las que tienen listas)
      const res = r && r.resumen[cat], d = res && ASIS.cats[cat];
      if (res && !d && !ASIS.error[cat]) cargarAsis(cat);
      // las listas de días suspendidos no cuentan (igual que adentro de la categoría)
      const pr = d && promedioCat(cat, d), nL = pr ? pr.nListas : res ? res.listas : 0, ult = pr ? pr.ultima : res && res.ultima;
      return `<li><button type="button" class="fila-cat fila-cat--asis" data-ir-asis="${esc(cat)}">
        <span class="fila-cat__nom">${esc(cat)}<small>${!r ? "…" : nL ? `${pl(nL, "lista", "listas")} · la última, ${corta(ult)}` : "Todavía sin listas"}</small></span>
        ${pr ? (pr.nListas ? porcHTML(pr.p, pr.nListas >= LISTAS_MIN) : "") : res ? `<span class="porc porc--gris">…</span>` : ""}${IC.adelante}</button></li>`;
    };
    $("#vista").innerHTML = `
      <div class="cab">${volver(AREAS.asistencia, AREA_IR("asistencia"))}${cabTit("Asistencia por categoría", "asistencia")}</div>
      <section class="sec sec--pegada asis-v">
        ${ASIS.error["*"] ? cargandoHTML("*") : ""}
        <ul class="filas-cat">${ASIS_CATS.filter((c) => D.fichados[c] || (r && r.resumen[c])).map(fila).join("")}</ul>
      </section>`;
  }

  // una categoría: hoy, cómo viene la asistencia, los chicos, los entrenamientos y los días
  function vAsis() {
    const cat = S.acat, d = ASIS.cats[cat];
    if (d && Date.now() - (ASIS.ts[cat] || 0) > 60000) cargarAsis(cat);
    const cab = `<div class="cab">${volver(AREAS.asistencia, AREA_IR("asistencia"))}${cabTit(esc(cat), "asisCat")}</div>`;
    if (!d) {
      if (!ASIS.error[cat]) cargarAsis(cat);
      $("#vista").innerHTML = `${cab}<section class="sec sec--pegada asis-v">${cargandoHTML(cat)}</section>`;
      return;
    }
    const hoy = hoyISO(), { activos } = chicosDe(cat, d), total = activos.length;
    // los de antes se muestran desde que se empezó a usar (la primera lista o el primer cambio), hasta 6 semanas para atrás
    const primero = [...d.listas, ...d.entrenamientos].map((x) => x.fecha).filter((f) => f < hoy).sort()[0] || hoy;
    const ses = sesiones(d, primero > masDias(hoy, -42) ? primero : masDias(hoy, -42), masDias(hoy, 14));
    const actual = ses.find((s) => s.fecha === hoy) || ses.find((s) => s.fecha > hoy && s.estado !== "cancelado")
      || (borrador(cat, hoy) ? { fecha: hoy, hora: "", estado: "nuevo", lista: null } : null);
    const validas = listasValidas(d), nListas = validas.length, conColor = nListas >= LISTAS_MIN;
    const pc = porcentajes(d, activos), ult = validas.at(-1), alUltimo = ult ? chicosEn(activos, ult.fecha) : [];
    // los que nunca vinieron: una tarjeta para decir si siguen (y no aparecen en "Los que menos vienen")
    const nunca = conColor ? nuncaVinieron(cat, d) : [], sinNunca = new Set(nunca.map((c) => c.id));
    // los que menos vienen: solo los que vienen menos del 80% (en verde no hay nada que mirar)
    const menos = pc.filter((c) => c.de && !sinNunca.has(c.id) && c.pct < 80).sort((a, b) => a.pct - b.pct || porNombre(a, b)).slice(0, 5);
    // los que nunca vinieron: cerrado, con cuántos son (abierto, se contesta de a uno)
    const tarjNunca = !nunca.length ? "" : `<details class="hoy hoy--ojo nunca" data-sec="nunca-${esc(cat)}"${S.abiertos.has(`nunca-${cat}`) ? " open" : ""}>
        <summary class="nunca__cab"><span class="hoy__dia">${nunca.length === 1 ? "1 nunca vino" : `${nunca.length} nunca vinieron`}: ¿siguen?</span><span class="nunca__abrir">Revisar</span></summary>
        <p class="asis-nota">Muchas veces son fichados de la UAR que ya no juegan. Hasta que se conteste, no cuentan en el porcentaje.</p>
        <ul class="asis-chicos asis-chicos--nunca">${nunca.map((c) => `<li><span class="asis-chicos__nom">${nombreHTML(c.nombre)}<small>Vino 0 de ${c.de}</small></span>
          <span class="nunca__btns"><button type="button" class="btn-sec btn-sec--chico" data-sacar="${esc(c.id)}" data-nombre="${esc(c.nombre)}" aria-label="${esc(c.nombre)}: ya no viene">Ya no viene</button>
          <button type="button" class="btn-sec btn-sec--chico" data-sigue="${esc(c.id)}" data-nombre="${esc(c.nombre)}" aria-label="${esc(c.nombre)}: sigue en el equipo">Sigue</button></span></li>`).join("")}</ul></details>`;
    const resumen = !nListas ? ""
      : !conColor ? `<p class="titular">${nListas === 1 ? "Primera lista" : "Última lista"}: vinieron <b>${vinieron(ult, alUltimo)} de ${alUltimo.length}</b></p>`
      : `<p class="titular">Viene el <b>${promedioCat(cat, d).p}%</b> de las veces</p>
          <p class="asis-nota">En ${pl(nListas, "entrenamiento", "entrenamientos")} con lista este año</p>
          ${tarjNunca}
          ${menos.length ? `<h3 class="grupo">Los que menos vienen</h3>
          <ul class="asis-chicos">${menos.map((c) => `<li><span class="asis-chicos__nom">${linkChico(c.id, c.nombre, cat)}<small>Vino ${c.vino} de ${c.de}</small></span>${porcHTML(c.pct, true)}</li>`).join("")}</ul>` : ""}`;
    const proximos = ses.filter((s) => s.fecha >= hoy), pasados = ses.filter((s) => s.fecha < hoy).reverse();
    const filaSes = (s) => `<li><button type="button" class="fila-cat fila-cat--ses${s.fecha === hoy ? " fila-cat--hoy" : ""}${s.estado === "cancelado" ? " fila-cat--canc" : ""}" data-ir-lista="${s.fecha}">
        <span class="fila-cat__nom">${s.fecha === hoy ? "Hoy" : esc(mayus(corta(s.fecha)))}<small>${s.hora ? esc(s.hora) : "Sin hora"}${s.estado === "extra" ? " · agregado" : s.estado === "movido" ? " · cambió la hora" : ""}</small></span>
        <span class="ses-estado${s.estado !== "cancelado" && sinGuardar(cat, s) ? " ses-estado--ojo" : ""}">${estadoTxt(s, activos, cat)}</span>${IC.adelante}</button></li>`;
    $("#vista").innerHTML = `${cab}
      <section class="sec sec--pegada asis-v">
        ${avisoDelCel(cat)}
        ${actual ? tarjetaHoy(cat, actual, activos) : ""}
        ${!d.horarios.length ? `<div class="hoy"><h3 class="hoy__dia">¿Qué días entrena ${esc(cat)}?</h3>${formDias(d)}
            ${actual ? "" : `<button type="button" class="btn-sec btn-sec--ancho" data-ir-lista="${hoy}">O tomar lista hoy igual</button>`}</div>` : ""}
      </section>
      <section class="sec asis-v">
        ${resumen}
        <ul class="filas-cat asis-ir"><li><button type="button" class="fila-cat fila-cat--asis" data-ir-chicos>
          <span class="fila-cat__nom">Los chicos (${total})<small>Sumar o sacar chicos</small></span>${IC.adelante}</button></li></ul>
      </section>
      <section class="sec asis-v">
        <h2 class="h2">Entrenamientos</h2>
        ${proximos.length ? `<h3 class="grupo">Próximos</h3><ul class="filas-cat">${proximos.map(filaSes).join("")}</ul>` : ""}
        ${pasados.length ? `<h3 class="grupo">Anteriores</h3><ul class="filas-cat">${pasados.map(filaSes).join("")}</ul>` : ""}
        ${S.aform === "agregar" ? formAgregar(d) : `<button type="button" class="btn-sec btn-sec--ancho asis-mas" data-form="agregar">${IC.mas}Agregar un entrenamiento</button>`}
        ${d.horarios.length ? `<ul class="filas-cat asis-ir"><li><button type="button" class="fila-cat fila-cat--asis" data-form="dias" aria-expanded="${S.aform === "dias"}">
          <span class="fila-cat__nom">Días de entrenamiento<small>${esc(mayus(horariosTxt(d.horarios)))}</small></span><span class="ses-estado">Cambiar</span></button></li></ul>
          ${S.aform === "dias" ? formDias(d) : ""}` : ""}
      </section>
      ${avisoHTML()}`;
  }

  /** el título de la tarjeta de los que nunca vinieron, con el "?" pegado a la última palabra */
  const cabNunca = (n) => `${n === 1 ? "Nunca vino: ¿sigue en el" : "Nunca vinieron: ¿siguen en el"} <span class="junto">equipo?${ayudaBtn("nunca")}</span>`;
  /** de la lista o de los chicos, a la categoría */
  const VOLVER_ASIS = { ver: "asis", afecha: null, aform: null, marcas: null, aviso: null, estadoLista: null };
  /** lo que se ve si el buscador no encuentra a nadie */
  const sinChicos = `<p class="asis-nada" id="sin-chicos" hidden>No hay ningún chico con ese nombre.</p>`;

  // los chicos de la categoría: en orden alfabético, para sumar a uno nuevo o sacar a uno que ya no viene (con deshacer ahí mismo)
  function vChicos() {
    const cat = S.acat, d = ASIS.cats[cat];
    const cab = `<div class="cab">${volver(esc(cat), VOLVER_ASIS)}<h2 class="ej-tit">Los chicos de ${esc(cat)}</h2></div>`;
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
      ? `<li class="asis-chicos__fuera" data-q="${esc(qNom(c.nombre))}"><span class="asis-chicos__nom">${nombreHTML(c.nombre)}<small>Ya no está en la lista</small></span>
          <button type="button" class="btn-sec btn-sec--chico" data-volver-chico="${esc(c.id)}">Deshacer</button></li>`
      : `<li data-q="${esc(qNom(c.nombre))}"><span class="asis-chicos__nom">${linkChico(c.id, c.nombre, S.acat)}<small>${c.mano ? "Sumado a mano · " : ""}${pc.get(c.id).de ? `Vino ${pc.get(c.id).vino} de ${pc.get(c.id).de}` : "Todavía sin listas"}</small></span>
          ${conColor && pc.get(c.id).de ? porcHTML(pc.get(c.id).pct, true) : ""}
          <button type="button" class="btn-sec btn-sec--chico" data-sacar="${esc(c.id)}" data-nombre="${esc(c.nombre)}" aria-label="${esc(c.nombre)}: ya no viene">Ya no viene</button></li>`;
    const otrosFuera = fuera.filter((c) => !S.recien.has(c.id));
    $("#vista").innerHTML = `${cab}
      <section class="sec sec--pegada asis-v">
        <div class="asis-form asis-form--suelto"><label class="asis-form__campo" for="nuevo-chico">Sumar a un chico nuevo</label>
          <div class="asis-form__fila"><input id="nuevo-chico" class="asis-input" maxlength="80" placeholder="Apellido, nombre" autocomplete="off" enterkeyhint="done">
          <button type="button" class="btn btn--ok btn--alto" data-sumar-chico>${IC.mas}Sumar</button></div></div>
        ${activos.length > 20 ? `<label class="buscar-g asis-buscar"><span class="sr">Buscar un chico</span>${IC.buscar}<input type="search" id="buscar-chico" placeholder="Buscar por nombre o apellido" autocomplete="off" enterkeyhint="search"></label>` : ""}
        <h3 class="grupo">En la lista (${activos.length})</h3>
        <ul class="asis-chicos asis-chicos--editar" data-filtro>${filas.map(fila).join("")}</ul>
        ${otrosFuera.length ? `<h3 class="grupo">Ya no vienen (${otrosFuera.length})</h3>
          <ul class="asis-chicos asis-chicos--editar" data-filtro>${otrosFuera.map((c) => `<li data-q="${esc(qNom(c.nombre))}"><span class="asis-chicos__nom">${nombreHTML(c.nombre)}</span>
            <button type="button" class="btn-sec btn-sec--chico" data-volver-chico="${esc(c.id)}">Volver a sumar</button></li>`).join("")}</ul>` : ""}
        ${sinChicos}
      </section>
      ${avisoHTML()}`;
  }

  // tomar lista: un toque por chico (verde con tilde = vino). Abajo, fijo, cuántos vinieron y guardar, con cómo va el guardado.
  function vLista() {
    const cat = S.acat, f = S.afecha, d = ASIS.cats[cat];
    const titLista = f > hoyISO() || (ASIS.cats[cat] && (sesiones(ASIS.cats[cat], f, f)[0] || {}).estado === "cancelado") ? "Entrenamiento" : "Lista";
    const cab = (hora) => `<div class="cab">${volver(esc(cat), VOLVER_ASIS)}
      <h2 class="ej-tit">${titLista} de ${esc(cat)}${S.ajunta && compa(cat) && f <= hoyISO() ? ` y ${esc(compa(cat))}` : ""}</h2><p class="prac-cuando">${IC.calendario}<span>${esc(mayus(cuandoP({ fecha: f })))}${hora ? ` · ${esc(hora)}` : ""}</span></p></div>`;
    if (!d) {
      if (!ASIS.error[cat]) cargarAsis(cat);
      $("#vista").innerHTML = `${cab()}<section class="sec sec--pegada asis-v">${cargandoHTML(cat)}</section>`;
      return;
    }
    if (!S.marcas && Date.now() - (ASIS.ts[cat] || 0) > 60000) cargarAsis(cat);
    const s = sesiones(d, f, f)[0] || { fecha: f, hora: "", estado: "nuevo", lista: null };
    const activos = chicosEn(chicosDe(cat, d).activos, f), total = activos.length, futuro = f > hoyISO(), canc = s.estado === "cancelado";
    if (!S.marcas) {
      // lo que quedó marcado en el celular sin guardar tiene prioridad; si no, lo que ya está guardado
      const b = borrador(cat, f), guardados = s.lista ? s.lista.presentes : [];
      S.marcas = new Set(b ? b.marcas : guardados);
      S.base = b ? b.base : guardados;
      S.base2 = b && b.base2 ? b.base2 : null;
      S.amodo = "vino";
      S.ajunta = !!compa(cat) && enCel.get(`los50-junta:${cat}`) === "1";
      S.csTexto = enCel.get(`los50-cs:${cat}|${f}`) || "";
    }
    S.guardados = s.lista ? s.lista.presentes : [];
    // con la otra categoría que entrena junta: sus chicos en la misma lista (al guardar, cada una por su lado)
    const otra = compa(cat), junta = !!otra && S.ajunta && !futuro && !canc, d2 = junta ? ASIS.cats[otra] : null;
    if (junta && !d2 && !ASIS.error[otra]) cargarAsis(otra);
    let activos2 = [], info2 = "";
    if (d2) {
      const s2 = sesiones(d2, f, f)[0], g2 = s2 && s2.lista ? s2.lista.presentes : [];
      if (S.base2 == null) { const b2 = borrador(otra, f); (b2 ? b2.marcas : g2).forEach((x) => S.marcas.add(x)); S.base2 = b2 ? b2.base : g2; }
      if (s2 && s2.lista) info2 = `<p class="lista-info">${IC.tilde}<span>${esc(otra)}: vinieron ${vinieron(s2.lista, chicosEn(chicosDe(otra, d2).activos, f))} de ${chicosEn(chicosDe(otra, d2).activos, f).length} · ${tomoTxt(s2.lista)}</span></p>`;
      S.guardados = [...S.guardados, ...g2];
      const ya = new Set(activos.map((c) => c.id));
      activos2 = chicosEn(chicosDe(otra, d2).activos, f).filter((c) => !ya.has(c.id));
    }
    const n = [...activos, ...activos2].filter((c) => S.marcas.has(c.id)).length;
    // los que dejaron de venir: solo en la lista de hoy (es cuando sirve preguntar por ellos)
    const dej = f === hoyISO() ? [...dejaronDe(cat, d), ...(d2 ? dejaronDe(otra, d2) : [])] : [];
    const acciones = s.estado === "nuevo" ? "" : S.aform === `suspender:${f}` ? (s.estado === "extra" ? formBorrarExtra(s) : formSuspender(s, activos))
      : S.aform === `hora:${f}` ? formHora(s)
      : `<div class="acc-2">${botonQuitar(s, "Borrar este entrenamiento")}
          <button type="button" class="btn-sec" data-form="hora:${f}">Cambiar la hora</button></div>`;
    let cuerpo;
    if (canc) {
      cuerpo = `<div class="hoy hoy--canc"><p class="hoy__canc">Este entrenamiento se suspendió${s.motivo ? `: ${esc(s.motivo)}` : ""}</p>
        <button type="button" class="btn-sec btn-sec--ancho" data-deshacer="${f}">Deshacer: vuelve a haber entrenamiento</button></div>`;
    } else if (futuro) {
      cuerpo = `<div class="hoy">${acciones}</div>`;
    } else {
      const borrarForm = S.aform === "borrar-lista" ? `<div class="asis-form"><span class="asis-form__l">¿Borrar la lista de este día? Se pierden los ${s.lista ? vinieron(s.lista, activos) : 0} que vinieron.</span>
          <div class="asis-form__btns"><button type="button" class="btn btn--peligro btn--alto" data-borrar-lista-ok>Borrar la lista</button>${cerrarBtn}</div></div>` : "";
      const item = (c) => { const les = S.marcas.has(LES(c.id));
        return `<li data-q="${esc(qNom(c.nombre))}"><button type="button" class="lista-it${les ? " lista-it--les" : ""}" data-marca="${esc(c.id)}" aria-pressed="${S.marcas.has(c.id)}">
          <span class="lista-it__ic">${les ? IC.alerta : IC.tilde}</span><span class="lista-it__nom">${nombreHTML(c.nombre)}${les ? `<small class="lista-it__les">Lesionado</small>` : ""}</span></button></li>`; };
      const todos = total + activos2.length, les = S.amodo === "les", nTodos = n === todos && todos > 0;
      cuerpo = `
        ${avisoDelCel(cat)}
        ${s.lista ? `<p class="lista-info">${IC.tilde}<span>${junta ? `${esc(cat)}: v` : "V"}inieron ${vinieron(s.lista, activos)} de ${total} · ${tomoTxt(s.lista)}</span></p>` : ""}${info2}
        ${dej.length ? `<p class="lista-info lista-info--ojo">${IC.alerta}<span>Faltaron a los últimos 3: ${dej.map((c) => nombreHTML(c.nombre)).join("; ")}. ${dej.length === 1 ? "Llamalo" : "Llamalos"}.</span></p>` : ""}
        ${otra ? `<p class="lista-con">${junta ? `Entrenan juntas con ${esc(otra)}` : `¿Entrena con ${esc(otra)}?`}<button type="button" class="link lista-con__b" data-junta aria-pressed="${junta}">${junta ? "Separar" : "Tomar las dos juntas"}</button></p>` : ""}
        <div class="lista-cab"><span>${les ? "Tocá al que está lesionado: vino pero no entrena" : nTodos ? "Tocá a los que faltaron" : s.lista ? "Tocá a los que llegaron tarde" : "Tocá a los que vinieron"}</span>
          <button type="button" class="btn-sec btn-sec--chico" data-todos${(n && !nTodos) || les ? " hidden" : ""}>${nTodos ? "Desmarcar a todos" : "Marcar a todos"}</button></div>
        <div class="chips-g lista-modo" role="group" aria-label="Qué marcás"><button type="button" data-amodo="vino" aria-pressed="${!les}">Vino</button><button type="button" data-amodo="les" aria-pressed="${les}">Lesionado</button></div>
        ${todos > 30 ? `<label class="buscar-g asis-buscar"><span class="sr">Buscar un chico</span>${IC.buscar}<input type="search" id="buscar-chico" placeholder="Buscar por nombre o apellido" autocomplete="off" enterkeyhint="search"></label>` : ""}
        ${junta && !d2 ? `<p class="cargando">Cargando a los de ${esc(otra)}…</p>` : ""}
        ${activos2.length ? `<h3 class="grupo">${esc(cat)}</h3>` : ""}<ul class="lista-g" data-filtro>${activos.map(item).join("")}</ul>
        ${activos2.length ? `<h3 class="grupo">${esc(otra)}</h3><ul class="lista-g" data-filtro>${activos2.map(item).join("")}</ul>` : ""}
        ${sinChicos}
        <div class="lista-mas"><h3 class="grupo">¿Cómo salió?</h3>${comoSalioHTML(cat, f)}</div>
        <div class="lista-mas"><h3 class="grupo">Este entrenamiento${junta ? ` de ${esc(cat)}` : ""}</h3>${acciones}
          ${s.lista && S.aform !== "borrar-lista" ? `<button type="button" class="btn-sec btn-sec--ancho" data-form="borrar-lista">Borrar la lista de este día</button>` : ""}${borrarForm}</div>
        <div class="lista-pie" id="pie-lista">${pieHTML(n, todos)}</div>`;
    }
    $("#vista").innerHTML = `${cab(s.hora)}<section class="sec sec--pegada asis-v">${cuerpo}</section>${avisoHTML()}`;
    altoPie();
  }
  /** el aviso de abajo va arriba de la barra (que es más alta en los celulares chicos) */
  const altoPie = () => { const p = $("#pie-lista"); if (p) document.documentElement.style.setProperty("--pie-alto", `${Math.round(p.offsetHeight)}px`); };
  /** la barra fija de abajo: cuántos vinieron y guardar; mientras guarda, si falla o si hay que volver a poner la clave */
  function pieHTML(n, total) {
    if (S.estadoLista === "vacia") return `<span class="lista-pie__error">¿No vino nadie? Se guarda así, con 0.</span>
      <span class="lista-pie__btns"><button type="button" class="btn-sec" data-seguir-lista>Seguir marcando</button><button type="button" class="btn btn--peligro" data-guardar-vacia>Guardar igual</button></span>`;
    if (S.estadoLista === "guardando") return `<span><b class="num">${n}</b> de ${total} vinieron</span>
      <button type="button" class="btn btn--ok btn--grande" disabled><span class="girando" aria-hidden="true"></span>Guardando…</button>`;
    if (S.estadoLista === "error" || S.estadoLista === "servidor") return `<span class="lista-pie__error">No se guardó${S.estadoLista === "error" ? ": no hay señal" : ""}. Lo marcado queda en el celular.</span>
      <button type="button" class="btn btn--peligro btn--grande" data-guardar-lista>Probar de nuevo</button>`;
    if (S.estadoLista === "clave") return `<span class="lista-pie__error">Hay que volver a poner la clave. Lo marcado queda en el celular.</span>
      <button type="button" class="btn btn--peligro btn--grande" data-reclave>Poner la clave</button>`;
    const cambios = !mismos([...(S.marcas || [])], S.guardados || []), nl = [...(S.marcas || [])].filter((x) => x.startsWith("les-")).length;
    return `<span><span role="status"><b class="num" id="cont">${n}</b> de ${total} vinieron${nl ? ` · ${nl} ${nl === 1 ? "lesionado" : "lesionados"}` : ""}</span>${S.amodo === "les" ? `<small class="lista-pie__ojo">Marcando lesionados</small>` : ""}<small class="lista-pie__ojo" id="sin-guardar"${cambios ? "" : " hidden"}>Sin guardar</small></span>
      <button type="button" class="btn btn--ok btn--grande" data-guardar-lista>${IC.tilde}Guardar la lista</button>`;
  }
  function pintarPie() {
    const pie = $("#pie-lista");
    if (!pie) return;
    pie.classList.toggle("lista-pie--error", ["error", "servidor", "clave"].includes(S.estadoLista));
    pie.innerHTML = pieHTML(document.querySelectorAll(".lista-it[aria-pressed='true']").length, document.querySelectorAll(".lista-it").length);
    altoPie();
  }
  /** guarda la lista: manda solo lo que cambió (así si otro entrenador también tomó lista, se juntan) y, si no hay señal, no se pierde nada */
  async function guardarLista(vacia) {
    const cat = S.acat, f = S.afecha;
    const b = borrador(cat, f) || borrLista();
    // la otra categoría (si se tomaron juntas) se guarda solo si se marcó a alguno de ellos o ya tenía lista ese día
    const otra = S.ajunta && compa(cat) && ASIS.cats[compa(cat)] && (soloDe(compa(cat), b.marcas).length || (b.base2 || []).length) ? compa(cat) : null;
    // una lista nueva sin nadie marcado cuenta como que no vino ninguno: se pregunta antes
    const s0 = sesiones(ASIS.cats[cat], f, f)[0];
    if (!vacia && !soloDe(cat, b.marcas).length && !(s0 && s0.lista) && !otra) { S.estadoLista = "vacia"; pintarPie(); return; }
    S.estadoLista = "guardando"; pintarPie();
    try {
      // cada categoría guarda solo a sus chicos (si se tomaron juntas, la otra con su propia base)
      await api({ cat, accion: "lista", fecha: f, presentes: soloDe(cat, b.marcas), base: soloDe(cat, b.base) });
      if (otra) await api({ cat: otra, accion: "lista", fecha: f, presentes: soloDe(otra, b.marcas), base: soloDe(otra, b.base2 || []) });
      guardarBorrador(cat, f, null);
      if (otra) guardarBorrador(otra, f, null);
      ponerAsis(cat, await api(null, cat));
      if (otra) ponerAsis(otra, await api(null, otra));
      ASIS.resumen = null;
      S.estadoLista = null;
      const cuenta = (c) => { const ese = chicosEn(chicosDe(c, ASIS.cats[c]).activos, f), l = ASIS.cats[c].listas.find((x) => x.fecha === f); return `${otra ? `${c}: ` : ""}vinieron ${l ? vinieron(l, ese) : 0} de ${ese.length}`; };
      enCel.set(ULTIMA, cat);
      avisar("ok", `${otra ? "Listas guardadas" : "Lista guardada"}: ${[cat, otra].filter(Boolean).map(cuenta).join(" · ")}`);
      volverAtras({ ver: "asis", afecha: null, aform: null, marcas: null });
    } catch (e) {
      S.estadoLista = e.message === "clave" ? "clave" : e.message === "servidor" ? "servidor" : "error";
      pintarPie();
    }
  }
  // si se cortó la señal mientras guardaba, apenas vuelve lo intenta solo
  setInterval(() => {
    if (S && S.ver === "lista" && S.estadoLista === "error" && navigator.onLine !== false) guardarLista();
    if (S && S.ver === "equipo" && S.eqcontar) guardarCntSolo(S.eqcat, S.eqfecha);
    mandarPendientes();
  }, 20000);
  addEventListener("online", () => {
    if (!S) return;
    Object.keys(ASIS.delCel).forEach((c) => cargarAsis(c));
    if (S.ver === "lista" && S.estadoLista === "error") guardarLista();
    // primero se manda lo pendiente y después se trae lo último (así no se ve un rato lo de antes)
    mandarPendientes().finally(() => { if (EQ.delCel) cargarEquipos(); if (CNT.delCel) cargarConteos(); });
  });

  /** la práctica en texto, para WhatsApp */
  function textoPractica(p) {
    const l = [`*${p.foco || "Práctica"}*`, `${p.grupo} · ${mayus(cuandoP(p))}${minDe(p) ? ` · ${minDe(p)} min` : ""}`];
    if (p.objetivos.length) l.push("", "*Objetivos*", ...p.objetivos.map((o) => `• ${o}`));
    p.bloques.forEach((b, i) => {
      if (b.agua) { if (!(p.bloques[i - 1] || {}).agua) l.push("", `Agua${b.min ? ` (${b.min} min)` : ""}`); return; }
      const m = b.items.reduce((s, it) => s + (it.min || 0), 0);
      if (b.b) l.push("", `*${b.b}*${m ? ` (${m} min)` : ""}`);
      b.items.filter((it) => it.obj || it.act || it.det).forEach((it) => {
        const [uno, ...resto] = [it.obj, it.act, it.det].filter(Boolean).map((x) => x.trim().replace(/\.+$/, ""));
        l.push(`• ${it.min ? `${it.min}' ` : ""}${uno}${it.grupo && it.grupo !== "Todos" ? ` (${it.grupo})` : ""}`, ...resto.map((x) => `   ${x}`));
      });
    });
    if (p.cierre) l.push("", "Charla final y elongación");
    l.push("", `Práctica de ${p.quien} · Club Los 50`);
    return l.join("\n");
  }
  const compartirPractica = () => { const p = todasPr().find((x) => x.id === S.practica); return compartir(p.foco, textoPractica(p)); };
  let compartiendo = false;
  async function compartir(titulo, txt) {
    // en el celular abre el menú de compartir (WhatsApp, mail…); en la compu, WhatsApp Web. Dos toques seguidos abren uno solo
    if (compartiendo) return;
    compartiendo = true;
    try {
      if (navigator.share) {
        try { await navigator.share({ title: titulo, text: txt }); return; } catch (e) { if (e.name === "AbortError" || e.name === "InvalidStateError") return; }
      }
      window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, "_blank", "noopener");
    } finally { compartiendo = false; }
  }

  // ---------- eventos de Partidos: el equipo, contar y los amistosos ----------
  /** al entrar a contar, "Deshacer" arranca de cero (no deshace lo de otro día) */
  const limpiarDeshacer = (cat, f) => { const b = cntBorr(cat, f); if (b && b.h && b.h.length) { b.h = []; enCel.set(cntClave(cat, f), JSON.stringify(b)); } };
  document.addEventListener("click", (ev) => {
    if (!S) return;
    // tocar la tarjeta de un partido (no solo su botón) abre su equipo
    const li = !ev.target.closest("button, a, input, select, label") && ev.target.closest("#vista li.res");
    if (li && li.querySelector("[data-ir-equipo]")) { li.querySelector("[data-ir-equipo]").click(); return; }
    const t = ev.target.closest("[data-eq-siempre],[data-cnt-corr],[data-cnt-quita],[data-ir-res],[data-ir-salio],[data-ir-resultado],[data-cnt-otro],[data-cnt-entra],[data-ir-equipo],[data-ir-contar],[data-eq-n],[data-eq-id],[data-eq-no-confirmar],[data-eq-vaciar],[data-eq-mas],[data-eq-mandar],[data-eq-texto],[data-eq-borrar],[data-eq-no-borrar],[data-eq-deshacer],[data-eq-elige],[data-eq-nombre-ok],[data-eq-nombre-no],[data-eq-datos-ok],[data-eq-res-ok],[data-eq-res-borrar],[data-amistoso-ok],[data-am-abrir],[data-eq-contar],[data-cacc],[data-cmas],[data-cuenta],[data-cdeshacer],[data-cres],[data-cres-compartir],[data-reintentar-cnt],[data-reintentar-eq],[data-cerrar-foto]");
    if (!t || t.disabled) return;
    const ds = t.dataset, cat = S.eqcat, f = S.eqfecha;
    const abrir = (eqcat, eqfecha, contar, cres = null) => irA({ ver: "equipo", eqcat, eqfecha, eqn: null, eqmas: 0, eqcontar: contar, cres, cmas: false, cacc: "tackles", cntOtro: false, cntCorr: false, aform: null, aviso: null, eqChoque: null, eqConfirmar: null, eqAntes: null });
    if (ds.irSalio) { const [c, fe] = ds.irSalio.split("|"); abrir(c, fe, true, true); }
    else if (ds.irEquipo || ds.irContar) {
      const [c, fe] = (ds.irEquipo || ds.irContar).split("|");
      if (ds.irContar) limpiarDeshacer(c, fe);
      abrir(c, fe, !!ds.irContar);
    }
    else if (ds.amAbrir) { const [c, fe] = ds.amAbrir.split("|"); abrir(c, fe, false); }
    else if (ds.eqN) { S.eqfoco = +ds.eqN; irA({ eqn: +ds.eqN, aviso: null, eqConfirmar: null }); }
    else if (ds.eqId) {
      // el que no debería jugar (lesionado, sancionado, sin ficha médica): primero se pregunta
      if (ds.eqNo && !("eqForzar" in ds)) { S.eqConfirmar = { id: ds.eqId, t: ds.eqNo }; render(); return; }
      S.eqConfirmar = null;
      // si el chico ya estaba en otro número, se cambian de lugar
      const e = eqActual(cat, f), num = String(S.eqn), id = ds.eqId, antes = e.jugadores[num];
      const ya = Object.keys(e.jugadores).find((n) => e.jugadores[n] === id && n !== num);
      const pl = eqPlantel(cat), ap = (x) => esc(apellido(eqQuien(x, pl).nombre)), plan = ya && !antes && e.cambios[ya];
      // lo que pasó, con quién sale: queda abajo con su "Deshacer" hasta el próximo cambio
      const noA = antes && ya && eqAvisos(antes, eqQuien(antes, pl), eqCtx()).find((a) => a.duro); // lesionado o sancionado: no se pasa al banco
      const txt = noA ? `${ap(id)} pasa al ${num}; ${ap(antes)} (${esc(noA.corto.toLowerCase())}) sale del equipo`
        : ya ? `${ap(id)} pasa al ${num}${antes ? ` y ${ap(antes)} al ${ya}` : `; el ${ya} quedó vacío${plan ? " (y sin su cambio)" : ""}`}` : `${ap(id)} al ${num}${antes ? `, sale ${ap(antes)}` : ""}`;
      const previo = JSON.parse(JSON.stringify(e));
      if (ya) { if (antes && !noA) e.jugadores[ya] = antes; else { delete e.jugadores[ya]; delete e.cambios[ya]; } }
      e.jugadores[num] = id;
      S.eqAntes = antes !== id ? { k: eqClave(cat, f), e: previo, txt } : S.eqAntes;
      eqAnotar(e);
      volverAtras({ ver: "equipo", eqn: null });
    }
    else if ("eqNoConfirmar" in ds) { S.eqConfirmar = null; render(); const i = $("#buscar-eq"); if (i) i.focus(); }
    else if ("eqVaciar" in ds) {
      const e = eqActual(cat, f), quien = e.jugadores[S.eqn] && apellido(eqQuien(e.jugadores[S.eqn], eqPlantel(cat)).nombre);
      S.eqAntes = { k: eqClave(cat, f), e: JSON.parse(JSON.stringify(e)), txt: quien ? `${esc(quien)} salió del ${S.eqn}` : `El ${S.eqn} quedó vacío` };
      delete e.jugadores[S.eqn]; delete e.cambios[S.eqn];
      eqAnotar(e);
      volverAtras({ ver: "equipo", eqn: null });
    }
    else if ("eqMas" in ds) {
      const e = eqActual(cat, f), h = eqHasta(e), libre = Array.from({ length: h - 15 }, (_, i) => i + 16).find((x) => !e.jugadores[x]);
      if (!libre) S.eqmas = h - 22; // el banco está lleno: un número más
      S.eqfoco = libre || h + 1; irA({ eqn: libre || h + 1, aviso: null, eqConfirmar: null });
    }
    else if ("eqMandar" in ds) mandarAlGrupo(ds.eqMandar === "si");
    else if ("eqTexto" in ds) { cerrarImagen(); compartir(`Equipo de ${cat}`, textoEquipo()); }
    else if ("eqBorrar" in ds) borrarEquipo();
    else if ("eqNoBorrar" in ds) { S.aform = null; render(); const b = $('[data-form="borrar-eq"]'); if (b) b.focus(); }
    else if ("eqDeshacer" in ds) {
      // vuelve el equipo a como estaba antes del último cambio
      if (S.eqAntes && S.eqAntes.k === eqClave(cat, f)) { eqAnotar(S.eqAntes.e); S.eqAntes = null; S.aviso = null; avisar("ok", "Listo, quedó como antes"); render(); const st = $("#eq-estado"); if (st) st.focus({ preventScroll: true }); }
    }
    else if (ds.irRes) { const [c, fe] = ds.irRes.split("|"); abrir(c, fe, false); S.aform = "res-eq"; render(); const i = $("#eq-pf"); if (i) { i.scrollIntoView({ block: "center" }); i.focus({ preventScroll: true }); } }
    else if ("irResultado" in ds) { const i = $("#eq-pf"); if (i) { i.scrollIntoView({ block: "center" }); i.focus({ preventScroll: true }); } }
    else if ("eqSiempre" in ds) {
      const previo = JSON.parse(JSON.stringify(eqActual(cat, f))), { e, n, afuera } = completarDeSiempre();
      if (!n) { avisoSuelto("No hay más sugeridos para los que faltan: elegilos tocando cada número.", "ojo"); return; }
      S.eqAntes = { k: eqClave(cat, f), e: previo, txt: `${n === 1 ? "1 puesto" : `${n} puestos`} con los de siempre${afuera.length ? `; afuera: ${esc(afuera.join(", "))}` : ""}` };
      eqAnotar(e); render();
      if (afuera.length) avisoSuelto(`Quedó afuera: ${esc(afuera.join(", "))}.`, "ojo");
    }
    else if (ds.eqElige) {
      // otro entrenador cambió el mismo número: se queda el que se elige y se manda
      const [nn, id] = ds.eqElige.split("|"), e = eqActual(cat, f), ch = S.eqChoque;
      if (nn.startsWith("d:")) e[nn.slice(2)] = id; // rival, hora, lugar, citación o resultado
      else if (id) { Object.keys(e.jugadores).forEach((x) => { if (e.jugadores[x] === id && x !== nn) delete e.jugadores[x]; }); e.jugadores[nn] = id; } else delete e.jugadores[nn];
      if (ch) { ch.choques = ch.choques.filter((x) => (nn.startsWith("d:") ? x.campo !== nn.slice(2) : x.n !== nn)); if (!ch.choques.length) S.eqChoque = null; }
      eqAnotar(e);
      render();
    }
    else if ("eqNombreOk" in ds || "eqNombreNo" in ds) {
      const v = $("#eq-nombre") ? $("#eq-nombre").value.trim().slice(0, 60) : "";
      if ("eqNombreOk" in ds) { if (!v) { $("#eq-nombre").focus(); return; } enCel.set(claveNombreNota, v); avisar("ok", `Listo, ${esc(v)}`); }
      else enCel.set("los50-ent-sin-nombre", "1");
      render();
    }
    else if ("eqDatosOk" in ds) {
      const e = eqActual(cat, f);
      if (!eqPartido(cat, f)) {
        const h = $("#eq-hora").value, c = $('input[name="eq-cond"]:checked');
        e.rival = $("#eq-rival").value.trim().slice(0, 60); e.hora = /^([01]\d|2[0-3]):[0-5]\d$/.test(h) ? h : ""; e.cond = c ? c.value : "";
      }
      eqAnotar(e); S.aform = null; render();
    }
    else if ("eqResOk" in ds) {
      const a = $("#eq-pf").value.trim(), b = $("#eq-pc").value.trim(), ok = (v) => /^\d{1,3}$/.test(v);
      if (!ok(a) || !ok(b)) {
        const er = $("#eq-res-error"), mal = ok(a) ? $("#eq-pc") : $("#eq-pf");
        $("#eq-pf").setAttribute("aria-invalid", String(!ok(a))); $("#eq-pc").setAttribute("aria-invalid", String(!ok(b)));
        if (er) { er.hidden = false; er.textContent = "Poné los tantos de los dos (por ejemplo, 24 y 10)."; }
        mal.focus(); return;
      }
      const e = eqActual(cat, f); e.pf = +a; e.pc = +b;
      eqAnotar(e); S.aform = null; avisar("ok", "Resultado guardado"); render();
    }
    else if ("eqResBorrar" in ds) { const e = eqActual(cat, f); e.pf = ""; e.pc = ""; eqAnotar(e); S.aform = null; avisar("ok", "Resultado borrado"); render(); }
    else if ("amistosoOk" in ds) {
      const c = $("#am-cat").value, fecha = $("#am-fecha").value, rival = $("#am-rival").value.trim().slice(0, 60), err = $("#am-error"), fi = $("#am-fecha");
      const hora = /^([01]\d|2[0-3]):[0-5]\d$/.test($("#am-hora").value) ? $("#am-hora").value : "", lado = $('input[name="am-cond"]:checked'), cond = lado ? lado.value : "";
      const desde = masDias(hoyISO(), -30);
      let mal = !fechaOk(fecha) ? "Elegí el día del partido." : fecha < desde ? `Elegí un día desde el ${corta(desde)} en adelante.` : "";
      const px = !mal && eqPartido(c, fecha), ya = !mal && !px && (eqGuardado(c, fecha) || eqBorr.get(eqClave(c, fecha)));
      if (px) { err.hidden = false; fi.setAttribute("aria-invalid", "true"); err.innerHTML = `Ese día ${esc(c)} ya juega con ${esc(nombreRival(px.rival))} (partido de la UAR). <button type="button" class="link" data-ir-equipo="${esc(c)}|${fecha}">Abrir ese partido</button>`; fi.focus(); return; }
      // el error queda al lado del campo, sin irse solo; si ya hay un amistoso ese día, se ofrece abrirlo (nunca se pisa)
      fi.setAttribute("aria-invalid", String(!!(mal || ya))); err.hidden = !(mal || ya);
      if (ya) { const i = eqInfo(c, fecha); err.innerHTML = `Ese día ${esc(c)} ya tiene un amistoso con ${esc(i.rival || "rival a definir")}${ya.por ? ` (lo cargó ${esc(ya.por)})` : ""}. Por ahora va uno por día. <button type="button" class="link" data-am-abrir="${esc(c)}|${fecha}">Abrir ese amistoso</button>`; fi.focus(); return; }
      if (mal) { err.textContent = mal; fi.focus(); return; }
      const k = eqClave(c, fecha);
      const paso = fecha < hoyISO(), gol = (i) => (paso && /^\d{1,3}$/.test($(i).value.trim()) ? +$(i).value.trim() : "");
      const pf = gol("#am-pf"), pc = gol("#am-pc"), conRes = pf !== "" && pc !== "";
      eqBorr.set(k, { jugadores: {}, cambios: {}, rival, hora, cond, cita: "", lugar: "", pf: conRes ? pf : "", pc: conRes ? pc : "", base: null });
      abrir(c, fecha, false);
      guardarEqSolo(c, fecha).then(() => { if (S.eqChoque) return; const sin = pendientes().includes(`eq:${k}`); avisoSuelto(sin ? "Sin señal: el amistoso quedó en el celular y se manda solo cuando vuelva." : (fecha < hoyISO() ? "Amistoso guardado. Ahora cargá quién jugó." : "Amistoso guardado: ya lo ven los otros entrenadores. Ahora elegí quién juega."), sin ? "ojo" : "ok"); });
    }
    else if ("eqContar" in ds) { limpiarDeshacer(cat, f); irA({ eqcontar: true, eqn: null, cres: ds.eqContar === "salio" ? true : null, cmas: false, cacc: "tackles", cntOtro: false, aviso: null }); }
    else if ("cntCorr" in ds) { if (ds.cntCorr === "1") irA({ cntCorr: true, aviso: null }); else volverAtras({ cntCorr: false }); }
    else if (ds.cntQuita) {
      const [id, x] = ds.cntQuita.split("|");
      if (!((cntActual(cat, f).c[id] || {})[x])) return;
      cntSumar(cat, f, id, x, -1, "quita"); cntProgramar(cat, f);
      avisar("ok", id === "equipo" ? `Sacaste un ${UNO_C[x]}` : `Le sacaste un ${UNO_C[x]} a ${esc(apellido(eqQuien(id, eqPlantel(cat)).nombre))}`);
      render();
      const b = $(`[data-cnt-quita="${CSS.escape(ds.cntQuita)}"]`) || $("[data-cnt-corr]"); if (b) b.focus({ preventScroll: true });
    }
    else if ("cntOtro" in ds) { if (ds.cntOtro === "1") irA({ cntOtro: true, aviso: null }); else volverAtras({ cntOtro: false }); }
    else if (ds.cntEntra) {
      // entró uno que no estaba: va al primer número libre del banco
      const e = eqActual(cat, f), libre = Array.from({ length: EQ_MAX - 15 }, (_, i) => String(i + 16)).find((n) => !e.jugadores[n]);
      if (!libre) { avisoSuelto("El banco está lleno (hasta el 30)."); return; }
      e.jugadores[libre] = ds.cntEntra; eqAnotar(e); S.cntNuevo = ds.cntEntra;
      avisar("ok", `${esc(apellido(eqQuien(ds.cntEntra, eqPlantel(cat)).nombre))} entró con el ${libre}`);
      volverAtras({ cntOtro: false });
    }
    else if (ds.cacc) { S.cacc = ds.cacc; S.cmas = false; render(); const b = $(`.cnt-tabs [data-cacc="${ds.cacc}"]`) || $("[data-cmas]"); if (b) b.focus({ preventScroll: true }); }
    else if ("cmas" in ds) { S.cmas = !S.cmas; if (S.cmas && !OTRAS_C.some(([x]) => x === S.cacc)) S.cacc = "contactos"; render(); const b = S.cmas ? $(".cnt-otras button") : $("[data-cmas]"); if (b) b.focus({ preventScroll: true }); }
    else if (ds.cuenta) {
      // un toque = uno más, sin volver a dibujar (rápido, como en Statline); queda en el celular al momento y se manda solo
      const id = ds.cuenta, x = ds.cacion || "tackles";
      cntSumar(cat, f, id, x, 1);
      const v = (cntActual(cat, f).c[id] || {})[x] || 0, b = t.querySelector(".cnt-b__v"), a = ACCIONES.find((y) => y[0] === x);
      if (b) { b.textContent = v; b.classList.remove("cnt-b__v--0"); }
      t.setAttribute("aria-label", t.getAttribute("aria-label").replace(/(Lleva|Van) \d+$/, `$1 ${v}`));
      $("#cnt-voz").textContent = id === "equipo" ? `${ds.nom}: ${v}` : `${ds.nom}: ${v} ${v === 1 ? a[1].toLowerCase() : a[2]}`;
      t.classList.remove("cnt-b--suma"); void t.offsetWidth; t.classList.add("cnt-b--suma");
      if (navigator.vibrate) navigator.vibrate(12);
      pintarPieCnt(); cntProgramar(cat, f);
    }
    else if ("cdeshacer" in ds) {
      const k = cntActual(cat, f), b = cntBorr(cat, f), u = b && b.h && b.h.pop();
      if (!u) return;
      enCel.set(cntClave(cat, f), JSON.stringify(b)); // sin el último toque en la lista para deshacer
      const vuelve = u[2] === "-"; // deshacer un "Corregir": se devuelve lo que se sacó
      if (vuelve) cntSumar(cat, f, u[0], u[1], 1, "no"); else if ((k.c[u[0]] || {})[u[1]]) cntSumar(cat, f, u[0], u[1], -1);
      avisar("ok", u[0] === "equipo" ? `${vuelve ? "Volvió" : "Sacaste"} un ${UNO_C[u[1]] || ""}`
        : `${vuelve ? "Le devolviste" : "Le sacaste"} un ${UNO_C[u[1]] || ""} a ${esc(apellido(eqQuien(u[0], eqPlantel(cat)).nombre))}`);
      render(); cntProgramar(cat, f);
      const bd = $("[data-cdeshacer]"); if (bd && !bd.disabled) bd.focus({ preventScroll: true });
    }
    // "Cómo va" es un paso más (el "atrás" del celular vuelve a contar); "Seguir contando" vuelve atrás (no suma pasos)
    else if ("cres" in ds) { if (ds.cres === "1") { S.cresDesde = true; irA({ cres: true, aviso: null }); } else if (S.cresDesde && hayAtras()) { S.cresDesde = false; history.back(); } else irSinPaso({ cres: false, aviso: null }); }
    else if ("cresCompartir" in ds) {
      // en "Cómo va", el tanteador que se escribió (si están los dos) va en el mensaje
      const a = $("#eq-pf"), b = $("#eq-pc"), ok = (v) => /^\d{1,3}$/.test(v);
      if (a && b && S.eqcontar && S.eqfecha >= hoyISO()) {
        enCel.set(vaClave(cat, f), ok(a.value.trim()) && ok(b.value.trim()) ? JSON.stringify([+a.value.trim(), +b.value.trim()]) : null);
        // sin el tanteador: se pregunta una vez (el segundo toque lo manda igual)
        if (!a.value.trim() && !b.value.trim() && S.vaPregunta !== `${cat}|${f}`) {
          S.vaPregunta = `${cat}|${f}`; const er = $("#eq-res-error");
          if (er) { er.hidden = false; er.textContent = "¿Cómo va el tanteador? Ponelo acá arriba, o tocá “Mandar al grupo” de nuevo para mandarlo sin."; }
          a.scrollIntoView({ block: "center" }); a.focus({ preventScroll: true }); return;
        }
      }
      compartir(`Partido de ${cat}`, textoConteo());
    }
    else if ("reintentarCnt" in ds) { CNT.error = null; EQ.error = null; render(); }
    else if ("reintentarEq" in ds) { EQ.error = null; render(); }
    else if ("cerrarFoto" in ds) cerrarImagen();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("#foto-eq")) cerrarImagen(); });
  // sin señal: al contar solo cambia la barra de abajo (los botones no se mueven bajo el dedo); en lo demás se redibuja
  addEventListener("offline", () => { if (S && S.ver === "equipo" && S.eqcontar && !S.cres) pintarPieCnt(); else if (S && ["equipo", "partidos"].includes(S.ver)) render(); });
  // al volver a la app (después de WhatsApp, por ejemplo), lo que cambió otro entrenador se ve sin recargar
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !S || !["equipo", "partidos", "inicio"].includes(S.ver) || navigator.onLine === false) return;
    if (EQ.lista && !EQ.cargando) cargarEquipos();
    if (CNT.lista && !CNT.cargando) cargarConteos();
  });

  // ---------- eventos ----------
  document.addEventListener("click", (e) => {
    if (!S) return;
    const t = e.target.closest("[data-atras],[data-subir],[data-alcat],[data-ncat],[data-nota-ok],[data-borrar-nota-ok],[data-reintentar-notas],[data-cs-ok],[data-ir-chico],[data-ir-doc],[data-dmarca],[data-docs-guardar],[data-reintentar-docs],[data-tomar],[data-tver],[data-tdia],[data-toma-guardar],[data-reintentar-tests],[data-edad],[data-area],[data-area-cat],[data-play],[data-reclave],[data-ayuda],[data-cerrar-ayuda],[data-ir],[data-ir-cat],[data-ir-guia],[data-ir-scrum],[data-borrar-qp],[data-ir-ej],[data-ir-ej-para],[data-ir-ej-tab],[data-ir-line],[data-ir-puesto],[data-ir-practica],[data-ir-practicas],[data-pgrupo],[data-ir-asis],[data-ir-hoy],[data-ir-lista],[data-ir-chicos],[data-form],[data-reintentar],[data-motivo],[data-dia],[data-marca],[data-amodo],[data-junta],[data-todos],[data-guardar-vacia],[data-seguir-lista],[data-cerrar-aviso],[data-cancelar-ok],[data-deshacer],[data-hora-ok],[data-agregar-ok],[data-horarios-ok],[data-guardar-lista],[data-borrar-lista-ok],[data-sacar],[data-sigue],[data-volver-chico],[data-sumar-chico],[data-compartir-pr],[data-rol],[data-quitar-para],[data-tab],[data-anio],[data-ver],[data-ordj]");
    if (!t || t.disabled) return;
    if (t.tagName === "A") e.preventDefault(); // el escudo de arriba: va al inicio sin recargar
    const ds = t.dataset, ir = "lado" in ds ? irSinPaso : irA; // Anterior / Siguiente no suman pasos
    if ("atras" in ds) history.back();
    else if ("subir" in ds) irSinPaso(SUBIR);
    else if (ds.edad) { S.pedad = ds.edad; render(); }
    else if ("csOk" in ds) {
      const texto = $("#cs-texto").value.trim(), por = ($("#cs-por") ? $("#cs-por").value : enCel.get(claveNombreNota) || "").trim();
      if (texto.length < 3) { avisoSuelto("Escribí cómo salió."); $("#cs-texto").focus(); return; }
      if (por.length < 2) { avisoSuelto("Escribí tu nombre."); $("#cs-por").focus(); return; }
      enCel.set(claveNombreNota, por);
      S.csTexto = ""; enCel.set(`los50-cs:${S.acat}|${S.afecha}`, null);
      guardarNota({ accion: "nota", cat: S.acat, texto, por, fecha: S.afecha }, "Guardado: se ve en Planificación");
    }
    else if (ds.irDoc) irA({ ver: "doclista", ddoc: ds.irDoc, aviso: null });
    else if (ds.dmarca) {
      // como tomar lista: sin volver a dibujar; lo marcado queda en el celular
      const id = ds.dmarca, on = !S.dmarcas.has(id), d = docDe(S.ddoc), pl = testPlantel(S.dcat), t = docTienen(d.k);
      if (on) S.dmarcas.add(id); else S.dmarcas.delete(id);
      document.querySelectorAll(`[data-dmarca="${CSS.escape(id)}"]`).forEach((x) => x.setAttribute("aria-pressed", on));
      const guardados = pl.filter((c) => t.has(c.id)).map((c) => c.id), igual = mismos([...S.dmarcas], guardados);
      enCel.set(docClave(S.dcat, d.k), igual ? null : JSON.stringify([...S.dmarcas]));
      $("#dcont").textContent = docChicos(d, pl).filter((c) => S.dmarcas.has(c.id)).length;
      $("#dsin").hidden = igual;
    }
    else if ("docsGuardar" in ds) guardarDocs();
    else if ("reintentarDocs" in ds) { DOC.error = null; delete ASIS.error[S.dcat]; render(); }
    else if (ds.tomar) { const [ttest, tfecha] = ds.tomar.split("|"); irA({ ver: "toma", ttest, tfecha: tfecha || hoyISO(), aviso: null }); }
    else if (ds.tver) { S.tver = ds.tver; S.tdia = null; render(); }
    else if (ds.tdia) { S.tdia = ds.tdia; render(); }
    else if ("tomaGuardar" in ds) guardarToma();
    else if ("reintentarTests" in ds) { delete TST.error[S.tcat]; delete ASIS.error[S.tcat]; render(); }
    else if ("alcat" in ds) { S.alcat = ds.alcat || null; render(); }
    else if ("ncat" in ds) { S.ncat = ds.ncat || null; render(); }
    else if ("reintentarNotas" in ds) { NOTAS.error = null; render(); }
    else if ("notaOk" in ds) {
      const texto = $("#nota-texto").value.trim(), por = $("#nota-por").value.trim(), cat = $("#nota-cat").value;
      if (texto.length < 3) { avisoSuelto("Escribí la nota."); $("#nota-texto").focus(); return; }
      if (por.length < 2) { avisoSuelto("Escribí tu nombre."); $("#nota-por").focus(); return; }
      enCel.set(claveNombreNota, por);
      guardarNota({ accion: "nota", cat, texto, por, fecha: hoyISO() }, "Nota guardada");
    } else if (ds.borrarNotaOk) guardarNota({ accion: "borrar_nota", id: Number(ds.borrarNotaOk), por: enCel.get(claveNombreNota) || "" }, "Nota borrada");
    else if (ds.area) irA(AREA_IR(ds.area));
    else if (ds.areaCat) {
      // la categoría elegida en un área queda en el celular: la próxima vez aparece marcada
      const v = ds.areaCat;
      enCel.set(claveArea(S.area), v);
      if (S.area === "asistencia") irA({ ver: "asis", acat: v, afecha: null, aform: null, marcas: null, aviso: null, estadoLista: null });
      else if (S.area === "planificacion") irA({ ver: "plan", pcat: v, qp: "" });
      else if (S.area === "docs") irA({ ver: "docs", dcat: v, ddoc: null });
      else if (S.area === "tests") irA({ ver: "tests", tcat: v, tver: null, tdia: null });
      else irA({ ver: "partidos", mcat: v });
    }
    else if (ds.play) reproducir(ds.play);
    else if ("reclave" in ds) { olvidar(); location.reload(); } // vuelve a la misma pantalla después de la clave
    else if (ds.ayuda) abrirAyuda(ds.ayuda, t);
    else if ("cerrarAyuda" in ds) cerrarAyuda();
    else if (ds.ir) { if (ds.ir === S.ver && S.ver === "inicio") scrollTo({ top: 0 }); else irA({ ver: ds.ir, ...LIMPIO }); }
    else if (ds.irEj) { if (S.ver === "practica") S.ultEj = ds.irEj; ir({ ver: "ejercicio", ej: ds.irEj }); }
    else if (ds.irEjPara) irA({ ver: "ejercicios", tab: "juegos", rol: null, para: ds.irEjPara, gcat: null, qe: "" });
    else if (ds.irEjTab) irA({ ver: "ejercicios", tab: ds.irEjTab, rol: null, para: null, gcat: null, qe: "" });
    else if (ds.irLine) irA({ ver: "ejercicios", tab: "line", rol: ds.irLine, para: null, gcat: null, qe: "" });
    else if (ds.irPuesto) ir({ ver: "puesto", puesto: +ds.irPuesto });
    else if (ds.irPractica) {
      ir({ ver: "practica", practica: ds.irPractica });
      // con Anterior / Siguiente, el foco queda en el mismo botón (para seguir pasando)
      const b = ds.lado && $(`[data-lado="${ds.lado}"]`);
      if (b && !b.disabled) b.focus({ preventScroll: true });
    }
    else if (ds.irScrum) irA({ ver: "scrum", ...LIMPIO, tab: "edad", para: ds.irScrum });
    else if ("borrarQp" in ds) { S.qp = ""; const i = $("#buscar-pr"); if (i) { i.value = ""; filtrarPr(); i.focus(); } }
    else if (ds.irPracticas) irA({ ver: "practicas", pgrupo: ds.irPracticas, qp: "", cat: null, gcat: null, temp: null });
    else if (ds.irAsis) irA({ ver: "asis", acat: ds.irAsis, afecha: null, aform: null, marcas: null, aviso: null, estadoLista: null, cat: null, gcat: null, temp: null });
    else if (ds.irHoy) { const [acat, afecha] = ds.irHoy.split("|"); irA({ ver: "lista", acat, afecha, aform: null, marcas: null, aviso: null, estadoLista: null }); }
    else if (ds.irLista) irA({ ver: "lista", afecha: ds.irLista, aform: null, marcas: null, aviso: null, estadoLista: null });
    else if ("irChicos" in ds) irA({ ver: "chicos", aform: null, aviso: null, recien: new Set() });
    else if ("form" in ds) {
      if (!ds.form && S.aform === "nota" && $("#nota-texto")) $("#nota-texto").value = "";
      const abre = !(S.aform === ds.form || !ds.form), antes = S.aform;
      S.aform = abre ? ds.form : null; S.aviso = null; S.amotivo = null;
      render();
      if (!abre && antes) { const o = $(`[data-form="${antes}"]`); if (o) o.focus({ preventScroll: true }); }
      const fm = abre && $(".asis-form");
      if (fm) { fm.scrollIntoView({ block: "nearest" }); const c = fm.querySelector("input:not([type=hidden]), select, textarea, button"); if (c) c.focus({ preventScroll: true }); }
    }
    else if (ds.reintentar) { delete ASIS.error[ds.reintentar]; render(); }
    else if (ds.motivo) {
      // un solo motivo elegido; "Otro motivo" abre el campo para escribirlo
      t.closest(".chips-g").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === t));
      const otro = $("#motivo-otro");
      otro.hidden = ds.motivo !== "Otro";
      if (!otro.hidden) $("#motivo").focus();
    } else if (ds.dia) {
      // al tocar un día nuevo aparece su hora, con la del día anterior que ya está (así martes y jueves quedan iguales)
      const on = t.getAttribute("aria-pressed") !== "true", fila = $(`[data-dia-hora="${ds.dia}"]`);
      t.setAttribute("aria-pressed", on);
      if (fila) {
        fila.hidden = !on;
        const otras = [...document.querySelectorAll("[data-dia-hora]")].filter((x) => !x.hidden && x !== fila);
        const antes = otras.filter((x) => SEMANA.indexOf(+x.dataset.diaHora) < SEMANA.indexOf(+ds.dia)).at(-1) || otras[0];
        if (on && !("guardada" in fila.dataset) && antes) fila.querySelector("select").value = antes.querySelector("select").value;
      }
    }
    else if (ds.amodo) { S.amodo = ds.amodo; render(); const b = $(`[data-amodo="${ds.amodo}"]`); if (b) b.focus({ preventScroll: true }); }
    else if ("junta" in ds) {
      // juntar o separar las dos categorías; al separar, lo marcado de la otra no se guarda con esta
      S.ajunta = !S.ajunta;
      enCel.set(`los50-junta:${S.acat}`, S.ajunta ? "1" : null);
      if (!S.ajunta) {
        // lo marcado de la otra categoría no se pierde: queda como su lista sin guardar
        const otra = compa(S.acat), deOtra = soloDe(otra, [...S.marcas]);
        if (deOtra.length && !mismos(deOtra, soloDe(otra, S.base2 || []))) guardarBorrador(otra, S.afecha, { marcas: deOtra, base: soloDe(otra, S.base2 || []) });
        S.marcas = new Set(soloDe(S.acat, [...S.marcas]));
      }
      S.base2 = null;
      guardarBorrador(S.acat, S.afecha, borrLista());
      render();
      const bj = $("[data-junta]");
      if (bj) bj.focus({ preventScroll: true });
    }
    else if (ds.marca) {
      // tomar lista sin volver a dibujar la pantalla (no salta el scroll); lo marcado queda guardado en el celular
      if (S.estadoLista === "guardando") return; // mientras guarda no se cambia nada (si no, se perdería)
      enCel.set(ULTIMA, S.acat); // la última categoría en la que se tomó lista: la del inicio
      const id = ds.marca, les = S.amodo === "les", x = les ? LES(id) : id, y = les ? id : LES(id);
      if (S.marcas.has(x)) S.marcas.delete(x); else { S.marcas.add(x); S.marcas.delete(y); }
      document.querySelectorAll(`[data-marca="${CSS.escape(id)}"]`).forEach((b) => pintarItem(b, id));
      guardarBorrador(S.acat, S.afecha, borrLista());
      if (S.estadoLista === "vacia") S.estadoLista = null;
      // "Lesionado" es de a uno: después de marcarlo, se vuelve a marcar a los que vinieron
      if (les) { S.amodo = "vino"; document.querySelectorAll("[data-amodo]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.amodo === "vino")); avisoSuelto("Marcado como lesionado. Seguís marcando a los que vinieron", "ok"); }
      const nt = document.querySelectorAll(".lista-it").length, nm = document.querySelectorAll(".lista-it[aria-pressed='true']").length, todos = $("[data-todos]");
      if (todos) { todos.hidden = !!nm && nm < nt; todos.textContent = nm === nt && nt ? "Desmarcar a todos" : "Marcar a todos"; }
      const cabTxt = $(".lista-cab > span");
      if (cabTxt) cabTxt.textContent = nm === nt && nt ? "Tocá a los que faltaron" : S.guardados && S.guardados.length ? "Tocá a los que llegaron tarde" : "Tocá a los que vinieron";
      pintarPie();
      // buscando: si se encontró a uno solo y se marcó, el buscador queda listo para el próximo
      const bq = $("#buscar-chico");
      if (bq && bq.value.trim() && document.querySelectorAll("[data-filtro] li[data-q]:not([hidden])").length === 1) {
        bq.value = ""; bq.dispatchEvent(new Event("input", { bubbles: true })); bq.focus();
      }
    } else if ("todos" in ds) {
      // todos los de la lista, menos los lesionados (que quedan como estaban); si ya estaban todos, "Desmarcar a todos"
      const ids = [...document.querySelectorAll("[data-filtro] li:not([hidden]) .lista-it")].map((x) => x.dataset.marca).filter((id) => !S.marcas.has(LES(id)));
      if (ids.every((id) => S.marcas.has(id))) ids.forEach((id) => S.marcas.delete(id)); else ids.forEach((id) => S.marcas.add(id));
      if (S.estadoLista === "vacia") S.estadoLista = null;
      guardarBorrador(S.acat, S.afecha, borrLista());
      render();
    } else if (ds.cancelarOk) {
      const elegido = $("[data-motivo][aria-pressed='true']");
      const motivo = !elegido ? "" : elegido.dataset.motivo === "Otro" ? $("#motivo").value.trim() : elegido.dataset.motivo;
      S.amotivo = elegido ? { m: elegido.dataset.motivo, txt: $("#motivo").value } : null;
      const s0 = sesiones(ASIS.cats[S.acat], ds.cancelarOk, ds.cancelarOk)[0];
      guardarAsis({ accion: "entrenamiento", fecha: ds.cancelarOk, estado: "cancelado", motivo, hora: s0 && s0.estado === "movido" ? s0.hora : null }, "Entrenamiento suspendido");
    } else if (ds.deshacer) {
      const fecha = ds.deshacer, d0 = ASIS.cats[S.acat], s = sesiones(d0, fecha, fecha)[0], extra = s && s.estado === "extra";
      // si antes de suspenderlo se le había cambiado la hora, vuelve con esa hora
      const fila = d0.entrenamientos.find((x) => x.fecha === fecha), deSiempre = d0.horarios.find((h) => h.dia === dia(fecha).getDay());
      const movido = !extra && fila && fila.estado === "cancelado" && fila.hora && (!deSiempre || deSiempre.hora !== fila.hora);
      guardarAsis(movido ? { accion: "entrenamiento", fecha, estado: "movido", hora: fila.hora } : { accion: "entrenamiento", fecha, estado: "normal" }, extra ? "Entrenamiento borrado" : "Listo: vuelve a haber entrenamiento",
        extra && S.ver === "lista" ? () => volverAtras(VOLVER_ASIS) : null);
    } else if (ds.horaOk) {
      const d = ASIS.cats[S.acat], hora = $("#hora-nueva").value, s = sesiones(d, ds.horaOk, ds.horaOk)[0];
      if (!hora) { $("#hora-nueva").focus(); return; }
      // si vuelve a la hora de siempre, deja de decir "cambió la hora"
      const deSiempre = d.horarios.find((h) => h.dia === dia(ds.horaOk).getDay());
      const estado = s && s.estado === "extra" ? "extra" : deSiempre && deSiempre.hora === hora ? "normal" : "movido";
      guardarAsis({ accion: "entrenamiento", fecha: ds.horaOk, estado, hora }, `Ahora es a las ${hora}`);
    } else if ("agregarOk" in ds) {
      const fecha = $("#fecha-nueva").value, hora = $("#hora-agregar").value;
      if (!fecha || !hora) { $(fecha ? "#hora-agregar" : "#fecha-nueva").focus(); return; }
      const fIn = $("#fecha-nueva");
      if (!fechaOk(fecha) || fecha < fIn.min || fecha > fIn.max) { avisoSuelto(`Elegí un día entre el ${cuandoP({ fecha: fIn.min })} y el ${cuandoP({ fecha: fIn.max })}.`); return; }
      // un día tiene un solo entrenamiento: si ya entrena, se le cambia la hora (si no, se pisaría el de siempre)
      const ya = sesiones(ASIS.cats[S.acat], fecha, fecha)[0];
      if (ya && ya.estado !== "cancelado") { avisoSuelto(`Ese día ya entrena${ya.hora ? ` a las ${ya.hora}` : ""}. Para cambiarle la hora, tocá ese día en la lista de entrenamientos.`); return; }
      guardarAsis({ accion: "entrenamiento", fecha, estado: "extra", hora }, `Entrenamiento agregado: ${diaMes(fecha)} a las ${hora}`);
    } else if ("horariosOk" in ds) {
      const dias = [...document.querySelectorAll("[data-dia][aria-pressed='true']")].map((x) => +x.dataset.dia);
      if (!dias.length && !ASIS.cats[S.acat].horarios.length) { avisoSuelto("Tocá al menos un día de entrenamiento."); return; }
      guardarAsis({ accion: "horarios", horarios: dias.map((dia) => ({ dia, hora: $(`#hora-dia-${dia}`).value })) }, dias.length ? "Días guardados" : "Se sacaron los días");
    } else if ("guardarLista" in ds) guardarLista();
    else if ("guardarVacia" in ds) guardarLista(true);
    else if ("seguirLista" in ds) { S.estadoLista = null; pintarPie(); }
    else if ("cerrarAviso" in ds) { S.aviso = null; const v = $(".aviso"); if (v) v.remove(); }
    else if ("borrarListaOk" in ds) {
      guardarAsis({ accion: "borrar_lista", fecha: S.afecha }, "Lista borrada", () => {
        guardarBorrador(S.acat, S.afecha, null);
        volverAtras({ ver: "asis", afecha: null, aform: null, marcas: null });
      });
    } else if (ds.sacar) {
      const id = ds.sacar;
      guardarAsis({ accion: "chico", id, estado: "baja" }, `${esc(ds.nombre)} ya no está en la lista`, () => { S.recien.add(id); render(); });
    } else if (ds.sigue) guardarAsis({ accion: "chico", id: ds.sigue, estado: "sigue" }, `${esc(ds.nombre)} sigue en el equipo`);
    else if (ds.volverChico) {
      const id = ds.volverChico;
      guardarAsis({ accion: "chico", id, estado: "activo" }, "Volvió a la lista", () => { S.recien.delete(id); render(); });
    } else if ("sumarChico" in ds) {
      const nombre = $("#nuevo-chico").value.trim();
      if (nombre.length < 3) { avisoSuelto("Escribí el apellido y el nombre del chico."); $("#nuevo-chico").focus(); return; }
      // que no quede dos veces (así su asistencia no se parte en dos renglones)
      const { activos, fuera } = chicosDe(S.acat, ASIS.cats[S.acat]), k = claveNombre(nombre);
      const esta = activos.find((c) => claveNombre(c.nombre) === k), estaba = fuera.find((c) => claveNombre(c.nombre) === k);
      if (esta) { avisoSuelto(`${esc(esta.nombre)} ya está en la lista.`); return; }
      if (estaba) { avisoSuelto(`${esc(estaba.nombre)} ya estaba: tocá “Volver a sumar”, abajo de todo.`); return; }
      guardarAsis({ accion: "chico", estado: "alta", nombre }, `${esc(nombre)} se sumó a la lista`, () => { render(); const i = $("#nuevo-chico"); if (i) i.focus(); });
    }
    else if ("pgrupo" in ds) irA({ pgrupo: ds.pgrupo || null }, false);
    else if ("compartirPr" in ds) compartirPractica();
    else if ("rol" in ds) irA({ rol: ds.rol || null }, false);
    else if ("quitarPara" in ds) irA({ para: null }, false);
    else if (ds.irCat) irA({ ver: "cat", cat: ds.irCat, temp: null, verJ: false, verP: false, verN: false, verR: false });
    else if (ds.irGuia) ir({ ver: "guia", gcat: ds.irGuia, cat: null, temp: null });
    else if (ds.tab) { irA({ tab: ds.tab, rol: null, para: S.ver === "scrum" ? S.para : null }, false); $(`[data-tab="${ds.tab}"]`).focus(); }
    else if (ds.anio) irA({ temp: +ds.anio, verJ: false, verP: false, verN: false, verR: false }, false);
    else if (ds.ver) { S["ver" + ds.ver] = !S["ver" + ds.ver]; render(); }
    else if (ds.ordj) { S.ordenJ = ds.ordj; render(); }
  });

  document.addEventListener("toggle", (e) => {
    const d = e.target;
    if (!S || !d.dataset || !d.dataset.sec) return;
    if (d.open) S.abiertos.add(d.dataset.sec); else S.abiertos.delete(d.dataset.sec);
    if (!d.open) d.querySelectorAll("video").forEach((v) => v.pause()); // al cerrar "Videos de partidos" no sigue sonando
  }, true);

  // la ayuda se cierra con Escape; mientras está abierta, el foco no se va a la pantalla de atrás (solo tiene el botón "Entendido")
  document.addEventListener("keydown", (e) => {
    const caja = $("#ayuda");
    if (!caja || caja.hidden) return;
    if (e.key === "Escape") cerrarAyuda();
    else if (e.key === "Tab") { e.preventDefault(); $(".ayuda__ok", caja).focus(); }
  });

  // buscador de cantos: filtra sin volver a dibujar la pantalla (así no se pierde el teclado)
  // el suplente: por quién entra y el minuto se guardan en el celular apenas se eligen (sin volver a dibujar la pantalla)
  // tests: al cambiar el día de la toma, lo cargado (sin guardar) pasa al día nuevo
  document.addEventListener("change", (e) => {
    if (!S || S.ver !== "toma" || e.target.id !== "toma-fecha") return;
    const f = e.target.value, k = S.ttest;
    if (!fechaOk(f) || f > hoyISO()) { e.target.value = S.tfecha; avisoSuelto("Elegí un día de hoy para atrás."); return; }
    const b = tomaBorr(S.tcat, S.tfecha, k);
    if (b && !tomaBorr(S.tcat, f, k)) { enCel.set(tomaClave(S.tcat, f, k), JSON.stringify(b)); enCel.set(tomaClave(S.tcat, S.tfecha, k), null); }
    irSinPaso({ tfecha: f });
  });
  document.addEventListener("change", (e) => {
    if (!S || S.ver !== "equipo") return;
    const t = e.target, num = t.dataset.eqPor || t.dataset.eqMin;
    if (!num) return;
    const ed = eqActual(S.eqcat, S.eqfecha), cb = ed.cambios[num] || { por: null, min: null }, v = t.value ? +t.value : null;
    const nuevo = "eqPor" in t.dataset ? { por: v, min: cb.min ?? null } : { por: cb.por ?? null, min: v };
    if (nuevo.por == null && nuevo.min == null) delete ed.cambios[num]; else ed.cambios[num] = nuevo;
    eqAnotar(ed);
  });
  document.addEventListener("input", (e) => {
    if (!S) return;
    if (e.target.id === "buscar-canto") { S.q = e.target.value; filtrarCantos(); }
    if (e.target.id === "buscar-ej") { S.qe = e.target.value; filtrarEj(); }
    if (e.target.id === "buscar-pr") { S.qp = e.target.value; filtrarPr(); }
    // el tanteador de "Cómo va" queda guardado mientras se escribe (si se sigue contando, no se pierde)
    if ((e.target.id === "eq-pf" || e.target.id === "eq-pc") && S.ver === "equipo" && S.eqcontar && S.eqfecha >= hoyISO()) {
      const a = $("#eq-pf").value.trim(), b = $("#eq-pc").value.trim(), ok = (v) => /^\d{1,3}$/.test(v);
      if ((ok(a) && ok(b)) || (!a && !b)) enCel.set(vaClave(S.eqcat, S.eqfecha), a ? JSON.stringify([+a, +b]) : null);
    }
    if (e.target.id === "am-rival") { const l = $("#am-pc-l"); if (l) l.textContent = e.target.value.trim() || "El rival"; }
    if (e.target.id === "am-fecha") {
      const d = $("#am-dia"), v = e.target.value, paso = fechaOk(v) && v < hoyISO();
      if (d) d.textContent = fechaOk(v) ? mayus(cuandoP({ fecha: v })) : "";
      $("#am-res").hidden = !paso; // ya se jugó: se carga cómo salió
    }
    if (e.target.id === "cs-texto") { S.csTexto = e.target.value; enCel.set(`los50-cs:${S.acat}|${S.afecha}`, e.target.value || null); }
    if ("tv" in e.target.dataset) {
      // lo cargado queda en el celular al momento; en rojo lo que no tiene sentido para ese test
      const t = testDe(S.ttest), b = {};
      e.target.classList.toggle("toma-in--mal", !!e.target.value.trim() && Number.isNaN(leerValor(t, e.target.value)));
      document.querySelectorAll("[data-tv]").forEach((i) => { if (i.value.trim()) b[i.dataset.tv] = i.value.trim(); });
      enCel.set(tomaClave(S.tcat, S.tfecha, S.ttest), JSON.stringify(b));
      $("#toma-n").textContent = Object.keys(b).length;
      $("#toma-sin").hidden = false;
    }
    if (e.target.id === "buscar-eq") {
      const q = qNom(e.target.value);
      let total = 0;
      document.querySelectorAll("[data-filtro-eq]").forEach((ul) => {
        let vis = 0;
        ul.querySelectorAll("li[data-q]").forEach((li) => { li.hidden = !!q && !li.dataset.q.includes(q); vis += !li.hidden; });
        ul.hidden = !vis; ul.previousElementSibling.hidden = !vis; total += vis;
      });
      // de las categorías de al lado (el que sube o baja), solo al buscar
      const x = eqCtx(), ids = new Set(x.pl.map((c) => c.id)), vs = vecinas(eqAsis(S.eqcat));
      const otros = q.length < 2 ? [] : [...eqTodos().values()].filter((c) => vs.includes(c.cat) && !ids.has(c.id) && qNom(c.nombre).includes(q)).sort(porNombre).slice(0, 20);
      $("#eq-nadie").hidden = total > 0 || otros.length > 0;
      $("#eq-otros").innerHTML = otros.length ? `<h3 class="grupo">${total ? "" : `En ${esc(eqAsis(S.eqcat))} no hay. `}De ${esc(vs.join(" y "))}</h3><ul class="eq-l">${otros.map((c) => eqFila(c, c.cat, x)).join("")}</ul>` : "";
    }
    if (e.target.id === "buscar-entra") {
      const q = qNom(e.target.value), ul = $("[data-filtro-entra]");
      let vis = 0;
      if (ul) ul.querySelectorAll("li[data-q]").forEach((li) => { li.hidden = !!q && !li.dataset.q.includes(q); vis += !li.hidden; });
      // de las categorías de al lado (el que sube o baja), solo al buscar
      const ya = new Set([...eqPlantel(S.eqcat).map((c) => c.id), ...Object.values(eqActual(S.eqcat, S.eqfecha).jugadores)]), vs = vecinas(eqAsis(S.eqcat));
      const otros = q.length < 2 ? [] : [...eqTodos().values()].filter((c) => vs.includes(c.cat) && !ya.has(c.id) && qNom(c.nombre).includes(q)).sort(porNombre).slice(0, 20);
      const eqE = eqActual(S.eqcat, S.eqfecha), estan = q.length < 2 ? [] : Object.entries(eqE.jugadores).filter(([, id]) => qNom(eqQuien(id, eqPlantel(S.eqcat)).nombre).includes(q));
      $("#entra-nadie").hidden = !q || vis > 0 || otros.length > 0 || estan.length > 0;
      $("#entra-ya").innerHTML = estan.length ? estan.map(([n, id]) => `<p class="eq-ya-esta"><b>${esc(eqQuien(id, eqPlantel(S.eqcat)).nombre)}</b> ya está con el ${n}</p>`).join("") : "";
      $("#entra-otros").innerHTML = otros.length ? `<h3 class="grupo">De ${esc(vs.join(" y "))}</h3><ul class="eq-l">${otros.map((c) => `<li><button type="button" class="eq-it eq-it--elegir" data-cnt-entra="${esc(c.id)}"><span class="eq-it__txt"><span class="eq-it__nom">${nombreHTML(c.nombre)}</span><small>${esc(c.cat)}</small></span>${IC.mas}</button></li>`).join("")}</ul>` : "";
    }
    if (e.target.id === "buscar-chico") {
      const q = qNom(e.target.value);
      let vis = 0;
      document.querySelectorAll("[data-filtro] li[data-q]").forEach((li) => { li.hidden = !!q && !li.dataset.q.includes(q); vis += !li.hidden; });
      document.querySelectorAll("[data-filtro]").forEach((ul) => { const h = ul.previousElementSibling; if (h && h.classList.contains("grupo")) h.hidden = !ul.querySelector("li[data-q]:not([hidden])"); });
      const sin = $("#sin-chicos");
      if (sin) sin.hidden = !q || vis > 0;
    }
  });

  // en "Sumar a un chico nuevo", la tecla Enter (o "Listo") del teclado también suma
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.id === "nuevo-chico") { e.preventDefault(); $("[data-sumar-chico]").click(); }
  });

  // después de "Cerrar sesión", el botón "atrás" del navegador no tiene que volver a mostrar la sección abierta
  addEventListener("pageshow", (e) => { if (e.persisted && S && !guardada()) location.reload(); });

  // ---------- inicio ----------
  intentarGuardada().then((ok) => { if (!ok) $("#clave").focus(); });
})();
