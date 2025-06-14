/**
 * YouTube Watching Assistant - Popup Interface Script
 */

// Initialize after the page loads
document.addEventListener('DOMContentLoaded', function() {
    initPopup();
});

/**
 * Initialize popup interface
 */
async function initPopup() {
    // Load saved API key
    await loadApiKey();
    
    // Load voice settings
    await loadVoiceSettings();
    
    // Load privacy settings
    await loadPrivacySettings();
    
    // Load custom prompt settings
    await loadCustomPrompt();
    
    // Check current page
    await checkCurrentPage();
    
    // Load current video subtitle status
    await loadSubtitleStatus();
    
    // Bind event listeners
    bindEventListeners();
    
    // Set message listener
    setupMessageListener();
}

/**
 * Set message listener
 */
function setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'subtitle_status_updated') {
            handleSubtitleStatusUpdate(request);
        }
    });
}

/**
 * Handle subtitle status update
 */
function handleSubtitleStatusUpdate(data) {
    Logger.log('Popup: 收到字幕状态更新:', data);
    
    if (data.hasSubtitles) {
        let statusMessage = '';
        if (data.source === 'manual') {
            statusMessage = '✅ Manual subtitles loaded';
        } else if (data.source === 'api') {
            statusMessage = `✅ Auto subtitles loaded (${data.language})`;
        } else {
            statusMessage = `✅ Subtitles loaded (${data.language})`;
        }
        
        updateSubtitleStatus(statusMessage, 'loaded');
    } else {
        updateSubtitleStatus('❌ No subtitles available for current video', 'empty');
    }
}

/**
 * Load saved API key
 */
async function loadApiKey() {
    try {
        const result = await chrome.storage.sync.get(['openai_api_key']);
        if (result.openai_api_key) {
            document.getElementById('apiKey').value = result.openai_api_key;
            showStatus('API key loaded', 'success');
        }
    } catch (error) {
        Logger.error('Failed to load API key:', error);
    }
}

/**
 * Load voice settings
 */
async function loadVoiceSettings() {
    try {
        const result = await chrome.storage.sync.get(['enhanced_voice_mode']);
        const enhancedMode = result.enhanced_voice_mode || false; // Default off
        document.getElementById('enhancedVoiceMode').checked = enhancedMode;
        Logger.log('Enhanced voice mode loaded:', enhancedMode);
    } catch (error) {
        Logger.error('Failed to load voice settings:', error);
    }
}

/**
 * Load privacy settings
 */
async function loadPrivacySettings() {
    try {
        const result = await chrome.storage.sync.get(['analytics_enabled']);
        const analyticsEnabled = result.analytics_enabled !== false; // Default enabled
        document.getElementById('analyticsEnabled').checked = analyticsEnabled;
        Logger.log('Analytics setting loaded:', analyticsEnabled);
    } catch (error) {
        Logger.error('Failed to load privacy settings:', error);
    }
}

/**
 * Load custom prompt settings
 */
async function loadCustomPrompt() {
    try {
        const defaultPrompt = 'You are a YouTube video assistant that answers questions based on video subtitle content. Your answers will be spoken aloud to the user. Keep responses concise (within 30 words) and conversational for speech output. Focus on content relevant to the current time position. When asked to repeat what was just said in the video, provide word-by-word accurate repetition without omitting details.';
        
        const result = await chrome.storage.sync.get(['custom_prompt']);
        const customPrompt = result.custom_prompt !== undefined ? result.custom_prompt : defaultPrompt;
        document.getElementById('customPrompt').value = customPrompt;
        Logger.log('Custom prompt loaded:', customPrompt === defaultPrompt ? 'Using default prompt' : 'Custom prompt set');
    } catch (error) {
        Logger.error('Failed to load custom prompt:', error);
    }
}

/**
 * Save voice settings
 */
