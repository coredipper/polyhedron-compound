// First-principles construction of all 75 Skilling uniform polyhedron
// compounds (UC1 - UC75).
//
// Each compound is returned as:
//   {
//     components: [{ vertices, faces }, ...],
//     counts: { components, vertices, distinctVertices, multiplicity, edges, faces },
//     symmetry: string,
//   }
//
// No three.js dependency, so all 75 compounds can be tested directly in Node.

import {
  IDENTITY, INVERSION, alignFrame, distance, matMul, matVec, rotAxis,
} from './vec.js';
import {
  PHI, buildAntiprism, buildPrism, buildRhombihexahedron, gcd,
  symmetryGroup, uniformPolyhedron,
} from './wythoff.js';

const DEG = Math.PI / 180;
const POINT_TOL = 1e-5;

// Exact closed-form rotation angles around [1, 1, 1] for UC14, UC15, UC16, UC19.
//
// Rotating [1, 0, 0] around [1, 1, 1] by theta traces a circle; requiring it
// to lie on an Ih mirror containing [1, 1, 1] raises the octahedron stabilizer
// to D3d (10 octahedra, UC15 and UC16, separated by 60 deg):
//   tan(theta15) = sqrt(3) * (sqrt(5) - 2)
// Requiring it to lie on a non-axial Ih mirror (normal [1, -1/phi, -phi])
// merges vertices in pairs (20 octahedra, 60 vertices, UC14 and UC19):
//   cos(theta - theta15) = (sqrt(5) - 1) / (2 * sqrt(3 + sqrt(5)))
export const THETA_15 = Math.atan(Math.sqrt(3) * (Math.sqrt(5) - 2));
export const THETA_16 = THETA_15 + Math.PI / 3;
export const THETA_14 = THETA_15 - Math.acos((Math.sqrt(5) - 1) / (2 * Math.sqrt(3 + Math.sqrt(5))));

// Canonical polyhedral symmetry axes and perpendicular 2-fold reference axes.
const FRAME_3O = alignFrame([1, 1, 1], [1, -1, 0]);
const FRAME_4O = IDENTITY;
const FRAME_3I = alignFrame([1, 1, 1], [1, 1 / PHI, -PHI]);
const FRAME_5I = alignFrame([0, 1, PHI], [1, 0, 0]);

function transformPoly(poly, matrix) {
  return {
    vertices: poly.vertices.map((v) => matVec(matrix, v)),
    faces: poly.faces,
  };
}

function sameFaceCycle(ptsA, ptsB) {
  const n = ptsA.length;
  if (n !== ptsB.length) return false;
  for (let start = 0; start < n; start++) {
    if (distance(ptsA[0], ptsB[start]) >= POINT_TOL) continue;
    let forward = true;
    for (let k = 1; k < n; k++) {
      if (distance(ptsA[k], ptsB[(start + k) % n]) >= POINT_TOL) {
        forward = false;
        break;
      }
    }
    if (forward) return true;
    let backward = true;
    for (let k = 1; k < n; k++) {
      if (distance(ptsA[k], ptsB[(start - k + n) % n]) >= POINT_TOL) {
        backward = false;
        break;
      }
    }
    if (backward) return true;
  }
  return false;
}

/** True when two polyhedra occupy the exact same vertices and faces in 3D. */
export function samePolyhedron(a, b) {
  if (a.vertices.length !== b.vertices.length || a.faces.length !== b.faces.length) return false;
  for (const va of a.vertices) {
    if (!b.vertices.some((vb) => distance(va, vb) < POINT_TOL)) return false;
  }
  for (const fa of a.faces) {
    const ptsA = fa.map((i) => a.vertices[i]);
    const matched = b.faces.some((fb) => sameFaceCycle(ptsA, fb.map((i) => b.vertices[i])));
    if (!matched) return false;
  }
  return true;
}

