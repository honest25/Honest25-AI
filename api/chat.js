export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { messages } = await req.json();
  const lastQuery = messages[messages.length - 1].content;

  // 1. DuckDuckGo Search (Context for Honest25-AI)
  const searchRes = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(lastQuery)}&format=json&no_html=1`);
  const searchData = await searchRes.json();
  const context = searchData.AbstractText || "Current Web Context: " + lastQuery;

  // 2. Your Organized Model Stack
  const modelStack = [
    // FAST MODELS (First Try)
    "stepfun/step-3.5-flash:free",
    "nvidia/nemotron-nano-9b-v2:free",
    "google/gemma-3-4b-it:free",
    "meta-llama/llama-3.2-3b-instruct:free",
    "qwen/qwen3-4b:free",
    // BALANCED MODELS (Fallback)
    "google/gemma-3-12b-it:free",
    "mistralai/mistral-small-3.1-24b-instruct:free",
    "z-ai/glm-4.5-air:free",
    "upstage/solar-pro-3:free",
    "nvidia/nemotron-3-nano-30b-a3b:free",
    // HEAVY / THINKING (Final Fallback)
    "deepseek/deepseek-r1-0528:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "nousresearch/hermes-3-llama-3.1-405b:free",
    "openai/gpt-oss-120b:free"
  ];

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "X-Title": "Honest25-AI"
      },
      body: JSON.stringify({
        "models": modelStack, // Sends the whole list for auto-jump
        "route": "fallback",  // Tells OpenRouter to jump quickly on delay
        "messages": [
          { "role": "system", "content": `You are Honest25-AI. Context: ${context}` },
          ...messages
        ]
      })
    });

    const data = await response.json();
    res.status(200).json({ 
      reply: data.choices[0].message.content,
      modelUsed: data.model 
    });
  } catch (err) {
    res.status(500).json({ error: "System busy. Try again." });
  }
}
