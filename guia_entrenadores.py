"""Guía del club para la sección Entrenadores: qué aprende cada categoría, cantos, zonas de la cancha y scrum.
Sale del material de Coordinación de Rugby (Magali Fazzi, 2026). Va cifrado con el resto de la sección (tiene los cantos).

Las progresiones vienen de los Excel de la carpeta PROGRESIONES y se guardan en guia/progresiones.json.
Si Maga cambia esos Excel, se vuelven a leer con:
    python guia_entrenadores.py "<carpeta de Drive descomprimida>"
Lo demás (cantos, zonas, scrum) está escrito acá, tomado de CODIGOS.xlsx, MODELO DE JUEGO LOS 50.pdf,
PROTOCOLO DE SCRUM.docx y setup_los50.pptx.
"""
import json
import re
import sys
from pathlib import Path

import perfiles_pumas as PP

HERE = Path(__file__).parent
PROGRESIONES = HERE / "guia" / "progresiones.json"
PRACTICAS = HERE / "guia" / "practicas.json"
SCRUM_SESIONES = HERE / "guia" / "scrum_sesiones.json"

# ---------- cantos (CODIGOS.xlsx: se sacó la copia repetida del final y se completó CACIQUE) ----------
# Grupo | Situación | Código | Significado
CANTOS = [
    ("Ataque", "Variabilidad", "BLANCO", "Pase del 9 directo con la célula."),
    ("Ataque", "Variabilidad", "NEGRO", "La célula pasa en falso y se juega pase del 9 directo con los backs."),
    ("Ataque", "Variabilidad", "DOS", "Pase del 9 al 10 y del 10 a los forwards."),
    ("Ataque", "Variabilidad", "AZUL", "Lo canta el back axial al portador de la célula de forwards para pedirle la pelota y atacar ancho con los backs."),
    ("Ataque", "Oportunidad", "ROJO", "Tengo el espacio para explotarlo yo: me tienen que dar la pelota."),
    ("Ataque", "Continuidad", "SEGUÍ", "Lo canta el apoyo para que el portador siga corriendo o se mantenga de pie."),
    ("Ataque", "Conservación", "PISO", "Lo canta el apoyo cuando llegó, para que el portador vaya al piso y presente."),
    ("Ataque", "Ataque", "ANCHO", "Ataque desplegado por el eje horizontal."),
    ("Ataque", "Después de un quiebre", "MALÓN", "Quiebre propio. Urgencia por subir. Los apoyos cercanos aceleran o conservan; los lejanos suben por su canal."),
    ("Ataque", "Transferir presión", "TREN", "Ruck largo para patear cajón."),
    ("Ataque", "Movimientos", "TUCUMÁN", "Patrón de bloqueo con el 10 de lanzador."),
    ("Ataque", "Movimientos", "SALTA", "Patrón de bloqueo con el 12 de lanzador."),
    ("Ataque", "Opciones", "PASTO", "Patadas de posición a los espacios sin gente."),
    ("Ataque", "Opciones", "CHANCHO", "Pick and go."),
    ("Ataque", "Opciones", "CACIQUE", "Ataque en zona de extremo ataque con un grupo cercano de dos forwards."),
    ("Lados", "Lados", "HALCÓN", "El lado ciego. El lado corto."),
    ("Lados", "Lados", "NACHO", "Jugar por el lado izquierdo."),
    ("Lados", "Lados", "DIEGO", "Jugar por el lado derecho."),
    ("Defensa", "Presión", "ARRIBA", "Todo el muro defensivo sube."),
    ("Defensa", "Gestión", "CONTROL", "Se canta de afuera hacia adentro. En inferioridad (−2) la defensa flota y controla: resigna terreno y cambia las marcas."),
    ("Defensa", "Gestión", "GENTE", "Se canta de afuera hacia adentro, levantando el brazo. Es el código para circular hacia el lado del que viene el canto."),
    ("Defensa", "Después de un quiebre", "TORMENTA", "Quiebre rival. Urgencia por bajar por su canal. Roles de persecución (los más rápidos)."),
]

# ---------- modelo de juego: pilares, oportunidad y zonas (MODELO DE JUEGO LOS 50.pdf) ----------
PILARES = [
    ("Protagonismo", "Desarrollamos nuestro juego. Responsabilidad individual y colectiva."),
    ("Equilibrio en la diversidad", "Entre fuerza y velocidad. No hay titulares y suplentes: hay jugadores que empiezan el partido y jugadores que lo terminan."),
    ("Adaptación", "Transiciones entre juego ordenado y espontáneo, y de defensa a ataque. Adaptación por zonas, contexto y momento del partido."),
    ("Mentalidad", "Solidaridad, responsabilidad, intensidad, inteligencia, disciplina, eficacia y entrega plena."),
    ("Comunicación", "Siempre positiva, útil y eficiente. Lenguaje común."),
]
FILOSOFIA = {
    "ataque": ("Oportunidad mata sistema",
               "El sistema es un mecanismo para generar oportunidades, pero si la oportunidad aparece, sea por el sistema "
               "o de forma espontánea, el objetivo es reconocerla y aprovecharla: nunca dejarla pasar."),
    "defensa": ("Presión, presión y más presión",
                "No esperamos al rival ni reaccionamos a lo que hace: tomamos la iniciativa aun sin la pelota. "
                "No defendemos para resistir, defendemos para recuperar la iniciativa del juego."),
}
# ¿Qué es oportunidad?
OPORTUNIDAD = [
    "En campo propio: +3 (overlap a favor).",
    "En campo rival: +2 (overlap a favor).",
    "En juego estructurado con posesión: backs contra forwards.",
    "Espacios libres (puertas amplias).",
]
DECISIONES = {
    "ataque": [
        "Pie a los espacios libres (PASTO).",
        "Rival desplegado: ataque profundo, punzante.",
        "Rival concentrado o amontonado: ataque desplegado.",
        "Si no prospera el avance: comunicar y cambiar a otra forma de avanzar.",
        "Quiebre propio, suben todos (MALÓN): los del espacio 2 aceleran o conservan; los del espacio 3 suben por su canal y comunican.",
    ],
    "defensa": [
        "Quiebre rival (TORMENTA): todos bajan por su canal y se activan los roles de persecución.",
        "En −1 seguimos subiendo.",
        "En −2 cantamos CONTROL y pasamos a defender en drift.",
    ],
}
# Zona | Desde – hasta | Nombre del modelo | Con pelota | Sin pelota
ZONAS = [
    ("roja", "Del ingoal propio a nuestras 22", "Extrema defensa",
     ["Salir de la zona con el menor gasto de energía posible.", "Jugamos territorio."],
     ["No hay terreno para resignar: subimos."]),
    ("azul", "De nuestras 22 a nuestros 10", "Gestación defensiva",
     ["Salir de la zona con el menor gasto de energía posible."],
     ["Gestación defensiva.", "Transferir presión al rival.", "Recuperar la posesión."]),
    ("amarilla", "De nuestros 10 a las 22 rivales", "Gestación ofensiva",
     ["Jugamos pelota.", "Mantenernos en su lado de la cancha.", "Presionar fuerte y aprovechar la inercia: asfixiar, ahogar.",
      "Generar y mantener la continuidad.", "Alternar orden y desequilibrio, con variantes."],
     []),
    ("verde", "De las 22 rivales al ingoal rival", "Extremo ataque", ["Marcar puntos."], []),
]
CANALES = ["Zona lateral", "Zona media", "Zona central", "Zona de desequilibrio"]

