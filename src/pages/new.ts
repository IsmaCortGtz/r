import { compress } from "../lib/codec"
import { OUTPUT_ALPHABET_ASCII, OUTPUT_ALPHABET_QR } from "../lib/dictionaries"
import { BASE_URL } from "../lib/config"
import { create, toString } from "../qr"
import type { QRCodeOptions } from "../qr"
import type { ModuleStyle } from "../qr/renderer/color-utils"

// ── DOM ──────────────────────────────────────────────────
const tabBtns = document.querySelectorAll<HTMLButtonElement>("[data-tab]")
const tabQr = document.getElementById("tab-qr")!
const tabShort = document.getElementById("tab-shortener")!

const typeBtns = document.querySelectorAll<HTMLButtonElement>("[data-type]")
let currentType = "url"

const qrOutput = document.getElementById("qr-output")!
const downloadBtn = document.getElementById("download-btn") as HTMLButtonElement
const colorDark = document.getElementById("color-dark") as HTMLInputElement
const colorLight = document.getElementById("color-light") as HTMLInputElement

const shortInput = document.getElementById("short-input") as HTMLInputElement
const shortOutput = document.getElementById("short-output")!
const shortRatio = document.getElementById("short-ratio")!

let currentSvg = ""
let currentModuleStyle: ModuleStyle = "square"
let currentCornerRadius = 0.35
let currentLogoDataUrl: string | null = null
let currentLogoPosition: "center" | "bottom-right" = "center"
let currentLogoNaturalW = 0
let currentLogoNaturalH = 0

// ── Tabs ─────────────────────────────────────────────────
tabBtns.forEach((btn) => {
	btn.addEventListener("click", () => {
		tabBtns.forEach((b) => {
			b.classList.remove("bg-primary", "text-primary-content", "shadow")
			b.classList.add("text-base-content/50")
		})
		btn.classList.add("bg-primary", "text-primary-content", "shadow")
		btn.classList.remove("text-base-content/50")
		const t = btn.dataset.tab
		tabQr.classList.toggle("hidden", t !== "qr")
		tabShort.classList.toggle("hidden", t !== "shortener")
	})
})

// ── Type selector ────────────────────────────────────────
function showForm(type: string) {
	currentType = type
	document.querySelectorAll<HTMLElement>(".qr-form").forEach((f) => f.classList.add("hidden"))
	const el = document.getElementById(`form-${type}`)
	if (el) el.classList.remove("hidden")
}

typeBtns.forEach((btn) => {
	btn.addEventListener("click", () => {
		typeBtns.forEach((b) => b.classList.remove("active"))
		btn.classList.add("active")
		showForm(btn.dataset.type || "url")
		updateQR()
	})
})

// ── QR helpers ───────────────────────────────────────────
function getColorOptions(): Pick<NonNullable<QRCodeOptions["color"]>, "dark" | "light"> {
	return { dark: colorDark.value, light: colorLight.value }
}

function getOptimalEC(text: string): QRCodeOptions["errorCorrectionLevel"] {
	const levels: QRCodeOptions["errorCorrectionLevel"][] = ["M", "Q", "H"]
	try {
		const baseVersion = create(text, { errorCorrectionLevel: "M" }).version
		let optimal: QRCodeOptions["errorCorrectionLevel"] = "M"
		for (const level of levels.slice(1)) {
			try {
				const candidate = create(text, { errorCorrectionLevel: level })
				if (candidate.version > baseVersion) break
				optimal = level
			} catch { break }
		}
		return optimal
	} catch {
		return "L"
	}
}

function getCompressionRatio(original: string, compressed: string): number {
	const baseUrlLen = BASE_URL.replace(/\/+$/, "").length
	return Math.ceil((1 - (baseUrlLen + 1 + compressed.length) / original.length) * 100)
}

function buildShortUrl(compressed: string): string {
	return `${BASE_URL.replace(/\/+$/, "")}#${compressed}`
}

function buildQrPayload(baseUrl: string, compressed: string): string {
	const domain = baseUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")
	return `HTTP://${domain.toUpperCase()}/${compressed}`
}

// ── QR type builders ─────────────────────────────────────
function buildQrContent(): string | null {
	switch (currentType) {
		case "url": return buildUrlQr()
		case "text": return (document.getElementById("qr-text") as HTMLTextAreaElement)?.value?.trim() || null
		case "wifi": return buildWifiQr()
		case "email": return buildEmailQr()
		case "phone": return buildPhoneQr()
		case "sms": return buildSmsQr()
		case "vcard": return buildVcardQr()
		default: return null
	}
}

