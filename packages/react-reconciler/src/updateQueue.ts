import { Action } from 'shared/ReactTypes';
import { Update } from './fiberFlags';

export interface Update<State> {
	action: Action<State>;
}

export interface UpdateQueue<State> {
	shared: {
		pending: Update<State> | null;
	};
}

/**
 * @description 创建一个新的更新对象
 * @param action 更新操作
 * @returns 更新对象
 */
export const createUpdate = <State>(action: Action<State>): Update<State> => {
	return {
		action
	};
};

/**
 * @description 创建一个新的更新队列
 * @returns 更新队列
 */
export const createUpdateQueue = <Action>() => {
	return {
		shared: {
			pending: null
		}
	} as UpdateQueue<Action>;
};

/**
 * @description 将更新操作入队
 * @param updateQueue 需要入队的更新队列
 * @param update 需要入队的更新操作
 */
export const enqueueUpdate = <Action>(
	updateQueue: UpdateQueue<Action>,
	update: Update<Action>
) => {
	updateQueue.shared.pending = update;
};

/**
 * @description 消费更新队列
 * @param baseState 基础状态
 * @param pendingUpdate 待处理更新操作
 * @returns 处理后的状态
 */
export const processUpdateQueue = <State>(
	baseState: State,
	pendingUpdate: Update<State> | null
): { memorizedState: State } => {
	const result: ReturnType<typeof processUpdateQueue<State>> = {
		memorizedState: baseState
	};

	// 如果存在待处理更新操作，则执行更新操作
	if (pendingUpdate !== null) {
		const action = pendingUpdate.action;
		if (action instanceof Function) {
			// 如果更新操作是函数，则执行函数并将执行结果作为新的状态
			result.memorizedState = action(baseState);
		} else {
			// 如果更新操作不是函数，则直接将更新操作作为新的状态
			result.memorizedState = action;
		}
	}

	return result;
};
