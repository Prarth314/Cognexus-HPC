
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

export const startResearchChat = async (projectContext: string, message: string, history: { role: string, parts: { text: string }[] }[]) => {
  const model = 'gemini-3-flash-preview';
  const systemInstruction = `You are the Nexus AI Research Assistant. You are currently assisting a research team on a project described as: "${projectContext}". 
  Your goal is to provide high-level scientific insights, suggest simulation parameters, help with documentation, and brainstorm next steps. 
  Be professional, concise, and scientifically accurate.`;

  return ai.models.generateContentStream({
    model,
    contents: [...history, { role: 'user', parts: [{ text: message }] }],
    config: {
      systemInstruction,
      temperature: 0.8,
    }
  });
};
