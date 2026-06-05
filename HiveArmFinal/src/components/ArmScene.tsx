import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import p1AssetUrl from "../assets/P1.obj?url";
import p2AssetUrl from "../assets/P2.obj?url";
import p3AssetUrl from "../assets/P3.obj?url";
import p4AssetUrl from "../assets/P4.obj?url";
import p5AssetUrl from "../assets/P5.obj?url";

export interface ArmState {
  base: number;
  shoulder: number;
  elbow: number;
  wrist: number;
  camera: number;
  temperature: number;
}

interface Props {
  state: ArmState;
}

export function ArmScene({ state }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const container = containerRef.current!;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
    camera.position.set(60, 45, 70);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 20, 0);

    // Lights — clean studio
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const sunPrimary = new THREE.DirectionalLight(0xffffff, 1.2);
    sunPrimary.position.set(100, 200, 100);
    sunPrimary.castShadow = true;
    scene.add(sunPrimary);
    const sunRim = new THREE.DirectionalLight(0xffc266, 0.45);
    sunRim.position.set(-100, 100, -100);
    scene.add(sunRim);

    const grid = new THREE.GridHelper(150, 50, 0xffb84d, 0x2a2d3a);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.5;
    scene.add(grid);

    // Joint hierarchy (from sender HTML alignment)
    const jBase = new THREE.Group();
    const jShoulder = new THREE.Group();
    const jElbow = new THREE.Group();
    const jWrist = new THREE.Group();
    const jCamera = new THREE.Group();

    scene.add(jBase);
    jBase.add(jShoulder);
    jShoulder.add(jElbow);
    jElbow.add(jWrist);
    jWrist.add(jCamera);

    jBase.position.set(-1, 7, -1);
    jShoulder.position.set(-0.5, 2.5, 0);
    jElbow.position.set(0.5, 10, 1);
    jWrist.position.set(0, 14, 0);
    jCamera.position.set(-0.7, -2, -1.5);

    const customMaterials: THREE.MeshStandardMaterial[] = [];

    const loader = new OBJLoader();
    const loadPart = (
      url: string,
      parent: THREE.Object3D,
      position: [number, number, number],
      rotation: [number, number, number],
    ) => {
      loader.load(url, (obj) => {
        obj.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if ((mesh as THREE.Mesh).isMesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            const mat = new THREE.MeshStandardMaterial({
              color: 0x3a3d40,
              metalness: 0.85,
              roughness: 0.2,
              emissive: new THREE.Color(0x000000),
              emissiveIntensity: 0,
            });
            mesh.material = mat;
            customMaterials.push(mat);
          }
        });
        obj.position.set(...position);
        obj.rotation.set(...rotation);
        parent.add(obj);
      });
    };

    const R: [number, number, number] = [-Math.PI / 2, 0, 0];
    loadPart(p1AssetUrl, scene,     [0, 0, 0], R);
    loadPart(p2AssetUrl, jBase,     [0, 0, 0], R);
    loadPart(p3AssetUrl, jShoulder, [0, 0, 0], R);
    loadPart(p4AssetUrl, jElbow,    [0, 0, 0], R);
    loadPart(p5AssetUrl, jCamera,   [0, 0, 0], R);

    // Slerp targets
    const tBase = new THREE.Quaternion();
    const tShoulder = new THREE.Quaternion();
    const tElbow = new THREE.Quaternion();
    const tWrist = new THREE.Quaternion();
    const tCamera = new THREE.Quaternion();
    const RAD = Math.PI / 180;
    const SPEED = 0.12;

    let frameId = 0;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const s = stateRef.current;
      tBase.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.base * RAD);
      tShoulder.setFromAxisAngle(new THREE.Vector3(1, 0, 0), s.shoulder * RAD);
      tElbow.setFromAxisAngle(new THREE.Vector3(1, 0, 0), s.elbow * RAD);
      tWrist.setFromAxisAngle(new THREE.Vector3(1, 0, 0), s.wrist * RAD);
      tCamera.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.camera * RAD);

      jBase.quaternion.slerp(tBase, SPEED);
      jShoulder.quaternion.slerp(tShoulder, SPEED);
      jElbow.quaternion.slerp(tElbow, SPEED);
      jWrist.quaternion.slerp(tWrist, SPEED);
      jCamera.quaternion.slerp(tCamera, SPEED);

      const factor = Math.min(Math.max((s.temperature - 25) / 75, 0), 1);
      const glow = new THREE.Color(0x000000).lerp(new THREE.Color(0xff1500), factor);
      customMaterials.forEach((m) => {
        m.emissive.copy(glow);
        m.emissiveIntensity = factor * 1.6;
      });

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", onResize);
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={containerRef} className="w-full h-full" />;
}
