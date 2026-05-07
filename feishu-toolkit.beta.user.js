// ==UserScript==
// @name         飞书工具箱 Beta (Feishu Toolkit Beta)
// @name:zh-CN   飞书工具箱 Beta
// @name:en      Feishu Toolkit Beta
// @namespace    https://github.com/BlueSkyXN/feishu-toolkit
// @version      0.2.8-beta
// @description  飞书网页端增强工具箱 Beta：去水印、解除复制/右键/导出/选择限制、原生优先复制、选区复制兜底、图片一键下载、媒体复制助手、外链新标签、复制为 Markdown。
// @description:zh-CN 飞书网页端增强工具箱 Beta：去水印、解除复制/右键/导出/选择限制、原生优先复制、选区复制兜底、图片一键下载、媒体复制助手、外链新标签、复制为 Markdown。
// @description:en Enhance Feishu/Lark web pages with watermark hiding, copy/context-menu/select/export helpers, image download, media copy assistant, external-link handling, and Markdown copy.
// @author       BlueSkyXN
// @match        *://*.feishu.cn/*
// @match        *://*.larksuite.com/*
// @match        *://*.larkoffice.com/*
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @homepageURL  https://github.com/BlueSkyXN/feishu-toolkit
// @supportURL   https://github.com/BlueSkyXN/feishu-toolkit/issues
// @downloadURL  https://github.com/BlueSkyXN/feishu-toolkit/raw/main/feishu-toolkit.beta.user.js
// @updateURL    https://github.com/BlueSkyXN/feishu-toolkit/raw/main/feishu-toolkit.beta.user.js
// @license      GPL-3.0-only
// ==/UserScript==

