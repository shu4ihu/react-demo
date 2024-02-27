import { beginWork } from './beginWork';
import { commitMutationEffects } from './commitWork';
import { completeWork } from './completeWork';
import { FiberNode, createWorkInProgress } from './fiber';
import { FiberRootNode } from './fiber';
import { MutationMask, NoFlags } from './fiberFlags';
import { HostRoot } from './workTag';

let workInProgress: FiberNode | null = null;

/**
 * @description 根节点刷新
 * @param root FiberRootNode
 */
function prepareRefreshStack(root: FiberRootNode) {
	workInProgress = createWorkInProgress(root.current, {});
}

/**
 * @description 调度更新
 * @param fiber FiberNode
 */
export function scheduleUpdateOnFiber(fiber: FiberNode) {
	// TODO 调度功能
	const root = markUpdateFromFiberToRoot(fiber);
	renderRoot(root);
}

/**
 * @description 从 fiber 节点遍历到 root
 * @param fiber FiberNode
 * @returns FiberNode | null
 */
function markUpdateFromFiberToRoot(fiber: FiberNode) {
	let node = fiber;
	let parent = node.return;
	while (parent !== null) {
		node = parent;
		parent = node.return;
	}

	if (node.tag === HostRoot) {
		return node.stateNode;
	}

	return null;
}

/**
 * @description 渲染根节点
 * @param root FiberRootNode
 */
function renderRoot(root: FiberRootNode) {
	// 初始化
	prepareRefreshStack(root);

	do {
		try {
			workLoop();
			break;
		} catch (e) {
			if (__DEV__) {
				console.warn('workLoop 发生错误');
			}
			workInProgress = null;
		}
	} while (true);

	const finishedWork = root.current.alternate;
	root.finishedWork = finishedWork;

	// wip fiberNode 树 树中的 flags
	commitRoot(root);
}

/**
 * @description 当所有更新都被应用后，重置 finishedWork，判断是否存在 3 个子阶段需要执行的操作，如果有则执行
 * @param root FiberRootNode
 * @returns
 */
function commitRoot(root: FiberRootNode) {
	// finishedWork -- render 阶段构建的 wip Fiber Tree 的 hostRootFiber
	const finishedWork = root.finishedWork;

	if (finishedWork === null) {
		return;
	}

	if (__DEV__) {
		console.warn('commit 阶段开始', finishedWork);
	}

	// 重置
	root.finishedWork = null;

	// 判断是否存在 3 个子阶段需要执行的操作

	// subtree flags
	const subtreeHasEffect =
		(finishedWork.subtreeFlags & MutationMask) !== NoFlags;

	// root flags
	const rootHasEffect = (finishedWork.flags & MutationMask) !== NoFlags;

	if (rootHasEffect || subtreeHasEffect) {
		// beforeMutation
		// mutation -- Placement
		commitMutationEffects(finishedWork);
		root.current = finishedWork;

		// layout
	} else {
		root.current = finishedWork;
	}
}

/**
 * @description workLoop
 */
function workLoop() {
	while (workInProgress !== null) {
		performUnitOfWork(workInProgress);
	}
}

/**
 * @description 得到 beginWork 处理后的 fiber，如果为 null 说明 beginWork 处理完毕
 * @param fiber FiberNode
 */
function performUnitOfWork(fiber: FiberNode) {
	const next = beginWork(fiber);
	fiber.memorizedProps = fiber.pendingProps;

	if (next === null) {
		completeUnitOfWork(fiber);
	} else {
		workInProgress = next;
	}
}

/**
 * @description 开始执行 completeWork，直到没有 sibling 为止
 * @param fiber FiberNode
 * @returns
 */
function completeUnitOfWork(fiber: FiberNode) {
	let node: FiberNode | null = fiber;

	do {
		completeWork(node);
		const sibling = node.sibling;

		if (sibling !== null) {
			workInProgress = sibling;
			return;
		}

		node = node.return;
		workInProgress = node;
	} while (node !== null);
}
