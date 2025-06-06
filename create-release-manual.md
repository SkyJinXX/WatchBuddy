# Manual Release Creation Guide

## 📦 Quick Steps

### 1. Prepare for Release
```bash
# 切换到发布模式（移除debug日志）
npm run release
```

### 2. 手动创建ZIP包
创建一个新文件夹，包含以下文件：

```
watchbuddy-v0.5.0/
├── manifest.json
├── src/
│   ├── content.js
│   ├── background.js
│   ├── popup.html
│   ├── popup.js
│   ├── styles.css
│   └── utils/
│       ├── logger.js
│       ├── openai-client.js
│       ├── voice-recorder.js
│       ├── subtitle-extractor.js
│       ├── crypto-js.min.js
│       ├── ort.js
│       └── vad-web.js
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── README.md
├── RELEASE_NOTES.md
└── privacy_policy.html
```

### 3. 要排除的文件
❌ 不要包含这些文件：
- `test-*.html` (测试文件)
- `DEBUG_GUIDE.md`
- `start-test-server.py`
- `prepare-release.js` / `restore-dev.js`
- `create-release.js`
- `.git` 文件夹
- `node_modules`

### 4. 创建ZIP
1. 选择所有需要的文件
2. 右键 → "压缩为ZIP"
3. 命名为 `watchbuddy-v0.5.0.zip`

### 5. 验证ZIP内容
解压ZIP确认：
- ✅ manifest.json存在且正确
- ✅ 所有src文件和utils文件都在
- ✅ icons文件夹完整
- ✅ 没有测试或开发文件

## 🚀 GitHub Release Steps

### 1. 创建Release
1. 去GitHub仓库页面
2. 点击 "Releases" → "Create a new release"

### 2. 填写信息
- **Tag**: `v0.5.0`
- **Title**: `WatchBuddy v0.5.0`
- **Description**: 复制 `RELEASE_NOTES.md` 的内容

### 3. 上传文件
- 拖拽 `watchbuddy-v0.5.0.zip` 到上传区域
- 可选：也上传 `privacy_policy.html`

### 4. 发布
- 勾选 "This is a pre-release" (可选，如果还在测试阶段)
- 点击 "Publish release"

## 📝 Release后的推广

### 发布后可以：
1. **Reddit分享**: r/chrome_extensions, r/YouTubeTools
2. **Product Hunt**: 提交新产品
3. **社交媒体**: Twitter, LinkedIn等
4. **技术社区**: Hacker News, Dev.to
5. **博客文章**: 写一篇介绍文章

### 用户安装说明链接：
```
https://github.com/yourusername/VideoWatchingAssistant/releases/tag/v0.5.0
```

用户点击下载ZIP，按照安装说明即可使用！ 