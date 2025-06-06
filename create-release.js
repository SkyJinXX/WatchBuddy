#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// 从manifest.json读取版本号
const manifest = JSON.parse(fs.readFileSync('chrome-extension/manifest.json', 'utf8'));
const version = manifest.version;
const outputDir = 'releases';
const zipName = `watchbuddy-v${version}.zip`;

// 创建输出目录
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

// 创建zip文件
const output = fs.createWriteStream(path.join(outputDir, zipName));
const archive = archiver('zip', {
    zlib: { level: 9 } // 最高压缩级别
});

output.on('close', function() {
    console.log(`✅ Release package created: ${zipName}`);
    console.log(`📦 Total size: ${archive.pointer()} bytes`);
    console.log(`\n🚀 Ready for GitHub Release!`);
    console.log(`\nNext steps:`);
    console.log(`1. Go to your GitHub repository`);
    console.log(`2. Click "Create a new release"`);
    console.log(`3. Tag: v${version}`);
    console.log(`4. Title: WatchBuddy v${version}`);
    console.log(`5. Upload: releases/${zipName}`);
    console.log(`6. Copy content from RELEASE_NOTES.md as description`);
});

archive.on('error', function(err) {
    throw err;
});

archive.pipe(output);

// 添加扩展文件（排除不需要的文件）
console.log('📁 Packaging extension files...');

// 添加chrome-extension目录的所有文件
archive.directory('chrome-extension/', false, (entry) => {
    // 排除不需要的文件
    const excludePatterns = [
        /test-.*\.html$/,
        /DEBUG_GUIDE\.md$/,
        /start-test-server\.py$/,
        /\.git/,
        /node_modules/,
        /\.DS_Store$/,
        /thumbs\.db$/i
    ];
    
    for (const pattern of excludePatterns) {
        if (pattern.test(entry.name)) {
            console.log(`⏭️  Skipping: ${entry.name}`);
            return false;
        }
    }
    
    console.log(`✅ Adding: ${entry.name}`);
    return entry;
});

// 添加说明文件
if (fs.existsSync('README.md')) {
    archive.file('README.md', { name: 'README.md' });
    console.log('✅ Adding: README.md');
}

// 查找对应版本的发布说明文件
const releaseNotesFile = `RELEASE_NOTES_${version}.md`;
if (fs.existsSync(releaseNotesFile)) {
    archive.file(releaseNotesFile, { name: 'RELEASE_NOTES.md' });
    console.log(`✅ Adding: ${releaseNotesFile} as RELEASE_NOTES.md`);
} else if (fs.existsSync('RELEASE_NOTES.md')) {
    archive.file('RELEASE_NOTES.md', { name: 'RELEASE_NOTES.md' });
    console.log('✅ Adding: RELEASE_NOTES.md');
}

if (fs.existsSync('privacy_policy.html')) {
    archive.file('privacy_policy.html', { name: 'privacy_policy.html' });
    console.log('✅ Adding: privacy_policy.html');
}

// 完成打包
archive.finalize(); 