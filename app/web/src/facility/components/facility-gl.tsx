import { useLayoutEffect, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Html, OrbitControls, useCursor } from "@react-three/drei";
import * as THREE from "three";
import { WORLD, isRestroom, roomHold, roomMetrics, roomToWorld, s2sPlants, shortName, type FacRoom } from "@/data/facility";
import { roomClock } from "@/data/room-ops";
import { shipDesk } from "@/data/shipping";

const WALL = "#b7b7b7";
const WALL_IN = "#cfcfcf";
const FLOOR = "#d8d8d8";
const FLOOR_LIT = "#ececec";

function Mat({
  color,
  metal = 0.04,
  rough = 0.62,
  emit = 0,
  emitColor,
}: {
  color: string;
  metal?: number;
  rough?: number;
  emit?: number;
  emitColor?: string;
}) {
  return (
    <meshStandardMaterial
      color={color}
      metalness={metal}
      roughness={rough}
      emissive={emit ? emitColor ?? color : "#000"}
      emissiveIntensity={emit}
    />
  );
}

function PickMesh(props) {
  return <mesh {...props} />;
}

function Box({
  position,
  size,
  color,
  metal = 0.04,
  rough = 0.55,
  emit = 0,
  emitColor,
}: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  metal?: number;
  rough?: number;
  emit?: number;
  emitColor?: string;
}) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <Mat color={color} metal={metal} rough={rough} emit={emit} emitColor={emitColor} />
    </mesh>
  );
}

function Pipe({ from, to, r, color }: { from: [number, number, number]; to: [number, number, number]; r: number; color: string }) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const dir = b.clone().sub(a);
  const len = dir.length();
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return (
    <mesh position={mid} quaternion={quat}>
      <cylinderGeometry args={[r, r, len, 8]} />
      <meshStandardMaterial color={color} metalness={0.35} roughness={0.3} />
    </mesh>
  );
}

function boundsOf(rooms: FacRoom[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const r of rooms) {
    const p = roomToWorld(r);
    minX = Math.min(minX, p.x - p.w / 2);
    maxX = Math.max(maxX, p.x + p.w / 2);
    minZ = Math.min(minZ, p.z - p.d / 2);
    maxZ = Math.max(maxZ, p.z + p.d / 2);
  }
  return { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, w: Math.max(1, maxX - minX), d: Math.max(1, maxZ - minZ) };
}

function Slab({ w, d }: { w: number; d: number }) {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 0]} receiveShadow>
      <planeGeometry args={[w + 0.16, d + 0.16]} />
      <meshStandardMaterial color="#1a1c1a" roughness={0.92} />
    </mesh>
  );
}

function FlowerFit({ w, d, veg = false }: { w: number; d: number; veg?: boolean }) {
  const cols = veg ? 4 : 6;
  const n = cols;
  const bench = useRef<THREE.InstancedMesh>(null);
  const leaf = useRef<THREE.InstancedMesh>(null);
  const bar = useRef<THREE.InstancedMesh>(null);
  const bw = (w * (veg ? 0.86 : 0.9)) / cols;
  const bd = d * (veg ? 0.86 : 0.96);
  const bars = veg ? 5 : 8;
  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    for (let c = 0; c < cols; c++) {
      const x = ((c + 0.5) / cols - 0.5) * w * (veg ? 0.88 : 0.92);
      dummy.position.set(x, 0.18, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      bench.current?.setMatrixAt(c, dummy.matrix);
      dummy.position.set(x, veg ? 0.4 : 0.48, 0);
      dummy.updateMatrix();
      leaf.current?.setMatrixAt(c, dummy.matrix);
    }
    let i = 0;
    for (let c = 0; c < cols; c++) {
      const x = ((c + 0.5) / cols - 0.5) * w * (veg ? 0.88 : 0.92);
      for (let r = 0; r < bars; r++) {
        const z = ((r + 0.5) / bars - 0.5) * d * (veg ? 0.8 : 0.9);
        dummy.position.set(x, veg ? 0.72 : 0.86, z);
        dummy.updateMatrix();
        bar.current?.setMatrixAt(i, dummy.matrix);
        i++;
      }
    }
    if (bench.current) bench.current.instanceMatrix.needsUpdate = true;
    if (leaf.current) leaf.current.instanceMatrix.needsUpdate = true;
    if (bar.current) bar.current.instanceMatrix.needsUpdate = true;
  }, [w, d, cols, bars, veg]);
  return (
    <group>
      <instancedMesh ref={bench} args={[undefined, undefined, n]} castShadow receiveShadow>
        <boxGeometry args={[bw * 0.86, 0.05, bd]} />
        <meshStandardMaterial color="#c5c9ce" metalness={0.45} roughness={0.3} />
      </instancedMesh>
      <instancedMesh ref={leaf} args={[undefined, undefined, n]} castShadow>
        <boxGeometry args={[bw * 0.78, veg ? 0.28 : 0.38, bd * 0.97]} />
        <meshStandardMaterial color={veg ? "#2a4a34" : "#1e3a28"} roughness={0.84} />
      </instancedMesh>
      <instancedMesh ref={bar} args={[undefined, undefined, cols * bars]}>
        <boxGeometry args={[bw * 0.72, 0.035, 0.045]} />
        <meshStandardMaterial color="#1a1a1a" metalness={0.4} roughness={0.35} emissive="#e8eef8" emissiveIntensity={0.55} />
      </instancedMesh>
      <pointLight position={[0, 1.35, 0]} intensity={veg ? 3.2 : 5.4} distance={Math.max(w, d) * 1.15} color="#f3f6ff" />
      <pointLight position={[0, 1.1, -d * 0.22]} intensity={veg ? 1.4 : 2.2} distance={Math.max(w, d) * 0.7} color="#eef3ff" />
      <pointLight position={[0, 1.1, d * 0.22]} intensity={veg ? 1.4 : 2.2} distance={Math.max(w, d) * 0.7} color="#eef3ff" />
    </group>
  );
}

