export { create } from "./core/qrcode.js"
export type { QRCodeData, QRCodeOptions } from "./core/qrcode.js"
export { render } from "./renderer/svg.js"
export type { RenderOptions } from "./renderer/color-utils.js"
export { createAlphanumericData } from "./core/alphanumeric-data.js"
export type { Segment } from "./core/segment.js"

import { create as _create } from "./core/qrcode.js"
import { render as _render } from "./renderer/svg.js"
import type { QRCodeOptions } from "./core/qrcode.js"
import type { Segment } from "./core/segment.js"

/**
 * Generate an SVG string for a QR Code.
 */
export function toString(text: string, options?: QRCodeOptions): string {
	const data = _create(text, options)
	return _render(data, options)
}

/**
 * Generate an SVG string from pre-built segments (allows forcing specific modes).
 */
export function toStringFromSegments(segments: Segment[], options?: QRCodeOptions): string {
	const data = _create(segments as unknown as string, options)
	return _render(data, options)
}
