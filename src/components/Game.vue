<template>
  <div class="game-container" ref="gameContainer"></div>
</template>

<script lang="ts">
import { defineComponent, markRaw, onMounted, onBeforeUnmount, ref } from 'vue'
import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader'
import { TextureLoader } from 'three'

export default defineComponent({
  name: 'GameComponent',
  setup() {
    const gameContainer = ref<HTMLElement | null>(null)
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
    const rotationAcceleration = 0.0009
    const rotationDamping = 0.95
    let modelLoaded = false

    const RENDERER_WIDTH = 640
    const RENDERER_HEIGHT = 480

    const handleLoadingError = (error: unknown, assetType: string) => {
      console.error(`Error loading ${assetType}:`, error)
    }

    // Function to create a pine tree
    const createPineTree = (): THREE.Group => {
      const tree = new THREE.Group()

      // Create the trunk
      const trunkGeometry = new THREE.CylinderGeometry(0.2, 0.5, 2, 8)
      const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x8b4513 })
      const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial)
      trunk.castShadow = true
      trunk.receiveShadow = true
      trunk.position.y = 1 // Position trunk so that it's sitting on the ground
      tree.add(trunk)

      // Create the foliage (three cones for a fuller look)
      const foliageMaterial = new THREE.MeshStandardMaterial({ color: 0x228b22 })

      for (let i = 0; i < 3; i++) {
        const foliageGeometry = new THREE.ConeGeometry(1.5 - i * 0.5, 3 - i, 8)
        const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial)
        foliage.castShadow = true
        foliage.receiveShadow = true
        foliage.position.y = 3 + i * 1.5 // Stack the cones
        tree.add(foliage)
      }

      return tree
    }

    const initScene = () => {
      // Initialize Scene
      scene = markRaw(new THREE.Scene())
      scene.background = new THREE.Color(0x87ceeb)

      // Initialize Camera
      camera = markRaw(
        new THREE.PerspectiveCamera(
          75, // Reduced FOV for better perspective
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

      // Configure directional light's shadow camera
      directionalLight.shadow.camera.left = -500
      directionalLight.shadow.camera.right = 500
      directionalLight.shadow.camera.top = 500
      directionalLight.shadow.camera.bottom = -500
      directionalLight.shadow.camera.near = 1
      directionalLight.shadow.camera.far = 2000

      // Adjust the shadow map size for better resolution
      directionalLight.shadow.mapSize.width = 2048 // Reduced for performance
      directionalLight.shadow.mapSize.height = 2048

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
          texture.repeat.set(1, 40)
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
      const roadWidth = 15
      const roadHeight = 0.02
      const blockSize = 60
      const rows = 10
      const columns = 10
      const blockSpacing = blockSize + roadWidth

      // Create the material for the roads with the road texture
      const roadMaterial = new THREE.MeshStandardMaterial({ map: roadTexture })

      // Create horizontal roads (X-axis roads)
      for (let row = 0; row <= rows; row++) {
        const roadGeometry = new THREE.BoxGeometry(columns * blockSpacing, roadHeight, roadWidth)
        const roadMesh = new THREE.Mesh(roadGeometry, roadMaterial)
        roadMesh.receiveShadow = true

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
        roadMesh.receiveShadow = true

        // Position each vertical road
        roadMesh.position.set(
          col * blockSpacing - blockSpacing / 2,
          roadHeight / 2,
          (rows * blockSpacing) / 2 - blockSpacing / 2,
        )

        // Add the vertical road to the scene
        scene.add(roadMesh)
      }

      // Add a console message for debugging
      console.log('Road grid with textured roads and spaced blocks created.')

      // Load House Texture
      const houseTexture = textureLoader.load(
        '/assets/textures/house.jpg', // Path to your house texture
        (texture) => {
          texture.wrapS = THREE.RepeatWrapping
          texture.wrapT = THREE.RepeatWrapping
          texture.repeat.set(2, 2) // Adjust repeat for tiling effect
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

      // Create reusable pine tree geometry and material
      const pineTree = createPineTree()

      // Add Houses and Pine Trees to the Blocks
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < columns; col++) {
          // Center position of each block
          const blockCenterX = col * blockSpacing
          const blockCenterZ = row * blockSpacing

          // Randomly decide the number of houses in this block
          const houseCount = Math.floor(Math.random() * 5) + 1

          for (let i = 0; i < houseCount; i++) {
            // Randomize position within the block with a buffer to prevent overlapping with roads
            const buffer = roadWidth / 2 + 5 // Buffer distance from roads
            const offsetX = (Math.random() - 0.5) * (blockSize - roadWidth - buffer * 2)
            const offsetZ = (Math.random() - 0.5) * (blockSize - roadWidth - buffer * 2)

            const houseX = blockCenterX + offsetX
            const houseZ = blockCenterZ + offsetZ

            // Create a simple box for the house
            const houseGeometry = new THREE.BoxGeometry(
              Math.random() * 50 + 5, // Width
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

            // **Add Pine Tree Near the House**
            const treeClone = pineTree.clone()

            // Slight randomization in tree position and scale
            const treeOffsetX = (Math.random() - 0.5) * 5 // Adjust as needed
            const treeOffsetZ = (Math.random() - 0.5) * 5 // Adjust as needed
            const treeScale = 0.8 + Math.random() * 0.4 // Scale between 0.8 and 1.2

            // Ensure trees are placed at a minimum distance from the house
            const minDistanceFromHouse =
              Math.max(
                houseGeometry.parameters.width as number,
                houseGeometry.parameters.depth as number,
              ) /
                2 +
              2 // 2 units buffer

            const distanceX = Math.abs(treeOffsetX)
            const distanceZ = Math.abs(treeOffsetZ)
            if (distanceX < minDistanceFromHouse) {
              treeClone.position.x = houseX + Math.sign(treeOffsetX) * minDistanceFromHouse
            } else {
              treeClone.position.x = houseX + treeOffsetX
            }

            if (distanceZ < minDistanceFromHouse) {
              treeClone.position.z = houseZ + Math.sign(treeOffsetZ) * minDistanceFromHouse
            } else {
              treeClone.position.z = houseZ + treeOffsetZ
            }

            treeClone.position.y = 0 // Ground level
            treeClone.scale.set(treeScale, treeScale, treeScale)

            scene.add(treeClone)
          }

          // **Add Additional Trees in the Block**
          // To add more trees independently of houses
          const additionalTreesCount = 3 // Number of additional trees per block
          for (let t = 0; t < additionalTreesCount; t++) {
            const treeClone = pineTree.clone()

            // Random position within the block with buffer from roads and houses
            const buffer = roadWidth / 2 + 10 // Increased buffer for additional trees
            const treeOffsetX = (Math.random() - 0.5) * (blockSize - roadWidth - buffer * 2)
            const treeOffsetZ = (Math.random() - 0.5) * (blockSize - roadWidth - buffer * 2)

            const treeX = blockCenterX + treeOffsetX
            const treeZ = blockCenterZ + treeOffsetZ

            // Ensure trees are not too close to any house
            // This can be enhanced by checking distances to all houses if tracked

            const treeScale = 0.8 + Math.random() * 0.4
            treeClone.position.set(treeX, 0, treeZ)
            treeClone.scale.set(treeScale, treeScale, treeScale)

            scene.add(treeClone)
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
          car.scale.set(0.01, 0.01, 0.01)
          car.position.y = -1.65

          // **Rotate the Car Model to Face Positive Z-axis**
          // This ensures that translating along Z moves the car forward
          car.rotation.y += Math.PI // Rotate 180 degrees around Y-axis

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
                  mesh.material.side = THREE.DoubleSide
                  // Increase brightness of the car material
                  mesh.material.emissive = new THREE.Color(0x333333)
                  mesh.material.emissiveIntensity = 0.3
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
              roofObject.scale.set(0.01, 0.01, 0.01)

              // Apply the same texture to the roof
              roofObject.traverse((node) => {
                if ((node as THREE.Mesh).isMesh) {
                  const mesh = node as THREE.Mesh
                  mesh.material.map = textureLoader.load('/assets/models/Volvo_Diffusenew.png')
                  mesh.material.needsUpdate = true
                  mesh.castShadow = true
                  mesh.receiveShadow = true
                  mesh.material.side = THREE.FrontSide
                }
              })

              // Parent the roof to the car so it moves with it
              car.add(roofObject)

              // Position the roof exactly at the car's position
              roofObject.position.set(0, 2, 0)

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

      animate()
    }

    const animate = () => {
      requestAnimationFrame(animate)

      if (modelLoaded && car) {
        // Handle acceleration
        if (keys.ArrowUp) {
          velocity += 0.0015
        }
        if (keys.ArrowDown) {
          velocity -= 0.0009
        }

        // Apply friction
        velocity *= 0.997

        const velocityThreshold = 0.0005
        if (Math.abs(velocity) < velocityThreshold) {
          velocity = 0
        }

        velocity = THREE.MathUtils.clamp(velocity, -20, 20)

        car.translateZ(velocity)

        const minSteerSpeed = 0.00001
        const maxSteerFactor = 1
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

        angularVelocity = THREE.MathUtils.clamp(angularVelocity, -0.03, 0.03)

        if (steerFactor !== 0) {
          car.rotation.y += angularVelocity
        }

        const maxDriftSpeed = 15
        const driftFactor = 2
        const lateralDriftFactor = 2

        if (Math.abs(velocity) > maxDriftSpeed) {
          velocity *= 0.99

          const driftAngle = angularVelocity * driftFactor
          car.rotation.y += driftAngle

          const sidewaysMotion = lateralDriftFactor * Math.sign(velocity)
          car.translateX(sidewaysMotion)
        }

        // **Camera Follow Logic**
        const desiredCameraOffset = new THREE.Vector3(1, 5, -5)
        const relativeCameraOffset = desiredCameraOffset.clone()

        // Rotate the offset based on the car's rotation
        relativeCameraOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), car.rotation.y)

        const desiredCameraPosition = car.position.clone().add(relativeCameraOffset)

        // Smoothly interpolate the camera position
        camera.position.lerp(desiredCameraPosition, 0.05)

        // Create a look-at point in front of and above the car
        const lookAtOffset = new THREE.Vector3(0, 2, 10) // Point 10 units ahead and 2 units up
        lookAtOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), car.rotation.y)
        const lookAtPoint = car.position.clone().add(lookAtOffset)

        // Make the camera look at this point
        camera.lookAt(lookAtPoint)

        // Move the camera up as speed increases
        camera.position.y += velocity * 0.1

        // Clamp camera Y position
        camera.position.y = THREE.MathUtils.clamp(camera.position.y, 1, 20)

        // Increase FOV based on velocity
        const minFOV = 50
        const maxFOV = 75
        const velocityFactor = THREE.MathUtils.clamp(Math.abs(velocity) / 20, 0, 1)
        const newFOV = THREE.MathUtils.lerp(maxFOV, minFOV, velocityFactor)
        camera.fov = newFOV
        camera.updateProjectionMatrix()
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

      // Update camera aspect ratio
      camera.aspect = width / height
      camera.updateProjectionMatrix()
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
