/**
 * OpenAI语音助手客户端 - GPT-4o-mini-audio-preview版本
 * 支持音频ID引用机制，避免重复传输音频数据
 * 大幅优化多轮对话的传输效率
 */
class OpenAIVoiceAssistant {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseURL = 'https://api.openai.com/v1';

        // 多视频对话历史管理
        this.videoConversations = new Map(); // videoId -> conversation history
        this.currentVideoId = null;
        this.maxHistoryLength = 20; // 每个视频最多保留20条对话记录
        this.maxVideoCount = 5; // 最多缓存5个视频的对话历史

        // 音频ID缓存管理
        this.audioCache = new Map(); // audioId -> { data, transcript, expiresAt }
        this.cleanupInterval = null;

        // 监听页面卸载，清理所有对话历史
        this.setupCleanupListener();
        this.startAudioCacheCleanup();
    }

    /**
     * 启动音频缓存自动清理
     */
    startAudioCacheCleanup() {
        // 每5分钟清理一次过期的音频缓存
        this.cleanupInterval = setInterval(() => {
            this.cleanupExpiredAudioCache();
        }, 5 * 60 * 1000);
    }

    /**
     * 清理过期的音频缓存
     */
    cleanupExpiredAudioCache() {
        const now = Math.floor(Date.now() / 1000);
        let cleanedCount = 0;
        
        for (const [audioId, audioData] of this.audioCache) {
            if (audioData.expiresAt && audioData.expiresAt < now) {
                this.audioCache.delete(audioId);
                cleanedCount++;
            }
        }
        
        if (cleanedCount > 0) {
            console.log(`Audio: 清理了 ${cleanedCount} 个过期音频缓存`);
        }
    }

    /**
     * 设置页面卸载时的清理监听器
     */
    setupCleanupListener() {
        window.addEventListener('beforeunload', () => {
            this.clearAllConversations();
            this.clearAllCaches();
        });
    }

    /**
     * 清理所有缓存
     */
    clearAllCaches() {
        this.audioCache.clear();
        
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        
        console.log('Audio: 已清除所有音频缓存');
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
     * 添加优化的对话历史 (支持音频ID和动态context)
     */
    addOptimizedConversationHistory(role, content, audioBase64 = null, audioId = null, context = null) {
        if (!this.currentVideoId) {
            console.warn('Audio: 当前没有活跃视频，无法保存对话');
            return;
        }

        const conversation = this.getCurrentConversationHistory();
        const historyItem = {
            role: role,
            content: content,
            timestamp: Date.now()
        };
        
        // 为用户消息添加音频信息和动态context
        if (role === 'user') {
            if (audioId) {
                historyItem.audioId = audioId;
            }
            if (audioBase64) {
                historyItem.audioBase64 = audioBase64;
            }
            // 保存当时的动态context（时间戳和相关字幕）
            if (context) {
                historyItem.dynamicContext = `Current video playback time: ${Math.floor(context.currentTime)} seconds

Subtitle content around current time position:
${context.relevantSubtitles || 'No relevant subtitles'}`;
            }
        }
        
        // 为助手消息添加音频ID (如果有)
        if (role === 'assistant' && audioId) {
            historyItem.audioId = audioId;
        }
        
        conversation.push(historyItem);

        // 更新Map
        this.videoConversations.delete(this.currentVideoId);
        this.videoConversations.set(this.currentVideoId, conversation);

        // 清理过长的历史记录
        if (conversation.length > this.maxHistoryLength) {
            for (let i = 0; i < conversation.length - 1; i++) {
                if (conversation[i].role === 'user' && 
                    conversation[i + 1].role === 'assistant') {
                    conversation.splice(i, 2);
                    console.log('Audio: 当前视频对话历史过长，移除最早的一轮对话');
                    break;
                }
            }
        }
    }

    /**
     * 添加消息到当前视频的对话历史 (向后兼容)
     * @deprecated 使用 addOptimizedConversationHistory 代替
     */
    addToConversationHistory(role, content) {
        this.addOptimizedConversationHistory(role, content, null, null, null);
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
     * 音频转录 - 使用 gpt-4o-mini-transcribe
     */
    async transcribeAudio(audioBlob, options = {}) {
        try {
            const formData = new FormData();
            formData.append('file', audioBlob, 'audio.wav');
            formData.append('model', 'gpt-4o-mini-transcribe');
            
            // 默认使用text格式获取纯文本结果
            const responseFormat = options.response_format || 'text';
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

            const response = await fetch(`${this.baseURL}/audio/transcriptions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`转录API错误: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
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
     * 优化的音频对话处理 - 分离转录和对话
     */
    async optimizedAudioCompletion(audioBlob, context) {
        try {
            this.switchToVideo(context.videoId);
            
            // 步骤1: 先用gpt-4o-mini-transcribe转录音频
            console.log('🎤 转录用户语音...');
            const transcript = await this.transcribeAudio(audioBlob, {
                response_format: 'text',
                prompt: 'transcribe everything, don\'t miss any words',
                temperature: 0.0
            });
            console.log('📝 转录结果:', transcript);
            
            // 步骤2: 构建文字消息数组
            const messages = this.buildOptimizedTextMessages(transcript, context);
            
            const requestBody = {
                model: 'gpt-4o-mini-audio-preview',
                modalities: ['text', 'audio'],
                audio: {
                    voice: 'alloy',
                    format: 'wav'
                },
                messages: messages,
                max_completion_tokens: 1024,
                temperature: 1.0
            };

            // 输出请求大小统计
            const requestSize = JSON.stringify(requestBody).length;
            console.log(`📊 请求大小: ${(requestSize / 1024).toFixed(1)}KB`);

            const response = await fetch(`${this.baseURL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Audio API错误: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
            }

            const result = await response.json();
            const choice = result.choices[0];
            
            // 提取并缓存音频信息
            const textResponse = choice.message.content || '';
            const audioInfo = choice.message.audio;
            let audioResponse = null;
            
            if (audioInfo) {
                // 缓存音频数据和ID
                this.cacheAudioData(audioInfo);
                
                // 转换音频数据
                audioResponse = await this.base64ToArrayBuffer(audioInfo.data);
                
                console.log(`🎵 音频ID: ${audioInfo.id}, 过期时间: ${new Date(audioInfo.expires_at * 1000).toLocaleString()}`);
            }
            
            // 保存对话历史 (使用优化格式，用户消息不保存音频数据)
            this.addOptimizedConversationHistory('user', transcript, null, null, context);
            this.addOptimizedConversationHistory('assistant', textResponse, null, audioInfo?.id);
            
            // 输出token使用情况
            if (result.usage) {
                this.logTokenUsage(result.usage);
            }
            
            return {
                transcript: transcript,
                textResponse: textResponse,
                audioResponse: audioResponse
            };

        } catch (error) {
            console.error('优化音频对话处理失败:', error);
            throw error;
        }
    }

    /**
     * 缓存音频数据
     */
    cacheAudioData(audioInfo) {
        if (!audioInfo || !audioInfo.id) return;
        
        this.audioCache.set(audioInfo.id, {
            data: audioInfo.data,
            transcript: audioInfo.transcript,
            expiresAt: audioInfo.expires_at,
            cachedAt: Math.floor(Date.now() / 1000)
        });
        
        console.log(`💾 音频已缓存: ${audioInfo.id} (${this.audioCache.size} 个音频在缓存中)`);
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
     * 构建优化的文字消息数组 - 支持OpenAI prefix caching
     */
    buildOptimizedTextMessages(userQuestion, context) {
        this.switchToVideo(context.videoId);
        
        // 静态系统消息 (可被OpenAI缓存)
        const staticSystemMessage = `You are a YouTube video assistant that answers questions based on video subtitle content.

Video: ${context.videoTitle || 'Unknown Title'}
Video ID: ${context.videoId}

Full Transcript:
${context.fullTranscript || 'Loading subtitles...'}

Please provide concise answers (within 30 words), focusing on content relevant to the current time position.`;

        // 动态系统消息 (当前时间戳和相关字幕)
        const dynamicSystemMessage = `Current video playback time: ${Math.floor(context.currentTime)} seconds

Subtitle content around current time position:
${context.relevantSubtitles || 'No relevant subtitles'}`;

        const messages = [
            {
                role: 'system',
                content: staticSystemMessage // 静态内容，可被缓存
            }
        ];
        
        // 添加历史对话 (在每个用户输入前插入动态context)
        const conversationHistory = this.getCurrentConversationHistory();
        
        conversationHistory.forEach((msg, index) => {
            if (msg.role === 'user') {
                // 在用户消息前插入动态系统消息
                messages.push({
                    role: 'system',
                    content: msg.dynamicContext || dynamicSystemMessage // 使用历史的context或当前的
                });
                
                // 用户消息：现在都是文字消息
                messages.push({
                    role: 'user',
                    content: msg.content
                });
            } else {
                // 助手回复：使用音频ID引用（如果有的话）
                if (msg.audioId && this.audioCache.has(msg.audioId)) {
                    console.log(`🔄 引用助手音频ID: ${msg.audioId}`);
                    messages.push({
                        role: 'assistant',
                        content: [], // 空内容
                        audio: {
                            id: msg.audioId
                        }
                    });
                } else {
                    // 纯文本回复
                    messages.push({
                        role: 'assistant',
                        content: msg.content
                    });
                }
            }
        });
        
        // 在当前用户输入前插入最新的动态系统消息
        messages.push({
            role: 'system',
            content: dynamicSystemMessage
        });
        
        // 添加当前用户文字输入
        messages.push({
            role: 'user',
            content: userQuestion
        });
        
        console.log(`📝 消息数组长度: ${messages.length}, 历史对话: ${conversationHistory.length}`);
        console.log(`💾 静态系统消息长度: ${staticSystemMessage.length} 字符 (可缓存)`);
        console.log(`🔄 动态系统消息长度: ${dynamicSystemMessage.length} 字符`);
        
        return messages;
    }

    /**
     * 构建优化的消息数组 - 支持OpenAI prefix caching (音频版本，已弃用)
     * @deprecated 使用 buildOptimizedTextMessages 代替
     */
    buildOptimizedMessages(currentAudioBase64, context) {
        console.warn('buildOptimizedMessages (音频版本) 已弃用，请使用 buildOptimizedTextMessages');
        return this.buildOptimizedTextMessages('语音输入', context);
    }

    /**
     * 构建YouTube助手的对话消息（向后兼容）
     * @deprecated 使用 buildOptimizedMessages 代替
     */
    buildYouTubeAssistantMessages(userQuestion, context) {
        console.warn('buildYouTubeAssistantMessages 已弃用，请使用 buildOptimizedMessages');
        // 这个方法现在只用于向后兼容，实际不会被调用
        return [];
    }

    /**
     * 智能语音查询处理流程（分离转录和对话）
     */
    async processVoiceQuerySmart(context, onStatusUpdate) {
        const startTime = performance.now();
        let timings = {
            recording: 0,
            transcription: 0,
            audioCompletion: 0,
            audioPlayback: 0,
            total: 0
        };

        try {
            onStatusUpdate('准备录音，请开始说话...', 'recording');
            
            // 步骤1: 智能录制音频
            const recordingStart = performance.now();
            const audioBlob = await this.recordAudioSmart(onStatusUpdate);
            timings.recording = performance.now() - recordingStart;
            
            // 步骤2: 语音转录 + AI对话生成 (分离处理)
            onStatusUpdate('转录并生成回复中...', 'processing');
            const audioCompletionStart = performance.now();
            
            const result = await this.optimizedAudioCompletion(audioBlob, context);
            timings.audioCompletion = performance.now() - audioCompletionStart;
            
            console.log('用户问题:', result.transcript);
            console.log('AI回复:', result.textResponse);
            
            // 步骤3: 播放回复
            if (result.audioResponse) {
                onStatusUpdate('播放回复...', 'playing');
                const playbackStart = performance.now();
                await this.playAudio(result.audioResponse);
                timings.audioPlayback = performance.now() - playbackStart;
            }
            
            timings.total = performance.now() - startTime;
            
            this.logTimingStats(timings, 'Smart Voice Query (Separated)');
            onStatusUpdate(`完成`, 'success');
            
            return {
                userQuestion: result.transcript,
                aiResponse: result.textResponse,
                audioData: result.audioResponse,
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
     * 传统录音处理流程（分离转录和对话）
     */
    async processVoiceQuery(context, onStatusUpdate) {
        const startTime = performance.now();
        let timings = {
            recording: 0,
            transcription: 0,
            audioCompletion: 0,
            audioPlayback: 0,
            total: 0
        };

        try {
            onStatusUpdate('开始录音...', 'recording');
            
            // 步骤1: 录制音频
            const recordingStart = performance.now();
            const audioBlob = await this.recordAudio(5000);
            timings.recording = performance.now() - recordingStart;
            
            // 步骤2: 语音转录 + AI对话生成 (分离处理)
            onStatusUpdate('转录并生成回复中...', 'processing');
            const audioCompletionStart = performance.now();
            
            const result = await this.optimizedAudioCompletion(audioBlob, context);
            timings.audioCompletion = performance.now() - audioCompletionStart;
            
            console.log('用户问题:', result.transcript);
            console.log('AI回复:', result.textResponse);

            // 步骤3: 播放回复
            if (result.audioResponse) {
                onStatusUpdate('播放回复...', 'playing');
                const playbackStart = performance.now();
                await this.playAudio(result.audioResponse);
                timings.audioPlayback = performance.now() - playbackStart;
            }
            
            timings.total = performance.now() - startTime;
            
            this.logTimingStats(timings, 'Traditional Voice Query (Separated)');
            onStatusUpdate(`完成`, 'success');
            
            return {
                userQuestion: result.transcript,
                aiResponse: result.textResponse,
                audioData: result.audioResponse,
                timings: timings
            };

        } catch (error) {
            timings.total = performance.now() - startTime;
            console.error('传统语音处理失败:', error);
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
        
        if (timings.audioCompletion) {
            console.log(`🎯 转录+对话:    ${formatted.audioCompletion}`);
        } else if (timings.audioProcessing) {
            console.log(`🎯 音频处理:     ${formatted.audioProcessing}`);
        } else {
            // 旧版本兼容
            console.log(`📝 语音转录:     ${formatted.transcription || '0ms'}`);
            console.log(`🤖 AI回复生成:   ${formatted.chatCompletion || '0ms'}`);
            console.log(`🔊 文字转语音:   ${formatted.textToSpeech || '0ms'}`);
        }
        
        console.log(`📢 音频播放:     ${formatted.audioPlayback}`);
        console.log(`⏱️ 总耗时:       ${formatted.total}`);
        console.log(`================================\n`);
        
        // 计算处理时间占比
        const processingTime = timings.audioCompletion || timings.audioProcessing;
        if (processingTime) {
            const processingPercentage = Math.round((processingTime / timings.total) * 100);
            console.log(`📊 AI处理时间: ${Math.round(processingTime)}ms (${processingPercentage}% of total)`);
        }
    }

    /**
     * 记录Token使用情况和缓存效率
     */
    logTokenUsage(usage) {
        console.log('📊 === Token使用详情 ===');
        console.log(`总tokens: ${usage.total_tokens}`);
        console.log(`输入tokens: ${usage.prompt_tokens}`);
        console.log(`输出tokens: ${usage.completion_tokens}`);
        
        if (usage.prompt_tokens_details) {
            const details = usage.prompt_tokens_details;
            console.log(`输入详情:`);
            console.log(`  📝 文字tokens: ${details.text_tokens || 0}`);
            console.log(`  🎵 音频tokens: ${details.audio_tokens || 0}`);
            console.log(`  🖼️ 图片tokens: ${details.image_tokens || 0}`);
        }
        
        if (usage.completion_tokens_details) {
            const details = usage.completion_tokens_details;
            console.log(`输出详情:`);
            console.log(`  📝 文字tokens: ${details.text_tokens || 0}`);  
            console.log(`  🎵 音频tokens: ${details.audio_tokens || 0}`);
        }
        
        // 缓存效率统计
        const summary = this.getConversationSummaryWithAudio();
        console.log(`💾 助手音频缓存效率: ${summary.cacheHitRate} (${summary.cachedAudioReferences}/${summary.assistantAudioMessages})`);
        console.log(`🎤 用户音频消息: ${summary.userAudioMessages} (始终重新发送)`);
        console.log('=====================================');
    }

    /**
     * 获取对话历史摘要 (包含音频信息)
     */
    getConversationSummaryWithAudio() {
        const history = this.getCurrentConversationHistory();
        let assistantAudioMessages = 0;
        let cachedAudioRefs = 0;
        let userAudioMessages = 0;
        
        history.forEach(msg => {
            if (msg.role === 'assistant' && msg.audioId) {
                assistantAudioMessages++;
                if (this.audioCache.has(msg.audioId)) {
                    cachedAudioRefs++;
                }
            } else if (msg.role === 'user' && msg.audioBase64) {
                userAudioMessages++;
            }
        });
        
        return {
            totalMessages: history.length,
            userAudioMessages: userAudioMessages,
            assistantAudioMessages: assistantAudioMessages,
            cachedAudioReferences: cachedAudioRefs,
            cacheHitRate: assistantAudioMessages > 0 ? (cachedAudioRefs / assistantAudioMessages * 100).toFixed(1) + '%' : '0%',
            currentVideoId: this.currentVideoId,
            audioCacheSize: this.audioCache.size
        };
    }

    /**
     * Blob转Base64
     */
    async blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    /**
     * Base64转ArrayBuffer
     */
    async base64ToArrayBuffer(base64) {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
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