function DryFit({ w, d, empty = false }: { w: number; d: number; empty?: boolean }) {
  const aisles = [-0.3, 0.3];
  const hangN = 12;
  const budsPer = empty ? 0 : 9;
  const hang = useRef<THREE.InstancedMesh>(null);
  const bud = useRef<THREE.InstancedMesh>(null);
  const nHang = aisles.length * hangN;
  const nBud = nHang * budsPer;
  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    let i = 0;
    for (const ax of aisles) {
      for (let k = 0; k < hangN; k++) {
        const z = ((k + 0.5) / hangN - 0.5) * d * 0.82;
        dummy.position.set(ax * w, 0.62, z);
        dummy.rotation.set(0, 0, k % 2 ? 0.06 : -0.06);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        hang.current?.setMatrixAt(i, dummy.matrix);
        i++;
      }
    }
    if (hang.current) hang.current.instanceMatrix.needsUpdate = true;
    if (!nBud) return;
    let b = 0;
    for (const ax of aisles) {
      for (let k = 0; k < hangN; k++) {
        const z = ((k + 0.5) / hangN - 0.5) * d * 0.82;
        for (let p = 0; p < budsPer; p++) {
          dummy.position.set(ax * w + (p % 3 - 1) * 0.07, 0.28 + (p % 5) * 0.09, z + (p % 2 ? 0.04 : -0.04));
          const s = 0.55 + (p % 4) * 0.18;
          dummy.scale.set(s, s * 1.15, s);
          dummy.rotation.set(p * 0.4, p * 0.7, p * 0.2);
          dummy.updateMatrix();
          bud.current?.setMatrixAt(b, dummy.matrix);
          b++;
        }
      }
    }
    if (bud.current) bud.current.instanceMatrix.needsUpdate = true;
  }, [w, d, empty, nBud]);
  return (
    <group>
      {aisles.map((x) => (
        <group key={x} position={[x * w, 0, 0]}>
          <Box position={[-0.2, 0.95, 0]} size={[0.035, 1.7, d * 0.84]} color="#f7f7f7" metal={0.45} rough={0.22} />
          <Box position={[0.2, 0.95, 0]} size={[0.035, 1.7, d * 0.84]} color="#f7f7f7" metal={0.45} rough={0.22} />
          {[0.5, 0.92, 1.34].map((y) => (
            <Box key={y} position={[0, y, 0]} size={[0.44, 0.02, d * 0.82]} color="#ffffff" metal={0.15} emit={2.4} emitColor="#ffffff" />
          ))}
        </group>
      ))}
      <instancedMesh ref={hang} args={[undefined, undefined, nHang]} castShadow>
        <boxGeometry args={[0.14, 0.7, 0.09]} />
        <meshStandardMaterial color="#6a7d4a" roughness={0.86} />
      </instancedMesh>
      {nBud ? (
        <instancedMesh ref={bud} args={[undefined, undefined, nBud]} castShadow>
          <sphereGeometry args={[0.045, 6, 5]} />
          <meshStandardMaterial color="#3f6a38" roughness={0.7} />
        </instancedMesh>
      ) : null}
      <Box position={[0, 1.78, 0]} size={[w * 0.72, 0.035, 0.06]} color="#ffffff" emit={4.2} emitColor="#ffffff" />
      <Box position={[0, 1.78, d * 0.28]} size={[w * 0.72, 0.035, 0.06]} color="#ffffff" emit={4.2} emitColor="#ffffff" />
      <Box position={[0, 1.78, -d * 0.28]} size={[w * 0.72, 0.035, 0.06]} color="#ffffff" emit={4.2} emitColor="#ffffff" />
      <pointLight position={[0, 1.62, 0]} intensity={7.5} distance={Math.max(w, d) * 1.35} color="#ffffff" />
      <pointLight position={[-w * 0.28, 1.45, 0]} intensity={4.2} distance={Math.max(w, d) * 0.85} color="#f8fff8" />
      <pointLight position={[w * 0.28, 1.45, 0]} intensity={4.2} distance={Math.max(w, d) * 0.85} color="#f8fff8" />
    </group>
  );
}

