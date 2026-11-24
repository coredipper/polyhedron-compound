// Interactive viewer for one uniform polyhedron compound (viewer.html?shape=uc<n>).

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  FAMILIES, compounds, describe, formatSymmetry, getCompound, prismBasesFor, thetaSpec,
} from './registry.js';
import {
  addLights, createCompoundObject, createEdgeMaterial, createFaceMaterial,
  createRenderer, onReducedMotionChange, prefersReducedMotion,
} from './render.js';

const DEG = Math.PI / 180;
const $ = (id) => document.getElementById(id);
const shapeIdFromUrl = () => new URLSearchParams(window.location.search).get('shape');
const indexForId = (id) => compounds.findIndex((c) => c.id === id);

const mobileQuery = window.matchMedia('(max-width: 600px)');
const syncDetailsOpen = () => {
  $('shape-details').open = !mobileQuery.matches;
};
syncDetailsOpen();
mobileQuery.addEventListener('change', syncDetailsOpen);

const initialId = shapeIdFromUrl();
const initialIndex = indexForId(initialId);

if (initialIndex < 0) {
  document.title = `${initialId ? 'Compound not found' : 'No compound specified'} · Uniform Polyhedron Compounds`;
  $('shape-name').textContent = initialId ? 'Compound not found' : 'No compound specified';
  $('shape-description').textContent = initialId
    ? `There is no uniform compound with the id "${initialId}".`
    : 'Open a compound from the gallery.';
  $('viewer-panel').hidden = true;
} else {
  try {
    initViewer(initialIndex);
  } catch (error) {
    console.error(error);
    $('shape-name').textContent = 'Could not build this compound';
    $('shape-description').textContent = error instanceof Error ? error.message : String(error);
    $('viewer-panel').hidden = true;
  }
}

function showInfo(entry, geometry, { mirror = false } = {}) {
  document.title = `${entry.title} · Uniform Polyhedron Compounds`;
  $('back-link').href = `index.html#${encodeURIComponent(entry.id)}`;
  $('shape-family').textContent = `${FAMILIES[entry.family].short} · ${entry.code} of 75`;
  $('shape-name').textContent = entry.name;
  $('shape-description').textContent = describe(entry, geometry);

  const list = $('shape-facts');
  list.replaceChildren();
  const add = (term, value) => {
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    dd.textContent = String(value);
    list.append(dt, dd);
  };

  const { counts } = geometry;
  if (entry.prismatic) {
    const { p, q } = geometry.params;
    const poly = q === 1 ? `{${p}}` : `{${p}/${q}}`;
    const kind = entry.prismatic.kind === 'prism' ? 'prisms' : 'antiprisms';
    add('Constituents', `${counts.components} ${poly} ${kind}`);
  } else {
    const label = counts.components === 1 ? entry.constituent : entry.constituents;
    add('Constituents', `${counts.components} ${label}`);
  }

  add(
    'Vertices',
    counts.multiplicity > 1
      ? `${counts.distinctVertices} (${counts.multiplicity} per vertex)`
      : counts.distinctVertices,
  );
  add('Edges', counts.edges);
  add('Faces', counts.faces);

  const symName = formatSymmetry(geometry.symmetry);
  const symDetail = entry.chiral
    ? `${symName} (chiral${mirror ? ', mirrored' : ''})`
    : `${symName} (reflexible)`;
  add('Symmetry', `${symDetail} · subgroup ${entry.subgroup}`);

  if (entry.note) add('Note', entry.note);
}

function updateNavigation(index) {
  const neighbour = (step) => compounds[(index + step + compounds.length) % compounds.length];
  const link = (element, entry, label) => {
    element.href = `viewer.html?shape=${encodeURIComponent(entry.id)}`;
    element.title = `${label}: ${entry.title}`;
    element.setAttribute('aria-label', `${label}: ${entry.title}`);
  };
  link($('prev-link'), neighbour(-1), 'Previous');
  link($('next-link'), neighbour(1), 'Next');
  $('position').textContent = `${index + 1} / ${compounds.length}`;
}

