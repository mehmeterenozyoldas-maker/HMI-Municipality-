/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React from 'react';

const UIOverlay = () => {
  return (
    <div className="absolute inset-0 pointer-events-none p-6 flex flex-col justify-between z-10 text-slate-200">
      
      {/* Top Left: Title/Context */}
      <div className="flex items-start">
        <div className="border-l-2 border-emerald-500 pl-4">
          <h1 className="text-3xl font-light tracking-tight text-white mb-0 leading-none">
            ECO<span className="font-bold">FLOW</span>
          </h1>
          <p className="text-[10px] font-mono text-emerald-400 uppercase tracking-[0.2em] mt-1">
            Immersive Visualization
          </p>
        </div>
      </div>

      {/* Center: Reticle Hint (Optional) */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-20">
         <div className="w-64 h-64 border border-white/30 rounded-full border-dashed animate-spin-slow"></div>
      </div>

      {/* Bottom Bar: Interaction Guide */}
      <div className="flex justify-between items-end">
         <div className="glass-panel p-4 rounded-xl flex gap-6 items-center">
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded border border-white/10 flex items-center justify-center bg-slate-800/50">
                    <span className="text-lg">👋</span>
                </div>
                <div className="flex flex-col">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Orbit Control</span>
                    <span className="text-xs font-mono text-cyan-400">LEFT HAND</span>
                </div>
            </div>
            
            <div className="w-px h-8 bg-white/10"></div>

            <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded border border-white/10 flex items-center justify-center bg-slate-800/50">
                    <span className="text-lg">🤏</span>
                </div>
                <div className="flex flex-col">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Sun Position</span>
                    <span className="text-xs font-mono text-amber-400">RIGHT HAND</span>
                </div>
            </div>

            <div className="w-px h-8 bg-white/10"></div>

            <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded border border-white/10 flex items-center justify-center bg-slate-800/50">
                    <span className="text-lg">😮</span>
                </div>
                <div className="flex flex-col">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Wind Boost</span>
                    <span className="text-xs font-mono text-emerald-400">BLOW AIR</span>
                </div>
            </div>
         </div>

         <div className="text-right opacity-50">
             <div className="text-[9px] font-mono text-slate-400 mb-1">RENDER PIPELINE</div>
             <div className="text-xs font-bold text-white tracking-widest">WebGL 2.0 / POST-FX ACTIVE</div>
         </div>
      </div>
    </div>
  );
};

export default UIOverlay;
