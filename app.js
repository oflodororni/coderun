/* Interfaz Sprint 01. El mouse edita bloques; nunca controla al personaje. */
(() => {
  'use strict';
  const C = globalThis.CodeRunCore;
  const $ = selector => document.querySelector(selector);
  const intro = $('#intro');
  const slides = [...document.querySelectorAll('.intro-slide')];
  const dots = [...document.querySelectorAll('.intro-dots span')];
  const library = $('#blockBank');
  const canvas = $('.program-canvas');
  const stack = $('#programStack');
  const trash = $('#trashZone');
  const hero = $('#hero');
  const scene = $('.route-scene');
  const bug = $('#bug');
  const feedback = $('#runFeedback');
  const hud = $('#hudState');
  const pill = $('#statePill');
  const progress = $('#progressBar');
  const actionChip = $('#actionChip');
  const labels = {
    RUN: ['»', 'CORRE', 'motion'], JUMP: ['↑', 'SALTA', 'motion'], CROUCH: ['↓', 'AGÁCHATE', 'motion'],
    SHOOT: ['◉', 'DISPARA', 'action'], STOP: ['■', 'DETENTE', 'action'], SPEED: ['#', 'VELOCIDAD', 'value']
  };
  const conditions = {
    GAP_AHEAD: 'SI HAY HUECO', OBSTACLE_AHEAD: 'SI HAY OBSTÁCULO', ENEMY_NEAR: 'SI HAY ENEMIGO'
  };
  let introStep = 0;
  let program = [];
  let game = C.createGame(program);
  let frameId = 0;
  let lastFrame = 0;
  let accumulator = 0;
  let dragPayload = null;

  // Se conserva la secuencia de introducción del Sprint 00.
  if (new URLSearchParams(location.search).has('skip-intro')) intro.classList.add('is-done');
  function showSlide(index) {
    introStep = Math.min(index, slides.length - 1);
    slides.forEach((slide, i) => slide.classList.toggle('is-active', i === introStep));
    dots.forEach((dot, i) => dot.classList.toggle('on', i === introStep));
  }
  document.querySelectorAll('[data-next]').forEach(button => button.addEventListener('click', () => showSlide(introStep + 1)));
  $('#startGame').addEventListener('click', () => intro.classList.add('is-done'));
  document.addEventListener('keydown', event => {
    // Únicamente la intro admite Enter; no hay teclas de movimiento o disparo.
    if (event.key === 'Enter' && !intro.classList.contains('is-done')) introStep < 2 ? showSlide(introStep + 1) : intro.classList.add('is-done');
  });

  function hint(message) {
    feedback.textContent = message;
    feedback.classList.add('is-visible');
  }
  function hideHint() { feedback.classList.remove('is-visible'); }

  function seedProgram() {
    program = [C.makeNode(C.TYPES.SPEED, { value: 6 }), C.makeNode(C.TYPES.RUN)];
    for (const [condition, action] of [
      [C.CONDITIONS.OBSTACLE_AHEAD, C.TYPES.JUMP],
      [C.CONDITIONS.GAP_AHEAD, C.TYPES.JUMP],
      [C.CONDITIONS.ENEMY_NEAR, C.TYPES.SHOOT]
    ]) {
      const branch = C.makeNode(C.TYPES.IF, { condition });
      branch.actions.push(C.makeNode(action));
      program.push(branch);
    }
  }

  function renderNode(node) {
    if (node.type === C.TYPES.IF) {
      const title = conditions[node.condition];
      return `<div class="program-structure" draggable="true" data-id="${node.id}">
        <div class="program-title"><i>?</i>${title}<button class="delete-block" type="button" data-delete="${node.id}" aria-label="Eliminar ${title}">×</button></div>
        <div class="program-body" data-parent-id="${node.id}">${node.actions.map(renderNode).join('')}</div>
      </div>`;
    }
    const [icon, label, style] = labels[node.type];
    const speedSelect = node.type === C.TYPES.SPEED
      ? `<select data-speed="${node.id}" aria-label="Seleccionar velocidad">${C.SPEEDS.map(value => `<option value="${value}" ${value === node.value ? 'selected' : ''}>${value}</option>`).join('')}</select>` : '';
    return `<div class="program-piece ${style}" draggable="true" data-id="${node.id}"><i>${icon}</i>${label}${speedSelect}<button class="delete-block" type="button" data-delete="${node.id}" aria-label="Eliminar ${label}">×</button></div>`;
  }
  function renderProgram() {
    C.validateProgram(program);
    stack.innerHTML = program.map(renderNode).join('');
    setActive();
  }
  function setActive() {
    stack.querySelectorAll('[data-id]').forEach(piece => {
      piece.classList.toggle('is-active', game.status === 'running' && (piece.dataset.id === game.activeId || piece.dataset.id === game.flashId && game.clock < game.flashUntil));
    });
  }

  function dragData(event) {
    // Chrome/Edge no permiten leer getData durante dragover; se conserva el dato del dragstart local.
    if (dragPayload) return dragPayload;
    try { return JSON.parse(event.dataTransfer.getData('text/plain')); } catch { return null; }
  }
  function clearDropStyles() { document.querySelectorAll('.drop-before,.drop-after,.drop-into').forEach(element => element.classList.remove('drop-before', 'drop-after', 'drop-into')); }
  function targetForDrop(event) {
    const piece = event.target.closest('.program-piece,.program-structure');
    const body = event.target.closest('.program-body');
    if (body && piece === body.parentElement) return { parentId: body.dataset.parentId, index: null, mark: body, className: 'drop-into' };
    if (piece && piece !== stack) {
      const list = piece.parentElement;
      const parentId = list.classList.contains('program-body') ? list.dataset.parentId : null;
      const siblings = [...list.children].filter(child => child.matches('.program-piece,.program-structure'));
      const after = event.clientY > piece.getBoundingClientRect().top + piece.getBoundingClientRect().height / 2;
      return { parentId, index: siblings.indexOf(piece) + Number(after), mark: piece, className: after ? 'drop-after' : 'drop-before' };
    }
    if (body) return { parentId: body.dataset.parentId, index: null, mark: body, className: 'drop-into' };
    return { parentId: null, index: null, mark: stack, className: 'drop-into' };
  }
  function canInsert(data, target) {
    if (!data || game.status === 'running') return false;
    const type = data.source === 'library' ? data.type : C.findNode(program, data.id)?.type;
    return !!type && (!target.parentId || type !== C.TYPES.IF);
  }

  library.addEventListener('dragstart', event => {
    const block = event.target.closest('.code-block');
    if (!block || game.status === 'running') { event.preventDefault(); return; }
    dragPayload = { source: 'library', type: block.dataset.type, condition: block.dataset.condition || null };
    event.dataTransfer.setData('text/plain', JSON.stringify(dragPayload));
    event.dataTransfer.effectAllowed = 'copy';
  });
  stack.addEventListener('dragstart', event => {
    if (event.target.closest('button,select') || game.status === 'running') { event.preventDefault(); return; }
    const piece = event.target.closest('[data-id]');
    if (!piece) { event.preventDefault(); return; }
    dragPayload = { source: 'program', id: piece.dataset.id };
    event.dataTransfer.setData('text/plain', JSON.stringify(dragPayload));
    event.dataTransfer.effectAllowed = 'move';
  });
  stack.addEventListener('dragover', event => {
    const data = dragData(event); const target = targetForDrop(event);
    if (!canInsert(data, target)) return;
    event.preventDefault(); clearDropStyles(); target.mark.classList.add(target.className);
    event.dataTransfer.dropEffect = data.source === 'library' ? 'copy' : 'move';
  });
  stack.addEventListener('drop', event => {
    const data = dragData(event); const target = targetForDrop(event);
    clearDropStyles();
    if (!canInsert(data, target)) { hint('Dentro de una condición solo van acciones.'); return; }
    event.preventDefault();
    if (data.source === 'library') {
      const node = C.makeNode(data.type, { condition: data.condition, value: 6 });
      C.insertNode(program, node, target.parentId, target.index);
    } else C.moveNode(program, data.id, target.parentId, target.index);
    dragPayload = null; renderProgram(); hideHint();
  });
  stack.addEventListener('dragend', () => { dragPayload = null; clearDropStyles(); });
  library.addEventListener('dragend', () => { dragPayload = null; clearDropStyles(); });

  // Clic añade una copia al final: alternativa accesible al arrastre, nunca una orden al avatar.
  library.addEventListener('click', event => {
    const block = event.target.closest('.code-block');
    if (!block || game.status === 'running') return;
    C.insertNode(program, C.makeNode(block.dataset.type, { condition: block.dataset.condition || null, value: 6 }));
    renderProgram(); hideHint();
  });
  stack.addEventListener('click', event => {
    const id = event.target.closest('[data-delete]')?.dataset.delete;
    if (!id || game.status === 'running') return;
    C.removeNode(program, id); renderProgram();
  });
  stack.addEventListener('change', event => {
    const id = event.target.dataset.speed;
    if (!id || game.status === 'running') return;
    const node = C.findNode(program, id);
    node.value = Number(event.target.value); C.validateProgram(program);
  });
  trash.addEventListener('dragover', event => {
    const data = dragData(event);
    if (data?.source !== 'program' || game.status === 'running') return;
    event.preventDefault(); trash.classList.add('drop-into'); event.dataTransfer.dropEffect = 'move';
  });
  trash.addEventListener('dragleave', () => trash.classList.remove('drop-into'));
  trash.addEventListener('drop', event => {
    event.preventDefault(); trash.classList.remove('drop-into');
    const data = dragData(event);
    if (data?.source !== 'program' || game.status === 'running') return;
    dragPayload = null; C.removeNode(program, data.id); renderProgram();
  });

  function renderGame() {
    const px = scene.clientHeight;
    hero.style.left = `${game.x * 100}%`;
    hero.style.bottom = `${px * .24 + game.y * px - 3}px`;
    hero.className = `hero-wrap ${game.pose === 'idle' ? '' : game.pose}`;
    bug.classList.toggle('hit', !game.bugAlive);
    progress.style.width = `${Math.max(18, Math.min(100, game.x / C.WORLD.goal * 100))}%`;
    if (game.status === 'running') {
      hud.textContent = 'EJECUTANDO'; pill.textContent = 'EJECUTANDO'; pill.classList.add('running');
      actionChip.textContent = game.lastAction === C.TYPES.SHOOT ? 'PULSO DE CÓDIGO' : game.pose === 'jumping' ? 'SALTANDO' : game.pose === 'crouching' ? 'AGÁCHADO' : game.moving ? 'CORRIENDO' : 'LISTO';
    } else {
      pill.classList.remove('running');
      const text = game.status === 'finished' ? (game.outcome === 'goal' ? 'META' : 'TERMINADO') : game.status === 'stopped' ? 'DETENIDO' : 'LISTO';
      hud.textContent = text; pill.textContent = text;
    }
    setActive();
  }

  function outcomeText(outcome) {
    const consequences = {
      goal: 'Llegó a la meta.', obstacle: 'Chocó con el obstáculo.', gap: 'Cayó en el hueco.',
      bug: 'El Bug seguía en su camino.', timeout: 'No llegó a la meta a tiempo.', stationary: 'Se quedó donde estaba.'
    };
    return `El personaje hizo exactamente lo que le programaste. ${consequences[outcome] || ''}`;
  }
  function animate(time) {
    if (game.status !== 'running') return;
    if (!lastFrame) lastFrame = time;
    accumulator += Math.min((time - lastFrame) / 1000, .1);
    lastFrame = time;
    while (accumulator >= 1 / 60 && game.status === 'running') { C.tick(game, 1 / 60); accumulator -= 1 / 60; }
    renderGame();
    if (game.status === 'finished') { canvas.classList.remove('is-running'); library.classList.remove('is-running'); hint(outcomeText(game.outcome)); return; }
    if (game.status === 'stopped') { canvas.classList.remove('is-running'); library.classList.remove('is-running'); hint('El personaje hizo exactamente lo que le programaste. Se detuvo.'); return; }
    frameId = requestAnimationFrame(animate);
  }
  function stopFrame() { cancelAnimationFrame(frameId); frameId = 0; lastFrame = 0; accumulator = 0; canvas.classList.remove('is-running'); library.classList.remove('is-running'); }
  function resetWorld() {
    stopFrame(); game = C.createGame(program); renderGame(); hideHint();
  }
  $('#runBtn').addEventListener('click', () => {
    resetWorld(); C.start(game); canvas.classList.add('is-running'); library.classList.add('is-running');
    renderGame(); frameId = requestAnimationFrame(animate);
  });
  $('#stopBtn').addEventListener('click', () => {
    if (game.status !== 'running') return;
    C.stop(game); stopFrame(); renderGame(); hint('El personaje hizo exactamente lo que le programaste. Se detuvo.');
  });
  $('#resetBtn').addEventListener('click', resetWorld);
  $('#clearBtn').addEventListener('click', () => { program = []; renderProgram(); resetWorld(); });
  window.addEventListener('resize', renderGame);

  seedProgram(); renderProgram(); resetWorld();
})();
