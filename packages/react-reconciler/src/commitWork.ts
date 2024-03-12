import {
	Container,
	Instance,
	appendChildToContainer,
	commitUpdate,
	insertChildToContainer,
	removeChild
} from 'hostConfig';
import { FiberNode, FiberRootNode, PendingPassiveEffects } from './fiber';
import {
	ChildDeletion,
	Flags,
	LayoutMask,
	MutationMask,
	NoFlags,
	PassiveEffect,
	PassiveMask,
	Placement,
	Ref,
	Update
} from './fiberFlags';
import {
	FunctionComponent,
	HostComponent,
	HostRoot,
	HostText
} from './workTag';
import { Effect, FCUpdateQueue } from './fiberHooks';
import { HookHasEffect } from './hookEffectTags';

let nextEffect: FiberNode | null = null;

const commitEffects = (
	phrase: 'mutation' | 'layout',
	mask: Flags,
	callback: (fiber: FiberNode, root: FiberRootNode) => void
) => {
	return (finishedWork: FiberNode, root: FiberRootNode) => {
		nextEffect = finishedWork;

		while (nextEffect !== null) {
			const child: FiberNode | null = nextEffect.child;

			if (
				((nextEffect.subtreeFlags & MutationMask) | PassiveEffect) !==
					NoFlags &&
				child !== null
			) {
				nextEffect = child;
			} else {
				up: while (nextEffect !== null) {
					callback(nextEffect, root);
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
};

/**
 * @description 提交 Mutation Effect，根据 finishedWork 的 flags 执行对应的操作
 * @param finishedWork 当前工作中的 FiberNode
 */
const commitMutationEffectOnFiber = (
	finishedWork: FiberNode,
	root: FiberRootNode
) => {
	const { flags, tag } = finishedWork;

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
				commitDeletion(childToDelete, root);
			});
		}
		finishedWork.flags &= ~ChildDeletion;
	}
	if ((flags & PassiveEffect) !== NoFlags) {
		// 收集回调
		commitPassiveEffect(finishedWork, root, 'update');
		finishedWork.flags &= ~PassiveEffect;
	}

	if ((flags & Ref) !== NoFlags && tag === HostComponent) {
		safelyDetachRef(finishedWork);
	}
};

function safelyDetachRef(current: FiberNode) {
	const ref = current.ref;
	if (ref !== null) {
		if (typeof ref === 'function') {
			ref(null);
		} else {
			ref.current = null;
		}
	}
}

const commitLayoutEffectOnFiber = (
	finishedWork: FiberNode,
	root: FiberRootNode
) => {
	const { flags, tag } = finishedWork;

	if ((flags & Ref) !== NoFlags && tag === HostComponent) {
		// 绑定新的 ref
		safelyAttachRef(finishedWork);
		finishedWork.flags &= ~Ref;
	}
};

function safelyAttachRef(fiber: FiberNode) {
	const ref = fiber.ref;
	if (ref !== null) {
		const instance = fiber.stateNode;
		if (typeof ref === 'function') {
			ref(instance);
		} else {
			ref.current = instance;
		}
	}
}

/**
 * @description 提交 Mutation Effect，不断向下遍历 fiber tree，同时判断 subtreeFlags 是否有 MutationMask 标记
 * @param finishedWork 当前工作中的 FiberNode
 */
export const commitMutationEffects = commitEffects(
	'mutation',
	MutationMask | PassiveMask,
	commitMutationEffectOnFiber
);

export const commitLayoutEffects = commitEffects(
	'layout',
	LayoutMask,
	commitLayoutEffectOnFiber
);

function commitPassiveEffect(
	fiber: FiberNode,
	root: FiberRootNode,
	type: keyof PendingPassiveEffects
) {
	if (
		fiber.tag !== FunctionComponent ||
		(type === 'update' && (fiber.flags & PassiveEffect) === NoFlags)
	) {
		return;
	}

	const updateQueue = fiber.updateQueue as FCUpdateQueue<any>;
	if (updateQueue !== null) {
		if (updateQueue.lastEffect === null && __DEV__) {
			console.warn(
				'当 FC 存在 PassiveEffect 时，updateQueue.lastEffect 不能为空'
			);
		}
		root.pendingPassiveEffects[type].push(updateQueue.lastEffect as Effect);
	}
}

function commitHookEffectList(
	flags: Flags,
	lastEffect: Effect,
	callback: (effect: Effect) => void
) {
	let effect = lastEffect.next as Effect;

	do {
		if ((effect.tag & flags) === flags) {
			callback(effect);
		}
		effect = effect.next as Effect;
	} while (effect !== lastEffect.next);
}

