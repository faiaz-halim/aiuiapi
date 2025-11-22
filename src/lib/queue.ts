import { Mutex } from 'async-mutex';

// Global lock for the browser
// Only one request can control the browser at a time.
export const requestLock = new Mutex();
