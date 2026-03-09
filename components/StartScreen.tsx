/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React from 'react';

interface StartScreenProps {
  onStart: () => void;
}

const StartScreen: React.FC<StartScreenProps> = ({ onStart }) => {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center z-50 text-slate-800 p-6 bg-white/10 backdrop-blur-sm transition-all duration-1000">
      <div className="max-w-2xl w-full bg-white/90 p-12 rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] border border-white/50 relative overflow-hidden text-center animate-fade-in">
        
        <h1 className="text-6xl font-black mb-4 bg-gradient-to-r from-emerald-600 via-cyan-600 to-blue-600 bg-clip-text text-transparent tracking-tighter">
          NATURE & POWER
        </h1>
        <p className="text-slate-500 mb-12 text-lg font-light tracking-wide">
          An interactive digital installation visualizing the future of sustainable energy.
        </p>

        <button 
          onClick={onStart}
          className="px-12 py-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 tracking-widest text-sm"
        >
          ENTER EXPERIENCE
        </button>

        <div className="mt-12 flex justify-center gap-8 text-xs font-mono text-slate-400 uppercase tracking-widest">
            <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>Generative Terrain</span>
            <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-cyan-500"></span>Wind Dynamics</span>
            <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>Solar Arrays</span>
        </div>
      </div>
    </div>
  );
};

export default StartScreen;
