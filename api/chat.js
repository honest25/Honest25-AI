export const config = { maxDuration: 90 }; // Give room for full loop

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { messages } = await req.json();
  const query = messages[messages.length - 1].content;

  // Optional DuckDuckGo context (helps answers, low overhead)
  let context = 'General knowledge mode.';
  try {
    const search = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`);
    const data = await search.json();
    context = data.AbstractText || context;
  } catch {}

  // Full model list you provided, ordered fast → balanced → heavy
  const modelStack = [
    // Fastest first (most likely to respond quick)
    'stepfun/step-3.5-flash:free',
    'nvidia/nemotron-nano-9b-v2:free',
    'google/gemma-3-4b-it:free',
    'meta-llama/llama-3.2-3b-instruct:free',
    'qwen/qwen3-4b:free',
    // Balanced
    'google/gemma-3-12b-it:free',
    'mistralai/mistral-small-3.1-24b-instruct:free',
    'z-ai/glm-4.5-air:free',
    'upstage/solar-pro-3:free',
    'nvidia/nemotron-3-nano-30b-a3b:free',
    // Heavy / reliable last
    'deepseek/deepseek-r1-0528:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'nousresearch/hermes-3-llama-3.1-405b:free',
    'qwen/qwen3-next-80b-a3b-instruct:free',
    'openai/gpt-oss-120b:free',
    'arcee-ai/trinity-large-preview:free',
    'arcee-ai/trinity-mini:free',
    'google/gemma-3-27b-it:free',
    'liquid/lfm-2.5-1.2b-instruct:free',
    'openrouter/free'  // Ultimate fallback – always works, though basic
  ];

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  let success = false;
  let usedModel = '';

  for (const model of modelStack) {
    if (success) break;

    // Tell UI what's happening
    res.write(`data: ${JSON.stringify({ status: `Trying ${model.replace(':free', '')}...` })}\n\n`);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000); // 6 seconds max per model attempt

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'X-Title': 'Honest25-AI',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: `You are Honest25-AI. Context if useful: ${context}. Be friendly and short.` },
            ...messages,
          ],
          stream: true,
          temperature: 0.7,
        }),
      });

      clearTimeout(timeout);

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') continue;

            try {
              const parsed = JSON.parse(dataStr);
              const delta = parsed.choices?.[0]?.delta?.content || '';
              if (delta) {
                res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
                success = true;
                usedModel = model;
              }
            } catch (parseErr) {}
          }
        }
      }
    } catch (err) {
      console.log(`Model ${model} failed/timeout: ${err.message}`);
      if (!success) {
        res.write(`data: ${JSON.stringify({ status: `Slow – next model...` })}\n\n`);
      }
    }
  }

  if (success) {
    res.write(`data: ${JSON.stringify({ done: true, modelUsed: usedModel.replace(':free', '') })}\n\n`);
  } else {
    res.write(`data: ${JSON.stringify({ content: 'Sorry, all models are slow/overloaded right now. Try again in a few minutes.' })}\n\n`);
  }

  res.end();
}
