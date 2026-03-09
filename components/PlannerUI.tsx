
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState } from 'react';
import { EditorTool, SimulationMetrics } from '../types';
import { fetchStockholmWeather } from '../services/weatherService';

interface PlannerUIProps {
  activeTool: EditorTool;
  onToolChange: (tool: EditorTool) => void;
  metrics: SimulationMetrics;
  envSettings: { windSpeed: number; sunPos: number; cloudCover: number };
  onEnvChange: (key: 'windSpeed' | 'sunPos' | 'cloudCover', val: number) => void;
}

export const PlannerUI = ({ activeTool, onToolChange, metrics, envSettings, onEnvChange }: PlannerUIProps) => {
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  
  const handleSyncData = async () => {
      setIsLoadingData(true);
      const data = await fetchStockholmWeather();
      if (data) {
          onEnvChange('windSpeed', Math.min(1, data.windSpeed / 25));
          onEnvChange('cloudCover', data.cloudCover / 100);
      }
      setIsLoadingData(false);
  };

  const formatNumber = (num: number) => num.toLocaleString(undefined, { maximumFractionDigits: 1 });

  const ToolButton = ({ id, label, icon, shortcut, colorClass }: { id: EditorTool, label: string, icon: React.ReactNode, shortcut: string, colorClass: string }) => {
    const isActive = activeTool === id;
    return (
        <button
            onClick={() => onToolChange(id)}
            className={`group relative flex flex-col items-center justify-center w-12 h-12 rounded-lg border transition-all duration-100 ${
                isActive 
                ? `bg-slate-800 border-${colorClass.split('-')[1]}-500 shadow-[0_0_15px_rgba(0,0,0,0.5)] z-10 scale-110` 
                : 'bg-slate-900/40 border-slate-700/30 text-slate-500 hover:bg-slate-800 hover:text-slate-200 hover:border-slate-600'
            }`}
        >
            <div className={`${isActive ? colorClass : ''} transition-colors`}>
                {icon}
            </div>
            {isActive && (
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-slate-900/90 border border-slate-700 px-2 py-0.5 rounded text-[9px] font-mono text-white tracking-widest uppercase shadow-xl backdrop-blur-md">
                    {label} <span className="text-slate-500 ml-1">[{shortcut}]</span>
                </div>
            )}
             {/* Tech decoration corners */}
             {isActive && (
                <>
                    <span className="absolute top-0 left-0 w-1 h-1 border-t border-l border-white opacity-50"></span>
                    <span className="absolute top-0 right-0 w-1 h-1 border-t border-r border-white opacity-50"></span>
                    <span className="absolute bottom-0 left-0 w-1 h-1 border-b border-l border-white opacity-50"></span>
                    <span className="absolute bottom-0 right-0 w-1 h-1 border-b border-r border-white opacity-50"></span>
                </>
             )}
        </button>
    );
  };

  return (
    <div className="absolute inset-0 z-40 pointer-events-none flex flex-col justify-between p-4 overflow-hidden select-none">
        
        {/* --- TOP LEFT: SYSTEM STATUS --- */}
        <div className="pointer-events-auto flex flex-col gap-2 animate-fade-in-left">
             <div className="glass-panel p-1 rounded-sm inline-flex items-center gap-2 border-l-2 border-l-emerald-500 bg-slate-950/80 backdrop-blur-xl max-w-fit">
                <div className="bg-slate-900 px-3 py-2">
                    <h1 className="text-xs font-bold tracking-[0.2em] text-white">MUNI-GRID <span className="text-emerald-500">2035</span></h1>
                    <div className="flex justify-between items-center mt-1">
                        <span className="text-[9px] font-mono text-slate-500">OS: GAIA-LINK v9.0</span>
                        <div className="flex gap-1">
                            <span className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse"></span>
                            <span className="w-1 h-1 bg-emerald-500/30 rounded-full"></span>
                            <span className="w-1 h-1 bg-emerald-500/10 rounded-full"></span>
                        </div>
                    </div>
                </div>
             </div>

             {/* Metrics Panel */}
             <div className="glass-panel p-3 rounded-sm bg-slate-950/60 backdrop-blur-md w-48 border-l border-slate-700">
                <div className="grid grid-cols-1 gap-3">
                    {/* Power */}
                    <div>
                        <div className="flex justify-between text-[9px] font-mono uppercase text-slate-400 mb-1">
                            <span>Grid Load</span>
                            <span className={metrics.netStatus === 'SURPLUS' ? 'text-emerald-400' : 'text-rose-400'}>
                                {Math.round(metrics.gridLoad)}%
                            </span>
                        </div>
                        <div className="w-full bg-slate-800 h-1.5 flex gap-0.5">
                            {Array.from({length: 20}).map((_, i) => (
                                <div 
                                    key={i} 
                                    className={`flex-1 transition-opacity duration-300 ${i < (metrics.gridLoad/5) ? (metrics.netStatus === 'SURPLUS' ? 'bg-emerald-500' : 'bg-rose-500') : 'opacity-0'}`}
                                ></div>
                            ))}
                        </div>
                        <div className="flex justify-between items-end mt-1">
                             <span className="text-[10px] font-mono text-white">
                                 {formatNumber(metrics.totalPower)} <span className="text-slate-600">MW</span>
                             </span>
                             <span className="text-[9px] font-mono text-slate-500">OUT</span>
                        </div>
                    </div>
                    
                    {/* Budget */}
                    <div className="border-t border-slate-800 pt-2">
                         <div className="flex justify-between text-[9px] font-mono uppercase text-slate-400 mb-1">
                            <span>Capital</span>
                            <span className="text-white">${formatNumber(metrics.cost)}M</span>
                        </div>
                        <div className="w-full bg-slate-800 h-0.5">
                             <div className="h-full bg-white w-1/3"></div>
                        </div>
                    </div>

                    {/* Pop */}
                    <div className="border-t border-slate-800 pt-2">
                         <div className="flex justify-between text-[9px] font-mono uppercase text-slate-400 mb-1">
                            <span>Pop. Count</span>
                            <span className="text-white">{formatNumber(metrics.population)}</span>
                        </div>
                    </div>
                </div>
             </div>
        </div>

        {/* --- TOP RIGHT: ENVIRONMENTAL CONTROL --- */}
        <div className="pointer-events-auto absolute top-4 right-4 flex flex-col items-end gap-2 animate-fade-in-right">
            <div className="glass-panel p-3 rounded-sm bg-slate-950/80 backdrop-blur-xl border-r-2 border-r-cyan-500 w-64">
                <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-800">
                    <span className="text-[10px] font-bold tracking-widest text-slate-300 uppercase">Atmosphere Control</span>
                    <button 
                        onClick={handleSyncData}
                        disabled={isLoadingData}
                        className="text-[9px] font-mono text-cyan-500 hover:text-cyan-300 uppercase border border-cyan-900 bg-cyan-950/30 px-2 py-0.5 rounded hover:bg-cyan-900/50 transition-colors"
                    >
                        {isLoadingData ? 'UPLINK...' : 'SYNC_SAT'}
                    </button>
                </div>
                
                <div className="space-y-4">
                    {/* Wind Control */}
                    <div className="group">
                        <div className="flex justify-between text-[9px] font-mono text-slate-500 mb-1 group-hover:text-cyan-400 transition-colors">
                            <span>WIND_VEL</span>
                            <span>{Math.round(envSettings.windSpeed * 100)} km/h</span>
                        </div>
                        <div className="relative h-4 flex items-center">
                            <input 
                                type="range" min="0" max="1" step="0.01"
                                value={envSettings.windSpeed}
                                onChange={(e) => onEnvChange('windSpeed', parseFloat(e.target.value))}
                                className="w-full h-0.5 bg-slate-700 appearance-none cursor-pointer z-10"
                            />
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-cyan-500" style={{width: `${envSettings.windSpeed * 100}%`}}></div>
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-4 bg-cyan-400 border border-black shadow-[0_0_10px_rgba(34,211,238,0.5)] pointer-events-none" style={{left: `calc(${envSettings.windSpeed * 100}% - 4px)`}}></div>
                        </div>
                    </div>

                    {/* Sun Control */}
                    <div className="group">
                        <div className="flex justify-between text-[9px] font-mono text-slate-500 mb-1 group-hover:text-amber-400 transition-colors">
                            <span>SOLAR_INCIDENCE</span>
                            <span>{Math.floor(envSettings.sunPos * 12 + 6)}:00</span>
                        </div>
                        <div className="relative h-4 flex items-center">
                            <input 
                                type="range" min="0" max="1" step="0.01"
                                value={envSettings.sunPos}
                                onChange={(e) => onEnvChange('sunPos', parseFloat(e.target.value))}
                                className="w-full h-0.5 bg-slate-700 appearance-none cursor-pointer z-10"
                            />
                             <div className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-amber-500" style={{width: `${envSettings.sunPos * 100}%`}}></div>
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-4 bg-amber-400 border border-black shadow-[0_0_10px_rgba(251,191,36,0.5)] pointer-events-none" style={{left: `calc(${envSettings.sunPos * 100}% - 4px)`}}></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>


        {/* --- BOTTOM CENTER: CONSTRUCTION DECK --- */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-auto">
            <div className="glass-panel px-2 py-2 rounded-xl bg-slate-950/90 backdrop-blur-2xl border border-white/10 shadow-2xl flex items-center gap-2">
                
                {/* Tools Group 1: General */}
                <div className="flex gap-1 pr-2 border-r border-white/5">
                     <ToolButton 
                        id="SELECT" label="Inspect" shortcut="V" colorClass="text-slate-200"
                        icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777" /></svg>}
                    />
                    <ToolButton 
                        id="REMOVE" label="Demolish" shortcut="Del" colorClass="text-rose-400"
                        icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>}
                    />
                </div>

                {/* Tools Group 2: Energy */}
                <div className="flex gap-1 px-2 border-r border-white/5">
                    <ToolButton 
                        id="ADD_TURBINE" label="Aero-Gen" shortcut="1" colorClass="text-cyan-400"
                        icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>} 
                    />
                    <ToolButton 
                        id="ADD_SOLAR" label="PV-Array" shortcut="2" colorClass="text-amber-400"
                        icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>} 
                    />
                </div>

                {/* Tools Group 3: Buildings */}
                <div className="flex gap-1 px-2 border-r border-white/5">
                     <ToolButton 
                        id="ADD_RESIDENTIAL" label="Hab-Unit" shortcut="3" colorClass="text-indigo-400"
                        icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>}
                    />
                    <ToolButton 
                        id="ADD_COMMERCIAL" label="Datacenter" shortcut="4" colorClass="text-blue-400"
                        icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5" /></svg>}
                    />
                    <ToolButton 
                        id="ADD_ROAD" label="Mag-Lev" shortcut="5" colorClass="text-slate-300"
                        icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0121 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>}
                    />
                </div>
                 {/* Tools Group 4: Nature */}
                <div className="flex gap-1 pl-2">
                    <ToolButton 
                        id="ADD_PARK" label="Bio-Dome" shortcut="6" colorClass="text-emerald-400"
                        icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>}
                    />
                    <ToolButton 
                        id="ADD_FOREST" label="Carbon Sink" shortcut="7" colorClass="text-lime-400"
                        icon={<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M5 19h14a1 1 0 00.866-1.5l-7-12.124a1 1 0 00-1.732 0l-7 12.124A1 1 0 005 19z" /></svg>}
                    />
                    <ToolButton 
                        id="ADD_MOUNTAIN" label="Geo-Mesh" shortcut="8" colorClass="text-stone-400"
                        icon={<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M13.73 3.51L6.78 15.54A3 3 0 009.33 20h11.34a3 3 0 002.55-4.46L16.27 3.51a3 3 0 00-2.54-1.51H16.27a3 3 0 00-2.54 1.51z M5 20l4-8 4 8H5z" /></svg>}
                    />
                </div>
            </div>
            
             <div className="text-center mt-2">
                 <span className="text-[9px] font-mono text-slate-500 uppercase tracking-[0.3em]">Construction Deck // ACTIVE</span>
            </div>
        </div>

    </div>
  );
};
