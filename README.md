# dsh-gui-control

给 DSH 的 Web GUI 加两个控制动作：**强刷界面** 与 **重启 Harness**，三处入口共用同一套实现。

- **会话头右上角**：两个 24px 图标按钮，排在官方那三个按钮（在应用中打开 / 会话日志「更多」/ 右栏展开）
  左侧，中间多留 8px 空隙。图标态没有文字，语义在 `aria-label` / `title` 上；重启武装时图标转红并在
  下方浮出提示气泡（绝对定位，不推动这一排）。
- **侧边栏底部**：两个一键入口（展开态是「图标 + 文字」整行，收起态是 32px 图标按钮）。
- **设置 → 界面控制**：运行状态（插件版本 / Host pid / 已运行时长 / 平台 / Profile）、两个动作和说明。

三处入口调用的是同一对函数（`hardReload()` / `restartHarness()`），不存在第二套实现。

## 两个动作分别解决什么

| | 强刷界面 | 重启 Harness |
|---|---|---|
| 做什么 | 清空 `CacheStorage`、注销 Service Worker，然后整页重载，重新拉取并执行每个客户端插件 bundle | 通过 DSH Desktop 的 preload 桥（`window.dshDesktop.restartHarness` → 主进程 IPC `harness:restart`）重启 Host 进程，然后重新加载页面 |
| 什么时候用 | 改了客户端插件（`lib/client.js`）没生效；界面卡在旧的插件列表；样式错乱 | 改了 Host 侧（node 半侧）代码；安装/升级了插件；需要重新加载 Profile |
| 影响 | 只重载这一页，Host 进程不动 | Host 重启，**正在运行的任务会被中断** |
| 可用范围 | 任意载体（桌面端 / 浏览器） | 仅 DSH Desktop 桌面窗口（浏览器里按钮禁用并说明原因） |

重启是破坏性动作，所以做成**两步确认**：第一次点击只「武装」（设置页/侧边栏里按钮变成「确认重启？」并转红，会话头里图标转红并浮出提示），4 秒内再点一次才真的执行，超时自动取消。不用原生 `confirm()`——它会阻塞渲染进程。

## 为什么强刷不是 Ctrl+F5 的严格等价物

页面脚本无法改变文档自身的 cache 模式，所以浏览器层面的「硬刷新」标志拿不到。但本 GUI 会陈旧的三处来源都被覆盖了：

1. `CacheStorage` 里的缓存条目（逐个删除）；
2. 残留的 Service Worker（逐个 `unregister()`）；
3. 客户端模块 factory 的进程内记忆（整页重载即清空）。

插件 bundle 的 URL 自带 `rev=`，Host 侧按 revision 缓存字节，因此重载后拿到的一定是最新产物——这也意味着通常「重载」就够，清缓存是保险。

## 安装

三种方式效果相同（都会写进 `profiles/<profile>/package.json` 的 `dsh.profile.bundles`）：

### 1. 从 GitHub 仓库装（推荐）

```powershell
dsh plugin --profile web add github:ccccwwwxx/dsh-gui-control
```

`lib/client.js` 已随仓库提交，安装时无需构建。

### 2. 从 Release 预构建包装（免构建、免 `allowBuilds` 授权）

```powershell
dsh plugin --profile web add https://github.com/ccccwwwxx/dsh-gui-control/releases/latest/download/dsh-gui-control.tgz
```

### 3. GUI / 本地目录（开发时用）

**设置 → 插件 → 添加插件**，填本地目录的绝对路径；插件页的安装动作就是 `pluginManager.installBundle`：
先在 `.generations/staging` 里装好、逐层校验，再提升为一代（`dsh-gui-control+<version>+<hash>`）并写进 profile manifest。

卸载：`dsh plugin --profile web remove dsh-gui-control`。

### 安装之后

- **首次安装**：客户端半侧随 HMR 直接生效（会话头右上角与侧边栏底部立刻出现两个入口）；没出现就点一次「强刷」。
- **升级安装**：插件管理器会报告 `application: "restart-required"`——新一代 Host 代码要重启才加载，
  正好用插件的「重启」按钮（或菜单里的 Restart Harness）完成，然后页面会重新加载。

## 开发

```powershell
npm run build     # src/client/*.js -> lib/client.js（注入 lib/text.js 的文案）
npm run verify    # 15 项自验：产物新鲜度、bundle 契约、槽位注册、渲染、三处入口的动作、文案对齐
```

`lib/client.js` 是**构建产物**，不要手改：改 `src/client/*.js` 或 `lib/text.js`，然后 `npm run build`。
`npm run verify` 会把重新构建的结果与已提交的 `lib/client.js` 逐字节比对，忘了 build 会直接失败。

### 目录

```
cordis.patch.yml        Loader 条目（插入 dsh-gui-control）
lib/index.js            node 半侧：只读状态 RPC（版本 / pid / 运行时长）
lib/text.js             zh / en 文案，唯一维护处
lib/client.js           构建产物（window.__ModuleLoader__.load(...) 格式）
src/build-client.mjs    拼接 + 注入文案
src/client/00-shared.js 常量、RPC、强刷/重启动作、样式
src/client/10-footer.js 侧边栏两个入口
src/client/15-header.js 会话头右上角两个图标按钮（两步确认 + 提示气泡）
src/client/20-settings.js 设置页区块
src/client/90-apply.js  注册槽位
scripts/verify.mjs      自验
```

### 槽位契约

| 槽 | 类型 | 注册项 | owner 传入 |
|---|---|---|---|
| `conversation.session.header.utilities` | list / session | `gui-control-header-refresh`(-40)、`gui-control-header-restart`(-39) | — |
| `sidebar.footer.action` | list / root | `gui-control-refresh`(71)、`gui-control-restart`(72) | `{ wide }` |
| `settings.section` | list / root | `gui-control`(96) | — |

会话头的 order 用负数是为了排在官方那三个按钮左侧（`open-in-app` 是 -10，会话日志「更多」默认 0）；
`restart` 带 `margin-right:8px`，在容器自带的 8px gap 之外再多留一点空隙。

样式只用主题变量（`--dsw-alias-*`）并带兜底值，类名固定 `dsh-gui-` 前缀，不依赖构建哈希。

## 已知边界

- **Host 侧没有、也不该有「重启自己」的口子**：那是桌面壳的进程监督职责。浏览器版没有重启能力，按钮会禁用并说明。
- **强刷不等价于浏览器的硬刷新标志**（见上）。
- **状态里的「Host 已运行时长」是模块加载时刻起算**，不是操作系统进程的创建时间；两者在正常启动下几乎相同。
- 重启会中断正在运行的任务与工具调用，这是 Host 重启的固有代价，不是插件的选择。
