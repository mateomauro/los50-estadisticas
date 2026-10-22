/* Los 50 · Revisar datos — preguntas al club sobre datos dudosos de las planillas.
   Las preguntas y respuestas van y vienen de functions/api/revision.js (con la clave en "x-clave").
   Las respuestas se aplican solas en la próxima actualización (revision.py). */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const CLAVE = "los50-revisar";
  const S = { clave: "", preguntas: [], respuestas: {}, eligiendo: null };

  // ---------- clave ----------
  const guardada = () => { try { return localStorage.getItem(CLAVE) || sessionStorage.getItem(CLAVE); } catch (e) { return null; } };
  function guardar(clave, siempre) {
    try { (siempre ? localStorage : sessionStorage).setItem(CLAVE, clave); } catch (e) { /* sin almacenamiento: pide la clave cada vez */ }
  }
  function olvidar() { try { localStorage.removeItem(CLAVE); sessionStorage.removeItem(CLAVE); } catch (e) { /* nada */ } }

  async function api(metodo, cuerpo, id) {
    const r = await fetch("/api/revision" + (id ? `?id=${encodeURIComponent(id)}` : ""), {
      method: metodo, cache: "no-store",
      headers: { "x-clave": S.clave, ...(cuerpo ? { "content-type": "application/json" } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    if (r.status === 401) throw new Error("clave");
    if (!r.ok) throw new Error("red");
    return r.json();
  }

  const MENSAJE = {
    clave: "La clave no es correcta. Probá de nuevo.",
    cambio: "La clave cambió. Ingresala de nuevo.",
    red: "No se pudo conectar. Revisá internet y probá de nuevo.",
  };
  /** vuelve a la pantalla de la clave, con el motivo */
  function pedirClave(motivo) {
    $("#app").hidden = true;
    $("#candado").hidden = false;
    const err = $("#error-clave");
    err.textContent = MENSAJE[motivo] || MENSAJE.red; err.hidden = false;
    $("#clave").focus();
  }

  async function entrar(clave) {
    S.clave = clave;
    const d = await api("GET");
    S.preguntas = d.preguntas; S.respuestas = d.respuestas || {};
    $("#candado").hidden = true;
    $("#app").hidden = false;
    render();
    $("#vista").focus();
  }

  $("#ver-clave").addEventListener("click", (e) => {
    const b = e.currentTarget, ver = b.getAttribute("aria-pressed") !== "true";
    b.setAttribute("aria-pressed", ver); $("#clave").type = ver ? "text" : "password";
    b.setAttribute("aria-label", ver ? "Ocultar la clave" : "Mostrar la clave");
  });
  $("#form-clave").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#error-clave"), btn = $("#entrar");
    err.hidden = true; btn.disabled = true; btn.textContent = "Entrando…";
    try {
      await entrar($("#clave").value);
      guardar(S.clave, $("#recordar").checked);
    } catch (e2) {
      err.textContent = MENSAJE[e2.message] || MENSAJE.red;
      err.hidden = false; $("#clave").select();
    } finally { btn.disabled = false; btn.textContent = "Entrar"; }
  });
  $("#salir").addEventListener("click", () => { olvidar(); location.href = "jugadores.html"; });

  // ---------- preguntas ----------
  const etiqueta = (p, r) => {
    if (r.respuesta === "otro") {
      const j = (p.jugadores || []).find((x) => x[0] === r.quien);
      return `Fue otro jugador${j ? `: ${j[2]}${j[1] ? ` (#${j[1]})` : ""}` : ""}`;
    }
    const op = p.opciones.find((o) => o[0] === r.respuesta);
    return op ? op[1] : r.respuesta;
  };

  function fichaRep(f) {
    return `<div class="rep">
      <b class="rep__nombre">${esc(f.nombre)}</b>
      ${f.nacio ? `<span>Nació el ${esc(f.nacio)}</span>` : ""}
      <span><b class="num">${f.partidos}</b> ${f.partidos === 1 ? "partido" : "partidos"} · ${esc(f.anios)}</span>
      <span class="rep__cats">${esc(f.categorias)}</span>
    </div>`;
  }

  function cuerpo(p) {
    if (p.tipo === "repetido") {
      return `<p class="preg__tipo">Jugador cargado dos veces</p>
        <h2 class="preg__titulo">${esc(p.titulo)}</h2>
        <div class="preg__fichas">${p.fichas.map(fichaRep).join('<span class="preg__y" aria-hidden="true">y</span>')}</div>
        <p class="preg__motivo">${esc(p.motivo)}</p>`;
    }
    const otros = p.otros && p.otros !== "nadie más" ? `<p class="preg__motivo">Otros que patearon ese partido: ${esc(p.otros)}</p>` : "";
    return `<p class="preg__tipo">Planilla · ${esc(p.caso)}</p>
      <h2 class="preg__titulo">${esc(p.titulo)}</h2>
      ${p.torneo ? `<p class="preg__torneo">${esc(p.torneo)}</p>` : ""}
      <p class="preg__dice"><span>La planilla dice</span>${esc(p.dice)}</p>
      <p class="preg__pregunta">${esc(p.pregunta)}</p>
      ${otros}`;
  }

  function acciones(p) {
    const r = S.respuestas[p.id];
    if (r) {
      return `<div class="preg__hecha">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
        <span>Contestaste: <b>${esc(etiqueta(p, r))}</b></span>
        <button type="button" class="link" data-cambiar>Cambiar</button>
      </div>`;
    }
    if (S.eligiendo === p.id) {
      const ops = p.jugadores.map((j) => `<option value="${esc(j[0])}">${j[1] ? `${esc(j[1])} · ` : ""}${esc(j[2])}</option>`).join("");
      return `<div class="preg__quien">
        <label class="preg__elegir"><span>¿Quién fue?</span>
          <select data-quien><option value="">Elegí un jugador</option>${ops}</select></label>
        <div class="preg__ops">
          <button type="button" class="op op--si" data-guardar>Guardar</button>
          <button type="button" class="op" data-volver>Volver</button>
        </div>
      </div>`;
    }
    return `<div class="preg__ops" role="group" aria-label="Respuesta">${p.opciones.map(([v, t]) =>
      `<button type="button" class="op op--${v === "si" ? "si" : v === "nose" ? "nose" : "no"}" data-r="${esc(v)}">${esc(t)}</button>`).join("")}</div>`;
  }

  function render() {
    const total = S.preguntas.length, faltan = S.preguntas.filter((p) => !S.respuestas[p.id]).length;
    $("#vacio").hidden = total > 0;
    $(".rev__intro").hidden = total === 0;
    $("#cuenta").innerHTML = !total ? ""
      : faltan === total ? `<b class="num">${total}</b> ${total === 1 ? "pregunta" : "preguntas"} para contestar`
        : faltan ? `${faltan === 1 ? "Falta" : "Faltan"} <b class="num">${faltan}</b> <span>de ${total}</span>`
          : "<b>¡Listo!</b> Contestaste todo";
    $("#fin").hidden = !total || faltan > 0;
    $("#lista").innerHTML = S.preguntas.map((p) =>
      `<li class="preg${S.respuestas[p.id] ? " preg--hecha" : ""}" data-id="${esc(p.id)}">${cuerpo(p)}${acciones(p)}</li>`).join("");
  }
  const enPregunta = (id, sel) => $(`.preg[data-id="${CSS.escape(id)}"] ${sel}`);

  function aviso(msg) {
    const t = $("#toast");
    t.textContent = msg; t.classList.add("ver");
    clearTimeout(aviso.t); aviso.t = setTimeout(() => { t.classList.remove("ver"); t.textContent = ""; }, 3500);
  }

  async function responder(li, p, respuesta, quien) {
    li.querySelectorAll("button, select").forEach((b) => { b.disabled = true; });
    try {
      const d = await api("POST", { id: p.id, respuesta, quien });
      S.respuestas[p.id] = d.respuesta; S.eligiendo = null;
      render();
      const listo = S.preguntas.every((x) => S.respuestas[x.id]);
      aviso(listo ? "¡Listo! Contestaste todo. Gracias." : "Guardado");
      enPregunta(p.id, "[data-cambiar]").focus();  // el foco queda en la misma pregunta
    } catch (e) {
      if (e.message === "clave") { olvidar(); pedirClave("cambio"); return; }
      li.querySelectorAll("button, select").forEach((b) => { b.disabled = false; });
      aviso("No se pudo guardar. Revisá internet y probá de nuevo.");
    }
  }

  $("#lista").addEventListener("click", async (e) => {
    const li = e.target.closest(".preg");
    if (!li) return;
    const p = S.preguntas.find((x) => x.id === li.dataset.id);
    const b = e.target.closest("button");
    if (!p || !b) return;
    if (b.dataset.r === "otro") { S.eligiendo = p.id; render(); enPregunta(p.id, "select").focus(); return; }
    if (b.dataset.r) { responder(li, p, b.dataset.r); return; }
    if ("volver" in b.dataset) { S.eligiendo = null; render(); enPregunta(p.id, ".op").focus(); return; }
    if ("guardar" in b.dataset) {
      const quien = li.querySelector("[data-quien]").value;
      if (!quien) { aviso("Elegí quién fue"); li.querySelector("[data-quien]").focus(); return; }
      responder(li, p, "otro", quien);
      return;
    }
    if ("cambiar" in b.dataset) {
      b.disabled = true;
      try {
        await api("DELETE", null, p.id);
        delete S.respuestas[p.id];
        render();
        enPregunta(p.id, ".op").focus();
      } catch (e2) {
        if (e2.message === "clave") { olvidar(); pedirClave("cambio"); return; }
        b.disabled = false; aviso("No se pudo cambiar. Revisá internet y probá de nuevo.");
      }
    }
  });

  // si quedó la clave guardada, entra directo (mientras tanto, "Cargando preguntas…")
  const g = guardada();
  if (g) {
    $("#candado").hidden = true;
    $("#app").hidden = false;
    $("#cuenta").textContent = "Cargando preguntas…";
    $(".rev__intro").hidden = true;
    entrar(g).catch((e) => {
      if (e.message === "clave") olvidar();  // cambiaron la clave: se pide de nuevo
      pedirClave(e.message === "clave" ? "cambio" : "red");
    });
  }
})();