async function saveVoiceSettings() {
    try {
        const enhancedMode = document.getElementById('enhancedVoiceMode').checked;
        await chrome.storage.sync.set({ enhanced_voice_mode: enhancedMode });
        Logger.log('Enhanced voice mode saved:', enhancedMode);
        
        // Notify content script to update settings
        notifyContentScript();
        
        showStatus(`Enhanced voice mode ${enhancedMode ? 'enabled' : 'disabled'}`, 'success');
    } catch (error) {
        Logger.error('Failed to save voice settings:', error);
        showStatus('Failed to save voice settings', 'error');
    }
}

/**
 * Save privacy settings
 */
async function savePrivacySettings() {
    try {
        const analyticsEnabled = document.getElementById('analyticsEnabled').checked;
        await chrome.storage.sync.set({ analytics_enabled: analyticsEnabled });
        Logger.log('Analytics setting saved:', analyticsEnabled);
        
        showStatus(analyticsEnabled ? 'Usage statistics enabled' : 'Usage statistics disabled', 'success');
        
        // Notify content script about analytics setting change
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && isYouTubeVideoPage(tab.url)) {
                await chrome.tabs.sendMessage(tab.id, {
                    action: 'analytics_setting_changed',
                    enabled: analyticsEnabled
                });
            }
        } catch (error) {
            Logger.log('Failed to notify content script (normal if not on YouTube page):', error.message);
        }
        
    } catch (error) {
        Logger.error('Failed to save privacy settings:', error);
        showStatus('Failed to save privacy settings', 'error');
    }
}

/**
 * Save custom prompt
 */
async function saveCustomPrompt() {
    try {
        const customPrompt = document.getElementById('customPrompt').value.trim();
        await chrome.storage.sync.set({ custom_prompt: customPrompt });
        Logger.log('Custom prompt saved:', customPrompt ? 'Custom prompt set' : 'Using default prompt');
        
        showStatus(customPrompt ? 'Custom prompt saved!' : 'Prompt reset to default', 'success');
        
        // Notify content script to reload assistant with new prompt
        notifyContentScript();
        
    } catch (error) {
        Logger.error('Failed to save custom prompt:', error);
        showStatus('Failed to save custom prompt', 'error');
    }
}

/**
 * Reset custom prompt to default
 */
async function resetCustomPrompt() {
    try {
        const defaultPrompt = 'You are a YouTube video assistant that answers questions based on video subtitle content. Your answers will be spoken aloud to the user. Keep responses concise (within 30 words) and conversational for speech output. Focus on content relevant to the current time position. When asked to repeat what was just said in the video, provide word-by-word accurate repetition without omitting details.';
        
        document.getElementById('customPrompt').value = defaultPrompt;
        await chrome.storage.sync.set({ custom_prompt: defaultPrompt });
        Logger.log('Custom prompt reset to default');
        
        showStatus('Prompt reset to default', 'success');
        
        // Notify content script to reload assistant with default prompt
        notifyContentScript();
        
    } catch (error) {
        Logger.error('Failed to reset custom prompt:', error);
        showStatus('Failed to reset custom prompt', 'error');
    }
}

/**
 * Save API key
 */
async function saveApiKey() {
    const apiKey = document.getElementById('apiKey').value.trim();
    
    if (!apiKey) {
        showStatus('Please enter API key', 'error');
        return;
    }
    
    if (!apiKey.startsWith('sk-')) {
        showStatus('Invalid API key format, should start with sk-', 'error');
        return;
    }
    
    try {
        await chrome.storage.sync.set({ openai_api_key: apiKey });
        showStatus('API key saved successfully!', 'success');
        
        // Notify content script to re-initialize
        notifyContentScript();
        
    } catch (error) {
        Logger.error('Failed to save API key:', error);
        showStatus('Save failed: ' + error.message, 'error');
    }
}

/**
 * Notify content script to re-initialize
 */
async function notifyContentScript() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && isYouTubeVideoPage(tab.url)) {
            chrome.tabs.sendMessage(tab.id, { 
                action: 'reload_assistant',
                source: 'popup'
            });
        }
    } catch (error) {
        Logger.log('Failed to notify content script:', error);
    }
}

/**
 * Load current video subtitle status
 */
