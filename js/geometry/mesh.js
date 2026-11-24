// Converts a compound ({ components: [{ vertices, faces }, ...] }) into flat
// triangle, normal, per-vertex component index, depth-layer group, and edge
// arrays ready for a GPU buffer. Independent of three.js.

import { centroid, cross, dot, length, scale, sub } from './vec.js';
import { triangulateFace } from './polygon.js';

const PLANE_TOL = 1e-4;

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

function samePlane(a, b) {
  const cos = dot(a.n, b.n);
  if (cos > 1 - PLANE_TOL && Math.abs(a.d - b.d) < PLANE_TOL) return true;
  if (cos < -1 + PLANE_TOL && Math.abs(a.d + b.d) < PLANE_TOL) return true;
  return false;
}

/**
 * Triangles (with per-face normals, component index per vertex, and coplanar
 * layer groups) and edge segments for a compound, scaled so the farthest
 * vertex sits at `radius`.
 *
 * Many uniform compounds (such as UC6, ten tetrahedra, and the prismatic
 * families) have coplanar overlapping faces from different constituents.
 * Assigning each face on a shared plane a distinct layer index lets the
 * renderer separate them cleanly with hardware polygonOffset, preventing
 * z-fighting without distorting geometry.
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

  const faceRecords = [];
  const planeBuckets = [];
  const edgePositions = [];

  for (let cid = 0; cid < components.length; cid++) {
    const comp = components[cid];
    const scaled = comp.vertices.map((v) => scale(v, s));
    for (const face of comp.faces) {
      const points = face.map((i) => scaled[i]);
      const n = faceNormal(points);
      let d = dot(n, centroid(points));
      let pn = n;
      if (d < 0) {
        pn = scale(n, -1);
        d = -d;
      }

      const record = { cid, points, n, layer: 0 };
      faceRecords.push(record);

      const plane = { n: pn, d };
      let bucket = planeBuckets.find((b) => samePlane(b.plane, plane));
      if (!bucket) {
        bucket = { plane, faces: [] };
        planeBuckets.push(bucket);
      }
      bucket.faces.push(record);
    }
    for (const [a, b] of edgeList(comp.faces)) {
      edgePositions.push(...scaled[a], ...scaled[b]);
    }
  }

  // Balance layer 0 ("on top") evenly across constituents on every shared plane
  // so no single polyhedron dominates overlapping faces (e.g. each of the 10
  // tetrahedra in UC6 wins 2 of its 4 face overlaps).
  const balance = new Int32Array(components.length);
  const shared = planeBuckets.filter((b) => b.faces.length > 1);
  let layerCount = 1;
  for (const bucket of shared) {
    bucket.faces.sort((a, b) => (balance[a.cid] - balance[b.cid]) || (a.cid - b.cid));
    for (let layer = 0; layer < bucket.faces.length; layer++) {
      bucket.faces[layer].layer = layer;
      balance[bucket.faces[layer].cid] += layer === 0 ? 1 : -1;
    }
    if (bucket.faces.length > layerCount) layerCount = bucket.faces.length;
  }
  for (let pass = 0; pass < 8; pass++) {
    let improved = false;
    for (const bucket of shared) {
      for (let i = 1; i < bucket.faces.length; i++) {
        if (balance[bucket.faces[0].cid] - balance[bucket.faces[i].cid] >= 2) {
          const top = bucket.faces[0];
          const other = bucket.faces[i];
          bucket.faces[0] = other;
          bucket.faces[i] = top;
          other.layer = 0;
          top.layer = i;
          balance[top.cid] -= 2;
          balance[other.cid] += 2;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }

  // Emit triangles contiguously by layer so each layer maps to one draw group.
  const bucketsByLayer = Array.from({ length: layerCount }, () => []);
  for (const record of faceRecords) bucketsByLayer[record.layer].push(record);

  const positions = [];
  const normals = [];
  const componentIds = [];
  const groups = [];

  for (let layer = 0; layer < layerCount; layer++) {
    const start = componentIds.length;
    for (const { cid, points, n } of bucketsByLayer[layer]) {
      for (const triangle of triangulateFace(points, n)) {
        const triN = cross(sub(triangle[1], triangle[0]), sub(triangle[2], triangle[0]));
        const ordered = dot(triN, n) < 0 ? [triangle[0], triangle[2], triangle[1]] : triangle;
        for (const p of ordered) {
          positions.push(p[0], p[1], p[2]);
          normals.push(n[0], n[1], n[2]);
          componentIds.push(cid);
        }
      }
    }
    const count = componentIds.length - start;
    if (count > 0) groups.push({ start, count, layer });
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    componentIds: new Uint16Array(componentIds),
    edges: new Float32Array(edgePositions),
    groups,
    layerCount,
  };
}
