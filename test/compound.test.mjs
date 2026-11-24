import assert from 'node:assert/strict';
import test from 'node:test';

import {
  THETA_14, THETA_15, THETA_16, buildCompound, invertComponents, samePolyhedron,
} from '../js/geometry/compound.js';
import { meshData } from '../js/geometry/mesh.js';
import { cross, determinant, distance, dot, length, matMul, matVec, rotAxis, sub } from '../js/geometry/vec.js';
import {
  buildAntiprism, buildPrism, buildRhombihexahedron, sameMatrix, symmetryGroup, uniformPolyhedron,
} from '../js/geometry/wythoff.js';
import {
  FAMILIES, badgeText, compounds, describe, getCompound, matchesFilter, prismBasesFor, thetaSpec,
} from '../js/registry.js';

// Reference counts for UC1 - UC75 (default parameters for UC20 - UC25):
// [uc, components, distinctVertices, multiplicity, edges, faces, symmetry, chiral]
const EXPECTED = [
  [1, 6, 24, 1, 36, 24, 'Td', false],
  [2, 12, 48, 1, 72, 48, 'Oh', false],
  [3, 6, 24, 1, 36, 24, 'Oh', false],
  [4, 2, 8, 1, 12, 8, 'Oh', false],
  [5, 5, 20, 1, 30, 20, 'I', true],
  [6, 10, 20, 2, 60, 40, 'Ih', false],
  [7, 6, 48, 1, 72, 36, 'Oh', false],
  [8, 3, 24, 1, 36, 18, 'Oh', false],
  [9, 5, 20, 2, 60, 30, 'Ih', false],
  [10, 4, 24, 1, 48, 32, 'Th', false],
  [11, 8, 48, 1, 96, 64, 'Oh', false],
  [12, 4, 24, 1, 48, 32, 'Oh', false],
  [13, 20, 120, 1, 240, 160, 'Ih', false],
  [14, 20, 60, 2, 240, 160, 'Ih', false],
  [15, 10, 60, 1, 120, 80, 'Ih', false],
  [16, 10, 60, 1, 120, 80, 'Ih', false],
  [17, 5, 30, 1, 60, 40, 'Ih', false],
  [18, 5, 30, 1, 60, 35, 'I', true],
  [19, 20, 60, 2, 240, 140, 'I', true],
  [20, 4, 24, 1, 36, 20, 'D6h', false],
  [21, 2, 12, 1, 18, 10, 'D6h', false],
  [22, 4, 16, 1, 24, 16, 'D4h', false],
  [23, 3, 12, 1, 18, 12, 'D6d', false],
  [24, 2, 20, 1, 40, 24, 'D5h', false],
  [25, 2, 20, 1, 40, 24, 'D10h', false],
  [26, 12, 120, 1, 240, 144, 'Ih', false],
  [27, 6, 60, 1, 120, 72, 'Ih', false],
  [28, 12, 120, 1, 240, 144, 'Ih', false],
  [29, 6, 60, 1, 120, 72, 'Ih', false],
  [30, 4, 24, 1, 36, 20, 'O', true],
  [31, 8, 48, 1, 72, 40, 'Oh', false],
  [32, 10, 60, 1, 90, 50, 'I', true],
  [33, 20, 60, 2, 180, 100, 'Ih', false],
  [34, 6, 60, 1, 90, 42, 'I', true],
  [35, 12, 60, 2, 180, 84, 'Ih', false],
  [36, 6, 60, 1, 90, 42, 'I', true],
  [37, 12, 60, 2, 180, 84, 'Ih', false],
  [38, 4, 48, 1, 72, 32, 'Oh', false],
  [39, 10, 120, 1, 180, 80, 'Ih', false],
  [40, 6, 120, 1, 180, 72, 'Ih', false],
  [41, 6, 120, 1, 180, 72, 'Ih', false],
  [42, 3, 24, 1, 48, 30, 'O', true],
  [43, 6, 48, 1, 96, 60, 'Oh', false],
  [44, 6, 60, 1, 120, 72, 'I', true],
  [45, 12, 120, 1, 240, 144, 'Ih', false],
  [46, 2, 24, 1, 60, 40, 'Oh', false],
  [47, 5, 60, 1, 150, 100, 'Ih', false],
  [48, 2, 24, 1, 60, 24, 'Oh', false],
  [49, 5, 60, 1, 150, 60, 'Ih', false],
  [50, 2, 24, 1, 60, 24, 'Oh', false],
  [51, 5, 60, 1, 150, 60, 'Ih', false],
  [52, 2, 24, 1, 60, 40, 'Oh', false],
  [53, 5, 60, 1, 150, 100, 'Ih', false],
  [54, 2, 24, 1, 36, 16, 'Oh', false],
  [55, 5, 60, 1, 90, 40, 'I', true],
  [56, 10, 120, 1, 180, 80, 'Ih', false],
  [57, 5, 120, 1, 180, 70, 'Ih', false],
  [58, 5, 120, 1, 180, 70, 'Ih', false],
  [59, 5, 60, 1, 120, 70, 'Ih', false],
  [60, 5, 60, 1, 120, 50, 'Ih', false],
  [61, 5, 60, 1, 120, 60, 'Ih', false],
  [62, 5, 120, 1, 240, 130, 'Ih', false],
  [63, 5, 120, 1, 240, 90, 'Ih', false],
  [64, 5, 120, 1, 240, 100, 'Ih', false],
  [65, 5, 120, 1, 240, 100, 'Ih', false],
  [66, 5, 120, 1, 240, 90, 'Ih', false],
  [67, 5, 120, 1, 240, 130, 'Ih', false],
  [68, 2, 48, 1, 120, 76, 'Oh', false],
  [69, 2, 120, 1, 300, 184, 'Ih', false],
  [70, 2, 120, 1, 300, 184, 'Ih', false],
  [71, 2, 120, 1, 300, 184, 'Ih', false],
  [72, 2, 120, 1, 300, 184, 'Ih', false],
  [73, 2, 120, 1, 300, 168, 'Ih', false],
  [74, 2, 120, 1, 300, 168, 'Ih', false],
  [75, 2, 120, 1, 360, 208, 'Ih', false],
];

