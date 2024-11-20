<template>
  <div class="game-container" ref="gameContainer"></div>
</template>

<script lang="ts">
import { defineComponent, markRaw, onMounted, onBeforeUnmount, ref } from 'vue'
import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader'
import { TextureLoader } from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls' // Import OrbitControls

export default defineComponent({
  name: 'GameComponent',
  setup() {
    const gameContainer = ref<HTMLElement | null>(null)
    let scene: THREE.Scene
    let camera: THREE.PerspectiveCamera
    let renderer: THREE.WebGLRenderer
    let controls: OrbitControls // Declare the OrbitControls variable
    let car: THREE.Object3D
    const keys: Record<string, boolean> = {
      ArrowUp: false,
      ArrowDown: false,
      ArrowLeft: false,
      ArrowRight: false,
    }
    let velocity = 0
    let angularVelocity = 0 // New variable for angular velocity
    const rotationAcceleration = 0.0009 // Acceleration per frame
    const rotationDamping = 0.95 // Damping factor
    let modelLoaded = false

    const RENDERER_WIDTH = 640
    const RENDERER_HEIGHT = 480

    const handleLoadingError = (error: unknown, assetType: string) => {
      console.error(`Error loading ${assetType}:`, error)
    }

    const initScene = () => {
      // Initialize Scene
      scene = markRaw(new THREE.Scene())
      scene.background = new THREE.Color(0x87ceeb)

      // Initialize Camera
      camera = markRaw(
        new THREE.PerspectiveCamera(
          90, // Field of View
          RENDERER_WIDTH / RENDERER_HEIGHT, // Aspect Ratio
          0.1, // Near Clipping Plane
          10000, // Far Clipping Plane
        ),
      )
      camera.position.set(0, 5, 10) // Set initial position of the camera
      camera.rotation.x = -Math.PI / 6 // Tilt the camera upward slightly

      // Initialize Renderer
      renderer = markRaw(
        new THREE.WebGLRenderer({
          antialias: true,
          powerPreference: 'high-performance',
          stencil: false,
          depth: true,
        }),
      )
      renderer.setSize(RENDERER_WIDTH, RENDERER_HEIGHT)
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFSoftShadowMap

      // Append Renderer to the DOM
      if (gameContainer.value) {
        gameContainer.value.appendChild(renderer.domElement)
      } else {
        console.error('Game container is not available')
      }

      // Add Lights to the Scene
      const ambientLight = new THREE.AmbientLight(0xffffff, 1)
      scene.add(ambientLight)

      const directionalLight = new THREE.DirectionalLight(0xffffff, 2)
      directionalLight.position.set(0, 100, 0)
      directionalLight.castShadow = true
      scene.add(directionalLight)

      // Set up the directional light's shadow camera
      directionalLight.shadow.camera.left = -500 // Increase for larger area
      directionalLight.shadow.camera.right = 500 // Increase for larger area
      directionalLight.shadow.camera.top = 500 // Increase for larger area
      directionalLight.shadow.camera.bottom = -500 // Increase for larger area
      directionalLight.shadow.camera.near = 1 // Shadow start distance
      directionalLight.shadow.camera.far = 2000 // Shadow end distance

      // Adjust the shadow map size for better resolution
      directionalLight.shadow.mapSize.width = 9048 // Higher value for better shadow quality
      directionalLight.shadow.mapSize.height = 9048 // Higher value for better shadow quality

      const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6)
      hemisphereLight.position.set(0, 200, 0)
      scene.add(hemisphereLight)

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
          texture.minFilter = THREE.LinearFilter
          texture.magFilter = THREE.LinearFilter
          texture.generateMipmaps = true
        },
        (xhr: ProgressEvent<EventTarget>) => {
          if (xhr.lengthComputable) {
            const percentComplete = (xhr.loaded / xhr.total) * 100
            console.log(`Ground texture ${percentComplete.toFixed(2)}% loaded`)
          }
        },
        (error) => handleLoadingError(error, 'ground texture'),
      )

      // Create Ground Mesh
      const planeGeometry = new THREE.PlaneGeometry(1000, 1000)
      const planeMaterial = new THREE.MeshStandardMaterial({
        map: groundTexture,
        side: THREE.DoubleSide,
      })
      const ground = new THREE.Mesh(planeGeometry, planeMaterial)
      ground.rotation.x = -Math.PI / 2
      ground.position.set(0, 0, 0)
      ground.receiveShadow = true
      scene.add(ground)

      // Load Road Texture
      const roadTexture = textureLoader.load(
        '/assets/textures/road.jpg',
        (texture) => {
          texture.wrapS = THREE.RepeatWrapping
          texture.wrapT = THREE.RepeatWrapping
          texture.repeat.set(1, 40) // Adjust for vertical road repetition
          texture.encoding = THREE.sRGBEncoding
          texture.minFilter = THREE.LinearFilter
          texture.magFilter = THREE.LinearFilter
          texture.generateMipmaps = true
        },
        (xhr) => {
          if (xhr.lengthComputable) {
            const percentComplete = (xhr.loaded / xhr.total) * 100
            console.log(`Road texture ${percentComplete.toFixed(2)}% loaded`)
          }
        },
        (error) => handleLoadingError(error, 'road texture'),
      )

      // Define road and grid properties
      const roadWidth = 15 // Width of the road
      const roadHeight = 0.02 // Height of the road
      const blockSize = 60 // Size of the "block" area between roads (larger blocks)
      const rows = 10 // Number of rows of roads
      const columns = 10 // Number of columns of roads
      const blockSpacing = blockSize + roadWidth // Distance between road centers

      // Create the material for the roads with the road texture
      const roadMaterial = new THREE.MeshStandardMaterial({ map: roadTexture })

      // Create horizontal roads (X-axis roads)
      for (let row = 0; row <= rows; row++) {
        const roadGeometry = new THREE.BoxGeometry(columns * blockSpacing, roadHeight, roadWidth)
        const roadMesh = new THREE.Mesh(roadGeometry, roadMaterial)
        roadMesh.receiveShadow = true

        // Position each horizontal road
        roadMesh.position.set(
          (columns * blockSpacing) / 2 - blockSpacing / 2, // Center the road horizontally
          roadHeight / 2, // Slightly elevate the road
          row * blockSpacing - blockSpacing / 2, // Position along Z-axis
        )

        // Add the horizontal road to the scene
        scene.add(roadMesh)
      }

      // Create vertical roads (Z-axis roads)
      for (let col = 0; col <= columns; col++) {
        const roadGeometry = new THREE.BoxGeometry(roadWidth, roadHeight, rows * blockSpacing)
        const roadMesh = new THREE.Mesh(roadGeometry, roadMaterial)
        roadMesh.receiveShadow = true

        // Position each vertical road
        roadMesh.position.set(
          col * blockSpacing - blockSpacing / 2, // Position along X-axis
          roadHeight / 2, // Slightly elevate the road
          (rows * blockSpacing) / 2 - blockSpacing / 2, // Center the road vertically
        )

        // Add the vertical road to the scene
        scene.add(roadMesh)
      }

      // Optional: Add ground for blocks (optional green areas)
      const groundGeometry = new THREE.PlaneGeometry(columns * blockSpacing, rows * blockSpacing)
      const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x228b22 }) // Green for grass
      const ground3 = new THREE.Mesh(groundGeometry, groundMaterial)
      ground3.rotation.x = -Math.PI / 2 // Rotate to be horizontal
      ground3.receiveShadow = true

      // Add the ground beneath the roads
      scene.add(ground)

      // Add a console message for debugging
      console.log('Road grid with textured roads and spaced blocks created.')

      // Load House Texture
      const houseTexture = textureLoader.load(
        '/assets/textures/house.jpg', // Path to your house texture
        (texture) => {
          texture.wrapS = THREE.RepeatWrapping
          texture.wrapT = THREE.RepeatWrapping
          texture.repeat.set(1, 1) // Adjust repeat for tiling effect
          texture.encoding = THREE.sRGBEncoding
        },
        (xhr) => {
          if (xhr.lengthComputable) {
            const percentComplete = (xhr.loaded / xhr.total) * 100
            console.log(`House texture ${percentComplete.toFixed(2)}% loaded`)
          }
        },
        (error) => handleLoadingError(error, 'house texture'),
      )

      // Add Houses to the Blocks
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < columns; col++) {
          // Center position of each block
          const blockCenterX = col * blockSpacing
          const blockCenterZ = row * blockSpacing

          // Randomly decide the number of houses in this block
          const houseCount = Math.floor(Math.random() * 5) + 1

          for (let i = 0; i < houseCount; i++) {
            // Randomize position within the block
            const offsetX = (Math.random() - 0.5) * (blockSize - roadWidth)
            const offsetZ = (Math.random() - 0.5) * (blockSize - roadWidth)

            const houseX = blockCenterX + offsetX
            const houseZ = blockCenterZ + offsetZ

            // Create a simple box for the house
            const houseGeometry = new THREE.BoxGeometry(
              Math.random() * 10 + 5, // Width
              Math.random() * 20 + 10, // Height
              Math.random() * 10 + 5, // Depth
            )

            // Create the material with the house texture
            const houseMaterial = new THREE.MeshStandardMaterial({ map: houseTexture })

            const houseMesh = new THREE.Mesh(houseGeometry, houseMaterial)
            houseMesh.castShadow = true
            houseMesh.receiveShadow = true

            // Position the house
            houseMesh.position.set(houseX, houseGeometry.parameters.height / 2, houseZ)

            // Add the house to the scene
            scene.add(houseMesh)
          }
        }
      }

      // Load OBJ Model as Car and Roof
      const objLoader = new OBJLoader()

      // Load the car model
      objLoader.load(
        '/assets/models/model_0.obj',
        (object) => {
          car = object

          // Set the scale of the car model
          car.scale.set(0.01, 0.01, 0.01) // Set scale to 0.01 on all axes (x, y, z)
          car.position.y = -1.65 // Add this line to lower the car's position

          // Load the texture for the car and roof
          const textureLoader = new TextureLoader()

          textureLoader.load(
            '/assets/models/Volvo_Diffusenew.png', // Path to your texture
            (texture: THREE.Texture) => {
              texture.wrapS = THREE.RepeatWrapping
              texture.wrapT = THREE.RepeatWrapping
              texture.encoding = THREE.sRGBEncoding
              texture.minFilter = THREE.LinearFilter
              texture.magFilter = THREE.LinearFilter
              texture.generateMipmaps = true

              // Apply the texture to all the meshes in the car object
              car.traverse((node) => {
                if ((node as THREE.Mesh).isMesh) {
                  const mesh = node as THREE.Mesh
                  mesh.material.map = texture
                  mesh.material.needsUpdate = true
                  mesh.castShadow = true
                  mesh.receiveShadow = true
                  mesh.material.side = THREE.DoubleSide // Only render the front faces (change to THREE.DoubleSide if you need both)
                  // Add these lines to increase brightness of the car material
                  mesh.material.emissive = new THREE.Color(0x333333) // Adds a subtle glow
                  mesh.material.emissiveIntensity = 0.3 // Adjust this value between 0 and 1
                }
              })
            },
            (xhr) => {
              if (xhr.lengthComputable) {
                const percentComplete = (xhr.loaded / xhr.total) * 100
                console.log(`Texture loaded: ${percentComplete.toFixed(2)}%`)
              }
            },
            (error) => handleLoadingError(error, 'Volvo_Diffusenew.png'),
          )

          scene.add(car)

          // Load the roof model (model_3.obj)
          objLoader.load(
            '/assets/models/model_3.obj', // Path to the roof model
            (roofObject) => {
              // Scale the roof model to match the car
              roofObject.scale.set(0.01, 0.01, 0.01) // Adjust as necessary

              // Apply the same texture to the roof
              roofObject.traverse((node) => {
                if ((node as THREE.Mesh).isMesh) {
                  const mesh = node as THREE.Mesh
                  mesh.material.map = texture
                  mesh.material.needsUpdate = true
                  mesh.castShadow = true
                  mesh.receiveShadow = true
                  mesh.material.side = THREE.FrontSide // Ensure only front faces are rendered
                }
              })

              // Parent the roof to the car so it moves with it
              car.add(roofObject)

              // Position the roof exactly at the car's position (this will keep it aligned)
              roofObject.position.set(0, 2, 0) // Adjust the y position to place the roof correctly on the car

              console.log('Roof model loaded and positioned on the car')
            },
            (xhr) => {
              if (xhr.lengthComputable) {
                const percentComplete = (xhr.loaded / xhr.total) * 100
                console.log(`Roof model loading: ${percentComplete.toFixed(2)}%`)
              }
            },
            (error) => handleLoadingError(error, 'model_3.obj'),
          )

          modelLoaded = true
          console.log('Car model loaded successfully with the correct texture')
        },
        (xhr) => {
          if (xhr.lengthComputable) {
            const percentComplete = (xhr.loaded / xhr.total) * 100
            console.log(`Car model loading: ${percentComplete.toFixed(2)}%`)
          }
        },
        (error) => handleLoadingError(error, 'model_0.obj'),
      )

      // Initialize OrbitControls for free look
      controls = new OrbitControls(camera, renderer.domElement)
      controls.enableDamping = true
      controls.dampingFactor = 0.25
      controls.screenSpacePanning = false
      controls.maxPolarAngle = Math.PI / 2 // Limit vertical rotation (no flipping upside down)

      animate()
    }
    const animate = () => {
      requestAnimationFrame(animate)

      if (modelLoaded && car) {
        controls.update() // Update controls for smooth camera movement

        // Handle acceleration
        if (keys.ArrowUp) {
          velocity += 0.0015
        }
        if (keys.ArrowDown) {
          velocity -= 0.0009
        }

        // Apply friction
        velocity *= 0.995

        const velocityThreshold = 0.0005
        if (Math.abs(velocity) < velocityThreshold) {
          velocity = 0
        }

        velocity = THREE.MathUtils.clamp(velocity, -10, 10)

        car.translateZ(velocity)

        const minSteerSpeed = 0.00001
        const maxSteerFactor = 0.9
        let steerFactor = 0
        if (Math.abs(velocity) > minSteerSpeed) {
          steerFactor = Math.min(Math.abs(velocity) / 0.1, maxSteerFactor)
          steerFactor *= Math.sign(velocity)
        }

        if (steerFactor !== 0) {
          if (keys.ArrowLeft) {
            angularVelocity += rotationAcceleration * steerFactor
          }
          if (keys.ArrowRight) {
            angularVelocity -= rotationAcceleration * steerFactor
          }
        } else {
          angularVelocity = 0
        }

        angularVelocity *= rotationDamping

        const angularThreshold = 0.00001
        if (Math.abs(angularVelocity) < angularThreshold) {
          angularVelocity = 0
        }

        angularVelocity = THREE.MathUtils.clamp(angularVelocity, -0.05, 0.05)

        if (steerFactor !== 0) {
          car.rotation.y += angularVelocity
        }

        const relativeCameraOffset = new THREE.Vector3(10, 500, 500)
        const angle = Math.PI
        const rotatedOffset = relativeCameraOffset
          .clone()
          .applyAxisAngle(new THREE.Vector3(0.06, 1.02, -0.04), angle)

        const cameraOffset = rotatedOffset.applyMatrix4(car.matrixWorld)

        // Smoothly interpolate the camera position and rotation
        camera.position.lerp(cameraOffset, 0.05) // Adjust the factor to control the smoothing
        camera.rotation.x = THREE.MathUtils.lerp(camera.rotation.x, Math.PI / 12, 0.5) // Adjust this to control vertical smoothing

        camera.lookAt(new THREE.Vector3(0, 2, 0).add(car.position))

        // Move the camera up as speed increases
        camera.position.y += velocity * 0.1 // Adjust this factor to control the upward movement
        // Increase FOV based on velocity
        const minFOV = 50
        const maxFOV = 90
        const newFOV = THREE.MathUtils.lerp(maxFOV, minFOV, Math.abs(velocity) / 10) // Adjust divisor to control FOV change speed
        camera.fov = newFOV
        camera.updateProjectionMatrix() // Make sure to update the projection matrix after changing the FOV

        // Move camera closer to the car based on velocity
        const cameraDistanceFactor = 1 - Math.min(Math.abs(velocity) / 2, 2) // Increase the reduction factor for closer distance
        relativeCameraOffset.x *= cameraDistanceFactor
        relativeCameraOffset.z *= cameraDistanceFactor
      }

      // Render the Scene
      renderer.render(scene, camera)
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

      renderer.setSize(width, height)
      renderer.domElement.style.width = `${width}px`
      renderer.domElement.style.height = `${height}px`
    }

    onMounted(() => {
      window.addEventListener('keydown', onKeyDown)
      window.addEventListener('keyup', onKeyUp)

      if (gameContainer.value) {
        initScene()
      }
      window.addEventListener('resize', handleResize)
      handleResize()
    })

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
    }
  },
})
</script>

<style scoped>
.game-container {
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: black;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

canvas {
  margin: auto;
  width: 640px;
  height: 480px;
}
</style>
