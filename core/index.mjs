import './data.mjs';
import './policy.mjs';
import './commands.mjs';
import './views.mjs';
import './packs.mjs';
import './bus.mjs';
globalThis.__apCoreReady = true;
globalThis.dispatchEvent(new Event('ap-core-ready'));
