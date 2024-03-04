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

## 2 Reconciler

### 2.1 Reconciler 的工作方式

对于同一个节点，比较其 `ReactElement` 和 `fiberNode` ，生成子 fiberNode ，并根据比较结果生成不同的标记（插入、删除、移动......），
不同的标记又对应不同宿主环境（浏览器环境） API 的执行

![Reconciler工作方式](./imgs/reconciler/reconciler-1.png 'Reconciler工作方式')

挂载 `<div></div>` ：

1. jsx 经过编译时的 babel 和运行时的 jsx方法转译成 `type` 为 `div` 的 `React Element`
2. 当前的 `React Element` 会跟对应的 `fiberNode` 比较，但是当前对应 `fiberNode` 为 `null`
3. 比较的结果会生成一个子 `fiberNode` ，同时也会生成 `Placement` 标记
4. `Placement` 对应插入操作，所以宿主环境 API 就会插入一个 `div` 元素到 `DOM` 中

将 `<div></div>` 更新为 `<p></p>` ：

1. jsx 经过 babel 和 jsx 方法转译成 `type` 为 `p` 的 `React Element`
2. 当前的 `React Element` 会跟对应的 `fiberNode {type:'div'}` 比较
3. 比较的结果会生成一个子 `fiberNode` ，同时会生成 `Deletion` 和 `Placement` 标记
4. 宿主环境 API 就会先执行删除操作，将 `div` 元素删除，然后再执行插入操作，将 `p` 元素插入到 `DOM` 中

当所有 React Element 比较完之后，会生成一个 fiberNode 树，一共会存在两个 fiberNode 树：

- current ：与视图中真实 UI 对应的 fiberNode 树
- workInProgress ：触发更新之后，在 reconciler 中计算的 fiberNode 树

在 React 更新的过程中，current 树 和 WIP 树通过交替使用来实现更新。
当 React 开始处理更新时，在 WIP 树进行更新和变更的计算，确定该次更新的 WIP树的结构之后，WIP 树会与 current 树进行比较，最终确定需要更新的部分，调用宿主环境 API 将需要更新的部分更新到 DOM 中。

更新完成之后，WIP 树由于拥有最新的虚拟 DOM 结构，WIP 树会成为新的 current 树，而之前的 current 树则会成为下一次更新的 WIP 树。

这种来回更新的技术就是双缓存技术

### 2.2 JSX 消费的顺序

JSX 消费的顺序，就是以 DFS 顺序遍历 JSX。

```jsx
<Card>
	<h1>hello</h1>
	<p>react-demo</p>
</Card>
```

上述 `Card` 组件的消费顺序：
![JSX 消费顺序](./imgs/reconciler/reconciler-2.png 'JSX 消费顺序')

### 2.3 如何触发更新

常见触发更新的方式：

- ReactDOM.createRoot().render() 、 老版本的 ReactDOM.render
- this.setState
- useState 的 dispatch 方法

希望通过一套统一的更新机制，兼容上述所有触发更新的方法，同时方便后续扩展 `优先级机制`

### 2.4 更新机制的组成

- 代表更新的数据结构 -- Update
- 消费 update 的数据结构 -- UpdateQueue

![更新机制](./imgs/reconciler/reconciler-3.png '更新机制')

实现的关键点：

- 更新可以发生于任何组件，但是更新的流程是从根节点递归的
- 需要一个统一的根节点保存通用信息

### 2.5 mount 流程

mount 流程的目的：

- 生成 WIP FiberNode 树
- 为树当中的 FiberNode 标记副作用 flags

mount 流程的步骤：

- 递： beginWork
- 归： completeWork

#### 2.5.1 beginWork 流程

对如下结构的 reactElement

```HTML
<A>
  <B />
</A>
```

当进入 A 的 beginWork 时，通过对比 B current fiberNode 与 B reactElement，生成 B 对应的 WIP FiberNode

在此过程中，最多会标记 2 类与 `结构变化` 相关的 flags：

