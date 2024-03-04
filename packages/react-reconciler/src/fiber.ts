import { Props, Key, Ref, ReactElementType } from 'shared/ReactTypes';
import { FunctionComponent, HostComponent, WorkTag } from './workTag';
import { Flags, NoFlags } from './fiberFlags';
import { Container } from 'hostConfig';
import { Fragment } from './workTag';
import { Lane, Lanes, NoLane, NoLanes } from './fiberLanes';

export class FiberNode {
	// 类型
	type: any;
	// FiberNode 类型标志
	tag: WorkTag;
	// 即将引用于 FiberNode 的属性
	pendingProps: Props;
	// 用于识别 FiberNode 的唯一标识
	key: Key;
	// 宿主 DOM 信息节点
	stateNode: any;
	// 引用
	ref: Ref;

	// 父 FiberNode
	return: FiberNode | null;
	// 兄弟 FiberNode
	sibling: FiberNode | null;
	// 子 FiberNode
	child: FiberNode | null;
	// 当前兄弟中序列号
	index: number;

	// 记录下的节点的状态和属性
	memorizedProps: Props | null;
	memoizedState: any;
	// 当前 FiberNode 的备份，双缓冲技术
	alternate: FiberNode | null;
	// 更新队列
	updateQueue: unknown;
	// 操作标志
	flags: Flags;
	// 子树操作标志
	subtreeFlags: Flags;
	// 待删除节点集合
	deletions: FiberNode[] | null;

	constructor(tag: WorkTag, pendingProps: Props, key: Key) {
		// 实例
		this.tag = tag;
		this.key = key || null;
		// HostComponent <div> div DOM
		this.stateNode = null;
		// FunctionComponent () => {}
		this.type = null;

		// 构造树状结构
		// 指向父 fiberNode
		this.return = null;
		// 指向兄弟 fiberNode
		this.sibling = null;
		// 指向子 fiberNode
		this.child = null;
		// 当前兄弟中序列号
		this.index = 0;

		this.ref = null;

		// 作为工作单元
		this.pendingProps = pendingProps;
		this.memorizedProps = null;
		this.memoizedState = null;
		this.updateQueue = null;

		this.alternate = null;

		// 副作用
		this.flags = NoFlags;
		this.subtreeFlags = NoFlags;
		this.deletions = null;
	}
}

export class FiberRootNode {
	// 目标宿主容器
	container: Container;
	// 当前正在使用的 Fiber 树的根节点
	current: FiberNode;
	// 已完成工作，但是未提交到的 Fiber 树的根节点
	finishedWork: FiberNode | null;
	// 待处理的 Lanes
	pendingLanes: Lanes;
	// 已处理的 Lane
	finishedLane: Lane;

	constructor(container: Container, hostRootFiber: FiberNode) {
		this.container = container;
		this.current = hostRootFiber;
		hostRootFiber.stateNode = this;
		this.finishedWork = null;
		this.pendingLanes = NoLanes;
		this.finishedLane = NoLane;
	}
}

/**
 * @description 构建 WIP 树
 * @param current 当前 FiberNode
 * @param pendingProps 属性
 * @returns
 */
export const createWorkInProgress = (
	current: FiberNode,
	pendingProps: Props
): FiberNode => {
	let wip = current.alternate;

	if (wip === null) {
		// mount
		wip = new FiberNode(current.tag, pendingProps, current.key);
		wip.type = current.type;
		wip.stateNode = current.stateNode;

		wip.alternate = current;
		current.alternate = wip;
	} else {
		// update
		wip.pendingProps = pendingProps;
		wip.flags = NoFlags;
		wip.subtreeFlags = NoFlags;
		wip.deletions = null;
	}

	wip.type = current.type;
	wip.updateQueue = current.updateQueue;
	wip.child = current.child;
	wip.memorizedProps = current.memorizedProps;
	wip.memoizedState = current.memoizedState;

	return wip;
};

/**
 * @description 根据 ReactElement 创建 FiberNode
 * @param element ReactElement
 * @returns FiberNode
 */
export function createFiberFormElement(element: ReactElementType): FiberNode {
	const { type, key, props } = element;
	let fiberTag: WorkTag = FunctionComponent;

	if (typeof type === 'string') {
		// <div></div> type : string
		fiberTag = HostComponent;
	} else if (typeof type !== 'function' && __DEV__) {
		console.warn('未定义的 type 类型', element);
	}

	const fiber = new FiberNode(fiberTag, props, key);
	fiber.type = type;
	return fiber;
}

export function createFiberFormFragment(elements: any[], key: Key): FiberNode {
	const fiber = new FiberNode(Fragment, elements, key);
	return fiber;
}
