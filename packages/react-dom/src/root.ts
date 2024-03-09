// ReactDOM.createRoot(root).render(<App />)

import { Container } from './hostConfig';
import {
	createContainer,
	updateContainer
} from 'react-reconciler/src/fiberReconciler';
import { ReactElementType } from 'shared/ReactTypes';
import { initEvent } from './SyntheticEvent';

export function createRoot(container: Container) {
	const root = createContainer(container);
	return {
		render(element: ReactElementType) {
			// 初始化 click 事件
			initEvent(container, 'click');
			return updateContainer(element, root);
		}
	};
}
