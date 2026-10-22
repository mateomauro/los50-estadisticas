/* Los 50 · Estadísticas — datos en window.DATA (generado por exportar_web.py)
   Datos oficiales de la base de datos UAR. Si data.js trae "diarios" (El Eco de Tandil), aparecen las fuentes
   "diarios" y "todo" (la suma); hoy no se publican (MOSTRAR_DIARIOS en exportar_web.py). */
(() => {
  "use strict";
  const D = window.DATA;
  const CLUB = { nombre: "Club Los 50", lugar: "Tandil", escudo: "img/escudo-400.webp" };
  const DD = D.diarios || null;
  const CATS = D.categorias;
  const SLUG = CATS.map((c) => c.toLowerCase());
  const COL = Object.fromEntries(D.columnas.map((c, i) => [c, i + 3])); // posición en cada fila oficial
  const CD = DD ? Object.fromEntries(DD.columnas.map((c, i) => [c, i + 3])) : {};

  // ---------- datos unificados ----------
  const CAMPOS = ["pj", "banco", "sin", "tries", "conversiones", "penales", "drops", "puntos", "amarillas", "rojas", "form", "form_tit", "form_ing"];
  const FILAS = D.stats.map((r) => {
    const f = { pid: r[0], anio: r[1], cat: r[2], f: "o", form: 0, form_tit: 0, form_ing: 0 };
    for (const c of D.columnas) f[c] = r[COL[c]];
    return f;
  });
  if (DD) for (const r of DD.stats) {
    FILAS.push({ pid: r[0], anio: r[1], cat: r[2], f: "d", pj: r[CD.pj], banco: 0, sin: 0, amarillas: 0, rojas: 0,
      tries: r[CD.tries], conversiones: r[CD.conversiones], penales: r[CD.penales], drops: r[CD.drops], puntos: r[CD.puntos],
      form_tit: r[CD.form_tit], form_ing: r[CD.form_ing], form: r[CD.form_tit] + r[CD.form_ing] });
  }
  const EVENTOS = D.puntos.map((p) => ({ pid: p[0], anio: p[1], cat: p[2], fecha: p[3], rival: p[4], torneo: p[5], tiempo: p[6], minuto: p[7], tipo: p[8], cant: 1, url: null, f: "o",
    mid: p[9] || null, figuraba: p[10] || "", puesto: p[11] ?? null, banco: !!p[12] }))
    .concat(DD ? DD.puntos.map((p) => ({ pid: p[0], anio: p[1], cat: p[2], fecha: p[3], rival: p[4], torneo: p[5], tiempo: null, minuto: null, tipo: p[6], cant: p[7], url: DD.urls[p[8]], f: "d" })) : []);
  // partidos oficiales por número de planilla (para "Sus partidos" y los links a cada planilla)
  const PARTIDO = new Map(D.partidos.filter((p) => p[11]).map((p) => [p[11], p]));
  const NOMBRE = (pid) => D.jugadores[pid] || (DD && DD.jugadores[pid]) || null;
  const ACT = (D.actuaciones || []).map((a) => ({ pid: a[0], cat: a[1], anio: a[2], fecha: a[3], rival: a[4], tries: a[5], puntos: a[6] }));
  const PRIMERO = new Map((D.primeros || []).map((p) => [`${p[0]}|${p[1]}`, { fecha: p[2], rival: p[3] }]));
  // el partido 100, 200, 300... de cada uno en cada categoría (queda el más alto)
  const MARCA = new Map();
  for (const [pid, cat, n, f, rival] of D.marcas || []) {
    const k = `${pid}|${cat}`;
    if (!MARCA.has(k) || MARCA.get(k).n < n) MARCA.set(k, { n, fecha: f, rival });
  }
  const ICONO_MEDALLA = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15"/><path d="M11 12 5.12 2.2M13 12l5.88-9.8M8 7h8"/><circle cx="12" cy="17" r="5"/><path d="M12 18v-2h-.5"/></svg>';
  const ANIO_INICIO = Math.min(...D.stats.map((r) => r[1]));
  const activo = (r) => r.pj > 0 || (r.f === "d" && r.puntos > 0);
  const rangoDe = (fs) => { const a = FILAS.filter((r) => fs.includes(r.f)).map((r) => r.anio); return a.length ? [Math.min(...a), Math.max(...a)] : null; };

  const ORD = {
    pj: { lbl: "Partidos", corto: "PJ", u: ["partido", "partidos"] },
    tries: { lbl: "Tries", corto: "Tries", u: ["try", "tries"] },
    puntos: { lbl: "Puntos", corto: "Pts", u: ["punto", "puntos"] },
    conversiones: { lbl: "Conversiones", corto: "Conv.", u: ["conversión", "conv."] },
    penales: { lbl: "Penales", corto: "Pen.", u: ["penal", "penales"] },
    drops: { lbl: "Drops", corto: "Drops", u: ["drop", "drops"] },
    banco: { lbl: "Desde el banco", corto: "Banco", u: ["del banco", "del banco"] },
    sin: { lbl: "Sin entrar", corto: "Sin entrar", u: ["sin entrar", "sin entrar"] },
    temporadas: { lbl: "Temporadas", corto: "Temp.", u: ["temporada", "temporadas"] },
    amarillas: { lbl: "Amarillas", corto: "Am.", u: ["amarilla", "amarillas"] },
    rojas: { lbl: "Rojas", corto: "Ro.", u: ["roja", "rojas"] },
    form: { lbl: "En formaciones", corto: "Form.", u: ["formación", "formaciones"] },
  };
  const FUENTES = {
    oficial: { lbl: "Oficial", sub: "Base UAR", f: ["o"], def: "pj",
      ordenes: ["pj", "tries", "puntos", "conversiones", "penales", "drops", "banco", "sin", "temporadas", "amarillas", "rojas"],
      principales: ["pj", "tries", "puntos"], sub3: ["pj", "tries", "puntos"],
      tabla: ["pj", "banco", "sin", "temporadas", "tries", "conversiones", "penales", "drops", "puntos", "amarillas", "rojas"] },
    diarios: { lbl: "Diarios", sub: "El Eco de Tandil", f: ["d"], def: "pj",
      ordenes: ["pj", "tries", "puntos", "conversiones", "penales", "drops", "temporadas"],
      principales: ["pj", "tries", "puntos"], sub3: ["pj", "tries", "puntos"],
      tabla: ["pj", "temporadas", "tries", "conversiones", "penales", "drops", "puntos"] },
    todo: { lbl: "Todo", sub: "Oficial + diarios", f: ["o", "d"], def: "pj",
      ordenes: ["pj", "tries", "puntos", "conversiones", "penales", "drops", "temporadas", "amarillas", "rojas"],
      principales: ["pj", "tries", "puntos"], sub3: ["pj", "tries", "puntos"],
      tabla: ["pj", "temporadas", "tries", "conversiones", "penales", "drops", "puntos", "amarillas", "rojas"] },
  };
  if (!DD) { delete FUENTES.diarios; delete FUENTES.todo; }
  for (const [k, F] of Object.entries(FUENTES)) F.rango = rangoDe(F.f), F.k = k;
  const etiqueta = (k) => ORD[k].lbl;

  // tipos de punto para la ficha (el "Try penal" se cuenta como try del jugador)
  const TIPOS = [
    { k: "tries", lbl: "Tries", t: [0, 1] },
    { k: "conversiones", lbl: "Conversiones", t: [2] },
    { k: "penales", lbl: "Penales", t: [3] },
    { k: "drops", lbl: "Drops", t: [4] },
  ];

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const plural = (n, u) => `${u[n === 1 ? 0 : 1]}`;
  /** "a, b y c" / "a, b ni c" */
  const enumerar = (xs, y = "y") => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} ${y} ${xs[xs.length - 1]}` : xs[0] || "");
  const fecha = (iso) => { if (!iso) return "s/f"; const [a, m, d] = iso.split("-"); return `${d}/${m}/${a.slice(2)}`; };
  const rangoTxt = (r) => (r ? (r[0] === r[1] ? `${r[0]}` : `${r[0]}–${r[1]}`) : "");

  function partes(nombre) {
    const i = nombre.indexOf(",");
    return i < 0 ? [nombre, ""] : [nombre.slice(0, i).trim(), nombre.slice(i + 1).trim()];
  }
  function nombreHTML(nombre) {
    const [ap, no] = partes(nombre);
    return no ? `<b>${esc(ap)}</b>, ${esc(no)}` : `<b>${esc(ap)}</b>`;
  }

  // ---------- estado (se refleja en la URL para poder compartir links) ----------
  const S = { fuente: "oficial", vista: "jugadores", cat: 0, temp: "todas", orden: "pj", q: "", jug: null, tipo: null, verTodos: false, verRivales: false, verPartidos: false, todosPartidos: false, panel: null, panelCompleta: false, panelInicial: null };
  const F = () => FUENTES[S.fuente];

  function leerURL() {
    const p = new URLSearchParams(location.search);
    S.fuente = FUENTES[p.get("fuente")] ? p.get("fuente") : "oficial";
    S.vista = ["resultados", "records"].includes(p.get("vista")) ? p.get("vista") : "jugadores";
    S.jug = p.get("j") && NOMBRE(p.get("j")) ? p.get("j") : null;
    const c = SLUG.indexOf(p.get("cat"));
    // un link a un jugador sin categoría abre en la categoría donde más jugó
    S.cat = c >= 0 ? c : S.jug ? catPrincipal(S.jug) : 0;
    S.temp = /^\d{4}$/.test(p.get("temp") || "") ? p.get("temp") : "todas";
    S.orden = F().ordenes.includes(p.get("orden")) ? p.get("orden") : F().def;
    S.q = p.get("q") || "";
    S.panelInicial = /^\d+$/.test(p.get("p") || "") ? p.get("p") : null;  // link a un partido: abre su planilla en la ficha
  }
  function catPrincipal(pid) {
    const pj = CATS.map(() => 0);
    for (const r of FILAS) if (r.pid === pid && F().f.includes(r.f)) pj[r.cat] += r.pj;
    return pj.indexOf(Math.max(...pj));
  }
  // para saber si al volver atrás cambió algo más que la ficha abierta
  const estado = () => [S.fuente, S.vista, S.cat, S.temp, S.orden, S.q].join("|");
  function url(conJug = S.jug) {
    const p = new URLSearchParams();
    if (S.fuente !== "oficial") p.set("fuente", S.fuente);
    if (S.vista !== "jugadores") p.set("vista", S.vista);
    if (S.cat || conJug) p.set("cat", SLUG[S.cat]);
    if (S.temp !== "todas") p.set("temp", S.temp);
    if (S.orden !== F().def) p.set("orden", S.orden);
    if (S.q) p.set("q", S.q);
    if (conJug) p.set("j", conJug);
    const qs = p.toString();
    return location.pathname + (qs ? "?" + qs : "");
  }
  const guardar = () => history.replaceState(history.state, "", url());

  // ---------- cálculo ----------
  function aniosDe(cat, fs = F().f) {
    const set = S.vista === "resultados"
      ? new Set(D.partidos.filter((p) => p[1] === cat && fs.includes(p[8])).map((p) => p[0]))
      : new Set(FILAS.filter((r) => r.cat === cat && fs.includes(r.f) && activo(r)).map((r) => r.anio));
    return [...set].sort((a, b) => b - a);
  }

  // los datos no cambian mientras la página está abierta: cada cuenta se hace una sola vez
  const memo = new Map();
  function agregar(cat, temp, fs = F().f) {
    const k = `${cat}|${temp}|${fs}`;
    if (!memo.has(k)) memo.set(k, sumar(cat, temp, fs));
    return memo.get(k);
  }
  function sumar(cat, temp, fs) {
    const m = new Map();
    for (const r of FILAS) {
      if (r.cat !== cat || !fs.includes(r.f) || (temp !== "todas" && String(r.anio) !== temp)) continue;
      let a = m.get(r.pid);
      if (!a) {
        a = { pid: r.pid, nombre: NOMBRE(r.pid), anios: new Set(), activo: false };
        for (const c of CAMPOS) a[c] = 0;
        m.set(r.pid, a);
      }
      for (const c of CAMPOS) a[c] += r[c];
      if (activo(r)) { a.anios.add(r.anio); a.activo = true; }
    }
    const out = [];
    for (const a of m.values()) {
      if (!a.activo) continue;
      a.temporadas = a.anios.size;
      out.push(a);
    }
    return out;
  }

  function ranking(lista, k) {
    lista.sort((x, y) => y[k] - x[k] || y.pj - x.pj || y.puntos - x.puntos || y.form - x.form || x.nombre.localeCompare(y.nombre, "es"));
    let pos = 0, prev = null;
    lista.forEach((j, i) => { if (j[k] !== prev) { pos = i + 1; prev = j[k]; } j.pos = pos; });
    return lista;
  }

  // ---------- render de filtros ----------
  // Los botones se arman una sola vez y después solo se marca cuál está elegido:
  // así no se pierde el lugar (el foco) del que usa teclado o lector de pantalla.
  function montarFuentes() {
    const varias = Object.keys(FUENTES).length > 1;
    $("#fuentes").hidden = !varias;
    if (varias) $("#fuentes").innerHTML = Object.values(FUENTES).map((Fu) =>
      `<button type="button" data-fuente="${Fu.k}" aria-pressed="false">
        <b>${esc(Fu.lbl)}</b><small>${esc(rangoTxt(Fu.rango))}</small></button>`).join("");
    $("#cats").innerHTML = CATS.map((c, i) => `<button type="button" data-cat="${i}" aria-pressed="false">${esc(c)}</button>`).join("");
  }
  // 3 formas de ordenar a la vista + "Más" (en la tabla de la compu también se ordena tocando cada columna)
  function montarChips() {
    const { ordenes, principales } = F();
    $("#chips").innerHTML = principales.map((k) =>
      `<button type="button" data-orden="${k}" aria-pressed="false">${esc(etiqueta(k))}</button>`).join("") +
      `<label class="orden-mas"><span class="sr">Más formas de ordenar</span><select id="mas">
        <option value="" disabled selected>Más</option>
        ${ordenes.filter((k) => !principales.includes(k)).map((k) => `<option value="${k}">${esc(etiqueta(k))}</option>`).join("")}
      </select></label>`;
  }
  const marcar = (sel, si) => document.querySelectorAll(sel).forEach((b) => b.setAttribute("aria-pressed", String(si(b))));

  function renderFiltros() {
    marcar("#fuentes [data-fuente]", (b) => b.dataset.fuente === S.fuente);
    document.body.dataset.fuente = S.fuente;
    const SECCION = { jugadores: "Jugadores", resultados: "Resultados", records: "Récords" }[S.vista];
    $("#titulo-vista").textContent = SECCION;
    document.title = `Los 50 · ${SECCION}`;
    marcar("#cats [data-cat]", (b) => +b.dataset.cat === S.cat);
    marcar("#vistas [data-vista]", (b) => b.dataset.vista === S.vista);
    marcar("#chips [data-orden]", (b) => b.dataset.orden === S.orden);
    const esSec = !F().principales.includes(S.orden), mas = $("#mas");
    mas.value = esSec ? S.orden : "";
    mas.closest(".orden-mas").classList.toggle("activo", esSec);

    const anios = aniosDe(S.cat);
    if (S.temp !== "todas" && !anios.includes(+S.temp)) S.temp = "todas";
    $("#temp").innerHTML = `<option value="todas">Todas</option>` +
      anios.map((a) => `<option value="${a}"${String(a) === S.temp ? " selected" : ""}>${a}</option>`).join("");

    if ($("#q").value !== S.q) $("#q").value = S.q;
    const res = S.vista === "resultados", rec = S.vista === "records";
    $(".orden").hidden = S.vista !== "jugadores";
    $(".buscar").hidden = rec;
    $("#q").placeholder = res ? "Buscá un rival" : "Buscá a un jugador";
    $(".buscar .sr").textContent = $("#q").placeholder;
    $("#lista").classList.toggle("vista-resultados", res);
    $("#lista").classList.toggle("vista-records", rec);

    const aviso = {
      diarios: `<b>Datos de diarios, no oficiales.</b> Salen de las notas de El Eco de Tandil (${rangoTxt(F().rango)}): solo están los partidos que se publicaron. <b>Partidos</b> = partidos confirmados por el diario (aparece en la formación o hizo puntos): jugó <i>por lo menos</i> esa cantidad.`,
      todo: `<b>Suma de las dos fuentes:</b> oficial UAR (${rangoTxt(FUENTES.oficial.rango)}) + diarios (${rangoTxt(FUENTES.diarios ? FUENTES.diarios.rango : null)}). Los partidos de los diarios son los confirmados (mínimo). Banco y tarjetas: solo oficiales.`,
    }[S.fuente];
    $("#aviso").hidden = !aviso;
    $("#aviso").innerHTML = aviso || "";
  }

  // ---------- render de la lista ----------
  function trozo(k, j) {
    const v = j[k];
    if (k === "pj") return `${v} ${plural(v, ORD.pj.u)}`;
    if (k === "puntos") return `${v} pts`;
    if (k === "form") return `${v} en formaciones`;
    return `${v} ${plural(v, ORD[k].u)}`;
  }
  function subtexto(j) {
    if (S.orden === "amarillas" || S.orden === "rojas") {
      return `${j.pj} PJ · <span class="tarj am" aria-hidden="true"></span>${j.amarillas} · <span class="tarj ro" aria-hidden="true"></span>${j.rojas}`;
    }
    return F().sub3.filter((k) => k !== S.orden).slice(0, 2).map((k) => trozo(k, j)).join(" · ");
  }

  const coincide = (toks, nombre) => { const n = norm(nombre); return toks.every((t) => n.includes(t)); };
  const ESCRITORIO = matchMedia("(min-width: 1024px)");

  function renderLista() {
    const todos = ranking(agregar(S.cat, S.temp), S.orden);
    const toks = norm(S.q).split(/\s+/).filter(Boolean);
    const lista = toks.length ? todos.filter((j) => coincide(toks, j.nombre)) : todos;
    const o = ORD[S.orden];

    // la búsqueda también mira las otras categorías (el que busca a su hijo no sabe en cuál está)
    const aca = new Set(lista.map((j) => j.pid));
    const otras = toks.length ? CATS.flatMap((c, i) => i === S.cat ? [] :
      agregar(i, S.temp).filter((j) => !aca.has(j.pid) && coincide(toks, j.nombre)).map((j) => ({ ...j, cat: i })))
      .sort((a, b) => b.pj - a.pj).slice(0, 8) : [];

    $("#resumen").textContent = toks.length ? `${lista.length} de ${todos.length} jugadores` : `${todos.length} jugadores`;
    $("#vacio").hidden = lista.length > 0;
    if (!lista.length) $("#vacio-txt").textContent = toks.length
      ? `Nadie con “${S.q}” en ${CATS[S.cat]}` + (otras.length ? "." : S.temp === "todas" ? " ni en las otras categorías." : ` en ${S.temp}. Probá con la temporada “Todas”.`)
      : S.fuente === "diarios" && DD.resultados_por_categoria && DD.resultados_por_categoria[S.cat]
        ? `El diario publicó ${DD.resultados_por_categoria[S.cat]} resultados de ${CATS[S.cat]}, pero sin nombrar a los jugadores.`
        : `No hay datos de ${CATS[S.cat]}${S.temp === "todas" ? "" : " para " + S.temp}.`;
    $("#limpiar").hidden = !toks.length;
    $("#en-otras").hidden = !otras.length;
    $("#en-otras").innerHTML = otras.length ? `<p>${lista.length ? "También" : "Pero"} ${otras.length === 1 ? "aparece" : "aparecen"} en otra categoría:</p>
      <ul>${otras.map((j) => `<li><button type="button" data-ir-cat="${j.cat}" data-j-otra="${esc(j.pid)}">
        <span class="card__nombre">${nombreHTML(j.nombre)}</span>
        <span class="en-otras__cat">${esc(CATS[j.cat])} · ${j.pj} ${plural(j.pj, ORD.pj.u)}</span></button></li>`).join("")}</ul>` : "";

    // se arma solo lo que se ve: tarjetas en celular y tablet, tabla en la compu
    if (!ESCRITORIO.matches) {
      $("#tabla thead").innerHTML = $("#tabla tbody").innerHTML = "";
      $("#cards").innerHTML = lista.map((j) => `
      <li><button type="button" class="card" data-j="${esc(j.pid)}">
        <span class="pos${j.pos <= 3 ? " top3" : ""}${j.pos === 1 ? " top1" : ""}"><span class="sr">Puesto </span>${j.pos}</span>
        <span><span class="card__nombre">${nombreHTML(j.nombre)}</span><span class="card__sub">${subtexto(j)}</span></span>
        <span class="card__dato"><strong class="num">${j[S.orden]}</strong><span>${esc(plural(j[S.orden], o.u))}</span></span>
      </button></li>`).join("");
      return;
    }
    $("#cards").innerHTML = "";
    const cols = F().tabla;
    $("#tabla thead").innerHTML = `<tr><th class="izq" scope="col">#</th><th class="izq" scope="col">Jugador</th>` +
      cols.map((k) => `<th scope="col"${k === S.orden ? ' aria-sort="descending"' : ""}>
        <button type="button" data-orden="${k}" aria-label="Ordenar por ${esc(etiqueta(k).toLowerCase())}" title="Ordenar por ${esc(etiqueta(k).toLowerCase())}">${esc(ORD[k].corto)}</button></th>`).join("") + `</tr>`;
    $("#tabla tbody").innerHTML = lista.map((j) => `
      <tr data-j="${esc(j.pid)}">
        <td class="izq"><span class="pos${j.pos <= 3 ? " top3" : ""}${j.pos === 1 ? " top1" : ""}">${j.pos}</span></td>
        <td class="izq jug"><button type="button" class="jug__btn" data-j="${esc(j.pid)}">${nombreHTML(j.nombre)}</button></td>
        ${cols.map((k) => {
          const v = j[k];
          const cls = [k === S.orden ? "act" : "", v === 0 ? "cero" : ""].filter(Boolean).join(" ");
          const ic = k === "amarillas" && v ? '<span class="tarj am" aria-hidden="true"></span>'
            : k === "rojas" && v ? '<span class="tarj ro" aria-hidden="true"></span>' : "";
          return `<td${cls ? ` class="${cls}"` : ""}>${ic}${v}</td>`;
        }).join("")}
      </tr>`).join("");
  }

  // ---------- ficha del jugador ----------
  const datosJugador = (pid, cat, temp, fs) => agregar(cat, temp, fs).find((j) => j.pid === pid) || null;
  const fila = (dt, dd) => `<div><dt>${dt}</dt><dd>${dd}</dd></div>`;
  const tarjAm = '<span class="tarj am" aria-hidden="true"></span>Amarillas', tarjRo = '<span class="tarj ro" aria-hidden="true"></span>Rojas';
  const GRANDES = [["pj", ["Partido", "Partidos"]], ["tries", ["Try", "Tries"]], ["puntos", ["Punto", "Puntos"]]];

  function renderFicha() {
    const pid = S.jug;
    const j = datosJugador(pid, S.cat, S.temp);
    const [ap, no] = partes(NOMBRE(pid));
    $("#ficha-nombre").innerHTML = `${esc(ap)}${no ? `<small>${esc(no)}</small>` : ""}`;
    const etq = `<span class="etq">${esc(CATS[S.cat])}</span>${S.fuente !== "oficial" ? `<span class="etq etq--fuente">${esc(F().lbl)}</span>` : ""}`;
    $(".ficha__pie").hidden = !j;  // sin datos no hay imagen para compartir

    if (!j) {
      $("#ficha-meta").innerHTML = etq + (S.temp === "todas" ? "" : "Temporada " + esc(S.temp));
      $("#ficha-cuerpo").innerHTML = `<p>No tiene partidos en ${esc(CATS[S.cat])}${S.temp === "todas" ? "" : " en " + esc(S.temp)}.</p>` + otrasCats(pid) + otrasFuentes(pid);
      return;
    }
    const anios = [...j.anios].sort();
    $("#ficha-meta").innerHTML = etq + (S.temp === "todas" ? rangoTxt([anios[0], anios[anios.length - 1]]) : `Temporada ${esc(S.temp)}`);

    // los números en cero no se destacan (un jugador con pocos partidos no ve "0 TRIES" en grande y en color)
    const grandes = `<div class="grandes">${GRANDES.map(([k, u]) =>
      `<div class="grande${j[k] ? "" : " grande--cero"}"><strong class="num">${j[k]}</strong><span>${plural(j[k], u)}</span></div>`).join("")}</div>`;
    // orden: otras categorías · los 3 números · logros · sus partidos (el detalle del número grande) · año a año · sus puntos
    const hitos = hitosDe(pid, S.cat).filter((x) => x.tipo !== "debut").slice(0, 2);
    const logros = hitos.length ? `<ul class="hitos">${hitos.map((x) =>
      `<li class="hito hito--${x.tipo}">${x.tipo === "marca" ? ICONO_MEDALLA : ""}${esc(x.txt)}</li>`).join("")}</ul>` : "";
    let h;
    if (S.fuente === "oficial") {
      h = otrasCats(pid) + grandes + logros + bloquePartidos(pid, j);
      if (S.temp === "todas" && anios.length > 1) h += anioAnio(pid);
      h += bloquePuntos(pid, j);
      $("#ficha-cuerpo").innerHTML = h;
      return;
    }
    if (S.fuente === "diarios") {
      h = `${grandes}
        <div class="bloque"><h3>Detalle</h3><dl class="datos">
          ${fila("Titular (formación)", j.form_tit)}${fila("Ingresó (formación)", j.form_ing)}${fila("Temporadas", j.temporadas)}
          ${fila("Conversiones", j.conversiones)}${fila("Penales", j.penales)}${fila("Drops", j.drops)}</dl>
          <p class="nota-ficha">Según notas de El Eco de Tandil. <b>Partidos confirmados</b>: aparece en una formación publicada o hizo puntos; jugó por lo menos esos partidos.</p></div>`;
    } else {
      const o = datosJugador(pid, S.cat, S.temp, ["o"]) || {}, d = datosJugador(pid, S.cat, S.temp, ["d"]) || {};
      const fl = (lbl, k) => `<tr><th scope="row">${lbl}</th><td>${o[k] ?? 0}</td><td>${d[k] ?? 0}</td><td><b>${j[k]}</b></td></tr>`;
      h = `${grandes}
        <div class="bloque"><h3>De dónde sale cada número</h3>
          <table class="anios desglose"><thead><tr><th scope="col"></th><th scope="col">Oficial</th><th scope="col">Diarios</th><th scope="col">Total</th></tr></thead>
          <tbody>${fl("Partidos", "pj")}${fl("Tries", "tries")}${fl("Conversiones", "conversiones")}${fl("Penales", "penales")}${fl("Drops", "drops")}${fl("Puntos", "puntos")}
            <tr><th scope="row">Temporadas</th><td>${o.temporadas ?? 0}</td><td>${d.temporadas ?? 0}</td><td><b>${j.temporadas}</b></td></tr></tbody></table>
          <p class="nota-ficha">Partidos de diarios = confirmados (mínimo). Banco y tarjetas: solo oficiales.</p>
          <dl class="datos" style="margin-top:8px">${fila("Desde el banco", j.banco)}
            ${fila(tarjAm, j.amarillas)}${fila(tarjRo, j.rojas)}</dl></div>`;
    }
    h = otrasCats(pid) + logros + h + bloquePuntos(pid, j);
    if (S.temp === "todas" && anios.length > 1) h += anioAnio(pid);
    h += otrasFuentes(pid);
    $("#ficha-cuerpo").innerHTML = h;
  }

  // ---------- sus partidos: cada partido que se le cuenta, con su planilla ----------
  const ICONO_PLANILLA = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/></svg>';
  const botonPlanilla = (clave, mid, foco, cuando) => `<button type="button" class="ver-planilla" data-planilla="${esc(clave)}" data-mid="${esc(mid)}"
    ${foco ? `data-foco="${esc(JSON.stringify(foco))}"` : ""} aria-expanded="${!!(S.panel && S.panel.clave === clave)}"
    aria-label="Planilla del partido${cuando ? ` ${esc(cuando)}` : ""}">${ICONO_PLANILLA}Planilla</button>`;
  /** "XVII Torneo Regional Pampeano B-Primera" -> "XVII Torneo Regional Pampeano B" (la categoría ya está elegida) */
  const torneoCorto = (t) => String(t || "")
    .replace(/\s*[-–]?\s*(?:\bde\s+)?\b(pre[\s-]*interm[a-z]*|interm[a-z]*|primera|1ra\.?)(?=\s|$|[^a-záéíóúñ])/gi, "")
    .replace(/\s+(de|del|-)\s*$/i, "").replace(/\s{2,}/g, " ").trim();
  const abierto = (clave) => S.panel && S.panel.clave === clave;

  // ---------- la planilla oficial, ahí mismo: las mismas columnas que la planilla de la UAR ----------
  const PLANILLAS = new Map();  // partido -> datos de web/planillas/<partido>.json (o "error")
  const T_PUNTOS = ["Try", "Try penal", "Conversión", "Penal", "Drop"];
  const ICONO_OK = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const ICONO_ALERTA = '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.4v.1"/></svg>';
  function cargarPlanilla(mid) {
    // si el partido no existe, el servidor devuelve la portada (no un JSON)
    return fetch(`planillas/${mid}.json`)
      .then((r) => { if (!r.ok || !(r.headers.get("content-type") || "").includes("json")) throw new Error(); return r.json(); })
      .then((d) => { PLANILLAS.set(mid, d); }, () => { PLANILLAS.set(mid, "error"); });
  }
  function panelPlanilla(mid, pid, foco) {
    const pl = PLANILLAS.get(mid);
    if (!pl) return `<div class="pl"><p class="pl__msg" role="status">Cargando la planilla…</p></div>`;
    if (pl === "error") return `<div class="pl"><p class="pl__msg">No se pudo cargar la planilla. <button type="button" class="link" data-pl="reintentar">Probar de nuevo</button></p></div>`;
    const nos = pl.lado, [loc, vis] = pl.equipos, rival = pl.equipos[nos === "L" ? 1 : 0];
    const suma = { L: 0, V: 0 };
    for (const x of pl.jugadas) if (T_PUNTOS.includes(x[3])) suma[x[0]] += x[4] || 0;
    const ok = suma.L === pl.tantos[0] && suma.V === pl.tantos[1];
    const esFoco = (x) => !!foco && x[1] === foco[0] && x[2] === foco[1] && x[3] === foco[2];
    // cada renglón como figura en la planilla (si se corrigió, el nombre que figuraba y abajo la corrección)
    const fila = (x, marcar) => {
      const [lado, t, min, inc, pts, dorsal, nombre, , fig, figDorsal] = x;
      const jug = lado === nos ? `${esc(fig ? figDorsal || dorsal : dorsal)} - ${esc(fig || nombre || "(sin jugador)")}`
        : `${dorsal ? `${esc(dorsal)} - ` : ""}<i>de ${esc(rival)}</i>`;
      return `<tr${marcar ? ' class="pl--el"' : ""}><td>${marcar ? '<span class="sr">Esta jugada: </span>' : ""}${esc(t)}</td><td class="num">${min ?? ""}</td><td>${esc(inc)}</td><td class="num">${pts || ""}</td>
        <td>${jug}${fig ? `<span class="pl__corr">Corregido con el club: fue ${esc(nombre || "nadie (los puntos quedan para el equipo)")}.</span>` : ""}</td></tr>`;
    };
    const tabla = (titulo, filas, visible = true) => `<table class="pl__tabla"><caption${visible ? "" : ' class="sr"'}>${titulo}</caption>
      <thead><tr><th scope="col"><abbr title="Tiempo">Tie.</abbr></th><th scope="col"><abbr title="Minuto">Min.</abbr></th><th scope="col">Incidencia</th>
        <th scope="col"><abbr title="Puntos">Pun.</abbr></th><th scope="col">Jugador</th></tr></thead>
      <tbody>${filas || '<tr><td colspan="5">Sin incidencias.</td></tr>'}</tbody></table>`;
    const ROL_PL = { T: "titular", E: "suplente, entró", B: "suplente, no entró" };
    const lista = pl.formacion.find((x) => x[3] === pid);
    const [ap] = partes(NOMBRE(pid) || "");
    // la respuesta que se busca al abrir la planilla: con qué camiseta jugó y cómo
    const jugo = !lista ? "" : lista[4] === "T" ? `Jugó con la ${esc(lista[1] || lista[0])}, de titular.`
      : lista[4] === "E" ? `Jugó con la ${esc(lista[1] || lista[0])}: entró desde el banco.`
        : `Estuvo en el banco con la ${esc(lista[1] || lista[0])} y no entró.`;
    const verTodo = `<button type="button" class="btn pl__toggle" data-pl="completa" aria-expanded="${S.panelCompleta}">${S.panelCompleta ? `Ver solo lo de ${esc(ap)}` : "Ver toda la planilla"}</button>`;
    let h = `<div class="pl">
      <div class="pl__barra"><span>Planilla oficial de la UAR · n.º ${esc(pl.mid)}</span>
        <button type="button" class="pl__compartir" data-pl="compartir" aria-label="Compartir esta planilla">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg></button></div>
      <p class="pl__partido"><b>${esc(loc)} ${pl.tantos[0]} – ${pl.tantos[1]} ${esc(vis)}</b>
        ${ok ? `<span class="pl__ok">${ICONO_OK}Coincide con el resultado</span>` : ""}</p>
      <p class="pl__meta">${esc(pl.fecha)} · ${esc(torneoCorto(pl.torneo))}</p>
      ${ok ? "" : `<p class="pl__control pl__control--no">${ICONO_ALERTA}<span>Ojo: los puntos de la planilla suman ${suma.L} a ${suma.V}, pero el resultado oficial es ${pl.tantos[0]} a ${pl.tantos[1]}.</span></p>`}
      ${jugo ? `<p class="pl__jugo">${jugo}</p>` : ""}`;
    if (S.panelCompleta) {
      h += `<div class="pl__acciones">${verTodo}</div>`;
      const de = (lado) => pl.jugadas.filter((x) => x[0] === lado).map((x) => fila(x, x[7] === pid && (esFoco(x) || !foco))).join("");
      h += tabla(`Incidencias LOCAL · ${esc(loc)}`, de("L")) + tabla(`Incidencias VISITANTE · ${esc(vis)}`, de("V"));
      h += `<table class="pl__tabla pl__tabla--lista"><caption>Miembros del equipo · ${esc(CLUB.nombre.replace(/^Club /, ""))}</caption>
        <thead><tr><th scope="col">Pos</th><th scope="col">Nombre</th><th scope="col"></th></tr></thead>
        <tbody>${pl.formacion.map(([orden, dorsal, nombre, xpid, rol]) => `<tr${xpid === pid ? ' class="pl--el"' : ""}><td class="num">${esc(dorsal || orden)}</td>
          <td>${esc(nombre)}</td><td class="pl__rol">${ROL_PL[rol]}</td></tr>`).join("")}</tbody></table>`;
      return h + "</div>";
    }
    const suyas = pl.jugadas.filter((x) => x[0] === nos && x[7] === pid);
    h += suyas.length ? tabla(`Jugadas de ${esc(ap)} en la planilla`, suyas.map((x) => fila(x, esFoco(x))).join(""), false)
      : `<p class="pl__msg">Sin puntos ni tarjetas en este partido.</p>`;
    h += `<div class="pl__acciones">${verTodo}</div></div>`;
    return h;
  }
  let PARTICIPA = null, cargandoPart = null;  // datos/participaciones.json: se baja recién cuando alguien abre la lista
  const cargarParticipaciones = () => cargandoPart || (cargandoPart = fetch("datos/participaciones.json")
    .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
    .then((d) => { PARTICIPA = d; })
    .catch(() => { cargandoPart = null; throw new Error("red"); }));
  const ROL = { T: "De titular", E: "Entró desde el banco", B: "En el banco, no entró (no cuenta)" };

  function bloquePartidos(pid, j) {
    // titular + desde el banco = el número grande de partidos; el banco sin entrar va aparte (no cuenta)
    const celda = (n, lbl, clase = "") => `<div class="pj-celda${n ? "" : " pj-celda--cero"}${clase}"><b class="num">${n}</b><span>${lbl}</span></div>`;
    const cuenta = `<div class="pj-cuenta">${celda(j.pj - j.banco, "De titular")}${celda(j.banco, "Desde el banco")}
      ${celda(j.sin || 0, `Banco sin entrar<span class="sr"> (no cuentan)</span>`, " pj-celda--no")}</div>`;
    const tarjetas = [j.amarillas && `<span class="tarj am" aria-hidden="true"></span>${j.amarillas} ${j.amarillas === 1 ? "amarilla" : "amarillas"}`,
      j.rojas && `<span class="tarj ro" aria-hidden="true"></span>${j.rojas} ${j.rojas === 1 ? "roja" : "rojas"}`].filter(Boolean);
    const debut = hitosDe(pid, S.cat).find((x) => x.tipo === "debut");
    const resumen = `${cuenta}
      ${tarjetas.length ? `<p class="pj-tarjetas">${tarjetas.join(" · ")}</p>` : ""}
      ${debut ? `<p class="pj-debut">${esc(debut.txt)}</p>` : ""}`;
    let lista = "";
    if (S.verPartidos && PARTICIPA) {
      const filas = (PARTICIPA[pid] || []).map(([mid, rol]) => ({ mid, rol, p: PARTIDO.get(mid) }))
        .filter((x) => x.p && x.p[1] === S.cat && (S.temp === "todas" || String(x.p[0]) === S.temp));
      const ver = S.todosPartidos ? filas : filas.slice(0, 10);
      const letra = (p) => (p[6] > p[7] ? "G" : p[6] === p[7] ? "E" : "P");
      lista = `<ul class="pj-lista">${ver.map(({ mid, rol, p }) => `
        <li><span class="pj-fecha">${fecha(p[2])}</span>
          <span><span class="pj-rival">${esc(D.rivales[p[3]])}<span class="pj-res pj-res--${letra(p)}">${p[6]}–${p[7]}</span></span>
            <span class="pj-rol${rol === "B" ? " pj-rol--b" : ""}">${ROL[rol]}</span></span>
          ${botonPlanilla(`p:${mid}`, mid, null, `del ${fecha(p[2])} contra ${D.rivales[p[3]]}`)}</li>
        ${abierto(`p:${mid}`) ? `<li class="pl-fila">${panelPlanilla(mid, pid, null)}</li>` : ""}`).join("")}</ul>
        ${filas.length > 10 ? `<button type="button" class="btn mas" data-accion="todos-partidos">${S.todosPartidos ? "Ver menos" : `Ver todos (${filas.length})`}</button>` : ""}`;
    }
    return `<div class="bloque" id="sus-partidos">
      <div class="bloque__cab"><h3>Sus partidos</h3><button type="button" class="ayuda-btn" data-como aria-haspopup="dialog" aria-label="¿Cómo se cuenta?">?</button></div>
      ${resumen}
      ${lista || `<button type="button" class="btn mas" data-accion="partidos">Ver sus partidos</button>`}</div>`;
  }

  function bloquePuntos(pid, j) {
    const disp = TIPOS.filter((t) => j[t.k] > 0);
    if (!disp.length) return "";  // el "0 PUNTOS" de arriba ya lo dice
    if (!disp.some((t) => t.k === S.tipo)) S.tipo = disp[0].k;
    const tipo = TIPOS.find((t) => t.k === S.tipo);
    const fs = F().f;
    const ev = EVENTOS.filter((p) => p.pid === pid && p.cat === S.cat && fs.includes(p.f) && tipo.t.includes(p.tipo) &&
      (S.temp === "todas" || String(p.anio) === S.temp))
      .sort((a, b) => b.anio - a.anio || (b.fecha || "").localeCompare(a.fecha || ""));

    const porRival = new Map();
    for (const p of ev) porRival.set(p.rival, (porRival.get(p.rival) || 0) + p.cant);
    const rivales = [...porRival].sort((a, b) => b[1] - a[1] || D.rivales[a[0]].localeCompare(D.rivales[b[0]], "es"));
    const max = rivales.length ? rivales[0][1] : 1;
    const verR = S.verRivales ? rivales : rivales.slice(0, 6);
    const verE = S.verTodos ? ev : ev.slice(0, 8);
    const quien = { tries: "A quién le hizo tries", conversiones: "A quién le convirtió", penales: "A quién le metió penales", drops: "A quién le metió drops" }[tipo.k];
    const comoLosHizo = tipo.k === "tries" && S.fuente === "oficial" ? cuandoYComo(ev) : "";
    const derecha = (p) => p.f === "d"
      ? `<a class="ev-nota" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" aria-label="Ver la nota del diario">nota ↗</a>`
      : `<span class="ev-der"><span class="ev-min">${esc(p.tiempo)}${p.minuto != null ? " " + p.minuto + "'" : ""}</span>${p.mid
        ? botonPlanilla(claveEv(p), p.mid, [p.tiempo, p.minuto, D.tipos[p.tipo]], `del ${fecha(p.fecha)} contra ${D.rivales[p.rival]}`) : ""}</span>`;
    const claveEv = (p) => `e:${p.mid}:${p.tiempo}:${p.minuto}:${p.tipo}`;

    return `<div class="bloque"><h3>Sus puntos</h3>
      ${disp.length > 1 ? `<div class="tipos" role="group" aria-label="Tipo de punto">${disp.map((t) =>
        `<button type="button" data-tipo="${t.k}" aria-pressed="${t.k === tipo.k}">${esc(t.lbl)} (${j[t.k]})</button>`).join("")}</div>` : ""}
      ${comoLosHizo}
      ${rivales.length ? `<h4 class="sub">${quien}</h4>
      <ul class="barras">${verR.map(([r, n]) => `
        <li><div class="barra"><i style="width:${Math.max(6, (n / max) * 100)}%"></i><span>${esc(D.rivales[r])}</span></div><b>${n}</b></li>`).join("")}
      </ul>
      ${rivales.length > 6 ? `<button type="button" class="btn mas" data-accion="rivales">${S.verRivales ? "Ver menos" : `Ver los ${rivales.length} rivales`}</button>` : ""}
      <h4 class="sub sub--sep">Partido por partido</h4>
      <ul class="eventos">${verE.map((p) => `
        <li><span class="ev-fecha">${fecha(p.fecha)}${p.fecha ? "" : ` <small>${p.anio}</small>`}</span>
          <span><span class="ev-rival">${esc(D.rivales[p.rival])}</span>${p.cant > 1 ? ` <b class="ev-cant">×${p.cant}</b>` : ""}${p.tipo === 1 ? ' <span class="ev-tag">try penal</span>' : ""}${S.fuente === "todo" && p.f === "d" ? ' <span class="ev-tag ev-tag--diario">diario</span>' : ""}${p.figuraba ? ' <span class="ev-tag ev-tag--corr">corregido</span>' : ""}</span>
          ${derecha(p)}</li>
        ${p.mid && abierto(claveEv(p)) ? `<li class="pl-fila">${panelPlanilla(p.mid, pid, [p.tiempo, p.minuto, D.tipos[p.tipo]])}</li>` : ""}`).join("")}
      </ul>
      ${ev.length > 8 ? `<button type="button" class="btn mas" data-accion="todos">${S.verTodos ? "Ver menos" : `Ver todos (${ev.length})`}</button>` : ""}`
      : `<p class="nota-ficha">Hay ${j[tipo.k]} ${tipo.lbl.toLowerCase()} sin detalle de partido.</p>`}
    </div>`;
  }

  // de qué son sus tries: todo lo que dice la planilla de cada uno (la jugada —scrum, line, contra— no la anota)
  const PUESTO = { 1: "pilar", 2: "hooker", 3: "pilar", 4: "segunda línea", 5: "segunda línea", 6: "ala", 7: "ala", 8: "octavo",
    9: "medio scrum", 10: "apertura", 11: "wing", 12: "centro", 13: "centro", 14: "wing", 15: "fullback" };
  function cuandoYComo(ev) {
    if (!ev.length) return "";
    const n = (f) => ev.filter(f).reduce((a, e) => a + e.cant, 0);
    const total = n(() => true);  // un partido puede tener más de un try
    const t1 = n((e) => e.tiempo === "1T"), t2 = n((e) => e.tiempo === "2T"), ult = n((e) => e.tiempo === "2T" && minutoDelPartido(e) >= 70);
    const banco = n((e) => e.banco), penal = n((e) => e.tipo === 1);
    const puestos = new Map();
    for (const e of ev) if (PUESTO[e.puesto]) puestos.set(PUESTO[e.puesto], (puestos.get(PUESTO[e.puesto]) || 0) + e.cant);
    const de = [...puestos].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const celda = (v, lbl) => `<div class="cyc__celda${v ? "" : " cyc__celda--cero"}"><b class="num">${v}</b><span>${lbl}</span></div>`;
    const fila = (dt, celdas) => `<div class="cyc__fila"><dt>${dt}</dt><dd>${celdas.filter(Boolean).join("")}</dd></div>`;
    return `<h4 class="sub">Cuándo y cómo</h4><dl class="cyc">
      ${fila("Cuándo", [celda(t1, "1er tiempo"), celda(t2, "2do tiempo"), celda(ult, "últimos 10'")])}
      ${fila("Cómo", [celda(total - banco, "de titular"), celda(banco, "desde el banco"), penal && celda(penal, "try penal")])}
      ${de.length ? fila("Jugando de", de.map(([p, v]) => celda(v, p))) : ""}</dl>`;
  }

  function anioAnio(pid) {
    const fs = F().f, porAnio = new Map();
    for (const r of FILAS) {
      if (r.pid !== pid || r.cat !== S.cat || !fs.includes(r.f) || !activo(r)) continue;
      const a = porAnio.get(r.anio) || { pj: 0, tries: 0, puntos: 0, amarillas: 0, rojas: 0, form: 0, fuentes: new Set() };
      for (const k of ["pj", "tries", "puntos", "amarillas", "rojas", "form"]) a[k] += r[k];
      a.fuentes.add(r.f);
      porAnio.set(r.anio, a);
    }
    const filas = [...porAnio].sort((a, b) => b[0] - a[0]);
    const cols = S.fuente === "diarios" ? [["pj", "PJ"], ["tries", "Tries"], ["puntos", "Pts"]]
      : [["pj", "PJ"], ["tries", "Tries"], ["puntos", "Pts"], ["amarillas", "Am."], ["rojas", "Ro."]];
    return `<div class="bloque"><h3>Año a año</h3><table class="anios">
      <thead><tr><th scope="col">Año</th>${cols.map(([, l]) => `<th scope="col">${l}</th>`).join("")}</tr></thead>
      <tbody>${filas.map(([anio, a]) => `<tr><td>${anio}${S.fuente === "todo" && a.fuentes.has("d") ? ' <span class="ev-tag ev-tag--diario">diario</span>' : ""}</td>
        ${cols.map(([k]) => `<td${a[k] ? "" : ' class="cero"'}>${a[k]}</td>`).join("")}</tr>`).join("")}</tbody>
    </table></div>`;
  }

  function otrasCats(pid) {
    const otras = CATS.map((c, i) => [i, datosJugador(pid, i, S.temp)]).filter(([i, d]) => i !== S.cat && d);
    if (!otras.length) return "";
    return `<div class="otras otras--arriba"><span class="otras__lbl">También en</span>${otras.map(([i, d]) =>
      `<button type="button" data-ir-cat="${i}">${esc(CATS[i])} <b>${d.pj}</b></button>`).join("")}</div>`;
  }

  function otrasFuentes(pid) {
    const otras = Object.values(FUENTES).filter((Fu) => Fu.k !== S.fuente && Fu.k !== "todo" && datosJugador(pid, S.cat, "todas", Fu.f));
    if (!otras.length) return "";
    return `<div class="bloque"><h3>También tiene datos en</h3><div class="otras">${otras.map((Fu) =>
      `<button type="button" data-ir-fuente="${Fu.k}">${esc(Fu.lbl)} · ${esc(rangoTxt(Fu.rango))}</button>`).join("")}
      ${S.fuente !== "todo" && FUENTES.todo ? `<button type="button" data-ir-fuente="todo">Ver todo junto</button>` : ""}</div></div>`;
  }

  // ---------- B: compartir la ficha como imagen (WhatsApp, Instagram...) ----------
  const cargarImg = (src) => new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = src; });
  function texto(x, t, px, peso, familia, color, maxW) {
    let tam = px;
    x.font = `${peso} ${tam}px ${familia}`;
    while (maxW && x.measureText(t).width > maxW && tam > 30) { tam -= 4; x.font = `${peso} ${tam}px ${familia}`; }
    x.fillStyle = color;
    return tam;
  }
  async function imagenFicha() {
    const pid = S.jug, j = datosJugador(pid, S.cat, S.temp);
    if (!j) return null;
    const W = 1080, H = 1350, M = 84, c = document.createElement("canvas");
    c.width = W; c.height = H;
    const x = c.getContext("2d");
    const COND = '"Barlow Condensed", "Arial Narrow", sans-serif', BASE = '"Barlow", system-ui, sans-serif';
    await Promise.all([document.fonts.load(`700 120px ${COND}`), document.fonts.load(`600 40px ${BASE}`), document.fonts.load(`500 40px ${BASE}`)]).catch(() => {});
    const escudo = await cargarImg(CLUB.escudo).catch(() => null);
    // fondo: el mismo azul y negro de la página
    const g = x.createRadialGradient(W * 0.85, 0, 40, W * 0.6, H * 0.15, H * 1.05);
    g.addColorStop(0, "#1b4fb8"); g.addColorStop(0.45, "#0a1f55"); g.addColorStop(1, "#0b0d12");
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    // escudo y club
    if (escudo) x.drawImage(escudo, M, 76, 150, 150 * escudo.naturalHeight / escudo.naturalWidth);
    texto(x, CLUB.nombre.toUpperCase(), 58, 700, COND, "#ffffff"); x.fillText(CLUB.nombre.toUpperCase(), M + 180, 140);
    const anios = [...j.anios].sort();
    const periodo = S.temp === "todas" ? rangoTxt([anios[0], anios[anios.length - 1]]) : `Temporada ${S.temp}`;
    texto(x, "", 36, 600, BASE, "#8fb4f5"); x.fillText(`${CATS[S.cat]} · ${periodo}`, M + 182, 196);
    // nombre
    const [ap, no] = partes(NOMBRE(pid));
    const tam = texto(x, ap.toUpperCase(), 150, 700, COND, "#ffffff", W - 2 * M);
    x.fillText(ap.toUpperCase(), M, 340 + tam * 0.75);
    if (no) { texto(x, no, 64, 600, BASE, "#8fb4f5", W - 2 * M); x.fillText(no, M, 340 + tam * 0.75 + 84); }
    // los tres números
    const datos = GRANDES.map(([k, u]) => [plural(j[k], u), j[k]]);
    const bw = (W - 2 * M - 2 * 24) / 3, by = 640, bh = 290;
    datos.forEach(([lbl, v], i) => {
      const bx = M + i * (bw + 24);
      x.fillStyle = i === 1 && v ? "#1b5fd1" : "rgba(255,255,255,0.07)";
      x.beginPath(); x.roundRect(bx, by, bw, bh, 28); x.fill();
      texto(x, String(v), 150, 700, COND, "#ffffff", bw - 30); x.textAlign = "center"; x.fillText(String(v), bx + bw / 2, by + 178);
      texto(x, lbl.toUpperCase(), 32, 600, BASE, i === 1 && v ? "#e8f0fd" : "#aab3c2"); x.fillText(lbl.toUpperCase(), bx + bw / 2, by + 240);
      x.textAlign = "left";
    });
    // hitos (club de los 100, récords, primer partido)
    let y = 996;
    for (const hi of hitosDe(pid, S.cat).slice(0, 3)) {
      texto(x, hi.txt, 36, 600, BASE, "#ffffff", W - 2 * M - 70);
      const w = Math.min(W - 2 * M, x.measureText(hi.txt).width + 70);
      x.fillStyle = hi.tipo === "debut" ? "rgba(255,255,255,0.07)" : hi.tipo === "marca" ? "rgba(240,199,90,0.34)" : "rgba(242,194,0,0.16)";
      x.beginPath(); x.roundRect(M, y - 46, w, 66, 33); x.fill();
      x.fillStyle = hi.tipo === "debut" ? "#c3cad6" : hi.tipo === "marca" ? "#fbe7a1" : "#f2c200";
      x.beginPath(); x.arc(M + 32, y - 13, 9, 0, Math.PI * 2); x.fill();
      x.fillStyle = "#ffffff"; x.fillText(hi.txt, M + 54, y);
      y += 80;
    }
    // pie
    x.fillStyle = "rgba(255,255,255,0.14)"; x.fillRect(M, H - 130, W - 2 * M, 2);
    texto(x, "", 30, 500, BASE, "#aab3c2"); x.fillText(S.fuente === "oficial" ? "Estadísticas oficiales · Base de datos UAR" : `Datos: ${F().sub} (no oficiales)`, M, H - 76);
    x.textAlign = "right"; texto(x, "", 30, 600, BASE, "#8fb4f5"); x.fillText(location.host || "", W - M, H - 76); x.textAlign = "left";
    return new Promise((ok) => c.toBlob(ok, "image/png"));
  }
  function aviso(msg) {
    // la ficha abierta tapa (y le oculta al lector de pantalla) todo lo que no está adentro de ella
    const t = dlg.open ? $("#toast-ficha") : $("#toast");
    t.textContent = msg; t.classList.add("ver");
    clearTimeout(aviso.t); aviso.t = setTimeout(() => { t.classList.remove("ver"); t.textContent = ""; }, 3500);
  }
  async function compartir() {
    const btn = $("#compartir");
    if (btn.getAttribute("aria-busy") === "true") return;
    // aria-busy en vez de disabled: así el botón no pierde el foco mientras se arma la imagen
    btn.setAttribute("aria-busy", "true"); btn.classList.add("cargando"); btn.lastElementChild.textContent = "Armando…";
    try {
      const blob = await imagenFicha();
      if (!blob) return;
      const nombre = NOMBRE(S.jug), link = location.origin + url(S.jug);
      const archivo = new File([blob], `${norm(nombre).replace(/[^a-z0-9]+/g, "-")}.png`, { type: "image/png" });
      const txt = `${nombre} · ${CATS[S.cat]} · ${CLUB.nombre}\n${link}`;
      if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
        await navigator.share({ files: [archivo], text: txt });
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = archivo.name; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        try { await navigator.clipboard.writeText(link); aviso("Se descargó la imagen y se copió el link"); } catch (e) { aviso("Se descargó la imagen"); }
      }
    } catch (e) {
      if (e && e.name !== "AbortError") aviso("No se pudo compartir. Probá de nuevo.");
    } finally { btn.removeAttribute("aria-busy"); btn.classList.remove("cargando"); btn.lastElementChild.textContent = "Compartir su ficha"; }
  }
  $("#compartir").addEventListener("click", compartir);

  // ---------- abrir / cerrar ficha ----------
  const dlg = $("#ficha");
  function abrir(pid) {
    S.jug = pid; S.tipo = null; S.verTodos = false; S.verRivales = false; S.verPartidos = false; S.todosPartidos = false;
    S.panel = null; S.panelCompleta = false;
    history.pushState({ ficha: true }, "", url());
    mostrarFicha();
  }
  function mostrarFicha() {
    renderFicha();
    if (!dlg.open) {
      dlg.showModal();
      $("#ficha-nombre").focus();  // arranca leyendo el nombre (y no marca "Compartir" apenas se abre)
    }
    $("#ficha-cuerpo").scrollTop = 0;
  }
  function cerrar() {
    if (history.state && history.state.ficha) history.back();
    else { const pid = S.jug; S.jug = null; guardar(); if (dlg.open) { dlg.close(); volverA(pid); } }
  }
  /** al cerrar la ficha, el foco vuelve al jugador en la lista (si la lista se rearmó mientras tanto) */
  function volverA(pid) {
    if (!pid || (document.activeElement && document.activeElement !== document.body)) return;
    const b = [...document.querySelectorAll(`#lista [data-j="${CSS.escape(pid)}"]`)].find((x) => x.offsetParent && x.matches("button"));
    if (b) b.focus();
  }

  // ---------- eventos ----------
  function render() { renderFiltros(); refrescar(); }
  function refrescar() {
    const v = S.vista;
    $("#resultados").hidden = v !== "resultados";
    $("#balance").hidden = v !== "resultados";
    $("#records").hidden = v !== "records";
    if (v !== "resultados") $("#tries-eq").hidden = true;
    document.body.classList.remove("cargando");
    renderAgenda();
    ({ jugadores: renderLista, resultados: renderResultados, records: renderRecords })[v]();
  }

  // ---------- C: último resultado y próximo partido de la categoría ----------
  const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const fechaDia = (iso) => { const d = new Date(iso + "T12:00:00"); return `${DIAS[d.getDay()]} ${fecha(iso).slice(0, 5)}`; };
  function renderAgenda() {
    const a = D.agenda && D.agenda[S.cat], el = $("#agenda");
    if (!a || (!a.ultimo && !a.proximos.length) || S.vista !== "resultados") { el.hidden = true; return; }
    el.hidden = false;
    const u = a.ultimo, pr = a.proximos[0];
    el.classList.toggle("agenda--uno", !u || !pr);
    const letra = u ? (u[3] > u[4] ? "G" : u[3] === u[4] ? "E" : "P") : "";
    el.innerHTML = `${u ? `<div class="ag">
        <span class="ag__lbl">Último partido</span>
        <span class="ag__rival">${esc(D.rivales[u[1]])}</span>
        <span class="ag__meta">${fechaDia(u[0])} · ${u[2] === "L" ? "Local" : "Visitante"}</span>
        <span class="ag__res res--${letra}"><b class="num">${u[3]}–${u[4]}</b><i>${{ G: "Ganó", E: "Empató", P: "Perdió" }[letra]}</i></span></div>` : ""}
      ${pr ? `<div class="ag ag--prox">
        <span class="ag__lbl">Próximo partido</span>
        <span class="ag__rival">${esc(D.rivales[pr[2]])}</span>
        <span class="ag__meta">${fechaDia(pr[0])}${pr[1] ? " · " + esc(pr[1]) + " h" : ""} · ${pr[3] === "L" ? "Local" : "Visitante"}</span></div>` : ""}`;
  }

  // ---------- A: récords e hitos ----------
  const CIEN = 100;
  /** los mejores n de una lista (empatados comparten el puesto) */
  function mejores(lista, valor, n = 5) {
    const orden = [...lista].sort((a, b) => valor(b) - valor(a) || String(b.fecha || b.anio).localeCompare(String(a.fecha || a.anio)));
    let pos = 0, prev = null;
    return orden.slice(0, n).map((x, i) => { const v = valor(x); if (v !== prev) { pos = i + 1; prev = v; } return { ...x, pos, v }; });
  }
  const filaRec = (x, detalle) => `<li><button type="button" class="rec__fila" data-j="${esc(x.pid)}">
      <span class="pos${x.pos <= 3 ? " top3" : ""}${x.pos === 1 ? " top1" : ""}">${x.pos}</span>
      <span class="rec__quien"><span class="card__nombre">${nombreHTML(NOMBRE(x.pid))}</span><span class="rec__det">${detalle}</span></span>
      <strong class="rec__v num">${x.v}</strong></button></li>`;
  function bloqueRec(titulo, filas, detalle, unidad) {
    return `<section class="rec"><h3 class="rec__tit">${titulo}</h3>
      ${filas.length ? `<ol class="rec__lista">${filas.map((x) => filaRec(x, detalle(x))).join("")}</ol>` : `<p class="rec__vacio">Todavía no hay datos.</p>`}</section>`;
  }
  const memoRec = new Map();
  function recordsDe(cat, temp) {
    const k = `${cat}|${temp}`;
    if (!memoRec.has(k)) memoRec.set(k, calcRecords(cat, temp));
    return memoRec.get(k);
  }
  function calcRecords(cat, temp) {
    const act = ACT.filter((a) => a.cat === cat && (temp === "todas" || String(a.anio) === temp));
    const filas = FILAS.filter((r) => r.f === "o" && r.cat === cat && activo(r) && (temp === "todas" || String(r.anio) === temp))
      .map((r) => ({ pid: r.pid, anio: r.anio, tries: r.tries, puntos: r.puntos, pj: r.pj }));
    return {
      triesPartido: mejores(act.filter((a) => a.tries >= 2), (a) => a.tries),
      puntosPartido: mejores(act.filter((a) => a.puntos >= 10), (a) => a.puntos),
      triesTemp: mejores(filas.filter((r) => r.tries > 0), (r) => r.tries),
      puntosTemp: mejores(filas.filter((r) => r.puntos > 0), (r) => r.puntos),
      pjTemp: mejores(filas, (r) => r.pj),
    };
  }
  function renderRecords() {
    const cat = S.cat, temp = S.temp, R = recordsDe(cat, temp);
    $("#resumen").textContent = "";
    $("#vacio").hidden = true;
    const enPartido = (x) => `vs ${esc(D.rivales[x.rival])} · ${fecha(x.fecha)}`;
    const enTemp = (x) => `Temporada ${x.anio}`;
    let h = "";
    if (temp === "todas") {
      const todos = agregar(cat, "todas"), cien = todos.filter((j) => j.pj >= CIEN).sort((a, b) => b.pj - a.pj);
      const lista = cien.length ? cien : [...todos].sort((a, b) => b.pj - a.pj).slice(0, 5);
      h += `<section class="rec rec--cien"><h2 class="rec__tit">Club de los ${CIEN}</h2>
        ${cien.length ? "" : `<p class="rec__intro">Nadie llegó a ${CIEN} todavía. Los más cerca:</p>`}
        <ol class="cien">${lista.map((j) => `<li><button type="button" class="cien__j" data-j="${esc(j.pid)}"><strong class="num">${j.pj}</strong>
          <span>${nombreHTML(j.nombre)}</span></button></li>`).join("")}</ol></section>`;
    }
    h += `<h2 class="rec__grupo">En un partido</h2><div class="rec__grid">
        ${bloqueRec("Más tries", R.triesPartido, enPartido, "tries")}${bloqueRec("Más puntos", R.puntosPartido, enPartido, "puntos")}</div>
      <h2 class="rec__grupo">En una temporada</h2><div class="rec__grid rec__grid--3">
        ${bloqueRec("Más tries", R.triesTemp, enTemp, "tries")}${bloqueRec("Más puntos", R.puntosTemp, enTemp, "puntos")}${bloqueRec("Más partidos", R.pjTemp, enTemp, "partidos")}</div>`;
    $("#records").innerHTML = h;
  }
  /** hitos de un jugador en una categoría: su partido 100 (200, 300...), récords que tiene y primer partido */
  function hitosDe(pid, cat) {
    const out = [];
    const m = MARCA.get(`${pid}|${cat}`);
    if (m) out.push({ tipo: "marca", txt: `Partido ${m.n} · ${fecha(m.fecha)} vs ${D.rivales[m.rival]}` });
    const R = recordsDe(cat, "todas");
    const rec = [["triesPartido", ["try", "tries"], "en un partido"], ["puntosPartido", ["punto", "puntos"], "en un partido"],
      ["triesTemp", ["try", "tries"], "en una temporada"], ["puntosTemp", ["punto", "puntos"], "en una temporada"],
      ["pjTemp", ["partido", "partidos"], "en una temporada"]];
    for (const [k, u, en] of rec) {
      const x = R[k].find((r) => r.pid === pid && r.pos === 1);
      const igualado = new Set(R[k].filter((r) => r.pos === 1).map((r) => r.pid)).size > 1;
      if (x) out.push({ tipo: "record", txt: `Récord: ${x.v} ${plural(x.v, u)} ${en}${igualado ? " (igualado)" : ""}` });
    }
    const p = PRIMERO.get(`${pid}|${cat}`);
    if (p) {
      const anio = +p.fecha.slice(0, 4);
      out.push({ tipo: "debut", txt: `${anio === ANIO_INICIO ? "Primer partido registrado" : "Debut"}: ${fecha(p.fecha)} vs ${D.rivales[p.rival]}` });
    }
    return out;
  }

  // ---------- resultados del equipo ----------
  function renderResultados() {
    const fs = F().f;
    const toks = norm(S.q).split(/\s+/).filter(Boolean);
    let ps = D.partidos.filter((p) => fs.includes(p[8]) && p[1] === S.cat && (S.temp === "todas" || String(p[0]) === S.temp));
    const total = ps.length;
    if (toks.length) ps = ps.filter((p) => { const n = norm(D.rivales[p[3]]); return toks.every((t) => n.includes(t)); });
    const g = ps.filter((p) => p[6] > p[7]).length, e = ps.filter((p) => p[6] === p[7]).length, per = ps.length - g - e;
    const pf = ps.reduce((a, p) => a + p[6], 0), pc = ps.reduce((a, p) => a + p[7], 0);
    $("#resumen").textContent = toks.length ? `${ps.length} de ${total} partidos` : "";
    const conTantos = S.temp !== "todas";  // el total de tantos de todos los años no le dice nada a nadie
    $("#balance").classList.toggle("balance--3", !conTantos);
    $("#balance").innerHTML = ps.length ? `
      <div class="bal bal--G"><strong class="num">${g}</strong><span>Ganados</span></div>
      <div class="bal bal--E"><strong class="num">${e}</strong><span>Empatados</span></div>
      <div class="bal bal--P"><strong class="num">${per}</strong><span>Perdidos</span></div>
      ${conTantos ? `<div class="bal"><strong class="num">${pf}–${pc}</strong><span>Tantos</span></div>` : ""}` : "";
    $("#vacio").hidden = ps.length > 0;
    $("#limpiar").hidden = !toks.length;
    if (!ps.length) $("#vacio-txt").textContent = toks.length ? `No hay partidos contra “${S.q}” en ${CATS[S.cat]}.`
      : `No hay resultados de ${CATS[S.cat]} en esta fuente${S.temp === "todas" ? "" : " para " + S.temp}.`;
    renderTriesEquipo(ps);
    const letra = (p) => (p[6] > p[7] ? "G" : p[6] === p[7] ? "E" : "P");
    // con todas las temporadas, un título por año con cómo le fue
    const porAnio = new Map();
    for (const p of ps) { const a = porAnio.get(p[0]) || { G: 0, E: 0, P: 0 }; a[letra(p)]++; porAnio.set(p[0], a); }
    const conAnios = S.temp === "todas" && !toks.length;
    const resAnio = (a) => [a.G && `${a.G} ${a.G === 1 ? "ganado" : "ganados"}`, a.E && `${a.E} ${a.E === 1 ? "empatado" : "empatados"}`,
      a.P && `${a.P} ${a.P === 1 ? "perdido" : "perdidos"}`].filter(Boolean).join(" · ");
    let anioPrev = null;
    $("#resultados").innerHTML = ps.map((p) => `${conAnios && p[0] !== anioPrev && (anioPrev = p[0])
      ? `<li class="res__anio"><span>${p[0]}</span><small>${resAnio(porAnio.get(p[0]))}</small></li>` : ""}
      <li class="res">
        <span class="res__fecha">${fecha(p[2])}${p[2] ? "" : `<small>${p[0]}</small>`}<small>${p[5] === "L" ? "Local" : p[5] === "V" ? "Visitante" : ""}</small></span>
        <span class="res__cuerpo"><span class="res__rival">${esc(D.rivales[p[3]])}${S.fuente === "todo" && p[8] === "d" ? ' <span class="ev-tag ev-tag--diario">diario</span>' : ""}</span>
          <span class="res__torneo">${p[4] >= 0 && D.torneos[p[4]] ? esc(torneoCorto(D.torneos[p[4]])) : ""}</span>
          ${p[8] === "d" && p[9] >= 0 ? `<a class="ev-nota" href="${esc(DD.urls[p[9]])}" target="_blank" rel="noopener noreferrer">nota ↗</a>` : ""}</span>
        <span class="res__marcador res--${letra(p)}"><b class="num">${p[6]}–${p[7]}</b><i>${letra(p)}</i></span>
      </li>`).join("");
  }
  // ---------- cómo hace los tries el equipo: por puesto y por momento del partido ----------
  // (la planilla no dice de qué jugada vino cada try; sí la camiseta del que lo hizo y el minuto)
  const LINEAS = [["Primera línea", [1, 2, 3]], ["Segunda línea", [4, 5]], ["Tercera línea", [6, 7, 8]], ["Medios", [9, 10]],
    ["Centros", [12, 13]], ["Wings y fullback", [11, 14, 15]]];
  // algunas planillas cuentan el 2º tiempo desde 0 y otras desde 40
  const minutoDelPartido = (e) => (e.tiempo === "2T" && e.minuto != null && e.minuto <= 40 ? 40 + e.minuto : e.minuto);
  function renderTriesEquipo(ps) {
    const el = $("#tries-eq");
    const mids = new Set(ps.map((p) => p[11]).filter(Boolean));
    const t = EVENTOS.filter((e) => e.f === "o" && (e.tipo === 0 || e.tipo === 1) && e.cat === S.cat && mids.has(e.mid));
    if (!t.length) { el.hidden = true; return; }
    const fw = t.filter((e) => e.puesto && e.puesto <= 8).length, bk = t.filter((e) => e.puesto >= 9).length;
    const pc = (n) => `${Math.round((n / t.length) * 100)}%`;
    const lineas = LINEAS.map(([l, nums]) => [l, t.filter((e) => nums.includes(e.puesto)).length]);
    const max = Math.max(1, ...lineas.map((x) => x[1]));
    const t1 = t.filter((e) => e.tiempo === "1T").length, t2 = t.filter((e) => e.tiempo === "2T").length;
    const ult = t.filter((e) => e.tiempo === "2T" && minutoDelPartido(e) >= 70).length;
    const banco = t.filter((e) => e.banco).length, penal = t.filter((e) => e.tipo === 1).length;
    if (S.teAbierto == null) S.teAbierto = ESCRITORIO.matches;  // en la compu se ve abierto; en el celular, plegado
    el.open = S.teAbierto;
    el.hidden = false;
    el.innerHTML = `<summary><span>Cómo hace los tries</span><b class="num">${t.length}</b></summary>
      <div class="te__fb" aria-hidden="true"><i class="te__f" style="flex:${fw}"></i><i class="te__b" style="flex:${bk}"></i></div>
      <p class="te__ley"><span><i class="te__f"></i>Forwards <b>${fw}</b> (${pc(fw)})</span><span><i class="te__b"></i>Backs <b>${bk}</b> (${pc(bk)})</span></p>
      <ul class="te__lineas">${lineas.map(([l, n]) => `<li><span>${l}</span><span class="te__barra"><i style="width:${(n / max) * 100}%"></i></span><b class="num">${n}</b></li>`).join("")}</ul>
      <p class="te__dato">1er tiempo <b>${t1}</b> · 2do tiempo <b>${t2}</b> · últimos 10' <b>${ult}</b></p>
      <p class="te__dato">Desde el banco <b>${banco}</b>${penal ? ` · try penal <b>${penal}</b>` : ""}</p>`;
  }
  $("#tries-eq").addEventListener("toggle", (e) => { S.teAbierto = e.target.open; });

  function cambiarFuente(k) {
    S.fuente = k;
    if (!F().ordenes.includes(S.orden)) S.orden = F().def;
    S.tipo = null;
    montarChips();
    render();
  }

  $("#fuentes").addEventListener("click", (e) => {
    const b = e.target.closest("[data-fuente]"); if (!b || b.dataset.fuente === S.fuente) return;
    cambiarFuente(b.dataset.fuente); guardar(); alInicioDeLista();
  });
  $("#vistas").addEventListener("click", (e) => {
    const b = e.target.closest("[data-vista]"); if (!b || b.dataset.vista === S.vista) return;
    S.vista = b.dataset.vista; S.q = ""; render(); guardar();
  });
  $("#cats").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cat]"); if (!b) return;
    S.cat = +b.dataset.cat; render(); guardar(); alInicioDeLista();
  });
  $("#temp").addEventListener("change", (e) => { S.temp = e.target.value; refrescar(); guardar(); alInicioDeLista(); });
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-orden]"); if (!b) return;
    const enTabla = !!b.closest("#tabla");
    S.orden = b.dataset.orden; render(); guardar(); alInicioDeLista();
    // la tabla se rearma: el foco vuelve a la columna que se tocó
    if (enTabla) $(`#tabla [data-orden="${S.orden}"]`).focus();
  });
  document.addEventListener("change", (e) => {
    if (e.target.id !== "mas" || !e.target.value) return;
    S.orden = e.target.value; render(); guardar(); alInicioDeLista();
  });
  let tq;
  $("#q").addEventListener("input", (e) => {
    clearTimeout(tq);
    tq = setTimeout(() => { S.q = e.target.value.trim(); refrescar(); guardar(); alInicioDeLista(); }, 120);
  });

  // al cambiar un filtro estando abajo en la lista, volver al puesto 1
  const reducido = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  function alInicioDeLista() {
    const destino = $("#lista").getBoundingClientRect().top + scrollY - $(".filtros").offsetHeight;
    if (scrollY > destino + 1) scrollTo({ top: destino, behavior: reducido() ? "auto" : "smooth" });
  }
  $("#limpiar").addEventListener("click", () => { S.q = ""; $("#q").value = ""; refrescar(); guardar(); $("#q").focus(); });
  // "también aparece en otra categoría": pasa a esa categoría con la misma búsqueda
  $("#en-otras").addEventListener("click", (e) => {
    const b = e.target.closest("[data-ir-cat]"); if (!b) return;
    const pid = b.dataset.jOtra;
    S.cat = +b.dataset.irCat; render(); guardar(); alInicioDeLista();
    const card = document.querySelector(`#lista [data-j="${CSS.escape(pid)}"]`);
    if (card) card.focus();
  });

  $("#cards").addEventListener("click", (e) => { const b = e.target.closest("[data-j]"); if (b) abrir(b.dataset.j); });
  $("#records").addEventListener("click", (e) => { const b = e.target.closest("[data-j]"); if (b) abrir(b.dataset.j); });
  $("#tabla tbody").addEventListener("click", (e) => { const r = e.target.closest("[data-j]"); if (r) abrir(r.dataset.j); });

  $("#cerrar").addEventListener("click", cerrar);
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); cerrar(); });
  dlg.addEventListener("click", (e) => { if (e.target === dlg) cerrar(); });
  const enfocarPlanilla = (clave) => { const b = document.querySelector(`#ficha-cuerpo [data-planilla="${CSS.escape(clave)}"]`); if (b) b.focus(); };
  function abrirPlanilla(clave, mid, foco) {
    S.panel = { clave, mid, foco }; S.panelCompleta = false;
    renderFicha(); enfocarPlanilla(clave);
    if (!PLANILLAS.has(mid)) cargarPlanilla(mid).then(() => { if (S.panel && S.panel.clave === clave) { renderFicha(); enfocarPlanilla(clave); } });
  }
  $("#ficha-cuerpo").addEventListener("click", (e) => {
    const bp = e.target.closest("[data-planilla]");
    if (bp) {
      const clave = bp.dataset.planilla;
      if (abierto(clave)) { S.panel = null; S.panelCompleta = false; renderFicha(); enfocarPlanilla(clave); return; }
      abrirPlanilla(clave, bp.dataset.mid, bp.dataset.foco ? JSON.parse(bp.dataset.foco) : null);
      return;
    }
    const op = e.target.closest("[data-pl]");
    if (op && S.panel) {
      const { clave, mid } = S.panel, k = op.dataset.pl;
      if (k === "completa") { S.panelCompleta = !S.panelCompleta; renderFicha(); $('#ficha-cuerpo [data-pl="completa"]').focus(); }
      if (k === "reintentar") { PLANILLAS.delete(mid); abrirPlanilla(clave, mid, S.panel.foco); }
      if (k === "compartir") {
        const link = location.origin + location.pathname + `?cat=${SLUG[S.cat]}&j=${encodeURIComponent(S.jug)}&p=${encodeURIComponent(mid)}`;
        const txt = `Planilla oficial · ${NOMBRE(S.jug)} · ${CLUB.nombre}`;
        (navigator.share ? navigator.share({ title: txt, text: txt, url: link })
          : navigator.clipboard.writeText(link).then(() => aviso("Se copió el link de esta planilla")))
          .catch((er) => { if (er && er.name !== "AbortError") aviso("No se pudo compartir. Probá de nuevo."); });
      }
      return;
    }
    const t = e.target.closest("[data-tipo]");
    if (t) { S.tipo = t.dataset.tipo; S.verTodos = false; S.verRivales = false; renderFicha(); $(`#ficha-cuerpo [data-tipo="${S.tipo}"]`).focus(); return; }
    const a = e.target.closest("[data-accion]");
    if (a && a.dataset.accion === "partidos") {
      a.disabled = true; a.textContent = "Cargando sus partidos…";
      cargarParticipaciones()
        .then(() => { S.verPartidos = true; renderFicha(); const l = $("#sus-partidos .ver-planilla"); if (l) l.focus(); })
        .catch(() => { a.disabled = false; a.textContent = "No se pudo cargar. Tocá para probar de nuevo."; });
      return;
    }
    if (a && a.dataset.accion === "todos-partidos") {
      S.todosPartidos = !S.todosPartidos; renderFicha(); $('#ficha-cuerpo [data-accion="todos-partidos"]').focus(); return;
    }
    if (a) {
      const k = a.dataset.accion;
      if (k === "todos") S.verTodos = !S.verTodos; else S.verRivales = !S.verRivales;
      renderFicha(); $(`#ficha-cuerpo [data-accion="${k}"]`).focus(); return;
    }
    const c = e.target.closest("[data-ir-cat]");
    if (c) { S.cat = +c.dataset.irCat; S.tipo = null; render(); history.replaceState(history.state, "", url()); renderFicha(); $("#ficha-cuerpo").scrollTop = 0; $("#ficha-nombre").focus(); return; }
    const f = e.target.closest("[data-ir-fuente]");
    if (f) { cambiarFuente(f.dataset.irFuente); S.temp = "todas"; render(); history.replaceState(history.state, "", url()); renderFicha(); $("#ficha-cuerpo").scrollTop = 0; $("#ficha-nombre").focus(); }
  });

  // deslizar hacia abajo desde el encabezado de la hoja para cerrarla (celular)
  function deslizable(d, alCerrar) {
    const top = d.querySelector(".ficha__top"), hoja = d.querySelector(".ficha__hoja");
    let y0 = null;
    const soltar = () => { y0 = null; hoja.style.transform = ""; };
    top.addEventListener("touchstart", (e) => { y0 = e.touches[0].clientY; }, { passive: true });
    top.addEventListener("touchmove", (e) => {
      if (y0 == null) return;
      hoja.style.transform = `translateY(${Math.max(0, e.touches[0].clientY - y0)}px)`;
    }, { passive: true });
    top.addEventListener("touchend", (e) => {
      if (y0 == null) return;
      const dy = e.changedTouches[0].clientY - y0;
      soltar();
      if (dy > 90) alCerrar();
    });
    top.addEventListener("touchcancel", soltar);
  }
  deslizable(dlg, cerrar);

  window.addEventListener("popstate", () => {
    if (como.open && !(history.state && history.state.como)) como.close();
    const antes = estado(), pid = S.jug;
    leerURL();
    if (estado() !== antes) render();  // si solo se cerró la ficha, la lista queda igual (y el foco vuelve solo)
    if (S.jug) mostrarFicha(); else if (dlg.open) { dlg.close(); volverA(pid); }
  });

  // alto de la barra de filtros: el encabezado de la tabla queda pegado debajo, y lo enfocado no queda tapado por ella
  const filtros = $(".filtros");
  new ResizeObserver(() => document.documentElement.style.setProperty("--alto-filtros", filtros.offsetHeight + "px")).observe(filtros);
  // al pasar de celular a compu (o al revés) se arma la otra vista de la lista
  ESCRITORIO.addEventListener("change", () => { if (S.vista === "jugadores") renderLista(); });

  // ---------- ¿Cómo se cuenta? ----------
  const como = $("#como");
  function abrirComo() {
    const of = rangoTxt(FUENTES.oficial.rango), di = FUENTES.diarios ? rangoTxt(FUENTES.diarios.rango) : "";
    const items = [
      ["¿Qué cuenta como partido?", "Si fue titular o entró desde el banco. Si estuvo en el banco y no entró, no cuenta."],
      ["¿Por qué no aparece el último partido?", `La página se actualiza sola los lunes, martes y miércoles a la mañana (última vez: ${D.actualizado}). ` +
        "Si falta un partido, es porque su planilla todavía no se cargó en la UAR."],
      ["¿Y si veo un error?", "Avisale al club. A veces la planilla se carga mal ese día (por ejemplo, una patada a nombre de otro jugador). " +
        "El club lo revisa y se corrige solo en la próxima actualización."],
      ["¿Cómo compruebo un dato?", "En la ficha de cada jugador, cada partido y cada punto tiene el botón \"Planilla\": muestra ahí mismo " +
        "lo que dice la planilla oficial de la UAR de ese partido. Si algo se corrigió con el club, lo dice."],
      ["¿De dónde salen los datos?", `De las planillas oficiales que se cargan después de cada partido en la base de datos de la UAR (${of}).` +
        (di ? ` Los de ${di} salen de notas de El Eco de Tandil: no son oficiales y solo están los partidos que se publicaron.` : "") +
        " Se muestran sin documentos ni datos personales, y de los rivales no se muestran nombres."],
      ["¿Qué son los récords?", `Los mejores números con datos oficiales, desde ${ANIO_INICIO}. El Club de los ${CIEN} son los que jugaron ${CIEN} partidos o más ` +
        `en una categoría. "Primer partido registrado" es el primero desde ${ANIO_INICIO}: puede haber jugado antes.`],
      ["¿Qué categorías están?", `${enumerar(CATS)}. Las juveniles no se muestran porque son menores de edad.`],
      ["¿Cuánto vale cada cosa?", "Try 5 puntos, try penal 7, conversión 2, penal 3 y drop 3. Los puntos de cada jugador son los que figuran en la planilla."],
    ];
    $("#como-lista").innerHTML = items.map(([q, a]) => `<dt>${esc(q)}</dt><dd>${esc(a)}</dd>`).join("");
    history.pushState({ como: true }, "", location.href);  // el botón "atrás" del celular la cierra
    como.showModal();
    $("#como-titulo").focus();
    como.querySelector(".ficha__cuerpo").scrollTop = 0;
  }
  const cerrarComo = () => { if (history.state && history.state.como) history.back(); else como.close(); };
  document.addEventListener("click", (e) => { if (e.target.closest("[data-como]")) abrirComo(); });
  $("#cerrar-como").addEventListener("click", cerrarComo);
  como.addEventListener("cancel", (e) => { e.preventDefault(); cerrarComo(); });
  como.addEventListener("click", (e) => { if (e.target === como) cerrarComo(); });
  deslizable(como, cerrarComo);

  // ---------- inicio ----------
  $("#actualizado").textContent = D.actualizado;
  // arriba: cuándo se actualizó (para saber si los datos están al día)
  $("#act-top").textContent = `actualizado el ${D.actualizado.slice(0, 5)}`;
  leerURL();
  montarFuentes();
  montarChips();
  render();
  if (S.jug) {
    history.replaceState({}, "", url(null)); history.pushState({ ficha: true }, "", url()); mostrarFicha();
    const mid = S.panelInicial;
    if (mid && S.fuente === "oficial") {
      Promise.all([cargarParticipaciones().catch(() => {}), cargarPlanilla(mid)]).then(() => {
        S.verPartidos = true; S.todosPartidos = true;
        abrirPlanilla(`p:${mid}`, mid, null);
        const pan = document.querySelector("#ficha-cuerpo .pl-fila");
        if (pan) pan.scrollIntoView({ block: "start" });
      });
    }
  }
})();
