import { flushSync, mount } from "svelte";
import "../assets/main.css";
import AdminApp from "./components/admin/AdminApp.svelte";

mount(AdminApp, {
	target: document.querySelector("#admin-root")!,
});
flushSync();
