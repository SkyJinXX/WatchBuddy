// YouTube Watching Assistant - Debug Logger
// 生产环境请将 IS_DEBUG 设为 false

const IS_DEBUG = false; // 🔧 发布时改为 false

class Logger {
    static log(...args) {
        if (IS_DEBUG) {
            console.log('[YVA]', ...args);
        }
    }

    static error(...args) {
        if (IS_DEBUG) {
            console.error('[YVA Error]', ...args);
        } else {
            // 生产环境仍然记录错误，但不在控制台显示
            console.error('[YVA Error]', ...args);
        }
    }

    static warn(...args) {
        if (IS_DEBUG) {
            console.warn('[YVA Warn]', ...args);
        }
    }

    static debug(...args) {
        if (IS_DEBUG) {
            console.debug('[YVA Debug]', ...args);
        }
    }

    static info(...args) {
        if (IS_DEBUG) {
            console.info('[YVA Info]', ...args);
        }
    }

    // 调试面板相关
    static get isDebugMode() {
        return IS_DEBUG;
    }

    // 创建调试面板的帮助方法
    static createDebugPanel(containerId, content) {
        if (!IS_DEBUG) return null;
        
        const container = document.getElementById(containerId);
        if (!container) return null;
        
        const debugPanel = document.createElement('div');
        debugPanel.className = 'debug-panel';
        debugPanel.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 10px;
            border-radius: 5px;
            font-family: monospace;
            font-size: 12px;
            z-index: 99999;
            max-width: 300px;
            max-height: 400px;
            overflow: auto;
        `;
        debugPanel.innerHTML = content;
        
        document.body.appendChild(debugPanel);
        return debugPanel;
    }
}

// 导出给其他文件使用
window.Logger = Logger; 