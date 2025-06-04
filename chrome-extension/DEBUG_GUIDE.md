# YouTube语音助手 - 调试指南

## 🐛 CSP错误已修复

**问题:** Chrome扩展的CSP（内容安全策略）禁止内联事件处理器
**解决方案:** 已将所有 `onclick="..."` 改为JavaScript事件监听器

### 修复内容
- ✅ 移除了popup.html中所有内联事件处理器
- ✅ 在popup.js中添加了事件监听器绑定
- ✅ 修复了选择器错误
- ✅ 确保事件绑定在DOM加载后执行

## 🧪 测试方法

### 方法1: 直接测试扩展（推荐）
1. 打开Chrome浏览器
2. 进入 `chrome://extensions/`
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择 `chrome-extension` 文件夹
6. 打开YouTube视频页面测试

### 方法2: 本地服务器测试
```bash
# 进入chrome-extension目录
cd chrome-extension

# 启动测试服务器
python start-test-server.py

# 浏览器会自动打开测试页面
# 或手动访问: http://localhost:8080/test-popup.html
```

## 🔍 调试检查清单

### 1. 检查控制台错误
- 打开Chrome开发者工具 (F12)
- 查看Console标签页
- 确认没有CSP错误

### 2. 验证功能
- [ ] API密钥输入框正常工作
- [ ] 密码显示/隐藏按钮可点击
- [ ] 保存配置按钮响应点击
- [ ] 测试API连接功能正常
- [ ] 使用说明弹窗显示

### 3. 检查权限
```javascript
// 在popup.js中添加调试代码
console.log('Chrome API available:', !!window.chrome);
console.log('Storage API available:', !!window.chrome?.storage);
```

## 🚨 常见问题解决

### 问题1: 按钮点击无响应
**原因:** 事件监听器未正确绑定
**解决:** 检查bindEventListeners()函数是否被调用

### 问题2: API密钥保存失败
**原因:** Chrome storage权限问题
**解决:** 确认manifest.json中有"storage"权限

### 问题3: 扩展图标不显示
**原因:** 图标文件缺失
**解决:** 使用icons/create_icons.html生成图标

## 📝 调试日志

如果需要详细调试，在popup.js开头添加：
```javascript
// 开启调试模式
const DEBUG = true;
const log = DEBUG ? console.log : () => {};

// 使用方式
log('调试信息:', data);
```

## 🔧 重新加载扩展

修改代码后需要重新加载扩展：
1. 进入 `chrome://extensions/`
2. 找到"YouTube Voice Assistant"
3. 点击刷新按钮 🔄
4. 重新测试功能

## ✅ 验证修复

CSP错误应该已经完全解决，你现在应该能够：
- 正常点击所有按钮
- 保存API密钥
- 查看使用统计
- 测试API连接

如果仍有问题，请检查浏览器控制台的具体错误信息。

## 最新修复

### 1. CORS 问题修复 (2024-01-XX)

**问题**: 字幕API返回400错误，OPTIONS预检请求失败
**原因**: Chrome扩展content script的CORS限制
**解决方案**: 
- 通过background script代理请求
- 使用简单headers避免CORS预检
- 移除复杂的headers如authority, origin, referer

### 2. OpenAI API 响应格式修复

**问题**: JSON解析错误 "Unexpected token 'T', "Thanks for"... is not valid JSON"
**原因**: Whisper API在response_format='text'时返回纯文本，不是JSON
**解决方案**: 
- 根据response_format处理不同响应类型
- 默认使用'json'格式获得更多信息
- 添加更好的错误处理

## 调试步骤

### 1. 安装和重新加载扩展

```bash
# 打开Chrome扩展管理页面
chrome://extensions/

# 启用开发者模式，加载解压缩的扩展
# 选择 chrome-extension 文件夹
```

每次修改代码后，点击扩展卡片上的"重新加载"按钮。

### 2. 检查Background Script日志

```bash
# 1. 在扩展管理页面点击扩展卡片上的"Service Worker"
# 2. 查看Console中的日志
# 应该看到:
# "YouTube语音助手 Background Service Worker 已启动"
# "Background: 发起字幕API请求: https://get-info.downsub.com/..."
# "Background: 字幕API请求成功"
```

### 3. 检查Content Script日志

```bash
# 1. 打开YouTube视频页面 (如: https://www.youtube.com/watch?v=dQw4w9WgXcQ)
# 2. 按F12打开开发者工具
# 3. 查看Console选项卡
# 应该看到:
# "YouTube语音助手初始化"
# "字幕加载成功: English, XX 条记录"
```

### 4. 测试字幕功能

在YouTube视频页面，检查：
- 是否出现悬浮的语音助手按钮
- 点击按钮是否能正常录制音频
- 是否显示"加载字幕..."状态

### 5. 常见问题排查

#### 问题1: 仍然出现CORS错误
**检查**: 
- 确保background.js已更新
- 确保重新加载了扩展
- 检查Network选项卡，确认请求是通过background发起的

#### 问题2: OpenAI API错误
**检查**:
- 确保在popup中配置了有效的API Key
- 检查Network选项卡中OpenAI API的响应
- 确认API Key有足够的额度

#### 问题3: 按钮不显示
**检查**:
- 确保在YouTube视频页面 (不是主页或搜索页)
- 检查Console是否有JavaScript错误
- 确认扩展有正确的权限

### 6. 测试视频推荐

使用这些有字幕的YouTube视频进行测试：
- `https://www.youtube.com/watch?v=dQw4w9WgXcQ` (经典测试视频)
- 任何TED演讲视频
- YouTube官方教程视频

### 7. 日志示例

**正常工作的日志应该如下:**

```
// Background Script Console
YouTube语音助手 Background Service Worker 已启动
Background: 发起字幕API请求: https://get-info.downsub.com/eyJjdCI6...
Background: 字幕API请求成功

// Content Script Console (YouTube页面)
YouTube语音助手初始化
字幕加载成功: English (auto-generated), 245 条记录
```

**错误日志示例:**

```
// 如果还有CORS问题:
Background: 字幕API请求失败: Error: API request failed: 400 Bad Request

// 如果OpenAI API有问题:
音频转录失败: Error: 转录API错误: 401 - Invalid API key
```

## 手动测试脚本

在Chrome DevTools Console中运行以下代码来手动测试各个功能：

### 测试字幕提取
```javascript
// 在YouTube视频页面的Console中运行
const extractor = new SubtitleExtractor();
const videoId = extractor.getVideoId();
console.log('Video ID:', videoId);

extractor.getSubtitles(videoId)
  .then(result => console.log('字幕信息:', result))
  .catch(error => console.error('错误:', error));
```

### 测试OpenAI API
```javascript
// 需要先设置API Key
chrome.storage.sync.get(['openai_api_key'], (result) => {
  if (result.openai_api_key) {
    const client = new OpenAIVoiceAssistant(result.openai_api_key);
    
    // 测试对话API
    const messages = [
      {role: 'user', content: '你好，请简单介绍一下自己'}
    ];
    
    client.chatCompletion(messages)
      .then(response => console.log('AI回复:', response))
      .catch(error => console.error('错误:', error));
  } else {
    console.log('请先在扩展popup中设置API Key');
  }
});
``` 