// Uniform polyhedra (Wythoff construction, rhombihexahedra, prisms and
// antiprisms) and canonical polyhedral symmetry groups (T, Td, Th, O, Oh, I, Ih).
//
// All groups share one canonical frame so subgroup inclusions hold directly:
//   - T < Td < Oh,  T < Th < Oh,  T < Th < Ih
//   - 2-fold axes of T, Th, Td, Ih and 4-fold axes of Oh lie along x, y, z
//   - 3-fold axes of all polyhedral groups include (1, 1, 1)
//   - 5-fold axes of I and Ih include (0, 1, phi)

import {
  IDENTITY, INVERSION, add, cross, determinant, distance, dot, fromRows,
  length, matMul, matVec, normalize, reflection, scale, sub, transpose,
} from './vec.js';

export const PHI = (1 + Math.sqrt(5)) / 2;

const POINT_TOLERANCE = 1e-7;
const MATRIX_TOLERANCE = 1e-6;
const MAX_GROUP_ORDER = 120;

export function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) [x, y] = [y, x % y];
  return x;
}

function parseRational(token) {
  const match = /^(\d+)(?:\/(\d+))?$/.exec(token);
  if (!match) throw new Error(`Invalid Wythoff number "${token}"`);
  const n = Number(match[1]);
  const d = match[2] ? Number(match[2]) : 1;
  if (!(n > d && d >= 1)) throw new Error(`Wythoff number must be greater than 1: "${token}"`);
  return { n, d, value: n / d, text: token };
}

export function parseWythoff(symbol) {
  const parts = symbol.trim().split('|');
  if (parts.length !== 2) throw new Error(`Wythoff symbol needs exactly one "|": "${symbol}"`);
  const tokens = (s) => s.trim().split(/\s+/).filter(Boolean);
  const left = tokens(parts[0]);
  const right = tokens(parts[1]);
  const numbers = [...left, ...right].map(parseRational);
  if (numbers.length !== 3) throw new Error(`Wythoff symbol needs three numbers: "${symbol}"`);
  const form = ['snub', 'vertex', 'edge', 'omnitruncate'][left.length];
  return { form, p: numbers[0], q: numbers[1], r: numbers[2] };
}

function schwarzTriangle(p, q, r) {
  const A = Math.PI / p.value;
  const B = Math.PI / q.value;
  const C = Math.PI / r.value;
  const clamp = (x) => Math.max(-1, Math.min(1, x));
  const sideB = Math.acos(clamp((Math.cos(B) + Math.cos(A) * Math.cos(C)) / (Math.sin(A) * Math.sin(C))));
  const sideC = Math.acos(clamp((Math.cos(C) + Math.cos(A) * Math.cos(B)) / (Math.sin(A) * Math.sin(B))));
  return {
    P: [0, 0, 1],
    Q: [Math.sin(sideC), 0, Math.cos(sideC)],
    R: [Math.sin(sideB) * Math.cos(A), Math.sin(sideB) * Math.sin(A), Math.cos(sideB)],
  };
}

function inwardNormal(a, b, inside) {
  const n = normalize(cross(a, b));
  return dot(n, inside) < 0 ? scale(n, -1) : n;
}

export function sameMatrix(a, b) {
  for (let i = 0; i < 9; i++) if (Math.abs(a[i] - b[i]) > MATRIX_TOLERANCE) return false;
  return true;
}

export function generateGroup(generators, maxOrder = MAX_GROUP_ORDER) {
  const elements = [IDENTITY];
  for (let i = 0; i < elements.length; i++) {
    for (const g of generators) {
      const m = matMul(g, elements[i]);
      if (!elements.some((e) => sameMatrix(e, m))) {
        elements.push(m);
        if (elements.length > maxOrder) {
          throw new Error(`Group exceeded maximum order ${maxOrder}`);
        }
      }
    }
  }
  return elements;
}

class PointSet {
  constructor() {
    this.points = [];
  }

  indexOf(p) {
    return this.points.findIndex((q) => distance(p, q) < POINT_TOLERANCE);
  }

  add(p) {
    let i = this.indexOf(p);
    if (i < 0) {
      i = this.points.length;
      this.points.push(p);
    }
    return i;
  }
}