function buildUrlQr(): string | null {
	const url = (document.getElementById("qr-url") as HTMLInputElement)?.value?.trim()
	if (!url) return null

	const compressToggle = document.getElementById("qr-url-compress") as HTMLInputElement
	const ratioEl = document.getElementById("qr-url-ratio")!
	const shortEl = document.getElementById("qr-url-short")!

	if (compressToggle.checked) {
		try {
			const compressedQr = compress(url, OUTPUT_ALPHABET_QR)
			const compressedLink = compress(url, OUTPUT_ALPHABET_ASCII)
			const shortUrl = buildShortUrl(compressedLink)
			const payload = buildQrPayload(BASE_URL, compressedQr)

			const ratio = getCompressionRatio(url, compressedLink)
			if (ratio > 0) {
				ratioEl.innerHTML = `<span class="text-success">${ratio}% smaller</span>`
			} else if (ratio < 0) {
				ratioEl.innerHTML = `<span class="text-warning">${Math.abs(ratio)}% larger</span>`
			} else {
				ratioEl.innerHTML = `<span class="text-base-content/40">Same size</span>`
			}
			ratioEl.classList.remove("hidden")
			shortEl.textContent = shortUrl
			shortEl.classList.remove("hidden")
			return payload
		} catch {
			ratioEl.classList.add("hidden")
			shortEl.classList.add("hidden")
			return null
		}
	}

	ratioEl.classList.add("hidden")
	shortEl.classList.add("hidden")
	return url
}

function buildWifiQr(): string | null {
	const ssid = (document.getElementById("wifi-ssid") as HTMLInputElement)?.value?.trim()
	if (!ssid) return null
	const pass = (document.getElementById("wifi-pass") as HTMLInputElement)?.value?.trim() || ""
	const enc = (document.getElementById("wifi-enc") as HTMLSelectElement)?.value || "WPA"
	return `WIFI:T:${enc};S:${ssid};P:${pass};;`
}

function buildEmailQr(): string | null {
	const to = (document.getElementById("email-to") as HTMLInputElement)?.value?.trim()
	if (!to) return null
	const subject = (document.getElementById("email-subject") as HTMLInputElement)?.value?.trim() || ""
	const body = (document.getElementById("email-body") as HTMLTextAreaElement)?.value?.trim() || ""
	let uri = `mailto:${to}`
	const params: string[] = []
	if (subject) params.push(`subject=${encodeURIComponent(subject)}`)
	if (body) params.push(`body=${encodeURIComponent(body)}`)
	if (params.length) uri += "?" + params.join("&")
	return uri
}

function buildPhoneQr(): string | null {
	const phone = (document.getElementById("qr-phone") as HTMLInputElement)?.value?.trim()
	if (!phone) return null
	return `tel:${phone}`
}

function buildSmsQr(): string | null {
	const phone = (document.getElementById("sms-phone") as HTMLInputElement)?.value?.trim()
	if (!phone) return null
	const body = (document.getElementById("sms-body") as HTMLTextAreaElement)?.value?.trim() || ""
	let uri = `sms:${phone}`
	if (body) uri += `?body=${encodeURIComponent(body)}`
	return uri
}

function buildVcardQr(): string | null {
	const fname = (document.getElementById("vc-fname") as HTMLInputElement)?.value?.trim() || ""
	const lname = (document.getElementById("vc-lname") as HTMLInputElement)?.value?.trim() || ""
	if (!fname && !lname) return null
	const phone = (document.getElementById("vc-phone") as HTMLInputElement)?.value?.trim() || ""
	const email = (document.getElementById("vc-email") as HTMLInputElement)?.value?.trim() || ""
	const org = (document.getElementById("vc-org") as HTMLInputElement)?.value?.trim() || ""
	const title = (document.getElementById("vc-title") as HTMLInputElement)?.value?.trim() || ""
	const addr = (document.getElementById("vc-address") as HTMLInputElement)?.value?.trim() || ""
	const city = (document.getElementById("vc-city") as HTMLInputElement)?.value?.trim() || ""
	const postcode = (document.getElementById("vc-postcode") as HTMLInputElement)?.value?.trim() || ""
	const country = (document.getElementById("vc-country") as HTMLInputElement)?.value?.trim() || ""
	const url = (document.getElementById("vc-url") as HTMLInputElement)?.value?.trim() || ""

	const lines = [
		"BEGIN:VCARD",
		"VERSION:3.0",
		`N:${lname};${fname};;;`,
		`FN:${fname} ${lname}`.trim(),
	]
	if (phone) lines.push(`TEL:${phone}`)
	if (email) lines.push(`EMAIL:${email}`)
	if (org) lines.push(`ORG:${org}`)
	if (title) lines.push(`TITLE:${title}`)
	if (addr || city || postcode || country) {
		lines.push(`ADR:;;${addr};${city};;${postcode};${country}`)
	}
	if (url) lines.push(`URL:${url}`)
	lines.push("END:VCARD")
	return lines.join("\r\n")
}

// ── QR render ────────────────────────────────────────────
function updateQR() {
	try {
		const content = buildQrContent()
		if (!content) {
			qrOutput.innerHTML = '<span class="text-base-content/20 text-sm">Select type and fill fields</span>'
			downloadBtn.disabled = true
			currentSvg = ""
			return
		}

		currentSvg = toString(content, {
			color: getColorOptions(),
			margin: 2,
			width: 256,
			errorCorrectionLevel: currentType === "url"
				? getOptimalEC(content)
				: "L",
			moduleStyle: currentModuleStyle,
			cornerRadius: currentCornerRadius,
			...(currentLogoDataUrl ? {
				logo: {
					src: currentLogoDataUrl,
					position: currentLogoPosition,
					naturalWidth: currentLogoNaturalW,
					naturalHeight: currentLogoNaturalH,
				},
				errorCorrectionLevel: "H",
			} : {}),
		})
		qrOutput.innerHTML = currentSvg
		downloadBtn.disabled = false
	} catch (e) {
		console.error("QR error:", e)
		qrOutput.innerHTML = '<span class="text-error text-sm">Error generating QR</span>'
		downloadBtn.disabled = true
		currentSvg = ""
	}
}

