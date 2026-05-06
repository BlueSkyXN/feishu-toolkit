// ==UserScript==
// @name         Feishu SVIP
// @namespace    Feishu_SVIP
// @version      1.0
// @description  解除飞书文档限制（复制、右键），并移除页面水印。
// @author       BlueSkyXN
// @match        *://*.feishu.cn/*
// @match        *://*.larksuite.com/*
// @match        *://*.larkoffice.com/*
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // --- Part 1: 移除水印 (来自 lbb00 的脚本) ---

    // GM_addStyle polyfill for compatibility
    if (typeof GM_addStyle === 'undefined') {
        this.GM_addStyle = (aCss) => {
            const head = document.getElementsByTagName('head')[0];
            if (head) {
                const style = document.createElement('style');
                style.setAttribute('type', 'text/css');
                style.textContent = aCss;
                head.appendChild(style);
                return style;
            }
            return null;
        };
    }

    const removeWatermarks = () => {
        const bgImageNone = '{background-image: none !important;}';
        function genStyle(selector) {
            return `${selector}${bgImageNone}`;
        }

        // global
        GM_addStyle(genStyle('[class*="watermark"]'));
        GM_addStyle(genStyle('[style*="pointer-events: none"]'));

        // 飞书文档
        GM_addStyle(genStyle('.ssrWaterMark'));
        GM_addStyle(genStyle('body>div>div>div>div[style*="position: fixed"]:not(:has(*))'));
        // firefox not support :has()
        GM_addStyle(genStyle('[class*="TIAWBFTROSIDWYKTTIAW"]'));

        // fixed for https://github.com/lbb00/remove-feishu-watermark/issues/3
        GM_addStyle(genStyle('body>div[style*="position: fixed"]:not(:has(*))')); // for readonly

        // 工作台
        GM_addStyle(genStyle('#watermark-cache-container'));
        GM_addStyle(genStyle('body>div[style*="inset: 0px;"]:not(:has(*))'));

        // Web 聊天
        GM_addStyle(genStyle('.chatMessages>div[style*="inset: 0px;"]'));
    };


    // --- Part 2: 解除功能限制 (来自 NOABC 的脚本) ---

    // Override addEventListener to handle copy and contextmenu events
    const overrideEventListeners = () => {
        const rawAddEventListener = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function (type, listener, options) {
            if (type === 'copy') {
                rawAddEventListener.call(this, type, event => {
                    event.stopImmediatePropagation();
                    return null;
                }, options);
                return;
            }
            if (type === 'contextmenu') {
                rawAddEventListener.call(this, type, event => {
                    event.stopImmediatePropagation();
                    return listener(event);
                }, options);
                return;
            }
            rawAddEventListener.call(this, type, listener, options);
        };
    };

    // Override XMLHttpRequest to manipulate permission responses
    const overrideXHR = () => {
        const rawOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (method, url, ...rest) {
            this.addEventListener('readystatechange', function () {
                if (this.readyState === 4 && url.includes('space/api/suite/permission/document/actions/state/')) {
                    let response = this.responseText;
                    try {
                        response = JSON.parse(response);
                        if (response.data && response.data.actions && response.data.actions.copy !== 1) {
                            response.data.actions.copy = 1;
                            Object.defineProperty(this, 'responseText', { value: JSON.stringify(response) });
                            Object.defineProperty(this, 'response', { value: response });
                        }
                    } catch (e) {
                        // Suppress error in production script
                    }
                }
            }, false);
            rawOpen.call(this, method, url, ...rest);
        };
    };

    // --- 执行所有功能 ---
    removeWatermarks();
    overrideEventListeners();
    overrideXHR();

    document.addEventListener('DOMContentLoaded', () => {
        // Re-apply in case of dynamic content loading
        removeWatermarks();
        overrideEventListeners();
        overrideXHR();
    });

})();