// 插件入口：注册文案、侧边栏两个入口、设置页区块。
//
// 槽位选择（都在 dsh-client-ui-layout / settings 已声明的公共槽上，不改动宿主 UI）：
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
}

exports.apply = apply
exports.inject = inject
