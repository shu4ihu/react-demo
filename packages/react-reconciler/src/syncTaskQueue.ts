let syncQueue: ((...args: any[]) => void)[] | null = null;
let isFlushingSyncQueue = false;

export function scheduleSyncCallback(callback: (...args: any[]) => void) {
	if (!syncQueue) {
		syncQueue = [callback];
	} else {
		syncQueue.push(callback);
	}
}

export function flushSyncCallbacks() {
	if (!isFlushingSyncQueue && syncQueue) {
		isFlushingSyncQueue = true;
		try {
			syncQueue.forEach((callback) => {
				callback();
			});
			syncQueue = null;
		} catch (e) {
			if (__DEV__) {
				console.error('flushSyncCallback 发生错误', e);
			}
		} finally {
			isFlushingSyncQueue = false;
			syncQueue = null;
		}
	}
}
