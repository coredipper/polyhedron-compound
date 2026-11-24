# Uniform Polyhedron Compounds

Interactive 3D models of all 75 uniform polyhedron compounds (`UC1`–`UC75`)
enumerated by John Skilling in *Uniform Compounds of Uniform Polyhedra* (1976),
following Wikipedia's
[Uniform polyhedron compound](https://en.wikipedia.org/wiki/Uniform_polyhedron_compound)
table.

## Run

Browsers block ES module imports from `file://` URLs, so serve the folder over HTTP:

```sh
npm start                  # http://localhost:8000 (Node 18+, no dependencies)
# or: python3 -m http.server 8000
```

The gallery (`index.html`) groups the 75 compounds into six families, filters
by family or search query (`UC` number, name, constituent, symmetry group,
`chiral`, `regular`, `rotational freedom`), and links to the viewer
(`viewer.html?shape=uc<n>`).

Viewer controls: drag to rotate, scroll to zoom, `←` `→` for the previous or
next compound. Buttons toggle auto-rotation, edges, per-constituent colours,
and mirroring for the 10 chiral compounds (`UC5`, `UC18`, `UC19`, `UC30`,
`UC32`, `UC34`, `UC36`, `UC42`, `UC44`, `UC55`). Compounds with rotational
freedom expose an angle slider (`θ`); the six infinite prismatic families
(`UC20`–`UC25`) expose `{p/q}` base and `n` count selectors.

## How the compounds are computed

All geometry lives in `js/geometry/` with no `three.js` dependency, so the same
code runs in the browser and under `node --test`:

1. `js/geometry/wythoff.js` constructs every uniform constituent polyhedron
   directly from first principles: Wythoff symbols for Platonic, Archimedean,
   Kepler–Poinsot, hemipolyhedral and snub solids (placed in one shared
   canonical frame where `T < Td < Oh`, `T < Th < Oh`, and `T < Th < Ih`),
   explicit constructions for the small and great rhombihexahedra (`U18`,
   `U21`), and uniform `{p/q}` prisms and antiprisms.
2. `js/geometry/compound.js` takes each constituent polyhedron, orients it onto
   the required symmetry axis (or closed-form special angle for `UC14`, `UC15`,
   `UC16` and `UC19`), and takes its orbit under the compound's point group,
   deduplicating congruent copies by their exact vertex-and-face sets.
3. `js/geometry/polygon.js` and `js/geometry/mesh.js` triangulate convex,
   concave and star polygons (`{5/2}`, `{7/2}`, `{8/3}`, `{10/3}`, ...) by
   non-zero winding number and emit flat triangle, normal, component-id and
   edge buffers scaled to the unit sphere.

## Tests

```sh
npm test
```

The test suite checks every uniform constituent (equal edge lengths, every edge
shared by two faces), all 75 compounds (`UC1`–`UC75`) against Skilling's
constituent, vertex, multiplicity, edge, face and symmetry counts, exact
symmetry-group preservation and vertex transitivity, chirality and enantiomorph
mirroring, continuous rotational freedom, prismatic parameter variations, mesh
buffer invariants, and gallery filtering.

## Project layout

```
index.html, viewer.html    Gallery and viewer pages
css/styles.css
js/catalog.js              The 75 entries (UC1-UC75) and prismatic presets
js/registry.js             Lazy compound cache, descriptions, filter helpers
js/geometry/               Vectors, star polygon triangulation, Wythoff &
                           prismatic builders, UC1-UC75 orbits, mesh buffers
                           (no three.js dependency, runs in Node)
js/render.js               Shared three.js setup
js/index.js, js/viewer.js  Page scripts
scripts/serve.mjs          Local static server
vendor/three/              three.js 0.160.0 (unchanged copy from npm)
vendor/fonts/outfit/       Outfit variable font (unchanged copy from npm)
test/                      Geometry and catalog tests
```

## Tech

three.js 0.160.0 and the Outfit font (SIL OFL 1.1) are vendored; see the README
in each `vendor/` folder for source and hash. Vanilla ES modules, no build
step, no third-party requests.

## References

- J. Skilling, *Uniform Compounds of Uniform Polyhedra*, Mathematical
  Proceedings of the Cambridge Philosophical Society 79 (1976), 447–457
- Wikipedia: [Uniform polyhedron compound](https://en.wikipedia.org/wiki/Uniform_polyhedron_compound)
- H. S. M. Coxeter, M. S. Longuet-Higgins, J. C. P. Miller, *Uniform
  Polyhedra*, Philosophical Transactions of the Royal Society A 246 (1954)
