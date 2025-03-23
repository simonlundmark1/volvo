<template>
  <div class="diagnostic">
    <h1>API Diagnostics</h1>
    <p><strong>API URL:</strong> {{ apiUrl }}</p>
    <button @click="testConnection">Test Connection</button>
    <div v-if="connectionResult" class="result">
      <h2>Connection Test Result:</h2>
      <pre>{{ connectionResult }}</pre>
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue';

export default {
  name: 'DiagnosticPage',
  setup() {
    const apiUrl = ref(import.meta.env.VITE_API_URL || 'Not set');
    const connectionResult = ref('');

    async function testConnection() {
      try {
        connectionResult.value = 'Testing connection...';
        const response = await fetch(`${apiUrl.value}/api/hiscores`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        const data = await response.json();
        connectionResult.value = JSON.stringify({
          success: true,
          status: response.status,
          data
        }, null, 2);
      } catch (error) {
        connectionResult.value = JSON.stringify({
          success: false,
          error: error.message
        }, null, 2);
      }
    }

    return {
      apiUrl,
      connectionResult,
      testConnection,
    };
  }
}
</script>

<style scoped>
.diagnostic {
  max-width: 800px;
  margin: 20px auto;
  padding: 20px;
  background: #f5f5f5;
  border-radius: 8px;
  font-family: sans-serif;
}

button {
  background: #4CAF50;
  color: white;
  border: none;
  padding: 10px 15px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  margin: 10px 0;
}

.result {
  margin-top: 20px;
  background: #fff;
  padding: 15px;
  border-radius: 4px;
  border: 1px solid #ddd;
}

pre {
  white-space: pre-wrap;
  word-wrap: break-word;
}
</style>
