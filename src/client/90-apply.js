// 插件入口：注册文案、会话头两个图标按钮、侧边栏两个入口、设置页区块。
//
// 槽位选择（都在 dsh-client-ui-layout / ui-conversation / settings 已声明的公共槽上，
// 不改动宿主 UI）：
//   · conversation.session.header.utilities ×2 —— 会话头右上角的刷新 / 重启图标按钮，
//     排在官方那三个按钮左侧；
//   · sidebar.footer.action ×2 —— 强刷 / 重启的一键入口，宽窄两种侧边栏都能点到；
//   · settings.section        —— 运行状态 + 动作 + 说明，方便知道「为什么要点它」。

function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-gui-control: copy dictionaries')

  const connection = ctx.get('connection')
  const t = ctx.locale.bind(NS)
  const api = rpc(connection)
  const injected = () => ({ rpc: api, t })

  installStyles(ctx)

  // 侧边栏底部：两个独立注册（list 槽每项需要唯一 id）。order 71/72 排在
  // 其他底部动作之后、系统设置之前的位置感；owner 渲染时注入 { wide }。
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'gui-control-refresh',
    order: 71,
    inject: injected,
  }, RefreshFooterAction))

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'gui-control-restart',
    order: 72,
    inject: injected,
  }, RestartFooterAction))

  // 设置页区块：状态 + 两个动作 + 说明。label 显示在设置导航里。
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'gui-control',
    order: 96,
    label: () => t('nav'),
    inject: injected,
  }, GuiControlSection))

  // 会话头右上角：两个 24px 图标按钮，排在官方那三个按钮（open-in-app / 会话日志「更多」
  // / 右上角展开）的左侧。order 升序 = 从左到右，所以用 -40 / -39；restart 带 8px 右边距，
  // 与那三个按钮之间多留一点空隙。
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'gui-control-header-refresh',
    order: -40,
    inject: injected,
  }, HeaderRefreshAction))

  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'gui-control-header-restart',
    order: -39,
    inject: injected,
  }, HeaderRestartAction))
}

exports.apply = apply
exports.inject = inject
