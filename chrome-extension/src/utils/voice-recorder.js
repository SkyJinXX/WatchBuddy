/**
 * Smart Voice Recorder - Uses VAD to automatically detect speech start and end
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
        this.microphoneReady = false; // Whether microphone is ready
        this.hasNotifiedMicReady = false; // Whether user has been notified microphone is ready
        this.vadInitialized = false; // Whether VAD is initialized
        this.isPaused = false; // Whether VAD is paused
    }

    /**
     * Initialize VAD and recorder
     */
    async initialize() {
        try {
            // Check if VAD library is available
            if (typeof vad === 'undefined' || !vad.MicVAD) {
                throw new Error('VAD library not loaded, please check network connection');
            }

            // Initialize VAD
            this.vadInstance = await vad.MicVAD.new({
                onFrameProcessed: (probabilities, frame) => {
                    // When the first audio frame is processed, it means the microphone has truly started working
                    if (!this.microphoneReady) {
                        this.microphoneReady = true;
                        Logger.log('Voice: Microphone ready, starting to receive audio');
                        this.handleMicrophoneReady();
                    }
                },
                onSpeechStart: () => {
                    Logger.log('Voice: Speech start detected');
                    this.handleSpeechStart();
                },
                onSpeechEnd: (audio) => {
                    Logger.log('Voice: Speech end detected');
                    this.handleSpeechEnd(audio);
                },
                onVADMisfire: () => {
                    Logger.log('Voice: VAD misfire');
                    this.updateStatus('Please start speaking again', 'info');
                },
                // VAD configuration parameters
                mode: 'v5',
                positiveSpeechThreshold: 0.5,  // Speech detection threshold
                negativeSpeechThreshold: 0.35, // Silence detection threshold
                minSpeechFrames: 16,            // Minimum speech frames
                preSpeechPadFrames: 16,         // Pre-speech padding frames
                redemptionFrames: 40,           // Redemption frames (avoid false positives)
                frameSamples: 512,            // Samples per frame
                submitUserSpeechOnPause: false // Do not submit audio when paused
            });

            Logger.log('Voice: VAD initialized successfully');
            this.vadInitialized = true;
            this.isPaused = false;
            return true;

        } catch (error) {
            Logger.error('Voice: VAD initialization failed:', error);
            throw new Error(`Voice detection initialization failed: ${error.message}`);
        }
    }

    /**
     * Start smart recording
     */
    async startSmartRecording() {
        try {
            if (this.isRecording) {
                Logger.warn('Voice: Already recording');
                return;
            }

            this.updateStatus('Starting...', 'processing');
            
            // Check enhanced voice mode setting
            const enhancedMode = await this.getEnhancedVoiceMode();
            
            // Enhanced mode: If VAD is initialized and only paused, resume directly
            if (enhancedMode && this.vadInitialized && this.isPaused && this.vadInstance) {
                Logger.log('Voice: Resuming VAD recording (enhanced mode, avoids 1.0~1.7s audio loss)');
                this.vadInstance.start();
                this.isPaused = false;
            } else {
                // Standard mode or first initialization: Re-initialize VAD
                if (this.vadInstance && !enhancedMode) {
                    // In standard mode, if there's an old instance, destroy it first
                    this.vadInstance.destroy();
                    this.vadInstance = null;
                    this.vadInitialized = false;
                }
                
                if (!this.vadInstance) {
                    Logger.log(`Voice: Initializing VAD (${enhancedMode ? 'enhanced' : 'standard'} mode)`);
                    await this.initialize();
                }
                // After initialization, must call start() to begin listening
                this.vadInstance.start();
                this.isPaused = false;
            }

            // Reset recording status (but keep VAD instance)
            this.microphoneReady = false;
            this.hasNotifiedMicReady = false;
            this.audioChunks = [];
            this.isRecording = true;
            
            Logger.log('Voice: Smart recording started, waiting for microphone to be ready...');

        } catch (error) {
            Logger.error('Voice: Failed to start recording:', error);
            this.updateStatus('Recording startup failed: ' + error.message, 'error');
            throw error;
        }
    }



    /**
     * Handle microphone ready event
     */
    handleMicrophoneReady() {
        // Only notify user the first time microphone is detected ready
        if (!this.hasNotifiedMicReady) {
            this.hasNotifiedMicReady = true;
            this.updateStatus('Recording...', 'recording');
            Logger.log('Voice: Notifying user to start speaking');
        }
    }

    /**
     * Handle speech start event
     */
    handleSpeechStart() {
        this.updateStatus('Recording...', 'recording');
        
        if (this.onSpeechStartCallback) {
            this.onSpeechStartCallback();
        }
    }

    /**
     * Handle speech end event
     */
    async handleSpeechEnd(vadAudio) {
        try {
            this.updateStatus('Speech recording complete', 'processing');
            
            // Convert Float32Array provided by VAD to Blob
            const audioBlob = this.float32ArrayToBlob(vadAudio);
            
            this.isRecording = false;
            
            // Reset microphone status
            this.microphoneReady = false;
            this.hasNotifiedMicReady = false;
            
            // Check enhanced voice mode setting
            const enhancedMode = await this.getEnhancedVoiceMode();
            
            if (enhancedMode && this.vadInstance) {
                // Enhanced mode: Pause VAD instead of destroying
                this.vadInstance.pause();
                this.isPaused = true;
                Logger.log('Voice: VAD paused (enhanced mode, retains audio context)');
            } else if (this.vadInstance) {
                // Standard mode: Destroy VAD to release microphone
                this.vadInstance.destroy();
                this.vadInstance = null;
                this.vadInitialized = false;
                this.isPaused = false;
                Logger.log('Voice: VAD destroyed (standard mode, releases microphone permission)');
            }

            Logger.log('Voice: Speech recording complete, audio length:', vadAudio.length, 'samples');
            
            if (this.onSpeechEndCallback) {
                this.onSpeechEndCallback(audioBlob);
            }

            return audioBlob;

        } catch (error) {
            Logger.error('Voice: Failed to process speech end:', error);
            this.updateStatus('Failed to process recording: ' + error.message, 'error');
            
            // Handle based on mode when error occurs
            if (this.vadInstance) {
                try {
                    const enhancedMode = await this.getEnhancedVoiceMode();
                    if (enhancedMode) {
                        this.vadInstance.pause();
                        this.isPaused = true;
                        Logger.log('Voice: Paused VAD on error (enhanced mode)');
                    } else {
                        this.vadInstance.destroy();
                        this.vadInstance = null;
                        this.vadInitialized = false;
                        this.isPaused = false;
                        Logger.log('Voice: Destroyed VAD on error (standard mode)');
                    }
                } catch (modeError) {
                    Logger.error('Voice: Failed to handle VAD mode on error, forcing destroy:', modeError);
                    this.vadInstance.destroy();
                    this.vadInstance = null;
                    this.vadInitialized = false;
                    this.isPaused = false;
                }
            }
            this.microphoneReady = false;
            this.hasNotifiedMicReady = false;
            
            throw error;
        }
    }



    /**
     * Convert Float32Array to audio Blob
     */
    float32ArrayToBlob(float32Array) {
        // Convert to 16-bit PCM
        const buffer = new ArrayBuffer(float32Array.length * 2);
        const view = new DataView(buffer);
        
        for (let i = 0; i < float32Array.length; i++) {
            // Convert Float32 to 16-bit integer
            const sample = Math.max(-1, Math.min(1, float32Array[i]));
            view.setInt16(i * 2, sample * 0x7FFF, true);
        }

        // Create WAV header
        const wavHeader = this.createWavHeader(float32Array.length);
        const wavBuffer = new ArrayBuffer(wavHeader.length + buffer.byteLength);
        const wavView = new Uint8Array(wavBuffer);
        
        wavView.set(wavHeader, 0);
        wavView.set(new Uint8Array(buffer), wavHeader.length);

        return new Blob([wavBuffer], { type: 'audio/wav' });
    }

    /**
     * Create WAV file header
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
     * Get enhanced voice mode setting
     */
    async getEnhancedVoiceMode() {
        try {
            // Check if chrome extension context is valid
            if (!chrome || !chrome.storage) {
                Logger.warn('Voice: Chrome extension context unavailable, using standard mode');
                return false;
            }
            
            const result = await chrome.storage.sync.get(['enhanced_voice_mode']);
            return result.enhanced_voice_mode || false; // Default off
        } catch (error) {
            // Extension context invalidated or other error
            if (error.message.includes('Extension context invalidated')) {
                Logger.warn('Voice: Extension context invalidated, using standard mode');
            } else {
                Logger.error('Voice: Failed to get enhanced voice mode setting:', error);
            }
            return false; // Use standard mode on error
        }
    }

    /**
     * Set callback functions
     */
    setCallbacks(callbacks) {
        this.onSpeechStartCallback = callbacks.onSpeechStart;
        this.onSpeechEndCallback = callbacks.onSpeechEnd;
        this.onStatusUpdateCallback = callbacks.onStatusUpdate;
    }

    /**
     * Update status display
     */
    updateStatus(message, type = 'info') {
        Logger.log(`Voice Status [${type}]:`, message);
        if (this.onStatusUpdateCallback) {
            this.onStatusUpdateCallback(message, type);
        }
    }

    /**
     * Fully destroy VAD instance (for page unload or when microphone truly needs to be released)
     */
    forceDestroy() {
        if (this.vadInstance) {
            this.vadInstance.destroy();
            this.vadInstance = null;
            Logger.log('Voice: VAD instance forced destroyed, microphone permission released');
        }
        
        // Reset all states
        this.isRecording = false;
        this.microphoneReady = false;
        this.hasNotifiedMicReady = false;
        this.vadInitialized = false;
        this.isPaused = false;
        this.audioChunks = [];
        Logger.log('Voice: All resources forcefully cleaned up');
    }

    /**
     * Clean up resources (backward compatible)
     */
    destroy() {
        if (this.vadInstance) {
            this.vadInstance.destroy();
            this.vadInstance = null;
            Logger.log('Voice: VAD instance destroyed');
        }
        
        // Reset all states
        this.isRecording = false;
        this.microphoneReady = false;
        this.hasNotifiedMicReady = false;
        this.vadInitialized = false;
        this.isPaused = false;
        this.audioChunks = [];
        Logger.log('Voice: Resources cleaned up, microphone permission released');
    }

    /**
     * Check if currently recording
     */
    get recording() {
        return this.isRecording;
    }
}

// Export to global
window.SmartVoiceRecorder = SmartVoiceRecorder; 