- Placement

  插入：a -> ab

  移动：abc -> cba

- ChildDeletion

  子节点删除：ul > li _ 3 -> ul > li _ 2

不包含 `属性变化` 相关的 flags：

- Update

  `<div class='a'></div>` -> `<div class='b'></div>`

HostRoot 的 beginWork 的工作流程：

1. 计算状态的最新值
2. 构造子 fiberNode

HostComponent 的 beginWork 的工作流程：

1. 构造子 fiberNode

由于 HostText 没有子节点，所以 HostText 没有 beginWork 的工作流程

#### 2.5.2 beginWork 性能优化策略

考虑如下结构的 reactElement

```HTML
<div>
  <p>hello</p>
  <span>world</span>
</div>
```

理论上，上述 reactElement 在 mount 流程结束之后，应该包含如下 flags：

- world - Placement
- span 标签 - Placement
- hello - Placement
- p 标签 - Placement
- div 标签 - Placement

### 2.6 completeWork

流程：

1. 创建或标记元素更新
2. flags 冒泡

#### 2.6.1 flags 冒泡

complete 属于递归中的归阶段，从叶子元素开始，自下而上。通过 fiberNode.subtreeFlags 来记录该 fiberNode 的所有子孙 fiberNode 上被标记的 flags，在 Render 阶段中就可以通过 subtreeFlags 快速确定该 fiberNode 所在子树是否存在副作用需要执行

### 2.7 commit 阶段

3 个子阶段

#### 2.7.1 beforeMutation 阶段

#### 2.7.2 mutation 阶段

在 mutation 阶段，根据 fiberNode.subtreeFlags 是否包含 MutationMask 中的 Flags 以及 fiberNode 是否存在子节点来决定是否向下遍历。
如果 subtreeFlags 中有 MutationMask 包含的 Flags，则执行对应操作。

- Placement：

要插入节点，需要先根据当前 fiberNode 的父级 DOM 元素，递归地将子节点插入到对应的 DOM 中。

#### 2.7.3 layout 阶段

### 2.8 Function Component

### 2.9 Hook

#### 2.9.1 数据共享层

为了能让 hook 拥有感知上下文的能力，React 在不同的上下文中调用的 hook 不是同一个函数。

如下图所示，在不同生命周期或 hook 上下文中都有一个属于它本身的 hooks 集合，这些集合共同存放于 React 内部的数据共享层，然后再由 React 统一向外抛出。

同时，为了让 hook 能感知上下文，需要在 reconciler 中实现 hook，然后在 React 中导出，即从 reconciler package 跨越到 react package 中。

所以需要通过一个内部的数据共享层以 hook 集合的形式来管理 hook，当不同的阶段调用 hook，对应阶段的 hook 集合就会指向内部数据共享层，React 调用的并不是 hook 的实现，而是当前阶段的 hook 集合

![](./imgs/hook/hook-1.png)

**注意：**

**增加内部数据共享层，意味着 reconciler 和 React 产生关联**

如果两个包产生关联，需要考虑，两者的代码是打包在一起还是分开？

如果打包在一起，在打包之后的 ReactDOM 中会包含 React 的代码，那么 ReactDOM 中也会包含一个内部数据共享层，React 中也会包含一个内部数据共享层，两者并不是同一个数据共享层。

所以希望两者分开打包。

#### 2.9.2 Hook 数据结构

fiberNode 中可用的字段

- memoizedState
- updateQueue

![](./imgs/hook/hook-2.png)

对于 FC 对应的 fiberNode，有两层数据

- fiberNode.memoizedState 对应 hooks 链表
- 链表中每个 hook 对应自身的数据

#### 2.9.3 实现 useState

包括两个任务

- 实现 mount 时的 useState
- 实现 dispatch 方法，并且接入现有流程中

### 2.10 update

update 流程与 mount 流程的区别

对于 beginWork：

- 需要处理 ChildDeletion 的情况
- 需要处理节点移动的情况 (abc -> bca)

对于 completeWork：

