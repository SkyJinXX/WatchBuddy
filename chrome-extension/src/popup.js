/**
 * YouTube语音助手 - Popup界面脚本
 */

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    initPopup();
});

/**
 * 初始化popup界面
 */
async function initPopup() {
    // 加载已保存的API密钥
    await loadApiKey();
    
    // 加载使用统计
    await loadUsageStats();
    
    // 检查当前页面
    await checkCurrentPage();
    
    // 绑定事件监听器
    bindEventListeners();
}

/**
 * 加载已保存的API密钥
 */
async function loadApiKey() {
    try {
        const result = await chrome.storage.sync.get(['openai_api_key']);
        if (result.openai_api_key) {
            document.getElementById('apiKey').value = result.openai_api_key;
            showStatus('API密钥已加载', 'success');
        }
    } catch (error) {
        console.error('加载API密钥失败:', error);
    }
}

/**
 * 保存API密钥
 */
async function saveApiKey() {
    const apiKey = document.getElementById('apiKey').value.trim();
    
    if (!apiKey) {
        showStatus('请输入API密钥', 'error');
        return;
    }
    
    if (!apiKey.startsWith('sk-')) {
        showStatus('API密钥格式不正确，应以sk-开头', 'error');
        return;
    }
    
    try {
        await chrome.storage.sync.set({ openai_api_key: apiKey });
        showStatus('API密钥保存成功！', 'success');
        
        // 通知content script重新初始化
        notifyContentScript();
        
    } catch (error) {
        console.error('保存API密钥失败:', error);
        showStatus('保存失败: ' + error.message, 'error');
    }
}

/**
 * 通知content script重新初始化
 */
async function notifyContentScript() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url && tab.url.includes('youtube.com/watch')) {
            chrome.tabs.sendMessage(tab.id, { 
                action: 'reload_assistant',
                source: 'popup'
            });
        }
    } catch (error) {
        console.log('通知content script失败:', error);
    }
}

/**
 * 加载使用统计
 */
async function loadUsageStats() {
    try {
        const result = await chrome.storage.local.get(['usage_stats']);
        const stats = result.usage_stats || { total: 0, today: 0, lastDate: null };
        
        // 检查是否是新的一天
        const today = new Date().toDateString();
        if (stats.lastDate !== today) {
            stats.today = 0;
            stats.lastDate = today;
            await chrome.storage.local.set({ usage_stats: stats });
        }
        
        document.getElementById('totalQueries').textContent = stats.total;
        document.getElementById('todayQueries').textContent = stats.today;
        
    } catch (error) {
        console.error('加载使用统计失败:', error);
    }
}

/**
 * 清除使用统计
 */
async function clearUsageStats() {
    if (!confirm('确定要清除所有使用统计吗？')) {
        return;
    }
    
    try {
        const stats = { total: 0, today: 0, lastDate: new Date().toDateString() };
        await chrome.storage.local.set({ usage_stats: stats });
        
        document.getElementById('totalQueries').textContent = '0';
        document.getElementById('todayQueries').textContent = '0';
        
        showStatus('统计数据已清除', 'success');
        
    } catch (error) {
        console.error('清除统计失败:', error);
        showStatus('清除失败: ' + error.message, 'error');
    }
}

/**
 * 检查当前页面
 */
async function checkCurrentPage() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const pageStatus = document.getElementById('currentPageStatus');
        const pageUrl = document.getElementById('currentPageUrl');
        
        if (tab && tab.url) {
            if (tab.url.includes('youtube.com/watch')) {
                pageStatus.style.display = 'block';
                pageUrl.textContent = '✅ YouTube视频页面 - 语音助手可用';
                pageUrl.style.color = '#155724';
            } else if (tab.url.includes('youtube.com')) {
                pageStatus.style.display = 'block';
                pageUrl.textContent = '⚠️ YouTube页面但非视频页面';
                pageUrl.style.color = '#856404';
            } else {
                pageStatus.style.display = 'block';
                pageUrl.textContent = '❌ 非YouTube页面 - 语音助手不可用';
                pageUrl.style.color = '#721c24';
            }
        }
    } catch (error) {
        console.error('检查当前页面失败:', error);
    }
}

/**
 * 测试API连接
 */
