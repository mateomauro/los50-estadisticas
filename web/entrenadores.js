/* Los 50 · Entrenadores — los datos vienen cifrados en window.ENTRENADORES (exportar_entrenadores.py).
   Se abren con la clave (PBKDF2 + AES-GCM, WebCrypto). Pantallas: elegir categoría, la categoría (5 preguntas), Todo el club y Consejos. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const deB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const aB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const SOBRE = window.ENTRENADORES;
  const LLAVE = "los50-ent-llave";

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
  function guardar(raw, siempre) {
    try { (siempre ? localStorage : sessionStorage).setItem(LLAVE, raw); } catch (e) { /* sin almacenamiento: pide la clave cada vez */ }
  }
  function olvidar() { try { localStorage.removeItem(LLAVE); sessionStorage.removeItem(LLAVE); } catch (e) { /* nada */ } }

  async function intentarGuardada() {
    const raw = guardada();
    if (!raw || !SOBRE) return false;
    try {
      const llave = await crypto.subtle.importKey("raw", deB64(raw), "AES-GCM", true, ["decrypt"]);
      iniciar(await descifrar(llave));
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
      guardar(aB64(await crypto.subtle.exportKey("raw", llave)), $("#recordar").checked);
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
  const IC = {
    atras: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
    adelante: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    alerta: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.4v.1"/></svg>',
    bien: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12.4l2.8 2.8L16.2 9.8"/></svg>',
    medir: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4.5" width="14" height="16" rx="2"/><path d="M9 4.5h6V7H9zM9 12h6M9 16h4"/></svg>',
    gente: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.4 3-5.4 6-5.4s5.4 2 6 5.4"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14.7c2.3.2 4 1.9 4.5 4.6"/></svg>',
    idea: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg>',
  };

  function iniciar(datos) {
    const t = (k) => obj(datos[k]);
    D = {
      cats: datos.categorias, act: datos.actualizado,
      res: t("resumen"), torneos: t("torneos"), rivales: t("rivales"), ret: t("retencion"),
      camino: t("camino"), era: t("edad_relativa"), fis: t("fisico"), partidos: t("partidos"), jug: t("jugadores"), noSig: t("no_siguieron"),
      diag: datos.diag_web, expertos: datos.expertos, medir: datos.a_medir, fuentes: datos.fuentes, glosario: datos.glosario,
    };
    const anios = D.res.map((r) => r["Año"]);
    D.desde = Math.min(...anios); D.hasta = Math.max(...anios);
    $("#sub").textContent = `Planillas oficiales UAR · ${D.desde}–${D.hasta}`;
    $("#actualizado").textContent = D.act;
    $("#candado").hidden = true;
    $("#app").hidden = false;
    S = { ver: "inicio", cat: null, temp: null, ordenJ: "pj", verJ: false, verP: false, verN: false, abiertos: new Set() };
    leerURL();
    render();
    addEventListener("popstate", () => { leerURL(); render(); });
  }

  // ---------- URL: ?cat=m17&temp=2026 · ?ver=club · ?ver=consejos ----------
  function leerURL() {
    const p = new URLSearchParams(location.search);
    const c = D.cats.find((x) => slug(x) === p.get("cat"));
    S.cat = c || null;
    S.ver = c ? "cat" : ["club", "consejos"].includes(p.get("ver")) ? p.get("ver") : "inicio";
    S.temp = /^\d{4}$/.test(p.get("temp") || "") ? +p.get("temp") : null;
  }
  function url() {
    const p = new URLSearchParams();
    if (S.ver === "cat") { p.set("cat", slug(S.cat)); if (S.temp) p.set("temp", S.temp); }
    else if (S.ver !== "inicio") p.set("ver", S.ver);
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
  const resultadoTxt = (r) => [`ganó ${r.G}`, r.E ? `empató ${r.E}` : "", `perdió ${r.P}`].filter(Boolean).join(", ");

  // ---------- gráficos (SVG, sin librerías) ----------
  /** barras por año; la del año elegido en azul y una línea punteada con el promedio de todos los años */
  function barras(datos, { sel, tipo = "d", promedio = null, alto = 160 } = {}) {
    // con promedio se deja lugar a la derecha para escribirlo en la punta de la línea punteada
    // el ancho del dibujo es el ancho real en pantalla: así los números se ven del mismo tamaño en celular y en compu
    const n = datos.length, W = anchoGraf(), padR = promedio != null ? 74 : 0, Wb = W - padR, padT = 24, padB = 24, H = W > 600 ? alto + 40 : alto;
    const vals = datos.map((d) => d.y ?? 0).concat(promedio ?? 0), max = Math.max(1, ...vals), min = Math.min(0, ...vals);
    const y = (v) => padT + ((max - v) / (max - min || 1)) * (H - padT - padB);
    const ancho = Wb / n, bw = Math.min(30, ancho * 0.6);
    let h = `<svg class="graf" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(datos.map((d) => `${d.x}: ${fmt(d.y, tipo)}`).join(", "))}${promedio != null ? `. Promedio: ${fmt(promedio, tipo)}` : ""}">`;
    h += `<line class="graf__cero" x1="0" x2="${Wb}" y1="${y(0)}" y2="${y(0)}"/>`;
    if (promedio != null) {
      const yp = y(promedio);
      h += `<line class="graf__prom" x1="0" x2="${Wb + 6}" y1="${yp}" y2="${yp}"/>`;
      h += `<text class="graf__prom-lbl" x="${Wb + 12}" y="${yp - 3}">Promedio</text><text class="graf__prom-n" x="${Wb + 12}" y="${yp + 14}">${esc(fmt(promedio, tipo))}</text>`;
    }
    datos.forEach((d, i) => {
      const cx = ancho * i + ancho / 2, v = d.y, s = d.x === sel ? " sel" : "";
      if (v != null) {
        const y0 = y(Math.max(0, v)), y1 = y(Math.min(0, v));
        h += `<rect class="graf__barra${s}" x="${cx - bw / 2}" y="${y0}" width="${bw}" height="${Math.max(2, y1 - y0)}" rx="4"/>`;
        h += `<text class="graf__val${s}" x="${cx}" y="${y0 - 7}">${esc(fmt(v, tipo))}</text>`;
      }
      h += `<text class="graf__x${s}" x="${cx}" y="${H - 6}">${d.x}</text>`;
    });
    return h + "</svg>";
  }
  const anchoGraf = () => Math.round(Math.max(280, Math.min(820, $("#vista").clientWidth - 32) - 18));

  /** puntos por partido: dos barras por año (azul = los que hace, roja = los que le hacen), siempre los mismos dos colores.
      El año elegido va con un fondo gris detrás; las líneas punteadas son los promedios de todos los años. */
  function barrasDobles(datos, { sel } = {}) {
    const n = datos.length, W = anchoGraf(), padT = 26, padB = 26, H = W > 600 ? 220 : 190;
    const pa = prom(datos.map((d) => d.a)), pb = prom(datos.map((d) => d.b));
    const max = Math.max(1, ...datos.flatMap((d) => [d.a ?? 0, d.b ?? 0]));
    const y = (v) => padT + ((max - v) / max) * (H - padT - padB);
    const ancho = W / n, bw = Math.min(20, ancho * 0.34), dec = ancho >= 60;
    const num = (v) => (dec ? fmt(v, "d") : String(Math.round(v)));
    let h = `<svg class="graf" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(datos.map((d) => `${d.x}: hace ${fmt(d.a, "d")}, le hacen ${fmt(d.b, "d")}`).join("; "))}. Promedios: hace ${fmt(pa, "d")}, le hacen ${fmt(pb, "d")}">`;
    datos.forEach((d, i) => { if (d.x === sel) h += `<rect class="graf__banda" x="${ancho * i + 2}" y="4" width="${ancho - 4}" height="${H - 8}" rx="8"/>`; });
    h += `<line class="graf__cero" x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}"/>`;
    datos.forEach((d, i) => {
      const cx = ancho * i + ancho / 2, s = d.x === sel ? " sel" : "";
      [[d.a, "a", cx - bw / 2 - 1], [d.b, "b", cx + bw / 2 + 1]].forEach(([v, k, x]) => {
        if (v == null) return;
        h += `<rect class="graf__${k}" x="${x - bw / 2}" y="${y(v)}" width="${bw}" height="${Math.max(2, y(0) - y(v))}" rx="3"/>`;
        h += `<text class="graf__val graf__val--chico${s}" x="${x}" y="${y(v) - 5}">${esc(num(v))}</text>`;
      });
      h += `<text class="graf__x${s}" x="${cx}" y="${H - 8}">${d.x}</text>`;
    });
    h += `<line class="graf__prom graf__prom--a" x1="0" x2="${W}" y1="${y(pa)}" y2="${y(pa)}"/><line class="graf__prom graf__prom--b" x1="0" x2="${W}" y1="${y(pb)}" y2="${y(pb)}"/>`;
    return h + "</svg>";
  }

  // ---------- pantallas ----------
  function render() {
    ({ inicio: vInicio, cat: vCategoria, club: vClub, consejos: vConsejos })[S.ver]();
  }
  /** sección desplegable: arranca cerrada y recuerda si la abriste (al ordenar o "ver todos" no se cierra) */
  const desple = (id, titulo, contenido) =>
    `<details class="mas mas--grande" data-sec="${id}"${S.abiertos.has(id) ? " open" : ""}><summary>${titulo}</summary><div class="mas__in">${contenido}</div></details>`;
  const volver = (txt = "Categorías") => `<button type="button" class="volver" data-ir="inicio">${IC.atras}${txt}</button>`;

  // inicio: elegir la categoría
  function vInicio() {
    const boton = (cat) => {
      const r = filasCat(cat).at(-1);
      return `<li><button type="button" class="elegir" data-ir-cat="${esc(cat)}">
        <span class="elegir__nom">${esc(cat)}</span>
        <span class="elegir__res">${r["Año"]}: ${resultadoTxt(r)}</span>${IC.adelante}</button></li>`;
    };
    $("#vista").innerHTML = `
      <section class="sec">
        <h2 class="h2">Elegí una categoría</h2>
        <p class="sub">Partidos oficiales cargados en las planillas de la UAR, de ${D.desde} a ${D.hasta}.</p>
        <h3 class="grupo">Plantel superior</h3>
        <ul class="elegir-lista">${D.cats.filter((c) => PS.includes(c)).map(boton).join("")}</ul>
        <h3 class="grupo">Juveniles</h3>
        <ul class="elegir-lista">${D.cats.filter((c) => !PS.includes(c)).map(boton).join("")}</ul>
      </section>
      <section class="sec">
        <h2 class="h2">Todo el club</h2>
        <ul class="elegir-lista elegir-lista--club">
          <li><button type="button" class="elegir elegir--club" data-ir="club"><span class="elegir__ic">${IC.gente}</span>
            <span class="elegir__nom">¿Los chicos siguen?</span><span class="elegir__res">Quiénes siguen jugando y quiénes llegan a Primera</span>${IC.adelante}</button></li>
          <li><button type="button" class="elegir elegir--club" data-ir="consejos"><span class="elegir__ic">${IC.idea}</span>
            <span class="elegir__nom">Consejos</span><span class="elegir__res">Qué trabajar y qué empezar a medir</span>${IC.adelante}</button></li>
        </ul>
      </section>`;
  }

  // categoría: las 5 preguntas
  function vCategoria() {
    const cat = S.cat, filas = filasCat(cat), anios = filas.map((r) => r["Año"]);
    if (!S.temp || !anios.includes(S.temp)) S.temp = ultimaTemp(cat);
    const a = S.temp, r = filas.find((x) => x["Año"] === a), i = anios.indexOf(a);

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

    // 2. comparado con todos los años
    const promGan = prom(filas.map((x) => x["% victorias"]));
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

    // más datos
    // un renglón por dato: la barra azul es el año elegido y la rayita punteada el promedio de todos los años
    const masFila = (lbl, expl, k, extra = "") => {
      const v = r[k], p = prom(filas.map((x) => x[k]));
      if (v == null) return "";
      const pos = (x) => `${Math.max(0, Math.min(100, x))}%`;
      return `<li class="dato-e"><b class="dato-e__tit">${lbl}</b>
        <span class="dato-e__val num"><strong>${fmt(v, "%")}</strong><small>promedio ${fmt(p, "%")}</small></span>
        <span class="dato-e__exp">${expl}${extra}</span>
        <span class="dato-e__barra" aria-hidden="true"><i style="width:${pos(v)}"></i>${p != null ? `<b style="left:${pos(p)}"></b>` : ""}</span></li>`;
    };

    $("#vista").innerHTML = `
      <div class="cab">
        ${volver()}
        <div class="cab__fila">
          <h2 class="cab__cat">${esc(cat)}</h2>
          <div class="anio" role="group" aria-label="Año">
            <button type="button" data-anio="${i > 0 ? anios[i - 1] : ""}" aria-label="Año anterior"${i > 0 ? "" : " disabled"}>${IC.atras}</button>
            <span class="anio__n num" aria-live="polite">${a}</span>
            <button type="button" data-anio="${i < anios.length - 1 ? anios[i + 1] : ""}" aria-label="Año siguiente"${i < anios.length - 1 ? "" : " disabled"}>${IC.adelante}</button>
          </div>
        </div>
      </div>

      <section class="sec">
        <h2 class="h2">Cómo le fue en ${a}</h2>
        <p class="sub">${r.PJ} partidos oficiales.${r.PJ < 5 ? " Son pocos: los números pueden engañar." : ""}</p>
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
        <h2 class="h2">¿Mejor o peor que otros años?</h2>
        <p class="sub">Cada barra es un año. La azul es ${a}. La línea punteada es el promedio de todos los años.</p>
        <h3 class="grupo">Partidos ganados</h3>
        <div class="graf-wrap">${barras(filas.map((x) => ({ x: x["Año"], y: x["% victorias"] })), { sel: a, tipo: "%", promedio: promGan })}</div>
        <h3 class="grupo">Puntos por partido</h3>
        <p class="ley"><span><i class="ley--a"></i>los que hace · promedio <b>${fmt(prom(filas.map((x) => x["PF por partido"])), "d")}</b></span>
          <span><i class="ley--b"></i>los que le hacen · promedio <b>${fmt(prom(filas.map((x) => x["PC por partido"])), "d")}</b></span>
          <span><i class="ley--prom"></i>promedios</span></p>
        <div class="graf-wrap">${barrasDobles(filas.map((x) => ({ x: x["Año"], a: x["PF por partido"], b: x["PC por partido"] })), { sel: a })}</div>
      </section>

      <section class="sec desplegables">
        ${desple("partidos", `Contra quién jugó en ${a}`, `
          <ol class="resultados">${verP.map(partidoHTML).join("")}</ol>
          ${parts.length > 6 ? `<button type="button" class="btn btn--ancho" data-ver="P">${S.verP ? "Ver menos" : `Ver los ${parts.length} partidos`}</button>` : ""}
          ${riv.length ? `<h3 class="grupo">Contra cada rival, sumando todos los años</h3>
            <p class="ley"><span><i class="ley--g"></i>ganamos</span><span><i class="ley--e"></i>empatamos</span><span><i class="ley--p"></i>perdimos</span></p>
            <ul class="rivales-e">${riv.map((x) => `<li><div class="rivales-e__fila"><b>${esc(x.Rival)}</b><span class="num">${x.PJ} partidos</span></div>
              <div class="rivales-e__barra num" role="img" aria-label="Ganamos ${x.G}, empatamos ${x.E}, perdimos ${x.P}">${[["g", x.G], ["e", x.E], ["p", x.P]].filter(([, n]) => n).map(([k, n]) => `<i class="${k}" style="flex-grow:${n}">${n}</i>`).join("")}</div></li>`).join("")}</ul>` : ""}`)}

        ${desple("jugadores", `Quiénes jugaron en ${a}`, `
          <p class="sub">Partidos = de titular o entrando del banco. Tocá un título para ordenar.</p>
          <div class="tabla-e-wrap"><table class="tabla-e">
            <thead><tr><th scope="col" class="izq">Jugador</th>${[["pj", "Partidos"], ["tries", "Tries"], ["pts", "Puntos"]].map(([k, l]) =>
              `<th scope="col"${k === S.ordenJ ? ' aria-sort="descending"' : ""}><button type="button" data-ordj="${k}">${l}</button></th>`).join("")}</tr></thead>
            <tbody>${verJ.map((j) => `<tr><td class="izq">${nombreHTML(j.nombre)}</td><td>${j.pj}</td><td>${j.tries}</td><td>${j.pts}</td></tr>`).join("")}</tbody>
          </table></div>
          ${jug.length > 12 ? `<button type="button" class="btn btn--ancho" data-ver="J">${S.verJ ? "Ver menos" : `Ver los ${jug.length} jugadores`}</button>` : ""}`)}

        ${ret.length ? desple("siguen", "¿Los chicos siguen jugando?", `
          <p class="sub">De los chicos que estuvieron en la planilla de ${esc(cat)} cada año (jugando o en el banco), qué parte volvió a aparecer en una planilla del club al año siguiente, en cualquier categoría.</p>
          <div class="graf-wrap">${barras(ret.map((x) => ({ x: x["Año"], y: x["% retención"] })), { sel: retSel ? retSel["Año"] : null, tipo: "%", promedio: prom(ret.map((x) => x["% retención"])) })}</div>
          ${retSel ? `<p class="frase">De los <b>${retSel.Jugadores}</b> que estuvieron en planillas en ${retSel["Año"]}, <b>${retSel["Siguen la temporada siguiente"]}</b> volvieron a aparecer en ${sigTemp(retSel["Año"])}.${retSel["Año"] < a ? ` Para ${a} todavía no se sabe: hay que esperar al año que viene.` : ""}</p>` : ""}
          ${retSel ? listaNoSiguieron(cat, retSel["Año"], sigTemp(retSel["Año"])) : ""}
          <p class="sub sub--nota">Un chico que sigue entrenando pero no entró en ninguna planilla, o que se fue a otro club, cuenta como que no siguió.</p>
          ${pase.length ? `<h3 class="grupo">¿Llegan a Primera?</h3>
            <p class="sub">De los M19 de cada año, qué parte apareció en planillas de Primera, Intermedia o Pre-Intermedia en los 2 años siguientes.</p>
            <div class="graf-wrap">${barras(pase.map((x) => ({ x: x["Año"], y: x["% pasaje a plantel superior"] })), { sel: paseSel ? paseSel["Año"] : null, tipo: "%", promedio: prom(pase.map((x) => x["% pasaje a plantel superior"])) })}</div>
            ${paseSel ? `<p class="frase">De los <b>${paseSel.Jugadores}</b> M19 de ${paseSel["Año"]}, <b>${paseSel["Pasaron a plantel superior (en 2 temporadas)"]}</b> ya aparecieron en planillas de plantel superior.</p>` : ""}` : ""}`) : ""}

        ${desple("mas", "Más datos para analizar", `
          <p class="sub">Salen de los minutos que se anotan en la planilla.</p>
          <p class="ley"><span><i class="ley--a"></i>${a}</span><span><i class="ley--prom"></i>promedio de todos los años</span></p>
          <ul class="datos-e">
            ${masFila("Hizo el primer tanto del partido", "En qué parte de los partidos el primer tanto fue nuestro.", "% marcamos primero",
              r["% victorias cuando marcamos primero"] != null ? ` Cuando lo hizo, ganó el ${fmt(r["% victorias cuando marcamos primero"], "%")}.` : "")}
            ${masFila("Ganó jugando en casa", "Partidos ganados de local.", "% victorias de local")}
            ${masFila("Ganó jugando afuera", "Partidos ganados de visitante.", "% victorias de visitante")}
            ${masFila("Conversiones que entraron", "Qué parte de los tries se convirtió (el try penal no cuenta, porque no se patea).", "% conversiones")}
            ${masFila("Puntos en contra en el 2º tiempo", "Qué parte de los puntos que le hicieron fue en el 2º tiempo. Más de 60% puede ser cansancio.", "% PC en 2º tiempo")}
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
      <ul class="lista">${ver.map((x) => `<li><span class="lista__txt"><span>${nombreHTML(x.nombre)}</span><small>${detalle(x)} en ${esc(cat)} ${anio}</small></span>
        <span class="chip chip--gris">último: ${fecha(x.ultimo)}</span></li>`).join("")}</ul>
      ${l.length > 8 ? `<button type="button" class="btn btn--ancho" data-ver="N">${S.verN ? "Ver menos" : `Ver los ${l.length}`}</button>` : ""}`;
  }
  function nombreHTML(n) {
    const i = n.indexOf(",");
    return i < 0 ? `<b>${esc(n)}</b>` : `<b>${esc(n.slice(0, i))}</b>, ${esc(n.slice(i + 1).trim())}`;
  }
  const partidoHTML = (p) => `<li class="res">
      <span class="res__fecha">${fecha(p.fecha)}<small>${p.cond === "L" ? "Local" : "Visitante"}</small></span>
      <span class="res__cuerpo"><span class="res__rival">${esc(p.rival)}</span></span>
      <span class="res__marcador res--${p.res}"><b class="num">${p.pf}–${p.pc}</b><i>${({ G: "Ganó", E: "Empató", P: "Perdió" })[p.res]}</i></span></li>`;

  // todo el club: siguen jugando, camino a Primera, nacimiento y peso
  function vClub() {
    const ultimos = [...new Set(D.ret.map((r) => r["Año"]))].sort((a, b) => a - b).slice(-4);
    const celda = (v) => v == null ? "<td>–</td>" : `<td><span class="pct ${v >= 80 ? "pct--a" : v >= 65 ? "pct--b" : "pct--c"}">${Math.round(v)}%</span></td>`;
    const fisCats = [...new Set(D.fis.map((f) => f["Categoría"]))];
    const kg = (c, l) => fmt((D.fis.find((x) => x["Categoría"] === c && x["Línea"] === l) || {})["Peso promedio (kg)"], "d");
    $("#vista").innerHTML = `
      <div class="cab">${volver()}<h2 class="cab__cat">Todo el club</h2></div>

      <section class="sec">
        <h2 class="h2">¿Los chicos siguen jugando?</h2>
        <p class="sub">De los chicos que estuvieron en la planilla de cada categoría ese año (jugando o en el banco), qué parte volvió a aparecer en una planilla del club al año siguiente.</p>
        <p class="ley"><span class="pct pct--a">80% o más</span><span class="pct pct--b">65 a 79%</span><span class="pct pct--c">menos de 65%</span></p>
        <div class="tabla-e-wrap"><table class="tabla-e"><thead><tr><th scope="col" class="izq">Categoría</th>${ultimos.map((a) => `<th scope="col">${a}</th>`).join("")}</tr></thead>
          <tbody>${D.cats.map((c) => `<tr><th scope="row" class="izq">${esc(c)}</th>${ultimos.map((a) => celda((D.ret.find((r) => r["Categoría"] === c && r["Año"] === a) || {})["% retención"])).join("")}</tr>`).join("")}</tbody></table></div>
      </section>

      <section class="sec">
        <h2 class="h2">Camino a Primera</h2>
        <p class="sub">Cuántos jugadores debutaron en Primera cada año y cuántos partidos tenía antes, en promedio, el equipo titular. Si debutan pocos y ese número sube, el equipo envejece.</p>
        <div class="tabla-e-wrap"><table class="tabla-e"><thead><tr><th scope="col" class="izq">Año</th><th scope="col">Debutaron</th><th scope="col">Edad del equipo titular</th><th scope="col">Partidos que ya tenía</th></tr></thead>
          <tbody>${D.camino.filter((r) => r["Año"] >= 2019).map((r) => `<tr><th scope="row" class="izq">${r["Año"]}</th><td>${r["Debutaron en Primera"] ?? "–"}</td><td>${fmt(r["Edad promedio del XV titular"], "d")}</td><td>${r["Partidos previos en plantel superior del XV (promedio)"] ?? "–"}</td></tr>`).join("")}</tbody></table></div>
      </section>

      <section class="sec">
        <h2 class="h2">¿En qué parte del año nacieron?</h2>
        <p class="sub">En muchos clubes juegan más los nacidos en enero-marzo, que son más grandes, y se pierden los de fin de año. Si las 4 partes son parecidas, está bien.</p>
        <p class="ley"><i class="q1"></i>ene-mar <i class="q2"></i>abr-jun <i class="q3"></i>jul-sep <i class="q4"></i>oct-dic</p>
        <ul class="era">${D.era.map((r) => {
          const q = [r["Nacidos ene-mar %"], r["abr-jun %"], r["jul-sep %"], r["oct-dic %"]];
          return `<li><span class="era__cat">${esc(r["Categoría"] === "Pre-Intermedia" ? "Pre-Inter." : r["Categoría"])}</span><span class="era__bar" role="img" aria-label="${q.map((v) => Math.round(v) + "%").join(", ")}">${q.map((v, i) => `<i class="q${i + 1}" style="width:${v}%">${v >= 14 ? Math.round(v) + "%" : ""}</i>`).join("")}</span></li>`;
        }).join("")}</ul>
      </section>

      ${D.fis.length ? `<section class="sec">
        <h2 class="h2">Peso promedio ${D.fis[0].Temporada}</h2>
        <p class="sub">Lo que dice la ficha de la UAR de los que jugaron este año. Es un solo dato por jugador y sin fecha: sirve para arrancar con la nutricionista.</p>
        <div class="tabla-e-wrap"><table class="tabla-e"><thead><tr><th scope="col" class="izq">Categoría</th><th scope="col">Forwards</th><th scope="col">Backs</th></tr></thead>
          <tbody>${fisCats.map((c) => `<tr><th scope="row" class="izq">${esc(c)}</th><td>${kg(c, "Forward")} kg</td><td>${kg(c, "Back")} kg</td></tr>`).join("")}</tbody></table></div>
      </section>` : ""}`;
  }

  // consejos
  function vConsejos() {
    const grupo = (tipo, h) => { const it = D.diag.filter((d) => d[0] === tipo); return it.length ? `<h3 class="grupo">${h}</h3><ul class="diag">${it.map(diagItem).join("")}</ul>` : ""; };
    const pri = { Alta: "alta", Media: "media", Baja: "baja" };
    $("#vista").innerHTML = `
      <div class="cab">${volver()}<h2 class="cab__cat">Consejos</h2></div>
      <section class="sec">
        <p class="sub">Lo que muestran los datos del club y qué hacer con eso.</p>
        ${grupo("alerta", "Para trabajar")}${grupo("bien", "Está bien")}${grupo("medir", "Falta medir")}
      </section>
      <section class="sec">
        <h2 class="h2">Qué empezar a medir</h2>
        <p class="sub">Lo que las planillas de la UAR no tienen. Tocá cada uno para ver cómo.</p>
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

  // ---------- eventos ----------
  document.addEventListener("click", (e) => {
    if (!S) return;
    const t = e.target.closest("[data-ir],[data-ir-cat],[data-anio],[data-ver],[data-ordj]");
    if (!t || t.disabled) return;
    const ds = t.dataset;
    if (ds.ir) irA({ ver: ds.ir, cat: null, temp: null });
    else if (ds.irCat) irA({ ver: "cat", cat: ds.irCat, temp: null, verJ: false, verP: false, verN: false });
    else if (ds.anio) irA({ temp: +ds.anio, verJ: false, verP: false, verN: false }, false);
    else if (ds.ver) { S["ver" + ds.ver] = !S["ver" + ds.ver]; render(); }
    else if (ds.ordj) { S.ordenJ = ds.ordj; render(); }
  });

  document.addEventListener("toggle", (e) => {
    const d = e.target;
    if (!S || !d.dataset || !d.dataset.sec) return;
    if (d.open) S.abiertos.add(d.dataset.sec); else S.abiertos.delete(d.dataset.sec);
  }, true);

  // si cambia el ancho de la pantalla (girar el celular), se vuelven a dibujar los gráficos
  let tRes, anchoPrev = innerWidth;
  addEventListener("resize", () => {
    clearTimeout(tRes);
    tRes = setTimeout(() => { if (S && Math.abs(innerWidth - anchoPrev) > 40) { anchoPrev = innerWidth; render(); } }, 200);
  });

  // ---------- inicio ----------
  intentarGuardada().then((ok) => { if (!ok) $("#clave").focus(); });
})();
