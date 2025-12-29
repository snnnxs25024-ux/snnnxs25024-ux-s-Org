
// A simple cache for Audio objects to avoid re-creating them.
const audioCache: { [key: string]: HTMLAudioElement } = {};

export const playSound = (soundName: string) => {
  try {
    const isSoundEnabled = JSON.parse(localStorage.getItem('isSoundEnabled') ?? 'true');
    if (!isSoundEnabled) {
      return;
    }
    
    const soundSrc = `/sounds/${soundName}.mp3`;

    if (!audioCache[soundSrc]) {
        audioCache[soundSrc] = new Audio(soundSrc);
    }
    
    // Ensure the sound can be played again even if it's already playing.
    audioCache[soundSrc].currentTime = 0;
    audioCache[soundSrc].play().catch(error => {
      // Autoplay was prevented. This is a common browser policy.
      // We can ignore this error for UI feedback sounds.
      console.warn(`Sound play prevented for ${soundName}:`, error);
    });

  } catch (error) {
    console.error(`Error playing sound ${soundName}:`, error);
  }
};
