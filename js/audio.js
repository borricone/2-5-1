/*
 * Backing-track engine (Tone.js).
 * Drums (kick / snare / hi-hat) + bass line. Two-measure click count-in.
 * Schedules the entire practice run on the Transport so chord-change /
 * key-change callbacks can update the score in sync.
 */
(function (root) {
  const COUNT_IN_BEATS = 8;

  function noteToToneName(letter, accidental, octave) {
    return letter + (accidental || '') + octave;
  }

  function beatToTime(beat) {
    const bar = Math.floor(beat / 4);
    const beatInBar = Math.floor(beat % 4);
    const sixteenths = Math.round((beat - Math.floor(beat)) * 4);
    return `${bar}:${beatInBar}:${sixteenths}`;
  }

  function jitter(maxMs = 12) {
    return ((Math.random() - 0.5) * 2 * maxMs) / 1000;
  }

  function vary(base, range) {
    return Math.max(0.05, Math.min(1, base + (Math.random() - 0.5) * range));
  }

  class BackingTrackEngine {
    constructor() {
      this.ready = false;
      this.scheduled = [];
      this.tempo = 90;
      this.state = 'idle'; // 'idle' | 'playing' | 'paused'
    }

    async init() {
      if (this.ready) return;
      await Tone.start();

      const master = new Tone.Gain(0.9).toDestination();
      const reverb = new Tone.Reverb({ decay: 1.4, wet: 0.12 }).connect(master);

      this.kick = new Tone.MembraneSynth({
        pitchDecay: 0.05,
        octaves: 6,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.001, decay: 0.42, sustain: 0.01, release: 0.4 },
      }).connect(master);
      this.kick.volume.value = -3;

      this.snare = new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.001, decay: 0.13, sustain: 0 },
      });
      const snareEQ = new Tone.Filter(1800, 'bandpass').connect(reverb);
      this.snare.connect(snareEQ);
      this.snare.volume.value = -8;

      this.hihat = new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.001, decay: 0.045, sustain: 0 },
      });
      const hhFilter = new Tone.Filter(8000, 'highpass').connect(master);
      this.hihat.connect(hhFilter);
      this.hihat.volume.value = -22;

      this.click = new Tone.Synth({
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.001, decay: 0.07, sustain: 0, release: 0.05 },
      }).connect(master);
      this.click.volume.value = -10;

      this.bass = new Tone.MonoSynth({
        oscillator: { type: 'fmsquare' },
        filter: { Q: 2, type: 'lowpass', rolloff: -24 },
        envelope: { attack: 0.005, decay: 0.25, sustain: 0.55, release: 0.3 },
        filterEnvelope: {
          attack: 0.005, decay: 0.3, sustain: 0.3,
          baseFrequency: 90, octaves: 3.2,
        },
      }).connect(master);
      this.bass.volume.value = -6;

      this.ready = true;
    }

    setTempo(bpm) {
      this.tempo = bpm;
      if (Tone.Transport.bpm) Tone.Transport.bpm.value = bpm;
    }

    _clearScheduled() {
      this.scheduled.forEach((id) => Tone.Transport.clear(id));
      this.scheduled = [];
    }

    stop() {
      Tone.Transport.stop();
      Tone.Transport.position = 0;
      this._clearScheduled();
      this.state = 'idle';
    }

    pause() {
      if (this.state !== 'playing') return;
      Tone.Transport.pause();
      this.state = 'paused';
    }

    resume() {
      if (this.state !== 'paused') return;
      Tone.Transport.start();
      this.state = 'playing';
    }

    // plan: {
    //   keys: ['C', 'G', ...],
    //   voicingsPerKey: [[{chord, lh, rh, ...}, ...], ...],
    // }
    // callbacks: { onCountIn, onKeyStart, onChord, onComplete }
    async play(plan, callbacks = {}) {
      await this.init();
      this.stop();
      Tone.Transport.bpm.value = this.tempo;
      Tone.Transport.position = 0;

      // Count-in: 8 quarter clicks, accent on 1 and 5.
      for (let i = 0; i < COUNT_IN_BEATS; i++) {
        const t = beatToTime(i);
        const accent = i % 4 === 0;
        const id = Tone.Transport.schedule((time) => {
          this.click.triggerAttackRelease(accent ? 'C6' : 'A5', '32n', time, accent ? 0.9 : 0.6);
          if (callbacks.onCountIn) {
            Tone.Draw.schedule(() => callbacks.onCountIn(i, COUNT_IN_BEATS), time);
          }
        }, t);
        this.scheduled.push(id);
      }

      let beatCursor = COUNT_IN_BEATS;

      for (let k = 0; k < plan.keys.length; k++) {
        const voicings = plan.voicingsPerKey[k];
        const chordBeats = 2; // each chord lasts a half note
        const totalChordBeats = voicings.length * chordBeats;
        const measures = Math.ceil(totalChordBeats / 4);
        const totalMeasureBeats = measures * 4;
        const keyStartBeat = beatCursor;

        // Key-start callback
        const kid = Tone.Transport.schedule((time) => {
          if (callbacks.onKeyStart) {
            Tone.Draw.schedule(() => callbacks.onKeyStart(k), time);
          }
        }, beatToTime(keyStartBeat));
        this.scheduled.push(kid);

        // Drums: standard rock pattern per measure with humanisation.
        for (let m = 0; m < measures; m++) {
          const measureStart = keyStartBeat + m * 4;
          const isLastMeasure = m === measures - 1;
          const isFinalKey = k === plan.keys.length - 1;

          for (let beat = 0; beat < 4; beat++) {
            const beatAbs = measureStart + beat;

            // Kick: 1 and 3 (with occasional ghost on "and of 3" in some measures)
            if (beat === 0 || beat === 2) {
              const id = Tone.Transport.schedule((time) => {
                this.kick.triggerAttackRelease('C1', '8n', time + jitter(8), vary(0.9, 0.1));
              }, beatToTime(beatAbs));
              this.scheduled.push(id);
            }
            // Snare: 2 and 4
            if (beat === 1 || beat === 3) {
              const id = Tone.Transport.schedule((time) => {
                this.snare.triggerAttackRelease('8n', time + jitter(10), vary(0.75, 0.2));
              }, beatToTime(beatAbs));
              this.scheduled.push(id);
            }
            // Hi-hat eighths
            for (let sub = 0; sub < 2; sub++) {
              const beatSub = beatAbs + sub * 0.5;
              const accent = sub === 0 && (beat === 0 || beat === 2);
              const id = Tone.Transport.schedule((time) => {
                this.hihat.triggerAttackRelease('16n', time + jitter(6), accent ? vary(0.45, 0.15) : vary(0.3, 0.15));
              }, beatToTime(beatSub));
              this.scheduled.push(id);
            }
          }

          // Small variation: occasional ghost-snare on 4-and to add life
          if (isLastMeasure && !isFinalKey && Math.random() < 0.55) {
            const id = Tone.Transport.schedule((time) => {
              this.snare.triggerAttackRelease('16n', time, 0.35);
            }, beatToTime(measureStart + 3.5));
            this.scheduled.push(id);
          }
        }

        // Bass + chord callbacks
        for (let ci = 0; ci < voicings.length; ci++) {
          const chordStart = keyStartBeat + ci * 2;
          const v = voicings[ci];
          const bassSrc = v.lh[0];
          // Place bass an octave lower for a strong low register.
          const bassName = noteToToneName(bassSrc.letter, bassSrc.accidental, Math.max(1, bassSrc.octave - 1));

          // Bass: root on the downbeat (sustained ~ half note)
          const id = Tone.Transport.schedule((time) => {
            this.bass.triggerAttackRelease(bassName, '2n', time + jitter(6), vary(0.85, 0.1));
          }, beatToTime(chordStart));
          this.scheduled.push(id);

          // Optional rhythmic interest: small pickup on the "and" of beat 2
          if (Math.random() < 0.45) {
            const id2 = Tone.Transport.schedule((time) => {
              this.bass.triggerAttackRelease(bassName, '16n', time + jitter(6), 0.55);
            }, beatToTime(chordStart + 1.5));
            this.scheduled.push(id2);
          }

          // Chord-change UI callback
          const idCb = Tone.Transport.schedule((time) => {
            if (callbacks.onChord) {
              Tone.Draw.schedule(() => callbacks.onChord(k, ci), time);
            }
          }, beatToTime(chordStart));
          this.scheduled.push(idCb);
        }

        beatCursor += totalMeasureBeats;
      }

      // Complete
      const idC = Tone.Transport.schedule((time) => {
        Tone.Draw.schedule(() => {
          this.state = 'idle';
          if (callbacks.onComplete) callbacks.onComplete();
        }, time);
      }, beatToTime(beatCursor));
      this.scheduled.push(idC);

      this.state = 'playing';
      Tone.Transport.start('+0.05');
    }
  }

  root.AudioEngine = new BackingTrackEngine();
})(window);