function VaultFit({ w, d }: { w: number; d: number }) {
  return (
    <group>
      {[-0.3, 0, 0.3].map((z, i) => (
        <group key={z} position={[0, 0, z * d]}>
          <Box position={[0, 0.7, 0]} size={[w * 0.72, 1.35, 0.16]} color="#6e6e6e" metal={0.25} rough={0.5} />
          {[0.28, 0.58, 0.88, 1.18].map((y) => (
            <Box key={y} position={[0, y, 0]} size={[w * 0.7, 0.03, 0.14]} color="#c8c8c8" />
          ))}
          {i === 1
            ? [-0.2, 0.05, 0.28].map((x) => (
                <Box key={x} position={[x * w, 0.22, 0.22]} size={[0.22, 0.28, 0.18]} color="#8a7354" rough={0.8} />
              ))
            : null}
        </group>
      ))}
      <pointLight position={[0, 1.4, 0]} intensity={1.2} distance={Math.max(w, d)} color="#f2f2f2" />
    </group>
  );
}

function Trimmer({ table = false }: { table?: boolean }) {
  return (
    <group>
      <Box position={[0, 0.55, 0]} size={[1.35, 0.85, 0.62]} color="#e8e8e8" metal={0.18} rough={0.32} />
      <Box position={[0, 0.55, 0.34]} size={[1.38, 0.9, 0.06]} color="#f2f2f2" metal={0.12} rough={0.28} />
      <Box position={[0, 0.55, -0.34]} size={[1.38, 0.9, 0.06]} color="#f2f2f2" metal={0.12} rough={0.28} />
      <Box position={[-0.82, 0.72, 0]} size={[0.28, 0.42, 0.38]} color="#6a6e72" metal={0.35} rough={0.4} />
      <Box position={[-0.98, 0.88, 0]} size={[0.22, 0.28, 0.32]} color="#5a5e62" metal={0.3} />
      <Box position={[0.82, 0.7, 0]} size={[0.26, 0.32, 0.32]} color="#6a6e72" metal={0.35} />
      <Box position={[-0.45, 0.18, 0.28]} size={[0.22, 0.22, 0.18]} color="#2f6db5" />
      <Box position={[-0.2, 0.18, 0.28]} size={[0.22, 0.22, 0.18]} color="#2f6db5" />
      {table ? <Box position={[0.15, 0.48, 0.72]} size={[0.7, 0.05, 0.55]} color="#f0f0f0" metal={0.08} /> : null}
    </group>
  );
}

function KitchenFit({ w, d }: { w: number; d: number }) {
  const s = Math.min(w, d) / 4.4;
  return (
    <group>
      <group position={[-w * 0.18, 0, d * 0.18]} scale={s * 0.78} rotation={[0, 0.12, 0]}>
        <Trimmer table />
      </group>
      <group position={[w * 0.2, 0, d * 0.14]} scale={s * 0.78} rotation={[0, -0.35, 0]}>
        <Trimmer />
      </group>
      <group position={[0, 0, -d * 0.28]} scale={0.72}>
        <MechanicalFit w={w * 0.9} d={d * 0.55} />
      </group>
      <pointLight position={[0, 1.7, 0]} intensity={2.1} distance={Math.max(w, d)} color="#f4f4f4" />
    </group>
  );
}

