import { defineComponent, markRaw, onMounted, onBeforeUnmount, ref, watch, } from 'vue';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PMREMGenerator } from 'three';
export default defineComponent({
    name: 'GameComponent',
    setup() {
        const gameContainer = ref(null);
        const speedometerCanvas = ref(null);
        let speedometerContext = null;
        let scene;
        let camera;
        let renderer;
        let car;
        const keys = {
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
        let explosionSprite = null;
        let explosionStartTime = null;
        // Overlay and Background Music
        const showOverlay = ref(true);
        let backgroundAudio = null;
        // Vehicle Selection State
        const showVehicleSelection = ref(false);
        let vehicleSelectionScene;
        let vehicleSelectionCamera;
        let vehicleSelectionCar;
        let vehicleSelectionMusic = null;
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
        const houseData = [];
        const treeData = [];
        const pyramidData = [];
        const collectibleData = [];
        let ambientLight;
        const handleLoadingError = (error, assetType) => {
            console.error(`Error loading ${assetType}:`, error);
        };
        let explosionTexture;
        const explosionRows = 4;
        const explosionCols = 4;
        const totalExplosionFrames = explosionRows * explosionCols;
        const explosionDuration = 1000;
        let explosionAudio = null;
        let jumpAudio = null;
        let snusCollectAudio = null;
        let lastCarPosition = new THREE.Vector3();
        let lastJumpTime = 0;
        const JUMP_DELAY = 0.05;
        const createSnusTexture = () => {
            const size = 256;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
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
            const ctx = canvas.getContext('2d');
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
        let collectibles = [];
        const initVehicleSelectionScene = () => {
            vehicleSelectionScene = new THREE.Scene();
            vehicleSelectionCamera = new THREE.PerspectiveCamera(90, RENDERER_WIDTH / RENDERER_HEIGHT, 0.1, 1000);
            vehicleSelectionCamera.position.set(7, 1, -2);
            vehicleSelectionCamera.lookAt(-1, 0, 0);
            vehicleSelectionScene.background = new THREE.TextureLoader().load('/assets/images/showroom.webp');
            const ambientLightSelection = new THREE.AmbientLight(0xffffff, 0.1);
            vehicleSelectionScene.add(ambientLightSelection);
            const objLoader = new OBJLoader();
            objLoader.load('/assets/models/model_0.obj', (object) => {
                vehicleSelectionCar = object;
                vehicleSelectionCar.scale.set(0.01, 0.01, 0.01);
                vehicleSelectionCar.position.set(0, -2.5, 0);
                vehicleSelectionCar.rotation.y += Math.PI;
                const textureLoader = new THREE.TextureLoader();
                textureLoader.load('/assets/models/Volvo_Diffusenew.png', (texture) => {
                    texture.wrapS = THREE.RepeatWrapping;
                    texture.wrapT = THREE.RepeatWrapping;
                    texture.encoding = THREE.sRGBEncoding;
                    texture.minFilter = THREE.LinearMipMapNearestFilter;
                    texture.magFilter = THREE.LinearFilter;
                    texture.generateMipmaps = true;
                    texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
                    vehicleSelectionCar.traverse((node) => {
                        if (node.isMesh) {
                            const mesh = node;
                            mesh.material = new THREE.MeshBasicMaterial({
                                map: texture,
                            });
                            mesh.castShadow = false;
                            mesh.receiveShadow = false;
                            mesh.material.side = THREE.DoubleSide;
                        }
                    });
                }, undefined, (error) => handleLoadingError(error, 'Volvo_Diffusenew.png'));
                vehicleSelectionScene.add(vehicleSelectionCar);
            }, undefined, (error) => handleLoadingError(error, 'model_0.obj'));
        };
        const initScene = () => {
            scene = markRaw(new THREE.Scene());
            camera = markRaw(new THREE.PerspectiveCamera(75, RENDERER_WIDTH / RENDERER_HEIGHT, 0.1, 10000 // Increased far clipping plane to match map size
            ));
            camera.position.set(0, 5, 15); // Adjusted initial camera position
            camera.lookAt(0, 0, 0);
            renderer = markRaw(new THREE.WebGLRenderer({
                antialias: false,
                powerPreference: 'high-performance',
                stencil: false,
                depth: true,
            }));
            renderer.setPixelRatio(1);
            renderer.setSize(RENDERER_WIDTH, RENDERER_HEIGHT);
            renderer.shadowMap.enabled = false;
            if (gameContainer.value) {
                gameContainer.value.appendChild(renderer.domElement);
            }
            else {
                console.error('Game container is not available');
            }
            ambientLight = new THREE.AmbientLight(0xffd4a3, 1);
            scene.add(ambientLight);
            const directionalLight = new THREE.DirectionalLight(0xff9933, 0.5);
            directionalLight.position.set(1, 1, 0);
            scene.add(directionalLight);
            const textureLoader = new THREE.TextureLoader();
            const groundTexture = textureLoader.load('/assets/textures/ground.jpg', (texture) => {
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                texture.repeat.set(100, 100);
                texture.encoding = THREE.sRGBEncoding;
                texture.minFilter = THREE.LinearMipMapNearestFilter;
                texture.magFilter = THREE.LinearFilter;
                texture.generateMipmaps = true;
                texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
            }, undefined, (error) => handleLoadingError(error, 'ground texture'));
            const planeGeometry = new THREE.PlaneGeometry(2000, 2000);
            const planeMaterial = new THREE.MeshBasicMaterial({
                map: groundTexture,
                side: THREE.DoubleSide,
            });
            const ground = new THREE.Mesh(planeGeometry, planeMaterial);
            ground.rotation.x = -Math.PI / 2;
            ground.position.set(0, 0, 0);
            scene.add(ground);
            const roadTexture = textureLoader.load('/assets/textures/road.jpg', (texture) => {
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                texture.repeat.set(1, 40);
                texture.encoding = THREE.sRGBEncoding;
                texture.minFilter = THREE.LinearMipMapNearestFilter;
                texture.magFilter = THREE.LinearFilter;
                texture.generateMipmaps = true;
                texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
            }, undefined, (error) => handleLoadingError(error, 'road texture'));
            const roadMaterial = new THREE.MeshBasicMaterial({
                map: roadTexture,
            });
            for (let row = 0; row <= rows; row++) {
                const roadGeometry = new THREE.BoxGeometry(columns * blockSpacing, 0.02, roadWidth);
                const roadMesh = new THREE.Mesh(roadGeometry, roadMaterial);
                roadMesh.position.set((columns * blockSpacing) / 2 - blockSpacing / 2, 0.02 / 2, row * blockSpacing - blockSpacing / 2);
                scene.add(roadMesh);
            }
            for (let col = 0; col <= columns; col++) {
                const roadGeometry = new THREE.BoxGeometry(roadWidth, 0.02, rows * blockSpacing);
                const roadMesh = new THREE.Mesh(roadGeometry, roadMaterial);
                roadMesh.position.set(col * blockSpacing - blockSpacing / 2, 0.02 / 2, (rows * blockSpacing) / 2 - blockSpacing / 2);
                scene.add(roadMesh);
            }
            const houseTexture = textureLoader.load('/assets/textures/house.jpg', (texture) => {
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                texture.repeat.set(2, 2);
                texture.encoding = THREE.sRGBEncoding;
                texture.minFilter = THREE.LinearMipMapNearestFilter;
                texture.magFilter = THREE.LinearFilter;
                texture.generateMipmaps = true;
                texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
            }, undefined, (error) => handleLoadingError(error, 'house texture'));
            const pineTreeGeometry = createPineTreeGeometry();
            const treeMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
            const houseGeometry = new THREE.BoxGeometry(10, 20, 10);
            const roofGeometry = new THREE.PlaneGeometry(10, 10);
            roofGeometry.rotateX(-Math.PI / 2);
            roofGeometry.translate(0, 10, 0);
            const combinedHouseGeometry = BufferGeometryUtils.mergeGeometries([houseGeometry, roofGeometry], false);
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
            const houseInstancedMesh = new THREE.InstancedMesh(combinedHouseGeometry, houseMaterial, totalHouses);
            const treeInstancedMesh = new THREE.InstancedMesh(pineTreeGeometry, treeMaterial, totalTrees);
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
                        const offsetX = (Math.random() - 0.5) * (blockSize - roadWidth - buffer * 2);
                        const offsetZ = (Math.random() - 0.5) * (blockSize - roadWidth - buffer * 2);
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
                        const originalBoundingBox = new THREE.Box3().setFromBufferAttribute(combinedHouseGeometry.attributes.position);
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
                        const treeOffsetX = (Math.random() - 0.5) * (blockSize - roadWidth - buffer * 2);
                        const treeOffsetZ = (Math.random() - 0.5) * (blockSize - roadWidth - buffer * 2);
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
                            dummy.rotation.set(randomTiltX, Math.random() * Math.PI * 2, randomTiltZ);
                            dummy.updateMatrix();
                            treeInstancedMesh.setMatrixAt(treeIndex, dummy.matrix);
                            treeIndex++;
                            const treePosition = new THREE.Vector3(treeX, -0.2, treeZ);
                            const boundingSphere = new THREE.Sphere(new THREE.Vector3(treeX, -0.2 + treeScale * 9, treeZ), treeScale * 7);
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
            generateCollectibles();
            generatePyramids();
            const objLoaderMain = new OBJLoader();
            objLoaderMain.load('/assets/models/model_0.obj', (object) => {
                car = object;
                car.scale.set(0.01, 0.01, 0.01);
                car.position.y = -1.65;
                car.rotation.y += Math.PI;
                textureLoader.load('/assets/models/Volvo_Diffusenew.png', (texture) => {
                    texture.wrapS = THREE.RepeatWrapping;
                    texture.wrapT = THREE.RepeatWrapping;
                    texture.encoding = THREE.sRGBEncoding;
                    texture.minFilter = THREE.LinearMipMapNearestFilter;
                    texture.magFilter = THREE.LinearFilter;
                    texture.generateMipmaps = true;
                    texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
                    car.traverse((node) => {
                        if (node.isMesh) {
                            const mesh = node;
                            mesh.material = new THREE.MeshBasicMaterial({
                                map: texture,
                            });
                            mesh.castShadow = false;
                            mesh.receiveShadow = false;
                            mesh.material.side = THREE.DoubleSide;
                        }
                    });
                }, undefined, (error) => handleLoadingError(error, 'Volvo_Diffusenew.png'));
                scene.add(car);
                modelLoaded = true;
                lastCarPosition.copy(car.position);
            }, undefined, (error) => handleLoadingError(error, 'model_0.obj'));
            const textureLoader2 = new THREE.TextureLoader();
            textureLoader2.load('/assets/images/6.png', (texture) => {
                const pmremGenerator = new PMREMGenerator(renderer);
                pmremGenerator.compileEquirectangularShader();
                const envMap = pmremGenerator.fromEquirectangular(texture).texture;
                scene.background = envMap;
                texture.dispose();
                pmremGenerator.dispose();
                scene.fog = new THREE.FogExp2(0xffd4a3, 0.002);
            }, undefined, (error) => handleLoadingError(error, '6.png'));
            explosionTexture = textureLoader.load('/assets/images/exp2.png', (texture) => {
                texture.wrapS = THREE.ClampToEdgeWrapping;
                texture.wrapT = THREE.ClampToEdgeWrapping;
                texture.minFilter = THREE.NearestFilter;
                texture.magFilter = THREE.NearestFilter;
                texture.repeat.set(1 / explosionCols, 1 / explosionRows);
            }, undefined, (error) => handleLoadingError(error, 'exp2.png'));
            animate();
        };
        const timeRemaining = ref(60);
        const score = ref(0);
        const isTimeUp = ref(false);
        const showHighScoreInput = ref(false);
        const showHighScoreList = ref(false);
        const highScores = ref([]);
        const playerName = ref('');
        let pyramids = [];
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
            const numCollectibles = 120;
            const numCollectiblesOnRoofs = 60;
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
                }
                else {
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
            const ctx = canvas.getContext('2d');
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
            const createSpeedBump = () => {
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
                }
                else {
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
        const createPineTreeGeometry = () => {
            const trunkGeometry = new THREE.CylinderGeometry(0.4, 0.4, 6, 8);
            trunkGeometry.translate(0, 3, 0);
            const foliageGeometries = [];
            const numLayers = 4;
            const foliageHeight = 12;
            const layerHeight = foliageHeight / numLayers;
            for (let i = 0; i < numLayers; i++) {
                const radius = 2.5 - i * 0.5;
                const coneGeometry = new THREE.ConeGeometry(radius, layerHeight, 8);
                coneGeometry.translate(0, 6 + i * layerHeight, 0);
                foliageGeometries.push(coneGeometry);
            }
            const foliageGeometry = BufferGeometryUtils.mergeGeometries(foliageGeometries, false);
            const combinedGeometry = BufferGeometryUtils.mergeGeometries([trunkGeometry, foliageGeometry], false);
            if (!combinedGeometry) {
                console.error('Failed to merge tree geometries');
                return new THREE.BufferGeometry();
            }
            const colors = new Float32Array(combinedGeometry.attributes.position.count * 3);
            const trunkColor = new THREE.Color(0x3d1f00);
            const foliageColor = new THREE.Color(0x1b5e20);
            const trunkVertCount = trunkGeometry.attributes.position.count;
            for (let i = 0; i < colors.length; i += 3) {
                const color = i < trunkVertCount * 3 ? trunkColor : foliageColor;
                colors[i] = color.r;
                colors[i + 1] = color.g;
                colors[i + 2] = color.b;
            }
            combinedGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            return combinedGeometry;
        };
        let verticalVelocity = 0;
        const gravity = -30;
        const makeCarJump = (jumpStrength) => {
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
        const getGroundHeightAtPosition = (x, z) => {
            let maxY = -1.65;
            for (let i = 0; i < houseData.length; i++) {
                const house = houseData[i];
                const houseBoundingBox = house.boundingBox;
                const buffer = 1.65;
                if (x >= houseBoundingBox.min.x + buffer &&
                    x <= houseBoundingBox.max.x - buffer &&
                    z >= houseBoundingBox.min.z + buffer &&
                    z <= houseBoundingBox.max.z - buffer) {
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
        function worldToScreen(position, camera, renderer) {
            const width = renderer.domElement.clientWidth;
            const height = renderer.domElement.clientHeight;
            const proj = position.project(camera);
            const x = (proj.x * 0.5 + 0.5) * width;
            const y = (-proj.y * 0.5 + 0.5) * height;
            return { x, y };
        }
        const animate = (time) => {
            const deltaTime = time - prevTime;
            prevTime = time;
            requestAnimationFrame(animate);
            if (showVehicleSelection.value) {
                if (vehicleSelectionCar) {
                    vehicleSelectionCar.rotation.y += 0.007;
                }
                renderer.render(vehicleSelectionScene, vehicleSelectionCamera);
            }
            else {
                if (modelLoaded &&
                    car &&
                    !isGameOver.value &&
                    !showOverlay.value &&
                    !showHighScoreInput.value &&
                    !showHighScoreList.value) {
                    // Calculate speed factor for dynamic acceleration and handling
                    const speedFactor = Math.abs(velocity) / MAX_SPEED;
                    const accelerationFactor = 1 - speedFactor;
                    const currentAcceleration = MIN_ACCELERATION +
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
                    velocity = THREE.MathUtils.clamp(velocity, MAX_REVERSE_SPEED, MAX_SPEED);
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
                    let steeringSensitivity = MAX_STEERING_SENSITIVITY -
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
                    }
                    else {
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
                    currentTiltAngle = THREE.MathUtils.lerp(currentTiltAngle, targetTiltAngle, TILT_LERP_FACTOR);
                    car.rotation.z = currentTiltAngle;
                    const speedInKmH = Math.abs(velocity) * 100;
                    drawSpeedometer(speedInKmH);
                    const cameraOffset = new THREE.Vector3(0, 5, -10);
                    const offset = cameraOffset.clone().applyQuaternion(car.quaternion);
                    const desiredCameraPosition = car.position.clone().add(offset);
                    const interpolationSpeed = onGround ? 0.05 : 0.05; // Slower interpolation if the car is jumping
                    camera.position.lerp(desiredCameraPosition, interpolationSpeed);
                    const targetLookHeight = onGround ? LOOK_UP_HEIGHT : 0;
                    currentLookTargetY = THREE.MathUtils.lerp(currentLookTargetY, targetLookHeight, LOOK_TRANSITION_SPEED);
                    const lookTarget = car.position.clone();
                    lookTarget.y += currentLookTargetY;
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
                            }
                            else if (carTopY <= houseBottomY + 0.1) {
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
                            const treeTopY = treeBoundingSphere.center.y + treeBoundingSphere.radius;
                            if (carBottomY >= treeTopY - 0.1) {
                                continue;
                            }
                            else {
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
                        }
                        else {
                            c.rotation.z += 0.01;
                        }
                    });
                    const now = performance.now();
                    const timeSinceJump = (now - lastJumpTime) / 1000;
                    const effectiveGravity = timeSinceJump < JUMP_DELAY ? gravity * 0.2 : gravity;
                    verticalVelocity += effectiveGravity * (deltaTime / 1000);
                    car.position.y += verticalVelocity * (deltaTime / 1000);
                    const groundY = getGroundHeightAtPosition(car.position.x, car.position.z);
                    if (car.position.y - carHeight / 2 < groundY) {
                        car.position.y = groundY + carHeight / 2;
                        verticalVelocity = 0;
                        onGround = true;
                    }
                    else if (car.position.y - carHeight / 2 > groundY - 1) {
                        onGround = false;
                    }
                    else {
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
                    }
                    else {
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
        const drawSpeedometer = (speed) => {
            if (!speedometerContext || !speedometerCanvas.value)
                return;
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
            const needleAngle = startAngle + (speed / maxSpeed) * (endAngle - startAngle);
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
        const onKeyDown = (event) => {
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
            }
            else if (showHighScoreInput.value) {
                // Press enter to submit
                if (event.key === 'Enter') {
                    event.preventDefault();
                    submitHighScore();
                }
            }
            else if (showHighScoreList.value) {
                // Press enter to restart game
                if (event.key === 'Enter') {
                    event.preventDefault();
                    restartGame();
                }
            }
            else {
                if (event.key in keys) {
                    event.preventDefault();
                    keys[event.key] = true;
                }
            }
        };
        const onKeyUp = (event) => {
            if (event.key in keys) {
                event.preventDefault();
                keys[event.key] = false;
            }
        };
        const handleResize = () => {
            const container = gameContainer.value;
            if (!container)
                return;
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
        watch(() => speedometerCanvas.value, (newCanvas) => {
            if (newCanvas) {
                speedometerContext = newCanvas.getContext('2d');
            }
        });
        const resetGame = (isInitialSpawn = false) => {
            if (!car)
                return;
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
            car.position.y = -1.65;
            if (isInitialSpawn) {
                car.position.set(0, car.position.y, 0);
            }
            else {
                const maxPosition = rows * blockSpacing;
                const randomX = (Math.random() - 0.5) * maxPosition;
                const randomZ = (Math.random() - 0.5) * maxPosition;
                car.position.set(randomX, car.position.y, randomZ);
            }
            car.rotation.set(0, 0, 0);
            lastCarPosition.copy(car.position);
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
            const existingScores = JSON.parse(localStorage.getItem('highScores') || '[]');
            existingScores.push(newScore);
            existingScores.sort((a, b) => b.score - a.score);
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
        let onlineRadio = null;
        let fifaAudio = null;
        let timeAudio = null;
        const toggleRadioChannel = () => {
            if (currentChannel.value === 'local') {
                if (!onlineRadio) {
                    onlineRadio = new Audio('https://stream.radiogellivare.se/listen/977mhz/radio.mp3');
                    onlineRadio.volume = 2;
                }
                if (backgroundAudio) {
                    backgroundAudio.pause();
                }
                onlineRadio.play().catch(error => {
                    console.error('Error playing online radio:', error);
                });
                currentChannel.value = 'online';
            }
            else if (currentChannel.value === 'online') {
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
            }
            else if (currentChannel.value === 'fifa') {
                if (fifaAudio) {
                    fifaAudio.pause();
                }
                if (backgroundAudio) {
                    backgroundAudio.play().catch(error => {
                        console.error('Error playing background music:', error);
                    });
                }
                currentChannel.value = 'local';
            }
            else {
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
        const showScoreDisplay = (value, screenPosition) => {
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
                        if (object.geometry)
                            object.geometry.dispose();
                        if (object.material) {
                            if (Array.isArray(object.material)) {
                                object.material.forEach((material) => material.dispose());
                            }
                            else {
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
                fifaAudio.pause;
                fifaAudio = null;
            }
            if (timeAudio) {
                timeAudio.pause();
                timeAudio = null;
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
            currentChannel,
            toggleRadioChannel,
            scoreDisplayVisible,
            scoreDisplayValue,
            scoreDisplayPosition
        };
    },
});
; /* PartiallyEnd: #3632/script.vue */
function __VLS_template() {
    const __VLS_ctx = {};
    const __VLS_localComponents = {
        ...{},
        ...{},
        ...__VLS_ctx,
    };
    let __VLS_components;
    const __VLS_localDirectives = {
        ...{},
        ...__VLS_ctx,
    };
    let __VLS_directives;
    let __VLS_styleScopedClasses;
    __VLS_styleScopedClasses['game-container'];
    __VLS_styleScopedClasses['game-container'];
    __VLS_styleScopedClasses['tv-overlay'];
    __VLS_styleScopedClasses['speedometer-container'];
    __VLS_styleScopedClasses['high-score-content'];
    __VLS_styleScopedClasses['high-score-content'];
    __VLS_styleScopedClasses['high-score-content'];
    __VLS_styleScopedClasses['high-score-content'];
    __VLS_styleScopedClasses['high-score-content'];
    __VLS_styleScopedClasses['radio-button'];
    // CSS variable injection 
    // CSS variable injection end 
    let __VLS_resolvedLocalAndGlobalComponents;
    __VLS_elementAsFunction(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_elementAsFunction(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({ ...{ class: ("game-container") }, ref: ("gameContainer"), });
    // @ts-ignore navigation for `const gameContainer = ref()`
    __VLS_ctx.gameContainer;
    if (__VLS_ctx.scoreDisplayVisible) {
        __VLS_elementAsFunction(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({ ...{ class: ("score-display") }, ...{ style: (({
                    top: __VLS_ctx.scoreDisplayPosition.y + 'px',
                    left: __VLS_ctx.scoreDisplayPosition.x + 'px',
                })) }, });
        (__VLS_ctx.scoreDisplayValue);
    }
    __VLS_elementAsFunction(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({ ...{ class: ("tv-overlay") }, });
    __VLS_elementAsFunction(__VLS_intrinsicElements.img)({ src: ("/assets/images/tv.png"), alt: ("TV Frame"), });
    if (__VLS_ctx.showOverlay) {
        __VLS_elementAsFunction(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({ ...{ class: ("overlay") }, });
        __VLS_elementAsFunction(__VLS_intrinsicElements.img)({ src: ("/assets/images/start3.jpg"), alt: ("Start Screen"), ...{ class: ("overlay-image") }, });
        __VLS_elementAsFunction(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({ ...{ onClick: (__VLS_ctx.startGame) }, ...{ class: ("play-button") }, });
    }
    else if (__VLS_ctx.showVehicleSelection) {
        __VLS_elementAsFunction(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({ ...{ class: ("vehicle-selection-overlay") }, });
        __VLS_elementAsFunction(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({ ...{ class: ("vehicle-stats") }, });
        __VLS_elementAsFunction(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
        __VLS_elementAsFunction(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        __VLS_elementAsFunction(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        __VLS_elementAsFunction(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        __VLS_elementAsFunction(__VLS_intrinsicElements.br, __VLS_intrinsicElements.br)({});
    }
    if (!__VLS_ctx.showOverlay && !__VLS_ctx.showVehicleSelection) {
        __VLS_elementAsFunction(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({ ...{ class: ("speedometer-container") }, });
        __VLS_elementAsFunction(__VLS_intrinsicElements.canvas, __VLS_intrinsicElements.canvas)({ ref: ("speedometerCanvas"), width: ("200"), height: ("200"), });
        // @ts-ignore navigation for `const speedometerCanvas = ref()`
        __VLS_ctx.speedometerCanvas;
    }
    if (!__VLS_ctx.showOverlay && !__VLS_ctx.showVehicleSelection && !__VLS_ctx.showHighScoreInput && !__VLS_ctx.showHighScoreList) {
        __VLS_elementAsFunction(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({ ...{ class: ("hud") }, });
        __VLS_elementAsFunction(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({ ...{ class: ("timer") }, });
        (Math.ceil(__VLS_ctx.timeRemaining));
        __VLS_elementAsFunction(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({ ...{ class: ("score") }, });
        (__VLS_ctx.score);
    }
    if (!__VLS_ctx.showOverlay && !__VLS_ctx.showVehicleSelection && !__VLS_ctx.showHighScoreInput && !__VLS_ctx.showHighScoreList) {
        __VLS_elementAsFunction(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({ ...{ class: ("radio-interface") }, });
        __VLS_elementAsFunction(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({ ...{ class: ("radio-display") }, });
        __VLS_elementAsFunction(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({ ...{ class: ("radio-text") }, });
        (__VLS_ctx.currentChannel === 'local'
            ? 'BARSEBACK FM'
            : __VLS_ctx.currentChannel === 'online'
                ? 'GÄLLIVARE NÄRRADIO'
                : 'FIFA FM');
        __VLS_elementAsFunction(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({ ...{ class: ("radio-frequency") }, });
        (__VLS_ctx.currentChannel === 'local'
            ? '98.7 MHz'
            : __VLS_ctx.currentChannel === 'online'
                ? '97.7 MHz'
                : '99.9 MHz');
        __VLS_elementAsFunction(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({ ...{ onClick: (__VLS_ctx.toggleRadioChannel) }, ...{ class: ("radio-button") }, });
    }
    if (__VLS_ctx.showHighScoreInput) {
        __VLS_elementAsFunction(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({ ...{ class: ("high-score-input") }, });
        __VLS_elementAsFunction(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({ ...{ class: ("high-score-content") }, });
        __VLS_elementAsFunction(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
        __VLS_elementAsFunction(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        (__VLS_ctx.score);
        __VLS_elementAsFunction(__VLS_intrinsicElements.input)({ placeholder: ("Enter your name"), });
        (__VLS_ctx.playerName);
        __VLS_elementAsFunction(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({ ...{ onClick: (__VLS_ctx.submitHighScore) }, });
        __VLS_elementAsFunction(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        __VLS_elementAsFunction(__VLS_intrinsicElements.br, __VLS_intrinsicElements.br)({});
    }
    if (__VLS_ctx.showHighScoreList) {
        __VLS_elementAsFunction(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({ ...{ class: ("high-score-list") }, });
        __VLS_elementAsFunction(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({ ...{ class: ("high-score-content") }, });
        __VLS_elementAsFunction(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
        __VLS_elementAsFunction(__VLS_intrinsicElements.ol, __VLS_intrinsicElements.ol)({});
        for (const [entry, index] of __VLS_getVForSourceType((__VLS_ctx.highScores))) {
            __VLS_elementAsFunction(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({ key: ((index)), });
            (entry.name);
            (entry.score);
        }
        __VLS_elementAsFunction(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({ ...{ onClick: (__VLS_ctx.restartGame) }, });
        __VLS_elementAsFunction(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        __VLS_elementAsFunction(__VLS_intrinsicElements.br, __VLS_intrinsicElements.br)({});
    }
    __VLS_styleScopedClasses['game-container'];
    __VLS_styleScopedClasses['score-display'];
    __VLS_styleScopedClasses['tv-overlay'];
    __VLS_styleScopedClasses['overlay'];
    __VLS_styleScopedClasses['overlay-image'];
    __VLS_styleScopedClasses['play-button'];
    __VLS_styleScopedClasses['vehicle-selection-overlay'];
    __VLS_styleScopedClasses['vehicle-stats'];
    __VLS_styleScopedClasses['speedometer-container'];
    __VLS_styleScopedClasses['hud'];
    __VLS_styleScopedClasses['timer'];
    __VLS_styleScopedClasses['score'];
    __VLS_styleScopedClasses['radio-interface'];
    __VLS_styleScopedClasses['radio-display'];
    __VLS_styleScopedClasses['radio-text'];
    __VLS_styleScopedClasses['radio-frequency'];
    __VLS_styleScopedClasses['radio-button'];
    __VLS_styleScopedClasses['high-score-input'];
    __VLS_styleScopedClasses['high-score-content'];
    __VLS_styleScopedClasses['high-score-list'];
    __VLS_styleScopedClasses['high-score-content'];
    var __VLS_slots;
    var __VLS_inheritedAttrs;
    const __VLS_refs = {
        "gameContainer": __VLS_nativeElements['div'],
        "speedometerCanvas": __VLS_nativeElements['canvas'],
    };
    var $refs;
    var $el;
    return {
        attrs: {},
        slots: __VLS_slots,
        refs: $refs,
        rootEl: $el,
    };
}
;
let __VLS_self;
//# sourceMappingURL=Game.vue.js.map