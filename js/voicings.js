/*
 * Voicing generator: closed and open four-voice voicings for triadic progressions.
 *
 * Output format for each chord:
 *   {
 *     chord: { roman, symbol, notes, pcs },
 *     lh: [Note, ...]  (1 or 2 notes — bass clef)
 *     rh: [Note, ...]  (2 or 3 notes — treble clef)
 *     fingering: { lh: [..], rh: [..] }
 *   }
 */
(function (root) {
  // ---------- helpers ----------

  function spellingsToPCs(spellings) {
    return spellings.map(
      (sp) => (Theory.LETTER_PC[sp.letter] + (Theory.ACC_OFFSET[sp.accidental] || 0) + 12) % 12
    );
  }

  // Build a closed triad with the given root-tone order, lowest note placed
  // in the octave nearest to `refMidi`. Returns 3 ascending Notes.
  function buildClosedTriad(spellings, order, refMidi) {
    const ord = order.map((i) => spellings[i]);
    let low = Theory.placeNearMidi(ord[0].letter, ord[0].accidental, refMidi);
    // Constrain low to a reasonable RH register (C4..C5).
    while (low.midi < 60) low = Theory.makeNote(low.letter, low.accidental, low.octave + 1);
    while (low.midi > 72) low = Theory.makeNote(low.letter, low.accidental, low.octave - 1);
    const mid = Theory.placeAboveMidi(ord[1].letter, ord[1].accidental, low.midi);
    const high = Theory.placeAboveMidi(ord[2].letter, ord[2].accidental, mid.midi);
    return [low, mid, high];
  }

  // Voice-lead a closed triad: choose the rotation (which tone is on the
  // bottom) that minimises total semitone movement from the previous RH.
  function voiceLeadClosedTriad(prevRH, nextSpellings) {
    let best = null;
    const rotations = [[0, 1, 2], [1, 2, 0], [2, 0, 1]];
    for (const rot of rotations) {
      const ord = rot.map((i) => nextSpellings[i]);
      let low = Theory.placeNearMidi(ord[0].letter, ord[0].accidental, prevRH[0].midi);
      const mid = Theory.placeAboveMidi(ord[1].letter, ord[1].accidental, low.midi);
      const high = Theory.placeAboveMidi(ord[2].letter, ord[2].accidental, mid.midi);
      const cost =
        Math.abs(low.midi - prevRH[0].midi) +
        Math.abs(mid.midi - prevRH[1].midi) +
        Math.abs(high.midi - prevRH[2].midi);
      if (!best || cost < best.cost) best = { cost, voicing: [low, mid, high] };
    }
    return best.voicing;
  }

  // ---------- CLOSED voicings (Level 1 & 2) ----------
  // opts: { firstInversion: 0|1|2, bassInversions: [int, ...] }
  //   firstInversion picks the inversion of the *RH triad* on chord 1.
  //   bassInversions (length === progression length): for each chord, which
  //   chord tone the LH plays (0=root, 1=3rd, 2=5th). For Level 1 pass [0,0,..].
  function generateClosed(progression, key, opts = {}) {
    const firstInversion = opts.firstInversion ?? 0;
    const chords = Progressions.instantiateProgression(progression, key);
    const bassInvs = opts.bassInversions || chords.map(() => 0);
    const out = [];
    let prevRH = null;

    for (let i = 0; i < chords.length; i++) {
      const c = chords[i];
      const bassSp = c.notes[bassInvs[i]];
      // LH bass around E2..A3 (MIDI 40..57). Place near E3 (52).
      let lhNote = Theory.placeNearMidi(bassSp.letter, bassSp.accidental, 50);
      while (lhNote.midi < 40) lhNote = Theory.makeNote(lhNote.letter, lhNote.accidental, lhNote.octave + 1);
      while (lhNote.midi > 57) lhNote = Theory.makeNote(lhNote.letter, lhNote.accidental, lhNote.octave - 1);
      const lh = [lhNote];

      let rh;
      if (i === 0) {
        const rotations = [[0, 1, 2], [1, 2, 0], [2, 0, 1]];
        rh = buildClosedTriad(c.notes, rotations[firstInversion], 64);
      } else {
        rh = voiceLeadClosedTriad(prevRH, c.notes);
      }
      prevRH = rh;
      out.push({
        chord: withBassSymbol(c, bassInvs[i]),
        lh,
        rh,
        fingering: buildFingerings(lh, rh, 'closed'),
      });
    }
    return out;
  }

  // Returns a chord object with the symbol augmented to slash-chord notation
  // when the bass note is not the root (bassIdx 1 = 3rd in bass, 2 = 5th).
  function withBassSymbol(c, bassIdx) {
    if (!bassIdx) return c;
    const bassSp = c.notes[bassIdx];
    const bassName = bassSp.letter + (bassSp.accidental || '');
    return { ...c, symbol: c.symbol + '/' + bassName };
  }

  // ---------- OPEN voicings (Level 1 & 2) ----------
  // LH: 2 notes (bass note + another chord tone above)
  // RH: 2 notes; together LH+RH cover all three chord tones, with one doubled.
  function generateOpen(progression, key, opts = {}) {
    const chords = Progressions.instantiateProgression(progression, key);
    const bassInvs = opts.bassInversions || chords.map(() => 0);
    const out = [];
    let prevRH = null;

    for (let i = 0; i < chords.length; i++) {
      const c = chords[i];
      const bassIdx = bassInvs[i]; // 0=root, 1=third, 2=fifth
      // Second LH note: cycle two positions ahead (a 5th/6th up roughly).
      const secondIdx = (bassIdx + 2) % 3;
      const bassSp = c.notes[bassIdx];
      const secondSp = c.notes[secondIdx];

      // Place bass around E2..A3 (40..57).
      let lhBass = Theory.placeNearMidi(bassSp.letter, bassSp.accidental, 45);
      while (lhBass.midi < 40) lhBass = Theory.makeNote(lhBass.letter, lhBass.accidental, lhBass.octave + 1);
      while (lhBass.midi > 52) lhBass = Theory.makeNote(lhBass.letter, lhBass.accidental, lhBass.octave - 1);
      let lhSecond = Theory.placeAboveMidi(secondSp.letter, secondSp.accidental, lhBass.midi);
      // Constrain LH span to max one octave (12 semitones).
      while (lhSecond.midi - lhBass.midi > 12)
        lhSecond = Theory.makeNote(lhSecond.letter, lhSecond.accidental, lhSecond.octave - 1);
      const lh = [lhBass, lhSecond];

      // RH must cover the missing chord tones; doubling allowed for total 2 notes.
      const lhPCs = lh.map((n) => Theory.midiPC(n.midi));
      const chordPCs = spellingsToPCs(c.notes);
      const missingPCs = chordPCs.filter((pc) => !lhPCs.includes(pc));

      // Enumerate (idxA, idxB) pairs in [0,1,2] (with repetition) and keep
      // those whose PCs cover the missing set.
      const candidates = [];
      for (let a = 0; a < 3; a++) {
        for (let b = 0; b < 3; b++) {
          const pair = [c.notes[a], c.notes[b]];
          const pcs = spellingsToPCs(pair);
          if (missingPCs.every((pc) => pcs.includes(pc))) {
            candidates.push(pair);
          }
        }
      }

      let rh;
      if (i === 0) {
        // Pick a sensible initial open RH: prefer pair = [third, root] if available.
        const thirdSp = c.notes[1];
        const rootSp = c.notes[0];
        const rhLow = Theory.placeAboveMidi(thirdSp.letter, thirdSp.accidental, lhSecond.midi + 1);
        const rhHigh = Theory.placeAboveMidi(rootSp.letter, rootSp.accidental, rhLow.midi);
        rh = [rhLow, rhHigh];
        // Ensure RH covers any missing PC; if not, fall back to first candidate.
        const rhPCs = rh.map((n) => Theory.midiPC(n.midi));
        if (!missingPCs.every((pc) => rhPCs.includes(pc))) {
          const pair = candidates[0];
          const lo = Theory.placeAboveMidi(pair[0].letter, pair[0].accidental, lhSecond.midi + 1);
          const hi = Theory.placeAboveMidi(pair[1].letter, pair[1].accidental, lo.midi);
          rh = [lo, hi];
        }
      } else {
        let best = null;
        for (const pair of candidates) {
          let lo = Theory.placeNearMidi(pair[0].letter, pair[0].accidental, prevRH[0].midi);
          while (lo.midi <= lhSecond.midi) lo = Theory.makeNote(lo.letter, lo.accidental, lo.octave + 1);
          let hi = Theory.placeNearMidi(pair[1].letter, pair[1].accidental, prevRH[1].midi);
          while (hi.midi <= lo.midi) hi = Theory.makeNote(hi.letter, hi.accidental, hi.octave + 1);
          // Constrain RH span to max one octave.
          if (hi.midi - lo.midi > 12) {
            hi = Theory.makeNote(hi.letter, hi.accidental, hi.octave - 1);
            if (hi.midi <= lo.midi) hi = Theory.makeNote(hi.letter, hi.accidental, hi.octave + 1);
          }
          if (hi.midi - lo.midi > 12) continue; // still too wide — skip
          const cost =
            Math.abs(lo.midi - prevRH[0].midi) + Math.abs(hi.midi - prevRH[1].midi);
          if (!best || cost < best.cost) best = { cost, voicing: [lo, hi] };
        }
        rh = best ? best.voicing : prevRH; // fallback: keep previous voicing
      }
      prevRH = rh;
      out.push({
        chord: withBassSymbol(c, bassIdx),
        lh,
        rh,
        fingering: buildFingerings(lh, rh, 'open'),
      });
    }
    return out;
  }

  // ---------- Fingering suggestions ----------
  // Heuristic: LH numbers from bottom-up: 5 → 3 → 1; RH bottom-up: 1 → 3 → 5.
  // For 2-note LH we use 5,1 (octave-spread) or 5,2 (smaller). RH 2-note: 1,5.
  function buildFingerings(lh, rh, style) {
    const lhFng = lh.length === 1 ? [5] : (style === 'open' ? [5, 1] : [5, 2]);
    const rhFng = rh.length === 2 ? [1, 5] : [1, 3, 5];
    return { lh: lhFng, rh: rhFng };
  }

  // ---------- Public API ----------

  // Style selectors used in the UI.
  const VOICING_STYLES = [
    { id: 'closed-root', label: 'Cerrado · 1ª en estado fundamental', kind: 'closed', firstInversion: 0 },
    { id: 'closed-inv1', label: 'Cerrado · 1ª en 1ª inversión',       kind: 'closed', firstInversion: 1 },
    { id: 'closed-inv2', label: 'Cerrado · 1ª en 2ª inversión',       kind: 'closed', firstInversion: 2 },
    { id: 'open',         label: 'Abierto',                             kind: 'open' },
  ];

  function randomBassInversions(progression) {
    return progression.roman.map(() => Math.floor(Math.random() * 3));
  }

  function generate(styleId, progression, key, level = 1) {
    const style = VOICING_STYLES.find((s) => s.id === styleId);
    if (!style) throw new Error('Unknown voicing style: ' + styleId);
    const opts = {};
    if (level === 2) {
      opts.bassInversions = randomBassInversions(progression);
    } else {
      opts.bassInversions = progression.roman.map(() => 0);
    }
    if (style.kind === 'closed') {
      opts.firstInversion = style.firstInversion;
      return generateClosed(progression, key, opts);
    }
    return generateOpen(progression, key, opts);
  }

  root.Voicings = {
    VOICING_STYLES,
    generate,
    generateClosed,
    generateOpen,
  };
})(window);
