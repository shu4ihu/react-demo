import { FiberNode } from 'react-reconciler/src/fiber';
import { HostText } from 'react-reconciler/src/workTag';

export type Container = Element;
export type Instance = Element;
export type TextInstance = Text;

/**
 * @description 创建 DOM 元素
 * @param type DOM 元素类型
 * @returns DOM 元素
 */
export const createInstance = (type: string): Instance => {
	// TODO 处理 props
	const element = document.createElement(type);
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
			const text = fiber.memorizedProps.content;
			return commitTextUpdate(fiber.stateNode, text);

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
