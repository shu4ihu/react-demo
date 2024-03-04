import { Key, Props, ReactElementType } from 'shared/ReactTypes';
import {
	FiberNode,
	createFiberFormElement,
	createFiberFormFragment,
	createWorkInProgress
} from './fiber';
import { REACT_ELEMENT_TYPE, REACT_FRAGMENT_TYPE } from 'shared/ReactSymbol';
import { Fragment, HostText } from './workTag';
import { ChildDeletion, Placement } from './fiberFlags';

type ExistingChildren = Map<string | number, FiberNode>;

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

	function deleteRemainingChildren(
		returnFiber: FiberNode,
		currentFirstChild: FiberNode | null
	) {
		if (!shouldTrackEffects) {
			return;
		}

		let childToDelete = currentFirstChild;
		while (childToDelete !== null) {
			deleteChild(returnFiber, childToDelete);
			childToDelete = childToDelete.sibling;
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
		while (currentFiber !== null) {
			// update
			if (currentFiber.key === key) {
				// key 相同，比较 Type
				if (element.$$typeof === REACT_ELEMENT_TYPE) {
					if (currentFiber.type === element.type) {
						let props = element.props;
						if (element.type === REACT_FRAGMENT_TYPE) {
							props = element.props.children;
						}
						// type 相同
						const existing = useFiber(currentFiber, element.props);
						existing.return = returnFiber;
						// 当前节点可复用，标记剩下节点删除
						deleteRemainingChildren(returnFiber, currentFiber.sibling);
						return existing;
					}
					// key 相同 type 不同，需要去删除所有旧的
					deleteRemainingChildren(returnFiber, currentFiber.sibling);
					break;
				} else {
					if (__DEV__) {
						console.warn('未实现的 react 类型', element);
						break;
					}
				}
			} else {
				// key 不相同，删掉当前的节点，继续遍历下一个兄弟节点
				deleteChild(returnFiber, currentFiber);
				currentFiber = currentFiber.sibling;
			}
		}
		let fiber = createFiberFormElement(element);
		if (element.type === REACT_FRAGMENT_TYPE) {
			fiber = createFiberFormFragment(element.props.children, key);
		} else {
			fiber = createFiberFormElement(element);
		}
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
		while (currentFiber !== null) {
			// update
			if (currentFiber.tag === HostText) {
				// 类型不变，可以复用
				const existing = useFiber(currentFiber, { content });
				existing.return = returnFiber;
				deleteRemainingChildren(returnFiber, currentFiber.sibling);
				return existing;
			}
			// 类型变了，当前节点不能复用
			deleteChild(returnFiber, currentFiber);
			currentFiber = currentFiber.sibling;
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
	 * @description 多节点情况，遍历 newChild，寻找是否可复用
	 * @param returnFiber 父 fiberNode
	 * @param currentFirstChild 当前的第一个子节点
	 * @param newChild 新的 ReactElement 数组
	 * @returns
	 */
	function reconcileChildrenArray(
		returnFiber: FiberNode,
		currentFirstChild: FiberNode | null,
		newChild: any[]
	) {
		// 最后一个可复用 fiber 在 current 中的 index
		let lastPlacedIndex: number = 0;
		// 创建的最后一个 fiber
		let lastNewFiber: FiberNode | null = null;
		// 创建的第一个 fiber
		let firstNewFiber: FiberNode | null = null;
		// 1. 将 current 保存在 Map 中
		const existingChildren: ExistingChildren = new Map();
		let current = currentFirstChild;
		// 遍历 current，将 key 或 index 作为 key，fiber 作为 value 保存在 Map 中
		while (current !== null) {
			const keyToUse = current.key !== null ? current.key : current.index;
			existingChildren.set(keyToUse, current);
			current = current.sibling;
		}

		// 2. 遍历 newChild，寻找是否可复用
		for (let i = 0; i < newChild.length; i++) {
			const after = newChild[i];
			// 通过 Map 查找是否可复用
			const newFiber = updateFromMap(returnFiber, existingChildren, i, after);
			// 不可复用
			if (newFiber === null) {
				continue;
			}

			// 3. 标记移动还是插入
			newFiber.index = i;
			newFiber.return = returnFiber;

			// 保存第一个和最后一个可复用的 fiber
			if (lastNewFiber === null) {
				lastNewFiber = newFiber;
				firstNewFiber = newFiber;
			} else {
				lastNewFiber.sibling = newFiber;
				lastNewFiber = lastNewFiber.sibling;
			}

			if (!shouldTrackEffects) {
				continue;
			}

			const current = newFiber.alternate;

			// 如果 current 不为空，说明是 update
			if (current !== null) {
				const oldIndex = current.index;

				// 如果 index 小于 lastPlacedIndex，说明需要移动
				if (oldIndex < lastPlacedIndex) {
					// 移动
					newFiber.flags |= Placement;
					continue;
				} else {
					// 不移动
					lastPlacedIndex = oldIndex;
				}
			} else {
				// mount
				newFiber.flags |= Placement;
			}
		}
		// 4. 将 Map 中剩下的节点标记为删除
		existingChildren.forEach((fiber) => {
			deleteChild(returnFiber, fiber);
		});
		return firstNewFiber;
	}

	/**
	 * @description 根据 Map 查找是否可复用
	 * @param returnFiber 父 fiberNode
	 * @param existingChildren Map
	 * @param index index
	 * @param element ReactElement
	 * @returns
	 */
	function updateFromMap(
		returnFiber: FiberNode,
		existingChildren: ExistingChildren,
		index: number,
		element: any
	): FiberNode | null {
		// 如果 key 为 null，index 代替 key
		const keyToUse = element.key !== null ? element.key : index;
		// 通过 key 查找是否可复用
		const before = existingChildren.get(keyToUse);

		if (typeof element === 'string' || typeof element === 'number') {
			// HostText
			if (before) {
				// 如果 before 存在，说明可以复用
				if (before.tag === HostText) {
					// tag 为 HostText，直接复用
					existingChildren.delete(keyToUse);
					return useFiber(before, { content: element + '' });
				}
			}
			// before 不存在，或者 tag 不为 HostText，需要创建新的 fiber
			return new FiberNode(HostText, { content: element + '' }, null);
		}

		// ReactElement
		if (typeof element === 'object' && element !== null) {
			switch (element.$$typeof) {
				case REACT_ELEMENT_TYPE:
					if (element.type === REACT_FRAGMENT_TYPE) {
						return updateFragment(
							returnFiber,
							before,
							element,
							keyToUse,
							existingChildren
						);
					}
					if (before) {
						if (before.type === element.type) {
							existingChildren.delete(keyToUse);
							return useFiber(before, element.props);
						}
					}
					return createFiberFormElement(element);
			}
		}

		// 数组类型
		if (Array.isArray(element)) {
			return updateFragment(
				returnFiber,
				before,
				element,
				keyToUse,
				existingChildren
			);
		}

		return null;
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
		// 判断 Fragment
		const isUnkeyedTopLevelFragment =
			typeof newChild === 'object' &&
			newChild !== null &&
			newChild.type === REACT_FRAGMENT_TYPE &&
			newChild.key === null;
		if (isUnkeyedTopLevelFragment) {
			newChild = newChild?.props.children;
		}

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
						console.warn(
							'未实现的 reconcile 类型 reconcile children fibers',
							newChild
						);
					}
					break;
			}

			// 多节点情况
			if (Array.isArray(newChild)) {
				return reconcileChildrenArray(returnFiber, currentFiber, newChild);
			}
		}

		// HostText：根据 content 创建 fiber，然后设置 Placement 标记
		if (typeof newChild === 'string' || typeof newChild === 'number') {
			return placeSingleChild(
				reconcileSingleTextNode(returnFiber, currentFiber, newChild)
			);
		}

		if (currentFiber !== null) {
			// 保险情况
			deleteRemainingChildren(returnFiber, currentFiber);
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

function updateFragment(
	returnFiber: FiberNode,
	current: FiberNode | undefined,
	elements: any[],
	key: Key,
	existingChildren: ExistingChildren
) {
	let fiber;
	if (!current || current.tag !== Fragment) {
		fiber = createFiberFormFragment(elements, key);
	} else {
		existingChildren.delete(key);
		fiber = useFiber(current, elements);
	}

	fiber.return = returnFiber;
	return fiber;
}

export const reconcileChildFibers = ChildReconciler(true);
export const mountChildFibers = ChildReconciler(false);
