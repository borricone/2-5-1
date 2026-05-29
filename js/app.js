/*
 * Main UI controller: home, learning mode, practice mode.
 */
(function () {
  const KEYS = ['C', 'G', 'D', 'A', 'F', 'Bb', 'Eb'];

  const State = {
    mode: 'home',
    learn: {
      progressionId: 'I-V-vi-IV',
      level: 1,
      voicingId: 'closed-root',
      key: null,
    },
    practice: {
      progressionId: 'I-V-vi-IV',
      voicingId: 'closed-root',
      tempo: 90,
      keyOrder: [],
      currentKeyIdx: 0,
      voicingsPerKey: [],
    },
  };

  function displayKey(k) {
    return k.replace('b', '♭').replace('#', '♯');
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function $(id) { return document.getElementById(id); }

  // ---------- view switching ----------
  function switchView(mode) {
    if (mode === State.mode) return;
    if (State.mode === 'practice') AudioEngine.stop();
    State.mode = mode;
    document.querySelectorAll('.tab-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
    document.querySelectorAll('.view').forEach((v) => {
      v.classList.toggle('active', v.id === 'view-' + mode);
    });
    if (mode === 'learn') refreshLearn();
    if (mode === 'practice') refreshPracticeScore();
  }

  // ---------- learning mode ----------
  function populateSelects() {
    [['learn-progression', State.learn.progressionId],
     ['practice-progression', State.practice.progressionId]].forEach(([id, val]) => {
      const sel = $(id);
      Progressions.list.forEach((p) => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.label;
        sel.appendChild(opt);
      });
      sel.value = val;
    });

    [['learn-voicing', State.learn.voicingId],
     ['practice-voicing', State.practice.voicingId]].forEach(([id, val]) => {
      const sel = $(id);
      Voicings.VOICING_STYLES.forEach((s) => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.label;
        sel.appendChild(opt);
      });
      sel.value = val;
    });
  }

  function pickRandomKey(exclude) {
    let next;
    do {
      next = KEYS[Math.floor(Math.random() * KEYS.length)];
    } while (next === exclude && KEYS.length > 1);
    return next;
  }

  function refreshLearn(opts = {}) {
    if (!State.learn.key || opts.newKey) {
      State.learn.key = pickRandomKey(State.learn.key);
    }
    const progression = Progressions.getById(State.learn.progressionId);
    const voicings = Voicings.generate(
      State.learn.voicingId,
      progression,
      State.learn.key,
      State.learn.level
    );
    $('learn-key').textContent = displayKey(State.learn.key) + ' mayor';
    Notation.render($('learn-score'), voicings, State.learn.key, { maxHeight: 400 });
    const style = Voicings.VOICING_STYLES.find((s) => s.id === State.learn.voicingId);
    $('learn-legend').textContent =
      `${progression.label}  ·  ${style.label}  ·  Nivel ${State.learn.level}` +
      (State.learn.level === 2 ? '  ·  inversión de bajo aleatoria' : '');
  }

  function setupLearn() {
    $('learn-progression').addEventListener('change', (e) => {
      State.learn.progressionId = e.target.value;
      refreshLearn();
    });
    $('learn-voicing').addEventListener('change', (e) => {
      State.learn.voicingId = e.target.value;
      refreshLearn();
    });
    $('learn-level').addEventListener('change', (e) => {
      State.learn.level = parseInt(e.target.value);
      refreshLearn();
    });
    $('learn-new-key').addEventListener('click', () => {
      refreshLearn({ newKey: true });
    });
  }

  // ---------- practice mode ----------

  function buildPracticePlan() {
    const order = shuffle([...KEYS]);
    const progression = Progressions.getById(State.practice.progressionId);
    const voicingsPerKey = order.map((k) =>
      Voicings.generate(State.practice.voicingId, progression, k, 1)
    );
    State.practice.keyOrder = order;
    State.practice.voicingsPerKey = voicingsPerKey;
    State.practice.currentKeyIdx = 0;
    return { keys: order, voicingsPerKey };
  }

  function refreshPracticeScore() {
    if (!State.practice.keyOrder.length) buildPracticePlan();
    const k = State.practice.currentKeyIdx;
    const key = State.practice.keyOrder[k];
    const voicings = State.practice.voicingsPerKey[k];
    Notation.render($('practice-score'), voicings, key, { maxHeight: 400 });
    updatePracticeStatus();
  }

  function updatePracticeStatus(text) {
    if (text) {
      $('practice-status').textContent = text;
      return;
    }
    const k = State.practice.currentKeyIdx;
    const total = State.practice.keyOrder.length;
    const cur = State.practice.keyOrder[k];
    const next = State.practice.keyOrder[k + 1];
    let s = `Tonalidad ${k + 1}/${total}: ${displayKey(cur)} mayor`;
    if (next) s += ` · próxima: ${displayKey(next)} mayor`;
    if (AudioEngine.state === 'idle') s = `Listo · ${s}`;
    $('practice-status').textContent = s;
  }

  async function practicePlay() {
    if (AudioEngine.state === 'paused') {
      AudioEngine.resume();
      updatePracticeStatus();
      return;
    }
    AudioEngine.setTempo(State.practice.tempo);
    const plan = buildPracticePlan();
    refreshPracticeScore();
    updatePracticeStatus(
      `Claqueta (2 compases)… primera tonalidad: ${displayKey(plan.keys[0])} mayor`
    );

    try {
      await AudioEngine.play(plan, {
        onCountIn(i, total) {
          updatePracticeStatus(
            `Claqueta ${i + 1}/${total} · primera tonalidad: ${displayKey(plan.keys[0])} mayor`
          );
        },
        onKeyStart(k) {
          State.practice.currentKeyIdx = k;
          Notation.render(
            $('practice-score'),
            plan.voicingsPerKey[k],
            plan.keys[k],
            { maxHeight: 400 }
          );
          updatePracticeStatus();
        },
        onComplete() {
          updatePracticeStatus('Ejercicio completado. Pulsa Play para repetir.');
        },
      });
    } catch (err) {
      console.error(err);
      updatePracticeStatus('Error iniciando el audio: ' + err.message);
    }
  }

  function practicePause() {
    if (AudioEngine.state === 'playing') {
      AudioEngine.pause();
      updatePracticeStatus('En pausa · pulsa Play para reanudar.');
    }
  }

  function practiceStop() {
    AudioEngine.stop();
    State.practice.currentKeyIdx = 0;
    refreshPracticeScore();
    updatePracticeStatus('Detenido · pulsa Play para comenzar (2 compases de claqueta).');
  }

  function setupPractice() {
    $('practice-progression').addEventListener('change', (e) => {
      State.practice.progressionId = e.target.value;
      AudioEngine.stop();
      buildPracticePlan();
      refreshPracticeScore();
    });
    $('practice-voicing').addEventListener('change', (e) => {
      State.practice.voicingId = e.target.value;
      AudioEngine.stop();
      buildPracticePlan();
      refreshPracticeScore();
    });
    const tempo = $('practice-tempo');
    tempo.addEventListener('input', () => {
      State.practice.tempo = parseInt(tempo.value);
      $('practice-tempo-val').textContent = State.practice.tempo;
      AudioEngine.setTempo(State.practice.tempo);
    });
    $('practice-play').addEventListener('click', practicePlay);
    $('practice-pause').addEventListener('click', practicePause);
    $('practice-stop').addEventListener('click', practiceStop);
  }

  // ---------- tabs / home ----------
  function setupTabsAndHome() {
    document.querySelectorAll('.tab-btn').forEach((b) => {
      b.addEventListener('click', () => switchView(b.dataset.mode));
    });
    document.querySelectorAll('[data-goto]').forEach((b) => {
      b.addEventListener('click', () => switchView(b.dataset.goto));
    });
  }

  // ---------- resize: re-render score to fit ----------
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (State.mode === 'learn') refreshLearn();
      if (State.mode === 'practice') refreshPracticeScore();
    }, 200);
  });

  // ---------- bootstrap ----------
  function init() {
    populateSelects();
    setupTabsAndHome();
    setupLearn();
    setupPractice();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
