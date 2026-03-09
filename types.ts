
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import * as THREE from 'three';

// --- MediaPipe Globals ---
declare global {
  interface Window {
    Hands: any;
    FaceMesh: any;
    Camera: any;
    drawConnectors: any;
    drawLandmarks: any;
    HAND_CONNECTIONS: any;
    FACEMESH_TESSELATION: any;
    FACEMESH_LIPS: any;
  }
}

export type AppMode = 'EXPERIENCE' | 'PLANNER';

export type EditorTool = 
  | 'SELECT' 
  | 'REMOVE'
  | 'ADD_TURBINE' 
  | 'ADD_SOLAR' 
  | 'ADD_RESIDENTIAL' 
  | 'ADD_COMMERCIAL' 
  | 'ADD_PARK' 
  | 'ADD_ROAD'
  | 'ADD_FOREST'
  | 'ADD_MOUNTAIN';

export interface GestureState {
  joystick: {
    active: boolean;
    deltaX: number; // -1 to 1 (Left/Right orbit)
    deltaY: number; // -1 to 1 (Zoom/Pitch)
    position: { x: number, y: number };
  };
  helios: {
    active: boolean;
    x: number; // 0 to 1 (Azimuth control)
    y: number; // 0 to 1 (Elevation control)
    pinching: boolean;
    pinchStrength: number;
  };
  wind: {
    active: boolean;
    strength: number; // 0 to 1 (Blowing intensity)
  };
}

export interface EnergyStation {
  id: string;
  type: 'WIND' | 'SOLAR';
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number | [number, number, number];
  efficiency: number; // 0-1 based on placement
  output: number; // MW
}

export interface SimulationMetrics {
  totalPower: number; // MW
  consumption: number; // MW
  netStatus: 'SURPLUS' | 'DEFICIT' | 'BALANCED';
  windOutput: number;
  solarOutput: number;
  gridLoad: number; // %
  efficiencyScore: number; // 0-100
  cost: number;
  population: number;
}

export interface BuildingData {
  id: string;
  type: BuildingType;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  variant: number; // For visual variety
}

export interface SceneData {
  city: {
    buildings: BuildingData[];
    target: THREE.Vector3;
  };
  stations: EnergyStation[];
}

// --- New Types for Simulation & AI ---

export enum BuildingType {
  None = 'NONE',
  Residential = 'RESIDENTIAL',
  Commercial = 'COMMERCIAL',
  Industrial = 'INDUSTRIAL',
  Park = 'PARK',
  Road = 'ROAD',
  Forest = 'FOREST',
  Mountain = 'MOUNTAIN'
}

export interface BuildingDef {
  type: BuildingType;
  cost: number;
  popGen: number;
  incomeGen: number;
  powerConsume: number;
  label: string;
}

export interface Tile {
  buildingType: BuildingType;
  rotation: number;
}

export type Grid = Tile[][];

export interface CityStats {
  day: number;
  money: number;
  population: number;
}

export interface AIGoal {
  description: string;
  targetType: 'population' | 'money' | 'building_count';
  targetValue: number;
  buildingType?: string;
  reward: number;
  completed: boolean;
}

export interface NewsItem {
  id: string;
  text: string;
  type: 'positive' | 'negative' | 'neutral';
}
