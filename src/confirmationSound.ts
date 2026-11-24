let context: AudioContext | undefined;

// Unlock audio during the submit gesture, before waiting for the server.
export function prepareConfirmationSound() {
  try {
    context ||= new AudioContext();
    if (context.state === "suspended") void context.resume().catch(() => {});
  } catch {
    // Audio is optional; unavailable devices must not block an answer.
  }
}

export function playConfirmationSound() {
  playNotes([
    [0, 660],
    [0.09, 880],
  ]);
}

export function playIncorrectSound() {
  // A soft descending cue, distinct from the rising confirmation chime.
  playNotes([
    [0, 392],
    [0.14, 293.66],
  ]);
}

export function playRewardSound() {
  playNotes([
    [0, 523.25],
    [0.12, 659.25],
    [0.24, 783.99],
    [0.4, 1046.5],
  ]);
}

export function playFourStarSound() {
  playNotes([
    [0, 523.25],
    [0.14, 659.25],
    [0.28, 783.99],
    [0.46, 880],
    [0.64, 783.99],
    [0.82, 1046.5],
    [0.82, 659.25],
  ]);
}

export function playPerfectSound() {
  playNotes([
    [0, 523.25],
    [0, 659.25],
    [0.16, 659.25],
    [0.16, 783.99],
    [0.32, 783.99],
    [0.32, 1046.5],
    [0.55, 1046.5],
    [0.78, 783.99],
    [0.94, 880],
    [1.1, 987.77],
    [1.3, 1046.5],
    [1.3, 1318.51],
    [1.3, 1567.98],
    [1.55, 1046.5],
    [1.55, 1318.51],
    [1.55, 1567.98],
    [1.85, 1046.5],
    [1.85, 1318.51],
    [1.85, 1567.98],
  ]);
}

function playNotes(notes: number[][]) {
  try {
    if (!context || context.state === "closed") return;
    if (context.state === "suspended") {
      void context
        .resume()
        .then(() => {
          if (context?.state === "running") playNotes(notes);
        })
        .catch(() => {});
      return;
    }
    const start = context.currentTime;
    // Short synthesized cues need no downloads or remote audio service.
    for (const [offset, frequency] of notes) {
      const tone = context.createOscillator();
      const volume = context.createGain();
      tone.type = "sine";
      tone.frequency.value = frequency;
      volume.gain.setValueAtTime(0, start + offset);
      volume.gain.linearRampToValueAtTime(0.09, start + offset + 0.012);
      volume.gain.exponentialRampToValueAtTime(0.001, start + offset + 0.18);
      tone.connect(volume);
      volume.connect(context.destination);
      tone.onended = () => {
        tone.disconnect();
        volume.disconnect();
      };
      tone.start(start + offset);
      tone.stop(start + offset + 0.2);
    }
  } catch {
    // Playback failures must not turn a saved answer into an error.
  }
}
