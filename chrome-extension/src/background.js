/**
 * YouTube语音助手 - Background Service Worker
 * 处理扩展的后台逻辑和消息传递
 */

// 全局变量存储字幕数据
let currentVideoSubtitles = {
    videoId: null,
    transcript: '',
    language: '',
    timestamps: []
};

// 扩展安装时的初始化
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('YouTube语音助手已安装');
        
        // 设置默认配置
        chrome.storage.sync.set({
            version: '1.0.0',
            firstInstall: Date.now()
        });
        
        // 初始化使用统计
        chrome.storage.local.set({
            usage_stats: {
                total: 0,
                today: 0,
                lastDate: new Date().toDateString()
            }
        });
        
        // 打开欢迎页面
        chrome.tabs.create({
            url: chrome.runtime.getURL('welcome.html')
        });
    } else if (details.reason === 'update') {
        console.log('YouTube语音助手已更新');
    }
});

// 监听来自content script和popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Background: 收到消息:', request.action);
    
    if (request.action === 'fetch_subtitles') {
        fetchSubtitles(request.url, request.headers, sendResponse);
        return true; // 保持消息通道开放
    } else if (request.action === 'download_subtitle_content') {
        downloadSubtitleContent(request.url, sendResponse);
        return true; // 保持消息通道开放
    } else if (request.action === 'subtitles_ready') {
        // 保存字幕数据
        currentVideoSubtitles = {
            videoId: request.videoId,
            transcript: request.transcript,
            language: request.language,
            timestamps: request.timestamps
        };
        console.log(`Background: 字幕数据已保存 - 视频ID: ${request.videoId}, 语言: ${request.language}, 文本长度: ${request.transcript.length}`);
        sendResponse({ success: true });
    } else if (request.action === 'transcribe_audio') {
        transcribeAudio(request.audioBlob, sendResponse);
        return true;
    } else if (request.action === 'chat_with_openai') {
        chatWithOpenAI(request.messages, request.videoContext, sendResponse);
        return true;
    } else if (request.action === 'update_usage_stats') {
        updateUsageStats();
    } else if (request.action === 'get_api_key') {
        getApiKey(sendResponse);
    } else if (request.action === 'log_error') {
        console.error('Content Script Error:', request.error);
    } else if (request.action === 'check_permissions') {
        checkPermissions(sendResponse);
    } else {
        console.log('未知消息类型:', request.action);
    }
});

/**
 * 更新使用统计
 */
async function updateUsageStats() {
    try {
        const result = await chrome.storage.local.get(['usage_stats']);
        const stats = result.usage_stats || { total: 0, today: 0, lastDate: null };
        
        // 检查是否是新的一天
        const today = new Date().toDateString();
        if (stats.lastDate !== today) {
            stats.today = 0;
            stats.lastDate = today;
        }
        
        // 增加计数
        stats.total += 1;
        stats.today += 1;
        
        // 保存统计
        await chrome.storage.local.set({ usage_stats: stats });
        
        console.log('使用统计已更新:', stats);
        
    } catch (error) {
        console.error('更新使用统计失败:', error);
    }
}

/**
 * 获取API密钥
 */
async function getApiKey(sendResponse) {
    try {
        const result = await chrome.storage.sync.get(['openai_api_key']);
        sendResponse({ 
            success: true, 
            apiKey: result.openai_api_key 
        });
    } catch (error) {
        console.error('获取API密钥失败:', error);
        sendResponse({ 
            success: false, 
            error: error.message 
        });
    }
}

/**
 * 检查权限
 */
async function checkPermissions(sendResponse) {
    try {
        // 检查必要的权限
        const permissions = await chrome.permissions.getAll();
        
        const requiredHosts = [
            'https://www.youtube.com/*',
            'https://api.openai.com/*'
        ];
        
        const hasAllPermissions = requiredHosts.every(host => 
            permissions.origins.includes(host)
        );
        
        sendResponse({
            success: true,
            hasAllPermissions: hasAllPermissions,
            permissions: permissions
        });
        
    } catch (error) {
        console.error('检查权限失败:', error);
        sendResponse({
            success: false,
            error: error.message
        });
    }
}

// 监听标签页更新，用于检测YouTube页面
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // 只处理完成加载的YouTube视频页面
    if (changeInfo.status === 'complete' && 
        tab.url && 
        tab.url.includes('youtube.com/watch')) {
        
        console.log('检测到YouTube视频页面:', tab.url);
        
        // 可以在这里发送消息给content script
        chrome.tabs.sendMessage(tabId, {
            action: 'page_ready',
            url: tab.url
        }).catch(() => {
            // 忽略错误，可能content script还未注入
        });
    }
});

// 监听扩展按钮点击
chrome.action.onClicked.addListener((tab) => {
    // 如果是YouTube视频页面，可以直接激活语音助手
    if (tab.url && tab.url.includes('youtube.com/watch')) {
        chrome.tabs.sendMessage(tab.id, {
            action: 'activate_voice_assistant'
        }).catch(() => {
            console.log('无法发送消息到content script');
        });
    }
});

