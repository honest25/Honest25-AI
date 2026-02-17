export const config = {
  maxDuration: 30,
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { messages } = await req.body;
  const userQuery = messages[messages.length - 1].content;

  // --- DuckDuckGo Context ---
  let context = "";
  try {
    const search = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(userQuery)}&format=json&no_html=1`
    );
    const sData = await search.json();
    context = sData.AbstractText || "";
  } catch {
    context = "";
  }

  const FAST = [
    "stepfun/step-3.5-flash:free",
    "nvidia/nemotron-nano-9b-v2:free",
    "google/gemma-3-4b-it:free",
    "meta-llama/llama-3.2-3b-instruct:free",
    "qwen/qwen3-4b:free"
  ];

  const BALANCED = [
    "google/gemma-3-12b-it:free",
    "mistralai/mistral-small-3.1-24b-instruct:free",
    "z-ai/glm-4.5-air:free",
    "upstage/solar-pro-3:free",
    "nvidia/nemotron-3-nano-30b-a3b:free"
  ];

  const HEAVY = [
    "deepseek/deepseek-r1-0528:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "nousresearch/hermes-3-llama-3.1-405b:free",
    "qwen/qwen3-next-80b-a3b-instruct:free",
    "openai/gpt-oss-120b:free"
  ];

  const controllers = [];

  async function callModel(model) {
    const controller = new AbortController();
    controllers.push(controller);

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "X-Title": "Honest25-AI"
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: `You are Honest25-AI. Use this context if helpful: ${context}`
            },
            ...messages
          ]
        })
      }
    );

    const data = await response.json();
    if (!data.choices) throw new Error("No reply");

    return {
      reply: data.choices[0].message.content,
      model
    };
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  try {
    const fastRace = Promise.race(FAST.map(m => callModel(m)));

    const balancedRace = delay(2000).then(() =>
      Promise.race(BALANCED.map(m => callModel(m)))
    );

    const heavyRace = delay(4000).then(() =>
      Promise.race(HEAVY.map(m => callModel(m)))
    );

    const winner = await Promise.race([
      fastRace,
      balancedRace,
      heavyRace
    ]);

    // Abort all other requests
    controllers.forEach(c => c.abort());

    return res.status(200).json(winner);

  } catch (err) {
    return res.status(500).json({
      reply: "Honest25-AI: All models are busy.",
      model: "none"
    });
  }
}


