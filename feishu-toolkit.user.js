// ==UserScript==
// @name         飞书工具箱 (Feishu Toolkit)
// @name:zh-CN   飞书工具箱
// @name:en      Feishu Toolkit
// @namespace    https://github.com/BlueSkyXN/feishu-toolkit
// @version      0.1.2
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
    const SCRIPT_VERSION = '0.1.2';
    const CONFIG_KEY = 'feishu_toolkit_v1';
    const LEGACY_CONFIG_KEYS = ['feishu_enhancer_pro_v2'];

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
            key: 'bypassContextMenu', label: '解除右键限制', group: '核心保护', hot: false, default: true,
            summary: '恢复浏览器原生右键菜单。',
            impact: '会阻止飞书注册部分 contextmenu 拦截器，便于复制、另存图片或检查元素。',
            requirement: '需要刷新后在页面早期 hook addEventListener；已注册的监听不会自动移除。',
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
            key: 'keepTableFormat', label: '保留表格格式', group: '核心保护', hot: false, default: true,
            summary: '复制到 Excel / Word 时尽量保留格式。',
            impact: '不主动抢占 copy 事件，让飞书自己写入 HTML 剪贴板；关闭后可能更强力但格式更容易丢。',
            requirement: '需要刷新后影响后续 copy 监听注册；建议和“解除复制限制”一起开启。',
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
    let openSettingsPanel = null;
    let closeSettingsPanel = null;
    const PANEL_GROUP_LABELS = {
        '核心保护': '核心',
        '体验增强': '体验',
        '辅助': '高级',
    };

    const PANEL_CSS = `
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

        const fab = $el('button', {
            id: 'ftk-fab',
            type: 'button',
            title: `${SCRIPT_NAME} 设置`,
            'aria-label': `${SCRIPT_NAME} 设置`,
        }, [
            $el('span', { class: 'ftk-grip' }),
            $el('span', { class: 'ftk-fab-label' }, '设置'),
        ]);
        document.body.appendChild(fab);

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

        // 切换显隐
        const showPanel = () => {
            panel.classList.add('show');
            panel.setAttribute('aria-hidden', 'false');
            fab.classList.add('active');
        };
        const hidePanel = () => {
            panel.classList.remove('show');
            panel.setAttribute('aria-hidden', 'true');
            fab.classList.remove('active');
        };
        const togglePanel = () => {
            if (panel.classList.contains('show')) hidePanel();
            else showPanel();
        };
        openSettingsPanel = showPanel;
        closeSettingsPanel = hidePanel;

        fab.addEventListener('click', e => {
            e.stopPropagation();
            togglePanel();
        });
        document.addEventListener('click', e => {
            if (!panel.contains(e.target) && !fab.contains(e.target) && panel.classList.contains('show')) {
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

            const act = e.target.dataset.act;
            if (act === 'close') closeSettingsPanel?.();
            if (act === 'reload') location.reload();
            if (act === 'reset') {
                FEATURES.forEach(f => { config[f.key] = f.default; });
                saveConfig(config);
                panel.querySelectorAll('input[data-key]').forEach(input => {
                    input.checked = config[input.dataset.key];
                });
                panel.querySelector('#ftk-reload-notice')?.classList.remove('show');
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
            if (openSettingsPanel) openSettingsPanel();
            else {
                boot();
                setTimeout(() => openSettingsPanel?.(), 80);
            }
        });
        GM_registerMenuCommand('恢复默认配置', () => {
            FEATURES.forEach(f => { config[f.key] = f.default; });
            saveConfig(config);
            location.reload();
        });
    }
})();
