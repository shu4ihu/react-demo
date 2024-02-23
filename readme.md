## 1 JSX转换

### 1.1 什么是 JSX

JSX 是 JavaScript 的一种语法扩展，允许开发者在 JavaScript 文件中编写类似 HTML 的代码。

### 1.2 什么是 JSX 转换

包括两部分：

- 编译时：由 babel 实现
- 运行时（dev、prod 双环境）：实现 jsx 方法或 React.createElement 方法

运行时主要任务：

- [x] jsx方法
- [x] 实现打包流程
- [x] 实现调试打包结果的环境

### 1.3 实现 JSX 转换

#### 1.3.1 jsx 方法

由于 babel 实现了编译时的 JSX 转换，所以只需要将 babel 的输出，构造成一个 React 元素就可以。

1. `jsx` 函数

- jsx 接收 `type` 、`config` 和 `maybeChildren` 作为参数
- 遍历 `config` 对象的属性，并将其中的 `key` 和 `ref` 属性分别保存起来
- 根据`maybeChildren`的长度将子元素添加到 `props` 的 `children` 中，如果还有其他的属性就在 `props` 中保存起来

2. `jsxDEV` 函数

- 与 `jsx` 函数不同，`jsxDEV` 不接受 `maybeChildren` 作为参数
- 其他与 `jsx` 基本类似

#### 1.3.2 打包流程

主要是 rollup 的配置项和插件的使用

用到的都是比较基础的配置项，像 `input` 、`output` 、`plugins` 这种

同时使用了部分插件：

- rollup-plugin-typescript2
  - 可将 `.ts` `.tsx` 文件转换为 `.js` 文件
- @rollup/plugin-commonjs
  - rollup 官方提供的插件，可将 CommonJS 模块转换成 ES6 模块
- rollup-plugin-generate-package-json
  - 用于在最终输出的 dist 目录下生成 package.json 文件

#### 1.3.3 实现调试打包结果的环境

通过 `pnpm link xxx --global` 将当前的项目链接到全局环境下，使其他项目能共享当前项目
