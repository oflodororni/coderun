/* Code Run Sprint 01: datos y simulación, sin dependencias ni evaluación de código. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CodeRunCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TYPES = Object.freeze({ RUN: 'RUN', JUMP: 'JUMP', CROUCH: 'CROUCH', SHOOT: 'SHOOT', STOP: 'STOP', SPEED: 'SPEED', IF: 'IF' });
  const CONDITIONS = Object.freeze({ GAP_AHEAD: 'GAP_AHEAD', OBSTACLE_AHEAD: 'OBSTACLE_AHEAD', ENEMY_NEAR: 'ENEMY_NEAR' });
  const SPEEDS = Object.freeze([2, 4, 6, 8, 10]);
  const WORLD = Object.freeze({ start: .18, obstacle: { x: .35, width: .038, height: .115 }, gap: { start: .55, end: .64 }, bug: { x: .75, width: .035 }, goal: .935, heroWidth: .045 });
  let nextId = 1;

  function makeNode(type, options = {}) {
    if (!Object.values(TYPES).includes(type)) throw new Error('Tipo de bloque desconocido');
    const node = { id: `block-${nextId++}`, type };
    if (type === TYPES.IF) {
      if (!Object.values(CONDITIONS).includes(options.condition)) throw new Error('Condición desconocida');
      node.condition = options.condition;
      node.actions = [];
    }
    if (type === TYPES.SPEED) node.value = SPEEDS.includes(options.value) ? options.value : 6;
    return node;
  }

  function isAction(node) { return node && node.type !== TYPES.IF; }
  function validateProgram(nodes) {
    if (!Array.isArray(nodes)) throw new Error('El programa debe ser una lista');
    const seen = new Set();
    function check(node, depth) {
      if (!node || typeof node.id !== 'string' || seen.has(node.id) || !Object.values(TYPES).includes(node.type)) throw new Error('Bloque inválido o duplicado');
      seen.add(node.id);
      if (depth > 0 && !isAction(node)) throw new Error('Solo se anidan acciones dentro de condiciones');
      if (node.type === TYPES.IF) {
        if (!Object.values(CONDITIONS).includes(node.condition) || !Array.isArray(node.actions)) throw new Error('Condición inválida');
        node.actions.forEach(child => check(child, depth + 1));
      }
      if (node.type === TYPES.SPEED && !SPEEDS.includes(node.value)) throw new Error('Velocidad inválida');
    }
    nodes.forEach(node => check(node, 0));
    return true;
  }

  function findNode(nodes, id) {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.type === TYPES.IF) {
        const child = findNode(node.actions, id);
        if (child) return child;
      }
    }
    return null;
  }

  function removeNode(nodes, id) {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].id === id) return nodes.splice(i, 1)[0];
      if (nodes[i].type === TYPES.IF) {
        const child = removeNode(nodes[i].actions, id);
        if (child) return child;
      }
    }
    return null;
  }

  function insertNode(nodes, node, parentId = null, index = null) {
    const list = parentId ? findNode(nodes, parentId)?.actions : nodes;
    if (!list || (parentId && !isAction(node))) return false;
    list.splice(index === null ? list.length : Math.max(0, Math.min(index, list.length)), 0, node);
    validateProgram(nodes);
    return true;
  }

  function moveNode(nodes, id, parentId = null, index = null, indexAfterRemoval = false) {
    const node = findNode(nodes, id);
    if (!node || id === parentId || (parentId && !isAction(node))) return false;
    const parent = parentId ? findNode(nodes, parentId) : null;
    if (parentId && parent?.type !== TYPES.IF) return false;
    const origin = locate(nodes, id);
    if (!origin) return false;
    const adjusted = !indexAfterRemoval && origin.list === (parent ? parent.actions : nodes) && index !== null && origin.index < index ? index - 1 : index;
    removeNode(nodes, id);
    insertNode(nodes, node, parentId, adjusted);
    return true;
  }

  function locate(nodes, id) {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].id === id) return { list: nodes, index: i };
      if (nodes[i].type === TYPES.IF) {
        const child = locate(nodes[i].actions, id);
        if (child) return child;
      }
    }
    return null;
  }

  function cloneProgram(nodes) { validateProgram(nodes); return JSON.parse(JSON.stringify(nodes)); }
  function groundAt(x) { return x >= 0 && x < WORLD.gap.start || x >= WORLD.gap.end && x <= 1; }

  function createGame(program) {
    const script = cloneProgram(program);
    const game = {
      program: script, pc: 0, rules: [], activeUntil: 0, x: WORLD.start, y: 0, vy: 0, speed: 6, moving: false,
      pose: 'idle', crouchUntil: 0, poseUntil: 0, clock: 0, bugAlive: true,
      status: 'ready', outcome: null, activeId: null, flashId: null, flashUntil: 0,
      lastAction: null
    };
    return game;
  }

  function sensor(game, condition) {
    const front = game.x + WORLD.heroWidth;
    if (condition === CONDITIONS.GAP_AHEAD) {
      // Ausencia real de suelo en una muestra del camino por delante.
      const sample = front + .055;
      return groundAt(front) && !groundAt(sample);
    }
    if (condition === CONDITIONS.OBSTACLE_AHEAD) {
      const distance = WORLD.obstacle.x - front;
      return distance >= -.006 && distance <= .078 && game.y < WORLD.obstacle.height;
    }
    if (condition === CONDITIONS.ENEMY_NEAR) {
      const distance = WORLD.bug.x - front;
      return game.bugAlive && distance >= -.01 && distance <= .045;
    }
    return false;
  }

  function finish(game, outcome) {
    game.status = 'finished'; game.outcome = outcome; game.moving = false;
    game.activeId = null; game.pose = outcome === 'goal' ? 'idle' : 'fallen';
    return game;
  }

  function perform(game, node) {
    game.flashId = node.id; game.flashUntil = game.clock + .38; game.lastAction = node.type;
    switch (node.type) {
      case TYPES.RUN:
        game.moving = true; game.pose = 'running'; break;
      case TYPES.JUMP:
        if (game.y <= .005 && groundAt(game.x + WORLD.heroWidth / 2)) { game.vy = .64; game.y = .003; game.pose = 'jumping'; }
        break;
      case TYPES.CROUCH:
        game.crouchUntil = game.clock + .8; game.pose = 'crouching'; break;
      case TYPES.SHOOT:
        game.pose = 'shooting'; game.poseUntil = game.clock + .5;
        if (game.bugAlive && WORLD.bug.x - (game.x + WORLD.heroWidth) >= -.02 && WORLD.bug.x - (game.x + WORLD.heroWidth) <= .13) game.bugAlive = false;
        break;
      case TYPES.STOP:
        game.moving = false; game.pose = 'idle'; game.status = 'stopped'; break;
      case TYPES.SPEED:
        game.speed = node.value; break;
    }
  }

  function advanceProgram(game) {
    let steps = 0;
    while (game.status === 'running' && game.pc < game.program.length && steps++ < 25) {
      const node = game.program[game.pc];
      if (node.type === TYPES.IF) {
        // SI registra una regla reactiva; nunca detiene el programa esperando un sensor.
        game.rules.push({ node, wasTrue: false });
        game.pc++;
        continue;
      }
      perform(game, node);
      game.pc++;
    }
  }

  function evaluateRules(game) {
    for (const rule of game.rules) {
      if (game.status !== 'running') break;
      const isTrue = sensor(game, rule.node.condition);
      if (isTrue && !rule.wasTrue) {
        game.activeId = rule.node.id;
        game.activeUntil = game.clock + .55;
        for (const action of rule.node.actions) {
          perform(game, action);
          if (game.status !== 'running') break;
        }
      }
      rule.wasTrue = isTrue;
    }
  }

  function tick(game, dt = 1 / 60) {
    if (game.status !== 'running') return game;
    dt = Math.max(0, Math.min(dt, .05));
    game.clock += dt;
    advanceProgram(game);
    evaluateRules(game);
    if (game.status !== 'running') return game;
    if (game.clock >= game.activeUntil) game.activeId = game.moving ? game.program.findLast(node => node.type === TYPES.RUN)?.id || null : null;

    const prevX = game.x;
    if (game.moving) game.x += game.speed * .026 * dt;
    if (game.y > 0 || game.vy > 0 || !groundAt(game.x + WORLD.heroWidth / 2)) {
      game.vy -= 1 * dt;
      game.y += game.vy * dt;
      if (game.y <= 0 && groundAt(game.x + WORLD.heroWidth / 2)) { game.y = 0; game.vy = 0; }
    }
    if (game.y < -.14) return finish(game, 'gap');

    const front = game.x + WORLD.heroWidth;
    if (front > WORLD.obstacle.x && prevX < WORLD.obstacle.x + WORLD.obstacle.width && game.x < WORLD.obstacle.x + WORLD.obstacle.width && game.y < WORLD.obstacle.height) return finish(game, 'obstacle');
    if (game.bugAlive && front > WORLD.bug.x && game.x < WORLD.bug.x + WORLD.bug.width && game.y >= -.015 && game.y < .075) return finish(game, 'bug');
    if (game.x >= WORLD.goal && game.y >= 0) return finish(game, 'goal');
    if (game.clock > 35) return finish(game, 'timeout');

    if (game.y > .015) game.pose = 'jumping';
    else if (game.clock < game.crouchUntil) game.pose = 'crouching';
    else if (game.clock < game.poseUntil) game.pose = 'shooting';
    else game.pose = game.moving ? 'running' : 'idle';
    if (game.pc < game.program.length && !game.moving && game.y === 0 && game.clock > 1) return finish(game, 'stationary');
    if (game.pc >= game.program.length && !game.moving && game.y === 0 && game.clock > 1) return finish(game, 'stationary');
    return game;
  }

  function start(game) { if (game.status === 'ready') game.status = 'running'; return game; }
  function stop(game) { if (game.status === 'running') { game.status = 'stopped'; game.moving = false; game.activeId = null; game.pose = 'idle'; } return game; }

  return { TYPES, CONDITIONS, SPEEDS, WORLD, makeNode, validateProgram, findNode, removeNode, insertNode, moveNode, cloneProgram, createGame, sensor, groundAt, tick, start, stop };
});
