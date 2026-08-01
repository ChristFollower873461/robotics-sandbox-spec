import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import URDFLoader from "urdf-loader";
import { spatialRobotPose } from "../core/visualization/spatialScene.js";
import { robotMotionCues } from "../core/robot/visualPose.js";
import { widowXStageTarget } from "../core/robot/widowxKinematics.js";
import {
  WIDOWX_SOURCE_MODEL,
  widowXMeshAssetUrl,
} from "../core/robot/widowxSourceModel.js";
import {
  getSourceRobotModel,
  sourceRobotAssetUrl,
  sourceRobotMotionPose,
} from "../core/robot/sourceRobotModels.js";

const MM_PER_PIXEL = 5;
const METRES_PER_PIXEL = MM_PER_PIXEL / 1000;
const FIXTURE_HEIGHT_M = Object.freeze({ bench: 0.22, pallet: 0.14, rack: 0.63, divider: 0.41 });
const FIXTURE_COLOR = Object.freeze({ bench: 0xf2c64f, pallet: 0xe77d5a, rack: 0x7da9ba, divider: 0xc7cbc4 });

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

export class SourceRobotThreeStage {
  constructor(canvas, profileId) {
    if (!(canvas instanceof HTMLCanvasElement)) throw new TypeError("A canvas is required for the source-robot stage.");
    this.modelDefinition = getSourceRobotModel(profileId);
    if (!this.modelDefinition) throw new RangeError(`No source-robot stage is registered for ${profileId}.`);
    this.profileId = profileId;
    this.canvas = canvas;
    this.contextLost = false;
    this.ready = false;
    this.destroyed = false;
    this.lastInput = null;
    this.lastRouteFingerprint = "";
    this.meshesLoaded = 0;
    this.assetCache = new Map();
    this.robot = null;
    this.arm = null;
    this.lastRobotFocusPoint = null;
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
    if (this.profileId === "interbotix-wx250s") {
      this.arm = this.createArmSkeleton();
      this.scene.add(this.arm.root);
    }
    this.createMeasurementMast();

    canvas.addEventListener("keydown", this.boundKeyDown);
    canvas.addEventListener("webglcontextlost", this.boundContextLost);
    canvas.addEventListener("webglcontextrestored", this.boundContextRestored);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.emit("loading", { loaded: 0 });
    this.loadSourceModel();
  }

