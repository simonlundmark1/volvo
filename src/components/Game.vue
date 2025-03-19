<template>
  <div>
    <div class="game-container" ref="gameContainer"></div>
    <div
      class="score-display"
      v-if="scoreDisplayVisible"
      :style="{
        top: scoreDisplayPosition.y + 'px',
        left: scoreDisplayPosition.x + 'px',
      }"
    >
      {{ scoreDisplayValue }}
    </div>
    <div class="tv-overlay">
      <img src="/assets/images/tv.png" alt="TV Frame" />
    </div>
    <!-- Initial Overlay -->
    <div v-if="showOverlay" class="overlay">
      <img src="/assets/images/start2.png" alt="Start Screen" class="overlay-image" />
      <button class="play-button" @click="startGame">Play</button>
    </div>
    <!-- Vehicle Selection Screen -->
    <div v-else-if="showVehicleSelection" class="vehicle-selection-overlay">
      <div class="vehicle-stats">
        <h2>Volvo 940</h2>
        <p>Speed: Very Fast</p>
        <p>Handling: Good</p>
        <p><br>Press Enter to select</p>
      </div>
    </div>

    <!-- Speedometer -->
    <div v-if="!showOverlay && !showVehicleSelection" class="speedometer-container">
      <canvas ref="speedometerCanvas" width="200" height="200"></canvas>
    </div>
    <!-- HUD (Heads-Up Display) -->
    <div
      v-if="!showOverlay && !showVehicleSelection && !showHighScoreInput && !showHighScoreList"
      class="hud"
    >
      <div class="timer">Time: {{ Math.ceil(timeRemaining) }}</div>
      <div class="score">Score: {{ score }}</div>
    </div>
    <!-- Radio Interface -->
    <div
      v-if="!showOverlay && !showVehicleSelection && !showHighScoreInput && !showHighScoreList"
      class="radio-interface"
    >
      <div class="radio-display">
        <div class="radio-text">
          {{
            currentChannel === 'local'
              ? 'BARSEBACK FM'
              : currentChannel === 'online'
                ? 'GÄLLIVARE NÄRRADIO'
                : 'FIFA FM'
          }}
        </div>
        <div class="radio-frequency">
          {{
            currentChannel === 'local'
              ? '98.7 MHz'
              : currentChannel === 'online'
                ? '97.7 MHz'
                : '99.9 MHz'
          }}
        </div>
      </div>
      <button class="radio-button" @click="toggleRadioChannel">CHANGE CHANNEL</button>
    </div>
    <!-- High Score Input Screen -->
    <div v-if="showHighScoreInput" class="high-score-input">
      <div class="high-score-content">
        <h2>Time's Up!</h2>
        <p>Your Score: {{ score }}</p>
        <input v-model="playerName" placeholder="Enter your name" />
        <button @click="submitHighScore">Submit</button>
        <p><br>Press Enter to submit</p>
      </div>
    </div>
    <!-- High Score List Screen -->
    <div v-if="showHighScoreList" class="high-score-list">
      <div class="high-score-content">
        <h2>High Scores</h2>
        <ol>
          <li v-for="(entry, index) in highScores" :key="index">
            {{ entry.name }} - {{ entry.score }}
          </li>
        </ol>
        <button @click="restartGame">Play Again</button>
        <p><br>Press Enter to play again</p>
      </div>
    </div>
    <!-- After the score-display div -->
    <div v-if="showDevInfo" class="dev-info-window">
      <h3>Developer Info</h3>
      <p>Position: X: {{ Math.round(carPosition.x * 100) / 100 }}, Y: {{ Math.round(carPosition.y * 100) / 100 }}, Z: {{ Math.round(carPosition.z * 100) / 100 }}</p>
      <p>Speed: {{ Math.round(currentSpeed * 10) / 10 }} km/h</p>
      <p>Velocity: {{ Math.round(velocity * 100) / 100 }}</p>
      <p>Angular Velocity: {{ Math.round(angularVelocity * 1000) / 1000 }}</p>
      <p>On Ground: {{ onGround ? 'Yes' : 'No' }}</p>
      <p>FPS: {{ currentFps }}</p>
    </div>
  </div>
</template>

<script lang="ts">
import {
  defineComponent,
  markRaw,
  onMounted,
  onBeforeUnmount,
  ref,
  watch,
} from 'vue';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PMREMGenerator } from 'three';

