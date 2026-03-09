/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Environment, Instances, Instance, BakeShadows, PerspectiveCamera } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, ToneMapping, ChromaticAberration, Noise } from '@react-three/postprocessing';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { COLORS, SCENE_SIZE, TURBINE_COUNT, SOLAR_COUNT, SIM_CONFIG, BUILDINGS } from '../constants';
import { AppMode, EditorTool, EnergyStation, GestureState, SceneData, SimulationMetrics, BuildingData, BuildingType } from '../types';
import { HandControlSystem } from './HandControlSystem';
import { PlannerUI } from './PlannerUI';

// --- Shaders & Materials ---

// Topological Grid Material for Terrain
const TopoGridMaterial = {
  uniforms: {
    maxHeight: { value: 40.0 },
    gridColor: { value: new THREE.Color(COLORS.gridLine) },
    baseColor: { value: new THREE.Color(COLORS.grassBase) },
    opacity: { value: 0.8 }
  },
  vertexShader: `
    varying float vHeight;
    varying vec2 vUv;
    varying vec3 vPos;
    void main() {
      vUv = uv;
      vPos = position;
      vHeight = position.y;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float maxHeight;
    uniform vec3 gridColor;
    uniform vec3 baseColor;
    uniform float opacity;
    varying float vHeight;
    varying vec2 vUv;
    varying vec3 vPos;
    
    void main() {
      // Grid Logic
      float gridSize = 12.0;
      float gridX = step(0.95, fract(vPos.x / gridSize));
      float gridZ = step(0.95, fract(vPos.z / gridSize));
      float grid = max(gridX, gridZ);
      
      // Altitude glow
      float h = smoothstep(-10.0, maxHeight, vHeight);
      
      vec3 col = baseColor;
      
      // Add Grid Lines
      col = mix(col, gridColor, grid * 0.4);
      
      // Topo lines (contour)
      float contour = step(0.95, fract(vHeight / 2.0));
      col = mix(col, gridColor, contour * 0.2);

      // Distance fade
      float d = length(vUv - 0.5) * 2.0;
      float alpha = 1.0 - smoothstep(0.4, 1.0, d);

      gl_FragColor = vec4(col, 1.0);
    }
  `
};

