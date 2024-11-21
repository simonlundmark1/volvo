<template>
  <div class="game-container" ref="gameContainer"></div>
  <div class="speedometer-container">
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

    // Constants for acceleration and speed
    const MAX_SPEED = 20 // Maximum speed
    const MAX_REVERSE_SPEED = -10 // Maximum reverse speed
    const MAX_ACCELERATION = 0.3 // Slightly higher initial acceleration
    const MIN_ACCELERATION = 0.01 // Smaller decrease at high speeds
    const DECELERATION = 1.5 // Adjusted deceleration rate when braking
    const FRICTION = 0.993 // Friction coefficient

    const MAX_STEERING_SENSITIVITY = 0.25 // Reduced range for steering sensitivity
    const MIN_STEERING_SENSITIVITY = 0.1

    // Added constants for tilting
    const MAX_TILT_ANGLE = THREE.MathUtils.degToRad(-15) // Maximum tilt angle in radians
    const TILT_LERP_FACTOR = 0.3 // Factor for smoothing tilt changes
    const MAX_TURN_RATE = 0.02 // Maximum absolute value of angularVelocity

    // Variable to track the current tilt angle of the car
    let currentTiltAngle = 0

    // Reduced renderer dimensions for improved performance
    const RENDERER_WIDTH = 480
    const RENDERER_HEIGHT = 360

    const handleLoadingError = (error: unknown, assetType: string) => {
      console.error(`Error loading ${assetType}:`, error)
    }

    const initScene = () => {
      // Initialize Scene
      scene = markRaw(new THREE.Scene())
      scene.background = new THREE.Color(0x87ceeb) // Sky blue background

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

      // Add Ambient Light to the Scene
      const ambientLight = new THREE.AmbientLight(0xffffff, 1)
      scene.add(ambientLight)

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
      const planeGeometry = new THREE.PlaneGeometry(1000, 1000)
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

      // Define road and grid properties
      const roadWidth = 15
      const roadHeight = 0.02
      const blockSize = 60
      // Increased rows and columns to make the game world bigger
      const rows = 10
      const columns = 10
      const blockSpacing = blockSize + roadWidth

      // Create the material for the roads with the road texture
      const roadMaterial = new THREE.MeshBasicMaterial({
        map: roadTexture,
      })

      // Create horizontal roads (X-axis roads)
      for (let row = 0; row <= rows; row++) {
        const roadGeometry = new THREE.BoxGeometry(columns * blockSpacing, roadHeight, roadWidth)
        const roadMesh = new THREE.Mesh(roadGeometry, roadMaterial)

        // Position each horizontal road
        roadMesh.position.set(
          (columns * blockSpacing) / 2 - blockSpacing / 2,
          roadHeight / 2,
          row * blockSpacing - blockSpacing / 2,
        )

        // Add the horizontal road to the scene
        scene.add(roadMesh)
      }

      // Create vertical roads (Z-axis roads)
      for (let col = 0; col <= columns; col++) {
        const roadGeometry = new THREE.BoxGeometry(roadWidth, roadHeight, rows * blockSpacing)
        const roadMesh = new THREE.Mesh(roadGeometry, roadMaterial)

        // Position each vertical road
        roadMesh.position.set(
          col * blockSpacing - blockSpacing / 2,
          roadHeight / 2,
          (rows * blockSpacing) / 2 - blockSpacing / 2,
        )

        // Add the vertical road to the scene
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

      // Prepare geometries and materials for instancing
      const pineTreeGeometry = createPineTreeGeometry()
      const pineTreeMaterial = new THREE.MeshBasicMaterial({ color: 0x228b22 })

      const houseGeometry = new THREE.BoxGeometry(10, 20, 10)
      const houseMaterial = new THREE.MeshBasicMaterial({
        map: houseTexture,
      })

      // Calculate total number of houses and trees
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

      // Index counters for instances
      let houseIndex = 0
      let treeIndex = 0

      // Add Houses and Trees using InstancedMesh
      const dummy = new THREE.Object3D()

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < columns; col++) {
          // Center position of each block
          const blockCenterX = col * blockSpacing
          const blockCenterZ = row * blockSpacing

          // Randomly decide the number of houses in this block
          const houseCount = Math.floor(Math.random() * 3) + 1

          for (let i = 0; i < houseCount; i++) {
            // Randomize position within the block
            const buffer = roadWidth / 2 + 5
            const offsetX = (Math.random() - 0.5) * (blockSize - roadWidth - buffer * 2)
            const offsetZ = (Math.random() - 0.5) * (blockSize - roadWidth - buffer * 2)

            const houseX = blockCenterX + offsetX
            const houseZ = blockCenterZ + offsetZ

            // Randomize house size
            const width = Math.random() * 20 + 5
            const height = Math.random() * 20 + 10
            const depth = Math.random() * 10 + 5

            // Update dummy object for transformation
            dummy.position.set(houseX, height / 2, houseZ)
            dummy.scale.set(width / 10, height / 20, depth / 10)
            dummy.updateMatrix()

            // Set the instance matrix
            houseInstancedMesh.setMatrixAt(houseIndex, dummy.matrix)
            houseIndex++
          }

          // Add Additional Trees in the Block
          const additionalTreesCount = 3 // Number of additional trees per block
          for (let t = 0; t < additionalTreesCount; t++) {
            // Random position within the block
            const buffer = roadWidth / 2 + 10
            const treeOffsetX = (Math.random() - 0.5) * (blockSize - roadWidth - buffer * 2)
            const treeOffsetZ = (Math.random() - 0.5) * (blockSize - roadWidth - buffer * 2)

            const treeX = blockCenterX + treeOffsetX
            const treeZ = blockCenterZ + treeOffsetZ

            // Randomize tree scale
            const treeScale = 0.8 + Math.random() * 0.4

            // Update dummy object for transformation
            dummy.position.set(treeX, 1, treeZ) // Positioned at y=1 to sit on the ground
            dummy.scale.set(treeScale, treeScale, treeScale)
            dummy.updateMatrix()

            // Set the instance matrix
            treeInstancedMesh.setMatrixAt(treeIndex, dummy.matrix)
            treeIndex++
          }
        }
      }

      // Add InstancedMeshes to the scene
      scene.add(houseInstancedMesh)
      scene.add(treeInstancedMesh)

      // Load OBJ Model as Car
      const objLoader = new OBJLoader()

      // Load the car model
      objLoader.load(
        '/assets/models/model_0.obj',
        (object) => {
          car = object

          // Set the scale and position of the car
          car.scale.set(0.01, 0.01, 0.01)
          car.position.y = -1.65

          // Rotate the Car Model to Face Positive Z-axis
          car.rotation.y += Math.PI

          // Load the texture for the car
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

              // Apply the texture to all the meshes in the car object
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

          scene.add(car)
          modelLoaded = true
          console.log('Car model loaded successfully with the correct texture')
        },
        undefined,
        (error) => handleLoadingError(error, 'model_0.obj'),
      )

      animate()
    }

    // Helper function to create a more detailed pine tree geometry
    const createPineTreeGeometry = (): THREE.BufferGeometry => {
      const trunkGeometry = new THREE.CylinderGeometry(0.2, 0.2, 2, 8)
      const foliageGeometries = []
      const numLayers = 3
      const foliageHeight = 3
      const layerHeight = foliageHeight / numLayers

      for (let i = 0; i < numLayers; i++) {
        const radius = 1.5 - i * 0.5 // Decrease radius for each upper layer
        const coneGeometry = new THREE.ConeGeometry(radius, layerHeight, 8)
        coneGeometry.translate(0, 2 + i * layerHeight, 0)
        foliageGeometries.push(coneGeometry)
      }

      // Merge all foliage layers
      const foliageGeometry = BufferGeometryUtils.mergeGeometries(foliageGeometries, false)

      // Merge trunk and foliage geometries
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
      const deltaTime = (time - prevTime) / 1000 // Convert to seconds
      prevTime = time

      requestAnimationFrame(animate)

      if (modelLoaded && car) {
        // Calculate dynamic acceleration based on current speed
        const speedFactor = Math.abs(velocity) / MAX_SPEED
        const accelerationFactor = 1 - speedFactor
        const currentAcceleration =
          MIN_ACCELERATION + (MAX_ACCELERATION - MIN_ACCELERATION) * accelerationFactor

        // Handle acceleration and deceleration
        if (keys.ArrowUp) {
          velocity += currentAcceleration * deltaTime
        }
        if (keys.ArrowDown) {
          velocity -= DECELERATION * deltaTime
        }

        // Apply friction when no keys are pressed
        if (!keys.ArrowUp && !keys.ArrowDown) {
          velocity *= FRICTION
        }

        // Clamp the velocity
        velocity = THREE.MathUtils.clamp(velocity, MAX_REVERSE_SPEED, MAX_SPEED)

        // Threshold to stop the car when speed is very low
        const velocityThreshold = 0.001
        if (Math.abs(velocity) < velocityThreshold) {
          velocity = 0
        }

        // Move the car forward or backward
        car.translateZ(velocity * deltaTime * 100) // Adjusted multiplier

        const minSteerSpeed = Math.PI / 100
        let steerFactor = 0
        if (Math.abs(velocity) > minSteerSpeed) {
          steerFactor = Math.sign(velocity)
        }

        // Calculate dynamic steering sensitivity based on current speed
        const steeringSensitivity =
          MAX_STEERING_SENSITIVITY -
          (MAX_STEERING_SENSITIVITY - MIN_STEERING_SENSITIVITY) * speedFactor

        // Adjust rotation acceleration
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
          car.rotation.y += angularVelocity * deltaTime * 30 // Adjusted multiplier
        }

        // Calculate tilt angle based on speed and angular velocity
        let targetTiltAngle = 0
        if (angularVelocity !== 0 && Math.abs(velocity) > minSteerSpeed) {
          const tiltSpeedFactor = Math.abs(velocity) / MAX_SPEED
          targetTiltAngle = -MAX_TILT_ANGLE * (angularVelocity / MAX_TURN_RATE) * tiltSpeedFactor
        }

        // Smoothly interpolate current tilt angle towards target tilt angle
        currentTiltAngle = THREE.MathUtils.lerp(currentTiltAngle, targetTiltAngle, TILT_LERP_FACTOR)

        // Apply tilt to the car model
        car.rotation.z = currentTiltAngle

        // Calculate speed in km/h
        const speedInKmH = Math.abs(velocity) * 100

        // Draw the speedometer
        drawSpeedometer(speedInKmH)

        // Camera Follow Logic
        const desiredCameraOffset = new THREE.Vector3(1, 5, -5)
        const relativeCameraOffset = desiredCameraOffset.clone()

        // Rotate the offset based on the car's rotation
        relativeCameraOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), car.rotation.y)

        const desiredCameraPosition = car.position.clone().add(relativeCameraOffset)

        // Smoothly interpolate the camera position
        camera.position.lerp(desiredCameraPosition, 0.05) // Adjusted lerp factor

        // Create a look-at point in front of and above the car
        const lookAtOffset = new THREE.Vector3(0, 2, 10)
        lookAtOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), car.rotation.y)
        const lookAtPoint = car.position.clone().add(lookAtOffset)

        // Make the camera look at this point
        camera.lookAt(lookAtPoint)
        camera.position.y = THREE.MathUtils.clamp(camera.position.y, 1, 20)
      }

      // Render the Scene
      renderer.render(scene, camera)
    }

    // Function to draw the speedometer
    const drawSpeedometer = (speed: number) => {
      if (!speedometerContext || !speedometerCanvas.value) return

      const ctx = speedometerContext
      const canvas = speedometerCanvas.value
      const width = (canvas.width = canvas.clientWidth)
      const height = (canvas.height = canvas.clientHeight)

      ctx.clearRect(0, 0, width, height)

      // Draw the speedometer background
      ctx.beginPath()
      ctx.arc(width / 2, height / 2, width / 2 - 5, 0, 2 * Math.PI)
      ctx.fillStyle = '#222' // Dark background for retro look
      ctx.fill()

      // Draw the outer rim
      ctx.beginPath()
      ctx.arc(width / 2, height / 2, width / 2 - 5, 0, 2 * Math.PI)
      ctx.strokeStyle = '#555'
      ctx.lineWidth = 5
      ctx.stroke()

      // Draw the speedometer ticks
      ctx.strokeStyle = '#ccc'
      ctx.lineWidth = 2
      const maxSpeed = 200
      const numTicks = 10
      const startAngle = (0.8 * Math.PI) / 1 // 225 degrees (bottom left)
      const endAngle = (2.2 * Math.PI) / 1 // 315 degrees (bottom right)

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

        // Draw speed labels at each tick
        const speedLabel = (i * (maxSpeed / numTicks)).toString()
        const labelX = width / 2 + (width / 2 - 40) * Math.cos(angle)
        const labelY = height / 2 + (height / 2 - 40) * Math.sin(angle) + 5
        ctx.fillStyle = '#fff'
        ctx.font = '10px Arial'
        ctx.textAlign = 'center'
        ctx.fillText(speedLabel, labelX, labelY)
      }

      // Draw the needle
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

      // Draw the center circle
      ctx.beginPath()
      ctx.arc(width / 2, height / 2, 5, 0, 2 * Math.PI)
      ctx.fillStyle = '#fff'
      ctx.fill()

      // Draw the speed text
      ctx.fillStyle = '#fff'
      ctx.font = '12px Arial'
      ctx.textAlign = 'center'
      ctx.fillText(`${Math.round(speed)} km/h`, width / 2, height / 2 + 30)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key in keys) {
        event.preventDefault()
        keys[event.key] = true
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

      // Keep the renderer size fixed to maintain pixelation
      renderer.domElement.style.width = `${width}px`
      renderer.domElement.style.height = `${height}px`

      // Update camera aspect ratio
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }

    const onMountedHandler = () => {
      window.addEventListener('keydown', onKeyDown)
      window.addEventListener('keyup', onKeyUp)

      if (gameContainer.value) {
        initScene()
      }
      window.addEventListener('resize', handleResize)
      handleResize()

      // Initialize speedometer context
      const canvas = speedometerCanvas.value
      if (canvas) {
        speedometerContext = canvas.getContext('2d')
      }
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
    })

    return {
      gameContainer,
      speedometerCanvas,
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
</style>
