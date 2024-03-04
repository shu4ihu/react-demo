import * as React from 'react';
import { useState } from 'react';
import ReactDOM from 'react-dom/client';

function App() {
	const [num, setNum] = useState(0);

	return (
		<div
			onClick={() => {
				setNum((num) => num + 1);
				setNum((num) => num + 2);
				setNum((num) => num + 3);
			}}
		>
			{num}
		</div>
	);
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<App />
);
