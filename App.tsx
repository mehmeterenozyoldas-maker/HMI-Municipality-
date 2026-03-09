
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState } from 'react';
import IsoMap from './components/IsoMap';
import UIOverlay from './components/UIOverlay';
import StartScreen from './components/StartScreen';
import { AppMode } from './types';

function App() {
  const [started, setStarted] = useState(false);
  const [appMode, setAppMode] = useState<AppMode>('EXPERIENCE');

  const handleStart = () => {
    setStarted(true);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 scanlines">
      {/* Global Vignette Overlay for Visor Effect */}
      <div className="absolute inset-0 z-50 pointer-events-none vignette-overlay"></div>
      
      {/* The 3D Installation */}
      <IsoMap appMode={appMode} />
      
      {/* Experience Overlay (Only in Experience Mode) */}
      {started && appMode === 'EXPERIENCE' && <UIOverlay />}

      {/* Mode Switcher (Always visible when started, styled as OS Toggle) */}
      {started && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-0 bg-slate-950/80 backdrop-blur-xl rounded-full p-1 border border-white/10 shadow-2xl">
             <button 
                onClick={() => setAppMode('EXPERIENCE')}
                className={`relative px-6 py-2 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] transition-all duration-300 ${appMode === 'EXPERIENCE' ? 'text-slate-900' : 'text-slate-500 hover:text-slate-200'}`}
             >
                {appMode === 'EXPERIENCE' && (
                    <div className="absolute inset-0 bg-emerald-400 rounded-full shadow-[0_0_20px_rgba(52,211,153,0.5)]"></div>
                )}
                <span className="relative z-10">Field View</span>
             </button>
             <button 
                onClick={() => setAppMode('PLANNER')}
                className={`relative px-6 py-2 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] transition-all duration-300 ${appMode === 'PLANNER' ? 'text-slate-900' : 'text-slate-500 hover:text-slate-200'}`}
             >
                {appMode === 'PLANNER' && (
                    <div className="absolute inset-0 bg-cyan-400 rounded-full shadow-[0_0_20px_rgba(34,211,238,0.5)]"></div>
                )}
                <span className="relative z-10">Sim Deck</span>
             </button>
        </div>
      )}

      {/* Intro */}
      {!started && <StartScreen onStart={handleStart} />}
    </div>
  );
}

export default App;