function dihedralGroup(m, kind) {
  const mirrorY = [1, 0, 0, 0, -1, 0, 0, 0, 1];
  const mirrorZ = [1, 0, 0, 0, 1, 0, 0, 0, -1];
  const base = [];
  for (let k = 0; k < m; k++) {
    const r = rotAxis([0, 0, 1], (2 * Math.PI * k) / m);
    base.push(r, matMul(r, mirrorY));
  }
  const extraGen = kind === 'h'
    ? mirrorZ
    : matMul(rotAxis([0, 0, 1], Math.PI / m), mirrorZ);
  return [...base, ...base.map((e) => matMul(extraGen, e))];
}

function groupForSymbol(sym) {
  const match = /^D(\d+)([hd])$/.exec(sym);
  if (match) return dihedralGroup(Number(match[1]), match[2]);
  return symmetryGroup(sym);
}

function sameCompound(compsA, compsB) {
  if (compsA.length !== compsB.length) return false;
  return compsA.every((a) => compsB.some((b) => samePolyhedron(a, b)));
}

function transformComponents(components, matrix) {
  return components.map((comp) => ({
    vertices: comp.vertices.map((v) => matVec(matrix, v)),
    faces: comp.faces,
  }));
}

function assertUniformPolyhedron(poly, label) {
  for (const v of poly.vertices) {
    assert.ok(Math.abs(length(v) - 1) < 1e-6, `${label}: vertex not on unit sphere`);
  }
  const edgeCounts = new Map();
  let edgeLen = null;
  for (const face of poly.faces) {
    for (let i = 0; i < face.length; i++) {
      const a = face[i];
      const b = face[(i + 1) % face.length];
      const d = distance(poly.vertices[a], poly.vertices[b]);
      if (edgeLen === null) edgeLen = d;
      assert.ok(Math.abs(d - edgeLen) < 1e-6, `${label}: non-uniform edge length`);
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    }
  }
  for (const [edge, count] of edgeCounts) {
    assert.equal(count, 2, `${label}: edge ${edge} belongs to ${count} faces (expected 2)`);
  }
}

