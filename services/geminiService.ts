import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export interface Source {
  title: string;
  uri: string;
}

export interface AssistantResponse {
  text: string;
  sources: Source[];
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  sources?: Source[];
}

const OFFICIAL_SOURCES_CONTEXT = `
You are a highly professional legal assistant for LEXCORA.

Your PRIMARY OBJECTIVE is to retrieve and verify legal information STRICTLY from the following official UAE government sources:
1. UAE Legislation (English): https://uaelegislation.gov.ae/en
2. UAE Legislation (Arabic): https://uaelegislation.gov.ae/ar
3. Ministry of Justice - Laws & Legislation: https://www.moj.gov.ae/ar/about-moj/judicial-training-institute/laws-and-legislation.aspx
4. Ministry of Justice - Studies & Researches: https://www.moj.gov.ae/ar/media-center/judicial-studies-magazine/studies-and-researches.aspx#page=1
5. Abu Dhabi Judicial Department - Judgements: https://www.adjd.gov.ae/sites/eServices/AR/Pages/Judgements.aspx

OPERATIONAL RULES:
- Use the googleSearch tool to actively search ONLY within these specific domains for the user's query whenever possible.
- Prioritize findings from these URLs above all other search results.
- If the information is found in these sources, cite them clearly in your response.
- MANDATORY DISCLAIMER: You must explicitly state that your response does not constitute legal advice.
`;

function extractSources(response: GenerateContentResponse): Source[] {
  // @ts-ignore - groundingMetadata types access
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  return chunks
    // @ts-ignore
    .map((chunk) => chunk.web)
    // @ts-ignore
    .filter((web) => web && web.uri && web.title)
    // @ts-ignore
    .map((web) => ({ title: web.title, uri: web.uri }));
}

export const getLegalAssistantResponse = async (query: string, lang: 'en' | 'ar'): Promise<AssistantResponse> => {
  if (!apiKey) {
    return {
      text: lang === 'en' 
        ? "Demo Mode: API Key not configured. (Simulated Response) According to UAE Labour Law..." 
        : "وضع تجريبي: مفتاح API غير مكون. (رد محاكى) وفقاً لقانون العمل الإماراتي...",
      sources: []
    };
  }

  try {
    const langInstruction = lang === 'en'
      ? "Answer in English. Keep it professional, authoritative, and under 100 words. You MUST append this exact disclaimer at the end: 'Disclaimer: This information is for educational purposes only and does not constitute legal advice.'"
      : "Answer in Arabic. Keep it professional, authoritative, and under 100 words. You MUST append this exact disclaimer at the end: 'تنويه: هذه المعلومات للأغراض التعليمية فقط ولا تشكل مشورة قانونية.'";

    const systemInstruction = `${OFFICIAL_SOURCES_CONTEXT}\n${langInstruction}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: query,
      config: {
        systemInstruction: systemInstruction,
        tools: [{ googleSearch: {} }],
      },
    });

    return {
      text: response.text || (lang === 'en' ? "No response generated." : "لم يتم إنشاء استجابة."),
      sources: extractSources(response)
    };
  } catch (error) {
    console.error("Gemini API Error:", error);
    return {
      text: lang === 'en' 
        ? "Service temporarily unavailable. Please try again later."
        : "الخدمة غير متوفرة حالياً. يرجى المحاولة مرة أخرى لاحقاً.",
      sources: []
    };
  }
};

export class LexCoraChatSession {
  private chat: Chat | null = null;
  private lang: 'en' | 'ar';

  constructor(lang: 'en' | 'ar', history: ChatMessage[] = []) {
    this.lang = lang;
    if (apiKey) {
      const langInstruction = lang === 'en'
        ? "Answer in English. Be concise, professional, and use a tone suitable for high-net-worth legal professionals. You MUST always conclude your response with a clear disclaimer that this information is not legal advice."
        : "Answer in Arabic. Be concise, professional, and use a tone suitable for high-net-worth legal professionals. You MUST always conclude your response with a clear disclaimer that this information is not legal advice.";
      
      const systemInstruction = `${OFFICIAL_SOURCES_CONTEXT}\n${langInstruction}`;
      
      // Convert internal ChatMessage format to Gemini SDK history format
      const chatHistory = history.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.text }]
      }));

      this.chat = ai.chats.create({
        model: 'gemini-3-pro-preview',
        config: { 
          systemInstruction,
          tools: [{ googleSearch: {} }] 
        },
        history: chatHistory
      });
    }
  }

  async sendMessage(message: string): Promise<AssistantResponse> {
    if (!apiKey || !this.chat) {
      return {
        text: this.lang === 'en'
          ? "Demo Mode: API Key not configured. I cannot process real-time requests without an API key."
          : "الوضع التجريبي: مفتاح API غير مكون. لا يمكنني معالجة الطلبات في الوقت الفعلي بدون مفتاح.",
        sources: []
      };
    }

    try {
      const response = await this.chat.sendMessage({ message });
      return {
        text: response.text || "",
        sources: extractSources(response)
      };
    } catch (error) {
      console.error("Gemini Chat Error:", error);
      return {
        text: this.lang === 'en' 
          ? "I apologize, but I am encountering technical difficulties at the moment."
          : "أعتذر، ولكنني أواجه صعوبات فنية في الوقت الحالي.",
        sources: []
      };
    }
  }
}