export default defineComponent({
  name: 'GameComponent',
  setup() {
    const gameContainer = ref<HTMLElement | null>(null);
    const speedometerCanvas = ref<HTMLCanvasElement | null>(null);
    let speedometerContext: CanvasRenderingContext2D | null = null;

    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
    let renderer: THREE.WebGLRenderer;
    let car: THREE.Object3D;
    let keys: Record<string, boolean> = {
      ArrowUp: false,
      ArrowDown: false,
      ArrowLeft: false,
      ArrowRight: false,
    };
    let velocity = 0;
    let angularVelocity = 0;
    const rotationDamping = 0.95;
    let modelLoaded = false;
    const isGameOver = ref(false);
    let explosionSprite: THREE.Sprite | null = null;
    let explosionStartTime: number | null = null;

    // Overlay and Background Music
    const showOverlay = ref(true);
    let backgroundAudio: HTMLAudioElement | null = null;

    // Vehicle Selection State
    const showVehicleSelection = ref(false);
    let vehicleSelectionScene: THREE.Scene;
    let vehicleSelectionCamera: THREE.PerspectiveCamera;
    let vehicleSelectionCar: THREE.Object3D;
    let vehicleSelectionMusic: HTMLAudioElement | null = null;

    // Constants for Acceleration and Speed
    const MAX_SPEED = 20;
    const MAX_REVERSE_SPEED = -10;
    const MAX_ACCELERATION = 0.3;
    const MIN_ACCELERATION = 0.01;
    const DECELERATION = 0.3;
    const FRICTION = 0.993;

    const MAX_STEERING_SENSITIVITY = 0.25;
    const MIN_STEERING_SENSITIVITY = 0.1;

    // Constants for Tilting
    const MAX_TILT_ANGLE = THREE.MathUtils.degToRad(-15);
    const TILT_LERP_FACTOR = 0.3;

    let currentTiltAngle = 0;

    const RENDERER_WIDTH = 480;
    const RENDERER_HEIGHT = 360;
    const rows = 20; // Increased map rows
    const columns = 20; // Increased map columns
    const blockSize = 60;
    const roadWidth = 15;
    const blockSpacing = blockSize + roadWidth;
    const roadHeight = 0.02;

    const houseData: Array<{
      position: THREE.Vector3;
      boundingBox: THREE.Box3;
    }> = [];
    const treeData: Array<{
      position: THREE.Vector3;
      scale: number;
      boundingSphere: THREE.Sphere;
    }> = [];

    const pyramidData: Array<{
      mesh: THREE.Mesh | THREE.Group;
      boundingBox: THREE.Box3;
    }> = [];
    const collectibleData: Array<{
      mesh: THREE.Mesh;
      boundingBox: THREE.Box3;
      isWunderbaum?: boolean;
    }> = [];
    const mooseData: Array<{
      mesh: THREE.Group;
      boundingBox: THREE.Box3;
      direction: THREE.Vector3;
      speed: number;
      lastDirectionChange: number;
      points: number;
    }> = [];

    let ambientLight: THREE.AmbientLight;

    const handleLoadingError = (error: unknown, assetType: string) => {
      console.error(`Error loading ${assetType}:`, error);
    };

    let explosionTexture: THREE.Texture;
    const explosionRows = 4;
    const explosionCols = 4;
    const totalExplosionFrames = explosionRows * explosionCols;
    const explosionDuration = 1000;

    let explosionAudio: HTMLAudioElement | null = null;
    let jumpAudio: HTMLAudioElement | null = null;
    let snusCollectAudio: HTMLAudioElement | null = null;

    // Add this after snusCollectAudio declaration
    let mooseHitAudio: HTMLAudioElement | null = null;

    let lastCarPosition = new THREE.Vector3();

    let lastJumpTime = 0;
    const JUMP_DELAY = 0.05;

    const createSnusTexture = () => {
      const size = 256;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, size, size);

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 80px Arial';
      const text = 'SNUS';
      const textWidth = ctx.measureText(text).width;
      ctx.fillText(text, (size - textWidth) / 2, size / 2 + 30);

      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      return texture;
    };

    // Wunderbaum creation function
    const createWunderbaumTexture = () => {
      const size = 256;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;

      ctx.clearRect(0, 0, size, size);

      const cx = size / 2;
      ctx.fillStyle = '#228B22'; // Forest green

      ctx.beginPath();
      ctx.moveTo(cx, 20);
      ctx.lineTo(cx - 80, 200);
      ctx.lineTo(cx + 80, 200);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#8B4513';
      ctx.fillRect(cx - 10, 200, 20, 40);

      ctx.save();
      ctx.translate(cx + 30, 160);
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = '#000';
      ctx.font = 'bold 16px Arial';
      ctx.fillText('WUNDERBAUM', 0, 0);
      ctx.restore();

      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      return texture;
    };

    const createWunderbaumMesh = () => {
      const texture = createWunderbaumTexture();
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide,
      });

      const geometry = new THREE.PlaneGeometry(3, 4);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.y = Math.PI / 2;
      return mesh;
    };

    let collectibles: THREE.Mesh[] = [];

    const initVehicleSelectionScene = () => {
      vehicleSelectionScene = new THREE.Scene();
      vehicleSelectionCamera = new THREE.PerspectiveCamera(
        90,
        RENDERER_WIDTH / RENDERER_HEIGHT,
        0.1,
        1000
      );
      vehicleSelectionCamera.position.set(7, 1, -2);
      vehicleSelectionCamera.lookAt(-1, 0, 0);

      vehicleSelectionScene.background = new THREE.TextureLoader().load(
        '/assets/images/showroom.webp'
      );

      const ambientLightSelection = new THREE.AmbientLight(0xffffff, 0.1);
      vehicleSelectionScene.add(ambientLightSelection);

      const objLoader = new OBJLoader();
      objLoader.load(
        '/assets/models/model_0.obj',
        (object) => {
          vehicleSelectionCar = object;
          vehicleSelectionCar.scale.set(0.01, 0.01, 0.01);
          vehicleSelectionCar.position.set(0, -2.5, 0);
          vehicleSelectionCar.rotation.y += Math.PI;

          const textureLoader = new THREE.TextureLoader();
          textureLoader.load(
            '/assets/models/Volvo_Diffusenew.png',
            (texture: THREE.Texture) => {
              texture.wrapS = THREE.RepeatWrapping;
              texture.wrapT = THREE.RepeatWrapping;
              texture.encoding = THREE.sRGBEncoding;
              texture.minFilter = THREE.LinearMipMapNearestFilter;
              texture.magFilter = THREE.LinearFilter;
              texture.generateMipmaps = true;
              texture.anisotropy = Math.min(
                renderer.capabilities.getMaxAnisotropy(),
                4
              );

              vehicleSelectionCar.traverse((node) => {
                if ((node as THREE.Mesh).isMesh) {
                  const mesh = node as THREE.Mesh;
                  mesh.material = new THREE.MeshBasicMaterial({
                    map: texture,
                  });
                  mesh.castShadow = false;
                  mesh.receiveShadow = false;
                  mesh.material.side = THREE.DoubleSide;
                }
              });
            },
            undefined,
            (error) => handleLoadingError(error, 'Volvo_Diffusenew.png')
          );

          vehicleSelectionScene.add(vehicleSelectionCar);
        },
        undefined,
        (error) => handleLoadingError(error, 'model_0.obj')
      );
    };

    const initScene = () => {
      scene = markRaw(new THREE.Scene());
      camera = markRaw(
        new THREE.PerspectiveCamera(
          75,
          RENDERER_WIDTH / RENDERER_HEIGHT,
          0.1,
          10000 // Increased far clipping plane to match map size
        )
      );
      camera.position.set(0, 5, 15); // Adjusted initial camera position
      camera.lookAt(0, 0, 0);

      renderer = markRaw(
        new THREE.WebGLRenderer({
          antialias: false,
          powerPreference: 'high-performance',
          stencil: false,
          depth: true,
        })
      );
      renderer.setPixelRatio(1);
      renderer.setSize(RENDERER_WIDTH, RENDERER_HEIGHT);
      renderer.shadowMap.enabled = false;

      if (gameContainer.value) {
        gameContainer.value.appendChild(renderer.domElement);
      } else {
        console.error('Game container is not available');
      }

      ambientLight = new THREE.AmbientLight(0xffd4a3, 1);
      scene.add(ambientLight);

      const directionalLight = new THREE.DirectionalLight(0xff9933, 0.5);
      directionalLight.position.set(1, 1, 0);
      scene.add(directionalLight);

      const textureLoader = new THREE.TextureLoader();

      const groundTexture = textureLoader.load(
        '/assets/textures/ground.jpg',
        (texture: THREE.Texture) => {
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(rows * 2, columns * 2);
          (texture as any).encoding = THREE.sRGBEncoding;
          texture.minFilter = THREE.LinearMipMapNearestFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.generateMipmaps = true;
          texture.anisotropy = Math.min(
            renderer.capabilities.getMaxAnisotropy(),
            4
          );
        },
        undefined,
        (error) => handleLoadingError(error, 'ground texture')
      );

      // Calculate map dimensions based on rows and columns
      const mapWidth = columns * blockSpacing;
      const mapHeight = rows * blockSpacing;

      const planeGeometry = new THREE.PlaneGeometry(mapWidth * 4, mapHeight * 4);
      const planeMaterial = new THREE.MeshBasicMaterial({
        map: groundTexture,
        side: THREE.DoubleSide,
      });
      const ground = new THREE.Mesh(planeGeometry, planeMaterial);
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(mapWidth / 2, 0, mapHeight / 2);
      scene.add(ground);

      const roadTexture = textureLoader.load(
        '/assets/textures/road.jpg',
        (texture) => {
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(1, 40);
          texture.encoding = THREE.sRGBEncoding;
          texture.minFilter = THREE.LinearMipMapNearestFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.generateMipmaps = true;
          texture.anisotropy = Math.min(
            renderer.capabilities.getMaxAnisotropy(),
            4
          );
        },
        undefined,
        (error) => handleLoadingError(error, 'road texture')
      );

      const roadMaterial = new THREE.MeshBasicMaterial({
        map: roadTexture,
      });

      // Add these properties to your road material:
      roadMaterial.polygonOffset = true;
      roadMaterial.polygonOffsetFactor = 0.1; // Reduced from 1
      roadMaterial.polygonOffsetUnits = 0.1; // Reduced from 1

      for (let row = 0; row <= rows; row++) {
        const roadGeometry = new THREE.BoxGeometry(
          columns * blockSpacing,
          0.05, // Increased from 0.02 to reduce z-fighting
          roadWidth
        );
        const roadMesh = new THREE.Mesh(roadGeometry, roadMaterial);

        roadMesh.position.set(
          (columns * blockSpacing) / 2 - blockSpacing / 2,
          0.025, // Position adjusted to half the height
          row * blockSpacing - blockSpacing / 2
        );

        roadMesh.position.y += 0.2; // Raise road just slightly above ground

        scene.add(roadMesh);
      }

      for (let col = 0; col <= columns; col++) {
        const roadGeometry = new THREE.BoxGeometry(
          roadWidth,
          0.05, // Increased from 0.02 to reduce z-fighting
          rows * blockSpacing
        );
        const roadMesh = new THREE.Mesh(roadGeometry, roadMaterial);

        roadMesh.position.set(
          col * blockSpacing - blockSpacing / 2,
          0.025, // Position adjusted to half the height
          (rows * blockSpacing) / 2 - blockSpacing / 2
        );

        roadMesh.position.y += 0.2; // Raise road just slightly above ground

        scene.add(roadMesh);
      }

      const houseTexture = textureLoader.load(
        '/assets/textures/house.jpg',
        (texture) => {
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(2, 2);
          texture.encoding = THREE.sRGBEncoding;
          texture.minFilter = THREE.LinearMipMapNearestFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.generateMipmaps = true;
          texture.anisotropy = Math.min(
            renderer.capabilities.getMaxAnisotropy(),
            4
          );
        },
        undefined,
        (error) => handleLoadingError(error, 'house texture')
      );

      const pineTreeGeometry = createPineTreeGeometry();
      const treeMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });

      const houseGeometry = new THREE.BoxGeometry(10, 20, 10);
      const roofGeometry = new THREE.PlaneGeometry(10, 10);
      roofGeometry.rotateX(-Math.PI / 2);
      roofGeometry.translate(0, 10, 0);
      const combinedHouseGeometry = BufferGeometryUtils.mergeGeometries(
        [houseGeometry, roofGeometry],
        false
      );

      const houseMaterial = new THREE.MeshBasicMaterial({
        map: houseTexture,
      });

        let totalHouses = 0;
        let totalTrees = 0;

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < columns; col++) {
                totalHouses += Math.floor(Math.random() * 3) + 1;
                totalTrees += Math.floor(Math.random() * 15) + 20;
            }
        }


      const houseInstancedMesh = new THREE.InstancedMesh(
        combinedHouseGeometry,
        houseMaterial,
        totalHouses
      );
      const treeInstancedMesh = new THREE.InstancedMesh(
        pineTreeGeometry,
        treeMaterial,
        totalTrees
      );

      let houseIndex = 0;
      let treeIndex = 0;

      const dummy = new THREE.Object3D();

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < columns; col++) {
          const blockCenterX = col * blockSpacing;
          const blockCenterZ = row * blockSpacing;

          const houseCount = Math.floor(Math.random() * 3) + 1;

          const blockHousePositions = [];

          for (let i = 0; i < houseCount; i++) {
            const buffer = roadWidth / 2 + 5;
            const offsetX =
              (Math.random() - 0.5) * (blockSize - roadWidth - buffer * 2);
            const offsetZ =
              (Math.random() - 0.5) * (blockSize - roadWidth - buffer * 2);

            const houseX = blockCenterX + offsetX;
            const houseZ = blockCenterZ + offsetZ;

            const width = Math.random() * 20 + 5;
            const height = Math.random() * 20 + 10;
            const depth = Math.random() * 10 + 5;

            dummy.position.set(houseX, height / 2, houseZ);
            dummy.scale.set(width / 10, height / 20, depth / 10);
            dummy.updateMatrix();

            houseInstancedMesh.setMatrixAt(houseIndex, dummy.matrix);
            houseIndex++;

            const originalBoundingBox = new THREE.Box3().setFromBufferAttribute(
              combinedHouseGeometry.attributes.position
            );
            const transformedBoundingBox = originalBoundingBox
              .clone()
              .applyMatrix4(dummy.matrix);

            houseData.push({
              position: dummy.position.clone(),
              boundingBox: transformedBoundingBox,
            });

            blockHousePositions.push({
              x: houseX,
              z: houseZ,
              radius: Math.max(width, depth) / 2 + 5,
            });
          }

          const treesInBlock = Math.floor(Math.random() * 15) + 20;
          let attempts = 0;
          let placedTrees = 0;

          while (placedTrees < treesInBlock && attempts < 50) {
            const buffer = roadWidth / 2 + 3;
            const treeOffsetX =
              (Math.random() - 0.5) * (blockSize - roadWidth - buffer * 2);
            const treeOffsetZ =
              (Math.random() - 0.5) * (blockSize - roadWidth - buffer * 2);

            const treeX = blockCenterX + treeOffsetX;
            const treeZ = blockCenterZ + treeOffsetZ;

            let tooClose = false;
            for (const house of blockHousePositions) {
              const dx = treeX - house.x;
              const dz = treeZ - house.z;
              const distance = Math.sqrt(dx * dx + dz * dz);
              if (distance < house.radius + 2) {
                tooClose = true;
                break;
              }
            }

            for (let i = 0; i < treeData.length; i++) {
              const otherTree = treeData[i];
              const dx = treeX - otherTree.position.x;
              const dz = treeZ - otherTree.position.z;
              const distance = Math.sqrt(dx * dx + dz * dz);
              if (distance < 1.5) {
                tooClose = true;
                break;
              }
            }

            if (!tooClose) {
              const treeScale = 0.4 + Math.random() * 0.3;

              const maxTilt = 0.1;
              const randomTiltX = (Math.random() - 0.5) * maxTilt;
              const randomTiltZ = (Math.random() - 0.5) * maxTilt;

              dummy.position.set(treeX, -0.2, treeZ);
              dummy.scale.set(treeScale, treeScale, treeScale);
              dummy.rotation.set(
                randomTiltX,
                Math.random() * Math.PI * 2,
                randomTiltZ
              );
              dummy.updateMatrix();

              treeInstancedMesh.setMatrixAt(treeIndex, dummy.matrix);
              treeIndex++;

              const treePosition = new THREE.Vector3(treeX, -0.2, treeZ);
              const boundingSphere = new THREE.Sphere(
                new THREE.Vector3(treeX, -0.2 + treeScale * 9, treeZ),
                treeScale * 7
              );

              treeData.push({
                position: treePosition,
                scale: treeScale,
                boundingSphere: boundingSphere,
              });

              placedTrees++;
            }
            attempts++;
          }
        }
      }

      scene.add(houseInstancedMesh);
      scene.add(treeInstancedMesh);

      // Create tree barrier around the map
      createTreeBarrier();

      generateCollectibles();
      generatePyramids();
      generateMoose();

      const objLoaderMain = new OBJLoader();
      objLoaderMain.load(
        '/assets/models/model_0.obj',
        (object) => {
          car = object;

          car.scale.set(0.01, 0.01, 0.01);
          car.position.y = -1.65;

          car.rotation.y += Math.PI;

          textureLoader.load(
            '/assets/models/Volvo_Diffusenew.png',
            (texture: THREE.Texture) => {
              texture.wrapS = THREE.RepeatWrapping;
              texture.wrapT = THREE.RepeatWrapping;
              texture.encoding = THREE.sRGBEncoding;
              texture.minFilter = THREE.LinearMipMapNearestFilter;
              texture.magFilter = THREE.LinearFilter;
              texture.generateMipmaps = true;
              texture.anisotropy = Math.min(
                renderer.capabilities.getMaxAnisotropy(),
                4
              );

              car.traverse((node) => {
                if ((node as THREE.Mesh).isMesh) {
                  const mesh = node as THREE.Mesh;
                  mesh.material = new THREE.MeshBasicMaterial({
                    map: texture,
                  });
                  mesh.castShadow = false;
                  mesh.receiveShadow = false;
                  mesh.material.side = THREE.DoubleSide;
                }
              });
            },
            undefined,
            (error) => handleLoadingError(error, 'Volvo_Diffusenew.png')
          );

          scene.add(car);
          modelLoaded = true;
          lastCarPosition.copy(car.position);
        },
        undefined,
        (error) => handleLoadingError(error, 'model_0.obj')
      );

      const textureLoader2 = new THREE.TextureLoader();
      textureLoader2.load(
        '/assets/images/6.png',
        (texture) => {
          const pmremGenerator = new PMREMGenerator(renderer);
          pmremGenerator.compileEquirectangularShader();

          const envMap = pmremGenerator.fromEquirectangular(texture).texture;

          scene.background = envMap;

          texture.dispose();
          pmremGenerator.dispose();

          scene.fog = new THREE.FogExp2(0xffd4a3, 0.002);
        },
        undefined,
        (error) => handleLoadingError(error, '6.png')
      );

      explosionTexture = textureLoader.load(
        '/assets/images/exp2.png',
        (texture: THREE.Texture) => {
          texture.wrapS = THREE.ClampToEdgeWrapping;
          texture.wrapT = THREE.ClampToEdgeWrapping;
          texture.minFilter = THREE.NearestFilter;
          texture.magFilter = THREE.NearestFilter;
          texture.repeat.set(1 / explosionCols, 1 / explosionRows);
        },
        undefined,
        (error) => handleLoadingError(error, 'exp2.png')
      );

      animate();
    };

    const timeRemaining = ref(60);
    const score = ref(0);
    const isTimeUp = ref(false);
    const showHighScoreInput = ref(false);
    const showHighScoreList = ref(false);
    const highScores = ref<{ name: string; score: number }[]>([]);
    const playerName = ref('');

    let pyramids: (THREE.Mesh | THREE.Group)[] = [];

    const generateCollectibles = () => {
      const collectibleGeometry = new THREE.CylinderGeometry(1, 1, 0.5, 32);
      const collectibleTexture = createSnusTexture();
      const collectibleSideMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
      const collectibleTopBottomMaterial = new THREE.MeshBasicMaterial({ map: collectibleTexture });
      const collectibleMaterials = [
        collectibleSideMaterial,
        collectibleTopBottomMaterial,
        collectibleTopBottomMaterial
      ];

      const numCollectibles = 220;
      const numCollectiblesOnRoofs = 160;
      const numCollectiblesOnRoads = numCollectibles - numCollectiblesOnRoofs;

      for (let i = 0; i < numCollectiblesOnRoads; i++) {
        const collectible = new THREE.Mesh(collectibleGeometry, collectibleMaterials);
        collectible.rotation.x = Math.PI / 2;

        const randomRow = Math.floor(Math.random() * rows);
        const randomCol = Math.floor(Math.random() * columns);

        const roadX = randomCol * (60 + 15) - (60 + 15) / 2;
        const roadZ = randomRow * (60 + 15) - (60 + 15) / 2;

        const offsetX = (Math.random() - 0.5) * 15 * 0.8;
        const offsetZ = (Math.random() - 0.5) * 15 * 0.8;

        if (Math.random() < 0.5) {
          collectible.position.set(roadX + offsetX, 1, roadZ);
        } else {
          collectible.position.set(roadX, 1, roadZ + offsetZ);
        }

        scene.add(collectible);
        collectibles.push(collectible);

        const boundingBox = new THREE.Box3().setFromObject(collectible);
        collectibleData.push({ mesh: collectible, boundingBox, isWunderbaum: false });
      }

      for (let i = 0; i < numCollectiblesOnRoofs; i++) {
        const wunderbaum = createWunderbaumMesh();
        wunderbaum.userData.isWunderbaum = true;

        const randomHouseIndex = Math.floor(Math.random() * houseData.length);
        const house = houseData[randomHouseIndex];
        const houseBoundingBox = house.boundingBox;

        const roofMinX = houseBoundingBox.min.x + 1;
        const roofMaxX = houseBoundingBox.max.x - 1;
        const roofMinZ = houseBoundingBox.min.z + 1;
        const roofMaxZ = houseBoundingBox.max.z - 1;
        const wunderX = THREE.MathUtils.lerp(roofMinX, roofMaxX, Math.random());
        const wunderZ = THREE.MathUtils.lerp(roofMinZ, roofMaxZ, Math.random());
        const roofY = houseBoundingBox.max.y + 1;

        wunderbaum.position.set(wunderX, roofY, wunderZ);
        wunderbaum.rotation.y = Math.random() * Math.PI * 2;

        scene.add(wunderbaum);
        collectibles.push(wunderbaum);

        const boundingBox = new THREE.Box3().setFromObject(wunderbaum);
        collectibleData.push({ mesh: wunderbaum, boundingBox, isWunderbaum: true });
      }
    };

    const createCheckerTexture = () => {
      const size = 512;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;

      const numSquares = 6;
      const squareSize = size / numSquares;

      for (let y = 0; y < numSquares; y++) {
        for (let x = 0; x < numSquares; x++) {
          ctx.fillStyle = ((x - 2) + y) % 2 === 0 ? '#FFFFFF' : '#606060';
          ctx.fillRect(x * squareSize, y * squareSize, squareSize, squareSize);
        }
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.
      wrapS = THREE.RepeatWrapping;
texture.wrapT = THREE.RepeatWrapping;
texture.minFilter = THREE.LinearFilter;
texture.magFilter = THREE.LinearFilter;
texture.needsUpdate = true;
return texture;
};
function generatePyramids() {
  const topRadius = 3;
  const bottomRadius = 6;
  const height = 2;

  const sideTexture = createCheckerTexture();
  const sideMaterial = new THREE.MeshBasicMaterial({ map: sideTexture });
  const topMaterial = new THREE.MeshBasicMaterial({ color: 0x808080 });
  const bottomMaterial = new THREE.MeshBasicMaterial({ color: 0x808080 });

  const createSpeedBump = (): THREE.Mesh => {
    const geometry = new THREE.CylinderGeometry(topRadius, bottomRadius, height, 4, 1, false);
    const materials = [sideMaterial, topMaterial, bottomMaterial];
    const mesh = new THREE.Mesh(geometry, materials);
    mesh.rotation.x = 0;
    return mesh;
  };

  const numSpeedBumps = 100;
  const numOnRoofs = 30;
  const numOnGround = numSpeedBumps - numOnRoofs;

  for (let i = 0; i < numOnGround; i++) {
    const bump = createSpeedBump();

    const randomRow = Math.floor(Math.random() * (rows + 1));
    const randomCol = Math.floor(Math.random() * (columns + 1));
    const isHorizontal = Math.random() < 0.5;
    let posX, posZ;

    if (isHorizontal) {
      posZ = randomRow * blockSpacing - blockSpacing / 2;
      posX = (columns * blockSpacing) / 2 - blockSpacing / 2;
      posX += (Math.random() - 0.5) * (columns * blockSpacing);
      posX = THREE.MathUtils.clamp(posX, 0, columns * blockSpacing - blockSpacing);
    } else {
      posX = randomCol * blockSpacing - blockSpacing / 2;
      posZ = (rows * blockSpacing) / 2 - blockSpacing / 2;
      posZ += (Math.random() - 0.5) * (rows * blockSpacing);
      posZ = THREE.MathUtils.clamp(posZ, 0, rows * blockSpacing - blockSpacing);
    }

    bump.position.set(posX, 0, posZ);
    scene.add(bump);
    pyramids.push(bump);

    const boundingBox = new THREE.Box3().setFromObject(bump);
    pyramidData.push({ mesh: bump, boundingBox });
  }

  for (let i = 0; i < numOnRoofs; i++) {
    const bump = createSpeedBump();
    const randomHouseIndex = Math.floor(Math.random() * houseData.length);
    const house = houseData[randomHouseIndex];
    const houseBoundingBox = house.boundingBox;

    const roofMinX = houseBoundingBox.min.x + 1;
    const roofMaxX = houseBoundingBox.max.x - 1;
    const roofMinZ = houseBoundingBox.min.z + 1;
    const roofMaxZ = houseBoundingBox.max.z - 1;

    const bumpX = THREE.MathUtils.lerp(roofMinX, roofMaxX, Math.random());
    const bumpZ = THREE.MathUtils.lerp(roofMinZ, roofMaxZ, Math.random());
    const roofY = houseBoundingBox.max.y;

    bump.position.set(bumpX, roofY, bumpZ);
    scene.add(bump);
    pyramids.push(bump);

    const boundingBox = new THREE.Box3().setFromObject(bump);
    pyramidData.push({ mesh: bump, boundingBox });
  }
}

const createTreeBarrier = () => {
  const pineTreeGeometry = createPineTreeGeometry();
  const treeMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });

  // Number of trees around the perimeter
  const treeSpacing = 5; // Distance between each tree
  const mapWidth = columns * blockSpacing;
  const mapHeight = rows * blockSpacing;

  // Expand the barrier to 2x the map size
  const barrierWidth = mapWidth * 2;
  const barrierHeight = mapHeight * 2;

  // Calculate the number of trees for each side
  const treesPerWidth = Math.ceil(barrierWidth / treeSpacing);
  const treesPerHeight = Math.ceil(barrierHeight / treeSpacing);

  // Total number of trees needed (all four sides minus corner duplicates)
  const totalBarrierTrees = (treesPerWidth * 2) + (treesPerHeight * 2);

  const treeInstancedMesh = new THREE.InstancedMesh(
    pineTreeGeometry,
    treeMaterial,
    totalBarrierTrees
  );

  const dummy = new THREE.Object3D();
  let treeIndex = 0;

  // Add trees along the perimeter
  // Bottom edge (x varies, z is 0)
  for (let x = -mapWidth / 2; x < mapWidth * 1.5; x += treeSpacing) {
    const treeScale = 0.8 + Math.random() * 0.4;
    dummy.position.set(x, 0, -mapHeight / 2);
    dummy.scale.set(treeScale, treeScale, treeScale);
    dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
    dummy.updateMatrix();

    treeInstancedMesh.setMatrixAt(treeIndex, dummy.matrix);
    treeIndex++;

    const boundingSphere = new THREE.Sphere(
      new THREE.Vector3(x, treeScale * 9, -mapHeight / 2),
      treeScale * 7
    );

    treeData.push({
      position: dummy.position.clone(),
      scale: treeScale,
      boundingSphere: boundingSphere
    });
  }

  // Top edge (x varies, z is mapHeight)
  for (let x = -mapWidth / 2; x < mapWidth * 1.5; x += treeSpacing) {
    const treeScale = 0.8 + Math.random() * 0.4;
    dummy.position.set(x, 0, mapHeight * 1.5);
    dummy.scale.set(treeScale, treeScale, treeScale);
    dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
    dummy.updateMatrix();

    treeInstancedMesh.setMatrixAt(treeIndex, dummy.matrix);
    treeIndex++;

    const boundingSphere = new THREE.Sphere(
      new THREE.Vector3(x, treeScale * 9, mapHeight * 1.5),
      treeScale * 7
    );

    treeData.push({
      position: dummy.position.clone(),
      scale: treeScale,
      boundingSphere: boundingSphere
    });
  }

  // Left edge (x is 0, z varies)
  for (let z = -mapHeight / 2; z < mapHeight * 1.5; z += treeSpacing) {
    const treeScale = 0.8 + Math.random() * 0.4;
    dummy.position.set(-mapWidth / 2, 0, z);
    dummy.scale.set(treeScale, treeScale, treeScale);
    dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
    dummy.updateMatrix();

    treeInstancedMesh.setMatrixAt(treeIndex, dummy.matrix);
    treeIndex++;

    const boundingSphere = new THREE.Sphere(
      new THREE.Vector3(-mapWidth / 2, treeScale * 9, z),
      treeScale * 7
    );

    treeData.push({
      position: dummy.position.clone(),
      scale: treeScale,
      boundingSphere: boundingSphere
    });
  }

  // Right edge (x is mapWidth, z varies)
  for (let z = -mapHeight / 2; z < mapHeight * 1.5; z += treeSpacing) {
    const treeScale = 0.8 + Math.random() * 0.4;
    dummy.position.set(mapWidth * 1.5, 0, z);
    dummy.scale.set(treeScale, treeScale, treeScale);
    dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
    dummy.updateMatrix();

    treeInstancedMesh.setMatrixAt(treeIndex, dummy.matrix);
    treeIndex++;

    const boundingSphere = new THREE.Sphere(
      new THREE.Vector3(mapWidth * 1.5, treeScale * 9, z),
      treeScale * 7
    );

    treeData.push({
      position: dummy.position.clone(),
      scale: treeScale,
      boundingSphere: boundingSphere
    });
  }

  scene.add(treeInstancedMesh);
};

