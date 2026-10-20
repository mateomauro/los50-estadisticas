/* Animación de entrada con el escudo. La variante ("1", "2" o "3") la decide el script del <head> en window.INTRO.
   1: el escudo entra con rebote y destello · 2: marcador 0 → 50 · 3: las sierras y el escudo que sube.
   Todas terminan con el escudo volando a su lugar en el encabezado. Se saltea tocando la pantalla. */
(() => {
  "use strict";
  const v = window.INTRO;
  if (!v) return;
  const html = document.documentElement;
  const ESCUDO = "img/escudo-400.webp";

  const escudo = `<div class="intro__vuelo"><i class="intro__anillo"></i>
    <div class="intro__escudo"><img src="${ESCUDO}" alt="" width="400" height="433"><i class="intro__brillo"></i></div></div>`;
  const letras = (t) => [...t].map((c) => `<span>${c === " " ? "&nbsp;" : c}</span>`).join("");
  const escenas = {
    1: `${escudo}<p class="intro__texto"><span class="intro__palabra">${letras("CLUB LOS 50")}</span><small>Tandil</small></p>`,
    2: `${escudo}<p class="intro__marcador num">0</p>`,
    3: `<svg class="intro__sierras" viewBox="0 0 300 70">
          <path class="relleno" d="M0 62 L38 44 L66 52 L104 24 L136 38 L164 10 L196 32 L226 20 L262 46 L300 54 L300 70 L0 70Z"/>
          <path class="linea" pathLength="1" d="M0 62 L38 44 L66 52 L104 24 L136 38 L164 10 L196 32 L226 20 L262 46 L300 54"/></svg>
        ${escudo}<p class="intro__texto"><small>Tandil</small></p>`,
  };

  const el = document.createElement("div");
  el.className = `intro intro--v${v}`;
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `<div class="intro__fondo"></div><div class="intro__luz"></div><div class="intro__escena">${escenas[v] || escenas[1]}</div>
    <p class="intro__saltar">Tocá para saltear</p>`;
  document.body.appendChild(el);
  html.classList.remove("intro-pendiente");
  html.classList.add("intro-activa");
  try { sessionStorage.setItem("los50-intro", "1"); } catch (e) { /* sin almacenamiento: se vuelve a mostrar */ }

  const $ = (s) => el.querySelector(s);
  const $$ = (s) => el.querySelectorAll(s);
  const anim = (n, frames, o) => n.animate(frames, { fill: "both", easing: "cubic-bezier(.2,.8,.2,1)", ...o });
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  let terminado = false;

  // ---------- 1: el escudo entra a la cancha ----------
  async function v1() {
    anim($(".intro__escudo"), [
      { opacity: 0, transform: "translateY(40px) scale(.35)" },
      { opacity: 1, transform: "translateY(0) scale(1.08)", offset: .6 },
      { transform: "scale(.97)", offset: .82 },
      { opacity: 1, transform: "scale(1)" }], { duration: 850 });
    await esperar(650);
    anim($(".intro__brillo"), [{ transform: "translateX(-130%) skewX(-18deg)" }, { transform: "translateX(130%) skewX(-18deg)" }],
      { duration: 800, easing: "cubic-bezier(.45,0,.2,1)" });
    $$(".intro__palabra > span").forEach((s, i) =>
      anim(s, [{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "none" }], { duration: 380, delay: 200 + i * 45 }));
    anim($(".intro__texto small"), [{ opacity: 0, letterSpacing: ".7em" }, { opacity: 1, letterSpacing: ".35em" }], { duration: 500, delay: 750 });
    await esperar(1400);
  }

  // ---------- 2: marcador 0 → 50 ----------
  async function v2() {
    const n = $(".intro__marcador");
    anim(n, [{ opacity: 0, transform: "scale(.85)" }, { opacity: 1, transform: "scale(1)" }], { duration: 300 });
    await new Promise((fin) => {
      const t0 = performance.now(), dur = 1150;
      const paso = (t) => {
        const p = Math.min(1, (t - t0) / dur);
        n.textContent = Math.round(50 * (1 - Math.pow(1 - p, 3)));
        if (p < 1 && !terminado) requestAnimationFrame(paso); else { n.textContent = "50"; fin(); }
      };
      requestAnimationFrame(paso);
    });
    anim(n, [{ transform: "scale(1)" }, { transform: "scale(1.16)", color: "#8fb4f5" }, { transform: "scale(1)", color: "#fff" }], { duration: 450 });
    anim($(".intro__anillo"), [{ opacity: .9, transform: "scale(.45)" }, { opacity: 0, transform: "scale(1.9)" }], { duration: 750, easing: "ease-out" });
    anim($(".intro__escudo"), [
      { opacity: 0, transform: "scale(.4)" },
      { opacity: 1, transform: "scale(1.07)", offset: .7 },
      { opacity: 1, transform: "scale(1)" }], { duration: 560 });
    await esperar(800);
  }

  // ---------- 3: las sierras ----------
  async function v3() {
    const linea = $(".intro__sierras .linea");
    anim(linea, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 850, easing: "cubic-bezier(.5,0,.3,1)" });
    anim($(".intro__sierras .relleno"), [{ opacity: 0 }, { opacity: 1 }], { duration: 700, delay: 450 });
    await esperar(600);
    anim($(".intro__escudo"), [
      { opacity: 1, clipPath: "inset(100% 0 0 0)", transform: "translateY(18px)" },
      { opacity: 1, clipPath: "inset(0 0 0 0)", transform: "none" }], { duration: 1050, easing: "cubic-bezier(.5,0,.2,1)" });
    anim($(".intro__luz"), [{ opacity: 0, transform: "translateY(30%)" }, { opacity: 1, transform: "none" }], { duration: 1200 });
    await esperar(850);
    anim($(".intro__texto small"), [{ opacity: 0, letterSpacing: ".8em" }, { opacity: 1, letterSpacing: ".35em" }], { duration: 600 });
    await esperar(650);
  }

  // ---------- salida: el escudo vuela al encabezado y aparece la página ----------
  async function salida(rapida) {
    if (terminado) return;
    terminado = true;
    const dur = rapida ? 220 : 650;
    $$(".intro__escena > :not(.intro__vuelo), .intro__saltar, .intro__anillo, .intro__luz").forEach((n) =>
      anim(n, [{ opacity: getComputedStyle(n).opacity }, { opacity: 0 }], { duration: dur * .5 }));
    const fondo = anim($(".intro__fondo"), [{ opacity: 1 }, { opacity: 0 }], { duration: dur, delay: rapida ? 0 : 180, easing: "ease-in" });
    const vuelo = $(".intro__vuelo"), logo = document.querySelector(".top__escudo");
    if (!rapida && logo) {
      const a = vuelo.getBoundingClientRect(), b = logo.getBoundingClientRect();
      const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
      await anim(vuelo, [{ transform: "none" }, { transform: `translate(${dx}px, ${dy}px) scale(${b.width / a.width})` }],
        { duration: dur, easing: "cubic-bezier(.65,0,.25,1)" }).finished;
    } else {
      anim(vuelo, [{ opacity: 1 }, { opacity: 0 }], { duration: dur });
    }
    await fondo.finished.catch(() => {});
    html.classList.remove("intro-activa");
    el.remove();
  }

  el.addEventListener("click", () => salida(true));
  addEventListener("keydown", () => salida(true), { once: true });
  anim($(".intro__saltar"), [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 900 });

  (async () => {
    const img = $(".intro__escudo img");
    await Promise.race([img.decode().catch(() => {}), esperar(800)]);  // que el escudo esté cargado antes de arrancar
    if (!terminado) await ({ 1: v1, 2: v2, 3: v3 }[v] || v1)();
    await salida(false);
  })();
})();
