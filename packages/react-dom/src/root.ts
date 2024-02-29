// ReactDOM.createRoot(root).render(<App />)

import { Container } from 'hostConfig';
import {
	createContainer,
	updateContainer
} from 'react-reconciler/src/fiberReconciler';
import { ReactElementType } from 'shared/ReactTypes';

export function createRoot(container: Container) {
	const root = createContainer(container);
	// console.log('宿主根节点容器', root);
	return {
		render(element: ReactElementType) {
			// console.log('渲染', element);
			return updateContainer(element, root);
		}
	};
}
