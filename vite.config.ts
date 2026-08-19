import { defineConfig } from 'vite'
import { resolve } from 'path'
import { viteSingleFile } from './plugins/inlineHtml.ts'

export default defineConfig({
	root: 'src',
	envDir: resolve(import.meta.dirname),

	plugins: [
		viteSingleFile({
			useRecommendedBuildConfig: false,
			inlineHtmlPattern: ['index.html'],
		}),
	],

	build: {
		outDir: '../dist',
		emptyOutDir: true,
		assetsInlineLimit: () => true,
		chunkSizeWarningLimit: 100000000,
		rollupOptions: {
			input: {
				index: 'index.html',
				new: 'new.html',
			},
		},
	},
})