function BreakFit({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <Box position={[-w * 0.22, 0.42, -d * 0.28]} size={[w * 0.45, 0.06, 0.32]} color="#cfd3d6" metal={0.5} />
      <Box position={[-w * 0.22, 0.2, -d * 0.28]} size={[w * 0.45, 0.32, 0.28]} color="#b0b0b0" />
      <Box position={[w * 0.12, 0.55, -d * 0.28]} size={[0.3, 1.05, 0.32]} color="#d8d8d8" metal={0.4} />
      {[-0.16, 0.18].map((x) => (
        <group key={x} position={[x * w, 0, d * 0.18]}>
          <Box position={[0, 0.36, 0]} size={[0.8, 0.05, 0.48]} color="#dcdcdc" />
          <Box position={[0, 0.22, 0.32]} size={[0.22, 0.28, 0.22]} color="#8a8a8a" />
          <Box position={[0, 0.22, -0.32]} size={[0.22, 0.28, 0.22]} color="#8a8a8a" />
        </group>
      ))}
    </group>
  );
}

function StorageFit({ w, d }: { w: number; d: number }) {
  const racks = [-0.28, 0.08, 0.42];
  return (
    <group>
      {racks.map((z) => (
        <group key={z} position={[0, 0, z * d]}>
          <Box position={[0, 0.55, 0]} size={[w * 0.78, 1.05, 0.08]} color="#2c2c2c" metal={0.4} rough={0.45} />
          {[0.12, 0.42, 0.72].map((y) => (
            <group key={y}>
              {[-0.32, -0.16, 0, 0.16, 0.32].map((x) => (
                <Box key={x} position={[x * w, y + 0.12, 0]} size={[w * 0.12, 0.2, 0.2]} color="#c4b08a" rough={0.85} />
              ))}
            </group>
          ))}
        </group>
      ))}
      <pointLight position={[0, 1.5, 0]} intensity={1.6} distance={Math.max(w, d)} color="#f0f0f0" />
    </group>
  );
}

function PackFit({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <Box position={[0, 0.42, d * 0.12]} size={[w * 0.62, 0.06, d * 0.32]} color="#d8d8d8" metal={0.12} />
      <Box position={[0, 0.2, d * 0.12]} size={[w * 0.58, 0.38, d * 0.28]} color="#8a8e92" />
      <Box position={[-w * 0.22, 0.55, -d * 0.28]} size={[0.35, 1.05, 0.28]} color="#c8c8c8" metal={0.3} />
      <Box position={[w * 0.18, 0.18, -d * 0.22]} size={[0.28, 0.22, 0.22]} color="#c4b08a" rough={0.8} />
      <Box position={[w * 0.28, 0.18, -d * 0.22]} size={[0.28, 0.22, 0.22]} color="#bba57a" rough={0.8} />
      <pointLight position={[0, 1.4, 0]} intensity={1.5} distance={Math.max(w, d)} color="#f4f4f4" />
    </group>
  );
}

function RackRun({ length, along, x = 0, z = 0 }: { length: number; along: "x" | "z"; x?: number; z?: number }) {
  const n = Math.max(3, Math.round(length / 0.38));
  const boxes = Array.from({ length: n }, (_, i) => (i + 0.5) / n - 0.5);
  const post: [number, number, number] = [0.06, 1.28, 0.06];
  const half = length / 2;
  return (
    <group position={[x, 0, z]}>
      {along === "x" ? (
        <>
          <Box position={[-half, 0.64, 0]} size={post} color="#1f1f1f" metal={0.5} rough={0.35} />
          <Box position={[half, 0.64, 0]} size={post} color="#1f1f1f" metal={0.5} rough={0.35} />
        </>
      ) : (
        <>
          <Box position={[0, 0.64, -half]} size={post} color="#1f1f1f" metal={0.5} rough={0.35} />
          <Box position={[0, 0.64, half]} size={post} color="#1f1f1f" metal={0.5} rough={0.35} />
        </>
      )}
      {[0.16, 0.46, 0.76, 1.06].map((y) => (
        <group key={y}>
          <Box
            position={[0, y, 0]}
            size={along === "x" ? [length, 0.03, 0.32] : [0.32, 0.03, length]}
            color="#3a3a3a"
            metal={0.35}
            rough={0.4}
          />
          {boxes.map((t) => (
            <Box
              key={t}
              position={along === "x" ? [t * length, y + 0.1, 0] : [0, y + 0.1, t * length]}
              size={along === "x" ? [length / n - 0.05, 0.16, 0.26] : [0.26, 0.16, length / n - 0.05]}
              color={t > 0 ? "#c4b08a" : "#b89a6e"}
              rough={0.85}
            />
          ))}
        </group>
      ))}
    </group>
  );
}

