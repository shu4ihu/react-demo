import internals from 'shared/internal';
import { FiberNode } from './fiber';
import { Dispatch, Dispatcher } from 'react/src/currentDispatcher';
import {
	UpdateQueue,
	createUpdate,
	createUpdateQueue,
	enqueueUpdate
} from './updateQueue';
import { Action } from 'shared/ReactTypes';
import { scheduleUpdateOnFiber } from './workLoop';

let currentlyRenderingFiber: FiberNode | null = null;
let workInProgressHook: Hook | null = null;

const { currentDispatcher } = internals;

interface Hook {
	memoizedState: any;
	updateQueue: unknown;
	next: Hook | null;
}

/**
 * @description render 过程中对 hooks 的处理
 * @param wip 当前工作中的 Fiber 节点
 * @returns 渲染后的子节点
 */
export function renderWithHooks(wip: FiberNode) {
	// 当前正在渲染的 Fiber 节点
	currentlyRenderingFiber = wip;
	// 组件 mount 时，memoizedState 为 null
	wip.memoizedState = null;

	// 检查当前处于 update 还是 mount
	const current = wip.alternate;
	if (current !== null) {
		// update
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

	// 返回渲染后的子组件
	return children;
}

const HooksDispatcherOnMount: Dispatcher = {
	useState: mountState
};

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
	const update = createUpdate(action);
	enqueueUpdate(updateQueue, update);
	scheduleUpdateOnFiber(fiber);
}

/**
 * @description 组件 mount 时，创建 hooks 集合
 * @returns Hook
 */
function mountWorkInProgress(): Hook {
	const hook: Hook = {
		memoizedState: null,
		next: null,
		updateQueue: null
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
