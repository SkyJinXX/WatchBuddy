/**
 * YouTube语音助手 - Content Script
 * 在YouTube视频页面注入语音助手功能
 */

class YouTubeVoiceAssistant {
    constructor() {
        this.subtitleExtractor = new SubtitleExtractor();
        this.aiAssistant = null;
        this.currentVideoId = null;
        this.subtitlesData = null;
        this.isProcessing = false;
        this.floatingButton = null;
        this.statusDisplay = null;
        
        this.init();
    }

    async init() {
        // 等待页面加载完成
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }

        // 监听页面导航
        this.observeNavigation();
        
        // 监听来自background的消息
        this.setupMessageListener();
    }

    /**
     * 设置消息监听器
     */
    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            switch (request.action) {
                case 'reload_assistant':
                    this.reloadAssistant();
                    break;
                case 'activate_voice_assistant':
                    this.handleVoiceQuery();
                    break;
                case 'api_key_updated':
                    this.reloadAssistant();
                    break;
                case 'page_ready':
                    this.setup();
                    break;
            }
        });
    }

    /**
     * 重新加载助手
     */
    async reloadAssistant() {
        this.cleanup();
        await this.setup();
    }

    async setup() {
        // 检查是否是视频页面
        if (!this.isVideoPage()) {
            return;
        }

        // 获取API密钥
        const apiKey = await this.getApiKey();
        if (!apiKey) {
            console.warn('YouTube Voice Assistant: 未配置OpenAI API密钥');
            return;
        }

        this.aiAssistant = new OpenAIVoiceAssistant(apiKey);

        // 创建浮动按钮
        this.createFloatingButton();

        // 监听视频变化
        this.observeVideoChanges();

        // 预加载字幕
        this.preloadSubtitles();
    }

    isVideoPage() {
        return window.location.pathname === '/watch' && window.location.search.includes('v=');
    }

    async getApiKey() {
        return new Promise((resolve) => {
            chrome.storage.sync.get(['openai_api_key'], (result) => {
                resolve(result.openai_api_key);
            });
        });
    }

    createFloatingButton() {
        // 移除已存在的按钮
        if (this.floatingButton) {
            this.floatingButton.remove();
        }

        // 创建浮动容器
        const container = document.createElement('div');
        container.className = 'yva-floating-container';
        container.innerHTML = `
            <div class="yva-status-display" id="yva-status" style="display: none;">
                <span class="yva-status-text">准备就绪</span>
            </div>
            <button class="yva-floating-button" id="yva-voice-btn" title="语音助手 (点击提问)">
                <svg class="yva-mic-icon" viewBox="0 0 24 24">
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                </svg>
                <div class="yva-loading-spinner" style="display: none;">
                    <div class="yva-spinner"></div>
                </div>
            </button>
        `;

        // 添加到页面
        document.body.appendChild(container);
        
        this.floatingButton = container.querySelector('#yva-voice-btn');
        this.statusDisplay = container.querySelector('#yva-status');
        
        // 绑定点击事件
        this.floatingButton.addEventListener('click', () => this.handleVoiceQuery());
        
        // 悬停事件
        this.floatingButton.addEventListener('mouseenter', () => this.showStatus());
        this.floatingButton.addEventListener('mouseleave', () => this.hideStatus());
    }

    showStatus() {
        if (this.statusDisplay) {
            this.statusDisplay.style.display = 'block';
        }
    }

    hideStatus() {
        if (this.statusDisplay && !this.isProcessing) {
            this.statusDisplay.style.display = 'none';
        }
    }

    updateStatus(message, type = 'info') {
        if (!this.statusDisplay) return;

        const statusText = this.statusDisplay.querySelector('.yva-status-text');
        const micIcon = this.floatingButton.querySelector('.yva-mic-icon');
        const spinner = this.floatingButton.querySelector('.yva-loading-spinner');

        statusText.textContent = message;
        this.statusDisplay.className = `yva-status-display ${type}`;
        this.statusDisplay.style.display = 'block';

        // 更新按钮状态
        if (type === 'processing' || type === 'recording') {
            micIcon.style.display = 'none';
            spinner.style.display = 'block';
            this.floatingButton.disabled = true;
        } else {
            micIcon.style.display = 'block';
            spinner.style.display = 'none';
            this.floatingButton.disabled = false;
        }

        // 自动隐藏成功状态
        if (type === 'success') {
            setTimeout(() => {
                this.hideStatus();
            }, 2000);
        }
    }

    async handleVoiceQuery() {
        if (this.isProcessing) {
            return;
        }

        try {
            this.isProcessing = true;

            // 获取当前视频上下文
            const context = await this.getVideoContext();
            
            if (!context) {
                this.updateStatus('无法获取视频信息', 'error');
                return;
            }

            // 开始语音处理（AI助手会自动管理多视频对话历史）
            const result = await this.aiAssistant.processVoiceQuerySmart(
                context, 
                (message, type) => this.updateStatus(message, type)
            );

            // 更新使用统计
            this.updateUsageStats();

            console.log('对话完成:', result);

        } catch (error) {
            console.error('语音查询失败:', error);
            this.updateStatus('处理失败: ' + error.message, 'error');
            
            // 发送错误日志到background
            chrome.runtime.sendMessage({
                action: 'log_error',
                error: error.message,
                context: 'voice_query'
            });
        } finally {
            this.isProcessing = false;
            setTimeout(() => {
                if (!this.isProcessing) {
                    this.hideStatus();
                }
            }, 3000);
        }
    }

    /**
     * 更新使用统计
     */
    updateUsageStats() {
        chrome.runtime.sendMessage({
            action: 'update_usage_stats'
        });
    }

    /**
     * 获取视频上下文信息
     */
    async getVideoContext() {
        const videoId = this.getCurrentVideoId();
        const videoTitle = this.getVideoTitle();
        const currentTime = this.getCurrentTime();
        const relevantSubtitles = this.getCurrentSubtitleContext(currentTime);
        const fullTranscript = this.getFullVideoTranscript();
        
        return {
            videoId: videoId,
            videoTitle: videoTitle,
            currentTime: currentTime,
            relevantSubtitles: relevantSubtitles,
            fullTranscript: fullTranscript // 发送完整转录，不截断
        };
    }

    getCurrentVideoId() {
        const urlParams = new URLSearchParams(window.location.search);
        const videoId = urlParams.get('v');
        console.log('Content: getCurrentVideoId extracted:', videoId, 'from URL:', window.location.href);
        return videoId;
    }

    getVideoTitle() {
        const titleElement = document.querySelector('h1.ytd-watch-metadata yt-formatted-string');
        return titleElement ? titleElement.textContent.trim() : 'Unknown Video';
    }

    getCurrentTime() {
        const video = document.querySelector('video');
        return video ? video.currentTime : 0;
    }

    async preloadSubtitles() {
        const videoId = this.getCurrentVideoId();
        if (videoId && videoId !== this.currentVideoId) {
            try {
                console.log('Content: Preloading subtitles for video:', videoId);
                const result = await this.loadSubtitles(videoId);
                this.currentVideoId = videoId;
                console.log('Content: Subtitles preloaded successfully');
            } catch (error) {
                console.warn('预加载字幕失败:', error);
            }
        }
    }

    /**
     * 加载字幕
     */
    async loadSubtitles(videoId) {
        console.log('Content: loadSubtitles called with videoId:', videoId);
        console.log('Content: current URL:', window.location.href);
        
        try {
            const extractor = new SubtitleExtractor();
            
            // 获取英文字幕内容
            const result = await extractor.getFirstEnglishSubtitle(videoId);
            
            // 解析字幕内容为完整文本
            const fullTranscript = extractor.getFullTranscriptFromContent(result.content);
            console.log(`Content: 字幕解析完成，总文本长度: ${fullTranscript.length} 字符`);
            console.log(`Content: 字幕文本预览: ${fullTranscript.substring(0, 500)}...`);
            
            // 解析字幕为时间戳数组
            const subtitleTimestamps = extractor.parseXMLToTimestamps(result.content);
            console.log(`Content: 字幕时间戳解析完成，共 ${subtitleTimestamps.length} 条字幕`);
            
            // 保存字幕数据
            this.subtitles = subtitleTimestamps;
            this.fullTranscript = fullTranscript;
            this.currentSubtitleLanguage = result.subtitle.name;
            
            console.log(`字幕加载成功: ${result.subtitle.name}, ${result.content.length} 字符`);
            console.log(`完整转录文本: ${fullTranscript.length} 字符, ${subtitleTimestamps.length} 条时间戳`);
            console.log(`字幕文本预览: ${fullTranscript}`);
            
            // 通知background script字幕已准备就绪
            chrome.runtime.sendMessage({
                action: 'subtitles_ready',
                videoId: videoId,
                transcript: fullTranscript,
                language: result.subtitle.name,
                timestamps: subtitleTimestamps
            });
            
            return {
                subtitle: result.subtitle,
                content: result.content,
                transcript: fullTranscript,
                timestamps: subtitleTimestamps
            };
            
        } catch (error) {
            console.error('字幕加载失败:', error);
            this.subtitles = null;
            this.fullTranscript = null;
            throw error;
        }
    }

    /**
     * 根据当前视频时间获取相关字幕 - 只获取当前时间点之前的4-5句话
     */
    getCurrentSubtitleContext(currentTime, contextRange = 10) {
        if (!this.subtitles || this.subtitles.length === 0) {
            return '';
        }
        
        // 找到当前时间点最接近的字幕
        let currentIndex = -1;
        for (let i = 0; i < this.subtitles.length; i++) {
            if (this.subtitles[i].start <= currentTime && this.subtitles[i].end >= currentTime) {
                currentIndex = i;
                break;
            }
        }
        
        // 如果没找到正在播放的字幕，找最近的之前的字幕
        if (currentIndex === -1) {
            for (let i = 0; i < this.subtitles.length; i++) {
                if (this.subtitles[i].start > currentTime) {
                    currentIndex = Math.max(0, i - 1);
                    break;
                }
            }
        }
        
        if (currentIndex === -1) {
            currentIndex = this.subtitles.length - 1;
        }
        
        // 只获取当前时间点之前的4-5句（包括当前句）
        const startIndex = Math.max(0, currentIndex - 4);
        const endIndex = currentIndex;
        
        const relevantSubs = this.subtitles.slice(startIndex, endIndex + 1);
        const context = relevantSubs.map(sub => sub.text).join(' ');
        
        console.log(`Content: Found ${relevantSubs.length} relevant subtitles BEFORE time ${currentTime}s (index ${currentIndex})`);
        console.log(`Content: Context: ${context.substring(0, 200)}...`);
        
        return context;
    }

    /**
     * 获取完整视频转录
     */
    getFullVideoTranscript() {
        return this.fullTranscript || '';
    }

    observeNavigation() {
        // 监听页面导航
        let lastUrl = location.href;
        new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                setTimeout(() => {
                    if (this.isVideoPage()) {
                        this.setup();
                    } else {
                        this.cleanup();
                    }
                }, 1000);
            }
        }).observe(document, { subtree: true, childList: true });
    }

    observeVideoChanges() {
        // 监听视频元素变化
        const videoContainer = document.querySelector('#player-container');
        if (videoContainer) {
            new MutationObserver(() => {
                this.preloadSubtitles();
            }).observe(videoContainer, { subtree: true, childList: true });
        }
    }

    cleanup() {
        if (this.floatingButton) {
            this.floatingButton.remove();
            this.floatingButton = null;
        }
        this.subtitlesData = null;
        this.currentVideoId = null;
    }
}

// 初始化语音助手
let voiceAssistant = null;

function initVoiceAssistant() {
    if (!voiceAssistant) {
        voiceAssistant = new YouTubeVoiceAssistant();
    }
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVoiceAssistant);
} else {
    initVoiceAssistant();
}

// 导出到全局
window.YouTubeVoiceAssistant = YouTubeVoiceAssistant; 