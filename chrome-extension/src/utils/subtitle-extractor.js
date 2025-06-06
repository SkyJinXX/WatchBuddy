/**
 * YouTube字幕提取器
 * 基于reference-get-subtitle.js的核心功能
 */
class SubtitleExtractor {
    constructor() {
        this.SECRET_KEY = "zthxw34cdp6wfyxmpad38v52t3hsz6c5";
        this.API = "https://get-info.downsub.com/";
        this.CryptoJS = window.CryptoJS;
        
        // 完全照抄Tampermonkey脚本的formatJson
        this.formatJson = {
            stringify: function (crp) {
                let result = {
                    ct: crp.ciphertext.toString(CryptoJS.enc.Base64)
                };
                if (crp.iv) {
                    result.iv = crp.iv.toString();
                }
                if (crp.salt) {
                    result.s = crp.salt.toString();
                }
                return JSON.stringify(result);
            },
            parse: function (output) {
                let parse = JSON.parse(output);
                let result = CryptoJS.lib.CipherParams.create({
                    ciphertext: CryptoJS.enc.Base64.parse(parse.ct)
                });
                if (parse.iv) {
                    result.iv = CryptoJS.enc.Hex.parse(parse.iv);
                }
                if (parse.s) {
                    result.salt = CryptoJS.enc.Hex.parse(parse.s);
                }
                return result;
            }
        };
    }

    /**
     * Base64编码转换 - 完全照抄Tampermonkey
     */
    _toBase64(payload) {
        let vBtoa = btoa(payload);
        vBtoa = vBtoa.replace("+", "-");
        vBtoa = vBtoa.replace("/", "_");
        vBtoa = vBtoa.replace("=", "");
        return vBtoa;
    }

    /**
     * Base64解码转换 - 完全照抄Tampermonkey
     */
    _toBinary(base64) {
        let data = base64.replace("-", "+");
        data = data.replace("_", "/");
        const mod4 = data.length % 4;
        if (mod4) {
            data += "====".substring(mod4);
        }
        return atob(data);
    }

    /**
     * 加密数据 - 强制生成IV和salt以匹配工作格式
     */
    _encode(payload, options) {
        Logger.log('SubtitleExtractor: _encode called with payload:', payload, 'type:', typeof payload);
        
        if (!payload) {
            Logger.log('SubtitleExtractor: payload为空，返回false');
            return false;
        }

        try {
            // 强制生成salt和IV，使用全局CryptoJS对象
            const salt = CryptoJS.lib.WordArray.random(64/8);
            const iv = CryptoJS.lib.WordArray.random(128/8);
            
            Logger.log('SubtitleExtractor: 生成 salt:', salt.toString());
            Logger.log('SubtitleExtractor: 生成 iv:', iv.toString());
            
            const encrypted = CryptoJS.AES.encrypt(JSON.stringify(payload), options || this.SECRET_KEY, {
                iv: iv,
                salt: salt,
                format: this.formatJson
            });
            
            const result = encrypted.toString();
            Logger.log('SubtitleExtractor: AES加密结果长度:', result.length);
            
            const finalResult = this._toBase64(result).trim();
            Logger.log('SubtitleExtractor: 最终加密结果长度:', finalResult.length);
            
            return finalResult;
        } catch (error) {
            Logger.error('SubtitleExtractor: 加密过程出错:', error);
            return false;
        }
    }

    /**
     * 解密数据 - 完全照抄Tampermonkey的_decode函数
     */
    _decode(payload, options) {
        if (!payload) {
            return false;
        }

        let result = CryptoJS.AES.decrypt(this._toBinary(payload), options || this.SECRET_KEY, {
            format: this.formatJson
        }).toString(CryptoJS.enc.Utf8);
        return result.trim();
    }

