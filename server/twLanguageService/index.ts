import * as lsp from "vscode-languageserver"
import { TextDocument } from "vscode-languageserver-textdocument"
import { Tailwind } from "~/tailwind"
import { LanguageService } from "~/LanguageService"
import { completion, completionResolve } from "./completion"
import { hover } from "./hover"
import { documentLinks } from "./documentLinks"
import { validate } from "~/diagnostics"
import { provideColor } from "./colorDecoration"
import { provideSemanticTokens } from "./semanticTokens"
import findClasses from "~/findClasses"

export interface InitOptions {
	workspaceFolder: string
	configPath: string
	colorDecorators: boolean
	links: boolean
	validate: boolean
	fallbackDefaultConfig: boolean
	diagnostics: {
		conflict: "none" | "loose" | "strict"
		emptyClass: boolean
		emptyGroup: boolean
	}
}

export type Cache = Record<string, Record<string, ReturnType<typeof findClasses>>>

export class TailwindLanguageService implements LanguageService {
	public state: Tailwind
	initOptions: InitOptions
	documents: lsp.TextDocuments<TextDocument>
	cache: Cache
	constructor(documents: lsp.TextDocuments<TextDocument>, initOptions: InitOptions) {
		this.initOptions = initOptions
		this.documents = documents
		this.state = new Tailwind(this.initOptions)
		this.cache = {}
	}
	init() {
		if (this.isReady()) return void 0
		return this.state.process()
	}
	reload(...params: Parameters<Tailwind["reload"]>) {
		return this.state.reload(...params)
	}
	updateSettings(setting: Partial<InitOptions>) {
		this.initOptions = { ...this.initOptions, ...setting }
	}
	isReady() {
		return !!this.state.classnames
	}
	onCompletion(params: lsp.TextDocumentPositionParams) {
		if (!this.isReady()) return null
		const document = this.documents.get(params.textDocument.uri)
		return completion(document, params.position, this.state, this.initOptions)
	}
	onCompletionResolve(item: lsp.CompletionItem) {
		if (!this.isReady()) return null
		return completionResolve(item, this.state)
	}
	onHover(params: lsp.HoverParams) {
		if (!this.isReady()) return null
		const document = this.documents.get(params.textDocument.uri)
		return hover(document, params.position, this.state, this.initOptions)
	}
	validate(document: TextDocument) {
		const uri = document.uri.toString()
		this.cache[uri] = null
		this.cache[uri] = {}
		if (!this.initOptions.validate) return []
		if (!this.isReady()) return []
		return validate(document, this.state, this.initOptions, this.cache)
	}
	onDocumentLinks(params: lsp.DocumentLinkParams) {
		if (!this.initOptions.links) return []
		if (!this.isReady()) return []
		const document = this.documents.get(params.textDocument.uri)
		return documentLinks(document, this.state, this.initOptions, this.cache)
	}
	provideColor(document: TextDocument) {
		if (!this.initOptions.colorDecorators) return []
		if (!this.isReady()) return []
		return provideColor(document, this.state, this.initOptions, this.cache)
	}
	provideSemanticTokens(params: lsp.SemanticTokensParams) {
		if (!this.isReady()) return null
		// TODO: use cache
		const document = this.documents.get(params.textDocument.uri)
		return provideSemanticTokens(document, this.state, this.initOptions)
	}
}
