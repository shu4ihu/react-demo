export type Container = Element;
export type Instance = Element;

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
