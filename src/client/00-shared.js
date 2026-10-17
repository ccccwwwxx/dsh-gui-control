// 共享层：命名空间、注入面、RPC 封装，以及「强刷」「重启」两个真实动作。
//
// 为什么这两个动作要单独做成插件：
//   · 客户端插件（lib/client.js）只有整页重载才会重新拉取并重新执行 factory，
//     改了客户端代码后界面上没有任何「重新加载」的入口，只能去菜单里找；
//   · Host 侧（node 半侧）代码或插件安装变更，只有重启 Host 进程才生效，而重启
//     由 DSH Desktop 的 preload 桥提供（window.dshDesktop.restartHarness →
//     主进程 IPC harness:restart），普通浏览器里没有这条路。
// 所以两个动作分两处实现，并按「界面载体」区分可用性。

const NS = 'guiControl'

// 客户端服务依赖：slots 注册入口、connection 发 RPC、locale 取文案。
const inject = ['slots', 'connection', 'locale']

// 与 node 半侧约定的方法前缀（lib/index.js RPC_PREFIX）。
const RPC_PREFIX = 'dsh-gui-control.'

const STYLE_ID = 'dsh-gui-control-style'

// 统一解包 { ok, value } 信封；失败时抛出服务端消息。connection 缺失也不崩，
// 只是把这个方法变成一次可见的失败（设置页会显示「状态读取失败」）。
function rpc(connection) {
  const call = async (method, payload) => {
    if (!connection || typeof connection.rpc?.call !== 'function') {
      throw new Error('connection service unavailable')
    }
    const res = await connection.rpc.call('/api', method, payload)
    if (res && res.ok === true) return res.value
    const msg = res?.error?.message ?? res?.error ?? 'RPC failed'
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }
  return {
    state: () => call(RPC_PREFIX + 'state', {}),
  }
}

// 文案取值兜底：t 缺失或抛错时退回 key，绝不因文案问题中断渲染。
function t0(props, key, params) {
  try {
    const value = props && typeof props.t === 'function' ? props.t(key, params) : key
    return typeof value === 'string' && value !== '' ? value : key
  } catch {
    return key
  }
}

function errorText(error) {
  if (error === null || error === undefined) return ''
  if (typeof error === 'string') return error
  if (typeof error.message === 'string' && error.message !== '') return error.message
  return String(error)
}