async function testConnection() {
    const testBtn = document.getElementById('testBtn');
    const apiKey = document.getElementById('apiKey').value.trim();
    
    if (!apiKey) {
        showStatus('请先输入API密钥', 'error');
        return;
    }
    
    testBtn.disabled = true;
    testBtn.textContent = '测试中...';
    
    try {
        const response = await fetch('https://api.openai.com/v1/models', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            showStatus('✅ API连接测试成功！', 'success');
        } else {
            const errorData = await response.json();
            showStatus(`❌ API测试失败: ${errorData.error?.message || '未知错误'}`, 'error');
        }
        
    } catch (error) {
        console.error('API测试失败:', error);
        showStatus(`❌ 网络错误: ${error.message}`, 'error');
    } finally {
        testBtn.disabled = false;
        testBtn.textContent = '测试API连接';
    }
}

/**
 * 显示状态消息
 */
function showStatus(message, type = 'info') {
    const statusElement = document.getElementById('statusMessage');
    statusElement.textContent = message;
    statusElement.className = `status ${type}`;
    statusElement.style.display = 'block';
    
    // 3秒后自动隐藏
    setTimeout(() => {
        statusElement.style.display = 'none';
    }, 3000);
}

/**
 * 切换密码显示/隐藏
 */
function togglePassword() {
    const passwordInput = document.getElementById('apiKey');
    const toggleBtn = document.getElementById('togglePasswordBtn');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleBtn.textContent = '隐藏';
    } else {
        passwordInput.type = 'password';
        toggleBtn.textContent = '显示';
    }
}

/**
 * 打开使用说明
 */
function openHelp() {
    const helpContent = `
🎤 YouTube语音助手使用说明

✨ 功能介绍：
• 在观看YouTube视频时，点击右侧浮动按钮即可语音提问
• AI会基于视频内容和字幕智能回答您的问题
• 支持多语言问答，自动识别语音语言

🚀 使用步骤：
1. 配置OpenAI API密钥（必须）
2. 打开任意YouTube视频页面
3. 点击右侧浮动的🎤按钮
4. 说出您的问题（5秒录音时间）
5. AI会自动回答并播放语音

💡 使用技巧：
• 问题要简洁明了，如："刚才说了什么？"
• 可以询问视频特定内容，如："这个概念是什么意思？"
• 支持上下文对话，可以追问相关问题

⚙️ 注意事项：
• 需要允许浏览器麦克风权限
• 确保网络连接稳定
• API调用会产生费用，请合理使用

❓ 常见问题：
• 如果按钮不显示，请刷新页面
• 如果API报错，请检查密钥配置
• 如果没有声音，请检查音量设置

💰 费用说明：
• 语音转文字：约$0.006/分钟
• AI对话：约$0.0015/1000字符
• 语音合成：约$0.015/1000字符
• 建议设置使用限制避免意外费用
    `;
    
    alert(helpContent);
}

/**
 * 绑定事件监听器
 */
function bindEventListeners() {
    // 保存API密钥按钮
    document.getElementById('saveApiKeyBtn').addEventListener('click', saveApiKey);
    
    // 密码显示/隐藏按钮
    document.getElementById('togglePasswordBtn').addEventListener('click', togglePassword);
    
    // 清除统计按钮
    document.getElementById('clearStatsBtn').addEventListener('click', clearUsageStats);
    
    // 测试连接按钮
    document.getElementById('testBtn').addEventListener('click', testConnection);
    
    // 帮助按钮
    document.getElementById('helpBtn').addEventListener('click', openHelp);
    
    // API密钥输入框回车键
    document.getElementById('apiKey').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            saveApiKey();
        }
    });
}

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'update_usage_stats') {
        loadUsageStats();
    }
});

// 等待DOM加载完成后绑定其他事件监听器
document.addEventListener('DOMContentLoaded', function() {
    // API密钥输入框实时验证
    document.getElementById('apiKey').addEventListener('input', function(e) {
        const value = e.target.value.trim();
        const saveBtn = document.getElementById('saveApiKeyBtn');
        
        if (value.startsWith('sk-') && value.length > 20) {
            saveBtn.style.background = 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)';
            saveBtn.textContent = '保存配置 ✓';
        } else {
            saveBtn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
            saveBtn.textContent = '保存配置';
        }
    });

    // 定期更新当前页面状态
    setInterval(checkCurrentPage, 2000);
}); 