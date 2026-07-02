import { readdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import type { GenData } from "core/src/types.ts";

export const defaultGenData: GenData[] = [];

const dir = join(import.meta.dirname, "./maps");
const files = (await readdir(dir))
	.filter((f) => f.endsWith(".png"))
	.toSorted((a, b) => parseInt(a, 10) - parseInt(b, 10));

for (const file of files) {
	const { data, info } = await sharp(join(dir, file))
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });

	defaultGenData.push({
		width: info.width,
		height: info.height,
		data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
	});
}
