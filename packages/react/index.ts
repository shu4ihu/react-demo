import currentDispatcher, {
	Dispatcher,
	resolveDispatcher
} from './src/currentDispatcher';
import * as jsx from './src/jsx';
// React

/**
 * @description 向外暴露的 useState Dispatcher
 * @param initialState 初始状态
 * @returns [State, Dispatch<State>] 状态和更新函数
 */
export const useState: Dispatcher['useState'] = (initialState) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useState(initialState);
};

export const useEffect: Dispatcher['useEffect'] = (create, deps) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useEffect(create, deps);
};

// 内部数据共享层
export const __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = {
	currentDispatcher
};

export const version = '0.0.0';
// TODO 根据环境区分使用 jsx / jsxDEV
export const createElement = jsx.jsx;
export const isValidElement = jsx.isValidElement;