export function commitHookEffectListUnmount(flags: Flags, lastEffect: Effect) {
	commitHookEffectList(flags, lastEffect, (effect) => {
		const destroy = effect.destroy;
		if (typeof destroy === 'function') {
			destroy();
		}
		effect.tag &= ~HookHasEffect;
	});
}

export function commitHookEffectListDestroy(flags: Flags, lastEffect: Effect) {
	commitHookEffectList(flags, lastEffect, (effect) => {
		const destroy = effect.destroy;
		if (typeof destroy === 'function') {
			destroy();
		}
	});
}

export function commitHookEffectListCreate(flags: Flags, lastEffect: Effect) {
	commitHookEffectList(flags, lastEffect, (effect) => {
		const create = effect.create;
		if (typeof create === 'function') {
			effect.destroy = create();
		}
	});
}

function recordHostChildrenToDelete(
	childrenToDelete: FiberNode[],
	unmountFiber: FiberNode
) {
	// 1. 找到第一个 root host 节点
	const lastOne = childrenToDelete[childrenToDelete.length - 1];

	// 最后一个不存在，说明还没记录过要删除的 host 节点
	if (!lastOne) {
		childrenToDelete.push(unmountFiber);
	} else {
		let node = lastOne.sibling;
		while (node !== null) {
			if (unmountFiber === node) {
				childrenToDelete.push(unmountFiber);
			}
			node = node.sibling;
		}
	}

	// 2. 每找到一个 host 节点，判断下这个节点是不是 1 找到那个节点的兄弟节点
}

/**
 * @description 提交 Deletion 操作，递归遍历子树，执行删除操作
 * @param childToDelete 需要被删除的子节点
 */
function commitDeletion(childToDelete: FiberNode, root: FiberRootNode) {
	const rootChildrenToDelete: FiberNode[] = [];

	// 递归子树
	commitNestedComponent(childToDelete, (unmountFiber) => {
		switch (unmountFiber.tag) {
			case HostComponent:
				recordHostChildrenToDelete(rootChildrenToDelete, unmountFiber);
				// 解绑 ref
				safelyDetachRef(unmountFiber);
				return;
			case HostText:
				recordHostChildrenToDelete(rootChildrenToDelete, unmountFiber);
				return;
			case FunctionComponent:
				commitPassiveEffect(unmountFiber, root, 'unmount');
				return;
			default:
				if (__DEV__) {
					console.warn('未处理的 unmount 情况', unmountFiber);
				}
				return null;
		}
	});

	// 移除 rootHostNode 的 DOM 树
	if (rootChildrenToDelete.length !== 0) {
		const hostParent = getHostParent(childToDelete);
		if (hostParent !== null) {
			rootChildrenToDelete.forEach((node) => {
				removeChild(node.stateNode, hostParent);
			});
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

	// host sibling
	const sibling = getHostSibling(finishedWork);

	// finishedWork ~ DOM appendChild -> parent
	if (hostParent !== null) {
		insertOrAppendPlacementNodeIntoContainer(finishedWork, hostParent, sibling);
	}
};

function getHostSibling(fiber: FiberNode) {
	let node: FiberNode = fiber;

	findSibling: while (true) {
		while (node.sibling === null) {
			const parent = node.return;

			if (
				parent === null ||
				parent.tag === HostComponent ||
				parent.tag === HostRoot
			) {
				return null;
			}
			node = parent;
		}

		node.sibling.return = node.return;

		node = node.sibling;

		while (node.tag !== HostText && node.tag !== HostComponent) {
			// 向下遍历
			if ((node.flags & Placement) !== NoFlags) {
				continue findSibling;
			}
			if (node.child === null) {
				continue findSibling;
			} else {
				node.child.return = node;
				node = node.child;
			}
		}

		if ((node.flags & Placement) === NoFlags) {
			return node.stateNode;
		}
	}
}

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
function insertOrAppendPlacementNodeIntoContainer(
	finishedWork: FiberNode,
	hostParent: Container,
	before?: Instance
) {
	// fiber host
	if (finishedWork.tag === HostComponent || finishedWork.tag === HostText) {
		if (before) {
			insertChildToContainer(finishedWork.stateNode, hostParent, before);
		} else {
			appendChildToContainer(hostParent, finishedWork.stateNode);
		}
		return;
	}
	const child = finishedWork.child;
	if (child !== null) {
		insertOrAppendPlacementNodeIntoContainer(child, hostParent);
		let sibling = child.sibling;

		while (sibling !== null) {
			insertOrAppendPlacementNodeIntoContainer(sibling, hostParent);
			sibling = sibling.sibling;
		}
	}
}
