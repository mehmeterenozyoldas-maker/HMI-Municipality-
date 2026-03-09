
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GestureState } from '../types';

interface HandControlSystemProps {
  onGestureUpdate: (state: GestureState) => void;
}

// Configuration
const CONFIG = {
  // Logic
  JOYSTICK_CENTER: { x: 0.75, y: 0.6 }, // Raw coords (User Left = Image Right)
  JOYSTICK_DEADZONE: 0.04,
  JOYSTICK_RANGE: 0.2, 
  PINCH_THRESHOLD: 0.1, 
  
  // Blowing Logic (Vision based)
  PUCKER_THRESHOLD: 0.55, 
  OPEN_THRESHOLD: 0.05,
  
  // Visuals - HUD Colors
  COLOR_HUD_BASE: 'rgba(255, 255, 255, 0.1)',
  COLOR_ORBIT: '#22d3ee', // Cyan
  COLOR_HELIOS: '#f59e0b', // Amber
  COLOR_WIND: '#10b981', // Emerald
};

export const HandControlSystem = ({ onGestureUpdate }: HandControlSystemProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data Refs to sync between callbacks and render loop
  const latestHands = useRef<any>(null);
  const latestFace = useRef<any>(null);

  // Keep track of instances to clean up
  const instances = useRef<{hands: any, faceMesh: any, camera: any}>({ hands: null, faceMesh: null, camera: null });

  // Mutable state passed to parent
  const gestureState = useRef<GestureState>({
    joystick: { active: false, deltaX: 0, deltaY: 0, position: { x: 0, y: 0 } },
    helios: { active: false, x: 0.5, y: 0.5, pinching: false, pinchStrength: 0 },
    wind: { active: false, strength: 0 }
  });

  const triggerInit = useCallback(() => {
    window.location.reload();
  }, []);

  const handleGrantPermission = async () => {
      try {
          setError(null);
          setIsInitializing(true);
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          stream.getTracks().forEach(t => t.stop());
          triggerInit();
      } catch (e: any) {
          console.error("Permission denied explicitly", e);
          setIsInitializing(false);
          if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
              setError("Camera permission denied.");
          } else {
              setError(`Camera error: ${e.message}`);
          }
      }
  };

  useEffect(() => {
    let isMounted = true;
    let animFrame: number;

    const waitForGlobals = async () => {
        let attempts = 0;
        while (attempts < 20) {
            if (window.Hands && window.FaceMesh && window.Camera) return true;
            await new Promise(resolve => setTimeout(resolve, 500));
            attempts++;
        }
        return false;
    };

    const loadModels = async () => {
      if (!isMounted) return;
      setIsInitializing(true);
      setError(null);

      try {
        if (!window.Hands || !window.FaceMesh || !window.Camera) {
            throw new Error("MediaPipe libraries failed to load from CDN.");
        }

        // --- 1. Initialize Hands ---
        const hands = new window.Hands({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });
        hands.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });
        hands.onResults((results: any) => { if (isMounted) latestHands.current = results; });
        instances.current.hands = hands;

        // --- 2. Initialize Face Mesh ---
        const faceMesh = new window.FaceMesh({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
        });
        faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });
        faceMesh.onResults((results: any) => { if (isMounted) latestFace.current = results; });
        instances.current.faceMesh = faceMesh;

        // --- 3. Initialize Camera ---
        if (videoRef.current) {
          const camera = new window.Camera(videoRef.current, {
            onFrame: async () => {
              if (!isMounted || !videoRef.current) return;
              try {
                  if (instances.current.hands) await instances.current.hands.send({image: videoRef.current});
                  if (instances.current.faceMesh) await instances.current.faceMesh.send({image: videoRef.current});
              } catch (err) {}
            },
            width: 640,
            height: 480
          });
          await camera.start();
          instances.current.camera = camera;
        }

        if (isMounted) setIsInitializing(false);

      } catch (e: any) {
        if (isMounted) {
            setIsInitializing(false);
            if (e.message.includes("permission") || e.name === "NotAllowedError") {
                setError("Camera permission denied.");
            } else {
                setError("System error: Failed to access camera.");
            }
        }
      }
    };

    const renderLoop = () => {
      if (!isMounted) return;
      if (canvasRef.current) processFrame();
      animFrame = requestAnimationFrame(renderLoop);
    };

    const processFrame = () => {
      if (!canvasRef.current) return;
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;
      const width = canvasRef.current.width;
      const height = canvasRef.current.height;

      // 1. Clear & Setup
      ctx.save();
      ctx.clearRect(0, 0, width, height);
      ctx.translate(width, 0);
      ctx.scale(-1, 1);

      // 2. HUD Grid
      drawTechnicalGrid(ctx, width, height);

      // 3. Process State
      const currentJoystick = { ...gestureState.current.joystick, active: false };
      const currentHelios = { ...gestureState.current.helios, active: false };
      const currentWind = { ...gestureState.current.wind, active: false, strength: 0 };

      // --- HANDS LOGIC ---
      if (latestHands.current && latestHands.current.multiHandLandmarks) {
        for (let i = 0; i < latestHands.current.multiHandLandmarks.length; i++) {
          const landmarks = latestHands.current.multiHandLandmarks[i];
          const isLeftHandZone = landmarks[0].x > 0.5;

          if (isLeftHandZone) {
            // Left Hand: Joystick
            const palmX = landmarks[9].x;
            const palmY = landmarks[9].y;
            const rawDx = palmX - CONFIG.JOYSTICK_CENTER.x;
            const rawDy = palmY - CONFIG.JOYSTICK_CENTER.y;
            const dist = Math.sqrt(rawDx*rawDx + rawDy*rawDy);
            let deltaX = 0, deltaY = 0;

            if (dist > CONFIG.JOYSTICK_DEADZONE) {
               const effectiveDist = Math.min(dist, CONFIG.JOYSTICK_RANGE) - CONFIG.JOYSTICK_DEADZONE;
               const normalizedMag = effectiveDist / (CONFIG.JOYSTICK_RANGE - CONFIG.JOYSTICK_DEADZONE);
               const angle = Math.atan2(rawDy, rawDx);
               deltaX = Math.cos(angle) * normalizedMag;
               deltaY = Math.sin(angle) * normalizedMag;
            }

            drawTargetLock(ctx, width, height, landmarks, deltaX, deltaY, CONFIG.COLOR_ORBIT);
            
            currentJoystick.active = Math.abs(deltaX) > 0.01 || Math.abs(deltaY) > 0.01;
            currentJoystick.deltaX = -deltaX; 
            currentJoystick.deltaY = deltaY;
            currentJoystick.position = { x: palmX, y: palmY };

          } else {
            // Right Hand: Helios
            const palm = landmarks[9];
            const thumb = landmarks[4];
            const index = landmarks[8];
            
            let controlX = (0.5 - palm.x) * 2.0; 
            controlX = Math.max(0, Math.min(1, controlX));
            let controlY = 1.0 - palm.y;
            controlY = Math.max(0, Math.min(1, controlY));

            const distance = Math.hypot(thumb.x - index.x, thumb.y - index.y);
            const clampDist = Math.max(0, Math.min(distance, CONFIG.PINCH_THRESHOLD));
            const rawStrength = 1 - (clampDist / CONFIG.PINCH_THRESHOLD);
            const pinchStrength = Math.pow(rawStrength, 2);

            drawHeliosInterface(ctx, width, height, landmarks, pinchStrength, CONFIG.COLOR_HELIOS);

            currentHelios.active = true;
            currentHelios.x = controlX;
            currentHelios.y = controlY;
            currentHelios.pinching = pinchStrength > 0.1;
            currentHelios.pinchStrength = pinchStrength;
          }
        }
      }

      // --- FACE LOGIC (Blowing) ---
      if (latestFace.current && latestFace.current.multiFaceLandmarks && latestFace.current.multiFaceLandmarks.length > 0) {
        const landmarks = latestFace.current.multiFaceLandmarks[0];
        
        const mouthLeft = landmarks[61];
        const mouthRight = landmarks[291];
        const faceLeft = landmarks[454];
        const faceRight = landmarks[234];
        const lipTop = landmarks[13];
        const lipBot = landmarks[14];

        const mouthWidth = Math.hypot(mouthLeft.x - mouthRight.x, mouthLeft.y - mouthRight.y);
        const faceWidth = Math.hypot(faceLeft.x - faceRight.x, faceLeft.y - faceRight.y);
        const lipHeight = Math.hypot(lipTop.x - lipBot.x, lipTop.y - lipBot.y);
        
        const puckerRatio = mouthWidth / (faceWidth || 1); 
        const openRatio = lipHeight / (mouthWidth || 1); 

        if (puckerRatio < CONFIG.PUCKER_THRESHOLD && openRatio > CONFIG.OPEN_THRESHOLD) {
            const range = 0.25;
            const val = Math.max(0, CONFIG.PUCKER_THRESHOLD - puckerRatio);
            const strength = Math.min(1, val / range);
            
            currentWind.active = true;
            currentWind.strength = 0.3 + (strength * 0.7); 
            
            drawWindVectorField(ctx, width, height, landmarks, currentWind.strength, CONFIG.COLOR_WIND);
        }
      }

      gestureState.current = { joystick: currentJoystick, helios: currentHelios, wind: currentWind };
      onGestureUpdate(gestureState.current);
      ctx.restore();
    };

    const init = async () => {
        setIsInitializing(true);
        const ready = await waitForGlobals();
        if (ready && isMounted) {
            loadModels();
            renderLoop();
        } else if (isMounted) {
            setError("Failed to load computer vision libraries.");
            setIsInitializing(false);
        }
    };

    init();

    return () => {
      isMounted = false;
      cancelAnimationFrame(animFrame);
      if (instances.current.camera) try { instances.current.camera.stop(); } catch(e) {}
    };
  }, [onGestureUpdate]);

  return (
    <div className="absolute top-4 right-4 z-20 flex flex-col items-end pointer-events-none select-none">
      <div className="relative rounded-sm overflow-hidden border border-slate-700/50 bg-slate-950/80 shadow-2xl w-48 h-36 backdrop-blur-md pointer-events-auto">
        
        {isInitializing && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/95 z-20">
            <span className="text-[10px] text-emerald-400 font-mono tracking-widest uppercase animate-pulse">INIT_VISION_SYS...</span>
          </div>
        )}
        
        {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-slate-900 z-30">
                <p className="text-[9px] text-rose-400 font-mono mb-2">CAM_ERR_01: ACCESS_DENIED</p>
                <button 
                  onClick={handleGrantPermission}
                  className="px-2 py-1 bg-emerald-900/50 border border-emerald-500 text-emerald-400 text-[9px] uppercase hover:bg-emerald-800/50"
                >
                  RETRY_CONNECTION
                </button>
            </div>
        )}

        <video 
            ref={videoRef} 
            className="absolute inset-0 w-full h-full object-cover opacity-10 transform scale-x-[-1] filter grayscale contrast-150" 
            playsInline 
            muted
        />
        <canvas 
            ref={canvasRef} 
            className="absolute inset-0 w-full h-full object-cover" 
            width={640} 
            height={480} 
        />
        
        {/* HUD Overlay Labels */}
        <div className="absolute top-1 left-1 text-[8px] font-mono text-cyan-500/50">CAM_01 // LIVE</div>
        <div className="absolute bottom-1 right-1 text-[8px] font-mono text-emerald-500/50">TRACKING_ACTIVE</div>
      </div>
    </div>
  );
};

