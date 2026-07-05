import { flushSync, mount } from "svelte";
import Clans from "./components/Clans.svelte";

mount(Clans, {
	target: document.querySelector("body")!,
});
flushSync();
