require('dotenv').config();
const API_KEY = process.env.GEMINI_API_KEY;

async function listModels() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    if (data.error) {
      console.error("API Error:", data.error.message);
      return;
    }
    console.log("\nAVAILABLE MODELS");
    const available = data.models
      .filter(m => m.supportedGenerationMethods.includes("generateContent"))
      .map(m => m.name.replace("models/", ""));
    console.log(available.join("\n"));
    console.log("\n");
  } catch (err) {
    console.error("Connection failed:", err.message);
  }
}

listModels();