const EnergyFlowMaterial = {
  uniforms: {
    time: { value: 0 },
    color: { value: new THREE.Color(COLORS.windGlow) },
    speed: { value: 1.0 },
    opacity: { value: 1.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float time;
    uniform vec3 color;
    uniform float speed;
    uniform float opacity;
    varying vec2 vUv;
    
    void main() {
      float segments = 3.0; 
      float travel = vUv.x * segments - time * speed * 3.0;
      float pulseShape = fract(travel);
      float intensity = pow(pulseShape, 12.0); 
      float shimmer = sin(vUv.x * 30.0 - time * 10.0) * 0.5 + 0.5;
      intensity += shimmer * 0.05;

      float baseGlow = 0.05;
      float alpha = (baseGlow + intensity) * opacity;
      alpha *= smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.8, vUv.x);
      
      vec3 finalColor = mix(color, vec3(1.0), intensity * 0.7);
      finalColor *= (1.2 + intensity * 8.0); // HDR Boost
      
      if (alpha < 0.01) discard;
      
      gl_FragColor = vec4(finalColor, alpha);
    }
  `
};

// --- Procedural Generation Helpers ---

const fbm = (x: number, z: number) => {
  let value = 0;
  let amplitude = 18;
  let frequency = 0.015;

  value += (Math.sin(x * frequency) + Math.cos(z * frequency * 0.85)) * amplitude;
  
  const x2 = x * 0.8 - z * 0.6;
  const z2 = x * 0.6 + z * 0.8;
  value += (Math.sin(x2 * frequency * 2.1 + 1.4) * Math.cos(z2 * frequency * 1.9 + 0.5)) * (amplitude * 0.45);

  const x3 = x * 0.6 + z * 0.8;
  const z3 = -x * 0.8 + z * 0.6;
  value += (Math.sin(x3 * frequency * 4.5 + 3.1) * Math.sin(z3 * frequency * 4.1 + 1.9)) * (amplitude * 0.15);

  return value;
};

const getTerrainHeight = (x: number, z: number) => {
    const dist = Math.sqrt(x * x + z * z);
    const cityRadius = 95; 
    const transitionWidth = 80; 

    let blendFactor = 0;
    if (dist > cityRadius) {
        blendFactor = Math.min(1, (dist - cityRadius) / transitionWidth);
        blendFactor = blendFactor * blendFactor * (3 - 2 * blendFactor);
    }

    const noise = fbm(x, z);
    return noise * blendFactor;
};

const noiseHash = (x: number, y: number) => {
    return Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
};

// --- Data Generation ---

const generateInitialData = (): SceneData => {
    const buildings: BuildingData[] = [];
    const stations: EnergyStation[] = [];
    const cityTarget = new THREE.Vector3(0, 15, 0);
    const GRID_SIZE = 12;
    const occupied = new Set<string>();
    
    const addToGrid = (gx: number, gz: number, type: BuildingType | 'STATION', data: any) => {
        const key = `${gx},${gz}`;
        if (occupied.has(key)) return false;
        
        const x = gx * GRID_SIZE;
        const z = gz * GRID_SIZE;
        const y = getTerrainHeight(x, z);
        
        if (type === 'STATION') {
            stations.push({ ...data, position: [x, y, z] });
        } else {
            let scale: [number, number, number] = [8, 10, 8];
            if (type === BuildingType.Commercial) scale = [8, 15 + Math.random() * 25, 8];
            if (type === BuildingType.Residential) scale = [8, 8 + Math.random() * 8, 8];
            if (type === BuildingType.Road) scale = [12, 0.2, 12];
            if (type === BuildingType.Forest) scale = [10, 1, 10]; 
            if (type === BuildingType.Mountain) scale = [12, 18, 12]; 
            
            const rotation = data.rotation || [0, (Math.floor(Math.random() * 4) * Math.PI) / 2, 0];

            buildings.push({
                id: `bld-${Date.now()}-${Math.random()}`,
                type: type as BuildingType,
                position: [x, y, z],
                scale,
                rotation: rotation, 
                variant: Math.floor(Math.random() * 3)
            });
        }
        
        occupied.add(key);
        return true;
    };

    const roadCoords = new Set<string>();
    for(let i = -6; i <= 6; i++) {
        roadCoords.add(`${i},0`);
        roadCoords.add(`0,${i}`);
    }
    const ringRadius = 5;
    for(let x = -ringRadius; x <= ringRadius; x++) {
        roadCoords.add(`${x},${-ringRadius}`);
        roadCoords.add(`${x},${ringRadius}`);
        roadCoords.add(`${-ringRadius},${x}`);
        roadCoords.add(`${ringRadius},${x}`);
    }

    roadCoords.forEach(key => {
        const [gx, gz] = key.split(',').map(Number);
        let rot = 0;
        if (gz === 0 && gx !== 0) rot = Math.PI / 2;
        addToGrid(gx, gz, BuildingType.Road, { rotation: [0, rot, 0] });
    });

    for (let x = -7; x <= 7; x++) {
        for (let z = -7; z <= 7; z++) {
            if (occupied.has(`${x},${z}`)) continue;
            const dist = Math.max(Math.abs(x), Math.abs(z)); 
            if (dist <= 2) {
                if (Math.random() > 0.1) addToGrid(x, z, BuildingType.Commercial, {});
            } else if (dist <= 5) {
                if (Math.random() > 0.15) addToGrid(x, z, BuildingType.Residential, {});
            } else if (dist <= 7) {
                if (Math.random() > 0.4) {
                    const type = Math.random() > 0.6 ? BuildingType.Park : BuildingType.Residential;
                    addToGrid(x, z, type, {});
                }
            }
        }
    }

    for (let i = 0; i < TURBINE_COUNT; i++) {
        const angle = (Math.PI * 2 * i) / TURBINE_COUNT;
        const r = 11 + Math.random() * 4; 
        const gx = Math.round(Math.cos(angle) * r);
        const gz = Math.round(Math.sin(angle) * r);
        addToGrid(gx, gz, 'STATION', {
            id: `wind-${i}`,
            type: 'WIND',
            scale: 1,
            rotation: [0, Math.random() * Math.PI, 0],
            efficiency: 1, 
            output: 0
        });
    }

    const startX = -9; 
    const startZ = 9;
    for (let dx = 0; dx < 3; dx++) {
        for (let dz = 0; dz < 4; dz++) {
             addToGrid(startX + dx, startZ + dz, 'STATION', {
                id: `solar-${dx}-${dz}`,
                type: 'SOLAR',
                scale: 1,
                rotation: [0, 0, 0],
                efficiency: 1,
                output: 0
             });
        }
    }

    for (let i = 0; i < 12; i++) {
        const angle = Math.random() * Math.PI * 2;
        const r = 8 + Math.random() * 8;
        const gx = Math.round(Math.cos(angle) * r);
        const gz = Math.round(Math.sin(angle) * r);
        const type = r > 12 ? BuildingType.Mountain : BuildingType.Forest;
        addToGrid(gx, gz, type, {});
    }

    return { city: { buildings, target: cityTarget }, stations };
};

// --- Sub-Components ---

const Terrain = ({ editorMode, onPlace }: { editorMode: boolean, onPlace: (p: THREE.Vector3) => void }) => {
  const geom = useMemo(() => {
    const geo = new THREE.PlaneGeometry(SCENE_SIZE, SCENE_SIZE, 128, 128);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = getTerrainHeight(x, y); 
      pos.setZ(i, z);
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  const topoMat = useMemo(() => {
    return new THREE.ShaderMaterial({
        vertexShader: TopoGridMaterial.vertexShader,
        fragmentShader: TopoGridMaterial.fragmentShader,
        uniforms: {
            maxHeight: { value: 30.0 },
            gridColor: { value: new THREE.Color(COLORS.gridLine) },
            baseColor: { value: new THREE.Color(COLORS.grassBase) },
            opacity: { value: 1.0 }
        }
    });
  }, []);

  const heatmapMat = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: `varying float vHeight; varying vec2 vUv; void main() { vUv = uv; vHeight = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform float maxHeight; uniform vec3 windColor; uniform vec3 solarColor;
        varying float vHeight; varying vec2 vUv;
        void main() {
          float h = smoothstep(-10.0, maxHeight, vHeight);
          vec3 col = mix(solarColor, windColor, h);
          float grid = step(0.98, fract(vUv.x * 40.0)) + step(0.98, fract(vUv.y * 40.0));
          gl_FragColor = vec4(col, 0.2 + h * 0.2 + grid * 0.3);
        }
      `,
      uniforms: {
        maxHeight: { value: 30.0 },
        windColor: { value: new THREE.Color(COLORS.wind) },
        solarColor: { value: new THREE.Color(COLORS.solar) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  }, []);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (editorMode) {
        e.stopPropagation();
        onPlace(e.point);
    }
  };

  return (
    <group>
      <mesh 
        geometry={geom} 
        rotation={[-Math.PI / 2, 0, 0]} 
        receiveShadow 
        onClick={handleClick}
        onPointerOver={() => document.body.style.cursor = editorMode ? 'crosshair' : 'default'}
        onPointerOut={() => document.body.style.cursor = 'default'}
      >
        <primitive object={topoMat} attach="material" />
      </mesh>
      
      {editorMode && (
          <mesh geometry={geom} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]}>
             <primitive object={heatmapMat} attach="material" />
          </mesh>
      )}
    </group>
  );
};

// "Deep Glass" Building Material
const BuildingMaterial = ({ color, transparent = false, opacity = 1.0, emissive = "#000000", emissiveIntensity = 0 }: any) => (
    <meshPhysicalMaterial 
        color={color}
        roughness={0.2}
        metalness={0.8}
        transmission={transparent ? 0.6 : 0}
        thickness={1.5}
        clearcoat={1.0}
        clearcoatRoughness={0.1}
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        transparent={transparent}
        opacity={opacity}
    />
);

const CityBuilding: React.FC<BuildingData & { onClick?: (e: any) => void }> = ({ type, position, scale, rotation, variant, onClick }) => {
  const [w, h, d] = scale;
  
  // -- RESIDENTIAL --
  if (type === BuildingType.Residential) {
      return (
          <group position={position} rotation={rotation} onClick={onClick}>
               <mesh position={[0, h/2, 0]} castShadow receiveShadow>
                  <boxGeometry args={[w, h, d]} />
                  <BuildingMaterial color="#cbd5e1" transparent opacity={0.8} emissive="#38bdf8" emissiveIntensity={0.2} />
               </mesh>
               {/* Data Windows */}
               {Array.from({ length: Math.floor(h/4) }).map((_, i) => (
                   <mesh key={i} position={[0, (i * 4) + 2, 0]}>
                       <boxGeometry args={[w + 0.1, 0.2, d + 0.1]} />
                       <meshBasicMaterial color="#38bdf8" />
                   </mesh>
               ))}
          </group>
      )
  }

  // -- COMMERCIAL --
  if (type === BuildingType.Commercial) {
      return (
        <group position={position} rotation={rotation} onClick={onClick}>
            {/* Core */}
            <mesh position={[0, h/2, 0]} castShadow receiveShadow>
                <boxGeometry args={[w, h, d]} />
                <BuildingMaterial color="#0ea5e9" transparent opacity={0.6} emissive="#0ea5e9" emissiveIntensity={0.4} />
            </mesh>
            {/* Holographic Exoskeleton */}
            <mesh position={[0, h/2, 0]}>
                <boxGeometry args={[w * 1.05, h, d * 1.05]} />
                <meshBasicMaterial color="#bae6fd" wireframe transparent opacity={0.1} />
            </mesh>
            {/* Antenna Beam */}
             <mesh position={[0, h + 10, 0]}>
                <cylinderGeometry args={[0.05, 0.05, 20]} />
                <meshBasicMaterial color="#38bdf8" />
            </mesh>
        </group>
      )
  }

  // -- PARK --
  if (type === BuildingType.Park) {
      return (
          <group position={position} onClick={onClick}>
              <mesh position={[0, 0.2, 0]} receiveShadow>
                  <boxGeometry args={[w, 0.4, d]} />
                  <meshStandardMaterial color="#059669" roughness={0.8} />
              </mesh>
              {/* Bio-Dome Holograms */}
              <mesh position={[0, 2, 0]}>
                  <sphereGeometry args={[3, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
                  <meshBasicMaterial color="#34d399" wireframe transparent opacity={0.3} />
              </mesh>
          </group>
      )
  }

  // -- ROAD --
  if (type === BuildingType.Road) {
      return (
          <group position={position} rotation={rotation} onClick={onClick}>
               <mesh position={[0, 0.1, 0]} receiveShadow>
                   <boxGeometry args={[12, 0.2, 12]} />
                   <meshStandardMaterial color="#1e293b" roughness={0.5} metalness={0.5} />
               </mesh>
               {/* Neon Lane Markers */}
               <mesh position={[0, 0.21, 0]} rotation={[-Math.PI/2, 0, 0]}>
                   <planeGeometry args={[0.5, 8]} />
                   <meshBasicMaterial color="#38bdf8" transparent opacity={0.6} />
               </mesh>
          </group>
      )
  }
  
  // -- NATURE --
  if (type === BuildingType.Forest || type === BuildingType.Mountain) {
      const isMountain = type === BuildingType.Mountain;
      return (
        <group position={position} onClick={onClick} scale={scale}>
             <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
                {isMountain ? <coneGeometry args={[0.5, 1, 4]} /> : <dodecahedronGeometry args={[0.4]} />}
                <meshStandardMaterial 
                    color={isMountain ? "#475569" : "#0f766e"} 
                    roughness={0.9} 
                    flatShading 
                />
             </mesh>
             {/* Wireframe Overlay */}
             <mesh position={[0, 0.5, 0]} scale={1.05}>
                {isMountain ? <coneGeometry args={[0.5, 1, 4]} /> : <dodecahedronGeometry args={[0.4]} />}
                <meshBasicMaterial color={isMountain ? "#94a3b8" : "#2dd4bf"} wireframe transparent opacity={0.1} />
             </mesh>
        </group>
      )
  }

  return null;
}

const SingleTurbine = ({ position, scale, rotation, pulseIntensity }: any) => {
  const blades = useRef<THREE.Group>(null);
  useFrame((state, delta) => {
    if (blades.current) {
        const speed = 0.5 + (pulseIntensity * 8.0); 
        blades.current.rotation.z -= speed * delta;
    }
  });

  return (
    <group position={position} scale={scale} rotation={rotation}>
      <mesh position={[0, 9, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.2, 0.5, 18, 12]} />
        <meshStandardMaterial color="#334155" roughness={0.3} metalness={0.8} />
      </mesh>
      <group position={[0, 18, 0]}>
         <mesh position={[0, 0, 0.4]} rotation={[Math.PI/2, 0, 0]}>
             <torusGeometry args={[0.3, 0.05, 8, 16]} />
             <meshBasicMaterial color={COLORS.wind} toneMapped={false} />
         </mesh>
         <group ref={blades} position={[0, 0, 0.5]}>
            {[0, 1, 2].map((k) => (
                <group key={k} rotation={[0, 0, (k * Math.PI * 2) / 3]}>
                    <mesh position={[0, 4.2, 0]}>
                        <boxGeometry args={[0.4, 9, 0.15]} />
                        <meshStandardMaterial color="#cbd5e1" metalness={0.5} />
                    </mesh>
                    <mesh position={[0, 7.5, 0.08]}>
                         <planeGeometry args={[0.1, 2]} />
                         <meshBasicMaterial color={COLORS.wind} side={THREE.DoubleSide} toneMapped={false} />
                    </mesh>
                </group>
            ))}
         </group>
      </group>
    </group>
  )
}

const EnergyStreams = ({ stations, target, speedMultiplier, color }: { stations: EnergyStation[], target: THREE.Vector3, speedMultiplier: number, color: string }) => {
    const shaderRef = useRef<THREE.ShaderMaterial>(null);
    
    const curves = useMemo(() => {
        return stations.map(s => {
            const p1 = new THREE.Vector3(...s.position).add(new THREE.Vector3(0, s.type === 'WIND' ? 18 : 2, 0));
            const p3 = target;
            const mid = p1.clone().lerp(p3, 0.5);
            mid.y += 30 + Math.random() * 20; 
            return new THREE.QuadraticBezierCurve3(p1, mid, p3);
        });
    }, [stations.length, target]);

    const mat = useMemo(() => {
        return new THREE.ShaderMaterial({
            vertexShader: EnergyFlowMaterial.vertexShader,
            fragmentShader: EnergyFlowMaterial.fragmentShader,
            uniforms: {
                time: { value: 0 },
                color: { value: new THREE.Color(color) },
                speed: { value: 1.0 },
                opacity: { value: 1.0 }
            },
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });
    }, [color]);

    useFrame((state) => {
        if (shaderRef.current) {
            shaderRef.current.uniforms.time.value = state.clock.elapsedTime;
            shaderRef.current.uniforms.speed.value = 0.3 + (speedMultiplier * 2.5);
            shaderRef.current.uniforms.opacity.value = 0.4 + (speedMultiplier * 0.6);
        }
    });

    if (shaderRef.current === null) {
        // @ts-ignore
        shaderRef.current = mat;
    }

    return (
        <group>
            {curves.map((curve, i) => (
                <mesh key={i}>
                    <tubeGeometry args={[curve, 40, 0.25, 6, false]} />
                    <primitive object={mat} attach="material" />
                </mesh>
            ))}
        </group>
    )
}

const PlacementCursor = ({ active, tool }: { active: boolean, tool: EditorTool }) => {
    const ref = useRef<THREE.Group>(null);
    
    useFrame(({ raycaster, scene, camera, pointer }) => {
        if (!active || !ref.current) return;
        raycaster.setFromCamera(pointer, camera);
        const intersects = raycaster.intersectObjects(scene.children, true);
        const hit = intersects.find(i => (i.object as THREE.Mesh).geometry?.type === 'PlaneGeometry');
        
        if (hit) {
            let p = hit.point.clone();
            if (['ADD_RESIDENTIAL', 'ADD_COMMERCIAL', 'ADD_PARK', 'ADD_ROAD', 'ADD_FOREST', 'ADD_MOUNTAIN'].includes(tool)) {
                p.x = Math.round(p.x / 12) * 12;
                p.z = Math.round(p.z / 12) * 12;
                p.y = getTerrainHeight(p.x, p.z);
            }
            ref.current.position.copy(p);
            ref.current.visible = true;
        } else {
            ref.current.visible = false;
        }
    });

    if (!active || tool === 'SELECT' || tool === 'REMOVE') return null;

    return (
        <group ref={ref}>
            <mesh position={[0, 0.5, 0]}>
                <boxGeometry args={[4, 200, 4]} />
                <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.1} />
            </mesh>
            <mesh position={[0, 2, 0]} rotation={[0, Date.now() * 0.002, 0]}>
                 <ringGeometry args={[2, 2.5, 32]} />
                 <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} />
            </mesh>
        </group>
    )
}

// --- Main Scene ---

const SceneContent = ({ 
    gestureState, 
    appMode, 
    sceneData, 
    editorTool, 
    onStationUpdate,
    onBuildingUpdate,
    envSettings
}: { 
    gestureState: React.MutableRefObject<GestureState>, 
    appMode: AppMode, 
    sceneData: SceneData,
    editorTool: EditorTool,
    onStationUpdate: (s: EnergyStation[]) => void,
    onBuildingUpdate: (b: BuildingData[]) => void,
    envSettings: { windSpeed: number, sunPos: number, cloudCover: number }
}) => {
  const dirLight = useRef<THREE.DirectionalLight>(null);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  
  const [solarPulse, setSolarPulse] = useState(0);
  const [windPulse, setWindPulse] = useState(0);
  const sunTarget = useRef(new THREE.Vector3(100, 150, 50));

  useFrame((state, delta) => {
    const time = state.clock.getElapsedTime();

    if (appMode === 'EXPERIENCE') {
        const gs = gestureState.current;
        if (gs.joystick.active && controlsRef.current) {
            const rotateSpeed = 2.0 * delta;
            controlsRef.current.setAzimuthalAngle(controlsRef.current.getAzimuthalAngle() + gs.joystick.deltaX * rotateSpeed);
            const polarSpeed = 1.5 * delta;
            const currentPolar = controlsRef.current.getPolarAngle();
            const newPolar = THREE.MathUtils.clamp(currentPolar - gs.joystick.deltaY * polarSpeed, 0.5, Math.PI / 2.1);
            controlsRef.current.setPolarAngle(newPolar);
            controlsRef.current.update();
        } else if (controlsRef.current) {
            controlsRef.current.autoRotate = true;
        }
        if (gs.helios.active) {
            const angle = gs.helios.x * Math.PI * 2;
            const radius = 180;
            const elevation = Math.max(0.1, gs.helios.y) * Math.PI / 2;
            sunTarget.current.set(Math.cos(angle) * Math.cos(elevation) * radius, Math.sin(elevation) * radius, Math.sin(angle) * Math.cos(elevation) * radius);
        } else {
            sunTarget.current.set(100, Math.sin(Math.PI * (0.2 + Math.sin(time*0.1) * 0.2)) * 150, Math.cos(Math.PI * (0.2 + Math.sin(time*0.1) * 0.2)) * 150);
        }
        const targetSolar = gs.helios.active ? 0.5 + (gs.helios.pinching ? gs.helios.pinchStrength * 0.5 : 0) : 0.05;
        const targetWind = gs.wind.active ? 0.6 + gs.wind.strength * 1.4 : 0.05;
        setSolarPulse(THREE.MathUtils.lerp(solarPulse, targetSolar, delta * 4));
        setWindPulse(THREE.MathUtils.lerp(windPulse, targetWind, delta * 4));

    } else {
        if (controlsRef.current) controlsRef.current.autoRotate = false;
        const angle = -Math.PI/2 + (envSettings.sunPos * Math.PI); 
        const radius = 200;
        sunTarget.current.set(Math.sin(angle)*radius, Math.abs(Math.cos(angle))*radius, 50);
        setWindPulse(THREE.MathUtils.lerp(windPulse, envSettings.windSpeed, delta * 2));
        const sunFactor = Math.max(0, Math.sin(envSettings.sunPos * Math.PI));
        const cloudFactor = 1 - (envSettings.cloudCover * 0.8);
        setSolarPulse(THREE.MathUtils.lerp(solarPulse, sunFactor * cloudFactor * 0.5, delta * 2));
    }
    
    if (dirLight.current) {
        dirLight.current.position.lerp(sunTarget.current, delta * 2.0);
        const intensity = 2.0 * (1 - envSettings.cloudCover * 0.6);
        dirLight.current.intensity = THREE.MathUtils.lerp(dirLight.current.intensity, intensity, delta);
    }
  });

  const handleTerrainClick = (point: THREE.Vector3) => {
    if (appMode !== 'PLANNER' || editorTool === 'SELECT' || editorTool === 'REMOVE') return;
    if (['ADD_TURBINE', 'ADD_SOLAR'].includes(editorTool)) {
        const y = point.y;
        const heightEff = Math.min(1.0, (y + 10) / 30); 
        const newStation: EnergyStation = {
            id: Date.now().toString(),
            type: editorTool === 'ADD_TURBINE' ? 'WIND' : 'SOLAR',
            position: [point.x, point.y, point.z],
            rotation: [0, Math.random() * 6, 0],
            scale: editorTool === 'ADD_TURBINE' ? (0.8 + Math.random()*0.3) : 1,
            efficiency: editorTool === 'ADD_TURBINE' ? 0.8 + heightEff * 0.2 : 0.9,
            output: 0
        };
        onStationUpdate([...sceneData.stations, newStation]);
        return;
    }
    const sx = Math.round(point.x / 12) * 12;
    const sz = Math.round(point.z / 12) * 12;
    const sy = getTerrainHeight(sx, sz);
    let type = BuildingType.Residential;
    let scale: [number, number, number] = [8, 10, 8];
    if (editorTool === 'ADD_COMMERCIAL') { type = BuildingType.Commercial; scale = [8, 25, 8]; }
    else if (editorTool === 'ADD_PARK') { type = BuildingType.Park; scale = [8, 0.5, 8]; }
    else if (editorTool === 'ADD_ROAD') { type = BuildingType.Road; scale = [12, 0.2, 12]; }
    else if (editorTool === 'ADD_FOREST') { type = BuildingType.Forest; scale = [10, 1, 10]; }
    else if (editorTool === 'ADD_MOUNTAIN') { type = BuildingType.Mountain; scale = [12, 18, 12]; }

    const filtered = sceneData.city.buildings.filter(b => {
        const dx = b.position[0] - sx;
        const dz = b.position[2] - sz;
        return Math.sqrt(dx*dx + dz*dz) > 4; 
    });
    const newBuilding: BuildingData = {
        id: `build-${Date.now()}`,
        type: type,
        position: [sx, sy, sz],
        scale: scale,
        rotation: [0, 0, 0],
        variant: Math.floor(Math.random() * 3)
    };
    onBuildingUpdate([...filtered, newBuilding]);
  };

  const handleObjectClick = (e: ThreeEvent<MouseEvent>, id: string, kind: 'STATION' | 'BUILDING') => {
      if (appMode === 'PLANNER' && editorTool === 'REMOVE') {
          e.stopPropagation();
          if (kind === 'STATION') {
              onStationUpdate(sceneData.stations.filter(s => s.id !== id));
          } else {
              onBuildingUpdate(sceneData.city.buildings.filter(b => b.id !== id));
          }
      }
  };

  const windStations = useMemo(() => sceneData.stations.filter(s => s.type === 'WIND'), [sceneData.stations]);
  const solarStations = useMemo(() => sceneData.stations.filter(s => s.type === 'SOLAR'), [sceneData.stations]);

  return (
    <>
      <fog attach="fog" args={[COLORS.fog, 20, 300]} />
      <ambientLight intensity={0.1} color="#1e293b" />
      <directionalLight 
        ref={dirLight}
        intensity={2.0} 
        color="#f8fafc"
        castShadow 
        shadow-mapSize={[2048, 2048]}
      >
        <orthographicCamera attach="shadow-camera" args={[-150, 150, 150, -150]} />
      </directionalLight>

      <Terrain editorMode={appMode === 'PLANNER'} onPlace={handleTerrainClick} />
      
      <group>
        {sceneData.city.buildings.map((b) => (
             <CityBuilding 
                key={b.id} 
                {...b} 
                onClick={(e) => handleObjectClick(e, b.id, 'BUILDING')}
             />
        ))}
         <mesh position={[0, 35, 0]} castShadow>
            <cylinderGeometry args={[1, 2.5, 80, 8]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.5} />
        </mesh>
        {/* Core Beam */}
        <mesh position={[0, 35, 0]}>
            <cylinderGeometry args={[0.2, 0.2, 400, 8]} />
            <meshBasicMaterial color={COLORS.windGlow} toneMapped={false} />
        </mesh>
      </group>
      
      <group> 
          {windStations.map(s => (
              <group key={s.id} onClick={(e) => handleObjectClick(e, s.id, 'STATION')}>
                 <SingleTurbine position={s.position} scale={s.scale} rotation={s.rotation} pulseIntensity={windPulse} />
              </group>
          ))}
          
          <Instances range={solarStations.length} castShadow receiveShadow>
            <boxGeometry args={[3, 0.15, 4]} />
            <meshPhysicalMaterial color="#020617" roughness={0.1} metalness={0.9} emissive={COLORS.solar} emissiveIntensity={0.5} />
            {solarStations.map(s => (
                <group key={s.id} onClick={(e) => handleObjectClick(e, s.id, 'STATION')}>
                     <Instance position={s.position} rotation={s.rotation} />
                </group>
            ))}
          </Instances>
      </group>

      <EnergyStreams stations={windStations} target={sceneData.city.target} speedMultiplier={windPulse} color={COLORS.windGlow} />
      <EnergyStreams stations={solarStations} target={sceneData.city.target} speedMultiplier={solarPulse} color={COLORS.solarGlow} />

      <PlacementCursor active={appMode === 'PLANNER'} tool={editorTool} />

      <Environment preset="night" blur={0.8} background={false} />
      <BakeShadows />
      
      <OrbitControls 
        ref={controlsRef}
        autoRotate={true}
        autoRotateSpeed={0.5} 
        minDistance={40}
        maxDistance={350}
        enableDamping
        enabled={true} 
      />
    </>
  );
};

const IsoMap = ({ appMode }: { appMode: AppMode }) => {
  const [sceneData, setSceneData] = useState<SceneData>(() => generateInitialData());
  const [editorTool, setEditorTool] = useState<EditorTool>('SELECT');
  const [envSettings, setEnvSettings] = useState({ windSpeed: 0.5, sunPos: 0.5, cloudCover: 0.1 });
  
  const metrics = useMemo<SimulationMetrics>(() => {
    let windOut = 0;
    let solarOut = 0;
    let cost = 0;
    let consume = SIM_CONFIG.CITY_DEMAND_BASE;
    let pop = 0;

    sceneData.stations.forEach(s => {
        if (s.type === 'WIND') {
            const power = SIM_CONFIG.BASE_WIND_OUTPUT * s.efficiency * (0.5 + envSettings.windSpeed);
            windOut += power;
            cost += SIM_CONFIG.COST_TURBINE;
        } else {
            const sunFactor = Math.max(0, Math.sin(envSettings.sunPos * Math.PI));
            const weatherFactor = 1 - (envSettings.cloudCover * 0.9);
            const power = SIM_CONFIG.BASE_SOLAR_OUTPUT * s.efficiency * sunFactor * weatherFactor;
            solarOut += power;
            cost += SIM_CONFIG.COST_SOLAR;
        }
    });

    sceneData.city.buildings.forEach(b => {
        const def = BUILDINGS[b.type];
        if (def) {
            consume += def.powerConsume;
            cost += def.cost / 1000; 
            pop += def.popGen;
        }
    });

    const total = windOut + solarOut;
    const net = total - consume;
    
    return {
        totalPower: total,
        consumption: consume,
        netStatus: net > 10 ? 'SURPLUS' : net < -5 ? 'DEFICIT' : 'BALANCED',
        windOutput: windOut,
        solarOutput: solarOut,
        gridLoad: (total / consume) * 100,
        efficiencyScore: 85,
        cost: cost,
        population: pop
    };
  }, [sceneData, envSettings]);

  const gestureStateRef = useRef<GestureState>({
    joystick: { active: false, deltaX: 0, deltaY: 0, position: { x: 0, y: 0 } },
    helios: { active: false, x: 0.5, y: 0.5, pinching: false, pinchStrength: 0 },
    wind: { active: false, strength: 0 }
  });

  return (
    <div className="w-full h-full relative">
      <Canvas shadows dpr={[1, 1.5]} gl={{ antialias: false, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}>
        <PerspectiveCamera makeDefault position={[-100, 80, 100]} fov={35} />
        
        <SceneContent 
            appMode={appMode}
            gestureState={gestureStateRef} 
            sceneData={sceneData}
            editorTool={editorTool}
            onStationUpdate={(stations) => setSceneData(prev => ({ ...prev, stations }))}
            onBuildingUpdate={(buildings) => setSceneData(prev => ({ ...prev, city: { ...prev.city, buildings } }))}
            envSettings={envSettings}
        />

        <EffectComposer disableNormalPass>
            <Bloom luminanceThreshold={0.5} mipmapBlur intensity={1.5} radius={0.4} />
            <Noise opacity={0.05} />
            <Vignette eskil={false} offset={0.1} darkness={0.5} />
            <ToneMapping mode={THREE.ACESFilmicToneMapping} />
            <ChromaticAberration offset={new THREE.Vector2(0.002, 0.002)} />
        </EffectComposer>
      </Canvas>

      {appMode === 'EXPERIENCE' && (
          <HandControlSystem onGestureUpdate={(s) => gestureStateRef.current = s} />
      )}
      
      {appMode === 'PLANNER' && (
          <PlannerUI 
            activeTool={editorTool} 
            onToolChange={setEditorTool} 
            metrics={metrics}
            envSettings={envSettings}
            onEnvChange={(k, v) => setEnvSettings(p => ({...p, [k]: v}))}
          />
      )}
    </div>
  );
};

export default IsoMap;