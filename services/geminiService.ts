
const hasServerKey = typeof process !== 'undefined' && Boolean(process.env && process.env.API_KEY);

const mockSummary = `Summary unavailable (no API key configured). This is a local mock summary highlighting convergence patterns and anomalies detected in the logs.`;

export const summarizeSimulation = async (logs: string, context: string): Promise<string> => {
  if (!hasServerKey) {
    return mockSummary;
  }

  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `You are a specialized HPC Research Assistant.\nSummarize the following simulation log and data results for the project: ${context}.\nIdentify key anomalies, convergence patterns, and provide a clear executive summary for researchers.\n\nLogs:\n${logs}`,
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
  if (!hasServerKey) {
    return ["Run baseline simulation", "Review existing publications", "Validate mesh resolution", "Profile I/O performance"];
  }

  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Given this research project description: "${projectDescription}", list 4 specific next steps or simulation types that would be valuable. Format as a simple list.`,
    });
    return (response.text?.split('\n').filter(s => s.trim()) || []).slice(0, 4);
  } catch (error) {
    console.error('Gemini Error:', error);
    return ["Run baseline simulation", "Review existing publications", "Collaborate with cross-functional team"];
  }
};
