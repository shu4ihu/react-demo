import internals from 'shared/internal';
import { FiberNode } from './fiber';
import { Dispatch, Dispatcher } from 'react/src/currentDispatcher';
import {
	Update,
	UpdateQueue,
	createUpdate,
	createUpdateQueue,
	enqueueUpdate,
	processUpdateQueue
} from './updateQueue';
import { Action } from 'shared/ReactTypes';
import { scheduleUpdateOnFiber } from './workLoop';
import { Lane, NoLane, requestUpdateLane } from './fiberLanes';
import { Flags, PassiveEffect } from './fiberFlags';
import { HookHasEffect, Passive } from './hookEffectTags';

let currentlyRenderingFiber: FiberNode | null = null;
let workInProgressHook: Hook | null = null;
let currentHook: Hook | null = null;
let renderLane: Lane = NoLane;

const { currentDispatcher } = internals;

interface Hook {
	memoizedState: any;
	updateQueue: unknown;
	next: Hook | null;
	baseState: any;
	baseQueue: Update<any> | null;
}

export interface Effect {
	tag: Flags;
	create: EffectCallback | void;
	destroy: EffectCallback | void;
	deps: EffectDeps;
	next: Effect | null;
}

export interface FCUpdateQueue<State> extends UpdateQueue<State> {
	lastEffect: Effect | null;
}

type EffectCallback = () => void;
type EffectDeps = any[] | null;

/**
 * @description render 过程中对 hooks 的处理
 * @param wip 当前工作中的 Fiber 节点
 * @returns 渲染后的子节点
 */
export function renderWithHooks(wip: FiberNode, lane: Lane) {
	// 当前正在渲染的 Fiber 节点
	currentlyRenderingFiber = wip;
	// 组件 mount 时，memoizedState 为 null，重置 hooks 链表
	wip.memoizedState = null;
	// 重置 effect 链表
	wip.updateQueue = null;
	renderLane = lane;
	// 检查当前处于 update 还是 mount
	const current = wip.alternate;
	if (current !== null) {
		// update
		currentDispatcher.current = HooksDispatcherOnUpdate;
	} else {
		// mount
		currentDispatcher.current = HooksDispatcherOnMount;
	}

	// 获取组件属性，并渲染子组件
	const Component = wip.type;
	const props = wip.pendingProps;
	const children = Component(props);

	// 重置，清理当前的渲染上下文
	currentlyRenderingFiber = null;
	workInProgressHook = null;
	currentHook = null;
	renderLane = NoLane;

	// 返回渲染后的子组件
	return children;
}

const HooksDispatcherOnMount: Dispatcher = {
	useState: mountState,
	useEffect: mountEffect
};

const HooksDispatcherOnUpdate: Dispatcher = {
	useState: updateState,
	useEffect: updateEffect
};

function updateEffect(create: EffectCallback | void, deps: EffectDeps) {
	const hook = updateWorkInProgress();
	const nextDeps = deps === undefined ? null : deps;
	let destroy: EffectCallback | void = undefined;

	if (currentHook !== null) {
		const prevEffect = currentHook.memoizedState as Effect;
		destroy = prevEffect.destroy;

		if (nextDeps !== null) {
			// 浅比较依赖
			const prevDeps = prevEffect.deps;
			if (areHookInputsEqual(nextDeps, prevDeps)) {
				hook.memoizedState = pushEffect(Passive, create, destroy, nextDeps);
				return;
			}
		}
		// 浅比较 不等
		(currentlyRenderingFiber as FiberNode).flags |= PassiveEffect;
		hook.memoizedState = pushEffect(
			Passive | HookHasEffect,
			create,
			destroy,
			nextDeps
		);
	}
}

function areHookInputsEqual(nextDeps: EffectDeps, prevDeps: EffectDeps) {
	if (prevDeps === null || nextDeps === null) {
		return false;
	}

	for (let i = 0; i < prevDeps.length && i < nextDeps.length; i++) {
		if (Object.is(prevDeps[i], nextDeps[i])) {
			continue;
		}
		return false;
	}
	return true;
}

function mountEffect(create: EffectCallback | void, deps: EffectDeps) {
	const hook = mountWorkInProgress();
	const nextDeps = deps === undefined ? null : deps;

	(currentlyRenderingFiber as FiberNode).flags |= PassiveEffect;

	hook.memoizedState = pushEffect(
		Passive | HookHasEffect,
		create,
		undefined,
		nextDeps
	);
}

function pushEffect(
	hookFlags: Flags,
	create: EffectCallback | void,
	destroy: EffectCallback | void,
	deps: EffectDeps
): Effect {
	const effect: Effect = {
		tag: hookFlags,
		create,
		destroy,
		deps,
		next: null
	};

	const fiber = currentlyRenderingFiber as FiberNode;
	const updateQueue = fiber.updateQueue as FCUpdateQueue<any>;

	if (updateQueue === null) {
		const updateQueue = createFCUpdateQueue();
		fiber.updateQueue = updateQueue;
		effect.next = effect;
		updateQueue.lastEffect = effect;
	} else {
		// 插入 effect
		const lastEffect = updateQueue.lastEffect;
		if (lastEffect === null) {
			effect.next = effect;
			updateQueue.lastEffect = effect;
		} else {
			const firstEffect = lastEffect.next;
			lastEffect.next = effect;
			effect.next = firstEffect;
			updateQueue.lastEffect = effect;
		}
	}
	return effect;
}

