/** @type {import("@sveltejs/vite-plugin-svelte").SvelteConfig} */
export default {
	compilerOptions: {
		experimental: {
			async: true,
		},
		runes: true,
		hmr: true,
		preserveComments: true,
		// not ideal
		warningFilter: (w) => !w.code.includes("a11y"),
	},
	vitePlugin: {
		inspector: true,
	},
};