    /**
     * 生成请求数据 - 完全照抄Tampermonkey的_generateData函数
     */
    _generateData(videoId) {
        Logger.log('SubtitleExtractor: _generateData called with videoId:', videoId, 'type:', typeof videoId);
        
        const url = `https://www.youtube.com/watch?v=${videoId}`;
        let id = videoId;
        
        Logger.log('SubtitleExtractor: 构建URL:', url);
        Logger.log('SubtitleExtractor: 加密前的videoId:', id);
        
        return {
            state: 99,
            url: url,
            urlEncrypt: this._encode(url),
            source: 0,
            id: this._encode(id),
            playlistId: null
        };
    }

    /**
     * 解码字幕数组 - 完全照抄Tampermonkey的_decodeArray函数
     */
    _decodeArray(result) {
        let subtitles = [], subtitlesAutoTrans = [];

        if (result?.subtitles && result?.subtitles.length) {
            result.subtitles.forEach((v, i) => {
                let ff = {...v};
                ff.url = this._decode(ff.url).replace(/^"|"$/gi, "");
                ff.enc_url = result.subtitles[i].url;
                
                // 输出解码后的原始YouTube URL，这是真正的字幕内容URL
                Logger.log('SubtitleExtractor: 解码后的原始YouTube字幕URL:', ff.url);
                
                ff.download = {};
                const params = new URLSearchParams({
                    title: encodeURIComponent(ff.name),
                    url: ff.enc_url
                });
                ff.download.srt = result.urlSubtitle + "?" + params.toString();
                
                const params2 = new URLSearchParams({
                    title: encodeURIComponent(ff.name),
                    url: ff.enc_url,
                    type: "txt"
                });
                ff.download.txt = result.urlSubtitle + "?" + params2.toString();
                
                const params3 = new URLSearchParams({
                    title: encodeURIComponent(ff.name),
                    url: ff.enc_url,
                    type: "raw"
                });
                ff.download.raw = result.urlSubtitle + "?" + params3.toString();
                
                // 保存原始YouTube URL以备使用
                ff.youtube_url = ff.url;
                
                subtitles.push(ff);
            });
        }
        
        if (result?.subtitlesAutoTrans && result?.subtitlesAutoTrans.length) {
            result.subtitlesAutoTrans.forEach((v, i) => {
                let ff = {...v};
                ff.url = this._decode(ff.url).replace(/^"|"$/gi, "");
                ff.enc_url = result.subtitlesAutoTrans[i].url;
                
                ff.download = {};
                const params = new URLSearchParams({
                    title: encodeURIComponent(ff.name),
                    url: ff.enc_url
                });
                ff.download.srt = result.urlSubtitle + "?" + params.toString();
                
                const params2 = new URLSearchParams({
                    title: encodeURIComponent(ff.name),
                    url: ff.enc_url,
                    type: "txt"
                });
                ff.download.txt = result.urlSubtitle + "?" + params2.toString();
                
                const params3 = new URLSearchParams({
                    title: encodeURIComponent(ff.name),
                    url: ff.enc_url,
                    type: "raw"
                });
                ff.download.raw = result.urlSubtitle + "?" + params3.toString();
                
                // 保存原始YouTube URL以备使用
                ff.youtube_url = ff.url;
                
                subtitlesAutoTrans.push(ff);
            });
        }

        return Object.assign(result, {subtitles}, {subtitlesAutoTrans});
    }

