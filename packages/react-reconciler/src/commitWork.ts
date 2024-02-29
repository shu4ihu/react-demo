import {
	Container,
	appendChildToContainer,
	commitUpdate,
	removeChild
} from 'hostConfig';
import { FiberNode, FiberRootNode } from './fiber';
import {
	ChildDeletion,
	MutationMask,
	NoFlags,
	Placement,
	Update
} from './fiberFlags';
import {
	FunctionComponent,
	HostComponent,
	HostRoot,
	HostText
} from './workTag';

let nextEffect: FiberNode | null = null;

/**
 * @description 提交 Mutation Effect，不断向下遍历 fiber tree，同时判断 subtreeFlags 是否有 MutationMask 标记
 * @param finishedWork 当前工作中的 FiberNode
 */
export const commitMutationEffects = (finishedWork: FiberNode) => {
	nextEffect = finishedWork;

	while (nextEffect !== null) {
		const child: FiberNode | null = nextEffect.child;

		if (
			(nextEffect.subtreeFlags & MutationMask) !== NoFlags &&
			child !== null
		) {
			nextEffect = child;
		} else {
			up: while (nextEffect !== null) {
				commitMutationEffectOnFiber(nextEffect);
				const sibling: FiberNode | null = nextEffect.sibling;

				if (sibling !== null) {
					nextEffect = sibling;
					break up;
				}
				nextEffect = nextEffect.return;
			}
		}
	}
};

/**
 * @description 提交 Mutation Effect，根据 finishedWork 的 flags 执行对应的操作
 * @param finishedWork 当前工作中的 FiberNode
 */
const commitMutationEffectOnFiber = (finishedWork: FiberNode) => {
	const flags = finishedWork.flags;

	if ((flags & Placement) !== NoFlags) {
		commitPlacement(finishedWork);
		finishedWork.flags &= ~Placement;
	}

	if ((flags & Update) !== NoFlags) {
		commitUpdate(finishedWork);
		finishedWork.flags &= ~Update;
	}

	if ((flags & ChildDeletion) !== NoFlags) {
		const deletions = finishedWork.deletions;
		if (deletions !== null) {
			// 删除操作集合不为空，提交删除操作
			deletions.forEach((childToDelete) => {
				commitDeletion(childToDelete);
			});
		}
		finishedWork.flags &= ~ChildDeletion;
	}
};

/**
 * @description 提交 Deletion 操作，递归遍历子树，执行删除操作
 * @param childToDelete 需要被删除的子节点
 */
function commitDeletion(childToDelete: FiberNode) {
	let rootHostNode: FiberNode | null = null;

	// 递归子树
	commitNestedComponent(childToDelete, (unmountFiber) => {
		switch (unmountFiber.tag) {
			case HostComponent:
				if (rootHostNode === null) {
					rootHostNode = unmountFiber;
				}
				// TODO 解绑 ref
				return;
			case HostText:
				if (rootHostNode === null) {
					rootHostNode = unmountFiber;
				}
				return;
			case FunctionComponent:
				// TODO useEffect unmount
				return;
			default:
				if (__DEV__) {
					console.warn('未处理的 unmount 情况', unmountFiber);
				}
				return null;
		}
	});

	// 移除 rootHostNode 的 DOM 树
	if (rootHostNode !== null) {
		const hostParent = getHostParent(childToDelete);
		if (hostParent !== null) {
			removeChild((rootHostNode as FiberNode).stateNode, hostParent);
		}
	}

	childToDelete.return = null;
	childToDelete.child = null;
}

/**
 *
 * @param root 根节点
 * @param onCommitUnmount 回调函数
 * @returns
 */
function commitNestedComponent(
	root: FiberNode,
	onCommitUnmount: (fiber: FiberNode) => void
) {
	let node = root;
	while (true) {
		// 执行回调
		onCommitUnmount(node);

		if (node.child !== null) {
			// 向下遍历
			node.child.return = node;
			node = node.child;
			continue;
		}

		if (node === root) {
			return;
		}

		while (node.sibling === null) {
			if (node.return === null || node.return === root) {
				return;
			}

			// 向上返回
			node = node.return;
		}
		node.sibling.return = node.return;
		node = node.sibling;
	}
}

/**
 * @description 提交 Placement 操作，将当前工作中的 FiberNode 插入到 DOM 树中
 * @param finishedWork 当前工作中的 FiberNode
 */
const commitPlacement = (finishedWork: FiberNode) => {
	if (__DEV__) {
		console.warn('执行 Placement 操作', finishedWork);
	}
	// parent DOM
	// 执行 Placement 操作，需要先找到 parent DOM
	const hostParent = getHostParent(finishedWork);
	// console.log('hostParent', hostParent);
	// finishedWork ~ DOM appendChild -> parent
	if (hostParent !== null) {
		appendPlacementNodeIntoContainer(finishedWork, hostParent);
	}
};

/**
 * @description 不断向上遍历，知道找到 HostComponent 或 HostRoot，返回它的 stateNode
 * 如果找不到，返回 null
 * @param fiber 当前工作中的 FiberNode
 * @returns 返回宿主父节点 hostParent
 */
function getHostParent(fiber: FiberNode): Container | null {
	let parent = fiber.return;

	while (parent) {
		const parentTag = parent.tag;
		if (parentTag === HostComponent) {
			return parent.stateNode as Container;
		}
		if (parentTag === HostRoot) {
			return (parent.stateNode as FiberRootNode).container;
		}
		parent = parent.return;
	}

	if (__DEV__) {
		console.warn('未找到 host parent');
	}

	return null;
}

/**
 * @description 将当前工作中的 FiberNode 插入到 DOM 树中，递归调用，直到找到 HostComponent 或 HostText，然后执行 appendChildToContainer
 * @param finishedWork 当前工作中的 FiberNode
 * @param hostParent 宿主父节点
 */
function appendPlacementNodeIntoContainer(
	finishedWork: FiberNode,
	hostParent: Container
) {
	// fiber host
	if (finishedWork.tag === HostComponent || finishedWork.tag === HostText) {
		appendChildToContainer(hostParent, finishedWork.stateNode);
		return;
	}
	const child = finishedWork.child;
	if (child !== null) {
		appendPlacementNodeIntoContainer(child, hostParent);
		let sibling = child.sibling;

		while (sibling !== null) {
			appendPlacementNodeIntoContainer(sibling, hostParent);
			sibling = sibling.sibling;
		}
	}
}
