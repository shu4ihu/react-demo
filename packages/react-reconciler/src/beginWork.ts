import { ReactElementType } from 'shared/ReactTypes';
import { FiberNode } from './fiber';
import { UpdateQueue, processUpdateQueue } from './updateQueue';
import { HostComponent, HostRoot, HostText } from './workTag';
import { mountChildFibers, reconcileChildFibers } from './childFibers';

/**
 * 根据传入的 wip 的 tag，开始对应的 beginWork 流程
 * @param wip 当前工作中的 Fiber 节点，表示根节点（HostRoot）
 * @returns 更新后的子节点
 */
export const beginWork = (wip: FiberNode) => {
	// 比较，返回子 fiberNode
	switch (wip.tag) {
		case HostRoot:
			return updateHostRoot(wip);
		case HostComponent:
			return updateHostComponent(wip);
		case HostText:
			return null;
		default:
			if (__DEV__) {
				console.warn('beginWork 未实现的类型');
			}
			break;
	}
	return null;
};

/**
 * 更新根节点（HostRoot）的逻辑
 * @param wip 当前工作中的 Fiber 节点，表示根节点（HostRoot）
 * @returns 更新后的子节点
 */
function updateHostRoot(wip: FiberNode): FiberNode | null {
	// 获取基础状态和更新队列
	const baseState = wip.memorizedState;
	const updateQueue = wip.updateQueue as UpdateQueue<Element>;
	// 获取更新队列中的待处理更新操作
	const pending = updateQueue.shared.pending;
	// 将更新队列的 pending 属性置为 null，表示更新操作已被处理
	updateQueue.shared.pending = null;

	// 处理更新队列中的更新操作，获取处理后的状态
	const { memorizedState } = processUpdateQueue(baseState, pending);
	// 将处理后的状态赋值给当前工作节点的 memorizedState 属性，表示更新后的状态
	wip.memorizedState = memorizedState;

	// 获取更新后的子节点
	const nextChildren = wip.memorizedState;
	// 调用 reconcileChildren 函数，将更新后的子节点与当前工作节点的子节点进行协调，确保它们在 Fiber 树中的正确位置
	reconcileChildren(wip, nextChildren);

	// 返回更新后的子节点，以便在下一次渲染中使用
	return wip.child;
}

/**
 * 更新根节点（HostComponent）的逻辑
 * @param wip 当前工作中的 Fiber 节点，表示根节点（HostComponent）
 * @returns 更新后的子节点
 */
function updateHostComponent(wip: FiberNode) {
	const nextProps = wip.pendingProps;
	const nextChildren = nextProps.children;
	reconcileChildren(wip, nextChildren);
	return wip.child;
}

/**
 * 协调子节点，通过判断 current 是否存在，来决定是更新还是挂载
 * @param wip 当前工作中的 Fiber 节点
 * @param children 子节点
 */
function reconcileChildren(wip: FiberNode, children?: ReactElementType) {
	const current = wip.alternate;

	if (current !== null) {
		// update
		wip.child = reconcileChildFibers(wip, current?.child, children);
	} else {
		// mount
		wip.child = mountChildFibers(wip, null, children);
	}
}