  emit(status, extra = {}) {
    this.canvas.dispatchEvent(new CustomEvent("sourcerobotstagechange", {
      bubbles: true,
      detail: {
        status,
        profileId: this.profileId,
        label: this.modelDefinition.label,
        loaded: this.meshesLoaded,
        total: this.modelDefinition.meshCount,
        ...extra,
      },
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

  async loadSourceModel() {
    try {
      if (this.profileId === "interbotix-wx250s") await this.loadWidowXSourceMeshes();
      else if (["pupper-v3", "toddlerbot-2"].includes(this.profileId)) await this.loadUrdfSourceModel();
      else if (this.profileId === "crazyflie-2-1-plus") await this.loadCrazyflieSourceModel();
      else throw new RangeError(`Unsupported source model: ${this.profileId}`);
      if (this.destroyed) return;
      this.ready = true;
      this.emit("ready");
      if (this.lastInput) this.update(this.lastInput);
      else this.render();
    } catch (error) {
      this.emit("error", { message: error instanceof Error ? error.message : "The source meshes could not be loaded." });
    }
  }

  async loadWidowXSourceMeshes() {
    const loader = new STLLoader();
    const material = new THREE.MeshStandardMaterial({ color: 0x252a29, roughness: 0.56, metalness: 0.32 });
    const entries = Object.entries(WIDOWX_SOURCE_MODEL.meshes);
    const geometries = await Promise.all(entries.map(async ([name, definition]) => {
      const geometry = await loader.loadAsync(widowXMeshAssetUrl(definition.assetFile));
      geometry.applyMatrix4(URDF_TO_THREE);
      geometry.computeBoundingSphere();
      this.meshesLoaded += 1;
      this.emit("loading");
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
  }

  sourceMaterial(sourcePath) {
    const name = String(sourcePath).toLowerCase();
    let color = 0x262c2a;
    let metalness = 0.18;
    let roughness = 0.58;
    if (this.profileId === "pupper-v3") {
      color = name.includes("body") ? 0x212926 : 0xd6c7a9;
      metalness = name.includes("body") ? 0.3 : 0.08;
    } else if (this.profileId === "toddlerbot-2") {
      if (/(gear|rod|waist_gears)/.test(name)) color = 0x343a37;
      else if (/(gripper|finger)/.test(name)) color = 0xe58059;
      else if (/(head|torso|pelvis)/.test(name)) color = 0xeee7d7;
      else color = 0xd5cbb8;
    }
    return new THREE.MeshStandardMaterial({ color, roughness, metalness });
  }

  async loadUrdfAsset(sourcePath) {
    const assetUrl = sourceRobotAssetUrl(this.profileId, sourcePath);
    if (!this.assetCache.has(assetUrl)) {
      const promise = assetUrl.endsWith(".glb")
        ? new GLTFLoader().loadAsync(assetUrl).then(({ scene }) => scene)
        : new STLLoader().loadAsync(assetUrl).then((geometry) => new THREE.Mesh(geometry));
      this.assetCache.set(assetUrl, promise);
    }
    const sourceObject = await this.assetCache.get(assetUrl);
    const object = sourceObject.clone(true);
    const material = this.sourceMaterial(sourcePath);
    object.traverse((child) => {
      if (!child.isMesh) return;
      child.material = material;
      child.castShadow = true;
      child.receiveShadow = true;
    });
    return object;
  }

  applyUrdfPose(pose) {
    if (!this.robot?.model) return;
    Object.entries(pose || {}).forEach(([name, value]) => {
      if (this.robot.model.joints?.[name]) this.robot.model.setJointValue(name, value);
    });
    this.robot.model.updateMatrixWorld(true);
  }

  alignUrdfModelToFloor() {
    const { axisRoot } = this.robot;
    axisRoot.position.y = 0;
    axisRoot.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(axisRoot);
    if (!bounds.isEmpty() && Number.isFinite(bounds.min.y)) axisRoot.position.y = -bounds.min.y + 0.004;
    axisRoot.updateMatrixWorld(true);
  }

  async loadUrdfSourceModel() {
    const response = await fetch(this.modelDefinition.urdfUrl);
    if (!response.ok) throw new Error(`Source URDF request failed (${response.status}).`);
    const urdfText = await response.text();
    const pending = [];
    const loader = new URDFLoader();
    loader.parseCollision = false;
    loader.loadMeshCb = (sourcePath, manager, material, onComplete) => {
      const promise = this.loadUrdfAsset(sourcePath)
        .then((object) => {
          this.meshesLoaded += 1;
          this.emit("loading");
          onComplete(object);
        })
        .catch((error) => {
          onComplete(null, error);
          throw error;
        });
      pending.push(promise);
    };
    const model = loader.parse(urdfText, "");
    await Promise.all(pending);
    if (this.destroyed) {
      disposeObject(model);
      return;
    }
    const axisRoot = new THREE.Group();
    axisRoot.rotation.x = -Math.PI / 2;
    axisRoot.add(model);
    const root = new THREE.Group();
    root.rotation.order = "YXZ";
    root.add(axisRoot);
    this.scene.add(root);
    this.robot = { root, axisRoot, model };
    this.applyUrdfPose(this.modelDefinition.homePose);
    this.alignUrdfModelToFloor();
  }

  crazyflieMaterial(name) {
    const colors = {
      board: 0x2e7662,
      hardware: 0xe8dfc9,
      mount: 0x2b302e,
      motor: 0xb8b5ad,
      battery: 0x6888a7,
      prop: 0x282d2b,
    };
    return new THREE.MeshStandardMaterial({
      color: colors[name] || colors.hardware,
      roughness: name === "motor" ? 0.32 : 0.62,
      metalness: name === "motor" || name === "hardware" ? 0.42 : 0.08,
      transparent: name === "prop",
      opacity: name === "prop" ? 0.88 : 1,
    });
  }

  async loadCrazyflieGeometry(assetFile) {
    const url = `/src/assets/crazyflie-2-simulation/${assetFile}`;
    if (!this.assetCache.has(url)) this.assetCache.set(url, new STLLoader().loadAsync(url));
    return this.assetCache.get(url);
  }

  async loadCrazyflieSourceModel() {
    const root = new THREE.Group();
    root.rotation.order = "YXZ";
    const body = new THREE.Group();
    root.add(body);
    const rotors = [];
    const tasks = [
      ...this.modelDefinition.bodyAssets.map(async (definition) => {
        const geometry = await this.loadCrazyflieGeometry(definition.assetFile);
        const mapped = geometry.clone().applyMatrix4(URDF_TO_THREE);
        const mesh = new THREE.Mesh(mapped, this.crazyflieMaterial(definition.material));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        body.add(mesh);
        this.meshesLoaded += 1;
        this.emit("loading");
      }),
      ...this.modelDefinition.rotors.map(async (definition) => {
        const geometry = await this.loadCrazyflieGeometry(definition.assetFile);
        const mapped = geometry.clone().applyMatrix4(URDF_TO_THREE);
        const rotor = new THREE.Group();
        rotor.name = definition.name;
        rotor.position.set(...definition.position);
        const mesh = new THREE.Mesh(mapped, this.crazyflieMaterial("prop"));
        mesh.castShadow = true;
        rotor.add(mesh);
        root.add(rotor);
        rotors.push({ ...definition, root: rotor });
        this.meshesLoaded += 1;
        this.emit("loading");
      }),
    ];
    await Promise.all(tasks);
    if (this.destroyed) {
      disposeObject(root);
      return;
    }
    this.scene.add(root);
    this.robot = { root, body, rotors };
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
      platform: input.platform,
      plan: input.plan,
      definition,
      progress: input.progress,
    });
    this.updateRoute(input.plan?.path || [], input.plan?.valid !== false);
    this.targetGroup.position.copy(stagePoint(input.target));
    const statusColor = input.plan?.valid === false ? 0xe95d50 : input.plan?.status === "unknown" ? 0x78b4d1 : 0x66d3a7;
    this.targetGroup.userData.ring.material.color.setHex(statusColor);
    this.partGroup.visible = input.platform === "arm" && definition?.id === "bring-part-home";

    if (!this.ready) {
      this.canvas.setAttribute("aria-label", `Loading the source-backed ${this.modelDefinition.label} three-dimensional view.`);
      this.render();
      return;
    }

    if (this.profileId === "interbotix-wx250s") this.updateWidowX(input, pose, definition);
    else if (this.profileId === "crazyflie-2-1-plus") this.updateCrazyflie(input, pose);
    else this.updateUrdfRobot(input, pose);
    this.render();
  }

  updateWidowX(input, pose, definition) {
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
    this.canvas.setAttribute(
      "aria-label",
      `Interactive source-mesh WidowX 250S view. Six source joints are posed to a ${Math.round(solution.distanceM * 1000)} millimetre target. ${solution.reachable ? "The position-only source-joint solve reaches this pose." : "The source-joint solve cannot reach this pose."} Contact, payload, collision and control are not modeled.`
    );
    this.emit("pose", {
      poseText: `${Math.round(solution.distanceM * 1000)} mm target · ${Number((solution.residualM * 1000).toFixed(1))} mm solve residual`,
      reachable: solution.reachable,
      distanceMm: Math.round(solution.distanceM * 1000),
      residualMm: Number((solution.residualM * 1000).toFixed(1)),
      jointDegrees: Object.fromEntries(
        ["waist", "shoulder", "elbow", "forearmRoll", "wristAngle", "wristRotate"]
          .map((name) => [name, Number((solution.pose[name] * 180 / Math.PI).toFixed(1))])
      ),
    });
  }

  routeHeading(input, pose) {
    const next = spatialRobotPose({
      platform: input.platform,
      plan: input.plan,
      definition: input.definition || null,
      progress: Math.min(1, Number(input.progress || 0) + 0.012),
    });
    const dx = next.x - pose.x;
    const dz = next.y - pose.y;
    return Math.hypot(dx, dz) > 0.001 ? -Math.atan2(dz, dx) : this.robot.root.rotation.y;
  }

  updateUrdfRobot(input, pose) {
    const cues = robotMotionCues(input.visualAsset, input.progress);
    const jointPose = sourceRobotMotionPose(this.profileId, cues);
    this.applyUrdfPose(jointPose);
    this.robot.root.position.copy(stagePoint(pose));
    this.robot.root.rotation.y = this.routeHeading(input, pose);
    this.followRobotCamera();
    const progressPercent = Math.round(Number(input.progress || 0) * 100);
    const jointCount = Object.keys(jointPose).length;
    const poseText = `${this.modelDefinition.poseLabel} · ${progressPercent}% route`;
    this.canvas.setAttribute(
      "aria-label",
      `Interactive source-mesh ${this.modelDefinition.label} view at ${progressPercent} percent of the route. ${this.modelDefinition.boundary}`
    );
    this.emit("pose", { poseText, progressPercent, articulatedJointCount: jointCount });
  }

  updateCrazyflie(input, pose) {
    const cues = robotMotionCues(input.visualAsset, input.progress);
    this.robot.root.position.copy(stagePoint(pose, pose.z * METRES_PER_PIXEL));
    this.robot.root.rotation.y = this.routeHeading(input, pose);
    this.robot.root.rotation.z = (Number(cues.bankDegrees || 0) * Math.PI) / 180;
    this.followRobotCamera();
    const rotorRadians = (Number(cues.rotorDegrees || 0) * Math.PI) / 180;
    this.robot.rotors.forEach((rotor) => { rotor.root.rotation.y = rotorRadians * rotor.direction; });
    const altitudeMm = Math.round(pose.z * MM_PER_PIXEL);
    const poseText = `${altitudeMm} mm study height · four source rotor axes`;
    this.canvas.setAttribute(
      "aria-label",
      `Interactive official-source Crazyflie family simulation geometry at ${altitudeMm} millimetres study height. ${this.modelDefinition.boundary}`
    );
    this.emit("pose", { poseText, altitudeMm, rotorDegrees: Number(cues.rotorDegrees || 0) });
  }

  followRobotCamera(force = false) {
    if (!this.robot?.root || !this.modelDefinition.camera) return;
    const cameraConfig = this.modelDefinition.camera;
    const nextFocus = this.robot.root.position.clone();
    nextFocus.y += cameraConfig.targetHeightM;
    this.controls.minDistance = cameraConfig.minDistanceM;
    if (force || !this.lastRobotFocusPoint) {
      this.controls.target.copy(nextFocus);
      this.camera.position.copy(nextFocus).add(new THREE.Vector3(...cameraConfig.offsetM));
    } else {
      const delta = nextFocus.clone().sub(this.lastRobotFocusPoint);
      this.controls.target.add(delta);
      this.camera.position.add(delta);
    }
    this.lastRobotFocusPoint = nextFocus;
    this.camera.lookAt(this.controls.target);
    this.controls.update();
  }

  resetCamera() {
    if (this.robot?.root && this.modelDefinition.camera) {
      this.lastRobotFocusPoint = null;
      this.followRobotCamera(true);
      this.render();
      return;
    }
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

export function createSourceRobotThreeStage(canvas, profileId) {
  return new SourceRobotThreeStage(canvas, profileId);
}
