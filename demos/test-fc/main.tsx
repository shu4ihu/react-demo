import * as React from 'react';
import { useState, useEffect } from 'react';
import ReactDOM from 'react-noop-renderer';

function App() {
	return (
		<>
			<Child></Child>
			<div>hello world</div>
		</>
	);
}

function Child() {
	return 'i am a child';
}

const root = ReactDOM.createRoot();

root.render(<App />);

window.root = root;
