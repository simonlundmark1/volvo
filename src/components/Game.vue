<template>
  <div class="game-container" ref="gameContainer">
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
        <p>Press Enter to select</p>
      </div>
    </div>
  </div>
  <!-- Speedometer -->
  <div v-if="!showOverlay && !showVehicleSelection" class="speedometer-container">
    <canvas ref="speedometerCanvas" width="200" height="200"></canvas>
  </div>
  <!-- HUD (Heads-Up Display) -->
  <div v-if="!showOverlay && !showVehicleSelection && !showHighScoreInput && !showHighScoreList" class="hud">
    <div class="timer">{{ Math.ceil(timeRemaining) }}</div>
    <div class="score">Score: {{ score }}</div>
  </div>
  <!-- High Score Input Screen -->
  <div v-if="showHighScoreInput" class="high-score-input">
    <div class="high-score-content">
      <h2>Time's Up!</h2>
      <p>Your Score: {{ score }}</p>
      <input v-model="playerName" placeholder="Enter your name" />
      <button @click="submitHighScore">Submit</button>
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
    const keys: Record<string, boolean> = {
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
    const DECELERATION = 1.5;
    const FRICTION = 0.993;

    const MAX_STEERING_SENSITIVITY = 0.25;
    const MIN_STEERING_SENSITIVITY = 0.1;

    // Constants for Tilting
    const MAX_TILT_ANGLE = THREE.MathUtils.degToRad(-15);
    const TILT_LERP_FACTOR = 0.3;

    // Current Tilt Angle of the Car
    let currentTiltAngle = 0;

    // Constants for Renderer Dimensions and Grid
    const RENDERER_WIDTH = 480;
    const RENDERER_HEIGHT = 360;
    const rows = 10;
    const columns = 10;
    const blockSize = 60;
    const roadWidth = 15;
    const blockSpacing = blockSize + roadWidth;
    const roadHeight = 0.02;

    // Data for Houses and Trees
    const houseData: Array<{
      position: THREE.Vector3;
      boundingBox: THREE.Box3;
    }> = [];
    const treeData: Array<{
      position: THREE.Vector3;
      scale: number;
      boundingSphere: THREE.Sphere;
    }> = [];

    // Data for Pyramids and Collectibles Bounding Boxes
    const pyramidData: Array<{
      mesh: THREE.Mesh;
      boundingBox: THREE.Box3;
    }> = [];
    const collectibleData: Array<{
      mesh: THREE.Mesh;
      boundingBox: THREE.Box3;
    }> = [];

    // Ambient Light Reference
    let ambientLight: THREE.AmbientLight;

    const handleLoadingError = (error: unknown, assetType: string) => {
      console.error(`Error loading ${assetType}:`, error);
    };

    // Explosion Texture and Animation Parameters
    let explosionTexture: THREE.Texture;
    const explosionRows = 4;
    const explosionCols = 4;
    const totalExplosionFrames = explosionRows * explosionCols;
    const explosionDuration = 1000;

    // Explosion Audio
    let explosionAudio: HTMLAudioElement | null = null;

    // Initialize Vehicle Selection Scene
    const initVehicleSelectionScene = () => {
      // Initialize Scene
      vehicleSelectionScene = new THREE.Scene();

      // Initialize Camera
      vehicleSelectionCamera = new THREE.PerspectiveCamera(
        90,
        RENDERER_WIDTH / RENDERER_HEIGHT,
        0.1,
        1000
      );
      vehicleSelectionCamera.position.set(7, 1, -2);
      vehicleSelectionCamera.lookAt(-1, 0, 0);

      // Set Background to Black
      vehicleSelectionScene.background = new THREE.TextureLoader().load(
        '/assets/images/showroom.webp'
      );

      // Add Ambient Light
      const ambientLightSelection = new THREE.AmbientLight(0xffffff, 0.1);
      vehicleSelectionScene.add(ambientLightSelection);

      // Load the Car Model
      const objLoader = new OBJLoader();
      objLoader.load(
        '/assets/models/model_0.obj',
        (object) => {
          vehicleSelectionCar = object;

          // Set Scale and Position
          vehicleSelectionCar.scale.set(0.01, 0.01, 0.01);
          vehicleSelectionCar.position.set(0, -2.5, 0);

          // Rotate to Face Positive Z-axis
          vehicleSelectionCar.rotation.y += Math.PI;

          // Load Texture for the Car
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

              // Apply Texture to All Meshes in the Car Object
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

          // Add Car to the Vehicle Selection Scene
          vehicleSelectionScene.add(vehicleSelectionCar);
          console.log(
            'Vehicle selection car model loaded successfully with the correct texture'
          );
        },
        undefined,
        (error) => handleLoadingError(error, 'model_0.obj')
      );
    };

    // Initialize Main Game Scene
    const initScene = () => {
      // Initialize Scene
      scene = markRaw(new THREE.Scene());

      // Initialize Camera
      camera = markRaw(
        new THREE.PerspectiveCamera(
          75,
          RENDERER_WIDTH / RENDERER_HEIGHT,
          0.1,
          10000
        )
      );
      camera.position.set(0, 5, 10);
      camera.lookAt(0, 0, 0);

      // Initialize Renderer
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

      // Append Renderer to the DOM
      if (gameContainer.value) {
        gameContainer.value.appendChild(renderer.domElement);
      } else {
        console.error('Game container is not available');
      }

      // Add Ambient Light with Warmer Color
      ambientLight = new THREE.AmbientLight(0xffd4a3, 1);
      scene.add(ambientLight);

      // Add Directional Light for Warm Highlights
      const directionalLight = new THREE.DirectionalLight(0xff9933, 0.5);
      directionalLight.position.set(1, 1, 0);
      scene.add(directionalLight);

      // Initialize Texture Loader
      const textureLoader = new THREE.TextureLoader();

      // Load Ground Texture
      const groundTexture = textureLoader.load(
        '/assets/textures/ground.jpg',
        (texture: THREE.Texture) => {
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(100, 100);
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

      // Create Ground Mesh
      const planeGeometry = new THREE.PlaneGeometry(2000, 2000);
      const planeMaterial = new THREE.MeshBasicMaterial({
        map: groundTexture,
        side: THREE.DoubleSide,
      });
      const ground = new THREE.Mesh(planeGeometry, planeMaterial);
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(0, 0, 0);
      scene.add(ground);

      // Load Road Texture
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

      // Define Road and Grid Properties
      const roadWidth = 15;
      const roadHeight = 0.02;
      const blockSize = 60;
      const rows = 10;
      const columns = 10;
      const blockSpacing = blockSize + roadWidth;

      // Create Road Material
      const roadMaterial = new THREE.MeshBasicMaterial({
        map: roadTexture,
      });

      // Create Horizontal Roads (X-axis)
      for (let row = 0; row <= rows; row++) {
        const roadGeometry = new THREE.BoxGeometry(
          columns * blockSpacing,
          roadHeight,
          roadWidth
        );
        const roadMesh = new THREE.Mesh(roadGeometry, roadMaterial);

        // Position Each Horizontal Road
        roadMesh.position.set(
          (columns * blockSpacing) / 2 - blockSpacing / 2,
          roadHeight / 2,
          row * blockSpacing - blockSpacing / 2
        );

        // Add to Scene
        scene.add(roadMesh);
      }

      // Create Vertical Roads (Z-axis)
      for (let col = 0; col <= columns; col++) {
        const roadGeometry = new THREE.BoxGeometry(
          roadWidth,
          roadHeight,
          rows * blockSpacing
        );
        const roadMesh = new THREE.Mesh(roadGeometry, roadMaterial);

        // Position Each Vertical Road
        roadMesh.position.set(
          col * blockSpacing - blockSpacing / 2,
          roadHeight / 2,
          (rows * blockSpacing) / 2 - blockSpacing / 2
        );

        // Add to Scene
        scene.add(roadMesh);
      }

      // Load House Texture
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

      // Prepare Geometries and Materials for Instancing
      const pineTreeGeometry = createPineTreeGeometry();
      const treeMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });

      // Create House Geometry with Roof
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

      // Calculate Total Number of Houses and Trees
      let totalHouses = 0;
      let totalTrees = 0;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < columns; col++) {
          totalHouses += Math.floor(Math.random() * 3) + 1;
          totalTrees += Math.floor(Math.random() * 15) + 20;
        }
      }

      // Create InstancedMeshes
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

      // Index Counters for Instances
      let houseIndex = 0;
      let treeIndex = 0;

      // Add Houses and Trees Using InstancedMesh
      const dummy = new THREE.Object3D();

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < columns; col++) {
          // Center Position of Each Block
          const blockCenterX = col * blockSpacing;
          const blockCenterZ = row * blockSpacing;

          // Randomly Decide the Number of Houses in This Block
          const houseCount = Math.floor(Math.random() * 3) + 1;

          // Store house positions for this block to check tree placement
          const blockHousePositions = [];

          for (let i = 0; i < houseCount; i++) {
            // Randomize Position Within the Block
            const buffer = roadWidth / 2 + 5;
            const offsetX =
              (Math.random() - 0.5) * (blockSize - roadWidth - buffer * 2);
            const offsetZ =
              (Math.random() - 0.5) * (blockSize - roadWidth - buffer * 2);

            const houseX = blockCenterX + offsetX;
            const houseZ = blockCenterZ + offsetZ;

            // Randomize House Size
            const width = Math.random() * 20 + 5;
            const height = Math.random() * 20 + 10;
            const depth = Math.random() * 10 + 5;

            // Update Dummy Object for Transformation
            dummy.position.set(houseX, height / 2, houseZ);
            dummy.scale.set(width / 10, height / 20, depth / 10);
            dummy.updateMatrix();

            // Set the Instance Matrix
            houseInstancedMesh.setMatrixAt(houseIndex, dummy.matrix);
            houseIndex++;

            // Create the transformed bounding box for this instance
            const originalBoundingBox = new THREE.Box3().setFromBufferAttribute(
              combinedHouseGeometry.attributes.position
            );
            const transformedBoundingBox = originalBoundingBox
              .clone()
              .applyMatrix4(dummy.matrix);

            // Store House Data for Collision Detection
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

          // Add Trees with Variable Count and Better Placement
          const treesInBlock = Math.floor(Math.random() * 15) + 20;
          let attempts = 0;
          let placedTrees = 0;

          while (placedTrees < treesInBlock && attempts < 50) {
            // Randomize Tree Position Within the Block
            const buffer = roadWidth / 2 + 3;
            const treeOffsetX =
              (Math.random() - 0.5) * (blockSize - roadWidth - buffer * 2);
            const treeOffsetZ =
              (Math.random() - 0.5) * (blockSize - roadWidth - buffer * 2);

            const treeX = blockCenterX + treeOffsetX;
            const treeZ = blockCenterZ + treeOffsetZ;

            // Check distance from houses
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

            // Check distance from other trees in this block
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
              // Even more varied scale with smaller average size
              const treeScale = 0.4 + Math.random() * 0.3;

              // Random slight tilt for more natural look
              const maxTilt = 0.1;
              const randomTiltX = (Math.random() - 0.5) * maxTilt;
              const randomTiltZ = (Math.random() - 0.5) * maxTilt;

              // Position trees slightly below ground level to fix floating
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

              // Store Tree Data for Collision Detection
              const treePosition = new THREE.Vector3(treeX, -0.2, treeZ);
              const boundingSphere = new THREE.Sphere(
                new THREE.Vector3(
                  treeX,
                  -0.2 + treeScale * 9,
                  treeZ
                ),
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

      // Add InstancedMeshes to the Scene
      scene.add(houseInstancedMesh);
      scene.add(treeInstancedMesh);

      // Generate Collectibles
      generateCollectibles();

      // Add Pyramids Along the Roads and Roofs
      generatePyramids();

      // Load OBJ Model as Car
      const objLoaderMain = new OBJLoader();

      // Load the Car Model
      objLoaderMain.load(
        '/assets/models/model_0.obj',
        (object) => {
          car = object;

          // Set Scale and Position
          car.scale.set(0.01, 0.01, 0.01);
          car.position.y = -1.65;

          // Rotate to Face Positive Z-axis
          car.rotation.y += Math.PI;

          // Load Texture for the Car
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

              // Apply Texture to All Meshes in the Car Object
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

          // Add Car to the Scene
          scene.add(car);
          modelLoaded = true;
          console.log('Car model loaded successfully with the correct texture');
        },
        undefined,
        (error) => handleLoadingError(error, 'model_0.obj')
      );

      // Load Equirectangular Texture for Background
      const textureLoader2 = new THREE.TextureLoader();
      textureLoader2.load(
        '/assets/images/6.png',
        (texture) => {
          // Use PMREMGenerator to process the texture
          const pmremGenerator = new PMREMGenerator(renderer);
          pmremGenerator.compileEquirectangularShader();

          const envMap = pmremGenerator.fromEquirectangular(texture).texture;

          scene.background = envMap;

          // Dispose of the original texture and PMREMGenerator to free up memory
          texture.dispose();
          pmremGenerator.dispose();

          // Add Warm Color Overlay to Sky
          scene.fog = new THREE.FogExp2(0xffd4a3, 0.002);
        },
        undefined,
        (error) => handleLoadingError(error, '6.png')
      );

      // Load Explosion Sprite Sheet Texture
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

    // Variables for the Collectibles
    const timeRemaining = ref(60);
    const score = ref(0);
    let collectibles: THREE.Mesh[] = [];
    const isTimeUp = ref(false);
    const showHighScoreInput = ref(false);
    const showHighScoreList = ref(false);
    const highScores = ref<{ name: string; score: number }[]>([]);
    const playerName = ref('');

    // Variables for Pyramids
    let pyramids: THREE.Mesh[] = [];

    // Function to Generate Collectibles
    const generateCollectibles = () => {
      // Create a sphere geometry for the collectibles
      const collectibleGeometry = new THREE.SphereGeometry(1, 16, 16);
      const collectibleMaterial = new THREE.MeshBasicMaterial({
        color: 0xff0000,
      }); // Red color

      // Increase the number of collectibles
      const numCollectibles = 50;
      const numCollectiblesOnRoofs = 30; // Increased number of collectibles on roofs
      const numCollectiblesOnRoads = numCollectibles - numCollectiblesOnRoofs;

      // Place collectibles on roads
      for (let i = 0; i < numCollectiblesOnRoads; i++) {
        const collectible = new THREE.Mesh(
          collectibleGeometry,
          collectibleMaterial
        );

        // Randomly place the collectible on a road segment
        // First, choose a random row and column
        const randomRow = Math.floor(Math.random() * 10);
        const randomCol = Math.floor(Math.random() * 10);

        // The position of the road segment
        const roadX = randomCol * (60 + 15) - (60 + 15) / 2;
        const roadZ = randomRow * (60 + 15) - (60 + 15) / 2;

        // Randomly position along the road
        const offsetX = (Math.random() - 0.5) * 15 * 0.8; // Slightly within the road width
        const offsetZ = (Math.random() - 0.5) * 15 * 0.8;

        // Decide whether to place on horizontal or vertical road
        if (Math.random() < 0.5) {
          // Horizontal road
          collectible.position.set(
            roadX + offsetX,
            1, // Slightly above ground
            roadZ
          );
        } else {
          // Vertical road
          collectible.position.set(roadX, 1, roadZ + offsetZ);
        }

        // Add to the scene and to the collectibles array
        scene.add(collectible);
        collectibles.push(collectible);

        // Store Bounding Box for Collision Detection
        const boundingBox = new THREE.Box3().setFromObject(collectible);
        collectibleData.push({ mesh: collectible, boundingBox });
      }

      // Place collectibles on roofs
      for (let i = 0; i < numCollectiblesOnRoofs; i++) {
        const collectible = new THREE.Mesh(
          collectibleGeometry,
          collectibleMaterial
        );

        // Randomly select a house
        const randomHouseIndex = Math.floor(Math.random() * houseData.length);
        const house = houseData[randomHouseIndex];
        const houseBoundingBox = house.boundingBox;

        // Randomly position on the roof
        const roofMinX = houseBoundingBox.min.x + 1;
        const roofMaxX = houseBoundingBox.max.x - 1;
        const roofMinZ = houseBoundingBox.min.z + 1;
        const roofMaxZ = houseBoundingBox.max.z - 1;
        const collectibleX = THREE.MathUtils.lerp(
          roofMinX,
          roofMaxX,
          Math.random()
        );
        const collectibleZ = THREE.MathUtils.lerp(
          roofMinZ,
          roofMaxZ,
          Math.random()
        );
        const roofY = houseBoundingBox.max.y + 1; // Slightly above the roof

        collectible.position.set(collectibleX, roofY, collectibleZ);

        // Add to the scene and to the collectibles array
        scene.add(collectible);
        collectibles.push(collectible);

        // Store Bounding Box for Collision Detection
        const boundingBox = new THREE.Box3().setFromObject(collectible);
        collectibleData.push({ mesh: collectible, boundingBox });
      }
    };

    // Function to Generate Pyramids
    const generatePyramids = () => {
      const pyramidGeometry = new THREE.ConeGeometry(2, 1, 8);
      const pyramidMaterial = new THREE.MeshBasicMaterial({
        color: 0xffa500,
      }); // Orange color

      // Increase the number of pyramids
      const numPyramids = 150;
      const numPyramidsOnRoofs = 80;
      const numPyramidsOnRoads = numPyramids - numPyramidsOnRoofs;

      // Place pyramids on roads
      for (let i = 0; i < numPyramidsOnRoads; i++) {
        const pyramid = new THREE.Mesh(pyramidGeometry, pyramidMaterial);

        // Randomly choose a road segment
        const randomRow = Math.floor(Math.random() * (10 + 1));
        const randomCol = Math.floor(Math.random() * (10 + 1));
        const isHorizontal = Math.random() < 0.5;

        // Calculate the position
        let posX, posZ;
        if (isHorizontal) {
          // Horizontal road
          posX = (columns * blockSpacing) / 2 - blockSpacing / 2;
          posX += (Math.random() - 0.5) * (columns * blockSpacing);
          posZ = randomRow * blockSpacing - blockSpacing / 2;
          posX = THREE.MathUtils.clamp(
            posX,
            0,
            columns * blockSpacing - blockSpacing
          );
        } else {
          // Vertical road
          posX = randomCol * blockSpacing - blockSpacing / 2;
          posZ = (rows * blockSpacing) / 2 - blockSpacing / 2;
          posZ += (Math.random() - 0.5) * (rows * blockSpacing);
          posZ = THREE.MathUtils.clamp(
            posZ,
            0,
            rows * blockSpacing - blockSpacing
          );
        }

        // Adjust Y position to be on top of the road
        pyramid.position.set(
          posX,
          roadHeight + pyramidGeometry.parameters.height / 2,
          posZ
        );

        scene.add(pyramid);
        pyramids.push(pyramid);

        // Update the Bounding Box After Transformation
        pyramid.updateMatrixWorld();
        const boundingBox = new THREE.Box3().setFromObject(pyramid);
        pyramidData.push({ mesh: pyramid, boundingBox });
      }

      // Place pyramids on roofs
      for (let i = 0; i < numPyramidsOnRoofs; i++) {
        const pyramid = new THREE.Mesh(pyramidGeometry, pyramidMaterial);

        // Randomly select a house
        const randomHouseIndex = Math.floor(Math.random() * houseData.length);
        const house = houseData[randomHouseIndex];
        const houseBoundingBox = house.boundingBox;

        // Randomly position on the roof
        const roofMinX = houseBoundingBox.min.x + 1;
        const roofMaxX = houseBoundingBox.max.x - 1;
        const roofMinZ = houseBoundingBox.min.z + 1;
        const roofMaxZ = houseBoundingBox.max.z - 1;
        const pyramidX = THREE.MathUtils.lerp(
          roofMinX,
          roofMaxX,
          Math.random()
        );
        const pyramidZ = THREE.MathUtils.lerp(
          roofMinZ,
          roofMaxZ,
          Math.random()
        );
        const roofY =
          houseBoundingBox.max.y +
          pyramidGeometry.parameters.height / 2 +
          0.5; // Raised by 0.5 units

        pyramid.position.set(pyramidX, roofY, pyramidZ);

        // Increase the size of pyramids on roofs for visibility
        pyramid.scale.set(1.5, 1.5, 1.5);

        // Raise the pyramid so it protrudes above the roof
        pyramid.position.y += 0.75; // Adjust as needed

        scene.add(pyramid);
        pyramids.push(pyramid);

        // Update the Bounding Box After Scaling and Positioning
        pyramid.updateMatrixWorld();
        const boundingBox = new THREE.Box3().setFromObject(pyramid);
        pyramidData.push({ mesh: pyramid, boundingBox });
      }
    };

    // Helper Function to Create Detailed Pine Tree Geometry
    const createPineTreeGeometry = (): THREE.BufferGeometry => {
      // Make trunk even smaller
      const trunkGeometry = new THREE.CylinderGeometry(0.4, 0.4, 6, 8); // Smaller trunk
      trunkGeometry.translate(0, 3, 0); // Lower position

      const foliageGeometries: THREE.BufferGeometry[] = [];
      const numLayers = 4; // Keep 4 layers
      const foliageHeight = 12; // Reduced total height
      const layerHeight = foliageHeight / numLayers;

      for (let i = 0; i < numLayers; i++) {
        const radius = 2.5 - i * 0.5; // Smaller radius, starting from 2.5
        const coneGeometry = new THREE.ConeGeometry(radius, layerHeight, 8);
        coneGeometry.translate(0, 6 + i * layerHeight, 0); // Lower position
        foliageGeometries.push(coneGeometry);
      }

      // Merge All Foliage Layers
      const foliageGeometry = BufferGeometryUtils.mergeGeometries(
        foliageGeometries,
        false
      );

      // Create color attribute for the vertices
      const combinedGeometry = BufferGeometryUtils.mergeGeometries(
        [trunkGeometry, foliageGeometry],
        false
      );

      if (!combinedGeometry) {
        console.error('Failed to merge tree geometries');
        return new THREE.BufferGeometry();
      }

      // Create color attribute with darker brown for trunk
      const colors = new Float32Array(
        combinedGeometry.attributes.position.count * 3
      );
      const trunkColor = new THREE.Color(0x3d1f00); // Darker brown
      const foliageColor = new THREE.Color(0x1b5e20); // Darker green

      // First part is trunk vertices, second part is foliage vertices
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

    // Variables for Car Jumping Mechanics
    let verticalVelocity = 0;
    const gravity = -30;

    const makeCarJump = (impactVelocity: number) => {
      if (verticalVelocity === 0) {
        // Calculate Jump Strength Based on Impact Velocity
        const jumpStrength = impactVelocity * 2; // Increased multiplier
        verticalVelocity = THREE.MathUtils.clamp(jumpStrength, 40, 80); // Adjusted limits
      }
    };

    let prevTime = performance.now();

    // Variables for Car Collision and Movement
    let carBoundingBox = new THREE.Box3();
    const carWidth = 2;
    const carHeight = 1;
    const carDepth = 4;

    // Variables for Ground and Roof Detection
    let onGround = true;

    const getGroundHeightAtPosition = (x: number, z: number): number => {
      let maxY = -1.65; // Default ground level

      // Check if the car is over any house
      for (let i = 0; i < houseData.length; i++) {
        const house = houseData[i];
        const houseBoundingBox = house.boundingBox;

        // Add a small buffer to ensure the car is fully over the house
        const buffer = 1.5;
        if (
          x >= houseBoundingBox.min.x + buffer &&
          x <= houseBoundingBox.max.x - buffer &&
          z >= houseBoundingBox.min.z + buffer &&
          z <= houseBoundingBox.max.z - buffer
        ) {
          // Car is over this house
          const roofY = houseBoundingBox.max.y;
          if (roofY > maxY) {
            maxY = roofY;
          }
        }
      }

      // Check for Pyramids
      for (let i = 0; i < pyramidData.length; i++) {
        const pyramidInfo = pyramidData[i];
        const pyramidBoundingBox = pyramidInfo.boundingBox;

        // Add a small buffer for pyramids as well
        const buffer = 1;
        if (
          x >= pyramidBoundingBox.min.x + buffer &&
          x <= pyramidBoundingBox.max.x - buffer &&
          z >= pyramidBoundingBox.min.z + buffer &&
          z <= pyramidBoundingBox.max.z - buffer
        ) {
          const pyramidTopY = pyramidBoundingBox.max.y;
          if (pyramidTopY > maxY) {
            maxY = pyramidTopY;
          }
        }
      }

      return maxY;
    };

    // Add this with other state variables at the top of the setup function:
    let currentLookTargetY = 0;
    const LOOK_UP_HEIGHT = 3;
    const LOOK_TRANSITION_SPEED = 0.1;

    const animate = (time: number) => {
      const deltaTime = time - prevTime; // Time in milliseconds
      prevTime = time;

      requestAnimationFrame(animate);

      if (showVehicleSelection.value) {
        // Vehicle Selection Screen Rendering
        if (vehicleSelectionCar) {
          vehicleSelectionCar.rotation.y += 0.007; // Slow spin
        }
        renderer.render(vehicleSelectionScene, vehicleSelectionCamera);
      } else {
        // Game Running or Game Over
        if (
          modelLoaded &&
          car &&
          !isGameOver.value &&
          !showOverlay.value &&
          !showHighScoreInput.value &&
          !showHighScoreList.value
        ) {
          // Main Game Logic (movement, controls, etc.)

          // Calculate Dynamic Acceleration Based on Current Speed
          const speedFactor = Math.abs(velocity) / MAX_SPEED;
          const accelerationFactor = 1 - speedFactor;
          const currentAcceleration =
            MIN_ACCELERATION +
            (MAX_ACCELERATION - MIN_ACCELERATION) * accelerationFactor;

          // Handle Acceleration and Deceleration
          if (keys.ArrowUp) {
            velocity += currentAcceleration * (deltaTime / 1000);
          }
          if (keys.ArrowDown) {
            velocity -= DECELERATION * (deltaTime / 1000);
          }

          // Apply Friction When No Keys Are Pressed
          if (!keys.ArrowUp && !keys.ArrowDown) {
            velocity *= FRICTION;
          }

          // Clamp the Velocity
          velocity = THREE.MathUtils.clamp(
            velocity,
            MAX_REVERSE_SPEED,
            MAX_SPEED
          );

          // Threshold to Stop the Car When Speed Is Very Low
          const velocityThreshold = 0.001;
          if (Math.abs(velocity) < velocityThreshold) {
            velocity = 0;
          }

          // Move the Car Forward or Backward
          car.translateZ(velocity * (deltaTime / 1000) * 100); // Adjusted multiplier

          const minSteerSpeed = Math.PI / 100;
          let steerFactor = 0;
          if (Math.abs(velocity) > minSteerSpeed) {
            steerFactor = Math.sign(velocity);
          }

          // Calculate Dynamic Steering Sensitivity Based on Current Speed
          const steeringSensitivity =
            MAX_STEERING_SENSITIVITY -
            (MAX_STEERING_SENSITIVITY - MIN_STEERING_SENSITIVITY) * speedFactor;

          // Adjust Rotation Acceleration
          const baseRotationAcceleration = 0.015; // Slightly reduced base rotation acceleration
          const dynamicRotationAcceleration =
            baseRotationAcceleration * steeringSensitivity;

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

          angularVelocity = THREE.MathUtils.clamp(angularVelocity, -0.5, 0.5); // Adjusted turning

          if (steerFactor !== 0) {
            car.rotation.y += angularVelocity * (deltaTime / 1000) * 30; // Adjusted multiplier
          }

          // Calculate Tilt Angle Based on Speed and Angular Velocity
          let targetTiltAngle = 0;
          if (angularVelocity !== 0 && Math.abs(velocity) > minSteerSpeed) {
            const tiltSpeedFactor = Math.abs(velocity) / MAX_SPEED;
            targetTiltAngle =
              -MAX_TILT_ANGLE * (angularVelocity / 0.02) * tiltSpeedFactor;
          }

          // Smoothly Interpolate Current Tilt Angle Towards Target Tilt Angle
          currentTiltAngle = THREE.MathUtils.lerp(
            currentTiltAngle,
            targetTiltAngle,
            TILT_LERP_FACTOR
          );

          // Apply Tilt to the Car Model
          car.rotation.z = currentTiltAngle;

          // Calculate Speed in km/h
          const speedInKmH = Math.abs(velocity) * 100;

          // Draw the Speedometer
          drawSpeedometer(speedInKmH);

          // Camera Follow Logic
          const cameraOffset = new THREE.Vector3(0, 5, -10);

          // Rotate the offset to match the car's rotation
          const offset = cameraOffset.clone().applyQuaternion(car.quaternion);

          // Calculate the desired camera position
          const desiredCameraPosition = car.position.clone().add(offset);

          // Adjust interpolation speed based on whether the car is on the ground
          const interpolationSpeed = onGround ? 0.05 : 0.1; // Looser on ground, tighter in air

          // Smoothly interpolate the camera position
          camera.position.lerp(desiredCameraPosition, interpolationSpeed);

          // Calculate target look height with smooth transition
          const targetLookHeight = onGround ? LOOK_UP_HEIGHT : 0;
          currentLookTargetY = THREE.MathUtils.lerp(
            currentLookTargetY,
            targetLookHeight,
            LOOK_TRANSITION_SPEED
          );

          // Apply the smoothed look target
          const lookTarget = car.position.clone();
          lookTarget.y += currentLookTargetY;

          // Make the camera look at the calculated target
          camera.lookAt(lookTarget);

          // Update Car's Bounding Box
          carBoundingBox.setFromObject(car);

          // Collision Detection with Houses
          let collidedWithSideOfHouse = false;

          for (let i = 0; i < houseData.length; i++) {
            const house = houseData[i];
            const houseBoundingBox = house.boundingBox;

            if (carBoundingBox.intersectsBox(houseBoundingBox)) {
              // Check if the collision is with the sides or the top
              const carBottomY = carBoundingBox.min.y;
              const carTopY = carBoundingBox.max.y;
              const houseBottomY = houseBoundingBox.min.y;
              const houseTopY = houseBoundingBox.max.y;

              if (carBottomY >= houseTopY - 0.1) {
                // Car is above the house, landing on the roof
                // Ground height will handle adjusting the car's position
                continue;
              } else if (carTopY <= houseBottomY + 0.1) {
                // Car is below the house, ignore
                continue;
              } else {
                // Collision with the sides, cause explosion
                collidedWithSideOfHouse = true;
                break;
              }
            }
          }

          if (collidedWithSideOfHouse) {
            handleCollision();
          }

          // Collision Detection with Trees
          for (let i = 0; i < treeData.length; i++) {
            const tree = treeData[i];
            const treeBoundingSphere = tree.boundingSphere;

            if (carBoundingBox.intersectsSphere(treeBoundingSphere)) {
              // Check the vertical position
              const carBottomY = carBoundingBox.min.y;
              const carTopY = carBoundingBox.max.y;
              const treeTopY =
                treeBoundingSphere.center.y + treeBoundingSphere.radius;

              if (carBottomY >= treeTopY - 0.1) {
                // Car is above the tree, passes over it
                continue;
              } else {
                // Collision with the tree
                handleCollision();
                break;
              }
            }
          }

          // Collision Detection with Collectibles
          for (let i = collectibleData.length - 1; i >= 0; i--) {
            const collectibleInfo = collectibleData[i];
            if (carBoundingBox.intersectsBox(collectibleInfo.boundingBox)) {
              // Collectible collected
              scene.remove(collectibleInfo.mesh);
              collectibles.splice(i, 1);
              collectibleData.splice(i, 1);
              score.value += 1;
            }
          }

          // Collision Detection with Pyramids
          for (let i = 0; i < pyramidData.length; i++) {
            const pyramidInfo = pyramidData[i];
            // Update bounding box
            pyramidInfo.boundingBox.setFromObject(pyramidInfo.mesh);
            if (carBoundingBox.intersectsBox(pyramidInfo.boundingBox)) {
              // Collision with pyramid detected
              makeCarJump(Math.abs(velocity));
              break;
            }
          }

          // Apply gravity and vertical movement
          verticalVelocity += gravity * (deltaTime / 1000);
          car.position.y += verticalVelocity * (deltaTime / 1000);

          // Determine the ground height at the car's current position
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

          // Update Timer
          if (!isTimeUp.value) {
            timeRemaining.value -= deltaTime / 1000; // deltaTime is in milliseconds
            if (timeRemaining.value <= 0) {
              timeRemaining.value = 0;
              isTimeUp.value = true;
              // End the game
              endGame();
            }
          }
        }

        // Update Explosion Animation
        if (
          isGameOver.value &&
          explosionSprite &&
          explosionStartTime !== null
        ) {
          const elapsed = time - explosionStartTime;
          const frame = Math.floor(
            (elapsed / explosionDuration) * totalExplosionFrames
          );
          if (frame < totalExplosionFrames) {
            const currentColumn = frame % explosionCols;
            const currentRow = Math.floor(frame / explosionCols);

            explosionTexture.offset.x = currentColumn / explosionCols;
            explosionTexture.offset.y = 1 - (currentRow + 1) / explosionRows;
          } else {
            // After Explosion Animation Ends
            scene.remove(explosionSprite);
            explosionSprite = null;
          }
        }

        // Always Render the Scene
        renderer.render(scene, camera);
      }
    };

    const handleCollision = () => {
      isGameOver.value = true;

      // Play Explosion Sound
      if (!explosionAudio) {
        explosionAudio = new Audio('/assets/sounds/boom.mp3');
        explosionAudio.volume = 1;
      }
      explosionAudio.currentTime = 0; // Reset audio to start
      explosionAudio.play().catch((error) => {
        console.error('Error playing explosion sound:', error);
      });

      // Create the Explosion Sprite
      const explosionMaterial = new THREE.SpriteMaterial({
        map: explosionTexture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
      explosionSprite = new THREE.Sprite(explosionMaterial);
      explosionSprite.position.copy(car.position);
      explosionSprite.scale.set(25, 25, 2);

      // Adjust Explosion Sprite Position to Be Slightly Closer to the Camera
      const explosionOffset = new THREE.Vector3(-3, 0, 5);
      explosionSprite.position.add(explosionOffset);

      scene.add(explosionSprite);

      // Record the Start Time of the Explosion
      explosionStartTime = performance.now();

      // Store the Camera's Current Position
      const cameraPos = camera.position.clone();
      camera.position.copy(cameraPos);

      // Remove the Car from the Scene
      scene.remove(car);

      // Stop the Car's Movement
      velocity = 0;
      angularVelocity = 0;

      setTimeout(() => resetGame(false), 1000);
    };

    // Function to Draw the Speedometer
    const drawSpeedometer = (speed: number) => {
      if (!speedometerContext || !speedometerCanvas.value) return;

      const ctx = speedometerContext;
      const canvas = speedometerCanvas.value;
      const width = (canvas.width = 200);
      const height = (canvas.height = 200);

      ctx.clearRect(0, 0, width, height);

      // Draw the Speedometer Background
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, width / 2 - 5, 0, 2 * Math.PI);
      ctx.fillStyle = '#222'; // Dark background for retro look
      ctx.fill();

      // Draw the Outer Rim
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, width / 2 - 5, 0, 2 * Math.PI);
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 5;
      ctx.stroke();

      // Draw the Speedometer Ticks
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

        // Draw Speed Labels at Each Tick
        const speedLabel = (i * (maxSpeed / numTicks)).toString();
        const labelX = width / 2 + (width / 2 - 40) * Math.cos(angle);
        const labelY = height / 2 + (height / 2 - 40) * Math.sin(angle) + 5;
        ctx.fillStyle = '#fff';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(speedLabel, labelX, labelY);
      }

      // Draw the Needle
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

      // Draw the Center Circle
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, 5, 0, 2 * Math.PI);
      ctx.fillStyle = '#fff';
      ctx.fill();

      // Draw the Speed Text
      ctx.fillStyle = '#fff';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(speed)} km/h`, width / 2, height / 2 + 30);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (showVehicleSelection.value) {
        if (event.key === 'Enter' && car) {
          event.preventDefault();
          // Start the Game
          showVehicleSelection.value = false;
          resetGame(true);
          // Stop Vehicle Selection Music
          if (vehicleSelectionMusic) {
            vehicleSelectionMusic.pause();
            vehicleSelectionMusic.currentTime = 0;
          }
          // Start Background Music
          playBackgroundMusic();
        }
      } else {
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

      // Keep the Renderer Size Fixed to Maintain Pixelation
      renderer.domElement.style.width = `${width}px`;
      renderer.domElement.style.height = `${height}px`;

      // Update Camera Aspect Ratio
      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      // Update Vehicle Selection Camera Aspect Ratio
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

      // Load high scores from localStorage
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

      // Remove Explosion Sprite from Scene
      if (explosionSprite) {
        scene.remove(explosionSprite);
        explosionSprite = null;
      }
      explosionStartTime = null;

      // Reset Ambient Light Intensity to Normal
      ambientLight.intensity = 1;

      // Add the Car Back to the Scene if Not Already There
      if (!scene.children.includes(car)) {
        scene.add(car);
      }

      // Reset Variables
      velocity = 0;
      angularVelocity = 0;
      verticalVelocity = 0;
      car.position.y = -1.65; // Reset to ground level

      // Initial Spawn Position
      if (isInitialSpawn) {
        car.position.set(0, car.position.y, 0);
      } else {
        // Reset Car's Position to a New Random Position
        const maxPosition = rows * blockSpacing; // Use rows instead of 10
        const randomX = (Math.random() - 0.5) * maxPosition;
        const randomZ = (Math.random() - 0.5) * maxPosition;
        car.position.set(randomX, car.position.y, randomZ);
      }

      // Reset Car's Rotation
      car.rotation.set(0, 0, 0);
    };

    // Function to End the Game When Time Is Up
    const endGame = () => {
      isGameOver.value = true;
      showHighScoreInput.value = true;
      // Stop the car's movement
      velocity = 0;
      angularVelocity = 0;
    };

    // Function to Submit High Score
    const submitHighScore = () => {
      // Save the high score
      const newScore = {
        name: playerName.value || 'Anonymous',
        score: score.value,
      };

      // Load existing high scores from localStorage
      const existingScores = JSON.parse(
        localStorage.getItem('highScores') || '[]'
      );

      // Add the new score
      existingScores.push(newScore);

      // Sort the scores descending by score
      existingScores.sort((a: any, b: any) => b.score - a.score);

      // Keep only top 10 scores
      existingScores.splice(10);

      // Save back to localStorage
      localStorage.setItem('highScores', JSON.stringify(existingScores));

      // Update the reactive highScores
      highScores.value = existingScores;

      // Hide the high score input screen and show the high score list
      showHighScoreInput.value = false;
      showHighScoreList.value = true;
    };

    // Function to Restart the Game
    const restartGame = () => {
      // Reset variables
      isGameOver.value = false;
      isTimeUp.value = false;
      showHighScoreList.value = false;
      timeRemaining.value = 60;
      score.value = 0;
      playerName.value = '';
      // Reset the game
      resetGame(true);
      // Remove existing collectibles from the scene
      collectibles.forEach((collectible) => {
        scene.remove(collectible);
      });
      collectibles = [];
      collectibleData.splice(0, collectibleData.length);
      // Remove existing pyramids from the scene
      pyramids.forEach((pyramid) => {
        scene.remove(pyramid);
      });
      pyramids = [];
      pyramidData.splice(0, pyramidData.length);
      // Generate new collectibles and pyramids
      generateCollectibles();
      generatePyramids();
    };

    // Play Background Music
    const playBackgroundMusic = () => {
      if (!backgroundAudio) {
        backgroundAudio = new Audio('/assets/sounds/barseback.mp3');
        backgroundAudio.loop = true;
        backgroundAudio.volume = 0.5;
      }
      backgroundAudio.play().catch((error) => {
        console.error('Error playing background music:', error);
      });
    };

    // Play Vehicle Selection Music
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

    // Start the Game When "Play" is Clicked
    const startGame = () => {
      showOverlay.value = false;
      showVehicleSelection.value = true;
      playVehicleSelectionMusic();
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

      // Stop Background Music
      if (backgroundAudio) {
        backgroundAudio.pause();
        backgroundAudio = null;
      }

      // Stop and Cleanup Explosion Audio
      if (explosionAudio) {
        explosionAudio.pause();
        explosionAudio = null;
      }

      // Stop and Cleanup Vehicle Selection Music
      if (vehicleSelectionMusic) {
        vehicleSelectionMusic.pause();
        vehicleSelectionMusic = null;
      }
    });

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
}

.game-container canvas {
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
}

.speedometer-container {
  position: absolute;
  bottom: 5%;
  right: 5%;
  width: 200px;
  height: 200px;
  pointer-events: none;
}

.speedometer-container canvas {
  width: 100%;
  height: 100%;
}

.overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: black;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 10;
}

.overlay-image {
  max-width: 100%;
  max-height: 80%;
}

.play-button {
  margin-top: 20px;
  padding: 10px 20px;
  font-size: 24px;
  cursor: pointer;
}

/* Vehicle Selection Overlay Styles */
.vehicle-selection-overlay {
  position: fixed;
  top: 0;
  left: 0;
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
  position: fixed;
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
}

.timer {
  font-size: 24px;
  text-align: center;
  width: 100%;
}

.score {
  position: absolute;
  top: 10px;
  left: 10px;
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
}

.high-score-content input {
  width: 80%;
  padding: 10px;
  margin-bottom: 10px;
  font-size: 16px;
}

.high-score-content button {
  padding: 10px 20px;
  font-size: 18px;
  cursor: pointer;
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
</style>
