import { registerHooks } from "node:module";

const STUBBED = new Set(["howler"]);

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (STUBBED.has(specifier)) {
			return { url: "node:stub://" + specifier, shortCircuit: true };
		}
		if (context.parentURL && specifier.endsWith("state.svelte.ts")) {
			return { url: new URL(specifier, context.parentURL).href, shortCircuit: true };
		}
		return nextResolve(specifier, context);
	},
	load(url, context, nextLoad) {
		if (url === "node:stub://howler") {
			return {
				source: "export class Howl {} export class Howler {}",
				format: "module",
				shortCircuit: true,
			};
		}
		if (url.includes("state.svelte.ts")) {
			return {
				source: "export const st = null;",
				format: "module",
				shortCircuit: true,
			};
		}
		return nextLoad(url, context);
	},
});
