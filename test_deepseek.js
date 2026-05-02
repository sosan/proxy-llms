// Test script for DeepSeek v4 Pro
const testRequest = {
    model: "deepseek-v4-pro", // This will trigger DeepSeek routing
    messages: [
        {
            role: "user", 
            content: "Explain the concept of quantum computing and its potential applications"
        }
    ],
    max_tokens: 16384,
    temperature: 1,
    top_p: 0.95,
    chat_template_kwargs: {
        thinking: true,
        reasoning_effort: "high"
    }
};

fetch('http://localhost:3000/v1/messages', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify(testRequest)
})
.then(response => response.json())
.then(data => console.log(data))
.catch(error => console.error('Error:', error));