const createPineTreeGeometry = (): THREE.BufferGeometry => {
  const trunkGeometry = new THREE.CylinderGeometry(0.4, 0.4, 6, 8);
  trunkGeometry.translate(0, 3, 0);

  const foliageGeometries: THREE.BufferGeometry[] = [];
  const numLayers = 4;
  const foliageHeight = 12;
  const layerHeight = foliageHeight / numLayers;

  for (let i = 0; i < numLayers; i++) {
    const radius = 2.5 - i * 0.5;
    const coneGeometry = new THREE.ConeGeometry(radius, layerHeight, 8);
    coneGeometry.translate(0, 6 + i * layerHeight, 0);
    foliageGeometries.push(coneGeometry);
  }

  const foliageGeometry = BufferGeometryUtils.mergeGeometries(
    foliageGeometries,
    false
  );

  const combinedGeometry = BufferGeometryUtils.mergeGeometries(
    [trunkGeometry, foliageGeometry],
    false
  );

  if (!combinedGeometry) {
    console.error('Failed to merge tree geometries');
    return new THREE.BufferGeometry();
  }

  const colors = new Float32Array(
    combinedGeometry.attributes.position.count * 3
  );
  const trunkColor = new THREE.Color(0x3d1f00);
  const foliageColor = new THREE.Color(0x1b5e20);

  const trunkVertCount = trunkGeometry.attributes.position.count;
  for (let i = 0; i < colors.length; i += 3) {
    const color = i < trunkVertCount * 3 ? trunkColor : foliageColor;
    colors[i] = color.r;
    colors[i + 1] = color.g;
    colors[i + 2] = color.b;
  }

  combinedGeometry.setAttribute(
    'color',
    new THREE.BufferAttribute(colors, 3)
  );

  return combinedGeometry;
};