test('canonical polyhedral symmetry groups and subgroup inclusions', () => {
  const orders = { T: 12, Td: 24, Th: 24, O: 24, Oh: 48, I: 60, Ih: 120 };
  for (const [name, order] of Object.entries(orders)) {
    assert.equal(symmetryGroup(name).length, order, `group ${name}`);
  }
  const subset = (subName, supName) => {
    const sup = symmetryGroup(supName);
    for (const g of symmetryGroup(subName)) {
      assert.ok(sup.some((h) => sameMatrix(g, h)), `${subName} should be contained in ${supName}`);
    }
  };
  subset('T', 'Td');
  subset('Td', 'Oh');
  subset('T', 'Th');
  subset('Th', 'Oh');
  subset('Th', 'Ih');
  subset('O', 'Oh');
  subset('I', 'Ih');
});

test('constituent polyhedra are uniform with manifold edges', () => {
  assertUniformPolyhedron(buildRhombihexahedron(false), 'U18 small rhombihexahedron');
  assertUniformPolyhedron(buildRhombihexahedron(true), 'U21 great rhombihexahedron');

  for (const [p, q] of [[3, 1], [5, 1], [5, 2], [7, 2], [7, 3], [8, 3], [10, 3]]) {
    assertUniformPolyhedron(buildPrism(p, q), `prism {${p}/${q}}`);
  }
  for (const [p, q] of [[2, 1], [3, 1], [4, 1], [5, 1], [5, 2], [5, 3], [7, 2], [7, 3], [7, 4]]) {
    assertUniformPolyhedron(buildAntiprism(p, q), `antiprism {${p}/${q}}`);
  }
  for (const sym of ['3 | 2 3', '3/2 3 | 2', '2 3 | 4/3', '4/3 4 | 3', '3/2 4 | 2', '| 2 3 4', '| 5/3 3 5']) {
    assertUniformPolyhedron(uniformPolyhedron(sym), `Wythoff ${sym}`);
  }

  assert.throws(() => buildPrism(4, 2));
  assert.throws(() => buildPrism(5, 3));
  assert.throws(() => buildAntiprism(3, 2));
  assert.throws(() => buildAntiprism(6, 2));
});

test('catalog contains UC1 through UC75 with valid metadata', () => {
  assert.equal(compounds.length, 75);
  assert.equal(EXPECTED.length, 75);
  const ids = new Set();
  for (let i = 0; i < 75; i++) {
    const entry = compounds[i];
    assert.equal(entry.uc, i + 1);
    assert.equal(entry.id, `uc${i + 1}`);
    assert.equal(entry.code, `UC${i + 1}`);
    assert.ok(entry.family in FAMILIES, `UC${entry.uc} family`);
    assert.ok(!ids.has(entry.id));
    ids.add(entry.id);
    assert.ok(describe(entry).length > 0);
    assert.ok(badgeText(entry).startsWith(`UC${entry.uc}`));
  }
  assert.equal(compounds.filter((c) => c.chiral).length, 10);
  assert.equal(compounds.filter((c) => c.rotationalFreedom).length, 11);
  assert.equal(compounds.filter((c) => c.prismatic).length, 6);
});

