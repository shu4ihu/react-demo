import { Container } from 'hostConfig';
import { Props } from 'shared/ReactTypes';

export const elementPropsKey = '__props';
// 事件类型列表，如果需要监听其他事件，可以在这里添加
const validEventTypeList = ['click'];

type EventCallback = (e: Event) => void;

interface SyntheticEvent extends Event {
	__stopPropagation: boolean;
}

interface Paths {
	capture: EventCallback[];
	bubble: EventCallback[];
}

export interface DOMElement extends Element {
	[elementPropsKey]?: Props;
}

/**
 * @description 更新 DOM 元素的属性
 * @param node DOM 元素
 * @param props 属性
 */
export function updateFiberProps(node: DOMElement, props: Props) {
	node[elementPropsKey] = props;
}

/**
 * @description 初始化事件
 * @param container 容器
 * @param eventType 事件类型
 * @returns
 */
export function initEvent(container: Container, eventType: string) {
	// 如果不是合法的事件类型，打印警告
	if (!validEventTypeList.includes(eventType)) {
		console.warn('未实现的事件类型', eventType);
		return;
	}

	if (__DEV__) {
		console.log('初始化', eventType);
	}

	// 监听事件
	container.addEventListener(eventType, (e) => {
		dispatchEvent(container, eventType, e);
	});
}

/**
 * @description 创建合成事件
 * @param e 原生事件
 * @returns 合成事件
 */
function createSyntheticEvent(e: Event) {
	// 初始合成事件及其属性 __stopPropagation
	const syntheticEvent = e as SyntheticEvent;
	syntheticEvent.__stopPropagation = false;
	// 保存原生事件的 stopPropagation 方法
	const originStopPropagation = e.stopPropagation;

	// 重写 stopPropagation 方法
	syntheticEvent.stopPropagation = () => {
		// 标记 __stopPropagation 为 true
		syntheticEvent.__stopPropagation = true;
		if (originStopPropagation) {
			originStopPropagation();
		}
	};
	return syntheticEvent;
}

/**
 * @description 分发事件
 * @param container 容器
 * @param eventType 事件类型
 * @param e 原生事件
 * @returns
 */
function dispatchEvent(container: Container, eventType: string, e: Event) {
	const targetElement = e.target;
	if (targetElement === null) {
		console.warn('事件不存在target');
		return;
	}
	// 1. 收集沿途的事件
	const { bubble, capture } = collectPaths(
		targetElement as DOMElement,
		container,
		eventType
	);
	// 2. 构造合成事件
	const se = createSyntheticEvent(e);
	// 3. 遍历 capture
	triggerEventFlow(capture, se);

	if (!se.__stopPropagation) {
		// 4. 遍历 bubble
		triggerEventFlow(bubble, se);
	}
}

/**
 * @description 触发事件流
 * @param paths 路径
 * @param se 合成事件
 */
function triggerEventFlow(paths: EventCallback[], se: SyntheticEvent) {
	// 遍历 paths，执行回调
	for (let i = 0; i < paths.length; i++) {
		const callback = paths[i];
		callback.call(null, se);

		// 如果 __stopPropagation 为 true，跳出循环
		if (se.__stopPropagation) {
			break;
		}
	}
}

/**
 * @description 根据事件类型获取事件回调名称
 * @param eventType 事件类型
 * @returns
 */
function getEventCallbackNameFromEventType(
	eventType: string
): string[] | undefined {
	return {
		click: ['onClickCapture', 'onClick']
	}[eventType];
}

/**
 * @description 收集事件
 * @param targetElement 目标元素
 * @param container 容器
 * @param eventType 事件类型
 * @returns
 */
function collectPaths(
	targetElement: DOMElement,
	container: Container,
	eventType: string
) {
	const paths: Paths = {
		capture: [],
		bubble: []
	};

	// 从 targetElement 开始，向上遍历，直到 container
	while (targetElement !== null && targetElement !== container) {
		// 收集
		const elementProps = targetElement[elementPropsKey];
		if (elementProps) {
			//  click -> onClick / onClickCapture
			const callbackNameList = getEventCallbackNameFromEventType(eventType);

			if (callbackNameList) {
				callbackNameList.forEach((callbackName, i) => {
					// 获取事件回调，添加到 paths 中
					const eventCallback = elementProps[callbackName];
					if (eventCallback) {
						if (i === 0) {
							paths.capture.unshift(eventCallback);
						} else {
							paths.bubble.push(eventCallback);
						}
					}
				});
			}
		}
		// 向上遍历
		targetElement = targetElement.parentNode as DOMElement;
	}

	return paths;
}
