import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { spatialRobotPose } from "../core/visualization/spatialScene.js";
import { widowXStageTarget } from "../core/robot/widowxKinematics.js";
import {
  WIDOWX_SOURCE_MODEL,
  widowXMeshAssetUrl,
} from "../core/robot/widowxSourceModel.js";

const MM_PER_PIXEL = 5;
const METRES_PER_PIXEL = MM_PER_PIXEL / 1000;
const FIXTURE_HEIGHT_M = Object.freeze({ bench: 0.22, pallet: 0.14, rack: 0.63, divider: 0.41 });
const FIXTURE_COLOR = Object.freeze({ bench: 0xf2c64f, pallet: 0xe77d5a, rack: 0x7da9ba, divider: 0xc7cbc4 });
const SOURCE_MESH_COUNT = Object.keys(WIDOWX_SOURCE_MODEL.meshes).length;

const URDF_TO_THREE = new THREE.Matrix4().set(
  1, 0, 0, 0,
  0, 0, 1, 0,
  0, -1, 0, 0,
  0, 0, 0, 1
);
const THREE_TO_URDF = URDF_TO_THREE.clone().invert();

function setUrdfTransform(object, transform = {}) {
  const [x, y, z] = transform.xyz || [0, 0, 0];
  const [roll, pitch, yaw] = transform.rpy || [0, 0, 0];
  const urdf = new THREE.Matrix4()
    .makeTranslation(x, y, z)
    .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(roll, pitch, yaw, "XYZ")));
  const mapped = URDF_TO_THREE.clone().multiply(urdf).multiply(THREE_TO_URDF);
  mapped.decompose(object.position, object.quaternion, object.scale);
}

function jointOrigin(parent, definition) {
  const origin = new THREE.Group();
  setUrdfTransform(origin, definition.origin);
  parent.add(origin);
  const motion = new THREE.Group();
  origin.add(motion);
  return motion;
}

function lineFromPoints(points, material) {
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    material
  );
}

function stagePoint(point, heightM = 0) {
  return new THREE.Vector3(point.x * METRES_PER_PIXEL, heightM, point.y * METRES_PER_PIXEL);
}

function routeFingerprint(path = []) {
  return path.map((point) => `${Number(point.x).toFixed(2)}:${Number(point.y).toFixed(2)}`).join("|");
}

function disposeObject(root) {
  root.traverse((object) => {
    object.geometry?.dispose?.();
    if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
    else object.material?.dispose?.();
  });
}

