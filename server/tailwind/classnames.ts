import parser from "postcss-selector-parser"
import type { Result, Node, Rule } from "postcss"
import chroma from "chroma-js"
import Fuse from "fuse.js"
import __baseVariants from "./baseVariants.json"
import twinVariants from "./twinVariants.json"

export const __INNER_TAILWIND_SEPARATOR__ = "_twsp_"

const selectorProcessor = parser()

const TWIN_CONTAINER: CSSRuleItem = { __source: "utilities", __pseudo: [], __context: [] }

interface ClassName {
	scope?: string
	name: string
	rule: boolean
	pseudo: string[]
}

export interface CSSRuleItem {
	__scope?: string
	__rule?: boolean
	decls?: Record<string, string[]>
	__source?: string
	__context: string[]
	__pseudo: string[]
}

export function createSelectorFromNodes(nodes: parser.Selector[]): string {
	if (nodes.length === 0) return null
	const selector = parser.selector({ value: "" })
	for (let i = 0; i < nodes.length; i++) {
		selector.append(nodes[i])
	}
	return String(selector).trim()
}

export function getClassNames(rule: Rule, notRules: Record<string, Set<string>>) {
	const classNames: ClassName[] = []
	const { nodes: selectors } = selectorProcessor.astSync(rule.selector)
	for (let i = 0; i < selectors.length; i++) {
		const scopes: parser.Node[] = []
		for (let j = 0; j < selectors[i].nodes.length; j++) {
			const node = selectors[i].nodes[j]
			const pseudos: parser.Pseudo[] = []
			if (node.type === "class") {
				for (let next: parser.Node; (next = selectors[i].nodes[j + 1]), next?.type === "pseudo"; j++) {
					pseudos.push(next)
				}
				const name = node.value.trim()
				const rule = j === selectors[i].nodes.length - 1
				const pseudo = pseudos.map(String)
				const className: ClassName = { name, rule, pseudo }
				// exception
				if (name.includes("divide-") || name.includes("space-")) {
					className.rule = true
				}
				if (scopes.length > 0) {
					className.scope = createSelectorFromNodes(scopes as parser.Selector[])
				}
				classNames.push(className)
				if (!className.rule) {
					if (!notRules[name]) {
						notRules[name] = new Set<string>()
					}
					for (const p of pseudo) notRules[name].add(p)
				}
			}
			scopes.push(node, ...pseudos)
		}
	}
	return classNames
}

export function dlv(cur: unknown, paths: string[]) {
	if (cur == undefined) {
		return undefined
	}
	for (let i = 0; i < paths.length; ++i) {
		if (cur[paths[i]] == undefined) {
			return undefined
		} else {
			cur = cur[paths[i]]
		}
	}
	return cur
}

export function dset(cur: unknown, paths: Array<string | number>, value: unknown) {
	if (cur == undefined || paths.length === 0) {
		return
	}
	for (let i = 0; i < paths.length - 1; ++i) {
		const key = paths[i]
		if (cur[key] == undefined) {
			// if next key is digit number
			cur[key] = +paths[i + 1] > -1 ? new Array(0) : {}
		}
		cur = cur[key]
	}
	const last = paths[paths.length - 1]
	cur[last] = value
}

export function intersection<T = unknown>(arr1: T[], arr2: T[]) {
	return arr1.filter(value => arr2.indexOf(value) !== -1)
}

export function extractClassNames(
	[_base, components, utilities]: [Result, Result, Result],
	darkMode: false | "media" | "class",
	twin = false,
) {
	return parseResults(
		[
			// { source: "base", result: base },
			{ source: "components", result: components },
			{ source: "utilities", result: utilities },
		],
		darkMode,
		twin,
	)
}

