import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FACE_AXIS, STICKER_HEX, parseMove } from './cube-engine.js';

// A 2x2 has fewer, larger cubies; scale it up so it reads at a similar size.
const CUBE_SCALE = { 2: 1.22, 3: 1 };
// The engine stores 2x2 cubies on +-1 like a 3x3; the view packs them half a unit apart.
const CUBE_SPREAD = { 2: 0.5, 3: 1 };
const AXIS_INDEX = { x: 0, y: 1, z: 2 };
const STICKER_ROTATION = {
  R: [0, Math.PI / 2, 0],
  L: [0, -Math.PI / 2, 0],
  U: [-Math.PI / 2, 0, 0],
  D: [Math.PI / 2, 0, 0],
  F: [0, 0, 0],
  B: [0, Math.PI, 0],
};

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOutQuart = (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2);

function makeContactShadowTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.04, size / 2, size / 2, size * 0.5);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.28)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class CubeView {
  constructor(canvas, cube, options = {}) {
    this.canvas = canvas;
    this.cube = cube;
    this.reducedMotion = options.reducedMotion ?? false;
    this.meshes = [];
    this.autoRotate = true;
    this.userInteracting = false;
    this.animating = false;
    this.paused = false;
    this.lastFrame = performance.now();
    this.floatPhase = Math.random() * Math.PI * 2;
    this.flashStart = -1e9;
    this.celebrateUntil = 0;

    this.initRenderer();
    this.initScene();
    this.initLights();
    this.buildCube();
    this.initControls();
    this.resize();
    this.renderLoop = this.renderLoop.bind(this);
    this.renderer.setAnimationLoop(this.renderLoop);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas);
  }

  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.reducedMotion ? 1 : dpr);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.resize();
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x07080c, 0.03);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
    this.camera.position.set(4.35, 3.15, 6.35);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envTarget.texture;
    this.scene.environmentIntensity = 0.55;

    this.cubeGroup = new THREE.Group();
    this.scene.add(this.cubeGroup);

    // Floor
    const floorGeo = new THREE.CircleGeometry(26, 96);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0a0b10,
      roughness: 0.72,
      metalness: 0.24,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.02;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Faint stage rings
    const ringMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.055,
      depthWrite: false,
    });
    for (const [radius, opacity] of [[4.2, 0.06], [6.2, 0.03]]) {
      const pts = [];
      for (let i = 0; i <= 200; i++) {
        const a = (i / 200) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * radius, -2.005, Math.sin(a) * radius));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(geo, ringMat.clone());
      line.material.opacity = opacity;
      this.scene.add(line);
    }

    // Soft ambient contact shadow under the cube
    const contact = new THREE.Mesh(
      new THREE.PlaneGeometry(5.2, 5.2),
      new THREE.MeshBasicMaterial({
        map: makeContactShadowTexture(),
        transparent: true,
        depthWrite: false,
        opacity: 0.9,
      })
    );
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = -2.0;
    this.scene.add(contact);
  }

  initLights() {
    const key = new THREE.DirectionalLight(0xfff4e4, 2.8);
    key.position.set(5.2, 8.5, 5.6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -4.5;
    key.shadow.camera.right = 4.5;
    key.shadow.camera.top = 4.5;
    key.shadow.camera.bottom = -4.5;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 24;
    key.shadow.bias = -0.00025;
    key.shadow.normalBias = 0.018;
    key.shadow.radius = 3;
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x8fa6ff, 1.7);
    rim.position.set(-6, 4.5, -5);
    this.scene.add(rim);

    const warm = new THREE.PointLight(0xff9a4a, 18, 18, 2.1);
    warm.position.set(5.5, 1.2, 5.5);
    this.scene.add(warm);

    const top = new THREE.DirectionalLight(0xffffff, 0.6);
    top.position.set(0, 10, 0);
    this.scene.add(top);
  }

  buildMaterials() {
    if (this.bodyGeo) return;
    this.bodyGeo = new RoundedBoxGeometry(0.972, 0.972, 0.972, 5, 0.072);
    this.stickerGeo = new RoundedBoxGeometry(0.806, 0.806, 0.032, 4, 0.055);

    this.bodyMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x090a0d,
      roughness: 0.34,
      metalness: 0.06,
      clearcoat: 0.7,
      clearcoatRoughness: 0.34,
      envMapIntensity: 0.7,
      fog: false,
    });

    this.stickerMaterials = {};
    for (const [face, hex] of Object.entries(STICKER_HEX)) {
      const color = new THREE.Color(hex);
      this.stickerMaterials[face] = new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.31,
        metalness: 0.0,
        clearcoat: 1.0,
        clearcoatRoughness: 0.11,
        envMapIntensity: 1.05,
        emissive: color.clone().multiplyScalar(0.035),
        fog: false,
      });
    }

  }

  buildCube() {
    this.buildMaterials();
    this.clearCube();
    this.buildId = (this.buildId || 0) + 1;

    for (let i = 0; i < this.cube.cubies.length; i++) {
      const cubie = this.cube.cubies[i];
      const group = new THREE.Group();
      group.userData.index = i;
      const body = new THREE.Mesh(this.bodyGeo, this.bodyMaterial);
      body.castShadow = true;
      body.receiveShadow = false;
      group.add(body);

      for (const [face, color] of Object.entries(cubie.stickers)) {
        const sticker = new THREE.Mesh(this.stickerGeo, this.stickerMaterials[color]);
        sticker.userData.face = face;
        const normal = { U: [0, 1, 0], D: [0, -1, 0], R: [1, 0, 0], L: [-1, 0, 0], F: [0, 0, 1], B: [0, 0, -1] }[face];
        sticker.position.set(normal[0] * 0.494, normal[1] * 0.494, normal[2] * 0.494);
        sticker.rotation.set(...STICKER_ROTATION[face]);
        group.add(sticker);
      }

      const spread = this.spread();
      group.position.set(cubie.pos[0] * spread, cubie.pos[1] * spread, cubie.pos[2] * spread);
      this.cubeGroup.add(group);
      this.meshes.push(group);
    }

    this.applyScale();
  }

  clearCube() {
    for (const group of this.meshes) this.cubeGroup.remove(group);
    this.meshes = [];
  }

  applyScale() {
    const scale = CUBE_SCALE[this.cube.size] || 1;
    this.cubeGroup.scale.setScalar(scale);
  }

  spread() {
    return CUBE_SPREAD[this.cube.size] || 1;
  }

  setCube(cube) {
    this.cube = cube;
    this.buildCube();
    this.resetToState();
  }

  initControls() {
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.target.set(0, -0.05, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.065;
    this.controls.enablePan = false;
    this.controls.minDistance = 5.4;
    this.controls.maxDistance = 11.5;
    this.controls.minPolarAngle = 0.26;
    this.controls.maxPolarAngle = 1.42;
    this.controls.rotateSpeed = 0.78;
    this.controls.zoomSpeed = 0.8;
    this.controls.autoRotate = !this.reducedMotion;
    this.controls.autoRotateSpeed = 1.0;
    this.controls.addEventListener('start', () => {
      this.userInteracting = true;
    });
    this.controls.addEventListener('end', () => {
      this.userInteracting = false;
    });
    this.controls.update();
  }

  resize() {
    const clientWidth = this.canvas.clientWidth;
    const clientHeight = this.canvas.clientHeight;
    if (!clientWidth || !clientHeight) return;
    const width = Math.max(1, clientWidth);
    const height = Math.max(1, clientHeight);
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, this.reducedMotion ? 1 : 2)
    );
    this.renderer.setSize(width, height, false);
    if (!this.camera) return;

    const aspect = width / height;
    this.camera.aspect = aspect;
    const fov = aspect < 1 ? Math.min(54, 42 * Math.pow(1 / aspect, 0.42)) : 42;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();

    const halfTan = Math.tan((fov * Math.PI) / 360);
    const fitHeight = height < 520 ? 9.4 : 7.2;
    const fitWidth = aspect < 0.85 ? 5.4 : 6.3;
    const required = Math.max(fitHeight / (2 * halfTan), fitWidth / (2 * halfTan * aspect), 7.2);
    const target = this.controls ? this.controls.target : new THREE.Vector3(0, -0.05, 0);
    const offset = this.camera.position.clone().sub(target);
    const distance = offset.length() || required;

    let next = required;
    if (this.hasFramed) {
      const previous = this.fitDistance || required;
      const fitted = Math.abs(distance - previous) < 0.6;
      next = fitted ? required : distance * (required / previous);
    }
    next = Math.min(required * 1.8, Math.max(required * 0.85, next));
    offset.setLength(next);
    this.camera.position.copy(target).add(offset);

    this.fitDistance = required;
    this.hasFramed = true;
    if (this.controls) {
      this.controls.minDistance = required * 0.8;
      this.controls.maxDistance = required * 1.8;
      this.controls.update();
    }
  }

  setAutoRotate(enabled) {
    this.autoRotate = enabled;
  }

  setPaused(paused) {
    this.paused = Boolean(paused);
    if (!this.paused) this.lastFrame = performance.now();
  }

  setQuality(lowPower) {
    if (!lowPower) return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.controls.autoRotateSpeed = 0.3;
  }

  resetToState() {
    const spread = this.spread();
    for (const group of this.meshes) {
      const cubie = this.cube.cubies[group.userData.index];
      group.position.set(cubie.pos[0] * spread, cubie.pos[1] * spread, cubie.pos[2] * spread);
      group.quaternion.identity();
    }
    this.cubeGroup.position.y = 0;
  }

  syncStickers() {
    for (const group of this.meshes) {
      const cubie = this.cube.cubies[group.userData.index];
      for (const child of group.children) {
        const face = child.userData.face;
        if (face && cubie.stickers[face]) {
          child.material = this.stickerMaterials[cubie.stickers[face]];
        }
      }
    }
  }

  animateMove(move, duration = 160) {
    const { face, amount } = parseMove(move);
    const [axis, layer] = FACE_AXIS[face];
    const axisIndex = AXIS_INDEX[axis];
    const pivot = new THREE.Group();
    this.cubeGroup.add(pivot);

    const selected = [];
    for (const group of this.meshes) {
      if (this.cube.cubies[group.userData.index].pos[axisIndex] === layer) {
        pivot.attach(group);
        selected.push(group);
      }
    }

    const totalAngle = -layer * (Math.PI / 2) * amount;
    const useEase = duration > 80 ? easeInOutQuart : easeOutCubic;
    const buildId = this.buildId;
    this.animating = true;

    return new Promise((resolve) => {
      const start = performance.now();
      const tick = (now) => {
        if (buildId !== this.buildId) {
          this.animating = false;
          resolve();
          return;
        }
        const t = Math.min(1, (now - start) / duration);
        pivot.rotation[axis] = totalAngle * useEase(t);
        if (t < 1) {
          requestAnimationFrame(tick);
          return;
        }
        pivot.rotation[axis] = totalAngle;
        pivot.updateMatrixWorld(true);

        this.cube.applyMove(move);

        const spread = this.spread();
        for (const group of selected) {
          this.cubeGroup.attach(group);
          const cubie = this.cube.cubies[group.userData.index];
          group.position.set(
            cubie.pos[0] * spread,
            cubie.pos[1] * spread,
            cubie.pos[2] * spread
          );
          group.quaternion.normalize();
        }
        this.cubeGroup.remove(pivot);
        this.animating = false;
        resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  celebrate() {
    this.flashStart = performance.now();
    this.celebrateUntil = performance.now() + 1600;
  }

  renderLoop() {
    if (this.paused) return;
    const now = performance.now();
    const dt = Math.min((now - this.lastFrame) / 1000, 0.05);
    this.lastFrame = now;
    if (!this.reducedMotion) {
      this.floatPhase += dt * 0.65;
      const targetLift = Math.sin(this.floatPhase) * 0.045;
      this.cubeGroup.position.y += (targetLift - this.cubeGroup.position.y) * Math.min(1, dt * 3);
    }

    const flash = Math.max(0, 1 - (now - this.flashStart) / 1100);
    for (const material of Object.values(this.stickerMaterials)) {
      material.emissiveIntensity = 1 + flash * 4.5;
    }
    const boost = Math.max(0, (this.celebrateUntil - now) / 1600);
    this.controls.autoRotateSpeed = 1.0 + boost * 2.4;

    this.controls.autoRotate = this.autoRotate && !this.userInteracting && !this.reducedMotion;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
  }
}