# una línea por categoría juvenil para la lista (resume lo principal de su progresión)
LEMAS_JUV = {
    "M13": "Jugar antes que chocar. Fijar y pasar.",
    "M14": "Estructura simple y reconocible: 2-2-2.",
    "M15": "Sistema de fases. Aparecen la oportunidad y el CONTROL.",
    "M16": "Sistema 1-3-3-1. Defensa en drift.",
    "M17": "Especialización por puestos. Defensa en blitz.",
    "M19": "Llegan especializados. Plan de partido.",
}

# ---------- scrum (PROTOCOLO DE SCRUM.docx y setup_los50.pptx, la versión 2026) ----------
SCRUM_EDADES = [
    ("M8", "Posturas y fuerza de core.", ""),
    ("M9", "2 contra 3. Posturas y fuerza de core.", ""),
    ("M10", "2+1 contra 3.", ""),
    ("M11", "3 contra 3.", ""),
    ("M12", "3+2 contra 3+2 y 3+2+1 contra 3+2+1.", ""),
    ("M13", "15 minutos, una vez por semana.", "Posturas los dos días de entrenamiento."),
    ("M14", "15 minutos, una vez por semana.", "Posturas los dos días de entrenamiento."),
    ("M15 en adelante", "Una vez por semana.", ""),
]
# entre paréntesis, qué quieren decir las palabras de preparación física (para entrenadores que no son profes de educación física)
SCRUM_METODO = [
    ("Flexibilidad", "Tobillo, cadera y hombros."),
    ("Estabilidad", "Core (la zona media del cuerpo: abdominales, lumbares y cadera)."),
    ("Fuerza", ""),
    ("Cuadrupedia", "En cuatro apoyos: quieto, con máquina, con cantos y con resistencias en cadera, torso y cuello (en el torso, resistencia en ángulo)."),
    ("Mini unidades", "Scrum con pocos jugadores, que se va agrandando: 1 contra 1 (quieto, con empuje, con resistencias, con cantos) → 2+1 contra 2 o máquina → 3 contra 3 primeras → 3+2 contra 3+2."),
    ("Conexiones", "Segundas y terceras: conexiones y fuerza isométrica (empujar y sostener sin moverse). Después, todos."),
]
SCRUM_PRINCIPIOS = [
    "Todos los jugadores deben conocer y respetar el set up del equipo.",
    "Para formar el scrum completo, todos deben poder mantener la postura por su cuenta.",
    "El scrum se apoya principalmente sobre la pierna delantera.",
    "Las caderas se mantienen conectadas durante toda la formación.",
    "El objetivo es un pack estable, conectado y capaz de transmitir fuerza en conjunto.",
]
# Paso | Canto que lo inicia | Qué hace
SCRUM_SETUP = [
    ("Hooker", "PRIMERAS", ["Marca con el pie derecho su posición en el scrum.", "Pies al ancho de hombros, ligera flexión de piernas, pecho levemente inclinado hacia adelante.",
                            "El peso va sobre el pie delantero.", "Levanta los dos brazos y llama a las primeras líneas con el canto «Primeras»."]),
    ("Pilar izquierdo", "", ["Se toma primero.", "Apoya la oreja interna sobre el pecho del hooker.", "Toma la camiseta del hooker profundo, cerca de la axila.",
                             "Cadera completamente conectada a la del hooker.", "Pie interno a la altura del pie trasero del hooker (o medio pie detrás). Pie exterior adelantado; el peso va sobre ese pie.",
                             "En el «Flexión» ya tiene el brazo preparado para la toma rival."]),
    ("Pilar derecho", "AFUERA", ["Se toma después del pilar izquierdo.", "Apoya la oreja interna sobre el pecho del hooker y toma la parte baja de su camiseta.",
                                 "Cadera completamente conectada a la del hooker. Pies igual que el pilar izquierdo.",
                                 "Al canto «Afuera», los dos pilares sacan los hombros a la vez, sin mover ni levantar al hooker."]),
    ("Segundas líneas", "SEGUNDAS", ["Se toman entre ellos, con la rodilla interna en el suelo.", "Pasan el brazo externo entre las piernas del pilar y toman el pantalón por el elástico (no la camiseta). Presionan el brazo hacia su pecho.",
                                     "Al canto «Segundas», los pilares rotan apenas la rodilla interna hacia adentro y los segundas entran a la altura de los isquiotibiales hasta dejar los hombros en el pliegue del glúteo.",
                                     "No empujan a la primera línea al entrar.", "En el «Tomarse» se levantan los dos a la vez, sin corregir los pies."]),
    ("Alas", "", ["Rodilla interna en el suelo, paralelos a los segundas.", "Se toman de los segundas sin separarlos.",
                  "Al canto «Segundas» apoyan el hombro en el pliegue del glúteo del pilar.", "Cabeza hacia adentro del scrum: presionan sin empujar en ángulo.",
                  "Hacen los cantos del empuje."]),
    ("Octavo", "", ["Al canto «Segundas» apoya una rodilla y toma a los segundas de las caderas.", "En el «Tomarse» no se levanta: sostiene a los segundas para que no se vayan hacia adelante.",
                    "En el «Ya» entra con todo el pack, piernas paralelas, ya conectado: sin generar un segundo impacto."]),
]
# Canto | Qué pasa
SCRUM_ENTRADA = [
    ("FLEXIÓN", ["Cierre de conexiones.", "Ajustes finales: juntar escápulas, sacar pecho, juntar caderas.", "Primeras con el pecho paralelo al piso y la cabeza alineada."]),
    ("TOMARSE", ["Inspiración profunda.", "Presión interna.", "Ángulo de piernas para poder empujar hacia adelante."]),
    ("YA", ["Retención de aire.", "Entra todo el pack a la vez.", "El octavo llega ya conectado a los segundas.", "El pie de freno del hooker retrocede, después hookea con el pie derecho por el canal 1."]),
]
SCRUM_EMPUJE = [
    ("UNO", "Aire y presión."),
    ("DOS", "Empuje."),
]
SCRUM_EMPUJE_NOTAS = ["Los cantos los hace el ala.", "Pequeña flexión de piernas antes de empujar, sin perder postura ni presión.",
                      "Empuje en pulsos, con extensión coordinada de las dos piernas.", "Paso corto y controlado: estabilidad antes que velocidad."]
