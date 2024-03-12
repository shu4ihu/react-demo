import { scheduleMicroTask } from 'hostConfig';
import { beginWork } from './beginWork';
import {
	commitHookEffectListCreate,
	commitHookEffectListDestroy,
	commitHookEffectListUnmount,
	commitLayoutEffects,
	commitMutationEffects
} from './commitWork';
import { completeWork } from './completeWork';
import {
	FiberNode,
	PendingPassiveEffects,
	createWorkInProgress
} from './fiber';
import { FiberRootNode } from './fiber';
import { MutationMask, NoFlags, PassiveMask } from './fiberFlags';
import {
	Lane,
	NoLane,
	SyncLane,
	getHighestPriorityLane,
	lanesToSchedulerPriority,
	markRootFinished,
	mergeLanes
} from './fiberLanes';
import { flushSyncCallbacks, scheduleSyncCallback } from './syncTaskQueue';
import { HostRoot } from './workTag';
import {
	unstable_scheduleCallback as scheduleCallback,
	unstable_NormalPriority as NormalPriority,
	unstable_shouldYield,
	unstable_cancelCallback
} from 'scheduler';
import { HookHasEffect, Passive } from './hookEffectTags';

let workInProgress: FiberNode | null = null;
let wipRootRenderLanes: Lane = NoLane;
let rootDoesHasPassiveEffects: boolean = false;

type RootExitStatus = number;
const RootInComplete = 1;
const RootCompleted = 2;
// TODO 执行过程中报错

/**
 * @description 根节点刷新
 * @param root FiberRootNode
 */
