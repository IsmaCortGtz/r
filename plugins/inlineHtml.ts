import {
	UserConfig,
	PluginOption,
	version as viteVersion,
} from "vite"

import type {
	OutputChunk,
	OutputAsset,
	OutputOptions,
} from "rollup"

import micromatch from "micromatch"

export type Config = {
	/**
	 * Modifies the Vite build config to make this plugin work well.
	 *
	 * @default true
	 */
	useRecommendedBuildConfig?: boolean

	/**
	 * Removes the Vite module loader from inlined JavaScript.
	 *
	 * @default false
	 */
	removeViteModuleLoader?: boolean

	/**
	 * HTML files that should be converted to single-file documents.
	 *
	 * Examples:
	 *   ['new.html']
	 *   ['new.html', 'invoice.html']
	 *   ['*.single.html']
	 *
	 * @default []
	 */
	inlineHtmlPattern?: string[]

	/**
	 * Optionally, only inline assets that match one or more glob patterns.
	 *
	 * @default []
	 */
	inlinePattern?: string[]

	/**
	 * Delete assets after they have been successfully inlined.
	 *
	 * @default true
	 */
	deleteInlinedFiles?: boolean

	/**
	 * Override any part of the recommended Vite configuration.
	 */
	overrideConfig?: Partial<UserConfig>
}

const defaultConfig: Config = {
	useRecommendedBuildConfig: true,
	removeViteModuleLoader: false,
	inlineHtmlPattern: [],
	inlinePattern: [],
	deleteInlinedFiles: true,
}

/**
 * Replaces a <script src="..."> with an inline <script>.
 */
export function replaceScript(
	html: string,
	scriptFilename: string,
	scriptCode: string,
	removeViteModuleLoader = false,
): string {
	const f = scriptFilename.replaceAll(".", "\\.")

	const reScript = new RegExp(
		`<script([^>]*?) src="(?:[^"]*?/)?${f}"([^>]*)></script>`,
	)

	const preloadMarker = /"?__VITE_PRELOAD__"?/g

	const newCode = scriptCode
		.replace(preloadMarker, "void 0")
		.replace(/<(\/script>|!--)/g, "\\x3C$1")

	let inlined = html.replace(
		reScript,
		(_, beforeSrc, afterSrc) =>
			`<script${beforeSrc}${afterSrc}>${newCode.trim()}</script>`,
	)

	// Only try ES module import replacement if <script src> replacement didn't work
	if (inlined === html) {
		const basename = scriptFilename.split("/").pop()!.replaceAll(".", "\\.")
		const reModuleImport = new RegExp(
			`import\\{[^}]*\\}from"\\.\\/(?:[^"]*?/)?${basename}"`,
		)
		inlined = inlined.replace(reModuleImport, newCode.trim())
	}

	// Remove corresponding <link rel="modulepreload"> for inlined chunks
	const reModulepreload = new RegExp(
		`\\s*<link[^>]*rel="modulepreload"[^>]*href="[^"]*${f}"[^>]*/?>`,
	)
	inlined = inlined.replace(reModulepreload, "")

	return removeViteModuleLoader
		? _removeViteModuleLoader(inlined)
		: inlined
}

/**
 * Replaces a <link rel="stylesheet" href="..."> with an inline <style>.
 */
export function replaceCss(
	html: string,
	cssFilename: string,
	cssCode: string,
): string {
	const f = cssFilename.replaceAll(".", "\\.")

	const reStyle = new RegExp(
		`<link([^>]*?) href="(?:[^"]*?/)?${f}"([^>]*)>`,
	)

	const newCode = cssCode.replace(
		`@charset "UTF-8";`,
		"",
	)

	return html.replace(
		reStyle,
		(_, beforeHref, afterHref) =>
			`<style${beforeHref}${afterHref}>${newCode.trim()}</style>`,
	)
}

const isJsFile = /\.[mc]?js$/
const isCssFile = /\.css$/
const isHtmlFile = /\.html?$/

/**
 * Checks whether a filename matches a pattern.
 */
function matchesPattern(
	filename: string,
	patterns: string[],
): boolean {
	if (!patterns.length) {
		return true
	}

	return micromatch.isMatch(filename, patterns)
}

