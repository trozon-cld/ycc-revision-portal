// Commands for Listen's <audio> element. The element is kept in React state, which components must not change
// directly (react-hooks/immutability), so playback changes go through these.

export function setPlaybackRate(audio: HTMLAudioElement, rate: number) {
  audio.defaultPlaybackRate = rate;
  audio.playbackRate = rate;
}

export function stepBack(audio: HTMLAudioElement, seconds: number) {
  audio.currentTime = Math.max(0, audio.currentTime - seconds);
}

// Loads `src` (or rewinds when it's already loaded) at the given speed, then plays it.
export function playFromStart(audio: HTMLAudioElement, src: string, rate: number): Promise<void> {
  if (audio.getAttribute("src") !== src) audio.setAttribute("src", src);
  else audio.currentTime = 0;
  audio.playbackRate = rate;
  return audio.play();
}

// Stops and empties the element (a new view).
export function clearAudio(audio: HTMLAudioElement) {
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
}

// Forgets a source that failed to load, so the error isn't reported again.
export function dropSource(audio: HTMLAudioElement) {
  audio.removeAttribute("src");
}
