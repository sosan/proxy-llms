import OpenAI from 'openai';

const deepseekClient = new OpenAI({
  apiKey: 'YOUR_PROXY_API_KEY', // si implementas auth
  baseURL: 'https://tu-proxy-domain.com/deepseek/v1',
});

async function testDeepSeek() {
  const completion = await deepseekClient.chat.completions.create({
    model: "deepseek-ai/deepseek-v4-pro",
    messages: [{"role":"user","content":"Explain quantum computing"}],
    temperature: 1,
    top_p: 0.95,
    max_tokens: 16384,
    chat_template_kwargs: {
      "thinking": true,
      "reasoning_effort": "high"
    },
    stream: false
  });

  console.log(completion.choices[0].message);
  // Includes thinking process if available
  if (completion.choices[0].message.thinking) {
    console.log("Thinking process:", completion.choices[0].message.thinking);
  }
}