/** Distinct copies of `base` under a list of orthogonal matrices `group`. */
function orbitComponents(base, group) {
  const components = [];
  for (const g of group) {
    const candidate = transformPoly(base, g);
    if (!components.some((existing) => samePolyhedron(existing, candidate))) {
      components.push(candidate);
    }
  }
  return components;
}

/** Distinct copies of `base` placed on an axis frame, rotated by `theta`, under `groupName`. */
function orientedOrbit(base, frame, axisAngle, groupName) {
  const local = axisAngle ? transformPoly(base, rotAxis([0, 0, 1], axisAngle)) : base;
  const placed = frame === IDENTITY ? local : transformPoly(local, frame);
  return orbitComponents(placed, symmetryGroup(groupName));
}

function edgeCountOf(poly) {
  const seen = new Set();
  for (const face of poly.faces) {
    for (let k = 0; k < face.length; k++) {
      const a = face[k];
      const b = face[(k + 1) % face.length];
      seen.add(a < b ? `${a},${b}` : `${b},${a}`);
    }
  }
  return seen.size;
}

/** Topological counts for a list of constituent polyhedra. */
export function summarizeComponents(components) {
  const distinct = [];
  let totalVertices = 0;
  let totalEdges = 0;
  let totalFaces = 0;
  for (const comp of components) {
    totalVertices += comp.vertices.length;
    totalEdges += edgeCountOf(comp);
    totalFaces += comp.faces.length;
    for (const v of comp.vertices) {
      if (!distinct.some((u) => distance(u, v) < POINT_TOL)) distinct.push(v);
    }
  }
  return {
    components: components.length,
    vertices: totalVertices,
    distinctVertices: distinct.length,
    multiplicity: Math.round(totalVertices / distinct.length),
    edges: totalEdges,
    faces: totalFaces,
  };
}

// ---------------------------------------------------------------------------
// Prismatic compound builders (UC20 - UC25)

function buildPrismaticFamily(uc, options = {}) {
  const defaults = {
    20: { n: 2, p: 3, q: 1, rf: true, kind: 'prism' },
    21: { n: 2, p: 3, q: 1, rf: false, kind: 'prism' },
    22: { n: 2, p: 2, q: 1, rf: true, kind: 'antiprism', qParity: 'odd' },
    23: { n: 3, p: 2, q: 1, rf: false, kind: 'antiprism', qParity: 'odd' },
    24: { n: 1, p: 5, q: 2, rf: true, kind: 'antiprism', qParity: 'even' },
    25: { n: 2, p: 5, q: 2, rf: false, kind: 'antiprism', qParity: 'even' },
  }[uc];

  const n = options.n ?? defaults.n;
  const p = options.p ?? defaults.p;
  const q = options.q ?? defaults.q;

  if (!Number.isInteger(n) || n < (defaults.rf ? 1 : 2)) {
    throw new Error(`UC${uc} requires integer n >= ${defaults.rf ? 1 : 2} (got ${n})`);
  }
  if (!Number.isInteger(p) || !Number.isInteger(q) || gcd(p, q) !== 1) {
    throw new Error(`UC${uc} requires coprime integers p, q (got ${p}/${q})`);
  }
  if (defaults.qParity === 'odd' && q % 2 === 0) {
    throw new Error(`UC${uc} requires odd q (got ${p}/${q})`);
  }
  if (defaults.qParity === 'even' && q % 2 !== 0) {
    throw new Error(`UC${uc} requires even q (got ${p}/${q})`);
  }

  const base = defaults.kind === 'prism' ? buildPrism(p, q) : buildAntiprism(p, q);
  const step = (2 * Math.PI) / (n * p);
  const angles = [];
  if (defaults.rf) {
    // Half-period between mirror coincidences is pi/(n*p); default at 28% so
    // pairs are visibly offset without colliding or snapping to the higher symmetry.
    const defaultTheta = 0.28 * (Math.PI / (n * p));
    const theta = options.theta ?? defaultTheta;
    for (let k = 0; k < n; k++) {
      angles.push(theta + k * step);
      angles.push(-theta + k * step);
    }
  } else {
    for (let k = 0; k < n; k++) angles.push(k * step);
  }

  const components = [];
  for (const a of angles) {
    const candidate = transformPoly(base, rotAxis([0, 0, 1], a));
    if (!components.some((c) => samePolyhedron(c, candidate))) components.push(candidate);
  }

  const symmetry =
    defaults.kind === 'antiprism' && (n * q) % 2 === 1
      ? `D${n * p}d`
      : `D${n * p}h`;

  return { components, symmetry, params: { n, p, q } };
}

