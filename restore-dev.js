#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔧 恢复开发模式...');

// 读取logger.js文件
const loggerPath = path.join(__dirname, 'chrome-extension/src/utils/logger.js');
let loggerContent = fs.readFileSync(loggerPath, 'utf8');

// 将 IS_DEBUG 设为 true
const originalLine = 'const IS_DEBUG = false; // 🔧 发布时改为 false';
const newLine = 'const IS_DEBUG = true; // 🔧 发布时改为 false';

if (loggerContent.includes(originalLine)) {
    loggerContent = loggerContent.replace(originalLine, newLine);
    fs.writeFileSync(loggerPath, loggerContent);
    console.log('✅ 已将 IS_DEBUG 设为 true');
} else if (loggerContent.includes(newLine)) {
    console.log('ℹ️  IS_DEBUG 已经是 true');
} else {
    console.log('⚠️  未找到 IS_DEBUG 配置行');
}

console.log('🎉 开发模式已恢复！现在可以看到所有调试日志了'); 