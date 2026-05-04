// Ejemplo para testear el endpoint de z.ai
async function testZaiEndpoint() {
  try {
    const response = await fetch('http://localhost:8787/zai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "z-ai/glm4.7",
        messages: [{"role":"user","content":"explain quantum computing in simple terms"}],
        temperature: 1,
        top_p: 1,
        max_tokens: 32768,
        chat_template_kwargs: {"enable_thinking":true,"clear_thinking":false},
        stream: false
      })
    })

    const result = await response.json()
    
    if (result.success) {
      const reasoning = result.data.choices[0]?.message?.reasoning_content;
      if (reasoning) {
        console.log('Reasoning:', reasoning);
      }
      console.log('Response:', result.data.choices[0]?.message?.content);
    } else {
      console.error('Error:', result.error);
    }
    
  } catch (error) {
    console.error('Request failed:', error);
  }
}

testZaiEndpoint();