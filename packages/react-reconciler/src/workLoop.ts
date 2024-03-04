import { scheduleMicroTask } from 'hostConfig';
import { beginWork } from './beginWork';
import { commitMutationEffects } from './commitWork';
import { completeWork } from './completeWork';
import { FiberNode, createWorkInProgress } from './fiber';
import { FiberRootNode } from './fiber';
import { MutationMask, NoFlags } from './fiberFlags';
import {
	Lane,
	NoLane,
	SyncLane,
	getHighestPriorityLane,
	markRootFinished,
	mergeLanes
} from './fiberLanes';
import { flushSyncCallbacks, scheduleSyncCallback } from './syncTaskQueue';
import { HostRoot } from './workTag';

let workInProgress: FiberNode | null = null;
let wipRootRenderLanes: Lane = NoLane;
/**
 * @description 根节点刷新
 * @param root FiberRootNode
 */
function prepareRefreshStack(root: FiberRootNode, lane: Lane) {
	workInProgress = createWorkInProgress(root.current, {});
	wipRootRenderLanes = lane;
}

/**
 * @description 调度更新
 * @param fiber FiberNode
 * @param lane Lane
 */
export function scheduleUpdateOnFiber(fiber: FiberNode, lane: Lane) {
	// TODO 调度功能
	const root = markUpdateFromFiberToRoot(fiber);
	markRootUpdated(root, lane);
	ensureRootIsScheduled(root);
}

/**
 * @description 调度阶段入口
 * @param root
 * @returns
 */
function ensureRootIsScheduled(root: FiberRootNode) {
	const updateLane = getHighestPriorityLane(root.pendingLanes);

	if (updateLane === NoLane) {
		return;
	}

	if (updateLane === SyncLane) {
		// 同步优先级，用微任务调度
		if (__DEV__) {
			console.warn('在微任务调度，优先级', updateLane);
		}
		scheduleSyncCallback(performSyncWorkOnRoot.bind(null, root, updateLane));
		scheduleMicroTask(flushSyncCallbacks);
	} else {
		// 其他优先级，用宏任务调度
	}
}

function markRootUpdated(root: FiberRootNode, lane: Lane) {
	root.pendingLanes = mergeLanes(root.pendingLanes, lane);
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
function performSyncWorkOnRoot(root: FiberRootNode, lane: Lane) {
	const nextLane = getHighestPriorityLane(root.pendingLanes);

	if (nextLane !== SyncLane) {
		// 其他比 SyncLane 低的优先级
		// NoLane
		ensureRootIsScheduled(root);
		return;
	}
	if (__DEV__) {
		console.log('render 阶段开始');
	}
	// 初始化
	prepareRefreshStack(root, lane);

	do {
		try {
			// 执行工作流程
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
	root.finishedLane = lane;
	wipRootRenderLanes = NoLane;
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
	// console.log(finishedWork);
	if (finishedWork === null) {
		return;
	}

	// if (__DEV__) {
	// 	console.warn('commit 阶段开始', finishedWork);
	// }

	const lane = root.finishedLane;

	if (lane === NoLane && __DEV__) {
		console.warn('commit 阶段 finishedLane 不应该是 NoLane');
	}

	// 重置
	root.finishedWork = null;
	root.finishedLane = NoLane;

	markRootFinished(root, lane);

	// 判断是否存在 3 个子阶段需要执行的操作

	// subtree flags
	const subtreeHasEffect =
		(finishedWork.subtreeFlags & MutationMask) !== NoFlags;

	// root flags
	const rootHasEffect = (finishedWork.flags & MutationMask) !== NoFlags;

	// console.log(finishedWork.subtreeFlags, finishedWork.flags, finishedWork);
	// console.log(rootHasEffect, subtreeHasEffect);

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
	// console.log('当前 beginWork 处理的 fiberNode', fiber.type, fiber);
	const next = beginWork(fiber, wipRootRenderLanes);
	// console.log('beginWork 处理后的 fiberNode', next?.type, next);
	fiber.memorizedProps = fiber.pendingProps;
	// console.log('fiber.memorizedProps', fiber.memorizedProps);

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
		// if (__DEV__) {
		// 	console.warn('completeWork 开始', node.type);
		// }
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