SCRUM_REGLA = ["Postura", "Presión", "Fuerza", "Dominación"]
SCRUM_REGLA_TXT = ["Si se pierde la postura, se pierde la presión.", "Si se pierde la presión, se pierde la fuerza.", "Si se pierde la fuerza, se pierde la dominación."]


# ---------- progresiones: se leen de los Excel ----------
# errores de tipeo de las planillas (se corrigen al leerlas). Palabras sueltas y frases.
ARREGLOS = {
    # palabras
    "incio": "inicio", "opotunidad": "oportunidad", "ansisdad": "ansiedad", "rigidos": "rígidos", "rigido": "rígido", "enletecer": "enlentecer",
    "completjos": "complejos", "qquiebre": "quiebre", "abrzar": "abrazar", "fowards": "forwards", "superespecificos": "superespecíficos",
    "categorias": "categorías", "categoria": "categoría", "tactica": "táctica", "tacticas": "tácticas", "Codigo": "Código", "codigos": "códigos",
    "numerica": "numérica", "numero": "número", "rapido": "rápido", "rapidos": "rápidos", "linea": "línea", "Linea": "Línea", "lineas": "líneas",
    "mas": "más", "minimo": "mínimo", "lider": "líder", "atras": "atrás", "detras": "detrás", "proposito": "propósito", "pasasr": "pasar",
    "espontaneo": "espontáneo", "especificos": "específicos", "esten": "estén", "Angulos": "Ángulos", "angulos": "ángulos",
    "multiples": "múltiples", "explicito": "explícito", "espacialización": "especialización", "automatica": "automática",
    "Gestion": "Gestión", "gestion": "gestión", "enseñaza": "enseñanza", "Pendulo": "Péndulo", "pendulo": "péndulo", "adetro": "adentro",
    "wines": "wings", "chestin": "chesting", "Segun": "Según", "Tacle": "Tackle", "Caidas": "Caídas", "nocion": "noción", "limites": "límites",
    "transiciónes": "transiciones", "conciente": "consciente", "esctructurada": "estructurada",
    # frases
    "Empieza a parecer": "Empieza a aparecer", "de forma seguras": "de forma segura", "son el forma": "son en forma",
    "la perdida de miedo": "la pérdida del miedo", "El objetivo desarrollar": "El objetivo a desarrollar", "no juega sólo": "no juega solo",
    "identificar donde hay": "identificar dónde hay", "de a 2 o de a 3.": "de a 2 o de a 3).", '"Director de Orquesta.': '"Director de Orquesta".',
    "pasar la pelota,": "pasar la pelota.", "mantenerse pie": "mantenerse de pie", "integrados al sistemas": "integrados al sistema",
    "Ejemplo, perseguidores (wings), canales, n9,fondo)": "Por ejemplo: perseguidores (wings), canales, n9 y fondo.",
    "Jugador 1-2-3-4-": "Jugador 1-2-3-4.", '""ordenate para romper, si rompés, jugá"': "“Ordenate para romper; si rompés, jugá”",
    '"oportunidad"(explícito)': "“oportunidad” (explícito)", "de” nuestro lado”": "de “nuestro lado”",
    "“ cuando tackleas levántate": "“Cuando tackleás, levantate", '"si me frenan, paso la pelota para que el juego siga.”': "“si me frenan, paso la pelota para que el juego siga”.",
    '"el de al lado" “ el canal de al lado”': "“el de al lado”, “el canal de al lado”",
}
SEMILLA = re.compile(r"^concepto semilla:?$", re.I)
CONTACTO = re.compile(r"^caracter[ií]sticas del contacto:?$", re.I)
SOBRA = re.compile(r"^(lo que debemos evitar:?|progresi[oó]n pedag[oó]gica desde .*:)$", re.I)


def arreglar(t):
    t = re.sub(r"\s+", " ", t).strip()
    for mal, bien in ARREGLOS.items():
        t = re.sub(rf"(?<!\w){re.escape(mal)}" + (r"(?!\w)" if mal[-1].isalnum() else ""), bien, t)
    t = re.sub(r"[.,](?=[A-ZÁÉÍÓÚÑ])|,(?=[a-záéíóúñ])", lambda m: m.group(0) + " ", t)  # "sostenido.En", "n9,fondo"
    t = re.sub(r"\(\s+", "(", t)
    return re.sub(r"\. ([a-záéíóúñ])", lambda m: ". " + m.group(1).upper(), t)  # mayúscula después del punto


def bloques(lineas, todo_vinetas=False):
    """Texto de una celda -> (bloques, semillas). Bloque: ["li", texto] (viñeta), ["p", texto] o ["h", subtítulo].
    Las frases de "Concepto semilla" se separan para mostrarlas grandes. En juveniles cada renglón es un punto (todo_vinetas)."""
    out, semillas, esperando, contacto = [], [], False, False
    for l in lineas:
        l = arreglar(l)
        vineta = l[:1] in ("•", "-", "–")
        l = l.lstrip("•-– ").strip() if vineta else l
        if not l or SOBRA.match(l):
            continue
        if SEMILLA.match(l):
            esperando = True
            continue
        if esperando:
            semillas.append(l.strip(" “”\"'«»").rstrip("."))
            esperando = False
            continue
        if CONTACTO.match(l):
            out.append(["h", "El contacto"])
            contacto = True  # lo que sigue son puntos, aunque en la planilla no tengan viñeta
        else:
            out.append(["li" if vineta or todo_vinetas or contacto else "p", l])
    # renglones cortados al medio en la planilla ("alejar la" / "pelota, ...")
    junto = []
    for b in out:
        if junto and junto[-1][0] == b[0] and b[0] != "h" and b[1][:1].islower() and not junto[-1][1].endswith((".", ":", ")")):
            junto[-1][1] += " " + b[1]
        else:
            junto.append(b)
    return junto, semillas


def celdas(xlsx):
    import openpyxl
    ws = openpyxl.load_workbook(xlsx, data_only=True).worksheets[0]
    return {c.coordinate: [x for x in str(c.value).split("\n") if x.strip()] for fila in ws.iter_rows() for c in fila
            if c.value is not None and str(c.value).strip()}


