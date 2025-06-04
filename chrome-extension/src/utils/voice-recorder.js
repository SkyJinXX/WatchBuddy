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
                positiveSpeechThreshold: 0.5,  // 语音检测阈值
                negativeSpeechThreshold: 0.35, // 静音检测阈值
                minSpeechFrames: 3,            // 最小语音帧数
                preSpeechPadFrames: 1,         // 语音前填充帧数
                redemptionFrames: 8,           // 救赎帧数（避免误判）
                frameSamples: 1536,            // 每帧样本数
                submitUserSpeechOnPause: false // 暂停时不提交音频
            });

            console.log('Voice: VAD初始化成功');
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

            // 确保VAD已初始化
            if (!this.vadInstance) {
                await this.initialize();
            }

            this.updateStatus('准备录音，请开始说话...', 'recording');
            this.isRecording = true;
            this.audioChunks = [];

            // 启动VAD
            this.vadInstance.start();
            console.log('Voice: 智能录音已启动，等待语音输入...');

        } catch (error) {
            console.error('Voice: 启动录音失败:', error);
            this.updateStatus('录音启动失败: ' + error.message, 'error');
            throw error;
        }
    }

    /**
     * 停止录音
     */
    async stopRecording() {
        try {
            if (!this.isRecording) {
                return null;
            }

            this.isRecording = false;

            // 完全销毁VAD实例，释放麦克风权限
            if (this.vadInstance) {
                this.vadInstance.destroy();
                this.vadInstance = null;
            }

            this.updateStatus('录音已停止', 'info');
            console.log('Voice: 录音已手动停止，麦克风权限已释放');

            return null; // 手动停止返回null

        } catch (error) {
            console.error('Voice: 停止录音失败:', error);
            throw error;
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
            
            // 完全销毁VAD实例，释放麦克风权限
            if (this.vadInstance) {
                this.vadInstance.destroy();
                this.vadInstance = null;
                console.log('Voice: VAD实例已销毁，麦克风权限已释放');
            }

            console.log('Voice: 语音录制完成，音频长度:', vadAudio.length, '样本');
            
            if (this.onSpeechEndCallback) {
                this.onSpeechEndCallback(audioBlob);
            }

            return audioBlob;

        } catch (error) {
            console.error('Voice: 处理语音结束失败:', error);
            this.updateStatus('处理录音失败: ' + error.message, 'error');
            
            // 即使出错也要释放麦克风
            if (this.vadInstance) {
                this.vadInstance.destroy();
                this.vadInstance = null;
            }
            
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
     * 清理资源
     */
    destroy() {
        if (this.vadInstance) {
            this.vadInstance.destroy();
            this.vadInstance = null;
            console.log('Voice: VAD实例已销毁');
        }
        
        this.isRecording = false;
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