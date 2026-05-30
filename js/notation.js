/*
 * VexFlow score renderer — grand staff, 4/4, half notes.
 */
(function (root) {
  const VF = Vex.Flow;

  // MIDI pitch of the 3rd (middle) staff line per clef.
  // Treble 3rd line = B4 = 71 ; Bass 3rd line = D3 = 50.
  const MID = { treble: 71, bass: 50 };

  function stemDir(notes, clef) {
    if (!notes.length) return VF.Stem.DOWN;
    const mid   = MID[clef];
    const hi    = Math.max(...notes.map(n => n.midi));
    const lo    = Math.min(...notes.map(n => n.midi));
    const above = hi - mid;
    const below = mid - lo;
    return above >= below ? VF.Stem.DOWN : VF.Stem.UP;
  }

  function vfAcc(acc) {
    return ({ '#': '#', 'b': 'b', '##': '##', 'bb': 'bb' })[acc] || null;
  }

  // StaveNote factory — no fingering modifiers.
  function makeNote(notes, clef) {
    const sorted = [...notes].sort((a, b) => a.midi - b.midi);
    const sn = new VF.StaveNote({
      clef,
      keys: sorted.map(n => n.vfKey),
      duration: 'h',
      stem_direction: stemDir(sorted, clef),
    });
    sorted.forEach((n, i) => {
      const a = vfAcc(n.accidental);
      if (a) sn.addModifier(new VF.Accidental(a), i);
    });
    return sn;
  }

  function makeRest(clef) {
    return new VF.StaveNote({
      keys: [clef === 'treble' ? 'b/4' : 'd/3'],
      duration: 'hr',
      clef,
    });
  }

  function fmtSymbol(s) {
    return s.replace(/([A-G])b/g, '$1♭').replace(/([A-G])#/g, '$1♯');
  }

  // ── Main render ─────────────────────────────────────────────────────
  function render(containerEl, voicings, key, opts = {}) {
    containerEl.innerHTML = '';

    const n        = voicings.length;
    const measures = Math.ceil(n / 2);
    const cw       = containerEl.clientWidth || 900;
    const W        = Math.max(480, Math.min(cw - 24, 1100));
    const H        = 400;

    const TREBLE_Y    = 90;
    const BASS_Y      = 220;
    const CHORD_Y     = 28;
    const BRACE_W     = 16;
    const LEFT_MARGIN = BRACE_W + 2;
    const measureW    = (W - LEFT_MARGIN) / measures;

    const renderer = new VF.Renderer(containerEl, VF.Renderer.Backends.SVG);
    renderer.resize(W, H);
    const ctx = renderer.getContext();

    // ── Draw staves ────────────────────────────────────────────────────
    const tStaves = [], bStaves = [];
    for (let m = 0; m < measures; m++) {
      const x = LEFT_MARGIN + m * measureW;
      const t = new VF.Stave(x, TREBLE_Y, measureW);
      const b = new VF.Stave(x, BASS_Y,   measureW);
      if (m === 0) {
        t.addClef('treble').addKeySignature(Theory.KEY_SIG[key]).addTimeSignature('4/4');
        b.addClef('bass')  .addKeySignature(Theory.KEY_SIG[key]).addTimeSignature('4/4');
      }
      t.setContext(ctx).draw();
      b.setContext(ctx).draw();
      tStaves.push(t);
      bStaves.push(b);
    }

    // ── Connectors ─────────────────────────────────────────────────────
    new VF.StaveConnector(tStaves[0], bStaves[0])
      .setType(VF.StaveConnector.type.BRACE)
      .setContext(ctx).draw();
    new VF.StaveConnector(tStaves[0], bStaves[0])
      .setType(VF.StaveConnector.type.SINGLE_LEFT)
      .setContext(ctx).draw();

    for (let m = 0; m < measures - 1; m++) {
      new VF.StaveConnector(tStaves[m], bStaves[m])
        .setType(VF.StaveConnector.type.SINGLE_RIGHT)
        .setContext(ctx).draw();
    }

    new VF.StaveConnector(tStaves[measures - 1], bStaves[measures - 1])
      .setType(VF.StaveConnector.type.BOLD_DOUBLE_RIGHT)
      .setContext(ctx).draw();

    // ── Notes, formatting, and drawing ─────────────────────────────────
    const symbolList = [];

    for (let m = 0; m < measures; m++) {
      const tNotes = [], bNotes = [];

      for (let beat = 0; beat < 2; beat++) {
        const idx = m * 2 + beat;
        if (idx < n) {
          tNotes.push(makeNote(voicings[idx].rh, 'treble'));
          bNotes.push(makeNote(voicings[idx].lh, 'bass'));
        } else {
          tNotes.push(makeRest('treble'));
          bNotes.push(makeRest('bass'));
        }
      }

      const tv = new VF.Voice({ num_beats: 4, beat_value: 4 }).addTickables(tNotes);
      const bv = new VF.Voice({ num_beats: 4, beat_value: 4 }).addTickables(bNotes);

      // Assign stave to notes BEFORE formatting so getAbsoluteX returns
      // coordinates in screen space (otherwise it's local to the formatter
      // and dx ends up huge — pushing measure-2 notes off the SVG).
      tNotes.forEach((nt) => nt.setStave(tStaves[m]));
      bNotes.forEach((nt) => nt.setStave(bStaves[m]));

      VF.Accidental.applyAccidentals([tv], Theory.KEY_SIG[key]);
      VF.Accidental.applyAccidentals([bv], Theory.KEY_SIG[key]);

      const fw = tStaves[m].getNoteEndX() - tStaves[m].getNoteStartX() - 8;
      new VF.Formatter().format([tv, bv], fw);

      // Place each half note at the beat-correct position:
      //   beat 0 → 1/8 of usable width from note-start
      //   beat 1 → 5/8 of usable width from note-start
      const startX  = tStaves[m].getNoteStartX();
      const endX    = tStaves[m].getNoteEndX();
      const usable  = endX - startX;
      const targets = [startX + usable * 0.125, startX + usable * 0.625];

      for (let beat = 0; beat < 2; beat++) {
        const dxT = targets[beat] - tNotes[beat].getAbsoluteX();
        const dxB = targets[beat] - bNotes[beat].getAbsoluteX();
        tNotes[beat].setXShift(dxT);
        bNotes[beat].setXShift(dxB);

        const idx = m * 2 + beat;
        if (idx < n) {
          symbolList.push({ x: targets[beat], sym: voicings[idx].chord.symbol });
        }
      }

      // Draw voices — renders all tickables in the measure.
      tv.draw(ctx, tStaves[m]);
      bv.draw(ctx, bStaves[m]);
    }

    // ── Chord symbols at fixed y ────────────────────────────────────────
    const svg = containerEl.querySelector('svg');
    if (svg) {
      symbolList.forEach(({ x, sym }) => {
        if (!sym) return;
        const el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        el.setAttribute('x', String(x));
        el.setAttribute('y', String(CHORD_Y));
        el.setAttribute('text-anchor', 'middle');
        el.setAttribute('font-family', 'Arial, Helvetica, sans-serif');
        el.setAttribute('font-size', '15');
        el.setAttribute('font-weight', 'bold');
        el.setAttribute('fill', '#1a1a1a');
        el.textContent = fmtSymbol(sym);
        svg.appendChild(el);
      });

      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      svg.style.width  = '100%';
      svg.style.height = H + 'px';
    }
  }

  root.Notation = { render };
})(window);
