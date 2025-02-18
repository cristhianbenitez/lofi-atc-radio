import React, { useRef, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls } from '@react-three/drei';


interface WaveformProps {
  analyser: AnalyserNode | null;
  isDark: boolean;
}

function AudioWave({ analyser, isDark }: WaveformProps) {
  const lineRef = useRef<THREE.Line>(null);
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const dataArray = useRef<Uint8Array>();
  const smoothedData = useRef<Float32Array>();

  // Enhanced visualization parameters with responsive values
  const count = window.innerWidth < 768 ? 512 : 768; // Reduced point count for mobile
  const width = window.innerWidth < 768 ? 300 : 400; // Adjusted width for mobile
  const height = window.innerWidth < 768 ? 35 : 45; // Reduced height for mobile
  const smoothingFactor = window.innerWidth < 768 ? 0.2 : 0.15; // More smoothing on mobile

  // Optimized frequency analysis parameters for voice/radio
  const freqRangeStart = 0.05; // Skip the lowest frequencies
  const freqRangeEnd = 0.2; // Focus on voice frequency range
  const bassBoost = 1.1; // Subtle bass boost
  const midBoost = 1.5; // Enhance mid-ranges (voice frequencies)
  const trebleBoost = 0.7; // Reduce high frequencies

  useEffect(() => {
    if (!analyser) return;

    analyser.smoothingTimeConstant = 0.85; // Smoother frequency transitions
    dataArray.current = new Uint8Array(analyser.frequencyBinCount);
    smoothedData.current = new Float32Array(count).fill(0);

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const x = (t - 0.5) * width;

      positions[i * 3] = x;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;

      // Enhanced color gradients
      const color = new THREE.Color();
      if (isDark) {
        const hue = 0.55 + t * 0.12; // Narrower hue range for cohesion
        const saturation = 0.7 + Math.sin(t * Math.PI) * 0.2;
        const lightness = 0.5 + Math.sin(t * Math.PI * 2) * 0.1;
        color.setHSL(hue, saturation, lightness);
      } else {
        const baseIntensity = 0.4 + t * 0.2;
        const r = baseIntensity * 0.3;
        const g = baseIntensity * 0.4;
        const b = baseIntensity * 0.7;
        color.setRGB(r, g, b);
      }

      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    if (geometryRef.current) {
      geometryRef.current.setAttribute(
        'position',
        new THREE.BufferAttribute(positions, 3)
      );
      geometryRef.current.setAttribute(
        'color',
        new THREE.BufferAttribute(colors, 3)
      );
      geometryRef.current.computeBoundingSphere();
    }

    const handleResize = () => {
      // Update visualization parameters on resize
      const newCount = window.innerWidth < 768 ? 512 : 768;
      const newWidth = window.innerWidth < 768 ? 300 : 400;

      if (geometryRef.current) {
        const positions = new Float32Array(newCount * 3);
        const colors = new Float32Array(newCount * 3);

        for (let i = 0; i < newCount; i++) {
          const t = i / (newCount - 1);
          const x = (t - 0.5) * newWidth;

          positions[i * 3] = x;
          positions[i * 3 + 1] = 0;
          positions[i * 3 + 2] = 0;

          // Enhanced color gradients
          const color = new THREE.Color();
          if (isDark) {
            const hue = 0.55 + t * 0.12;
            const saturation = 0.7 + Math.sin(t * Math.PI) * 0.2;
            const lightness = 0.5 + Math.sin(t * Math.PI * 2) * 0.1;
            color.setHSL(hue, saturation, lightness);
          } else {
            const baseIntensity = 0.4 + t * 0.2;
            const r = baseIntensity * 0.3;
            const g = baseIntensity * 0.4;
            const b = baseIntensity * 0.7;
            color.setRGB(r, g, b);
          }

          colors[i * 3] = color.r;
          colors[i * 3 + 1] = color.g;
          colors[i * 3 + 2] = color.b;
        }

        geometryRef.current.setAttribute(
          'position',
          new THREE.BufferAttribute(positions, 3)
        );
        geometryRef.current.setAttribute(
          'color',
          new THREE.BufferAttribute(colors, 3)
        );
        geometryRef.current.computeBoundingSphere();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [analyser, isDark]);

  useFrame(({ clock }) => {
    if (
      !analyser ||
      !dataArray.current ||
      !smoothedData.current ||
      !lineRef.current ||
      !geometryRef.current
    )
      return;

    analyser.getByteFrequencyData(dataArray.current);
    const positions = geometryRef.current.attributes.position
      .array as Float32Array;
    const time = clock.getElapsedTime();

    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const freqT = freqRangeStart + (freqRangeEnd - freqRangeStart) * t;
      const freqIndex = Math.floor(freqT * dataArray.current.length);

      // Enhanced frequency processing
      let rawValue = dataArray.current[freqIndex] / 255.0;

      // Frequency-dependent boosting
      if (t < 0.3) {
        rawValue *= bassBoost;
      } else if (t < 0.7) {
        rawValue *= midBoost;
      } else {
        rawValue *= trebleBoost;
      }

      // Improved center bias for natural wave shape
      const centerBias = 1 - Math.pow(Math.abs(t - 0.5) * 2, 2) * 0.7;
      const scaledValue = Math.pow(rawValue * centerBias, 1.3);

      // Enhanced smoothing
      smoothedData.current[i] +=
        (scaledValue - smoothedData.current[i]) * smoothingFactor;

      const i3 = i * 3;
      positions[i3] = (t - 0.5) * width;

      // Enhanced wave movement
      const baseAmplitude = smoothedData.current[i] * height;
      const wavePhase = time * 1.5 + t * Math.PI * 3;
      const breathingEffect = Math.sin(time * 0.4) * 0.15;

      // More organic wave composition
      positions[i3 + 1] =
        baseAmplitude *
        (1.0 +
          Math.sin(wavePhase) * 0.4 +
          Math.sin(wavePhase * 0.5) * 0.3 +
          Math.sin(wavePhase * 0.25) * 0.2 +
          Math.sin(wavePhase * 0.125) * 0.1 + // Added subtle quaternary wave
          breathingEffect);

      // Enhanced depth movement
      positions[i3 + 2] = Math.cos(wavePhase * 0.2) * baseAmplitude * 0.2;
    }

    // Enhanced point smoothing with variable strength
    for (let i = 2; i < count - 2; i++) {
      const i3 = i * 3;
      const centerWeight = 1 - Math.pow(Math.abs(i / count - 0.5), 2);

      // 5-point smoothing
      positions[i3 + 1] =
        (positions[i3 - 6 + 1] * 0.1 +
          positions[i3 - 3 + 1] * 0.2 +
          positions[i3 + 1] * 0.4 +
          positions[i3 + 3 + 1] * 0.2 +
          positions[i3 + 6 + 1] * 0.1) *
        (0.8 + centerWeight * 0.2);
    }

    geometryRef.current.attributes.position.needsUpdate = true;

    // Smoother wave movement
    if (lineRef.current) {
      lineRef.current.rotation.z = Math.sin(time * 0.15) * 0.03;
      lineRef.current.rotation.x = Math.cos(time * 0.1) * 0.02;
      lineRef.current.position.y = Math.sin(time * 0.08) * 1.5;
    }
  });

  return (
    <line ref={lineRef}>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={new Float32Array(count * 3)}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={count}
          array={new Float32Array(count * 3)}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial
        vertexColors
        linewidth={1.5}
        transparent
        opacity={isDark ? 0.85 : 0.75}
      />
    </line>
  );
}

function Scene({ analyser, isDark }: WaveformProps) {
  const { camera } = useThree();

  useEffect(() => {
    const handleResize = () => {
      // Adjust camera position based on screen size
      const zPosition = window.innerWidth < 768 ? 180 : 150;
      const yPosition = window.innerWidth < 768 ? 5 : 10;

      camera.position.z = zPosition;
      camera.position.y = yPosition;
      camera.lookAt(0, 0, 0);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [camera]);

  return (
    <>
      <ambientLight intensity={isDark ? 0.3 : 0.5} />
      <pointLight position={[10, 10, 10]} intensity={isDark ? 0.7 : 0.9} />
      <AudioWave analyser={analyser} isDark={isDark} />
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        autoRotate={false}
        enableRotate={false}
      />
    </>
  );
}

interface AudioVisualizerProps {
  analyser: AnalyserNode | null;
  isDark: boolean;
}

export function AudioVisualizer({ analyser, isDark }: AudioVisualizerProps) {
  return (
    <div className="w-full h-full relative overflow-hidden">
      <Canvas
        camera={{ position: [0, 10, 150], fov: 30 }}
        style={{ background: 'transparent' }}
        className="w-full h-full"
      >
        <Scene analyser={analyser} isDark={isDark} />
      </Canvas>
    </div>
  );
}
