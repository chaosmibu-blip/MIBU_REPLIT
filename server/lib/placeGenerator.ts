/**
 * Gemini AI Helper
 * 只保留 callGemini 函數供其他功能使用
 * AutoDraft 和 AI 審核功能已停用
 */

export async function callGemini(prompt: string): Promise<string> {
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  
  if (!baseUrl || !apiKey) {
    throw new Error("Gemini API not configured");
  }

  const response = await fetch(`${baseUrl}/models/gemini-2.5-flash:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: 8192,
      }
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Gemini API error:", errorText);
    throw new Error(`Gemini API failed: ${response.status}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}