function prepareRefreshStack(root: FiberRootNode, lane: Lane) {
	root.finishedLane = NoLane;
	root.finishedWork = null;
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
	const existingCallbackNode = root.callbackNode;

	if (updateLane === NoLane) {
		if (existingCallbackNode !== null) {
			unstable_cancelCallback(existingCallbackNode);
		}
		root.callbackNode = null;
		root.callbackPriority = NoLane;
		return;
	}

	const curPriority = updateLane;
	const prevPriority = root.callbackPriority;

	if (curPriority === prevPriority) {
		return;
	}

	if (existingCallbackNode !== null) {
		unstable_cancelCallback(existingCallbackNode);
	}

	let newCallbackNode = null;

	if (updateLane === SyncLane) {
		// 同步优先级，用微任务调度
		if (__DEV__) {
			console.warn('在微任务调度，优先级', updateLane);
		}
		scheduleSyncCallback(performSyncWorkOnRoot.bind(null, root, updateLane));
		scheduleMicroTask(flushSyncCallbacks);
	} else {
		// 其他优先级，用宏任务调度
		const schedulerPriority = lanesToSchedulerPriority(updateLane);
		newCallbackNode = scheduleCallback(
			schedulerPriority,
			// @ts-ignore
			performConcurrentWorkOnRoot.bind(null, root)
		);
	}
	root.callbackNode = newCallbackNode;
	root.callbackPriority = curPriority;
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

function performConcurrentWorkOnRoot(
	root: FiberRootNode,
	didTimeout: boolean
): any {
	// 保证 useEffect 回调执行
	const curCallback = root.callbackNode;
	const didFlushPassiveEffect = flushPassiveEffects(root.pendingPassiveEffects);
	if (didFlushPassiveEffect) {
		if (root.callbackNode !== curCallback) {
			return null;
		}
	}

	const lane = getHighestPriorityLane(root.pendingLanes);
	const curCallbackNode = root.callbackNode;
	if (lane === NoLane) {
		return null;
	}
	const needSync = lane === SyncLane || didTimeout;

	const exitStatus = renderRoot(root, lane, !needSync);
	ensureRootIsScheduled(root);
	if (exitStatus === RootInComplete) {
		// 中断执行
		if (root.callbackNode !== curCallbackNode) {
			return null;
		}
		return performConcurrentWorkOnRoot.bind(null, root);
	}

	if (exitStatus === RootCompleted) {
		const finishedWork = root.current.alternate;
		root.finishedWork = finishedWork;
		root.finishedLane = lane;
		wipRootRenderLanes = NoLane;

		commitRoot(root);
	} else if (__DEV__) {
		console.error('还未实现的并发更新结束状态');
	}
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

	const exitStatus = renderRoot(root, nextLane, false);

	if (exitStatus === RootCompleted) {
		const finishedWork = root.current.alternate;
		root.finishedWork = finishedWork;
		root.finishedLane = nextLane;
		wipRootRenderLanes = NoLane;
		commitRoot(root);
	} else if (__DEV__) {
		console.error('还未实现的同步更新结束状态');
	}
}

function renderRoot(root: FiberRootNode, lane: Lane, shouldTimeSlice: boolean) {
	if (__DEV__) {
		console.log(`开始${shouldTimeSlice ? '并发' : '同步'}更新`, root);
	}
	if (wipRootRenderLanes !== lane) {
		// 初始化
		prepareRefreshStack(root, lane);
	}

	do {
		try {
			// 执行工作流程
			shouldTimeSlice ? workLoopConcurrent() : workLoopSync();
			break;
		} catch (e) {
			if (__DEV__) {
				console.warn('workLoop 发生错误');
			}
			workInProgress = null;
		}
	} while (true);

	// 中断执行 || render 执行完
	if (shouldTimeSlice && workInProgress !== null) {
		return RootInComplete;
	}

	// render 执行完
	if (!shouldTimeSlice && workInProgress !== null && __DEV__) {
		console.error('render 阶段结束时 wip 不应该不是 null');
	}

	// TODO 报错
	return RootCompleted;
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

	if (
		(finishedWork.flags & PassiveMask) !== NoFlags ||
		(finishedWork.subtreeFlags & PassiveMask) !== NoFlags
	) {
		// 存在函数组件需要执行 useEffect
		if (!rootDoesHasPassiveEffects) {
			rootDoesHasPassiveEffects = true;
			// 调度副作用
			scheduleCallback(NormalPriority, () => {
				// 执行副作用
				flushPassiveEffects(root.pendingPassiveEffects);
				return;
			});
		}
	}
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
		commitMutationEffects(finishedWork, root);
		root.current = finishedWork;

		// layout
		commitLayoutEffects(finishedWork, root);
	} else {
		root.current = finishedWork;
	}

	rootDoesHasPassiveEffects = false;
	ensureRootIsScheduled(root);
}

function flushPassiveEffects(pendingPassiveEffects: PendingPassiveEffects) {
	let didFlushPassiveEffect = false;
	pendingPassiveEffects.unmount.forEach((effect) => {
		didFlushPassiveEffect = true;
		commitHookEffectListUnmount(Passive, effect);
	});
	pendingPassiveEffects.unmount = [];

	pendingPassiveEffects.update.forEach((effect) => {
		didFlushPassiveEffect = true;
		commitHookEffectListDestroy(Passive | HookHasEffect, effect);
	});

	pendingPassiveEffects.update.forEach((effect) => {
		didFlushPassiveEffect = true;
		commitHookEffectListCreate(Passive | HookHasEffect, effect);
	});
	pendingPassiveEffects.update = [];

	flushSyncCallbacks();
	return didFlushPassiveEffect;
}

/**
 * @description workLoop
 */
function workLoopSync() {
	while (workInProgress !== null) {
		performUnitOfWork(workInProgress);
	}
}

function workLoopConcurrent() {
	while (workInProgress !== null && !unstable_shouldYield()) {
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
	fiber.memoizedProps = fiber.pendingProps;
	// console.log('fiber.memoizedProps', fiber.memoizedProps);

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
		if (__DEV__) {
			console.warn('completeWork 开始', node.type);
		}
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