// 运行时长：跨天后给 d h m，其余 m s。刻意用 ASCII 单位，两种语言都读得懂。
function formatUptime(ms) {
  const total = Math.max(0, Math.floor(Number(ms) || 0) / 1000)
  const seconds = Math.floor(total % 60)
  const minutes = Math.floor(total / 60) % 60
  const hours = Math.floor(total / 3600) % 24
  const days = Math.floor(total / 86400)
  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

// DSH Desktop 的 preload 桥：只有桌面窗口里有；浏览器里是 undefined。
// 每次调用都重新读，不缓存——测试与热替换下都不会拿到过期引用。
function desktopBridge() {
  try {
    const bridge = globalThis.dshDesktop
    return bridge && typeof bridge.restartHarness === 'function' ? bridge : null
  } catch {
    return null
  }
}

// 强刷：清 CacheStorage / 注销 Service Worker，然后整页重载。
//
// 能做什么、不能做什么要讲清楚：页面脚本无法改变文档自身的 cache 模式，所以这不是
// Ctrl+F5 的严格等价物；但本 GUI 会「陈旧」的三个来源都被覆盖了——
//   1) CacheStorage 里的缓存条目；
//   2) 残留的 Service Worker；
//   3) 模块 factory 的进程内记忆（整页重载即清空）。
// 插件 bundle 的 URL 自带 rev=，Host 侧按 revision 缓存字节，所以重载后拿到的是最新产物。
async function hardReload() {
  const steps = { caches: 0, serviceWorkers: 0, reloaded: false }
  try {
    if (globalThis.caches && typeof globalThis.caches.keys === 'function') {
      const keys = await globalThis.caches.keys()
      await Promise.all(keys.map((key) => globalThis.caches.delete(key)))
      steps.caches = keys.length
    }
  } catch {
    // 缓存 API 不可用/被禁用：继续重载，不影响主目的。
  }
  try {
    const sw = globalThis.navigator && globalThis.navigator.serviceWorker
    if (sw && typeof sw.getRegistrations === 'function') {
      const regs = await sw.getRegistrations()
      await Promise.all(regs.map((reg) => reg.unregister()))
      steps.serviceWorkers = regs.length
    }
  } catch {
    // 同上。
  }
  try {
    if (globalThis.location && typeof globalThis.location.reload === 'function') {
      globalThis.location.reload()
      steps.reloaded = true
    }
  } catch {
    // 重载失败时不抛：调用方会把错误显示出来。
  }
  return steps
}

// 重启 Harness：走桌面壳的 preload 桥。调用成功后 Host 会重启并重新加载页面，
// 因此这里通常不会走到「之后」的代码；失败（桥拒绝/未就绪）会把错误抛给调用方。
async function restartHarness() {
  const bridge = desktopBridge()
  if (!bridge) {
    const error = new Error('desktop-only')
    error.code = 'desktop-only'
    throw error
  }
  return bridge.restartHarness()
}

// ---------- 样式 ----------
// 只注入一份（按 id 复用），随插件卸载移除。类名用 dsh-gui- 前缀，不依赖构建哈希。
const CSS = [
  '.dsh-gui-entry{display:flex;align-items:center;gap:8px;box-sizing:border-box;width:100%;margin:2px 0;padding:6px 8px;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,inherit);font:inherit;font-size:13px;line-height:18px;text-align:left;cursor:pointer}',
  '.dsh-gui-entry:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14))}',
  '.dsh-gui-entry:disabled{opacity:.55;cursor:default}',
  '.dsh-gui-entry[data-tone="danger"]{color:var(--dsw-alias-state-error-primary,#e5484d)}',
  '.dsh-gui-entry[data-tone="danger"]:hover:not(:disabled){background:rgba(229,72,77,.12)}',
  '.dsh-gui-entry[data-armed="true"]{border-color:currentColor}',
  '.dsh-gui-entry-rail{width:32px;height:32px;margin:0 auto;padding:0;justify-content:center;gap:0}',
  '.dsh-gui-icon{display:inline-flex;flex:none;align-items:center;justify-content:center;width:16px;height:16px}',
  '.dsh-gui-entry-label{flex:1 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.dsh-gui-section{box-sizing:border-box;max-width:720px;min-width:0;display:flex;flex-direction:column;gap:14px;color:var(--dsw-alias-label-primary,inherit)}',
  '.dsh-gui-title{margin:0;font-size:15px;line-height:22px;font-weight:600}',
  '.dsh-gui-subtitle{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#888)}',
  '.dsh-gui-card{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1,#e3e3e3);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px;min-width:0}',
  '.dsh-gui-row{display:flex;align-items:baseline;gap:8px;font-size:12px;line-height:18px;min-width:0}',
  '.dsh-gui-row-key{flex:none;width:96px;color:var(--dsw-alias-label-tertiary,#888)}',
  '.dsh-gui-row-value{flex:1 1 auto;min-width:0;overflow-wrap:anywhere;color:var(--dsw-alias-label-secondary,inherit)}',
  '.dsh-gui-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px}',
  '.dsh-gui-btn{box-sizing:border-box;height:32px;padding:0 14px;border:1px solid var(--dsw-alias-border-l3,rgba(127,127,127,.45));border-radius:16px;background:transparent;color:var(--dsw-alias-label-primary,inherit);font:inherit;font-size:13px;cursor:pointer}',
  '.dsh-gui-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14))}',
  '.dsh-gui-btn:disabled{opacity:.5;cursor:default}',
  '.dsh-gui-btn[data-tone="primary"]{border-color:transparent;background:var(--dsw-alias-button-primary-fill,#4d6bfe);color:var(--dsw-alias-label-primary-foreground,#fff)}',
  '.dsh-gui-btn[data-tone="danger"]{border-color:var(--dsw-alias-state-error-primary,#e5484d);color:var(--dsw-alias-state-error-primary,#e5484d)}',
  '.dsh-gui-note{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#888);margin:0}',
  '.dsh-gui-error{font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary,#e5484d);margin:0;overflow-wrap:anywhere}',
  '.dsh-gui-explain{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,inherit)}',
  // ---- 会话头右上角（15-header.js）----
  // 24px 图标按钮，几何对齐同排官方按钮：height 24、radius sm、hover 用 interactive-bg-hover。
  '.dsh-gui-icon-slot{position:relative;flex:none;display:inline-flex;align-items:center}',
  '.dsh-gui-icon-btn{box-sizing:border-box;flex:none;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary,inherit);cursor:pointer}',
  '.dsh-gui-icon-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));color:var(--dsw-alias-label-primary,inherit)}',
  '.dsh-gui-icon-btn:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4c8dff);outline-offset:1px}',
  '.dsh-gui-icon-btn:disabled{opacity:.45;cursor:default}',
  '.dsh-gui-icon-btn[data-tone="danger"]{color:var(--dsw-alias-state-error-primary,#e5484d)}',
  '.dsh-gui-icon-btn[data-armed="true"]{box-shadow:inset 0 0 0 1px currentColor;background:rgba(229,72,77,.12)}',
  // "隔开一点点"：这一对按钮中最右的那个与同排三个官方按钮之间多留 8px（容器本身 gap 8px）。
  '.dsh-gui-icon-btn.dsh-gui-gap-after{margin-right:8px}',
  '@keyframes dsh-gui-spin{to{transform:rotate(360deg)}}',
  '.dsh-gui-icon-btn[data-spin="true"] svg{animation:dsh-gui-spin .9s linear infinite}',
  '@media (prefers-reduced-motion:reduce){.dsh-gui-icon-btn[data-spin="true"] svg{animation:none}}',
  // 武装 / 失败提示：绝对定位在按钮下方，不占布局、不推动这一排。
  '.dsh-gui-header-hint{position:absolute;top:calc(100% + 6px);right:0;z-index:20;pointer-events:none;white-space:nowrap;font-size:11px;line-height:16px;padding:3px 8px;border-radius:8px;border:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.45));background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,inherit);box-shadow:0 6px 18px rgba(0,0,0,.14)}',
  '.dsh-gui-header-hint[data-tone="danger"]{border-color:var(--dsw-alias-state-error-primary,#e5484d);color:var(--dsw-alias-state-error-primary,#e5484d)}',
].join('\n')

// 注入样式；ctx.effect 负责卸载时移除。document 不存在（SSR / 测试环境）时静默跳过。
function installStyles(ctx) {
  try {
    const doc = typeof document === 'undefined' ? null : document
    if (!doc || !doc.head) return
    ctx.effect(() => {
      let el = doc.getElementById(STYLE_ID)
      if (!el) {
        el = doc.createElement('style')
        el.id = STYLE_ID
        el.textContent = CSS
        doc.head.appendChild(el)
      }
      const owned = el
      return () => {
        if (owned && owned.isConnected !== false) owned.remove()
      }
    }, 'dsh-gui-control: styles')
  } catch (error) {
    console.error('[dsh-gui-control] style injection failed', error)
  }
}