// --- Visualization Helpers (HUD Style) ---

function drawTechnicalGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
    // Grid Lines
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    
    // Vertical Center Line
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    
    // Horizontal Crosshair
    ctx.moveTo(w/2 - 10, h/2);
    ctx.lineTo(w/2 + 10, h/2);
    
    ctx.stroke();

    // Joystick Zone Marker (Dashed Box)
    const jcx = CONFIG.JOYSTICK_CENTER.x * w;
    const jY = CONFIG.JOYSTICK_CENTER.y * h;
    const jR = w * CONFIG.JOYSTICK_RANGE;
    
    ctx.beginPath();
    ctx.setLineDash([2, 4]);
    ctx.arc(jcx, jY, jR, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.1)';
    ctx.stroke();
    ctx.setLineDash([]);
}

function drawTargetLock(ctx: CanvasRenderingContext2D, w: number, h: number, landmarks: any[], dx: number, dy: number, color: string) {
    const palm = landmarks[9];
    const px = palm.x * w;
    const py = palm.y * h;
    
    const jcx = CONFIG.JOYSTICK_CENTER.x * w;
    const jcy = CONFIG.JOYSTICK_CENTER.y * h;
    
    // 1. Draw Connection Line (Tether)
    if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
        ctx.beginPath();
        ctx.moveTo(jcx, jcy);
        ctx.lineTo(px, py);
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = 1.0;
    }

    // 2. Target Reticle around Hand
    const size = 20;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    
    // Top Left Corner
    ctx.beginPath();
    ctx.moveTo(px - size, py - size/2);
    ctx.lineTo(px - size, py - size);
    ctx.lineTo(px - size/2, py - size);
    ctx.stroke();

    // Top Right
    ctx.beginPath();
    ctx.moveTo(px + size/2, py - size);
    ctx.lineTo(px + size, py - size);
    ctx.lineTo(px + size, py - size/2);
    ctx.stroke();

    // Bottom Left
    ctx.beginPath();
    ctx.moveTo(px - size, py + size/2);
    ctx.lineTo(px - size, py + size);
    ctx.lineTo(px - size/2, py + size);
    ctx.stroke();

    // Bottom Right
    ctx.beginPath();
    ctx.moveTo(px + size/2, py + size);
    ctx.lineTo(px + size, py + size);
    ctx.lineTo(px + size, py + size/2);
    ctx.stroke();

    // Center Dot
    ctx.beginPath();
    ctx.arc(px, py, 2, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();

    // Data Label
    ctx.save();
    ctx.translate(w, 0); // Flip text back
    ctx.scale(-1, 1);
    ctx.fillStyle = color;
    ctx.font = '9px monospace';
    // Coordinates need to be flipped for text drawing since we are in a flipped context
    const textX = (w - px) + 25; 
    ctx.fillText(`ΔX: ${dx.toFixed(2)}`, textX, py - 5);
    ctx.fillText(`ΔY: ${dy.toFixed(2)}`, textX, py + 5);
    ctx.restore();
}