let verticalVelocity = 0;
const gravity = -30;

const makeCarJump = (jumpStrength: number) => {
  if (verticalVelocity <= 0.1) {
    verticalVelocity = THREE.MathUtils.clamp(jumpStrength, 0.1, 50);
    lastJumpTime = performance.now();
    if (!jumpAudio) {
      jumpAudio = new Audio('/assets/sounds/boing.mp3');
      jumpAudio.volume = 0.5;
    }
    jumpAudio.currentTime = 0;
    jumpAudio.play().catch((error) => {
      console.error('Error playing jump sound:', error);
    });
  }
};

let prevTime = performance.now();

let carBoundingBox = new THREE.Box3();
const carWidth = 2;
const carHeight = 1;
const carDepth = 4;

let onGround = true;

const getGroundHeightAtPosition = (x: number, z: number): number => {
  let maxY = -1.65;

  for (let i = 0; i < houseData.length; i++) {
    const house = houseData[i];
    const houseBoundingBox = house.boundingBox;

      const buffer = 1.65;
    if (
      x >= houseBoundingBox.min.x + buffer &&
      x <= houseBoundingBox.max.x - buffer &&
      z >= houseBoundingBox.min.z + buffer &&
      z <= houseBoundingBox.max.z - buffer
    ) {
      const roofY = houseBoundingBox.max.y;
      if (roofY > maxY) {
        maxY = roofY;
      }
    }
  }

    return maxY;
};

  let currentLookTargetY = 0;
const LOOK_UP_HEIGHT = 3;
const LOOK_TRANSITION_SPEED = 0.1;

  function worldToScreen(position: THREE.Vector3, camera: THREE.Camera, renderer: THREE.WebGLRenderer): { x: number; y: number } {
      const width = renderer.domElement.clientWidth;
      const height = renderer.domElement.clientHeight;

      const proj = position.project(camera);
      const x = (proj.x * 0.5 + 0.5) * width;
      const y = (-proj.y * 0.5 + 0.5) * height;

      return { x, y };
  }

