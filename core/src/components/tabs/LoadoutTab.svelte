<script lang="ts">
	import { st } from "../../state.svelte.ts";
	import { getItemRarityColor, getUnlockScoreThreshold } from "../../utils.ts";
	import CosmeticTooltip from "./CosmeticTooltip.svelte";
	import SprayTooltip from "./SprayTooltip.svelte";

	// guests keep today's free-selection behavior (matches the server's bypass
	// for accounts with no persistent unlocks to check against)
	function isOwned(unlocked: Set<number>, itemId: number): boolean {
		return !st.loggedIn || unlocked.has(itemId);
	}

	let currentScreen:
		| "main"
		| "class"
		| "primaryCamo"
		| "secondaryCamo"
		| "hat"
		| "shirt"
		| "spray" = $state("main");

	// sync preferences to localStorage
	function savePref(key: string, value: string | undefined) {
		console.debug(`saving ${value} to ${key}`);
		if (value) {
			localStorage.setItem(key, value);
		} else {
			localStorage.removeItem(key);
		}
	}
	$effect(() => {
		savePref("prevHat", st.loadout.hat?.id.toString());
	});
	$effect(() => {
		savePref("prevShirt", st.loadout.shirt?.id.toString());
	});
	$effect(() => {
		savePref("prevSpray", st.loadout.spray?.id.toString());
	});
	$effect(() => {
		savePref("prevPrimaryCamo", st.loadout.primaryCamo?.id.toString());
	});
	$effect(() => {
		savePref("prevSecondaryCamo", st.loadout.secondaryCamo?.id.toString());
	});
	$effect(() => {
		savePref("prevClass", st.loadout.class?.folderName.toString());
	});

	// sync selected cosmetics to server
	$effect(() => {
		st.socket?.emit("cCamo", {
			weaponID: st.loadout.class.weaponIndexes[0],
			camoID: st.loadout.primaryCamo?.id ?? 0,
		});
	});
	$effect(() => {
		st.socket?.emit("cCamo", {
			weaponID: st.loadout.class.weaponIndexes[1],
			camoID: st.loadout.secondaryCamo?.id ?? 0,
		});
	});
	$effect(() => {
		st.socket?.emit("cHat", st.loadout.hat?.id ?? -1);
	});
	$effect(() => {
		st.socket?.emit("cShirt", st.loadout.shirt?.id ?? -1);
	});
	$effect(() => {
		st.socket?.emit("cSpray", st.loadout.spray?.id ?? 1);
	});