// 清理过期的存储数据
chrome.runtime.onStartup.addListener(() => {
    cleanupStorage();
});

/**
 * 清理过期的存储数据
 */
async function cleanupStorage() {
    try {
        // 清理7天前的对话历史
        const result = await chrome.storage.local.get(['conversation_history']);
        if (result.conversation_history) {
            const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
            const filteredHistory = result.conversation_history.filter(
                item => item.timestamp > sevenDaysAgo
            );
            
            if (filteredHistory.length !== result.conversation_history.length) {
                await chrome.storage.local.set({
                    conversation_history: filteredHistory
                });
                console.log('已清理过期的对话历史');
            }
        }
        
    } catch (error) {
        console.error('清理存储失败:', error);
    }
}

// 错误处理
chrome.runtime.onSuspend.addListener(() => {
    console.log('Service Worker即将挂起');
});

// 监听存储变化
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.openai_api_key) {
        console.log('API密钥已更新');
        // 通知所有YouTube标签页重新初始化
        notifyAllYouTubeTabs();
    }
});

/**
 * 通知所有YouTube标签页
 */
async function notifyAllYouTubeTabs() {
    try {
        const tabs = await chrome.tabs.query({
            url: ['*://www.youtube.com/watch*', '*://youtube.com/watch*']
        });
        
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
                action: 'api_key_updated'
            }).catch(() => {
                // 忽略错误
            });
        });
        
    } catch (error) {
        console.error('通知标签页失败:', error);
    }
}

// 定期清理和维护
setInterval(() => {
    cleanupStorage();
}, 60 * 60 * 1000); // 每小时清理一次

/**
 * 代理字幕API请求，绕过CORS限制 - 完全模拟Tampermonkey的GM_xmlhttpRequest
 */
async function fetchSubtitles(url, headers, sendResponse) {
    const startTime = Date.now();
    
    try {
        console.log('Background: 发起字幕API请求:', url);
        console.log('Background: 请求时间:', new Date().toISOString());
        console.log('Background: 使用的headers:', headers);
        
        // 直接使用传入的headers，完全模拟Tampermonkey
        const fetchOptions = {
            method: 'GET',
            headers: headers,
            mode: 'cors',
            credentials: 'omit'
        };
        
        console.log('Background: Fetch配置:', fetchOptions);
        
        const response = await fetch(url, fetchOptions);
        
        const endTime = Date.now();
        console.log('Background: 请求耗时:', (endTime - startTime) + 'ms');
        console.log('Background: 响应状态:', response.status, response.statusText);
        console.log('Background: 响应类型:', response.type);
        console.log('Background: 响应URL:', response.url);
        
        console.log('Background: 响应headers详情:');
        response.headers.forEach((value, key) => {
            console.log(`  ${key}: ${value}`);
        });

        if (!response.ok) {
            let errorBody = '';
            const contentType = response.headers.get('content-type');
            console.log('Background: 错误响应Content-Type:', contentType);
            
            try {
                if (contentType && contentType.includes('application/json')) {
                    const errorJson = await response.json();
                    errorBody = JSON.stringify(errorJson, null, 2);
                    console.log('Background: 错误响应JSON:', errorJson);
                } else {
                    errorBody = await response.text();
                    console.log('Background: 错误响应文本:', errorBody);
                }
            } catch (e) {
                console.log('Background: 无法读取错误响应内容:', e.message);
            }
            
            throw new Error(`API request failed: ${response.status} ${response.statusText}. Content-Type: ${contentType}. Response: ${errorBody}`);
        }

        const contentType = response.headers.get('content-type');
        console.log('Background: 成功响应Content-Type:', contentType);
        
        // 检查响应体是否为空
        const contentLength = response.headers.get('content-length');
        console.log('Background: 响应内容长度:', contentLength);
        
        if (contentLength === '0' || contentLength === null) {
            // 尝试读取响应体
            const responseText = await response.text();
            console.log('Background: 响应体内容:', responseText);
            
            if (!responseText || responseText.trim() === '') {
                console.log('Background: 响应体为空，这可能是API的问题');
                throw new Error('API returned empty response body. This might be an API issue or the encryption parameters are incorrect.');
            }
            
            // 如果有内容但content-length为0，尝试解析
            try {
                const data = JSON.parse(responseText);
                console.log('Background: 成功解析空content-length的JSON响应');
                sendResponse({ 
                    success: true, 
                    data: data 
                });
                return;
            } catch (parseError) {
                console.log('Background: JSON解析失败:', parseError.message);
                throw new Error(`Invalid JSON response: ${parseError.message}. Response text: ${responseText.substring(0, 200)}`);
            }
        }
        
        const data = await response.json();
        console.log('Background: 成功获取数据类型:', typeof data);
        console.log('Background: 数据结构:', Object.keys(data));
        console.log('Background: 字幕数量:', data.subtitles?.length || 0, '自动翻译数量:', data.subtitlesAutoTrans?.length || 0);
        
        if (data.subtitles && data.subtitles.length > 0) {
            console.log('Background: 第一个字幕示例:', data.subtitles[0]);
        }
        
        sendResponse({ 
            success: true, 
            data: data 
        });
        
        console.log('Background: 字幕API请求成功，总耗时:', (Date.now() - startTime) + 'ms');
        
    } catch (error) {
        const endTime = Date.now();
        console.error('Background: 字幕API请求失败，耗时:', (endTime - startTime) + 'ms');
        console.error('Background: 错误详情:', error);
        console.error('Background: 错误堆栈:', error.stack);
        
        sendResponse({ 
            success: false, 
            error: error.message 
        });
    }
}

