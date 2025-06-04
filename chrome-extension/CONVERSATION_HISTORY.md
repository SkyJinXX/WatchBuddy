# 多视频对话历史管理系统

## 概述

Chrome扩展的OpenAI语音助手现在支持多视频独立对话历史管理。用户可以在多个YouTube视频标签页之间切换，每个视频维护独立的对话历史，只有在页面刷新或关闭时才会清理缓存。

## 主要特性

### 1. 独立对话历史
- 每个YouTube视频ID维护独立的对话历史
- 支持在多个视频标签页之间无缝切换
- 自动恢复之前视频的对话上下文

### 2. 智能缓存管理
- 最多缓存5个视频的对话历史（可配置）
- 使用LRU（最近最少使用）策略自动清理旧对话
- 每个视频最多保留20条对话记录

### 3. 页面生命周期管理
- 页面刷新时清理所有对话历史
- 页面关闭时自动释放资源
- 标签页切换时保持对话历史

## API使用说明

### 基本用法

```javascript
// 初始化助手
const assistant = new OpenAIVoiceAssistant(apiKey);

// 切换到新视频
assistant.switchToVideo('video_id_123');

// 进行对话（会自动管理历史）
const context = {
    videoId: 'video_id_123',
    videoTitle: '视频标题',
    currentTime: 120,
    relevantSubtitles: '相关字幕...',
    fullTranscript: '完整转录...'
};

const messages = assistant.buildYouTubeAssistantMessages('用户问题', context);
const response = await assistant.chatCompletion(messages);
```

### 高级功能

```javascript
// 获取当前视频对话历史
const history = assistant.getCurrentConversationHistory();

// 重置特定视频的对话历史
assistant.resetVideoConversation('video_id_123');

// 获取所有视频的摘要信息
const summary = assistant.getAllVideosSummary();

// 清除所有对话历史
assistant.clearAllConversations();

// 导出当前视频的对话历史
const exported = assistant.exportConversationHistory();
```

## 配置选项

```javascript
class OpenAIVoiceAssistant {
    constructor(apiKey) {
        // ...
        this.maxHistoryLength = 20;  // 每个视频最多保留的对话记录数
        this.maxVideoCount = 5;      // 最多缓存的视频数量
    }
}
```

## 内部实现

### 数据结构

```javascript
// 多视频对话历史存储
this.videoConversations = new Map(); // videoId -> conversation history[]

// 单个对话记录格式
{
    role: 'user' | 'assistant',
    content: '消息内容',
    timestamp: 1234567890123
}
```

### LRU缓存策略

当缓存的视频数量超过限制时，系统会自动删除最久未使用的视频对话历史：

```javascript
cleanupOldConversations() {
    const videoIds = Array.from(this.videoConversations.keys());
    const oldestVideoId = videoIds[0]; // Map保持插入顺序
    this.videoConversations.delete(oldestVideoId);
}
```

### 页面生命周期管理

```javascript
setupCleanupListener() {
    // 页面卸载时清理所有对话
    window.addEventListener('beforeunload', () => {
        this.clearAllConversations();
    });
    
    // 监听页面可见性变化
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            // 页面隐藏，保持对话历史
        } else {
            // 页面显示，恢复对话历史
        }
    });
}
```

## 向后兼容性

为了保持向后兼容，保留了旧版API：

```javascript
// ⚠️ 已弃用，但仍可使用
assistant.resetConversation(videoId);  // 使用 resetVideoConversation 代替
assistant.checkVideoChange(videoId);   // 使用 switchToVideo 代替
```

## 测试

使用 `test-conversation.html` 可以测试多视频对话历史功能：

1. 初始化助手
2. 在不同模拟视频之间切换
3. 进行对话测试
4. 查看对话历史和摘要
5. 测试重置和清理功能

## 最佳实践

1. **及时切换视频上下文**：在处理新视频的对话前调用 `switchToVideo()`
2. **合理设置缓存限制**：根据用户使用习惯调整 `maxVideoCount` 和 `maxHistoryLength`
3. **监控内存使用**：对于长时间使用的场景，定期检查缓存大小
4. **错误处理**：确保在视频ID为空或无效时有合适的降级处理

## 性能考虑

- 使用Map数据结构提供O(1)的查找性能
- LRU策略避免内存无限增长
- 页面生命周期管理确保资源及时释放
- 每个视频的对话历史独立管理，避免相互影响 