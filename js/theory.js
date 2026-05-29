/*
 * Music theory engine.
 * - Represents notes with correct spelling per key.
 * - Builds diatonic triads for Roman-numeral degrees in major keys.
 *
 * Supported keys: up to 3 sharps / 3 flats (C, G, D, A, F, Bb, Eb).
 */
(function (root) {
  const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const ACC_OFFSET = { '': 0, '#': 1, b: -1, '##': 2, bb: -2 };
  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

  // Major-scale spelling for each supported key.
  const KEY_SCALES = {
    C:  ['C',  'D',  'E',  'F',  'G',  'A',  'B'],
    G:  ['G',  'A',  'B',  'C',  'D',  'E',  'F#'],
    D:  ['D',  'E',  'F#', 'G',  'A',  'B',  'C#'],
    A:  ['A',  'B',  'C#', 'D',  'E',  'F#', 'G#'],
    F:  ['F',  'G',  'A',  'Bb', 'C',  'D',  'E'],
    Bb: ['Bb', 'C',  'D',  'Eb', 'F',  'G',  'A'],
    Eb: ['Eb', 'F',  'G',  'Ab', 'Bb', 'C',  'D'],
  };

  const ALL_KEYS = Object.keys(KEY_SCALES);

  // VexFlow key-signature codes (treble / bass equivalent).
  const KEY_SIG = { C: 'C', G: 'G', D: 'D', A: 'A', F: 'F', Bb: 'Bb', Eb: 'Eb' };

  function parseNoteName(name) {
    const letter = name[0];
    const accidental = name.slice(1);
    return { letter, accidental };
  }

  function noteToMidi(letter, accidental, octave) {
    const pc = LETTER_PC[letter] + (ACC_OFFSET[accidental] || 0);
    return (octave + 1) * 12 + pc;
  }

  // Returns an object { letter, accidental, octave, midi, name, vfKey }.
  // vfKey is the VexFlow `c/4` style key string.
  function makeNote(letter, accidental, octave) {
    const midi = noteToMidi(letter, accidental, octave);
    const name = letter + accidental;
    const vfKey = (letter + (accidental || '')).toLowerCase() + '/' + octave;
    return { letter, accidental, octave, midi, name, vfKey };
  }

  function midiPC(midi) { return ((midi % 12) + 12) % 12; }

  // Place a note (with a given letter+accidental spelling) at the octave
  // whose MIDI value is closest to the reference MIDI.
  function placeNearMidi(letter, accidental, refMidi) {
    const pc = LETTER_PC[letter] + (ACC_OFFSET[accidental] || 0);
    const refPc = midiPC(refMidi);
    let diff = pc - refPc;
    if (diff > 6) diff -= 12;
    if (diff < -6) diff += 12;
    const targetMidi = refMidi + diff;
    const octave = Math.floor(targetMidi / 12) - 1;
    return makeNote(letter, accidental, octave);
  }

  // Place note above a reference MIDI (strictly greater than).
  function placeAboveMidi(letter, accidental, refMidi) {
    const pc = LETTER_PC[letter] + (ACC_OFFSET[accidental] || 0);
    let octave = Math.floor(refMidi / 12) - 1;
    let n = makeNote(letter, accidental, octave);
    while (n.midi <= refMidi) {
      octave++;
      n = makeNote(letter, accidental, octave);
    }
    return n;
  }

  // Returns the diatonic triad spellings for a roman degree (1-indexed)
  // in the given key: [root, third, fifth] as { letter, accidental }.
  function triadAtDegree(key, degree) {
    const scale = KEY_SCALES[key];
    const idx = degree - 1;
    const indices = [idx, (idx + 2) % 7, (idx + 4) % 7];
    return indices.map((i) => parseNoteName(scale[i]));
  }

  // Chord symbol (American notation) for a Roman-numeral function in the key.
  function chordSymbol(key, romanNumeral) {
    const map = { I: 1, ii: 2, IV: 4, V: 5, vi: 6 };
    const degree = map[romanNumeral];
    const [root] = triadAtDegree(key, degree);
    const isMinor = romanNumeral === romanNumeral.toLowerCase();
    return root.letter + (root.accidental || '') + (isMinor ? 'm' : '');
  }

  // Quality of triad (major / minor) by roman numeral capitalization.
  function isMinorRoman(rn) {
    return rn === rn.toLowerCase();
  }

  root.Theory = {
    LETTER_PC,
    ACC_OFFSET,
    LETTERS,
    KEY_SCALES,
    ALL_KEYS,
    KEY_SIG,
    parseNoteName,
    noteToMidi,
    makeNote,
    midiPC,
    placeNearMidi,
    placeAboveMidi,
    triadAtDegree,
    chordSymbol,
    isMinorRoman,
  };
})(window);