/**
 * Checks whether an asset is actually referenced by the HTML.
 *
 * This is important when there are multiple HTML entrypoints.
 *
 * Without this check, the plugin could inline the JavaScript from
 * index.html into new.html, which is not what we want.
 */
function isReferencedByHtml(
	html: string,
	filename: string,
): boolean {
	const escapedFilename = filename
		.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

	// Check src/href attributes (traditional script/link tags)
	const reAttr = new RegExp(
		`(?:src|href)=["'][^"']*${escapedFilename}["']`,
	)
	if (reAttr.test(html)) return true

	// Check ES module imports: import{...}from"./filename"
	const basename = filename.split("/").pop()!
	const reModuleImport = new RegExp(
		`import\\{[^}]*\\}from"\\.\\/(?:[^"]*?/)?${basename}"`,
	)
	if (reModuleImport.test(html)) return true

	// Check modulepreload links
	const reModulepreload = new RegExp(
		`rel="modulepreload"[^>]*href="[^"]*${escapedFilename}"`,
	)
	if (reModulepreload.test(html)) return true

	return false
}

export function viteSingleFile({
	useRecommendedBuildConfig = true,
	removeViteModuleLoader = false,
	inlineHtmlPattern = [],
	inlinePattern = [],
	deleteInlinedFiles = true,
	overrideConfig = {},
}: Config = defaultConfig): PluginOption {

	/**
	 * Recommended Vite configuration for single-file output.
	 */
	const _useRecommendedBuildConfig = (
		config: UserConfig,
	) => {
		if (!config.build) {
			config.build = {}
		}

		/**
		 * Inline all assets, regardless of size.
		 */
		config.build.assetsInlineLimit = () => true

		/**
		 * Avoid warnings about very large chunks.
		 */
		config.build.chunkSizeWarningLimit = 100000000

		/**
		 * Emit all CSS as one file.
		 */
		config.build.cssCodeSplit = false

		/**
		 * Use relative paths.
		 */
		config.base = "./"

		/**
		 * Keep generated assets in the output root.
		 */
		config.build.assetsDir = ""

		if (!config.build.rollupOptions) {
			config.build.rollupOptions = {}
		}

		if (!config.build.rollupOptions.output) {
			config.build.rollupOptions.output = {}
		}

		const viteMajor = parseInt(
			viteVersion.split(".")[0],
			10,
		)

		const updateOutputOptions = (
			out: OutputOptions,
		) => {
			/**
			 * Vite 8+ uses Rolldown.
			 */
			if (viteMajor >= 8) {
				;(out as OutputOptions & {
					codeSplitting: boolean
				}).codeSplitting = false
			} else {
				out.inlineDynamicImports = true
			}
		}

		if (
			Array.isArray(
				config.build.rollupOptions.output,
			)
		) {
			for (
				const output of config.build.rollupOptions.output
			) {
				updateOutputOptions(
					output as OutputOptions,
				)
			}
		} else {
			updateOutputOptions(
				config.build.rollupOptions.output as OutputOptions,
			)
		}

		Object.assign(config, overrideConfig)
	}

	return {
		name: "vite:singlefile-selective",

		config: useRecommendedBuildConfig
			? _useRecommendedBuildConfig
			: undefined,

		enforce: "post",

		generateBundle(
			_options: unknown,
			bundle: Record<string, unknown>,
		) {
			const warnNotInlined = (
				filename: string,
			) => {
				this.info(
					`NOTE: asset not inlined: ${filename}`,
				)
			}

			const files = {
				html: [] as string[],
				css: [] as string[],
				js: [] as string[],
				other: [] as string[],
			}

			/**
			 * Classify bundle files.
			 */
			for (const filename of Object.keys(bundle)) {
				if (isHtmlFile.test(filename)) {
					files.html.push(filename)
				} else if (isCssFile.test(filename)) {
					files.css.push(filename)
				} else if (isJsFile.test(filename)) {
					files.js.push(filename)
				} else {
					files.other.push(filename)
				}
			}

			const bundlesToDelete = new Set<string>()

			/**
			 * Process each HTML independently.
			 */
			for (const htmlFilename of files.html) {

				/**
				 * If no HTML patterns were specified,
				 * preserve the old behavior and inline everything.
				 *
				 * If patterns were specified, only matching
				 * HTML files become single-file documents.
				 */
				const shouldInlineHtml =
					matchesPattern(
						htmlFilename,
						inlineHtmlPattern,
					)

				if (!shouldInlineHtml) {
					this.info(
						`Skipping HTML: ${htmlFilename}`,
					)

					continue
				}

				this.info(
					`Inlining HTML: ${htmlFilename}`,
				)

				const htmlChunk =
					bundle[htmlFilename] as OutputAsset

				let replacedHtml =
					htmlChunk.source as string

				/**
				 * Inline ONLY JavaScript actually referenced
				 * by this particular HTML file.
				 */
				for (const filename of files.js) {

					/**
					 * Don't inline JS belonging to another
					 * entrypoint.
					 */
					if (
						!isReferencedByHtml(
							replacedHtml,
							filename,
						)
					) {
						continue
					}

					/**
					 * Respect inlinePattern if provided.
					 */
					if (
						inlinePattern.length &&
						!micromatch.isMatch(
							filename,
							inlinePattern,
						)
					) {
						warnNotInlined(filename)
						continue
					}

					const jsChunk =
						bundle[filename] as OutputChunk

					if (jsChunk.code != null) {
						this.info(
							`Inlining ${filename} into ${htmlFilename}`,
						)

						replacedHtml =
							replaceScript(
								replacedHtml,
								jsChunk.fileName,
								jsChunk.code,
								removeViteModuleLoader,
							)

						/**
						 * Only delete it if it was actually
						 * replaced.
						 */
						if (
							replacedHtml !==
							htmlChunk.source
						) {
							bundlesToDelete.add(
								filename,
							)
						}
					}
				}

				/**
				 * Inline ONLY CSS referenced by this HTML.
				 */
				for (const filename of files.css) {

					if (
						!isReferencedByHtml(
							replacedHtml,
							filename,
						)
					) {
						continue
					}

					if (
						inlinePattern.length &&
						!micromatch.isMatch(
							filename,
							inlinePattern,
						)
					) {
						warnNotInlined(filename)
						continue
					}

					const cssAsset =
						bundle[filename] as OutputAsset

					this.info(
						`Inlining ${filename} into ${htmlFilename}`,
					)

					const previousHtml =
						replacedHtml

					replacedHtml =
						replaceCss(
							replacedHtml,
							cssAsset.fileName,
							cssAsset.source as string,
						)

					if (
						replacedHtml !==
						previousHtml
					) {
						bundlesToDelete.add(
							filename,
						)
					}
				}

				htmlChunk.source = replacedHtml
			}

			/**
			 * Delete only assets that were actually inlined
			 * AND are not referenced by any other HTML file.
			 */
			if (deleteInlinedFiles) {
				for (const filename of bundlesToDelete) {
					// Check if any non-inlined HTML still references this asset
					const stillReferenced = files.html.some(
						(htmlFilename) =>
							!matchesPattern(htmlFilename, inlineHtmlPattern) &&
							isReferencedByHtml(
								(bundle[htmlFilename] as OutputAsset).source as string,
								filename,
							),
					)

					if (stillReferenced) {
						this.info(
							`Keeping ${filename}: still referenced by another HTML`,
						)
						continue
					}

					delete bundle[filename]

					this.info(
						`Deleted inlined asset: ${filename}`,
					)
				}
			}

			/**
			 * Report files that are not HTML/JS/CSS.
			 */
			for (const filename of files.other) {
				warnNotInlined(filename)
			}
		},
	}
}

/**
 * Removes Vite's module loader when requested.
 *
 * This assumes the loader is the first function declared
 * inside the module.
 */
const _removeViteModuleLoader = (
	html: string,
) =>
	html.replace(
		/(<script type="module" crossorigin>\s*)\(function(?: polyfill)?\(\)\s*\{[\s\S]*?\}\)\(\);/,
		'<script type="module">',
	)