async function loadSubtitleStatus() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !isYouTubeVideoPage(tab.url)) {
            return;
        }

        // Show subtitle management section
        document.getElementById('subtitleSection').style.display = 'block';

        // Get current video ID (support both regular videos and Shorts)
        let videoId = extractVideoId(tab.url);
        
        if (videoId) {
            // Update downsub link
            updateDownsubLink(tab.url);
            
            // Priority: manual subtitles > cached API subtitles > background API subtitles
            const [manualResult, apiResult] = await Promise.all([
                chrome.storage.local.get([`manual_subtitle_${videoId}`]),
                chrome.storage.local.get([`api_subtitle_${videoId}`])
            ]);
            
            const manualSubtitle = manualResult[`manual_subtitle_${videoId}`];
            const apiSubtitle = apiResult[`api_subtitle_${videoId}`];
            
            if (manualSubtitle) {
                Logger.log('Found saved manual subtitles, videoId:', videoId, 'content length:', manualSubtitle.content.length);
                updateSubtitleStatus('✅ Manual subtitles loaded', 'loaded');
            } else if (apiSubtitle) {
                Logger.log('Found cached API subtitles, videoId:', videoId, 'language:', apiSubtitle.language);
                updateSubtitleStatus(`✅ Auto subtitles loaded (${apiSubtitle.language})`, 'loaded');
            } else {
                // Check if background has API subtitle data
                chrome.runtime.sendMessage({ action: 'get_current_subtitles', videoId: videoId }, (response) => {
                    if (response && response.success && response.hasSubtitles) {
                        updateSubtitleStatus(`✅ Auto subtitles loaded (${response.language})`, 'loaded');
                    } else {
                        Logger.log('No saved subtitles found, videoId:', videoId);
                        updateSubtitleStatus('❌ No subtitles available for current video', 'empty');
                    }
                });
            }
        }
    } catch (error) {
        Logger.error('Failed to load subtitle status:', error);
    }
}

/**
 * Update subtitle status display
 */
function updateSubtitleStatus(message, type) {
    const statusElement = document.getElementById('subtitleStatus');
    statusElement.textContent = message;
    statusElement.className = `subtitle-status ${type}`;
}

/**
 * Update downsub link
 */
function updateDownsubLink(youtubeUrl) {
    const downsubLink = document.getElementById('downsubLink');
    if (downsubLink && youtubeUrl && isYouTubeVideoPage(youtubeUrl)) {
        // Encode YouTube URL
        const encodedUrl = encodeURIComponent(youtubeUrl);
        // Generate downsub link
        const downsubUrl = `https://downsub.com/?url=${encodedUrl}`;
        downsubLink.href = downsubUrl;
        Logger.log('Updated downsub link:', downsubUrl);
    }
}

/**
 * Handle file upload
 */
async function handleFileUpload(file) {
    if (!file || !file.name.toLowerCase().endsWith('.srt')) {
        showStatus('Please select an SRT subtitle file', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = async function(e) {
        const content = e.target.result;
        document.getElementById('fileInputLabel').textContent = `📁 Selected: ${file.name}`;
        
        // Auto save subtitle
        await saveSubtitleContent(content);
    };
    reader.readAsText(file);
}

/**
 * Save subtitle content
 */
async function saveSubtitleContent(subtitleContent) {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !isYouTubeVideoPage(tab.url)) {
            showStatus('Please use this function on a YouTube video page', 'error');
            return;
        }

        // Get video ID (support both regular videos and Shorts)
        let videoId = extractVideoId(tab.url);

        if (!videoId) {
            showStatus('Unable to get video ID', 'error');
            return;
        }

        if (!subtitleContent || !subtitleContent.trim()) {
            showStatus('Subtitle content is empty', 'error');
            return;
        }

        // Validate SRT format
        if (!isValidSRTFormat(subtitleContent)) {
            showStatus('Incorrect subtitle format, please ensure it is in SRT format', 'error');
            return;
        }

        // Save to local storage
        const subtitleData = {
            videoId: videoId,
            content: subtitleContent.trim(),
            timestamp: Date.now()
        };

        await chrome.storage.local.set({
            [`manual_subtitle_${videoId}`]: subtitleData
        });

        // Notify content script subtitle updated
        chrome.tabs.sendMessage(tab.id, {
            action: 'manual_subtitle_uploaded',
            videoId: videoId,
            subtitleData: subtitleData
        });

        updateSubtitleStatus('✅ Subtitles saved successfully', 'loaded');
        showStatus('Subtitles uploaded and saved successfully! You can start voice conversation now.', 'success');
        
        Logger.log('Subtitle saved successfully, videoId:', videoId, 'content length:', subtitleContent.length);

    } catch (error) {
        Logger.error('Save subtitles failed:', error);
        showStatus('Failed to save subtitles: ' + error.message, 'error');
    }
}

