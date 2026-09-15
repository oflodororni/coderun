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
  let pointerDrag = null;
  let suppressLibraryClickUntil = 0;

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

  function renderNode(node) {
    if (node.type === C.TYPES.IF) {
      const title = conditions[node.condition];
      return `<div class="program-structure" data-id="${node.id}">
        <div class="program-title"><i>?</i>${title}<button class="delete-block" type="button" data-delete="${node.id}" aria-label="Eliminar ${title}">×</button></div>
        <div class="program-body" data-parent-id="${node.id}">${node.actions.map(renderNode).join('')}</div>
      </div>`;
    }
    const [icon, label, style] = labels[node.type];
    const speedSelect = node.type === C.TYPES.SPEED
      ? `<select data-speed="${node.id}" aria-label="Seleccionar velocidad">${C.SPEEDS.map(value => `<option value="${value}" ${value === node.value ? 'selected' : ''}>${value}</option>`).join('')}</select>` : '';
    return `<div class="program-piece ${style}" data-id="${node.id}"><i>${icon}</i>${label}${speedSelect}<button class="delete-block" type="button" data-delete="${node.id}" aria-label="Eliminar ${label}">×</button></div>`;
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

  function rows(list) { return [...list.children].filter(child => child.matches('.program-piece,.program-structure')); }
  function candidateAt(x, y) {
    const hit = document.elementFromPoint(x, y);
    if (!hit) return null;
    if (trash.contains(hit)) return pointerDrag.source === 'program' ? { kind: 'trash' } : null;
    if (!canvas.contains(hit)) return null;
    const body = hit.closest('.program-body');
    const row = hit.closest('.program-piece,.program-structure');
    if (body && row === body.parentElement) return { kind: 'inside', list: body, parentId: body.dataset.parentId, index: rows(body).length };
    if (row && stack.contains(row)) {
      const list = row.parentElement;
      const parentId = list.classList.contains('program-body') ? list.dataset.parentId : null;
      const after = y >= row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2;
      return { kind: after ? 'after' : 'before', list, parentId, index: rows(list).indexOf(row) + Number(after), row };
    }
    if (body) return { kind: 'inside', list: body, parentId: body.dataset.parentId, index: rows(body).length };
    return { kind: 'inside', list: stack, parentId: null, index: rows(stack).length };
  }
  function allowed(candidate) {
    return candidate && game.status !== 'running' && (candidate.kind === 'trash' || !candidate.parentId || pointerDrag.type !== C.TYPES.IF && pointerDrag.id !== candidate.parentId);
  }
  function beginFloating() {
    const drag = pointerDrag;
    if (!drag || drag.started) return;
    drag.started = true;
    const rect = drag.sourceElement.getBoundingClientRect();
    const width = Math.min(rect.width, drag.source === 'library' ? 260 : 420);
    drag.offsetX = Math.max(15, Math.min(drag.startX - rect.left, width - 15));
    drag.offsetY = Math.max(12, Math.min(drag.startY - rect.top, rect.height - 8));
    drag.float = drag.source === 'library' ? drag.sourceElement.cloneNode(true) : drag.sourceElement;
    drag.float.classList.add('drag-float');
    drag.float.style.width = `${width}px`;
    if (drag.source === 'program') {
      drag.placeholder = document.createElement('div');
      drag.placeholder.className = 'drag-placeholder';
      drag.placeholder.style.minHeight = `${Math.max(32, rect.height)}px`;
      drag.sourceElement.replaceWith(drag.placeholder);
    }
    document.body.appendChild(drag.float);
    document.body.classList.add('is-pointer-dragging');
    canvas.classList.toggle('dragging-action', drag.type !== C.TYPES.IF);
    drag.sourceElement.classList?.add('source-copying');
  }
  function moveFloating(x, y) {
    const drag = pointerDrag;
    if (!drag?.started) return;
    drag.float.style.transform = `translate3d(${x - drag.offsetX}px, ${y - drag.offsetY}px, 0) rotate(-2deg) scale(1.025)`;
  }
  function flipReflow(before) {
    for (const row of stack.querySelectorAll('.program-piece,.program-structure')) {
      const old = before.get(row);
      if (!old) continue;
      const next = row.getBoundingClientRect();
      const dx = old.left - next.left, dy = old.top - next.top;
      if (Math.abs(dx) + Math.abs(dy) > 2) row.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration: 170, easing: 'cubic-bezier(.2,.7,.2,1)' });
    }
  }
  function placePlaceholder(candidate) {
    const drag = pointerDrag;
    if (!drag.placeholder) {
      drag.placeholder = document.createElement('div');
      drag.placeholder.className = 'drag-placeholder';
      drag.placeholder.style.minHeight = drag.type === C.TYPES.IF ? '66px' : '34px';
    }
    const key = `${candidate.parentId || 'root'}:${candidate.index}:${candidate.kind}`;
    if (drag.candidateKey === key) return;
    const before = new Map([...stack.querySelectorAll('.program-piece,.program-structure')].map(row => [row, row.getBoundingClientRect()]));
    const normalRows = rows(candidate.list);
    candidate.list.insertBefore(drag.placeholder, normalRows[candidate.index] || null);
    drag.placeholder.dataset.slot = candidate.kind === 'before' ? 'ANTES' : candidate.kind === 'after' ? 'DESPUÉS' : candidate.parentId ? 'DENTRO' : 'AL FINAL';
    drag.candidateKey = key;
    flipReflow(before);
  }
  function updateTarget(x, y) {
    const drag = pointerDrag;
    if (!drag?.started) return;
    drag.lastX = x;
    drag.lastY = y;
    const bounds = canvas.getBoundingClientRect();
    if (x >= bounds.left && x <= bounds.right) {
      if (y > bounds.bottom - 28) canvas.scrollTop += 10;
      else if (y < bounds.top + 28) canvas.scrollTop -= 10;
    }
    const candidate = candidateAt(x, y);
    document.querySelectorAll('.program-body').forEach(body => body.classList.remove('is-target'));
    trash.classList.toggle('is-target', candidate?.kind === 'trash');
    if (!allowed(candidate)) {
      drag.candidate = null; drag.candidateKey = null;
      if (drag.placeholder && drag.source === 'library') drag.placeholder.remove();
      return;
    }
    drag.candidate = candidate;
    if (candidate.kind === 'trash') { drag.placeholder?.remove(); drag.candidateKey = null; return; }
    placePlaceholder(candidate);
    if (candidate.parentId) candidate.list.classList.add('is-target');
  }
  function cancelPointerDrag() {
    const drag = pointerDrag;
    if (!drag) return;
    drag.float?.remove(); drag.placeholder?.remove();
    drag.sourceElement.classList?.remove('source-copying');
    document.body.classList.remove('is-pointer-dragging');
    canvas.classList.remove('dragging-action');
    document.querySelectorAll('.program-body').forEach(body => body.classList.remove('is-target'));
    trash.classList.remove('is-target');
    pointerDrag = null;
    if (drag.started) renderProgram();
  }
  function finishPointerDrag(x, y) {
    const drag = pointerDrag;
    if (!drag) return;
    if (!drag.started) { pointerDrag = null; return; }
    // El placeholder desplaza las filas: conservar el destino visible si el
    // cursor no se movió desde el último pointermove.
    if (!drag.candidate || Math.hypot(x - drag.lastX, y - drag.lastY) > 5) updateTarget(x, y);
    const candidate = drag.candidate;
    let insertedId = null;
    if (candidate?.kind === 'trash' && drag.source === 'program') C.removeNode(program, drag.id);
    else if (candidate && candidate.kind !== 'trash') {
      if (drag.source === 'library') {
        const node = C.makeNode(drag.type, { condition: drag.condition, value: 6 });
        C.insertNode(program, node, candidate.parentId, candidate.index);
        insertedId = node.id;
      } else {
        C.moveNode(program, drag.id, candidate.parentId, candidate.index, true);
        insertedId = drag.id;
      }
    }
    if (drag.source === 'library') suppressLibraryClickUntil = performance.now() + 500;
    cancelPointerDrag();
    if (insertedId) {
      const placed = [...stack.querySelectorAll('[data-id]')].find(element => element.dataset.id === insertedId);
      placed?.classList.add('snap-in');
      setTimeout(() => placed?.classList.remove('snap-in'), 260);
      hideHint();
    }
  }
  function onPointerDown(event) {
    if (game.status === 'running' || event.button !== 0 || event.target.closest('button,select')) return;
    const fromLibrary = event.target.closest('.code-block');
    const fromProgram = event.target.closest('[data-id]');
    if (!fromLibrary && !fromProgram) return;
    if (fromProgram?.classList.contains('program-structure') && event.target.closest('.program-body')) return;
    const source = fromLibrary ? 'library' : 'program';
    const type = fromLibrary ? fromLibrary.dataset.type : C.findNode(program, fromProgram.dataset.id)?.type;
    if (!type) return;
    pointerDrag = {
      pointerId: event.pointerId, source, type, condition: fromLibrary?.dataset.condition || null,
      id: fromProgram?.dataset.id || null, sourceElement: fromLibrary || fromProgram,
      startX: event.clientX, startY: event.clientY, started: false, candidate: null, candidateKey: null,
      float: null, placeholder: null
    };
  }
  library.addEventListener('pointerdown', onPointerDown);
  stack.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointermove', event => {
    if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return;
    if (!pointerDrag.started && Math.hypot(event.clientX - pointerDrag.startX, event.clientY - pointerDrag.startY) >= 5) beginFloating();
    if (pointerDrag.started) { event.preventDefault(); moveFloating(event.clientX, event.clientY); updateTarget(event.clientX, event.clientY); }
  }, { passive: false });
  document.addEventListener('pointerup', event => { if (pointerDrag && event.pointerId === pointerDrag.pointerId) finishPointerDrag(event.clientX, event.clientY); });
  document.addEventListener('pointercancel', event => { if (pointerDrag && event.pointerId === pointerDrag.pointerId) cancelPointerDrag(); });

  // Clic añade una copia al final: alternativa accesible al arrastre, nunca una orden al avatar.
  library.addEventListener('click', event => {
    const block = event.target.closest('.code-block');
    if (!block || game.status === 'running' || performance.now() < suppressLibraryClickUntil) return;
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

  renderProgram(); resetWorld();
})();
