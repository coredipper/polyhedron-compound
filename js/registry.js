// Connects the catalog (js/catalog.js) to the geometry engine (js/geometry/compound.js).
// Geometry is computed on demand and cached for default parameters so gallery
// load stays fast while interactive slider/parameter edits remain instant.

import catalog, {
  ANTIPRISM_EVEN_BASES, ANTIPRISM_ODD_BASES, FAMILIES, PRISM_BASES,
} from './catalog.js';
import { buildCompound } from './geometry/compound.js';

export { ANTIPRISM_EVEN_BASES, ANTIPRISM_ODD_BASES, FAMILIES, PRISM_BASES };

export const compounds = catalog.map((entry) => ({
  ...entry,
  id: `uc${entry.uc}`,
  code: `UC${entry.uc}`,
  title: `UC${entry.uc} · ${entry.name}`,
  chiral: Boolean(entry.chiral),
}));

const byId = new Map(compounds.map((entry) => [entry.id, entry]));
const defaultCache = new Map();

/** Valid preset {p/q} options for a prismatic family entry. */
export function prismBasesFor(entry) {
  if (!entry.prismatic) return [];
  if (entry.prismatic.kind === 'prism') return PRISM_BASES;
  return entry.prismatic.qParity === 'even' ? ANTIPRISM_EVEN_BASES : ANTIPRISM_ODD_BASES;
}

/** Max angle (degrees) and default angle (degrees) for a rotational-freedom entry. */
export function thetaSpec(entry, params = {}) {
  if (!entry.rotationalFreedom) return null;
  if (entry.rotationalFreedom.dynamic) {
    const n = params.n ?? entry.prismatic.defaultN;
    const p = params.p ?? entry.prismatic.defaultP;
    const maxDeg = 180 / (n * p);
    return { defaultDeg: +(0.28 * maxDeg).toFixed(1), maxDeg };
  }
  return entry.rotationalFreedom;
}

/**
 * Retrieve a compound entry together with its built geometry.
 * Options: { theta (radians), n, p, q, mirror }.
 */
export function getCompound(id, options = {}) {
  const entry = byId.get(id);
  if (!entry) return null;

  const isDefault =
    options.theta === undefined &&
    options.n === undefined &&
    options.p === undefined &&
    options.q === undefined &&
    !options.mirror;

  if (isDefault && defaultCache.has(id)) {
    return { ...entry, geometry: defaultCache.get(id) };
  }

  const geometry = buildCompound(entry.uc, options);
  if (isDefault) defaultCache.set(id, geometry);
  return { ...entry, geometry };
}

/** Short one-line card and viewer subtitle. */
export function describe(entry, geometry = null) {
  if (entry.prismatic) {
    const params = geometry?.params ?? {
      n: entry.prismatic.defaultN,
      p: entry.prismatic.defaultP,
      q: entry.prismatic.defaultQ,
    };
    const count = geometry?.counts.components ?? (entry.prismatic.rf ? 2 * params.n : params.n);
    const poly = params.q === 1 ? `{${params.p}}` : `{${params.p}/${params.q}}`;
    const kind = entry.prismatic.kind === 'prism' ? 'prisms' : 'antiprisms';
    const parts = [`Infinite family · showing ${count} ${poly} ${kind}`];
    if (entry.prismatic.rf) parts.push('rotational freedom');
    return parts.join(' · ');
  }
  const parts = [`${entry.count} ${entry.constituents}`];
  if (entry.regular) parts.push('regular');
  if (entry.rotationalFreedom) parts.push('rotational freedom');
  if (entry.chiral) parts.push('chiral');
  if (entry.multiplicity && entry.multiplicity > 1) parts.push(`${entry.multiplicity} per vertex`);
  return parts.join(' · ');
}

/** Compact monospace badge text for gallery cards. */
export function badgeText(entry) {
  const parts = [entry.code, entry.symmetry];
  if (entry.rotationalFreedom) parts.push('RF');
  return parts.join(' · ');
}

/** Format a point-group symbol with readable subscripts for display. */
export function formatSymmetry(symbol) {
  const dihedral = /^D(\d+)([hd])$/.exec(symbol);
  if (dihedral) return `D${dihedral[1]}${dihedral[2]}`;
  return symbol;
}

const searchableText = new Map(
  compounds.map((entry) => [
    entry.id,
    [
      entry.id,
      entry.code,
      String(entry.uc),
      entry.name,
      entry.constituent,
      entry.constituents,
      entry.symmetry,
      entry.subgroup,
      FAMILIES[entry.family].label,
      entry.chiral ? 'chiral enantiomorphic' : 'reflexible',
      entry.regular ? 'regular' : '',
      entry.rotationalFreedom ? 'rotational freedom rf' : '',
      entry.prismatic ? 'infinite prismatic family' : '',
      entry.multiplicity > 1 ? `${entry.multiplicity} per vertex` : '',
    ]
      .join(' ')
      .toLowerCase(),
  ]),
);

/** True when `entry` matches the active gallery family filter and search query. */
export function matchesFilter(entry, { family = 'all', query = '' } = {}) {
  if (family !== 'all' && entry.family !== family) return false;
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return true;
  const haystack = searchableText.get(entry.id) ?? '';
  return trimmed.split(/\s+/).every((term) => haystack.includes(term));
}