function ShipInvFit({ w, d }: { w: number; d: number }) {
  const n = Math.max(6, Math.round(w / 0.48));
  const rackLen = d * 0.82;
  return (
    <group>
      {Array.from({ length: n }, (_, i) => {
        const x = -w * 0.46 + ((i + 0.5) / n) * (w * 0.92);
        return <RackRun key={i} length={rackLen} along="z" x={x} z={0} />;
      })}
      <pointLight position={[-w * 0.24, 1.45, 0]} intensity={1.8} distance={Math.max(w, d) * 0.8} color="#f2efe6" />
      <pointLight position={[w * 0.28, 1.45, 0]} intensity={2.1} distance={Math.max(w, d) * 0.7} color="#fff8ee" />
    </group>
  );
}

function ShipDockFit({ w, d }: { w: number; d: number }) {
  const wallZ = d * 0.38;
  const tableX = 0;
  return (
    <group>
      <Box position={[tableX, 0.78, wallZ]} size={[2.2, 0.08, 0.78]} color="#8e979e" metal={0.78} rough={0.22} />
      <Box position={[tableX - 0.95, 0.38, wallZ]} size={[0.08, 0.76, 0.08]} color="#6e767c" metal={0.7} />
      <Box position={[tableX + 0.95, 0.38, wallZ]} size={[0.08, 0.76, 0.08]} color="#6e767c" metal={0.7} />
      <Box position={[tableX - 0.95, 0.38, wallZ - 0.28]} size={[0.08, 0.76, 0.08]} color="#6e767c" metal={0.7} />
      <Box position={[tableX + 0.95, 0.38, wallZ - 0.28]} size={[0.08, 0.76, 0.08]} color="#6e767c" metal={0.7} />
      <Box position={[tableX - 0.35, 0.86, wallZ - 0.08]} size={[0.42, 0.05, 0.22]} color="#1a1a1a" />
      <Box position={[tableX - 0.35, 1.12, wallZ - 0.08]} size={[0.08, 0.48, 0.08]} color="#222" />
      <Box position={[tableX - 0.35, 1.42, wallZ - 0.08]} size={[0.95, 0.58, 0.06]} color="#111" />
      <Box position={[tableX - 0.35, 1.42, wallZ - 0.04]} size={[0.86, 0.48, 0.03]} color="#7ec8ff" emit={1.6} emitColor="#7ec8ff" />
      <Box position={[tableX + 0.35, 0.84, wallZ + 0.08]} size={[0.62, 0.04, 0.22]} color="#1a1a1a" />
      <Box position={[tableX + 0.62, 0.84, wallZ - 0.12]} size={[0.1, 0.04, 0.14]} color="#1a1a1a" />
      <group position={[tableX, 0, wallZ - 0.72]}>
        <Box position={[0, 0.52, 0]} size={[0.62, 0.1, 0.62]} color="#0d0d0d" />
        <Box position={[0, 0.95, -0.26]} size={[0.62, 0.78, 0.1]} color="#0d0d0d" />
        <mesh position={[0, 0.26, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 0.42, 10]} />
          <meshStandardMaterial color="#0a0a0a" metalness={0.45} roughness={0.35} />
        </mesh>
        {[0, 72, 144, 216, 288].map((deg) => {
          const a = (deg * Math.PI) / 180;
          return (
            <group key={deg}>
              <Box position={[Math.cos(a) * 0.28, 0.1, Math.sin(a) * 0.28]} size={[0.32, 0.05, 0.07]} color="#0d0d0d" metal={0.35} />
              <mesh position={[Math.cos(a) * 0.4, 0.07, Math.sin(a) * 0.4]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.07, 0.07, 0.08, 10]} />
                <meshStandardMaterial color="#111" metalness={0.5} roughness={0.3} />
              </mesh>
            </group>
          );
        })}
      </group>
      <Box position={[tableX - 1.35, 0.28, wallZ]} size={[0.55, 0.52, 0.5]} color="#c4a574" rough={0.85} />
      <Box position={[tableX - 1.35, 0.62, wallZ]} size={[0.48, 0.22, 0.42]} color="#d2b48c" rough={0.85} />
      <Box position={[tableX + 1.35, 0.26, wallZ]} size={[0.52, 0.48, 0.48]} color="#c4a574" rough={0.85} />
      <Box position={[tableX + 1.35, 0.56, wallZ]} size={[0.44, 0.2, 0.4]} color="#b89664" rough={0.85} />
      <Box position={[w * 0.36, 1.05, d * 0.48]} size={[0.85, 1.7, 0.08]} color="#5a5e62" metal={0.3} />
      <pointLight position={[0, 1.45, 0]} intensity={2.1} distance={Math.max(w, d) * 0.9} color="#fff8ee" />
    </group>
  );
}