function initViewer(startIndex) {
  let currentIndex = startIndex;
  let edgesVisible = true;
  let coloured = true;
  let mirror = false;
  let thetaDeg = null;
  let prismParams = null;

  const setPressed = (button, on) => button.setAttribute('aria-pressed', String(on));

  const container = $('canvas-container');
  const renderer = createRenderer();
  if (!renderer) {
    const initial = getCompound(compounds[currentIndex].id);
    showInfo(initial, initial.geometry);
    updateNavigation(currentIndex);
    container.textContent = 'This viewer needs WebGL, which is not available in this browser.';
    container.classList.add('webgl-error');
    return;
  }

  const width = Math.max(window.innerWidth, 1);
  const height = Math.max(window.innerHeight, 1);
  renderer.setSize(width, height);
  renderer.domElement.setAttribute('role', 'img');
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  addLights(scene);
  const faceMaterial = createFaceMaterial({ vertexColors: true });
  const edgeMaterial = createEdgeMaterial(0.35);

  const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
  const fitDistance = () => {
    const vertical = THREE.MathUtils.degToRad(camera.fov / 2);
    const horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
    const halfFov = Math.min(vertical, horizontal);
    return (1.41 * 1.5) / Math.sin(halfFov);
  };
  camera.position.set(0, 0, Math.min(25, Math.max(2, fitDistance())));

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.enablePan = false;
  controls.minDistance = 2;
  controls.maxDistance = 25;
  controls.autoRotate = !prefersReducedMotion();
  controls.autoRotateSpeed = 1.2;

  const paramControlsEl = $('param-controls');
  const thetaControlEl = $('theta-control');
  const thetaSlider = $('theta-slider');
  const thetaValueEl = $('theta-value');
  const prismControlsEl = $('prism-controls');
  const prismBaseSelect = $('prism-base');
  const prismNSelect = $('prism-n');
  const mirrorButton = $('toggle-mirror');

  let currentObject = null;

  const syncThetaSlider = (entry, resetValue) => {
    const spec = thetaSpec(entry, prismParams ?? {});
    if (!spec) {
      thetaControlEl.hidden = true;
      thetaDeg = null;
      return;
    }
    thetaControlEl.hidden = false;
    thetaSlider.min = '0';
    thetaSlider.max = spec.maxDeg.toFixed(2);
    thetaSlider.step = spec.maxDeg <= 20 ? '0.1' : '0.5';
    if (resetValue || thetaDeg === null || thetaDeg > spec.maxDeg) {
      thetaDeg = spec.defaultDeg;
    }
    thetaSlider.value = String(thetaDeg);
    thetaValueEl.textContent = `${thetaDeg.toFixed(1)}°`;
  };

  const syncPrismSelectors = (entry) => {
    if (!entry.prismatic) {
      prismControlsEl.hidden = true;
      prismParams = null;
      return;
    }
    prismControlsEl.hidden = false;
    prismParams = {
      n: entry.prismatic.defaultN,
      p: entry.prismatic.defaultP,
      q: entry.prismatic.defaultQ,
    };

    const bases = prismBasesFor(entry);
    prismBaseSelect.replaceChildren();
    for (const base of bases) {
      const opt = document.createElement('option');
      opt.value = `${base.p}/${base.q}`;
      opt.textContent = base.label;
      prismBaseSelect.appendChild(opt);
    }
    prismBaseSelect.value = `${prismParams.p}/${prismParams.q}`;

    prismNSelect.replaceChildren();
    for (let n = entry.prismatic.minN; n <= entry.prismatic.maxN; n++) {
      const opt = document.createElement('option');
      opt.value = String(n);
      opt.textContent = String(n);
      prismNSelect.appendChild(opt);
    }
    prismNSelect.value = String(prismParams.n);
  };

  const rebuildMesh = (entry) => {
    const buildOptions = { mirror: entry.chiral && mirror };
    if (thetaDeg !== null) buildOptions.theta = thetaDeg * DEG;
    if (prismParams) {
      buildOptions.n = prismParams.n;
      buildOptions.p = prismParams.p;
      buildOptions.q = prismParams.q;
    }

    const built = getCompound(entry.id, buildOptions);
    const nextObject = createCompoundObject(built.geometry, {
      radius: 1.5,
      colourable: true,
      coloured,
      faceMaterial,
      edgeMaterial,
    });
    if (currentObject) {
      nextObject.rotation.copy(currentObject.rotation);
      scene.remove(currentObject);
      currentObject.userData.dispose();
    } else {
      nextObject.rotation.set(0.35, 0.6, 0);
    }
    nextObject.userData.edges.visible = edgesVisible;
    scene.add(nextObject);
    currentObject = nextObject;

    showInfo(entry, built.geometry, { mirror: entry.chiral && mirror });
    renderer.domElement.setAttribute('aria-label', `3D model of ${entry.title}`);
    requestRender();
  };

  const loadCompound = (index, { push = false } = {}) => {
    currentIndex = (index + compounds.length) % compounds.length;
    const entry = compounds[currentIndex];
    mirror = false;

    syncPrismSelectors(entry);
    syncThetaSlider(entry, true);
    paramControlsEl.hidden = !entry.rotationalFreedom && !entry.prismatic;

    mirrorButton.hidden = !entry.chiral;
    setPressed(mirrorButton, mirror);

    updateNavigation(currentIndex);
    rebuildMesh(entry);

    if (push) {
      const url = `viewer.html?shape=${encodeURIComponent(entry.id)}`;
      window.history.pushState({ shape: entry.id }, '', url);
    }
  };

  // On-demand render loop: runs continuously only while auto-rotating,
  // dragging, or settling OrbitControls damping, then goes idle.
  let rafId = 0;
  let interacting = false;
  let updating = false;
  let contextLost = false;
  const prevPosition = new THREE.Vector3();
  const prevTarget = new THREE.Vector3();

  const requestRender = () => {
    if (!rafId && !contextLost && !updating) {
      rafId = window.requestAnimationFrame(frame);
    }
  };

  const frame = () => {
    rafId = 0;
    if (contextLost) return;
    prevPosition.copy(camera.position);
    prevTarget.copy(controls.target);
    updating = true;
    controls.update();
    updating = false;
    renderer.render(scene, camera);

    const moved =
      prevPosition.distanceToSquared(camera.position) > 1e-10 ||
      prevTarget.distanceToSquared(controls.target) > 1e-10;
    if (controls.autoRotate || interacting || moved) {
      requestRender();
    }
  };

  controls.addEventListener('start', () => {
    interacting = true;
    requestRender();
  });
  controls.addEventListener('end', () => {
    interacting = false;
    requestRender();
  });
  controls.addEventListener('change', requestRender);

  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    contextLost = true;
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    requestRender();
  });

  const rotateButton = $('toggle-rotate');
  setPressed(rotateButton, controls.autoRotate);
  rotateButton.addEventListener('click', () => {
    controls.autoRotate = !controls.autoRotate;
    setPressed(rotateButton, controls.autoRotate);
    requestRender();
  });
  onReducedMotionChange((reduced) => {
    if (reduced && controls.autoRotate) {
      controls.autoRotate = false;
      setPressed(rotateButton, false);
    }
  });

  const edgesButton = $('toggle-edges');
  setPressed(edgesButton, edgesVisible);
  edgesButton.addEventListener('click', () => {
    edgesVisible = !edgesVisible;
    currentObject.userData.edges.visible = edgesVisible;
    setPressed(edgesButton, edgesVisible);
    requestRender();
  });

  const coloursButton = $('toggle-colours');
  setPressed(coloursButton, coloured);
  coloursButton.addEventListener('click', () => {
    coloured = !coloured;
    currentObject.userData.setColoured(coloured);
    setPressed(coloursButton, coloured);
    requestRender();
  });

  mirrorButton.addEventListener('click', () => {
    mirror = !mirror;
    setPressed(mirrorButton, mirror);
    rebuildMesh(compounds[currentIndex]);
  });

  thetaSlider.addEventListener('input', () => {
    thetaDeg = Number(thetaSlider.value);
    thetaValueEl.textContent = `${thetaDeg.toFixed(1)}°`;
    rebuildMesh(compounds[currentIndex]);
  });

  const handlePrismChange = () => {
    const entry = compounds[currentIndex];
    const [p, q] = prismBaseSelect.value.split('/').map(Number);
    prismParams = { n: Number(prismNSelect.value), p, q };
    if (entry.rotationalFreedom) syncThetaSlider(entry, true);
    rebuildMesh(entry);
  };
  prismBaseSelect.addEventListener('change', handlePrismChange);
  prismNSelect.addEventListener('change', handlePrismChange);

  const handleStepClick = (step) => (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    loadCompound(currentIndex + step, { push: true });
  };
  $('prev-link').addEventListener('click', handleStepClick(-1));
  $('next-link').addEventListener('click', handleStepClick(1));

  // Arrow keys browse unless focus is inside a slider or select control.
  window.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const tag = event.target?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || event.target?.isContentEditable) return;
    if (event.key === 'ArrowLeft') loadCompound(currentIndex - 1, { push: true });
    else if (event.key === 'ArrowRight') loadCompound(currentIndex + 1, { push: true });
  });

  window.addEventListener('popstate', () => {
    const nextIndex = indexForId(shapeIdFromUrl());
    if (nextIndex >= 0 && nextIndex !== currentIndex) loadCompound(nextIndex);
  });

  const offset = new THREE.Vector3();
  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w === 0 || h === 0) return;
    const before = fitDistance();
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const after = fitDistance();
    offset.copy(camera.position).sub(controls.target);
    const nextDist = THREE.MathUtils.clamp(offset.length() * (after / before), controls.minDistance, controls.maxDistance);
    offset.setLength(nextDist);
    camera.position.copy(controls.target).add(offset);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    requestRender();
  });

  loadCompound(startIndex);
}
