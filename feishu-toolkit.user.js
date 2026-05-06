// ==UserScript==
// @name         飞书工具箱 (Feishu Toolkit)
// @name:zh-CN   飞书工具箱
// @name:en      Feishu Toolkit
// @namespace    https://github.com/BlueSkyXN/feishu-toolkit
// @version      0.1.0
// @description  飞书网页端增强工具箱：去水印、解除复制/右键/导出/选择限制、保留表格格式、图片一键下载、外链新标签、复制为 Markdown。
// @description:zh-CN 飞书网页端增强工具箱：去水印、解除复制/右键/导出/选择限制、保留表格格式、图片一键下载、外链新标签、复制为 Markdown。
// @description:en Enhance Feishu/Lark web pages with watermark hiding, copy/context-menu/select/export helpers, image download, external-link handling, and Markdown copy.
// @author       BlueSkyXN
// @match        *://*.feishu.cn/*
// @match        *://*.larksuite.com/*
// @match        *://*.larkoffice.com/*
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @homepageURL  https://github.com/BlueSkyXN/feishu-toolkit
// @supportURL   https://github.com/BlueSkyXN/feishu-toolkit/issues
// @downloadURL  https://github.com/BlueSkyXN/feishu-toolkit/raw/main/feishu-toolkit.user.js
// @updateURL    https://github.com/BlueSkyXN/feishu-toolkit/raw/main/feishu-toolkit.user.js
// @license      GPL-3.0-only
// ==/UserScript==