function MechanicalFit({ w, d }: { w: number; d: number }) {
  return (
    <group>
      {[-0.18, 0, 0.18].map((z, i) => (
        <mesh key={z} position={[-w * 0.06, 0.42 + i * 0.08, z * d * 0.15]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.045, 0.045, w * 0.72, 12]} />
          <meshStandardMaterial color="#1f6fbf" metalness={0.35} roughness={0.3} />
        </mesh>
      ))}
      {[-0.12, 0.12].map((x) => (
        <mesh key={x} position={[x * w * 0.35, 0.7, d * 0.22]} castShadow>
          <cylinderGeometry args={[0.04, 0.04, 0.7, 12]} />
          <meshStandardMaterial color="#c0392b" metalness={0.35} roughness={0.3} />
        </mesh>
      ))}
      <Pipe from={[w * 0.22, 0.95, d * 0.22]} to={[w * 0.22, 0.95, -d * 0.12]} r={0.04} color="#c0392b" />
      <Pipe from={[w * 0.22, 0.95, -d * 0.12]} to={[-w * 0.28, 0.95, -d * 0.12]} r={0.04} color="#c0392b" />
      <Box position={[-w * 0.32, 0.45, -d * 0.28]} size={[0.38, 0.85, 0.22]} color="#4a4e52" metal={0.3} />
      <Box position={[-w * 0.18, 0.45, -d * 0.28]} size={[0.38, 0.85, 0.22]} color="#5a5e62" metal={0.3} />
      <Box position={[w * 0.28, 0.4, -d * 0.22]} size={[0.55, 0.75, 0.4]} color="#8a9096" metal={0.45} />
      <pointLight position={[0, 1.6, 0]} intensity={1.8} distance={Math.max(w, d)} color="#eaeaea" />
    </group>
  );
}

function Fit({ room, w, d }: { room: FacRoom; w: number; d: number }) {
  if (isRestroom(room)) return null;
  if (room.zone === "flower") return <FlowerFit w={w} d={d} />;
  if (room.id === "veg") return <FlowerFit w={w} d={d} veg />;
  if (room.id === "pack" || room.id === "office" || room.id === "infused" || room.id === "conf") return <PackFit w={w} d={d} />;
  if (room.id === "stage") return <StorageFit w={w} d={d} />;
  if (room.id === "vault") return <VaultFit w={w} d={d} />;
  if (room.id === "dry1") return <DryFit w={w} d={d} empty />;
  if (room.zone === "dry") return <DryFit w={w} d={d} />;
  if (room.id === "kitchen") return <KitchenFit w={w} d={d} />;
  if (room.id === "rr-m") {
    const s = Math.min(w, d) / 3.2;
    return (
      <group scale={s}>
        <Trimmer table />
      </group>
    );
  }
  if (room.id === "break") return <BreakFit w={w} d={d} />;
  if (room.id === "dock-inv") return <ShipInvFit w={w} d={d} />;
  if (room.id === "ship") return <ShipDockFit w={w} d={d} />;
  if (room.id === "pretrim") return <StorageFit w={w} d={d} />;
  if (room.id === "cure") return <DryFit w={w} d={d} />;
  if (room.id === "hydro" || room.id === "solventless") return <MechanicalFit w={w} d={d} />;
  if (room.id === "fulfill" || room.id === "freezer") return <VaultFit w={w} d={d} />;
  if (room.id === "bda" || room.id === "biomass" || room.id === "wh1") return <StorageFit w={w} d={d} />;
  if (room.id === "grind" || room.id === "qa" || room.id === "quar") return <PackFit w={w} d={d} />;
  return null;
}

