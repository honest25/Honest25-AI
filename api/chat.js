export const config = {
  maxDuration: 60, // Allow time for fallbacks without Vercel killing the function
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Use POST');
  const { messages } = await req.json(); // Full history for context
  const lastQuery = messages[messages.length - 1].content;

  // 1. Enhanced DuckDuckGo Search (More context for better answers)
  const searchRes = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(lastQuery)}&format=json&no_html=1`);
  const searchData = await searchRes.json();
  let context = searchData.AbstractText || '';
  if (searchData.RelatedTopics && searchData.RelatedTopics.length > 0) {
    context += '\nRelated: ' + searchData.RelatedTopics.slice(0, 2).map(t => t.Text).join('; ');
  }
  context = context || 'Using general knowledge.';

  // 2. Tiered Model Stack (Your full list, ordered for speed)
  const modelStack = [
    // FAST MODELS (First Try)
    'stepfun/step-3.5-flash:free',
    'nvidia/nemotron-nano-9b-v2:free',
    'google/gemma-3-4b-it:free',
    'meta-llama/llama-3.2-3b-instruct:free',
    'qwen/qwen3-4b:free',
    // BALANCED MODELS (Fallback)
    'google/gemma-3-12b-it:free',
    'mistralai/mistral-small-3.1-24b-instruct:free',
    'z-ai/glm-4.5-air:free',
    'upstage/solar-pro-3:free',
    'nvidia/nemotron-3-nano-30b-a3b:free',
    // HEAVY / THINKING MODELS (Final Fallback)
    'deepseek/deepseek-r1-0528:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'nousresearch/hermes-3-llama-3.1-405b:free',
    'qwen/qwen3-next-80b-a3b-instruct:free',
    'openai/gpt-oss-120b:free',
    'arcee-ai/trinity-large-preview:free',
    'openai/gpt-oss-20b:free',
    'qwen/qwen3-coder:free',
    'google/gemma-3-27b-it:free',
    'liquid/lfm-2.5-1.2b-instruct:free',
    'liquid/lfm-2.5-1.2b-thinking:free',
    'google/gemma-3n-e2b-it:free',
    'google/gemma-3n-e4b-it:free',
    'nvidia/nemotron-nano-12b-v2-vl:free',
    'arcee-ai/trinity-mini:free',
    'openrouter/free'
  ];

  // 3. Fallback Loop with Timeout (Guarantees natural, quick jumps)
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  let replied = false;
  for (const model of modelStack) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s max per attempt
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'X-Title': 'Honest25-AI',
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: `You are Honest25-AI. Use this context: ${context}. Be helpful and concise.` },
            ...messages,
          ],
          stream: true, // Stream for real-time typing
        }),
      });
      clearTimeout(timeoutId);

      // Stream the response
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n').filter(line => line.startsWith('data: '));
        for (const line of lines) {
          const json = JSON.parse(line.slice(6));
          if (json.choices[0].delta.content) {
            res.write(`data: ${JSON.stringify({ content: json.choices[0].delta.content })}\n\n`);
          }
        }
      }
      replied = true;
      res.write(`data: ${JSON.stringify({ done: true, modelUsed: model })}\n\n`);
      break; // Success, stop loop
    } catch (e) {
      console.log(`Fallback: ${model} timed out or failed. Trying next...`);
      continue; // Jump to next model naturally
    }
  }

  if (!replied) {
    res.write(`data: ${JSON.stringify({ content: 'All models busy. Please retry.' })}\n\n`);
  }
  res.end();
}
