/* --- geminiRecommend.js --- */
require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Generates recommendations based on provided history text.
 * @param {string} historyText - Formatted string of user gameplay history.
 * @param {string} targetCategory - 'movie', 'series', or 'game'.
 * @param {number} recommendationCount - How many to generate.
 * @param {Array} excludeTitles - List of titles to skip (already recommended).
 * @returns {Promise<Array>} JSON array of recommendations.
 */
async function generateRecommendations(historyText, targetCategory = 'movie', recommendationCount = 3, excludeTitles = []) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const exclusionText = excludeTitles.length > 0 
            ? `Do NOT recommend these titles (User already saw them): ${excludeTitles.join(', ')}` 
            : "";

        const prompt = `
        You are an AI Gaming Assistant for a trivia game called QuoteVault.
        
        Here is the User's recent Gameplay History:
        ${historyText}

        ${exclusionText}

        Analyze this history to understand their strengths and weaknesses.
        - If they WIN with 0 hints, they know that franchise very well.
        - If they LOSE or use many hints, they might not know that genre well.

        Task:
        Recommend ${recommendationCount} NEW ${targetCategory} titles that they have NOT played yet and are NOT in the exclusion list above.
        
        Strictly return a valid JSON array of objects.
        Each object must have:
        - "title": "The Title"
        - "year": "Release Year"
        - "reason": "A short, specific reason based on their history."
        
        Do not include markdown formatting (like \`\`\`json). Just raw JSON.
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        // Clean JSON
        const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const recommendations = JSON.parse(cleanText);

        return recommendations;

    } catch (error) {
        console.error("Gemini AI Error:", error);
        return [];
    }
}

module.exports = { generateRecommendations };