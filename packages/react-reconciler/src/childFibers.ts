import { Props, ReactElementType } from 'shared/ReactTypes';
import {
	FiberNode,
	createFiberFormElement,
	createWorkInProgress
} from './fiber';
import { REACT_ELEMENT_TYPE } from 'shared/ReactSymbol';
import { HostText } from './workTag';
import { ChildDeletion, Placement } from './fiberFlags';

/**
 * @description ChildReconciler 函数，根据 shouldTrackEffects 返回不同的 reconcileChildFibers 函数
 * @param shouldTrackEffects
 * @returns
 */
function ChildReconciler(shouldTrackEffects: boolean) {
	/**
	 * @description 将 childToDelete 添加到 deletions 中
	 * @param returnFiber 父 fiberNode
	 * @param childToDelete 需要被删除的子节点
	 * @returns
	 */
	function deleteChild(returnFiber: FiberNode, childToDelete: FiberNode) {
		if (!shouldTrackEffects) {
			return;
		}

		// 用于保存该 returnFiber 下所有需要被删除的子节点的数组结构
		const deletions = returnFiber.deletions;

		// 如果 deletions 为空，则将 childToDelete 设置为 deletions
		if (deletions === null) {
			returnFiber.deletions = [childToDelete];
			returnFiber.flags |= ChildDeletion;
		} else {
			// 否则将 childToDelete 添加到 deletions 中
			deletions.push(childToDelete);
		}
	}

	/**
	 * @description 根据 reactElement 创建 fiber
	 * @param returnFiber 父 fiberNode
	 * @param currentFiber 当前 fiberNode
	 * @param element ReactElement
	 * @returns FiberNode
	 */
	function reconcileSingleElement(
		returnFiber: FiberNode,
		currentFiber: FiberNode | null,
		element: ReactElementType
	) {
		const key = element.key;
		work: if (currentFiber !== null) {
			// update
			if (currentFiber.key === key) {
				// key 相同，比较 Type
				if (element.$$typeof === REACT_ELEMENT_TYPE) {
					if (currentFiber.type === element.type) {
						// type 相同
						const existing = useFiber(currentFiber, element.props);
						existing.return = returnFiber;
						return existing;
					}
					// key 相同 type 不同，需要去旧迎新
					deleteChild(returnFiber, currentFiber);
					break work;
				} else {
					if (__DEV__) {
						console.warn('未实现的 react 类型', element);
						break work;
					}
				}
			} else {
				// key 不相同，则应该去旧迎新
				deleteChild(returnFiber, currentFiber);
			}
		}
		const fiber = createFiberFormElement(element);
		fiber.return = returnFiber;
		return fiber;
	}

	/**
	 * @description 根据 content 创建 fiber
	 * @param returnFiber 父 fiberNode
	 * @param currentFiber 当前 fiberNode
	 * @param content 文本内容
	 * @returns FiberNode
	 */
	function reconcileSingleTextNode(
		returnFiber: FiberNode,
		currentFiber: FiberNode | null,
		content: string | number
	) {
		if (currentFiber !== null) {
			// update
			if (currentFiber.tag === HostText) {
				// 类型不变，可以复用
				const existing = useFiber(currentFiber, { content });
				existing.return = returnFiber;
				return existing;
			}
			// 类型变了，需要去旧迎新
			deleteChild(returnFiber, currentFiber);
		}
		const fiber = new FiberNode(HostText, { content }, null);
		fiber.return = returnFiber;
		return fiber;
	}

	/**
	 * @description 判断否需要追踪副作用和是否是首屏渲染，如果是则设置 Placement 标记
	 * @param fiber FiberNode
	 * @returns FiberNode
	 */
	function placeSingleChild(fiber: FiberNode) {
		if (shouldTrackEffects && fiber.alternate === null) {
			fiber.flags |= Placement;
		}

		return fiber;
	}

	/**
	 * @description 根据不同的类型，创建对应的 fiber，并设置 Placement 标记
	 * @param returnFiber 父 fiberNode
	 * @param currentFiber 当前 fiberNode
	 * @param newChild 新的 ReactElement
	 * @returns FiberNode
	 */
	return function reconcileChildFibers(
		returnFiber: FiberNode,
		currentFiber: FiberNode | null,
		newChild?: ReactElementType
	) {
		// newChild 类型为 object 且 不为空，说明 newChild 为 ReactElement
		if (typeof newChild === 'object' && newChild !== null) {
			switch (newChild.$$typeof) {
				// ReactElement：根据 ReactElement 创建 fiber，然后设置 Placement 标记
				case REACT_ELEMENT_TYPE:
					return placeSingleChild(
						reconcileSingleElement(returnFiber, currentFiber, newChild)
					);
				default:
					if (__DEV__) {
						console.warn('未实现的 reconcile 类型', newChild);
					}
					break;
			}
		}
		// TODO 多节点情况

		// HostText：根据 content 创建 fiber，然后设置 Placement 标记
		if (typeof newChild === 'string' || typeof newChild === 'number') {
			return placeSingleChild(
				reconcileSingleTextNode(returnFiber, currentFiber, newChild)
			);
		}

		if (currentFiber !== null) {
			// 保险情况
			deleteChild(returnFiber, currentFiber);
		}

		if (__DEV__) {
			console.warn('未实现的 reconcile 类型', newChild);
		}

		return null;
	};
}

function useFiber(fiber: FiberNode, pendingProps: Props): FiberNode {
	const clone = createWorkInProgress(fiber, pendingProps);
	clone.index = 0;
	clone.sibling = null;
	return clone;
}

export const reconcileChildFibers = ChildReconciler(true);
export const mountChildFibers = ChildReconciler(false);
