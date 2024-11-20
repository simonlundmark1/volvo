<template>
  <div id="app">
    <Game />
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import Game from './components/Game.vue'

export default defineComponent({
  name: 'App',
  components: {
    Game,
  },
})
</script>

<style>
#app {
  margin: 0; /* Reset margin */
  padding: 0; /* Reset padding */
  width: 100vw; /* Use the full width of the viewport */
  height: 100vh; /* Use the full height of the viewport */
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #000; /* Background color */
  overflow: hidden; /* Prevents overflow from the game canvas */
}
</style>
