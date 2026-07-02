<script lang="ts">
	import AccountTab from "./tabs/AccountTab.svelte";
	import LoadoutTab from "./tabs/LoadoutTab.svelte";
	import ModTab from "./tabs/ModTab.svelte";

	let currentTab: "loadoutTab" | "accountTab" | "modTab" = $state("loadoutTab");
</script>

<!-- MENU TABS -->
<ul class="tab">
	<li>
		<div class="tablinks" class:active={currentTab === "loadoutTab"} onclick={() => currentTab = "loadoutTab"}>
			SETUP
		</div>
	</li>
	<li>
		<div class="tablinks" class:active={currentTab === "accountTab"} onclick={() => currentTab = "accountTab"}>
			ACCOUNT
		</div>
	</li>
	<li>
		<div class="tablinks" class:active={currentTab === "modTab"} onclick={() => currentTab = "modTab"}>MODS</div>
	</li>
</ul>

<!-- LOADOUT TAB -->
<div class="tabcontent" style:display={currentTab === "loadoutTab" ? "block" : "none"}><LoadoutTab /></div>

<!-- ACCOUNT TAB -->
<div class="tabcontent" style:display={currentTab === "accountTab" ? "block" : "none"}><AccountTab /></div>

<!-- MOD TAB -->
<div class="tabcontent" style:display={currentTab === "modTab" ? "block" : "none"}><ModTab /></div>

<style>
	ul.tab {
		width: 100%;
		list-style-type: none;
		margin: 0;
		padding: 0;
		overflow: hidden;
	}
	ul.tab li {
		display: table-cell;
	}

	.tablinks {
		cursor: pointer;
		display: block;
		color: black;
		text-align: center;
		padding: 11px;
		text-decoration: none;
		transition: 0.3s;
		font-size: 16px;
		background-color: #f2f2f2;
	}
	.tablinks:hover {
		background-color: #e6e6e6;
	}
	.tablinks.active {
		background-color: #d9d9d9;
	}
	.tabcontent {
		width: 300px;
		display: none;
		padding-top: 12px;
		border-top: none;
	}
</style>
