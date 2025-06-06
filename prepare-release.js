#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🚀 准备发布版本...');

// 读取logger.js文件
const loggerPath = path.join(__dirname, 'chrome-extension/src/utils/logger.js');
let loggerContent = fs.readFileSync(loggerPath, 'utf8');

// 将 IS_DEBUG 设为 false
const originalLine = 'const IS_DEBUG = true; // 🔧 发布时改为 false';
const newLine = 'const IS_DEBUG = false; // 🔧 发布时改为 false';

if (loggerContent.includes(originalLine)) {
    loggerContent = loggerContent.replace(originalLine, newLine);
    fs.writeFileSync(loggerPath, loggerContent);
    console.log('✅ 已将 IS_DEBUG 设为 false');
} else if (loggerContent.includes(newLine)) {
    console.log('ℹ️  IS_DEBUG 已经是 false');
} else {
    console.log('⚠️  未找到 IS_DEBUG 配置行');
}

// 更新版本号（可选）
const manifestPath = path.join(__dirname, 'chrome-extension/manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
console.log(`📦 当前版本: ${manifest.version}`);

console.log('🎉 发布准备完成！现在可以打包上传到Chrome Web Store了');
console.log('📝 记住发布后运行 npm run dev 恢复开发模式'); 