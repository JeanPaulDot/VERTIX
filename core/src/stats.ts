import { flushSync, mount } from "svelte";
import Profile from "./components/Profile.svelte";

mount(Profile, {
	target: document.querySelector("body")!,
});
flushSync();