- 需要处理 HostText 内容更新的情况
- 需要处理 HostComponent 属性变化的情况

对于 commitWork：

- 需要处理 ChildDeletion ，遍历被删除的子树

对于 useState：

- 实现相对于 mountState 的 updateState

#### 2.10.1 beginWork

**单节点处理**

单节点处理需要处理的情况：

- singleElement
- singleTextNode

处理思路：

1. 比较是否可以复用 current fiber
   1. 比较 key，如果 key 不同，不能复用
   2. 比较 type，如果 type 不同，不能复用
   3. key 、 type 都相同，可复用
2. 不能复用，需要重新构建一个新的 fiber，可复用则复用

**注意：**
**对于 wip 、 current 这两个 fiberNode ，即使反复更新，这会复用这两个 fiberNode**

### 2.10.2 commit 阶段

对于标记 ChildDeletion 的子树，由于子树中：

- 对于 FC ，需要处理 useEffect unMount，解绑 ref
- 对于 HostComponent，需要解绑 ref
- 对于子树的 `根 HostComponent`，需要移除 DOM

所以，需要实现遍历 ChildDeletion 子树的流程

# 3 事件系统

事件系统来源于浏览器事件模型，隶属于 React DOM，在实现过程中，要做到对 Reconciler 0 侵入

实现事件系统需要考虑：

- 模拟实现浏览器事件捕获，冒泡流程
- 实现合成事件对象
- 方便后续扩展

## 3.1 实现 ReactDOM 与 Reconciler 对接

将事件回调保存在 DOM 的 props 中，在 props 出现变化的时候，重新保存（对接）

- 创建 DOM
  completeWork 中会针对当前 fiber node 的类型为其创建实例，可以在构建实例的过程中将事件回调保存到对应的 props 中
- 更新属性时

**注意：为什么下述代码在收集路径的过程中，对应 capture 和 bubble 使用两种不同的数组新增元素的方式**

```javascript
function collectPaths(
	targetElement: DOMElement,
	container: Container,
	eventType: string
) {
	const paths: Paths = {
		capture: [],
		bubble: []
	};

	while (targetElement !== null && targetElement !== container) {
		// 收集
		const elementProps = targetElement[elementPropsKey];
		if (elementProps) {
			//  click -> onClick / onClickCapture
			const callbackNameList = getEventCallbackNameFromEventType(eventType);

			if (callbackNameList) {
				callbackNameList.forEach((callbackName, i) => {
					const eventCallback = elementProps[callbackName];
					if (eventCallback) {
						if (i === 0) {
							paths.capture.unshift(eventCallback);
						} else {
							paths.bubble.push(eventCallback);
						}
					}
				});
			}
		}
		targetElement = targetElement.parentNode as DOMElement;
	}

	return paths;
}
```

举例说明，有以下这样的结构 DOMElement

```jsx
<div onClickCapture="xxx" onClick="xxx">
	<div onClickCapture="xxx" onClick="xxx">
		<p onClick="xxx"></p>
	</div>
</div>
```

收集路径的过程中，会先在 p 中开始收集，然后向外冒泡，所以 capture 和 bubble 的变化应该这样的

```
capture []
bubble [p onClick]
```

```
capture [div onClickCapture]
bubble [p onClick, div onClick]
```

```
capture [container onClickCapture, div onClickCapture]
bubble [p onClick, div onClick, container onClick]
```

使用 unshift 插入的 capture，能保证在遍历时的 DOMElement 是从上到下，这与捕获的思想是一致的。反之，使用 push 插入的 bubble 也是如此。

# 4 diff 算法的实现

## 4.1 单节点 diff

## 4.2 多节点 diff

### 4.2.1 改造 reconcileSingleElement

示例说明：
以下用到的 A1，A 代表 type，1 代表 key

单节点 diff 所支持的情况

- A1 -> B1
- A1 -> A2

需要扩展的情况

- ABC -> A

可以区分出以下几种更加细致的情况：

