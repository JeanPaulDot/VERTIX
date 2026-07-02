import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import type { UserConfig } from "vite";

export default {
	appType: "mpa",
	plugins: [svelte()],
	build: {
		target: "esnext",
		// https://vite.dev/guide/build#multi-page-app
		rollupOptions: {
			input: {
				main: fileURLToPath(new URL("./index.html", import.meta.url)),
				leaderboards: fileURLToPath(new URL("./leaderboards.html", import.meta.url)),
				profile: fileURLToPath(new URL("./profile.html", import.meta.url)),
				donate: fileURLToPath(new URL("./donate.html", import.meta.url)),
			},
		},
	},
	server: {
		// listen on all interfaces so friends on the same network can join via this machine's IP
		host: true,
		allowedHosts: [".trycloudflare.com"],
		proxy: {
			"/api": "http://localhost:1118",
			"/socket.io": {
				target: "http://localhost:1119",
				ws: true,
			},
		},
	},
} satisfies UserConfig;
