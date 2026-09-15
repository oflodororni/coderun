# Code Run — Sprint 01

La entrega funciona abriendo `index.html` directamente en Chrome o Edge. No hay servidor, paquetes, CDN ni compilación. `index.html` conserva la escena y las piezas visuales del Sprint 00; `app.js` adapta el mouse al editor y al render; `core.js` contiene el programa, sensores, estado y ejecución, sin depender del DOM.

## Programa de bloques

El editor guarda un árbol de objetos, no texto ejecutable. Cada bloque tiene un `id` y un `type` de una lista cerrada (`RUN`, `JUMP`, `CROUCH`, `SHOOT`, `STOP`, `SPEED`, `IF`). Una condición lleva un sensor enumerado y una lista de acciones:

```json
{
  "id": "block-7",
  "type": "IF",
  "condition": "GAP_AHEAD",
  "actions": [{ "id": "block-8", "type": "JUMP" }]
}
```

El programa arranca vacío: el estudiante decide qué estrategia construir. Los bloques de biblioteca son plantillas: arrastrar con Pointer Events crea una copia visual flotante y, al soltar, un objeto nuevo con otro `id`; pulsar también añade una copia. Al mover una pieza del programa, flota ese mismo elemento DOM y ocupa temporalmente su lugar un placeholder. El destino muestra `ANTES`, `DESPUÉS`, `DENTRO` o `AL FINAL`; las filas se reacomodan, las cavidades compatibles se iluminan y la pieza encaja con una animación breve. Soltar fuera del editor cancela el cambio. Las piezas se pueden reordenar, mover a la cavidad de una condición o eliminar con `×`/zona de descarte. El editor queda bloqueado mientras `EJECUTAR` está activo.

Solo se admiten acciones en el cuerpo de un `IF`; en este sprint no hay condicionales anidados, bucles, `REPETIR` ni `PARA CADA`. `SPEED` usa únicamente los valores permitidos 2, 4, 6, 8 y 10. `validateProgram` comprueba tipos, sensores, velocidad e identificadores únicos. No se usa `eval()` ni el ghost nativo de HTML5 drag & drop.

Al pulsar `EJECUTAR`, `createGame` toma una copia estructurada del programa. Cambiar el editor durante la ejecución no altera ese intento. `REINICIAR` restaura el mundo y conserva el programa; `LIMPIAR` vacía el árbol y restaura el mundo; `DETENER` corta el avance.

## Intérprete y mundo

`core.js` mantiene posición horizontal/vertical, velocidad, pose, movimiento, estado del Bug, contador de programa, reglas reactivas y bloque activo. `tick` avanza la simulación en pasos fijos de 1/60 s. `CORRE` inicia desplazamiento continuo; el intérprete pasa al siguiente bloque. Cada `SI` registra una regla independiente que consulta su sensor cada tick; no bloquea el contador ni exige un orden físico específico entre condiciones. Cuando su sensor pasa de falso a verdadero, ejecuta las acciones anidadas en orden. Así, `SI HAY HUECO` puede figurar antes o después de `SI HAY OBSTÁCULO` en el programa. Si el programa termina mientras `CORRE` está activo, el personaje sigue hasta una consecuencia del escenario o la meta. `DETENTE` para el desplazamiento.

Los sensores consultan el mundo actual:

- `GAP_AHEAD`: la muestra delante de los pies no tiene suelo; `groundAt` usa los segmentos de suelo visibles.
- `OBSTACLE_AHEAD`: la caja está en el rango próximo y el avatar aún está a su altura.
- `ENEMY_NEAR`: el Bug sigue vivo y está dentro del rango próximo.

El salto usa velocidad vertical y gravedad; la caja, el hueco, el Bug y la meta tienen colisiones/consecuencias reales. `DISPARA` emite el Pulso de Código y solo limpia al Bug si está al alcance. La física se limita a este primer recorrido; Glitch Volador y Malware Bot continúan como elementos visuales del escenario y no forman misiones adicionales.

No hay juicio de “respuesta incorrecta”: una estrategia estructuralmente válida siempre se ejecuta. Por ejemplo, `SI HAY HUECO → AGÁCHATE` activa la pose de agacharse; si el personaje cae, el feedback describe exactamente esa consecuencia. El bloque activo y las acciones disparadas se resaltan mientras el mundo avanza. El teclado no tiene entradas de movimiento, salto, disparo o pausa; solo Enter avanza la intro antes de iniciar el juego.

## Verificación

Ejecutar `node --test tests/core.test.js`. Las pruebas cubren dos estrategias ganadoras distintas: disparar al Bug y saltarlo sin eliminarlo. También cubren programas válidos que chocan con la caja, caen al agacharse ante el hueco, encuentran al Bug sin disparar o se detienen, además de velocidad, sensores, reglas `SI` y operaciones del árbol. En Windows, `node tests/browser-smoke.js` abre `index.html` en Edge sin servidor y comprueba Pointer Events reales: copia flotante de biblioteca, movimiento de la misma pieza del programa, placeholder antes/después/dentro, cavidad iluminada, reordenamiento, descarte y bloqueo durante ejecución. Luego comprueba una llegada a meta y un choque deliberado. La interfaz conserva la dirección visual del Sprint 00.