test('all 75 compounds match Skilling counts, symmetry, vertex transitivity, chirality and mesh invariants', () => {
  for (const [uc, k, V, mult, E, F, sym, isChiral] of EXPECTED) {
    const entry = compounds[uc - 1];
    assert.equal(entry.chiral, isChiral, `UC${uc} catalog chiral flag`);

    const built = buildCompound(uc);
    assert.equal(built.counts.components, k, `UC${uc} components`);
    assert.equal(built.counts.distinctVertices, V, `UC${uc} distinct vertices`);
    assert.equal(built.counts.multiplicity, mult, `UC${uc} vertex multiplicity`);
    assert.equal(built.counts.edges, E, `UC${uc} edges`);
    assert.equal(built.counts.faces, F, `UC${uc} faces`);
    assert.equal(built.symmetry, sym, `UC${uc} symmetry`);

    const group = groupForSymbol(sym);

    // Every element of G preserves the compound.
    for (const g of group) {
      assert.ok(
        sameCompound(built.components, transformComponents(built.components, g)),
        `UC${uc} not preserved by its symmetry group ${sym}`,
      );
    }

    // Exact full symmetry order inside the ambient group.
    const ambient = sym === 'I' || sym === 'Ih'
      ? symmetryGroup('Ih')
      : ['T', 'Td', 'Th', 'O', 'Oh'].includes(sym)
        ? symmetryGroup('Oh')
        : group;
    const actualSymmetries = ambient.filter((g) => sameCompound(built.components, transformComponents(built.components, g)));
    assert.equal(actualSymmetries.length, group.length, `UC${uc} exact symmetry order`);

    // Chirality matches presence of improper symmetries and inversion behaviour.
    const hasImproper = actualSymmetries.some((g) => determinant(g) < 0);
    assert.equal(!hasImproper, isChiral, `UC${uc} geometric chirality`);
    const inverted = invertComponents(built.components);
    if (isChiral) {
      assert.ok(!sameCompound(built.components, inverted), `UC${uc} chiral compound must differ from its inverse`);
      const mirrored = buildCompound(uc, { mirror: true });
      assert.ok(sameCompound(mirrored.components, inverted), `UC${uc} mirror option matches inversion`);
    }

    // Vertex transitivity under G.
    const distinctVerts = [];
    for (const comp of built.components) {
      for (const v of comp.vertices) {
        if (!distinctVerts.some((u) => distance(u, v) < 1e-5)) distinctVerts.push(v);
      }
    }
    const orbit = [];
    for (const g of group) {
      const p = matVec(g, distinctVerts[0]);
      if (!orbit.some((u) => distance(u, p) < 1e-5)) orbit.push(p);
    }
    assert.equal(orbit.length, V, `UC${uc} vertex orbit size`);
    for (const v of distinctVerts) {
      assert.ok(orbit.some((u) => distance(u, v) < 1e-5), `UC${uc} not vertex-transitive`);
    }

    // Mesh buffer invariants.
    const mesh = meshData(built, 1.5);
    assert.ok(mesh.positions.length > 0 && mesh.positions.length % 9 === 0, `UC${uc} triangle positions`);
    assert.equal(mesh.normals.length, mesh.positions.length, `UC${uc} normals length`);
    assert.equal(mesh.componentIds.length, mesh.positions.length / 3, `UC${uc} componentIds length`);
    assert.equal(mesh.edges.length, E * 6, `UC${uc} edge segment count`);

    let maxR = 0;
    const seenComp = new Set();
    for (let i = 0; i < mesh.componentIds.length; i++) {
      seenComp.add(mesh.componentIds[i]);
      const r = Math.hypot(mesh.positions[3 * i], mesh.positions[3 * i + 1], mesh.positions[3 * i + 2]);
      assert.ok(Number.isFinite(r), `UC${uc} finite position`);
      if (r > maxR) maxR = r;
    }
    assert.ok(Math.abs(maxR - 1.5) < 1e-5, `UC${uc} circumradius scaled to 1.5`);
    assert.equal(seenComp.size, k, `UC${uc} componentIds cover all ${k} constituents`);

    // Triangle winding matches stored face normal on every triangle.
    for (let t = 0; t < mesh.positions.length; t += 9) {
      const a = [mesh.positions[t], mesh.positions[t + 1], mesh.positions[t + 2]];
      const b = [mesh.positions[t + 3], mesh.positions[t + 4], mesh.positions[t + 5]];
      const c = [mesh.positions[t + 6], mesh.positions[t + 7], mesh.positions[t + 8]];
      const n = [mesh.normals[t], mesh.normals[t + 1], mesh.normals[t + 2]];
      assert.ok(Math.abs(length(n) - 1) < 1e-5, `UC${uc} unit normal`);
      assert.ok(dot(cross(sub(b, a), sub(c, a)), n) > -1e-6, `UC${uc} triangle winding`);
    }
  }
});

test('UC15 and UC16 have distinct vertex arrangements (rhombicosidodecahedron vs truncated icosahedron hull)', () => {
  const hullDegree = (uc) => {
    const built = buildCompound(uc);
    const verts = [];
    for (const c of built.components) {
      for (const v of c.vertices) {
        if (!verts.some((u) => distance(u, v) < 1e-5)) verts.push(v);
      }
    }
    const v0 = verts[0];
    const dists = verts.slice(1).map((v) => distance(v0, v)).sort((a, b) => a - b);
    const d1 = dists[0];
    const d2 = dists.find((d) => d > d1 + 1e-4);
    const c1 = dists.filter((d) => Math.abs(d - d1) < 1e-4).length;
    const c2 = dists.filter((d) => Math.abs(d - d2) < 1e-4).length;
    return c1 + c2;
  };
  assert.equal(hullDegree(15), 4);
  assert.equal(hullDegree(16), 3);
});

