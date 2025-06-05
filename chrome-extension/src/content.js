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
        this.floatingContainer = null; // 浮动容器
        this.floatingButton = null;
        this.statusDisplay = null;
        this.manualSubtitle = null; // 手动上传的字幕数据
        this.statusHideTimer = null; // 状态自动隐藏计时器
        this.savePositionTimer = null; // 位置保存防抖计时器
        this.hasTemporaryStatus = false; // 是否有临时状态（会自动隐藏的状态）
        
        // 配置选项
        this.contextSentencesBefore = 4; // 当前时间点之前的句子数量（可配置）
        
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
        
        // 监听来自background和popup的消息
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
                case 'manual_subtitle_uploaded':
                    this.handleManualSubtitleUploaded(request.videoId, request.subtitleData);
                    break;
                case 'manual_subtitle_cleared':
                    this.handleManualSubtitleCleared(request.videoId);
                    break;
            }
        });
    }

    /**
     * 处理手动上传字幕
     */
    async handleManualSubtitleUploaded(videoId, subtitleData) {
        console.log('Content: 接收到手动上传的字幕:', videoId, subtitleData);
        
        const currentVideoId = this.getCurrentVideoId();
        if (currentVideoId === videoId) {
            // 解析字幕内容
            this.manualSubtitle = {
                content: subtitleData.content,
                transcript: this.parseSubtitleToTranscript(subtitleData.content),
                timestamps: this.parseSubtitleToTimestamps(subtitleData.content),
                language: 'Manual Upload'
            };
            
            console.log('Content: 手动字幕解析完成:', this.manualSubtitle);
            this.updateStatus('✅ 手动字幕已加载', 'success');
            
            // 通知background script手动字幕已准备就绪
            chrome.runtime.sendMessage({
                action: 'subtitles_ready',
                videoId: videoId,
                transcript: this.manualSubtitle.transcript,
                language: this.manualSubtitle.language,
                timestamps: this.manualSubtitle.timestamps,
                source: 'manual' // 标记为手动上传
            });
        }
    }

    /**
     * 处理缓存的API字幕
     */
    handleCachedApiSubtitle(videoId, apiSubtitleData) {
        console.log('Content: 加载缓存的API字幕:', videoId, apiSubtitleData);
        
        const currentVideoId = this.getCurrentVideoId();
        if (currentVideoId === videoId) {
            // 恢复字幕数据
            this.subtitles = apiSubtitleData.timestamps;
            this.fullTranscript = apiSubtitleData.transcript;
            this.currentSubtitleLanguage = apiSubtitleData.language;
            
            console.log('Content: 缓存API字幕加载完成:', apiSubtitleData);
            this.updateStatus(`✅ 自动字幕已加载 (${apiSubtitleData.language})`, 'success');
            
            // 通知background script字幕已准备就绪
            chrome.runtime.sendMessage({
                action: 'subtitles_ready',
                videoId: videoId,
                transcript: apiSubtitleData.transcript,
                language: apiSubtitleData.language,
                timestamps: apiSubtitleData.timestamps,
                source: 'api' // 标记为API字幕
            });
        }
    }

    /**
     * 处理字幕清除
     */
    handleManualSubtitleCleared(videoId) {
        console.log('Content: 接收到字幕清除通知:', videoId);
        
        const currentVideoId = this.getCurrentVideoId();
        if (currentVideoId === videoId) {
            // 清除所有字幕数据
            this.manualSubtitle = null;
            this.subtitles = null;
            this.fullTranscript = null;
            this.currentSubtitleLanguage = null;
            
            this.updateStatus('所有字幕已清除', 'info');
            
            // 通知background script字幕已清除
            chrome.runtime.sendMessage({
                action: 'subtitle_status_updated',
                videoId: videoId,
                hasSubtitles: false
            });
        }
    }

    /**
     * 解析字幕为完整文本
     */
    parseSubtitleToTranscript(srtContent) {
        try {
            // 移除序号和时间戳，只保留文本内容
            const lines = srtContent.split('\n');
            let transcript = '';
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                
                // 跳过空行、序号和时间戳
                if (!line || 
                    /^\d+$/.test(line) || 
                    /\d{2}:\d{2}:\d{2},\d{3}\s+-->\s+\d{2}:\d{2}:\d{2},\d{3}/.test(line)) {
                    continue;
                }
                
                transcript += line + ' ';
            }
            
            return transcript.trim();
        } catch (error) {
            console.error('解析字幕文本失败:', error);
            return '';
        }
    }

    /**
     * 解析字幕为时间戳数组
     */
    parseSubtitleToTimestamps(srtContent) {
        try {
            const extractor = new SubtitleExtractor();
            return extractor.parseSRTToTimestamps(srtContent);
        } catch (error) {
            console.error('解析字幕时间戳失败:', error);
            return [];
        }
    }

    /**
     * 重新加载助手
     */
    async reloadAssistant() {
        console.log('重新加载助手');
        this.cleanup();
        // 移除任何残留的浮动容器
        const existingContainers = document.querySelectorAll('.yva-floating-container');
        existingContainers.forEach(container => container.remove());
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

        // 预加载字幕（优先检查手动上传的字幕）
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
        // 移除已存在的容器
        if (this.floatingContainer) {
            this.floatingContainer.remove();
        }

        // 创建浮动容器
        const container = document.createElement('div');
        container.className = 'yva-floating-container';
        container.innerHTML = `
            <div class="yva-status-display" id="yva-status">
                <span class="yva-status-text">准备就绪</span>
            </div>
            <button class="yva-floating-button" id="yva-voice-btn">
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
        
        // 保存容器和子元素的引用
        this.floatingContainer = container;
        this.floatingButton = container.querySelector('#yva-voice-btn');
        this.statusDisplay = container.querySelector('#yva-status');
        
        // 绑定拖动和点击事件
        this.setupDragAndClick();
        
        // 悬停事件
        this.floatingButton.addEventListener('mouseenter', () => this.showStatus());
        this.floatingButton.addEventListener('mouseleave', () => this.hideStatus());
        
        // 加载保存的位置
        this.loadPosition();
    }

    setupDragAndClick() {
        let isDragging = false;
        let dragStarted = false;
        let startX = 0;
        let startY = 0;
        let initialMouseX = 0;
        let initialMouseY = 0;

        const handleMouseDown = (e) => {
            if (this.isProcessing) return;
            
            isDragging = true;
            dragStarted = false;
            initialMouseX = e.clientX;
            initialMouseY = e.clientY;
            
            const rect = this.floatingContainer.getBoundingClientRect();
            startX = rect.left;
            startY = rect.top;
            
            e.preventDefault();
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        };

        const handleMouseMove = (e) => {
            if (!isDragging) return;
            
            const deltaX = e.clientX - initialMouseX;
            const deltaY = e.clientY - initialMouseY;
            
            // 判断是否开始拖动（移动距离超过阈值）
            if (!dragStarted && (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5)) {
                dragStarted = true;
                this.floatingButton.classList.add('dragging');
                this.hideStatus();
            }
            
            if (dragStarted) {
                const newX = startX + deltaX;
                const newY = startY + deltaY;
                
                // 限制在视窗范围内
                const maxX = window.innerWidth - this.floatingContainer.offsetWidth;
                const maxY = window.innerHeight - this.floatingContainer.offsetHeight;
                
                const boundedX = Math.max(0, Math.min(newX, maxX));
                const boundedY = Math.max(0, Math.min(newY, maxY));
                
                this.floatingContainer.style.left = boundedX + 'px';
                this.floatingContainer.style.top = boundedY + 'px';
            }
        };

        const handleMouseUp = (e) => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            
            if (dragStarted) {
                this.floatingButton.classList.remove('dragging');
                // 保存位置到存储
                this.savePosition();
            } else {
                // 如果没有拖动，则处理点击
                this.handleVoiceQuery();
            }
            
            isDragging = false;
            dragStarted = false;
        };

        // 触摸事件支持
        const handleTouchStart = (e) => {
            if (this.isProcessing) return;
            
            const touch = e.touches[0];
            isDragging = true;
            dragStarted = false;
            initialMouseX = touch.clientX;
            initialMouseY = touch.clientY;
            
            const rect = this.floatingContainer.getBoundingClientRect();
            startX = rect.left;
            startY = rect.top;
            
            e.preventDefault();
        };

        const handleTouchMove = (e) => {
            if (!isDragging) return;
            
            const touch = e.touches[0];
            const deltaX = touch.clientX - initialMouseX;
            const deltaY = touch.clientY - initialMouseY;
            
            if (!dragStarted && (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5)) {
                dragStarted = true;
                this.floatingButton.classList.add('dragging');
                this.hideStatus();
            }
            
            if (dragStarted) {
                const newX = startX + deltaX;
                const newY = startY + deltaY;
                
                const maxX = window.innerWidth - this.floatingContainer.offsetWidth;
                const maxY = window.innerHeight - this.floatingContainer.offsetHeight;
                
                const boundedX = Math.max(0, Math.min(newX, maxX));
                const boundedY = Math.max(0, Math.min(newY, maxY));
                
                this.floatingContainer.style.left = boundedX + 'px';
                this.floatingContainer.style.top = boundedY + 'px';
            }
            
            e.preventDefault();
        };

        const handleTouchEnd = (e) => {
            if (dragStarted) {
                this.floatingButton.classList.remove('dragging');
                this.savePosition();
            } else {
                this.handleVoiceQuery();
            }
            
            isDragging = false;
            dragStarted = false;
        };

        // 绑定事件
        this.floatingButton.addEventListener('mousedown', handleMouseDown);
        this.floatingButton.addEventListener('touchstart', handleTouchStart, { passive: false });
        this.floatingButton.addEventListener('touchmove', handleTouchMove, { passive: false });
        this.floatingButton.addEventListener('touchend', handleTouchEnd);
    }

    savePosition() {
        // 防抖保存位置
        if (this.savePositionTimer) {
            clearTimeout(this.savePositionTimer);
        }
        
        this.savePositionTimer = setTimeout(() => {
            const rect = this.floatingContainer.getBoundingClientRect();
            const position = {
                left: rect.left,
                top: rect.top
            };
            
            chrome.storage.local.set({ 'yva_button_position': position });
            console.log('保存按钮位置:', position);
        }, 300); // 300ms防抖
    }

    async loadPosition() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['yva_button_position'], (result) => {
                if (result.yva_button_position) {
                    const pos = result.yva_button_position;
                    // 确保位置在当前视窗范围内
                    const maxX = window.innerWidth - 60; // 按钮宽度
                    const maxY = window.innerHeight - 60; // 按钮高度
                    
                    const boundedX = Math.max(0, Math.min(pos.left, maxX));
                    const boundedY = Math.max(0, Math.min(pos.top, maxY));
                    
                    this.floatingContainer.style.left = boundedX + 'px';
                    this.floatingContainer.style.top = boundedY + 'px';
                    
                    console.log('加载按钮位置:', { left: boundedX, top: boundedY });
                }
                resolve();
            });
        });
    }

    showStatus() {
        if (this.statusDisplay) {
            // 如果没有临时状态，显示默认的悬浮状态
            if (!this.hasTemporaryStatus) {
                this.showHoverStatus();
            }
            this.statusDisplay.classList.add('visible');
        }
    }

    hideStatus() {
        if (this.statusDisplay) {
            this.statusDisplay.classList.remove('visible');
        }
    }

    /**
     * 显示悬浮状态（当前功能状态）
     */
    showHoverStatus() {
        if (!this.statusDisplay) return;

        const statusText = this.statusDisplay.querySelector('.yva-status-text');
        
        // 根据当前状态显示不同的提示
        let message = '点击开始语音对话';
        let type = 'info';

        // 检查是否有字幕
        const hasSubtitles = this.manualSubtitle || (this.subtitles && this.fullTranscript);
        if (!hasSubtitles) {
            message = '需要字幕数据';
            type = 'error';
        } else if (this.isProcessing) {
            message = '处理中...';
            type = 'processing';
        }

        statusText.textContent = message;
        this.statusDisplay.className = `yva-status-display ${type}`;
        this.hasTemporaryStatus = false; // 标记为非临时状态
    }

    updateStatus(message, type = 'info') {
        if (!this.statusDisplay) return;

        const statusText = this.statusDisplay.querySelector('.yva-status-text');
        const micIcon = this.floatingButton.querySelector('.yva-mic-icon');
        const spinner = this.floatingButton.querySelector('.yva-loading-spinner');

        statusText.textContent = message;
        this.statusDisplay.className = `yva-status-display ${type} visible`;

        // 标记为临时状态（会自动隐藏的状态）
        this.hasTemporaryStatus = (type === 'processing' || type === 'recording' || type === 'success' || type === 'error');

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

        // 清除之前的自动隐藏计时器
        if (this.statusHideTimer) {
            clearTimeout(this.statusHideTimer);
        }

        // 自动隐藏临时状态
        if (this.hasTemporaryStatus) {
            this.statusHideTimer = setTimeout(() => {
                this.hasTemporaryStatus = false; // 清除临时状态标记
                this.hideStatus();
            }, type === 'success' ? 2000 : (type === 'error' ? 4000 : 3000));
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

            // 检查是否有可用字幕
            if (!context.fullTranscript) {
                this.updateStatus('无字幕数据，请手动上传', 'error');
                return;
            }

            // 开始语音处理（AI助手会自动管理多视频对话历史）
            const result = await this.aiAssistant.processVoiceQuerySmart(
                context, 
                (message, type) => this.updateStatus(message, type)
            );

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
            // 延迟一段时间后清除临时状态，让用户能看到结果
            setTimeout(() => {
                this.hasTemporaryStatus = false;
                this.hideStatus();
            }, 3000);
        }
    }

    /**
     * 获取视频上下文信息
     */
    async getVideoContext() {
        const videoId = this.getCurrentVideoId();
        const videoTitle = this.getVideoTitle();
        const currentTime = this.getCurrentTime();
        
        // 优先使用手动上传的字幕，如果没有则使用API获取的字幕
        let fullTranscript = '';
        let relevantSubtitles = '';
        
        if (this.manualSubtitle) {
            // 使用手动上传的字幕
            fullTranscript = this.manualSubtitle.transcript;
            relevantSubtitles = this.getCurrentSubtitleContextFromTimestamps(
                this.manualSubtitle.timestamps, 
                currentTime
            );
            console.log('Content: 使用手动上传的字幕');
        } else if (this.subtitles && this.fullTranscript) {
            // 使用API获取的字幕
            fullTranscript = this.fullTranscript;
            relevantSubtitles = this.getCurrentSubtitleContext(currentTime);
            console.log('Content: 使用API获取的字幕');
        } else {
            console.log('Content: 无可用字幕，尝试加载...');
            // 尝试加载字幕
            await this.preloadSubtitles();
            
            if (this.manualSubtitle) {
                fullTranscript = this.manualSubtitle.transcript;
                relevantSubtitles = this.getCurrentSubtitleContextFromTimestamps(
                    this.manualSubtitle.timestamps, 
                    currentTime
                );
            } else if (this.subtitles && this.fullTranscript) {
                fullTranscript = this.fullTranscript;
                relevantSubtitles = this.getCurrentSubtitleContext(currentTime);
            }
        }

        return {
            videoId: videoId,
            videoTitle: videoTitle,
            currentTime: currentTime,
            relevantSubtitles: relevantSubtitles,
            fullTranscript: fullTranscript
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
                
                // 优先级: 手动字幕 > 缓存的API字幕 > 实时获取API字幕
                const [manualResult, apiResult] = await Promise.all([
                    chrome.storage.local.get([`manual_subtitle_${videoId}`]),
                    chrome.storage.local.get([`api_subtitle_${videoId}`])
                ]);
                
                const manualSubtitleData = manualResult[`manual_subtitle_${videoId}`];
                const apiSubtitleData = apiResult[`api_subtitle_${videoId}`];
                
                if (manualSubtitleData) {
                    console.log('Content: 找到手动上传的字幕');
                    this.handleManualSubtitleUploaded(videoId, manualSubtitleData);
                } else if (apiSubtitleData) {
                    console.log('Content: 找到缓存的API字幕');
                    this.handleCachedApiSubtitle(videoId, apiSubtitleData);
                } else {
                    // 尝试使用API获取字幕
                    try {
                        const result = await this.loadSubtitles(videoId);
                        console.log('Content: API字幕加载成功');
                        this.updateStatus(`✅ 自动字幕已加载 (${result.subtitle.name})`, 'success');
                    } catch (error) {
                        console.warn('Content: API字幕加载失败，需要手动上传字幕:', error);
                        this.updateStatus('字幕获取失败，请手动上传', 'error');
                    }
                }
                
                this.currentVideoId = videoId;
            } catch (error) {
                console.warn('预加载字幕失败:', error);
            }
        }
    }

    /**
     * 加载字幕（API方式）
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
            
            // 解析字幕为时间戳数组
            const subtitleTimestamps = extractor.parseXMLToTimestamps(result.content);
            console.log(`Content: 字幕时间戳解析完成，共 ${subtitleTimestamps.length} 条字幕`);

            // 保存字幕数据
            this.subtitles = subtitleTimestamps;
            this.fullTranscript = fullTranscript;
            this.currentSubtitleLanguage = result.subtitle.name;
            
            console.log(`字幕加载成功: ${result.subtitle.name}, ${result.content.length} 字符`);

            // 缓存API字幕到本地存储
            const apiSubtitleData = {
                videoId: videoId,
                content: result.content,
                transcript: fullTranscript,
                timestamps: subtitleTimestamps,
                language: result.subtitle.name,
                source: 'api',
                timestamp: Date.now()
            };

            chrome.storage.local.set({
                [`api_subtitle_${videoId}`]: apiSubtitleData
            });

            console.log(`API字幕已缓存到本地存储: ${videoId}`);

            // 通知background script字幕已准备就绪
            chrome.runtime.sendMessage({
                action: 'subtitles_ready',
                videoId: videoId,
                transcript: fullTranscript,
                language: result.subtitle.name,
                timestamps: subtitleTimestamps,
                source: 'api' // 标记字幕来源
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
     * 从时间戳数组获取相关字幕上下文
     */
    getCurrentSubtitleContextFromTimestamps(timestamps, currentTime, contextRange = 10) {
        if (!timestamps || timestamps.length === 0) {
            return '';
        }
        
        // 找到当前时间点最接近的字幕
        let currentIndex = -1;
        for (let i = 0; i < timestamps.length; i++) {
            if (timestamps[i].start <= currentTime && timestamps[i].end >= currentTime) {
                currentIndex = i;
                break;
            }
        }
        
        // 如果没找到正在播放的字幕，找最近的之前的字幕
        if (currentIndex === -1) {
            for (let i = 0; i < timestamps.length; i++) {
                if (timestamps[i].start > currentTime) {
                    currentIndex = Math.max(0, i - 1);
                    break;
                }
            }
        }
        
        if (currentIndex === -1) {
            currentIndex = timestamps.length - 1;
        }
        
        // 只获取当前时间点之前的N句（包括当前句）
        const startIndex = Math.max(0, currentIndex - (this.contextSentencesBefore || 5));
        const endIndex = currentIndex;
        
        const relevantSubs = timestamps.slice(startIndex, endIndex + 1);
        const context = relevantSubs.map(sub => sub.text).join(' ');
        
        console.log(`Content: Found ${relevantSubs.length} relevant subtitles BEFORE time ${currentTime}s (index ${currentIndex})`);
        console.log(`Content: Context: ${context.substring(0, 200)}...`);
        
        return context;
    }

    /**
     * 根据当前视频时间获取相关字幕 - 获取当前时间点之前的N句话（可配置）
     */
    getCurrentSubtitleContext(currentTime, contextRange = 10) {
        if (!this.subtitles || this.subtitles.length === 0) {
            return '';
        }
        
        return this.getCurrentSubtitleContextFromTimestamps(this.subtitles, currentTime, contextRange);
    }

    /**
     * 获取完整视频转录
     */
    getFullVideoTranscript() {
        // 优先返回手动上传的字幕
        if (this.manualSubtitle && this.manualSubtitle.transcript) {
            return this.manualSubtitle.transcript;
        }
        
        // 否则返回API获取的字幕
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
        // 移除整个浮动容器
        if (this.floatingContainer) {
            this.floatingContainer.remove();
            this.floatingContainer = null;
        }
        
        // 清除元素引用
        this.floatingButton = null;
        this.statusDisplay = null;
        
        // 清除状态隐藏计时器
        if (this.statusHideTimer) {
            clearTimeout(this.statusHideTimer);
            this.statusHideTimer = null;
        }
        
        // 清除位置保存计时器
        if (this.savePositionTimer) {
            clearTimeout(this.savePositionTimer);
            this.savePositionTimer = null;
        }
        
        // 重置状态标记
        this.hasTemporaryStatus = false;
        
        this.subtitlesData = null;
        this.manualSubtitle = null;
        this.currentVideoId = null;
    }
}

// 初始化语音助手
let voiceAssistant = null;

function initVoiceAssistant() {
    // 清理已存在的实例
    if (voiceAssistant) {
        voiceAssistant.cleanup();
        voiceAssistant = null;
    }
    
    // 移除任何残留的浮动容器
    const existingContainers = document.querySelectorAll('.yva-floating-container');
    existingContainers.forEach(container => container.remove());
    
    // 创建新实例
    voiceAssistant = new YouTubeVoiceAssistant();
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVoiceAssistant);
} else {
    initVoiceAssistant();
}

// 导出到全局
window.YouTubeVoiceAssistant = YouTubeVoiceAssistant; 