const animate = (time: number) => {
  const deltaTime = time - prevTime;
  prevTime = time;

  // Calculate FPS
  frameCount++;
  if (time - lastFpsUpdateTime >= 1000) {
    currentFps.value = Math.round(frameCount * 1000 / (time - lastFpsUpdateTime));
    frameCount = 0;
    lastFpsUpdateTime = time;
  }

  requestAnimationFrame(animate);

  // Update the car position and speed data if car exists
  if (car) {
    carPosition.value.copy(car.position);
    currentSpeed.value = Math.abs(velocity) * 100; // Convert to km/h
  }

  if (showVehicleSelection.value) {
    if (vehicleSelectionCar) {
      vehicleSelectionCar.rotation.y += 0.007;
    }
    renderer.render(vehicleSelectionScene, vehicleSelectionCamera);
  } else {
    if (
      modelLoaded &&
      car &&
      !isGameOver.value &&
      !showOverlay.value &&
      !showHighScoreInput.value &&
      !showHighScoreList.value
    ) {
          // Calculate speed factor for dynamic acceleration and handling
      const speedFactor = Math.abs(velocity) / MAX_SPEED;
      const accelerationFactor = 1 - speedFactor;
      const currentAcceleration =
          MIN_ACCELERATION +
          (MAX_ACCELERATION - MIN_ACCELERATION) * accelerationFactor;

      if (onGround) {
        if (keys.ArrowUp) {
          velocity += currentAcceleration * (deltaTime / 1000);
        }
        if (keys.ArrowDown) {
          velocity -= DECELERATION * (deltaTime / 1000);
        }

        if (!keys.ArrowUp && !keys.ArrowDown) {
          velocity *= FRICTION;
        }
      }

       velocity = THREE.MathUtils.clamp(
        velocity,
        MAX_REVERSE_SPEED,
        MAX_SPEED
      );

      const velocityThreshold = 0.001;
      if (Math.abs(velocity) < velocityThreshold) {
        velocity = 0;
      }

      car.translateZ(velocity * (deltaTime / 1000) * 100);

      const deltaPos = car.position.clone().sub(lastCarPosition);
      const actualSpeed = deltaPos.length() / (deltaTime / 1000);
      lastCarPosition.copy(car.position);

      const minSteerSpeed = Math.PI / 100;
      let steerFactor = 0;
       if (Math.abs(velocity) > minSteerSpeed) {
            steerFactor = Math.sign(velocity);
        }


      let steeringSensitivity =
        MAX_STEERING_SENSITIVITY -
        (MAX_STEERING_SENSITIVITY - MIN_STEERING_SENSITIVITY) * speedFactor;

      if (!onGround) {
        steeringSensitivity *= 0.5;
      }

        const baseRotationAcceleration = 0.015;
        const dynamicRotationAcceleration = baseRotationAcceleration * steeringSensitivity;

      if (steerFactor !== 0) {
          if (keys.ArrowLeft) {
            angularVelocity += dynamicRotationAcceleration * steerFactor;
          }
          if (keys.ArrowRight) {
            angularVelocity -= dynamicRotationAcceleration * steerFactor;
          }
       } else {
           angularVelocity = 0;
        }

      angularVelocity *= rotationDamping;

        const angularThreshold = 0.0001;
        if (Math.abs(angularVelocity) < angularThreshold) {
            angularVelocity = 0;
        }

      angularVelocity = THREE.MathUtils.clamp(angularVelocity, -0.5, 0.5);

        if (steerFactor !== 0) {
            car.rotation.y += angularVelocity * (deltaTime / 1000) * 30;
        }

        let targetTiltAngle = 0;
        if (angularVelocity !== 0 && Math.abs(velocity) > minSteerSpeed) {
            const tiltSpeedFactor = Math.abs(velocity) / MAX_SPEED;
          targetTiltAngle =
            -MAX_TILT_ANGLE * (angularVelocity / 0.02) * tiltSpeedFactor;
        }


      currentTiltAngle = THREE.MathUtils.lerp(
        currentTiltAngle,
        targetTiltAngle,
        TILT_LERP_FACTOR
      );

      car.rotation.z = currentTiltAngle;

      const speedInKmH = Math.abs(velocity) * 100;
      drawSpeedometer(speedInKmH);

        // Replace the camera positioning code with improved bobbing-free interpolation
        const cameraDistance = 10; // Distance from car
        const cameraHeight = 5;    // Height above car

        // Calculate the desired camera position - separated from quaternion to prevent bobbing
        const carForward = new THREE.Vector3(0, 0, 1).applyQuaternion(car.quaternion);
        const cameraOffset = carForward.clone().multiplyScalar(-cameraDistance);
        cameraOffset.y = cameraHeight; // Fixed height independent of car's quaternion

        const targetPosition = car.position.clone().add(cameraOffset);

        // Maintain camera's current y position to prevent vertical bobbing
        const currentY = camera.position.y;
        const smoothedPosition = targetPosition.clone();
        smoothedPosition.y = currentY;

        // Use different interpolation speeds based on velocity and turning
        const turningFactor = Math.abs(angularVelocity) / 0.5;

        // Calculate appropriate interpolation speed - more consistent during turns
        const baseInterpolation = onGround ? 0.15 : 0.07; // Increased from previous values
        const positionInterpolationSpeed = baseInterpolation * (1 - turningFactor * 0.25); // Reduced from 0.3

        // Apply smoothing with proper time-based interpolation
        camera.position.lerp(smoothedPosition, positionInterpolationSpeed * (deltaTime / 16.67));

        // Gradually adjust height separately with consistent speed
        const targetY = car.position.y + cameraHeight;
        camera.position.y = THREE.MathUtils.lerp(
          camera.position.y,
          targetY,
          0.05 * (deltaTime / 16.67)
        );

        // Look target always at car's position plus a fixed height
        const lookTarget = car.position.clone();
        lookTarget.y += LOOK_UP_HEIGHT;

        // More direct look-at for responsive camera that doesn't lag behind car
        camera.lookAt(lookTarget);

        carBoundingBox.setFromObject(car);

      let collidedWithSideOfHouse = false;

        for (let i = 0; i < houseData.length; i++) {
          const house = houseData[i];
          const houseBoundingBox = house.boundingBox;

            if (carBoundingBox.intersectsBox(houseBoundingBox)) {
                const carBottomY = carBoundingBox.min.y;
                const carTopY = carBoundingBox.max.y;
                const houseBottomY = houseBoundingBox.min.y;
                const houseTopY = houseBoundingBox.max.y;

                 if (carBottomY >= houseTopY - 0.1) {
                    continue;
                } else if (carTopY <= houseBottomY + 0.1) {
                    continue;
                }
              else {
                collidedWithSideOfHouse = true;
                break;
              }
            }
        }

      if (collidedWithSideOfHouse) {
        handleCollision();
      }

        for (let i = 0; i < treeData.length; i++) {
          const tree = treeData[i];
          const treeBoundingSphere = tree.boundingSphere;

            if (carBoundingBox.intersectsSphere(treeBoundingSphere)) {
                  const carBottomY = carBoundingBox.min.y;
                const carTopY = carBoundingBox.max.y;
                const treeTopY =
                    treeBoundingSphere.center.y + treeBoundingSphere.radius;

                 if (carBottomY >= treeTopY - 0.1) {
                    continue;
                  } else {
                    handleCollision();
                    break;
                }
            }
      }


      for (let i = collectibleData.length - 1; i >= 0; i--) {
        const collectibleInfo = collectibleData[i];
          if (carBoundingBox.intersectsBox(collectibleInfo.boundingBox)) {
          scene.remove(collectibleInfo.mesh);
          collectibles.splice(i, 1);
          collectibleData.splice(i, 1);
          const points = collectibleInfo.isWunderbaum ? 3 : 1;
          score.value += points;

            if (!snusCollectAudio) {
                snusCollectAudio = new Audio('/assets/sounds/snus.mp3');
                snusCollectAudio.volume = 1;
            }
            snusCollectAudio.currentTime = 0;
            snusCollectAudio.play().catch((error) => {
                console.error('Error playing snus/wunderbaum collect sound:', error);
            });

          // Show the score above the car
          const screenPos = worldToScreen(car.position.clone(), camera, renderer);
          showScoreDisplay(points, screenPos);

        }
      }

        for (let i = 0; i < pyramidData.length; i++) {
            const pyramidInfo = pyramidData[i];
             pyramidInfo.boundingBox.setFromObject(pyramidInfo.mesh);
            if (carBoundingBox.intersectsBox(pyramidInfo.boundingBox)) {
                const jumpStrength = Math.max(actualSpeed * 0.5, 5);
                makeCarJump(jumpStrength);
                break;
          }
        }

      collectibles.forEach((c) => {
        if (c.userData.isWunderbaum) {
          c.rotation.y += 0.02;
        } else {
          c.rotation.z += 0.01;
        }
      });

      // Update and check moose collisions
      updateMoose(deltaTime);
      checkMooseCollisions();

        const now = performance.now();
      const timeSinceJump = (now - lastJumpTime) / 1000;
      const effectiveGravity = timeSinceJump < JUMP_DELAY ? gravity * 0.2 : gravity;

      verticalVelocity += effectiveGravity * (deltaTime / 1000);
      car.position.y += verticalVelocity * (deltaTime / 1000);


      const groundY = getGroundHeightAtPosition(
        car.position.x,
        car.position.z
      );

      if (car.position.y - carHeight / 2 < groundY) {
        car.position.y = groundY + carHeight / 2;
        verticalVelocity = 0;
        onGround = true;
      } else if (car.position.y - carHeight / 2 > groundY - 1) {
        onGround = false;
      } else {
          onGround = true;
          car.position.y = groundY + carHeight / 2;
          verticalVelocity = 0;
        }


        if (!isTimeUp.value) {
            timeRemaining.value -= deltaTime / 1000;
            if (timeRemaining.value <= 0) {
                timeRemaining.value = 0;
                isTimeUp.value = true;
                endGame();
            }
      }
    }


    if (isGameOver.value && explosionSprite && explosionStartTime !== null) {
        const elapsed = time - explosionStartTime;
        const frame = Math.floor((elapsed / explosionDuration) * totalExplosionFrames);
      if (frame < totalExplosionFrames) {
        const currentColumn = frame % explosionCols;
        const currentRow = Math.floor(frame / explosionCols);

        explosionTexture.offset.x = currentColumn / explosionCols;
        explosionTexture.offset.y = 1 - (currentRow + 1) / explosionRows;
      } else {
        scene.remove(explosionSprite);
        explosionSprite = null;
      }
    }

    renderer.render(scene, camera);
  }
};