export class WidowXThreeStage {
  constructor(canvas) {
    if (!(canvas instanceof HTMLCanvasElement)) throw new TypeError("A canvas is required for the WidowX stage.");
    this.canvas = canvas;
    this.contextLost = false;
    this.ready = false;
    this.destroyed = false;
    this.lastInput = null;
    this.lastRouteFingerprint = "";
    this.meshesLoaded = 0;
    this.resizeObserver = null;
    this.boundRender = () => this.render();
    this.boundKeyDown = (event) => this.handleKeyDown(event);
    this.boundContextLost = (event) => this.handleContextLost(event);
    this.boundContextRestored = () => this.handleContextRestored();

    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    } catch (error) {
      this.emit("error", { message: error instanceof Error ? error.message : "WebGL could not start." });
      throw error;
    }
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor(0x13231d, 1);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x13231d, 4.5, 8.5);
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.025, 18);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = false;
    this.controls.enablePan = false;
    this.controls.minDistance = 0.7;
    this.controls.maxDistance = 4.4;
    this.controls.minPolarAngle = 0.28;
    this.controls.maxPolarAngle = Math.PI / 2.04;
    this.controls.addEventListener("change", this.boundRender);
    this.resetCamera();

    this.scene.add(new THREE.HemisphereLight(0xe7f5ee, 0x203229, 2.15));
    const key = new THREE.DirectionalLight(0xfff2ce, 4.1);
    key.position.set(1.4, 3.4, 1.8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -2.2;
    key.shadow.camera.right = 2.2;
    key.shadow.camera.top = 2.2;
    key.shadow.camera.bottom = -2.2;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x79dcb6, 2.4);
    rim.position.set(-2.4, 1.8, -1.7);
    this.scene.add(rim);

    this.environment = new THREE.Group();
    this.scene.add(this.environment);
    this.routeGroup = new THREE.Group();
    this.scene.add(this.routeGroup);
    this.targetGroup = this.createTargetMarker();
    this.scene.add(this.targetGroup);
    this.partGroup = this.createPart();
    this.scene.add(this.partGroup);
    this.arm = this.createArmSkeleton();
    this.scene.add(this.arm.root);
    this.createMeasurementMast();

    canvas.addEventListener("keydown", this.boundKeyDown);
    canvas.addEventListener("webglcontextlost", this.boundContextLost);
    canvas.addEventListener("webglcontextrestored", this.boundContextRestored);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.emit("loading", { loaded: 0, total: SOURCE_MESH_COUNT });
    this.loadSourceMeshes();
  }

  emit(status, extra = {}) {
    this.canvas.dispatchEvent(new CustomEvent("widowxstagechange", {
      bubbles: true,
      detail: { status, loaded: this.meshesLoaded, total: SOURCE_MESH_COUNT, ...extra },
    }));
  }

  createArmSkeleton() {
    const root = new THREE.Group();
    root.name = "widowx-source-model";
    const meshAnchors = {};
    const meshAnchor = (name, parent, definitionName = name) => {
      const anchor = new THREE.Group();
      anchor.name = `mesh:${name}`;
      setUrdfTransform(anchor, WIDOWX_SOURCE_MODEL.meshes[definitionName].origin);
      parent.add(anchor);
      meshAnchors[name] = anchor;
      return anchor;
    };

    meshAnchor("base", root);
    const waist = jointOrigin(root, WIDOWX_SOURCE_MODEL.joints.waist);
    meshAnchor("shoulder", waist);
    const shoulder = jointOrigin(waist, WIDOWX_SOURCE_MODEL.joints.shoulder);
    meshAnchor("upperArm", shoulder);
    const elbow = jointOrigin(shoulder, WIDOWX_SOURCE_MODEL.joints.elbow);
    meshAnchor("upperForearm", elbow);
    const forearmRoll = jointOrigin(elbow, WIDOWX_SOURCE_MODEL.joints.forearmRoll);
    meshAnchor("lowerForearm", forearmRoll);
    const wristAngle = jointOrigin(forearmRoll, WIDOWX_SOURCE_MODEL.joints.wristAngle);
    meshAnchor("wrist", wristAngle);
    const wristRotate = jointOrigin(wristAngle, WIDOWX_SOURCE_MODEL.joints.wristRotate);
    meshAnchor("gripper", wristRotate);
    const eeArm = jointOrigin(wristRotate, WIDOWX_SOURCE_MODEL.joints.eeArm);
    const gripperActuator = jointOrigin(eeArm, WIDOWX_SOURCE_MODEL.joints.gripper);
    meshAnchor("gripperProp", gripperActuator);
    const gripperBar = jointOrigin(eeArm, WIDOWX_SOURCE_MODEL.joints.gripperBar);
    meshAnchor("gripperBar", gripperBar);
    const fingers = jointOrigin(gripperBar, WIDOWX_SOURCE_MODEL.joints.fingers);
    const leftFinger = jointOrigin(fingers, WIDOWX_SOURCE_MODEL.joints.leftFinger);
    const rightFinger = jointOrigin(fingers, WIDOWX_SOURCE_MODEL.joints.rightFinger);
    const leftAnchor = meshAnchor("leftFinger", leftFinger, "finger");
    setUrdfTransform(leftAnchor, { xyz: [0, 0.005, 0], rpy: [Math.PI, Math.PI, 0] });
    const rightAnchor = meshAnchor("rightFinger", rightFinger, "finger");
    setUrdfTransform(rightAnchor, { xyz: [0, -0.005, 0], rpy: [0, Math.PI, 0] });

    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xffc94a, depthTest: false });
    const markerGeometry = new THREE.SphereGeometry(0.011, 14, 10);
    const markers = [waist, shoulder, elbow, forearmRoll, wristAngle, wristRotate].map((joint) => {
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.renderOrder = 8;
      joint.add(marker);
      return marker;
    });

    return {
      root,
      meshAnchors,
      waist,
      shoulder,
      elbow,
      forearmRoll,
      wristAngle,
      wristRotate,
      leftFinger,
      rightFinger,
      markers,
    };
  }

  async loadSourceMeshes() {
    const loader = new STLLoader();
    const material = new THREE.MeshStandardMaterial({ color: 0x252a29, roughness: 0.56, metalness: 0.32 });
    const entries = Object.entries(WIDOWX_SOURCE_MODEL.meshes);
    try {
      const geometries = await Promise.all(entries.map(async ([name, definition]) => {
        const geometry = await loader.loadAsync(widowXMeshAssetUrl(definition.assetFile));
        geometry.applyMatrix4(URDF_TO_THREE);
        geometry.computeBoundingSphere();
        this.meshesLoaded += 1;
        this.emit("loading", { loaded: this.meshesLoaded, total: SOURCE_MESH_COUNT });
        return [name, geometry];
      }));
      if (this.destroyed) {
        geometries.forEach(([, geometry]) => geometry.dispose());
        material.dispose();
        return;
      }
      geometries.forEach(([name, geometry]) => {
        const targets = name === "finger"
          ? [this.arm.meshAnchors.leftFinger, this.arm.meshAnchors.rightFinger]
          : [this.arm.meshAnchors[name]];
        targets.filter(Boolean).forEach((anchor) => {
          const sourceMesh = new THREE.Mesh(geometry, material);
          sourceMesh.name = WIDOWX_SOURCE_MODEL.meshes[name].id;
          sourceMesh.scale.setScalar(WIDOWX_SOURCE_MODEL.renderer.meshScale);
          sourceMesh.castShadow = true;
          sourceMesh.receiveShadow = true;
          anchor.add(sourceMesh);
        });
      });
      this.ready = true;
      this.emit("ready", { loaded: this.meshesLoaded, total: SOURCE_MESH_COUNT });
      if (this.lastInput) this.update(this.lastInput);
      else this.render();
    } catch (error) {
      material.dispose();
      this.emit("error", { message: error instanceof Error ? error.message : "The source meshes could not be loaded." });
    }
  }

  createEnvironment({ arena, fixtures }) {
    this.environment.clear();
    const widthM = arena.width * METRES_PER_PIXEL;
    const depthM = arena.height * METRES_PER_PIXEL;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(widthM, depthM),
      new THREE.MeshStandardMaterial({ color: 0xdce5d8, roughness: 0.92, metalness: 0 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(widthM / 2, -0.006, depthM / 2);
    floor.receiveShadow = true;
    this.environment.add(floor);
    const grid = new THREE.GridHelper(Math.max(widthM, depthM), 20, 0x6f887c, 0x9caea5);
    grid.position.set(widthM / 2, 0, depthM / 2);
    grid.material.transparent = true;
    grid.material.opacity = 0.27;
    this.environment.add(grid);

    fixtures.forEach((fixture) => {
      const heightM = FIXTURE_HEIGHT_M[fixture.id] || 0.2;
      const width = fixture.width * METRES_PER_PIXEL;
      const depth = fixture.height * METRES_PER_PIXEL;
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(width, heightM, depth),
        new THREE.MeshStandardMaterial({
          color: FIXTURE_COLOR[fixture.id] || 0xb7bdb8,
          roughness: 0.78,
          metalness: fixture.id === "rack" ? 0.12 : 0,
        })
      );
      box.position.set(
        (fixture.x + fixture.width / 2) * METRES_PER_PIXEL,
        heightM / 2,
        (fixture.y + fixture.height / 2) * METRES_PER_PIXEL
      );
      box.castShadow = true;
      box.receiveShadow = true;
      this.environment.add(box);
    });
  }

  createMeasurementMast() {
    const group = new THREE.Group();
    group.name = "one-metre-reference";
    const material = new THREE.MeshBasicMaterial({ color: 0xf0c54a, transparent: true, opacity: 0.92 });
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.012, 1, 0.012), material);
    stem.position.y = 0.5;
    group.add(stem);
    for (let index = 0; index <= 4; index += 1) {
      const tick = new THREE.Mesh(new THREE.BoxGeometry(index % 2 === 0 ? 0.12 : 0.07, 0.009, 0.012), material);
      tick.position.y = index * 0.25;
      group.add(tick);
    }
    group.position.set(1.32, 0, 1.76);
    this.scene.add(group);
  }

  createTargetMarker() {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.115, 0.009, 8, 48),
      new THREE.MeshBasicMaterial({ color: 0xff8a5f })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.014;
    group.add(ring);
    const crossMaterial = new THREE.LineBasicMaterial({ color: 0xffc6a8 });
    group.add(lineFromPoints([new THREE.Vector3(-0.075, 0.018, 0), new THREE.Vector3(0.075, 0.018, 0)], crossMaterial));
    group.add(lineFromPoints([new THREE.Vector3(0, 0.018, -0.075), new THREE.Vector3(0, 0.018, 0.075)], crossMaterial));
    group.userData.ring = ring;
    return group;
  }

  createPart() {
    const group = new THREE.Group();
    const part = new THREE.Mesh(
      new THREE.BoxGeometry(0.095, 0.065, 0.075),
      new THREE.MeshStandardMaterial({ color: 0xf7ca49, roughness: 0.58 })
    );
    part.castShadow = true;
    group.add(part);
    return group;
  }

  updateRoute(path = [], valid = true) {
    const fingerprint = `${valid}:${routeFingerprint(path)}`;
    if (fingerprint === this.lastRouteFingerprint) return;
    disposeObject(this.routeGroup);
    this.routeGroup.clear();
    this.lastRouteFingerprint = fingerprint;
    if (path.length < 2) return;
    const material = new THREE.LineDashedMaterial({
      color: valid ? 0xff8a5f : 0xe95d50,
      dashSize: 0.08,
      gapSize: 0.055,
      transparent: true,
      opacity: 0.92,
    });
    const line = lineFromPoints(path.map((point) => stagePoint(point, 0.026)), material);
    line.computeLineDistances();
    this.routeGroup.add(line);
  }

  update(input) {
    this.lastInput = input;
    if (this.destroyed || this.contextLost) return;
    if (this.environment.children.length === 0) this.createEnvironment(input);
    const definition = input.definition || null;
    const pose = spatialRobotPose({
      platform: "arm",
      plan: input.plan,
      definition,
      progress: input.progress,
    });
    const fingerOpeningM = pose.carrying
      ? WIDOWX_SOURCE_MODEL.renderer.closedFingerM
      : WIDOWX_SOURCE_MODEL.renderer.openFingerM;
    const solution = widowXStageTarget({
      point: pose,
      base: pose.base,
      heightUnits: pose.z,
      mmPerPixel: MM_PER_PIXEL,
      wristRotateRad: Math.sin(input.progress * Math.PI * 2) * 0.08,
      fingerOpeningM,
    });
    const base = stagePoint(pose.base);
    this.arm.root.position.copy(base);
    this.arm.waist.rotation.y = solution.pose.waist;
    this.arm.shoulder.rotation.z = -solution.pose.shoulder;
    this.arm.elbow.rotation.z = -solution.pose.elbow;
    this.arm.forearmRoll.rotation.x = solution.pose.forearmRoll;
    this.arm.wristAngle.rotation.z = -solution.pose.wristAngle;
    this.arm.wristRotate.rotation.x = solution.pose.wristRotate;
    this.arm.leftFinger.position.z = -solution.pose.fingerOpeningM;
    this.arm.rightFinger.position.z = solution.pose.fingerOpeningM;
    this.arm.markers.forEach((marker) => { marker.visible = Boolean(input.engineerView); });

    this.updateRoute(input.plan?.path || [], input.plan?.valid !== false);
    this.targetGroup.position.copy(stagePoint(input.target));
    const statusColor = input.plan?.valid === false ? 0xe95d50 : input.plan?.status === "unknown" ? 0x78b4d1 : 0x66d3a7;
    this.targetGroup.userData.ring.material.color.setHex(statusColor);

    const tool = solution.reachable
      ? new THREE.Vector3(
          base.x + solution.target.xM,
          solution.target.zM,
          base.z - solution.target.yM
        )
      : stagePoint(definition?.stage?.pickup || input.target, 0.26);
    if (pose.carrying) {
      this.partGroup.position.copy(tool).add(new THREE.Vector3(0, -0.055, 0));
    } else if (input.progress >= 0.96) {
      this.partGroup.position.copy(stagePoint(input.target, 0.045));
    } else {
      this.partGroup.position.copy(stagePoint(definition?.stage?.pickup || input.target, 0.255));
    }
    this.partGroup.visible = definition?.id === "bring-part-home";
    this.canvas.setAttribute(
      "aria-label",
      `Interactive source-mesh WidowX 250S view. Six source joints are posed to a ${Math.round(solution.distanceM * 1000)} millimetre target. ${solution.reachable ? "The position-only source-joint solve reaches this pose." : "The source-joint solve cannot reach this pose."} Contact, payload, collision and control are not modeled.`
    );
    this.emit("pose", {
      reachable: solution.reachable,
      distanceMm: Math.round(solution.distanceM * 1000),
      residualMm: Number((solution.residualM * 1000).toFixed(1)),
      jointDegrees: Object.fromEntries(
        ["waist", "shoulder", "elbow", "forearmRoll", "wristAngle", "wristRotate"]
          .map((name) => [name, Number((solution.pose[name] * 180 / Math.PI).toFixed(1))])
      ),
    });
    this.render();
  }

  resetCamera() {
    this.controls?.target.set(1.69, 0.25, 1.43);
    this.camera.position.set(3.05, 1.42, 2.95);
    this.camera.lookAt(1.69, 0.25, 1.43);
    this.controls?.update();
    this.render();
  }

  handleKeyDown(event) {
    const orbit = event.key === "ArrowLeft" ? 0.14 : event.key === "ArrowRight" ? -0.14 : 0;
    const elevation = event.key === "ArrowUp" ? 0.12 : event.key === "ArrowDown" ? -0.12 : 0;
    const zoom = event.key === "+" || event.key === "=" ? 0.88 : event.key === "-" ? 1.12 : 1;
    if (!orbit && !elevation && zoom === 1) return;
    event.preventDefault();
    const offset = this.camera.position.clone().sub(this.controls.target);
    if (orbit) offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), orbit);
    offset.y = Math.max(0.28, offset.y + elevation);
    offset.multiplyScalar(zoom);
    this.camera.position.copy(this.controls.target).add(offset);
    this.camera.lookAt(this.controls.target);
    this.controls.update();
    this.render();
  }

  handleContextLost(event) {
    event.preventDefault();
    this.contextLost = true;
    this.emit("error", { message: "The 3D graphics context was lost. The 2D test remains available." });
  }

  handleContextRestored() {
    this.contextLost = false;
    this.emit("ready", { restored: true });
    this.render();
  }

  resize() {
    if (this.destroyed || !this.canvas.clientWidth || !this.canvas.clientHeight) return;
    const width = Math.max(1, Math.floor(this.canvas.clientWidth));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight));
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.render();
  }

  render() {
    if (this.destroyed || this.contextLost || !this.renderer) return;
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    this.controls?.removeEventListener("change", this.boundRender);
    this.controls?.dispose();
    this.canvas.removeEventListener("keydown", this.boundKeyDown);
    this.canvas.removeEventListener("webglcontextlost", this.boundContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.boundContextRestored);
    disposeObject(this.scene);
    this.renderer?.dispose();
  }
}

export function createWidowXThreeStage(canvas) {
  return new WidowXThreeStage(canvas);
}
