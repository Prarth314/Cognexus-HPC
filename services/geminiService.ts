
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const summarizeSimulation = async (logs: string, context: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `You are a specialized HPC Research Assistant. 
      Summarize the following simulation log and data results for the project: ${context}.
      Identify key anomalies, convergence patterns, and provide a clear executive summary for researchers.
      
      Logs:
      ${logs}
      `,
      config: {
        temperature: 0.7,
        topP: 0.9,
      }
    });

    return response.text || "Failed to generate summary.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Error generating analysis. Please check logs manually.";
  }
};

export const suggestResearchActions = async (projectDescription: string): Promise<string[]> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Given this research project description: "${projectDescription}", list 4 specific next steps or simulation types that would be valuable. Format as a simple list.`,
    });
    return (response.text?.split('\n').filter(s => s.trim()) || []).slice(0, 4);
  } catch (error) {
    return ["Run baseline simulation", "Review existing publications", "Collaborate with cross-functional team"];
  }
};
