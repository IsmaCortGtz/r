import { getOptions } from "./color-utils.js"
import type { RGBA, RenderOptions, NormalizedOptions, ModuleStyle } from "./color-utils.js"
import type { QRCodeData } from "../core/qrcode.js"

function getColorAttrib(color: RGBA, attrib: string): string {
	const alpha = color.a / 255
	const str = attrib + '="' + color.hex + '"'
	return alpha < 1
		? str + " " + attrib + '-opacity="' + alpha.toFixed(2).slice(1) + '"'
		: str
}

// ── Square style (original optimized path) ──────────────
function qrToSquarePath(data: Uint8Array, size: number, margin: number): string {
	let path = ""
	let moveBy = 0
	let newRow = false
	let lineLength = 0

	for (let i = 0; i < data.length; i++) {
		const col = Math.floor(i % size)
		const row = Math.floor(i / size)

		if (!col && !newRow) newRow = true

		if (data[i]) {
			lineLength++

			if (!(i > 0 && col > 0 && data[i - 1])) {
				path += newRow
					? "M" + (col + margin) + " " + (0.5 + row + margin)
					: "m" + moveBy + " 0"
				moveBy = 0
				newRow = false
			}

			if (!(col + 1 < size && data[i + 1])) {
				path += "h" + lineLength
				lineLength = 0
			}
		} else {
			moveBy++
		}
	}

	return path
}

// ── Rounded style (connected path, rounded outer corners) ─
function qrToRoundedPath(data: Uint8Array, size: number, margin: number, cornerRadius: number): string {
	let path = ""
	const r = Math.min(Math.max(cornerRadius, 0), 0.5)

	function hasNeighbor(row: number, col: number): number {
		if (row < 0 || row >= size || col < 0 || col >= size) return 0
		return data[row * size + col]
	}

	for (let i = 0; i < data.length; i++) {
		if (!data[i]) continue
		const col = i % size
		const row = Math.floor(i / size)

		const x = col + margin
		const y = row + margin

		const top = hasNeighbor(row - 1, col)
		const right = hasNeighbor(row, col + 1)
		const bottom = hasNeighbor(row + 1, col)
		const left = hasNeighbor(row, col - 1)

		const tlRound = (!top && !left) ? r : 0
		const trRound = (!top && !right) ? r : 0
		const brRound = (!bottom && !right) ? r : 0
		const blRound = (!bottom && !left) ? r : 0

		// Start: top edge after top-left corner
		path += "M" + (x + tlRound) + " " + y

		// Top edge → top-right corner
		if (trRound) {
			path += "H" + (x + 1 - trRound)
			path += "A" + trRound + " " + trRound + " 0 0 1 " + (x + 1) + " " + (y + trRound)
		} else {
			path += "H" + (x + 1) + "V" + (y + 1)
			path += "H" + (x + 1)
		}

		// Right edge → bottom-right corner
		if (brRound) {
			path += "V" + (y + 1 - brRound)
			path += "A" + brRound + " " + brRound + " 0 0 1 " + (x + 1 - brRound) + " " + (y + 1)
		} else {
			path += "H" + (x + 1) + "V" + (y + 1)
		}

		// Bottom edge → bottom-left corner
		if (blRound) {
			path += "H" + (x + blRound)
			path += "A" + blRound + " " + blRound + " 0 0 1 " + x + " " + (y + 1 - blRound)
		} else {
			path += "H" + x + "V" + (y + 1)
		}

		// Left edge → top-left corner
		if (tlRound) {
			path += "V" + (y + tlRound)
			path += "A" + tlRound + " " + tlRound + " 0 0 1 " + (x + tlRound) + " " + y
		} else {
			path += "V" + y + "H" + x
		}

		path += "Z "
	}

	return path
}

// ── Dots style (circles per module) ─────────────────────
function qrToDots(data: Uint8Array, size: number, margin: number): string {
	let elements = ""
	const r = 0.48

	for (let i = 0; i < data.length; i++) {
		if (!data[i]) continue
		const col = i % size
		const row = Math.floor(i / size)
		const cx = col + margin + 0.5
		const cy = row + margin + 0.5
		elements += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '"/>'
	}

	return elements
}

