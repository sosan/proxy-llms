// Ruta mejorada que retorna tanto polling como streaming
app.post('/api/process', async (c) => {
    const data = await c.req.json();
    const processId = crypto.randomUUID();
    
    const durableObjectId = c.env.PROCESSOR.idFromName(processId);
    const durableObject = c.env.PROCESSOR.get(durableObjectId);
    
    await durableObject.fetch('https://internal/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processId, ...data })
    });
    
    return c.json({
        processId,
        statusUrl: `/api/status/${processId}`,
        streamUrl: `/api/stream/${processId}`,  // SSE endpoint
        websocketUrl: `/api/ws/${processId}`    // WebSocket endpoint
    });
});

// SSE endpoint para streaming
app.get('/api/stream/:processId', async (c) => {
    const processId = c.req.param('processId');
    
    return new Response(
        new ReadableStream({
            start(controller) {
                // Setup SSE connection to Durable Object
                const durableObjectId = c.env.PROCESSOR.idFromName(processId);
                const durableObject = c.env.PROCESSOR.get(durableObjectId);
                
                // Forward SSE stream from Durable Object
                durableObject.fetch('https://internal/stream')
                    .then(response => response.body)
                    .then(stream => stream.pipeTo(new WritableStream({
                        write(chunk) {
                            controller.enqueue(chunk);
                        }
                    })));
            }
        }),
        {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            }
        }
    );
});