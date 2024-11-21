<!-- App.vue -->
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
/* Reset default margins and paddings */
html,
body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
}

#app {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  background-color: #000; /* Background color */
}
</style>
