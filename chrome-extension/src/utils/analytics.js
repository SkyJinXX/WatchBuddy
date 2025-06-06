/**
 * Google Analytics 4 - 匿名统计工具
 * 用于统计扩展使用情况，不收集个人信息
 */

class Analytics {
    constructor() {
        this.MEASUREMENT_ID = 'G-E0X90GKJ41';
        this.API_SECRET = 'b_8WHeDnT1iM-riUc3Tw-g';
        this.BASE_URL = 'https://www.google-analytics.com/mp/collect';
        this.clientId = null;
        this.sessionId = null;
        this.enabled = true; // 默认启用，用户可以在设置中关闭
    }

    /**
     * 初始化Analytics
     */
    async init() {
        try {
            // 检查扩展上下文是否有效
            if (!this.isExtensionContextValid()) {
                Logger.log('Analytics: Extension context invalid, skipping initialization');
                this.enabled = false;
                return;
            }

            // 检查用户是否同意统计
            const settings = await chrome.storage.sync.get(['analytics_enabled']);
            this.enabled = settings.analytics_enabled !== false; // 默认启用

            if (!this.enabled) {
                Logger.log('Analytics: Disabled by user');
                return;
            }

            // 获取或生成匿名客户端ID
            await this.initClientId();
            
            // 生成会话ID
            this.sessionId = this.generateSessionId();
            
            Logger.log('Analytics: Initialized successfully');
        } catch (error) {
            if (error.message.includes('Extension context invalidated')) {
                Logger.log('Analytics: Extension context invalidated, disabling analytics');
                this.enabled = false;
            } else {
                Logger.error('Analytics: Initialization failed:', error);
            }
        }
    }

    /**
     * 检查扩展上下文是否有效
     */
    isExtensionContextValid() {
        try {
            return !!(chrome && chrome.runtime && chrome.runtime.id);
        } catch (error) {
            return false;
        }
    }

    /**
     * 获取或生成匿名客户端ID
     */
    async initClientId() {
        try {
            if (!this.isExtensionContextValid()) {
                this.clientId = this.generateClientId();
                return;
            }

            const stored = await chrome.storage.local.get(['analytics_client_id']);
            
            if (stored.analytics_client_id) {
                this.clientId = stored.analytics_client_id;
            } else {
                // 生成匿名客户端ID
                this.clientId = this.generateClientId();
                await chrome.storage.local.set({ 
                    analytics_client_id: this.clientId 
                });
            }
        } catch (error) {
            if (error.message.includes('Extension context invalidated')) {
                Logger.log('Analytics: Extension context invalidated, using temporary client ID');
                this.clientId = this.generateClientId();
                this.enabled = false;
            } else {
                Logger.error('Analytics: Failed to init client ID:', error);
                this.clientId = this.generateClientId();
            }
        }
    }

    /**
     * 生成匿名客户端ID
     */
    generateClientId() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * 生成会话ID
     */
    generateSessionId() {
        return Date.now().toString();
    }