const handleCollision = () => {
  isGameOver.value = true;

  if (!explosionAudio) {
    explosionAudio = new Audio('/assets/sounds/boom.mp3');
    explosionAudio.volume = 0.7;
  }
  explosionAudio.currentTime = 0;
  explosionAudio.play().catch((error) => {
    console.error('Error playing explosion sound:', error);
  });

  const explosionMaterial = new THREE.SpriteMaterial({
    map: explosionTexture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  explosionSprite = new THREE.Sprite(explosionMaterial);
  explosionSprite.position.copy(car.position);
  explosionSprite.scale.set(25, 25, 2);

  const explosionOffset = new THREE.Vector3(-3, 0, 5);
  explosionSprite.position.add(explosionOffset);

  scene.add(explosionSprite);

  explosionStartTime = performance.now();

    const cameraPos = camera.position.clone();
  camera.position.copy(cameraPos);

  scene.remove(car);

    velocity = 0;
    angularVelocity = 0;

    setTimeout(() => resetGame(false), 1000);
};

const drawSpeedometer = (speed: number) => {
  if (!speedometerContext || !speedometerCanvas.value) return;

  const ctx = speedometerContext;
  const canvas = speedometerCanvas.value;
  const width = (canvas.width = 200);
  const height = (canvas.height = 200);

  ctx.clearRect(0, 0, width, height);

  ctx.beginPath();
  ctx.arc(width / 2, height / 2, width / 2 - 5, 0, 2 * Math.PI);
  ctx.fillStyle = '#222';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(width / 2, height / 2, width / 2 - 5, 0, 2 * Math.PI);
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 5;
  ctx.stroke();

  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 2;
  const maxSpeed = 200;
  const numTicks = 10;
  const startAngle = 0.8 * Math.PI;
  const endAngle = 2.2 * Math.PI;

  for (let i = 0; i <= numTicks; i++) {
    const angle = startAngle + (i / numTicks) * (endAngle - startAngle);
    const x1 = width / 2 + (width / 2 - 20) * Math.cos(angle);
    const y1 = height / 2 + (height / 2 - 20) * Math.sin(angle);
    const x2 = width / 2 + (width / 2 - 30) * Math.cos(angle);
    const y2 = height / 2 + (height / 2 - 30) * Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    const speedLabel = (i * (maxSpeed / numTicks)).toString();
    const labelX = width / 2 + (width / 2 - 40) * Math.cos(angle);
    const labelY = height / 2 + (height / 2 - 40) * Math.sin(angle) + 5;
    ctx.fillStyle = '#fff';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(speedLabel, labelX, labelY);
  }

  const needleAngle =
    startAngle + (speed / maxSpeed) * (endAngle - startAngle);
  const needleLength = width / 2 - 40;
  const needleX = width / 2 + needleLength * Math.cos(needleAngle);
  const needleY = height / 2 + needleLength * Math.sin(needleAngle);

  ctx.strokeStyle = 'red';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(width / 2, height / 2);
  ctx.lineTo(needleX, needleY);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(width / 2, height / 2, 5, 0, 2 * Math.PI);
  ctx.fillStyle = '#fff';
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.font = '12px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(speed)} km/h`, width / 2, height / 2 + 30);
};

const onKeyDown = (event: KeyboardEvent) => {
  if (showVehicleSelection.value) {
    if (event.key === 'Enter' && car) {
      event.preventDefault();
      showVehicleSelection.value = false;
      resetGame(true);
      if (vehicleSelectionMusic) {
        vehicleSelectionMusic.pause();
        vehicleSelectionMusic.currentTime = 0;
      }
      playBackgroundMusic();
    }
  } else if (showHighScoreInput.value) {
    // Press enter to submit
    if (event.key === 'Enter') {
      event.preventDefault();
      submitHighScore();
    }
  } else if (showHighScoreList.value) {
    // Press enter to restart game
    if (event.key === 'Enter') {
      event.preventDefault();
      restartGame();
    }
  } else {
    // Toggle dev info when § key is pressed
    if (event.key === '§' || event.key === '±' || event.key === '`' || event.code === 'Backquote') {
      event.preventDefault();
      showDevInfo.value = !showDevInfo.value;
      console.log("Dev info toggled:", showDevInfo.value); // Debug log
    }

    if (event.key in keys) {
      event.preventDefault();
      keys[event.key] = true;
    }
  }
};

const onKeyUp = (event: KeyboardEvent) => {
  if (event.key in keys) {
    event.preventDefault();
    keys[event.key] = false;
  }
};

const handleResize = () => {
  const container = gameContainer.value;
  if (!container) return;

  const containerWidth = container.clientWidth;
  const containerHeight = container.clientHeight;
  const aspectRatio = RENDERER_WIDTH / RENDERER_HEIGHT;

  let width = containerWidth;
  let height = containerWidth / aspectRatio;

  if (height > containerHeight) {
    height = containerHeight;
    width = containerHeight * aspectRatio;
  }

  renderer.domElement.style.width = `${width}px`;
  renderer.domElement.style.height = `${height}px`;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  if (vehicleSelectionCamera) {
    vehicleSelectionCamera.aspect = width / height;
    vehicleSelectionCamera.updateProjectionMatrix();
  }
};

const onMountedHandler = () => {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  if (gameContainer.value) {
    initScene();
    initVehicleSelectionScene();
  }
  window.addEventListener('resize', handleResize);
  handleResize();

  const savedScores = JSON.parse(localStorage.getItem('highScores') || '[]');
  highScores.value = savedScores;
};

watch(
  () => speedometerCanvas.value,
  (newCanvas) => {
    if (newCanvas) {
      speedometerContext = newCanvas.getContext('2d');
    }
  }
);

const resetGame = (isInitialSpawn = false) => {
  if (!car) return;

  isGameOver.value = false;
  isTimeUp.value = false;

  if (explosionSprite) {
    scene.remove(explosionSprite);
    explosionSprite = null;
  }
  explosionStartTime = null;

  ambientLight.intensity = 1;

  if (!scene.children.includes(car)) {
    scene.add(car);
  }

  velocity = 0;
  angularVelocity = 0;
  verticalVelocity = 0;

  if (isInitialSpawn) {
    // Set fixed spawn position for initial game start
    car.position.set(-120.3, -1.15, 489.81);

    // Set car to face 90 degrees to the left (Math.PI/2 radians)
    car.rotation.set(0, Math.PI/2, 0);

    // Immediately copy to lastCarPosition to prevent any "snapping" effect
    lastCarPosition.copy(car.position);

    // If we have a camera, update its position and orientation to match the car's new direction
    if (camera) {
      // Calculate the new camera position based on the car's rotated orientation
      const carForward = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI/2);
      const cameraDistance = 10; // Distance from car
      const cameraHeight = 5;    // Height above car

      const cameraOffset = carForward.clone().multiplyScalar(-cameraDistance);
      cameraOffset.y = cameraHeight;

      const targetPosition = car.position.clone().add(cameraOffset);
      camera.position.copy(targetPosition);

      // Look at the car from this new position
      const lookTarget = car.position.clone();
      lookTarget.y += 3; // Look a bit above the car
      camera.lookAt(lookTarget);
    }
  } else {
    // For respawns after collision, keep the random spawn logic
    car.position.y = -1.65;

    // Ensure car spawns within the map boundaries, not outside the tree fencing
    const mapWidth = columns * blockSpacing;
    const mapHeight = rows * blockSpacing;

    // Calculate a safe spawn area (within 80% of the map to avoid spawning too close to the edges)
    const safeAreaWidth = mapWidth * 0.8;
    const safeAreaHeight = mapHeight * 0.8;

    const randomX = (Math.random() - 0.5) * safeAreaWidth;
    const randomZ = (Math.random() - 0.5) * safeAreaHeight;

    car.position.set(randomX, car.position.y, randomZ);
  }

  // Remove the general car.rotation.set(0, 0, 0) line since we're handling
  // rotation specifically in each spawn case now
};

const endGame = () => {
  isGameOver.value = true;
  showHighScoreInput.value = true;
  velocity = 0;
    angularVelocity = 0;
};

const submitHighScore = () => {
  const newScore = {
    name: playerName.value || 'Anonymous',
    score: score.value,
  };

  const existingScores = JSON.parse(
    localStorage.getItem('highScores') || '[]'
  );

  existingScores.push(newScore);

  existingScores.sort((a: any, b: any) => b.score - a.score);

  existingScores.splice(10);

  localStorage.setItem('highScores', JSON.stringify(existingScores));

  highScores.value = existingScores;

  showHighScoreInput.value = false;
  showHighScoreList.value = true;
};

const restartGame = () => {
  isGameOver.value = false;
  isTimeUp.value = false;
  showHighScoreList.value = false;
  timeRemaining.value = 60;
  score.value = 0;
  playerName.value = '';
  resetGame(true);

    collectibles.forEach((collectible) => {
      scene.remove(collectible);
    });
    collectibles = [];
    collectibleData.splice(0, collectibleData.length);


  pyramids.forEach((pyramid) => {
        scene.remove(pyramid);
    });
    pyramids = [];
    pyramidData.splice(0, pyramidData.length);

  generateCollectibles();
  generatePyramids();
  mooseData.forEach((moose) => {
    scene.remove(moose.mesh);
  });
  mooseData.splice(0, mooseData.length);
  generateMoose();
};

const playBackgroundMusic = () => {
  if (!backgroundAudio) {
    backgroundAudio = new Audio('/assets/sounds/barseback.mp3');
    backgroundAudio.loop = true;
    backgroundAudio.volume = 1;
  }
  backgroundAudio.play().catch((error) => {
    console.error('Error playing background music:', error);
  });
};

const playVehicleSelectionMusic = () => {
  if (!vehicleSelectionMusic) {
    vehicleSelectionMusic = new Audio('/assets/sounds/1080.mp3');
    vehicleSelectionMusic.loop = true;
      vehicleSelectionMusic.volume = 0.7;
  }
  vehicleSelectionMusic.play().catch((error) => {
    console.error('Error playing vehicle selection music:', error);
  });
};

const startGame = () => {
  showOverlay.value = false;
  showVehicleSelection.value = true;
  playVehicleSelectionMusic();
};

const currentChannel = ref('local');
let onlineRadio: HTMLAudioElement | null = null;
let fifaAudio: HTMLAudioElement | null = null;
let timeAudio: HTMLAudioElement | null = null;

const toggleRadioChannel = () => {
  if (currentChannel.value === 'local') {
      if (!onlineRadio) {
      onlineRadio = new Audio('https://stream.radiogellivare.se/listen/977mhz/radio.mp3');
      onlineRadio.volume = 2;
      }
      if(backgroundAudio) {
          backgroundAudio.pause();
      }
    onlineRadio.play().catch(error => {
      console.error('Error playing online radio:', error);
    });
    currentChannel.value = 'online';
  } else if (currentChannel.value === 'online') {
    if (onlineRadio) {
      onlineRadio.pause();
    }
      if (!fifaAudio) {
        fifaAudio = new Audio('/assets/sounds/fifa.mp3');
        fifaAudio.loop = true;
          fifaAudio.volume = 0.7;
    }
      fifaAudio.play().catch(error => {
          console.error('Error playing FIFA radio:', error);
      });
    currentChannel.value = 'fifa';
  } else if (currentChannel.value === 'fifa') {
      if (fifaAudio) {
        fifaAudio.pause();
      }
      if(backgroundAudio){
          backgroundAudio.play().catch(error => {
              console.error('Error playing background music:', error);
          });
      }
    currentChannel.value = 'local';
  } else {
        if (fifaAudio) {
          fifaAudio.pause();
        }
      if (!timeAudio) {
        timeAudio = new Audio('/assets/sounds/barseback.mp3');
        timeAudio.loop = true;
          timeAudio.volume = 0.7;
      }
      timeAudio.play().catch(error => {
        console.error('Error playing Time radio:', error);
      });
      currentChannel.value = 'time';
  }
};

const scoreDisplayVisible = ref(false);
const scoreDisplayValue = ref('');
const scoreDisplayPosition = ref({ x: 0, y: 0 });

const showScoreDisplay = (value: number, screenPosition: {x: number; y: number}) => {
  scoreDisplayValue.value = `+${value}`;
    // Show a bit above the car
    scoreDisplayPosition.value = { x: screenPosition.x, y: screenPosition.y - 50 };
  scoreDisplayVisible.value = true;

  // Hide the score display after a short duration
  setTimeout(() => {
    scoreDisplayVisible.value = false;
  }, 1000); // Display for 1 second
};

onMounted(onMountedHandler);

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);

  if (renderer) {
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  }

  if (scene) {
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach((material) => material.dispose());
          } else {
            object.material.dispose();
          }
        }
      }
    });
  }
  window.removeEventListener('resize', handleResize);

  if (backgroundAudio) {
      backgroundAudio.pause();
    backgroundAudio = null;
  }

  if (explosionAudio) {
      explosionAudio.pause();
      explosionAudio = null;
  }

  if (vehicleSelectionMusic) {
    vehicleSelectionMusic.pause();
    vehicleSelectionMusic = null;
  }

  if (onlineRadio) {
    onlineRadio.pause();
    onlineRadio = null;
  }

  if (snusCollectAudio) {
    snusCollectAudio.pause();
    snusCollectAudio = null;
  }

  if (fifaAudio) {
      fifaAudio.pause
fifaAudio = null;
  }

    if (timeAudio) {
        timeAudio.pause();
        timeAudio = null;
    }

  if (mooseHitAudio) {
    mooseHitAudio.pause();
    mooseHitAudio = null;
  }
});

