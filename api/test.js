export default async function handler(req, res) {
  try {
    // Return basic info without attempting DB connection
    res.status(200).json({
      status: "ok",
      message: "Test endpoint is working",
      env: {
        // Check if the environment variable exists (but don't expose the actual value)
        mongodb: process.env.MONGODB_URI ? "Set" : "Not set"
      }
    });
  } catch (error) {
    // Log the full error details server-side
    console.error("Test endpoint error:", error);

    // Return a safe error response
    res.status(500).json({
      status: "error",
      message: error.message
    });
  }
}
