import { ReactElementType } from 'shared/ReactTypes';
import { FiberNode, createFiberFormElement } from './fiber';
import { REACT_ELEMENT_TYPE } from 'shared/ReactSymbol';
import { HostText } from './workTag';
import { Placement } from './fiberFlags';

/**
 * @description ChildReconciler 函数，根据 shouldTrackEffects 返回不同的 reconcileChildFibers 函数
 * @param shouldTrackEffects
 * @returns
 */
function ChildReconciler(shouldTrackEffects: boolean) {
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
		const fiber = createFiberFormElement(element);
		fiber.return = returnFiber;
		return fiber;
	}

	/**
	 * @description 根据 content 创建 fiber
	 * @param returnFiber 父 fiberNode
	 * @param current 当前 fiberNode
	 * @param content 文本内容
	 * @returns FiberNode
	 */
	function reconcileSingleTextNode(
		returnFiber: FiberNode,
		current: FiberNode | null,
		content: string | number
	) {
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

		if (__DEV__) {
			console.warn('未实现的 reconcile 类型', newChild);
		}

		return null;
	};
}

export const reconcileChildFibers = ChildReconciler(true);
export const mountChildFibers = ChildReconciler(false);