const createMooseModel = (): THREE.Group => {
  const mooseGroup = new THREE.Group();

  // Body
  const bodyGeometry = new THREE.BoxGeometry(3, 2, 5);
  const bodyMaterial = new THREE.MeshBasicMaterial({ color: 0x5D4037 });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.y = 2;
  mooseGroup.add(body);

  // Head
  const headGeometry = new THREE.BoxGeometry(2, 2, 2.5);
  const headMaterial = new THREE.MeshBasicMaterial({ color: 0x4E342E });
  const head = new THREE.Mesh(headGeometry, headMaterial);
  head.position.set(0, 3.5, 3);
  mooseGroup.add(head);

  // Legs
  const legGeometry = new THREE.CylinderGeometry(0.4, 0.4, 2, 8);
  const legMaterial = new THREE.MeshBasicMaterial({ color: 0x3E2723 });

  // Front right leg
  const frontRightLeg = new THREE.Mesh(legGeometry, legMaterial);
  frontRightLeg.position.set(1, 0, 2);
  mooseGroup.add(frontRightLeg);

  // Front left leg
  const frontLeftLeg = new THREE.Mesh(legGeometry, legMaterial);
  frontLeftLeg.position.set(-1, 0, 2);
  mooseGroup.add(frontLeftLeg);

  // Back right leg
  const backRightLeg = new THREE.Mesh(legGeometry, legMaterial);
  backRightLeg.position.set(1, 0, -2);
  mooseGroup.add(backRightLeg);

  // Back left leg
  const backLeftLeg = new THREE.Mesh(legGeometry, legMaterial);
  backLeftLeg.position.set(-1, 0, -2);
  mooseGroup.add(backLeftLeg);

  // Antlers
  const antlerMaterial = new THREE.MeshBasicMaterial({ color: 0x3E2723 });

  // Left antler
  const leftAntlerGroup = new THREE.Group();
  leftAntlerGroup.position.set(-1.2, 4.2, 2.8);

  const leftAntlerBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.3, 1, 8),
    antlerMaterial
  );
  leftAntlerBase.rotation.x = Math.PI / 4;
  leftAntlerBase.rotation.z = -Math.PI / 6;
  leftAntlerGroup.add(leftAntlerBase);

  const leftAntlerTop = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.3, 0.7),
    antlerMaterial
  );
  leftAntlerTop.position.set(-0.8, 0.6, 0.3);
  leftAntlerGroup.add(leftAntlerTop);

  mooseGroup.add(leftAntlerGroup);

  // Right antler
  const rightAntlerGroup = new THREE.Group();
  rightAntlerGroup.position.set(1.2, 4.2, 2.8);

  const rightAntlerBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.3, 1, 8),
    antlerMaterial
  );
  rightAntlerBase.rotation.x = Math.PI / 4;
  rightAntlerBase.rotation.z = Math.PI / 6;
  rightAntlerGroup.add(rightAntlerBase);

  const rightAntlerTop = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.3, 0.7),
    antlerMaterial
  );
  rightAntlerTop.position.set(0.8, 0.6, 0.3);
  rightAntlerGroup.add(rightAntlerTop);

  mooseGroup.add(rightAntlerGroup);

  // Scale down the entire moose
  mooseGroup.scale.set(0.7, 0.7, 0.7);

  return mooseGroup;
};

const generateMoose = (count?: number) => {
  const numMoose = count || 15; // Default is 15 if not specified
  const mapWidth = columns * blockSpacing;
  const mapHeight = rows * blockSpacing;

  // Rest of the function remains the same
  for (let i = 0; i < numMoose; i++) {
    const moose = createMooseModel();

    // Place moose randomly on the map, but avoid roads and houses
    let validPosition = false;
    let mooseX = 0, mooseZ = 0;
    let attempts = 0;

    while (!validPosition && attempts < 50) {
      attempts++;

      // Random position within the map
      mooseX = Math.random() * mapWidth - mapWidth / 4;
      mooseZ = Math.random() * mapHeight - mapHeight / 4;

      // Check distance from any road
      const nearRoad = (mooseX % blockSpacing < roadWidth * 1.5) ||
                        (mooseZ % blockSpacing < roadWidth * 1.5);

      if (!nearRoad) {
        validPosition = true;

        // Check distance from houses
        for (const house of houseData) {
          const dx = mooseX - house.position.x;
          const dz = mooseZ - house.position.z;
          const distance = Math.sqrt(dx * dx + dz * dz);

          if (distance < 15) {
            validPosition = false;
            break;
          }
        }

        // Also check distance from trees
        if (validPosition) {
          for (const tree of treeData) {
            const dx = mooseX - tree.position.x;
            const dz = mooseZ - tree.position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);

            if (distance < tree.boundingSphere.radius * 1.5) {
              validPosition = false;
              break;
            }
          }
        }
      }
    }

    // If we found a valid position
    if (validPosition) {
      // Random initial rotation
      const randomRotation = Math.random() * Math.PI * 2;
      moose.rotation.y = randomRotation - Math.PI/2; // Adjust to face direction of travel

      // Position the moose
      moose.position.set(mooseX, 0, mooseZ);
      scene.add(moose);

      // Calculate a random movement direction
      const directionX = Math.cos(randomRotation);
      const directionZ = Math.sin(randomRotation);
      const direction = new THREE.Vector3(directionX, 0, directionZ).normalize();

      // Speed 0.5-1.5 units per second
      const speed = 20 + Math.random() * 15.0; // Much faster speed: 20-35 units/second

      // Add to moose data array
      const boundingBox = new THREE.Box3().setFromObject(moose);
      mooseData.push({
        mesh: moose,
        boundingBox,
        direction,
        speed,
        lastDirectionChange: performance.now(),
        points: 5 // Points awarded for hitting a moose
      });
    }
  }
};

// Add these functions before the animate function
const updateMoose = (deltaTime: number) => {
  const currentTime = performance.now();
  const mapWidth = columns * blockSpacing;
  const mapHeight = rows * blockSpacing;

  for (const moose of mooseData) {
    // Change direction randomly (every 3-8 seconds)
    const directionChangeInterval = 8000 + Math.random() * 12000; // Change less frequently (8-20 seconds)
    if (currentTime - moose.lastDirectionChange > directionChangeInterval) {
      const randomAngle = Math.random() * Math.PI * 2;
      const dirX = Math.cos(randomAngle);
      const dirZ = Math.sin(randomAngle);
      moose.direction.set(dirX, 0, dirZ).normalize();
      moose.lastDirectionChange = currentTime;

      // Update moose rotation to match direction
      moose.mesh.rotation.y = Math.atan2(moose.direction.z, moose.direction.x) - Math.PI/2;
    }

    // Move moose according to its speed and direction
    const moveDistance = moose.speed * (deltaTime / 1000);

    // Check next position for collisions before moving
    const nextX = moose.mesh.position.x + moose.direction.x * moveDistance;
    const nextZ = moose.mesh.position.z + moose.direction.z * moveDistance;

    let canMove = true;

    // Check for house collisions
    for (const house of houseData) {
      const houseBB = house.boundingBox;
      const buffer = 2;

      if (nextX > houseBB.min.x - buffer &&
          nextX < houseBB.max.x + buffer &&
          nextZ > houseBB.min.z - buffer &&
          nextZ < houseBB.max.z + buffer) {
        canMove = false;

        // Reverse direction
        moose.direction.x *= -1;
        moose.direction.z *= -1;
        moose.mesh.rotation.y = Math.atan2(moose.direction.z, moose.direction.x) - Math.PI/2;
        moose.lastDirectionChange = currentTime;
        break;
      }
    }

    // Check for tree collisions
    if (canMove) {
      for (const tree of treeData) {
        const dx = nextX - tree.position.x;
        const dz = nextZ - tree.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);

        if (distance < tree.boundingSphere.radius * 1.2) {
          canMove = false;

          // Reverse direction
          moose.direction.x *= -1;
          moose.direction.z *= -1;
          moose.mesh.rotation.y = Math.atan2(moose.direction.z, moose.direction.x) - Math.PI/2;
          moose.lastDirectionChange = currentTime;
          break;
        }
      }
    }

    // Only move if no collisions detected
    if (canMove) {
      moose.mesh.position.x += moose.direction.x * moveDistance;
      moose.mesh.position.z += moose.direction.z * moveDistance;
    }

    // Keep moose within the map bounds - outside the road grid
    if (moose.mesh.position.x < -mapWidth / 2.5) {
      moose.mesh.position.x = -mapWidth / 2.5;
      moose.direction.x *= -1;
      moose.mesh.rotation.y = Math.atan2(moose.direction.z, moose.direction.x) - Math.PI/2;
    }
    if (moose.mesh.position.x > mapWidth * 1.25) {
      moose.mesh.position.x = mapWidth * 1.25;
      moose.direction.x *= -1;
      moose.mesh.rotation.y = Math.atan2(moose.direction.z, moose.direction.x) - Math.PI/2;
    }
    if (moose.mesh.position.z < -mapHeight / 2.5) {
      moose.mesh.position.z = -mapHeight / 2.5;
      moose.direction.z *= -1;
      moose.mesh.rotation.y = Math.atan2(moose.direction.z, moose.direction.x) - Math.PI/2;
    }
    if (moose.mesh.position.z > mapHeight * 1.25) {
      moose.mesh.position.z = mapHeight * 1.25;
      moose.direction.z *= -1;
      moose.mesh.rotation.y = Math.atan2(moose.direction.z, moose.direction.x) - Math.PI/2;
    }

    // Update moose bounding box
    moose.boundingBox.setFromObject(moose.mesh);
  }
};

