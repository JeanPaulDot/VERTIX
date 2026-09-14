// The server imports shared modules out of core/ (loadouts, gamemodes, utils,
// projectile...). A few of those files reach for things only the browser/Svelte
// build provides, which `tsc --noEmit` here has no way to know about:
//
//   - `$state` is a Svelte 5 rune, compiled away by vite-plugin-svelte.
//   - `import.meta.env` is Vite's define block.
//   - `window.graph` is the shared 2D context app.tsx installs at startup.
//
// At runtime none of it matters: import-hooks.ts stubs state.svelte.ts out, and
// the render-only code paths are guarded by `typeof window !== "undefined"`.
// These declarations exist purely so the server typecheck can see the whole
// program. svelte-check remains the authoritative typecheck for client code.

declare function $state<T>(initial: T): T;

interface ImportMeta {
	env: { DEV: boolean; PROD: boolean; MODE: string; [key: string]: unknown };
}

interface Window {
	graph: CanvasRenderingContext2D;
}