function drawHeliosInterface(ctx: CanvasRenderingContext2D, w: number, h: number, landmarks: any[], strength: number, color: string) {
    const palm = landmarks[9];
    const px = palm.x * w;
    const py = palm.y * h;
    
    const radius = 25;
    
    // Draw Radial Segments
    const segments = 12;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    
    for(let i=0; i<segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        // Fill based on strength
        if (i / segments < strength) {
             ctx.globalAlpha = 1.0;
        } else {
             ctx.globalAlpha = 0.2;
        }
        
        ctx.beginPath();
        ctx.arc(px, py, radius, angle, angle + (Math.PI*2/segments) - 0.1);
        ctx.stroke();
    }
    ctx.globalAlpha = 1.0;

    // Center Core
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();

    // Text Label
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.fillStyle = color;
    ctx.font = '9px monospace';
    ctx.fillText(`PWR: ${(strength*100).toFixed(0)}%`, (w - px) - 20, py + 40);
    ctx.restore();
}

function drawWindVectorField(ctx: CanvasRenderingContext2D, w: number, h: number, landmarks: any[], strength: number, color: string) {
    const lipTop = landmarks[13];
    const lipBot = landmarks[14];
    const mx = (lipTop.x + lipBot.x) / 2 * w;
    const my = (lipTop.y + lipBot.y) / 2 * h;

    const particles = 8 + Math.floor(strength * 10); 
    
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    
    for(let i=0; i<particles; i++) {
        const offset = (Date.now() / 100 + i * 0.2) % 1; 
        const spreadX = (Math.random() - 0.5) * 30;
        
        const startX = mx + spreadX * 0.2;
        const startY = my;
        
        const endX = mx + spreadX * 2;
        const endY = my + 60 + (strength * 40);

        // Lerp
        const cx = startX + (endX - startX) * offset;
        const cy = startY + (endY - startY) * offset;
        
        ctx.globalAlpha = 1.0 - offset;
        
        // Draw Arrow
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx, cy + 10);
        ctx.stroke();
    }
    ctx.globalAlpha = 1.0;

    // Warning text if blowing hard
    if (strength > 0.5) {
        ctx.save();
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        ctx.fillStyle = color;
        ctx.font = '9px monospace';
        ctx.fillText(`AIRFLOW_DETECTED`, (w - mx) - 40, my - 20);
        ctx.restore();
    }
}