function cycleKey(indices) {
  let best = null;
  for (const seq of [indices, [...indices].reverse()]) {
    for (let s = 0; s < seq.length; s++) {
      const key = seq.slice(s).concat(seq.slice(0, s)).join(',');
      if (best === null || key < best) best = key;
    }
  }
  return best;
}

function rotationFace(V, rot) {
  const points = [V];
  for (let x = matVec(rot, V); distance(x, V) > POINT_TOLERANCE; x = matVec(rot, x)) {
    points.push(x);
    if (points.length > 60) throw new Error('Rotation face does not close');
  }
  return points;
}

function alternatingFace(V, s1, s2) {
  const rot = matMul(s1, s2);
  const b = matVec(s1, V);
  const points = [];
  let a = V;
  let bb = b;
  do {
    points.push(a, bb);
    a = matVec(rot, a);
    bb = matVec(rot, bb);
    if (points.length > 60) throw new Error('Alternating face does not close');
  } while (distance(a, V) > POINT_TOLERANCE);
  return points;
}

function isDegenerate(points) {
  if (points.length < 3) return true;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (distance(points[i], points[j]) < POINT_TOLERANCE) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Snub vertex solver

function quadraticForm(rotation) {
  const d = IDENTITY.map((x, i) => x - rotation[i]);
  return matMul(transpose(d), d);
}

function solve3(m, b) {
  const det = determinant(m);
  if (Math.abs(det) < 1e-14) return null;
  const col = (k) => {
    const c = m.slice();
    c[k] = b[0];
    c[3 + k] = b[1];
    c[6 + k] = b[2];
    return determinant(c) / det;
  };
  return [col(0), col(1), col(2)];
}

function newtonSnub(start, forms) {
  const [AP, AQ, AR] = forms;
  const D1 = AP.map((x, i) => x - AQ[i]);
  const D2 = AQ.map((x, i) => x - AR[i]);
  let v = normalize(start);
  for (let iter = 0; iter < 60; iter++) {
    const d1v = matVec(D1, v);
    const d2v = matVec(D2, v);
    const F = [dot(v, d1v), dot(v, d2v), dot(v, v) - 1];
    if (Math.abs(F[0]) + Math.abs(F[1]) + Math.abs(F[2]) < 1e-15) break;
    const J = fromRows(scale(d1v, 2), scale(d2v, 2), scale(v, 2));
    const step = solve3(J, scale(F, -1));
    if (!step) return null;
    v = add(v, step);
  }
  const residual = Math.abs(dot(v, matVec(D1, v))) + Math.abs(dot(v, matVec(D2, v)));
  if (!(residual < 1e-12) || Math.abs(length(v) - 1) > 1e-12) return null;
  return normalize(v);
}

function spherePoints(count) {
  const points = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (2 * (i + 0.5)) / count;
    const radius = Math.sqrt(1 - y * y);
    points.push([Math.cos(golden * i) * radius, y, Math.sin(golden * i) * radius]);
  }
  return points;
}

function snubRoots(rotations) {
  const forms = rotations.map(quadraticForm);
  const roots = [];
  for (const start of spherePoints(400)) {
    const v = newtonSnub(start, forms);
    if (!v) continue;
    const edge = Math.sqrt(dot(v, matVec(forms[0], v)));
    if (edge < 1e-6) continue;
    if (!roots.some((u) => distance(u, v) < 1e-9 || distance(u, scale(v, -1)) < 1e-9)) roots.push(v);
  }
  return roots;
}

function triangleSetup(symbol) {
  const parsed = parseWythoff(symbol);
  const { p, q, r } = parsed;
  const { P, Q, R } = schwarzTriangle(p, q, r);
  const nP = inwardNormal(Q, R, P);
  const nQ = inwardNormal(R, P, Q);
  const nR = inwardNormal(P, Q, R);
  const sP = reflection(nP);
  const sQ = reflection(nQ);
  const sR = reflection(nR);
  const rP = matMul(sQ, sR);
  const rQ = matMul(sR, sP);
  const rR = matMul(sP, sQ);
  return { ...parsed, P, Q, R, nP, nQ, nR, sP, sQ, sR, rP, rQ, rR };
}

function insideTriangle(V, t) {
  return dot(V, t.nP) > 1e-9 && dot(V, t.nQ) > 1e-9 && dot(V, t.nR) > 1e-9;
}