/**
 * Clear subtitles
 */
async function clearSubtitle() {
    if (!confirm('Are you sure you want to clear the subtitles for the current video?')) {
        return;
    }

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !isYouTubeVideoPage(tab.url)) {
            return;
        }

        // Get video ID (support both regular videos and Shorts)
        let videoId = extractVideoId(tab.url);

        if (videoId) {
            // Remove manual subtitles and API subtitle cache from storage
            await chrome.storage.local.remove([
                `manual_subtitle_${videoId}`,
                `api_subtitle_${videoId}`
            ]);
            
            // Reset file selection label
            document.getElementById('fileInputLabel').textContent = '📁 Select an SRT subtitle file or drag and drop here';
            
            // Notify content script subtitles cleared
            chrome.tabs.sendMessage(tab.id, {
                action: 'manual_subtitle_cleared',
                videoId: videoId
            });

            updateSubtitleStatus('❌ No subtitles available for the current video', 'empty');
            showStatus('All subtitle data has been cleared', 'success');
        }
    } catch (error) {
        Logger.error('Clear subtitles failed:', error);
        showStatus('Failed to clear subtitles: ' + error.message, 'error');
    }
}

/**
 * Validate SRT format
 */
function isValidSRTFormat(content) {
    // Simple SRT format validation
    const srtPattern = /^\d+\s+\d{2}:\d{2}:\d{2},\d{3}\s+-->\s+\d{2}:\d{2}:\d{2},\d{3}\s+.+/m;
    return srtPattern.test(content);
}

/**
 * Check current page
 */
async function checkCurrentPage() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const pageStatus = document.getElementById('currentPageStatus');
        const pageUrl = document.getElementById('currentPageUrl');
        
        if (tab && tab.url) {
            if (tab.url.includes('youtube.com/watch') || tab.url.includes('youtube.com/shorts/')) {
                pageStatus.style.display = 'block';
                pageUrl.textContent = '✅ YouTube Video Page - Watching Assistant Available';
                pageUrl.style.color = '#155724';
            } else if (tab.url.includes('youtube.com')) {
                pageStatus.style.display = 'block';
                pageUrl.textContent = '⚠️ YouTube Page but not a video page';
                pageUrl.style.color = '#856404';
            } else {
                pageStatus.style.display = 'block';
                pageUrl.textContent = '❌ Non-YouTube Page - Watching Assistant Unavailable';
                pageUrl.style.color = '#721c24';
            }
        }
    } catch (error) {
        Logger.error('Check current page failed:', error);
    }
}

/**
 * Test API connection
 */
async function testConnection() {
    const testBtn = document.getElementById('testBtn');
    const apiKey = document.getElementById('apiKey').value.trim();
    
    if (!apiKey) {
        showStatus('Please enter API key first', 'error');
        return;
    }
    
    testBtn.disabled = true;
    testBtn.textContent = 'Testing...';
    
    try {
        const response = await fetch('https://api.openai.com/v1/models', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            showStatus('✅ API connection test successful!', 'success');
        } else {
            const errorData = await response.json();
            showStatus(`❌ API test failed: ${errorData.error?.message || 'Unknown error'}`, 'error');
        }
        
    } catch (error) {
        Logger.error('API test failed:', error);
        showStatus(`❌ Network error: ${error.message}`, 'error');
    } finally {
        testBtn.disabled = false;
        testBtn.textContent = 'Test API';
    }
}