// ── Logo overlay (aspect-ratio preserving) ──────────────
function buildLogoOverlay(
	logo: NonNullable<NormalizedOptions["logo"]>,
	qrSize: number,
	margin: number,
	bgColor: RGBA,
	moduleStyle: ModuleStyle,
	cornerRadius: number,
): string {
	const moduleCount = qrSize - margin * 2
	const padding = logo.padding ?? 1

	const imgW = logo.naturalWidth || 100
	const imgH = logo.naturalHeight || 100
	const aspect = imgW / imgH

	const isBottomRight = logo.position === "bottom-right"

	let logoW: number, logoH: number
	if (isBottomRight) {
		logoH = logo.size || Math.floor(moduleCount * 0.11)
		logoW = logoH * aspect
	} else {
		const maxLogoModules = logo.size || Math.floor(moduleCount * 0.30)
		if (aspect >= 1) {
			logoW = maxLogoModules
			logoH = maxLogoModules / aspect
		} else {
			logoH = maxLogoModules
			logoW = maxLogoModules * aspect
		}
	}

	const bgW = isBottomRight ? logoW + padding * 0.5 : logoW + padding * 2
	const bgH = isBottomRight ? logoH + padding * 0.5 : logoH + padding * 2

	let x: number, y: number
	if (isBottomRight) {
		x = qrSize - margin - bgW
		y = qrSize - margin - bgH
	} else {
		x = (qrSize - bgW) / 2
		y = (qrSize - bgH) / 2
	}

	const rx = moduleStyle === "square" ? 0 : moduleStyle === "rounded" ? cornerRadius : 1.5
	const imgX = isBottomRight ? x + padding * 0.5 : x + (bgW - logoW) / 2
	const imgY = isBottomRight ? y + padding * 0.5 : y + (bgH - logoH) / 2
	const bleed = moduleStyle === "square" ? 0 : 0.5
	const rectW = bgW + (isBottomRight ? bleed : 0)
	const rectH = bgH + (isBottomRight ? bleed : 0)

	let overlay = ""
	if (isBottomRight && rx > 0) {
		const r = rx
		overlay += "<path " + getColorAttrib(bgColor, "fill")
		overlay += ' d="M' + (x + r) + " " + y
		overlay += "H" + (x + rectW)
		overlay += "V" + (y + rectH)
		overlay += "H" + x
		overlay += "V" + (y + r)
		overlay += "A" + r + " " + r + " 0 0 1 " + (x + r) + " " + y + '"/>'
	} else {
		overlay += "<rect " + getColorAttrib(bgColor, "fill")
		overlay += ' x="' + x + '" y="' + y + '"'
		overlay += ' width="' + rectW + '" height="' + rectH + '"'
		overlay += ' rx="' + rx + '" ry="' + rx + '"/>'
	}
	overlay += '<image href="' + logo.src + '"'
	overlay += ' x="' + imgX + '" y="' + imgY + '"'
	overlay += ' width="' + logoW + '" height="' + logoH + '"'
	overlay += ' preserveAspectRatio="xMidYMid meet"/>'

	return overlay
}

// ── Main render ─────────────────────────────────────────
export function render(qrData: QRCodeData, options?: RenderOptions): string {
	const opts: NormalizedOptions = getOptions(options)
	const size = qrData.modules.size
	const data = qrData.modules.data
	const qrcodesize = size + opts.margin * 2

	// Background
	const bg =
		!opts.color.light.a
			? ""
			: "<path " +
				getColorAttrib(opts.color.light, "fill") +
				' d="M0 0h' +
				qrcodesize +
				"v" +
				qrcodesize +
				'H0z"/>'

	// Modules
	let modules = ""
	if (opts.moduleStyle === "dots") {
		modules = '<g ' + getColorAttrib(opts.color.dark, "fill") + ' shape-rendering="geometricPrecision">' +
			qrToDots(data, size, opts.margin) + '</g>'
	} else if (opts.moduleStyle === "rounded") {
		modules = '<path ' + getColorAttrib(opts.color.dark, "fill") +
			' d="' + qrToRoundedPath(data, size, opts.margin, opts.cornerRadius) + '"/>'
	} else {
		modules = "<path " +
			getColorAttrib(opts.color.dark, "stroke") +
			' d="' + qrToSquarePath(data, size, opts.margin) + '"/>'
	}

	// Logo
	const logoOverlay = opts.logo
		? buildLogoOverlay(opts.logo, qrcodesize, opts.margin, opts.color.light, opts.moduleStyle, opts.cornerRadius)
		: ""

	// Render
	const viewBox = 'viewBox="0 0 ' + qrcodesize + " " + qrcodesize + '"'
	const width = !opts.width ? "" : 'width="' + opts.width + '" height="' + opts.width + '" '
	const shapeRendering = opts.moduleStyle === "square" ? ' shape-rendering="crispEdges"' : ""

	return (
		'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ' +
		width +
		viewBox +
		shapeRendering +
		'>' +
		bg +
		modules +
		logoOverlay +
		"</svg>\n"
	)
}
