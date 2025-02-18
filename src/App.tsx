import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Volume2,
  VolumeX,
  Plane,
  Radio,
  Moon,
  Sun,
  Music,
  SkipForward,
  Settings,
  Rewind,
  FastForward,
  Play,
  Pause,
  Info,
  X,
  MapPin,
  ChevronDown
} from 'lucide-react';
import { AudioVisualizer } from './components/AudioVisualizer';
import { Toaster, toast } from 'sonner';
import { AIRPORTS, BOSSA_NOVA_PLAYLIST } from './data';
import { YouTubePlayer, YouTubeEvent } from './types';

// Add mobile detection utility
const isMobile = () => {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
};

// Add iOS detection utility
const isIOS = () => {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
};

// Add theme persistence hook
const useTheme = () => {
  // Check for system preference
  const getSystemTheme = () => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  };

  // Get initial theme from localStorage or system preference
  const getInitialTheme = () => {
    if (typeof window === 'undefined') return false;
    const savedTheme = localStorage.getItem('theme');
    return savedTheme ? JSON.parse(savedTheme) : getSystemTheme();
  };

  const [isDark, setIsDark] = useState(getInitialTheme());

  // Update localStorage and document class when theme changes
  useEffect(() => {
    localStorage.setItem('theme', JSON.stringify(isDark));
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      if (!localStorage.getItem('theme')) {
        setIsDark(e.matches);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return [isDark, setIsDark];
};

function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(50);
  const [youtubeVolume, setYoutubeVolume] = useState(50);
  const [error, setError] = useState<string | null>(null);
  const [isDark, setIsDark] = useTheme();
  const [isConnecting, setIsConnecting] = useState(false);
  const [attemptedAirports, setAttemptedAirports] = useState<Set<string>>(
    new Set()
  );
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [videoStartTime, setVideoStartTime] = useState(
    Math.floor(Math.random() * 150) + 30
  );
  const [isControlsExpanded, setIsControlsExpanded] = useState(false);
  const [isInfoExpanded, setIsInfoExpanded] = useState(false);
  const [isLocationExpanded, setIsLocationExpanded] = useState(false);
  const [currentAirport, setCurrentAirport] = useState(AIRPORTS[0]);
  const [youtubeState, setYoutubeState] = useState({
    isPlaying: false
  });
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [isIOSDevice, setIsIOSDevice] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const youtubeRef = useRef<HTMLIFrameElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const retryTimeoutRef = useRef<number | null>(null);
  const isInitializingRef = useRef(false);
  const youtubePlayerRef = useRef<YouTubePlayer | null>(null);

  const getCurrentAudioStream = (id: string) =>
    `https://lofi-atc-proxy.vercel.app/proxy/${id}`;

  const getNextAirport = (currentId: string) => {
    // Get all airports we haven't tried yet
    const remainingAirports = AIRPORTS.filter(
      (a) => !attemptedAirports.has(a.id)
    );

    // If we've tried all airports, reset the attempted list and try again
    if (remainingAirports.length === 0) {
      setAttemptedAirports(new Set());
      return AIRPORTS[
        (AIRPORTS.findIndex((a) => a.id === currentId) + 1) % AIRPORTS.length
      ];
    }

    // Find the next untried airport
    const currentIndex = AIRPORTS.findIndex((a) => a.id === currentId);
    for (let i = 1; i <= AIRPORTS.length; i++) {
      const nextAirport = AIRPORTS[(currentIndex + i) % AIRPORTS.length];
      if (!attemptedAirports.has(nextAirport.id)) {
        return nextAirport;
      }
    }
    return AIRPORTS[0]; // Fallback, should never reach here
  };

  const cleanupAudioResources = async () => {
    // Clear any pending retry attempts
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    // Disconnect and cleanup source node
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
        sourceNodeRef.current = null;
      } catch (err) {
        console.error('Error disconnecting source node:', err);
      }
    }

    // Disconnect and cleanup analyser node
    if (analyserNodeRef.current) {
      try {
        analyserNodeRef.current.disconnect();
        analyserNodeRef.current = null;
      } catch (err) {
        console.error('Error disconnecting analyser node:', err);
      }
    }

    // Close audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        await audioContextRef.current.close();
        audioContextRef.current = null;
      } catch (err) {
        console.error('Error closing audio context:', err);
      }
    }

    // Cleanup audio element
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current.load();
      } catch (err) {
        console.error('Error cleaning up audio element:', err);
      }
    }
  };

  // Initialize audio element
  useEffect(() => {
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audioRef.current = audio;

    const handleError = async (e: Event) => {
      if (!audioRef.current) return;

      // Add a small delay before retrying
      await new Promise((resolve) => setTimeout(resolve, 1000));

      try {
        const nextAirport = getNextAirport(currentAirport.id);
        setCurrentAirport(nextAirport);
        setAttemptedAirports((prev) => new Set([...prev, currentAirport.id]));

        // Reset audio element
        audioRef.current.src = getCurrentAudioStream(nextAirport.id);
        await audioRef.current.load();

        if (isPlaying) {
          await startAudioWithTimeout();
        }
      } catch (error) {
        console.error('Audio stream error:', event);
        setError('Failed to load audio stream. Please try again.');
      }
    };

    const handleEnded = () => {
      if (isPlaying) {
        retryTimeoutRef.current = window.setTimeout(() => {
          if (isPlaying) {
            startAudioWithTimeout().catch(console.error);
          }
        }, 2000);
      }
    };

    audio.addEventListener('error', handleError);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('ended', handleEnded);
      cleanupAudioResources();
    };
  }, [currentAirport, attemptedAirports]);

  // Consolidate all YouTube player functions into one handleYoutubeControls object
  const handleYoutubeControls = {
    nextTrack: useCallback(() => {
      // Ensure that the youtubeRef is valid (using youtubeRef instead of youtubePlayerRef like in old code)
      if (!youtubeRef.current) {
        return;
      }

      // Calculate the index of the next video in the playlist
      const nextIndex = (currentVideoIndex + 1) % BOSSA_NOVA_PLAYLIST.length;
      setCurrentVideoIndex(nextIndex);
      setVideoStartTime(Math.floor(Math.random() * 150) + 30); // Update video start time

      const iframeWindow = youtubeRef.current.contentWindow; // Get iframe window

      if (iframeWindow) {
        // **Introduce setTimeout like in the old code**
        setTimeout(() => {
          iframeWindow.postMessage(
            '{"event":"command","func":"playVideo","args":""}',
            '*'
          );
          setYoutubeState((prev) => ({ ...prev, isPlaying: true })); // Optimistically set state to playing
        }, 1000); // 1 second delay - like in old code
      } else {
        toast.error('Error loading next track. Iframe window not found.', {
          // User feedback
          className: isDark ? 'dark-toast' : '',
          position: 'top-center'
        });
      }

      // Provide user feedback with a success toast notification
      toast.success(`Playing: ${BOSSA_NOVA_PLAYLIST[nextIndex].title}`, {
        className: isDark ? 'dark-toast' : '',
        position: 'top-center'
      });
    }, [currentVideoIndex, setVideoStartTime]),

    playPause: useCallback(() => {
      if (!youtubePlayerRef.current || !isPlaying) return;

      if (youtubeState.isPlaying) {
        youtubePlayerRef.current.pauseVideo();
        setYoutubeState((prev) => ({ ...prev, isPlaying: false }));
      } else {
        youtubePlayerRef.current.playVideo();
        setYoutubeState((prev) => ({ ...prev, isPlaying: true }));
      }
    }, [youtubeState.isPlaying, isPlaying]),

    seek: useCallback((seconds: number) => {
      youtubePlayerRef.current?.seekTo(seconds, true);
    }, []),

    skipForward: useCallback(() => {
      if (!youtubePlayerRef.current) return;
      const currentTime = youtubePlayerRef.current.getCurrentTime();
      youtubePlayerRef.current.seekTo(currentTime + 10, true);
    }, []),

    skipBackward: useCallback(() => {
      if (!youtubePlayerRef.current) return;
      const currentTime = youtubePlayerRef.current.getCurrentTime();
      youtubePlayerRef.current.seekTo(Math.max(0, currentTime - 10), true);
    }, []),

    setVolume: useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      const newVolume = parseInt(e.target.value, 10);
      setYoutubeVolume(newVolume);
      youtubePlayerRef.current?.setVolume(newVolume);
    }, [])
  };

  // Update the renderPlaybackControls to use the consolidated functions
  const renderPlaybackControls = () => (
    <div className="flex items-center justify-between">
      <button
        onClick={handleYoutubeControls.skipBackward}
        className={`p-2 rounded-lg ${
          isDark ? 'hover:bg-white/10' : 'hover:bg-black/10'
        } transition-colors ${
          !isPlaying ? 'opacity-50 cursor-not-allowed' : ''
        }`}
        disabled={!isPlaying}
        title="Skip backward 10s"
      >
        <Rewind
          className={`w-4 h-4 opacity-60 hover:opacity-100 transition-opacity ${
            isDark ? 'text-white' : 'text-black'
          }`}
        />
      </button>

      <button
        onClick={handleYoutubeControls.playPause}
        className={`p-2 rounded-lg ${
          isDark ? 'hover:bg-white/10' : 'hover:bg-black/10'
        } transition-colors ${
          !isPlaying ? 'opacity-50 cursor-not-allowed' : ''
        }`}
        disabled={!isPlaying}
        title={youtubeState.isPlaying ? 'Pause' : 'Play'}
      >
        {youtubeState.isPlaying ? (
          <Pause
            className={`w-4 h-4 opacity-60 hover:opacity-100 transition-opacity ${
              isDark ? 'text-white' : 'text-black'
            }`}
          />
        ) : (
          <Play
            className={`w-4 h-4 opacity-60 hover:opacity-100 transition-opacity ${
              isDark ? 'text-white' : 'text-black'
            }`}
          />
        )}
      </button>

      <button
        onClick={handleYoutubeControls.skipForward}
        className={`p-2 rounded-lg ${
          isDark ? 'hover:bg-white/10' : 'hover:bg-black/10'
        } transition-colors ${
          !isPlaying ? 'opacity-50 cursor-not-allowed' : ''
        }`}
        disabled={!isPlaying}
        title="Skip forward 10s"
      >
        <FastForward
          className={`w-4 h-4 opacity-60 hover:opacity-100 transition-opacity ${
            isDark ? 'text-white' : 'text-black'
          }`}
        />
      </button>

      <button
        onClick={handleYoutubeControls.nextTrack}
        className={`p-2 rounded-lg ${
          isDark ? 'hover:bg-white/10' : 'hover:bg-black/10'
        } transition-colors ${
          !isPlaying ? 'opacity-50 cursor-not-allowed' : ''
        }`}
        disabled={!isPlaying}
        title="Next track"
      >
        <SkipForward
          className={`w-4 h-4 opacity-60 hover:opacity-100 transition-opacity ${
            isDark ? 'text-white' : 'text-black'
          }`}
        />
      </button>
    </div>
  );

  // Update the YouTube initialization effect to use the consolidated functions
  useEffect(() => {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

    window.onYouTubeIframeAPIReady = () => {
      if (!youtubeRef.current) return;

      youtubePlayerRef.current = new window.YT.Player(youtubeRef.current, {
        videoId: BOSSA_NOVA_PLAYLIST[currentVideoIndex].id,
        playerVars: {
          start: videoStartTime,
          controls: 0,
          playsinline: 1,
          modestbranding: 1,
          loop: 1,
          rel: 0,
          showinfo: 0,
          iv_load_policy: 3
        },
        events: {
          onReady: (event: YouTubeEvent) => {
            youtubePlayerRef.current = event.target;
            event.target.setVolume(youtubeVolume);
          },
          onStateChange: (event: YouTubeEvent) => {
            if (event.data === window.YT.PlayerState.PLAYING) {
              setYoutubeState((prev) => ({ ...prev, isPlaying: true }));
            } else if (event.data === window.YT.PlayerState.PAUSED) {
              setYoutubeState((prev) => ({ ...prev, isPlaying: false }));
            } else if (event.data === window.YT.PlayerState.ENDED) {
              handleYoutubeControls.nextTrack();
            }
          }
        }
      });
    };
  }, [
    currentVideoIndex,
    videoStartTime,
    youtubeVolume,
    handleYoutubeControls.nextTrack
  ]);

  // Handle volume changes
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseInt(e.target.value, 10);
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume / 100;
    }
  };

  const selectAirport = async (airport: (typeof AIRPORTS)[0]) => {
    if (isPlaying) {
      await cleanupAudioResources();
      setIsPlaying(false);
    }
    setCurrentAirport(airport);
    setAttemptedAirports(new Set()); // Reset attempted airports list
    setIsLocationExpanded(false);
    toast.success(`Switched to ${airport.name} ATC`, {
      className: isDark ? 'dark-toast' : '',
      position: 'top-center'
    });
  };

  const toggleTheme = useCallback(() => {
    setIsDark((prev) => !prev);
  }, [setIsDark]);
  const toggleControls = () => setIsControlsExpanded(!isControlsExpanded);
  const toggleInfo = () => setIsInfoExpanded(!isInfoExpanded);
  const toggleLocation = () => setIsLocationExpanded(!isLocationExpanded);

  useEffect(() => {
    setIsMobileDevice(isMobile());
    setIsIOSDevice(isIOS());
  }, []);

  const startAudioWithTimeout = async () => {
    if (!audioRef.current) return;

    setIsConnecting(true);
    setError(null);

    try {
      // Set a timeout for the connection
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), 10000);
      });

      // Set up audio element
      audioRef.current.src = getCurrentAudioStream(currentAirport.id);
      audioRef.current.volume = volume / 100;

      // Initialize audio context only if not already initialized
      if (
        !audioContextRef.current ||
        audioContextRef.current.state === 'closed'
      ) {
        const success = initializeAudioContext();
        if (!success) {
          throw new Error('Failed to initialize audio system');
        }
      }

      // Resume audio context if it's in suspended state
      if (audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      // Race between audio loading and timeout
      await Promise.race([
        new Promise((resolve) => {
          audioRef.current!.oncanplay = resolve;
        }),
        timeoutPromise
      ]);

      await audioRef.current.play();
      setIsPlaying(true);
      setError(null);
    } catch (error) {
      console.error('Audio start error:', error);
      if (error.message === 'Connection timeout') {
        setError('Connection timeout. Trying next station...');
        // Try next airport
        const nextAirport = getNextAirport(currentAirport.id);
        setCurrentAirport(nextAirport);
        setAttemptedAirports((prev) => new Set([...prev, currentAirport.id]));
      } else {
        setError('Failed to start audio. Please try again.');
      }
      setIsPlaying(false);
    } finally {
      setIsConnecting(false);
    }
  };

  const initializeAudioContext = () => {
    try {
      // Clean up existing audio context and nodes
      if (sourceNodeRef.current) {
        sourceNodeRef.current.disconnect();
        sourceNodeRef.current = null;
      }
      if (analyserNodeRef.current) {
        analyserNodeRef.current.disconnect();
        analyserNodeRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }

      // Create new audio context
      audioContextRef.current = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      if (!audioRef.current) return;

      sourceNodeRef.current = audioContextRef.current.createMediaElementSource(
        audioRef.current
      );
      analyserNodeRef.current = audioContextRef.current.createAnalyser();
      sourceNodeRef.current.connect(analyserNodeRef.current);
      analyserNodeRef.current.connect(audioContextRef.current.destination);

      return true;
    } catch (error) {
      console.error('Error initializing audio context:', error);
      return false;
    }
  };

  const togglePlay = async () => {
    if (!audioRef.current || isInitializingRef.current) return;

    try {
      if (isPlaying) {
        audioRef.current.pause();
        if (youtubePlayerRef.current) {
          youtubePlayerRef.current.pauseVideo();
        }
        setIsPlaying(false);
      } else {
        isInitializingRef.current = true;
        await startAudioWithTimeout();
        if (youtubePlayerRef.current) {
          // Add a small delay to ensure audio starts first
          setTimeout(() => {
            youtubePlayerRef.current?.playVideo();
          }, 500);
        }
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Error toggling play state:', error);
    } finally {
      isInitializingRef.current = false;
    }
  };

  // Add consistent theme classes
  const themeClasses = {
    app: `min-h-screen flex flex-col ${
      isDark ? 'dark bg-neutral-900' : 'bg-neutral-100'
    }`,
    button: `${
      isDark ? 'bg-white/20 hover:bg-white/30' : 'bg-black/5 hover:bg-black/10'
    }`,
    panel: `${
      isDark ? 'bg-black/95 border-white/5' : 'bg-white/95 border-black/5'
    }`,
    text: `${isDark ? 'text-white/80' : 'text-black/80'}`,
    icon: `${isDark ? 'text-white/60' : 'text-black/60'}`,
    border: `${isDark ? 'border-white/5' : 'border-black/5'}`,
    hover: `${isDark ? 'hover:bg-white/10' : 'hover:bg-black/10'}`
  };

  return (
    <div className={themeClasses.app}>
      <Toaster
        theme={isDark ? 'dark' : 'light'}
        duration={2000}
        closeButton
        dismissible
      />

      <button
        onClick={toggleTheme}
        className={`fixed top-6 right-6 p-3 rounded-full ${themeClasses.button} transition-all duration-300 z-50`}
        aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      >
        {isDark ? (
          <Sun className={themeClasses.icon} />
        ) : (
          <Moon className={themeClasses.icon} />
        )}
      </button>

      {/* Info Button */}
      <button
        onClick={toggleInfo}
        className={`fixed bottom-6 left-6 p-3 rounded-full ${
          isDark
            ? 'bg-white/20 hover:bg-white/30'
            : 'bg-black/10 hover:bg-black/15'
        } transition-all duration-300 z-[9999]`}
        title="Info"
      >
        <Info
          className={`w-6 h-6 ${
            isInfoExpanded ? 'opacity-100' : 'opacity-80'
          } transition-opacity duration-300`}
        />
      </button>

      {/* Info Panel */}
      <div
        className={`fixed bottom-20 left-6 ${
          themeClasses.panel
        } backdrop-blur-md rounded-xl border max-w-[320px] ${
          themeClasses.border
        } transition-all duration-500 flex flex-col min-w-[280px] z-[9999] overflow-hidden ${
          isInfoExpanded
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
      >
        <div className="p-4 space-y-4">
          <div className="space-y-2">
            <h3 className="text-sm font-medium opacity-80">About</h3>
            <p className="text-xs opacity-60 leading-relaxed">
              Inspired by{' '}
              <a
                href="https://lofiatc.pieter.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:opacity-100 transition-opacity"
              >
                lofi atc 🇧🇷 edition
              </a>
              , this project combines air traffic control radio with ambient
              music for a unique listening experience.
            </p>
          </div>

          <div className="h-px w-full bg-current opacity-10" />

          <div className="space-y-2">
            <h3 className="text-sm font-medium opacity-80">Disclaimer</h3>
            <p className="text-xs opacity-60 leading-relaxed">
              This service is for entertainment and training purposes only. Do
              not rely on it for any operational, commercial, or official
              activities. All audio streams are provided by LiveATC.net and are
              subject to their terms of use.
            </p>
          </div>

          <div className="h-px w-full bg-current opacity-10" />

          <div className="space-y-2">
            <h3 className="text-sm font-medium opacity-80">Connect</h3>
            <div className="flex flex-col gap-2">
              <a
                href="https://x.com/pipebenitez25"
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg ${
                  isDark
                    ? 'bg-white/5 hover:bg-white/10'
                    : 'bg-black/5 hover:bg-black/10'
                } transition-colors text-xs`}
              >
                <X className="w-3 h-3 opacity-60" />
                <span className="opacity-80">@pipebenitez25</span>
              </a>
              <a
                href="https://github.com/cristhianbenitez/lofi-atc-radio"
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg ${
                  isDark
                    ? 'bg-white/5 hover:bg-white/10'
                    : 'bg-black/5 hover:bg-black/10'
                } transition-colors text-xs`}
              >
                <svg
                  className="w-3 h-3 opacity-60"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                <span className="opacity-80">GitHub Repository</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Volume Controls Button */}
      <button
        onClick={toggleControls}
        className={`fixed bottom-6 right-6 p-3 rounded-full ${
          isDark
            ? 'bg-white/20 hover:bg-white/30'
            : 'bg-black/10 hover:bg-black/15'
        } transition-all duration-300 z-[9999]`}
        title="Volume Controls"
      >
        <Settings
          className={`w-6 h-6 ${
            isControlsExpanded ? 'opacity-100' : 'opacity-80'
          } transition-opacity duration-300`}
        />
      </button>

      {/* Volume Controls Panel */}
      <div
        className={`fixed bottom-20 right-6 ${
          themeClasses.panel
        } backdrop-blur-md rounded-xl border ${
          themeClasses.border
        } transition-all duration-500 flex flex-col min-w-[280px] z-[9999] overflow-hidden ${
          isControlsExpanded
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
      >
        <div className="p-4 space-y-4">
          {/* Playback Controls */}
          {renderPlaybackControls()}

          <div className="h-px w-full bg-current opacity-10" />

          {/* Volume Controls */}
          <div className="space-y-3 w-full">
            {/* Ambient Volume */}
            <div className="flex items-center gap-3 w-full">
              <Music
                className={`w-4 h-4 flex-shrink-0 ${
                  isDark ? 'text-neutral-500' : 'text-neutral-400'
                } transition-colors duration-500`}
              />
              <input
                type="range"
                min="0"
                max="100"
                value={youtubeVolume}
                onChange={handleYoutubeControls.setVolume}
                className={`flex-1 ${
                  isDark ? 'accent-white' : 'accent-black'
                } transition-colors duration-500`}
              />
              <span
                className={`text-xs font-light ${
                  isDark ? 'text-neutral-500' : 'text-neutral-400'
                } tracking-wider min-w-[2.5ch] text-right`}
              >
                {youtubeVolume}
              </span>
            </div>

            {/* Transmission Volume */}
            <div className="flex items-center gap-3 w-full">
              <Radio
                className={`w-4 h-4 flex-shrink-0 ${
                  isDark ? 'text-neutral-500' : 'text-neutral-400'
                } transition-colors duration-500`}
              />
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={handleVolumeChange}
                className={`flex-1 ${
                  isDark ? 'accent-white' : 'accent-black'
                } transition-colors duration-500`}
              />
              <span
                className={`text-xs font-light ${
                  isDark ? 'text-neutral-500' : 'text-neutral-400'
                } tracking-wider min-w-[2.5ch] text-right`}
              >
                {volume}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col p-8">
        <header className="text-center mb-12">
          <div
            className={`inline-flex items-center justify-center gap-3 border ${themeClasses.border} px-6 py-2 rounded-full mb-6 transition-colors duration-500`}
          >
            <Plane
              className={`w-4 h-4 ${
                isDark ? 'opacity-50' : 'opacity-40'
              } transition-opacity duration-500`}
            />
            <span
              className={`text-xs font-light tracking-[0.2em] ${
                isDark ? 'text-neutral-400' : 'text-neutral-500'
              } transition-colors duration-500`}
            >
              LIVE FROM{' '}
              <div
                className="inline-block relative"
                data-location-selector
                role="combobox"
                aria-expanded={isLocationExpanded}
                aria-haspopup="listbox"
                aria-controls="location-listbox"
              >
                <div
                  onClick={toggleLocation}
                  className="inline-flex items-center gap-1 hover:opacity-100 transition-opacity cursor-pointer"
                  role="button"
                  tabIndex={0}
                  aria-label="Select location"
                >
                  {currentAirport.name.toUpperCase()}
                  <ChevronDown
                    className={`w-3 h-3 transition-transform duration-300 ${
                      isLocationExpanded ? 'rotate-180' : ''
                    }`}
                  />
                </div>
                {/* Location Selector Dropdown */}
                <div
                  id="location-listbox"
                  role="listbox"
                  aria-label="Airport locations"
                  className={`absolute top-full left-1/2 -translate-x-1/2 mt-2 py-2 z-[99999] ${
                    themeClasses.panel
                  } backdrop-blur-md rounded-xl border ${
                    themeClasses.border
                  } transition-all duration-300 min-w-[200px] ${
                    isLocationExpanded
                      ? 'opacity-100 translate-y-0'
                      : 'opacity-0 translate-y-2 pointer-events-none'
                  }`}
                >
                  {AIRPORTS.map((airport) => (
                    <div
                      key={airport.id}
                      role="option"
                      aria-selected={airport.id === currentAirport.id}
                      onClick={() => selectAirport(airport)}
                      className={`w-full px-4 py-2 text-left hover:${
                        themeClasses.hover
                      } transition-colors flex items-center gap-3 cursor-pointer ${
                        airport.id === currentAirport.id
                          ? isDark
                            ? 'bg-white/10'
                            : 'bg-black/10'
                          : ''
                      }`}
                    >
                      <MapPin
                        className={`w-3 h-3 ${
                          isDark ? 'text-neutral-500' : 'text-neutral-400'
                        }`}
                      />
                      <div className="flex flex-col items-start">
                        <span className="text-xs tracking-wider">
                          {airport.name}
                        </span>
                        <span
                          className={`text-[10px] ${
                            isDark ? 'text-neutral-500' : 'text-neutral-400'
                          }`}
                        >
                          {airport.iata}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </span>
          </div>
          <h1 className="text-center mb-2">
            <div className="flex items-center justify-center space-x-2">
              <Radio className={`w-6 h-6 ${themeClasses.text}`} />
              <span className={`text-xl font-medium ${themeClasses.text}`}>
                {isConnecting ? (
                  <span className="flex items-center space-x-2">
                    <span>Connecting to {currentAirport.name}</span>
                    <span className="inline-block">
                      <span className="animate-pulse">.</span>
                      <span className="animate-pulse delay-100">.</span>
                      <span className="animate-pulse delay-200">.</span>
                    </span>
                  </span>
                ) : (
                  'Lofi ATC Radio'
                )}
              </span>
            </div>
          </h1>
        </header>

        <div className="flex-1 grid grid-rows-[2fr,1fr] gap-8 max-w-7xl mx-auto w-full">
          <div
            className={`border ${themeClasses.border} rounded-3xl p-8 flex flex-col transition-colors duration-500 w-full`}
          >
            {isPlaying ? (
              <div className="flex-1 w-full">
                <AudioVisualizer
                  analyser={analyserNodeRef.current}
                  isDark={isDark}
                />
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p
                  className={`text-lg font-light ${
                    isDark ? 'text-white/30' : 'text-black/30'
                  } tracking-wider transition-colors duration-500`}
                >
                  Waiting for transmission...
                </p>
              </div>
            )}
            <button
              onClick={togglePlay}
              className={`py-3 px-6 ${themeClasses.button} rounded-xl inline-flex items-center justify-center gap-3 transition-all duration-300 group ml-auto`}
            >
              {isPlaying ? (
                <VolumeX
                  className={`w-5 h-5 ${
                    isDark ? 'opacity-50' : 'opacity-40'
                  } group-hover:opacity-100 transition-opacity`}
                />
              ) : (
                <Volume2
                  className={`w-5 h-5 ${
                    isDark ? 'opacity-50' : 'opacity-40'
                  } group-hover:opacity-100 transition-opacity`}
                />
              )}
              <span className="text-sm font-light tracking-wide">
                {isPlaying ? 'STOP' : 'START'}
              </span>
            </button>
          </div>

          <div
            className={`border ${themeClasses.border} rounded-3xl overflow-hidden transition-colors duration-500 relative z-0`}
          >
            <div className="video-container">
              <iframe
                ref={youtubeRef}
                src={`https://www.youtube.com/embed/${BOSSA_NOVA_PLAYLIST[currentVideoIndex].id}?enablejsapi=1&autoplay=0&controls=0&modestbranding=1&disablekb=1&fs=0&rel=0&iv_load_policy=3&showinfo=0&playsinline=1&origin=${window.location.origin}&start=${videoStartTime}`}
                title="Ambient Music"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                className={`youtube-player ${isMobileDevice ? 'mobile' : ''}`}
              />
            </div>
          </div>
        </div>
      </div>
      <style>{`
        .youtube-player {
          pointer-events: ${isMobileDevice ? 'auto' : 'none'};
        }
      `}</style>
    </div>
  );
}

export default App;
