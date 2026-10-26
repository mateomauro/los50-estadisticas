"""Los dibujos de los ejercicios de la sección Entrenadores, como las fichas de World Rugby (T1 Rugby) y de la RFL:
la cancha vista desde arriba (con sus medidas en metros, solo si el ejercicio las dice), ataque en azul y defensa en rojo,
carrera = flecha llena, pase = flecha punteada, patada = punteada curva, y el ejercicio en 1 a 3 cuadros, paso a paso.

Son un primer dibujo hecho a partir de lo que está escrito en cada ejercicio ("revisar": falta que Coordinación los confirme).
Se dibujan los que tienen espacio y movimiento (juegos, maul y las carreras de line); los de técnica del cuerpo
(lanzar arrodillado, saltar con gemelos…) se entienden mejor con el video.

Uso:  python diagramas_entrenadores.py   ->  guia/diagramas.json (guia_entrenadores.py lo suma a cada ejercicio)

Medidas en metros: x de izquierda a derecha, y de arriba hacia abajo. El ataque va hacia arriba.
En line y maul, el lateral es el borde izquierdo y el line se arma a lo ancho.
Cada cuadro: conos, a (ataque), d (defensa), e (entrenador), p (pelota), esc (escudo o bolsa), area [x, y, ancho, alto, nombre],
escalera [x, y, largo], lin [x1, y1, x2, y2, nombre], rot [x, y, texto] (rótulos sobre la cancha); flechas corre / pasa / patea: listas de puntos.
"""
import json
import math
from pathlib import Path

HERE = Path(__file__).parent
SALIDA = HERE / "guia" / "diagramas.json"


def esq(x1, y1, x2, y2):
    """los 4 conos de un cuadrado"""
    return [[x1, y1], [x2, y1], [x1, y2], [x2, y2]]


def fila(x1, y1, x2, y2, n):
    """n cosas en fila, de un punto a otro"""
    return [[round(x1 + (x2 - x1) * i / (n - 1), 2), round(y1 + (y2 - y1) * i / (n - 1), 2)] for i in range(n)]


def ronda(cx, cy, r, n, desde=90):
    return [[round(cx + r * math.cos(math.radians(desde + 360 * i / n)), 2), round(cy - r * math.sin(math.radians(desde + 360 * i / n)), 2)] for i in range(n)]


def J(pos, *nums):
    """jugadores en esas posiciones, con su número o letra (si tienen)"""
    return [[x, y, (nums[i] if i < len(nums) else "")] for i, (x, y) in enumerate(pos)]


LINE_LETRAS = {"H": "Hooker (lanza)", "S": "Saltador", "L": "Levantador"}
LATERAL = lambda h: [0.15, 0, 0.15, h, "Lateral"]

