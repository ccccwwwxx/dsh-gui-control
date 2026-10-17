// dsh-gui-control —— 文案与默认定义的唯一维护文件。
//
// node 半侧（lib/index.js）与客户端构建（src/build-client.mjs）都从这里取文案：
// 客户端构建会把 zh / en 原样注入 lib/client.js，因此改文案只改这一个文件，
// 然后 `npm run build` 重新生成 lib/client.js。
//
// 键集合必须 zh / en 完全一致（scripts/verify.mjs 会校验）。

export const zh = {
  nav: '界面控制',
  title: '界面控制（强刷 / 重启）',
  subtitle: '改了客户端插件看不到效果 → 先强刷；改了 Host 侧代码或换了插件版本 → 重启。',

  // 侧边栏底部入口
  footerRefresh: '强刷',
  footerRestart: '重启',
  footerRefreshHint: '强刷界面：清空浏览器缓存后整页重载，重新拉取所有客户端插件。',
  footerRestartHint: '重启 Harness：Host 进程重启并重新加载界面；正在运行的任务会被中断。',

  // 会话头右上角的图标按钮
  headerRefreshAria: '强刷界面',
  headerRestartAria: '重启 Harness',
  headerConfirmHint: '再点一次确认重启（{seconds} 秒后取消）',

  // 通用动作状态
  refreshDoing: '强刷中…',
  refreshDone: '已清缓存，正在重载…',
  restartConfirmLabel: '确认重启？',
  confirmHint: '再次点击确认；{seconds} 秒后自动取消',
  restartDoing: '重启中…',
  restartDesktopOnly: '重启只在 DSH Desktop 桌面端可用；浏览器版请用「强刷」。',
  restartManualHint: '若界面没有自动刷新，请点「强刷」。',
  restartFailed: '重启失败：{detail}',
  refreshHint: '强刷不影响 Host 进程，只重载这一页。',

  // 设置页
  statusTitle: '当前运行状态',
  statusLoading: '读取中…',
  statusFailed: '状态读取失败：{detail}',
  statusVersion: '插件版本',
  statusHostPid: 'Host 进程',
  statusUptime: 'Host 已运行',
  statusPlatform: '运行平台',
  statusProfile: 'Profile',
  statusDesktop: '界面载体',
  desktopYes: 'DSH Desktop',
  desktopNo: '浏览器 / 非桌面端',
  retry: '重试',

  // 说明
  explainTitle: '这两个动作分别解决什么',
  explainRefresh: '强刷 = 清空页面缓存并整页重载。适用于：客户端插件改完没生效、界面卡在旧的插件列表、样式错乱。它不会重启 Host，正在运行的任务不受影响。',
  explainRestart: '重启 = 让 DSH Desktop 重启 Host 进程，然后重新加载这一页。适用于：Host 侧（node 半侧）代码改动、插件安装/升级后需要重新加载。正在运行的任务会被中断。',
}

export const en = {
  nav: 'GUI Control',
  title: 'GUI Control (Hard Refresh / Restart)',
  subtitle: 'Client plugin change not showing up → hard refresh. Host-side code or plugin version changed → restart.',

  footerRefresh: 'Refresh',
  footerRestart: 'Restart',
  footerRefreshHint: 'Hard refresh: clear browser caches, then reload the page and re-fetch every client plugin bundle.',
  footerRestartHint: 'Restart Harness: restart the Host process and reload this page. Running tasks will be interrupted.',

  headerRefreshAria: 'Hard refresh',
  headerRestartAria: 'Restart Harness',
  headerConfirmHint: 'Click again to confirm restart (cancels in {seconds}s)',

  refreshDoing: 'Refreshing…',
  refreshDone: 'Caches cleared, reloading…',
  restartConfirmLabel: 'Confirm restart?',
  confirmHint: 'Click again to confirm; cancels in {seconds}s',
  restartDoing: 'Restarting…',
  restartDesktopOnly: 'Restart is only available inside DSH Desktop; in a browser use "Refresh".',
  restartManualHint: 'If the page did not reload itself, click "Refresh".',
  restartFailed: 'Restart failed: {detail}',
  refreshHint: 'A hard refresh does not touch the Host process; it only reloads this page.',

  statusTitle: 'Runtime status',
  statusLoading: 'Loading…',
  statusFailed: 'Could not read status: {detail}',
  statusVersion: 'Plugin version',
  statusHostPid: 'Host process',
  statusUptime: 'Host uptime',
  statusPlatform: 'Platform',
  statusProfile: 'Profile',
  statusDesktop: 'Surface',
  desktopYes: 'DSH Desktop',
  desktopNo: 'Browser / non-desktop',
  retry: 'Retry',

  explainTitle: 'What each action is for',
  explainRefresh: 'Hard refresh clears page caches and reloads everything. Use it when a client plugin change is not visible, the plugin list looks stale, or styles broke. It does not restart the Host, so running tasks are unaffected.',
  explainRestart: 'Restart asks DSH Desktop to restart the Host process, then reloads this page. Use it after Host-side (node half) code changes or plugin installs/upgrades. Running tasks are interrupted.',
}
