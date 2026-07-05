import { flushSync, mount } from "svelte";
import Friends from "./components/Friends.svelte";

mount(Friends, {
	target: document.querySelector("body")!,
});
flushSync();
