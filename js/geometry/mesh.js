// Converts a compound ({ components: [{ vertices, faces }, ...] }) into flat
// triangle, normal, per-vertex component index, and edge arrays ready for a
// GPU buffer. Independent of three.js.

import { centroid, cross, dot, length, scale, sub } from './vec.js';
import { triangulateFace } from './polygon.js';

/**
 * Plane normal of a planar polygon, pointing away from the origin when the
 * face does not pass through it.
 */
export function faceNormal(points) {
  const c = centroid(points);
  let best = [0, 0, 0];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const n = cross(sub(points[i], c), sub(points[j], c));
      if (length(n) > length(best)) best = n;
    }
  }
  const n = length(best);
  if (n < 1e-12) throw new Error('Degenerate face');
  const unit = scale(best, 1 / n);
  return dot(unit, c) < -1e-9 ? scale(unit, -1) : unit;
}

/** Unique undirected edges of one polyhedron as [a, b] vertex index pairs. */
export function edgeList(faces) {
  const seen = new Set();
  const edges = [];
  for (const face of faces) {
    for (let k = 0; k < face.length; k++) {
      const a = face[k];
      const b = face[(k + 1) % face.length];
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push(a < b ? [a, b] : [b, a]);
      }
    }
  }
  return edges;
}

/**
 * Triangles (with per-face normals and component index per vertex) and edge
 * segments for a compound, scaled so the farthest vertex sits at `radius`.
 */
export function meshData(compound, radius = 1) {
  const { components } = compound;
  if (!components || !components.length) throw new Error('Compound has no components');

  let maxR = 0;
  for (const comp of components) {
    for (const v of comp.vertices) {
      const r = length(v);
      if (r > maxR) maxR = r;
    }
  }
  if (!(maxR > 0)) throw new Error('Compound vertices collapse to the origin');
  const s = radius / maxR;

  const positions = [];
  const normals = [];
  const componentIds = [];
  const edgePositions = [];

  for (let cid = 0; cid < components.length; cid++) {
    const comp = components[cid];
    const scaled = comp.vertices.map((v) => scale(v, s));
    for (const face of comp.faces) {
      const points = face.map((i) => scaled[i]);
      const n = faceNormal(points);
      for (const triangle of triangulateFace(points, n)) {
        // Ensure triangle winding agrees with `n`.
        const triN = cross(sub(triangle[1], triangle[0]), sub(triangle[2], triangle[0]));
        const ordered = dot(triN, n) < 0 ? [triangle[0], triangle[2], triangle[1]] : triangle;
        for (const p of ordered) {
          positions.push(p[0], p[1], p[2]);
          normals.push(n[0], n[1], n[2]);
          componentIds.push(cid);
        }
      }
    }
    for (const [a, b] of edgeList(comp.faces)) {
      edgePositions.push(...scaled[a], ...scaled[b]);
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    componentIds: new Uint16Array(componentIds),
    edges: new Float32Array(edgePositions),
  };
}
