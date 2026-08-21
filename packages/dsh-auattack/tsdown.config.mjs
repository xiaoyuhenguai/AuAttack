/**
 * dsh-auattack client bundle 构建配置。
 *
 * 产出 DSH web 前端加载的 `lib/client.js`：
 * `window.__ModuleLoader__.load({ id: "dsh-auattack", factory: (require) => {...} })`。
 * 纯事件桥实现：无 react / react-dom / cordis 依赖，全部内联。
 *
 * 注意：纯对象导出（不 import tsdown），使构建可直接用任意安装位置的
 * tsdown CLI 执行，无需本包自带 node_modules。
 */
export default {
  name: 'dsh-auattack/client',
  entry: { client: 'src/client/index.tsx' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  sourcemap: true,
  clean: false,
  // 无平台模块依赖，全部内联。
  external: [],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: "dsh-auattack", factory: (require) => {',
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}
