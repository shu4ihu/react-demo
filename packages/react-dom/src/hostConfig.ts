import { FiberNode } from 'react-reconciler/src/fiber';
import { HostComponent, HostText } from 'react-reconciler/src/workTag';
import { updateFiberProps } from './SyntheticEvent';
import { Props } from 'shared/ReactTypes';

export type Container = Element;
export type Instance = Element;
export type TextInstance = Text;

/**
 * @description 创建 DOM 元素
 * @param type DOM 元素类型
 * @returns DOM 元素
 */
export const createInstance = (type: string, props: Props): Instance => {
	const element = document.createElement(type);
	// 更新属性
	updateFiberProps(element, props);
	return element;
};

/**
 * @description 将 child 插入到 parent 中
 * @param parent DOM 元素
 * @param child 需要插入 parent 的 DOM 元素
 */
export const appendInitialChild = (
	parent: Instance | Container,
	child: Instance
) => {
	parent.appendChild(child);
};

/**
 * @description 创建文本节点
 * @param content 文本内容
 * @returns textNode 元素
 */
export const createTextInstance = (content: string) => {
	return document.createTextNode(content);
};

export const appendChildToContainer = appendInitialChild;

/**
 * @description 提交更新
 * @param fiber FiberNode
 * @returns
 */
export function commitUpdate(fiber: FiberNode) {
	switch (fiber.tag) {
		case HostText:
			// HostText 类型的处理
			const text = fiber.memoizedProps.content;
			return commitTextUpdate(fiber.stateNode, text);
		case HostComponent:
			// HostComponent 类型的处理
			return updateFiberProps(fiber.stateNode, fiber.memoizedProps);
		default:
			if (__DEV__) {
				console.warn('未实现的 Update 情况', fiber);
			}
			break;
	}
}

/**
 * @description 提交 HostText 类型的更新
 * @param textInstance 文本实例
 * @param content 文本内容
 */
export function commitTextUpdate(textInstance: TextInstance, content: string) {
	textInstance.textContent = content;
}

/**
 * @description 删除子节点
 * @param child 子节点
 * @param container 父节点
 */
export function removeChild(
	child: Instance | TextInstance,
	container: Container
) {
	container.removeChild(child);
}

/**
 * @description 插入子节点
 * @param child 子节点
 * @param container 父节点
 * @param before 在哪个节点之前插入
 */
export function insertChildToContainer(
	child: Instance,
	container: Container,
	before: Instance
) {
	container.insertBefore(child, before);
}

export const scheduleMicroTask =
	typeof queueMicrotask === 'function'
		? queueMicrotask
		: typeof Promise === 'function'
			? (callback: () => void) => Promise.resolve(null).then(callback)
			: setTimeout;
