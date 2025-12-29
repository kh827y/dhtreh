import { GoogleGenAI } from "@google/genai";
import { Transaction } from "../types";

// Initialize the Gemini Client
// Note: In a real environment, ensure process.env.API_KEY is set.
// This service provides an "AI Concierge" feature for the loyalty app.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || 'demo_key' });

export const analyzeSpendingHabits = async (transactions: Transaction[]): Promise<string> => {
  if (!process.env.API_KEY) {
    return "Демо-режим: AI аналитика недоступна без API ключа. В реальном приложении здесь будет анализ ваших трат.";
  }

  try {
    const transactionData = transactions.map(t => `${t.date}: ${t.title} - ${t.amount} руб.`).join('\n');
    
    const prompt = `
      Ты - умный ассистент программы лояльности.
      Проанализируй следующие транзакции клиента и дай короткий, дружелюбный совет (максимум 2 предложения) 
      о том, как быстрее накопить баллы или на что обратить внимание. 
      Отвечай на русском языке.
      
      Транзакции:
      ${transactionData}
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', // Using the fast model for responsive UI
      contents: prompt,
    });

    return response.text || "Не удалось получить совет от AI.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Сервис временно недоступен.";
  }
};