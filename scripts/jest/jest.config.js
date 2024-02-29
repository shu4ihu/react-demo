const { defaults } = require('jest-config');

module.exports = {
	...defaults,
	rootDir: process.cwd(),
	modulePathIgnorePatterns: ['<rootDir>/.hostConfig'],
	moduleDirectories: [
		// 对于 React ReactDOM
		'dist/node_modules',
		// 第三方依赖
		...defaults.moduleDirectories
	],
	testEnvironment: 'jsdom'
};
