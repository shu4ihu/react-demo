import {
	Container,
	appendInitialChild,
	createInstance,
	createTextInstance
} from 'hostConfig';
import { FiberNode } from './fiber';
import { HostComponent, HostRoot, HostText } from './workTag';
import { NoFlags } from './fiberFlags';

/** 递归中的归阶段，根据类型执行对应的操作
 * @description
 * @param wip work in progress
 * @returns
 */
export const completeWork = (wip: FiberNode) => {
	const newProps = wip.pendingProps;
	const current = wip.alternate;

	switch (wip.tag) {
		case HostComponent:
			// 如果 current 存在且 stateNode 存在，表示是更新操作，否则是挂载操作
			if (current !== null && wip.stateNode) {
				// update
			} else {
				// mount
				// 构建 DOM，然后将 DOM 插入到 DOM 树中
				// const instance = createInstance(wip.type, newProps);
				const instance = createInstance(wip.type);
				appendAllChildren(instance, wip);
				wip.stateNode = instance;
			}
			// 冒泡 flags
			bubbleProperties(wip);
			return null;
		case HostText:
			// HostText 类型：文本节点的内容就是它所代表的数据，所以不包含子节点，它的更新只涉及到文本内容的更新
			if (current !== null && wip.stateNode) {
				// update
			} else {
				// 构建 DOM
				const instance = createTextInstance(newProps.content);
				wip.stateNode = instance;
			}
			bubbleProperties(wip);
			return null;
		case HostRoot:
			return null;
		default:
			if (__DEV__) {
				console.warn('未处理的 completeWork 情况');
			}
			break;
	}
	return null;
};

/**
 * @description 将 wip 的所有子节点插入到 parent 中
 * @param parent 宿主环境下的父节点
 * @param wip work in progress
 * @returns
 */
function appendAllChildren(parent: Container, wip: FiberNode) {
	let node = wip.child;
	while (node !== null) {
		// 如果是 HostComponent 或 HostText，直接插入到 parent 中
		if (node.tag === HostComponent || node.tag === HostText) {
			appendInitialChild(parent, node.stateNode);
		} else if (node.child !== null) {
			// node 有子节点，遍历所有子节点
			node.child.return = node;
			node = node.child;
			continue;
		}

		// 根节点，结束循环
		if (node === wip) {
			return;
		}

		// 遍历兄弟节点
		while (node.sibling === null) {
			if (node.return === null || node.return === wip) {
				return;
			}
			node = node.return;
		}
		node.sibling.return = node.return;
		node = node.sibling;
	}
}

/**
 * @description 冒泡 flags，收集合并子节点的 flags，通过 subtreeFlags 记录
 * @param wip work in progress
 */
function bubbleProperties(wip: FiberNode) {
	let subtreeFlags = NoFlags;
	let child = wip.child;

	while (child !== null) {
		subtreeFlags |= child.subtreeFlags;
		subtreeFlags |= child.flags;

		child.return = wip;
		child = child.sibling;
	}

	wip.subtreeFlags |= subtreeFlags;
}
