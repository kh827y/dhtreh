import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateDashboardInsights = async (
  salesData: any[],
  kpis: any[]
): Promise<string> => {
  try {
    const prompt = `
      Analyze the following business dashboard data for a loyalty program application.
      
      KPIs:
      ${JSON.stringify(kpis)}

      Recent Sales Trend Data (Sample):
      ${JSON.stringify(salesData.slice(-5))}

      Provide 3 concise, actionable insights for the business owner based on this data. 
      Focus on trends in sales vs registrations and audience engagement.
      
      IMPORTANT: Respond in Russian language.
      Format the output as a simple HTML list (<ul><li>...</li></ul>) without markdown code blocks.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    return response.text || "Не удалось сгенерировать инсайты.";
  } catch (error) {
    console.error("Error generating insights:", error);
    return "AI анализ временно недоступен. Проверьте API ключ.";
  }
};