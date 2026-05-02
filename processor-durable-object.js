export class ProcessorDurableObject {
    constructor(ctx, env) {
        this.ctx = ctx;
        this.env = env;
        this.sessions = new Map(); // WebSocket sessions
        this.sseStreams = new Map(); // SSE streams 
        this.processingStatus = new Map(); // Estado de procesamiento
    }

    async fetch(request) {
        const url = new URL(request.url);
        
        switch (url.pathname) {
            case '/websocket':
                return this.handleWebSocket(request);
            case '/stream':
                return this.handleSSEStream(request);
            case '/start':
                return this.startProcessing(request);
            case '/status':
                return this.getStatus(request);
            default:
                return new Response('Not found', { status: 404 });
        }
    }

    async handleSSEStream(request) {
        const processId = request.headers.get('X-Process-Id');
        
        let streamController;
        const stream = new ReadableStream({
            start(controller) {
                streamController = controller;
            },
            cancel() {
                // Cleanup cuando el cliente cancela
                if (processId) {
                    this.sseStreams.delete(processId);
                }
            }
        });

        // Almacenar el controller para enviar updates
        if (processId) {
            this.sseStreams.set(processId, streamController);
        }

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }

    async handleWebSocket(request) {
        const upgradeHeader = request.headers.get('Upgrade');
        if (!upgradeHeader || upgradeHeader !== 'websocket') {
            return new Response('Expected Upgrade: websocket', { status: 426 });
        }

        const webSocketPair = new WebSocketPair();
        const [client, server] = Object.values(webSocketPair);

        server.accept();
        
        const sessionId = crypto.randomUUID();
        const processId = request.headers.get('X-Process-Id');
        
        this.sessions.set(sessionId, { socket: server, processId });

        server.addEventListener('message', (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'subscribe' && data.processId) {
                // Cliente se suscribe a updates de un processId específico
                const session = this.sessions.get(sessionId);
                if (session) {
                    session.processId = data.processId;
                }
            }
        });

        server.addEventListener('close', () => {
            this.sessions.delete(sessionId);
        });

        return new Response(null, {
            status: 101,
            webSocket: client
        });
    }

    async startProcessing(request) {
        const data = await request.json();
        const processId = data.processId;
        
        // Inicializar estado
        this.processingStatus.set(processId, {
            status: 'processing',
            progress: 0,
            startTime: Date.now(),
            data: data
        });

        // Procesar de manera asíncrona
        this.processAsync(processId, data);

        return new Response(JSON.stringify({ 
            success: true, 
            processId,
            message: 'Processing started' 
        }));
    }

    async getStatus(request) {
        const url = new URL(request.url);
        const processId = url.searchParams.get('processId');
        
        const status = this.processingStatus.get(processId) || { 
            status: 'not_found',
            error: 'Process ID not found' 
        };
        
        return new Response(JSON.stringify(status));
    }

    async processAsync(processId, data) {
        try {
            // Simular procesamiento largo con múltiples llamadas a AI
            const steps = [
                { name: 'Analyzing request', weight: 20 },
                { name: 'Processing with AI model 1', weight: 30 },
                { name: 'Processing with AI model 2', weight: 30 },
                { name: 'Finalizing results', weight: 20 }
            ];

            let totalProgress = 0;

            for (let i = 0; i < steps.length; i++) {
                const step = steps[i];
                
                // Actualizar progreso
                this.processingStatus.set(processId, {
                    ...this.processingStatus.get(processId),
                    status: 'processing',
                    currentStep: step.name,
                    progress: totalProgress
                });

                // Notificar tanto a WebSocket como SSE
                const updateData = {
                    type: 'progress',
                    processId,
                    progress: totalProgress,
                    currentStep: step.name
                };

                this.notifySubscribers(processId, updateData);
                this.notifySSESubscribers(processId, updateData);

                // Simular llamada real a AI
                if (step.name.includes('AI model')) {
                    await this.callAIModel(data, step.name);
                } else {
                    await this.sleep(1000); // Simular trabajo
                }

                totalProgress += step.weight;
            }

            // Procesamiento completado
            const result = {
                processId,
                result: `Processed successfully at ${new Date().toISOString()}`,
                data: data,
                processingTime: Date.now() - this.processingStatus.get(processId).startTime
            };

            this.processingStatus.set(processId, {
                status: 'completed',
                progress: 100,
                result: result,
                completedAt: Date.now()
            });

            // Notificar completación
            const completeData = {
                type: 'completed',
                processId,
                result: result
            };

            this.notifySubscribers(processId, completeData);
            this.notifySSESubscribers(processId, completeData);

            // Cerrar streams SSE después de completar
            setTimeout(() => {
                const sseController = this.sseStreams.get(processId);
                if (sseController) {
                    sseController.close();
                    this.sseStreams.delete(processId);
                }
            }, 1000);

        } catch (error) {
            // Error en procesamiento
            this.processingStatus.set(processId, {
                status: 'error',
                error: error.message,
                failedAt: Date.now()
            });

            const errorData = {
                type: 'error',
                processId,
                error: error.message
            };

            this.notifySubscribers(processId, errorData);
            this.notifySSESubscribers(processId, errorData);
        }
    }

    async callAIModel(data, stepName) {
        try {
            // Hacer llamada real al modelo AI a través del proxy
            const response = await fetch(`${this.env.NVIDIA_NIM_BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.env.NVIDIA_NIM_API_KEY}`,
                },
                body: JSON.stringify({
                    model: "meta/llama-3.1-405b-instruct",
                    messages: [
                        {
                            role: "user",
                            content: `Process this data for step "${stepName}": ${JSON.stringify(data)}`
                        }
                    ],
                    max_tokens: 1000
                })
            });

            const result = await response.json();
            await this.sleep(2000); // Simular tiempo de procesamiento
            return result;

        } catch (error) {
            console.error('AI model call failed:', error);
            throw error;
        }
    }

    notifySubscribers(processId, message) {
        for (const [sessionId, session] of this.sessions.entries()) {
            if (session.processId === processId && session.socket.readyState === 1) {
                try {
                    session.socket.send(JSON.stringify(message));
                } catch (error) {
                    console.error('Failed to send WebSocket message:', error);
                    this.sessions.delete(sessionId);
                }
            }
        }
    }

    notifySSESubscribers(processId, message) {
        const sseController = this.sseStreams.get(processId);
        if (sseController) {
            try {
                const sseData = `event: message\ndata: ${JSON.stringify(message)}\n\n`;
                sseController.enqueue(new TextEncoder().encode(sseData));
            } catch (error) {
                console.error('Failed to send SSE message:', error);
                this.sseStreams.delete(processId);
            }
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}