def desde_excel(carpeta):
    carpeta = Path(carpeta)
    inf = celdas(carpeta / "PROGRESIONES" / "Juego general rugby infantil.xlsx")
    juv = celdas(carpeta / "PROGRESIONES" / "Juego general M13 a M19-los 50.xlsx")
    texto = lambda d, k: " ".join(arreglar(x) for x in d.get(k, []))

    infantiles = []
    for col in "CDEFGHI":
        cat = texto(inf, f"{col}2").replace("Halconcitos - ", "")
        fila = lambda n: bloques(inf.get(f"{col}{n}", []))
        ataque, s_at = fila(5)
        defensa, s_def = fila(7)
        infantiles.append({
            "cat": cat, "apodo": "Halconcitos" if cat == "M6" else "", "etapa": texto(inf, f"{col}1").capitalize(),
            "semillas": {"ataque": s_at, "defensa": s_def},
            "como_son": fila(3)[0], "objetivo": fila(4)[0], "ataque": ataque, "defensa": defensa,
            "progresion": fila(8)[0], "evitar": fila(9)[0],
        })

    juveniles = []
    for col in "DEFGHI":
        fila = lambda n: bloques(juv.get(f"{col}{n}", []), todo_vinetas=True)[0]
        juveniles.append({"cat": texto(juv, f"{col}1"), "ataque": fila(2), "ataque_ojo": fila(3), "defensa": fila(5), "defensa_ojo": fila(6)})
    claves = lambda k: [arreglar(x) for x in juv.get(k, []) if not x.strip().endswith("?")]  # se saca la pregunta que quedó anotada

    datos = {"infantiles": infantiles, "juveniles": juveniles, "claves": {"ataque": claves("J2"), "defensa": claves("J5")}}
    PROGRESIONES.parent.mkdir(exist_ok=True)
    PROGRESIONES.write_text(json.dumps(datos, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Listo: {PROGRESIONES} ({len(infantiles)} categorías infantiles, {len(juveniles)} juveniles)")

    line = line_desde_excel(carpeta / "PARA ENTRENADORES" / "line habitos.xlsx")
    LINE.write_text(json.dumps(line, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Listo: {LINE} ({len(line)} ejercicios de line)")
    fotos_desde_excel(carpeta / "LINE+MAUL" / "INFORMACION" / "Maul.Fazzi.Magali.xlsx")


# ---------- ejercicios: line (line habitos.xlsx), maul (Maul.Fazzi.Magali.xlsx) y los juegos de las planificaciones ----------
# Cada ejercicio: tipo, grupo, paso (orden dentro del grupo; 0 = sin orden), nombre, cómo se hace, en qué fijarse,
# material, categorías donde se usa (solo los juegos) y fotos (nombres de guia/fotos, que van cifradas aparte).
LINE = HERE / "guia" / "ejercicios_line.json"
FOTOS = HERE / "guia" / "fotos"  # fotos del maul, achicadas; exportar_entrenadores.py las cifra en web/entrenadores.fotos.json
ROLES_LINE = {"LANZADORES": "Lanzador", "SALTADORES": "Saltador", "LEVANTADORES": "Levantador", "TRIOS": "Tríos"}
ARREGLOS_LINE = {
    "maxima": "máxima", "terminacion": "terminación", "atura": "altura", "utilizacion": "utilización", "posicion": "posición",
    "basica": "básica", "finalizacion": "finalización", "isometrica": "isométrica", "tecnico": "técnico", "coordinacion": "coordinación",
    "q": "que", "contramov.": "contramovimiento.", "contra mov.": "contramovimiento.", "contra movimiento": "contramovimiento",
    "contra mov": "contramovimiento", "contramov": "contramovimiento", "( triceps)": "(tríceps)", "triceps": "tríceps", "gluteos": "glúteos",
    "tensión.": "tensión", "c/2": "cada 2", "trios": "tríos", "(tríceps) Si": "(tríceps). Si", "contraido": "contraído",
    "pies, Deben": "pies. Deben", "Valla o podemos usar el alambre del club": "Valla o el alambrado del club",
    "hacia atrás hacia atrás": "hacia atrás", "Si se va para atrás solte antes, si se va para adelante solte tarde": "Si se va para atrás, soltó antes; si se va para adelante, soltó tarde",
    "idem a la izquierda": "Lo mismo, girando a la izquierda", "idem pero estando de frente": "Lo mismo, pero de frente",
}


def _arreglar_line(t):
    t = re.sub(r"\s+", " ", t).strip()
    t = re.sub(r"\s+,", ",", re.sub(r"\(\s+", "(", t))  # "veloz , core" y "( gesto"
    for mal, bien in ARREGLOS_LINE.items():
        t = re.sub(rf"(?<!\w){re.escape(mal)}" + (r"(?!\w)" if mal[-1].isalnum() else ""), bien, t, flags=re.I)
    return t[:1].upper() + t[1:] if t else t


def line_desde_excel(xlsx):
    """Las columnas ROL / ACTIVIDAD / FACTOR A TRABAJAR / MATERIAL. El factor y el material suelen valer para varias filas
    seguidas (celdas combinadas): se copian a cada ejercicio."""
    import openpyxl
    ws = openpyxl.load_workbook(xlsx).worksheets[0]
    valor = {}
    for r in ws.merged_cells.ranges:  # una celda combinada vale para todas las filas que abarca
        v = ws.cell(r.min_row, r.min_col).value
        for f in range(r.min_row, r.max_row + 1):
            valor[(f, r.min_col)] = v
    leer = lambda f, c: valor.get((f, c), ws.cell(f, c).value)
    out, pasos = [], {}
    for f in range(2, ws.max_row + 1):
        rol, act = leer(f, 1), leer(f, 2)
        if not act or not rol or str(rol).strip().upper() not in ROLES_LINE:
            continue
        grupo = ROLES_LINE[str(rol).strip().upper()]
        pasos[grupo] = pasos.get(grupo, 0) + 1
        foco, mat = leer(f, 8), leer(f, 14)
        punto = lambda s: s.rstrip(". ") + "."  # en qué fijarse: siempre termina con punto, como el resto de la guía
        out.append({"id": f"line-{grupo.lower().replace('í', 'i')}-{pasos[grupo]}", "tipo": "Line", "grupo": grupo, "paso": pasos[grupo],
                    "nombre": _arreglar_line(str(act)).rstrip("."), "como": [], "foco": [punto(_arreglar_line(str(foco)))] if foco else [],
                    "material": _arreglar_line(str(mat)) if mat else "", "cats": [], "fotos": []})
    return out


def fotos_desde_excel(xlsx):
    """Saca las fotos de las hojas de maul, las achica (webp, 560 px de ancho) y las guarda con el nombre que usa MAUL."""
    import io
    import openpyxl
    from PIL import Image
    FOTOS.mkdir(parents=True, exist_ok=True)
    wb = openpyxl.load_workbook(xlsx)
    for ws, pref in ((wb["Maul Ofensivo "], "maul-of"), (wb["Maul defensivo"], "maul-def")):
        # cada foto va con la actividad que está a su altura en la planilla, de izquierda a derecha
        imgs = sorted(ws._images, key=lambda i: (i.anchor._from.row, i.anchor._from.col))
        filas = sorted({i.anchor._from.row for i in imgs})
        for i in imgs:
            n_act = filas.index(i.anchor._from.row) + (2 if pref == "maul-of" else 1)  # el ofensivo no tiene fotos en la actividad 1
            orden = [x for x in imgs if x.anchor._from.row == i.anchor._from.row].index(i) + 1
            im = Image.open(io.BytesIO(i._data())).convert("RGB")
            im.thumbnail((560, 560))
            im.save(FOTOS / f"{pref}-{n_act}-{orden}.webp", "WEBP", quality=62, method=6)
    print(f"Listo: {len(list(FOTOS.glob('*.webp')))} fotos en {FOTOS}")


# Maul (Maul.Fazzi.Magali.xlsx, hojas "Maul Ofensivo" y "Maul defensivo"). El nombre corto de cada actividad lo puse yo;
# el cómo y en qué fijarse son los textos de Maga.
MAUL_OBJ = {
    "Ofensivo": ["Conexiones: bajar bien al saltador, conectar rápido y abrazarlo fuerte. Intentar ganar la inercia.",
                 "Cuñas, +1 y hooker: entrar rápido protegiendo la pelota, cabeza adentro primero y empuje constante. Pasar la pelota segura al hooker.",
                 "En general: maul bajo, bien tomado desde el primer momento, hombros paralelos al ingoal, ganar la inercia."],
    "Defensivo": ["En general: ganar el impacto, maul bajo, entrar en el momento justo.",
                  "Los dos primeros llegan rápido, cabeza adentro, y tratan de meterse entre los levantadores y el saltador antes de que se conecten bien.",
                  "Mantener los hombros paralelos al ingoal si se forma entre la posición 2 y la 4."],
}
MAUL = [
    {"id": "maul-of-1", "tipo": "Maul", "grupo": "Ofensivo", "paso": 1, "nombre": "Plataforma de salto y conexiones",
     "como": ["La plataforma de salto practica la presentación de la pelota con el abrazo de las conexiones.",
              "Se busca la presión constante con el pecho y la cadera en el saltador. Hay que bajar al saltador con prolijidad y conectar rápido."],
     "foco": MAUL_OBJ["Ofensivo"][:1], "material": "", "fotos": []},
    {"id": "maul-of-2", "tipo": "Maul", "grupo": "Ofensivo", "paso": 2, "nombre": "Cuñas, +1 y hooker contra 3 escudos",
     "como": ["Las cuñas, el +1 y el hooker trabajan enfrentados a 3 escudos: buscar la pelota, entrar con las cuñas cabeza adentro y pasarle la pelota al hooker."],
     "foco": ["El +1 toma la pelota rápido, sin esperar a las cuñas.",
              "Conexiones fuertes de las cuñas, cabeza adentro, llevando las caderas adentro y empujando con los hombros paralelos al ingoal.",
              "La pelota llega segura al hooker."], "material": "3 escudos", "fotos": ["maul-of-2-1", "maul-of-2-2", "maul-of-2-3"]},
    {"id": "maul-of-3", "tipo": "Maul", "grupo": "Ofensivo", "paso": 3, "nombre": "Line y maul, sin defensa y con defensa",
     "como": ["5 minutos de line y maul sin defensa y después 5 minutos con defensa."],
     "foco": ["Buscar todo lo que se trabajó en las actividades anteriores.", "Con defensa: ganar la inercia y avanzar más allá de la línea blanca."],
     "material": "", "fotos": ["maul-of-3-1", "maul-of-3-2", "maul-of-3-3", "maul-of-3-4"]},
    {"id": "maul-def-1", "tipo": "Maul", "grupo": "Defensivo", "paso": 1, "nombre": "Ganar el impacto contra 2 escudos",
     "como": ["Trabajo para ganar el impacto en el momento justo, contra dos escudos."],
     "foco": ["Velocidad para llegar a ubicarse y entrar midiendo bien el momento.",
              "Pasar la línea del piso que marca la ventaja: así se gana el impacto y el maul ofensivo no gana en el primer momento.",
              "Entrar abajo, con la espalda recta y buen ángulo de empuje de frente."], "material": "2 escudos", "fotos": ["maul-def-1-1", "maul-def-1-2"]},
    {"id": "maul-def-2", "tipo": "Maul", "grupo": "Defensivo", "paso": 2, "nombre": "Los cuatro, bajos y tomados, contra 4 escudos",
     "como": ["Se suman los otros dos, con la cabeza afuera, buscando que los cuatro estén bajos y bien tomados, contra 4 escudos."],
     "foco": ["Posturas bajas.", "Conexiones de los brazos y de las caderas.", "Empujar de a dos juntos, ganando la línea."],
     "material": "4 escudos", "fotos": ["maul-def-2-1", "maul-def-2-2", "maul-def-2-3"]},
    {"id": "maul-def-3", "tipo": "Maul", "grupo": "Defensivo", "paso": 3, "nombre": "Defensa del maul completo",
     "como": ["Defensa del maul completo sin saltar a disputar: leer dónde va el salto y dónde es el impacto."],
     "foco": ["Postura baja y conexiones.", "Esta vez, también los hombros paralelos al ingoal."], "material": "", "fotos": []},
]
for _m in MAUL:
    _m["cats"] = []

# Juegos que más se repiten en las planificaciones de infantiles (MELE: M6 a M8, JUANCHI: M9 a M12).
# Para cada uno, la descripción más completa que anotó algún entrenador. "cats" = categorías donde aparece.
_M = lambda a, b: [f"M{n}" for n in range(a, b + 1)]
JUEGOS = [
    ("Entrada en calor", "Manchas", "Juego de inicio, todos en movimiento", ["Variantes de manchas: mancha pelota, mancha puente, perseguido salta, mancha venenosa.", "En parejas: nos movemos tomados de la mano; si me suelto, me pueden manchar."], "", _M(6, 8)),
    ("Entrada en calor", "Robar el tesoro", "Juego masivo, entrada en calor", ["Se arman 2 o 3 equipos. Cada uno tiene su base, donde guarda su tesoro (pelotas). El objetivo es robar las pelotas de los otros equipos.", "Si me roban una pelota y llego a tacklear al rival mientras vuelve a su base, la recupero.", "Variante de a 3: en un triángulo, cada uno defiende su esquina y roba conos de los otros, de a uno. El primero que junta 3, gana."], "Pelotas y conos", _M(7, 10)),
    ("Entrada en calor", "2 perros por 1 hueso", "Juego cooperativo, entrada en calor", ["Se enumera a los jugadores y se va variando 1 contra 1, 2 contra 2 y 3 contra 3.", "Muchas variantes y muchos jugadores activos: tiene que ser dinámico."], "Pelota", _M(7, 12)),
    ("Entrada en calor", "El reloj", "Pasar y atrapar", ["Un equipo forma una ronda y va sumando pases. Un jugador del otro equipo sale con pelota y tiene que dar la vuelta a la ronda antes de que terminen.", "No vale pasarle al compañero de al lado. Si la pelota cae, se reinicia la cuenta."], "Pelotas", ["M7", "M9", "M10"]),
    ("Entrada en calor", "Tocata de tobillos", "Movilidad y entrada en calor", ["Un cuadrado grande, con un equipo adentro y otro afuera.", "Entran de a 2 o 3 a sacar a los rivales del cuadrado tocándoles los tobillos. Se saca de a uno por pasada."], "Conos", _M(9, 12)),
    ("Entrada en calor", "Enumero 1 y 2", "Acción y reacción, persecución", ["Salen de espaldas y cada uno tiene un área a 8 metros.", "El número que dice el entrenador persigue al otro, que tiene que llegar a su área sin que lo toquen.", "Variar las salidas: de pie, de espaldas, pecho al piso, con giro a la izquierda, etc."], "Conos", _M(9, 12)),
    ("Contacto y tackle", "Luchas y grecorromana", "Pérdida del miedo al contacto, empujes", ["De rodillas, voltear al rival. Uno en el piso y el otro trata de darlo vuelta (una vez cada uno). En cuclillas, sacarle la mano de apoyo.", "Con pelota: de rodillas, enfrentados, con una pelota tomada entre los dos. Al «¡Ya!» luchan por quedarse con ella. El que la gana la presenta rápido, lo más lejos del rival, y el otro se pone de pie en postura de ruck."], "Pelota", _M(7, 12)),
    ("Contacto y tackle", "Indio tackle", "Evasión y tackle desde distintos ángulos", ["Juego de persecución en el que arrancan tackleando 2 jugadores."], "", _M(7, 12)),
    ("Contacto y tackle", "Tackle caminado", "Técnica de tackle: mismo pie, mismo hombro", ["En parejas, de espaldas y pegados. Al «¡Va!» dan dos pasos hacia adelante, se dan vuelta y se da el duelo.", "Los roles se eligen antes."], "", _M(9, 12)),
    ("Contacto y tackle", "El callejón de la muerte", "Tackle y chesting", ["3 puertas separadas 10 metros, cada una defendida por un tackleador. Salen de a 2.", "Si me tacklean, hago chesting; el apoyo levanta y sigue a la próxima puerta.", "Variante: salen 3 atacantes y, después de la tercera puerta, los 3 defensores se juntan y se juega 3 contra 3."], "Conos", _M(9, 12)),
    ("Pase y continuidad", "Sumatoria de pases y try", "Pase y reconocer los espacios vacíos", ["El equipo que ataca tiene que sumar 5 pases para poder hacer try. El que defiende recupera cuando la pelota cae o interceptando.", "El portador no puede moverse con la pelota. Valen los pases para adelante."], "Pelota", _M(8, 12)),
    ("Pase y continuidad", "Tocata australiana", "Continuidad del juego", ["El jugador que hace try pasa al equipo contrario: se genera superioridad numérica y aparecen espacios.", "Variante en cancha grande: después de un touch, el portador puede atacar la base. A los 3 touch, cambio de posesión."], "Pelota", _M(9, 12)),
    ("Pase y continuidad", "Tocata 2 segundos", "Continuidad y toma de decisión", ["Después del touch, el portador tiene 2 segundos para pasarle a un apoyo cercano.", "Si no aparece el apoyo, va al piso, hace chesting y su equipo pierde una posesión."], "Pelota", _M(9, 12)),
    ("Pase y continuidad", "Embudo de pases", "Atrapar y pasar corriendo, caderas al ingoal", ["Salen de a 4 o 5 jugadores pasándose la pelota por un embudo de 20 metros: el pase arranca corto y se va alargando.", "Vuelven por afuera, también pasando la pelota."], "Conos y pelotas", _M(9, 12)),
    ("Pase y continuidad", "El cuadrado de Maga", "Toma de decisión y avanzar en superioridad", ["Arranca con pase y rebote de pase. Después, variantes: con 2 pelotas, con defensa pasiva, ida y rebote.", "Ida: salen 5 en ola de pases. Vuelta: 3 contra 2, con tackle.", "El rebote va en sentido contrario al de la salida."], "Conos y pelotas", _M(11, 12)),
    ("Pase y continuidad", "Competencia de patadas", "Técnica de patada", ["Por parejas, con 2 conos o varillas paralelas separadas 8 metros.", "El jugador 1 recibe el pase del entrenador y patea a un cuadrado 8 metros delante del jugador 2. El 2 no puede salir del lugar: si la agarra en el aire, suma un punto."], "Conos o varillas y pelotas", _M(11, 12)),
    ("Coordinación y físico", "Escalerita de coordinación", "Coordinación", ["Diferentes variantes: de frente, hacia la izquierda y hacia la derecha.", "Se termina con una aceleración."], "Escalera de coordinación", _M(9, 12)),
    ("Coordinación y físico", "Carrera de relevos con pelota", "Coordinación, atrapar y pasar", ["Se arma un circuito con saltos, cambios de dirección, cuerpo a tierra, etc., y se corre en relevos con la pelota."], "Conos y pelotas", _M(8, 10)),
    ("Coordinación y físico", "Suicida", "Resistencia", ["5 líneas de conos separadas 6 metros.", "Desde el inicio se va a la primera línea y se vuelve, a la segunda y se vuelve, y así hasta la última. Al 75%."], "Conos", _M(9, 12)),
]


DIAGRAMAS = HERE / "guia" / "diagramas.json"  # los dibujos de los ejercicios (diagramas_entrenadores.py)


def ejercicios():
    line = json.loads(LINE.read_text(encoding="utf-8")) if LINE.exists() else []
    juegos = [{"id": "juego-" + re.sub(r"[^a-z0-9]+", "-", n.lower().translate(str.maketrans("áéíóúñ", "aeioun"))).strip("-"),
               "tipo": "Juegos", "grupo": g, "paso": 0, "nombre": n, "como": como, "foco": [foco], "material": mat, "cats": cats, "fotos": []}
              for g, n, foco, como, mat, cats in JUEGOS]
    todos = line + MAUL + juegos
    dibujos = json.loads(DIAGRAMAS.read_text(encoding="utf-8")) if DIAGRAMAS.exists() else {}
    for e in todos:
        if e["id"] in dibujos:
            e["dibujo"] = dibujos[e["id"]]
    return todos


# ---------- qué se espera de cada puesto (PERFIL JUGADOR CLUB LOS 50.pdf, son imágenes: pasado a mano) ----------
# "partido": las acciones ideales en un partido entero. "norte" (NORTE VERDE) no se muestra hasta que Maga diga qué es.
# "total" es el de Maga: en el 8, 10, 12, wings y 15 no da la suma de las columnas (le preguntamos cuál está bien), por eso no se muestra.
_EMP, _POS, _AUTO, _VIS, _MOT = "Empatía", "Actitud positiva", "Autoconfianza", "Visualización", "Motivación"
_partido = lambda norte, tackles, rucks, pases, quiebres, recuperadas, contactos, total: {
    "norte": norte, "tackles": tackles, "rucks": rucks, "pases": pases, "quiebres": quiebres,
    "recuperadas": recuperadas, "contactos": contactos, "total": total}
PUESTOS = [
    {"n": [1], "nombre": "Pilar izquierdo", "corto": "Pilar",
     "destrezas": [("Tackle", "Dominante cerca del ruck."), ("Ruck", "Primer apoyo."),
                   ("Scrum", "Fortaleza física. Técnica individual."),
                   ("Duelo con pelota", "Ganar el metro en el contacto. Continuidad en el juego.")],
     "mental": [_EMP, _AUTO, "Manejo del estrés", _MOT],
     "partido": _partido(16, 10, 16, 2, 0, 1, 3, 48)},
    {"n": [2], "nombre": "Hooker", "corto": "Hooker",
     "destrezas": [("Tackle", "Dominante cerca del ruck y en el espacio."), ("Ruck", "Primer apoyo."),
                   ("Scrum", "Fortaleza física. Técnica individual."),
                   ("Duelo con pelota", "Ganar el metro en el contacto. Continuidad en el juego.")],
     "mental": [_EMP, _POS, _AUTO, _VIS, _MOT, "Inspirar", "Contagiar positivamente", "Liderazgo"],
     "partido": _partido(16, 10, 16, 2, 0, 1, 4, 49)},
    {"n": [3], "nombre": "Pilar derecho", "corto": "Pilar",
     "destrezas": [("Tackle", "Dominante cerca del ruck."), ("Ruck", "Primer apoyo."),
                   ("Scrum", "Fortaleza física. Técnica individual."),
                   ("Duelo con pelota", "Ganar el metro en el contacto. Continuidad en el juego.")],
     "mental": [_EMP, _POS, _AUTO, "Manejo del estrés", _MOT],
     "partido": _partido(16, 10, 16, 2, 0, 1, 3, 48)},
    {"n": [4], "nombre": "Segunda línea izquierdo (liviano)", "corto": "2ª línea",
     "destrezas": [("Scrum", "Empujar con la posición del cuerpo correcta."), ("Tackle", "Dominante cerca del ruck y en el espacio."),
                   ("Duelo con pelota", "Ángulos de carrera. Avanzar en el contacto."), ("Ruck", "Limpieza de amenazas. Anticipación."),
                   ("Line", "Agilidad. Ductilidad. Timing.")],
     "mental": [_EMP, _POS, _AUTO, "Atención y concentración", _MOT, "Acción cognitiva"],
     "partido": _partido(16, 10, 16, 2, 0, 1, 6, 51)},
    {"n": [5], "nombre": "Segunda línea derecho (pesado)", "corto": "2ª línea",
     "destrezas": [("Scrum", "Empujar con la posición del cuerpo correcta."), ("Tackle", "Dominante cerca del ruck. Dominante en el espacio."),
                   ("Duelo con pelota", "Avanzar en el contacto. Impacto."), ("Ruck", "Limpieza de amenazas. Anticipación."),
                   ("Line y recepción de salidas", "Solidez. Regularidad.")],
     "mental": [_EMP, _POS, _AUTO, "Atención y concentración", _MOT],
     "partido": _partido(16, 10, 16, 2, 0, 1, 6, 51)},
    {"n": [6], "nombre": "Tercera línea cerrado (pesado)", "corto": "Ala",
     "destrezas": [("Trifulca y ruck", "Anticipación. Intensidad. Vehemencia. Posición del cuerpo correcta. Pesca. Limpieza de amenazas."),
                   ("Tackle", "Dominante cerca del ruck y en el espacio."),
                   ("Duelo con pelota", "Ángulos de carrera. Avanzar en el contacto.")],
     "mental": [_EMP, _POS, _AUTO, _MOT, "Manejo del estrés"],
     "partido": _partido(16, 10, 16, 0, 1, 2, 6, 51)},
    {"n": [7], "nombre": "Tercera línea abierto (liviano)", "corto": "Ala",
     "destrezas": [("Line y juego aéreo", "Buen salto. Ductilidad con las manos. Posición del cuerpo."),
                   ("Tackle", "Anticipación. Intensidad. Vehemencia. Despliegue. Posición del cuerpo correcta. Pesca. Limpieza de amenazas."),
                   ("Duelo con pelota", "Ángulos de carrera. Avanzar en el contacto.")],
     "mental": [_EMP, _POS, _AUTO, _VIS, _MOT],
     "partido": _partido(16, 10, 16, 0, 1, 2, 6, 51)},
    {"n": [8], "nombre": "Octavo", "corto": "Octavo",
     "destrezas": [("Line y juego aéreo", "Levantador. Ductilidad con las manos. Agilidad. Perspicacia. Timing. Recibe al fondo en las salidas."),
                   ("Tackle", "Dominante cerca del ruck y en el espacio. Pesca."),
                   ("Duelo con pelota", "Lleva la pelota: tracción, ángulos de carrera, avanzar en el contacto, defensa de brazo libre, "
                                        "generar continuidad. Impacto poderoso."),
                   ("Referencia del equipo", "Domina el sistema de ataque y defensa. Comunicación clara, positiva y efectiva. Comprende "
                                             "el juego. Lee antes las jugadas. Ve los espacios.")],
     "mental": [_EMP, _POS, _AUTO, _VIS, _MOT, "Liderazgo", "Regular emociones", "Transmitir", "Inspirar", "Contagiar positivamente"],
     "partido": _partido(15, 10, 16, 0, 3, 1, 8, 51)},
    {"n": [9], "nombre": "Medio scrum", "corto": "Medio",
     "destrezas": [("Pase", "Del piso, arriba, en el line y en el scrum. Velocidad y precisión."), ("Pie", "Cajón. Ocupación. Despeje."),
                   ("Visión de espacios", "Lee antes el juego y se anticipa. Forma de correr la cancha. Apoyo interno. Llegada al punto "
                                          "de encuentro. Ataque desde la base."),
                   ("Conducción", "Domina el sistema de ataque y defensa. Comunicación positiva y eficaz. Conecta. Domina el juego."),
                   ("Duelo con pelota", "Ángulos de carrera. Ganar el 1 contra 1. Juego de pies.")],
     "mental": [_EMP, _POS, "Capacidad de mando", _AUTO, _VIS, _MOT, "Liderazgo", "Transmitir", "Gran capacidad de comunicar",
                "Capacidad cognitiva", "Toma de decisiones", "Seguridad"],
     "partido": _partido(4, 4, 1, 80, 3, 0, 2, 94)},
    {"n": [10], "nombre": "Medio apertura", "corto": "Apertura",
     "destrezas": [("Pase", "Precisión y velocidad en las distintas opciones. Lanzador. Aplica el sistema de ataque y defensa."),
                   ("Pie", "Largo. Rastrón. Sombrero. Estrategia."),
                   ("Duelo con pelota", "Ángulos de carrera, adentro y afuera. Avanzar en el contacto. Dominar el 1 contra 1."),
                   ("Tackle", "Dominante."), ("Visión de espacios", "Lectura. Escaneo. Anticipación. Predicción."),
                   ("Conducción", "Capacidad de mando. Domina a fondo el sistema de ataque y defensa y el juego. "
                                  "Comunicación clara, positiva y efectiva.")],
     "mental": [_EMP, _POS, _AUTO, _VIS, _MOT, "Liderazgo", "Regular emociones", "Capacidad de transmitir", "Manejo del estrés",
                "Capacidad cognitiva", "Anticipación", "Concentración", "Enfoque", "Toma de decisiones", "Comunicador eficaz"],
     "partido": _partido(6, 6, 3, 30, 1, 0, 2, 77)},
    {"n": [11, 14], "nombre": "Wing", "corto": "Wing",
     "destrezas": [("Duelo con pelota", "Avanzar en el contacto. Ganar y dominar el 1 contra 1. Continuidad: piso, presentación o pase."),
                   ("Juego aéreo", "Pelotas arriba y cruzadas, altas y largas. Efectividad. Seguridad."),
                   ("Tackle", "Control de carrera. Aceleración. Timing. Elegir el tipo de tackle."),
                   ("Juego con el pie", "Largo. Rastrón. Sombrero. Up and under. Ocupación. Despeje."),
                   ("Ataque", "Creatividad. Buscarse trabajo. Sorpresa."),
                   ("Carreras", "Recto y afuera. Recto y adentro. Apoyo acelerando en los quiebres.")],
     "mental": [_EMP, _POS, _AUTO, _VIS, _MOT, "Regular emociones", "Lectura del juego", "Anticipación"],
     "partido": _partido(6, 4, 8, 4, 2, 0, 6, 43)},
    {"n": [12], "nombre": "Centro interno", "corto": "Centro",
     "destrezas": [("Pase", "Velocidad y precisión con variantes. Lanzador. Aplica el sistema de ataque y defensa."),
                   ("Tackle", "Dominante en todos los tipos de tackle."),
                   ("Duelo con pelota", "Ángulos de carrera propios. Variantes de profundidad. Tracción de piernas. Ganar el 1 contra 1. Continuidad."),
                   ("Conducción", "Sistema de ataque y defensa. Juego general.")],
     "mental": [_EMP, _POS, _AUTO, _VIS, _MOT, "Regular emociones"],
     "partido": _partido(12, 10, 16, 12, 1, 1, 10, 77)},
    {"n": [13], "nombre": "Centro externo", "corto": "Centro",
     "destrezas": [("Duelo con pelota", "Ángulos de carrera. Tracción de piernas. Variantes de profundidad. Ganar el 1 contra 1. Continuidad."),
                   ("Líneas de carrera", "Recto y adentro. Recto y afuera."),
                   ("Defensa", "Líder del sistema defensivo. Dominante en todos los tipos de tackle. Frenar o recuperar pelotas en los "
                               "rucks en defensa. Lee antes las jugadas cuando defiende. Comunica y ordena.")],
     "mental": [_EMP, _POS, _AUTO, _VIS, _MOT, "Control de emociones", "Comunicar bien"],
     "partido": _partido(12, 12, 12, 10, 1, 1, 10, 58)},
    {"n": [15], "nombre": "Fullback", "corto": "Fullback",
     "destrezas": [("Juego aéreo", "Pelotas arriba y cruzadas, altas y largas. Efectividad. Seguridad."),
                   ("Juego con el pie", "Ocupación. Despeje. Rastrón."),
                   ("Carreras", "Recto y afuera. Recto y adentro. Apoyo acelerando en los quiebres."),
                   ("Tackle", "Control de carrera. Aceleración. Timing. Elegir el tipo de tackle.")],
     "mental": [_EMP, _POS, _AUTO, _VIS, _MOT, "Regular emociones", "Lectura del juego", "Anticipación"],
     "partido": _partido(6, 4, 8, 4, 2, 0, 6, 44)},
]


# ---------- todo junto, para exportar_entrenadores.py ----------
def guia():
    prog = json.loads(PROGRESIONES.read_text(encoding="utf-8"))
    return {
        **prog,
        # lo que el chico tiene que traer al llegar a M13 (PROGRESIÓN JG INFANTILES.pptx)
        "llegar_m13": ["Intención de subir juntos en defensa.", "Responsabilidad del canal propio y conciencia del canal de al lado.",
                       "Hábito de apoyar después de un quiebre en ataque.", "Hábito de perseguir y alcanzar después de un quiebre rival.",
                       "Comprensión básica de ancho y profundidad.", "Responsabilidad individual simple y reconocimiento del compañero.",
                       "Seguridad técnica en el contacto (tackle, ruck, maul).", "Reorganizarse en ataque y en defensa después de los rucks.",
                       "Pases y recepciones para los dos lados, en carrera.", "Entrar corriendo, lanzados, para recibir.",
                       "Correr derecho y fijar al defensor.", "Tackle técnico de frente y en persecución."],
        "valores": ["Seguridad antes que competencia.", "Juego y diversión antes que ejercicios analíticos y resultados.",
                    "Técnica antes que intensidad.", "Comprensión del juego antes que obediencia a un sistema.",
                    "Desarrollo del jugador a largo plazo antes que resultados de corto plazo.", "Rotación de roles antes que especialización."],
        "lemas_juv": LEMAS_JUV,
        "cantos": CANTOS, "pilares": PILARES, "filosofia": FILOSOFIA, "oportunidad": OPORTUNIDAD, "decisiones": DECISIONES,
        "zonas": ZONAS, "canales": CANALES,
        "puestos": [dict(p, **PP.por_puesto(p["n"][0])) for p in PUESTOS],  # + perfil corporal y físico de los Pumas (perfiles_pumas.py)
        "ejercicios": ejercicios(),
        # los videos (título, duración y dónde va cada uno), que arma videos_entrenadores.py; los pedacitos están en Cloudflare R2
        "videos": json.loads((HERE / "guia" / "videos.json").read_text(encoding="utf-8")) if (HERE / "guia" / "videos.json").exists() else {},
        # las prácticas de los entrenadores, día por día, que arma practicas_entrenadores.py (sin el archivo de donde salió cada una)
        "practicas": [{k: v for k, v in p.items() if k != "origen"} for p in json.loads(PRACTICAS.read_text(encoding="utf-8"))] if PRACTICAS.exists() else [],
        "scrum": {"edades": SCRUM_EDADES, "metodo": SCRUM_METODO, "principios": SCRUM_PRINCIPIOS, "setup": SCRUM_SETUP,
                  "entrada": SCRUM_ENTRADA, "empuje": SCRUM_EMPUJE, "empuje_notas": SCRUM_EMPUJE_NOTAS,
                  "regla": SCRUM_REGLA, "regla_txt": SCRUM_REGLA_TXT,
                  # las sesiones de scrum de Coordinación, día por día (practicas_entrenadores.py)
                  "sesiones": json.loads(SCRUM_SESIONES.read_text(encoding="utf-8")) if SCRUM_SESIONES.exists() else []},
    }


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit('Uso: python guia_entrenadores.py "<carpeta de Drive descomprimida>"')
    desde_excel(sys.argv[1])
