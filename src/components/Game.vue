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
        <!-- Add more stats as needed -->
        <p>Press Enter to select</p>
      </div>
    </div>
  </div>
  <!-- Speedometer -->
  <div v-if="!showOverlay && !showVehicleSelection" class="speedometer-container">
    <canvas ref="speedometerCanvas"></canvas>
  </div>
</template>

<script lang="ts">
import { defineComponent, markRaw, onMounted, onBeforeUnmount, ref } from 'vue'
import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader'
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export default defineComponent({
  name: 'GameComponent',
  setup() {
    const gameContainer = ref<HTMLElement | null>(null)
    const speedometerCanvas = ref<HTMLCanvasElement | null>(null)
    let speedometerContext: CanvasRenderingContext2D | null = null
    let scene: THREE.Scene
    let camera: THREE.PerspectiveCamera
    let renderer: THREE.WebGLRenderer
    let car: THREE.Object3D
    const keys: Record<string, boolean> = {
      ArrowUp: false,
      ArrowDown: false,
      ArrowLeft: false,
      ArrowRight: false,
    }
    let velocity = 0
    let angularVelocity = 0
    const rotationDamping = 0.95
    let modelLoaded = false
    const isGameOver = ref(false)
    let explosionSprite: THREE.Sprite | null = null
    let explosionStartTime: number | null = null

    // Overlay and Background Music
    const showOverlay = ref(true)
    let backgroundAudio: HTMLAudioElement | null = null

    // Vehicle Selection State
    const showVehicleSelection = ref(false)
    let vehicleSelectionScene: THREE.Scene
    let vehicleSelectionCamera: THREE.PerspectiveCamera
    let vehicleSelectionCar: THREE.Object3D
    let vehicleSelectionMusic: HTMLAudioElement | null = null

    // Constants for Acceleration and Speed
    const MAX_SPEED = 20
    const MAX_REVERSE_SPEED = -10
    const MAX_ACCELERATION = 0.3
    const MIN_ACCELERATION = 0.01
    const DECELERATION = 1.5
    const FRICTION = 0.993

    const MAX_STEERING_SENSITIVITY = 0.25
    const MIN_STEERING_SENSITIVITY = 0.1

    // Constants for Tilting
    const MAX_TILT_ANGLE = THREE.MathUtils.degToRad(-15)
    const TILT_LERP_FACTOR = 0.3
    const MAX_TURN_RATE = 0.02

    // Current Tilt Angle of the Car
    let currentTiltAngle = 0

    // Renderer Dimensions for Performance
    const RENDERER_WIDTH = 480
    const RENDERER_HEIGHT = 360

    // Data for Houses and Trees
    const houseData: Array<{
      position: THREE.Vector3
      size: { width: number; height: number; depth: number }
    }> = []
    const treeData: Array<{ position: THREE.Vector3; scale: number }> = []

    // Ambient Light Reference
    let ambientLight: THREE.AmbientLight

    const handleLoadingError = (error: unknown, assetType: string) => {
      console.error(`Error loading ${assetType}:`, error)
    }

    // Explosion Texture and Animation Parameters
    let explosionTexture: THREE.Texture
    const explosionRows = 4 // Number of rows in the sprite sheet
    const explosionCols = 4 // Number of columns in the sprite sheet
    const totalExplosionFrames = explosionRows * explosionCols
    const explosionDuration = 1000 // Duration of the explosion animation in milliseconds

    // Explosion Audio
    let explosionAudio: HTMLAudioElement | null = null

    // Initialize Vehicle Selection Scene
    const initVehicleSelectionScene = () => {
      // Initialize Scene
      vehicleSelectionScene = new THREE.Scene()

      // Initialize Camera
      vehicleSelectionCamera = new THREE.PerspectiveCamera(
        90, // Field of View
        RENDERER_WIDTH / RENDERER_HEIGHT,
        0.1,
        1000,
      )
      vehicleSelectionCamera.position.set(7, 2, -2 )
      vehicleSelectionCamera.lookAt(0, 0, 0)

      // Set Background to Black
      vehicleSelectionScene.background = new THREE.TextureLoader().load('/assets/images/showroom.webp')

      // Add Ambient Light
      const ambientLightSelection = new THREE.AmbientLight(0xffffff, 0.1)
      vehicleSelectionScene.add(ambientLightSelection)

      // Load the Car Model
      const objLoader = new OBJLoader()
      objLoader.load(
        '/assets/models/model_0.obj',
        (object) => {
          vehicleSelectionCar = object

          // Set Scale and Position
          vehicleSelectionCar.scale.set(0.01, 0.01, 0.01)
          vehicleSelectionCar.position.set(0, -2, 0)

          // Rotate to Face Positive Z-axis
          vehicleSelectionCar.rotation.y += Math.PI * 0.1

          // Load Texture for the Car
          const textureLoader = new THREE.TextureLoader()
          textureLoader.load(
            '/assets/models/Volvo_Diffusenew.png',
            (texture: THREE.Texture) => {
              texture.wrapS = THREE.RepeatWrapping
              texture.wrapT = THREE.RepeatWrapping
              texture.encoding = THREE.sRGBEncoding
              texture.minFilter = THREE.LinearMipMapNearestFilter
              texture.magFilter = THREE.LinearFilter
              texture.generateMipmaps = true
              texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4)

              // Apply Texture to All Meshes in the Car Object
              vehicleSelectionCar.traverse((node) => {
                if ((node as THREE.Mesh).isMesh) {
                  const mesh = node as THREE.Mesh
                  mesh.material = new THREE.MeshBasicMaterial({
                    map: texture,
                  })
                  mesh.castShadow = false
                  mesh.receiveShadow = false
                  mesh.material.side = THREE.DoubleSide
                }
              })
            },
            undefined,
            (error) => handleLoadingError(error, 'Volvo_Diffusenew.png'),
          )

          // Add Car to the Vehicle Selection Scene
          vehicleSelectionScene.add(vehicleSelectionCar)
          console.log('Vehicle selection car model loaded successfully with the correct texture')
        },
        undefined,
        (error) => handleLoadingError(error, 'model_0.obj'),
      )
    }

    // Initialize Main Game Scene
    const initScene = () => {
      // Initialize Scene
      scene = markRaw(new THREE.Scene())

      // Initialize Camera
      camera = markRaw(
        new THREE.PerspectiveCamera(
          75, // Field of View
          RENDERER_WIDTH / RENDERER_HEIGHT,
          0.1,
          10000,
        ),
      )
      camera.position.set(0, 5, 10)
      camera.lookAt(0, 0, 0)

      // Initialize Renderer
      renderer = markRaw(
        new THREE.WebGLRenderer({
          antialias: false, // Disable anti-aliasing for pixelated look
          powerPreference: 'high-performance',
          stencil: false,
          depth: true,
        }),
      )
      renderer.setPixelRatio(1) // Ensure pixel ratio is 1
      renderer.setSize(RENDERER_WIDTH, RENDERER_HEIGHT)
      renderer.shadowMap.enabled = false // Disable shadows for performance

      // Append Renderer to the DOM
      if (gameContainer.value) {
        gameContainer.value.appendChild(renderer.domElement)
      } else {
        console.error('Game container is not available')
      }

      // Add Ambient Light with Warmer Color
      ambientLight = new THREE.AmbientLight(0xffd4a3, 1) // Warm orange
      scene.add(ambientLight)

      // Add Directional Light for Warm Highlights
      const directionalLight = new THREE.DirectionalLight(0xff9933, 0.5) // Warm orange light
      directionalLight.position.set(1, 1, 0)
      scene.add(directionalLight)

      // Initialize Texture Loader
      const textureLoader = new THREE.TextureLoader()

      // Load Ground Texture
      const groundTexture = textureLoader.load(
        '/assets/textures/ground.jpg',
        (texture: THREE.Texture) => {
          texture.wrapS = THREE.RepeatWrapping
          texture.wrapT = THREE.RepeatWrapping
          texture.repeat.set(100, 100)
          texture.encoding = THREE.sRGBEncoding
          texture.minFilter = THREE.LinearMipMapNearestFilter
          texture.magFilter = THREE.LinearFilter
          texture.generateMipmaps = true
          texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4)
        },
        undefined,
        (error) => handleLoadingError(error, 'ground texture'),
      )

      // Create Ground Mesh
      const planeGeometry = new THREE.PlaneGeometry(2000, 2000)
      const planeMaterial = new THREE.MeshBasicMaterial({
        map: groundTexture,
        side: THREE.DoubleSide,
      })
      const ground = new THREE.Mesh(planeGeometry, planeMaterial)
      ground.rotation.x = -Math.PI / 2
      ground.position.set(0, 0, 0)
      scene.add(ground)

      // Load Road Texture
      const roadTexture = textureLoader.load(
        '/assets/textures/road.jpg',
        (texture) => {
          texture.wrapS = THREE.RepeatWrapping
          texture.wrapT = THREE.RepeatWrapping
          texture.repeat.set(1, 40)
          texture.encoding = THREE.sRGBEncoding
          texture.minFilter = THREE.LinearMipMapNearestFilter
          texture.magFilter = THREE.LinearFilter
          texture.generateMipmaps = true
          texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4)
        },
        undefined,
        (error) => handleLoadingError(error, 'road texture'),
      )

      // Define Road and Grid Properties
      const roadWidth = 15
      const roadHeight = 0.02
      const blockSize = 60
      const rows = 10
      const columns = 10
      const blockSpacing = blockSize + roadWidth

      // Create Road Material
      const roadMaterial = new THREE.MeshBasicMaterial({
        map: roadTexture,
      })

      // Create Horizontal Roads (X-axis)
      for (let row = 0; row <= rows; row++) {
        const roadGeometry = new THREE.BoxGeometry(columns * blockSpacing, roadHeight, roadWidth)
        const roadMesh = new THREE.Mesh(roadGeometry, roadMaterial)

        // Position Each Horizontal Road
        roadMesh.position.set(
          (columns * blockSpacing) / 2 - blockSpacing / 2,
          roadHeight / 2,
          row * blockSpacing - blockSpacing / 2,
        )

        // Add to Scene
        scene.add(roadMesh)
      }

      // Create Vertical Roads (Z-axis)
      for (let col = 0; col <= columns; col++) {
        const roadGeometry = new THREE.BoxGeometry(roadWidth, roadHeight, rows * blockSpacing)
        const roadMesh = new THREE.Mesh(roadGeometry, roadMaterial)

        // Position Each Vertical Road
        roadMesh.position.set(
          col * blockSpacing - blockSpacing / 2,
          roadHeight / 2,
          (rows * blockSpacing) / 2 - blockSpacing / 2,
        )

        // Add to Scene
        scene.add(roadMesh)
      }

      // Load House Texture
      const houseTexture = textureLoader.load(
        '/assets/textures/house.jpg', // Path to your house texture
        (texture) => {
          texture.wrapS = THREE.RepeatWrapping
          texture.wrapT = THREE.RepeatWrapping
          texture.repeat.set(2, 2) // Adjust repeat for tiling effect
          texture.encoding = THREE.sRGBEncoding
          texture.minFilter = THREE.LinearMipMapNearestFilter
          texture.magFilter = THREE.LinearFilter
          texture.generateMipmaps = true
          texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4)
        },
        undefined,
        (error) => handleLoadingError(error, 'house texture'),
      )

      // Prepare Geometries and Materials for Instancing
      const pineTreeGeometry = createPineTreeGeometry()
      const pineTreeMaterial = new THREE.MeshBasicMaterial({ color: 0x228b22 })

      const houseGeometry = new THREE.BoxGeometry(10, 20, 10)
      const houseMaterial = new THREE.MeshBasicMaterial({
        map: houseTexture,
      })

      // Calculate Total Number of Houses and Trees
      let totalHouses = 0
      let totalTrees = 0

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < columns; col++) {
          totalHouses += Math.floor(Math.random() * 3) + 1 // Reduced house count
          totalTrees += 3 // Additional trees per block
        }
      }

      // Create InstancedMeshes
      const houseInstancedMesh = new THREE.InstancedMesh(houseGeometry, houseMaterial, totalHouses)
      const treeInstancedMesh = new THREE.InstancedMesh(
        pineTreeGeometry,
        pineTreeMaterial,
        totalTrees,
      )

      // Index Counters for Instances
      let houseIndex = 0
      let treeIndex = 0

      // Add Houses and Trees Using InstancedMesh
      const dummy = new THREE.Object3D()

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < columns; col++) {
          // Center Position of Each Block
          const blockCenterX = col * blockSpacing
          const blockCenterZ = row * blockSpacing

          // Randomly Decide the Number of Houses in This Block
          const houseCount = Math.floor(Math.random() * 3) + 1

          for (let i = 0; i < houseCount; i++) {
            // Randomize Position Within the Block
            const buffer = roadWidth / 2 + 5
            const offsetX = (Math.random() - 0.5) * (blockSize - roadWidth - buffer * 2)
            const offsetZ = (Math.random() - 0.5) * (blockSize - roadWidth - buffer * 2)

            const houseX = blockCenterX + offsetX
            const houseZ = blockCenterZ + offsetZ

            // Randomize House Size
            const width = Math.random() * 20 + 5
            const height = Math.random() * 20 + 10
            const depth = Math.random() * 10 + 5

            // Update Dummy Object for Transformation
            dummy.position.set(houseX, height / 2, houseZ)
            dummy.scale.set(width / 10, height / 20, depth / 10)
            dummy.updateMatrix()

            // Set the Instance Matrix
            houseInstancedMesh.setMatrixAt(houseIndex, dummy.matrix)
            houseIndex++

            // Store House Data for Collision Detection
            houseData.push({
              position: new THREE.Vector3(houseX, height / 2, houseZ),
              size: { width: width / 10, height: height / 20, depth: depth / 10 },
            })
          }

          // Add Additional Trees in the Block
          const additionalTreesCount = 3 // Number of additional trees per block
          for (let t = 0; t < additionalTreesCount; t++) {
            // Random Position Within the Block
            const buffer = roadWidth / 2 + 10
            const treeOffsetX = (Math.random() - 0.5) * (blockSize - roadWidth - buffer * 2)
            const treeOffsetZ = (Math.random() - 0.5) * (blockSize - roadWidth - buffer * 2)

            const treeX = blockCenterX + treeOffsetX
            const treeZ = blockCenterZ + treeOffsetZ

            // Randomize Tree Scale
            const treeScale = 0.8 + Math.random() * 0.4

            // Update Dummy Object for Transformation
            dummy.position.set(treeX, 1, treeZ) // Positioned at y=1 to sit on the ground
            dummy.scale.set(treeScale, treeScale, treeScale)
            dummy.updateMatrix()

            // Set the Instance Matrix
            treeInstancedMesh.setMatrixAt(treeIndex, dummy.matrix)
            treeIndex++

            // Store Tree Data for Collision Detection
            treeData.push({
              position: new THREE.Vector3(treeX, 1, treeZ),
              scale: treeScale,
            })
          }
        }
      }

      // Add InstancedMeshes to the Scene
      scene.add(houseInstancedMesh)
      scene.add(treeInstancedMesh)

      // Load OBJ Model as Car
      const objLoaderMain = new OBJLoader()

      // Load the Car Model
      objLoaderMain.load(
        '/assets/models/model_0.obj',
        (object) => {
          car = object

          // Set Scale and Position
          car.scale.set(0.01, 0.01, 0.01)
          car.position.y = -1.65

          // Rotate to Face Positive Z-axis
          car.rotation.y += Math.PI

          // Load Texture for the Car
          textureLoader.load(
            '/assets/models/Volvo_Diffusenew.png',
            (texture: THREE.Texture) => {
              texture.wrapS = THREE.RepeatWrapping
              texture.wrapT = THREE.RepeatWrapping
              texture.encoding = THREE.sRGBEncoding
              texture.minFilter = THREE.LinearMipMapNearestFilter
              texture.magFilter = THREE.LinearFilter
              texture.generateMipmaps = true
              texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4)

              // Apply Texture to All Meshes in the Car Object
              car.traverse((node) => {
                if ((node as THREE.Mesh).isMesh) {
                  const mesh = node as THREE.Mesh
                  mesh.material = new THREE.MeshBasicMaterial({
                    map: texture,
                  })
                  mesh.castShadow = false
                  mesh.receiveShadow = false
                  mesh.material.side = THREE.DoubleSide
                }
              })
            },
            undefined,
            (error) => handleLoadingError(error, 'Volvo_Diffusenew.png'),
          )

          // Add Car to the Scene
          scene.add(car)
          modelLoaded = true
          console.log('Car model loaded successfully with the correct texture')
        },
        undefined,
        (error) => handleLoadingError(error, 'model_0.obj'),
      )

      // Load Equirectangular Texture for Background
      const textureLoader2 = new THREE.TextureLoader()
      textureLoader2.load(
        '/assets/images/6.png',
        (texture) => {
          texture.mapping = THREE.EquirectangularReflectionMapping
          scene.background = texture
          // Add Warm Color Overlay to Sky
          scene.fog = new THREE.FogExp2(0xffd4a3, 0.002)
        },
        undefined,
        (error) => handleLoadingError(error, '6.png'),
      )

      // Load Explosion Sprite Sheet Texture
      explosionTexture = textureLoader.load(
        '/assets/images/exp2.png',
        (texture: THREE.Texture) => {
          texture.wrapS = THREE.ClampToEdgeWrapping
          texture.wrapT = THREE.ClampToEdgeWrapping
          texture.minFilter = THREE.NearestFilter
          texture.magFilter = THREE.NearestFilter
          texture.repeat.set(1 / explosionCols, 1 / explosionRows)
        },
        undefined,
        (error) => handleLoadingError(error, 'exp2.png'),
      )

      animate()
    }

    // Helper Function to Create Detailed Pine Tree Geometry
    const createPineTreeGeometry = (): THREE.BufferGeometry => {
      const trunkGeometry = new THREE.CylinderGeometry(0.2, 0.2, 2, 8)
      const foliageGeometries: THREE.BufferGeometry[] = []
      const numLayers = 3
      const foliageHeight = 3
      const layerHeight = foliageHeight / numLayers

      for (let i = 0; i < numLayers; i++) {
        const radius = 1.5 - i * 0.5 // Decrease radius for each upper layer
        const coneGeometry = new THREE.ConeGeometry(radius, layerHeight, 8)
        coneGeometry.translate(0, 2 + i * layerHeight, 0)
        foliageGeometries.push(coneGeometry)
      }

      // Merge All Foliage Layers
      const foliageGeometry = BufferGeometryUtils.mergeGeometries(foliageGeometries, false)

      // Merge Trunk and Foliage Geometries
      const treeGeometry = BufferGeometryUtils.mergeGeometries(
        [trunkGeometry, foliageGeometry],
        false,
      )

      if (!treeGeometry) {
        console.error('Failed to merge tree geometries')
        return new THREE.BufferGeometry()
      }

      return treeGeometry
    }

    let prevTime = performance.now()

    const animate = (time: number) => {
      const deltaTime = time - prevTime // Time in milliseconds
      prevTime = time

      requestAnimationFrame(animate)

      if (showVehicleSelection.value) {
        // Vehicle Selection Screen Rendering
        if (vehicleSelectionCar) {
          vehicleSelectionCar.rotation.y += 0.007 // Slow spin
        }
        renderer.render(vehicleSelectionScene, vehicleSelectionCamera)
      } else {
        // Game Running or Game Over
        if (modelLoaded && car && !isGameOver.value && !showOverlay.value) {
          // Main Game Logic (movement, controls, etc.)

          // Calculate Dynamic Acceleration Based on Current Speed
          const speedFactor = Math.abs(velocity) / MAX_SPEED
          const accelerationFactor = 1 - speedFactor
          const currentAcceleration =
            MIN_ACCELERATION + (MAX_ACCELERATION - MIN_ACCELERATION) * accelerationFactor

          // Handle Acceleration and Deceleration
          if (keys.ArrowUp) {
            velocity += currentAcceleration * (deltaTime / 1000)
          }
          if (keys.ArrowDown) {
            velocity -= DECELERATION * (deltaTime / 1000)
          }

          // Apply Friction When No Keys Are Pressed
          if (!keys.ArrowUp && !keys.ArrowDown) {
            velocity *= FRICTION
          }

          // Clamp the Velocity
          velocity = THREE.MathUtils.clamp(velocity, MAX_REVERSE_SPEED, MAX_SPEED)

          // Threshold to Stop the Car When Speed Is Very Low
          const velocityThreshold = 0.001
          if (Math.abs(velocity) < velocityThreshold) {
            velocity = 0
          }

          // Move the Car Forward or Backward
          car.translateZ(velocity * (deltaTime / 1000) * 100) // Adjusted multiplier

          const minSteerSpeed = Math.PI / 100
          let steerFactor = 0
          if (Math.abs(velocity) > minSteerSpeed) {
            steerFactor = Math.sign(velocity)
          }

          // Calculate Dynamic Steering Sensitivity Based on Current Speed
          const steeringSensitivity =
            MAX_STEERING_SENSITIVITY -
            (MAX_STEERING_SENSITIVITY - MIN_STEERING_SENSITIVITY) * speedFactor

          // Adjust Rotation Acceleration
          const baseRotationAcceleration = 0.015 // Slightly reduced base rotation acceleration
          const dynamicRotationAcceleration = baseRotationAcceleration * steeringSensitivity

          if (steerFactor !== 0) {
            if (keys.ArrowLeft) {
              angularVelocity += dynamicRotationAcceleration * steerFactor
            }
            if (keys.ArrowRight) {
              angularVelocity -= dynamicRotationAcceleration * steerFactor
            }
          } else {
            angularVelocity = 0
          }

          angularVelocity *= rotationDamping

          const angularThreshold = 0.0001
          if (Math.abs(angularVelocity) < angularThreshold) {
            angularVelocity = 0
          }

          angularVelocity = THREE.MathUtils.clamp(angularVelocity, -0.5, 0.5) // Adjusted turning

          if (steerFactor !== 0) {
            car.rotation.y += angularVelocity * (deltaTime / 1000) * 30 // Adjusted multiplier
          }

          // Calculate Tilt Angle Based on Speed and Angular Velocity
          let targetTiltAngle = 0
          if (angularVelocity !== 0 && Math.abs(velocity) > minSteerSpeed) {
            const tiltSpeedFactor = Math.abs(velocity) / MAX_SPEED
            targetTiltAngle =
              -MAX_TILT_ANGLE * (angularVelocity / MAX_TURN_RATE) * tiltSpeedFactor
          }

          // Smoothly Interpolate Current Tilt Angle Towards Target Tilt Angle
          currentTiltAngle = THREE.MathUtils.lerp(
            currentTiltAngle,
            targetTiltAngle,
            TILT_LERP_FACTOR,
          )

          // Apply Tilt to the Car Model
          car.rotation.z = currentTiltAngle

          // Calculate Speed in km/h
          const speedInKmH = Math.abs(velocity) * 100

          // Draw the Speedometer
          drawSpeedometer(speedInKmH)

          // Camera Follow Logic
          const desiredCameraOffset = new THREE.Vector3(1, 5, -5)
          const relativeCameraOffset = desiredCameraOffset.clone()

          // Rotate the Offset Based on the Car's Rotation
          relativeCameraOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), car.rotation.y)

          const desiredCameraPosition = car.position.clone().add(relativeCameraOffset)

          // Smoothly Interpolate the Camera Position
          camera.position.lerp(desiredCameraPosition, 0.05) // Adjusted lerp factor

          // Create a Look-at Point in Front of and Above the Car
          const lookAtOffset = new THREE.Vector3(0, 2, 10)
          lookAtOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), car.rotation.y)
          const lookAtPoint = car.position.clone().add(lookAtOffset)

          // Make the Camera Look at This Point
          camera.lookAt(lookAtPoint)
          camera.position.y = THREE.MathUtils.clamp(camera.position.y, 1, 20)

          // Collision Detection
          const carPosition = car.position.clone()

          // Check Collision with Houses
          for (let i = 0; i < houseData.length; i++) {
            const house = houseData[i]
            const dx = carPosition.x - house.position.x
            const dz = carPosition.z - house.position.z
            const distance = Math.sqrt(dx * dx + dz * dz)
            const collisionDistance = 5 // Adjust as necessary

            if (distance < collisionDistance) {
              // Collision Detected
              handleCollision()
              break
            }
          }

          // Check Collision with Trees
          for (let i = 0; i < treeData.length; i++) {
            const tree = treeData[i]
            const dx = carPosition.x - tree.position.x
            const dz = carPosition.z - tree.position.z
            const distance = Math.sqrt(dx * dx + dz * dz)
            const collisionDistance = 3 // Adjust as necessary

            if (distance < collisionDistance) {
              handleCollision()
              break
            }
          }
        }

        // Update Explosion Animation
        if (isGameOver.value && explosionSprite && explosionStartTime !== null) {
          const elapsed = time - explosionStartTime
          const frame = Math.floor((elapsed / explosionDuration) * totalExplosionFrames)

          if (frame < totalExplosionFrames) {
            const currentColumn = frame % explosionCols
            const currentRow = Math.floor(frame / explosionCols)

            explosionTexture.offset.x = currentColumn / explosionCols
            explosionTexture.offset.y = 1 - (currentRow + 1) / explosionRows
          } else {
            // After Explosion Animation Ends
            scene.remove(explosionSprite)
            explosionSprite = null
          }
        }

        // Always Render the Scene
        renderer.render(scene, camera)
      }
    }

    const handleCollision = () => {
      isGameOver.value = true

      // Play Explosion Sound
      if (!explosionAudio) {
        explosionAudio = new Audio('/assets/sounds/boom.mp3')
        explosionAudio.volume = 0.5
      }
      explosionAudio.currentTime = 0 // Reset audio to start
      explosionAudio.play().catch((error) => {
        console.error('Error playing explosion sound:', error)
      })

      // Create the Explosion Sprite
      const explosionMaterial = new THREE.SpriteMaterial({
        map: explosionTexture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      })
      explosionSprite = new THREE.Sprite(explosionMaterial)
      explosionSprite.position.copy(car.position)
      explosionSprite.scale.set(25, 25, 2)

      // Adjust Explosion Sprite Position to Be Slightly Closer to the Camera
      const explosionOffset = new THREE.Vector3(-3, 0, 5)
      explosionSprite.position.add(explosionOffset)

      scene.add(explosionSprite)

      // Record the Start Time of the Explosion
      explosionStartTime = performance.now()

      // Store the Camera's Current Position
      const cameraPos = camera.position.clone()
      camera.position.copy(cameraPos)

      // Remove the Car from the Scene
      scene.remove(car)

      // Stop the Car's Movement
      velocity = 0
      angularVelocity = 0

      setTimeout(() => resetGame(false), 1000)
    }

    // Function to Draw the Speedometer
    const drawSpeedometer = (speed: number) => {
      if (!speedometerContext || !speedometerCanvas.value) return

      const ctx = speedometerContext
      const canvas = speedometerCanvas.value
      const width = (canvas.width = canvas.clientWidth)
      const height = (canvas.height = canvas.clientHeight)

      ctx.clearRect(0, 0, width, height)

      // Draw the Speedometer Background
      ctx.beginPath()
      ctx.arc(width / 2, height / 2, width / 2 - 5, 0, 2 * Math.PI)
      ctx.fillStyle = '#222' // Dark background for retro look
      ctx.fill()

      // Draw the Outer Rim
      ctx.beginPath()
      ctx.arc(width / 2, height / 2, width / 2 - 5, 0, 2 * Math.PI)
      ctx.strokeStyle = '#555'
      ctx.lineWidth = 5
      ctx.stroke()

      // Draw the Speedometer Ticks
      ctx.strokeStyle = '#ccc'
      ctx.lineWidth = 2
      const maxSpeed = 200
      const numTicks = 10
      const startAngle = (0.8 * Math.PI) / 1 // 144 degrees
      const endAngle = (2.2 * Math.PI) / 1 // 396 degrees

      for (let i = 0; i <= numTicks; i++) {
        const angle = startAngle + (i / numTicks) * (endAngle - startAngle)
        const x1 = width / 2 + (width / 2 - 20) * Math.cos(angle)
        const y1 = height / 2 + (height / 2 - 20) * Math.sin(angle)
        const x2 = width / 2 + (width / 2 - 30) * Math.cos(angle)
        const y2 = height / 2 + (height / 2 - 30) * Math.sin(angle)
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()

        // Draw Speed Labels at Each Tick
        const speedLabel = (i * (maxSpeed / numTicks)).toString()
        const labelX = width / 2 + (width / 2 - 40) * Math.cos(angle)
        const labelY = height / 2 + (height / 2 - 40) * Math.sin(angle) + 5
        ctx.fillStyle = '#fff'
        ctx.font = '10px Arial'
        ctx.textAlign = 'center'
        ctx.fillText(speedLabel, labelX, labelY)
      }

      // Draw the Needle
      const needleAngle = startAngle + (speed / maxSpeed) * (endAngle - startAngle)
      const needleLength = width / 2 - 40
      const needleX = width / 2 + needleLength * Math.cos(needleAngle)
      const needleY = height / 2 + needleLength * Math.sin(needleAngle)

      ctx.strokeStyle = 'red'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(width / 2, height / 2)
      ctx.lineTo(needleX, needleY)
      ctx.stroke()

      // Draw the Center Circle
      ctx.beginPath()
      ctx.arc(width / 2, height / 2, 5, 0, 2 * Math.PI)
      ctx.fillStyle = '#fff'
      ctx.fill()

      // Draw the Speed Text
      ctx.fillStyle = '#fff'
      ctx.font = '12px Arial'
      ctx.textAlign = 'center'
      ctx.fillText(`${Math.round(speed)} km/h`, width / 2, height / 2 + 30)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (showVehicleSelection.value) {
        if (event.key === 'Enter') {
          event.preventDefault()
          // Start the Game
          showVehicleSelection.value = false
          resetGame(true)
          // Stop Vehicle Selection Music
          if (vehicleSelectionMusic) {
            vehicleSelectionMusic.pause()
            vehicleSelectionMusic.currentTime = 0
          }
          // Start Background Music
          playBackgroundMusic()
        }
      } else {
        if (event.key in keys) {
          event.preventDefault()
          keys[event.key] = true
        }
      }
    }

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key in keys) {
        event.preventDefault()
        keys[event.key] = false
      }
    }

    const handleResize = () => {
      const container = gameContainer.value
      if (!container) return

      const containerWidth = container.clientWidth
      const containerHeight = container.clientHeight
      const aspectRatio = RENDERER_WIDTH / RENDERER_HEIGHT

      let width = containerWidth
      let height = containerWidth / aspectRatio

      if (height > containerHeight) {
        height = containerHeight
        width = containerHeight * aspectRatio
      }

      // Keep the Renderer Size Fixed to Maintain Pixelation
      renderer.domElement.style.width = `${width}px`
      renderer.domElement.style.height = `${height}px`

      // Update Camera Aspect Ratio
      camera.aspect = width / height
      camera.updateProjectionMatrix()

      // Update Vehicle Selection Camera Aspect Ratio
      if (vehicleSelectionCamera) {
        vehicleSelectionCamera.aspect = width / height
        vehicleSelectionCamera.updateProjectionMatrix()
      }
    }

    const onMountedHandler = () => {
      window.addEventListener('keydown', onKeyDown)
      window.addEventListener('keyup', onKeyUp)

      if (gameContainer.value) {
        initScene()
        initVehicleSelectionScene()
      }
      window.addEventListener('resize', handleResize)
      handleResize()

      // Initialize Speedometer Context
      const canvas = speedometerCanvas.value
      if (canvas) {
        speedometerContext = canvas.getContext('2d')
      }
    }

    const resetGame = (isInitialSpawn = false) => {
      isGameOver.value = false

      // Remove Explosion Sprite from Scene
      if (explosionSprite) {
        scene.remove(explosionSprite)
        explosionSprite = null
      }
      explosionStartTime = null

      // Reset Ambient Light Intensity to Normal
      ambientLight.intensity = 1

      // Add the Car Back to the Scene if Not Already There
      if (!scene.children.includes(car)) {
        scene.add(car)
      }

      // Reset Variables
      velocity = 0
      angularVelocity = 0

      // Initial Spawn Position
      if (isInitialSpawn) {
        car.position.set(0, car.position.y, 0)
      } else {
        // Reset Car's Position to a New Random Position
        const maxPosition = 10 * (60 + 15) // rows * blockSpacing
        const randomX = (Math.random() - 0.5) * maxPosition
        const randomZ = (Math.random() - 0.5) * maxPosition
        car.position.set(randomX, car.position.y, randomZ)
      }

      // Reset Car's Rotation
      car.rotation.set(0, 0, 0)
    }

    // Play Background Music
    const playBackgroundMusic = () => {
      if (!backgroundAudio) {
        backgroundAudio = new Audio('/assets/sounds/barseback.mp3')
        backgroundAudio.loop = true
        backgroundAudio.volume = 0.5
      }
      backgroundAudio.play().catch((error) => {
        console.error('Error playing background music:', error)
      })
    }

    // Play Vehicle Selection Music
    const playVehicleSelectionMusic = () => {
      if (!vehicleSelectionMusic) {
        vehicleSelectionMusic = new Audio('/assets/sounds/1080.mp3')
        vehicleSelectionMusic.loop = true
        vehicleSelectionMusic.volume = 0.7
      }
      vehicleSelectionMusic.play().catch((error) => {
        console.error('Error playing vehicle selection music:', error)
      })
    }

    // Start the Game When "Play" is Clicked
    const startGame = () => {
      showOverlay.value = false
      showVehicleSelection.value = true
      playVehicleSelectionMusic()
    }

    onMounted(onMountedHandler)

    onBeforeUnmount(() => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)

      if (renderer) {
        renderer.dispose()
        renderer.forceContextLoss()
        renderer.domElement.remove()
      }

      if (scene) {
        scene.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            if (object.geometry) object.geometry.dispose()
            if (object.material) {
              if (Array.isArray(object.material)) {
                object.material.forEach((material) => material.dispose())
              } else {
                object.material.dispose()
              }
            }
          }
        })
      }
      window.removeEventListener('resize', handleResize)

      // Stop Background Music
      if (backgroundAudio) {
        backgroundAudio.pause()
        backgroundAudio = null
      }

      // Stop and Cleanup Explosion Audio
      if (explosionAudio) {
        explosionAudio.pause()
        explosionAudio = null
      }

      // Stop and Cleanup Vehicle Selection Music
      if (vehicleSelectionMusic) {
        vehicleSelectionMusic.pause()
        vehicleSelectionMusic = null
      }
    })

    return {
      gameContainer,
      speedometerCanvas,
      isGameOver,
      showOverlay,
      startGame,
      showVehicleSelection,
    }
  },
})
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
  image-rendering: pixelated; /* Ensures the upscaled image remains pixelated */
}

.speedometer-container {
  position: absolute;
  bottom: 5%;
  right: 5%;
  width: 12vw;
  height: 25vh;
  pointer-events: none;
}

.speedometer-container canvas {
  width: 100%;
  height: 100%;
}

/* Styles for the Initial Overlay */
.overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: black; /* Or transparent if you prefer */
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 10; /* Ensure the overlay is on top */
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

/* Styles for the Vehicle Selection Overlay */
.vehicle-selection-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: transparent; /* Or black with some transparency */
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 10; /* Ensure it is on top */
}

.vehicle-stats {
  position: absolute;
  color: white;
  text-align: center;
  margin-top: 52vh;
  font-size: 30px;
  font-family: 'Press Start 2P', 'VT323', 'Pixelated MS Sans Serif', 'Monaco', monospace;
  text-shadow:
    6px 6px 0 #000,
    -6px -6px 0 #000,
    6px -6px 0 #000,
    -6px 6px 0 #000,
    0 6px 0 #000,
    6px 0 0 #000,
    0 -6px 0 #000,
    -6px 0 0 #000;
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: none;
}
</style>