- key 相同，type 相同 == 可以复用当前节点
- key 相同，type 不同 == 不能复用当前节点，销毁当前节点并创建一个新节点替换旧节点
- key 不相同 == 当前节点不能复用，但是其他兄弟节点或许能复用，所以需要遍历其他兄弟节点

### 4.2.2 支持多节点

多节点需要支持的情况包括

- 插入 Placement
- 删除 ChildDeletion
- 移动 Placement

整体流程可以分为 4 步：

1. 将 current 中所有同级 fiber 保存在 Map 中
2. 遍历 newChild 数组，对于每个遍历到的 Element，存在两种情况
   1. Map 中存在对应 current fiber，且可以复用
   2. Map 中不存在对应 current fiber，或不能复用
3. 判断是插入还是移动
4. Map 中剩下的都标记为删除

#### 关于是否可复用的讨论

首先，根据 key 从 Map 中获取 current fiber，如果不存在 current fiber，则不存在复用的可能

接下来，分情况讨论：

- element 属于 HostText，那 current fiber 是否属于 HostText ?
- element 属于其他 ReactElement，那 current fiber 是否属于其他 ReactElement ?
- (TODO) element 属于数组或 Fragment， current fiber 是否属于这两种情况呢 ？

#### 关于插入 / 移动的讨论

移动---具体是指向右移动

移动的判断依据：element 的 index 与 element 对应的 current fiber 的 index 的比较

以下例子中，箭头左边表示 update 前，右边表示 update 后

```
A1 B2 C3 -> B2 C3 A1
0  1  2     0  1  2
```

更新后 element A1 的 index 与 current fiber A1 的 index 比较，index 从 0 变成 2，所以 A1 是往右移动的

遍历 element 时，当前遍历到的 element 一定是所有已遍历到的 element 中最靠右的那个

所以，只需要记录最后一个可复用 fiber 在 current 中的 index (lastPlacedIndex)，在接下来的遍历中：

- 如果遍历到可复用 fiber 的 index < lastPlacedIndex，则标记 Placement
- 否则，不标记

由于 Placement 同时对应了移动和插入两种操作

对于插入操作，实现的 DOM 方法是 parentNode.appendChild

对于移动操作，实现的 DOM 方法是 parentNode.insertBefore

执行插入操作之前，需要找到目标节点的父节点，同样的，在执行移动操作之前，也需要先找到**目标兄弟 Host 节点**

要找到兄弟节点，需要考虑两个因素

- 可能并不是目标 fiber 的直接兄弟节点

```jsx
// 情况 1
<A/><B/>
function B(){
	return <div />
}

// 情况 2
<App/><div/>
function App(){
	return <A/>
}
```

对于情况 1，A 的兄弟 Host 节点其实是 B 返回的 div，还有可能会有 B 返回 C， C 返回 D ，不断嵌套的过程，所以要在找到 sibling 之后，不断向下遍历，直到找到一个 Host 节点

对于情况 2，A 的兄弟 Host 节点是父组件的兄弟节点，所以需要向上遍历，找到父节点的兄弟 Host 节点

- 不稳定的 Host 节点，不能作为目标兄弟 Host 节点

如果找到的 Host 节点，本身就被标记为 Placement，就说明该节点是不稳定的 Host 节点

## 4.3 Fragment

为了提高组件结构灵活性，需要实现 Fragment，具体来说，需要区分几种情况

### 4.3.1 Fragment 包裹其他组件

```jsx
<>
	<div></div>
	<div></div>
</>

// 对应 DOM
<div></div>
<div></div>

```

JSX 转换结果：

```js
jsxs(Fragment, {
	children: [
		jsx("div", {})
		jsx("div", {})
	]
})
```

type 为 Fragment 的 ReactElement，对单一节点的 Diff 需要考虑 Fragment 的情况

### 4.3.2 Fragment 与其他组件同级