    /**
     * 发送事件到Google Analytics
     */
    async sendEvent(eventName, parameters = {}) {
        if (!this.enabled || !this.clientId) {
            return;
        }

        try {
            const payload = {
                client_id: this.clientId,
                events: [{
                    name: eventName,
                    params: {
                        session_id: this.sessionId,
                        engagement_time_msec: 100,
                        ...parameters
                    }
                }]
            };

            // 检查是否在扩展环境中
            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                // 在扩展中，通过background script发送
                const response = await new Promise((resolve) => {
                    chrome.runtime.sendMessage({
                        action: 'send_analytics',
                        payload: payload,
                        measurementId: this.MEASUREMENT_ID,
                        apiSecret: this.API_SECRET
                    }, resolve);
                });

                if (response && response.success) {
                    Logger.log(`Analytics: Event sent - ${eventName}`, parameters);
                } else {
                    Logger.error('Analytics: Failed to send event', response?.error || 'Unknown error');
                }
            } else {
                // 在测试环境中，直接发送
                const url = `${this.BASE_URL}?measurement_id=${this.MEASUREMENT_ID}&api_secret=${this.API_SECRET}`;

                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    Logger.log(`Analytics: Event sent - ${eventName}`, parameters);
                } else {
                    Logger.error('Analytics: Failed to send event', response.status);
                }
            }
        } catch (error) {
            Logger.error('Analytics: Error sending event:', error);
        }
    }

    /**
     * 记录扩展首次安装
     */
    async trackInstall() {
        try {
            if (!this.isExtensionContextValid() || !this.enabled) {
                Logger.log('Analytics: Context invalid or disabled, skipping install tracking');
                return;
            }

            // 检查是否已经记录过安装
            const installTracked = await chrome.storage.local.get(['install_tracked']);
            
            if (!installTracked.install_tracked) {
                await this.sendEvent('extension_install', {
                    extension_version: chrome.runtime.getManifest().version,
                    platform: 'chrome',
                    install_date: new Date().toISOString()
                });
                
                // 标记已记录安装
                await chrome.storage.local.set({ install_tracked: true });
                Logger.log('Analytics: First-time installation tracked');
            } else {
                Logger.log('Analytics: Installation already tracked, skipping');
            }
        } catch (error) {
            if (error.message.includes('Extension context invalidated')) {
                Logger.log('Analytics: Extension context invalidated, cannot track install');
            } else {
                Logger.error('Analytics: Failed to track install:', error);
            }
        }
    }

    /**
     * 记录语音询问
     */
    async trackVoiceQuery(success = true) {
        if (!this.enabled || !this.isExtensionContextValid()) {
            return;
        }
        
        try {
            await this.sendEvent('voice_query', {
                success: success,
                timestamp: Date.now()
            });
        } catch (error) {
            Logger.log('Analytics: Failed to track voice query:', error.message);
        }
    }

    /**
     * 记录字幕加载
     */
    async trackSubtitleLoad(source = 'api', fromCache = false) {
        if (!this.enabled || !this.isExtensionContextValid()) {
            return;
        }
        
        try {
            await this.sendEvent('subtitle_load', {
                subtitle_source: source, // 'api', 'manual'
                from_cache: fromCache, // true/false
                load_type: fromCache ? `${source}_cached` : source, // 'api', 'manual', 'api_cached', 'manual_cached'
                timestamp: Date.now()
            });
        } catch (error) {
            Logger.log('Analytics: Failed to track subtitle load:', error.message);
        }
    }

    /**
     * 记录错误
     */
    async trackError(errorType, errorMessage) {
        if (!this.enabled || !this.isExtensionContextValid()) {
            return;
        }
        
        try {
            await this.sendEvent('extension_error', {
                error_type: errorType,
                error_category: this.categorizeError(errorType),
                timestamp: Date.now()
            });
        } catch (error) {
            Logger.log('Analytics: Failed to track error:', error.message);
        }
    }

    /**
     * 错误分类
     */
    categorizeError(errorType) {
        if (errorType.includes('api') || errorType.includes('openai')) {
            return 'api_error';
        } else if (errorType.includes('subtitle')) {
            return 'subtitle_error';
        } else if (errorType.includes('voice') || errorType.includes('vad')) {
            return 'voice_error';
        } else {
            return 'general_error';
        }
    }

    /**
     * 设置统计开关
     */
    async setEnabled(enabled) {
        this.enabled = enabled;
        await chrome.storage.sync.set({ analytics_enabled: enabled });
        Logger.log(`Analytics: ${enabled ? 'Enabled' : 'Disabled'}`);
    }

    /**
     * 获取统计状态
     */
    async isEnabled() {
        const settings = await chrome.storage.sync.get(['analytics_enabled']);
        return settings.analytics_enabled !== false;
    }
}

// 导出到全局
window.Analytics = Analytics; 