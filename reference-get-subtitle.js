// ==UserScript==
// @name         YouTube Enhancer (Subtitle Downloader)
// @description  Download Subtitles in Various Languages.
// @icon         https://raw.githubusercontent.com/exyezed/youtube-enhancer/refs/heads/main/extras/youtube-enhancer.png
// @version      1.4
// @author       exyezed
// @namespace    https://github.com/exyezed/youtube-enhancer/
// @supportURL   https://github.com/exyezed/youtube-enhancer/issues
// @license      MIT
// @match        https://www.youtube.com/*
// @match        https://youtube.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @require      https://cdn.jsdelivr.net/npm/crypto-js@4.1.1/crypto-js.min.js
// @connect      get-info.downsub.com
// @connect      download.subtitle.to
// @run-at       document-idle
// ==/UserScript==
 
(function() {
    'use strict';
    
    const SECRET_KEY = "zthxw34cdp6wfyxmpad38v52t3hsz6c5";
    const API = "https://get-info.downsub.com/";
    
    const CryptoJS = window.CryptoJS;
    const GM_download = window.GM_download;
    const GM_xmlhttpRequest = window.GM_xmlhttpRequest;
 
    const formatJson = {
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
    
    function _toBase64(payload) {
        let vBtoa = btoa(payload);
        vBtoa = vBtoa.replace("+", "-");
        vBtoa = vBtoa.replace("/", "_");
        vBtoa = vBtoa.replace("=", "");
        return vBtoa;
    }
    
    function _toBinary(base64) {
        let data = base64.replace("-", "+");
        data = data.replace("_", "/");
        const mod4 = data.length % 4;
        if (mod4) {
            data += "====".substring(mod4);
        }
        return atob(data);
    }
    
    function _encode(payload, options) {
        if (!payload) {
            return false;
        }
    
        let result = CryptoJS.AES.encrypt(JSON.stringify(payload), options || SECRET_KEY, {
            format: formatJson
        }).toString();
        return _toBase64(result).trim();
    }
    
    function _decode(payload, options) {
        if (!payload) {
            return false;
        }
    
        let result = CryptoJS.AES.decrypt(_toBinary(payload), options || SECRET_KEY, {
            format: formatJson
        }).toString(CryptoJS.enc.Utf8);
        return result.trim();
    }
    
    function _generateData(videoId) {
        const url = `https://www.youtube.com/watch?v=${videoId}`;
        let id = videoId;
        
        return {
            state: 99,
            url: url,
            urlEncrypt: _encode(url),
            source: 0,
            id: _encode(id),
            playlistId: null
        };
    }
    
    function _decodeArray(result) {
        let subtitles = [], subtitlesAutoTrans = [];
    
        if (result?.subtitles && result?.subtitles.length) {
            result.subtitles.forEach((v, i) => {
                let ff = {...v};
                ff.url = _decode(ff.url).replace(/^"|"$/gi, "");
                ff.enc_url = result.subtitles[i].url;
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
                subtitles.push(ff);
            });
        }
        
        if (result?.subtitlesAutoTrans && result?.subtitlesAutoTrans.length) {
            result.subtitlesAutoTrans.forEach((v, i) => {
                let ff = {...v};
                ff.url = _decode(ff.url).replace(/^"|"$/gi, "");
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
                subtitlesAutoTrans.push(ff);
            });
        }
    
        return Object.assign(result, {subtitles}, {subtitlesAutoTrans});
    }
 
    function createSVGIcon(className, isHover = false) {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
 
        svg.setAttribute("viewBox", "0 0 576 512");
        svg.classList.add(className);
 
        path.setAttribute("d", isHover
            ? "M64 32C28.7 32 0 60.7 0 96L0 416c0 35.3 28.7 64 64 64l448 0c35.3 0 64-28.7 64-64l0-320c0-35.3-28.7-64-64-64L64 32zm56 208l176 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-176 0c-13.3 0-24-10.7-24-24s10.7-24 24-24zm256 0l80 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-80 0c-13.3 0-24-10.7-24-24s10.7-24 24-24zM120 336l80 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-80 0c-13.3 0-24-10.7-24-24s10.7-24 24-24zm160 0l176 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-176 0c-13.3 0-24-10.7-24-24s10.7-24 24-24z"
            : "M64 80c-8.8 0-16 7.2-16 16l0 320c0 8.8 7.2 16 16 16l448 0c8.8 0 16-7.2 16-16l0-320c0-8.8-7.2-16-16-16L64 80zM0 96C0 60.7 28.7 32 64 32l448 0c35.3 0 64 28.7 64 64l0 320c0 35.3-28.7 64-64 64L64 480c-35.3 0-64-28.7-64-64L0 96zM120 240l176 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-176 0c-13.3 0-24-10.7-24-24s10.7-24 24-24zm256 0l80 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-80 0c-13.3 0-24-10.7-24-24s10.7-24 24-24zM120 336l80 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-80 0c-13.3 0-24-10.7-24-24s10.7-24 24-24zm160 0l176 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-176 0c-13.3 0-24-10.7-24-24s10.7-24 24-24z"
        );
 
        svg.appendChild(path);
        return svg;
    }
 
    function createSearchIcon() {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("width", "16");
        svg.setAttribute("height", "16");
        
        path.setAttribute("d", "M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z");
        
        svg.appendChild(path);
        return svg;
    }
 
    function createCheckIcon() {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.classList.add("check-icon");
        
        path.setAttribute("d", "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z");
        
        svg.appendChild(path);
        return svg;
    }
 
    function getVideoId() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('v');
    }
 
 
    function downloadSubtitle(url, filename, format, buttonElement) {
        try {
            const buttonHeight = buttonElement.offsetHeight;
            const buttonWidth = buttonElement.offsetWidth;
            
            const originalChildren = Array.from(buttonElement.childNodes).map(node => node.cloneNode(true));
            
            while (buttonElement.firstChild) {
                buttonElement.removeChild(buttonElement.firstChild);
            }
            
            buttonElement.style.height = `${buttonHeight}px`;
            buttonElement.style.width = `${buttonWidth}px`;
            
            const spinner = document.createElement('div');
            spinner.className = 'button-spinner';
            buttonElement.appendChild(spinner);
            buttonElement.disabled = true;
            
            GM_download({
                url: url,
                name: filename,
                onload: function() {
                    while (buttonElement.firstChild) {
                        buttonElement.removeChild(buttonElement.firstChild);
                    }
                    
                    buttonElement.appendChild(createCheckIcon());
                    buttonElement.classList.add('download-success');
                    
                    setTimeout(() => {
                        while (buttonElement.firstChild) {
                            buttonElement.removeChild(buttonElement.firstChild);
                        }
                        
                        originalChildren.forEach(child => {
                            buttonElement.appendChild(child.cloneNode(true));
                        });
                        
                        buttonElement.disabled = false;
                        buttonElement.classList.remove('download-success');
                        
                        buttonElement.style.height = '';
                        buttonElement.style.width = '';
                    }, 1500);
                },
                onerror: function(error) {
                    console.error('Download error:', error);
                    
                    while (buttonElement.firstChild) {
                        buttonElement.removeChild(buttonElement.firstChild);
                    }
                    
                    originalChildren.forEach(child => {
                        buttonElement.appendChild(child.cloneNode(true));
                    });
                    
                    buttonElement.disabled = false;
                    
                    buttonElement.style.height = '';
                    buttonElement.style.width = '';
                }
            });
        } catch (error) {
            console.error('Download setup error:', error);
            
            while (buttonElement.firstChild) {
                buttonElement.removeChild(buttonElement.firstChild);
            }
            
            buttonElement.textContent = format;
            
            buttonElement.disabled = false;
            
            buttonElement.style.height = '';
            buttonElement.style.width = '';
        }
    }
 
    function filterSubtitles(subtitles, query) {
        if (!query) return subtitles;
        
        const lowerQuery = query.toLowerCase();
        return subtitles.filter(sub => 
            sub.name.toLowerCase().includes(lowerQuery)
        );
    }
 
    function createSubtitleTable(subtitles, autoTransSubs, videoTitle) {
        const container = document.createElement('div');
        container.className = 'subtitle-container';
 
        const titleDiv = document.createElement('div');
        titleDiv.className = 'subtitle-dropdown-title';
        titleDiv.textContent = `Download Subtitles (${subtitles.length + autoTransSubs.length})`;
        container.appendChild(titleDiv);
        
        const searchContainer = document.createElement('div');
        searchContainer.className = 'subtitle-search-container';
        
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'subtitle-search-input';
        searchInput.placeholder = 'Search languages...';
        
        const searchIcon = document.createElement('div');
        searchIcon.className = 'subtitle-search-icon';
        searchIcon.appendChild(createSearchIcon());
        
        searchContainer.appendChild(searchIcon);
        searchContainer.appendChild(searchInput);
        container.appendChild(searchContainer);
 
        const tabsDiv = document.createElement('div');
        tabsDiv.className = 'subtitle-tabs';
 
        const regularTab = document.createElement('div');
        regularTab.className = 'subtitle-tab active';
        regularTab.textContent = 'Original';
        regularTab.dataset.tab = 'regular';
 
        const autoTab = document.createElement('div');
        autoTab.className = 'subtitle-tab';
        autoTab.textContent = 'Auto Translate';
        autoTab.dataset.tab = 'auto';
 
        tabsDiv.appendChild(regularTab);
        tabsDiv.appendChild(autoTab);
        container.appendChild(tabsDiv);
 
        const itemsPerPage = 30;
        
        const regularContent = createSubtitleContent(subtitles, videoTitle, true, itemsPerPage);
        regularContent.className = 'subtitle-content regular-content active';
 
        const autoContent = createSubtitleContent(autoTransSubs, videoTitle, false, itemsPerPage);
        autoContent.className = 'subtitle-content auto-content';
 
        container.appendChild(regularContent);
        container.appendChild(autoContent);
 
        tabsDiv.addEventListener('click', (e) => {
            if (e.target.classList.contains('subtitle-tab')) {
                document.querySelectorAll('.subtitle-tab').forEach(tab => tab.classList.remove('active'));
                document.querySelectorAll('.subtitle-content').forEach(content => content.classList.remove('active'));
 
                e.target.classList.add('active');
                const tabType = e.target.dataset.tab;
                document.querySelector(`.${tabType}-content`).classList.add('active');
                
                searchInput.value = '';
                
                const activeContent = document.querySelector(`.${tabType}-content`);
                const grid = activeContent.querySelector('.subtitle-grid');
                
                if (tabType === 'regular') {
                    renderPage(1, subtitles, grid, itemsPerPage, videoTitle);
                } else {
                    renderPage(1, autoTransSubs, grid, itemsPerPage, videoTitle);
                }
                
                const pagination = activeContent.querySelector('.subtitle-pagination');
                updatePagination(
                    1, 
                    Math.ceil((tabType === 'regular' ? subtitles : autoTransSubs).length / itemsPerPage),
                    pagination,
                    null,
                    grid,
                    tabType === 'regular' ? subtitles : autoTransSubs,
                    itemsPerPage,
                    videoTitle
                );
            }
        });
        
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            const activeTab = document.querySelector('.subtitle-tab.active').dataset.tab;
            const activeContent = document.querySelector(`.${activeTab}-content`);
            const grid = activeContent.querySelector('.subtitle-grid');
            const pagination = activeContent.querySelector('.subtitle-pagination');
            
            const sourceSubtitles = activeTab === 'regular' ? subtitles : autoTransSubs;
            const filteredSubtitles = filterSubtitles(sourceSubtitles, query);
            
            renderPage(1, filteredSubtitles, grid, itemsPerPage, videoTitle);
            updatePagination(
                1, 
                Math.ceil(filteredSubtitles.length / itemsPerPage), 
                pagination, 
                filteredSubtitles,
                grid,
                sourceSubtitles,
                itemsPerPage,
                videoTitle
            );
            
            grid.dataset.filteredCount = filteredSubtitles.length;
            grid.dataset.query = query;
        });
 
        return container;
    }
 
    function renderPage(page, subtitlesList, gridElement, itemsPerPage, videoTitle) {
        while (gridElement.firstChild) {
            gridElement.removeChild(gridElement.firstChild);
        }
 
        const startIndex = (page - 1) * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, subtitlesList.length);
 
        for (let i = startIndex; i < endIndex; i++) {
            const sub = subtitlesList[i];
            const item = document.createElement('div');
            item.className = 'subtitle-item';
 
            const langLabel = document.createElement('div');
            langLabel.className = 'subtitle-language';
            langLabel.textContent = sub.name;
            item.appendChild(langLabel);
 
            const btnContainer = document.createElement('div');
            btnContainer.className = 'subtitle-format-container';
 
            const srtBtn = document.createElement('button');
            srtBtn.textContent = 'SRT';
            srtBtn.className = 'subtitle-format-btn srt-btn';
            srtBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                downloadSubtitle(sub.download.srt, `${videoTitle} - ${sub.name}.srt`, 'SRT', srtBtn);
            });
            btnContainer.appendChild(srtBtn);
 
            const txtBtn = document.createElement('button');
            txtBtn.textContent = 'TXT';
            txtBtn.className = 'subtitle-format-btn txt-btn';
            txtBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                downloadSubtitle(sub.download.txt, `${videoTitle} - ${sub.name}.txt`, 'TXT', txtBtn);
            });
            btnContainer.appendChild(txtBtn);
 
            item.appendChild(btnContainer);
            gridElement.appendChild(item);
        }
    }
 
    function updatePagination(page, totalPages, paginationElement, filteredSubs, gridElement, sourceSubtitles, itemsPerPage, videoTitle) {
        while (paginationElement.firstChild) {
            paginationElement.removeChild(paginationElement.firstChild);
        }
 
        if (totalPages <= 1) return;
 
        const prevBtn = document.createElement('button');
        prevBtn.textContent = '«';
        prevBtn.className = 'pagination-btn';
        prevBtn.disabled = page === 1;
        prevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (page > 1) {
                const newPage = page - 1;
                const query = gridElement.dataset.query;
                const subsToUse = query && filteredSubs ? filteredSubs : sourceSubtitles;
                
                renderPage(newPage, subsToUse, gridElement, itemsPerPage, videoTitle);
                updatePagination(
                    newPage, 
                    totalPages, 
                    paginationElement, 
                    filteredSubs,
                    gridElement,
                    sourceSubtitles,
                    itemsPerPage,
                    videoTitle
                );
            }
        });
        paginationElement.appendChild(prevBtn);
 
        const pageIndicator = document.createElement('span');
        pageIndicator.className = 'page-indicator';
        pageIndicator.textContent = `${page} / ${totalPages}`;
        paginationElement.appendChild(pageIndicator);
 
        const nextBtn = document.createElement('button');
        nextBtn.textContent = '»';
        nextBtn.className = 'pagination-btn';
        nextBtn.disabled = page === totalPages;
        nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (page < totalPages) {
                const newPage = page + 1;
                const query = gridElement.dataset.query;
                const subsToUse = query && filteredSubs ? filteredSubs : sourceSubtitles;
                
                renderPage(newPage, subsToUse, gridElement, itemsPerPage, videoTitle);
                updatePagination(
                    newPage, 
                    totalPages, 
                    paginationElement, 
                    filteredSubs,
                    gridElement,
                    sourceSubtitles,
                    itemsPerPage,
                    videoTitle
                );
            }
        });
        paginationElement.appendChild(nextBtn);
    }
 
    function createSubtitleContent(subtitles, videoTitle, isOriginal, itemsPerPage) {
        const content = document.createElement('div');
        let currentPage = 1;
 
        const grid = document.createElement('div');
        grid.className = 'subtitle-grid';
        
        if (isOriginal && subtitles.length <= 6) {
            grid.classList.add('center-grid');
        }
        
        grid.dataset.filteredCount = subtitles.length;
        grid.dataset.query = '';
 
        const pagination = document.createElement('div');
        pagination.className = 'subtitle-pagination';
 
        renderPage(currentPage, subtitles, grid, itemsPerPage, videoTitle);
        updatePagination(
            currentPage, 
            Math.ceil(subtitles.length / itemsPerPage), 
            pagination, 
            null,
            grid,
            subtitles,
            itemsPerPage,
            videoTitle
        );
 
        content.appendChild(grid);
        content.appendChild(pagination);
 
        return content;
    }
 
    async function handleSubtitleDownload(e) {
        e.preventDefault();
        const videoId = getVideoId();
 
        if (!videoId) {
            console.error('Video ID not found');
            return;
        }
 
        const backdrop = document.createElement('div');
        backdrop.className = 'subtitle-backdrop';
        document.body.appendChild(backdrop);
 
        const loader = document.createElement('div');
        loader.className = 'subtitle-loader';
        backdrop.appendChild(loader);
 
        try {
            const data = _generateData(videoId);
            
            const headersList = {
                "authority": "get-info.downsub.com",
                "accept": "application/json, text/plain, */*",
                "accept-language": "id-ID,id;q=0.9",
                "origin": "https://downsub.com",
                "priority": "u=1, i",
                "referer": "https://downsub.com/",
                "sec-ch-ua": '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": '"Windows"',
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "same-site",
                "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"
            };
            
            const response = await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: API + data.id,
                    headers: headersList,
                    responseType: 'json',
                    onload: function(response) {
                        if (response.status >= 200 && response.status < 300) {
                            resolve(response.response);
                        } else {
                            reject(new Error(`Request failed with status ${response.status}`));
                        }
                    },
                    onerror: function() {
                        reject(new Error('Network error'));
                    }
                });
            });
 
            const processedResponse = _decodeArray(response);
 
            const videoTitleElement = document.querySelector('yt-formatted-string.style-scope.ytd-watch-metadata');
            const videoTitle = videoTitleElement ? videoTitleElement.textContent.trim() : `youtube_video_${videoId}`;
 
            loader.remove();
 
            if (!processedResponse.subtitles || processedResponse.subtitles.length === 0 &&
                (!processedResponse.subtitlesAutoTrans || processedResponse.subtitlesAutoTrans.length === 0)) {
                while (backdrop.firstChild) {
                    backdrop.removeChild(backdrop.firstChild);
                }
                const errorDiv = document.createElement('div');
                errorDiv.className = 'subtitle-error';
                errorDiv.textContent = 'No subtitles available for this video';
                backdrop.appendChild(errorDiv);
 
                setTimeout(() => {
                    backdrop.remove();
                }, 2000);
                return;
            }
 
            const subtitleTable = createSubtitleTable(
                processedResponse.subtitles || [],
                processedResponse.subtitlesAutoTrans || [],
                videoTitle
            );
            backdrop.appendChild(subtitleTable);
 
            backdrop.addEventListener('click', (e) => {
                if (!subtitleTable.contains(e.target)) {
                    subtitleTable.remove();
                    backdrop.remove();
                }
            });
 
            subtitleTable.addEventListener('click', (e) => {
                e.stopPropagation();
            });
 
        } catch (error) {
            console.error('Error fetching subtitles:', error);
 
            while (backdrop.firstChild) {
                backdrop.removeChild(backdrop.firstChild);
            }
            const errorDiv = document.createElement('div');
            errorDiv.className = 'subtitle-error';
            errorDiv.textContent = 'Error fetching subtitles. Please try again.';
            backdrop.appendChild(errorDiv);
 
            setTimeout(() => {
                backdrop.remove();
            }, 2000);
        }
    }
 
    function initializeStyles(computedStyle) {
        if (document.querySelector('#yt-subtitle-downloader-styles')) return;
 
        const style = document.createElement('style');
        style.id = 'yt-subtitle-downloader-styles';
        document.head.appendChild(style);
    }
 
    function initializeButton() {
        if (document.querySelector('.custom-subtitle-btn')) return;
 
        const originalButton = document.querySelector('.ytp-subtitles-button');
        if (!originalButton) return;
 
        const newButton = document.createElement('button');
        const computedStyle = window.getComputedStyle(originalButton);
 
        Object.assign(newButton, {
            className: 'ytp-button custom-subtitle-btn',
            title: 'Download Subtitles'
        });
 
        newButton.setAttribute('aria-pressed', 'false');
        initializeStyles(computedStyle);
 
        newButton.append(
            createSVGIcon('default-icon', false),
            createSVGIcon('hover-icon', true)
        );
 
        newButton.addEventListener('click', (e) => {
            const existingDropdown = document.querySelector('.subtitle-container');
            existingDropdown ? existingDropdown.remove() : handleSubtitleDownload(e);
        });
 
        originalButton.insertAdjacentElement('afterend', newButton);
    }
 
    function initializeObserver() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.addedNodes.length) {
                    const isVideoPage = window.location.pathname === '/watch';
                    if (isVideoPage && !document.querySelector('.custom-subtitle-btn')) {
                        initializeButton();
                    }
                }
            });
        });
 
        function startObserving() {
            const playerContainer = document.getElementById('player-container');
            const contentContainer = document.getElementById('content');
 
            if (playerContainer) {
                observer.observe(playerContainer, {
                    childList: true,
                    subtree: true
                });
            }
 
            if (contentContainer) {
                observer.observe(contentContainer, {
                    childList: true,
                    subtree: true
                });
            }
 
            if (window.location.pathname === '/watch') {
                initializeButton();
            }
        }
 
        startObserving();
 
        if (!document.getElementById('player-container')) {
            const retryInterval = setInterval(() => {
                if (document.getElementById('player-container')) {
                    startObserving();
                    clearInterval(retryInterval);
                }
            }, 1000);
 
            setTimeout(() => clearInterval(retryInterval), 10000);
        }
 
        const handleNavigation = () => {
            if (window.location.pathname === '/watch') {
                initializeButton();
            }
        };
 
        window.addEventListener('yt-navigate-finish', handleNavigation);
 
        return () => {
            observer.disconnect();
            window.removeEventListener('yt-navigate-finish', handleNavigation);
        };
    }
 
    function addSubtitleButton() {
        initializeObserver();
    }
 
    addSubtitleButton();
})();