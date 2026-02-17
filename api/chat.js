export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method');

  const { messages } = await req.json();
  const lastQuery = messages[messages.length - 1].content;

  // 1. Context Search
  const search = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(lastQuery)}&format=json&no_html=1`);
  const sData = await search.json();
  const context = sData.AbstractText || "General Knowledge Mode";

  // 2. Your Tiered Model List
  const modelStack = [
    "stepfun/step-3.5-flash:free",           // Fastest
    "google/gemma-3-4b-it:free",             // Backup Fast
    "google/gemma-3-12b-it:free",            // Balanced
    "meta-llama/llama-3.3-70b-instruct:free", // Heavy
    "deepseek/deepseek-r1-0528:free"         // Thinking
  ];

  // 3. The Fallback Execution Loop
  for (const model of modelStack) {
    try {
      console.log(`Honest25-AI trying: ${model}`);
      
      // We set a 'controller' to cancel the request if it takes > 4 seconds
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000); 

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          "model": model, 
          "messages": [
            { "role": "system", "content": `You are Honest25-AI. Context: ${context}` },
            ...messages
          ]
        })
      });

      clearTimeout(timeoutId);
      const data = await response.json();

      if (data.choices && data.choices[0]) {
        return res.status(200).json({ 
          reply: data.choices[0].message.content,
          modelUsed: model 
        });
      }
    } catch (e) {
      console.log(`${model} failed or timed out. Jumping to next...`);
      continue; // This "jumps" to the next model in the list
    }
  }

  res.status(500).json({ reply: "All models are currently slow. Try again." });
}
