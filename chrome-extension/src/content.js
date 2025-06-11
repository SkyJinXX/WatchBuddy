/**
 * YouTube Watching Assistant - Content Script
 * Inject voice assistant functionality on YouTube video pages
 */

class YouTubeVoiceAssistant {
    constructor() {
        this.subtitleExtractor = new SubtitleExtractor();
        this.aiAssistant = null;
        this.currentVideoId = null;
        this.subtitlesData = null;
        this.isProcessing = false;
        this.floatingContainer = null; // Floating container
        this.floatingButton = null;
        this.statusDisplay = null;
        this.manualSubtitle = null; // Manually uploaded subtitle data
        this.statusHideTimer = null; // Status auto-hide timer
        this.savePositionTimer = null; // Position save debounce timer
        
        // 状态显示相关
        this.isInConversation = false; // 是否在对话中
        this.isHovering = false; // 鼠标是否悬停
        
        // Configuration options
        this.contextMaxWords = 28; // Maximum words in subtitle context (configurable)
        
        // Analytics
        this.analytics = new Analytics();
        
        this.init();
    }



    async init() {
        // Wait for page to load
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }

        // Listen for page navigation
        this.observeNavigation();
        
        // Listen for messages from background and popup
        this.setupMessageListener();
    }

    /**
     * Set message listener
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
                case 'analytics_setting_changed':
                    this.analytics.setEnabled(request.enabled);
                    break;
            }
        });
    }

    /**
     * Handle manual subtitle upload
     */
    async handleManualSubtitleUploaded(videoId, subtitleData, fromCache = false) {
        Logger.log('Content: Received manually uploaded subtitles:', videoId, subtitleData);
        
        const currentVideoId = this.getCurrentVideoId();
        if (currentVideoId === videoId) {
            // Parse subtitle content
            this.manualSubtitle = {
                content: subtitleData.content,
                transcript: this.parseSubtitleToTranscript(subtitleData.content),
                timestamps: this.parseSubtitleToTimestamps(subtitleData.content),
                language: 'Manual Upload'
            };
            
            Logger.log('Content: Manual subtitle parsing complete:', this.manualSubtitle);
            this.updateStatus('✅ Manual subtitles loaded', 'success');
            
            // Track manual subtitle loading
            try {
                this.analytics.trackSubtitleLoad('manual', fromCache);
            } catch (error) {
                Logger.log('Content: Analytics tracking failed:', error.message);
            }
            
            // Notify background script manual subtitles are ready
            chrome.runtime.sendMessage({
                action: 'subtitles_ready',
                videoId: videoId,
                transcript: this.manualSubtitle.transcript,
                language: this.manualSubtitle.language,
                timestamps: this.manualSubtitle.timestamps,
                source: 'manual' // Marked as manual upload
            });
        }
    }

    /**
     * Handle cached API subtitles
     */
    handleCachedApiSubtitle(videoId, apiSubtitleData) {
        Logger.log('Content: Loading cached API subtitles:', videoId, apiSubtitleData);
        
        const currentVideoId = this.getCurrentVideoId();
        if (currentVideoId === videoId) {
            // Restore subtitle data
            this.subtitles = apiSubtitleData.timestamps;
            this.fullTranscript = apiSubtitleData.transcript;
            this.currentSubtitleLanguage = apiSubtitleData.language;
            
            Logger.log('Content: Cached API subtitles loaded:', apiSubtitleData);
            this.updateStatus(`✅ API subtitles loaded (cached)`, 'success');
            
            // Track cached API subtitle loading
            try {
                this.analytics.trackSubtitleLoad('api', true);
            } catch (error) {
                Logger.log('Content: Analytics tracking failed:', error.message);
            }
            
            // Notify background script subtitles are ready
            chrome.runtime.sendMessage({
                action: 'subtitles_ready',
                videoId: videoId,
                transcript: apiSubtitleData.transcript,
                language: apiSubtitleData.language,
                timestamps: apiSubtitleData.timestamps,
                source: 'api' // Marked as API subtitle
            });
        }
    }

    /**
     * Handle subtitle clearing
     */
    handleManualSubtitleCleared(videoId) {
        Logger.log('Content: Received subtitle clear notification:', videoId);
        
        const currentVideoId = this.getCurrentVideoId();
        if (currentVideoId === videoId) {
            // Clear all subtitle data
            this.manualSubtitle = null;
            this.subtitles = null;
            this.fullTranscript = null;
            this.currentSubtitleLanguage = null;
            
            this.updateStatus('All subtitles cleared', 'info');
            
            // Notify background script subtitles cleared
            chrome.runtime.sendMessage({
                action: 'subtitle_status_updated',
                videoId: videoId,
                hasSubtitles: false
            });
        }
    }

    /**
     * Parse subtitles to full text
     */
    parseSubtitleToTranscript(srtContent) {
        try {
            // Remove sequence numbers and timestamps, keep only text content
            const lines = srtContent.split('\n');
            let transcript = '';
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                
                // Skip empty lines, sequence numbers, and timestamps
                if (!line || 
                    /^\d+$/.test(line) || 
                    /\d{2}:\d{2}:\d{2},\d{3}\s+-->\s+\d{2}:\d{2}:\d{2},\d{3}/.test(line)) {
                    continue;
                }
                
                transcript += line + ' ';
            }
            
            return transcript.trim();
        } catch (error) {
            Logger.error('Failed to parse subtitle text:', error);
            return '';
        }
    }

    /**
     * Parse subtitles to timestamp array
     */
    parseSubtitleToTimestamps(srtContent) {
        try {
            const extractor = new SubtitleExtractor();
            return extractor.parseSRTToTimestamps(srtContent);
        } catch (error) {
            Logger.error('Failed to parse subtitle timestamps:', error);
            return [];
        }
    }

    /**
     * Reload assistant
     */
    async reloadAssistant() {
        Logger.log('Reloading assistant');
        this.cleanup();
        // Remove any lingering floating containers
        const existingContainers = document.querySelectorAll('.yva-floating-container');
        existingContainers.forEach(container => container.remove());
        await this.setup();
    }

    async setup() {
        // Check if it is a video page
        if (!this.isVideoPage()) {
            return;
        }

        // Initialize analytics with error handling
        try {
            await this.analytics.init();
            // Track extension installation/usage
            await this.analytics.trackInstall();
        } catch (error) {
            if (error.message.includes('Extension context invalidated')) {
                Logger.log('Content: Extension context invalidated, analytics disabled');
            } else {
                Logger.error('Content: Analytics initialization failed:', error);
            }
        }

        // Get API key
        const apiKey = await this.getApiKey();
        if (!apiKey) {
            Logger.warn('YouTube Watching Assistant: OpenAI API key not configured');
            return;
        }

        this.aiAssistant = new OpenAIVoiceAssistant(apiKey);

        // Create floating button
        this.createFloatingButton();

        // Observe video changes
        this.observeVideoChanges();

        // Preload subtitles (prioritize manually uploaded subtitles)
        this.preloadSubtitles();
    }

    isVideoPage() {
        return window.location.pathname === '/watch' && window.location.search.includes('v=');
    }

    async getApiKey() {
        return new Promise((resolve) => {
            try {
                // 检查扩展上下文是否有效
                if (!chrome || !chrome.runtime || !chrome.runtime.id) {
                    Logger.log('Content: Extension context invalid, cannot get API key');
                    resolve(null);
                    return;
                }

                chrome.storage.sync.get(['openai_api_key'], (result) => {
                    if (chrome.runtime.lastError) {
                        Logger.log('Content: Runtime error getting API key:', chrome.runtime.lastError.message);
                        resolve(null);
                        return;
                    }
                    resolve(result.openai_api_key);
                });
            } catch (error) {
                Logger.error('Content: Error getting API key:', error);
                resolve(null);
            }
        });
    }

    createFloatingButton() {
        // Remove existing container
        if (this.floatingContainer) {
            this.floatingContainer.remove();
        }

        // Create floating container
        const container = document.createElement('div');
        container.className = 'yva-floating-container';
        container.innerHTML = `
            <div class="yva-status-display" id="yva-status">
                <span class="yva-status-text">Ready</span>
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

        // Add to page
        document.body.appendChild(container);
        
        // Save container and child element references
        this.floatingContainer = container;
        this.floatingButton = container.querySelector('#yva-voice-btn');
        this.statusDisplay = container.querySelector('#yva-status');
        
        // Bind drag and click events
        this.setupDragAndClick();
        
        // Hover events
        this.floatingButton.addEventListener('mouseenter', () => {
            this.isHovering = true;
            this.showStatus();
        });
        this.floatingButton.addEventListener('mouseleave', () => {
            this.isHovering = false;
            this.hideStatus();
        });
        
        // Load saved position
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
            
            // Determine if dragging has started (movement exceeds threshold)
            if (!dragStarted && (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5)) {
                dragStarted = true;
                this.floatingButton.classList.add('dragging');
                this.hideStatus();
            }
            
            if (dragStarted) {
                const newX = startX + deltaX;
                const newY = startY + deltaY;
                
                // Restrict within viewport
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
                // Save position to storage
                this.savePosition();
            } else {
                // If not dragging, handle click
                this.handleVoiceQuery();
            }
            
            isDragging = false;
            dragStarted = false;
        };

        // Touch event support
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

        // Bind events
        this.floatingButton.addEventListener('mousedown', handleMouseDown);
        this.floatingButton.addEventListener('touchstart', handleTouchStart, { passive: false });
        this.floatingButton.addEventListener('touchmove', handleTouchMove, { passive: false });
        this.floatingButton.addEventListener('touchend', handleTouchEnd);
    }

    savePosition() {
        // Debounce save position
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
            Logger.log('Saving button position:', position);
        }, 300); // 300ms debounce
    }

    async loadPosition() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['yva_button_position'], (result) => {
                if (result.yva_button_position) {
                    const pos = result.yva_button_position;
                    // Ensure position is within current viewport
                    const maxX = window.innerWidth - 60; // Button width
                    const maxY = window.innerHeight - 60; // Button height
                    
                    const boundedX = Math.max(0, Math.min(pos.left, maxX));
                    const boundedY = Math.max(0, Math.min(pos.top, maxY));
                    
                    this.floatingContainer.style.left = boundedX + 'px';
                    this.floatingContainer.style.top = boundedY + 'px';
                    
                    Logger.log('Loading button position:', { left: boundedX, top: boundedY });
                }
                resolve();
            });
        });
    }

    showStatus() {
        if (this.statusDisplay) {
            // 如果不在对话中，显示悬停状态；如果在对话中，保持当前状态
            if (!this.isInConversation) {
                this.showHoverStatus();
            }
            this.statusDisplay.classList.add('visible');
        }
    }

    hideStatus() {
        if (this.statusDisplay) {
            // 如果在对话中，不隐藏状态（即使鼠标移开）
            if (this.isInConversation) {
                return;
            }
            this.statusDisplay.classList.remove('visible');
        }
    }

    /**
     * Show hover status (current function status)
     */
    showHoverStatus() {
        if (!this.statusDisplay) return;

        const statusText = this.statusDisplay.querySelector('.yva-status-text');
        
        // Show different hints based on current status
        let message = 'Click to ask';
        let type = 'info';

        // Check for subtitles
        const hasSubtitles = this.manualSubtitle || (this.subtitles && this.fullTranscript);
        if (!hasSubtitles) {
            message = 'No subtitle data, please refresh the page or upload manually in settings';
            type = 'error';
        } else if (this.isProcessing) {
            message = 'Processing...';
            type = 'processing';
        }

        statusText.textContent = message;
        this.statusDisplay.className = `yva-status-display ${type}`;
    }

    updateStatus(message, type = 'info') {
        if (!this.statusDisplay) return;

        const statusText = this.statusDisplay.querySelector('.yva-status-text');
        const micIcon = this.floatingButton.querySelector('.yva-mic-icon');
        const spinner = this.floatingButton.querySelector('.yva-loading-spinner');

        statusText.textContent = message;
        this.statusDisplay.className = `yva-status-display ${type} visible`;

        // 定义对话中的状态类型
        const conversationStates = ['recording', 'processing', 'playing'];
        const isConversationState = conversationStates.includes(type);
        
        // 更新对话状态
        this.isInConversation = isConversationState;

        // Update button status
        if (type === 'processing' || type === 'recording') {
            micIcon.style.display = 'none';
            spinner.style.display = 'block';
            this.floatingButton.disabled = true;
        } else {
            micIcon.style.display = 'block';
            spinner.style.display = 'none';
            this.floatingButton.disabled = false;
        }

        // Clear previous auto-hide timer
        if (this.statusHideTimer) {
            clearTimeout(this.statusHideTimer);
        }

        // 如果在对话中，持续显示；如果不在对话中，短暂显示后消失
        if (!isConversationState) {
            this.statusHideTimer = setTimeout(() => {
                this.hideStatus();
            }, type === 'success' ? 2000 : (type === 'error' ? 4000 : 3000));
        }
        // 对话中的状态（recording, processing, playing）不设置自动隐藏定时器，会持续显示
    }

    async handleVoiceQuery() {
        if (this.isProcessing) {
            return;
        }

        try {
            this.isProcessing = true;

            // Get current video context
            const context = await this.getVideoContext();
            
            if (!context) {
                this.updateStatus('Unable to get video information', 'error');
                return;
            }

            // Check for available subtitles
            if (!context.fullTranscript) {
                this.updateStatus('No subtitle data, please refresh the page or upload manually in settings', 'error');
                return;
            }

            // Start voice processing (AI Assistant automatically manages multi-video conversation history)
            const result = await this.aiAssistant.processVoiceQuerySmart(
                context, 
                (message, type) => this.updateStatus(message, type)
            );

            // Track successful voice query
            try {
                this.analytics.trackVoiceQuery(true);
            } catch (error) {
                Logger.log('Content: Analytics tracking failed:', error.message);
            }
            
            Logger.log('Conversation complete:', result);

        } catch (error) {
            Logger.error('Voice query failed:', error);
            
            // Special handling for audioId expiry
            if (error.message.includes('AudioId expired')) {
                this.updateStatus('🔄 ' + error.message, 'error');
            } else {
                this.updateStatus('Processing failed: ' + error.message, 'error');
            }
            
            // Track failed voice query
            try {
                this.analytics.trackVoiceQuery(false);
                this.analytics.trackError('voice_query', error.message);
            } catch (analyticsError) {
                Logger.log('Content: Analytics tracking failed:', analyticsError.message);
            }
            
            // Send error log to background
            chrome.runtime.sendMessage({
                action: 'log_error',
                error: error.message,
                context: 'voice_query'
            });
        } finally {
            this.isProcessing = false;
            // 对话完成后，重置对话状态并清理状态显示
            setTimeout(() => {
                this.isInConversation = false;
                this.hideStatus();
            }, 3000);
        }
    }

    /**
     * Get video context information
     */
    async getVideoContext() {
        const videoId = this.getCurrentVideoId();
        const videoTitle = this.getVideoTitle();
        const videoDescription = this.getVideoDescription();
        const currentTime = this.getCurrentTime();
        
        // Prioritize manually uploaded subtitles, otherwise use API fetched subtitles
        let fullTranscript = '';
        let relevantSubtitles = '';
        
        if (this.manualSubtitle) {
            // Use manually uploaded subtitles
            fullTranscript = this.manualSubtitle.transcript;
            relevantSubtitles = this.getCurrentSubtitleContextFromTimestamps(
                this.manualSubtitle.timestamps, 
                currentTime
            );
            Logger.log('Content: Using manually uploaded subtitles');
        } else if (this.subtitles && this.fullTranscript) {
            // Use API fetched subtitles
            fullTranscript = this.fullTranscript;
            relevantSubtitles = this.getCurrentSubtitleContext(currentTime);
            Logger.log('Content: Using API fetched subtitles');
        } else {
            Logger.log('Content: No subtitles available, attempting to load...');
            // Attempt to load subtitles
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
            videoDescription: videoDescription,
            currentTime: currentTime,
            relevantSubtitles: relevantSubtitles,
            fullTranscript: fullTranscript
        };
    }

    getCurrentVideoId() {
        const urlParams = new URLSearchParams(window.location.search);
        const videoId = urlParams.get('v');
        Logger.log('Content: getCurrentVideoId extracted:', videoId, 'from URL:', window.location.href);
        return videoId;
    }

    getVideoTitle() {
        const titleElement = document.querySelector('h1.ytd-watch-metadata yt-formatted-string');
        return titleElement ? titleElement.textContent.trim() : 'Unknown Video';
    }

    getVideoDescription() {
        try {
            // Target the specific #snippet elements that contain full description content
            const snippetSelectors = [
                // Path 1: Full description in expandable section
                'ytd-structured-description-content-renderer ytd-expandable-video-description-body-renderer ytd-text-inline-expander #snippet',
                // Path 2: Full description in watch metadata
                'ytd-watch-metadata ytd-text-inline-expander #snippet',
                // Fallback: any snippet in description area
                'ytd-expandable-video-description-body-renderer #snippet',
                'ytd-text-inline-expander #snippet',
                '#snippet'
            ];
            
            for (const selector of snippetSelectors) {
                const snippetElement = document.querySelector(selector);
                if (snippetElement) {
                    // Get all text content from the snippet element and its children using TreeWalker
                    const allTextNodes = [];
                    const walker = document.createTreeWalker(
                        snippetElement,
                        NodeFilter.SHOW_TEXT,
                        null,
                        false
                    );
                    
                    let node;
                    while (node = walker.nextNode()) {
                        const text = node.textContent.trim();
                        if (text) {
                            allTextNodes.push(text);
                        }
                    }
                    
                    const description = allTextNodes.join(' ').trim();
                    if (description) {
                        Logger.log('Content: Video description extracted with selector:', selector);
                        Logger.log('Content: Description preview:', description.substring(0, 200) + '...');
                        return description;
                    }
                }
            }
            
            Logger.log('Content: No video description snippet found');
            return 'No description available';
        } catch (error) {
            Logger.warn('Content: Error extracting video description:', error);
            return 'No description available';
        }
    }

    getCurrentTime() {
        const video = document.querySelector('video');
        return video ? video.currentTime : 0;
    }

    async preloadSubtitles() {
        const videoId = this.getCurrentVideoId();
        if (videoId && videoId !== this.currentVideoId) {
            try {
                Logger.log('Content: Preloading subtitles for video:', videoId);
                
                // Priority: manual subtitles > cached API subtitles > real-time API subtitles
                const [manualResult, apiResult] = await Promise.all([
                    chrome.storage.local.get([`manual_subtitle_${videoId}`]),
                    chrome.storage.local.get([`api_subtitle_${videoId}`])
                ]);
                
                const manualSubtitleData = manualResult[`manual_subtitle_${videoId}`];
                const apiSubtitleData = apiResult[`api_subtitle_${videoId}`];
                
                if (manualSubtitleData) {
                    Logger.log('Content: Found manually uploaded subtitles');
                    this.handleManualSubtitleUploaded(videoId, manualSubtitleData, true); // true indicates from cache
                } else if (apiSubtitleData) {
                    Logger.log('Content: Found cached API subtitles');
                    this.handleCachedApiSubtitle(videoId, apiSubtitleData);
                } else {
                    // Attempt to get subtitles using API
                    try {
                        const result = await this.loadSubtitles(videoId);
                        Logger.log('Content: API subtitles loaded successfully');
                        this.updateStatus(`✅ Auto subtitles loaded`, 'success');
                    } catch (error) {
                        Logger.warn('Content: API subtitles failed to load, manual upload required:', error);
                        this.updateStatus('Subtitle fetching failed, please upload manually', 'error');
                    }
                }
                
                this.currentVideoId = videoId;
            } catch (error) {
                Logger.warn('Preload subtitles failed:', error);
            }
        }
    }

    /**
     * Load subtitles (API method)
     */
    async loadSubtitles(videoId) {
        Logger.log('Content: loadSubtitles called with videoId:', videoId);
        Logger.log('Content: current URL:', window.location.href);
        
        try {
            const extractor = new SubtitleExtractor();
            
            // Get English subtitle content
            const result = await extractor.getFirstEnglishSubtitle(videoId);
            
            // Parse subtitle content to full text
            const fullTranscript = extractor.getFullTranscriptFromContent(result.content);
            Logger.log(`Content: Subtitle parsing complete, total text length: ${fullTranscript.length} characters`);
            
            // Parse subtitles to timestamp array
            const subtitleTimestamps = extractor.parseXMLToTimestamps(result.content);
            Logger.log(`Content: Subtitle timestamp parsing complete, total ${subtitleTimestamps.length} entries`);

            // Save subtitle data
            this.subtitles = subtitleTimestamps;
            this.fullTranscript = fullTranscript;
            this.currentSubtitleLanguage = result.subtitle.name;
            
            Logger.log(`Subtitle loaded successfully: ${result.subtitle.name}, ${result.content.length} characters`);

            // Cache API subtitles to local storage
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

            Logger.log(`API subtitles cached to local storage: ${videoId}`);

            // Track API subtitle loading (first time, not cached)
            try {
                this.analytics.trackSubtitleLoad('api', false);
            } catch (error) {
                Logger.log('Content: Analytics tracking failed:', error.message);
            }

            // Notify background script subtitles are ready
            chrome.runtime.sendMessage({
                action: 'subtitles_ready',
                videoId: videoId,
                transcript: fullTranscript,
                language: result.subtitle.name,
                timestamps: subtitleTimestamps,
                source: 'api'
            });

            return result;

        } catch (error) {
            Logger.error('Failed to load subtitles via API:', error);
            throw error; // Propagate error
        }
    }

    /**
     * Get current subtitle context from timestamps
     */
    getCurrentSubtitleContextFromTimestamps(timestamps, currentTime, maxWords = null) {
        // Use configured max words or default
        const targetMaxWords = maxWords || this.contextMaxWords;
        
        // Find subtitles that are before or at current time
        const beforeOrCurrent = timestamps.filter(entry => entry.start <= currentTime);
        
        // Sort by start time (chronological order)
        // Q: why do we sort? isn't it already sorted?
        beforeOrCurrent.sort((a, b) => a.start - b.start);
        
        // Build context by adding sentences from most recent backwards until we hit word limit
        let contextText = '';
        let wordCount = 0;
        const usedEntries = [];
        
        // Start from the most recent subtitle and work backwards
        for (let i = beforeOrCurrent.length - 1; i >= 0; i--) {
            const entry = beforeOrCurrent[i];
            const entryWords = entry.text.split(/\s+/).filter(word => word.length > 0);
            
            // Check if adding this entry would exceed word limit
            if (wordCount + entryWords.length > targetMaxWords && contextText.length > 0) {
                // We already have some content and adding this would exceed limit
                break;
            }
            
            // Add this entry to the beginning of context
            usedEntries.unshift(entry);
            wordCount += entryWords.length;
            
            // If this is our first entry, just set it
            if (contextText === '') {
                contextText = entry.text;
            } else {
                // Prepend to existing context
                contextText = entry.text + ' ' + contextText;
            }
            
            // If we've reached the word limit, stop
            if (wordCount >= targetMaxWords) {
                break;
            }
        }
        
        if (usedEntries.length === 0) {
            Logger.log(`Content: No subtitle entries found before time ${currentTime}s`);
            return '';
        }
        
        Logger.log(`Content: Found ${usedEntries.length} subtitle entries before time ${currentTime}s (${wordCount}/${targetMaxWords} words)`);
        Logger.log(`Content: Relevant subtitle context: "${contextText}"`);
        
        return contextText;
    }

    /**
     * Get current subtitle context
     */
    getCurrentSubtitleContext(currentTime) {
        // Use API subtitles if available
        if (this.subtitles && this.subtitles.length > 0) {
            Logger.log(`Content: Getting subtitle context for time ${currentTime}s from ${this.subtitles.length} subtitle entries`);
            return this.getCurrentSubtitleContextFromTimestamps(this.subtitles, currentTime);
        } else {
            Logger.log(`Content: No subtitles available for context (subtitles: ${this.subtitles ? this.subtitles.length : 'null'})`);
            return '';
        }
    }

    /**
     * Get full video transcript
     */
    getFullVideoTranscript() {
        return this.fullTranscript || (this.manualSubtitle ? this.manualSubtitle.transcript : '');
    }

    /**
     * Observe page navigation
     */
    observeNavigation() {
        // Use MutationObserver on the title element to detect page navigation
        const titleElement = document.querySelector('title');
        if (titleElement) {
            const observer = new MutationObserver(() => {
                Logger.log('Navigation detected, reloading assistant...');
                // Delay reload slightly to ensure the new page is ready
                setTimeout(() => this.reloadAssistant(), 500);
            });
            observer.observe(titleElement, { childList: true });
        }
    }

    /**
     * Observe video changes
     */
    observeVideoChanges() {
        // Observe changes to the video player element (if needed for future features)
        // const videoElement = document.querySelector('video');
        // if (videoElement) {
        //     const observer = new MutationObserver(() => {
        //         Logger.log('Video element changed');
        //         // Handle video change logic
        //     });
        //     observer.observe(videoElement, { attributes: true });
        // }
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        Logger.log('Cleaning up assistant...');
        // Remove floating button
        if (this.floatingContainer) {
            this.floatingContainer.remove();
            this.floatingContainer = null;
            this.floatingButton = null;
            this.statusDisplay = null;
        }
        
        // Clear timers
        if (this.statusHideTimer) {
            clearTimeout(this.statusHideTimer);
            this.statusHideTimer = null;
        }
        if (this.savePositionTimer) {
            clearTimeout(this.savePositionTimer);
            this.savePositionTimer = null;
        }
        
        // Stop recording/processing if active (future implementation)
        // this.aiAssistant?.stopProcessing();
        this.isProcessing = false;
        
        // Reset state variables
        this.currentVideoId = null;
        this.subtitlesData = null; // API subtitles cache
        this.manualSubtitle = null; // Manual subtitles cache
        this.hasTemporaryStatus = false;
    }
}

// Initialize the assistant
function initVoiceAssistant() {
    const assistant = new YouTubeVoiceAssistant();
    // Expose assistant instance globally for debugging if needed
    // window.youtubeVoiceAssistant = assistant;
}

initVoiceAssistant(); 