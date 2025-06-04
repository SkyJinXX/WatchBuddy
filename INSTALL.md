# 🚀 YouTube语音助手 - 安装配置指南

## 📋 安装前准备

### 1. 系统要求
- Chrome浏览器 88+ 版本
- 稳定的网络连接
- 有效的OpenAI API账户

### 2. 获取OpenAI API密钥

1. 访问 [OpenAI Platform](https://platform.openai.com/)
2. 登录或创建账户
3. 进入 [API Keys](https://platform.openai.com/api-keys) 页面
4. 点击 "Create new secret key"
5. 复制生成的密钥 (格式: `sk-...`)
6. **重要**: 妥善保存密钥，离开页面后无法再次查看

## 🔧 安装步骤

### 方法一: 开发者模式安装 (推荐)

#### 1. 下载项目
```bash
# 选择以下任一方式下载:

# 1. Git克隆 (推荐)
git clone https://github.com/your-username/youtube-voice-assistant.git
cd youtube-voice-assistant

# 2. 直接下载ZIP
# 访问GitHub页面，点击 "Code" -> "Download ZIP"
# 解压到本地文件夹
```

#### 2. 准备图标文件 (重要)
```bash
# 进入icons目录
cd icons

# 添加以下三个图标文件:
# icon16.png (16x16像素)
# icon48.png (48x48像素)  
# icon128.png (128x128像素)

# 可以使用icons/README.md中提供的SVG代码生成
```

#### 3. 加载到Chrome
1. 打开Chrome浏览器
2. 地址栏输入: `chrome://extensions/`
3. 开启右上角 **"开发者模式"** 开关
4. 点击 **"加载已解压的扩展程序"**
5. 选择项目根目录 (`VideoWatchingAssistant/`)
6. 扩展安装完成！

### 方法二: Chrome Web Store安装 (即将上线)
```
🚧 正在准备上架Chrome Web Store
📅 预计上线时间: 2024年Q1
```

## ⚙️ 配置步骤

### 1. 基础配置

1. **打开配置面板**
   - 点击Chrome工具栏中的扩展图标
   - 或者在 `chrome://extensions/` 中找到并点击

2. **配置API密钥**
   ```
   📝 在配置面板中:
   1. 输入OpenAI API密钥 (sk-...)
   2. 点击 "保存配置"
   3. 点击 "测试API连接" 验证
   ```

3. **权限确认**
   - 扩展会请求以下权限：
     - 🌐 访问YouTube页面
     - 🎤 麦克风权限 (首次使用时)
     - 💾 本地存储权限
   - 请全部**允许**以确保功能正常

### 2. 首次使用

1. **打开YouTube视频**
   ```
   📺 访问任意YouTube视频页面
   例如: https://www.youtube.com/watch?v=dQw4w9WgXcQ
   ```

2. **查找语音按钮**
   ```
   🔍 在页面右侧寻找紫色的🎤浮动按钮
   如果没有看到，请刷新页面或检查控制台错误
   ```

3. **测试功能**
   ```
   🎤 点击按钮 -> 说出问题 -> 等待AI回复
   例如说: "Can you repeat what he just said?"
   ```

## 🔍 故障排除

### 问题1: 扩展加载失败
```
❌ 错误: "无法加载扩展"
✅ 解决:
1. 确认已开启开发者模式
2. 检查manifest.json是否存在
3. 查看错误详情并修复语法错误
```

### 问题2: API密钥无效
```
❌ 错误: "API密钥无效"
✅ 解决:
1. 确认密钥格式正确 (sk-...)
2. 检查密钥是否过期
3. 验证OpenAI账户余额
4. 确认密钥有正确的权限
```

### 问题3: 按钮不显示
```
❌ 错误: 浮动按钮不出现
✅ 解决:
1. 确认在YouTube视频页面 (/watch?v=...)
2. 刷新页面重新加载
3. 检查浏览器控制台错误
4. 确认扩展已启用
```

### 问题4: 麦克风权限
```
❌ 错误: "麦克风权限被拒绝"
✅ 解决:
1. 点击地址栏左侧的🔒图标
2. 设置麦克风权限为"允许"
3. 刷新页面重试
```

### 问题5: 字幕获取失败
```
❌ 错误: "无法获取字幕"
✅ 解决:
1. 确认视频有可用字幕
2. 尝试切换到有字幕的视频
3. 检查网络连接
4. 稍后重试 (可能是API限制)
```

## 📊 验证安装

### 1. 功能检查清单
- [ ] 扩展在 `chrome://extensions/` 中显示
- [ ] API密钥配置成功
- [ ] YouTube页面出现🎤按钮
- [ ] 点击按钮可以录音
- [ ] AI能够回复问题
- [ ] 语音播放正常

### 2. 测试用例
```javascript
// 1. 基础功能测试
用户输入: "Hello, can you hear me?"
预期输出: AI的英文回复

// 2. 视频相关测试  
用户输入: "What is this video about?"
预期输出: 基于视频内容的回答

// 3. 字幕相关测试
用户输入: "Can you repeat what he just said?"
预期输出: 基于当前时间点字幕的回答
```

## 🔧 高级配置

### 1. 自定义设置
在 `src/utils/openai-client.js` 中修改默认配置:

```javascript
// 修改录音时长 (默认5秒)
const audioBlob = await this.recordAudio(10000); // 10秒

// 修改AI回复长度
max_tokens: 300, // 默认200

// 修改语音声音
voice: 'nova', // 默认alloy
```

### 2. 调试模式
```javascript
// 在控制台中启用详细日志
localStorage.setItem('yva_debug', 'true');

// 查看详细信息
console.log(window.voiceAssistant);
```

### 3. 数据管理
```javascript
// 清除所有存储数据
chrome.storage.sync.clear();
chrome.storage.local.clear();

// 查看存储使用情况
chrome.storage.sync.getBytesInUse();
```

## 📞 技术支持

### 获取帮助
1. 📚 查看 [README.md](README.md) 详细文档
2. 🐛 在 [GitHub Issues](https://github.com/your-username/youtube-voice-assistant/issues) 报告问题
3. 💬 参与 [GitHub Discussions](https://github.com/your-username/youtube-voice-assistant/discussions)

### 常用命令
```bash
# 查看扩展日志
# 在YouTube页面按F12，查看Console标签

# 重新加载扩展
# 在chrome://extensions/中点击刷新按钮

# 卸载扩展
# 在chrome://extensions/中点击移除按钮
```

## 🎉 安装完成

恭喜！您已成功安装YouTube语音助手。现在可以：

1. 🎥 打开任意YouTube视频
2. 🎤 点击浮动按钮开始对话
3. 🤖 享受AI助手带来的学习体验

---

💡 **提示**: 首次使用建议选择有英文字幕的视频进行测试，效果会更好。

�� **开始您的智能学习之旅吧！** 