(function () {
    'use strict';

    // ============================================================
    // 1. 配置中心
    // ============================================================
    const SCRIPT_NAME = '飞书工具箱 Beta';
    const SCRIPT_VERSION = '0.2.8-beta';
    const CONFIG_KEY = 'feishu_toolkit_beta_v1';
    const LEGACY_CONFIG_KEYS = [];

    // 功能元信息：单一真相源，UI/逻辑都从这里读
    // group: 分组渲染   hot: 即时生效（无需刷新）   default: 默认开关
    const FEATURES = [
        // ---- T0 核心保护：解除限制类 ----
        {
            key: 'removeWatermark', label: '去除水印', group: '核心保护', hot: true, default: true,
            summary: '隐藏常见水印图层。',
            impact: '只影响当前网页显示，不修改飞书文档内容。',
            requirement: '依赖飞书水印 DOM 和 CSS 选择器；飞书前端改版后可能需要补选择器。',
        },
        {
            key: 'bypassCopy', label: '解除复制限制', group: '核心保护', hot: false, default: true,
            summary: '尝试打开权限响应里的复制能力。',
            impact: '优先保留飞书原生富文本复制流程，减少表格、格式复制变形。',
            requirement: '需要刷新后让 XHR hook 早于权限请求生效；只对网页端返回的权限位有效。',
        },
        {
            key: 'bypassContextMenu', label: '解除右键限制', group: '核心保护', hot: true, default: true,
            summary: '恢复浏览器原生右键菜单。',
            impact: '保留飞书右键监听执行，只阻止其屏蔽浏览器原生菜单，降低复制上下文丢失概率。',
            requirement: '脚本在 document-start 安装 preventDefault hook；开关可即时影响后续右键事件。',
        },
        {
            key: 'bypassUserSelect', label: '解除文本选择', group: '核心保护', hot: true, default: true,
            summary: '强制页面文本可选中。',
            impact: '提高普通 DOM 文本选择成功率。',
            requirement: '只影响可选中的网页文本；canvas、图片或特殊编辑器内容不一定生效。',
        },
        {
            key: 'bypassDrag', label: '解除拖拽限制', group: '核心保护', hot: true, default: false,
            summary: '允许拖拽图片和文本。',
            impact: '可能改变飞书自己的拖拽交互，默认关闭，需要时再开。',
            requirement: '依赖浏览器原生 draggable 行为；受飞书组件实现和浏览器策略影响。',
        },
        {
            key: 'keepTableFormat', label: '原生优先复制', group: '核心保护', hot: false, default: true,
            summary: '不主动抢占 copy 事件，优先保留飞书自己的富文本复制。',
            impact: '开启时尽量不干扰飞书原生复制；关闭时进入强力选区复制，复杂块和媒体不保证完整。',
            requirement: '需要刷新后影响后续 copy 监听注册；建议和“解除复制限制”一起开启。',
        },
        {
            key: 'copyFallback', label: '选区复制兜底', group: '复制实验', hot: false, default: false,
            summary: '飞书没有写入剪贴板时，用当前浏览器选区补 text/html 和 text/plain。',
            impact: '会额外调整 copy 监听顺序，可能影响飞书复杂块复制；默认关闭，排查受限文档时再开。',
            requirement: '需要刷新后在页面早期注册；建议只在“解除复制限制”和“原生优先复制”都开启时测试。',
        },
        // ---- T1 体验增强 ----
        {
            key: 'forceExport', label: '强制导出/下载', group: '体验增强', hot: false, default: true,
            summary: '尝试打开下载、导出、打印等权限入口。',
            impact: '可能让前端入口可见或可点击，但不保证服务端最终允许导出。',
            requirement: '需要刷新后在权限接口返回前生效；受账号权限、文档权限和服务端校验限制。',
        },
        {
            key: 'imageDownload', label: '图片悬停下载按钮', group: '体验增强', hot: true, default: true,
            summary: '鼠标悬停图片时显示下载按钮。',
            impact: '尝试按图片 src 拉取原图并保存到本地。',
            requirement: '图片必须有浏览器可访问的地址；跨域、权限、懒加载或防盗链可能导致下载失败。',
        },
        {
            key: 'linksNewTab', label: '外链新标签打开', group: '体验增强', hot: true, default: true,
            summary: '站外链接自动新标签打开。',
            impact: '减少离开当前飞书页面的概率；飞书域内链接保持原行为。',
            requirement: '只处理点击时能解析到 href 的链接。',
        },
        {
            key: 'copyAsMarkdown', label: '复制为 Markdown', group: '体验增强', hot: true, default: true,
            summary: '用 Ctrl/Command+Shift+C 复制选区 Markdown。',
            impact: '把当前选区 HTML 简单转换为 Markdown 并写入剪贴板。',
            requirement: '需要先选中内容，并且浏览器允许当前页面在用户操作中写剪贴板。',
        },
        // ---- 媒体复制 ----
        {
            key: 'mediaCopyAssistant', label: '媒体复制助手', group: '媒体复制', hot: true, default: false,
            summary: '准备并插入图片、画板等媒体。',
            impact: '不改写正文剪贴板，不影响表格格式；画板会作为图片插入。',
            requirement: '需要新版飞书文档页面，媒体需在当前账号可见；建议先在目标位置点击后再插入。',
        },
        // ---- 辅助 ----
        {
            key: 'debug', label: '调试日志', group: '辅助', hot: true, default: false,
            summary: '在控制台输出脚本运行信息。',
            impact: '便于排查功能是否生效，也可能让控制台更吵。',
            requirement: '仅建议调试时开启；日志只写入本机浏览器 DevTools console。',
        },
    ];

    // GM 兼容性 polyfill（极少数环境无 GM_*，降级到 localStorage）
    const GM = {
        get: (k, d) => {
            try { return typeof GM_getValue !== 'undefined' ? GM_getValue(k, d) : (JSON.parse(localStorage.getItem(k) ?? 'null') ?? d); }
            catch (e) { return d; }
        },
        set: (k, v) => {
            try { return typeof GM_setValue !== 'undefined' ? GM_setValue(k, v) : localStorage.setItem(k, JSON.stringify(v)); }
            catch (e) {}
        },
        style: (css) => {
            if (typeof GM_addStyle !== 'undefined') return GM_addStyle(css);

            const style = document.createElement('style');
            style.type = 'text/css';
            style.textContent = css;
            (document.head || document.documentElement).appendChild(style);
            return style;
        },
    };

    function loadConfig() {
        const def = Object.fromEntries(FEATURES.map(f => [f.key, f.default]));
        const saved = GM.get(CONFIG_KEY, null);
        if (saved) return Object.assign({}, def, saved);

        for (const key of LEGACY_CONFIG_KEYS) {
            const legacy = GM.get(key, null);
            if (legacy) {
                const migrated = Object.assign({}, def, legacy);
                saveConfig(migrated);
                return migrated;
            }
        }

        return def;
    }
    function saveConfig(cfg) { GM.set(CONFIG_KEY, cfg); }

    const config = loadConfig();
    const pageWindow = (() => {
        try { return typeof unsafeWindow !== 'undefined' ? unsafeWindow : window; }
        catch { return window; }
    })();

    // ============================================================
    // 2. 工具函数
    // ============================================================
    const log = (...args) => { if (config.debug) console.log(`%c[${SCRIPT_NAME}]`, 'color:#3370ff;font-weight:bold', ...args); };
    log('启动，当前配置：', config);

    function $el(tag, attrs = {}, children = []) {
        const el = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs)) {
            if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
            else if (k === 'class') el.className = v;
            else if (k === 'onclick') el.addEventListener('click', v);
            else el.setAttribute(k, v);
        }
        for (const c of [].concat(children)) {
            if (typeof c === 'string') el.appendChild(document.createTextNode(c));
            else if (c) el.appendChild(c);
        }
        return el;
    }

    function debounce(fn, ms) {
        let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
    }

    function isPermissionActionsRequest(url) {
        return /\/space\/api\/[^?#]*permission\/document\/actions\/state\/?/i.test(String(url || ''));
    }

    function patchActions(actions) {
        if (!actions || typeof actions !== 'object') return false;

        let modified = false;
        if (config.bypassCopy && actions.copy !== 1) {
            actions.copy = 1;
            modified = true;
        }

        if (config.forceExport) {
            for (const key of Object.keys(actions)) {
                if (actions[key] === 0) {
                    actions[key] = 1;
                    modified = true;
                }
            }
        }

        return modified;
    }

    function patchPermissionPayload(payload) {
        if (!payload || typeof payload !== 'object') return false;

        let modified = false;
        const seen = new Set();
        const visit = (node, depth = 0) => {
            if (!node || typeof node !== 'object' || seen.has(node) || depth > 6) return;
            seen.add(node);

            if (node.actions && typeof node.actions === 'object') {
                modified = patchActions(node.actions) || modified;
            }

            if (Array.isArray(node)) {
                node.forEach(item => visit(item, depth + 1));
                return;
            }

            for (const key of ['data', 'permission', 'permissions', 'result']) {
                if (node[key] && typeof node[key] === 'object') visit(node[key], depth + 1);
            }
        };

        visit(payload);
        return modified;
    }

    function getClipboardTypes(dataTransfer) {
        try { return Array.from(dataTransfer?.types || []); }
        catch { return []; }
    }

    function hasClipboardContent(dataTransfer) {
        if (!dataTransfer) return false;

        const types = getClipboardTypes(dataTransfer);
        if (types.includes('text/html')) {
            try { if (dataTransfer.getData('text/html')) return true; }
            catch { return true; }
        }
        if (types.includes('text/plain')) {
            try { return Boolean(dataTransfer.getData('text/plain')); }
            catch { return true; }
        }
        return types.length > 0;
    }

    function htmlToPlainText(html) {
        const div = document.createElement('div');
        div.innerHTML = html || '';
        return div.innerText || div.textContent || '';
    }

    function getSelectionClipboardPayload() {
        const selection = window.getSelection?.();
        const text = selection?.toString?.() || '';
        const html = getSelectionHtml();
        const plain = text || htmlToPlainText(html);
        if (!plain && !html) return null;
        return { text: plain, html };
    }

    function closestElement(node) {
        if (!node) return null;
        return node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    }

    function isToolkitNode(node) {
        return Boolean(closestElement(node)?.closest?.('#ftk-panel, #ftk-fab, .ftk-toast, #ftk-img-download'));
    }

    function isToolkitCopyContext(event) {
        const path = typeof event?.composedPath === 'function' ? event.composedPath() : [];
        if (path.some(isToolkitNode)) return true;

        const selection = window.getSelection?.();
        return isToolkitNode(selection?.anchorNode) || isToolkitNode(selection?.focusNode);
    }

    function ensureCopyClipboardData(event, reason, options = {}) {
        const {
            requireBypassCopy = true,
            requireSmartMode = true,
            requireCopyFallback = true,
            force = false,
        } = options;
        if (requireBypassCopy && !config.bypassCopy) return false;
        if (requireSmartMode && !config.keepTableFormat) return false;
        if (requireCopyFallback && !config.copyFallback) return false;
        if (!event?.clipboardData) return false;
        if (!force && hasClipboardContent(event.clipboardData)) return false;

        const payload = getSelectionClipboardPayload();
        if (!payload) return false;

        try {
            if (force) {
                try { event.clipboardData.clearData(); }
                catch {}
            }
            event.clipboardData.setData('text/plain', payload.text);
            if (payload.html) event.clipboardData.setData('text/html', payload.html);
            event.preventDefault();
            log('已用选区内容兜底写入复制剪贴板：', reason, {
                textLength: payload.text.length,
                htmlLength: payload.html.length,
            });
            return true;
        } catch (error) {
            log('选区复制兜底失败', error);
            return false;
        }
    }

    // ============================================================
    // 3. 全局 Hook（必须 document-start 立即执行，运行时再判断开关）
    // ============================================================

    // -- 3.1 hook addEventListener / preventDefault：处理 contextmenu / copy --
    (function hookEventListeners() {
        const target = pageWindow.EventTarget?.prototype || EventTarget.prototype;
        if (target.__ftkEventHooked) return;
        target.__ftkEventHooked = true;

        const eventProto = pageWindow.Event?.prototype || Event.prototype;
        const rawPreventDefault = eventProto.preventDefault;
        if (!eventProto.__ftkPreventDefaultHooked) {
            eventProto.__ftkPreventDefaultHooked = true;
            eventProto.preventDefault = function (...args) {
                if (config.bypassContextMenu && this?.type === 'contextmenu') {
                    log('已放行右键菜单 preventDefault');
                    return undefined;
                }
                return rawPreventDefault.apply(this, args);
            };
        }

        const rawAdd = target.addEventListener;
        const rawRemove = target.removeEventListener;
        const smartCopyFallback = function (event) {
            ensureCopyClipboardData(event, 'smart-final-fallback');
        };
        const refreshSmartCopyFallback = (eventTarget, options) => {
            rawRemove.call(eventTarget, 'copy', smartCopyFallback, options);
            rawAdd.call(eventTarget, 'copy', smartCopyFallback, options);
        };

        target.addEventListener = function (type, listener, options) {
            // 解除 copy 事件级保护——但仅在"原生优先复制"关闭时启用
            // 因为飞书的格式化复制依赖自己的 copy handler 写入 HTML，拦了就没了
            if (type === 'copy' && config.bypassCopy && !config.keepTableFormat) {
                return rawAdd.call(this, type, function (event) {
                    ensureCopyClipboardData(event, 'strong-selection-mode', {
                        requireSmartMode: false,
                        requireCopyFallback: false,
                        force: true,
                    });
                    event.stopImmediatePropagation();
                    return null;
                }, options);
            }
            if (type === 'copy' && config.bypassCopy && config.keepTableFormat && config.copyFallback) {
                const result = rawAdd.call(this, type, listener, options);
                refreshSmartCopyFallback(this, options);
                return result;
            }
            return rawAdd.call(this, type, listener, options);
        };

        target.removeEventListener = function (type, listener, options) {
            const result = rawRemove.call(this, type, listener, options);
            if (type === 'copy' && config.bypassCopy && config.keepTableFormat && config.copyFallback) {
                refreshSmartCopyFallback(this, options);
            }
            return result;
        };

        rawAdd.call(document, 'copy', function protectToolkitCopy(event) {
            if (!isToolkitCopyContext(event)) return;
            const handled = ensureCopyClipboardData(event, 'toolkit-ui-copy', {
                requireBypassCopy: false,
                requireSmartMode: false,
                requireCopyFallback: false,
                force: true,
            });
            if (handled) event.stopImmediatePropagation();
        }, true);
    })();

    // -- 3.2 hook XMLHttpRequest：改写权限响应 --
    (function hookXHR() {
        const XHR = pageWindow.XMLHttpRequest || XMLHttpRequest;
        if (!XHR?.prototype || XHR.prototype.__ftkXHRHooked) return;
        XHR.prototype.__ftkXHRHooked = true;

        const rawOpen = XHR.prototype.open;
        XHR.prototype.open = function (method, url, ...rest) {
            const requestUrl = String(url || '');
            this.addEventListener('readystatechange', function () {
                if (this.readyState !== 4) return;
                if (!isPermissionActionsRequest(requestUrl)) return;

                try {
                    let rawResponse;
                    try { rawResponse = this.responseText; }
                    catch { rawResponse = this.response; }

                    const response = typeof rawResponse === 'string' ? JSON.parse(rawResponse) : rawResponse;
                    const modified = patchPermissionPayload(response);

                    if (modified) {
                        const responseText = JSON.stringify(response);
                        Object.defineProperty(this, 'responseText', {
                            get: () => responseText,
                            configurable: true,
                        });
                        Object.defineProperty(this, 'response', {
                            get: () => this.responseType === 'json' ? response : responseText,
                            configurable: true,
                        });
                        log('已改写 XHR 权限响应：', requestUrl, response?.data?.actions || response);
                    }
                } catch (e) { log('XHR 响应改写失败', e); }
            }, false);
            return rawOpen.call(this, method, url, ...rest);
        };
    })();

    // -- 3.3 hook fetch：飞书部分版本会用 fetch 拉权限状态 --
    (function hookFetch() {
        const rawFetch = pageWindow.fetch;
        const ResponseCtor = pageWindow.Response || (typeof Response !== 'undefined' ? Response : null);
        const HeadersCtor = pageWindow.Headers || (typeof Headers !== 'undefined' ? Headers : null);
        if (typeof rawFetch !== 'function' || pageWindow.__ftkFetchHooked) return;
        if (!ResponseCtor || !HeadersCtor) return;
        pageWindow.__ftkFetchHooked = true;

        pageWindow.fetch = async function (input, init) {
            const requestUrl = String(typeof input === 'string' ? input : input?.url || '');
            const response = await rawFetch.call(this, input, init);
            if (!isPermissionActionsRequest(requestUrl)) return response;

            try {
                const clone = response.clone();
                const payload = await clone.json();
                if (!patchPermissionPayload(payload)) return response;

                const headers = new HeadersCtor(response.headers);
                headers.delete('content-length');
                headers.delete('content-encoding');
                if (!headers.has('content-type')) headers.set('content-type', 'application/json; charset=utf-8');

                log('已改写 fetch 权限响应：', requestUrl, payload?.data?.actions || payload);
                return new ResponseCtor(JSON.stringify(payload), {
                    status: response.status,
                    statusText: response.statusText,
                    headers,
                });
            } catch (error) {
                log('fetch 权限响应改写失败', error);
                return response;
            }
        };
    })();

    // ============================================================
    // 4. 功能模块（CSS / DOM 类，可热切换）
    // ============================================================

    // -- 4.1 去除水印 --
    let watermarkStyle = null;
    function applyWatermark() {
        if (!watermarkStyle) {
            const css = [
                '[class*="watermark"]',
                '[style*="pointer-events: none"]',
                '.ssrWaterMark',
                'body>div>div>div>div[style*="position: fixed"]:not(:has(*))',
                '[class*="TIAWBFTROSIDWYKTTIAW"]',
                'body>div[style*="position: fixed"]:not(:has(*))',
                '#watermark-cache-container',
                'body>div[style*="inset: 0px;"]:not(:has(*))',
                '.chatMessages>div[style*="inset: 0px;"]',
            ].map(s => `${s}{background-image:none !important;}`).join('\n');
            watermarkStyle = GM.style(css);
        }
        watermarkStyle.disabled = !config.removeWatermark;
    }
    applyWatermark();

    // -- 4.2 解除文本选择 --
    let userSelectStyle = null;
    function applyUserSelect() {
        if (!userSelectStyle) {
            userSelectStyle = GM.style(`
                *, *::before, *::after {
                    user-select: text !important;
                    -webkit-user-select: text !important;
                    -moz-user-select: text !important;
                }
            `);
        }
        userSelectStyle.disabled = !config.bypassUserSelect;
    }

    // -- 4.3 解除拖拽限制 --
    let dragStyle = null;
    function applyDrag() {
        if (!dragStyle) {
            dragStyle = GM.style(`
                img, a, [draggable="false"] {
                    -webkit-user-drag: auto !important;
                    user-drag: auto !important;
                }
            `);
        }
        dragStyle.disabled = !config.bypassDrag;
    }

    // -- 4.4 图片悬停下载按钮 --
    // 设计：监听 mouseover/mouseout，给当前图片附加一个浮层按钮
    let imgDlBtn = null;
    let imgDlTarget = null;

    function ensureImgDlBtn() {
        if (imgDlBtn) return;
        GM.style(`
            #ftk-img-download {
                position: absolute; z-index: 2147483640;
                background: rgba(0,0,0,.65); color: #fff;
                padding: 6px 10px; border-radius: 6px;
                font: 12px/1 -apple-system, sans-serif;
                cursor: pointer; user-select: none;
                display: none; pointer-events: auto;
                backdrop-filter: blur(4px);
            }
            #ftk-img-download:hover { background: rgba(51,112,255,.9); }
        `);
        imgDlBtn = $el('div', { id: 'ftk-img-download' }, '⬇ 下载原图');
        imgDlBtn.addEventListener('click', async (e) => {
            e.stopPropagation(); e.preventDefault();
            if (!imgDlTarget) return;
            const url = imgDlTarget.src;
            // 优先取原图：飞书图片 src 常带尺寸参数，去掉 height/width 拿原图
            const originalUrl = url.replace(/[?&](height|width|preview)=\d+/g, '');
            try {
                const res = await fetch(originalUrl, { credentials: 'include' });
                const blob = await res.blob();
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `feishu_image_${Date.now()}.${(blob.type.split('/')[1] || 'png').split('+')[0]}`;
                document.body.appendChild(a); a.click(); a.remove();
                setTimeout(() => URL.revokeObjectURL(a.href), 1000);
                log('图片已下载：', originalUrl);
            } catch (err) {
                log('下载失败', err);
                alert('图片下载失败：' + err.message);
            }
        });
        document.body.appendChild(imgDlBtn);
    }

    function positionImgDlBtn() {
        if (!imgDlTarget || !imgDlBtn) return;
        const rect = imgDlTarget.getBoundingClientRect();
        imgDlBtn.style.left = (window.scrollX + rect.right - imgDlBtn.offsetWidth - 8) + 'px';
        imgDlBtn.style.top  = (window.scrollY + rect.top + 8) + 'px';
        imgDlBtn.style.display = 'block';
    }

    function onImgMouseOver(e) {
        if (!config.imageDownload) return;
        const img = e.target.closest('img');
        if (!img) return;
        // 过滤太小的图标（按钮/头像/icon）
        if (img.naturalWidth < 80 || img.naturalHeight < 80) return;
        // 过滤面板自身的图片
        if (img.closest('#ftk-panel')) return;
        ensureImgDlBtn();
        imgDlTarget = img;
        positionImgDlBtn();
    }
    function onImgMouseOut(e) {
        if (!imgDlBtn) return;
        const to = e.relatedTarget;
        if (to === imgDlBtn || (to && imgDlBtn.contains(to))) return;
        imgDlBtn.style.display = 'none';
        imgDlTarget = null;
    }

    let imgListenersBound = false;
    function applyImageDownload() {
        if (config.imageDownload && !imgListenersBound) {
            document.addEventListener('mouseover', onImgMouseOver, true);
            document.addEventListener('mouseout',  onImgMouseOut,  true);
            window.addEventListener('scroll', debounce(positionImgDlBtn, 50), true);
            imgListenersBound = true;
        }
        if (!config.imageDownload && imgDlBtn) {
            imgDlBtn.style.display = 'none';
        }
    }

    // -- 4.5 外链新标签打开 --
    function onLinkClick(e) {
        if (!config.linksNewTab) return;
        const a = e.target.closest('a');
        if (!a || !a.href) return;
        try {
            const url = new URL(a.href);
            // 只对外站链接强制新标签；飞书域内保持原行为
            const isInternal = /\.(feishu\.cn|larksuite\.com|larkoffice\.com)$/i.test(url.hostname) || url.hostname === location.hostname;
            if (!isInternal) {
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
            }
        } catch {}
    }
    let linkListenerBound = false;
    function applyLinksNewTab() {
        if (!linkListenerBound) {
            document.addEventListener('click', onLinkClick, true);
            linkListenerBound = true;
        }
    }

    // -- 4.6 复制为 Markdown（Ctrl+Shift+C） --
    function htmlToMarkdown(html) {
        let md = html;
        // 标题
        md = md.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, lv, t) => '\n' + '#'.repeat(+lv) + ' ' + stripTags(t) + '\n');
        // 粗体/斜体/删除线/行内代码
        md = md.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**');
        md = md.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*');
        md = md.replace(/<(s|del|strike)[^>]*>([\s\S]*?)<\/\1>/gi, '~~$2~~');
        md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');
        // 代码块
        md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, c) => '\n```\n' + stripTags(c) + '\n```\n');
        // 链接
        md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');
        // 图片
        md = md.replace(/<img[^>]*src="([^"]*)"[^>]*?(?:alt="([^"]*)")?[^>]*>/gi, '![$2]($1)');
        // 列表
        md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');
        md = md.replace(/<\/?(ul|ol)[^>]*>/gi, '\n');
        // 引用
        md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, c) => '> ' + stripTags(c).replace(/\n/g, '\n> ') + '\n');
        // 段落与换行
        md = md.replace(/<br\s*\/?>/gi, '\n');
        md = md.replace(/<\/p>/gi, '\n\n').replace(/<p[^>]*>/gi, '');
        md = md.replace(/<\/div>/gi, '\n').replace(/<div[^>]*>/gi, '');
        // 剥离剩余标签
        md = stripTags(md);
        // HTML 实体
        md = md.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
               .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
        // 多余空行收敛
        md = md.replace(/\n{3,}/g, '\n\n').trim();
        return md;
    }
    function stripTags(s) { return s.replace(/<[^>]+>/g, ''); }

    function getSelectionHtml() {
        const sel = window.getSelection();
        if (!sel.rangeCount) return '';
        const container = document.createElement('div');
        for (let i = 0; i < sel.rangeCount; i++) container.appendChild(sel.getRangeAt(i).cloneContents());
        return container.innerHTML;
    }

    function showToast(text, timeout = 1500) {
        const t = $el('div', { class: 'ftk-toast' }, text);
        document.body.appendChild(t);
        requestAnimationFrame(() => t.classList.add('show'));
        setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, timeout);
    }

    function onCopyAsMarkdown(e) {
        if (!config.copyAsMarkdown) return;
        if (!(e.ctrlKey || e.metaKey) || !e.shiftKey) return;
        if (e.key.toLowerCase() !== 'c') return;
        const html = getSelectionHtml();
        if (!html) return;
        e.preventDefault(); e.stopPropagation();
        const md = htmlToMarkdown(html);
        navigator.clipboard.writeText(md).then(() => {
            showToast('✓ 已复制为 Markdown');
            log('Markdown:\n' + md);
        }).catch(err => {
            showToast('✗ 复制失败');
            log('复制失败', err);
        });
    }
    let mdListenerBound = false;
    function applyCopyAsMarkdown() {
        if (!mdListenerBound) {
            document.addEventListener('keydown', onCopyAsMarkdown, true);
            mdListenerBound = true;
        }
    }

    // -- 4.7 媒体复制助手 --
    // 设计原则：不改写飞书原生 copy / text/html 剪贴板，只做图片、画板的准备和插入。
    const MEDIA_DB_NAME = 'feishu-toolkit-media';
    const MEDIA_STORE_NAME = 'media';
    const MEDIA_BATCH_ID = 'latestBatch';
    const MEDIA_STATUS_KEY = 'feishu_toolkit_media_status_v1';
    const MEDIA_STATUS_TTL_MS = 10 * 60 * 1000;
    const MEDIA_TYPES = new Set(['image', 'whiteboard']);

    let mediaBusy = false;

    function wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function createBatchId() {
        return `ftk-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }

    function safeJsonParse(raw) {
        if (!raw) return null;
        try { return JSON.parse(raw); }
        catch { return null; }
    }

    function getMediaStatus() {
        const status = safeJsonParse(localStorage.getItem(MEDIA_STATUS_KEY));
        if (!status?.updatedAt) return null;
        if (Date.now() - status.updatedAt > MEDIA_STATUS_TTL_MS) return Object.assign({}, status, { state: 'expired' });
        return status;
    }

    function setMediaStatus(patch) {
        const current = getMediaStatus() || {};
        const next = Object.assign({}, current, patch, { updatedAt: Date.now() });
        localStorage.setItem(MEDIA_STATUS_KEY, JSON.stringify(next));
        updateMediaPanel();
        return next;
    }

    function clearMediaStatus() {
        localStorage.removeItem(MEDIA_STATUS_KEY);
        updateMediaPanel();
    }

    function openMediaDB() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                reject(new Error('当前浏览器不支持 IndexedDB'));
                return;
            }

            const request = indexedDB.open(MEDIA_DB_NAME, 1);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(MEDIA_STORE_NAME)) {
                    db.createObjectStore(MEDIA_STORE_NAME, { keyPath: 'id' });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('打开 IndexedDB 失败'));
        });
    }

    async function writeMediaRecord(record) {
        const db = await openMediaDB();
        try {
            await new Promise((resolve, reject) => {
                const tx = db.transaction(MEDIA_STORE_NAME, 'readwrite');
                tx.objectStore(MEDIA_STORE_NAME).put(record);
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error || new Error('写入 IndexedDB 失败'));
                tx.onabort = () => reject(tx.error || new Error('写入 IndexedDB 中止'));
            });
        } finally {
            db.close();
        }
    }

    async function readMediaRecord(id = MEDIA_BATCH_ID) {
        const db = await openMediaDB();
        try {
            return await new Promise((resolve, reject) => {
                const tx = db.transaction(MEDIA_STORE_NAME, 'readonly');
                const request = tx.objectStore(MEDIA_STORE_NAME).get(id);
                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => reject(request.error || new Error('读取 IndexedDB 失败'));
            });
        } finally {
            db.close();
        }
    }

    async function deleteMediaRecord(id = MEDIA_BATCH_ID) {
        const db = await openMediaDB();
        try {
            await new Promise((resolve, reject) => {
                const tx = db.transaction(MEDIA_STORE_NAME, 'readwrite');
                tx.objectStore(MEDIA_STORE_NAME).delete(id);
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error || new Error('删除 IndexedDB 失败'));
            });
        } finally {
            db.close();
        }
    }

    async function cacheMediaBatch(items, meta) {
        const record = {
            id: MEDIA_BATCH_ID,
            batchId: meta.batchId,
            items,
            total: items.length,
            createdAt: Date.now(),
            sourceUrl: location.href,
            sourceTitle: document.title,
            consumedAt: null,
        };
        await writeMediaRecord(record);
        return {
            batchId: record.batchId,
            total: record.total,
            size: items.reduce((sum, item) => sum + (item.blob?.size || 0), 0),
        };
    }

    function getCandidateWindows() {
        const wins = [pageWindow, window];
        document.querySelectorAll('iframe').forEach(iframe => {
            try {
                if (iframe.contentWindow) wins.push(iframe.contentWindow);
            } catch {}
        });
        return Array.from(new Set(wins.filter(Boolean)));
    }

    function getCandidateDocuments() {
        const docs = [];
        getCandidateWindows().forEach(win => {
            try {
                if (win.document) docs.push(win.document);
            } catch {}
        });
        return Array.from(new Set(docs.filter(Boolean)));
    }

    function getPageMain() {
        const candidates = [];
        getCandidateWindows().forEach(win => {
            try {
                if (win.PageMain) candidates.push(win.PageMain);
            } catch {}
        });
        return candidates.find(item => item?.blockManager?.rootBlockModel)
            || candidates.find(item => item?.blockManager)
            || null;
    }

    function getRootBlock() {
        return getPageMain()?.blockManager?.rootBlockModel || null;
    }

    function getBlockType(block) {
        return String(block?.type || block?.snapshot?.type || '');
    }

    function getSnapshotType(block) {
        return String(block?.snapshot?.type || '');
    }

    function blockKey(block) {
        return block?.record?.id || `${getBlockType(block)}:${block?.id || ''}`;
    }

    function collectBlocks(block, result = [], seen = new Set()) {
        if (!block || typeof block !== 'object') return result;

        const key = blockKey(block);
        if (seen.has(key)) return result;
        seen.add(key);
        result.push(block);

        const children = Array.isArray(block.children) ? block.children : [];
        children.forEach(child => collectBlocks(child, result, seen));

        const syncedRoot = block.innerBlockManager?.rootBlockModel;
        if (syncedRoot) collectBlocks(syncedRoot, result, seen);

        return result;
    }

    function isMediaBlock(block) {
        const type = getBlockType(block);
        const snapshotType = getSnapshotType(block);
        return MEDIA_TYPES.has(type)
            || MEDIA_TYPES.has(snapshotType)
            || (type === 'fallback' && MEDIA_TYPES.has(snapshotType));
    }

    function isMediaBlockReady(block) {
        const type = getBlockType(block);
        const snapshotType = getSnapshotType(block);
        if (type === 'whiteboard' || snapshotType === 'whiteboard') {
            return Boolean(block?.whiteboardBlock?.isolateEnv?.hasRatioApp?.());
        }
        if (type === 'fallback' && MEDIA_TYPES.has(snapshotType)) return false;
        return true;
    }

    function getMediaBlocks() {
        const root = getRootBlock();
        if (!root) return [];
        return collectBlocks(root).filter(isMediaBlock);
    }

    function getMediaTypeLabel(block) {
        const type = getSnapshotType(block) || getBlockType(block);
        if (type === 'whiteboard') return '画板';
        if (type === 'image') return '图片';
        return '媒体';
    }

    function getMediaName(block) {
        const type = getSnapshotType(block) || getBlockType(block);
        if (type === 'image') return block?.snapshot?.image?.name || block?.snapshot?.image?.token || 'image';
        if (type === 'whiteboard') return block?.snapshot?.caption?.[0]?.text || block?.record?.id || 'whiteboard';
        return block?.record?.id || block?.id || type || 'media';
    }

    function getMediaDescriptors() {
        const blocks = getMediaBlocks();
        return blocks.map((block, index) => ({
            block,
            key: blockKey(block),
            type: getSnapshotType(block) || getBlockType(block),
            label: getMediaTypeLabel(block),
            name: getMediaName(block),
            index,
            total: blocks.length,
            recordId: block?.record?.id || '',
        }));
    }

    function getMediaSummary() {
        const blocks = getMediaBlocks();
        const types = {};
        const pendingTypes = {};
        blocks.forEach(block => {
            const type = getSnapshotType(block) || getBlockType(block) || 'unknown';
            types[type] = (types[type] || 0) + 1;
            if (!isMediaBlockReady(block)) pendingTypes[type] = (pendingTypes[type] || 0) + 1;
        });
        return {
            supported: Boolean(getRootBlock()),
            total: blocks.length,
            types,
            pending: blocks.filter(block => !isMediaBlockReady(block)).length,
            pendingTypes,
        };
    }

    async function waitForPageMain(timeoutMs = 12000) {
        const startedAt = Date.now();
        while (Date.now() - startedAt < timeoutMs) {
            if (getRootBlock()) return true;
            await wait(250);
        }
        return false;
    }

    function locateBlock(block) {
        const recordId = block?.record?.id;
        const pageMain = getPageMain();
        if (!recordId || typeof pageMain?.locateBlockWithRecordIdImpl !== 'function') {
            return Promise.resolve(false);
        }
        return pageMain.locateBlockWithRecordIdImpl(recordId).then(() => true);
    }

    function findLatestBlock(block) {
        const key = blockKey(block);
        return getMediaBlocks().find(item => blockKey(item) === key) || block;
    }

    function fetchImageSources(block) {
        const token = block?.snapshot?.image?.token;
        const fetcher = block?.imageManager?.fetch;
        if (!token || typeof fetcher !== 'function') {
            return Promise.reject(new Error('当前图片块缺少 imageManager.fetch'));
        }

        return new Promise((resolve, reject) => {
            let settled = false;
            const done = sources => {
                if (settled) return;
                settled = true;
                resolve(sources);
            };
            const fail = error => {
                if (settled) return;
                settled = true;
                reject(error);
            };

            try {
                const promise = fetcher.call(
                    block.imageManager,
                    { token, isHD: true, fuzzy: false },
                    {},
                    done,
                );
                if (promise && typeof promise.catch === 'function') promise.catch(fail);
            } catch (error) {
                fail(error);
            }
        });
    }

    function xhrFetchBlob(url) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', url);
            xhr.responseType = 'blob';
            xhr.withCredentials = true;
            xhr.onload = () => {
                if ((xhr.status >= 200 && xhr.status < 300) || xhr.status === 0) {
                    const blob = xhr.response;
                    if (blob && blob.size > 0) {
                        resolve(blob);
                        return;
                    }
                }
                reject(new Error(`XHR 图片读取失败：HTTP ${xhr.status}`));
            };
            xhr.onerror = () => reject(new Error('XHR 图片读取失败'));
            xhr.send();
        });
    }

    async function fetchBlobFromUrl(url) {
        if (!url) throw new Error('未拿到图片源地址');

        if (String(url).startsWith('blob:')) {
            return xhrFetchBlob(url);
        }

        try {
            const response = await fetch(url, { credentials: 'include' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            if (!blob || blob.size === 0) throw new Error('图片 blob 为空');
            return blob;
        } catch (error) {
            log('fetch 图片失败，切换 XHR', error);
            return xhrFetchBlob(url);
        }
    }

    async function fetchImageBlockBlob(block) {
        const sources = await fetchImageSources(block);
        const url = sources?.originSrc || sources?.src;
        const blob = await fetchBlobFromUrl(url);
        return {
            blob,
            label: '图片',
            name: getMediaName(block),
            token: block?.snapshot?.image?.token,
        };
    }

    function dataUrlToBlob(dataUrl) {
        const match = /^data:([^;,]+)?(;base64)?,(.*)$/i.exec(dataUrl || '');
        if (!match) throw new Error('画板快照不是合法 data URL');

        const mime = match[1] || 'image/png';
        const isBase64 = Boolean(match[2]);
        const raw = isBase64 ? atob(match[3]) : decodeURIComponent(match[3]);
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
        return new Blob([bytes], { type: mime });
    }

    function imageDataToBlob(imageData) {
        return new Promise((resolve, reject) => {
            if (!imageData?.width || !imageData?.height) {
                reject(new Error('画板导出的 ImageData 无效'));
                return;
            }

            const canvas = document.createElement('canvas');
            canvas.width = imageData.width;
            canvas.height = imageData.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('无法创建 canvas 上下文'));
                return;
            }

            ctx.putImageData(imageData, 0, 0);
            canvas.toBlob(blob => {
                if (blob) resolve(blob);
                else reject(new Error('画板转 PNG 失败'));
            }, 'image/png');
        });
    }

    async function fetchWhiteboardBlob(block) {
        let currentBlock = block;
        if (!isMediaBlockReady(currentBlock)) {
            await locateBlock(currentBlock);
            await wait(260);
            currentBlock = findLatestBlock(currentBlock);
        }

        const abilityKit = currentBlock?.whiteboardBlock?.abilityKit;
        const snapshot = abilityKit?.currentSnapshot?.();
        if (snapshot?.base64) {
            const blob = dataUrlToBlob(snapshot.base64);
            if (blob?.size > 0) {
                return {
                    blob,
                    label: '画板',
                    name: getMediaName(currentBlock),
                    source: 'currentSnapshot',
                };
            }
        }

        const isolateEnv = currentBlock?.whiteboardBlock?.isolateEnv;
        if (!isolateEnv?.hasRatioApp?.()) throw new Error('画板运行环境未就绪');

        const ratioApp = isolateEnv.getRatioApp();
        const wrapper = await ratioApp?.ratioAppProxy?.getOriginImageDataByNodeId?.(24, [''], false, 2);
        if (!wrapper?.data) throw new Error('画板导出 ImageData 失败');

        try {
            const blob = await imageDataToBlob(wrapper.data);
            return {
                blob,
                label: '画板',
                name: getMediaName(currentBlock),
                source: 'originImageData',
            };
        } finally {
            wrapper.release?.();
        }
    }

    async function fetchMediaBlob(block) {
        const type = getSnapshotType(block) || getBlockType(block);
        if (type === 'image') return fetchImageBlockBlob(block);
        if (type === 'whiteboard') return fetchWhiteboardBlob(block);
        throw new Error(`暂不支持复制 ${type || 'unknown'} 块`);
    }

    function canvasToPngBlob(canvas) {
        return new Promise((resolve, reject) => {
            canvas.toBlob(blob => {
                if (blob) resolve(blob);
                else reject(new Error('图片转 PNG 失败'));
            }, 'image/png');
        });
    }

    async function decodeBlobWithImageElement(blob) {
        const url = URL.createObjectURL(blob);
        try {
            const img = await new Promise((resolve, reject) => {
                const image = new Image();
                image.onload = () => resolve(image);
                image.onerror = () => reject(new Error('图片解码失败'));
                image.src = url;
            });
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('无法创建 canvas 上下文');
            ctx.drawImage(img, 0, 0);
            return canvasToPngBlob(canvas);
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    async function normalizeClipboardBlob(blob) {
        if (blob.type === 'image/png') return blob;

        if (typeof createImageBitmap === 'function') {
            try {
                const bitmap = await createImageBitmap(blob);
                const canvas = document.createElement('canvas');
                canvas.width = bitmap.width;
                canvas.height = bitmap.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) throw new Error('无法创建 canvas 上下文');
                ctx.drawImage(bitmap, 0, 0);
                bitmap.close?.();
                return canvasToPngBlob(canvas);
            } catch (error) {
                log('createImageBitmap 解码失败，切换 ImageElement', error);
            }
        }

        return decodeBlobWithImageElement(blob);
    }

    async function prepareMediaItem(descriptor) {
        const rawMedia = await fetchMediaBlob(descriptor.block);
        const blob = await normalizeClipboardBlob(rawMedia.blob);
        return {
            key: descriptor.key,
            blob,
            mime: blob.type || 'image/png',
            size: blob.size,
            label: rawMedia.label || descriptor.label,
            name: rawMedia.name || descriptor.name,
            type: descriptor.type,
            index: descriptor.index,
            total: descriptor.total,
            recordId: descriptor.recordId,
            source: rawMedia.source || 'imageManager',
        };
    }

    async function prepareMediaBatch() {
        if (!config.mediaCopyAssistant) {
            showToast('请先开启媒体复制助手', 2200);
            return null;
        }
        if (mediaBusy) return null;

        mediaBusy = true;
        const batchId = createBatchId();
        try {
            const ready = await waitForPageMain();
            if (!ready) {
                setMediaStatus({ state: 'failed', reason: 'unsupported', batchId });
                showToast('当前页面未检测到新版飞书文档', 2600);
                return { ok: false, reason: 'unsupported' };
            }

            const descriptors = getMediaDescriptors();
            if (!descriptors.length) {
                setMediaStatus({ state: 'failed', reason: 'empty', batchId, total: 0, prepared: 0 });
                showToast('未发现图片或画板', 2200);
                return { ok: false, reason: 'empty' };
            }

            setMediaStatus({
                state: 'preparing',
                batchId,
                total: descriptors.length,
                prepared: 0,
                failures: 0,
                types: getMediaSummary().types,
                sourceUrl: location.href,
                sourceTitle: document.title,
            });
            showToast(`开始准备 ${descriptors.length} 个媒体`, 1800);

            const items = [];
            const failures = [];
            for (const descriptor of descriptors) {
                try {
                    const item = await prepareMediaItem(descriptor);
                    items.push(item);
                } catch (error) {
                    failures.push({
                        index: descriptor.index,
                        type: descriptor.type,
                        message: String(error?.message || error),
                    });
                    log('准备媒体失败', descriptor, error);
                }
                setMediaStatus({
                    state: 'preparing',
                    batchId,
                    total: descriptors.length,
                    prepared: items.length,
                    failures: failures.length,
                });
                await wait(80);
            }

            if (!items.length) {
                setMediaStatus({ state: 'failed', batchId, total: descriptors.length, prepared: 0, failures: failures.length, reason: 'all-failed' });
                showToast('媒体准备失败，详见控制台', 3200);
                return { ok: false, reason: 'all-failed', failures };
            }

            const cache = await cacheMediaBatch(items, { batchId });
            const labelCounts = items.reduce((acc, item) => {
                acc[item.label] = (acc[item.label] || 0) + 1;
                return acc;
            }, {});

            setMediaStatus({
                state: 'ready',
                batchId,
                total: descriptors.length,
                prepared: items.length,
                failures: failures.length,
                cache,
                labels: labelCounts,
                sourceUrl: location.href,
                sourceTitle: document.title,
                readyAt: Date.now(),
                consumedAt: null,
            });
            showToast(`已准备 ${items.length}/${descriptors.length} 个媒体`, 2800);
            return { ok: true, batchId, total: descriptors.length, prepared: items.length, failures, cache };
        } catch (error) {
            setMediaStatus({ state: 'failed', batchId, reason: 'exception', error: String(error?.message || error) });
            showToast('媒体准备失败，详见控制台', 3200);
            log('媒体准备异常', error);
            return { ok: false, reason: 'exception', error };
        } finally {
            mediaBusy = false;
            updateMediaPanel();
        }
    }

    function countBlockTypes() {
        const seen = new Set();
        const types = {};
        collectBlocks(getRootBlock()).forEach(block => {
            const key = blockKey(block);
            if (seen.has(key)) return;
            seen.add(key);
            const type = getSnapshotType(block) || getBlockType(block) || 'unknown';
            types[type] = (types[type] || 0) + 1;
        });
        return { total: seen.size, types };
    }

    function findEditableTarget() {
        const documents = getCandidateDocuments();
        for (const doc of documents) {
            const win = doc.defaultView || window;
            const selection = win.getSelection?.();
            const selectionNode = selection?.anchorNode?.nodeType === Node.ELEMENT_NODE
                ? selection.anchorNode
                : selection?.anchorNode?.parentElement;
            const selectionEditable = selectionNode?.closest?.('[contenteditable="true"]');
            if (selectionEditable) return selectionEditable;

            const activeEditable = doc.activeElement?.closest?.('[contenteditable="true"]');
            if (activeEditable) return activeEditable;
        }

        const candidates = documents.flatMap(doc => Array.from(doc.querySelectorAll('[contenteditable="true"]'))
            .map(el => {
                const rect = el.getBoundingClientRect();
                return {
                    el,
                    rect,
                    text: (el.innerText || '').replace(/\u200b/g, '').trim(),
                    className: String(el.className || ''),
                    viewportHeight: el.ownerDocument?.defaultView?.innerHeight || window.innerHeight,
                };
            })
            .filter(item => item.rect.width > 40 && item.rect.height > 1));

        const visible = candidates.filter(item => item.rect.y > 70 && item.rect.y < item.viewportHeight - 20);
        const target = visible.find(item => item.text === '')
            || visible.find(item => item.className.includes('editor-kit-container'))
            || visible[visible.length - 1]
            || candidates[candidates.length - 1];
        return target?.el || null;
    }

    function focusEditableTarget(target) {
        target.scrollIntoView({ block: 'center', inline: 'nearest' });
        target.focus();

        const doc = target.ownerDocument || document;
        const win = doc.defaultView || window;
        const range = doc.createRange();
        range.selectNodeContents(target);
        range.collapse(false);
        const selection = win.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    }

    function createPasteEventFromBlob(blob, mime, name, eventWindow = window) {
        const FileCtor = eventWindow.File || File;
        const DataTransferCtor = eventWindow.DataTransfer || DataTransfer;
        const ClipboardEventCtor = eventWindow.ClipboardEvent || ClipboardEvent;
        const file = new FileCtor([blob], name, { type: mime });
        const dataTransfer = new DataTransferCtor();
        dataTransfer.items.add(file);
        return new ClipboardEventCtor('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: dataTransfer,
        });
    }

    async function waitForImageIncrease(beforeImages, timeoutMs = 8000) {
        const startedAt = Date.now();
        let latest = countBlockTypes();
        while (Date.now() - startedAt < timeoutMs) {
            if ((latest.types.image || 0) > beforeImages) return latest;
            await wait(250);
            latest = countBlockTypes();
        }
        return latest;
    }

    async function dispatchImagePaste(target, blob, label, createdAt) {
        const mime = blob.type || 'image/png';
        const name = `${label || 'media'}-${createdAt || Date.now()}.png`;
        const before = countBlockTypes();
        const beforeImages = before.types.image || 0;
        const eventWindow = target.ownerDocument?.defaultView || window;
        const event = createPasteEventFromBlob(blob, mime, name, eventWindow);
        const defaultNotPrevented = target.dispatchEvent(event);
        const after = await waitForImageIncrease(beforeImages);
        const afterImages = after.types.image || 0;

        return {
            ok: afterImages > beforeImages,
            dispatched: true,
            defaultPrevented: !defaultNotPrevented,
            mime,
            size: blob.size,
            before,
            after,
        };
    }

    async function insertPreparedMedia() {
        if (!config.mediaCopyAssistant) {
            showToast('请先开启媒体复制助手', 2200);
            return null;
        }
        if (mediaBusy) return null;

        mediaBusy = true;
        try {
            const ready = await waitForPageMain();
            if (!ready) {
                showToast('当前页面未检测到新版飞书文档', 2600);
                return { ok: false, reason: 'unsupported' };
            }

            const batch = await readMediaRecord();
            if (!batch?.items?.length) {
                showToast('没有已准备的媒体', 2600);
                return { ok: false, reason: 'empty-cache' };
            }
            if (batch.consumedAt) {
                showToast('这批媒体已插入，避免重复插入', 2600);
                return { ok: false, reason: 'consumed' };
            }

            const target = findEditableTarget();
            if (!target) {
                showToast('请先点击目标文档中的插入位置', 3200);
                return { ok: false, reason: 'no-editor' };
            }

            focusEditableTarget(target);
            setMediaStatus({
                state: 'inserting',
                batchId: batch.batchId,
                total: batch.items.length,
                inserted: 0,
                failures: 0,
            });

            const results = [];
            for (let i = 0; i < batch.items.length; i += 1) {
                const item = batch.items[i];
                if (!item?.blob) {
                    results.push({ ok: false, index: i + 1, reason: 'empty-blob' });
                    continue;
                }

                const itemTarget = findEditableTarget() || target;
                focusEditableTarget(itemTarget);
                const pasteResult = await dispatchImagePaste(itemTarget, item.blob, item.label, batch.createdAt);
                results.push(Object.assign({}, pasteResult, {
                    index: i + 1,
                    total: batch.items.length,
                    type: item.label || '媒体',
                    sourceIndex: item.index,
                }));

                const inserted = results.filter(result => result.ok).length;
                const failures = results.filter(result => !result.ok).length;
                setMediaStatus({
                    state: 'inserting',
                    batchId: batch.batchId,
                    total: batch.items.length,
                    inserted,
                    failures,
                });
                await wait(260);
            }

            const inserted = results.filter(result => result.ok).length;
            const failures = results.length - inserted;
            const consumedAt = Date.now();
            await writeMediaRecord(Object.assign({}, batch, {
                consumedAt,
                lastInsertResult: { inserted, total: batch.items.length, failures },
            }));
            setMediaStatus({
                state: inserted > 0 ? 'consumed' : 'failed',
                batchId: batch.batchId,
                total: batch.items.length,
                inserted,
                failures,
                consumedAt,
            });

            showToast(`已插入 ${inserted}/${batch.items.length} 个媒体`, 3200);
            log('媒体插入结果', { inserted, failures, results });
            return { ok: inserted > 0, batchId: batch.batchId, inserted, total: batch.items.length, failures, results };
        } catch (error) {
            setMediaStatus({ state: 'failed', reason: 'insert-exception', error: String(error?.message || error) });
            showToast('媒体插入失败，详见控制台', 3200);
            log('媒体插入异常', error);
            return { ok: false, reason: 'exception', error };
        } finally {
            mediaBusy = false;
            updateMediaPanel();
        }
    }

    async function clearPreparedMedia() {
        try {
            await deleteMediaRecord();
        } catch (error) {
            log('清空媒体缓存失败', error);
        }
        clearMediaStatus();
        showToast('已清空媒体缓存', 1800);
    }

    function formatMediaStatus(status = getMediaStatus()) {
        if (!config.mediaCopyAssistant) return '未开启媒体复制助手';
        if (!status) return '未准备媒体';
        if (status.state === 'expired') return '媒体缓存已过期';
        if (status.state === 'preparing') return `准备中 ${status.prepared || 0}/${status.total || 0}`;
        if (status.state === 'ready') return `已准备 ${status.prepared || 0}/${status.total || 0} 个媒体`;
        if (status.state === 'inserting') return `正在插入 ${status.inserted || 0}/${status.total || 0}`;
        if (status.state === 'consumed') return `已插入 ${status.inserted || 0}/${status.total || 0} 个媒体`;
        if (status.state === 'failed') return `失败：${status.reason || status.error || '未知错误'}`;
        return '未准备媒体';
    }

    function updateMediaPanel() {
        const section = document.getElementById('ftk-media-section');
        if (!section) return;

        const status = getMediaStatus();
        const enabled = Boolean(config.mediaCopyAssistant);
        const stateEl = section.querySelector('[data-role="media-state"]');
        const metaEl = section.querySelector('[data-role="media-meta"]');
        const prepareBtn = section.querySelector('[data-act="media-prepare"]');
        const insertBtn = section.querySelector('[data-act="media-insert"]');
        const clearBtn = section.querySelector('[data-act="media-clear"]');

        if (stateEl) stateEl.textContent = formatMediaStatus(status);

        if (metaEl) {
            if (!enabled) {
                metaEl.textContent = '开启后可准备当前文档图片和画板，再到目标文档插入。';
            } else if (status?.labels) {
                const labelText = Object.entries(status.labels).map(([label, count]) => `${label} ${count}`).join('，');
                metaEl.textContent = labelText || '媒体已准备';
            } else if (status?.sourceTitle && status.state !== 'expired') {
                metaEl.textContent = `来源：${status.sourceTitle}`;
            } else {
                metaEl.textContent = '不会改写正文剪贴板，表格复制仍由飞书原生处理。';
            }
        }

        if (prepareBtn) prepareBtn.disabled = !enabled || mediaBusy;
        if (insertBtn) insertBtn.disabled = !enabled || mediaBusy || !status || status.state === 'expired' || status.state === 'consumed';
        if (clearBtn) clearBtn.disabled = !enabled || mediaBusy || !status;
    }

    // ============================================================
    // 5. 设置面板 UI
    // ============================================================
    let openSettingsPanel = null;
    let closeSettingsPanel = null;
    let baseUiStyle = null;
    let panelStyle = null;
    let settingsTrigger = null;
    let settingsPanel = null;
    const PANEL_GROUP_LABELS = {
        '核心保护': '核心',
        '体验增强': '体验',
        '媒体复制': '媒体',
        '辅助': '高级',
    };

    const BASE_UI_CSS = `
        #ftk-fab {
            position: fixed; right: 0; top: 50%; z-index: 2147483646;
            width: 10px; height: 42px; transform: translateY(-50%);
            border: 0; border-radius: 8px 0 0 8px; padding: 0 10px 0 7px;
            background: rgba(100, 106, 115, .42); color: #3370ff;
            display: flex; align-items: center; justify-content: flex-start; gap: 7px;
            cursor: pointer; overflow: hidden; user-select: none;
            box-shadow: none; opacity: .72;
            font: 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif;
            transition: width .18s ease, opacity .18s ease, background .18s ease, box-shadow .18s ease;
        }
        #ftk-fab:hover,
        #ftk-fab:focus-visible,
        #ftk-fab.active {
            width: 52px; opacity: 1; background: #fff;
            box-shadow: 0 6px 20px rgba(31,35,41,.14), 0 0 0 1px rgba(31,35,41,.08);
            outline: none;
        }
        #ftk-fab .ftk-grip {
            width: 3px; height: 18px; border-radius: 99px;
            background: rgba(255,255,255,.82); flex: 0 0 auto;
        }
        #ftk-fab:hover .ftk-grip,
        #ftk-fab:focus-visible .ftk-grip,
        #ftk-fab.active .ftk-grip {
            background: #3370ff;
        }
        #ftk-fab .ftk-fab-label {
            opacity: 0; white-space: nowrap; color: #3370ff; font-weight: 500;
            transition: opacity .16s ease;
        }
        #ftk-fab:hover .ftk-fab-label,
        #ftk-fab:focus-visible .ftk-fab-label,
        #ftk-fab.active .ftk-fab-label {
            opacity: 1;
        }

        .ftk-toast {
            position: fixed; left: 50%; top: 60px; transform: translate(-50%, -8px);
            z-index: 2147483647; background: rgba(0,0,0,.78); color: #fff;
            padding: 8px 16px; border-radius: 6px; font-size: 13px;
            opacity: 0; transition: opacity .2s ease, transform .2s ease;
            pointer-events: none;
        }
        .ftk-toast.show { opacity: 1; transform: translate(-50%, 0); }
    `;

    const PANEL_CSS = `
        #ftk-panel {
            position: fixed; right: 0; top: 0; z-index: 2147483647;
            width: min(396px, calc(100vw - 28px)); height: 100vh; height: 100dvh;
            background: #fff; color: #1f2329;
            box-shadow: -10px 0 30px rgba(31,35,41,.12), -1px 0 0 rgba(31,35,41,.08);
            padding: 0;
            font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif;
            display: flex; flex-direction: column;
            opacity: 0; pointer-events: none; transform: translateX(calc(100% + 16px));
            transition: opacity .2s ease, transform .22s cubic-bezier(.2,.8,.2,1);
        }
        #ftk-panel.show { opacity: 1; pointer-events: auto; transform: translateX(0); }

        #ftk-panel .ftk-head {
            display: flex; align-items: center; justify-content: space-between;
            padding: 18px 18px 14px; border-bottom: 1px solid #eff0f1;
            flex: 0 0 auto;
        }
        #ftk-panel .ftk-title { min-width: 0; }
        #ftk-panel .ftk-head h3 {
            margin: 0; font-size: 15px; line-height: 22px; font-weight: 600; letter-spacing: 0;
        }
        #ftk-panel .ftk-head .ver {
            color: #8f959e; font-size: 12px; line-height: 18px; margin-top: 1px;
        }
        #ftk-panel .ftk-close {
            width: 28px; height: 28px; border: 0; border-radius: 6px; background: transparent;
            color: #646a73; cursor: pointer; font-size: 20px; line-height: 28px; padding: 0;
            display: flex; align-items: center; justify-content: center;
            transition: background .15s ease, color .15s ease;
        }
        #ftk-panel .ftk-close:hover,
        #ftk-panel .ftk-close:focus-visible {
            background: #f2f3f5; color: #1f2329; outline: none;
        }

        #ftk-panel .ftk-body {
            flex: 1 1 auto; overflow-y: auto; padding: 8px 18px 18px;
            scrollbar-width: thin; scrollbar-color: rgba(100,106,115,.34) transparent;
        }
        #ftk-panel .ftk-body::-webkit-scrollbar { width: 6px; }
        #ftk-panel .ftk-body::-webkit-scrollbar-track { background: transparent; }
        #ftk-panel .ftk-body::-webkit-scrollbar-thumb {
            background: rgba(100,106,115,.28); border-radius: 99px;
        }

        #ftk-panel .ftk-group { margin: 14px 0 18px; }
        #ftk-panel .ftk-group-title {
            font-size: 12px; line-height: 18px; color: #8f959e; font-weight: 600;
            letter-spacing: 0; margin: 0 0 8px;
        }

        #ftk-panel .ftk-item {
            position: relative; border-bottom: 1px solid #f2f3f5;
        }
        #ftk-panel .ftk-item:last-child { border-bottom: 0; }
        #ftk-panel .ftk-row {
            display: flex; align-items: center; justify-content: space-between; gap: 12px;
            min-height: 56px; padding: 9px 10px; margin: 0 -10px;
            border-radius: 8px;
            transition: background .15s ease;
        }
        #ftk-panel .ftk-row:hover { background: #f7f8fa; }
        #ftk-panel .ftk-copy {
            display: block; min-width: 0; flex: 1;
        }
        #ftk-panel .ftk-topline {
            display: flex; align-items: center; gap: 8px; min-width: 0;
        }
        #ftk-panel .ftk-name {
            font-weight: 500; font-size: 14px; line-height: 20px;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        #ftk-panel .ftk-state {
            flex: 0 0 auto; padding: 1px 5px; border-radius: 4px;
            color: #8f959e; background: #f2f3f5;
            font-size: 11px; line-height: 16px; font-weight: 500;
        }
        #ftk-panel .ftk-state.reload { color: #b76e00; background: #fff4df; }
        #ftk-panel .ftk-help-wrap {
            position: static; flex: 0 0 auto; display: inline-flex;
        }
        #ftk-panel .ftk-help {
            width: 18px; height: 18px; border-radius: 50%;
            border: 0; padding: 0; cursor: help;
            display: inline-flex; align-items: center; justify-content: center;
            background: #eff0f1; color: #8f959e;
            font-size: 12px; line-height: 18px; font-weight: 600;
        }
        #ftk-panel .ftk-help:hover,
        #ftk-panel .ftk-help:focus-visible,
        #ftk-panel .ftk-help-wrap.pinned .ftk-help {
            background: #e8f3ff; color: #3370ff; outline: none;
        }
        #ftk-panel .ftk-tip {
            display: none; position: absolute; left: 10px; right: 10px; top: 42px; z-index: 3;
            padding: 10px 12px; border-radius: 8px;
            background: #fff; color: #646a73;
            box-shadow: 0 10px 28px rgba(31,35,41,.16), 0 0 0 1px rgba(31,35,41,.08);
            font-size: 12px; line-height: 18px; white-space: normal;
            opacity: 0; transform: translateY(-3px); pointer-events: none;
            transition: opacity .14s ease, transform .14s ease;
        }
        #ftk-panel .ftk-tip div + div { margin-top: 5px; }
        #ftk-panel .ftk-tip b { color: #1f2329; font-weight: 600; }
        #ftk-panel .ftk-help-wrap:hover .ftk-tip,
        #ftk-panel .ftk-help:focus-visible + .ftk-tip,
        #ftk-panel .ftk-help-wrap.pinned .ftk-tip {
            display: block; opacity: 1; transform: translateY(0); pointer-events: auto;
        }
        #ftk-panel .ftk-summary {
            display: block; margin-top: 2px; color: #8f959e;
            font-size: 12px; line-height: 18px;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }

        .ftk-switch { position: relative; width: 34px; height: 20px; flex-shrink: 0; }
        .ftk-switch input { opacity: 0; width: 0; height: 0; position: absolute; }
        .ftk-slider {
            position: absolute; cursor: pointer; inset: 0;
            background: #c9cdd4; border-radius: 20px; transition: background .18s ease;
        }
        .ftk-slider:before {
            content: ""; position: absolute; height: 16px; width: 16px;
            left: 2px; bottom: 2px; background: #fff; border-radius: 50%; transition: .2s;
            box-shadow: 0 1px 2px rgba(31,35,41,.22);
        }
        .ftk-switch input:checked + .ftk-slider { background: #3370ff; }
        .ftk-switch input:checked + .ftk-slider:before { transform: translateX(14px); }
        .ftk-switch input:focus-visible + .ftk-slider {
            box-shadow: 0 0 0 3px rgba(51,112,255,.18);
        }

        #ftk-panel .ftk-media-section {
            margin: 8px 0 18px;
        }
        #ftk-panel .ftk-media-card {
            border: 1px solid #eff0f1; border-radius: 8px;
            padding: 12px; background: #fbfcfd;
        }
        #ftk-panel .ftk-media-state {
            color: #1f2329; font-size: 14px; line-height: 20px; font-weight: 600;
            margin-bottom: 3px;
        }
        #ftk-panel .ftk-media-meta {
            color: #8f959e; font-size: 12px; line-height: 18px;
            margin-bottom: 10px;
        }
        #ftk-panel .ftk-media-actions {
            display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;
        }

        #ftk-panel .ftk-footer {
            flex: 0 0 auto; padding: 12px 18px 18px; border-top: 1px solid #eff0f1;
            background: #fff;
        }
        #ftk-panel .ftk-notice {
            display: none; align-items: center; gap: 6px; margin-bottom: 10px;
            color: #8f959e; font-size: 12px; line-height: 18px;
        }
        #ftk-panel .ftk-notice.show { display: flex; }
        #ftk-panel .ftk-actions {
            display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
        }
        #ftk-panel .ftk-btn {
            height: 34px; padding: 0 12px; border: 1px solid #dee0e3;
            border-radius: 6px; background: #fff; color: #1f2329;
            cursor: pointer; font-size: 13px; font-weight: 500;
            transition: background .15s ease, border-color .15s ease;
        }
        #ftk-panel .ftk-btn:hover { background: #f5f6f8; border-color: #c9cdd4; }
        #ftk-panel .ftk-btn.primary {
            background: #3370ff; color: #fff; border-color: #3370ff;
        }
        #ftk-panel .ftk-btn.primary:hover { background: #2860e0; }
        #ftk-panel .ftk-btn:disabled,
        #ftk-panel .ftk-btn:disabled:hover {
            cursor: not-allowed; color: #bbbfc4; background: #f7f8fa; border-color: #eff0f1;
        }

    `;

    function buildMediaSection() {
        const section = $el('div', { id: 'ftk-media-section', class: 'ftk-media-section' });
        section.innerHTML = `
            <div class="ftk-group-title">媒体操作</div>
            <div class="ftk-media-card">
                <div class="ftk-media-state" data-role="media-state">未准备媒体</div>
                <div class="ftk-media-meta" data-role="media-meta">开启后可准备当前文档图片和画板，再到目标文档插入。</div>
                <div class="ftk-media-actions">
                    <button class="ftk-btn primary" type="button" data-act="media-prepare">准备媒体</button>
                    <button class="ftk-btn" type="button" data-act="media-insert">插入媒体</button>
                    <button class="ftk-btn" type="button" data-act="media-clear">清空缓存</button>
                </div>
            </div>
        `;
        return section;
    }

    function buildPanel() {
        if (settingsPanel) return settingsPanel;
        if (!panelStyle) panelStyle = GM.style(PANEL_CSS);

        const panel = $el('aside', { id: 'ftk-panel', 'aria-label': `${SCRIPT_NAME} 设置`, 'aria-hidden': 'true' });
        const head = $el('div', { class: 'ftk-head' }, [
            $el('div', { class: 'ftk-title' }, [
                $el('h3', {}, SCRIPT_NAME),
                $el('div', { class: 'ver' }, `v${SCRIPT_VERSION}`),
            ]),
            $el('button', { class: 'ftk-close', type: 'button', 'data-act': 'close', 'aria-label': '关闭设置' }, '×'),
        ]);
        panel.appendChild(head);

        const body = $el('div', { class: 'ftk-body' });

        // 按 group 分组渲染
        const groups = {};
        FEATURES.forEach(f => { (groups[f.group] = groups[f.group] || []).push(f); });
        for (const [groupName, items] of Object.entries(groups)) {
            const groupEl = $el('div', { class: 'ftk-group' });
            groupEl.appendChild($el('div', { class: 'ftk-group-title' }, PANEL_GROUP_LABELS[groupName] || groupName));
            items.forEach(meta => {
                const item = $el('div', { class: 'ftk-item' });
                const effectText = meta.hot ? '即时生效' : '刷新生效';
                const effectClass = meta.hot ? 'hot' : 'reload';
                const row = $el('div', { class: 'ftk-row' });
                row.innerHTML = `
                    <span class="ftk-copy">
                        <span class="ftk-topline">
                            <span class="ftk-name">${meta.label}</span>
                            <span class="ftk-state ${effectClass}">${effectText}</span>
                            <span class="ftk-help-wrap">
                                <button class="ftk-help" type="button" aria-label="${meta.label} 的影响和前置条件">?</button>
                                <span class="ftk-tip" role="tooltip">
                                    <div><b>影响：</b>${meta.impact}</div>
                                    <div><b>前置：</b>${meta.requirement}</div>
                                    <div><b>生效：</b>${effectText}</div>
                                </span>
                            </span>
                        </span>
                        <span class="ftk-summary">${meta.summary}</span>
                    </span>
                    <label class="ftk-switch" aria-label="${meta.label}">
                        <input type="checkbox" data-key="${meta.key}" ${config[meta.key] ? 'checked' : ''}>
                        <span class="ftk-slider"></span>
                    </label>
                `;
                item.appendChild(row);
                groupEl.appendChild(item);
            });
            body.appendChild(groupEl);
        }
        body.appendChild(buildMediaSection());
        panel.appendChild(body);

        const footer = $el('div', { class: 'ftk-footer' });
        footer.innerHTML = `
            <div class="ftk-notice" id="ftk-reload-notice">部分设置刷新后生效</div>
            <div class="ftk-actions">
                <button class="ftk-btn" data-act="reset">恢复默认</button>
                <button class="ftk-btn primary" data-act="reload">刷新生效</button>
            </div>
        `;
        panel.appendChild(footer);
        document.body.appendChild(panel);
        settingsPanel = panel;

        // 切换显隐
        const showPanel = () => {
            panel.classList.add('show');
            panel.setAttribute('aria-hidden', 'false');
            settingsTrigger?.classList.add('active');
        };
        const hidePanel = () => {
            panel.classList.remove('show');
            panel.setAttribute('aria-hidden', 'true');
            settingsTrigger?.classList.remove('active');
        };
        openSettingsPanel = showPanel;
        closeSettingsPanel = hidePanel;

        document.addEventListener('click', e => {
            if (!panel.contains(e.target) && !settingsTrigger?.contains(e.target) && panel.classList.contains('show')) {
                hidePanel();
            }
        });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && panel.classList.contains('show')) hidePanel();
        });

        // 开关变更
        panel.addEventListener('change', e => {
            const key = e.target.dataset.key;
            if (!key) return;
            config[key] = e.target.checked;
            saveConfig(config);
            log(`配置变更：${key} = ${config[key]}`);
            const meta = FEATURES.find(f => f.key === key);
            if (meta && !meta.hot) panel.querySelector('#ftk-reload-notice')?.classList.add('show');
            // 即时生效模块重新 apply
            applyAllHotModules();
        });

        // 按钮
        panel.addEventListener('click', e => {
            const help = e.target.closest('.ftk-help');
            if (help) {
                e.preventDefault();
                e.stopPropagation();
                const wrap = help.closest('.ftk-help-wrap');
                const willPin = !wrap.classList.contains('pinned');
                panel.querySelectorAll('.ftk-help-wrap.pinned').forEach(el => el.classList.remove('pinned'));
                wrap.classList.toggle('pinned', willPin);
                return;
            }

            if (!e.target.closest('.ftk-help-wrap')) {
                panel.querySelectorAll('.ftk-help-wrap.pinned').forEach(el => el.classList.remove('pinned'));
            }

            const actionEl = e.target.closest('[data-act]');
            const act = actionEl?.dataset?.act;
            if (act === 'media-prepare') {
                prepareMediaBatch();
                return;
            }
            if (act === 'media-insert') {
                insertPreparedMedia();
                return;
            }
            if (act === 'media-clear') {
                clearPreparedMedia();
                return;
            }
            if (act === 'close') {
                closeSettingsPanel?.();
                return;
            }
            if (act === 'reload') {
                location.reload();
                return;
            }
            if (act === 'reset') {
                FEATURES.forEach(f => { config[f.key] = f.default; });
                saveConfig(config);
                panel.querySelectorAll('input[data-key]').forEach(input => {
                    input.checked = config[input.dataset.key];
                });
                panel.querySelector('#ftk-reload-notice')?.classList.remove('show');
                applyAllHotModules();
                showToast('已恢复默认配置');
                return;
            }
        });

        updateMediaPanel();
        return panel;
    }

    function ensureSettingsTrigger() {
        if (settingsTrigger) return settingsTrigger;
        if (!baseUiStyle) baseUiStyle = GM.style(BASE_UI_CSS);

        settingsTrigger = $el('button', {
            id: 'ftk-fab',
            type: 'button',
            title: `${SCRIPT_NAME} 设置`,
            'aria-label': `${SCRIPT_NAME} 设置`,
        }, [
            $el('span', { class: 'ftk-grip' }),
            $el('span', { class: 'ftk-fab-label' }, '设置'),
        ]);

        settingsTrigger.addEventListener('click', e => {
            e.stopPropagation();
            const panel = buildPanel();
            if (panel.classList.contains('show')) closeSettingsPanel?.();
            else openSettingsPanel?.();
        });

        document.body.appendChild(settingsTrigger);
        return settingsTrigger;
    }

    function showSettings() {
        if (!document.body) return setTimeout(showSettings, 50);
        ensureSettingsTrigger();
        buildPanel();
        openSettingsPanel?.();
    }

    function applyAllHotModules() {
        applyWatermark();
        applyUserSelect();
        applyDrag();
        applyImageDownload();
        applyLinksNewTab();
        applyCopyAsMarkdown();
        updateMediaPanel();
    }

    // ============================================================
    // 6. 启动
    // ============================================================
    function boot() {
        if (!document.body) return setTimeout(boot, 50);
        ensureSettingsTrigger();
        applyAllHotModules();
        log('UI 已就绪');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    // 油猴菜单命令（脚本菜单里也能触发）
    if (typeof GM_registerMenuCommand !== 'undefined') {
        GM_registerMenuCommand('打开设置面板', showSettings);
        GM_registerMenuCommand('准备媒体复制', prepareMediaBatch);
        GM_registerMenuCommand('插入已准备媒体', insertPreparedMedia);
        GM_registerMenuCommand('清空媒体缓存', clearPreparedMedia);
        GM_registerMenuCommand('恢复默认配置', () => {
            FEATURES.forEach(f => { config[f.key] = f.default; });
            saveConfig(config);
            location.reload();
        });
    }
})();
