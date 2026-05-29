/*
 * VexFlow-based score renderer.
 * Renders a grand-staff score (4/4, half notes) for a sequence of voicings
 * in a given key, with chord symbols above and finger numbers next to notes.
 */
(function (root) {
  const VF = Vex.Flow;

  // Map our accidental strings to VexFlow accidental glyph codes.
  function vfAccidental(acc) {
    if (acc === '#') return '#';
    if (acc === 'b') return 'b';
    if (acc === '##') return '##';
    if (acc === 'bb') return 'bb';
    return null;
  }

  // Build a chord StaveNote for one voicing side (LH or RH).
  // notes: array of Note objects
  // clef: 'treble' | 'bass'
  // fingerings: array of finger numbers parallel to notes
  // chordSymbol (optional, treble side only): string to print above the staff
  // Accidentals are not added explicitly — the key signature handles them
  // (all chord tones are diatonic). Accidental.applyAccidentals is called
  // after voice creation to keep the notation strictly correct.
  function buildStaveNote(notes, clef, fingerings, chordSymbol) {
    const sorted = [...notes].sort((a, b) => a.midi - b.midi);
    const keys = sorted.map((n) => n.vfKey);
    const note = new VF.StaveNote({ clef, keys, duration: 'h' });

    sorted.forEach((n, i) => {
      const f = String(fingerings[i] ?? '');
      if (!f) return;
      const fh = new VF.FretHandFinger(f);
      fh.setPosition(
        clef === 'treble' ? VF.Modifier.Position.ABOVE : VF.Modifier.Position.BELOW
      );
      note.addModifier(fh, i);
    });

    if (chordSymbol) {
      const cs = new VF.ChordSymbol()
        .setFont('Arial', 15, 'bold')
        .setHorizontal('center')
        .addText(chordSymbol);
      cs.setReportWidth(false);
      note.addModifier(cs, 0);
    }
    return note;
  }

  function buildHalfRest(clef) {
    return new VF.StaveNote({
      keys: [clef === 'treble' ? 'b/4' : 'd/3'],
      duration: 'hr',
      clef,
    });
  }

  // Render a single line: one or more measures of half notes representing
  // the voicings array. Voicings of length 3 (ii-V-I) get a final half rest.
  function render(containerEl, voicings, key, opts = {}) {
    containerEl.innerHTML = '';
    const halfCount = voicings.length;
    const measures = Math.ceil(halfCount / 2);
    const needsTrailingRest = halfCount % 2 === 1;

    const containerWidth = containerEl.clientWidth || 800;
    const totalWidth = Math.max(360, Math.min(containerWidth - 20, 1080));

    const firstMeasureWidth = Math.min(280, totalWidth * 0.4);
    const restWidth = totalWidth - firstMeasureWidth;
    const otherMeasureWidth = measures > 1 ? restWidth / (measures - 1) : restWidth;

    const trebleY = 40;
    const bassY = 140;
    const totalHeight = 250;

    const renderer = new VF.Renderer(containerEl, VF.Renderer.Backends.SVG);
    renderer.resize(totalWidth, totalHeight);
    const ctx = renderer.getContext();

    const trebleStaves = [];
    const bassStaves = [];

    let x = 0;
    for (let m = 0; m < measures; m++) {
      const w = m === 0 ? firstMeasureWidth : otherMeasureWidth;
      const treble = new VF.Stave(x, trebleY, w);
      const bass = new VF.Stave(x, bassY, w);
      if (m === 0) {
        treble.addClef('treble').addKeySignature(Theory.KEY_SIG[key]).addTimeSignature('4/4');
        bass.addClef('bass').addKeySignature(Theory.KEY_SIG[key]).addTimeSignature('4/4');
      }
      treble.setContext(ctx).draw();
      bass.setContext(ctx).draw();
      trebleStaves.push(treble);
      bassStaves.push(bass);
      x += w;
    }

    // Brace + left line on first measure
    new VF.StaveConnector(trebleStaves[0], bassStaves[0])
      .setType(VF.StaveConnector.type.BRACE)
      .setContext(ctx)
      .draw();
    new VF.StaveConnector(trebleStaves[0], bassStaves[0])
      .setType(VF.StaveConnector.type.SINGLE_LEFT)
      .setContext(ctx)
      .draw();
    // Right line on last measure
    new VF.StaveConnector(
      trebleStaves[trebleStaves.length - 1],
      bassStaves[bassStaves.length - 1]
    )
      .setType(VF.StaveConnector.type.SINGLE_RIGHT)
      .setContext(ctx)
      .draw();
    // Single barlines between measures (auto-drawn by stave borders, but we can be explicit)
    for (let m = 0; m < measures - 1; m++) {
      new VF.StaveConnector(trebleStaves[m], bassStaves[m])
        .setType(VF.StaveConnector.type.SINGLE_RIGHT)
        .setContext(ctx)
        .draw();
    }

    for (let m = 0; m < measures; m++) {
      const trebleNotes = [];
      const bassNotes = [];
      for (let beat = 0; beat < 2; beat++) {
        const idx = m * 2 + beat;
        if (idx < halfCount) {
          const v = voicings[idx];
          trebleNotes.push(buildStaveNote(v.rh, 'treble', v.fingering.rh, v.chord.symbol));
          bassNotes.push(buildStaveNote(v.lh, 'bass', v.fingering.lh));
        } else {
          trebleNotes.push(buildHalfRest('treble'));
          bassNotes.push(buildHalfRest('bass'));
        }
      }

      const trebleVoice = new VF.Voice({ num_beats: 4, beat_value: 4 }).addTickables(trebleNotes);
      const bassVoice = new VF.Voice({ num_beats: 4, beat_value: 4 }).addTickables(bassNotes);
      // Let VexFlow add only the accidentals that the key signature doesn't
      // already imply (no redundant glyphs).
      VF.Accidental.applyAccidentals([trebleVoice], Theory.KEY_SIG[key]);
      VF.Accidental.applyAccidentals([bassVoice], Theory.KEY_SIG[key]);
      const stave = trebleStaves[m];
      const formatWidth = Math.max(60, stave.getNoteEndX() - stave.getNoteStartX() - 10);
      new VF.Formatter()
        .joinVoices([trebleVoice, bassVoice])
        .format([trebleVoice, bassVoice], formatWidth);
      trebleVoice.draw(ctx, trebleStaves[m]);
      bassVoice.draw(ctx, bassStaves[m]);
    }

    // Make SVG fluid
    const svg = containerEl.querySelector('svg');
    if (svg) {
      svg.setAttribute('viewBox', `0 0 ${totalWidth} ${totalHeight}`);
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      svg.style.width = '100%';
      svg.style.maxHeight = (opts.maxHeight || 360) + 'px';
    }
  }

  root.Notation = { render };
})(window);
