import { defineComponent, markRaw, onMounted, onBeforeUnmount, ref } from 'vue';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import { TextureLoader } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'; // Import OrbitControls
export default defineComponent({
    name: 'GameComponent',
    setup() {
        const gameContainer = ref(null);
        let scene;
        let camera;
        let renderer;
        let controls; // Declare the OrbitControls variable
        let car;
        const keys = {
            ArrowUp: false,
            ArrowDown: false,
            ArrowLeft: false,
            ArrowRight: false,
        };
        let velocity = 0;
        let angularVelocity = 0; // New variable for angular velocity
        const rotationAcceleration = 0.0009; // Acceleration per frame
        const rotationDamping = 0.95; // Damping factor
        const rotationSpeed = 0.02; // Keep this variable if it is used for other purposes
        let modelLoaded = false;
        const RENDERER_WIDTH = 640;
        const RENDERER_HEIGHT = 480;
        const handleLoadingError = (error, assetType) => {
            console.error(`Error loading ${assetType}:`, error);
        };
        const initScene = () => {
            // Initialize Scene
            scene = markRaw(new THREE.Scene());
            scene.background = new THREE.Color(0x87ceeb);
            // Initialize Camera
            camera = markRaw(new THREE.PerspectiveCamera(90, // Field of View
            RENDERER_WIDTH / RENDERER_HEIGHT, // Aspect Ratio
            0.1, // Near Clipping Plane
            10000));
            camera.position.set(0, 5, 10); // Set initial position of the camera
            // Initialize Renderer
            renderer = markRaw(new THREE.WebGLRenderer({
                antialias: true,
                powerPreference: 'high-performance',
                stencil: false,
                depth: true,
            }));
            renderer.setSize(RENDERER_WIDTH, RENDERER_HEIGHT);
            renderer.domElement.classList.add('pixelated');
            renderer.domElement.style.imageRendering = 'pixelated';
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            renderer.setPixelRatio(window.devicePixelRatio);
            // Append Renderer to the DOM
            if (gameContainer.value) {
                gameContainer.value.appendChild(renderer.domElement);
            }
            else {
                console.error('Game container is not available');
            }
            // Add Lights to the Scene
            const ambientLight = new THREE.AmbientLight(0xffffff, 1);
            scene.add(ambientLight);
            const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
            directionalLight.position.set(0, 100, 0);
            directionalLight.castShadow = true;
            scene.add(directionalLight);
            // Set up the directional light's shadow camera
            directionalLight.shadow.camera.left = -500; // Increase for larger area
            directionalLight.shadow.camera.right = 500; // Increase for larger area
            directionalLight.shadow.camera.top = 500; // Increase for larger area
            directionalLight.shadow.camera.bottom = -500; // Increase for larger area
            directionalLight.shadow.camera.near = 1; // Shadow start distance
            directionalLight.shadow.camera.far = 2000; // Shadow end distance
            // Adjust the shadow map size for better resolution
            directionalLight.shadow.mapSize.width = 9048; // Higher value for better shadow quality
            directionalLight.shadow.mapSize.height = 9048; // Higher value for better shadow quality
            const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
            hemisphereLight.position.set(0, 200, 0);
            scene.add(hemisphereLight);
            // Initialize Texture Loader
            const textureLoader = new THREE.TextureLoader();
            // Load Ground Texture
            const groundTexture = textureLoader.load('/assets/textures/ground.jpg', (texture) => {
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                texture.repeat.set(100, 100);
                texture.encoding = THREE.sRGBEncoding;
                texture.minFilter = THREE.LinearFilter;
                texture.magFilter = THREE.LinearFilter;
                texture.generateMipmaps = true;
            }, (xhr) => {
                if (xhr.lengthComputable) {
                    const percentComplete = (xhr.loaded / xhr.total) * 100;
                    console.log(`Ground texture ${percentComplete.toFixed(2)}% loaded`);
                }
            }, (error) => handleLoadingError(error, 'ground texture'));
            // Create Ground Mesh
            const planeGeometry = new THREE.PlaneGeometry(1000, 1000);
            const planeMaterial = new THREE.MeshStandardMaterial({
                map: groundTexture,
                side: THREE.DoubleSide,
            });
            const ground = new THREE.Mesh(planeGeometry, planeMaterial);
            ground.rotation.x = -Math.PI / 2;
            ground.position.set(0, 0, 0);
            ground.receiveShadow = true;
            scene.add(ground);
            // Load Road Texture
            const roadTexture = textureLoader.load('/assets/textures/road.jpg', (texture) => {
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                texture.repeat.set(1, 40);
                texture.encoding = THREE.sRGBEncoding;
                texture.minFilter = THREE.LinearFilter;
                texture.magFilter = THREE.LinearFilter;
                texture.generateMipmaps = true;
            }, (xhr) => {
                if (xhr.lengthComputable) {
                    const percentComplete = (xhr.loaded / xhr.total) * 100;
                    console.log(`Road texture ${percentComplete.toFixed(2)}% loaded`);
                }
            }, (error) => handleLoadingError(error, 'road texture'));
            // Create Road Mesh
            const roadGeometry = new THREE.PlaneGeometry(10, 400);
            const roadMaterial = new THREE.MeshStandardMaterial({ map: roadTexture });
            const road = new THREE.Mesh(roadGeometry, roadMaterial);
            road.rotation.x = -Math.PI / 2;
            road.position.set(0, 0.01, 0);
            road.receiveShadow = true;
            scene.add(road);
            // Load OBJ Model as Car and Roof
            const objLoader = new OBJLoader();
            // Load the car model
            objLoader.load('/assets/models/model_0.obj', (object) => {
                car = object;
                // Set the scale of the car model
                car.scale.set(0.01, 0.01, 0.01); // Set scale to 0.01 on all axes (x, y, z)
                car.position.y = -1.65; // Add this line to lower the car's position
                // Load the texture for the car and roof
                const textureLoader = new TextureLoader();
                textureLoader.load('/assets/models/Volvo_Diffusenew.png', // Path to your texture
                (texture) => {
                    texture.wrapS = THREE.RepeatWrapping;
                    texture.wrapT = THREE.RepeatWrapping;
                    texture.encoding = THREE.sRGBEncoding;
                    texture.minFilter = THREE.LinearFilter;
                    texture.magFilter = THREE.LinearFilter;
                    texture.generateMipmaps = true;
                    // Apply the texture to all the meshes in the car object
                    car.traverse((node) => {
                        if (node.isMesh) {
                            const mesh = node;
                            mesh.material.map = texture;
                            mesh.material.needsUpdate = true;
                            mesh.castShadow = true;
                            mesh.receiveShadow = true;
                            mesh.material.side = THREE.DoubleSide; // Only render the front faces (change to THREE.DoubleSide if you need both)
                            // Add these lines to increase brightness of the car material
                            mesh.material.emissive = new THREE.Color(0x333333); // Adds a subtle glow
                            mesh.material.emissiveIntensity = 0.3; // Adjust this value between 0 and 1
                        }
                    });
                }, (xhr) => {
                    if (xhr.lengthComputable) {
                        const percentComplete = (xhr.loaded / xhr.total) * 100;
                        console.log(`Texture loaded: ${percentComplete.toFixed(2)}%`);
                    }
                }, (error) => handleLoadingError(error, 'Volvo_Diffusenew.png'));
                scene.add(car);
                // Load the roof model (model_3.obj)
                objLoader.load('/assets/models/model_3.obj', // Path to the roof model
                (roofObject) => {
                    // Scale the roof model to match the car
                    roofObject.scale.set(0.01, 0.01, 0.01); // Adjust as necessary
                    // Apply the same texture to the roof
                    roofObject.traverse((node) => {
                        if (node.isMesh) {
                            const mesh = node;
                            mesh.material.map = texture;
                            mesh.material.needsUpdate = true;
                            mesh.castShadow = true;
                            mesh.receiveShadow = true;
                            mesh.material.side = THREE.FrontSide; // Ensure only front faces are rendered
                        }
                    });
                    // Parent the roof to the car so it moves with it
                    car.add(roofObject);
                    // Position the roof exactly at the car's position (this will keep it aligned)
                    roofObject.position.set(0, 2, 0); // Adjust the y position to place the roof correctly on the car
                    console.log('Roof model loaded and positioned on the car');
                }, (xhr) => {
                    if (xhr.lengthComputable) {
                        const percentComplete = (xhr.loaded / xhr.total) * 100;
                        console.log(`Roof model loading: ${percentComplete.toFixed(2)}%`);
                    }
                }, (error) => handleLoadingError(error, 'model_3.obj'));
                modelLoaded = true;
                console.log('Car model loaded successfully with the correct texture');
            }, (xhr) => {
                if (xhr.lengthComputable) {
                    const percentComplete = (xhr.loaded / xhr.total) * 100;
                    console.log(`Car model loading: ${percentComplete.toFixed(2)}%`);
                }
            }, (error) => handleLoadingError(error, 'model_0.obj'));
            // Initialize OrbitControls for free look
            controls = new OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.25;
            controls.screenSpacePanning = false;
            controls.maxPolarAngle = Math.PI / 2; // Limit vertical rotation (no flipping upside down)
            animate();
        };
        const animate = () => {
            requestAnimationFrame(animate);
            if (modelLoaded && car) {
                controls.update(); // Update controls for smooth camera movement
                // Handle acceleration
                if (keys.ArrowUp) {
                    velocity += 0.0015;
                }
                if (keys.ArrowDown) {
                    velocity -= 0.0009;
                }
                // Apply friction
                velocity *= 0.995;
                const velocityThreshold = 0.0005;
                if (Math.abs(velocity) < velocityThreshold) {
                    velocity = 0;
                }
                velocity = THREE.MathUtils.clamp(velocity, -10, 10);
                car.translateZ(velocity);
                const minSteerSpeed = 0.00001;
                const maxSteerFactor = 0.9;
                let steerFactor = 0;
                if (Math.abs(velocity) > minSteerSpeed) {
                    steerFactor = Math.min(Math.abs(velocity) / 0.1, maxSteerFactor);
                    steerFactor *= Math.sign(velocity);
                }
                if (steerFactor !== 0) {
                    if (keys.ArrowLeft) {
                        angularVelocity += rotationAcceleration * steerFactor;
                    }
                    if (keys.ArrowRight) {
                        angularVelocity -= rotationAcceleration * steerFactor;
                    }
                }
                else {
                    angularVelocity = 0;
                }
                angularVelocity *= rotationDamping;
                const angularThreshold = 0.00001;
                if (Math.abs(angularVelocity) < angularThreshold) {
                    angularVelocity = 0;
                }
                angularVelocity = THREE.MathUtils.clamp(angularVelocity, -0.05, 0.05);
                if (steerFactor !== 0) {
                    car.rotation.y += angularVelocity;
                }
                const relativeCameraOffset = new THREE.Vector3(10, 500, 500);
                const angle = Math.PI;
                const rotatedOffset = relativeCameraOffset
                    .clone()
                    .applyAxisAngle(new THREE.Vector3(0.06, 1.02, -0.04), angle);
                const cameraOffset = rotatedOffset.applyMatrix4(car.matrixWorld);
                // Smoothly interpolate the camera position and rotation
                camera.position.lerp(cameraOffset, 0.05); // Adjust the factor to control the smoothing
                camera.rotation.x = THREE.MathUtils.lerp(camera.rotation.x, Math.PI / 4, 0.05); // Adjust this to control vertical smoothing
                camera.lookAt(car.position);
                // Move the camera up as speed increases
                camera.position.y += velocity * 0.1; // Adjust this factor to control the upward movement
                // Increase FOV based on velocity
                const minFOV = 50;
                const maxFOV = 90;
                const newFOV = THREE.MathUtils.lerp(maxFOV, minFOV, Math.abs(velocity) / 10); // Adjust divisor to control FOV change speed
                camera.fov = newFOV;
                camera.updateProjectionMatrix(); // Make sure to update the projection matrix after changing the FOV
                // Move camera closer to the car based on velocity
                const cameraDistanceFactor = 1 - Math.min(Math.abs(velocity) / 2, 2); // Increase the reduction factor for closer distance
                relativeCameraOffset.x *= cameraDistanceFactor;
                relativeCameraOffset.z *= cameraDistanceFactor;
            }
            // Render the Scene
            renderer.render(scene, camera);
        };
        const onKeyDown = (event) => {
            if (event.key in keys) {
                event.preventDefault();
                keys[event.key] = true;
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
            renderer.setSize(width, height);
            renderer.domElement.style.width = `${width}px`;
            renderer.domElement.style.height = `${height}px`;
        };
        onMounted(() => {
            window.addEventListener('keydown', onKeyDown);
            window.addEventListener('keyup', onKeyUp);
            if (gameContainer.value) {
                initScene();
            }
            window.addEventListener('resize', handleResize);
            handleResize();
        });
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
        });
        return {
            gameContainer,
        };
    },
}); /* PartiallyEnd: #3632/script.vue */
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
    // CSS variable injection
    // CSS variable injection end
    let __VLS_resolvedLocalAndGlobalComponents;
    __VLS_elementAsFunction(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({ ...{ class: ("game-container") }, ref: ("gameContainer"), });
    // @ts-expect-error navigation for `const gameContainer = ref()`
    __VLS_ctx.gameContainer;
    __VLS_styleScopedClasses['game-container'];
    var __VLS_slots;
    var __VLS_inheritedAttrs;
    const __VLS_refs = {
        "gameContainer": __VLS_nativeElements['div'],
    };
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
