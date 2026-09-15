const assert = require('node:assert/strict');
const test = require('node:test');
const C = require('../core.js');

function branch(condition, action) {
  const node = C.makeNode(C.TYPES.IF, { condition });
  node.actions.push(C.makeNode(action));
  return node;
}
function simulate(nodes) {
  const game = C.start(C.createGame(nodes));
  for (let i = 0; i < 2400 && game.status === 'running'; i++) C.tick(game);
  return game;
}
function winningProgram() {
  return [
    C.makeNode(C.TYPES.SPEED, { value: 6 }), C.makeNode(C.TYPES.RUN),
    branch(C.CONDITIONS.OBSTACLE_AHEAD, C.TYPES.JUMP),
    branch(C.CONDITIONS.GAP_AHEAD, C.TYPES.JUMP),
    branch(C.CONDITIONS.ENEMY_NEAR, C.TYPES.SHOOT)
  ];
}

test('programa con sensores reales supera caja, hueco y Bug', () => {
  const game = simulate(winningProgram());
  assert.equal(game.outcome, 'goal');
  assert.equal(game.bugAlive, false);
  assert.ok(game.x >= C.WORLD.goal);
});

test('otra secuencia válida también puede llegar, sin solución única codificada', () => {
  const nodes = winningProgram();
  // Una estrategia diferente esquiva al Bug con salto, sin usar el Pulso de Código.
  nodes[4].actions = [C.makeNode(C.TYPES.JUMP)];
  const game = simulate(nodes);
  assert.equal(game.outcome, 'goal');
  assert.equal(game.bugAlive, true);
});

test('las reglas SI no esperan ni dependen del orden físico de las amenazas', () => {
  const nodes = [
    branch(C.CONDITIONS.ENEMY_NEAR, C.TYPES.SHOOT),
    branch(C.CONDITIONS.GAP_AHEAD, C.TYPES.JUMP),
    C.makeNode(C.TYPES.RUN),
    branch(C.CONDITIONS.OBSTACLE_AHEAD, C.TYPES.JUMP)
  ];
  const game = simulate(nodes);
  assert.equal(game.outcome, 'goal');
  assert.equal(game.pc, nodes.length);
});

test('CORRE sin condiciones choca con la caja', () => {
  const game = simulate([C.makeNode(C.TYPES.RUN)]);
  assert.equal(game.outcome, 'obstacle');
});

test('SI HAY HUECO → AGÁCHATE se ejecuta y puede caer', () => {
  const program = [C.makeNode(C.TYPES.RUN), branch(C.CONDITIONS.OBSTACLE_AHEAD, C.TYPES.JUMP), branch(C.CONDITIONS.GAP_AHEAD, C.TYPES.CROUCH)];
  const game = simulate(program);
  assert.equal(game.outcome, 'gap');
  assert.equal(game.lastAction, C.TYPES.CROUCH);
});

test('sin DISPARA, el Bug sigue vivo y bloquea la ruta', () => {
  const program = [C.makeNode(C.TYPES.RUN), branch(C.CONDITIONS.OBSTACLE_AHEAD, C.TYPES.JUMP), branch(C.CONDITIONS.GAP_AHEAD, C.TYPES.JUMP)];
  const game = simulate(program);
  assert.equal(game.outcome, 'bug');
  assert.equal(game.bugAlive, true);
});

test('DETENTE realmente detiene el avance', () => {
  const game = simulate([C.makeNode(C.TYPES.RUN), C.makeNode(C.TYPES.STOP)]);
  assert.equal(game.status, 'stopped');
  assert.equal(game.x, C.WORLD.start);
});

test('velocidad elegida modifica el movimiento real', () => {
  const slow = C.start(C.createGame([C.makeNode(C.TYPES.SPEED, { value: 2 }), C.makeNode(C.TYPES.RUN)]));
  const fast = C.start(C.createGame([C.makeNode(C.TYPES.SPEED, { value: 10 }), C.makeNode(C.TYPES.RUN)]));
  for (let i = 0; i < 30; i++) { C.tick(slow); C.tick(fast); }
  assert.ok(fast.x > slow.x);
});

test('copiar, reordenar, anidar y eliminar conserva árbol estructurado', () => {
  const nodes = [C.makeNode(C.TYPES.RUN), branch(C.CONDITIONS.GAP_AHEAD, C.TYPES.JUMP)];
  const extra = C.makeNode(C.TYPES.CROUCH);
  assert.equal(C.insertNode(nodes, extra), true);
  assert.equal(C.moveNode(nodes, extra.id, nodes[1].id, 0), true);
  assert.equal(nodes[1].actions[0].id, extra.id);
  assert.equal(C.moveNode(nodes, nodes[1].id, nodes[1].id, 0), false);
  assert.equal(C.removeNode(nodes, extra.id).id, extra.id);
  assert.equal(C.validateProgram(nodes), true);
});

test('sensores dependen del mundo y no de un resultado predeterminado', () => {
  const game = C.createGame([]);
  assert.equal(C.sensor(game, C.CONDITIONS.GAP_AHEAD), false);
  game.x = .46;
  assert.equal(C.sensor(game, C.CONDITIONS.GAP_AHEAD), true);
  game.x = .23;
  assert.equal(C.sensor(game, C.CONDITIONS.OBSTACLE_AHEAD), true);
  game.x = .67;
  assert.equal(C.sensor(game, C.CONDITIONS.ENEMY_NEAR), true);
  game.bugAlive = false;
  assert.equal(C.sensor(game, C.CONDITIONS.ENEMY_NEAR), false);
});
