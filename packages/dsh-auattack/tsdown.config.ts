/**
 * dsh-auattack client bundle 构建配置。
 *
 * 产出 DSH web 前端加载的 `lib/client.js`：
 * `window.__ModuleLoader__.load({ id: "dsh-auattack", factory: (require) => {...} })`，
 * react / react-dom / @deepseek-ai/cordis 作为平台模块 external（loader 提供），
 * 其余依赖内联。
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
  // 平台模块由 shell 的模块表提供，不得打包。
  external: [
    'react',
    'react/jsx-runtime',
    'react-dom',
    'react-dom/client',
    '@deepseek-ai/cordis',
  ],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: "dsh-auattack", factory: (require) => {',
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}
