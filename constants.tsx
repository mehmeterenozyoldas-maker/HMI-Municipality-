
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { AppMode, BuildingDef, BuildingType } from './types';

// Installation Settings
export const SCENE_SIZE = 400;
export const TURBINE_COUNT = 8;
export const SOLAR_COUNT = 12;

// Simulation Config (Computational Design)
export const SIM_CONFIG = {
  BASE_WIND_OUTPUT: 2.5, // MW per turbine
  BASE_SOLAR_OUTPUT: 0.8, // MW per panel
  COST_TURBINE: 1.2, // $M
  COST_SOLAR: 0.4, // $M
  CITY_DEMAND_BASE: 20, // Base MW required
  WIND_HEIGHT_BONUS: 0.05, // Power bonus per unit of height
};

// Palette - LiDAR-Punk & Deep Glass Aesthetic
export const COLORS = {
  background: '#020617', // Slate 950 (Void)
  fog: '#020617', // Match background for infinite dark
  
  // Terrain (Digital Grid)
  grassBase: '#0f172a', // Slate 900
  grassPeak: '#1e293b', // Slate 800
  gridLine: '#0ea5e9', // Sky 500
  
  // Elements
  city: '#cbd5e1', // Slate 300
  cityEmissive: '#38bdf8', // Sky 400
  
  // Energy (Neon)
  wind: '#22d3ee', // Cyan 400
  windGlow: '#67e8f9', // Cyan 300
  solar: '#fbbf24', // Amber 400
  solarGlow: '#fcd34d', // Amber 300
  
  // Flow
  flowBase: '#ffffff',
  
  // UI
  uiBg: 'rgba(2, 6, 23, 0.8)',
  uiBorder: 'rgba(255, 255, 255, 0.05)',
};

// Building Definitions
export const BUILDINGS: Record<string, BuildingDef> = {
  [BuildingType.None]: { type: BuildingType.None, cost: 0, popGen: 0, incomeGen: 0, powerConsume: 0, label: 'Empty' },
  [BuildingType.Residential]: { type: BuildingType.Residential, cost: 100, popGen: 50, incomeGen: 5, powerConsume: 2.5, label: 'Hab Unit' },
  [BuildingType.Commercial]: { type: BuildingType.Commercial, cost: 300, popGen: 10, incomeGen: 50, powerConsume: 8.0, label: 'Data Tower' },
  [BuildingType.Industrial]: { type: BuildingType.Industrial, cost: 500, popGen: 0, incomeGen: 100, powerConsume: 15.0, label: 'Fab Plant' },
  [BuildingType.Park]: { type: BuildingType.Park, cost: 50, popGen: 5, incomeGen: 0, powerConsume: 0.1, label: 'Bio-Dome' },
  [BuildingType.Road]: { type: BuildingType.Road, cost: 20, popGen: 0, incomeGen: 0, powerConsume: 0.05, label: 'Transit Grid' },
  [BuildingType.Forest]: { type: BuildingType.Forest, cost: 80, popGen: 0, incomeGen: 2, powerConsume: 0, label: 'Carbon Sink' },
  [BuildingType.Mountain]: { type: BuildingType.Mountain, cost: 500, popGen: 0, incomeGen: 10, powerConsume: 0, label: 'Geo-Structure' },
};