// ---------------------------------------------------------------------------
// Compound dispatcher for UC1 - UC75

const ROT_X_90 = rotAxis([1, 0, 0], Math.PI / 2);

const RECIPES = {
  // Block 1: Tetrahedra, cubes, octahedra, tetrahemihexahedra (UC1 - UC19)
  1: ({ theta = 20 * DEG }) => ({
    components: orbitComponents(transformPoly(uniformPolyhedron('3 | 2 3'), rotAxis([0, 0, 1], theta)), symmetryGroup('Td')),
    symmetry: 'Td',
  }),
  2: ({ theta = 20 * DEG }) => ({
    components: orbitComponents(transformPoly(uniformPolyhedron('3 | 2 3'), rotAxis([0, 0, 1], theta)), symmetryGroup('Oh')),
    symmetry: 'Oh',
  }),
  3: () => ({
    components: orbitComponents(transformPoly(uniformPolyhedron('3 | 2 3'), rotAxis([0, 0, 1], Math.PI / 4)), symmetryGroup('Oh')),
    symmetry: 'Oh',
  }),
  4: () => ({
    components: orbitComponents(uniformPolyhedron('3 | 2 3'), symmetryGroup('Oh')),
    symmetry: 'Oh',
  }),
  5: () => ({
    components: orbitComponents(uniformPolyhedron('3 | 2 3'), symmetryGroup('I')),
    symmetry: 'I',
  }),
  6: () => ({
    components: orbitComponents(uniformPolyhedron('3 | 2 3'), symmetryGroup('Ih')),
    symmetry: 'Ih',
  }),
  7: ({ theta = 20 * DEG }) => ({
    components: orbitComponents(transformPoly(uniformPolyhedron('3 | 2 4'), rotAxis([0, 0, 1], theta)), symmetryGroup('Oh')),
    symmetry: 'Oh',
  }),
  8: () => ({
    components: orbitComponents(transformPoly(uniformPolyhedron('3 | 2 4'), rotAxis([0, 0, 1], Math.PI / 4)), symmetryGroup('Oh')),
    symmetry: 'Oh',
  }),
  9: () => ({
    components: orbitComponents(uniformPolyhedron('3 | 2 4'), symmetryGroup('Ih')),
    symmetry: 'Ih',
  }),
  10: ({ theta = 25 * DEG }) => ({
    components: orbitComponents(transformPoly(uniformPolyhedron('4 | 2 3'), rotAxis([1, 1, 1], theta)), symmetryGroup('Th')),
    symmetry: 'Th',
  }),
  11: ({ theta = 25 * DEG }) => ({
    components: orbitComponents(transformPoly(uniformPolyhedron('4 | 2 3'), rotAxis([1, 1, 1], theta)), symmetryGroup('Oh')),
    symmetry: 'Oh',
  }),
  12: () => ({
    components: orbitComponents(transformPoly(uniformPolyhedron('4 | 2 3'), rotAxis([1, 1, 1], Math.PI / 3)), symmetryGroup('Oh')),
    symmetry: 'Oh',
  }),
  13: ({ theta = 15 * DEG }) => ({
    components: orbitComponents(transformPoly(uniformPolyhedron('4 | 2 3'), rotAxis([1, 1, 1], theta)), symmetryGroup('Ih')),
    symmetry: 'Ih',
  }),
  14: () => ({
    components: orbitComponents(transformPoly(uniformPolyhedron('4 | 2 3'), rotAxis([1, 1, 1], THETA_14)), symmetryGroup('Ih')),
    symmetry: 'Ih',
  }),
  15: () => ({
    components: orbitComponents(transformPoly(uniformPolyhedron('4 | 2 3'), rotAxis([1, 1, 1], THETA_15)), symmetryGroup('Ih')),
    symmetry: 'Ih',
  }),
  16: () => ({
    components: orbitComponents(transformPoly(uniformPolyhedron('4 | 2 3'), rotAxis([1, 1, 1], THETA_16)), symmetryGroup('Ih')),
    symmetry: 'Ih',
  }),
  17: () => ({
    components: orbitComponents(uniformPolyhedron('4 | 2 3'), symmetryGroup('Ih')),
    symmetry: 'Ih',
  }),
  18: () => ({
    components: orbitComponents(uniformPolyhedron('3/2 3 | 2'), symmetryGroup('I')),
    symmetry: 'I',
  }),
  19: () => ({
    components: orbitComponents(transformPoly(uniformPolyhedron('3/2 3 | 2'), rotAxis([1, 1, 1], THETA_14)), symmetryGroup('I')),
    symmetry: 'I',
  }),

  // Block 2: Infinite prismatic families (UC20 - UC25)
  20: (opts) => buildPrismaticFamily(20, opts),
  21: (opts) => buildPrismaticFamily(21, opts),
  22: (opts) => buildPrismaticFamily(22, opts),
  23: (opts) => buildPrismaticFamily(23, opts),
  24: (opts) => buildPrismaticFamily(24, opts),
  25: (opts) => buildPrismaticFamily(25, opts),

  // Block 3: Polyhedral prism and antiprism compounds (UC26 - UC45)
  26: ({ theta = 8 * DEG }) => ({
    components: orientedOrbit(buildAntiprism(5, 1), FRAME_5I, theta, 'Ih'),
    symmetry: 'Ih',
  }),
  27: () => ({
    components: orientedOrbit(buildAntiprism(5, 1), FRAME_5I, 18 * DEG, 'Ih'),
    symmetry: 'Ih',
  }),
  28: ({ theta = 8 * DEG }) => ({
    components: orientedOrbit(buildAntiprism(5, 3), FRAME_5I, theta, 'Ih'),
    symmetry: 'Ih',
  }),
  29: () => ({
    components: orientedOrbit(buildAntiprism(5, 3), FRAME_5I, 18 * DEG, 'Ih'),
    symmetry: 'Ih',
  }),
  30: () => ({
    components: orientedOrbit(buildPrism(3, 1), FRAME_3O, 0, 'O'),
    symmetry: 'O',
  }),
  31: () => ({
    components: orientedOrbit(buildPrism(3, 1), FRAME_3O, 0, 'Oh'),
    symmetry: 'Oh',
  }),
  32: () => ({
    components: orientedOrbit(buildPrism(3, 1), FRAME_3I, 0, 'I'),
    symmetry: 'I',
  }),
  33: () => ({
    components: orientedOrbit(buildPrism(3, 1), FRAME_3I, 0, 'Ih'),
    symmetry: 'Ih',
  }),
  34: () => ({
    components: orientedOrbit(buildPrism(5, 1), FRAME_5I, 0, 'I'),
    symmetry: 'I',
  }),
  35: () => ({
    components: orientedOrbit(buildPrism(5, 1), FRAME_5I, 0, 'Ih'),
    symmetry: 'Ih',
  }),
  36: () => ({
    components: orientedOrbit(buildPrism(5, 2), FRAME_5I, 0, 'I'),
    symmetry: 'I',
  }),
  37: () => ({
    components: orientedOrbit(buildPrism(5, 2), FRAME_5I, 0, 'Ih'),
    symmetry: 'Ih',
  }),
  38: () => ({
    components: orientedOrbit(buildPrism(6, 1), FRAME_3O, 0, 'Oh'),
    symmetry: 'Oh',
  }),
  39: () => ({
    components: orientedOrbit(buildPrism(6, 1), FRAME_3I, 0, 'Ih'),
    symmetry: 'Ih',
  }),
  40: () => ({
    components: orientedOrbit(buildPrism(10, 1), FRAME_5I, 0, 'Ih'),
    symmetry: 'Ih',
  }),
  41: () => ({
    components: orientedOrbit(buildPrism(10, 3), FRAME_5I, 0, 'Ih'),
    symmetry: 'Ih',
  }),
  42: () => ({
    components: orientedOrbit(buildAntiprism(4, 1), FRAME_4O, 22.5 * DEG, 'O'),
    symmetry: 'O',
  }),
  43: () => ({
    components: orientedOrbit(buildAntiprism(4, 1), FRAME_4O, 22.5 * DEG, 'Oh'),
    symmetry: 'Oh',
  }),
  44: () => ({
    components: orientedOrbit(buildAntiprism(5, 2), FRAME_5I, 0, 'I'),
    symmetry: 'I',
  }),
  45: () => ({
    components: orientedOrbit(buildAntiprism(5, 2), FRAME_5I, 0, 'Ih'),
    symmetry: 'Ih',
  }),

  // Block 4: Icosahedral and Kepler-Poinsot compounds (UC46 - UC53)
  46: () => ({
    components: orbitComponents(uniformPolyhedron('5 | 2 3'), symmetryGroup('Oh')),
    symmetry: 'Oh',
  }),
  47: () => ({
    components: orbitComponents(transformPoly(uniformPolyhedron('5 | 2 3'), ROT_X_90), symmetryGroup('Ih')),
    symmetry: 'Ih',
  }),
  48: () => ({
    components: orbitComponents(uniformPolyhedron('5/2 | 2 5'), symmetryGroup('Oh')),
    symmetry: 'Oh',
  }),
  49: () => ({
    components: orbitComponents(transformPoly(uniformPolyhedron('5/2 | 2 5'), ROT_X_90), symmetryGroup('Ih')),
    symmetry: 'Ih',
  }),
  50: () => ({
    components: orbitComponents(uniformPolyhedron('5 | 2 5/2'), symmetryGroup('Oh')),
    symmetry: 'Oh',
  }),
  51: () => ({
    components: orbitComponents(transformPoly(uniformPolyhedron('5 | 2 5/2'), ROT_X_90), symmetryGroup('Ih')),
    symmetry: 'Ih',
  }),
  52: () => ({
    components: orbitComponents(uniformPolyhedron('5/2 | 2 3'), symmetryGroup('Oh')),
    symmetry: 'Oh',
  }),
  53: () => ({
    components: orbitComponents(transformPoly(uniformPolyhedron('5/2 | 2 3'), ROT_X_90), symmetryGroup('Ih')),
    symmetry: 'Ih',
  }),

  // Block 5: Uniform tetrahedral and octahedral compounds (UC54 - UC67)
  54: () => ({
    components: orbitComponents(uniformPolyhedron('2 3 | 3'), symmetryGroup('Oh')),
    symmetry: 'Oh',
  }),
  55: () => ({
    components: orbitComponents(uniformPolyhedron('2 3 | 3'), symmetryGroup('I')),
    symmetry: 'I',
  }),
  56: () => ({
    components: orbitComponents(uniformPolyhedron('2 3 | 3'), symmetryGroup('Ih')),
    symmetry: 'Ih',
  }),
  57: () => ({
    components: orbitComponents(uniformPolyhedron('2 3 | 4'), symmetryGroup('Ih')),
    symmetry: 'Ih',
  }),
  58: () => ({
    components: orbitComponents(uniformPolyhedron('2 3 | 4/3'), symmetryGroup('Ih')),
    symmetry: 'Ih',
  }),
  59: () => ({
    components: orbitComponents(uniformPolyhedron('2 | 3 4'), symmetryGroup('Ih')),
    symmetry: 'Ih',
  }),
  60: () => ({
    components: orbitComponents(uniformPolyhedron('4/3 4 | 3'), symmetryGroup('Ih')),
    symmetry: 'Ih',
  }),
  61: () => ({
    components: orbitComponents(uniformPolyhedron('3/2 3 | 3'), symmetryGroup('Ih')),
    symmetry: 'Ih',
  }),
  62: () => ({
    components: orbitComponents(uniformPolyhedron('3 4 | 2'), symmetryGroup('Ih')),
    symmetry: 'Ih',
  }),
  63: () => ({
    components: orbitComponents(buildRhombihexahedron(false), symmetryGroup('Ih')),
    symmetry: 'Ih',
  }),
  64: () => ({
    components: orbitComponents(uniformPolyhedron('3/2 4 | 4'), symmetryGroup('Ih')),
    symmetry: 'Ih',
  }),
  65: () => ({
    components: orbitComponents(uniformPolyhedron('3 4 | 4/3'), symmetryGroup('Ih')),
    symmetry: 'Ih',
  }),
  66: () => ({
    components: orbitComponents(buildRhombihexahedron(true), symmetryGroup('Ih')),
    symmetry: 'Ih',
  }),
  67: () => ({
    components: orbitComponents(uniformPolyhedron('3/2 4 | 2'), symmetryGroup('Ih')),
    symmetry: 'Ih',
  }),

  // Block 6: Enantiomorphic snub pairs (UC68 - UC75)
  68: () => ({
    components: orbitComponents(uniformPolyhedron('| 2 3 4'), symmetryGroup('Oh')),
    symmetry: 'Oh',
  }),
  69: () => ({
    components: orbitComponents(uniformPolyhedron('| 2 3 5'), symmetryGroup('Ih')),
    symmetry: 'Ih',
  }),
  70: () => ({
    components: orbitComponents(uniformPolyhedron('| 2 5/2 3'), symmetryGroup('Ih')),
    symmetry: 'Ih',
  }),
  71: () => ({
    components: orbitComponents(uniformPolyhedron('| 5/3 2 3'), symmetryGroup('Ih')),
    symmetry: 'Ih',
  }),
  72: () => ({
    components: orbitComponents(uniformPolyhedron('| 2 3/2 5/3'), symmetryGroup('Ih')),
    symmetry: 'Ih',
  }),
  73: () => ({
    components: orbitComponents(uniformPolyhedron('| 2 5/2 5'), symmetryGroup('Ih')),
    symmetry: 'Ih',
  }),
  74: () => ({
    components: orbitComponents(uniformPolyhedron('| 5/3 2 5'), symmetryGroup('Ih')),
    symmetry: 'Ih',
  }),
  75: () => ({
    components: orbitComponents(uniformPolyhedron('| 5/3 3 5'), symmetryGroup('Ih')),
    symmetry: 'Ih',
  }),
};

/**
 * Build uniform polyhedron compound UC<uc> (1..75).
 * Optional parameters:
 *   - theta: rotational freedom angle in radians (UC1, 2, 7, 10, 11, 13, 20, 22, 24, 26, 28)
 *   - n, p, q: prismatic family parameters (UC20 - UC25)
 *   - mirror: invert through the origin to obtain the enantiomorph of chiral compounds
 */
export function buildCompound(uc, options = {}) {
  const recipe = RECIPES[uc];
  if (!recipe) throw new Error(`Unknown uniform compound index UC${uc}`);
  const built = recipe(options);
  const components = options.mirror
    ? built.components.map((comp) => transformPoly(comp, INVERSION))
    : built.components;
  return {
    uc,
    components,
    counts: summarizeComponents(components),
    symmetry: built.symmetry,
    ...(built.params ? { params: built.params } : {}),
  };
}

/** Reflect a compound's components across the origin (used in chirality tests). */
export function invertComponents(components) {
  return components.map((comp) => transformPoly(comp, INVERSION));
}