function snubVertex(t) {
  const inside = [];
  for (const v of snubRoots([t.rP, t.rQ, t.rR])) {
    if (insideTriangle(v, t)) inside.push(v);
    else if (insideTriangle(scale(v, -1), t)) inside.push(scale(v, -1));
  }
  if (inside.length !== 1) {
    throw new Error(`Expected one snub root inside the triangle, found ${inside.length}`);
  }
  return inside[0];
}

// ---------------------------------------------------------------------------
// Canonical orientation frames for tetrahedral, octahedral and icosahedral groups

function rotationAxis(m) {
  const trace = m[0] + m[4] + m[8];
  if (trace < -1 + 1e-9) {
    const mPlusI = m.map((x, i) => x + IDENTITY[i]);
    const cols = [0, 1, 2].map((j) => [mPlusI[j], mPlusI[3 + j], mPlusI[6 + j]]);
    cols.sort((a, b) => length(b) - length(a));
    return { angleCos: -1, axis: normalize(cols[0]) };
  }
  const axis = [m[7] - m[5], m[2] - m[6], m[3] - m[1]];
  return { angleCos: (trace - 1) / 2, axis: length(axis) > 1e-9 ? normalize(axis) : null };
}

function standardFrame(group) {
  const rotations = group.filter((m) => determinant(m) > 0);
  const halfTurns = [];
  const fourFold = [];
  const fiveFold = [];
  for (const m of rotations) {
    const { angleCos, axis } = rotationAxis(m);
    if (!axis) continue;
    if (angleCos === -1) halfTurns.push(axis);
    else if (Math.abs(angleCos) < 1e-9) fourFold.push(axis);
    else if (Math.abs(angleCos - Math.cos((2 * Math.PI) / 5)) < 1e-9) fiveFold.push(axis);
  }
  if (rotations.length === 60) {
    const a = halfTurns[0];
    const b = halfTurns.find((x) => Math.abs(dot(a, x)) < 1e-9);
    const c = cross(a, b);
    let frame = fromRows(a, b, c);
    const target = normalize([0, 1, PHI]);
    const hasTarget = (f) => fiveFold.some((axis) => Math.abs(Math.abs(dot(matVec(f, axis), target)) - 1) < 1e-9);
    if (!hasTarget(frame)) frame = matMul([0, -1, 0, 1, 0, 0, 0, 0, 1], frame);
    return frame;
  }
  if (rotations.length === 24) {
    const axes = [];
    for (const ax of fourFold) {
      if (!axes.some((u) => Math.abs(dot(u, ax)) > 1 - 1e-6)) axes.push(ax);
    }
    const [a, b] = axes;
    return fromRows(a, b, cross(a, b));
  }
  if (rotations.length === 12) {
    const a = halfTurns[0];
    const b = halfTurns.find((x) => Math.abs(dot(a, x)) < 1e-9);
    return fromRows(a, b, cross(a, b));
  }
  return IDENTITY;
}

// ---------------------------------------------------------------------------
// Constituent polyhedron builders

const polyCache = new Map();

