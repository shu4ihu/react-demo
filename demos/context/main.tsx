import * as React from 'react';
import { createContext } from 'react';
import { useContext } from 'react';
import ReactDOM from 'react-dom';

const ctxA = createContext('default A');
const ctxB = createContext('default b');

function App() {
	return (
		<ctxA.Provider value={'A0'}>
			<ctxB.Provider value={'B0'}>
				<ctxA.Provider value={'A1'}>
					<Cpn />
				</ctxA.Provider>
				<Cpn />
			</ctxB.Provider>
			<Cpn />
		</ctxA.Provider>
	);
}

function Cpn() {
	const a = useContext(ctxA);
	const b = useContext(ctxB);
	return (
		<div>
			A: {a} B: {b}
		</div>
	);
}

ReactDOM.createRoot(document.querySelector('#root')).render(<App />);
