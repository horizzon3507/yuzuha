// @ts-check
/** @type {import('../../src/tooling/language.js').FunctionMetadata[]} */
const builtins = require('./functions.json');

/** @param {import('vscode').ExtensionContext} context */
exports.activate = async context => {
  const vscode = require('vscode');
  const language = await import('./language.mjs');
  return exports.activateEditor(context, vscode, language);
};

/**
 * @param {import('vscode').ExtensionContext} context
 * @param {typeof import('vscode')} vscode
 * @param {typeof import('../../src/tooling/language.js')} language
 */
exports.activateEditor = (context, vscode, language) => {
  const selectors = ['yuzuha', 'javascript', 'typescript', 'javascriptreact', 'typescriptreact'];
  const diagnostics = vscode.languages.createDiagnosticCollection('yuzuha');
  const catalogDiagnostics = vscode.languages.createDiagnosticCollection('yuzuha-catalogs');
  /** @type {Map<string, import('../../src/tooling/language.js').FunctionMetadata[]>} */
  const catalogs = new Map();
  /** @type {import('vscode').Disposable[]} */
  let watchers = [];
  let generation = 0, disposed = false;
  /** @param {import('vscode').TextDocument} document */
  const definitions = document => catalogs.get(vscode.workspace.getWorkspaceFolder(document.uri)?.uri.toString() ?? '') ?? builtins;
  /** @param {import('vscode').TextDocument} document @param {import('vscode').Position} position */
  const region = (document, position) => language.scriptRegion(document.getText(), document.offsetAt(position), document.languageId);
  /** @param {{usage: string, description: string}} value */
  const docs = value => {
    const markdown = new vscode.MarkdownString();
    markdown.isTrusted = false;
    markdown.appendCodeblock(value.usage, 'yuzuha');
    markdown.appendText(value.description);
    return markdown;
  };
  /** @param {import('vscode').TextDocument} document */
  const update = document => {
    if (disposed || document.isClosed) return;
    const enabled = vscode.workspace.getConfiguration('yuzuha', document.uri).get('diagnostics.enabled', true);
    if (!enabled || !selectors.includes(document.languageId)) { diagnostics.delete(document.uri); return; }
    diagnostics.set(document.uri, language.documentDiagnostics(document.getText(), document.languageId, definitions(document)).map(value => {
      const item = new vscode.Diagnostic(new vscode.Range(document.positionAt(value.start), document.positionAt(value.end)), value.message, vscode.DiagnosticSeverity.Error);
      item.source = 'Yuzuha'; item.code = value.code;
      return item;
    }));
  };
  const refresh = () => { for (const document of vscode.workspace.textDocuments) update(document); };
  async function reloadCatalogs() {
    const current = ++generation;
    const next = new Map();
    /** @type {[import('vscode').Uri, import('vscode').Diagnostic[]][]} */
    const errors = [];
    /** @type {{folder: import('vscode').WorkspaceFolder, path: string}[]} */
    const paths = [];
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const key = folder.uri.toString();
      const files = vscode.workspace.getConfiguration('yuzuha', folder.uri).get('functionCatalogs', /** @type {string[]} */ ([]));
      /** @type {import('../../src/tooling/language.js').FunctionMetadata[][]} */
      const loaded = [];
      let valid = true;
      if (!Array.isArray(files)) {
        valid = false;
        errors.push([vscode.Uri.joinPath(folder.uri, '.vscode/settings.json'), [new vscode.Diagnostic(new vscode.Range(0, 0, 0, 1),
          'yuzuha.functionCatalogs precisa ser uma lista de caminhos.', vscode.DiagnosticSeverity.Error)]]);
      }
      else for (const file of files) {
        if (typeof file !== 'string' || !file || file.startsWith('/') || file.includes('\\')
          || file.split('/').some(part => part === '..') || /^[a-z][\w+.-]*:/i.test(file)) {
          errors.push([vscode.Uri.joinPath(folder.uri, '.vscode/settings.json'), [new vscode.Diagnostic(new vscode.Range(0, 0, 0, 1),
            'yuzuha.functionCatalogs aceita caminhos relativos dentro do workspace.', vscode.DiagnosticSeverity.Error)]]);
          valid = false; continue;
        }
        paths.push({ folder, path: file });
        const uri = vscode.Uri.joinPath(folder.uri, file);
        try {
          const stat = await vscode.workspace.fs.stat(uri);
          if (stat.size > 2_000_000) throw new Error('Catálogo excede 2000000 bytes.');
          const bytes = await vscode.workspace.fs.readFile(uri);
          loaded.push(language.parseFunctionCatalog(new TextDecoder().decode(bytes)));
        } catch (error) {
          valid = false;
          const message = error instanceof Error ? error.message : 'Não foi possível ler o catálogo.';
          errors.push([uri, [new vscode.Diagnostic(new vscode.Range(0, 0, 0, 1), message, vscode.DiagnosticSeverity.Error)]]);
        }
      }
      if (valid) {
        try { next.set(key, language.mergeFunctionCatalogs(builtins, ...loaded)); }
        catch (error) {
          const message = error instanceof Error ? error.message : 'Catálogos incompatíveis.';
          errors.push([vscode.Uri.joinPath(folder.uri, '.vscode/settings.json'), [new vscode.Diagnostic(new vscode.Range(0, 0, 0, 1), message, vscode.DiagnosticSeverity.Error)]]);
          next.set(key, catalogs.get(key) ?? builtins);
        }
      } else next.set(key, catalogs.get(key) ?? builtins);
    }
    if (disposed || current !== generation) return;
    catalogs.clear(); for (const [key, value] of next) catalogs.set(key, value);
    catalogDiagnostics.clear(); for (const [uri, values] of errors) catalogDiagnostics.set(uri, values);
    for (const watcher of watchers) watcher.dispose();
    watchers = [];
    for (const { folder, path } of paths) {
      const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, path));
      watchers.push(watcher, watcher.onDidChange(reloadCatalogs), watcher.onDidCreate(reloadCatalogs), watcher.onDidDelete(reloadCatalogs));
    }
    refresh();
  }
  context.subscriptions.push(diagnostics, catalogDiagnostics, { dispose() {
    disposed = true; generation++;
    for (const watcher of watchers) watcher.dispose();
  } });
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(update));
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => update(event.document)));
  context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(document => diagnostics.delete(document.uri)));
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration('yuzuha')) { refresh(); return reloadCatalogs(); }
  }));
  context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(reloadCatalogs));
  context.subscriptions.push(vscode.languages.registerCompletionItemProvider(selectors, {
    provideCompletionItems(document, position) {
      const text = region(document, position);
      if (!text) return [];
      return language.complete(text.source, text.offset, definitions(document)).map(value => {
        const item = new vscode.CompletionItem('$' + value.name, vscode.CompletionItemKind.Function);
        item.detail = value.usage;
        item.documentation = docs(value);
        item.insertText = new vscode.SnippetString(value.snippet);
        item.range = new vscode.Range(document.positionAt(language.documentOffset(text, value.start)), position);
        return item;
      });
    },
  }, '$'));
  context.subscriptions.push(vscode.languages.registerHoverProvider(selectors, {
    provideHover(document, position) {
      const text = region(document, position);
      const value = text && language.hoverAt(text.source, text.offset, definitions(document));
      if (value) return new vscode.Hover(docs(value));
    },
  }));
  context.subscriptions.push(vscode.languages.registerSignatureHelpProvider(selectors, {
    provideSignatureHelp(document, position) {
      const text = region(document, position);
      const value = text && language.signatureAt(text.source, text.offset, definitions(document));
      if (!value) return undefined;
      const signature = new vscode.SignatureInformation(value.usage, value.description);
      signature.parameters = value.parameters.map(parameter => new vscode.ParameterInformation(parameter));
      const help = new vscode.SignatureHelp();
      help.signatures = [signature]; help.activeSignature = 0; help.activeParameter = value.activeParameter;
      return help;
    },
  }, '[', ';'));
  refresh();
  return reloadCatalogs();
};