D = {
    # ---------------------------------------------------------------- juegos
    "juego-manchas": {
        "cancha": [15, 15], "jugadores": "Todo el grupo",
        "cuadros": [{"txt": "Uno es la mancha (en rojo) y persigue. Al que toca, pasa a ser mancha.",
                     "conos": esq(0.6, 0.6, 14.4, 14.4), "d": J([[7.5, 7.5]]),
                     "a": J([[3, 3], [11.5, 2.5], [2.5, 11.5], [12.5, 12], [4.5, 8], [10.5, 10], [8, 3.8]]),
                     "corre": [[[7.5, 7.5], [9.6, 9.3]], [[10.5, 10], [13, 12.6]], [[4.5, 8], [2, 7]], [[8, 3.8], [9.5, 1.6]]]}]},
    "juego-robar-el-tesoro": {
        "cancha": [20, 24], "jugadores": "2 o 3 equipos",
        "cuadros": [
            {"txt": "Cada equipo cuida su base con su tesoro (las pelotas) y sale a robar las del otro.",
             "area": [[2, 19.5, 16, 3.5, "Base azul"], [2, 1, 16, 3.5, "Base roja"]],
             "p": [[6, 21.4], [10, 21.4], [14, 21.4], [6, 2.9], [10, 2.9], [14, 2.9]],
             "a": J([[4, 16], [9, 15], [15, 16.5]]), "d": J([[5, 8], [11, 9], [15.5, 7.5]]),
             "corre": [[[9, 15], [10, 5]], [[11, 9], [12.5, 19]]]},
            {"txt": "Si lo tacklean antes de llegar a su base, el otro equipo recupera la pelota.",
             "area": [[2, 19.5, 16, 3.5, "Base azul"], [2, 1, 16, 3.5, "Base roja"]],
             "p": [[6, 21.4], [14, 21.4], [6, 2.9], [14, 2.9], [10.7, 8.4]],
             "a": J([[10, 8.8]]), "d": J([[15, 10.5]]),
             "corre": [[[10, 8.8], [10, 18.5]], [[15, 10.5], [11, 13.5]]]}]},
    "juego-2-perros-por-1-hueso": {
        "cancha": [16, 20], "jugadores": "Dos equipos numerados",
        "cuadros": [
            {"txt": "El entrenador dice un número («2»): salen los dos 2 a buscar el hueso (la pelota).",
             "a": J(fila(3, 18.5, 13, 18.5, 4), "1", "2", "3", "4"), "d": J(fila(3, 1.5, 13, 1.5, 4), "1", "2", "3", "4"),
             "p": [[8, 10]], "e": [[15, 10]],
             "corre": [[[6.33, 18], [7.6, 11.2]], [[6.33, 2], [7.6, 8.8]]]},
            {"txt": "El que agarra la pelota trata de llegar a la línea rival y el otro lo persigue. Después, 2 contra 2 y 3 contra 3.",
             "a": J([[3, 18.5], [13, 18.5], [10, 18.5], [8, 10.4]], "1", "4", "3", "2"),
             "d": J([[3, 1.5], [10, 1.5], [13, 1.5], [9.5, 8.2]], "1", "3", "4", "2"),
             "p": [[8.6, 9.9]], "corre": [[[8, 10], [7.4, 2.6]], [[9.5, 8], [8.4, 4.6]]]}]},
    "juego-el-reloj": {
        "cancha": [14, 14], "jugadores": "Dos equipos",
        "cuadros": [{"txt": "La ronda suma pases (nunca al de al lado). El rival da la vuelta con la pelota: ¿llega antes de que terminen?",
                     "a": J(ronda(7, 7, 3.3, 7)), "d": J([[7, 1.4]]), "p": [[7.6, 1.1], [7, 3.7]],
                     "pasa": [[[7, 3.9], [9.4, 9.1]], [[9.6, 8.9], [4.4, 8.9]]],
                     "corre": [[[7.8, 1.4], [11.2, 2.8], [12.6, 7], [11.2, 11.2], [7, 12.6], [2.8, 11.2], [1.4, 7], [2.6, 3.2]]]}]},
    "juego-tocata-de-tobillos": {
        "cancha": [17, 20], "jugadores": "Dos equipos",
        "cuadros": [{"txt": "Un equipo adentro del cuadrado y otro afuera. Entran de a 2 o 3 a sacar rivales tocándoles los tobillos: uno por pasada.",
                     "conos": esq(1, 1, 16, 16), "d": J([[4, 5], [9, 3.6], [12.5, 8.5], [6, 10.5], [9, 7]]),
                     "a": J(fila(3, 18.6, 14, 18.6, 5)),
                     "corre": [[[5.75, 18.2], [5.8, 11.4]], [[8.5, 18.2], [8.9, 8]]]}]},
    "juego-enumero-1-y-2": {
        "cancha": [10, 20], "jugadores": "En parejas",
        "cuadros": [{"txt": "Salen de espaldas. El entrenador dice «1»: el 1 persigue al 2, que tiene que llegar a su área sin que lo toquen.",
                     "area": [[0.5, 0.4, 9, 1.8, "Área del 2"], [0.5, 17.8, 9, 1.8, "Área del 1"]],
                     "a": J([[5, 10.6]], "1"), "d": J([[5, 9.4]], "2"), "e": [[9, 10]],
                     "rot": [[8.2, 6, "8 m"], [8.2, 14.2, "8 m"]],
                     "corre": [[[5, 9.2], [5, 2.6]], [[5.5, 10.4], [5.7, 4.2]]]}]},
    "juego-luchas-y-grecorromana": {
        "cancha": [12, 6], "jugadores": "En parejas",
        "cuadros": [{"txt": "De rodillas, enfrentados y con una pelota tomada entre los dos. Al «¡Ya!», luchan por quedarse con ella.",
                     "a": J([[2.5, 3.9], [6, 3.9], [9.5, 3.9]]), "d": J([[2.5, 2.1], [6, 2.1], [9.5, 2.1]]),
                     "p": [[2.5, 3], [6, 3], [9.5, 3]]}]},
    "juego-indio-tackle": {
        "cancha": [20, 20], "jugadores": "Todo el grupo",
        "cuadros": [
            {"txt": "Arrancan 2 tackleando en el medio. Los demás cruzan de punta a punta.",
             "conos": esq(0.6, 0.6, 19.4, 19.4), "d": J([[7, 10], [13, 10]]), "a": J(fila(2.5, 18.4, 17.5, 18.4, 6)),
             "corre": [[[5.5, 18], [4.5, 2.5]], [[11.5, 18], [10, 2.5]], [[17.5, 18], [16.8, 2.5]], [[7, 10], [5.6, 12.6]], [[13, 10], [11.3, 12.4]]]},
            {"txt": "El que es tackleado se suma a los tackleadores.",
             "conos": esq(0.6, 0.6, 19.4, 19.4), "d": J([[4.5, 9.5], [8.5, 10.5], [12, 9.5], [15.5, 10.5]]),
             "a": J(fila(5, 1.6, 15, 1.6, 4)),
             "corre": [[[5, 2], [6, 17.5]], [[11.67, 2], [13, 17.5]], [[8.5, 10.5], [7.2, 7.5]]]}]},
    "juego-tackle-caminado": {
        "cancha": [8, 10], "jugadores": "En parejas",
        "cuadros": [
            {"txt": "En parejas, de espaldas y pegados. Al «¡Va!», dan dos pasos hacia adelante.",
             "a": J([[4, 5.5]]), "d": J([[4, 4.5]]), "p": [[4.6, 5.9]],
             "corre": [[[4, 5.9], [4, 7.6]], [[4, 4.1], [4, 2.4]]]},
            {"txt": "Se dan vuelta y se da el duelo: mismo pie, mismo hombro. Los roles se eligen antes.",
             "a": J([[4, 7.8]]), "d": J([[4, 2.2]]), "p": [[4.6, 8.1]],
             "corre": [[[4, 7.4], [4, 5.4]], [[4, 2.6], [4, 4.6]]]}]},
    "juego-el-callejon-de-la-muerte": {
        "cancha": [10, 36], "jugadores": "De a 2 (o 3) contra 3 tackleadores",
        "cuadros": [
            {"txt": "3 puertas separadas 10 m, cada una defendida por un tackleador. Salen de a 2.",
             "conos": [[2.5, 27], [7.5, 27], [2.5, 17], [7.5, 17], [2.5, 7], [7.5, 7]],
             "d": J([[5, 26.4], [5, 16.4], [5, 6.4]]), "a": J([[4, 34], [6, 34]]), "p": [[4.6, 33.6]],
             "rot": [[8.6, 22, "10 m"], [8.6, 12, "10 m"]],
             "corre": [[[4, 33.5], [4.6, 28.6]], [[6, 33.5], [6.3, 29.4]]]},
            {"txt": "Si tacklean al portador, hace chesting. El apoyo levanta la pelota y sigue a la próxima puerta.",
             "conos": [[2.5, 27], [7.5, 27], [2.5, 17], [7.5, 17], [2.5, 7], [7.5, 7]],
             "d": J([[5, 26.2], [5, 16.4], [5, 6.4]]), "a": J([[4.4, 27], [6.4, 29]]), "p": [[5, 27.7]],
             "corre": [[[6.4, 28.6], [5.5, 27.8], [6, 18.4]]]}]},
    "juego-sumatoria-de-pases-y-try": {
        "cancha": [20, 26], "jugadores": "Dos equipos",
        "cuadros": [{"txt": "Para poder hacer try, el equipo tiene que sumar 5 pases. El que tiene la pelota no se mueve; valen los pases para adelante.",
                     "area": [[0, 0, 20, 3, "Try"]],
                     "a": J([[5, 21], [10.5, 17], [15.5, 13.5], [8, 10.5], [13, 6.5]], "1", "2", "3", "4", "5"),
                     "d": J([[7.5, 14.5], [12.5, 11], [17, 9], [4.5, 8]]), "p": [[5.7, 20.6]],
                     "pasa": [[[5.6, 20.6], [9.9, 17.4]], [[11.1, 16.6], [14.9, 13.9]], [[14.9, 13.2], [8.6, 10.8]], [[8.6, 10.1], [12.4, 6.9]]],
                     "corre": [[[13, 6], [13, 1.6]]]}]},
    "juego-tocata-australiana": {
        "cancha": [20, 30], "jugadores": "Dos equipos",
        "cuadros": [
            {"txt": "Se juega una tocata. El que hace try…",
             "area": [[0, 0, 20, 3, "Try"]],
             "a": J([[4, 21], [8, 19], [12, 20], [16, 18], [10, 14.5]]), "d": J([[5, 12], [9, 10.5], [13.5, 11.5], [16.5, 9.5], [10, 7.5]]),
             "p": [[10.6, 14.1]], "pasa": [[[12, 19.6], [10.4, 15.2]]], "corre": [[[10, 14], [7.5, 1.6]]]},
            {"txt": "…pasa al otro equipo: se genera superioridad numérica y aparecen espacios.",
             "area": [[0, 0, 20, 3, "Try"]],
             "a": J([[4, 21], [8, 19], [12, 20], [16, 18]]), "d": J([[5, 12], [9, 10.5], [13.5, 11.5], [16.5, 9.5], [10, 7.5], [7.5, 1.6]], "", "", "", "", "", "+1"),
             "corre": [[[7.5, 2.2], [7.2, 6.8]]]}]},
    "juego-tocata-2-segundos": {
        "cancha": [20, 20], "jugadores": "Dos equipos",
        "cuadros": [
            {"txt": "Después del touch, el portador tiene 2 segundos para pasarle a un apoyo cercano.",
             "a": J([[10, 11], [13.5, 13], [6.5, 13.5]]), "d": J([[10.4, 9.6], [5, 8], [15, 8.5]]), "p": [[10.5, 11.4]],
             "rot": [[11.6, 9.3, "¡Touch!"]], "pasa": [[[10.6, 11.6], [13, 12.8]]]},
            {"txt": "Si no aparece el apoyo, va al piso y hace chesting: su equipo pierde una posesión.",
             "a": J([[10, 11.3], [15.5, 17]]), "d": J([[10.4, 9.6], [5, 8], [15, 8.5]]), "p": [[10, 12.2]],
             "rot": [[11.6, 12.8, "Al piso"]]}]},
    "juego-embudo-de-pases": {
        "cancha": [20, 24], "jugadores": "De a 4 o 5",
        "cuadros": [
            {"txt": "Salen de a 4 o 5 pasándose la pelota por un embudo de 20 m: el pase arranca corto y se va alargando.",
             "conos": fila(7, 22, 1, 2, 5) + fila(13, 22, 19, 2, 5),
             "a": J([[7.8, 20.5], [9.3, 21], [10.7, 21], [12.2, 20.5]]), "p": [[8.3, 20.1]],
             "rot": [[17.6, 12.5, "20 m"]],
             "corre": [[[7.8, 20], [3.4, 4]], [[9.3, 20.4], [7.8, 4]], [[10.7, 20.4], [12.2, 4]], [[12.2, 20], [16.6, 4]]],
             "pasa": [[[8.4, 19.9], [9.1, 20.3]], [[5.4, 10.6], [8.6, 10.6]], [[9.7, 10.6], [14, 10.6]]]},
            {"txt": "Vuelven por afuera del embudo, también pasándose la pelota.",
             "conos": fila(7, 22, 1, 2, 5) + fila(13, 22, 19, 2, 5),
             "a": J([[0.6, 3], [19.4, 3]]),
             "corre": [[[0.6, 3.5], [3.6, 22.6]], [[19.4, 3.5], [16.4, 22.6]]], "pasa": [[[1.5, 12], [4.6, 18]]]}]},
    "juego-el-cuadrado-de-maga": {
        "cancha": [20, 20], "jugadores": "De a 5 (ida) y 3 contra 2 (vuelta)",
        "cuadros": [
            {"txt": "Ida: salen 5 en ola de pases.",
             "conos": esq(1, 1, 19, 19), "a": J(fila(3, 18, 15, 15, 5)), "p": [[3.6, 17.6]],
             "pasa": [[[3.6, 17.5], [5.5, 17.4]], [[6.6, 16.8], [8.4, 16.6]]],
             "corre": [[[3, 17.5], [3, 3]], [[6, 16.7], [6.5, 3]], [[9, 16], [10, 3]], [[12, 15.3], [13.5, 3]], [[15, 14.5], [17, 3]]]},
            {"txt": "Vuelta: 3 contra 2, con tackle. El rebote va en sentido contrario al de la salida.",
             "conos": esq(1, 1, 19, 19), "a": J([[5, 2.5], [10, 2.5], [15, 2.5]]), "d": J([[7.5, 12], [12.5, 12]]), "p": [[10.6, 2.1]],
             "corre": [[[5, 3], [5, 17]], [[10, 3], [10, 10.5]], [[15, 3], [15, 17]], [[7.5, 12], [9, 9.8]], [[12.5, 12], [11, 9.8]]]}]},
    "juego-competencia-de-patadas": {
        "cancha": [10, 20], "jugadores": "Por parejas",
        "cuadros": [{"txt": "El 1 recibe el pase del entrenador y patea al cuadrado del 2. El 2 no puede moverse: si la agarra en el aire, suma un punto.",
                     "conos": fila(1, 13, 9, 13, 4) + fila(1, 5, 9, 5, 4),
                     "area": [[3.5, 2, 3, 3, ""]], "a": J([[5, 14.2], [5, 3.5]], "1", "2"), "e": [[8.6, 16.6]], "p": [[8, 16.2]],
                     "rot": [[8.4, 9.1, "8 m"]],
                     "pasa": [[[8, 16.1], [5.6, 14.7]]], "patea": [[[5, 13.6], [5, 4.3]]]}]},
    "juego-escalerita-de-coordinacion": {
        "cancha": [8, 16], "jugadores": "De a uno",
        "cuadros": [{"txt": "Pasa la escalera con distintos pasos (de frente, hacia la izquierda, hacia la derecha) y termina con una aceleración.",
                     "escalera": [[4, 5, 7]], "a": J([[4, 14.4]]), "rot": [[5.1, 2.3, "Aceleración"]],
                     "corre": [[[4, 13.9], [4, 1.2]]]}]},
    "juego-carrera-de-relevos-con-pelota": {
        "cancha": [16, 22], "jugadores": "En equipos, por relevos",
        "cuadros": [{"txt": "Un circuito con saltos, cambios de dirección y cuerpo a tierra. Se corre en relevos, con la pelota.",
                     "conos": [[3, 16], [5, 13], [3, 10], [5, 7], [4, 3], [11, 16], [13, 13], [11, 10], [13, 7], [12, 3]],
                     "a": J([[4, 18.8], [4, 20], [4, 21.2], [12, 18.8], [12, 20], [12, 21.2]]), "p": [[4.6, 18.4], [12.6, 18.4]],
                     "corre": [[[4, 18.3], [2.2, 16], [5.8, 13], [2.2, 10], [5.8, 7], [4, 2.2]], [[12, 18.3], [10.2, 16], [13.8, 13], [10.2, 10], [13.8, 7], [12, 2.2]]]}]},
    "juego-suicida": {
        "cancha": [10, 30], "jugadores": "Todo el grupo",
        "cuadros": [{"txt": "5 líneas de conos separadas 6 m. Ir a la primera línea y volver, a la segunda y volver, y así hasta la última. Al 75%.",
                     "conos": fila(1, 28, 9, 28, 4) + fila(1, 22, 9, 22, 4) + fila(1, 16, 9, 16, 4) + fila(1, 10, 9, 10, 4) + fila(1, 4, 9, 4, 4),
                     "a": J([[4, 29.2]]), "rot": [[8.6, 25, "6 m"]],
                     "corre": [[[3.6, 28.6], [3.6, 22.6]], [[4.4, 22.6], [4.4, 28.6]], [[5.6, 28.6], [5.6, 16.6]], [[6.4, 16.6], [6.4, 28.6]]]}]},

    # ---------------------------------------------------------------- maul (el lateral a la izquierda; el ataque va hacia arriba)
    "maul-of-1": {
        "cancha": [14, 12], "jugadores": "Hooker, saltador, 2 levantadores y 2 conexiones",
        "letras": {"H": "Hooker", "S": "Saltador", "L": "Levantador", "C": "Conexión"},
        "cuadros": [
            {"txt": "El hooker lanza y la plataforma (dos levantadores y el saltador) sube a recibir.",
             "lin": [LATERAL(12), [0.15, 5.6, 14, 5.6, "Línea del line"]],
             "a": J([[0.9, 6.3], [5, 6.6], [6.2, 6.6], [7.4, 6.6]], "H", "L", "S", "L"), "pasa": [[[1.4, 6.0], [5.9, 6.0]]]},
            {"txt": "Bajan al saltador con prolijidad y las conexiones lo abrazan rápido: presión con el pecho y la cadera.",
             "lin": [LATERAL(12), [0.15, 5.6, 14, 5.6, "Línea del line"]],
             "a": J([[5.2, 7], [6.2, 6.9], [7.2, 7], [4.2, 10.2], [8.2, 10.2]], "L", "S", "L", "C", "C"), "p": [[6.2, 6.3]],
             "corre": [[[4.4, 9.8], [5.6, 8]], [[8, 9.8], [6.8, 8]]]}]},
    "maul-of-2": {
        "cancha": [12, 12], "jugadores": "Cuñas, +1 y hooker contra 3 escudos",
        "letras": {"H": "Hooker", "+1": "El +1 (toma la pelota)", "C": "Cuña"},
        "cuadros": [{"txt": "El +1 toma la pelota rápido; las cuñas entran cabeza adentro contra los escudos y la pelota llega segura al hooker.",
                     "esc": [[4.5, 4.4], [6, 4.4], [7.5, 4.4]], "d": J([[4.5, 3.2], [6, 3.2], [7.5, 3.2]]),
                     "a": J([[6, 6.6], [4.5, 7.8], [7.5, 7.8], [6, 10.2]], "+1", "C", "C", "H"), "p": [[6, 6]],
                     "corre": [[[4.5, 7.4], [4.6, 5.2]], [[7.5, 7.4], [7.4, 5.2]]], "pasa": [[[6, 7.1], [6, 9.6]]]}]},
    "maul-of-3": {
        "cancha": [14, 12], "jugadores": "El line completo",
        "letras": {"H": "Hooker"},
        "cuadros": [
            {"txt": "5 minutos de line y maul sin defensa…",
             "lin": [LATERAL(12), [0.15, 5.6, 14, 5.6, "Línea del line"]],
             "a": J([[0.9, 6.3]] + fila(3, 6.6, 11, 6.6, 7), "H"), "pasa": [[[1.4, 6.0], [6.6, 6.0]]],
             "corre": [[[6.3, 7.2], [6.3, 3.2]]]},
            {"txt": "…y después 5 minutos con defensa: ganar la inercia y avanzar más allá de la línea blanca.",
             "lin": [LATERAL(12), [0.15, 5.6, 14, 5.6, ""], [0.15, 2.2, 14, 2.2, "Línea blanca"]],
             "a": J([[0.9, 6.3]] + fila(3, 6.6, 11, 6.6, 7), "H"), "d": J(fila(3, 4.6, 11, 4.6, 7)), "pasa": [[[1.4, 6.0], [6.6, 6.0]]],
             "corre": [[[6.3, 7.2], [6.3, 1.6]]]}]},
    "maul-def-1": {
        "cancha": [12, 12], "jugadores": "2 defensores contra 2 escudos",
        "cuadros": [{"txt": "Los dos primeros llegan rápido, miden el momento y entran bajos contra los escudos, pasando la línea del piso que marca la ventaja.",
                     "lin": [[0.15, 6.2, 12, 6.2, "Ventaja"]],
                     "esc": [[5.2, 7.2], [6.8, 7.2]], "a": J([[5.2, 8.4], [6.8, 8.4]]), "d": J([[5.2, 2.8], [6.8, 2.8]]),
                     "corre": [[[5.2, 3.3], [5.2, 6.5]], [[6.8, 3.3], [6.8, 6.5]]]}]},
    "maul-def-2": {
        "cancha": [12, 12], "jugadores": "4 defensores contra 4 escudos",
        "cuadros": [{"txt": "Se suman los otros dos, con la cabeza afuera: los cuatro bajos y bien tomados, empujando de a dos juntos.",
                     "lin": [[0.15, 6.2, 12, 6.2, "Ventaja"]],
                     "esc": [[3.9, 7.2], [5.3, 7.2], [6.7, 7.2], [8.1, 7.2]], "a": J([[3.9, 8.4], [5.3, 8.4], [6.7, 8.4], [8.1, 8.4]]),
                     "d": J([[3.9, 2.8], [5.3, 2.8], [6.7, 2.8], [8.1, 2.8]]),
                     "corre": [[[3.9, 3.3], [3.9, 6.5]], [[5.3, 3.3], [5.3, 6.5]], [[6.7, 3.3], [6.7, 6.5]], [[8.1, 3.3], [8.1, 6.5]]]}]},
    "maul-def-3": {
        "cancha": [14, 12], "jugadores": "El line completo, contra ataque",
        "letras": {"H": "Hooker"},
        "cuadros": [{"txt": "Sin saltar a disputar: leer dónde va el salto y dónde es el impacto, y defender el maul completo.",
                     "lin": [LATERAL(12), [0.15, 5.6, 14, 5.6, "Línea del line"]],
                     "a": J([[0.9, 6.3]] + fila(3, 6.6, 11, 6.6, 7), "H"), "d": J(fila(3, 4.6, 11, 4.6, 7)), "pasa": [[[1.4, 6.0], [6.6, 6.0]]],
                     "corre": [[[4.3, 4.2], [5.8, 5.2]], [[8, 4.2], [6.8, 5.2]]]}]},

    # ---------------------------------------------------------------- line: tríos y carreras del levantador
    "line-trios-1": {"cancha": [10, 8], "jugadores": "En tríos", "letras": LINE_LETRAS,
                     "cuadros": [{"txt": "El trío en el lugar: levantador, saltador, levantador. A la orden: arriba y sostener.",
                                  "lin": [LATERAL(8)], "conos": [[3.4, 5.2], [6.6, 5.2]], "a": J([[4, 4], [5, 4], [6, 4]], "L", "S", "L"), "e": [[8.6, 6.6]]}]},
    "line-trios-2": {"cancha": [10, 8], "jugadores": "En tríos", "letras": LINE_LETRAS,
                     "cuadros": [{"txt": "Dos pasos hacia atrás (alejándose del lateral) y salto.",
                                  "lin": [LATERAL(8)], "conos": [[3.4, 5.2], [8.6, 5.2]], "a": J([[3.8, 4], [4.8, 4], [5.8, 4]], "L", "S", "L"),
                                  "corre": [[[3.8, 3.3], [5.6, 3.3]], [[4.8, 2.6], [6.6, 2.6]], [[5.8, 3.3], [7.6, 3.3]]]}]},
    "line-trios-3": {"cancha": [10, 8], "jugadores": "En tríos", "letras": LINE_LETRAS,
                     "cuadros": [{"txt": "Dos pasos hacia adelante (hacia el lateral) y arriba.",
                                  "lin": [LATERAL(8)], "conos": [[1.4, 5.2], [6.6, 5.2]], "a": J([[4.2, 4], [5.2, 4], [6.2, 4]], "L", "S", "L"),
                                  "corre": [[[4.2, 3.3], [2.4, 3.3]], [[5.2, 2.6], [3.4, 2.6]], [[6.2, 3.3], [4.4, 3.3]]]}]},
    "line-trios-4": {"cancha": [10, 8], "jugadores": "En tríos", "letras": LINE_LETRAS,
                     "cuadros": [{"txt": "Los levantadores esperan; el saltador entra entre los dos y arriba.",
                                  "lin": [LATERAL(8)], "a": J([[4, 3.6], [6, 3.6], [5, 6.6]], "L", "L", "S"),
                                  "corre": [[[5, 6.1], [5, 4.1]]]}]},
    "line-trios-5": {"cancha": [14, 8], "jugadores": "2 o más tríos", "letras": LINE_LETRAS,
                     "cuadros": [{"txt": "A la orden, el trío corre al espacio que se le indica dentro del line y sube al saltador.",
                                  "lin": [LATERAL(8)], "conos": [[7.5, 5], [12.6, 5]],
                                  "a": J([[2.4, 4], [3.4, 4], [4.4, 4], [9, 4], [10, 4], [11, 4]], "L", "S", "L", "L", "S", "L"), "e": [[12.6, 7]],
                                  "corre": [[[3.4, 3.3], [7, 3.3]]]}]},
    "line-trios-6": {"cancha": [14, 9], "jugadores": "2 tríos que compiten", "letras": LINE_LETRAS,
                     "cuadros": [{"txt": "Dos tríos compiten: corren al cono, suben al saltador y sostienen, a máxima velocidad.",
                                  "conos": [[11.5, 2.5], [11.5, 6.5]],
                                  "a": J([[1.6, 1.8], [2.6, 1.8], [3.6, 1.8], [1.6, 5.8], [2.6, 5.8], [3.6, 5.8]], "L", "S", "L", "L", "S", "L"),
                                  "corre": [[[4.2, 2.5], [10.8, 2.5]], [[4.2, 6.5], [10.8, 6.5]]]}]},
    "line-levantador-5": {"cancha": [10, 8], "jugadores": "De a uno", "letras": LINE_LETRAS,
                          "cuadros": [{"txt": "De perfil, entre dos bolsas. A la orden, va a la que le dicen y la lanza al aire (el gesto de levantar).",
                                       "esc": [[2.6, 4], [7.4, 4]], "a": J([[5, 4]], "L"), "e": [[5, 7]], "corre": [[[5.5, 4], [6.6, 4]]]}]},
    "line-levantador-6": {"cancha": [10, 8], "jugadores": "De a uno", "letras": LINE_LETRAS,
                          "cuadros": [{"txt": "Lo mismo, pero de frente: va a la bolsa que le dicen y la lanza al aire.",
                                       "esc": [[3.4, 2.4], [6.6, 2.4]], "a": J([[5, 5.4]], "L"), "e": [[8.6, 6.8]], "corre": [[[4.8, 4.9], [3.7, 3.1]]]}]},
    "line-levantador-7": {"cancha": [12, 8], "jugadores": "De a uno", "letras": LINE_LETRAS,
                          "cuadros": [{"txt": "A la orden, corre a la bolsa y la levanta (el gesto de levantar).",
                                       "esc": [[9.6, 4]], "a": J([[2, 4]], "L"), "e": [[2, 6.8]], "corre": [[[2.5, 4], [8.7, 4]]]}]},
    "line-levantador-8": {"cancha": [12, 9], "jugadores": "De a uno", "letras": LINE_LETRAS,
                          "cuadros": [{"txt": "Dos bolsas: a la orden, corre a la que le dicen y la levanta.",
                                       "esc": [[9.6, 2.2], [9.6, 6.8]], "a": J([[2, 4.5]], "L"), "e": [[2, 7.6]],
                                       "corre": [[[2.5, 4.2], [8.7, 2.5]], [[2.5, 4.8], [8.7, 6.5]]]}]},
}


def main():
    for k, v in D.items():
        v["revisar"] = True
    SALIDA.write_text(json.dumps(D, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Listo: {SALIDA} ({len(D)} dibujos)")


if __name__ == "__main__":
    main()
