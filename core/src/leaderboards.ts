import { flushSync, mount } from "svelte";
import Leaderboards from "./components/Leaderboards.svelte";

mount(Leaderboards, {
	target: document.querySelector("body")!,
});
flushSync();
