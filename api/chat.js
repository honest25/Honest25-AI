export const config = {
  maxDuration: 30,
};

async function tryModel(model, messages, context, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "X-Title": "Honest25-AI"
        },
        body: JSON.stringify({
          model,
          temperature: 0.7,
          max_tokens: 500,
          messages: [
            {
              role: "system",
              content: `You are Honest25-AI. Use this context if useful: ${context}`
            },
            ...messages
          ]
        })
      }
    );

    clearTimeout(timeout);

    if (!response.ok) return null;

    const data = await response.json();

    const reply = data?.choices?.[0]?.message?.content;

    if (!reply || reply.length < 5) return null;

    return {
      reply,
      modelUsed: model
    };

  } catch (err) {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  const { messages } = req.body;
  const userQuery = messages[messages.length - 1].content;

  // DuckDuckGo search
  let context = "";
  try {
    const searchRes = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(userQuery)}&format=json&no_html=1`
    );
    const searchData = await searchRes.json();
    context = searchData.AbstractText || "";
  } catch {
    context = "";
  }

  // 🔥 FAST MODELS (2.5 sec each)
  const fastModels = [
    "nvidia/nemotron-nano-9b-v2:free",
    "nvidia/nemotron-3-nano-30b-a3b:free"
    "stepfun/step-3.5-flash:free",
    "google/gemma-3-4b-it:free",
    "meta-llama/llama-3.2-3b-instruct:free",
    "qwen/qwen3-4b:free"
  ];

  for (const model of fastModels) {
    const result = await tryModel(model, messages, context, 2500);
    if (result) return res.status(200).json(result);
  }

  // 🧠 BALANCED (4 sec each)
  const balancedModels = [
    "google/gemma-3-12b-it:free",
    "mistralai/mistral-small-3.1-24b-instruct:free",
    "z-ai/glm-4.5-air:free",
    "upstage/solar-pro-3:free",
    "nvidia/nemotron-3-nano-30b-a3b:free"
  ];

  for (const model of balancedModels) {
    const result = await tryModel(model, messages, context, 4000);
    if (result) return res.status(200).json(result);
  }

  // 🔥 HEAVY (6 sec each)
  const heavyModels = [
    "deepseek/deepseek-r1-0528:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "nousresearch/hermes-3-llama-3.1-405b:free",
    "qwen/qwen3-next-80b-a3b-instruct:free",
    "openai/gpt-oss-120b:free"
  ];

  for (const model of heavyModels) {
    const result = await tryModel(model, messages, context, 6000);
    if (result) return res.status(200).json(result);
  }

  return res.status(500).json({
    reply: "Honest25-AI: All models are busy right now."
  });
}

