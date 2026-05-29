/*
 * Harmonic progressions covered by the app.
 * Each progression is a list of Roman numerals applied to the chosen key.
 */
(function (root) {
  const PROGRESSIONS = [
    { id: 'I-V-vi-IV',   label: 'I – V – vi – IV',   roman: ['I', 'V', 'vi', 'IV'] },
    { id: 'I-vi-IV-V',   label: 'I – vi – IV – V',   roman: ['I', 'vi', 'IV', 'V'] },
    { id: 'vi-IV-I-V',   label: 'vi – IV – I – V',   roman: ['vi', 'IV', 'I', 'V'] },
    { id: 'I-IV-V-IV',   label: 'I – IV – V – IV',   roman: ['I', 'IV', 'V', 'IV'] },
    { id: 'ii-V-I',      label: 'ii – V – I',        roman: ['ii', 'V', 'I'] },
  ];

  // Convert a Roman numeral progression in a given key into an array of
  // chords: { roman, symbol, pcs (pitch classes), notes (spellings) }.
  function instantiateProgression(progression, key) {
    const map = { I: 1, ii: 2, IV: 4, V: 5, vi: 6 };
    return progression.roman.map((rn) => {
      const degree = map[rn];
      const notes = Theory.triadAtDegree(key, degree);
      const pcs = notes.map((n) =>
        (Theory.LETTER_PC[n.letter] + (Theory.ACC_OFFSET[n.accidental] || 0) + 12) % 12
      );
      return {
        roman: rn,
        symbol: Theory.chordSymbol(key, rn),
        notes,
        pcs,
      };
    });
  }

  function getById(id) {
    return PROGRESSIONS.find((p) => p.id === id);
  }

  root.Progressions = {
    list: PROGRESSIONS,
    getById,
    instantiateProgression,
  };
})(window);