function createFCUpdateQueue<State>() {
	const updateQueue = createUpdateQueue<State>() as FCUpdateQueue<State>;
	updateQueue.lastEffect = null;
	return updateQueue;
}

/**
 * @description 状态更新
 * @returns [State, Dispatch<State>] 状态和更新函数
 */
function updateState<State>(): [State, Dispatch<State>] {
	// 找到当前 useState 对应的 hook 数据
	const hook = updateWorkInProgress();

	// 计算新 state 的逻辑
	const queue = hook.updateQueue as UpdateQueue<State>;
	const baseState = hook.baseState;

	const pending = queue.shared.pending;
	const current = currentHook as Hook;
	let baseQueue = current.baseQueue;

	if (pending !== null) {
		// pending baseQueue update 保存在 current 中
		if (baseQueue !== null) {
			const baseFirst = baseQueue.next;
			const pendingFirst = pending.next;

			baseQueue.next = pendingFirst;
			pending.next = baseFirst;
		}

		baseQueue = pending;
		current.baseQueue = pending;
		queue.shared.pending = null;

		if (baseQueue !== null) {
			// 如果有未处理的更新，执行更新操作
			const {
				memoizedState,
				baseQueue: newBaseQueue,
				baseState: newBaseState
			} = processUpdateQueue(baseState, pending, renderLane);

			hook.memoizedState = memoizedState;
			hook.baseState = newBaseState;
			hook.baseQueue = newBaseQueue;
		}
	}

	return [hook.memoizedState, queue.dispatch as Dispatch<State>];
}

/**
 * @description update 时，创建 hooks 集合
 * @returns Hook
 */
function updateWorkInProgress(): Hook {
	let nextCurrentHook: Hook | null;

	if (currentHook === null) {
		// FC update 时第一个 Hook
		const current = currentlyRenderingFiber?.alternate;

		if (current !== null) {
			nextCurrentHook = current?.memoizedState;
		} else {
			nextCurrentHook = null;
		}
	} else {
		// FC update 时，后续的 hook
		nextCurrentHook = currentHook.next;
	}

	if (nextCurrentHook === null) {
		throw new Error(
			`组件${currentlyRenderingFiber?.type}本次执行时的 hook 比上次执行时多`
		);
	}

	// 更新当前 hook
	currentHook = nextCurrentHook;
	const newHook = {
		memoizedState: currentHook?.memoizedState,
		next: null,
		updateQueue: currentHook?.updateQueue,
		baseQueue: currentHook?.baseQueue,
		baseState: currentHook?.baseState
	};

	if (workInProgressHook === null) {
		// FC update 时 第一个 Hook
		if (currentlyRenderingFiber === null) {
			throw new Error('请在函数组件内调用 hook');
		} else {
			workInProgressHook = newHook;
			currentlyRenderingFiber.memoizedState = workInProgressHook;
		}
	} else {
		// FC update 时，后续的hook
		workInProgressHook.next = newHook;
		workInProgressHook = newHook;
	}

	return workInProgressHook;
}

/**
 * @description mount 时 useState 的处理
 * @param initialState 初始状态
 * @returns [State, Dispatch<State>] 状态和更新函数
 */
function mountState<State>(
	initialState: (() => State) | State
): [State, Dispatch<State>] {
	// 找到当前 useState 对应的 hook 数据
	const hook = mountWorkInProgress();
	// 如果 initialState 是函数，则执行函数获取状态，否则直接使用 initialState
	let memoizedState;
	if (initialState instanceof Function) {
		memoizedState = initialState();
	} else {
		memoizedState = initialState;
	}

	// 创建更新队列
	const queue = createUpdateQueue<State>();
	// 将更新队列和计算后的状态赋值给 hook
	hook.updateQueue = queue;
	hook.memoizedState = memoizedState;

	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	// 绑定 dispatch 函数，调用时，向更新队列传入更新操作，然后调度更新
	const dispatch = dispatchSetState.bind(null, currentlyRenderingFiber, queue);
	queue.dispatch = dispatch;

	return [memoizedState, dispatch];
}

/**
 * @description dispatch 函数，用于向更新队列传入更新操作，然后调度更新
 * @param fiber 当前正在渲染的 Fiber 节点
 * @param updateQueue 更新队列
 * @param action 更新操作
 */
function dispatchSetState<State>(
	fiber: FiberNode,
	updateQueue: UpdateQueue<State>,
	action: Action<State>
) {
	const lane = requestUpdateLane();
	const update = createUpdate(action, lane);
	enqueueUpdate(updateQueue, update);
	scheduleUpdateOnFiber(fiber, lane);
}

/**
 * @description 组件 mount 时，创建 hooks 集合
 * @returns Hook
 */
function mountWorkInProgress(): Hook {
	const hook: Hook = {
		memoizedState: null,
		next: null,
		updateQueue: null,
		baseState: null,
		baseQueue: null
	};

	if (workInProgressHook === null) {
		// mount 时 第一个 Hook
		if (currentlyRenderingFiber === null) {
			throw new Error('请在函数组件内调用 hook');
		} else {
			workInProgressHook = hook;
			currentlyRenderingFiber.memoizedState = workInProgressHook;
		}
	} else {
		// mount 时，后续的hook
		workInProgressHook.next = hook;
		workInProgressHook = hook;
	}

	return workInProgressHook;
}
