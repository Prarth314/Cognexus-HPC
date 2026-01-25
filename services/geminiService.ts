
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SYSTEM_PROMPT_ANALYST = `You are a professional data analyst and statistical interpreter. 
Your primary role is to analyze provided data, outputs, or contextual information and convert it into clear, professional, and actionable insights.

The reader of your report is a researcher who may not have a background in computers or HPC (High-Performance Computing).

Guidelines you MUST follow:
1. Use precise and professional language. Avoid casual, vague, or conversational phrasing.
2. Prioritize specificity. When making claims, reference numerical values, percentages, trends, ranges, or comparisons whenever possible.
3. Apply statistical reasoning where relevant (averages, distributions, correlations, variability, confidence levels, outliers, or trends), but explain them in plain language.
4. Assume the reader has little to no technical or statistical background.
5. Clearly explain:
   - What the data shows
   - Why it matters
   - What conclusions can reasonably be drawn
   - What should NOT be inferred
6. Translate technical results into real-world meaning. Avoid jargon unless it is immediately defined in simple terms.
7. Structure responses logically using headings, bullet points, and short paragraphs for readability.
8. If assumptions are made due to missing data, explicitly state them.
9. When uncertainty exists, quantify it or explain it clearly rather than ignoring it.
10. Do not speculate beyond what the data supports.

Output Format for initial analysis:
- Provide every single statistical analysis
- Key findings (bullet points with data references)
- Interpretation (plain-language explanation)
- Limitations or uncertainty (if applicable)
- Practical takeaway (what the reader should understand or do next)`;

export const summarizeSimulation = async (logs: string, context: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `${SYSTEM_PROMPT_ANALYST}

      CONTEXT:
      Project: ${context}
      HPC Simulation Logs:
      ${logs}

      Please provide a comprehensive analysis of the simulation output and any files generated (such as Excel reports, data clusters, or aerodynamic coefficients).`,
      config: {
        temperature: 0.2,
        topP: 0.8,
      }
    });

    return response.text || "Failed to generate statistical analysis.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Error generating professional data analysis. Please consult system logs.";
  }
};

export const analyzeSimulationFollowUp = async (
  originalAnalysis: string, 
  logs: string, 
  userQuestion: string, 
  history: { role: string, parts: { text: string }[] }[]
) => {
  const model = 'gemini-3-flash-preview';
  
  // Explicit instruction to reduce response to one paragraph as requested.
  const followUpPrompt = `Respond to the following question. IMPORTANT: Your response MUST be reduced to exactly one concise paragraph. Do not use bullet points or multiple sections.
  
  Question: ${userQuestion}`;

  return ai.models.generateContentStream({
    model,
    contents: [
      { role: 'user', parts: [{ text: `${SYSTEM_PROMPT_ANALYST}\n\nOriginal Analysis:\n${originalAnalysis}\n\nExecution Logs:\n${logs}` }] },
      ...history,
      { role: 'user', parts: [{ text: followUpPrompt }] }
    ],
    config: {
      temperature: 0.4,
    }
  });
};

export const startResearchChat = async (projectContext: string, message: string, history: { role: string, parts: { text: string }[] }[]) => {
  const model = 'gemini-3-flash-preview';
  const systemInstruction = `You are the Cognexus AI Research Assistant. You are currently assisting a research team on a project described as: "${projectContext}". 
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