const checkMooseCollisions = () => {
  if (car && !isGameOver.value) {
    for (let i = mooseData.length - 1; i >= 0; i--) {
      const moose = mooseData[i];

      if (carBoundingBox.intersectsBox(moose.boundingBox)) {
        // Car hit a moose!
        handleMooseHit(moose, i);
      }
    }
  }
};

const handleMooseHit = (moose: typeof mooseData[0], index: number) => {
  // Add score
  score.value += moose.points;

  // Play sound effect
  if (!mooseHitAudio) {
    mooseHitAudio = new Audio('/assets/sounds/moose.mp3');
    mooseHitAudio.volume = 0.7;
  }

  // Reset the audio and play it
  mooseHitAudio.currentTime = 0;
  mooseHitAudio.play().catch((error) => {
    console.error('Error playing moose hit sound:', error);
  });

  // Display score above the moose
  const screenPos = worldToScreen(moose.mesh.position.clone(), camera, renderer);
  showScoreDisplay(moose.points, screenPos);

  // Remove the moose from the scene and data array
  scene.remove(moose.mesh);
  mooseData.splice(index, 1);

  // Add a small bounce to the car
  const jumpStrength = Math.min(Math.abs(velocity) * 0.4, 3);
  if (jumpStrength > 0.5) {
    makeCarJump(jumpStrength);
  }

  // Occasionally respawn a new moose
  if (Math.random() < 0.7 && mooseData.length < 15) {
    setTimeout(() => {
      generateMoose(1); // Generate a single new moose as replacement
    }, 5000 + Math.random() * 10000); // Random delay between 5-15 seconds
  }
};

// Add these refs near the beginning of the setup function
const showDevInfo = ref(false);
const carPosition = ref(new THREE.Vector3());
const currentSpeed = ref(0);
const currentFps = ref(0);
let frameCount = 0;
let lastFpsUpdateTime = 0;

// Add this to your component's data/variables section
const cameraVerticalOffset = 5; // Default camera height
let targetCameraY = 0;
let currentCameraY = 0;
const cameraLerpFactor = 0.1; // Controls how quickly camera follows (lower = smoother)

// Then modify your animation/game loop where you update the camera position
// Look for code that positions the camera relative to the car and update it like this:
function updateCamera() {
  // Calculate the target camera position based on car's position and orientation
  const carForward = new THREE.Vector3(0, 0, -1).applyQuaternion(car.quaternion);
  const cameraDistance = 10; // Distance from car

  // Calculate the target camera position based on car's horizontal position
  const cameraOffset = carForward.clone().multiplyScalar(-cameraDistance);
  const targetCameraPosition = car.position.clone().add(cameraOffset);

  // Smoothly interpolate vertical position only
  targetCameraY = car.position.y + cameraVerticalOffset;
  currentCameraY = THREE.MathUtils.lerp(currentCameraY, targetCameraY, cameraLerpFactor);

  // Apply the smoothed Y position while following X/Z exactly
  camera.position.set(
    targetCameraPosition.x,
    currentCameraY,
    targetCameraPosition.z
  );

  // Look at the car (or slightly above it)
  camera.lookAt(
    car.position.x,
    car.position.y + 2, // Look slightly above the car
    car.position.z
  );
}

// Call updateCamera() in your animation loop
// ... existing code ...

return {
  gameContainer,
  speedometerCanvas,
  isGameOver,
  showOverlay,
  startGame,
  showVehicleSelection,
  timeRemaining,
  score,
  showHighScoreInput,
  playerName,
  highScores,
  showHighScoreList,
  submitHighScore,
  restartGame,
  currentChannel,
  toggleRadioChannel,
  scoreDisplayVisible,
  scoreDisplayValue,
  scoreDisplayPosition,
  showDevInfo,
  carPosition,
  currentSpeed,
  currentFps,
  velocity,  // Make sure to include velocity itself
  angularVelocity,
  onGround
};
},
});
</script>
<style scoped>
.game-container {
position: relative;
display: flex;
justify-content: center;
align-items: center;
background-color: black;
width: 100vw;
height: 100vh;
overflow: hidden;
margin-left: -5rem;
/* CRT Effekt */
filter: contrast(1.05) saturate(1.0) brightness(1.05);
position: relative;
}

.game-container::after {
content: "";
position: absolute;
top: 0;
left: 0;
width: 100%;
height: 100%;
/* Skapa scanlines-effekt */
background: repeating-linear-gradient(
to bottom,
rgba(0, 0, 0, 0.15) 0px,
rgba(0, 0, 0, 0.15) 2px,
transparent 2px,
transparent 4px
);
pointer-events: none;
mix-blend-mode: multiply;
opacity: 0.2;
z-index: 100000;
}

.game-container canvas {
width: 100%;
height: 100%;
image-rendering: pixelated;
}

.tv-overlay {
position: fixed;
top: 3vh;
left: 0;
width: 105vw;
height: 104vh;
pointer-events: none;
z-index: 100;
display: flex;
justify-content: center;
align-items: center;
}

.tv-overlay img {
width: 150%;
height: 150%;
object-fit: contain;
}

.speedometer-container {
position: absolute;
bottom: 7%;
right: 25%;
width: 200px;
height: 200px;
pointer-events: none;
z-index: 10;
}

.speedometer-container canvas {
width: 120%;
height: 120%;
}

.overlay {
position: absolute;
top: 0;
left: 0;
width: 100%;
height: 100%;
background-color: black;
display: flex;
justify-content: center;
align-items: center;
z-index: 10;
overflow: hidden;
}

.overlay-image {
position: absolute;
top: 50%;
left: 50%;
transform: translate(-50%, -50%);
width: 90vw; /* Use viewport width instead of percentage */
max-width: 1000px; /* Set a reasonable max width */
height: auto;
object-fit: contain; /* Use contain instead of fill */
}

.play-button {
position: absolute;
bottom: 35%;
left: 50%;
transform: translateX(-50%);
padding: 10px 20px;
font-size: 32px;
cursor: pointer;
border-radius: 24px;
}

/* Vehicle Selection Overlay Styles */
.vehicle-selection-overlay {
position: absolute;
top: 0;
left: -3%;
width: 100%;
height: 100%;
background-color: transparent;
display: flex;
flex-direction: column;
justify-content: center;
align-items: center;
z-index: 10;
}

.vehicle-stats {
position: absolute;
color: white;
text-align: center;
margin-top: 55vh;
font-size: 1.5vw;
font-family: 'Press Start 2P', 'VT323', 'Pixelated MS Sans Serif', 'Monaco',
monospace;
-webkit-font-smoothing: none;
-moz-osx-font-smoothing: none;
}

/* HUD Styles */
.hud {
position: absolute;
top: 0;
width: 100%;
color: white;
display: flex;
justify-content: space-between;
padding: 10px;
font-family: 'Press Start 2P', 'VT323', 'Pixelated MS Sans Serif', 'Monaco',
monospace;
-webkit-font-smoothing: none;
-moz-osx-font-smoothing: none;
z-index: 10;
}

.timer {
position: absolute;
top: 5vh;
left: -8vh;
font-size: 24px;
text-align: center;
width: 100%;
}

.score {
position: absolute;
top: 6vh;
left: 20%;
font-size: 24px;
}

/* High Score Input Styles */
.high-score-input,
.high-score-list {
position: absolute;
top: 0;
left: 0;
width: 100%;
height: 100%;
background-color: rgba(0, 0, 0, 0.8);
display: flex;
justify-content: center;
align-items: center;
z-index: 20;
font-family: 'Press Start 2P', 'VT323', 'Pixelated MS Sans Serif', 'Monaco', monospace;
-webkit-font-smoothing: none;
-moz-osx-font-smoothing: none;
}

.high-score-content {
background-color: #222;
padding: 20px;
border-radius: 10px;
text-align: center;
color: white;
}

.high-score-content h2 {
margin-bottom: 20px;
font-size: 24px;
}

.high-score-content input {
width: 80%;
padding: 10px;
margin-bottom: 10px;
font-size: 16px;
font-family: 'Press Start 2P', 'VT323', 'Pixelated MS Sans Serif', 'Monaco', monospace;
-webkit-font-smoothing: none;
-moz-osx-font-smoothing: none;
}

.high-score-content button {
padding: 10px 20px;
font-size: 18px;
cursor: pointer;
font-family: 'Press Start 2P', 'VT323', 'Pixelated MS Sans Serif', 'Monaco', monospace;
-webkit-font-smoothing: none;
-moz-osx-font-smoothing: none;
}

.high-score-content ol {
list-style: none;
padding: 0;
margin: 0 0 20px 0;
}

.high-score-content li {
margin: 5px 0;
font-size: 18px;
}

.radio-interface {
position: absolute;
bottom: 7%;
left: 18%;
background: rgba(0, 0, 0, 0.8);
border: 2px solid #444;
border-radius: 5px;
padding: 10px;
color: #0f0;
font-family: 'Press Start 2P', monospace;
z-index: 10;
}

.radio-display {
background: #111;
padding: 8px;
margin-bottom: 8px;
border: 1px solid #333;
}

.radio-text {
font-size: 12px;
margin-bottom: 4px;
}

.radio-frequency {
font-size: 14px;
}

.radio-button {
background: #333;
color: #0f0;
border: 1px solid #444;
padding: 5px 10px;
font-family: 'Press Start 2P', monospace;
cursor: pointer;
width: 100%;
}

.radio-button:hover {
background: #444;
}

.score-display {
position: absolute;
color: rgb(255, 255, 255);
font-size: 52px;
font-family: 'Press Start 2P', 'VT323', 'Pixelated MS Sans Serif', 'Monaco', monospace;
transition: transform 0.5s ease, opacity 0.5s ease;
opacity: 1;
margin-top: -10%;
margin-left: 8%;
z-index: 999;
}

/* Developer Info Window Styles */
.dev-info-window {
position: absolute;
top: 10%;
right: 10%;
background: rgba(0, 0, 0, 0.8);
color: #0f0;
font-family: monospace;
padding: 10px;
border: 1px solid #0f0;
border-radius: 5px;
z-index: 1000;
font-size: 12px;
max-width: 300px;
pointer-events: none;
}

.dev-info-window h3 {
margin: 0 0 5px 0;
font-size: 14px;
text-align: center;
border-bottom: 1px solid #0f0;
padding-bottom: 5px;
}

.dev-info-window p {
margin: 3px 0;
font-size: 12px;
}
</style>
