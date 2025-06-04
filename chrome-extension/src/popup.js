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
    
    // 检查当前页面
    await checkCurrentPage();
    
    // 加载当前视频字幕状态
    await loadSubtitleStatus();
    
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
 * 加载当前视频字幕状态
 */
async function loadSubtitleStatus() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url || !tab.url.includes('youtube.com/watch')) {
            return;
        }

        // 显示字幕管理部分
        document.getElementById('subtitleSection').style.display = 'block';

        // 获取当前视频ID
        const urlParams = new URLSearchParams(tab.url.split('?')[1]);
        const videoId = urlParams.get('v');
        
        if (videoId) {
            // 检查是否有手动上传的字幕
            const result = await chrome.storage.local.get([`manual_subtitle_${videoId}`]);
            const manualSubtitle = result[`manual_subtitle_${videoId}`];
            
            const subtitleTextArea = document.getElementById('subtitleText');
            
            if (manualSubtitle) {
                console.log('找到已保存的字幕，videoId:', videoId, '内容长度:', manualSubtitle.content.length);
                updateSubtitleStatus('✅ 已加载手动上传的字幕', 'loaded');
                // 只有在文本框为空时才自动填充，避免覆盖用户正在编辑的内容
                if (!subtitleTextArea.value.trim()) {
                    subtitleTextArea.value = manualSubtitle.content;
                    console.log('已自动填充字幕内容到文本框');
                } else {
                    console.log('文本框不为空，跳过自动填充');
                }
            } else {
                console.log('未找到已保存的字幕，videoId:', videoId);
                updateSubtitleStatus('❌ 当前视频暂无可用字幕', 'empty');
                // 不要自动清空文本框，用户可能正在输入或编辑
            }
        }
    } catch (error) {
        console.error('加载字幕状态失败:', error);
    }
}

/**
 * 更新字幕状态显示
 */
function updateSubtitleStatus(message, type) {
    const statusElement = document.getElementById('subtitleStatus');
    statusElement.textContent = message;
    statusElement.className = `subtitle-status ${type}`;
}

/**
 * 处理文件上传
 */
function handleFileUpload(file) {
    if (!file || !file.name.toLowerCase().endsWith('.srt')) {
        showStatus('请选择SRT格式的字幕文件', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const content = e.target.result;
        document.getElementById('subtitleText').value = content;
        document.getElementById('fileInputLabel').textContent = `📁 已选择: ${file.name}`;
        showStatus('字幕文件读取成功，请点击"保存字幕"', 'success');
    };
    reader.readAsText(file);
}

/**
 * 保存字幕
 */
async function saveSubtitle() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url || !tab.url.includes('youtube.com/watch')) {
            showStatus('请在YouTube视频页面使用此功能', 'error');
            return;
        }

        const urlParams = new URLSearchParams(tab.url.split('?')[1]);
        const videoId = urlParams.get('v');
        const subtitleContent = document.getElementById('subtitleText').value.trim();

        if (!videoId) {
            showStatus('无法获取视频ID', 'error');
            return;
        }

        if (!subtitleContent) {
            showStatus('请输入字幕内容', 'error');
            return;
        }

        // 验证SRT格式
        if (!isValidSRTFormat(subtitleContent)) {
            showStatus('字幕格式不正确，请确保是SRT格式', 'error');
            return;
        }

        // 保存到本地存储
        const subtitleData = {
            videoId: videoId,
            content: subtitleContent,
            timestamp: Date.now()
        };

        await chrome.storage.local.set({
            [`manual_subtitle_${videoId}`]: subtitleData
        });

        // 通知content script字幕已更新
        chrome.tabs.sendMessage(tab.id, {
            action: 'manual_subtitle_uploaded',
            videoId: videoId,
            subtitleData: subtitleData
        });

        updateSubtitleStatus('✅ 字幕保存成功', 'loaded');
        showStatus('字幕保存成功！可以开始语音对话了', 'success');
        
        console.log('字幕保存成功，videoId:', videoId, '内容长度:', subtitleContent.length);

    } catch (error) {
        console.error('保存字幕失败:', error);
        showStatus('保存字幕失败: ' + error.message, 'error');
    }
}

/**
 * 清除字幕
 */
async function clearSubtitle() {
    if (!confirm('确定要清除当前视频的字幕吗？')) {
        return;
    }

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url || !tab.url.includes('youtube.com/watch')) {
            return;
        }

        const urlParams = new URLSearchParams(tab.url.split('?')[1]);
        const videoId = urlParams.get('v');

        if (videoId) {
            // 从存储中删除
            await chrome.storage.local.remove([`manual_subtitle_${videoId}`]);
            
            // 清空文本框
            document.getElementById('subtitleText').value = '';
            document.getElementById('fileInputLabel').textContent = '📁 点击选择SRT文件或拖拽到此处';
            
            // 通知content script字幕已清除
            chrome.tabs.sendMessage(tab.id, {
                action: 'manual_subtitle_cleared',
                videoId: videoId
            });

            updateSubtitleStatus('❌ 当前视频暂无可用字幕', 'empty');
            showStatus('字幕已清除', 'success');
        }
    } catch (error) {
        console.error('清除字幕失败:', error);
        showStatus('清除字幕失败: ' + error.message, 'error');
    }
}

/**
 * 验证SRT格式
 */
function isValidSRTFormat(content) {
    // 简单的SRT格式验证
    const srtPattern = /^\d+\s+\d{2}:\d{2}:\d{2},\d{3}\s+-->\s+\d{2}:\d{2}:\d{2},\d{3}\s+.+/m;
    return srtPattern.test(content);
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
3. 如果自动获取字幕失败，可手动上传SRT字幕文件
4. 点击右侧浮动的🎤按钮
5. 说出您的问题（智能语音检测）
6. AI会自动回答并播放语音

📝 字幕功能：
• 扩展会自动尝试获取视频字幕
• 如果失败，可从 downsub.com 下载SRT文件手动上传
• 支持直接编辑字幕文本
• 每个视频的字幕会单独保存

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
    
    // 测试连接按钮
    document.getElementById('testBtn').addEventListener('click', testConnection);
    
    // 帮助按钮
    document.getElementById('helpBtn').addEventListener('click', openHelp);
    
    // 字幕相关按钮
    document.getElementById('saveSubtitleBtn').addEventListener('click', saveSubtitle);
    document.getElementById('clearSubtitleBtn').addEventListener('click', clearSubtitle);
    
    // 文件上传
    const fileInput = document.getElementById('subtitleFile');
    const fileLabel = document.getElementById('fileInputLabel');
    
    fileInput.addEventListener('change', function(e) {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
        }
    });
    
    // 监听文本框输入，提示用户保存
    const subtitleTextArea = document.getElementById('subtitleText');
    subtitleTextArea.addEventListener('input', function() {
        if (this.value.trim()) {
            updateSubtitleStatus('⚠️ 字幕内容已修改，请点击保存', 'empty');
        }
    });
    
    // 拖拽上传
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
    
    // API密钥输入框回车键
    document.getElementById('apiKey').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            saveApiKey();
        }
    });
}

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

    // 定期更新当前页面状态 (降低频率避免干扰用户编辑)
    setInterval(() => {
        checkCurrentPage();
        // 只在用户未专注于文本框时更新字幕状态
        const subtitleTextArea = document.getElementById('subtitleText');
        if (subtitleTextArea && document.activeElement !== subtitleTextArea) {
            loadSubtitleStatus();
        }
    }, 5000);
}); 