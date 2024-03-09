import * as React from 'react';
import { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';

function App() {
	const [count, setCount] = useState(100);
	return (
		<ul onClick={() => setCount(50)}>
			{new Array(count).fill(0).map((_, i) => (
				<Child key={i}>{i}</Child>
			))}
		</ul>
	);
}

function Child({ children }) {
	const now = performance.now();
	while (performance.now() - now < 4) {}
	return <li>{children}</li>;
}

ReactDOM.createRoot(document.querySelector('#root')).render(<App />);
