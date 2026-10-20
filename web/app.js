/* Los 50 · Estadísticas — datos en window.DATA (generado por exportar_web.py)
   Tres fuentes: "oficial" (base de datos UAR), "diarios" (El Eco de Tandil, parcial) y "todo" (la suma). */
(() => {
  "use strict";
  const D = window.DATA;
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
  const EVENTOS = D.puntos.map((p) => ({ pid: p[0], anio: p[1], cat: p[2], fecha: p[3], rival: p[4], torneo: p[5], tiempo: p[6], minuto: p[7], tipo: p[8], cant: 1, url: null, f: "o" }))
    .concat(DD ? DD.puntos.map((p) => ({ pid: p[0], anio: p[1], cat: p[2], fecha: p[3], rival: p[4], torneo: p[5], tiempo: null, minuto: null, tipo: p[6], cant: p[7], url: DD.urls[p[8]], f: "d" })) : []);
  const NOMBRE = (pid) => D.jugadores[pid] || (DD && DD.jugadores[pid]) || null;
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
  const S = { fuente: "oficial", vista: "jugadores", cat: 0, temp: "todas", orden: "pj", q: "", jug: null, tipo: null, verTodos: false, verRivales: false };
  const F = () => FUENTES[S.fuente];

  function leerURL() {
    const p = new URLSearchParams(location.search);
    S.fuente = FUENTES[p.get("fuente")] ? p.get("fuente") : "oficial";
    S.vista = p.get("vista") === "resultados" ? "resultados" : "jugadores";
    const c = SLUG.indexOf(p.get("cat"));
    S.cat = c >= 0 ? c : 0;
    S.temp = /^\d{4}$/.test(p.get("temp") || "") ? p.get("temp") : "todas";
    S.orden = F().ordenes.includes(p.get("orden")) ? p.get("orden") : F().def;
    S.q = p.get("q") || "";
    S.jug = p.get("j") && NOMBRE(p.get("j")) ? p.get("j") : null;
  }
  function url(conJug = S.jug) {
    const p = new URLSearchParams();
    if (S.fuente !== "oficial") p.set("fuente", S.fuente);
    if (S.vista !== "jugadores") p.set("vista", S.vista);
    if (S.cat) p.set("cat", SLUG[S.cat]);
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

  function agregar(cat, temp, fs = F().f) {
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
  function renderFuentes() {
    $("#fuentes").innerHTML = Object.values(FUENTES).map((Fu) =>
      `<button type="button" data-fuente="${Fu.k}" aria-pressed="${Fu.k === S.fuente}">
        <b>${esc(Fu.lbl)}</b><small>${esc(rangoTxt(Fu.rango))}</small></button>`).join("");
    document.body.dataset.fuente = S.fuente;
    $("#rango").textContent = `${rangoTxt(F().rango)} · ${F().sub}`;
  }

  function renderFiltros() {
    renderFuentes();
    $("#cats").innerHTML = CATS.map((c, i) =>
      `<button type="button" data-cat="${i}" aria-pressed="${i === S.cat}">${esc(c)}</button>`).join("");

    const anios = aniosDe(S.cat);
    if (S.temp !== "todas" && !anios.includes(+S.temp)) S.temp = "todas";
    $("#temp").innerHTML = `<option value="todas">Todas</option>` +
      anios.map((a) => `<option value="${a}"${String(a) === S.temp ? " selected" : ""}>${a}</option>`).join("");

    // celular: 3 principales + "Más"; en pantallas grandes se ven todos los botones (CSS)
    const { ordenes, principales } = F();
    const esSec = !principales.includes(S.orden);
    $("#chips").innerHTML = ordenes.map((k) =>
      `<button type="button" data-orden="${k}"${principales.includes(k) ? "" : ' class="sec"'} aria-pressed="${k === S.orden}">${esc(etiqueta(k))}</button>`).join("") +
      `<label class="orden-mas${esSec ? " activo" : ""}"><span class="sr">Más formas de ordenar</span><select id="mas">
        <option value="" disabled${esSec ? "" : " selected"}>Más</option>
        ${ordenes.filter((k) => !principales.includes(k)).map((k) =>
          `<option value="${k}"${k === S.orden ? " selected" : ""}>${esc(etiqueta(k))}</option>`).join("")}
      </select></label>`;
    if ($("#q").value !== S.q) $("#q").value = S.q;
    const res = S.vista === "resultados";
    $(".orden").hidden = res;
    $("#q").placeholder = res ? "Buscar rival" : "Buscar jugador";
    $("#vistas").innerHTML = [["jugadores", "Jugadores"], ["resultados", "Resultados del equipo"]].map(([k, l]) =>
      `<button type="button" data-vista="${k}" aria-pressed="${k === S.vista}">${l}</button>`).join("");
    $("#lista").classList.toggle("vista-resultados", res);

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

  function renderLista() {
    const todos = ranking(agregar(S.cat, S.temp), S.orden);
    const toks = norm(S.q).split(/\s+/).filter(Boolean);
    const lista = toks.length ? todos.filter((j) => { const n = norm(j.nombre); return toks.every((t) => n.includes(t)); }) : todos;
    const o = ORD[S.orden];
    const tempTxt = S.temp === "todas" ? "todas las temporadas" : `temporada ${S.temp}`;

    $("#resumen").textContent = toks.length
      ? `${lista.length} de ${todos.length} jugadores · ${CATS[S.cat]} · ${tempTxt}`
      : `${todos.length} jugadores · ${CATS[S.cat]} · ${tempTxt} · ordenado por ${etiqueta(S.orden).toLowerCase()}`;
    $("#vacio").hidden = lista.length > 0;
    if (!lista.length) $("#vacio-txt").textContent = toks.length
      ? `Nadie con “${S.q}” en ${CATS[S.cat]}` + (S.temp === "todas" ? "." : ` en ${S.temp}. Probá con la temporada “Todas” u otra categoría.`)
      : S.fuente === "diarios" && DD.resultados_por_categoria && DD.resultados_por_categoria[S.cat]
        ? `El diario publicó ${DD.resultados_por_categoria[S.cat]} resultados de ${CATS[S.cat]}, pero sin nombrar a los jugadores.`
        : `No hay datos de ${CATS[S.cat]} en esta fuente${S.temp === "todas" ? "" : " para " + S.temp}.`;
    $("#limpiar").hidden = !toks.length;

    // celular / tablet: tarjetas
    $("#cards").innerHTML = lista.map((j) => `
      <li><button type="button" class="card" data-j="${esc(j.pid)}">
        <span class="pos${j.pos <= 3 ? " top3" : ""}${j.pos === 1 ? " top1" : ""}" aria-label="Puesto ${j.pos}">${j.pos}</span>
        <span><span class="card__nombre">${nombreHTML(j.nombre)}</span><span class="card__sub">${subtexto(j)}</span></span>
        <span class="card__dato"><strong class="num">${j[S.orden]}</strong><span>${esc(plural(j[S.orden], o.u))}</span></span>
      </button></li>`).join("");

    // escritorio: tabla
    const cols = F().tabla;
    $("#tabla thead").innerHTML = `<tr><th class="izq" scope="col">#</th><th class="izq" scope="col">Jugador</th>` +
      cols.map((k) => `<th scope="col"${k === S.orden ? ' aria-sort="descending"' : ""}>
        <button type="button" data-orden="${k}" title="Ordenar por ${esc(etiqueta(k))}">${esc(ORD[k].corto)}</button></th>`).join("") + `</tr>`;
    $("#tabla tbody").innerHTML = lista.map((j) => `
      <tr tabindex="0" data-j="${esc(j.pid)}">
        <td class="izq"><span class="pos${j.pos <= 3 ? " top3" : ""}${j.pos === 1 ? " top1" : ""}">${j.pos}</span></td>
        <td class="izq jug">${nombreHTML(j.nombre)}</td>
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

  function renderFicha() {
    const pid = S.jug;
    const j = datosJugador(pid, S.cat, S.temp);
    const [ap, no] = partes(NOMBRE(pid));
    $("#ficha-nombre").innerHTML = `${esc(ap)}${no ? `<small>${esc(no)}</small>` : ""}`;
    const etq = `<span class="etq">${esc(CATS[S.cat])}</span>${S.fuente !== "oficial" ? `<span class="etq etq--fuente">${esc(F().lbl)}</span>` : ""}`;

    if (!j) {
      $("#ficha-meta").innerHTML = etq + (S.temp === "todas" ? "" : "Temporada " + esc(S.temp));
      $("#ficha-cuerpo").innerHTML = `<p>No tiene datos en ${esc(CATS[S.cat])}${S.temp === "todas" ? "" : " en " + esc(S.temp)} en esta fuente.</p>` + otrasCats(pid) + otrasFuentes(pid);
      return;
    }
    const anios = [...j.anios].sort();
    $("#ficha-meta").innerHTML = etq +
      (S.temp === "todas" ? `${j.temporadas} ${plural(j.temporadas, ORD.temporadas.u)} · ${rangoTxt([anios[0], anios[anios.length - 1]])}` : `Temporada ${esc(S.temp)}`);

    const grande = (k, lbl) => `<div class="grande"><strong class="num">${j[k]}</strong><span>${lbl}</span></div>`;
    let h;
    if (S.fuente === "oficial") {
      h = `<div class="grandes">${grande("pj", "Partidos")}${grande("tries", "Tries")}${grande("puntos", "Puntos")}</div>
        <div class="bloque"><h3>Detalle</h3><dl class="datos">
          ${fila("De titular", j.pj - j.banco)}${fila("Desde el banco", j.banco)}${fila("Sin entrar", j.sin)}${fila("Temporadas", j.temporadas)}
          ${fila("Conversiones", j.conversiones)}${fila("Penales", j.penales)}${fila("Drops", j.drops)}
          ${fila(tarjAm, j.amarillas)}${fila(tarjRo, j.rojas)}</dl></div>`;
    } else if (S.fuente === "diarios") {
      h = `<div class="grandes">${grande("pj", "Partidos")}${grande("tries", "Tries")}${grande("puntos", "Puntos")}</div>
        <div class="bloque"><h3>Detalle</h3><dl class="datos">
          ${fila("Titular (formación)", j.form_tit)}${fila("Ingresó (formación)", j.form_ing)}${fila("Temporadas", j.temporadas)}
          ${fila("Conversiones", j.conversiones)}${fila("Penales", j.penales)}${fila("Drops", j.drops)}</dl>
          <p class="nota-ficha">Según notas de El Eco de Tandil. <b>Partidos confirmados</b>: aparece en una formación publicada o hizo puntos; jugó por lo menos esos partidos.</p></div>`;
    } else {
      const o = datosJugador(pid, S.cat, S.temp, ["o"]) || {}, d = datosJugador(pid, S.cat, S.temp, ["d"]) || {};
      const fl = (lbl, k) => `<tr><th scope="row">${lbl}</th><td>${o[k] ?? 0}</td><td>${d[k] ?? 0}</td><td><b>${j[k]}</b></td></tr>`;
      h = `<div class="grandes">${grande("pj", "Partidos")}${grande("tries", "Tries")}${grande("puntos", "Puntos")}</div>
        <div class="bloque"><h3>De dónde sale cada número</h3>
          <table class="anios desglose"><thead><tr><th scope="col"></th><th scope="col">Oficial</th><th scope="col">Diarios</th><th scope="col">Total</th></tr></thead>
          <tbody>${fl("Partidos", "pj")}${fl("Tries", "tries")}${fl("Conversiones", "conversiones")}${fl("Penales", "penales")}${fl("Drops", "drops")}${fl("Puntos", "puntos")}
            <tr><th scope="row">Temporadas</th><td>${o.temporadas ?? 0}</td><td>${d.temporadas ?? 0}</td><td><b>${j.temporadas}</b></td></tr></tbody></table>
          <p class="nota-ficha">Partidos de diarios = confirmados (mínimo). Banco y tarjetas: solo oficiales.</p>
          <dl class="datos" style="margin-top:8px">${fila("Desde el banco", j.banco)}
            ${fila(tarjAm, j.amarillas)}${fila(tarjRo, j.rojas)}</dl></div>`;
    }
    h += bloquePuntos(pid, j);
    if (S.temp === "todas" && anios.length > 1) h += anioAnio(pid);
    h += otrasCats(pid) + otrasFuentes(pid);
    $("#ficha-cuerpo").innerHTML = h;
  }

  function bloquePuntos(pid, j) {
    const disp = TIPOS.filter((t) => j[t.k] > 0);
    if (!disp.length) return `<div class="bloque"><h3>Sus puntos</h3><p>No ${S.fuente === "diarios" ? "figura que haya anotado" : "anotó puntos"} ${S.temp === "todas" ? "en esta categoría" : "en esta temporada"}.</p></div>`;
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
    const derecha = (p) => p.f === "d"
      ? `<a class="ev-nota" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" aria-label="Ver la nota del diario">nota ↗</a>`
      : `<span class="ev-min">${esc(p.tiempo)}${p.minuto != null ? " " + p.minuto + "'" : ""}</span>`;

    return `<div class="bloque"><h3>Sus puntos</h3>
      ${disp.length > 1 ? `<div class="tipos" role="group" aria-label="Tipo de punto">${disp.map((t) =>
        `<button type="button" data-tipo="${t.k}" aria-pressed="${t.k === tipo.k}">${esc(t.lbl)} (${j[t.k]})</button>`).join("")}</div>` : ""}
      ${rivales.length ? `<h3 class="sub">${quien}</h3>
      <ul class="barras">${verR.map(([r, n]) => `
        <li><div class="barra"><i style="width:${Math.max(6, (n / max) * 100)}%"></i><span>${esc(D.rivales[r])}</span></div><b>${n}</b></li>`).join("")}
      </ul>
      ${rivales.length > 6 ? `<button type="button" class="btn mas" data-accion="rivales">${S.verRivales ? "Ver menos" : `Ver los ${rivales.length} rivales`}</button>` : ""}
      <h3 class="sub" style="margin-top:18px">Partido por partido</h3>
      <ul class="eventos">${verE.map((p) => `
        <li><span class="ev-fecha">${fecha(p.fecha)}${p.fecha ? "" : ` <small>${p.anio}</small>`}</span>
          <span><span class="ev-rival">${esc(D.rivales[p.rival])}</span>${p.cant > 1 ? ` <b class="ev-cant">×${p.cant}</b>` : ""}${p.tipo === 1 ? ' <span class="ev-tag">try penal</span>' : ""}${S.fuente === "todo" && p.f === "d" ? ' <span class="ev-tag ev-tag--diario">diario</span>' : ""}
            ${p.torneo >= 0 && D.torneos[p.torneo] ? `<span class="ev-torneo">${esc(D.torneos[p.torneo])}</span>` : ""}</span>
          ${derecha(p)}</li>`).join("")}
      </ul>
      ${ev.length > 8 ? `<button type="button" class="btn mas" data-accion="todos">${S.verTodos ? "Ver menos" : `Ver todos (${ev.length})`}</button>` : ""}`
      : `<p class="nota-ficha">Hay ${j[tipo.k]} ${tipo.lbl.toLowerCase()} sin detalle de partido.</p>`}
    </div>`;
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
        ${cols.map(([k]) => `<td>${a[k]}</td>`).join("")}</tr>`).join("")}</tbody>
    </table></div>`;
  }

  function otrasCats(pid) {
    const otras = CATS.map((c, i) => [i, datosJugador(pid, i, S.temp)]).filter(([i, d]) => i !== S.cat && d);
    if (!otras.length) return "";
    const txt = (d) => `${d.pj} PJ`;
    return `<div class="bloque"><h3>También jugó en</h3><div class="otras">${otras.map(([i, d]) =>
      `<button type="button" data-ir-cat="${i}">${esc(CATS[i])} · ${txt(d)}</button>`).join("")}</div></div>`;
  }

  function otrasFuentes(pid) {
    const otras = Object.values(FUENTES).filter((Fu) => Fu.k !== S.fuente && Fu.k !== "todo" && datosJugador(pid, S.cat, "todas", Fu.f));
    if (!otras.length) return "";
    return `<div class="bloque"><h3>También tiene datos en</h3><div class="otras">${otras.map((Fu) =>
      `<button type="button" data-ir-fuente="${Fu.k}">${esc(Fu.lbl)} · ${esc(rangoTxt(Fu.rango))}</button>`).join("")}
      ${S.fuente !== "todo" && FUENTES.todo ? `<button type="button" data-ir-fuente="todo">Ver todo junto</button>` : ""}</div></div>`;
  }

  // ---------- abrir / cerrar ficha ----------
  const dlg = $("#ficha");
  function abrir(pid) {
    S.jug = pid; S.tipo = null; S.verTodos = false; S.verRivales = false;
    history.pushState({ ficha: true }, "", url());
    mostrarFicha();
  }
  function mostrarFicha() {
    renderFicha();
    if (!dlg.open) dlg.showModal();
    $("#ficha-cuerpo").scrollTop = 0;
  }
  function cerrar() {
    if (history.state && history.state.ficha) history.back();
    else { S.jug = null; guardar(); if (dlg.open) dlg.close(); }
  }

  // ---------- eventos ----------
  function render() { renderFiltros(); refrescar(); }
  function refrescar() {
    const res = S.vista === "resultados";
    $("#resultados").hidden = !res;
    $("#balance").hidden = !res;
    (res ? renderResultados : renderLista)();
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
    const tempTxt = S.temp === "todas" ? "todas las temporadas" : `temporada ${S.temp}`;
    $("#resumen").textContent = `${toks.length ? `${ps.length} de ${total}` : ps.length} partidos · ${CATS[S.cat]} · ${tempTxt}`;
    $("#balance").innerHTML = ps.length ? `
      <div class="bal bal--G"><strong class="num">${g}</strong><span>Ganados</span></div>
      <div class="bal bal--E"><strong class="num">${e}</strong><span>Empatados</span></div>
      <div class="bal bal--P"><strong class="num">${per}</strong><span>Perdidos</span></div>
      <div class="bal"><strong class="num">${pf}–${pc}</strong><span>Tantos</span></div>` : "";
    $("#vacio").hidden = ps.length > 0;
    $("#limpiar").hidden = !toks.length;
    if (!ps.length) $("#vacio-txt").textContent = toks.length ? `No hay partidos contra “${S.q}” en ${CATS[S.cat]}.`
      : `No hay resultados de ${CATS[S.cat]} en esta fuente${S.temp === "todas" ? "" : " para " + S.temp}.`;
    const letra = (p) => (p[6] > p[7] ? "G" : p[6] === p[7] ? "E" : "P");
    $("#resultados").innerHTML = ps.map((p) => `
      <li class="res">
        <span class="res__fecha">${fecha(p[2])}${p[2] ? "" : `<small>${p[0]}</small>`}<small>${p[5] === "L" ? "Local" : p[5] === "V" ? "Visitante" : ""}</small></span>
        <span class="res__cuerpo"><span class="res__rival">${esc(D.rivales[p[3]])}${S.fuente === "todo" && p[8] === "d" ? ' <span class="ev-tag ev-tag--diario">diario</span>' : ""}</span>
          <span class="res__torneo">${p[4] >= 0 && D.torneos[p[4]] ? esc(D.torneos[p[4]]) : ""}${p[10] ? " · categoría supuesta" : ""}</span>
          ${p[8] === "d" && p[9] >= 0 ? `<a class="ev-nota" href="${esc(DD.urls[p[9]])}" target="_blank" rel="noopener noreferrer">nota ↗</a>` : ""}</span>
        <span class="res__marcador res--${letra(p)}"><b class="num">${p[6]}–${p[7]}</b><i>${letra(p)}</i></span>
      </li>`).join("");
  }
  function cambiarFuente(k) {
    S.fuente = k;
    if (!F().ordenes.includes(S.orden)) S.orden = F().def;
    S.tipo = null;
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
    S.orden = b.dataset.orden; render(); guardar(); alInicioDeLista();
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

  $("#cards").addEventListener("click", (e) => { const b = e.target.closest("[data-j]"); if (b) abrir(b.dataset.j); });
  $("#tabla tbody").addEventListener("click", (e) => { const r = e.target.closest("[data-j]"); if (r) abrir(r.dataset.j); });
  $("#tabla tbody").addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const r = e.target.closest("[data-j]"); if (r) { e.preventDefault(); abrir(r.dataset.j); }
  });

  $("#cerrar").addEventListener("click", cerrar);
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); cerrar(); });
  dlg.addEventListener("click", (e) => { if (e.target === dlg) cerrar(); });
  $("#ficha-cuerpo").addEventListener("click", (e) => {
    const t = e.target.closest("[data-tipo]");
    if (t) { S.tipo = t.dataset.tipo; S.verTodos = false; S.verRivales = false; renderFicha(); return; }
    const a = e.target.closest("[data-accion]");
    if (a) { if (a.dataset.accion === "todos") S.verTodos = !S.verTodos; else S.verRivales = !S.verRivales; renderFicha(); return; }
    const c = e.target.closest("[data-ir-cat]");
    if (c) { S.cat = +c.dataset.irCat; S.tipo = null; render(); history.replaceState(history.state, "", url()); renderFicha(); $("#ficha-cuerpo").scrollTop = 0; return; }
    const f = e.target.closest("[data-ir-fuente]");
    if (f) { cambiarFuente(f.dataset.irFuente); S.temp = "todas"; render(); history.replaceState(history.state, "", url()); renderFicha(); $("#ficha-cuerpo").scrollTop = 0; }
  });

  // deslizar hacia abajo para cerrar (celular)
  let y0 = null;
  const hoja = $(".ficha__hoja");
  $(".ficha__top").addEventListener("touchstart", (e) => { y0 = e.touches[0].clientY; }, { passive: true });
  $(".ficha__top").addEventListener("touchmove", (e) => {
    if (y0 == null) return;
    const dy = Math.max(0, e.touches[0].clientY - y0);
    hoja.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  $(".ficha__top").addEventListener("touchend", (e) => {
    if (y0 == null) return;
    const dy = e.changedTouches[0].clientY - y0;
    y0 = null; hoja.style.transform = "";
    if (dy > 90) cerrar();
  });

  window.addEventListener("popstate", () => {
    leerURL(); render();
    if (S.jug) mostrarFicha(); else if (dlg.open) dlg.close();
  });

  // alto de la barra de filtros, para que el encabezado de la tabla quede pegado debajo
  const filtros = $(".filtros");
  new ResizeObserver(() => document.documentElement.style.setProperty("--alto-filtros", filtros.offsetHeight + "px")).observe(filtros);

  // ---------- inicio ----------
  $("#actualizado").textContent = D.actualizado;
  // arriba: cuándo se actualizó y cuál es el último partido oficial cargado (para saber si los datos están al día)
  const ultimo = D.partidos.filter((p) => p[8] === "o" && p[2]).sort((a, b) => b[2].localeCompare(a[2]))[0];
  $("#act-top").textContent = `Actualizado el ${D.actualizado}` + (ultimo ? ` · último partido: ${fecha(ultimo[2])}` : "");
  leerURL();
  render();
  if (S.jug) { history.replaceState({}, "", url(null)); history.pushState({ ficha: true }, "", url()); mostrarFicha(); }
})();