function RoomMesh({
  room,
  open,
  dim,
  onPick,
  packLow,
}: {
  room: FacRoom;
  open: boolean;
  dim: boolean;
  onPick: () => void;
  packLow?: boolean;
}) {
  const p = roomToWorld(room);
  const h = 2.15;
  const wallH = open ? h * 0.55 : h;
  const op = dim ? 0.18 : 0.98;
  const t = 0.05;
  const wc = isRestroom(room);
  const [hov, setHov] = useState(false);
  useCursor(hov && !wc);
  const lit = room.zone === "flower" || room.id === "veg";
  const clock = roomClock(room);
  const dry = room.id === "dry1" || room.id === "dry2";
  const desk = room.id === "ship" ? shipDesk() : null;
  const lines =
    room.id === "ship"
      ? [desk ? `${desk.going.length} shipping today` : "0 shipping today"]
      : roomMetrics(room);
  const hw = p.w / 2;
  const hd = p.d / 2;

  return (
    <group position={[p.x, 0, p.z]}>
      <PickMesh
        position={[0, wallH / 2, 0]}
        onClick={(e) => {
          e.stopPropagation();
          if (!wc) onPick();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          if (!wc) setHov(true);
        }}
        onPointerOut={() => setHov(false)}
      >
        <boxGeometry args={[p.w, wallH, p.d]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </PickMesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 0]} receiveShadow>
        <planeGeometry args={[Math.max(0.2, p.w - t * 2), Math.max(0.2, p.d - t * 2)]} />
        <meshStandardMaterial
          color={hov || open ? FLOOR_LIT : dry ? "#d4ead8" : lit ? "#cfd6d2" : FLOOR}
          roughness={0.38}
          metalness={0.06}
        />
      </mesh>
      {(
        [
          [0, wallH / 2, -(hd - t / 2), p.w - t, wallH, t],
          [0, wallH / 2, hd - t / 2, p.w - t, wallH, t],
          [-(hw - t / 2), wallH / 2, 0, t, wallH, p.d - t],
          [hw - t / 2, wallH / 2, 0, t, wallH, p.d - t],
        ] as [number, number, number, number, number, number][]
      ).map((b, i) => (
        <mesh key={i} position={[b[0], b[1], b[2]]} castShadow>
          <boxGeometry args={[b[3], b[4], b[5]]} />
          <meshStandardMaterial
            color={dry ? (i % 2 ? "#c8e0cc" : "#d6ead9") : i % 2 ? WALL : WALL_IN}
            roughness={0.68}
            metalness={0.04}
            transparent={dim}
            opacity={op}
            depthWrite={!dim}
          />
        </mesh>
      ))}
      {!dim ? <Fit room={room} w={p.w} d={p.d} /> : null}
      {!wc ? (
        <Html
          position={
            room.id === "ship"
              ? [-p.w * 0.32, 1.42, -p.d * 0.06]
              : room.id === "dry1" || room.id === "dry2"
                ? [0, 1.35, 0]
                : room.id === "veg"
                  ? [0, 1.55, -p.d * 0.28]
                  : room.id === "dock-inv"
                    ? [0, 1.55, -p.d * 0.08]
                    : [0, 1.55, 0]
          }
          center
          zIndexRange={[20, 0]}
          style={{ pointerEvents: "none" }}
        >
          <div
            className={
              "fac-pin" +
              (open || hov ? " on" : "") +
              (room.id === "dry2" || room.id === "pretrim" ? " is-wide" : "")
            }
          >
            <b>{shortName(room)}</b>
            {room.id === "stage" && packLow ? <em className="fac-pin-low">Low Stock</em> : null}
            {room.id !== "stage"
              ? (room.id === "dry1" || room.id === "dry2" ? lines.slice(0, 2) : lines.slice(0, 2)).map((line) => (
                  <em key={line}>{line}</em>
                ))
              : null}
            {clock && room.id !== "ship" ? <em className={"fac-clock " + clock.tone}>{clock.text}</em> : null}
          </div>
        </Html>
      ) : null}
      {room.id === "veg" && !dim ? (
        <>
          <Html position={[-p.w * 0.22, 1.55, -p.d * 0.08]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
            <div className="fac-pin">
              <b>Mother Room</b>
              <em>{s2sPlants("Mother Room").toLocaleString()} plants</em>
            </div>
          </Html>
          <Html position={[p.w * 0.18, 1.55, p.d * 0.18]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
            <div className="fac-pin">
              <b>Clone Room</b>
              <em>{s2sPlants("Clone Room").toLocaleString()} plants</em>
            </div>
          </Html>
        </>
      ) : null}
    </group>
  );
}

function FrameAll({ token, rooms }: { token: string; rooms: FacRoom[] }) {
  const { camera, size, controls } = useThree();
  const ids = rooms.map((r) => r.id).join(",");

  useLayoutEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const b = boundsOf(rooms);
    const visW = Math.max(120, size.width);
    const visH = Math.max(120, size.height);
    cam.aspect = visW / visH;
    cam.fov = 28;
    cam.near = 0.2;
    cam.far = 900;
    cam.up.set(0, 1, 0);

    const corners: THREE.Vector3[] = [];
    for (const sx of [-0.5, 0.5] as const) {
      for (const sz of [-0.5, 0.5] as const) {
        corners.push(new THREE.Vector3(b.cx + sx * b.w, 0, b.cz + sz * b.d));
        corners.push(new THREE.Vector3(b.cx + sx * b.w, 2.2, b.cz + sz * b.d));
      }
    }
    const dir = new THREE.Vector3(0, 0.92, 0.28).normalize();
    const look = new THREE.Vector3(b.cx, 0.04, b.cz);
    const ndc = new THREE.Vector3();
    const fits = (dist: number) => {
      cam.position.copy(look).addScaledVector(dir, dist);
      cam.lookAt(look);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      for (const p of corners) {
        ndc.copy(p).project(cam);
        if (ndc.x < -0.96 || ndc.x > 0.96 || ndc.y < -0.96 || ndc.y > 0.96 || ndc.z < 0 || ndc.z > 1) return false;
      }
      return true;
    };
    let lo = 6;
    let hi = 500;
    if (!fits(hi)) hi = 800;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    const dist = hi * 1.03;
    cam.position.copy(look).addScaledVector(dir, dist);
    cam.lookAt(look);
    cam.updateProjectionMatrix();

    const c = controls as unknown as
      | {
          target: THREE.Vector3;
          minDistance: number;
          maxDistance: number;
          update: () => void;
        }
      | undefined;
    if (c?.target) {
      c.target.copy(look);
      c.minDistance = Math.max(4, dist * 0.35);
      c.maxDistance = dist * 5;
      c.update();
    }
  }, [camera, controls, size.width, size.height, token, ids]);

  return null;
}