/**
 * Show status message
 */
function showStatus(message, type = 'info') {
    const statusElement = document.getElementById('statusMessage');
    statusElement.textContent = message;
    statusElement.className = `status ${type}`;
    statusElement.style.display = 'block';
    
    // Hide after 3 seconds
    setTimeout(() => {
        statusElement.style.display = 'none';
    }, 3000);
}

/**
 * Toggle password display/hide
 */
function togglePassword() {
    const passwordInput = document.getElementById('apiKey');
    const toggleBtn = document.getElementById('togglePasswordBtn');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleBtn.textContent = 'Hide';
    } else {
        passwordInput.type = 'password';
        toggleBtn.textContent = 'Show';
    }
}

/**
 * Check if URL is a YouTube video page (regular video or Shorts)
 */
function isYouTubeVideoPage(url) {
    return url && (url.includes('youtube.com/watch') || url.includes('youtube.com/shorts/'));
}

/**
 * Extract video ID from YouTube URL (supports both regular videos and Shorts)
 */
function extractVideoId(url) {
    if (!url) return null;
    
    if (url.includes('/watch')) {
        const urlParams = new URLSearchParams(url.split('?')[1]);
        return urlParams.get('v');
    } else if (url.includes('/shorts/')) {
        const shortsMatch = url.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
        return shortsMatch ? shortsMatch[1] : null;
    }
    
    return null;
}

/**
 * Bind event listeners
 */
function bindEventListeners() {
    // Save API Key button
    document.getElementById('saveApiKeyBtn').addEventListener('click', saveApiKey);
    
    // Password show/hide button
    document.getElementById('togglePasswordBtn').addEventListener('click', togglePassword);
    
    // Test connection button
    document.getElementById('testBtn').addEventListener('click', testConnection);
    
    // Subtitle related buttons
    document.getElementById('clearSubtitleBtn').addEventListener('click', clearSubtitle);
    
    // Enhanced voice mode switch
    document.getElementById('enhancedVoiceMode').addEventListener('change', saveVoiceSettings);
    
    // Analytics switch
    document.getElementById('analyticsEnabled').addEventListener('change', savePrivacySettings);
    
    // Custom prompt buttons
    document.getElementById('savePromptBtn').addEventListener('click', saveCustomPrompt);
    document.getElementById('resetPromptBtn').addEventListener('click', resetCustomPrompt);
    
    // File upload
    const fileInput = document.getElementById('subtitleFile');
    const fileLabel = document.getElementById('fileInputLabel');
    
    fileInput.addEventListener('change', function(e) {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
        }
    });
    
    // Drag and drop upload
    fileLabel.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.currentTarget.classList.add('dragover');
    });
    
    fileLabel.addEventListener('dragleave', function(e) {
        e.currentTarget.classList.remove('dragover');
    });
    
    fileLabel.addEventListener('drop', function(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleFileUpload(e.dataTransfer.files[0]);
        }
    });
    
    // API key input box Enter key
    document.getElementById('apiKey').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            saveApiKey();
        }
    });
}

// Wait for DOM to load before binding other event listeners
document.addEventListener('DOMContentLoaded', function() {
    // API key input box real-time validation
    document.getElementById('apiKey').addEventListener('input', function(e) {
        const value = e.target.value.trim();
        const saveBtn = document.getElementById('saveApiKeyBtn');
        
        if (value.startsWith('sk-') && value.length > 20) {
            saveBtn.style.background = 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)';
            saveBtn.textContent = 'Save Configuration ✓';
        } else {
            saveBtn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
            saveBtn.textContent = 'Save Configuration';
        }
    });

    // Periodically update current page status (reduce frequency to avoid interfering with user editing)
    setInterval(() => {
        checkCurrentPage();
        // Update subtitle status only when user is not focused on text area
        const subtitleTextArea = document.getElementById('subtitleText');
        if (subtitleTextArea && document.activeElement !== subtitleTextArea) {
            loadSubtitleStatus();
        }
    }, 5000);
}); 