    /**
     * 获取视频ID
     */
    getVideoId() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('v');
    }

    /**
     * 获取字幕信息 - 照抄Tampermonkey的网络请求逻辑
     */
    async getSubtitles(videoId) {
        if (!videoId) {
            videoId = this.getVideoId();
        }

        if (!videoId) {
            throw new Error('Video ID not found');
        }

        try {
            Logger.log('SubtitleExtractor: 视频ID:', videoId);
            
            const data = this._generateData(videoId);
            Logger.log('SubtitleExtractor: 生成的数据:', data);
            
            const url = `${this.API}${data.id}`;
            Logger.log('SubtitleExtractor: 请求URL:', url);
            
            // 完全使用Tampermonkey的headers，但修正CORS origin
            const headersList = {
                "authority": "get-info.downsub.com",
                "accept": "application/json, text/plain, */*",
                "accept-language": "id-ID,id;q=0.9",
                "origin": "https://member.downsub.com",  // 修正为服务器允许的origin
                "priority": "u=1, i",
                "referer": "https://member.downsub.com/",  // 也修正referer
                "sec-ch-ua": '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": '"Windows"',
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "same-site",
                "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"
            };
            
            // 通过background script发起请求，绕过CORS限制
            const response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    action: 'fetch_subtitles',
                    url: url,
                    headers: headersList
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else if (response.success) {
                        resolve(response.data);
                    } else {
                        reject(new Error(response.error || 'API request failed'));
                    }
                });
            });

            Logger.log('SubtitleExtractor: 原始API响应:', response);
            const decodedResult = this._decodeArray(response);
            Logger.log('SubtitleExtractor: 解码后结果:', decodedResult);
            
            return decodedResult;

        } catch (error) {
            Logger.error('Error fetching subtitles:', error);
            throw error;
        }
    }

    /**
     * 下载字幕内容 - 尝试直接YouTube URL，回退到代理URL
     */
    async downloadSubtitleContent(subtitle, format = 'raw') {
        try {
            // 首先尝试使用原始的YouTube URL
            if (subtitle.youtube_url) {
                Logger.log('SubtitleExtractor: 尝试直接从YouTube下载:', subtitle.youtube_url);
                
                try {
                    const response = await new Promise((resolve, reject) => {
                        chrome.runtime.sendMessage({
                            action: 'download_subtitle_content',
                            url: subtitle.youtube_url
                        }, (response) => {
                            if (chrome.runtime.lastError) {
                                reject(new Error(chrome.runtime.lastError.message));
                            } else if (response.success) {
                                resolve(response.content);
                            } else {
                                reject(new Error(response.error || 'YouTube URL download failed'));
                            }
                        });
                    });

                    Logger.log('SubtitleExtractor: 直接从YouTube下载成功');
                    return response;
                    
                } catch (youtubeError) {
                    Logger.warn('SubtitleExtractor: YouTube直接下载失败，尝试代理URL:', youtubeError.message);
                }
            }
            
            // 回退到代理URL
            let downloadUrl;
            switch(format) {
                case 'srt':
                    downloadUrl = subtitle.download.srt;
                    break;
                case 'txt':
                    downloadUrl = subtitle.download.txt;
                    break;
                case 'raw':
                default:
                    downloadUrl = subtitle.download.raw;
                    break;
            }
            
            Logger.log('SubtitleExtractor: 使用代理URL下载:', downloadUrl);
            
            // 通过background script下载字幕内容
            const response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    action: 'download_subtitle_content',
                    url: downloadUrl
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else if (response.success) {
                        resolve(response.content);
                    } else {
                        reject(new Error(response.error || 'Proxy URL download failed'));
                    }
                });
            });

            return response;
        } catch (error) {
            Logger.error('Error downloading subtitle:', error);
            throw error;
        }
    }

    /**
     * 解析SRT字幕为时间戳数组
     */
    parseSRTToTimestamps(srtContent) {
        const subtitles = [];
        const blocks = srtContent.split(/\n\s*\n/);
        
        for (const block of blocks) {
            const lines = block.trim().split('\n');
            if (lines.length >= 3) {
                const timeMatch = lines[1].match(/(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})/);
                if (timeMatch) {
                    const startTime = this._timeToSeconds(timeMatch[1], timeMatch[2], timeMatch[3], timeMatch[4]);
                    const endTime = this._timeToSeconds(timeMatch[5], timeMatch[6], timeMatch[7], timeMatch[8]);
                    const text = lines.slice(2).join(' ').replace(/<[^>]*>/g, '').trim();
                    
                    subtitles.push({
                        start: startTime,
                        end: endTime,
                        text: text
                    });
                }
            }
        }
        
        return subtitles;
    }

    /**
     * 时间转换为秒
     */
    _timeToSeconds(hours, minutes, seconds, milliseconds) {
        return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds) + parseInt(milliseconds) / 1000;
    }


    /**
     * 解析XML格式字幕为时间戳数组 (YouTube timedtext格式)
     */
    parseXMLToTimestamps(xmlContent) {
        const subtitles = [];
        
        try {
            // 创建DOM解析器
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlContent, "text/xml");
            
            // 获取所有text节点
            const textElements = xmlDoc.getElementsByTagName('text');
            
            for (let i = 0; i < textElements.length; i++) {
                const element = textElements[i];
                const start = parseFloat(element.getAttribute('start') || '0');
                const dur = parseFloat(element.getAttribute('dur') || '0');
                const end = start + dur;
                const text = element.textContent.trim();
                
                if (text) {
                    subtitles.push({
                        start: start,
                        end: end,
                        text: text
                    });
                }
            }
            
            Logger.log(`SubtitleExtractor: 解析XML字幕成功，共${subtitles.length}条字幕`);
            return subtitles;
            
        } catch (error) {
            Logger.error('SubtitleExtractor: XML解析失败:', error);
            // 如果XML解析失败，尝试作为SRT解析
            return this.parseSRTToTimestamps(xmlContent);
        }
    }

    /**
     * 获取完整字幕文本 - 支持XML和SRT格式
     */
    getFullTranscriptFromContent(content) {
        let subtitles = [];
        
        // 检测内容格式
        if (content.trim().startsWith('<?xml') || content.includes('<transcript>')) {
            // XML格式 (YouTube timedtext)
            subtitles = this.parseXMLToTimestamps(content);
        } else {
            // SRT格式
            subtitles = this.parseSRTToTimestamps(content);
        }
        
        // 提取所有文本并合并
        return subtitles.map(sub => sub.text).join(' ');
    }

    /**
     * 获取第一个可用的英文字幕（用于测试）
     */
    async getFirstEnglishSubtitle(videoId) {
        try {
            const subtitleData = await this.getSubtitles(videoId);
            
            // 查找英文字幕
            let englishSubtitle = null;
            
            // 先在原始字幕中查找
            if (subtitleData.subtitles && subtitleData.subtitles.length > 0) {
                englishSubtitle = subtitleData.subtitles.find(sub => 
                    sub.code && (sub.code.toLowerCase().includes('en') || sub.name.toLowerCase().includes('english'))
                );
            }
            
            // 如果没找到，在自动翻译中查找
            if (!englishSubtitle && subtitleData.subtitlesAutoTrans && subtitleData.subtitlesAutoTrans.length > 0) {
                englishSubtitle = subtitleData.subtitlesAutoTrans.find(sub => 
                    sub.code && (sub.code.toLowerCase().includes('en') || sub.name.toLowerCase().includes('english'))
                );
            }
            
            // 如果还没找到，使用第一个可用字幕
            if (!englishSubtitle) {
                if (subtitleData.subtitles && subtitleData.subtitles.length > 0) {
                    englishSubtitle = subtitleData.subtitles[0];
                } else if (subtitleData.subtitlesAutoTrans && subtitleData.subtitlesAutoTrans.length > 0) {
                    englishSubtitle = subtitleData.subtitlesAutoTrans[0];
                }
            }
            
            if (!englishSubtitle) {
                throw new Error('No subtitles available');
            }
            
            Logger.log('SubtitleExtractor: 找到字幕:', englishSubtitle.name, englishSubtitle.code);
            
            // 下载字幕内容
            const content = await this.downloadSubtitleContent(englishSubtitle, 'raw');
            Logger.log('SubtitleExtractor: 字幕内容长度:', content.length);
            Logger.log('SubtitleExtractor: 字幕内容预览:', content.substring(0, 500) + '...');
            
            return {
                subtitle: englishSubtitle,
                content: content
            };
            
        } catch (error) {
            Logger.error('Error getting English subtitle:', error);
            throw error;
        }
    }
}

// 导出为全局变量
window.SubtitleExtractor = SubtitleExtractor; 