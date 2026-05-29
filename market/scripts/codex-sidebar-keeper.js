// ==UserScript==
// @name         Codex Sidebar Keeper
// @name:zh-CN   Codex 右侧栏保持
// @description  自动保持 Codex 右侧工作面板打开，并可优先进入侧边聊天、浏览器或终端。
// @version      1.0.0
// @match        *://*/*
// @run-at       document-idle
// ==/UserScript==

(() => {
  const SCRIPT_VERSION = "1.0.0";
  const API_KEY = "__codexSidebarKeeper";
  const ROOT_ID = "codex-sidebar-keeper";
  const STYLE_ID = "codex-sidebar-keeper-style";
  const AUTO_KEY = "codexRightPanelKeeper.autoKeep";
  const POSITION_KEY = "codexRightPanelKeeper.position";
  const PANEL_POSITION_KEY = "codexRightPanelKeeper.panelPosition";
  const PANEL_PINNED_KEY = "codexRightPanelKeeper.panelPinned";
  const THEME_KEY = "codexRightPanelKeeper.theme";
  const TARGET_KEY = "codexRightPanelKeeper.targetTool";
  const CLOSE_BROWSER_COMPANIONS_KEY = "codexRightPanelKeeper.closeBrowserCompanions";
  const BROWSER_URL_MODE_KEY = "codexRightPanelKeeper.browserUrlMode";
  const BROWSER_URL_KEY = "codexRightPanelKeeper.browserUrl";
  const BROWSER_URL_BY_THREAD_KEY = "codexRightPanelKeeper.browserUrlByThread";
  const MIN_CLICK_INTERVAL_MS = 850;
  const CHECK_INTERVAL_MS = 1800;
  const BUTTON_CACHE_TTL_MS = 160;
  const MUTATION_DEBOUNCE_MS = 360;
  const CURRENT_CHAT_RETRY_DELAYS_MS = [0, 260, 720, 1400, 2600, 4200, 6400];
  const SHELL_BOOT_TIMEOUT_MS = 15000;
  const PANEL_COMMAND_TIMEOUT_MS = 2800;
  const PANEL_FAILURE_PAUSE_MS = 6200;
  const STARTUP_HOLD_MS = 3000;
  const TOOL_OPEN_GRACE_MS = 5200;
  const DOCK_TOP_PX = 0;
  const DOCK_RIGHT_PX = 286;
  const DEFAULT_POSITION = { top: DOCK_TOP_PX, right: DOCK_RIGHT_PX };
  const TOOL_OPTIONS = {
    none: { label: "只保持打开", pattern: null, tabPattern: null },
    sidechat: {
      label: "侧边聊天",
      pattern: /侧边聊天\s*(?:发起侧边对话|尽管问)|side\s*chat/i,
      tabPattern: /侧边聊天(?:\s*\d+)?|side\s*chat/i,
    },
    browser: {
      label: "浏览器",
      pattern: /浏览器\s*打开网站|browser/i,
      tabPattern: /浏览器|browser/i,
    },
    terminal: {
      label: "终端",
      pattern: /终端\s*启动交互式\s*shell|terminal|shell/i,
      tabPattern: /终端|terminal|shell|powershell|cmd(?:\.exe)?/i,
    },
  };
  const BROWSER_URL_PRESETS = [
    { label: "LongCat Studio", value: "localhost:5180" },
    { label: "localhost:18787", value: "localhost:18787" },
    { label: "localhost:8000", value: "localhost:8000" },
    { label: "小苹果邮箱验证码工具", value: "localhost:3000" },
    { label: "localhost:33210", value: "localhost:33210" },
  ];
  const CODEX_PLUS_SCRIPT_KEY = "user:codex-sidebar-keeper.js";
  const CODEX_PLUS_SCRIPT_NAME = "codex-sidebar-keeper.js";
  const PANEL_NO_DRAG_SELECTOR = "button, input, textarea, select, a, [role='button'], [role='radio'], [role='option'], [data-csk-action], [data-csk-target-option]";

  try {
    const previousApi = window[API_KEY];
    if (previousApi && typeof previousApi.destroy === "function") {
      previousApi.destroy();
    }
  } catch (error) {
    console.warn("[Codex Sidebar Keeper] previous instance cleanup failed", error);
  }

  const state = {
    autoKeep: readBool(AUTO_KEY, true),
    root: null,
    host: null,
    launcher: null,
    panel: null,
    panelPosition: readPanelPosition(),
    panelPinned: readBool(PANEL_PINNED_KEY, false),
    theme: readChoice(THEME_KEY, "dark", ["dark", "light"]),
    panelDragging: false,
    pinButton: null,
    helpButton: null,
    themeButton: null,
    helpPanel: null,
    helpOpen: false,
    autoButton: null,
    closeCompanionsButton: null,
    browserUrlSelect: null,
    browserUrlInput: null,
    browserUrlGroup: null,
    panelOpen: false,
    documentPointerHandler: null,
    status: null,
    targetTool: readChoice(TARGET_KEY, "none", Object.keys(TOOL_OPTIONS)),
    closeBrowserCompanions: readBool(CLOSE_BROWSER_COMPANIONS_KEY, true),
    browserUrlMode: readChoice(BROWSER_URL_MODE_KEY, "current", ["current", "preset", "custom"]),
    browserUrl: readText(BROWSER_URL_KEY, ""),
    currentThreadKey: "",
    position: readPosition(),
    resizeHandler: null,
    threadClickHandler: null,
    routePointerHandler: null,
    routeKeyHandler: null,
    interval: 0,
    observer: null,
    pendingCheck: 0,
    closePanelToken: 0,
    buttonCache: new Map(),
    lastClickAt: 0,
    lastToolClickAt: 0,
    lastAddTabClickAt: 0,
    lastCurrentChatClickAt: 0,
    lastCurrentChatRequestAt: 0,
    lastCurrentChatRequestKey: "",
    lastBrowserUrlRequestAt: 0,
    lastBrowserUrlValue: "",
    lastBrowserCompanionCloseAt: 0,
    toolMissTarget: "",
    toolMissCount: 0,
    toolPausedTarget: "",
    lastToolMissAt: 0,
    panelCommand: "",
    panelCommandUntil: 0,
    panelFailureUntil: 0,
    toolOpeningTarget: "",
    toolOpeningUntil: 0,
    currentChatRetryToken: 0,
    currentChatRetryActive: false,
    currentChatRetryStartedAt: 0,
    currentChatRetryAttempts: 0,
    userRouteNavigationUntil: 0,
    newConversationUntil: 0,
    startupHoldUntil: 0,
    lastReason: "started",
    lastActionAt: 0,
  };

  if (
    state.browserUrlMode === "custom" &&
    BROWSER_URL_PRESETS.some((item) => item.value === state.browserUrl)
  ) {
    state.browserUrlMode = "preset";
    writeChoice(BROWSER_URL_MODE_KEY, state.browserUrlMode);
  }

  function readBool(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      if (value === "true") return true;
      if (value === "false") return false;
    } catch {}
    return fallback;
  }

  function writeBool(key, value) {
    try {
      localStorage.setItem(key, value ? "true" : "false");
    } catch {}
  }

  function readText(key, fallback = "") {
    try {
      const value = localStorage.getItem(key);
      if (typeof value === "string") return value;
    } catch {}
    return fallback;
  }

  function writeText(key, value) {
    try {
      if (value) {
        localStorage.setItem(key, value);
      } else {
        localStorage.removeItem(key);
      }
    } catch {}
  }

  function readChoice(key, fallback, allowed) {
    try {
      const value = localStorage.getItem(key);
      if (allowed.includes(value)) return value;
    } catch {}
    return fallback;
  }

  function writeChoice(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {}
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const value = JSON.parse(raw);
      return value && typeof value === "object" ? value : fallback;
    } catch {}
    return fallback;
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }

  function threadKeyFromElement(element) {
    if (!element) return "";
    const raw = element.getAttribute?.("data-app-action-sidebar-thread-id") ||
      element.dataset?.appActionSidebarThreadId ||
      "";
    return String(raw).trim();
  }

  function threadKeyFromUrl() {
    const urlMatch = location.href.match(/(?:thread|conversation|chat)[=/]([^/?#&]+)/i);
    return urlMatch?.[1] ? decodeURIComponent(urlMatch[1]) : "";
  }

  function getCurrentThreadKey() {
    const selectedSelectors = [
      '[data-app-action-sidebar-thread-id][aria-current="page"]',
      '[data-app-action-sidebar-thread-id][aria-current="true"]',
      '[data-app-action-sidebar-thread-id][aria-selected="true"]',
      '[data-app-action-sidebar-thread-id][data-selected="true"]',
      '[data-app-action-sidebar-thread-id][data-active="true"]',
    ];
    for (const selector of selectedSelectors) {
      const key = threadKeyFromElement(document.querySelector(selector));
      if (key) return key;
    }
    const urlKey = threadKeyFromUrl();
    if (urlKey) return urlKey;
    if (state.currentThreadKey) return state.currentThreadKey;
    return "default";
  }

  function getSelectedThreadKey() {
    const selectedSelectors = [
      '[data-app-action-sidebar-thread-id][aria-current="page"]',
      '[data-app-action-sidebar-thread-id][aria-current="true"]',
      '[data-app-action-sidebar-thread-id][aria-selected="true"]',
      '[data-app-action-sidebar-thread-id][data-selected="true"]',
      '[data-app-action-sidebar-thread-id][data-active="true"]',
    ];
    for (const selector of selectedSelectors) {
      const key = threadKeyFromElement(document.querySelector(selector));
      if (key) return key;
    }
    return "";
  }

  function findThreadRowByKey(threadKey) {
    if (!threadKey || threadKey === "default") return null;
    return Array.from(document.querySelectorAll("[data-app-action-sidebar-thread-id]"))
      .find((element) => threadKeyFromElement(element) === threadKey) || null;
  }

  function captureRouteSnapshot() {
    const threadKey = getSelectedThreadKey() || state.currentThreadKey || getCurrentThreadKey();
    return {
      threadKey,
      href: location.href,
    };
  }

  function restoreRouteSnapshot(snapshot, reason = "restore-route") {
    if (!snapshot?.threadKey || snapshot.threadKey === "default") return false;
    if (Date.now() < state.userRouteNavigationUntil) return false;

    const selectedKey = getSelectedThreadKey();
    if (selectedKey === snapshot.threadKey && location.href === snapshot.href) return false;

    const row = findThreadRowByKey(snapshot.threadKey);
    if (!row) return false;

    state.currentThreadKey = snapshot.threadKey;
    state.lastReason = reason;
    activateElement(row);
    return true;
  }

  function watchRouteSnapshot(snapshot, reason = "route-watch") {
    if (!snapshot?.threadKey || snapshot.threadKey === "default") return;
    [80, 220, 520, 1000].forEach((delay) => {
      window.setTimeout(() => restoreRouteSnapshot(snapshot, `${reason}-${delay}`), delay);
    });
  }

  function markUserRouteNavigation(reason = "user-route-navigation") {
    state.userRouteNavigationUntil = Date.now() + 3000;
    state.lastReason = reason;
  }

  function markNewConversationNavigation(reason = "user-new-conversation") {
    markUserRouteNavigation(reason);
    state.currentThreadKey = "";
    state.lastCurrentChatRequestKey = "";
    state.currentChatRetryActive = false;
    state.currentChatRetryToken += 1;
    state.newConversationUntil = Date.now() + 15000;
  }

  function isNewConversationContext() {
    return Date.now() < state.newConversationUntil && !threadKeyFromUrl();
  }

  function isNewConversationControl(element) {
    const action = element?.closest?.('button,[role="button"],a,[aria-label],[title]');
    if (!action || state.root?.contains(action)) return false;
    const label = buttonLabel(action);
    const attrs = [
      action.getAttribute?.("aria-label"),
      action.getAttribute?.("title"),
      action.getAttribute?.("data-testid"),
      action.getAttribute?.("href"),
      action.className,
    ].filter(Boolean).join(" ");
    return /(?:新建|新的|新增|开始|创建)\s*(?:对话|聊天|会话)|(?:new|start|create)\s*(?:chat|conversation|thread)/i.test(`${label} ${attrs}`);
  }

  function markUserRouteNavigationFromEvent(event, reasonPrefix = "user-route") {
    if (!event?.isTrusted) return false;
    const threadRow = event.target?.closest?.("[data-app-action-sidebar-thread-id]");
    if (threadRow) {
      markUserRouteNavigation(`${reasonPrefix}-thread`);
      return true;
    }
    if (isNewConversationControl(event.target)) {
      markNewConversationNavigation(`${reasonPrefix}-new-conversation`);
      return true;
    }
    return false;
  }

  function readBrowserSettingsForThread(threadKey = getCurrentThreadKey(), options = {}) {
    const map = readJson(BROWSER_URL_BY_THREAD_KEY, {});
    const item = map[threadKey];
    if (item && typeof item === "object") {
      return {
        mode: ["current", "preset", "custom"].includes(item.mode) ? item.mode : "current",
        url: typeof item.url === "string" ? item.url : "",
      };
    }

    if (options.allowGlobalMigration) {
      const legacyMode = readChoice(BROWSER_URL_MODE_KEY, "current", ["current", "preset", "custom"]);
      const legacyUrl = readText(BROWSER_URL_KEY, "");
      if (legacyMode !== "current" || legacyUrl) {
        return { mode: legacyMode, url: legacyUrl };
      }
    }
    return { mode: "current", url: "" };
  }

  function writeBrowserSettingsForThread() {
    const threadKey = getCurrentThreadKey();
    state.currentThreadKey = threadKey;
    const map = readJson(BROWSER_URL_BY_THREAD_KEY, {});
    map[threadKey] = {
      mode: state.browserUrlMode,
      url: state.browserUrl,
      updatedAt: Date.now(),
    };
    writeJson(BROWSER_URL_BY_THREAD_KEY, map);
    writeChoice(BROWSER_URL_MODE_KEY, state.browserUrlMode);
    writeText(BROWSER_URL_KEY, state.browserUrl);
  }

  function refreshBrowserSettingsForThread(options = {}) {
    const threadKey = getCurrentThreadKey();
    state.currentThreadKey = threadKey;
    const settings = readBrowserSettingsForThread(threadKey, options);
    state.browserUrlMode = settings.mode;
    state.browserUrl = settings.url;
    if (state.browserUrlInput) state.browserUrlInput.value = state.browserUrl;
    if (options.allowGlobalMigration) writeBrowserSettingsForThread();
    state.lastBrowserUrlRequestAt = 0;
    state.lastBrowserUrlValue = "";
    state.lastCurrentChatRequestAt = 0;
    state.lastCurrentChatRequestKey = "";
    syncTargetControl();
  }

  function hasCodexShellMarker() {
    return Boolean(document.querySelector(
      '[data-app-action-sidebar-thread-id], [data-app-shell-tab-strip-controller="right"], [data-app-shell-tab-controller="right"]'
    ));
  }

  function isCodexShellDocument() {
    return hasCodexShellMarker();
  }

  function readPosition() {
    return { ...DEFAULT_POSITION };
  }

  function clampPosition() {
    return { ...DEFAULT_POSITION };
  }

  function writePosition() {
    try {
      localStorage.removeItem(POSITION_KEY);
    } catch {}
  }

  function removeDuplicateRoots() {
    if (!state.root) return;
    document.querySelectorAll(`#${ROOT_ID}`).forEach((element) => {
      if (element !== state.root) element.remove();
    });
  }

  function readPanelPosition() {
    try {
      const value = JSON.parse(localStorage.getItem(PANEL_POSITION_KEY) || "null");
      if (
        value &&
        Number.isFinite(value.left) &&
        Number.isFinite(value.top)
      ) {
        return { left: value.left, top: value.top };
      }
    } catch {}
    return null;
  }

  function writePanelPosition() {
    try {
      if (state.panelPosition) {
        localStorage.setItem(PANEL_POSITION_KEY, JSON.stringify(state.panelPosition));
      } else {
        localStorage.removeItem(PANEL_POSITION_KEY);
      }
    } catch {}
  }

  function clampPanelPosition(position) {
    const panel = state.panel;
    const width = panel?.offsetWidth || 390;
    const height = panel?.offsetHeight || 320;
    const maxLeft = Math.max(8, window.innerWidth - width - 8);
    const maxTop = Math.max(8, window.innerHeight - Math.min(height, window.innerHeight - 16) - 8);
    return {
      left: Math.min(Math.max(8, position.left), maxLeft),
      top: Math.min(Math.max(8, position.top), maxTop),
    };
  }

  function applyPanelPosition() {
    if (!state.panel) return;
    if (!state.panelPosition) {
      state.panel.dataset.dragged = "false";
      state.panel.style.left = "";
      state.panel.style.top = "";
      state.panel.style.right = "";
      return;
    }

    state.panelPosition = clampPanelPosition(state.panelPosition);
    state.panel.dataset.dragged = "true";
    state.panel.style.left = `${Math.round(state.panelPosition.left)}px`;
    state.panel.style.top = `${Math.round(state.panelPosition.top)}px`;
    state.panel.style.right = "auto";
  }

  function resetPanelPosition() {
    state.panelPosition = null;
    writePanelPosition();
    applyPanelPosition();
  }

  function applyPosition() {
    if (!state.root) return;
    state.position = { ...DEFAULT_POSITION };
    const codexPlusMenu = findCodexPlusMenu();
    if (codexPlusMenu) {
      const rect = codexPlusMenu.getBoundingClientRect();
      if (state.root.parentElement !== document.body) {
        document.body.appendChild(state.root);
      }
      state.host = codexPlusMenu;
      state.root.dataset.docked = "codex-plus";
      state.root.style.right = "auto";
      state.root.style.top = `${Math.max(0, Math.round(rect.top))}px`;
      state.root.style.transform = "none";
      const rootWidth = state.root.offsetWidth || 132;
      state.root.style.left = `${Math.max(8, Math.round(rect.left - rootWidth - 6))}px`;
      return;
    }

    state.host = null;
    if (state.root.parentElement !== document.body) {
      document.body.appendChild(state.root);
    }
    state.root.dataset.docked = "fallback";
    state.root.style.left = "auto";
    state.root.style.right = `${DOCK_RIGHT_PX}px`;
    state.root.style.top = `${DOCK_TOP_PX}px`;
    state.root.style.transform = "none";
  }

  function setPosition() {
    applyPosition();
    writePosition();
    return { ...state.position };
  }

  function resetPosition() {
    return setPosition();
  }

  function isVisible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return (
      rect.width > 1 &&
      rect.height > 1 &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity || 1) > 0.01
    );
  }

  function querySelectorAllDeep(selector, root = document) {
    const results = [];
    const seen = new Set();
    const visit = (scope) => {
      if (!scope?.querySelectorAll) return;
      let matches = [];
      let descendants = [];
      try {
        matches = Array.from(scope.querySelectorAll(selector));
        descendants = Array.from(scope.querySelectorAll("*"));
      } catch {
        return;
      }
      matches.forEach((element) => {
        if (!seen.has(element)) {
          seen.add(element);
          results.push(element);
        }
      });
      descendants.forEach((element) => {
        if (element.shadowRoot) visit(element.shadowRoot);
      });
    };
    visit(root);
    return results;
  }

  function clearButtonCache() {
    state.buttonCache.clear();
  }

  function getVisibleButtonInfo(selector = "button") {
    const now = performance.now();
    const cached = state.buttonCache.get(selector);
    if (cached && now - cached.at < BUTTON_CACHE_TTL_MS) {
      return cached.items;
    }

    const items = querySelectorAllDeep(selector)
      .filter((button) => !state.root?.contains(button) && isVisible(button))
      .map((button) => ({
        button,
        label: buttonLabel(button),
        rect: button.getBoundingClientRect(),
      }));

    state.buttonCache.set(selector, { at: now, items });
    return items;
  }

  function buttonLabel(button) {
    return [
      button.getAttribute("aria-label"),
      button.getAttribute("title"),
      button.innerText,
      button.textContent,
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function activateElement(element) {
    clearButtonCache();
    const label = buttonLabel(element);
    if (element?.classList?.contains("codex-conversation-timeline-marker") || /^跳转到[:：]/.test(label)) {
      console.warn("[Codex Sidebar Keeper] refused to click timeline navigation", label);
      return false;
    }
    element.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    element.focus?.({ preventScroll: true });
    const rect = element.getBoundingClientRect();
    const eventInit = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      button: 0,
      buttons: 1,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      composed: true,
    };

    try {
      if (typeof element.click === "function") {
        element.click();
      } else {
        element.dispatchEvent(new window.MouseEvent("click", eventInit));
      }
    } catch {
      element.dispatchEvent(new window.MouseEvent("click", eventInit));
    }
    return true;
  }

  function nearestActionElement(element) {
    return element?.closest?.('button,[role="button"],a,[tabindex],[onclick]') || element;
  }

  function findRightPanelToggle() {
    if (!isCodexShellDocument()) return null;
    const panelTogglePattern =
      /显示\s*\/?\s*隐藏\s*(?:右侧栏|侧边栏|侧边面板)|切换\s*(?:右侧栏|侧边栏|侧边面板)|(?:show|hide|toggle)\s*(?:\/\s*(?:show|hide))?\s*(?:right\s*)?(?:sidebar|panel)/i;
    return getVisibleButtonInfo('button,[role="button"]')
      .filter(({ label, rect }) => {
        if (rect.x < window.innerWidth - 96 || rect.y > 72) return false;
        return panelTogglePattern.test(label);
      })
      .sort((a, b) => b.rect.x - a.rect.x || a.rect.y - b.rect.y)[0]?.button || null;
  }

  function findCodexPlusMenu() {
    const exact = document.getElementById("codex-plus-menu");
    if (exact && isVisible(exact)) return exact;

    return querySelectorAllDeep("button,div")
      .filter((element) => {
        if (state.root?.contains(element) || !isVisible(element)) return false;
        const label = buttonLabel(element);
        const rect = element.getBoundingClientRect();
        return /code(?:x)?\+\+/i.test(label) && rect.y <= 48 && rect.width <= 220 && rect.height <= 60;
      })
      .sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x)[0] || null;
  }

  function findTopBarHost() {
    const toggle = findRightPanelToggle();
    if (!toggle) return null;

    let node = toggle.parentElement;
    for (let depth = 0; node && depth < 5; depth += 1, node = node.parentElement) {
      if (node === document.body || node === document.documentElement || state.root?.contains(node)) continue;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const isTopBar =
        rect.top <= 12 &&
        rect.height >= 32 &&
        rect.height <= 68 &&
        rect.right >= window.innerWidth - 140 &&
        /flex|grid/i.test(style.display);
      if (isTopBar) return node;
    }

    return toggle.parentElement && !state.root?.contains(toggle.parentElement)
      ? toggle.parentElement
      : null;
  }

  function findToolLaunchButton(tool) {
    const option = TOOL_OPTIONS[tool];
    if (!option?.pattern) return null;
    const minPanelX = rightPanelMinX();

    return getVisibleButtonInfo("button")
      .filter(({ button, label, rect }) => {
        if (button.classList?.contains("codex-conversation-timeline-marker")) return false;
        if (/^跳转到[:：]/.test(label) || /timeline/i.test(String(button.className || ""))) return false;
        if (rect.x < minPanelX || rect.y < 120) return false;
        if (rect.width < 120 || rect.height < 80) return false;
        return option.pattern.test(label);
      })
      .sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x)[0]?.button || null;
  }

  function findToolTabButton(tool) {
    const option = TOOL_OPTIONS[tool];
    const pattern = option?.tabPattern || option?.pattern;
    if (!pattern) return null;

    const recognized = findRightPanelToolTabs()
      .filter((item) => item.tool === tool)
      .map((item) => ({
        button: item.controller.matches?.('[role="tab"]') ? item.controller : item.controller.querySelector?.('[role="tab"]') || item.controller,
        label: item.label,
        selected: item.selected,
        isTab: true,
        rect: item.controller.getBoundingClientRect(),
      }))
      .sort((a, b) => Number(b.selected) - Number(a.selected) || a.rect.x - b.rect.x)[0];
    if (recognized) return recognized;

    return getVisibleButtonInfo('button,[role="button"]')
      .map((item) => ({
        ...item,
        selected: item.button.getAttribute("aria-selected") === "true",
        isTab: item.button.getAttribute("role") === "tab" || item.button.hasAttribute("aria-selected"),
      }))
      .filter(({ label, rect, isTab }) => {
        if (!isTab || rect.y > 120 || rect.x < window.innerWidth * 0.32) return false;
        return pattern.test(label);
      })
      .sort((a, b) =>
        Number(b.selected) - Number(a.selected) ||
        Number(b.isTab) - Number(a.isTab) ||
        a.rect.x - b.rect.x
      )[0] || null;
  }

  function findRightPanelTabControllers() {
    const roleTabControllers = [];

    document.querySelectorAll('[role="tab"]').forEach((tab) => {
      if (state.root?.contains(tab) || !isVisible(tab)) return;
      const rect = tab.getBoundingClientRect();
      if (rect.y > 96 || rect.x < window.innerWidth * 0.45) return;
      const tabList = tab.closest('[role="tablist"]');
      if (!tabList) return;
      const controller = tab.closest('[role="button"]') || tab;
      const controllerRect = controller.getBoundingClientRect();
      if (controllerRect.width < 24 || controllerRect.height < 18 || controllerRect.height > 48) return;
      if (controller && !roleTabControllers.includes(controller)) {
        roleTabControllers.push(controller);
      }
    });

    if (roleTabControllers.length) return roleTabControllers;

    return Array.from(document.querySelectorAll('[data-app-shell-tab-controller="right"][data-tab-id]'))
      .filter((controller) => !state.root?.contains(controller));
  }

  function findRightPanelTabCloseButtons() {
    const closePattern = /(?:\u5173\u95ed|\u95dc\u9589|close).*(?:\u6807\u7b7e\u9875|\u6a19\u7c64|tab)/i;
    const fromControllers = findRightPanelTabControllers()
      .map((controller) =>
        Array.from(controller.querySelectorAll('button,[role="button"],[aria-label]'))
          .find((element) => closePattern.test(buttonLabel(element)))
      )
      .filter(Boolean);

    if (fromControllers.length) return fromControllers;

    const tabStrip = document.querySelector('[data-app-shell-tab-strip-controller="right"]');
    if (!tabStrip) return [];

    return Array.from(tabStrip.querySelectorAll('button,[role="button"],[aria-label]'))
      .filter((element) => closePattern.test(buttonLabel(element)));
  }

  function dispatchMiddleClick(element) {
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const x = Math.max(1, Math.round(rect.left + Math.min(rect.width - 1, Math.max(4, rect.width / 2))));
    const y = Math.max(1, Math.round(rect.top + Math.min(rect.height - 1, Math.max(4, rect.height / 2))));
    const eventInit = {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 1,
      buttons: 4,
      clientX: x,
      clientY: y,
      screenX: window.screenX + x,
      screenY: window.screenY + y,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      composed: true,
    };

    ["pointerdown", "mousedown", "pointerup", "mouseup", "auxclick"].forEach((type) => {
      const EventCtor = type.startsWith("pointer") && window.PointerEvent
        ? window.PointerEvent
        : window.MouseEvent;
      element.dispatchEvent(new EventCtor(type, eventInit));
    });
  }

  function tabControllerTool(controller) {
    const tab = controller.matches?.('[role="tab"]') ? controller : controller.querySelector?.('[role="tab"]');
    const tabOwner = tab?.closest?.("[data-tab-id]") || controller.closest?.("[data-tab-id]") || controller;
    const tabId = String(tabOwner?.getAttribute?.("data-tab-id") || controller.getAttribute?.("data-tab-id") || "").trim();
    if (/^browser\b/i.test(tabId)) return "browser";
    if (/^terminal\b/i.test(tabId)) return "terminal";
    if (/^(?:sidechat|side-chat|chat)\b/i.test(tabId)) return "sidechat";
    const label = tab ? buttonLabel(tab) : buttonLabel(controller);
    const matched = Object.entries(TOOL_OPTIONS)
      .filter(([tool]) => tool !== "none")
      .find(([, option]) => (option.tabPattern || option.pattern)?.test(label))?.[0] || null;
    if (matched) return matched;
    const browserLike = /(?:无法访问此站点|无法访问该网站|This site can'?t be reached|https?:\/\/|localhost|127\.0\.0\.1|\[::1\]|www\.|\.com\b|\.cn\b|\.net\b|\.org\b|\.dev\b|\.io\b|\.app\b|browser|浏览器)/i.test(label);
    if (browserLike && controller.closest?.('[role="tablist"]') && controller.querySelector?.('[role="tab"]')) {
      return "browser";
    }
    if (browserLike && controller.getAttribute?.("role") === "tab" && controller.closest?.('[role="tablist"]')) {
      return "browser";
    }
    if (/^new-chat\b/i.test(label)) {
      return "sidechat";
    }
    const terminalLike = /(?:[A-Z]:\\|\\Windows\\|\\System32\\|cmd(?:\.exe)?|powershell|pwsh|terminal|shell)/i.test(label);
    if (terminalLike) {
      return "terminal";
    }
    return null;
  }

  function findRightPanelToolTabs() {
    const terminalActive = isSidebarTerminalActive();
    const tabs = findRightPanelTabControllers()
      .map((controller, index) => {
        const selected = controller.getAttribute("aria-selected") === "true" ||
          controller.querySelector?.('[role="tab"][aria-selected="true"]') !== null;
        const inferredTool = selected && terminalActive ? "terminal" : tabControllerTool(controller);
        return {
          controller,
          index,
          tool: inferredTool,
          label: buttonLabel(controller.matches?.('[role="tab"]') ? controller : controller.querySelector?.('[role="tab"]') || controller),
          selected,
        };
      })
      .filter((item) => item.tool);
    if (tabs.length === 1 && !tabs[0].selected) {
      tabs[0].selected = true;
    }
    return tabs;
  }

  function findRightPanelTabs() {
    const terminalActive = isSidebarTerminalActive();
    const tabs = findRightPanelTabControllers()
      .map((controller, index) => {
        const selected = controller.getAttribute("aria-selected") === "true" ||
          controller.querySelector?.('[role="tab"][aria-selected="true"]') !== null;
        const inferredTool = selected && terminalActive ? "terminal" : tabControllerTool(controller);
        return {
          controller,
          index,
          tool: inferredTool,
          label: buttonLabel(controller.matches?.('[role="tab"]') ? controller : controller.querySelector?.('[role="tab"]') || controller),
          selected,
        };
      });
    if (tabs.length === 1 && !tabs[0].selected) {
      tabs[0].selected = true;
    }
    return tabs;
  }

  function findTabCloseButton(controller) {
    const closePattern = /(?:\u5173\u95ed|\u95dc\u9589|close).*(?:\u6807\u7b7e\u9875|\u6a19\u7c64|tab)|^(?:\u5173\u95ed|\u95dc\u9589|close)$/i;
    const nested = Array.from(controller.querySelectorAll('button,[role="button"],[aria-label]'))
      .map((element) => nearestActionElement(element))
      .find((element) => element && closePattern.test(buttonLabel(element)));
    if (nested) return nested;

    const controllerRect = controller.getBoundingClientRect();
    const scope = controller.closest?.('[role="tablist"]') || controller.parentElement;
    if (!scope) return null;
    return Array.from(scope.querySelectorAll('button,[role="button"],[aria-label]'))
      .map((element) => nearestActionElement(element))
      .filter((element) => element && !state.root?.contains(element) && closePattern.test(buttonLabel(element)))
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => {
        const nearbyY = rect.bottom >= controllerRect.top - 8 && rect.top <= controllerRect.bottom + 8;
        const nearbyX = rect.left >= controllerRect.left - 8 && rect.left <= controllerRect.right + 36;
        return nearbyY && nearbyX;
      })
      .sort((a, b) => Math.abs(a.rect.left - controllerRect.right) - Math.abs(b.rect.left - controllerRect.right))[0]?.element || null;
  }

  function closeTabController(controller) {
    const closeButton = findTabCloseButton(controller);
    if (closeButton) {
      activateElement(closeButton);
      return true;
    }
    dispatchMiddleClick(controller);
    return true;
  }

  function closeOtherToolTabs(reason = "single-tool-cleanup", pass = 0, routeSnapshot = null) {
    if (!state.closeBrowserCompanions || state.targetTool === "none" || !isRightPanelOpen()) return false;
    if (!routeSnapshot) {
      routeSnapshot = captureRouteSnapshot();
    }
    if (pass === 0) {
      watchRouteSnapshot(routeSnapshot, `${reason}-preserve-thread`);
    }
    const now = Date.now();
    if (state.targetTool !== "browser" && state.toolOpeningTarget === state.targetTool && now < state.toolOpeningUntil) {
      return false;
    }
    if (pass === 0 && now - state.lastBrowserCompanionCloseAt < MIN_CLICK_INTERVAL_MS) return false;

    const tabs = findRightPanelTabs();
    const targetTabs = tabs.filter((item) => item.tool === state.targetTool);
    const keepTab = targetTabs.find((item) => item.selected) || targetTabs[0] || null;

    const companion = tabs
      .filter((item) => keepTab ? item !== keepTab : item.tool !== state.targetTool)
      .map((item) => ({
        ...item,
        closeButton: findTabCloseButton(item.controller),
      }))
      .filter((item) => item.closeButton)
      .sort((a, b) =>
        Number(a.tool === state.targetTool) - Number(b.tool === state.targetTool) ||
        Number(a.selected) - Number(b.selected) ||
        b.index - a.index
      )[0];

    if (!companion) {
      restoreRouteSnapshot(routeSnapshot, `${reason}-no-companion`);
      return false;
    }
    if (pass > 12) {
      setStatus("未能关闭其它标签", "warn");
      restoreRouteSnapshot(routeSnapshot, `${reason}-max-pass`);
      return false;
    }

    state.lastReason = `${reason}-${companion.tool}`;
    state.lastActionAt = now;
    state.lastBrowserCompanionCloseAt = now;
    const label = TOOL_OPTIONS[companion.tool]?.label || "其它";
    setStatus(`正在关闭${label}标签...`, "busy");
    restoreRouteSnapshot(routeSnapshot, `${reason}-before-close`);
    closeTabController(companion.controller);
    window.setTimeout(() => {
      restoreRouteSnapshot(routeSnapshot, `${reason}-after-close`);
      closeOtherToolTabs(reason, pass + 1, routeSnapshot);
    }, 220);
    return true;
  }

  const closeBrowserCompanionTabs = closeOtherToolTabs;

  function closeOpenToolTabs(reason, done, pass = 0) {
    const tab = findRightPanelTabs()
      .map((item) => ({
        ...item,
        closeButton: findTabCloseButton(item.controller),
      }))
      .sort((a, b) => Number(a.selected) - Number(b.selected) || b.index - a.index)[0] || null;
    const closeButtons = tab ? [] : findRightPanelTabCloseButtons();

    if (!tab && !closeButtons.length) {
      done();
      return true;
    }

    if (pass > 20) {
      setStatus("\u672a\u80fd\u5173\u95ed\u5168\u90e8\u6807\u7b7e", "warn");
      done();
      return false;
    }

    state.lastReason = `${reason}-close-tabs`;
    state.lastActionAt = Date.now();
    setStatus("\u6b63\u5728\u5173\u95ed\u5df2\u6253\u5f00\u6807\u7b7e", "busy");
    if (tab) {
      closeTabController(tab.controller);
    } else {
      activateElement(closeButtons[0]);
    }
    window.setTimeout(() => closeOpenToolTabs(reason, done, pass + 1), 180);
    return false;
  }

  function findAddSidePanelTabButton() {
    return getVisibleButtonInfo("button")
      .filter(({ label, rect }) => {
        if (rect.y > 120 || rect.x < window.innerWidth * 0.32) return false;
        return /打开侧边面板标签页|新建侧边面板|add.*side.*panel|open.*side.*panel.*tab/i.test(label);
      })
      .sort((a, b) => a.rect.x - b.rect.x)[0]?.button || null;
  }

  function composedParentElement(element) {
    if (!element) return null;
    if (element.parentElement) return element.parentElement;
    const root = element.getRootNode?.();
    return root?.host || null;
  }

  function findCurrentChatSiteMarker() {
    const exactPattern = /^(?:此聊天|当前聊天|目前聊天|本聊天|this\s*chat|current\s*chat)$/i;
    const loosePattern = /(?:此|当前|目前|本)\s*聊天|聊天\s*(?:中|内)?\s*打开|(?:this|current)\s*chat|open\s*(?:in|for)?\s*(?:this|current)?\s*chat|use\s*(?:in|for)?\s*(?:this|current)?\s*chat/i;
    const minPanelX = rightPanelMinX();
    const isCandidate = ({ label, rect }) => {
      if (rect.y < 70 || rect.y >= window.innerHeight || rect.x < minPanelX || rect.x > window.innerWidth) return false;
      return exactPattern.test(label.trim()) || loosePattern.test(label);
    };
    const rank = (a, b) =>
      Number(exactPattern.test(b.label.trim())) - Number(exactPattern.test(a.label.trim())) ||
      a.rect.y - b.rect.y ||
      b.rect.x - a.rect.x;

    const exactTextMatch = querySelectorAllDeep("div,span")
      .filter((element) => !state.root?.contains(element) && isVisible(element))
      .map((element) => {
        const label = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
        return { button: element, label, rect: element.getBoundingClientRect() };
      })
      .filter((item) => item.label.length <= 32 && exactPattern.test(item.label) && isCandidate(item))
      .sort(rank)[0]?.button;
    if (exactTextMatch) return exactTextMatch;

    const semanticMatch = getVisibleButtonInfo('button,[role="button"],a,[tabindex],[onclick],[aria-label],[title]')
      .filter((item) => item.rect.height < 180 && item.label.length <= 160 && isCandidate(item))
      .sort(rank)[0]?.button;
    if (semanticMatch) return nearestActionElement(semanticMatch);

    const textMatch = getVisibleButtonInfo("div,span")
      .filter((item) => item.rect.height < 180 && item.label.length <= 80 && isCandidate(item))
      .sort(rank)
      .map((item) => nearestActionElement(item.button))
      .find(Boolean);
    if (textMatch) return textMatch;

    const rowMatch = getVisibleButtonInfo("button,[role='button'],a")
      .filter(({ button, rect }) => {
        if (rect.y < 70 || rect.x < minPanelX || rect.x > window.innerWidth) return false;
        const row = button.closest?.("li,article,section,[role='listitem'],[data-testid],div");
        const rowLabel = row ? buttonLabel(row) : "";
        return loosePattern.test(rowLabel) && /聊天|chat/i.test(rowLabel);
      })
      .sort(rank)[0]?.button;
    return rowMatch ? nearestActionElement(rowMatch) : null;
  }

  function findCurrentChatSiteButton() {
    const marker = findCurrentChatSiteMarker();
    if (!marker) return null;

    const sitePattern = /(?:localhost|127\.0\.0\.1|\[::1\]|https?:\/\/|[\w-]+\.(?:com|cn|net|org|dev|io|app))(?::\d+)?/i;
    if (sitePattern.test(buttonLabel(marker))) {
      return nearestActionElement(marker);
    }

    const markerRect = marker.getBoundingClientRect();
    const alignedOpenButton = getVisibleButtonInfo('button,[role="button"],a,[tabindex],[onclick],[aria-label]')
      .filter(({ label, rect }) => {
        const verticallyAligned = rect.top < markerRect.bottom && rect.bottom > markerRect.top;
        return (
          rect.x >= rightPanelMinX() &&
          rect.width < window.innerWidth * 0.8 &&
          verticallyAligned &&
          /^(?:打开|open\b)/i.test(label) &&
          !/(?:隐藏|hide)/i.test(label)
        );
      })
      .sort((a, b) =>
        Math.abs((a.rect.top + a.rect.bottom) / 2 - (markerRect.top + markerRect.bottom) / 2) -
        Math.abs((b.rect.top + b.rect.bottom) / 2 - (markerRect.top + markerRect.bottom) / 2)
      )[0]?.button;
    if (alignedOpenButton) return nearestActionElement(alignedOpenButton);

    let candidate = marker;
    for (let depth = 0; candidate && depth < 9; depth += 1) {
      const label = buttonLabel(candidate);
      const rect = candidate.getBoundingClientRect();
      const containsMarker = rect.left <= markerRect.left && rect.right >= markerRect.right;
      const isLargerRow = rect.width >= markerRect.width + 70 || rect.height >= markerRect.height + 20;
      if (
        candidate !== marker &&
        candidate !== document.body &&
        candidate !== document.documentElement &&
        isVisible(candidate) &&
        containsMarker &&
        isLargerRow &&
        rect.width < window.innerWidth * 0.8 &&
        rect.height < 260 &&
        sitePattern.test(label)
      ) {
        const openButton = Array.from(candidate.querySelectorAll?.('button,[role="button"],a,[tabindex],[onclick]') || [])
          .find((element) => isVisible(element) && /(?:打开|open)/i.test(buttonLabel(element)) && !/(?:隐藏|hide)/i.test(buttonLabel(element)));
        if (openButton) return nearestActionElement(openButton);
        return nearestActionElement(candidate);
      }
      candidate = composedParentElement(candidate);
    }

    return nearestActionElement(marker);
  }

  function describeCurrentChatElement(element) {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return {
      tag: element.tagName?.toLowerCase() || "",
      label: buttonLabel(element),
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    };
  }

  function inspectCurrentChatSite() {
    const marker = findCurrentChatSiteMarker();
    return {
      marker: describeCurrentChatElement(marker),
      target: describeCurrentChatElement(findCurrentChatSiteButton()),
    };
  }

  function rightPanelMinX() {
    const edges = querySelectorAllDeep(
      '[data-app-shell-tab-controller="right"],[data-app-shell-tab-strip-controller="right"]'
    )
      .filter((element) => isVisible(element))
      .map((element) => element.getBoundingClientRect().left)
      .filter((left) => left >= window.innerWidth * 0.45);
    if (edges.length) return Math.min(...edges) - 2;
    return window.innerWidth * 0.52;
  }

  function findSidebarBrowserUrlInput() {
    const minX = rightPanelMinX();
    const textBoxPattern = /url|address|search|网址|地址|输入|浏览器/i;
    return querySelectorAllDeep('input,textarea,[contenteditable="true"],[role="textbox"]')
      .filter((element) => !state.root?.contains(element) && isVisible(element))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const label = [
          element.getAttribute("aria-label"),
          element.getAttribute("placeholder"),
          element.getAttribute("title"),
          element.getAttribute("name"),
          element.getAttribute("type"),
          element.value,
          element.textContent,
        ]
          .filter(Boolean)
          .join(" ");
        const likelyAddressBar = textBoxPattern.test(label) || rect.width > 260;
        return { element, rect, label, likelyAddressBar };
      })
      .filter(({ rect, likelyAddressBar }) =>
        likelyAddressBar &&
        rect.x >= minX &&
        rect.x < window.innerWidth &&
        rect.y >= 48 &&
        rect.y < Math.max(220, window.innerHeight * 0.38)
      )
      .sort((a, b) =>
        Number(b.label.toLowerCase().includes("url")) - Number(a.label.toLowerCase().includes("url")) ||
        a.rect.y - b.rect.y ||
        b.rect.width - a.rect.width
      )[0]?.element || null;
  }

  function isSidebarBrowserActive() {
    return Boolean(findSidebarBrowserUrlInput());
  }

  function isSidebarTerminalActive() {
    const minX = rightPanelMinX();
    return querySelectorAllDeep('.xterm,[class*="xterm"]')
      .some((element) => {
        const rect = element.getBoundingClientRect();
        return (
          isVisible(element) &&
          rect.x >= minX &&
          rect.y >= 48 &&
          rect.width > 120 &&
          rect.height > 80
        );
      });
  }

  function normalizeBrowserUrl(value) {
    const url = String(value || "").trim();
    if (!url) return "";
    if (/^(?:https?:\/\/|file:\/\/|about:)/i.test(url)) return url;
    if (/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:[/?#].*)?$/i.test(url)) return `http://${url}`;
    return `https://${url}`;
  }

  function setInputValue(element, value) {
    if (!element) return;
    if (element.isContentEditable || element.getAttribute("contenteditable") === "true") {
      element.textContent = value;
    } else {
      const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value");
      if (descriptor?.set) {
        descriptor.set.call(element, value);
      } else {
        element.value = value;
      }
    }
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function submitBrowserUrlInput(element) {
    const rect = element.getBoundingClientRect();
    element.focus?.({ preventScroll: true });
    const keyInit = {
      bubbles: true,
      cancelable: true,
      view: window,
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      composed: true,
    };
    element.dispatchEvent(new KeyboardEvent("keydown", keyInit));
    element.dispatchEvent(new KeyboardEvent("keypress", keyInit));
    element.dispatchEvent(new KeyboardEvent("keyup", keyInit));
    element.form?.requestSubmit?.();

    const submitButton = getVisibleButtonInfo('button,[role="button"]')
      .filter(({ label, rect: buttonRect }) => {
        const nearby = Math.abs((buttonRect.top + buttonRect.bottom) / 2 - (rect.top + rect.bottom) / 2) < 80;
        return nearby && buttonRect.x >= rect.x && /^(?:打开|前往|go|open|submit|load)$/i.test(label.trim());
      })
      .sort((a, b) => a.rect.x - b.rect.x)[0]?.button;
    if (submitButton) activateElement(submitButton);
  }

  function isRightPanelOpen() {
    if (!isCodexShellDocument()) return false;
    if (
      findRightPanelTabControllers().some((controller) => isVisible(controller)) ||
      isVisible(document.querySelector('[data-app-shell-tab-strip-controller="right"]')) ||
      isRightPanelToolChooserVisible()
    ) {
      return true;
    }
    const toggle = findRightPanelToggle();
    if (!toggle) return false;
    return toggle.getAttribute("aria-pressed") === "true";
  }

  function isRightPanelToolChooserVisible() {
    const rightMinX = Math.max(420, window.innerWidth * 0.42);
    const toolPattern = /^(?:文件|浏览器|审查|终端|file|browser|review|terminal)$/i;
    return getVisibleButtonInfo('button,[role="button"],a,[tabindex],[onclick]')
      .some(({ label, rect }) =>
        rect.x >= rightMinX &&
        rect.y >= 80 &&
        rect.y <= window.innerHeight - 40 &&
        rect.width >= 80 &&
        rect.height >= 40 &&
        toolPattern.test(label.trim())
      );
  }

  function setStatus(text, mode = "idle") {
    if (!state.status || !state.root) return;
    state.status.textContent = text;
    state.root.dataset.status = mode;
    syncToggleControls();
    syncTargetControl();
  }

  function syncToggleControls() {
    if (state.autoButton) {
      state.autoButton.setAttribute("aria-pressed", String(state.autoKeep));
      state.autoButton.dataset.pressed = String(state.autoKeep);
    }
    if (state.closeCompanionsButton) {
      state.closeCompanionsButton.setAttribute("aria-pressed", String(state.closeBrowserCompanions));
      state.closeCompanionsButton.dataset.pressed = String(state.closeBrowserCompanions);
    }
  }

  function syncTargetControl() {
    if (!state.root) return;
    if (state.browserUrlGroup) {
      const showBrowserUrl = state.targetTool === "browser";
      state.browserUrlGroup.hidden = !showBrowserUrl;
      state.browserUrlGroup.setAttribute("aria-hidden", String(!showBrowserUrl));
    }
    state.root.querySelectorAll("[data-csk-target-option]").forEach((button) => {
      const selected = button.dataset.cskTargetOption === state.targetTool;
      button.dataset.selected = String(selected);
      button.setAttribute("aria-checked", String(selected));
    });
    state.root.querySelectorAll("[data-csk-browser-source]").forEach((button) => {
      const selected = button.dataset.cskBrowserSource === state.browserUrlMode;
      button.dataset.selected = String(selected);
      button.setAttribute("aria-checked", String(selected));
    });
    if (state.browserUrlInput) {
      const custom = state.browserUrlMode === "custom";
      state.browserUrlInput.hidden = !custom;
      state.browserUrlInput.disabled = !custom;
      state.browserUrlInput.placeholder = state.browserUrlMode === "custom"
        ? "例如 https://example.com 或 localhost:3000"
        : "当前选择：此聊天网址";
    }
    if (state.browserUrlSelect) {
      const preset = BROWSER_URL_PRESETS.find((item) => item.value === state.browserUrl);
      state.browserUrlSelect.value = state.browserUrlMode === "current"
        ? "current"
        : preset?.value || "custom";
    }
  }

  function setPanelOpen(open) {
    state.panelOpen = Boolean(open);
    if (state.panel) state.panel.hidden = !state.panelOpen;
    state.launcher?.setAttribute("aria-expanded", String(state.panelOpen));
  }

  function syncPanelPinned() {
    state.panel?.setAttribute("data-pinned", String(state.panelPinned));
    if (!state.pinButton) return;
    state.pinButton.setAttribute("aria-pressed", String(state.panelPinned));
    state.pinButton.title = state.panelPinned ? "取消置顶设置面板" : "置顶设置面板";
    state.pinButton.setAttribute("aria-label", state.pinButton.title);
  }

  function setPanelPinned(value) {
    state.panelPinned = Boolean(value);
    writeBool(PANEL_PINNED_KEY, state.panelPinned);
    syncPanelPinned();
  }

  function resetToolMissState() {
    state.toolMissTarget = "";
    state.toolMissCount = 0;
    state.toolPausedTarget = "";
    state.lastToolMissAt = 0;
  }

  function markToolOpening(tool, duration = TOOL_OPEN_GRACE_MS) {
    state.toolOpeningTarget = tool === "terminal" ? tool : "";
    state.toolOpeningUntil = tool === "terminal" ? Date.now() + duration : 0;
  }

  function isToolOpening(tool) {
    return Boolean(tool === "terminal" && state.toolOpeningTarget === tool && Date.now() < state.toolOpeningUntil);
  }

  function recordToolMiss(reason = "tool-missing") {
    if (state.targetTool === "none") return false;
    const now = Date.now();
    if (now - state.lastToolMissAt < 900) return state.toolPausedTarget === state.targetTool;
    state.lastToolMissAt = now;
    if (state.toolMissTarget !== state.targetTool) {
      state.toolMissTarget = state.targetTool;
      state.toolMissCount = 0;
      state.toolPausedTarget = "";
    }
    state.toolMissCount += 1;
    const label = TOOL_OPTIONS[state.targetTool]?.label || "目标工具";
    if (state.toolMissCount >= 3) {
      state.toolPausedTarget = state.targetTool;
      setStatus(`未找到${label}，已暂停自动尝试`, "warn");
      console.warn(`[Codex Sidebar Keeper] paused ${state.targetTool} after 3 misses`, reason);
      return true;
    }
    setStatus(`等待${label}... ${state.toolMissCount}/3`, "busy");
    return false;
  }

  function isToolPaused(tool = state.targetTool) {
    if (!tool || state.toolPausedTarget !== tool) return false;
    const label = TOOL_OPTIONS[tool]?.label || "目标工具";
    setStatus(`未找到${label}，已暂停自动尝试`, "warn");
    return true;
  }

  function verifyTerminalOpened(reason) {
    window.setTimeout(() => {
      if (state.targetTool !== "terminal" || state.toolPausedTarget === "terminal") return;
      if (isSidebarTerminalActive()) {
        resetToolMissState();
        markToolOpening("");
        setStatus("保持终端", "ok");
        return;
      }
      markToolOpening("");
      recordToolMiss(`${reason}-terminal-not-active`);
    }, TOOL_OPEN_GRACE_MS + 450);
  }

  function setHelpOpen(open) {
    state.helpOpen = Boolean(open);
    if (state.panel) {
      state.panel.style.width = "";
      state.panel.style.height = "";
    }
    state.panel?.setAttribute("data-help-open", String(state.helpOpen));
    if (state.helpPanel) state.helpPanel.hidden = !state.helpOpen;
    if (state.helpButton) state.helpButton.setAttribute("aria-expanded", String(state.helpOpen));
    applyPanelPosition();
  }

  function syncTheme() {
    state.root?.setAttribute("data-theme", state.theme);
    if (!state.themeButton) return;
    const light = state.theme === "light";
    state.themeButton.textContent = light ? "☀" : "☾";
    state.themeButton.title = light ? "切换到深色模式" : "切换到浅色模式";
    state.themeButton.setAttribute("aria-label", state.themeButton.title);
    state.themeButton.setAttribute("aria-pressed", String(light));
  }

  function setTheme(value) {
    state.theme = value === "light" ? "light" : "dark";
    writeChoice(THEME_KEY, state.theme);
    syncTheme();
  }

  function toggleTheme() {
    setTheme(state.theme === "light" ? "dark" : "light");
  }

  function consumeControlEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }

  function togglePanelFromEvent(event) {
    consumeControlEvent(event);
    setPanelOpen(!state.panelOpen);
  }

  function requestCustomBrowserUrl(reason = "browser-custom-url", options = {}) {
    if (state.targetTool !== "browser") return false;
    if (isToolPaused("browser")) return true;
    const url = normalizeBrowserUrl(state.browserUrl);
    if (!url) return false;

    const now = Date.now();
    const retryWindowMs = CURRENT_CHAT_RETRY_DELAYS_MS[CURRENT_CHAT_RETRY_DELAYS_MS.length - 1] + 1200;
    if (!options.force && state.lastBrowserUrlValue === url && state.lastBrowserUrlRequestAt) {
      setStatus("已请求用户网址", "ok");
      return true;
    }
    if (state.currentChatRetryActive) {
      if (now - state.currentChatRetryStartedAt < retryWindowMs) {
        setStatus("正在打开用户网址...", "busy");
        return true;
      }
      state.currentChatRetryActive = false;
      recordToolMiss(`${reason}-retry-window-expired`);
      return true;
    }

    const token = state.currentChatRetryToken + 1;
    state.currentChatRetryToken = token;
    state.currentChatRetryActive = true;
    state.currentChatRetryStartedAt = now;
    state.currentChatRetryAttempts = 0;
    setStatus("正在打开用户网址...", "busy");

    CURRENT_CHAT_RETRY_DELAYS_MS.forEach((delay, index) => {
      window.setTimeout(() => {
        if (token !== state.currentChatRetryToken || !state.currentChatRetryActive) return;
        state.currentChatRetryAttempts = index + 1;
        if (ensureCustomBrowserUrl(url, `${reason}-try-${index + 1}`, { report: true })) return;
        if (index === CURRENT_CHAT_RETRY_DELAYS_MS.length - 1) {
          state.currentChatRetryActive = false;
          recordToolMiss(`${reason}-missing-address-bar`);
        }
      }, delay);
    });

    return true;
  }

  function ensureCustomBrowserUrl(url, reason = "browser-custom-url", options = {}) {
    const report = options.report !== false;
    if (state.targetTool !== "browser") return false;
    if (!isRightPanelOpen()) {
      if (report) setStatus("等待右侧栏打开...", "busy");
      return false;
    }

    const tab = findToolTabButton("browser");
    if (tab && !tab.selected) {
      if (Date.now() - state.lastToolClickAt >= MIN_CLICK_INTERVAL_MS) {
        state.lastToolClickAt = Date.now();
        state.lastActionAt = Date.now();
        activateElement(tab.button);
      }
      if (report) setStatus("正在切换到浏览器...", "busy");
      return false;
    }

    const input = findSidebarBrowserUrlInput();
    if (!input) {
      if (report) setStatus("等待浏览器地址栏...", "busy");
      return false;
    }

    state.lastBrowserUrlRequestAt = Date.now();
    state.lastBrowserUrlValue = url;
    state.lastActionAt = Date.now();
    state.lastReason = reason;
    state.currentChatRetryActive = false;
    state.currentChatRetryToken += 1;
    resetToolMissState();
    setStatus("正在打开用户网址...", "busy");
    setInputValue(input, url);
    submitBrowserUrlInput(input);
    window.setTimeout(() => {
      if (state.targetTool === "browser") {
        setStatus(`已打开 ${url}`, "ok");
      }
    }, 900);
    return true;
  }

  function requestCurrentChatBrowserSite(reason = "browser-current-chat", options = {}) {
    if (state.targetTool !== "browser") return false;
    if (isToolPaused("browser")) return true;
    if (state.browserUrlMode !== "current" && state.browserUrl.trim()) {
      return requestCustomBrowserUrl(reason, options);
    }
    if (isNewConversationContext()) {
      state.currentChatRetryActive = false;
      setStatus("新建对话中，仅打开浏览器", "ok");
      return false;
    }

    const now = Date.now();
    const requestKey = state.currentThreadKey || getCurrentThreadKey() || "current-chat";
    const retryWindowMs = CURRENT_CHAT_RETRY_DELAYS_MS[CURRENT_CHAT_RETRY_DELAYS_MS.length - 1] + 1200;
    if (!options.force && state.lastCurrentChatRequestKey === requestKey && state.lastCurrentChatRequestAt) {
      setStatus("已请求此聊天网址", "ok");
      return true;
    }
    if (state.currentChatRetryActive) {
      if (now - state.currentChatRetryStartedAt < retryWindowMs) {
        setStatus("正在打开此聊天网址...", "busy");
        return true;
      }
      state.currentChatRetryActive = false;
      recordToolMiss(`${reason}-retry-window-expired`);
      return true;
    }

    const token = state.currentChatRetryToken + 1;
    state.currentChatRetryToken = token;
    state.currentChatRetryActive = true;
    state.currentChatRetryStartedAt = now;
    state.currentChatRetryAttempts = 0;
    setStatus("正在打开此聊天网址...", "busy");

    CURRENT_CHAT_RETRY_DELAYS_MS.forEach((delay, index) => {
      window.setTimeout(() => {
        if (token !== state.currentChatRetryToken || !state.currentChatRetryActive) return;
        state.currentChatRetryAttempts = index + 1;
        if (ensureCurrentChatBrowserSite(`${reason}-try-${index + 1}`, { report: true })) return;
        if (index === CURRENT_CHAT_RETRY_DELAYS_MS.length - 1) {
          state.currentChatRetryActive = false;
          recordToolMiss(`${reason}-missing-current-chat-site`);
        }
      }, delay);
    });

    return true;
  }

  function ensureCurrentChatBrowserSite(reason = "browser-current-chat", options = {}) {
    const report = options.report !== false;
    if (state.targetTool !== "browser") return false;
    if (isNewConversationContext()) {
      if (report) setStatus("新建对话中，仅打开浏览器", "ok");
      return false;
    }
    if (!isRightPanelOpen()) {
      if (report) setStatus("等待右侧栏打开...", "busy");
      return false;
    }

    const tab = findToolTabButton("browser");
    if (tab && !tab.selected) {
      if (Date.now() - state.lastToolClickAt >= MIN_CLICK_INTERVAL_MS) {
        state.lastToolClickAt = Date.now();
        state.lastActionAt = Date.now();
        activateElement(tab.button);
      }
      if (report) setStatus("正在切换到浏览器...", "busy");
      return false;
    }

    const now = Date.now();
    if (now - state.lastCurrentChatClickAt < MIN_CLICK_INTERVAL_MS) {
      if (report) setStatus("正在加载此聊天网址...", "busy");
      return false;
    }

    const button = findCurrentChatSiteButton();
    if (!button) {
      if (report) setStatus("等待此聊天按钮...", "busy");
      return false;
    }

    state.lastCurrentChatClickAt = now;
    state.lastCurrentChatRequestAt = now;
    state.lastCurrentChatRequestKey = state.currentThreadKey || getCurrentThreadKey() || "current-chat";
    state.lastActionAt = now;
    state.lastReason = reason;
    state.currentChatRetryActive = false;
    state.currentChatRetryToken += 1;
    resetToolMissState();
    setStatus("正在加载此聊天网址...", "busy");
    activateElement(button);
    window.setTimeout(() => {
      if (state.targetTool === "browser") {
        setStatus("已打开此聊天网址", "ok");
      }
    }, 900);
    return true;
  }

  function ensurePreferredTool(reason = "tool-check") {
    if (state.targetTool === "none" || !isRightPanelOpen()) return false;
    if (isToolPaused(state.targetTool)) return true;

    const now = Date.now();

    const tab = findToolTabButton(state.targetTool);
    const browserActive = state.targetTool === "browser" && isSidebarBrowserActive();
    const terminalActive = state.targetTool === "terminal" && isSidebarTerminalActive();
    if (tab?.selected || browserActive || terminalActive) {
      markToolOpening("");
      closeOtherToolTabs(`${reason}-single-active-cleanup`);
      if (
        state.targetTool === "browser" &&
        tab?.selected &&
        requestCurrentChatBrowserSite(`${reason}-current-chat`)
      ) {
        return true;
      }
      resetToolMissState();
      setStatus(`保持${TOOL_OPTIONS[state.targetTool].label}`, "ok");
      return true;
    }
    if (tab?.button && now - state.lastToolClickAt < MIN_CLICK_INTERVAL_MS) {
      setStatus(`正在切换到${TOOL_OPTIONS[state.targetTool].label}...`, "busy");
      return true;
    }
    if (tab?.button && now - state.lastToolClickAt >= MIN_CLICK_INTERVAL_MS) {
      markToolOpening(state.targetTool, 1800);
      state.lastToolClickAt = now;
      state.lastActionAt = now;
      setStatus(`正在切换到${TOOL_OPTIONS[state.targetTool].label}...`, "busy");
      activateElement(tab.button);
      window.setTimeout(() => closeOtherToolTabs(`${reason}-after-tab-cleanup`), 300);
      if (state.targetTool === "browser") {
        window.setTimeout(() => requestCurrentChatBrowserSite(`${reason}-after-browser-tab`, { force: true }), 520);
      } else if (state.targetTool === "terminal") {
        verifyTerminalOpened(`${reason}-after-terminal-tab`);
      } else {
        window.setTimeout(() => {
          if (state.targetTool !== "none" && isRightPanelOpen()) {
            setStatus(`保持${TOOL_OPTIONS[state.targetTool].label}`, "ok");
          }
        }, 820);
      }
      return true;
    }

    const button = findToolLaunchButton(state.targetTool);
    if (now - state.lastToolClickAt < MIN_CLICK_INTERVAL_MS) {
      setStatus(`正在打开${TOOL_OPTIONS[state.targetTool].label}...`, "busy");
      return true;
    }
    if (isToolOpening(state.targetTool)) {
      setStatus(`正在打开${TOOL_OPTIONS[state.targetTool].label}...`, "busy");
      return true;
    }
    if (!button) {
      if (recordToolMiss(`${reason}-missing-launch-button`)) return true;
      const addButton = findAddSidePanelTabButton();
      if (!addButton || now - state.lastAddTabClickAt < MIN_CLICK_INTERVAL_MS) {
        return true;
      }

      state.lastAddTabClickAt = now;
      state.lastActionAt = now;
      setStatus("正在打开工具选择...", "busy");
      activateElement(addButton);
      window.setTimeout(() => ensurePreferredTool(`${reason}-after-add-tab`), 260);
      window.setTimeout(() => ensurePreferredTool(`${reason}-after-add-tab-followup`), 720);
      return true;
    }

    state.lastToolClickAt = now;
    state.lastActionAt = now;
    markToolOpening(state.targetTool);
    setStatus(`正在打开${TOOL_OPTIONS[state.targetTool].label}...`, "busy");
    activateElement(button);

    window.setTimeout(() => {
      if (state.targetTool !== "none" && isRightPanelOpen()) {
        if (
          state.targetTool === "browser" &&
          requestCurrentChatBrowserSite(`${reason}-after-launch`, { force: true })
        ) {
          return;
        }
        setStatus(`保持${TOOL_OPTIONS[state.targetTool].label}`, "ok");
      }
    }, 260);
    window.setTimeout(() => closeOtherToolTabs(`${reason}-after-launch-cleanup`), 420);
    if (state.targetTool === "browser") {
      window.setTimeout(() => requestCurrentChatBrowserSite(`${reason}-after-launch-followup`, { force: true }), 780);
    } else if (state.targetTool === "terminal") {
      verifyTerminalOpened(`${reason}-after-launch`);
    }

    return true;
  }

  function setOpenStatus() {
    if (state.targetTool === "none") {
      keepOnlyPanelOpen("open-status-none");
    } else {
      setStatus(`目标:${TOOL_OPTIONS[state.targetTool].label}`, "ok");
    }
  }

  function ensureRightPanel(reason = "check") {
    state.lastReason = reason;

    if (!isCodexShellDocument()) return false;

    if (!state.autoKeep) {
      setStatus("已暂停", "idle");
      return false;
    }

    const now = Date.now();
    if (
      state.startupHoldUntil &&
      now < state.startupHoldUntil &&
      !/toggle-auto|target-change|manual|startup-ready/.test(reason)
    ) {
      setStatus("等待 Codex 启动...", "busy");
      return false;
    }

    if (isRightPanelOpen()) {
      state.panelCommand = "";
      state.panelCommandUntil = 0;
      state.panelFailureUntil = 0;
      if (!ensurePreferredTool(reason)) {
        setOpenStatus();
      }
      return true;
    }

    if (state.panelCommand === "open" && now < state.panelCommandUntil) {
      setStatus("正在打开右侧栏...", "busy");
      return false;
    }
    if (state.panelCommand === "open" && state.panelCommandUntil && now >= state.panelCommandUntil) {
      state.panelCommand = "";
      state.panelCommandUntil = 0;
      state.panelFailureUntil = now + PANEL_FAILURE_PAUSE_MS;
      setStatus("右侧栏未响应", "warn");
      return false;
    }
    if (state.panelFailureUntil > now && !/toggle-auto|target-change|thread-switch/.test(reason)) {
      setStatus("右侧栏未响应", "warn");
      return false;
    }
    if (now - state.lastClickAt < MIN_CLICK_INTERVAL_MS) {
      setStatus("正在打开右侧栏...", "busy");
      return false;
    }

    const toggle = findRightPanelToggle();
    if (!toggle) {
      setStatus("未找到按钮", "warn");
      return false;
    }

    state.lastClickAt = now;
    state.lastActionAt = now;
    state.panelCommand = "open";
    state.panelCommandUntil = now + PANEL_COMMAND_TIMEOUT_MS;
    setStatus("正在打开右侧栏...", "busy");
    activateElement(toggle);

    window.setTimeout(() => {
      if (isRightPanelOpen()) {
        state.panelCommand = "";
        state.panelCommandUntil = 0;
        state.panelFailureUntil = 0;
        if (!ensurePreferredTool(`${reason}-after-open`)) {
          setOpenStatus();
        }
      } else {
        setStatus("正在打开右侧栏...", "busy");
      }
    }, 260);

    return true;
  }

  function closeRightPanel(reason = "manual-close", token = null) {
    if (token === null) {
      state.closePanelToken += 1;
      token = state.closePanelToken;
    } else if (token !== state.closePanelToken) {
      return false;
    }

    state.lastReason = reason;
    window.clearTimeout(state.pendingCheck);
    state.pendingCheck = 0;

    const collapsePanel = () => {
      if (token !== state.closePanelToken) return false;
      if (!isRightPanelOpen()) {
        setStatus("右侧栏已关闭", "idle");
        return true;
      }

      const now = Date.now();
      if (now - state.lastClickAt < MIN_CLICK_INTERVAL_MS) {
        setStatus("正在关闭右侧栏...", "busy");
        window.setTimeout(() => {
          if (token === state.closePanelToken) closeRightPanel(`${reason}-retry`, token);
        }, MIN_CLICK_INTERVAL_MS);
        return false;
      }

      const toggle = findRightPanelToggle();
      if (!toggle) {
        setStatus("未找到关闭按钮", "warn");
        return false;
      }

      state.lastClickAt = now;
      state.lastActionAt = now;
      setStatus("正在关闭右侧栏...", "busy");
      activateElement(toggle);
      window.setTimeout(() => {
        if (token !== state.closePanelToken) return;
        if (!isRightPanelOpen()) {
          setStatus("右侧栏已关闭", "idle");
        } else {
          setStatus("已暂停自动保持", "idle");
        }
      }, 700);
      return true;
    };

    return collapsePanel();
  }

  function scheduleEnsure(reason) {
    if (!state.autoKeep) return;
    if (state.pendingCheck) return;
    state.pendingCheck = window.setTimeout(() => {
      state.pendingCheck = 0;
      ensureRightPanel(reason);
    }, MUTATION_DEBOUNCE_MS);
  }

  function keepOnlyPanelOpen(reason = "target-none") {
    const finish = (routeSnapshot = null) => {
      if (routeSnapshot) {
        restoreRouteSnapshot(routeSnapshot, `${reason}-finish`);
      }
      if (isRightPanelOpen()) {
        setStatus("只保持打开", "ok");
      } else {
        setStatus("只保持打开", "idle");
      }
    };

    if (!isRightPanelOpen()) {
      if (!state.autoKeep) {
        finish();
        return;
      }
      const routeSnapshot = captureRouteSnapshot();
      watchRouteSnapshot(routeSnapshot, `${reason}-preserve-thread`);
      ensureRightPanel(reason);
      window.setTimeout(() => {
        restoreRouteSnapshot(routeSnapshot, `${reason}-after-open-restore`);
        closeOpenToolTabs(`${reason}-after-open`, () => finish(routeSnapshot));
      }, 360);
      return;
    }

    if (!findRightPanelTabs().length) {
      finish();
      return;
    }

    const routeSnapshot = captureRouteSnapshot();
    watchRouteSnapshot(routeSnapshot, `${reason}-preserve-thread`);
    closeOpenToolTabs(reason, () => finish(routeSnapshot));
  }

  function setAutoKeep(value) {
    state.autoKeep = value;
    writeBool(AUTO_KEY, state.autoKeep);
    syncToggleControls();
    resetToolMissState();
    state.closePanelToken += 1;
    window.clearTimeout(state.pendingCheck);
    state.pendingCheck = 0;
    if (state.autoKeep) {
      state.panelFailureUntil = 0;
      state.panelCommand = "";
      state.panelCommandUntil = 0;
      ensureRightPanel("toggle-auto");
    } else {
      state.currentChatRetryToken += 1;
      state.currentChatRetryActive = false;
      state.panelCommand = "";
      state.panelCommandUntil = 0;
      state.panelFailureUntil = 0;
      closeRightPanel("toggle-auto-off");
    }
  }

  function setCloseBrowserCompanions(value) {
    state.closeBrowserCompanions = Boolean(value);
    writeBool(CLOSE_BROWSER_COMPANIONS_KEY, state.closeBrowserCompanions);
    syncToggleControls();
    if (state.closeBrowserCompanions) {
      closeOtherToolTabs("toggle-single-tool-cleanup");
    }
  }

  function setBrowserUrl(value, mode = "custom") {
    state.browserUrl = String(value || "").trim();
    if (state.browserUrl) {
      state.browserUrlMode = mode === "preset" ? "preset" : "custom";
    }
    writeBrowserSettingsForThread();
    state.lastBrowserUrlRequestAt = 0;
    state.lastBrowserUrlValue = "";
    state.lastCurrentChatRequestAt = 0;
    state.lastCurrentChatRequestKey = "";
    if (state.browserUrlInput && state.browserUrlInput.value !== state.browserUrl) {
      state.browserUrlInput.value = state.browserUrl;
    }
    syncTargetControl();
    if (state.targetTool === "browser" && state.browserUrlMode !== "current" && state.browserUrl) {
      requestCustomBrowserUrl("set-browser-url", { force: true });
    }
    return state.browserUrl;
  }

  function setBrowserUrlMode(value) {
    state.browserUrlMode = value === "custom" ? "custom" : "current";
    if (state.browserUrlMode === "current") state.browserUrl = "";
    writeBrowserSettingsForThread();
    state.lastBrowserUrlRequestAt = 0;
    state.lastBrowserUrlValue = "";
    state.lastCurrentChatRequestAt = 0;
    state.lastCurrentChatRequestKey = "";
    if (state.browserUrlInput && state.browserUrlInput.value !== state.browserUrl) {
      state.browserUrlInput.value = state.browserUrl;
    }
    syncTargetControl();
    if (state.targetTool === "browser") {
      requestCurrentChatBrowserSite("set-browser-url-mode", { force: true });
    }
    return state.browserUrlMode;
  }

  function setTargetTool(value) {
    if (!TOOL_OPTIONS[value]) value = "none";
    state.targetTool = value;
    writeChoice(TARGET_KEY, state.targetTool);
    resetToolMissState();
    markToolOpening("");
    state.panelCommand = "";
    state.panelCommandUntil = 0;
    state.panelFailureUntil = 0;
    if (state.targetTool !== "browser") {
      state.currentChatRetryToken += 1;
      state.currentChatRetryActive = false;
    } else {
      refreshBrowserSettingsForThread();
    }
    syncToggleControls();
    syncTargetControl();
    if (state.targetTool === "none") {
      keepOnlyPanelOpen("target-change-none");
    } else {
      const label = TOOL_OPTIONS[state.targetTool].label;
      setStatus(`等待${label}...`, "busy");
      ensureRightPanel("target-change");
      if (state.targetTool === "browser") {
        requestCurrentChatBrowserSite("target-change-current-chat", { force: true });
      } else if (!state.autoKeep) {
        setStatus(`等待${label}...`, "busy");
      }
    }
  }

  function installStyle() {
    document.getElementById(STYLE_ID)?.remove();
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} {
        position: fixed;
        top: ${DOCK_TOP_PX}px;
        right: ${DOCK_RIGHT_PX}px;
        z-index: 2147483647;
        height: 44px;
        display: inline-flex;
        align-items: center;
        color: rgba(100, 116, 139, 0.7);
        font: 13px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        user-select: none;
      }
      body > #${ROOT_ID} ~ #${ROOT_ID} {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
      #${ROOT_ID}[data-docked="topbar"] {
        position: relative;
        inset: auto;
        z-index: auto;
        flex: 0 0 auto;
        height: 36px;
        margin: 0 6px 0 0;
        align-self: center;
      }
      #${ROOT_ID}[data-docked="fallback"] {
        position: fixed;
        z-index: 2147483647;
      }
      #${ROOT_ID}[data-docked="codex-plus"] {
        position: fixed;
        z-index: 2147483646;
        height: 36px;
        margin: 0;
      }
      #${ROOT_ID} button {
        color: inherit;
        font: inherit;
        letter-spacing: 0;
      }
      #${ROOT_ID} .csk-launcher {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        height: 34px;
        padding: 0 9px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: rgba(100, 116, 139, 0.66);
        font-weight: 650;
        line-height: 1;
        white-space: nowrap;
        cursor: pointer;
        pointer-events: auto;
        -webkit-app-region: no-drag;
        transition: color 0.16s ease, background 0.16s ease, opacity 0.16s ease;
      }
      #${ROOT_ID}[data-docked="topbar"] .csk-launcher {
        height: 36px;
        min-width: 0;
        justify-content: center;
        gap: 7px;
        padding: 0 8px;
        border: 0;
        background: transparent;
        color: rgba(100, 116, 139, 0.62);
        box-shadow: none;
      }
      #${ROOT_ID}[data-docked="codex-plus"] .csk-launcher {
        height: 36px;
        min-width: 0;
        justify-content: center;
        gap: 7px;
        padding: 0 8px;
        border: 0;
        background: transparent;
        color: rgba(100, 116, 139, 0.62);
        box-shadow: none;
      }
      #${ROOT_ID} .csk-launcher:hover,
      #${ROOT_ID} .csk-launcher[aria-expanded="true"] {
        background: transparent;
        color: rgba(51, 65, 85, 0.82);
      }
      #${ROOT_ID} .csk-launcher:focus-visible,
      #${ROOT_ID} button:focus-visible {
        outline: 2px solid rgba(45, 212, 191, 0.55);
        outline-offset: 2px;
      }
      #${ROOT_ID} .csk-brand-dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: #10b981;
        box-shadow: 0 0 7px rgba(16, 185, 129, 0.46);
        animation: csk-dot-pulse 4.8s ease-in-out infinite;
      }
      @keyframes csk-dot-pulse {
        0%, 32% {
          opacity: 1;
          transform: scale(1);
        }
        44%, 82% {
          opacity: 0;
          transform: scale(0.72);
        }
        100% {
          opacity: 1;
          transform: scale(1);
        }
      }
      #${ROOT_ID} .csk-version {
        color: rgba(100, 116, 139, 0.5);
        font-weight: 600;
      }
      #${ROOT_ID}[data-docked="topbar"] .csk-version,
      #${ROOT_ID}[data-docked="codex-plus"] .csk-version {
        display: none;
      }
      #${ROOT_ID} .csk-panel {
        position: absolute;
        top: calc(100% + 6px);
        right: -252px;
        width: min(390px, calc(100vw - 24px));
        max-height: calc(100vh - 16px);
        box-sizing: border-box;
        overflow: hidden;
        border: 1px solid rgba(148, 163, 184, 0.16);
        border-radius: 18px;
        background: #202124;
        color: #f1f5f9;
        box-shadow: 0 26px 64px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.035);
        padding: 18px;
        pointer-events: auto;
        -webkit-app-region: no-drag;
        cursor: grab;
      }
      #${ROOT_ID} .csk-panel[data-dragging="true"] {
        cursor: grabbing;
      }
      #${ROOT_ID} .csk-panel[data-help-open="true"] {
        max-height: calc(100vh - 56px);
        overflow-y: auto;
      }
      #${ROOT_ID} .csk-panel button,
      #${ROOT_ID} .csk-panel input,
      #${ROOT_ID} .csk-panel textarea,
      #${ROOT_ID} .csk-panel select,
      #${ROOT_ID} .csk-panel a {
        cursor: auto;
      }
      #${ROOT_ID} .csk-panel[data-dragged="true"] {
        position: fixed;
        max-height: calc(100vh - 16px);
      }
      #${ROOT_ID}[data-docked="topbar"] .csk-panel {
        right: 0;
      }
      #${ROOT_ID}[data-docked="codex-plus"] .csk-panel {
        right: 0;
      }
      #${ROOT_ID} .csk-panel[hidden] {
        display: none;
      }
      #${ROOT_ID} .csk-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        position: static;
        height: auto;
        min-height: 30px;
        padding: 0;
        border: 0;
        background: transparent;
        margin-bottom: 18px;
        touch-action: none;
      }
      #${ROOT_ID} .csk-panel-brand {
        display: inline-flex;
        align-items: center;
        gap: 9px;
        font-size: 18px;
        font-weight: 700;
      }
      #${ROOT_ID} .csk-panel-actions {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        flex: 0 0 auto;
      }
      #${ROOT_ID} .csk-pin {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 30px;
        height: 30px;
        border: 0;
        border-radius: 7px;
        background: transparent;
        color: rgba(203, 213, 225, 0.82);
        cursor: pointer;
      }
      #${ROOT_ID} .csk-pin svg {
        width: 16px;
        height: 16px;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
        fill: none;
      }
      #${ROOT_ID} .csk-pin:hover {
        background: rgba(255, 255, 255, 0.09);
        color: #fff;
      }
      #${ROOT_ID} .csk-pin[aria-pressed="true"] {
        background: rgba(13, 148, 136, 0.18);
        color: #5eead4;
      }
      #${ROOT_ID} .csk-help-toggle {
        width: 30px;
        height: 30px;
        border: 0;
        border-radius: 7px;
        background: transparent;
        color: rgba(203, 213, 225, 0.78);
        font-size: 16px;
        font-weight: 700;
        line-height: 1;
        cursor: pointer;
      }
      #${ROOT_ID} .csk-help-toggle:hover,
      #${ROOT_ID} .csk-help-toggle[aria-expanded="true"] {
        background: rgba(255, 255, 255, 0.09);
        color: #fff;
      }
      #${ROOT_ID} .csk-theme-toggle {
        width: 30px;
        height: 30px;
        border: 0;
        border-radius: 7px;
        background: transparent;
        color: rgba(203, 213, 225, 0.78);
        font-size: 15px;
        font-weight: 700;
        line-height: 1;
        cursor: pointer;
      }
      #${ROOT_ID} .csk-theme-toggle:hover,
      #${ROOT_ID} .csk-theme-toggle[aria-pressed="true"] {
        background: rgba(255, 255, 255, 0.09);
        color: #fff;
      }
      #${ROOT_ID} .csk-close {
        width: 30px;
        height: 30px;
        border: 0;
        border-radius: 7px;
        background: transparent;
        color: rgba(203, 213, 225, 0.82);
        font-size: 22px;
        line-height: 1;
        cursor: pointer;
      }
      #${ROOT_ID} .csk-close:hover {
        background: rgba(255, 255, 255, 0.09);
        color: #fff;
      }
      #${ROOT_ID} .csk-section {
        padding: 14px 0 4px;
        border-top: 1px solid rgba(148, 163, 184, 0.13);
      }
      #${ROOT_ID} .csk-help {
        margin: -4px 0 14px;
        box-sizing: border-box;
        padding: 12px;
        border: 1px solid rgba(148, 163, 184, 0.14);
        border-radius: 8px;
        background: #25272b;
        color: rgba(226, 232, 240, 0.86);
        font-size: 12.5px;
        line-height: 1.36;
      }
      #${ROOT_ID} .csk-help[hidden] {
        display: none;
      }
      #${ROOT_ID} .csk-help-title {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 2px;
        color: rgba(241, 245, 249, 0.95);
        font-size: 16px;
        font-weight: 700;
      }
      #${ROOT_ID} .csk-help-title::before {
        content: "";
        width: 9px;
        height: 9px;
        border-radius: 999px;
        background: #2dd4bf;
        box-shadow: 0 0 0 4px rgba(45, 212, 191, 0.13);
      }
      #${ROOT_ID} .csk-help-subtitle {
        margin: 0 0 8px 18px;
        color: rgba(148, 163, 184, 0.92);
        font-size: 12.5px;
      }
      #${ROOT_ID} .csk-help-rules {
        display: grid;
        gap: 6px;
      }
      #${ROOT_ID} .csk-help-rule {
        display: grid;
        grid-template-columns: 26px 1fr;
        gap: 8px;
        align-items: center;
        padding: 7px 8px;
        border: 1px solid rgba(148, 163, 184, 0.13);
        border-radius: 8px;
        background: rgba(17, 24, 39, 0.28);
      }
      #${ROOT_ID} .csk-help-index {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border-radius: 999px;
        background: rgba(45, 212, 191, 0.15);
        color: #99f6e4;
        font-size: 12.5px;
        font-weight: 700;
      }
      #${ROOT_ID} .csk-help-rule strong {
        display: block;
        margin-bottom: 2px;
        color: #f8fafc;
        font-size: 13px;
      }
      #${ROOT_ID} .csk-help-rule span:last-child {
        color: rgba(226, 232, 240, 0.94);
        font-size: 12px;
        font-weight: 500;
      }
      #${ROOT_ID} .csk-help-note {
        margin-top: 7px;
        padding: 7px 9px;
        border-radius: 8px;
        background: rgba(20, 184, 166, 0.12);
        color: rgba(204, 251, 241, 0.94);
        font-size: 11.5px;
      }
      #${ROOT_ID} .csk-panel[data-help-open="true"] .csk-help {
        margin-bottom: 0;
        padding: 10px;
        overflow: visible;
      }
      #${ROOT_ID} .csk-panel[data-help-open="true"] .csk-panel-header {
        margin-bottom: 14px;
      }
      #${ROOT_ID} .csk-panel[data-help-open="true"] .csk-help-rule {
        padding: 6px 8px;
      }
      #${ROOT_ID} .csk-panel[data-help-open="true"] .csk-help-note {
        padding: 6px 9px;
      }
      #${ROOT_ID} .csk-panel[data-help-open="true"] .csk-section,
      #${ROOT_ID} .csk-panel[data-help-open="true"] .csk-status {
        display: none;
      }
      #${ROOT_ID} .csk-section-title {
        color: rgba(241, 245, 249, 0.94);
        font-size: 15px;
        font-weight: 650;
        margin-bottom: 12px;
      }
      #${ROOT_ID} .csk-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 38px;
        color: rgba(226, 232, 240, 0.86);
      }
      #${ROOT_ID} .csk-row[hidden] {
        display: none;
      }
      #${ROOT_ID} .csk-switch {
        position: relative;
        flex: 0 0 auto;
        width: 48px;
        height: 28px;
        border: 0;
        border-radius: 999px;
        background: #475569;
        cursor: pointer;
        transition: background 0.16s ease;
      }
      #${ROOT_ID} .csk-switch::after {
        content: "";
        position: absolute;
        top: 3px;
        left: 3px;
        width: 22px;
        height: 22px;
        border-radius: 999px;
        background: #fff;
        transition: transform 0.16s ease;
      }
      #${ROOT_ID} .csk-switch[aria-pressed="true"] {
        background: #0d9488;
      }
      #${ROOT_ID} .csk-switch[aria-pressed="true"]::after {
        transform: translateX(20px);
      }
      #${ROOT_ID} .csk-label {
        margin: 14px 0 9px;
        color: rgba(148, 163, 184, 0.9);
        font-size: 12px;
      }
      #${ROOT_ID} .csk-browser-url-group[hidden] {
        display: none;
      }
      #${ROOT_ID} .csk-url-input {
        width: 100%;
        height: 40px;
        box-sizing: border-box;
        margin: 2px 0 12px;
        padding: 0 12px;
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 8px;
        background: rgba(15, 23, 42, 0.26);
        color: rgba(241, 245, 249, 0.94);
        outline: none;
        font-size: 13px;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
        transition: border-color 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
      }
      #${ROOT_ID} .csk-url-input[hidden] {
        display: none;
      }
      #${ROOT_ID} .csk-url-select {
        width: 100%;
        height: 34px;
        box-sizing: border-box;
        margin-bottom: 8px;
        padding: 0 10px;
        border: 1px solid rgba(148, 163, 184, 0.22);
        border-radius: 7px;
        background: #252b33;
        color: rgba(241, 245, 249, 0.94);
        outline: none;
      }
      #${ROOT_ID} .csk-url-input::placeholder {
        color: rgba(148, 163, 184, 0.7);
      }
      #${ROOT_ID} .csk-url-input:focus {
        border-color: rgba(45, 212, 191, 0.46);
        background: rgba(15, 23, 42, 0.42);
        box-shadow: 0 0 0 1px rgba(45, 212, 191, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.04);
      }
      #${ROOT_ID} .csk-segments {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 6px;
        margin-bottom: 10px;
      }
      #${ROOT_ID} .csk-segments button {
        min-width: 0;
        height: 34px;
        padding: 0 6px;
        border: 1px solid rgba(148, 163, 184, 0.22);
        border-radius: 7px;
        background: rgba(255, 255, 255, 0.035);
        color: rgba(203, 213, 225, 0.9);
        cursor: pointer;
        white-space: nowrap;
      }
      #${ROOT_ID} .csk-segments button:hover {
        border-color: rgba(45, 212, 191, 0.45);
        background: rgba(13, 148, 136, 0.12);
      }
      #${ROOT_ID} .csk-segments button[data-selected="true"] {
        border-color: #0d9488;
        background: #0d9488;
        color: white;
      }
      #${ROOT_ID} .csk-status {
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 30px;
        margin-top: 12px;
        padding: 8px 10px;
        border-radius: 7px;
        background: rgba(255, 255, 255, 0.055);
        color: rgba(203, 213, 225, 0.88);
      }
      #${ROOT_ID} .csk-dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: #94a3b8;
      }
      #${ROOT_ID}[data-status="ok"] .csk-dot,
      #${ROOT_ID}[data-status="ok"] .csk-brand-dot {
        background: #10b981;
      }
      #${ROOT_ID}[data-status="warn"] .csk-dot,
      #${ROOT_ID}[data-status="warn"] .csk-brand-dot {
        background: #f59e0b;
      }
      #${ROOT_ID}[data-status="busy"] .csk-dot,
      #${ROOT_ID}[data-status="busy"] .csk-brand-dot {
        background: #38bdf8;
        box-shadow: 0 0 0 4px rgba(56, 189, 248, 0.13);
        animation: cskPulse 0.9s ease-in-out infinite;
      }
      @keyframes cskPulse {
        0%, 100% {
          transform: scale(0.86);
          opacity: 0.72;
        }
        50% {
          transform: scale(1.12);
          opacity: 1;
        }
      }
      #${ROOT_ID}[data-theme="light"] .csk-panel {
        border-color: rgba(148, 163, 184, 0.28);
        background: #f8fafc;
        color: #0f172a;
        box-shadow: 0 24px 56px rgba(15, 23, 42, 0.18);
      }
      #${ROOT_ID}[data-theme="light"] .csk-panel-brand,
      #${ROOT_ID}[data-theme="light"] .csk-section-title {
        color: #111827;
      }
      #${ROOT_ID}[data-theme="light"] .csk-help-toggle,
      #${ROOT_ID}[data-theme="light"] .csk-theme-toggle,
      #${ROOT_ID}[data-theme="light"] .csk-pin,
      #${ROOT_ID}[data-theme="light"] .csk-close {
        color: rgba(71, 85, 105, 0.9);
      }
      #${ROOT_ID}[data-theme="light"] .csk-help-toggle:hover,
      #${ROOT_ID}[data-theme="light"] .csk-help-toggle[aria-expanded="true"],
      #${ROOT_ID}[data-theme="light"] .csk-theme-toggle:hover,
      #${ROOT_ID}[data-theme="light"] .csk-theme-toggle[aria-pressed="true"],
      #${ROOT_ID}[data-theme="light"] .csk-pin:hover,
      #${ROOT_ID}[data-theme="light"] .csk-close:hover {
        background: rgba(15, 23, 42, 0.07);
        color: #0f172a;
      }
      #${ROOT_ID}[data-theme="light"] .csk-pin[aria-pressed="true"] {
        background: rgba(13, 148, 136, 0.14);
        color: #0f766e;
      }
      #${ROOT_ID}[data-theme="light"] .csk-section {
        border-top-color: rgba(148, 163, 184, 0.28);
      }
      #${ROOT_ID}[data-theme="light"] .csk-row {
        color: #334155;
      }
      #${ROOT_ID}[data-theme="light"] .csk-label,
      #${ROOT_ID}[data-theme="light"] .csk-help-subtitle {
        color: #64748b;
      }
      #${ROOT_ID}[data-theme="light"] .csk-help {
        border-color: rgba(148, 163, 184, 0.26);
        background: #eef2f7;
        color: #334155;
      }
      #${ROOT_ID}[data-theme="light"] .csk-help-title {
        color: #0f172a;
      }
      #${ROOT_ID}[data-theme="light"] .csk-help-rule {
        border-color: rgba(148, 163, 184, 0.26);
        background: rgba(255, 255, 255, 0.72);
      }
      #${ROOT_ID}[data-theme="light"] .csk-help-index {
        background: rgba(13, 148, 136, 0.14);
        color: #0f766e;
      }
      #${ROOT_ID}[data-theme="light"] .csk-help-rule strong {
        color: #0f172a;
      }
      #${ROOT_ID}[data-theme="light"] .csk-help-rule span:last-child {
        color: #334155;
      }
      #${ROOT_ID}[data-theme="light"] .csk-help-note {
        background: rgba(13, 148, 136, 0.12);
        color: #115e59;
      }
      #${ROOT_ID}[data-theme="light"] .csk-url-input {
        border-color: rgba(148, 163, 184, 0.34);
        background: #ffffff;
        color: #0f172a;
        box-shadow: inset 0 1px 0 rgba(15, 23, 42, 0.03);
      }
      #${ROOT_ID}[data-theme="light"] .csk-url-select {
        border-color: rgba(148, 163, 184, 0.34);
        background: #ffffff;
        color: #0f172a;
      }
      #${ROOT_ID}[data-theme="light"] .csk-url-input::placeholder {
        color: #94a3b8;
      }
      #${ROOT_ID}[data-theme="light"] .csk-url-input:focus {
        border-color: rgba(13, 148, 136, 0.5);
        background: #ffffff;
        box-shadow: 0 0 0 1px rgba(13, 148, 136, 0.18), inset 0 1px 0 rgba(15, 23, 42, 0.03);
      }
      #${ROOT_ID}[data-theme="light"] .csk-segments button {
        border-color: rgba(148, 163, 184, 0.34);
        background: rgba(255, 255, 255, 0.72);
        color: #475569;
      }
      #${ROOT_ID}[data-theme="light"] .csk-segments button:hover {
        border-color: rgba(13, 148, 136, 0.42);
        background: rgba(20, 184, 166, 0.1);
      }
      #${ROOT_ID}[data-theme="light"] .csk-segments button[data-selected="true"] {
        border-color: #0d9488;
        background: #0d9488;
        color: #ffffff;
      }
      #${ROOT_ID}[data-theme="light"] .csk-switch {
        background: #cbd5e1;
      }
      #${ROOT_ID}[data-theme="light"] .csk-switch[aria-pressed="true"] {
        background: #0d9488;
      }
      #${ROOT_ID}[data-theme="light"] .csk-status {
        background: rgba(15, 23, 42, 0.06);
        color: #475569;
      }
      @media (max-width: 1100px) {
        #${ROOT_ID} {
          right: 108px;
        }
        #${ROOT_ID} .csk-panel {
          right: -86px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function renderControls() {
    document.querySelectorAll(`#${ROOT_ID}`).forEach((element) => element.remove());

    const root = document.createElement("div");
    root.id = ROOT_ID;
    root.dataset.status = "idle";
    root.dataset.docked = "top";
    root.innerHTML = `
      <button class="csk-launcher" data-csk-action="panel" type="button" aria-haspopup="dialog" aria-expanded="false" title="Sidebar Keeper">
        <span class="csk-brand-dot" aria-hidden="true"></span>
        <span>Sidebar Keeper</span>
        <span class="csk-version">${SCRIPT_VERSION}</span>
      </button>
      <section class="csk-panel" role="dialog" aria-label="Sidebar Keeper 设置" hidden>
        <header class="csk-panel-header">
          <span class="csk-panel-brand"><span class="csk-brand-dot" aria-hidden="true"></span>Sidebar Keeper ${SCRIPT_VERSION}</span>
          <span class="csk-panel-actions">
            <button class="csk-help-toggle" data-csk-action="help" type="button" aria-label="使用说明" aria-expanded="false" title="使用说明">?</button>
            <button class="csk-theme-toggle" data-csk-action="theme" type="button" aria-label="切换到浅色模式" aria-pressed="false" title="切换到浅色模式">☾</button>
            <button class="csk-pin" data-csk-action="pin-panel" type="button" aria-label="置顶设置面板" aria-pressed="false" title="置顶设置面板">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 4h8"></path>
                <path d="M10 4v5.5l-3 3V16h10v-3.5l-3-3V4"></path>
                <path d="M9 16h6"></path>
                <path d="M12 16v5"></path>
              </svg>
            </button>
            <button class="csk-close" data-csk-action="close" type="button" aria-label="关闭">×</button>
          </span>
        </header>
        <section class="csk-help" data-csk-help hidden>
          <div class="csk-help-title">一次只保留一个右侧标签</div>
          <div class="csk-help-subtitle">按“打开后显示”的选择整理右侧工作区。</div>
          <div class="csk-help-rules">
            <div class="csk-help-rule">
              <span class="csk-help-index">1</span>
              <span><strong>保留当前目标</strong><span>选中侧边聊天、浏览器或终端时，只留对应标签。</span></span>
            </div>
            <div class="csk-help-rule">
              <span class="csk-help-index">2</span>
              <span><strong>关闭其它工具</strong><span>目标以外的右侧工具标签会被依次关闭，并保持当前主对话。</span></span>
            </div>
            <div class="csk-help-rule">
              <span class="csk-help-index">3</span>
              <span><strong>处理重复标签</strong><span>同类标签有多个时，优先保留当前选中的那个。</span></span>
            </div>
          </div>
          <div class="csk-help-note">选择“只打开”时只展开右侧栏，不保留任何右侧工具标签，也不会切到新建对话。</div>
        </section>
        <section class="csk-section">
          <div class="csk-section-title">右侧工作面板</div>
          <div class="csk-row">
            <span>切换对话时保持打开</span>
            <button class="csk-switch csk-auto" data-csk-action="auto" type="button" aria-pressed="true" aria-label="切换对话时保持打开"></button>
          </div>
          <div class="csk-row">
            <span>一次只保留一个右侧标签</span>
            <button class="csk-switch csk-close-companions" data-csk-action="close-companions" type="button" aria-pressed="true" aria-label="一次只保留一个右侧标签"></button>
          </div>
          <div class="csk-label">打开后显示</div>
          <div class="csk-segments" role="radiogroup" aria-label="打开后显示">
            <button type="button" role="radio" data-csk-target-option="none">只打开</button>
            <button type="button" role="radio" data-csk-target-option="sidechat">侧边聊天</button>
            <button type="button" role="radio" data-csk-target-option="browser">浏览器</button>
            <button type="button" role="radio" data-csk-target-option="terminal">终端</button>
          </div>
          <div class="csk-browser-url-group" data-csk-browser-url-group hidden>
            <div class="csk-label">浏览器网址</div>
            <select class="csk-url-select" data-csk-browser-url-select aria-label="选择打开浏览器时自动进入的网站">
              <option value="current">此聊天网址</option>
              <option value="localhost:5180">LongCat Studio (localhost:5180)</option>
              <option value="localhost:18787">localhost:18787</option>
              <option value="localhost:8000">localhost:8000</option>
              <option value="localhost:3000">小苹果邮箱验证码工具 (localhost:3000)</option>
              <option value="localhost:33210">localhost:33210</option>
              <option value="custom">自定义网址</option>
            </select>
            <input class="csk-url-input" data-csk-browser-url type="text" spellcheck="false" autocomplete="off" placeholder="留空则打开此聊天网址，例如 https://example.com" aria-label="打开浏览器时自动打开的网址">
          </div>
        </section>
        <span class="csk-status"><span class="csk-dot" aria-hidden="true"></span><span class="csk-text">启动中</span></span>
      </section>
    `;

    document.body.appendChild(root);
    state.root = root;
    state.launcher = root.querySelector(".csk-launcher");
    state.panel = root.querySelector(".csk-panel");
    state.pinButton = root.querySelector(".csk-pin");
    state.helpButton = root.querySelector(".csk-help-toggle");
    state.themeButton = root.querySelector(".csk-theme-toggle");
    state.helpPanel = root.querySelector(".csk-help");
    state.autoButton = root.querySelector(".csk-auto");
    state.closeCompanionsButton = root.querySelector(".csk-close-companions");
    state.browserUrlGroup = root.querySelector(".csk-browser-url-group");
    state.browserUrlSelect = root.querySelector(".csk-url-select");
    state.browserUrlInput = root.querySelector(".csk-url-input");
    state.status = root.querySelector(".csk-text");
    refreshBrowserSettingsForThread({ allowGlobalMigration: true });
    removeDuplicateRoots();

    syncToggleControls();
    syncTargetControl();
    syncPanelPinned();
    syncTheme();
    applyPosition();
    applyPanelPosition();
    installPanelDragHandlers();

    state.resizeHandler = () => {
      clearButtonCache();
      applyPosition();
      applyPanelPosition();
    };
    window.addEventListener("resize", state.resizeHandler);

    state.launcher?.addEventListener("click", togglePanelFromEvent, true);
    state.launcher?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        togglePanelFromEvent(event);
      }
    });

    root.addEventListener(
      "pointerdown",
      (event) => {
        const button = event.target?.closest?.("[data-csk-action]");
        if (button && root.contains(button)) {
          event.stopPropagation();
        }
      },
      true
    );

    root.addEventListener("click", (event) => {
      const button = event.target?.closest?.("[data-csk-action]");
      if (!button || !root.contains(button)) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();

      const action = button.dataset.cskAction;
      if (action === "panel") {
        return;
      } else if (action === "pin-panel") {
        setPanelPinned(!state.panelPinned);
      } else if (action === "help") {
        setHelpOpen(!state.helpOpen);
      } else if (action === "theme") {
        toggleTheme();
      } else if (action === "close") {
        setPanelOpen(false);
      } else if (action === "auto") {
        setAutoKeep(!state.autoKeep);
      } else if (action === "close-companions") {
        setCloseBrowserCompanions(!state.closeBrowserCompanions);
      }
    });

    root.addEventListener("click", (event) => {
      const button = event.target?.closest?.("[data-csk-target-option]");
      if (!button || !root.contains(button)) return;

      event.preventDefault();
      event.stopPropagation();
      setTargetTool(button.dataset.cskTargetOption);
    });

    state.browserUrlSelect?.addEventListener("change", (event) => {
      const value = event.currentTarget.value;
      if (value === "current") {
        setBrowserUrlMode("current");
      } else if (value === "custom") {
        setBrowserUrlMode("custom");
        state.browserUrlInput?.focus?.();
      } else {
        setBrowserUrl(value, "preset");
      }
    });

    state.browserUrlInput?.addEventListener("input", (event) => {
      state.browserUrl = event.target.value.trim();
      if (state.browserUrl) {
        state.browserUrlMode = "custom";
      }
      writeBrowserSettingsForThread();
      state.lastBrowserUrlRequestAt = 0;
      state.lastBrowserUrlValue = "";
      state.lastCurrentChatRequestAt = 0;
      state.lastCurrentChatRequestKey = "";
      syncTargetControl();
    });

    state.browserUrlInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        consumeControlEvent(event);
        setBrowserUrl(event.currentTarget.value);
      }
    });

    state.documentPointerHandler = (event) => {
      if (event.isTrusted === false) return;
      if (state.panelPinned) return;
      if (state.root && !state.root.contains(event.target)) {
        setPanelOpen(false);
      }
    };
    document.addEventListener("pointerdown", state.documentPointerHandler, true);

    root.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !state.panelPinned) {
        setPanelOpen(false);
      }
    });

  }

  function installPanelDragHandlers() {
    const panel = state.panel;
    if (!panel) return;
    let drag = null;

    panel.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target?.closest?.(PANEL_NO_DRAG_SELECTOR)) return;
      const rect = panel.getBoundingClientRect();
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startLeft: rect.left,
        startTop: rect.top,
      };
      state.panelDragging = true;
      panel.dataset.dragging = "true";
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      panel.setPointerCapture?.(event.pointerId);
    });

    panel.addEventListener("pointermove", (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      state.panelPosition = clampPanelPosition({
        left: drag.startLeft + event.clientX - drag.startX,
        top: drag.startTop + event.clientY - drag.startY,
      });
      applyPanelPosition();
    });

    const finishDrag = (event) => {
      if (!drag || (event.pointerId && drag.pointerId !== event.pointerId)) return;
      state.panelDragging = false;
      panel.dataset.dragging = "false";
      writePanelPosition();
      drag = null;
    };

    panel.addEventListener("pointerup", finishDrag);
    panel.addEventListener("pointercancel", finishDrag);
    panel.addEventListener("dblclick", (event) => {
      if (event.target?.closest?.(PANEL_NO_DRAG_SELECTOR)) return;
      event.preventDefault();
      event.stopPropagation();
      resetPanelPosition();
    });
  }

  function installObservers() {
    window.clearInterval(state.interval);
    state.interval = window.setInterval(() => {
      if (state.autoKeep) ensureRightPanel("interval");
    }, CHECK_INTERVAL_MS);

    state.observer?.disconnect();
    state.observer = new MutationObserver((records) => {
      clearButtonCache();
      applyPosition();
      if (!state.autoKeep) return;
      if (records.every((record) => state.root?.contains(record.target))) return;
      scheduleEnsure("mutation");
    });
    state.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-pressed", "aria-label", "title"],
    });

    if (state.threadClickHandler) {
      document.removeEventListener("click", state.threadClickHandler, true);
    }
    if (state.routePointerHandler) {
      document.removeEventListener("pointerdown", state.routePointerHandler, true);
    }
    if (state.routeKeyHandler) {
      document.removeEventListener("keydown", state.routeKeyHandler, true);
    }
    state.routePointerHandler = (event) => {
      markUserRouteNavigationFromEvent(event, "user-pointer");
    };
    document.addEventListener("pointerdown", state.routePointerHandler, true);

    state.routeKeyHandler = (event) => {
      if (!event.isTrusted) return;
      const key = String(event.key || "").toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "n") {
        markUserRouteNavigation("user-keyboard-new-conversation");
      }
    };
    document.addEventListener("keydown", state.routeKeyHandler, true);

    state.threadClickHandler = (event) => {
      const threadRow = event.target?.closest?.("[data-app-action-sidebar-thread-id]");
      markUserRouteNavigationFromEvent(event, "user-click");
      if (threadRow) {
        state.currentThreadKey = threadKeyFromElement(threadRow) || state.currentThreadKey;
        window.setTimeout(() => refreshBrowserSettingsForThread(), 120);
        window.setTimeout(() => ensureRightPanel("thread-switch"), 250);
        window.setTimeout(() => ensureRightPanel("thread-switch-followup"), 900);
      }
    };
    document.addEventListener("click", state.threadClickHandler, true);
  }

  function destroy() {
    window.clearInterval(state.interval);
    window.clearTimeout(state.pendingCheck);
    if (state.resizeHandler) {
      window.removeEventListener("resize", state.resizeHandler);
      state.resizeHandler = null;
    }
    state.observer?.disconnect();
    if (state.threadClickHandler) {
      document.removeEventListener("click", state.threadClickHandler, true);
      state.threadClickHandler = null;
    }
    if (state.routePointerHandler) {
      document.removeEventListener("pointerdown", state.routePointerHandler, true);
      state.routePointerHandler = null;
    }
    if (state.routeKeyHandler) {
      document.removeEventListener("keydown", state.routeKeyHandler, true);
      state.routeKeyHandler = null;
    }
    if (state.documentPointerHandler) {
      document.removeEventListener("pointerdown", state.documentPointerHandler, true);
      state.documentPointerHandler = null;
    }
    state.root?.remove();
    document.querySelectorAll(`#${ROOT_ID}`).forEach((element) => element.remove());
    document.getElementById(STYLE_ID)?.remove();
    delete window[API_KEY];
  }

  function markCodexPlusLoaded() {
    try {
      const registry = (window.__codexPlusUserScripts = window.__codexPlusUserScripts || { scripts: {} });
      registry.scripts = registry.scripts || {};
      registry.scripts[CODEX_PLUS_SCRIPT_KEY] = {
        key: CODEX_PLUS_SCRIPT_KEY,
        name: CODEX_PLUS_SCRIPT_NAME,
        source: "user",
        status: "loaded",
        error: "",
        loadedAt: new Date().toISOString(),
      };
    } catch {
      // Codex++ is optional; the keeper still works when loaded directly.
    }
  }

  function initialize() {
    if (!isCodexShellDocument() || state.root) return Boolean(state.root);
    installStyle();
    renderControls();
    state.startupHoldUntil = Date.now() + STARTUP_HOLD_MS;
    installObservers();
    if (state.autoKeep) {
      if (isRightPanelOpen()) {
        state.startupHoldUntil = 0;
        ensureRightPanel("startup-ready");
      } else {
        setStatus("等待 Codex 启动...", "busy");
        window.setTimeout(() => ensureRightPanel("startup-ready"), STARTUP_HOLD_MS);
      }
    } else {
      setStatus(isRightPanelOpen() ? "已暂停自动保持" : "右侧栏已关闭", "idle");
    }
    markCodexPlusLoaded();

    window[API_KEY] = {
      version: SCRIPT_VERSION,
      ensure: ensureRightPanel,
      close: closeRightPanel,
      setPosition,
      resetPosition,
      setTargetTool,
      setCloseBrowserCompanions,
      setBrowserUrl,
      closeBrowserCompanionTabs,
      openCurrentChatSite: () => requestCurrentChatBrowserSite("manual-current-chat", { force: true }),
      inspectCurrentChatSite,
      openSettings: () => setPanelOpen(true),
      setPanelPinned,
      setTheme,
      toggleTheme,
      resetPanelPosition,
      destroy,
      getState: () => ({
        version: SCRIPT_VERSION,
        panelPinned: state.panelPinned,
        theme: state.theme,
        autoKeep: state.autoKeep,
        targetTool: state.targetTool,
        targetLabel: TOOL_OPTIONS[state.targetTool]?.label || "",
        closeBrowserCompanions: state.closeBrowserCompanions,
        currentThreadKey: state.currentThreadKey || getCurrentThreadKey(),
        browserUrl: state.browserUrl,
        normalizedBrowserUrl: normalizeBrowserUrl(state.browserUrl),
        autoOpenCurrentChat: state.targetTool === "browser",
        settingsOpen: state.panelOpen,
        docked: true,
        position: { ...state.position },
        panelPosition: state.panelPosition ? { ...state.panelPosition } : null,
        rightPanelOpen: isRightPanelOpen(),
        toggleFound: !!findRightPanelToggle(),
        currentChatRetryActive: state.currentChatRetryActive,
        currentChatRetryAttempts: state.currentChatRetryAttempts,
        toolMissTarget: state.toolMissTarget,
        toolMissCount: state.toolMissCount,
        toolPausedTarget: state.toolPausedTarget,
        rightPanelTabs: findRightPanelToolTabs().map((item) => ({
          tool: item.tool,
          label: item.label,
          selected: item.selected,
        })),
        lastReason: state.lastReason,
        lastActionAt: state.lastActionAt,
        status: state.status?.textContent || "",
      }),
    };
    return true;
  }

  function safeInitialize() {
    try {
      return initialize();
    } catch (error) {
      console.warn("[Codex Sidebar Keeper] initialization skipped", error);
      return false;
    }
  }

  function startWhenCodexShellReady() {
    if (!document.documentElement) {
      window.setTimeout(startWhenCodexShellReady, 80);
      return;
    }
    if (safeInitialize()) return;
    let bootInterval = 0;
    const bootObserver = new MutationObserver(() => {
      if (safeInitialize()) {
        bootObserver.disconnect();
        window.clearInterval(bootInterval);
      }
    });
    bootObserver.observe(document.documentElement, { childList: true, subtree: true });
    bootInterval = window.setInterval(() => {
      if (safeInitialize()) {
        bootObserver.disconnect();
        window.clearInterval(bootInterval);
      }
    }, 1000);
    window.setTimeout(() => {
      if (!state.root) bootObserver.disconnect();
    }, SHELL_BOOT_TIMEOUT_MS);
  }

  startWhenCodexShellReady();
})();