export function FacilityGL({
  rooms,
  selected,
  onSelect,
  fit = "facility",
  packLow,
}: {
  rooms: FacRoom[];
  selected: string | null;
  onSelect: (id: string) => void;
  view: "iso" | "plan";
  fit?: string;
  packLow?: boolean;
}) {
  const b = boundsOf(rooms);
  return (
    <Canvas
      className="fac-gl"
      shadows
      dpr={[1, 1.6]}
      camera={{ position: [0, 28, 12], fov: 30, near: 0.12, far: 900 }}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}
      resize={{ scroll: false, debounce: 0 }}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance", failIfMajorPerformanceCaveat: false }}
      onCreated={({ gl, scene, camera }) => {
        gl.setClearColor("#070b09", 1);
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.12;
        scene.fog = null;
        camera.up.set(0, 1, 0);
      }}
      onPointerMissed={() => onSelect("")}
    >
      <color attach="background" args={["#070b09"]} />
      <ambientLight intensity={0.38} color="#e8e4dc" />
      <hemisphereLight args={["#f7f4ee", "#3a3a38", 0.42]} />
      <directionalLight position={[10, 22, 8]} intensity={1.05} color="#fff8ee" castShadow />
      <directionalLight position={[-12, 10, -8]} intensity={0.28} color="#c9d4cc" />
      <group>
        <group position={[b.cx, 0, b.cz]}>
          <Slab w={b.w} d={b.d} />
        </group>
        {rooms.map((room) => (
          <RoomMesh
            key={room.id}
            room={room}
            open={selected === room.id}
            dim={!!selected && selected !== room.id}
            onPick={() => onSelect(room.id)}
            packLow={packLow}
          />
        ))}
      </group>
      <FrameAll token={fit} rooms={rooms} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        enablePan
        enableRotate
        enableZoom
        minPolarAngle={0.12}
        maxPolarAngle={Math.PI / 2 - 0.08}
        panSpeed={0.85}
        rotateSpeed={0.55}
        zoomSpeed={0.95}
      />
    </Canvas>
  );
}
