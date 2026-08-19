export interface RGBA {
	r: number
	g: number
	b: number
	a: number
	hex: string
}

export function hex2rgba(hex: string | number): RGBA {
	if (typeof hex === "number") hex = hex.toString()
	if (typeof hex !== "string") {
		throw new Error("Color should be defined as hex string")
	}

	let hexCode = hex.slice().replace("#", "").split("")
	if (hexCode.length < 3 || hexCode.length === 5 || hexCode.length > 8) {
		throw new Error("Invalid hex color: " + hex)
	}

	if (hexCode.length === 3 || hexCode.length === 4) {
		hexCode = Array.prototype.concat.apply(
			[],
			hexCode.map((c) => [c, c]),
		)
	}

	if (hexCode.length === 6) hexCode.push("F", "F")

	const hexValue = parseInt(hexCode.join(""), 16)

	return {
		r: (hexValue >> 24) & 255,
		g: (hexValue >> 16) & 255,
		b: (hexValue >> 8) & 255,
		a: hexValue & 255,
		hex: "#" + hexCode.slice(0, 6).join(""),
	}
}

export type ModuleStyle = "square" | "dots" | "rounded"

export interface LogoOptions {
	src: string
	size?: number
	position?: "center" | "bottom-right"
	padding?: number
	naturalWidth?: number
	naturalHeight?: number
}

export interface RenderOptions {
	width?: number
	margin?: number
	scale?: number
	color?: { dark?: string; light?: string }
	moduleStyle?: ModuleStyle
	cornerRadius?: number
	logo?: LogoOptions
}

export interface NormalizedOptions {
	width: number | undefined
	scale: number
	margin: number
	color: { dark: RGBA; light: RGBA }
	moduleStyle: ModuleStyle
	cornerRadius: number
	logo: LogoOptions | null
}

export function getOptions(options?: RenderOptions): NormalizedOptions {
	const opts = options ?? {}
	const colorOpts = opts.color ?? {}

	const margin =
		typeof opts.margin === "undefined" || opts.margin === null || opts.margin < 0
			? 4
			: opts.margin

	const width = opts.width && opts.width >= 21 ? opts.width : undefined
	const scale = opts.scale || 4

	return {
		width,
		scale: width ? 4 : scale,
		margin,
		color: {
			dark: hex2rgba(colorOpts.dark || "#000000ff"),
			light: hex2rgba(colorOpts.light || "#ffffffff"),
		},
		moduleStyle: opts.moduleStyle || "square",
		cornerRadius: typeof opts.cornerRadius === "number" ? opts.cornerRadius : 0.35,
		logo: opts.logo || null,
	}
}