(function () {
    'use strict';

    // ============================================================
    // 1. 配置中心
    // ============================================================
    const SCRIPT_NAME = '飞书工具箱';
    const SCRIPT_VERSION = '0.1.0';
    const CONFIG_KEY = 'feishu_toolkit_v1';
    const LEGACY_CONFIG_KEYS = ['feishu_enhancer_pro_v2'];

    // 功能元信息：单一真相源，UI/逻辑都从这里读
    // group: 分组渲染   hot: 即时生效（无需刷新）   default: 默认开关
    const FEATURES = [
        // ---- T0 核心保护：解除限制类 ----
        { key: 'removeWatermark',   label: '去除水印',           group: '核心保护', hot: true,  default: true,  desc: 'CSS 隐藏水印图层' },
        { key: 'bypassCopy',        label: '解除复制限制',       group: '核心保护', hot: false, default: true,  desc: '改写 XHR 权限响应' },
        { key: 'bypassContextMenu', label: '解除右键限制',       group: '核心保护', hot: false, default: true,  desc: '拦截 contextmenu 监听' },
        { key: 'bypassUserSelect',  label: '解除文本选择',       group: '核心保护', hot: true,  default: true,  desc: '强制 user-select: text' },
        { key: 'bypassDrag',        label: '解除拖拽限制',       group: '核心保护', hot: true,  default: false, desc: '允许拖拽图片/文本' },
        { key: 'keepTableFormat',   label: '保留表格格式',       group: '核心保护', hot: false, default: true,  desc: '不拦截 copy 事件，复制到 Excel 不变形' },
        // ---- T1 体验增强 ----
        { key: 'forceExport',       label: '强制导出/下载',      group: '体验增强', hot: false, default: true,  desc: '把所有权限位 0 改 1（download/export/print 等）' },
        { key: 'imageDownload',     label: '图片悬停下载按钮',   group: '体验增强', hot: true,  default: true,  desc: '鼠标悬停图片时显示下载按钮，获取原图' },
        { key: 'linksNewTab',       label: '外链新标签打开',     group: '体验增强', hot: true,  default: true,  desc: '飞书域外链接强制新标签' },
        { key: 'copyAsMarkdown',    label: '复制为 Markdown',    group: '体验增强', hot: true,  default: true,  desc: '快捷键 Ctrl+Shift+C 把选区转 MD 写入剪贴板' },
        // ---- 辅助 ----
        { key: 'debug',             label: '调试日志',           group: '辅助',     hot: true,  default: false, desc: '在控制台输出运行信息' },
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

    // ============================================================
    // 3. 全局 Hook（必须 document-start 立即执行，运行时再判断开关）
    // ============================================================

    // -- 3.1 hook addEventListener：处理 contextmenu / copy --
    (function hookEventListeners() {
        const rawAdd = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function (type, listener, options) {
            // 解除右键：让浏览器原生右键菜单出现
            if (type === 'contextmenu' && config.bypassContextMenu) {
                return rawAdd.call(this, type, function (event) {
                    event.stopImmediatePropagation();
                    return true;
                }, options);
            }
            // 解除 copy 事件级保护——但仅在"不保留表格格式"模式下启用
            // 因为飞书的格式化复制依赖自己的 copy handler 写入 HTML，拦了就没了
            if (type === 'copy' && config.bypassCopy && !config.keepTableFormat) {
                return rawAdd.call(this, type, function (event) {
                    event.stopImmediatePropagation();
                    return null;
                }, options);
            }
            return rawAdd.call(this, type, listener, options);
        };
    })();

    // -- 3.2 hook XMLHttpRequest：改写权限响应 --
    (function hookXHR() {
        const rawOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (method, url, ...rest) {
            const requestUrl = String(url || '');
            this.addEventListener('readystatechange', function () {
                if (this.readyState !== 4) return;
                if (!requestUrl.includes('space/api/suite/permission/document/actions/state/')) return;

                try {
                    let rawResponse;
                    try { rawResponse = this.responseText; }
                    catch { rawResponse = this.response; }

                    const response = typeof rawResponse === 'string' ? JSON.parse(rawResponse) : rawResponse;
                    if (!response?.data?.actions) return;

                    let modified = false;
                    const actions = response.data.actions;

                    if (config.bypassCopy && actions.copy !== 1) { actions.copy = 1; modified = true; }

                    // 强制导出：把所有值为 0 的权限位改为 1（download/export/print/...）
                    if (config.forceExport) {
                        for (const k of Object.keys(actions)) {
                            if (actions[k] === 0) { actions[k] = 1; modified = true; }
                        }
                    }

                    if (modified) {
                        const responseText = JSON.stringify(response);
                        Object.defineProperty(this, 'responseText', { value: responseText, configurable: true });
                        Object.defineProperty(this, 'response', {
                            value: this.responseType === 'json' ? response : responseText,
                            configurable: true,
                        });
                        log('已改写权限响应：', actions);
                    }
                } catch (e) { log('XHR 响应改写失败', e); }
            }, false);
            return rawOpen.call(this, method, url, ...rest);
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

    function showToast(text) {
        const t = $el('div', { class: 'ftk-toast' }, text);
        document.body.appendChild(t);
        requestAnimationFrame(() => t.classList.add('show'));
        setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 1500);
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

    // ============================================================
    // 5. 设置面板 UI
    // ============================================================
    const PANEL_CSS = `
        #ftk-fab {
            position: fixed; right: 20px; bottom: 20px; z-index: 2147483646;
            width: 44px; height: 44px; border-radius: 50%;
            background: linear-gradient(135deg, #3370ff, #4a8cff);
            color: #fff; display: flex; align-items: center; justify-content: center;
            cursor: pointer; box-shadow: 0 4px 16px rgba(51,112,255,.35);
            font-size: 20px; user-select: none;
            transition: transform .2s ease, box-shadow .2s ease;
        }
        #ftk-fab:hover { transform: scale(1.08); box-shadow: 0 6px 20px rgba(51,112,255,.5); }
        #ftk-fab.active { transform: rotate(60deg); }

        #ftk-panel {
            position: fixed; right: 20px; bottom: 76px; z-index: 2147483647;
            width: 340px; max-height: 80vh; overflow-y: auto;
            background: #fff; color: #1f2329;
            border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,.18);
            padding: 16px 18px;
            font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif;
            display: none; opacity: 0; transform: translateY(8px);
            transition: opacity .18s ease, transform .18s ease;
        }
        #ftk-panel.show { display: block; }
        #ftk-panel.show.in { opacity: 1; transform: translateY(0); }

        #ftk-panel .ftk-head {
            display: flex; align-items: baseline; justify-content: space-between;
            margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #f0f1f3;
        }
        #ftk-panel .ftk-head h3 { margin: 0; font-size: 15px; font-weight: 600; }
        #ftk-panel .ftk-head .ver { font-size: 11px; color: #8f959e; }

        #ftk-panel .ftk-group { margin: 12px 0 4px; }
        #ftk-panel .ftk-group-title {
            font-size: 11px; color: #8f959e; font-weight: 600;
            text-transform: uppercase; letter-spacing: .5px; margin: 8px 0 4px;
        }

        #ftk-panel .ftk-row {
            display: flex; align-items: center; justify-content: space-between;
            padding: 8px 0; gap: 10px;
        }
        #ftk-panel .ftk-label { flex: 1; min-width: 0; }
        #ftk-panel .ftk-label .name {
            font-weight: 500; font-size: 13.5px;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        #ftk-panel .ftk-label .desc {
            color: #8f959e; font-size: 12px; margin-top: 2px;
            line-height: 1.4;
        }
        #ftk-panel .ftk-tag {
            display: inline-block; font-size: 10px; padding: 1px 5px; border-radius: 3px;
            margin-left: 6px; vertical-align: 2px; font-weight: normal;
        }
        #ftk-panel .ftk-tag.hot    { background: #e8f3ff; color: #3370ff; }
        #ftk-panel .ftk-tag.reload { background: #fff3e0; color: #ff7a00; }

        .ftk-switch { position: relative; width: 36px; height: 20px; flex-shrink: 0; }
        .ftk-switch input { opacity: 0; width: 0; height: 0; position: absolute; }
        .ftk-slider {
            position: absolute; cursor: pointer; inset: 0;
            background: #d1d5db; border-radius: 20px; transition: .2s;
        }
        .ftk-slider:before {
            content: ""; position: absolute; height: 16px; width: 16px;
            left: 2px; bottom: 2px; background: #fff; border-radius: 50%; transition: .2s;
            box-shadow: 0 1px 2px rgba(0,0,0,.2);
        }
        .ftk-switch input:checked + .ftk-slider { background: #3370ff; }
        .ftk-switch input:checked + .ftk-slider:before { transform: translateX(16px); }

        #ftk-panel .ftk-footer {
            margin-top: 14px; padding-top: 12px; border-top: 1px solid #f0f1f3;
            display: flex; gap: 8px;
        }
        #ftk-panel .ftk-btn {
            flex: 1; padding: 7px 12px; border: 1px solid #e5e6eb;
            border-radius: 6px; background: #fff; cursor: pointer; font-size: 13px;
            transition: all .15s ease;
        }
        #ftk-panel .ftk-btn:hover { background: #f5f6f8; }
        #ftk-panel .ftk-btn.primary {
            background: #3370ff; color: #fff; border-color: #3370ff;
        }
        #ftk-panel .ftk-btn.primary:hover { background: #2860e0; }

        .ftk-toast {
            position: fixed; left: 50%; top: 60px; transform: translate(-50%, -8px);
            z-index: 2147483647; background: rgba(0,0,0,.78); color: #fff;
            padding: 8px 16px; border-radius: 6px; font-size: 13px;
            opacity: 0; transition: opacity .2s ease, transform .2s ease;
            pointer-events: none;
        }
        .ftk-toast.show { opacity: 1; transform: translate(-50%, 0); }
    `;

    function buildPanel() {
        if (document.getElementById('ftk-fab')) return;
        GM.style(PANEL_CSS);

        const fab = $el('div', { id: 'ftk-fab', title: `${SCRIPT_NAME} 设置` }, '⚙');
        document.body.appendChild(fab);

        const panel = $el('div', { id: 'ftk-panel' });
        const head = $el('div', { class: 'ftk-head' }, [
            $el('h3', {}, `${SCRIPT_NAME} · 设置`),
            $el('span', { class: 'ver' }, `v${SCRIPT_VERSION}`),
        ]);
        panel.appendChild(head);

        // 按 group 分组渲染
        const groups = {};
        FEATURES.forEach(f => { (groups[f.group] = groups[f.group] || []).push(f); });
        for (const [groupName, items] of Object.entries(groups)) {
            const groupEl = $el('div', { class: 'ftk-group' });
            groupEl.appendChild($el('div', { class: 'ftk-group-title' }, groupName));
            items.forEach(meta => {
                const tagClass = meta.hot ? 'hot' : 'reload';
                const tagText  = meta.hot ? '即时' : '需刷新';
                const row = $el('div', { class: 'ftk-row' });
                row.innerHTML = `
                    <div class="ftk-label">
                        <div class="name">${meta.label}<span class="ftk-tag ${tagClass}">${tagText}</span></div>
                        <div class="desc">${meta.desc}</div>
                    </div>
                    <label class="ftk-switch">
                        <input type="checkbox" data-key="${meta.key}" ${config[meta.key] ? 'checked' : ''}>
                        <span class="ftk-slider"></span>
                    </label>
                `;
                groupEl.appendChild(row);
            });
            panel.appendChild(groupEl);
        }

        const footer = $el('div', { class: 'ftk-footer' });
        footer.innerHTML = `
            <button class="ftk-btn" data-act="reset">恢复默认</button>
            <button class="ftk-btn primary" data-act="reload">立即刷新</button>
        `;
        panel.appendChild(footer);
        document.body.appendChild(panel);

        // 切换显隐
        const togglePanel = () => {
            const showing = panel.classList.toggle('show');
            fab.classList.toggle('active', showing);
            if (showing) requestAnimationFrame(() => panel.classList.add('in'));
            else panel.classList.remove('in');
        };
        fab.addEventListener('click', togglePanel);
        document.addEventListener('click', e => {
            if (!panel.contains(e.target) && !fab.contains(e.target) && panel.classList.contains('show')) {
                panel.classList.remove('show', 'in');
                fab.classList.remove('active');
            }
        });

        // 开关变更
        panel.addEventListener('change', e => {
            const key = e.target.dataset.key;
            if (!key) return;
            config[key] = e.target.checked;
            saveConfig(config);
            log(`配置变更：${key} = ${config[key]}`);
            // 即时生效模块重新 apply
            applyAllHotModules();
        });

        // 按钮
        panel.addEventListener('click', e => {
            const act = e.target.dataset.act;
            if (act === 'reload') location.reload();
            if (act === 'reset') {
                FEATURES.forEach(f => { config[f.key] = f.default; });
                saveConfig(config);
                panel.querySelectorAll('input[data-key]').forEach(input => {
                    input.checked = config[input.dataset.key];
                });
                applyAllHotModules();
                showToast('已恢复默认配置');
            }
        });
    }

    function applyAllHotModules() {
        applyWatermark();
        applyUserSelect();
        applyDrag();
        applyImageDownload();
        applyLinksNewTab();
        applyCopyAsMarkdown();
    }

    // ============================================================
    // 6. 启动
    // ============================================================
    function boot() {
        if (!document.body) return setTimeout(boot, 50);
        buildPanel();
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
        GM_registerMenuCommand('打开设置面板', () => {
            const fab = document.getElementById('ftk-fab');
            if (fab) fab.click();
        });
        GM_registerMenuCommand('恢复默认配置', () => {
            FEATURES.forEach(f => { config[f.key] = f.default; });
            saveConfig(config);
            location.reload();
        });
    }
})();
