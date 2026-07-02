<script lang="ts">
	import type { Camo, Hat, Shirt } from "../../types.ts";
	import { getItemRarityColor } from "../../utils.ts";

	type Props = (
		| { type: "hat"; item: Hat }
		| { type: "shirt"; item: Shirt }
		| { type: "camo"; item: Camo; weaponName?: string }
	) & { duplicate?: boolean };

	const props: Props = $props();
	const item = $derived(props.item);
	const type = $derived(props.type);
</script>

<div class="hoverTooltip">
	<img class={`${type}DisplayImage`} src={`/images/${type}s/${item.id}/d.png`}>
	<div style:color={getItemRarityColor(item.chance)} style:font-size={"16px"} style:margin-top={"5px"}>{item.name}</div>
	<div style="color: #ffd100; font-size: 12px; margin-top: 0px">droprate {item.chance}%</div>
	<div style="font-size: 8px; color: #d8d8d8; margin-top: 1px">
		<i>
			{props.duplicate ? "Duplicate" 
			  : type === "hat" ? "wearable" 
			  : type === "shirt" ? "shirt" 
			  : "weapon camo"}
		</i>
	</div>

	<div style="font-size: 12px; margin-top: 5px">
		{props.type === "camo" ? props.weaponName ?? "Unknown Weapon" : props.item.desc}
	</div>

	{#if "creator" in item && item.creator !== "EatMyApples"}
		<div style="font-size: 8px; color: #d8d8d8; margin-top: 5px"><i>Artist: {item.creator}</i></div>
	{/if}
</div>
