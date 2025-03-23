// API utility functions for highscores

// In development, use the API URL from env var, in production use relative path
const API_URL = import.meta.env.DEV ? import.meta.env.VITE_API_URL : '';

/**
 * Fetch highscores from the API
 * @returns {Promise<Array>} Array of highscore objects
 */
export async function getHighscores() {
  try {
    const response = await fetch(`${API_URL}/api/hiscores`);
    if (!response.ok) {
      throw new Error('Failed to fetch highscores');
    }
    return await response.json();
  } catch (error) {
    console.error('Error loading highscores:', error);
    // Return empty array or throw error based on your error handling strategy
    return [];
  }
}

/**
 * Save a new highscore
 * @param {Object} score - Score object with name and score properties
 * @returns {Promise<Array>} Updated array of highscores
 */
export async function saveHighscore(score) {
  try {
    const response = await fetch(`${API_URL}/api/hiscores`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(score),
    });

    if (!response.ok) {
      throw new Error('Failed to save highscore');
    }

    return await response.json();
  } catch (error) {
    console.error('Error saving highscore:', error);
    throw error;
  }
}