test('rotational-freedom compounds pass through their symmetric special cases', () => {
  const DEG = Math.PI / 180;
  assert.ok(sameCompound(buildCompound(1, { theta: 45 * DEG }).components, buildCompound(3).components));
  assert.ok(sameCompound(buildCompound(2, { theta: 0 }).components, buildCompound(4).components));
  assert.ok(sameCompound(buildCompound(2, { theta: 45 * DEG }).components, buildCompound(3).components));
  assert.ok(sameCompound(buildCompound(7, { theta: 45 * DEG }).components, buildCompound(8).components));
  assert.ok(sameCompound(buildCompound(10, { theta: 60 * DEG }).components, buildCompound(12).components));
  assert.ok(sameCompound(buildCompound(11, { theta: 60 * DEG }).components, buildCompound(12).components));
  assert.ok(sameCompound(buildCompound(13, { theta: 0 }).components, buildCompound(17).components));
  assert.ok(sameCompound(buildCompound(13, { theta: THETA_15 }).components, buildCompound(15).components));
  assert.ok(sameCompound(buildCompound(13, { theta: THETA_14 }).components, buildCompound(14).components));
  assert.ok(sameCompound(buildCompound(13, { theta: THETA_16 }).components, buildCompound(16).components));
  assert.ok(sameCompound(buildCompound(26, { theta: 18 * DEG }).components, buildCompound(27).components));
  assert.ok(sameCompound(buildCompound(28, { theta: 18 * DEG }).components, buildCompound(29).components));
});

test('prismatic families UC20-UC25 support preset bases and counts and reject invalid parameters', () => {
  for (let uc = 20; uc <= 25; uc++) {
    const entry = compounds[uc - 1];
    const bases = prismBasesFor(entry);
    assert.ok(bases.length >= 6, `UC${uc} presets`);
    for (const { p, q } of bases) {
      const n = entry.prismatic.minN + 1;
      const built = buildCompound(uc, { n, p, q });
      const expectedCount = entry.prismatic.rf ? 2 * n : n;
      assert.equal(built.counts.components, expectedCount, `UC${uc} n=${n} {${p}/${q}}`);
      const mesh = meshData(built, 1);
      assert.ok(mesh.positions.every(Number.isFinite));
      if (entry.rotationalFreedom) {
        const spec = thetaSpec(entry, { n, p, q });
        assert.ok(spec.defaultDeg > 0 && spec.defaultDeg < spec.maxDeg);
      }
    }
  }
  assert.throws(() => buildCompound(21, { n: 1, p: 3, q: 1 }));
  assert.throws(() => buildCompound(22, { n: 1, p: 5, q: 2 })); // q must be odd
  assert.throws(() => buildCompound(24, { n: 1, p: 5, q: 1 })); // q must be even
  assert.throws(() => buildCompound(25, { n: 1, p: 5, q: 2 })); // n >= 2
});

test('registry caching and gallery filtering work accurately', () => {
  const uc5 = getCompound('uc5');
  assert.equal(uc5.code, 'UC5');
  assert.equal(getCompound('uc5').geometry, uc5.geometry);
  assert.equal(getCompound('does-not-exist'), null);

  assert.equal(compounds.filter((c) => matchesFilter(c)).length, 75);
  assert.equal(compounds.filter((c) => matchesFilter(c, { family: 'snub' })).length, 8);
  assert.equal(compounds.filter((c) => matchesFilter(c, { query: 'chiral' })).length, 10);
  assert.equal(compounds.filter((c) => matchesFilter(c, { query: 'rotational freedom' })).length, 11);
  assert.equal(compounds.filter((c) => matchesFilter(c, { query: 'stella octangula' })).length, 1);
  assert.equal(compounds.filter((c) => matchesFilter(c, { query: 'UC19' })).length, 1);
  assert.equal(compounds.filter((c) => matchesFilter(c, { query: 'tetrahemihexahedra' })).length, 2);
  assert.equal(compounds.filter((c) => matchesFilter(c, { family: 'kepler-poinsot', query: 'five' })).length, 4);
  assert.equal(compounds.filter((c) => matchesFilter(c, { query: 'nonexistent-xyz' })).length, 0);
});