```jsx
<ul>
	<>
		<li></li>
		<li></li>
	</>
	<li></li>
	<li></li>
</ul>

// 对应 DOM
<ul>
	<li></li>
	<li></li>
	<li></li>
	<li></li>
</ul>
```

JSX 转换结果：

```js
jsxs('ul', {
	children: [
		jsxs(Fragment, {
			children: [
				jsx('li'),
				jsx('li')
			]
		}),
   	jsx('li')
   	jsx('li')
	]
});
```

children 是数组类型，则进入 reconcileChildrenArray 方法，存在数组中的某一项为 Fragment 的情况，所以需要增加对 type 为 Fragment 的 ReactElement 的判断，
同时 beginWork 中需要增加 Fragment 类型的判断。

### 4.3.3 数组形式的 Fragment

```jsx
// arr = [<li></li>, <li></li>]

<ul>
	<li></li>
	<li></li>
	{arr}
</ul>

// 对应 DOM
<ul>
	<li></li>
	<li></li>
	<li></li>
	<li></li>
</ul>
```

JSX 转换结果：

```js
jsxs('ul', children: [
	jsx('li'),
	jsx('li'),
	arr
])
```

children 为数组类型，所以进入 reconcileChildrenArray 方法，由于其中某一项为数组，所以需要增加 reconcileChildrenArray 中对于数组类型的判断

### 4.3.4 Fragment 对 ChildDeletion 的影响

ChildDeletion 删除 DOM 的逻辑：

- 找到子树的根 Host 节点
- 找到子树对应的父级 Host 节点
- 从父级 Host 节点中删除子树根 Host 节点

考虑删除 p 节点的情况：

```jsx
<div>
	<p>111</p>
</div>
```

考虑删除 Fragment 后， Fragment 中包含多个子树，即子树的根 Host 节点可能存在多个：

```jsx
<div>
	<>
		<p>111</p>
		<p>111</p>
	</>
</div>
```

# 5 schedule

## 5.1 实现同步调度流程

如下代码到底是同步还是异步

```jsx
class App extends React.Component() {
	onClick() {
		this.setState({ a: 1 });
		console.log(this.state.a);
	}

	// 省略代码
}
```

当前实现：

- 从出发更新到 render，再到 commit 都是同步的
- 多次触发更新会重复多次更新流程

可以改进的点：多次触发更新，只进行一次更新

`Batch Updates` （批处理），多次触发更新，只进行一次更新流程，理念有点像防抖、节流

但是需要考虑，合并批处理的时机，是宏任务还是微任务

在 React 中批处理的时机既有宏任务也有微任务

# 6 useEffect

实现 useEffect 需要考虑两个问题

- effect 数据结构
- effect 的工作流程如何接入现有流程

## 6.1 effect 数据结构

什么是 effect

```jsx
function App() {
	useEffect(() => {
		return () => {};
	}, [xxx, xxx]);

	useLayoutEffect(() => {});
	useEffect(() => {});
}
```

数据结构需要考虑：

**1. 不同的 effect 可以共用同一个机制**

- useEffect
  - 触发时机：在依赖变化以后的当前 commit 阶段完成以后，异步执行
- useLayoutEffect
  - 触发时机：在依赖变化后的当前 commit 阶段完成以后，同步执行
- useInsertionEffect
  - 触发时机：在依赖变化后的当前 commit 阶段完成以后，同步执行

useLayoutEffect 和 useInsertionEffect 的区别：

- 在执行 useInsertionEffect 的时候，还不能获取到 DOM 的引用，useInsertionEffect 主要是给 css in js 的库使用的，日常用不上

**2. 需要能保存依赖**

**3. 需要能保存 create 回调**

**4. 需要能保存 destroy 回调**

**5. 需要能区分是否需要触发 create 回调**

- mount 时
- 依赖变化时

新增 3 个 flag:

- 对于 fiber，新增 PassiveEffect，代表当前 fiber 本次更新存在副作用
- 对于 effect hook
  - Passive 代表 useEffect 对应 effect
  - HookHasEffect 代表当前 effect 本次更新存在副作用
