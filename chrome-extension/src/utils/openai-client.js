/**
 * OpenAI语音助手客户端
 * 基于gpt-api-example.js的核心功能，适配Chrome扩展
 * 支持多视频独立对话历史管理
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

        // 多视频对话历史管理
        this.videoConversations = new Map(); // videoId -> conversation history
        this.currentVideoId = null;
        this.maxHistoryLength = 20; // 每个视频最多保留20条对话记录
        this.maxVideoCount = 5; // 最多缓存5个视频的对话历史

        // 监听页面卸载，清理所有对话历史
        this.setupCleanupListener();
    }

    /**
     * 设置页面卸载时的清理监听器
     */
    setupCleanupListener() {
        window.addEventListener('beforeunload', () => {
            this.clearAllConversations();
        });

    }

    /**
     * 切换到指定视频的对话上下文
     */
    switchToVideo(videoId) {
        if (!videoId) {
            console.warn('OpenAI: videoId为空，无法切换对话上下文');
            return;
        }

        const previousVideoId = this.currentVideoId;
        this.currentVideoId = videoId;

        // 如果是新视频，初始化对话历史
        if (!this.videoConversations.has(videoId)) {
            this.videoConversations.set(videoId, []);
            console.log('OpenAI: 为新视频创建对话历史:', videoId);
        } else {
            console.log('OpenAI: 切换到已有视频的对话历史:', videoId);
            const history = this.videoConversations.get(videoId);
            console.log(`OpenAI: 恢复 ${history.length} 条历史对话`);
        }

        // 限制缓存的视频数量
        if (this.videoConversations.size > this.maxVideoCount) {
            this.cleanupOldConversations();
        }

        if (previousVideoId !== videoId) {
            console.log(`OpenAI: 从视频 ${previousVideoId} 切换到 ${videoId}`);
        }
    }

    /**
     * 清理最老的对话历史（LRU策略）
     */
    cleanupOldConversations() {
        const videoIds = Array.from(this.videoConversations.keys());
        const oldestVideoId = videoIds[0]; // Map保持插入顺序，第一个是最老的
        
        this.videoConversations.delete(oldestVideoId);
        console.log('OpenAI: 清理最老的对话历史:', oldestVideoId);
    }

    /**
     * 获取当前视频的对话历史
     */
    getCurrentConversationHistory() {
        if (!this.currentVideoId) {
            return [];
        }
        return this.videoConversations.get(this.currentVideoId) || [];
    }

    /**
     * 添加消息到当前视频的对话历史
     */
    addToConversationHistory(role, content) {
        if (!this.currentVideoId) {
            console.warn('OpenAI: 当前没有活跃视频，无法保存对话');
            return;
        }

        const conversation = this.getCurrentConversationHistory();
        conversation.push({
            role: role,
            content: content,
            timestamp: Date.now()
        });

        // 更新Map中的引用（触发LRU更新）
        this.videoConversations.delete(this.currentVideoId);
        this.videoConversations.set(this.currentVideoId, conversation);

        // 如果当前视频的历史记录过长，移除最早的用户-助手对话
        if (conversation.length > this.maxHistoryLength) {
            // 找到第一个用户消息并移除用户-助手对
            for (let i = 0; i < conversation.length - 1; i++) {
                if (conversation[i].role === 'user' && 
                    conversation[i + 1].role === 'assistant') {
                    conversation.splice(i, 2);
                    console.log('OpenAI: 当前视频对话历史过长，移除最早的一轮对话');
                    break;
                }
            }
        }
    }

    /**
     * 获取用于API调用的完整消息数组
     * @deprecated 建议直接使用 getCurrentConversationHistory 和手动构建消息数组
     */
    getConversationMessages(systemMessage = null) {
        const messages = [];
        
        // 添加系统消息（如果提供）
        if (systemMessage) {
            messages.push({
                role: 'system',
                content: systemMessage
            });
        }

        // 添加当前视频的历史对话（排除timestamp）
        const history = this.getCurrentConversationHistory();
        history.forEach(msg => {
            messages.push({
                role: msg.role,
                content: msg.content
            });
        });

        return messages;
    }

    /**
     * 重置指定视频的对话历史
     */
    resetVideoConversation(videoId = null) {
        const targetVideoId = videoId || this.currentVideoId;
        
        if (targetVideoId && this.videoConversations.has(targetVideoId)) {
            this.videoConversations.set(targetVideoId, []);
            console.log('OpenAI: 重置视频对话历史:', targetVideoId);
        }
    }

    /**
     * 清除所有对话历史（页面卸载时调用）
     */
    clearAllConversations() {
        this.videoConversations.clear();
        this.currentVideoId = null;
        console.log('OpenAI: 已清除所有对话历史');
    }

    /**
     * 获取所有视频的对话摘要
     */
    getAllVideosSummary() {
        const summary = {};
        
        for (const [videoId, conversation] of this.videoConversations) {
            const userMessages = conversation.filter(msg => msg.role === 'user').length;
            const assistantMessages = conversation.filter(msg => msg.role === 'assistant').length;
            
            summary[videoId] = {
                totalMessages: conversation.length,
                userMessages,
                assistantMessages,
                lastActivity: conversation.length > 0 ? 
                    new Date(conversation[conversation.length - 1].timestamp).toLocaleString() : null,
                isCurrentVideo: videoId === this.currentVideoId
            };
        }
        
        return summary;
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
     * 使用gpt-4o-mini进行文字对话（支持连续对话）
     */
    async chatCompletion(messages, options = {}) {
        try {
            const requestBody = {
                model: 'gpt-4o-mini',
                messages: messages,
                max_completion_tokens: options.max_tokens || 100,
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
            const aiResponse = result.choices[0].message.content;

            // 将AI回复添加到对话历史
            this.addToConversationHistory('assistant', aiResponse);

            console.log('OpenAI: AI回复已保存到对话历史');
            
            return aiResponse;

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
     * 录制音频（传统固定时长方式，作为备选）
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
     * 使用智能录音器录制音频（VAD自动检测）
     */
    async recordAudioSmart(onStatusUpdate) {
        return new Promise(async (resolve, reject) => {
            let recorder = null;
            let timeoutId = null;
            
            try {
                recorder = new SmartVoiceRecorder();
                
                recorder.setCallbacks({
                    onSpeechStart: () => {
                        onStatusUpdate('正在录音...', 'recording');
                    },
                    onSpeechEnd: (audioBlob) => {
                        onStatusUpdate('录音完成', 'processing');
                        // 清除超时定时器
                        if (timeoutId) {
                            clearTimeout(timeoutId);
                            timeoutId = null;
                        }
                        // VAD会自动销毁，无需手动调用destroy
                        resolve(audioBlob);
                    },
                    onStatusUpdate: onStatusUpdate
                });

                await recorder.startSmartRecording();

                // 设置超时保护（最多30秒）
                timeoutId = setTimeout(() => {
                    if (recorder && recorder.recording) {
                        console.log('Voice: 录音超时，正在清理资源...');
                        recorder.destroy(); // 确保释放麦克风
                        reject(new Error('录音超时，请重试'));
                    }
                }, 30000);

            } catch (error) {
                // 清除超时定时器
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
                
                // 确保清理录音器资源
                if (recorder) {
                    try {
                        recorder.destroy();
                    } catch (destroyError) {
                        console.error('Voice: 清理录音器失败:', destroyError);
                    }
                }
                
                reject(error);
            }
        });
    }

    /**
     * 构建YouTube助手的对话消息（支持连续对话和OpenAI缓存优化）
     */
    buildYouTubeAssistantMessages(userQuestion, context) {
        // 检查是否为新视频
        this.switchToVideo(context.videoId);

        // 构建固定的视频系统消息（不变部分，有利于OpenAI缓存）
        const staticSystemMessage = `You are a YouTube video assistant that answers questions based on video subtitle content.

Video: ${context.videoTitle || 'Unknown Title'}
Video ID: ${context.videoId}

Full Transcript:
${context.fullTranscript || 'Loading subtitles...'}

Please provide concise answers (within 30 words), focusing on content relevant to the current time position.`;

        // 构建当前问题的动态上下文消息（每次查询时更新）
        const currentDynamicContext = `Current video playback time: ${Math.floor(context.currentTime)} seconds

Subtitle content around current time position:
${context.relevantSubtitles || 'No relevant subtitles'}`;

        // 添加用户问题到对话历史
        this.addToConversationHistory('user', userQuestion);

        // 获取包含历史对话的完整消息数组，但不包含system消息
        const conversationHistory = this.getCurrentConversationHistory();
        
        // 构建最终的消息数组：静态系统消息 + 历史对话穿插动态上下文
        const messages = [
            {
                role: 'system',
                content: staticSystemMessage
            }
        ];

        // 遍历对话历史，在每个用户问题前插入动态上下文
        for (let i = 0; i < conversationHistory.length; i++) {
            const msg = conversationHistory[i];
            
            if (msg.role === 'user') {
                // 在用户问题前插入动态上下文
                if (i === conversationHistory.length - 1) {
                    // 最后一个用户问题（当前问题），使用当前的动态上下文
                    messages.push({
                        role: 'system',
                        content: currentDynamicContext
                    });
                } else {
                    // 历史用户问题，使用通用的历史上下文标记
                    messages.push({
                        role: 'system',
                        content: `Historical conversation context - Round ${Math.floor(i/2) + 1}`
                    });
                }
            }
            
            // 添加用户问题或助手回答
            messages.push({
                role: msg.role,
                content: msg.content
            });
        }

        console.log('OpenAI: 当前对话历史长度:', conversationHistory.length);
        console.log('OpenAI: 发送消息总数:', messages.length, '(包含动态system消息)');
        console.log('OpenAI: 静态system消息长度:', staticSystemMessage.length, '字符');
        console.log('OpenAI: 当前动态上下文长度:', currentDynamicContext.length, '字符');
        
        // 输出完整的消息结构以便调试
        console.log('OpenAI: 消息结构预览:');
        messages.forEach((msg, index) => {
            const preview = msg.content.length > 50 ? 
                msg.content.substring(0, 50) + '...' : msg.content;
            console.log(`  [${index}] ${msg.role}: ${preview}`);
        });

        return messages;
    }

    /**
     * 智能语音查询处理流程（使用VAD自动检测）
     */
    async processVoiceQuerySmart(context, onStatusUpdate) {
        const startTime = performance.now();
        let timings = {
            recording: 0,
            transcription: 0,
            chatCompletion: 0,
            textToSpeech: 0,
            audioPlayback: 0,
            total: 0
        };

        try {
            onStatusUpdate('准备录音，请开始说话...', 'recording');
            
            // 步骤1: 智能录制音频（VAD自动检测语音结束）
            const recordingStart = performance.now();
            const audioBlob = await this.recordAudioSmart(onStatusUpdate);
            timings.recording = performance.now() - recordingStart;
            
            // 步骤2: 语音转文字
            onStatusUpdate('转录中...', 'processing');
            const transcriptionStart = performance.now();
            const transcript = await this.transcribeAudio(audioBlob, {
                language: 'en',
                response_format: 'text'
            });
            timings.transcription = performance.now() - transcriptionStart;
            console.log('用户问题:', transcript);

            // 步骤3: AI对话
            onStatusUpdate('AI思考中...', 'processing');
            const chatStart = performance.now();
            const messages = this.buildYouTubeAssistantMessages(transcript, context);
            const aiResponse = await this.chatCompletion(messages, {
                max_tokens: 100,
                temperature: 0.7
            });
            timings.chatCompletion = performance.now() - chatStart;
            console.log('AI回复:', aiResponse);

            // 步骤4: 文字转语音
            onStatusUpdate('生成语音中...', 'processing');
            const ttsStart = performance.now();
            const audioData = await this.textToSpeech(aiResponse, {
                voice: 'alloy'
            });
            timings.textToSpeech = performance.now() - ttsStart;

            // 步骤5: 播放回复
            onStatusUpdate('播放回复...', 'playing');
            const playbackStart = performance.now();
            await this.playAudio(audioData);
            timings.audioPlayback = performance.now() - playbackStart;
            
            timings.total = performance.now() - startTime;
            
            // 输出详细的时间统计
            this.logTimingStats(timings, 'Smart Voice Query');
            
            onStatusUpdate(`完成 (总耗时: ${Math.round(timings.total)}ms)`, 'success');
            
            return {
                userQuestion: transcript,
                aiResponse: aiResponse,
                audioData: audioData,
                timings: timings
            };

        } catch (error) {
            timings.total = performance.now() - startTime;
            console.error('智能语音处理失败:', error);
            console.log('⏱️ 失败前的处理时间:', this.formatTimings(timings));
            
            onStatusUpdate('错误: ' + error.message, 'error');
            
            // 如果VAD失败，尝试使用传统录音方式
            if (error.message.includes('VAD') || error.message.includes('语音检测')) {
                console.log('尝试使用传统录音方式...');
                onStatusUpdate('切换到传统录音模式...', 'info');
                return await this.processVoiceQuery(context, onStatusUpdate);
            }
            
            throw error;
        }
    }

    /**
     * 完整的三步处理流程（传统固定时长录音）
     */
    async processVoiceQuery(context, onStatusUpdate) {
        const startTime = performance.now();
        let timings = {
            recording: 0,
            transcription: 0,
            chatCompletion: 0,
            textToSpeech: 0,
            audioPlayback: 0,
            total: 0
        };

        try {
            onStatusUpdate('开始录音...', 'recording');
            
            // 步骤1: 录制音频
            const recordingStart = performance.now();
            const audioBlob = await this.recordAudio(5000);
            timings.recording = performance.now() - recordingStart;
            
            // 步骤2: 语音转文字
            onStatusUpdate('转录中...', 'processing');
            const transcriptionStart = performance.now();
            const transcript = await this.transcribeAudio(audioBlob, {
                language: 'en',
                response_format: 'text'
            });
            timings.transcription = performance.now() - transcriptionStart;
            console.log('用户问题:', transcript);

            // 步骤3: AI对话
            onStatusUpdate('AI思考中...', 'processing');
            const chatStart = performance.now();
            const messages = this.buildYouTubeAssistantMessages(transcript, context);
            const aiResponse = await this.chatCompletion(messages, {
                max_tokens: 100,
                temperature: 0.7
            });
            timings.chatCompletion = performance.now() - chatStart;
            console.log('AI回复:', aiResponse);

            // 步骤4: 文字转语音
            onStatusUpdate('生成语音中...', 'processing');
            const ttsStart = performance.now();
            const audioData = await this.textToSpeech(aiResponse, {
                voice: 'alloy'
            });
            timings.textToSpeech = performance.now() - ttsStart;

            // 步骤5: 播放回复
            onStatusUpdate('播放回复...', 'playing');
            const playbackStart = performance.now();
            await this.playAudio(audioData);
            timings.audioPlayback = performance.now() - playbackStart;
            
            timings.total = performance.now() - startTime;
            
            // 输出详细的时间统计
            this.logTimingStats(timings, 'Traditional Voice Query');
            
            onStatusUpdate(`完成 (总耗时: ${Math.round(timings.total)}ms)`, 'success');
            
            return {
                userQuestion: transcript,
                aiResponse: aiResponse,
                audioData: audioData,
                timings: timings
            };

        } catch (error) {
            timings.total = performance.now() - startTime;
            console.error('处理失败:', error);
            console.log('⏱️ 失败前的处理时间:', this.formatTimings(timings));
            
            onStatusUpdate('错误: ' + error.message, 'error');
            throw error;
        }
    }

    /**
     * 获取对话历史
     */
    getConversationHistory() {
        return this.getCurrentConversationHistory().map(msg => ({
            role: msg.role,
            content: msg.content,
            timestamp: new Date(msg.timestamp).toLocaleString()
        }));
    }

    /**
     * 清除对话历史
     */
    clearConversationHistory() {
        this.resetVideoConversation();
        console.log('OpenAI: 对话历史已手动清除');
    }

    /**
     * 获取对话摘要信息
     */
    getConversationSummary() {
        const userMessages = this.getCurrentConversationHistory().filter(msg => msg.role === 'user').length;
        const assistantMessages = this.getCurrentConversationHistory().filter(msg => msg.role === 'assistant').length;
        const totalMessages = this.getCurrentConversationHistory().length;
        
        return {
            totalMessages,
            userMessages,
            assistantMessages,
            currentVideoId: this.currentVideoId,
            lastActivity: totalMessages > 0 ? new Date(this.getCurrentConversationHistory()[totalMessages - 1].timestamp).toLocaleString() : null
        };
    }

    /**
     * 导出对话历史（用于调试或保存）
     */
    exportConversationHistory() {
        return {
            videoId: this.currentVideoId,
            timestamp: new Date().toISOString(),
            conversation: this.getCurrentConversationHistory()
        };
    }

    /**
     * 格式化时间统计信息
     */
    formatTimings(timings) {
        const format = (ms) => `${Math.round(ms)}ms`;
        
        return {
            recording: format(timings.recording),
            transcription: format(timings.transcription),
            chatCompletion: format(timings.chatCompletion),
            textToSpeech: format(timings.textToSpeech),
            audioPlayback: format(timings.audioPlayback),
            total: format(timings.total)
        };
    }

    /**
     * 输出详细的时间统计日志
     */
    logTimingStats(timings, operation) {
        const formatted = this.formatTimings(timings);
        
        console.log(`\n⏱️ ===== ${operation} 时间统计 =====`);
        console.log(`🎤 录音阶段:     ${formatted.recording}`);
        console.log(`📝 语音转录:     ${formatted.transcription}`);
        console.log(`🤖 AI回复生成:   ${formatted.chatCompletion}`);
        console.log(`🔊 文字转语音:   ${formatted.textToSpeech}`);
        console.log(`📢 音频播放:     ${formatted.audioPlayback}`);
        console.log(`⏱️ 总耗时:       ${formatted.total}`);
        console.log(`================================\n`);
        
        // 计算各阶段占比
        const apiTime = timings.transcription + timings.chatCompletion + timings.textToSpeech;
        const apiPercentage = Math.round((apiTime / timings.total) * 100);
        
        console.log(`📊 API请求总时间: ${Math.round(apiTime)}ms (${apiPercentage}% of total)`);
        console.log(`   - Transcription: ${Math.round((timings.transcription/timings.total)*100)}%`);
        console.log(`   - Chat Completion: ${Math.round((timings.chatCompletion/timings.total)*100)}%`);
        console.log(`   - Text-to-Speech: ${Math.round((timings.textToSpeech/timings.total)*100)}%`);
    }

    // ============ 向后兼容方法 ============

    /**
     * 重置对话历史（向后兼容）
     * @deprecated 使用 resetVideoConversation 或 switchToVideo 代替
     */
    resetConversation(videoId = null) {
        console.warn('OpenAI: resetConversation已弃用，建议使用resetVideoConversation');
        if (videoId) {
            this.switchToVideo(videoId);
            this.resetVideoConversation(videoId);
        } else {
            this.resetVideoConversation();
        }
    }

    /**
     * 检查视频变化（向后兼容）
     * @deprecated 使用 switchToVideo 代替
     */
    checkVideoChange(videoId) {
        console.warn('OpenAI: checkVideoChange已弃用，建议使用switchToVideo');
        this.switchToVideo(videoId);
    }
}

// 导出为全局变量
window.OpenAIVoiceAssistant = OpenAIVoiceAssistant; 