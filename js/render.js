// Shared three.js setup for the gallery and the viewer.

import * as THREE from 'three';
import { meshData } from './geometry/mesh.js';

const FACE_COLOR = 0x7aa2f7;

export function addLights(scene) {
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(5, 10, 7);
  scene.add(key);
  const rim = new THREE.DirectionalLight(FACE_COLOR, 0.8);
  rim.position.set(-5, -5, -5);
  scene.add(rim);
}

/** Distinct per-constituent palette spread around the sRGB hue circle. */
const COMPONENT_COLORS = Array.from(
  { length: 20 },
  (_, i) => new THREE.Color().setHSL((i * 0.618034) % 1, 0.58, 0.6, THREE.SRGBColorSpace),
);

export function createFaceMaterial({ vertexColors = true } = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: vertexColors ? 0xffffff : FACE_COLOR,
    vertexColors,
    metalness: 0.28,
    roughness: 0.22,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
    // Compounds include hemipolyhedra (faces through the origin), star faces
    // and mutually intersecting bodies, so both sides of each face are visible.
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
}

export function createEdgeMaterial(opacity = 0.35) {
  return new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity });
}

/**
 * Mesh plus edge lines for a compound. Attaches per-constituent vertex colours
 * and `userData.setColoured(on)` when `colourable` is true. Pass shared
 * `faceMaterial` / `edgeMaterial` to avoid creating per-object materials.
 */
export function createCompoundObject(
  compound,
  { radius = 1, edgeOpacity = 0.35, colourable = true, coloured = true, faceMaterial, edgeMaterial } = {},
) {
  const data = meshData(compound, radius);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));

  let setColoured = null;
  if (colourable) {
    const colors = new Float32Array(data.positions.length);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const base = new THREE.Color(FACE_COLOR);
    setColoured = (on) => {
      for (let v = 0; v < data.componentIds.length; v++) {
        const c = on ? COMPONENT_COLORS[data.componentIds[v] % COMPONENT_COLORS.length] : base;
        colors[3 * v] = c.r;
        colors[3 * v + 1] = c.g;
        colors[3 * v + 2] = c.b;
      }
      geometry.attributes.color.needsUpdate = true;
    };
    setColoured(coloured);
  }

  const ownsFaceMaterial = !faceMaterial;
  const ownsEdgeMaterial = !edgeMaterial;
  const mesh = new THREE.Mesh(geometry, faceMaterial ?? createFaceMaterial({ vertexColors: colourable }));

  const edgeGeometry = new THREE.BufferGeometry();
  edgeGeometry.setAttribute('position', new THREE.BufferAttribute(data.edges, 3));
  const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial ?? createEdgeMaterial(edgeOpacity));

  const dispose = () => {
    geometry.dispose();
    edgeGeometry.dispose();
    if (ownsFaceMaterial) mesh.material.dispose();
    if (ownsEdgeMaterial) edges.material.dispose();
  };

  const group = new THREE.Group();
  group.add(mesh, edges);
  group.userData = { mesh, edges, setColoured, dispose };
  return group;
}

/** WebGL renderer, or null when WebGL is not available. */
export function createRenderer(options) {
  try {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, ...options });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    return renderer;
  } catch (error) {
    console.error('WebGL is not available:', error);
    return null;
  }
}

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
export const prefersReducedMotion = () => reducedMotionQuery.matches;
export const onReducedMotionChange = (listener) => {
  reducedMotionQuery.addEventListener('change', () => listener(reducedMotionQuery.matches));
};