/** Uniform polyhedron from its Wythoff symbol, in the canonical frame. */
export function uniformPolyhedron(symbol) {
  if (polyCache.has(symbol)) return polyCache.get(symbol);

  const t = triangleSetup(symbol);
  const { form, P, sP, sQ, sR, rP, rQ, rR } = t;

  let V;
  let generating;
  if (form === 'vertex') {
    V = P;
    generating = [rotationFace(V, rQ), rotationFace(V, rR)];
  } else if (form === 'edge') {
    V = normalize(cross(t.nR, sub(t.nP, t.nQ)));
    if (dot(V, t.nP) < 0) V = scale(V, -1);
    generating = [rotationFace(V, rP), rotationFace(V, rQ), alternatingFace(V, sP, sQ)];
  } else if (form === 'omnitruncate') {
    V = normalize(solve3(fromRows(t.nP, t.nQ, t.nR), [1, 1, 1]));
    generating = [alternatingFace(V, sQ, sR), alternatingFace(V, sR, sP), alternatingFace(V, sP, sQ)];
  } else {
    V = snubVertex(t);
    const rPinv = transpose(rP);
    generating = [
      rotationFace(V, rP), rotationFace(V, rQ), rotationFace(V, rR),
      [V, matVec(rQ, V), matVec(rPinv, V)],
    ];
  }
  generating = generating.filter((face) => !isDegenerate(face));

  const fullGroup = generateGroup([sP, sQ, sR]);
  const group = form === 'snub' ? fullGroup.filter((m) => determinant(m) > 0) : fullGroup;

  const vertexSet = new PointSet();
  for (const g of group) vertexSet.add(matVec(g, V));

  const faces = [];
  const seen = new Set();
  for (const face of generating) {
    for (const g of group) {
      const indices = face.map((p) => vertexSet.indexOf(matVec(g, p)));
      if (indices.includes(-1)) throw new Error('Face vertex is not in the vertex orbit');
      const key = cycleKey(indices);
      if (!seen.has(key)) {
        seen.add(key);
        faces.push(indices);
      }
    }
  }

  const frame = standardFrame(fullGroup);
  const result = { vertices: vertexSet.points.map((p) => matVec(frame, p)), faces };
  polyCache.set(symbol, result);
  return result;
}

/**
 * Small (U18, great = false) and great (U21, great = true) rhombihexahedra.
 * Both have 24 vertices (cyclic permutations of (+-1, +-1, +-a)), 12 squares,
 * and 6 regular {8} or {8/3} faces in the planes x = +-1, y = +-1, z = +-1.
 */
export function buildRhombihexahedron(great = false) {
  const key = great ? '__U21__' : '__U18__';
  if (polyCache.has(key)) return polyCache.get(key);

  const a = great ? Math.SQRT2 - 1 : Math.SQRT2 + 1;
  const vertexSet = new PointSet();
  const perms = [[0, 1, 2], [1, 2, 0], [2, 0, 1]];
  for (const [i0, i1, i2] of perms) {
    for (const s0 of [-1, 1]) {
      for (const s1 of [-1, 1]) {
        for (const s2 of [-1, 1]) {
          const v = [0, 0, 0];
          v[i0] = s0;
          v[i1] = s1;
          v[i2] = s2 * a;
          vertexSet.add(normalize(v));
        }
      }
    }
  }

  const vertices = vertexSet.points;
  const planeOffset = 1 / Math.sqrt(2 + a * a);
  const faces = [];
  const step = great ? 3 : 1;

  for (let axis = 0; axis < 3; axis++) {
    const u = (axis + 1) % 3;
    const w = (axis + 2) % 3;
    for (const sign of [-1, 1]) {
      const inPlane = [];
      for (let i = 0; i < vertices.length; i++) {
        if (Math.abs(vertices[i][axis] - sign * planeOffset) < 1e-6) inPlane.push(i);
      }
      inPlane.sort((i, j) => Math.atan2(vertices[i][w], vertices[i][u]) - Math.atan2(vertices[j][w], vertices[j][u]));
      const face = [];
      for (let k = 0; k < 8; k++) face.push(inPlane[(k * step) % 8]);
      faces.push(face);
    }
  }

  const signFlip = great ? -1 : 1;
  for (let axis = 0; axis < 3; axis++) {
    const u = (axis + 1) % 3;
    const w = (axis + 2) % 3;
    for (const s1 of [-1, 1]) {
      for (const s2 of [-1, 1]) {
        const pts = [
          [1, s1, s2 * a],
          [-1, s1, s2 * a],
          [-1, signFlip * s1 * a, signFlip * s2],
          [1, signFlip * s1 * a, signFlip * s2],
        ].map((p) => {
          const v = [0, 0, 0];
          v[axis] = p[0];
          v[u] = p[1];
          v[w] = p[2];
          return normalize(v);
        });
        faces.push(pts.map((p) => vertexSet.indexOf(p)));
      }
    }
  }

  const result = { vertices, faces };
  polyCache.set(key, result);
  return result;
}

/**
 * Uniform {p/q} prism (p/q > 2, gcd(p, q) = 1), axis along z, vertex 0 on +x.
 * All edges have equal length; vertices lie on the unit sphere.
 */