export function parseResults(
	groups: Array<{ source: string; result: Result }>,
	darkMode: false | "media" | "class" = false,
	twin = false,
) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const tree: Record<string, any> = {}
	const variants: Record<string, string[]> = {}

	for (const { source, result } of groups) {
		const notRules: Record<string, Set<string>> = {}
		result.root.walkRules(rule => {
			const classNames = getClassNames(rule, notRules)
			const decls: Record<string, string[]> = {}
			rule.walkDecls(decl => {
				const d = decls[decl.prop]
				if (d) {
					decls[decl.prop] = [...(d instanceof Array ? d : [d]), decl.value]
				} else {
					decls[decl.prop] = [decl.value]
				}
			})

			let p = rule as Node
			const keys: string[] = []
			while (p.parent.type !== "root") {
				p = p.parent
				if (p.type === "atrule") {
					keys.push(`@${p["name"]} ${p["params"]}`)
				}
			}

			for (let i = 0; i < classNames.length; i++) {
				const context = keys.slice()
				const baseKeys = classNames[i].name.split(__INNER_TAILWIND_SEPARATOR__)
				const variantKeys = baseKeys.slice(0, baseKeys.length - 1)
				let index: number[] = []

				const info = dlv(tree, [...baseKeys])
				if (info instanceof Array) {
					index = [info.length]
				} else if (classNames[i].rule) {
					index = [0]
					dset(tree, [...baseKeys], [])
				}
				if (classNames[i].scope) {
					dset(tree, [...baseKeys, ...index, "__scope"], classNames[i].scope)
				}
				if (classNames[i].rule) {
					dset(tree, [...baseKeys, ...index, "__rule"], true)
					for (const key in decls) {
						dset(tree, [...baseKeys, ...index, "decls", key], decls[key])
					}
					dset(tree, [...baseKeys, ...index, "__source"], source)
					dset(tree, [...baseKeys, ...index, "__pseudo"], classNames[i].pseudo)
					dset(tree, [...baseKeys, ...index, "__context"], context.slice().reverse())
				}

				// common context
				context.push(...classNames[i].pseudo.map(x => `&${x}`))
				for (let i = 0; i < variantKeys.length; i++) {
					if (!variants[variantKeys[i]]) {
						variants[variantKeys[i]] = context
					} else {
						variants[variantKeys[i]] = intersection(variants[variantKeys[i]], context)
					}
				}
				if (classNames[i].scope === ".dark") {
					for (const p of classNames[i].pseudo) notRules["dark"].add(`&${p}`)
				}
			}
		})

		for (const [name, pesudos] of Object.entries(notRules)) {
			if (name === "dark") {
				variants["dark"] = Array.from(pesudos)
				continue
			}
			dset(tree, [name, "__source"], source)
			dset(tree, [name, "__pseudo"], Array.from(pesudos))
			dset(tree, [name, "__context"], [])
		}
	}

	for (const k in variants) {
		if (__baseVariants[k]) {
			variants[k] = __baseVariants[k]
		}
	}
	const baseVariants = { ...variants }
	if (twin) {
		for (const k in twinVariants) {
			variants[k] = twinVariants[k]
		}
	}

	// take a coffee...

	function collectBreakingPoints(variants: Record<string, string[]>) {
		const reg = /@media\s\(.*width:\s*(\d+)px/
		const result: Record<string, number> = {}
		for (const label in variants) {
			for (const value of variants[label]) {
				const match = value.match(reg)
				if (match) {
					const [, v] = match
					result[label] = Number(v)
					break
				}
			}
		}
		return result
	}

	type ColorInfo = {
		color?: string
		backgroundColor?: string
		borderColor?: string
	}

	function collectColors(tree: Record<string, CSSRuleItem | CSSRuleItem[]>) {
		const colors: Record<string, ColorInfo> = {}
		Object.entries(tree).forEach(([label, info]) => {
			if (!(info instanceof Array)) {
				return
			}

			type D = [property: string, value: string]
			const decls: D[] = info
				.filter(i => i.__rule && i.__pseudo.length === 0)
				.flatMap(v =>
					Object.keys(v.decls || {}).flatMap(key => v.decls[key].map<D>(v => [key, v])),
				)

			if (decls.length === 0) {
				return
			}

			for (let i = 0; i < decls.length; i++) {
				const prop = decls[i][0]
				const value = decls[i][1]
				if (!prop.includes("color") && !prop.includes("gradient") && prop !== "fill" && prop !== "stroke") {
					continue
				}

				if (!colors[label]) {
					colors[label] = {}
				}

				const isFg = prop === "color"
				const isBg = prop.includes("background")
				const isBd = prop.includes("border") || prop.includes("divide")
				const isOther = !isFg && !isBg && !isBd

				if (label.includes("current")) {
					if (isFg) {
						colors[label].color = "currentColor"
					}
					if (isBd) {
						colors[label].borderColor = "currentColor"
					}
					if (isBg || isOther) {
						colors[label].backgroundColor = "currentColor"
					}
					continue
				}

				if (label.includes("transparent")) {
					if (isFg) {
						colors[label].color = "transparent"
					}
					if (isBd) {
						colors[label].borderColor = "transparent"
					}
					if (isBg || isOther) {
						colors[label].backgroundColor = "transparent"
					}
					continue
				}

				const reg = /^[a-z]+$|#[0-9a-fA-F]{3}\b|#[0-9a-fA-F]{6}\b|rgba\(\s*(?<r>\d{1,3})\s*,\s*(?<g>\d{1,3})\s*,\s*(?<b>\d{1,3})\s*,\s*(?<a>\d{1,3})\s*\)/
				const m = value.replace(/,\s*var\(\s*[\w-]+\s*\)/g, ", 1").match(reg)
				if (m == null) {
					continue
				}

				let color: chroma.Color
				if (m.groups?.r) {
					const { r, g, b } = m.groups
					color = chroma(+r, +g, +b)
				} else {
					color = chroma(m[0])
				}

				const val = color.hex()

				if (isBd) {
					colors[label].borderColor = val
				}
				if (isFg) {
					colors[label].color = val
				}
				if (isBg || isOther) {
					colors[label].backgroundColor = val
				}
			}

			// const index = decls.findIndex(
			// 	v => v[0].includes("color") || v[0].includes("gradient") || v[0] === "fill" || v[0] === "stroke",
			// )
			// if (index === -1) {
			// 	return
			// }

			// if (label.includes("current")) {
			// 	colors[label] = "currentColor"
			// 	return
			// }

			// if (label.includes("transparent")) {
			// 	colors[label] = "transparent"
			// 	return
			// }
			// let lastVal = decls[index][1]

			// lastVal = lastVal.replace(/,\s*var\(\s*[\w-]+\s*\)/g, ", 1")
			// const reg = /#[0-9a-fA-F]{3}\b|#[0-9a-fA-F]{6}\b|rgba\(\s*(?<r>\d{1,3})\s*,\s*(?<g>\d{1,3})\s*,\s*(?<b>\d{1,3})\s*,\s*(?<a>\d{1,3})\s*\)/
			// const m = lastVal.match(reg)
			// if (m == null) {
			// 	return
			// }
			// let color: chroma.Color
			// if (m.groups?.r) {
			// 	const { r, g, b } = m.groups
			// 	color = chroma(+r, +g, +b)
			// } else {
			// 	color = chroma(m[0])
			// }

			// colors[label] = color.hex()
		})
		return colors
	}

	return {
		/**
		 * class rules
		 */
		dictionary: tree,
		/**
		 * official variants table
		 */
		baseVariants,
		/**
		 * twin variants table
		 */
		twinVariants,
		/**
		 * current variants table
		 */
		variants,
		/**
		 * short color table
		 */
		colors: collectColors(tree),
		/**
		 * short breaking points table
		 */
		breakingPoints: collectBreakingPoints(variants),
		// common
		/**
		 * Test the label whether it is a dark mode keyword
		 * @param label input
		 * @param twinPattern is current pattern twin?
		 */
		isDarkMode(label: string, twinPattern: boolean) {
			if (twinPattern) {
				return label === "dark" || label === "light"
			} else {
				return label === "dark"
			}
		},
		hasDarkMode(variants: string[], twinPattern: boolean) {
			return variants.some(v => this.isDarkMode(v, twinPattern))
		},
		getBreakingPoint(label: string) {
			return this.breakingPoints[label]
		},
		hasBreakingPoint(variants: string[]) {
			return variants.some(v => this.getBreakingPoint(v))
		},
		getVariants(twinPattern: boolean) {
			if (twinPattern) {
				return this.variants
			} else {
				return this.baseVariants
			}
		},
		/**
		 * Test the variant whether it is a valid variant
		 * @param variant input
		 * @param twinPattern is current pattern twin?
		 */
		isVariant(variant: string, twinPattern: boolean) {
			return !!this.getVariants(twinPattern)[variant]
		},
		/**
		 * Test the variant whether it is a valid common variant.(not breaking point, not dark mode)
		 * @param label input
		 * @param twinPattern is current pattern twin?
		 */
		isCommonVariant(label: string, twinPattern: boolean) {
			if (this.getBreakingPoint(label)) {
				return false
			}
			if (this.isDarkMode(label, twinPattern)) {
				return false
			}
			return !!this.getVariants(twinPattern)[label]
		},
		/**
		 * Test the label whether it is valid className.
		 * @param label input
		 * @param variants input variant space
		 * @param twinPattern is current pattern twin?
		 */
		isClassName(label: string, variants: string[], twinPattern: boolean) {
			if (twinPattern) {
				if (label === "group") {
					return false
				}
				if (variants.length > 0 && label === "container") {
					return false
				}
				if (label === "content" && variants.some(v => v === "before" || v === "after")) {
					return true
				}
			}
			if (!this.getClassNames(variants, twinPattern)?.[label]) {
				return false
			}
			if (this.isDarkMode(label, twinPattern)) {
				return false
			}
			return true
		},
		/**
		 * Get all classNames information.
		 * @param variants input variant space
		 * @param twinPattern is current pattern twin?
		 */
		getClassNames(variants: string[], twinPattern: boolean): Record<string, CSSRuleItem | CSSRuleItem[]> {
			let dictionary = undefined
			if (variants.length > 0) {
				const keys: string[] = []
				const bp = variants.find(b => this.getBreakingPoint(b))
				if (bp) keys.push(bp)
				const i = variants.findIndex(x => this.isDarkMode(x, twinPattern))
				if (i !== -1) {
					variants[i] = "dark"
					keys.push("dark")
				}
				const first = variants.find(v => this.isCommonVariant(v, twinPattern))
				if (first && Object.keys(baseVariants).includes(first)) {
					keys.push(first)
				}
				dictionary = dlv(this.dictionary, [...keys]) as Record<string, CSSRuleItem | CSSRuleItem[]>
			} else {
				dictionary = this.dictionary
			}
			if (twinPattern) {
				dictionary = { ...dictionary, container: TWIN_CONTAINER }
			}
			return dictionary
		},
		getClassNameRule(variants: string[], twinPattern: boolean, value: string): CSSRuleItem | CSSRuleItem[] {
			return this.getClassNames(variants, twinPattern)?.[value]
		},
		/**
		 * for providing proper variant list
		 * @param variants input variant space
		 * @param twinPattern is current pattern twin?
		 */
		getVariantFilter(variants: string[], twinPattern: boolean): (label: string) => boolean {
			const payload = {
				hasBreakingPoint: this.hasBreakingPoint(variants),
				hasDarkMode: this.hasDarkMode(variants, twinPattern),
				hasCommonVariant: variants.some(v => this.isCommonVariant(v, twinPattern)),
			}
			return label => {
				if (twinPattern) {
					if (variants.some(v => v === label)) {
						return false
					}
					if (
						(payload.hasDarkMode || payload.hasCommonVariant) &&
						(this.getBreakingPoint(label) || this.isDarkMode(label, twinPattern))
					) {
						return false
					}
					if (payload.hasBreakingPoint) {
						if (this.getBreakingPoint(label)) {
							return false
						}
					}
				} else {
					if (!darkMode && this.isDarkMode(label, twinPattern)) {
						return false
					}
					if (
						payload.hasCommonVariant &&
						(this.getBreakingPoint(label) || this.isVariant(label, twinPattern))
					) {
						return false
					}
					if (payload.hasDarkMode && (this.getBreakingPoint(label) || this.isDarkMode(label, twinPattern))) {
						return false
					}
					if (payload.hasBreakingPoint) {
						if (this.getBreakingPoint(label)) return false
					}
				}
				return true
			}
		},
		getVariantList(variants: string[], twinPattern: boolean) {
			return Object.keys(this.getVariants(twinPattern)).filter(this.getVariantFilter(variants, twinPattern))
		},
		/**
		 * for providing proper className list
		 * @param variants input variant space
		 * @param twinPattern is current pattern twin?
		 */
		getClassNameFilter(
			variants: string[],
			twinPattern: boolean,
		): (v: [string, CSSRuleItem | CSSRuleItem[]]) => boolean {
			const payload = {
				hasBreakingPoint: this.hasBreakingPoint(variants),
				hasDarkMode: this.hasDarkMode(variants, twinPattern),
				hasCommonVariant: variants.some(v => this.isCommonVariant(v, twinPattern)),
			}
			return ([label, info]) => {
				if (label === "group") {
					if (twinPattern || payload.hasBreakingPoint) {
						return false
					}
					return true
				}
				if (label === "container") {
					if (twinPattern && payload.hasBreakingPoint) {
						return false
					}
					return true
				}
				if (!(info instanceof Array)) {
					return false
				}
				return true
			}
		},
		getClassNameList(variants: string[], twinPattern: boolean) {
			const classes = Object.entries(this.getClassNames(variants, twinPattern))
				.filter(this.getClassNameFilter(variants, twinPattern))
				.map(([label]) => label)
			if (twin && variants.some(v => v === "before" || v === "after")) {
				classes.push("content")
			}
			return classes
		},
		// fuzzy searching
		/**
		 * searchers cache
		 */
		searchers: {},
		/**
		 * get approximate string matching searcher
		 */
		getSearcher(variants: string[], twinPattern: boolean): { variants: Fuse<string>; classes: Fuse<string> } {
			const target = dlv(this.searchers, [...variants, twinPattern.toString()])
			if (target) {
				return target as { variants: Fuse<string>; classes: Fuse<string> }
			}
			return {
				variants: new Fuse(this.getVariantList(variants, twinPattern)),
				classes: new Fuse(this.getClassNameList(variants, twinPattern)),
			}
		},
		getColorInfo(label: string) {
			const info = dlv(this.dictionary, [label]) as CSSRuleItem | CSSRuleItem[]
			if (!(info instanceof Array)) {
				return undefined
			}

			const colorInfo: ColorInfo = {}

			for (let i = 0; i < info.length; i++) {
				const pseudo = info[i].__pseudo
				if (pseudo.length > 0) continue
				for (const [prop, values] of Object.entries(info[i].decls)) {
					const value = values[values.length - 1]
					if (!prop.includes("color") && !prop.includes("gradient") && prop !== "fill" && prop !== "stroke") {
						continue
					}

					const isFg = prop === "color"
					const isBg = prop.includes("background")
					const isBd = prop.includes("border") || prop.includes("divide")
					const isOther = !isFg && !isBg && !isBd

					if (label.includes("current")) {
						if (isFg) {
							colorInfo.color = "currentColor"
						}
						if (isBd) {
							colorInfo.borderColor = "currentColor"
						}
						if (isBg || isOther) {
							colorInfo.backgroundColor = "currentColor"
						}
						continue
					}

					if (label.includes("transparent")) {
						if (isFg) {
							colorInfo.color = "transparent"
						}
						if (isBd) {
							colorInfo.borderColor = "transparent"
						}
						if (isBg || isOther) {
							colorInfo.backgroundColor = "transparent"
						}
						continue
					}

					const reg = /^[a-z]+$|#[0-9a-fA-F]{3}\b|#[0-9a-fA-F]{6}\b|rgba\(\s*(?<r>\d{1,3})\s*,\s*(?<g>\d{1,3})\s*,\s*(?<b>\d{1,3})\s*,\s*(?<a>\d{1,3})\s*\)/
					const m = value.replace(/,\s*var\(\s*[\w-]+\s*\)/g, ", 1").match(reg)
					if (m == null) {
						continue
					}

					let color: chroma.Color
					if (m.groups?.r) {
						const { r, g, b } = m.groups
						color = chroma(+r, +g, +b)
					} else {
						color = chroma(m[0])
					}

					const val = color.hex()

					if (isBd) {
						colorInfo.borderColor = val
					}
					if (isFg) {
						colorInfo.color = val
					}
					if (isBg || isOther) {
						colorInfo.backgroundColor = val
					}
				}
			}
			return colorInfo
		},
	}
}