// ── Link Shortener ───────────────────────────────────────
function updateShortener() {
	const input = shortInput.value.trim()
	if (!input) {
		shortOutput.textContent = "Enter a URL above to shorten it"
		shortRatio.classList.add("hidden")
		return
	}

	try {
		const compressed = compress(input, OUTPUT_ALPHABET_ASCII)
		const shortUrl = buildShortUrl(compressed)

		shortOutput.innerHTML = ""
		const link = document.createElement("a")
		link.href = shortUrl
		link.textContent = shortUrl
		link.className = "link link-primary text-sm break-all font-mono"
		shortOutput.appendChild(link)

		const inputLower = input.toLowerCase()
		let normalized = input
		if (inputLower.startsWith("https://")) normalized = input.slice(8)
		else if (inputLower.startsWith("http://")) normalized = input.slice(7)

		const ratio = Math.ceil((1 - (BASE_URL.replace(/\/+$/, "").length + 1 + compressed.length) / normalized.length) * 100)
		shortRatio.classList.remove("hidden")
		if (ratio > 0) {
			shortRatio.innerHTML = `<span class="text-success">${ratio}% smaller - worth it!</span>`
		} else if (ratio < 0) {
			shortRatio.innerHTML = `<span class="text-warning">${Math.abs(ratio)}% larger - not worth it</span>`
		} else {
			shortRatio.innerHTML = `<span class="text-base-content/40">Same size</span>`
		}
	} catch (e) {
		console.error("Shortener error:", e)
		shortOutput.textContent = "Invalid URL"
		shortRatio.classList.add("hidden")
	}
}

// ── Download ─────────────────────────────────────────────
function downloadSvg() {
	if (!currentSvg) return
	const blob = new Blob([currentSvg], { type: "image/svg+xml" })
	const url = URL.createObjectURL(blob)
	const a = document.createElement("a")
	a.href = url
	a.download = "qr-code.svg"
	a.click()
	URL.revokeObjectURL(url)
}

// ── Event listeners ──────────────────────────────────────
colorDark.addEventListener("input", updateQR)
colorLight.addEventListener("input", updateQR)
downloadBtn.addEventListener("click", downloadSvg)
shortInput.addEventListener("input", updateShortener)

// Attach to all QR form fields
document.querySelectorAll(".qr-form input, .qr-form textarea, .qr-form select").forEach((el) => {
	el.addEventListener("input", updateQR)
	el.addEventListener("change", updateQR)
})

// Module style selector
const moduleStyleBtns = document.querySelectorAll<HTMLButtonElement>("[data-style]")
const radiusControl = document.getElementById("radius-control")!
const cornerRadiusInput = document.getElementById("corner-radius") as HTMLInputElement
const radiusValue = document.getElementById("radius-value")!

moduleStyleBtns.forEach((btn) => {
	btn.addEventListener("click", () => {
		moduleStyleBtns.forEach((b) => b.classList.remove("active"))
		btn.classList.add("active")
		currentModuleStyle = (btn.dataset.style as ModuleStyle) || "square"
		radiusControl.classList.toggle("hidden", currentModuleStyle !== "rounded")
		updateQR()
	})
})

cornerRadiusInput.addEventListener("input", () => {
	currentCornerRadius = parseInt(cornerRadiusInput.value) / 100
	radiusValue.textContent = cornerRadiusInput.value
	updateQR()
})

// Logo upload
const logoUpload = document.getElementById("logo-upload") as HTMLInputElement
const logoRemove = document.getElementById("logo-remove")!
const logoPosition = document.getElementById("logo-position")!

logoUpload.addEventListener("change", () => {
	const file = logoUpload.files?.[0]
	if (!file) return

	const reader = new FileReader()
	reader.onload = () => {
		const dataUrl = reader.result as string
		const img = new Image()
		img.onload = () => {
			currentLogoNaturalW = img.naturalWidth
			currentLogoNaturalH = img.naturalHeight
			currentLogoDataUrl = dataUrl
			logoRemove.classList.remove("hidden")
			logoPosition.classList.remove("hidden")
			updateQR()
		}
		img.src = dataUrl
	}
	reader.readAsDataURL(file)
})

logoRemove.addEventListener("click", () => {
	currentLogoDataUrl = null
	logoUpload.value = ""
	logoRemove.classList.add("hidden")
	logoPosition.classList.add("hidden")
	updateQR()
})

document.querySelectorAll<HTMLInputElement>('input[name="logo-pos"]').forEach((radio) => {
	radio.addEventListener("change", () => {
		currentLogoPosition = radio.value as "center" | "bottom-right"
		updateQR()
	})
})

// Init
showForm("url")