</script>
<div style:display={currentScreen === "main" ? "block" : "none"}>
	<div>
		<b>Class:</b>
		<div class="hatSelectItem" onclick={() => currentScreen = "class"} style="display:inline-block">
			{st.loadout.class.classN}
		</div>
	</div>
	<div onclick={() => currentScreen = "primaryCamo"} style="margin-top:-5px;">
		<b>Primary: </b>
		<div
			class="hatSelectItem"
			style="display:inline-block"
			style:color={st.loadout.primaryCamo ? getItemRarityColor(st.loadout.primaryCamo.chance) : undefined}
		>
			{st.loadout.primaryCamo?.name ?? st.loadout.class.pWeapon}
		</div>
	</div>
	<div onclick={() => currentScreen = "secondaryCamo"} style="margin-top:-5px;">
		<b>Secondary: </b>
		<div
			class="hatSelectItem"
			style="display:inline-block"
			style:color={st.loadout.secondaryCamo ? getItemRarityColor(st.loadout.secondaryCamo.chance) : undefined}
		>
			{st.loadout.secondaryCamo?.name ?? st.loadout.class.sWeapon}
		</div>
	</div>
	<div onclick={() => currentScreen = "hat"} style="margin-top:-5px;">
		<b>Hat:</b>
		<div
			class="hatSelectItem"
			style="display:inline-block"
			style:color={st.loadout.hat ? getItemRarityColor(st.loadout.hat.chance) : undefined}
		>
			{st.loadout.hat?.name ?? "Default"}
			{#if st.loadout.hat}
				<CosmeticTooltip type="hat" item={st.loadout.hat} />
			{/if}
		</div>
	</div>
	<div onclick={() => currentScreen = "shirt"} style="margin-top:-5px;">
		<b>Shirt:</b>
		<div
			class="hatSelectItem"
			style="display:inline-block"
			style:color={st.loadout.shirt ? getItemRarityColor(st.loadout.shirt.chance) : undefined}
		>
			{st.loadout.shirt?.name ?? "Default"}
			{#if st.loadout.shirt}
				<CosmeticTooltip type="shirt" item={st.loadout.shirt} />
			{/if}
		</div>
	</div>
	<div onclick={() => currentScreen = "spray"} style="margin-top:-5px;">
		<b>Spray:</b>
		<div class="hatSelectItem" style="display:inline-block">
			{st.loadout.spray?.name ?? "Strike"}
			{#if st.loadout.spray}
				<SprayTooltip spray={st.loadout.spray} />
			{/if}
		</div>
	</div>
</div>

<div style:display={currentScreen === "class" ? "block" : "none"}>
	<h3 class="menuHeaderTabbed">SELECT CLASS</h3>
	<div id="classList">
		{#each st.characterClasses.filter(c => c.classN !== "???") as cls}
			<div class="hatSelectItem" onclick={() => {st.loadout.class = cls; currentScreen = "main"}}>{cls.classN}</div>
		{/each}
	</div>
</div>

<div
	class="cosmeticSelector"
	style:display={currentScreen === "primaryCamo" || currentScreen === "secondaryCamo" ? "block" : "none"}
>
	<h3 class="menuHeaderTabbed">SELECT CAMO</h3>
	<div>
		<div
			class="hatSelectItem"
			onclick={() => {st.loadout[currentScreen as "primaryCamo" | "secondaryCamo"] = null; currentScreen = "main"}}
		>
			Default
		</div>
		<!-- hack (assuming every weapon has the same camo list, which is correct for now, but maybe not in the future) -->
		{#each st.cosmetics.camos[0] as camo}
			{@const owned = isOwned(st.unlockedItems.camo, camo.id)}
			<div
				class="hatSelectItem"
				class:lockedItem={!owned}
				style:color={getItemRarityColor(camo.chance)}
				onclick={() => { if (owned) { st.loadout[currentScreen as "primaryCamo" | "secondaryCamo"] = camo; currentScreen = "main" } }}
			>
				{camo.name}
				{#if owned}
					<span class="ownedTag">OWNED</span>
				{:else}
					<span class="lockHint">{getUnlockScoreThreshold(camo.chance).toLocaleString()} score</span>
				{/if}
			</div>
		{/each}
	</div>
</div>

<div class="cosmeticSelector" style:display={currentScreen === "hat" ? "block" : "none"}>
	<h3 class="menuHeaderTabbed">SELECT HAT</h3>
	<div>
		<div class="hatSelectItem" onclick={() => {st.loadout.hat = null; currentScreen = "main"}}>Default</div>
		{#each st.cosmetics.hats as hat}
			{@const owned = isOwned(st.unlockedItems.hat, hat.id)}
			<div
				class="hatSelectItem"
				class:lockedItem={!owned}
				style:color={getItemRarityColor(hat.chance)}
				onclick={() => { if (owned) { st.loadout.hat = hat; currentScreen = "main" } }}
			>
				{hat.name}
				{#if owned}
					<CosmeticTooltip type="hat" item={hat} />
				{:else}
					<span class="lockHint">{getUnlockScoreThreshold(hat.chance).toLocaleString()} score</span>
				{/if}
			</div>
		{/each}
	</div>
</div>

<div class="cosmeticSelector" style:display={currentScreen === "shirt" ? "block" : "none"}>
	<h3 class="menuHeaderTabbed">SELECT SHIRT</h3>
	<div>
		<div class="hatSelectItem" onclick={() => {st.loadout.shirt = null; currentScreen = "main"}}>Default</div>
		{#each st.cosmetics.shirts as shirt}
			{@const owned = isOwned(st.unlockedItems.shirt, shirt.id)}
			<div
				class="hatSelectItem"
				class:lockedItem={!owned}
				style:color={getItemRarityColor(shirt.chance)}
				onclick={() => { if (owned) { st.loadout.shirt = shirt; currentScreen = "main" } }}
			>
				{shirt.name}
				{#if owned}
					<CosmeticTooltip type="shirt" item={shirt} />
				{:else}
					<span class="lockHint">{getUnlockScoreThreshold(shirt.chance).toLocaleString()} score</span>
				{/if}
			</div>
		{/each}
	</div>
</div>

<div class="cosmeticSelector" style:display={currentScreen === "spray" ? "block" : "none"}>
	<h3 class="menuHeaderTabbed">SELECT SPRAY</h3>
	<div>
		{#each st.sprays as spray}
			<div class="hatSelectItem" onclick={() => {st.loadout.spray = spray; currentScreen = "main"}}>
				{spray.name}
				<SprayTooltip {spray} />
			</div>
		{/each}
	</div>
</div>

<style>
	.cosmeticSelector {
		max-height: 240px;
		overflow-y: scroll;
		overflow-x: hidden;
	}

	#classList {
		max-height: 190px;
		overflow-y: scroll;
	}

	.lockedItem {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.lockHint,
	.ownedTag {
		font-size: 10px;
		opacity: 0.8;
		margin-left: 4px;
	}
</style>
