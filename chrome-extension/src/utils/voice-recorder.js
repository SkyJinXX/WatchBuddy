/**
 * 智能语音录制器 - 使用VAD自动检测语音开始和结束
 */
class SmartVoiceRecorder {
    constructor() {
        this.vadInstance = null;
        this.isRecording = false;
        this.audioChunks = [];
        this.onSpeechStartCallback = null;
        this.onSpeechEndCallback = null;
        this.onStatusUpdateCallback = null;
        this.mediaRecorder = null;
        this.stream = null;
        this.microphoneReady = false; // 麦克风是否已准备好
        this.hasNotifiedMicReady = false; // 是否已通知用户麦克风准备好
        this.vadInitialized = false; // VAD是否已初始化
        this.isPaused = false; // VAD是否处于暂停状态
    }

    /**
     * 初始化VAD和录音器
     */
    async initialize() {
        try {
            // 检查VAD库是否可用
            if (typeof vad === 'undefined' || !vad.MicVAD) {
                throw new Error('VAD库未加载，请检查网络连接');
            }

            // 初始化VAD
            this.vadInstance = await vad.MicVAD.new({
                onFrameProcessed: (probabilities, frame) => {
                    // 第一次处理音频帧时，说明麦克风已经真正开始工作
                    if (!this.microphoneReady) {
                        this.microphoneReady = true;
                        console.log('Voice: 麦克风已准备就绪，开始接收音频');
                        this.handleMicrophoneReady();
                    }
                },
                onSpeechStart: () => {
                    console.log('Voice: 检测到语音开始');
                    this.handleSpeechStart();
                },
                onSpeechEnd: (audio) => {
                    console.log('Voice: 检测到语音结束');
                    this.handleSpeechEnd(audio);
                },
                onVADMisfire: () => {
                    console.log('Voice: VAD误触发');
                    this.updateStatus('请重新开始说话', 'info');
                },
                // VAD配置参数
                mode: 'v5',
                positiveSpeechThreshold: 0.5,  // 语音检测阈值
                negativeSpeechThreshold: 0.35, // 静音检测阈值
                minSpeechFrames: 16,            // 最小语音帧数
                preSpeechPadFrames: 16,         // 语音前填充帧数
                redemptionFrames: 32,           // 救赎帧数（避免误判）
                frameSamples: 512,            // 每帧样本数
                submitUserSpeechOnPause: false // 暂停时不提交音频
            });

            console.log('Voice: VAD初始化成功');
            this.vadInitialized = true;
            this.isPaused = false;
            return true;

        } catch (error) {
            console.error('Voice: VAD初始化失败:', error);
            throw new Error(`语音检测初始化失败: ${error.message}`);
        }
    }

    /**
     * 开始智能录音
     */
    async startSmartRecording() {
        try {
            if (this.isRecording) {
                console.warn('Voice: 已在录音中');
                return;
            }

            this.updateStatus('正在启动...', 'processing');
            
            // 如果VAD已初始化且只是暂停状态，直接恢复
            if (this.vadInitialized && this.isPaused && this.vadInstance) {
                console.log('Voice: 恢复VAD录音（避免1.0~1.7秒音频丢失）');
                this.vadInstance.start();
                this.isPaused = false;
            } else {
                // 首次初始化或VAD实例丢失，重新初始化
                console.log('Voice: 首次初始化VAD');
                if (!this.vadInstance) {
                    await this.initialize();
                }
                // 初始化后必须调用start()开始监听
                this.vadInstance.start();
                this.isPaused = false;
            }

            // 重置录音状态（但保持VAD实例）
            this.microphoneReady = false;
            this.hasNotifiedMicReady = false;
            this.audioChunks = [];
            this.isRecording = true;
            
            console.log('Voice: 智能录音已启动，等待麦克风准备就绪...');

        } catch (error) {
            console.error('Voice: 启动录音失败:', error);
            this.updateStatus('录音启动失败: ' + error.message, 'error');
            throw error;
        }
    }



    /**
     * 处理麦克风准备就绪事件
     */
    handleMicrophoneReady() {
        // 只在第一次检测到麦克风准备好时通知用户
        if (!this.hasNotifiedMicReady) {
            this.hasNotifiedMicReady = true;
            this.updateStatus('正在录音...', 'recording');
            console.log('Voice: 通知用户可以开始说话');
        }
    }

    /**
     * 处理语音开始事件
     */
    handleSpeechStart() {
        this.updateStatus('正在录音...', 'recording');
        
        if (this.onSpeechStartCallback) {
            this.onSpeechStartCallback();
        }
    }

