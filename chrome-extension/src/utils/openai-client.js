/**
 * OpenAI语音助手客户端
 * 基于gpt-api-example.js的核心功能，适配Chrome扩展
 */
class OpenAIVoiceAssistant {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseURL = 'https://api.openai.com/v1';
        
        // API endpoints
        this.endpoints = {
            transcribe: '/audio/transcriptions',
            chat: '/chat/completions', 
            tts: '/audio/speech'
        };
    }

    /**
     * 使用gpt-4o-mini-transcribe将音频转换为文字
     */
    async transcribeAudio(audioBlob, options = {}) {
        try {
            const formData = new FormData();
            formData.append('file', audioBlob, 'audio.wav');
            formData.append('model', 'whisper-1'); // 使用稳定的whisper模型
            
            // 默认使用json格式，这样可以获得更多信息
            const responseFormat = options.response_format || 'json';
            formData.append('response_format', responseFormat);
            
            if (options.language) {
                formData.append('language', options.language);
            }
            if (options.temperature) {
                formData.append('temperature', options.temperature.toString());
            }
            if (options.prompt) {
                formData.append('prompt', options.prompt);
            }

            const response = await fetch(`${this.baseURL}${this.endpoints.transcribe}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: formData
            });

            if (!response.ok) {
                let errorMessage = `转录API错误: ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorMessage += ` - ${errorData.error?.message || 'Unknown error'}`;
                } catch {
                    errorMessage += ` - ${response.statusText}`;
                }
                throw new Error(errorMessage);
            }

            // 根据响应格式处理返回结果
            if (responseFormat === 'text') {
                return await response.text();
            } else {
                const result = await response.json();
                return result.text || result;
            }

        } catch (error) {
            console.error('音频转录失败:', error);
            throw error;
        }
    }

    /**
     * 使用gpt-4o-mini进行文字对话
     */
    async chatCompletion(messages, options = {}) {
        try {
            const requestBody = {
                model: 'gpt-4o-mini',
                messages: messages,
                max_tokens: options.max_tokens || 200,
                temperature: options.temperature || 0.7,
                top_p: options.top_p || 1,
                frequency_penalty: options.frequency_penalty || 0,
                presence_penalty: options.presence_penalty || 0,
                stream: options.stream || false
            };

            if (options.functions) {
                requestBody.functions = options.functions;
            }
            if (options.function_call) {
                requestBody.function_call = options.function_call;
            }
            if (options.response_format) {
                requestBody.response_format = options.response_format;
            }

            const response = await fetch(`${this.baseURL}${this.endpoints.chat}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`对话API错误: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
            }

            const result = await response.json();
            return result.choices[0].message.content;

        } catch (error) {
            console.error('对话生成失败:', error);
            throw error;
        }
    }

    /**
     * 使用TTS将文字转换为语音
     */
    async textToSpeech(text, options = {}) {
        try {
            const requestBody = {
                model: 'gpt-4o-mini-tts',
                input: text,
                voice: options.voice || 'alloy',
                response_format: options.response_format || 'mp3',
                speed: options.speed || 1.0
            };

            const response = await fetch(`${this.baseURL}${this.endpoints.tts}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`语音合成API错误: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
            }

            return await response.arrayBuffer();

        } catch (error) {
            console.error('语音合成失败:', error);
            throw error;
        }
    }

    /**
     * 播放音频数据
     */
    async playAudio(audioData) {
        return new Promise((resolve, reject) => {
            try {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                
                audioContext.decodeAudioData(audioData)
                    .then(audioBuffer => {
                        const source = audioContext.createBufferSource();
                        source.buffer = audioBuffer;
                        source.connect(audioContext.destination);
                        
                        source.onended = resolve;
                        source.start();
                    })
                    .catch(reject);
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * 录制音频
     */
    async recordAudio(duration = 5000) {
        return new Promise(async (resolve, reject) => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    audio: {
                        sampleRate: 16000,
                        channelCount: 1,
                        echoCancellation: true,
                        noiseSuppression: true
                    } 
                });

                const mediaRecorder = new MediaRecorder(stream, {
                    mimeType: 'audio/webm;codecs=opus'
                });

                const audioChunks = [];

                mediaRecorder.ondataavailable = (event) => {
                    audioChunks.push(event.data);
                };

                mediaRecorder.onstop = () => {
                    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                    stream.getTracks().forEach(track => track.stop());
                    resolve(audioBlob);
                };

                mediaRecorder.start();

                setTimeout(() => {
                    if (mediaRecorder.state === 'recording') {
                        mediaRecorder.stop();
                    }
                }, duration);

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * 构建YouTube助手的对话消息
     */
    buildYouTubeAssistantMessages(userQuestion, context) {
        const systemMessage = {
            role: 'system',
            content: `你是YouTube视频助手，基于视频字幕内容回答问题。

视频：${context.videoTitle}
当前时间：${Math.floor(context.currentTime)}秒

当前字幕：
${context.relevantSubtitles}

完整字幕：
${context.fullTranscript}

请简洁回答（100字以内），重点关注当前时间点的内容。`
        };

        const userMessage = {
            role: 'user',
            content: userQuestion
        };

        return [systemMessage, userMessage];
    }

    /**
     * 完整的三步处理流程
     */
    async processVoiceQuery(context, onStatusUpdate) {
        try {
            onStatusUpdate('开始录音...', 'recording');
            
            // 步骤1: 录制音频
            const audioBlob = await this.recordAudio(5000);
            
            // 步骤2: 语音转文字
            onStatusUpdate('转录中...', 'processing');
            const transcript = await this.transcribeAudio(audioBlob, {
                language: 'en',
                response_format: 'text'
            });
            console.log('用户问题:', transcript);

            // 步骤3: AI对话
            onStatusUpdate('AI思考中...', 'processing');
            const messages = this.buildYouTubeAssistantMessages(transcript, context);
            const aiResponse = await this.chatCompletion(messages, {
                max_tokens: 200,
                temperature: 0.8
            });
            console.log('AI回复:', aiResponse);

            // 步骤4: 文字转语音
            onStatusUpdate('生成语音中...', 'processing');
            const audioData = await this.textToSpeech(aiResponse, {
                voice: 'alloy'
            });

            // 步骤5: 播放回复
            onStatusUpdate('播放回复...', 'playing');
            await this.playAudio(audioData);
            
            onStatusUpdate('完成', 'success');
            
            return {
                userQuestion: transcript,
                aiResponse: aiResponse,
                audioData: audioData
            };

        } catch (error) {
            console.error('处理失败:', error);
            onStatusUpdate('错误: ' + error.message, 'error');
            throw error;
        }
    }
}

// 导出为全局变量
window.OpenAIVoiceAssistant = OpenAIVoiceAssistant; 