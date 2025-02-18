export interface Airport {
  id: string;
  name: string;
  iata: string;
  url: string;
}

export interface YouTubeEvent {
  target: YouTubePlayer;
  data?: number;
}

export interface YouTubePlayerState {
  PLAYING: number;
        PAUSED: number;
        ENDED: number;
      };
}

export interface YouTubeIframeAPIReady {
  onYouTubeIframeAPIReady: () => void;
}

export interface YouTubePlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setVolume: (volume: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  loadVideoById: (options: { videoId: string; startSeconds: number }) => void;
}

export interface YouTubeEvent {
  target: YouTubePlayer;
  data?: number;
}
