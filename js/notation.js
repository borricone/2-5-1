/*
 * VexFlow score renderer — grand staff, 4/4, half notes.
 * Requirements implemented:
 *   - Brace + left barline connecting both staves.
 *   - Chord symbols at a single fixed y above treble.
 *   - Fingering: treble ABOVE, bass BELOW.
 *   - Cross-stave note alignment via joint Formatter.format().
 *   - Stem direction: furthest-note-from-middle-line rule.
 *   - Equal measure widths.
 *   - Beat-correct note placement (VexFlow Voice timing).
 *   - Final bold-double barline crossing both staves.
 *   - SVG viewBox height = 400 px.
 */
(function (root) {
  const VF = Vex.Flow;

  // MIDI pitch of the 3rd (middle) staff line per clef.
  // Treble 3rd line = B4 = 71 ; Bass 3rd line = D3 = 50.
  const MID = { treble: 71, bass: 50 };

  // ── Stem direction ──────────────────────────────────────────────────
  // Rule: the note that is furthest from the middle line dictates direction.
  //   • that note is ABOVE centre  → stem DOWN
  //   • that note is BELOW centre  → stem UP
  //   • equidistant               → stem DOWN (convention)
  function stemDir(notes, clef) {
    if (!notes.length) return VF.Stem.DOWN;
    const mid = MID[clef];
    const hi  = Math.max(...notes.map(n => n.midi));
    const lo  = Math.min(...notes.map(n => n.midi));
    const above = hi - mid; // positive → hi is above centre
    const below = mid - lo; // positive → lo is below centre
    return above >= below ? VF.Stem.DOWN : VF.Stem.UP;
  }

  // ── Accidental glyph mapping ────────────────────────────────────────
  function vfAcc(acc) {
    return ({ '#': '#', 'b': 'b', '##': '##', 'bb': 'bb' })[acc] || null;
  }

  // ── StaveNote factory ───────────────────────────────────────────────
  function makeNote(notes, clef, fingerings) {
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
    const pos = clef === 'treble'
      ? VF.Modifier.Position.ABOVE
      : VF.Modifier.Position.BELOW;
    (fingerings || []).forEach((f, i) => {
      if (f == null) return;
      const fh = new VF.FretHandFinger(String(f));
      fh.setPosition(pos);
      sn.addModifier(fh, i);
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

  // ── Chord symbol text (b → ♭, # → ♯) ───────────────────────────────
  function fmtSymbol(s) {
    return s.replace(/([A-G])b/g, '$1♭').replace(/([A-G])#/g, '$1♯');
  }

  // ── Main render ─────────────────────────────────────────────────────
  function render(containerEl, voicings, key, opts = {}) {
    containerEl.innerHTML = '';

    const n        = voicings.length;           // total half notes
    const measures = Math.ceil(n / 2);
    const cw       = containerEl.clientWidth || 900;
    const W        = Math.max(480, Math.min(cw - 24, 1100));
    const H        = 400;                       // fixed SVG height

    // Vertical layout (all in SVG units):
    //   0-30   : chord symbol row
    //  30-90   : above-staff fingering + headroom
    //  90-130  : treble stave (5 lines × 10 px)
    // 130-220  : gap (ledger lines, below-treble fingering)
    // 220-260  : bass stave
    // 260-400  : below-staff fingering + margin
    const TREBLE_Y   = 90;
    const BASS_Y     = 220;
    const CHORD_Y    = 28;  // fixed chord-symbol baseline

    // Reserve px for brace on left
    const BRACE_W    = 16;
    const LEFT_MARGIN = BRACE_W + 2;
    const measureW   = (W - LEFT_MARGIN) / measures;

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
    // Brace on the left of first measure
    new VF.StaveConnector(tStaves[0], bStaves[0])
      .setType(VF.StaveConnector.type.BRACE)
      .setContext(ctx).draw();
    new VF.StaveConnector(tStaves[0], bStaves[0])
      .setType(VF.StaveConnector.type.SINGLE_LEFT)
      .setContext(ctx).draw();

    // Barlines between inner measures
    for (let m = 0; m < measures - 1; m++) {
      new VF.StaveConnector(tStaves[m], bStaves[m])
        .setType(VF.StaveConnector.type.SINGLE_RIGHT)
        .setContext(ctx).draw();
    }

    // Final bold double barline crossing both staves
    new VF.StaveConnector(tStaves[measures - 1], bStaves[measures - 1])
      .setType(VF.StaveConnector.type.BOLD_DOUBLE_RIGHT)
      .setContext(ctx).draw();

    // ── Notes, formatting, and drawing ─────────────────────────────────
    const symbolList = []; // {noteObj, symbol} for post-render SVG labels

    for (let m = 0; m < measures; m++) {
      const tNotes = [], bNotes = [];

      for (let beat = 0; beat < 2; beat++) {
        const idx = m * 2 + beat;
        if (idx < n) {
          const v  = voicings[idx];
          const tn = makeNote(v.rh, 'treble', v.fingering.rh);
          const bn = makeNote(v.lh, 'bass',   v.fingering.lh);
          tNotes.push(tn);
          bNotes.push(bn);
        } else {
          const tr = makeRest('treble');
          const br = makeRest('bass');
          tNotes.push(tr);
          bNotes.push(br);
        }
      }

      const tv = new VF.Voice({ num_beats: 4, beat_value: 4 }).addTickables(tNotes);
      const bv = new VF.Voice({ num_beats: 4, beat_value: 4 }).addTickables(bNotes);

      // Accidentals driven by key signature
      VF.Accidental.applyAccidentals([tv], Theory.KEY_SIG[key]);
      VF.Accidental.applyAccidentals([bv], Theory.KEY_SIG[key]);

      // Format both voices together so notes are horizontally aligned
      const fw = tStaves[m].getNoteEndX() - tStaves[m].getNoteStartX() - 8;
      new VF.Formatter().format([tv, bv], fw);

      // Strict beat positioning: divide the usable measure width into 4 equal
      // quarters; place each half note at the centre of the 1st and 3rd quarter
      // (x = startX + usable * {1/8, 5/8}). VexFlow's setXShift only moves the
      // notehead — modifiers (fingerings, accidentals) stay at their formatted
      // x. We instead wrap each note's draw() in its own SVG <g transform=…>
      // so the entire note glyph group (head + stem + accidentals + fingerings)
      // moves together.
      const startX  = tStaves[m].getNoteStartX();
      const endX    = tStaves[m].getNoteEndX();
      const usable  = endX - startX;
      const targets = [startX + usable * 0.125, startX + usable * 0.625];

      for (let beat = 0; beat < 2; beat++) {
        [
          [tNotes[beat], tStaves[m]],
          [bNotes[beat], bStaves[m]],
        ].forEach(([note, stave]) => {
          const dx = targets[beat] - note.getAbsoluteX();
          const g = ctx.openGroup();
          if (g && dx) g.setAttribute('transform', `translate(${dx.toFixed(2)},0)`);
          note.setContext(ctx).setStave(stave).draw();
          ctx.closeGroup();
        });
        const idx = m * 2 + beat;
        if (idx < n) {
          symbolList.push({ x: targets[beat], sym: voicings[idx].chord.symbol });
        }
      }
    }

    // ── Chord symbols at fixed y (drawn as raw SVG text after layout) ──
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

      // Fluid width, fixed viewBox height
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      svg.style.width  = '100%';
      svg.style.height = H + 'px';
    }
  }

  root.Notation = { render };
})(window);