    /**
     * 处理语音结束事件
     */
    async handleSpeechEnd(vadAudio) {
        try {
            this.updateStatus('语音录制完成', 'processing');
            
            // 将VAD提供的Float32Array转换为Blob
            const audioBlob = this.float32ArrayToBlob(vadAudio);
            
            this.isRecording = false;
            
            // 重置麦克风状态
            this.microphoneReady = false;
            this.hasNotifiedMicReady = false;
            
            // 暂停VAD而不是销毁，保持麦克风权限和音频上下文
            if (this.vadInstance) {
                this.vadInstance.pause();
                this.isPaused = true;
                console.log('Voice: VAD已暂停（保持音频上下文，避免1.0~1.7秒丢失）');
            }

            console.log('Voice: 语音录制完成，音频长度:', vadAudio.length, '样本');
            
            if (this.onSpeechEndCallback) {
                this.onSpeechEndCallback(audioBlob);
            }

            return audioBlob;

        } catch (error) {
            console.error('Voice: 处理语音结束失败:', error);
            this.updateStatus('处理录音失败: ' + error.message, 'error');
            
            // 出错时也暂停而不是销毁
            if (this.vadInstance) {
                try {
                    this.vadInstance.pause();
                    this.isPaused = true;
                } catch (pauseError) {
                    console.error('Voice: 暂停VAD失败，尝试销毁:', pauseError);
                    this.vadInstance.destroy();
                    this.vadInstance = null;
                    this.vadInitialized = false;
                }
            }
            this.microphoneReady = false;
            this.hasNotifiedMicReady = false;
            
            throw error;
        }
    }



    /**
     * 将Float32Array转换为音频Blob
     */
    float32ArrayToBlob(float32Array) {
        // 转换为16位PCM
        const buffer = new ArrayBuffer(float32Array.length * 2);
        const view = new DataView(buffer);
        
        for (let i = 0; i < float32Array.length; i++) {
            // 将Float32转换为16位整数
            const sample = Math.max(-1, Math.min(1, float32Array[i]));
            view.setInt16(i * 2, sample * 0x7FFF, true);
        }

        // 创建WAV头
        const wavHeader = this.createWavHeader(float32Array.length);
        const wavBuffer = new ArrayBuffer(wavHeader.length + buffer.byteLength);
        const wavView = new Uint8Array(wavBuffer);
        
        wavView.set(wavHeader, 0);
        wavView.set(new Uint8Array(buffer), wavHeader.length);

        return new Blob([wavBuffer], { type: 'audio/wav' });
    }

    /**
     * 创建WAV文件头
     */
    createWavHeader(sampleCount) {
        const sampleRate = 16000;
        const channels = 1;
        const bitsPerSample = 16;
        const byteRate = sampleRate * channels * bitsPerSample / 8;
        const blockAlign = channels * bitsPerSample / 8;
        const dataSize = sampleCount * 2;

        const header = new ArrayBuffer(44);
        const view = new DataView(header);

        // RIFF chunk descriptor
        view.setUint32(0, 0x52494646, false); // "RIFF"
        view.setUint32(4, 36 + dataSize, true); // File size - 8
        view.setUint32(8, 0x57415645, false); // "WAVE"

        // fmt sub-chunk
        view.setUint32(12, 0x666d7420, false); // "fmt "
        view.setUint32(16, 16, true); // Sub-chunk size
        view.setUint16(20, 1, true); // Audio format (PCM)
        view.setUint16(22, channels, true); // Number of channels
        view.setUint32(24, sampleRate, true); // Sample rate
        view.setUint32(28, byteRate, true); // Byte rate
        view.setUint16(32, blockAlign, true); // Block align
        view.setUint16(34, bitsPerSample, true); // Bits per sample

        // data sub-chunk
        view.setUint32(36, 0x64617461, false); // "data"
        view.setUint32(40, dataSize, true); // Data size

        return new Uint8Array(header);
    }

    /**
     * 设置回调函数
     */
    setCallbacks(callbacks) {
        this.onSpeechStartCallback = callbacks.onSpeechStart;
        this.onSpeechEndCallback = callbacks.onSpeechEnd;
        this.onStatusUpdateCallback = callbacks.onStatusUpdate;
    }

    /**
     * 更新状态显示
     */
    updateStatus(message, type = 'info') {
        console.log(`Voice Status [${type}]:`, message);
        if (this.onStatusUpdateCallback) {
            this.onStatusUpdateCallback(message, type);
        }
    }

    /**
     * 完全销毁VAD实例（用于页面卸载或真正需要释放麦克风时）
     */
    forceDestroy() {
        if (this.vadInstance) {
            this.vadInstance.destroy();
            this.vadInstance = null;
            console.log('Voice: VAD实例已强制销毁，麦克风权限已释放');
        }
        
        // 重置所有状态
        this.isRecording = false;
        this.microphoneReady = false;
        this.hasNotifiedMicReady = false;
        this.vadInitialized = false;
        this.isPaused = false;
        this.audioChunks = [];
        console.log('Voice: 所有资源已强制清理');
    }

    /**
     * 清理资源（向后兼容）
     */
    destroy() {
        if (this.vadInstance) {
            this.vadInstance.destroy();
            this.vadInstance = null;
            console.log('Voice: VAD实例已销毁');
        }
        
        // 重置所有状态
        this.isRecording = false;
        this.microphoneReady = false;
        this.hasNotifiedMicReady = false;
        this.vadInitialized = false;
        this.isPaused = false;
        this.audioChunks = [];
        console.log('Voice: 资源已清理，麦克风权限已释放');
    }

    /**
     * 检查是否正在录音
     */
    get recording() {
        return this.isRecording;
    }
}

// 导出到全局
window.SmartVoiceRecorder = SmartVoiceRecorder; 