export function buildPrism(p, q = 1) {
  if (!(Number.isInteger(p) && Number.isInteger(q) && p >= 3 && q >= 1 && p > 2 * q && gcd(p, q) === 1)) {
    throw new Error(`Invalid prism {${p}/${q}}: need coprime integers with p/q > 2`);
  }
  const R = 1 / Math.sin((Math.PI * q) / p);
  const h = 1;
  const norm = Math.hypot(R, h);
  const vertices = [];
  for (const z of [h, -h]) {
    for (let i = 0; i < p; i++) {
      const a = (2 * Math.PI * i) / p;
      vertices.push([(R * Math.cos(a)) / norm, (R * Math.sin(a)) / norm, z / norm]);
    }
  }
  const top = [];
  const bottom = [];
  const faces = [];
  for (let i = 0; i < p; i++) {
    top.push((i * q) % p);
    bottom.push(p + ((i * q) % p));
    const j = (i + q) % p;
    faces.push([i, j, p + j, p + i]);
  }
  faces.push(top, bottom.reverse());
  return { vertices, faces };
}

/**
 * Uniform {p/q} antiprism (p/q > 3/2, gcd(p, q) = 1), axis along z, top vertex 0 on +x.
 * For p/q = 2/1 (digonal antiprism) this builds a regular tetrahedron with 4 triangles.
 */
export function buildAntiprism(p, q = 1) {
  if (!(Number.isInteger(p) && Number.isInteger(q) && p >= 2 && q >= 1 && 2 * p > 3 * q && gcd(p, q) === 1)) {
    throw new Error(`Invalid antiprism {${p}/${q}}: need coprime integers with p/q > 3/2`);
  }
  const R = 1 / Math.sin((Math.PI * q) / p);
  const c = Math.cos((Math.PI * q) / (2 * p));
  const h = Math.sqrt(1 - 1 / (4 * c * c));
  const norm = Math.hypot(R, h);
  const offset = (Math.PI * q) / p;
  const vertices = [];
  for (let i = 0; i < p; i++) {
    const a = (2 * Math.PI * i) / p;
    vertices.push([(R * Math.cos(a)) / norm, (R * Math.sin(a)) / norm, h / norm]);
  }
  for (let i = 0; i < p; i++) {
    const a = (2 * Math.PI * i) / p + offset;
    vertices.push([(R * Math.cos(a)) / norm, (R * Math.sin(a)) / norm, -h / norm]);
  }

  const faces = [];
  for (let i = 0; i < p; i++) {
    const j = (i + q) % p;
    faces.push([i, j, p + i]);
    faces.push([p + i, p + j, j]);
  }
  if (p >= 3) {
    const top = [];
    const bottom = [];
    for (let i = 0; i < p; i++) {
      top.push((i * q) % p);
      bottom.push(p + ((i * q) % p));
    }
    faces.push(top, bottom.reverse());
  }
  return { vertices, faces };
}

// ---------------------------------------------------------------------------
// Canonical polyhedral symmetry groups

const groupCache = new Map();

export function symmetryGroup(name) {
  if (groupCache.has(name)) return groupCache.get(name);
  let group;
  if (name === 'Oh') {
    group = generateGroup([
      reflection([1, 0, 0]),
      reflection(normalize([1, -1, 0])),
      reflection(normalize([0, 1, -1])),
    ], 48);
  } else if (name === 'O') {
    group = symmetryGroup('Oh').filter((m) => determinant(m) > 0);
  } else if (name === 'Td') {
    group = generateGroup([
      reflection(normalize([1, -1, 0])),
      reflection(normalize([0, 1, -1])),
      reflection(normalize([1, 1, 0])),
    ], 24);
  } else if (name === 'T') {
    group = symmetryGroup('Td').filter((m) => determinant(m) > 0);
  } else if (name === 'Th') {
    group = generateGroup([...symmetryGroup('T'), INVERSION], 24);
  } else if (name === 'Ih') {
    group = generateGroup([
      reflection([1, 0, 0]),
      reflection([0, 1, 0]),
      reflection(normalize([PHI, 1, 1 / PHI])),
    ], 120);
  } else if (name === 'I') {
    group = symmetryGroup('Ih').filter((m) => determinant(m) > 0);
  } else {
    throw new Error(`Unknown polyhedral symmetry group "${name}"`);
  }
  groupCache.set(name, group);
  return group;
}