/**
 * 代理字幕内容下载请求 - 使用和API相同的headers
 */
async function downloadSubtitleContent(url, sendResponse) {
    try {
        console.log('Background: 下载字幕内容:', url);
        
        // 使用和字幕API相同的headers以避免CORS问题
        const headers = {
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "accept-language": "id-ID,id;q=0.9",
            "cache-control": "max-age=0",
            "priority": "u=0, i",
            "sec-ch-ua": '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
            "sec-fetch-dest": "document",
            "sec-fetch-mode": "navigate",
            "sec-fetch-site": "none",
            "sec-fetch-user": "?1",
            "upgrade-insecure-requests": "1",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"
        };
        
        const response = await fetch(url, {
            method: 'GET',
            headers: headers,
            mode: 'cors',
            credentials: 'omit'
        });
        
        console.log('Background: 字幕下载响应状态:', response.status, response.statusText);
        console.log('Background: 字幕下载响应类型:', response.type);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.log('Background: 字幕下载错误响应:', errorText);
            throw new Error(`Download failed: ${response.status} ${response.statusText}`);
        }
        
        const content = await response.text();
        console.log('Background: 字幕内容长度:', content.length);
        console.log('Background: 字幕内容预览:', content.substring(0, 200) + '...');
        
        sendResponse({ 
            success: true, 
            content: content 
        });
        
        console.log('Background: 字幕内容下载成功');
        
    } catch (error) {
        console.error('Background: 字幕内容下载失败:', error);
        sendResponse({ 
            success: false, 
            error: error.message 
        });
    }
}

console.log('YouTube语音助手 Background Service Worker 已启动');

/**
 * 与OpenAI聊天，包含视频字幕上下文
 */
async function chatWithOpenAI(messages, videoContext, sendResponse) {
    try {
        const apiKey = await getStoredApiKey();
        if (!apiKey) {
            sendResponse({ 
                success: false, 
                error: 'OpenAI API key not found. Please set it in the extension popup.' 
            });
            return;
        }

        // 构建系统提示，包含字幕上下文
        let systemPrompt = `You are a helpful YouTube video assistant. You can help users understand and discuss video content.`;
        
        // 如果有字幕数据，添加到上下文中
        if (currentVideoSubtitles.transcript && currentVideoSubtitles.videoId === videoContext?.videoId) {
            systemPrompt += `\n\nYou have access to the full transcript of the current YouTube video "${videoContext.title || 'Unknown Title'}" (Language: ${currentVideoSubtitles.language}).\n\nVideo Transcript:\n${currentVideoSubtitles.transcript}`;
            
            // 如果提供了当前时间，添加相关上下文
            if (videoContext?.currentTime && currentVideoSubtitles.timestamps.length > 0) {
                const relevantSubtitles = getRelevantSubtitlesAtTime(videoContext.currentTime);
                if (relevantSubtitles) {
                    systemPrompt += `\n\nCurrent video position (${formatTime(videoContext.currentTime)}): "${relevantSubtitles}"`;
                }
            }
        }
        
        systemPrompt += `\n\nPlease provide helpful, accurate responses about the video content. If users ask about specific moments or topics, refer to the relevant parts of the transcript.`;

        // 准备消息数组
        const openaiMessages = [
            { role: "system", content: systemPrompt },
            ...messages
        ];

        console.log('Background: 发送OpenAI请求，消息数量:', openaiMessages.length);
        console.log('Background: 系统提示长度:', systemPrompt.length);

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: openaiMessages,
                max_tokens: 1000,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error('OpenAI API Error:', response.status, errorData);
            throw new Error(`OpenAI API error: ${response.status} ${errorData}`);
        }

        const data = await response.json();
        console.log('Background: OpenAI响应成功');

        sendResponse({ 
            success: true, 
            message: data.choices[0].message.content,
            usage: data.usage
        });

    } catch (error) {
        console.error('Error calling OpenAI API:', error);
        sendResponse({ 
            success: false, 
            error: error.message 
        });
    }
}

/**
 * 根据时间获取相关字幕内容
 */
function getRelevantSubtitlesAtTime(currentTime, contextRange = 15) {
    if (!currentVideoSubtitles.timestamps || currentVideoSubtitles.timestamps.length === 0) {
        return null;
    }
    
    const relevantSubs = currentVideoSubtitles.timestamps.filter(sub => 
        sub.start >= currentTime - contextRange && sub.start <= currentTime + contextRange
    );
    
    return relevantSubs.map(sub => sub.text).join(' ');
}

/**
 * 格式化时间显示
 */
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
} 