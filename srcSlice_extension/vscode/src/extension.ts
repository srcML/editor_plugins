/**
SPDX-License-Identifier: GPL-3.0-only

@file extension.ts

@copyright Copyright (C) 2013-2024 srcML, LLC. (www.srcML.org)
*/

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import * as path from 'path';

import * as fs from 'fs';
import * as xpath from 'xpath';
import { DOMParser } from '@xmldom/xmldom';

const SRCML_NS = 'http://www.srcML.org/srcML/src';
const POS_NS = 'http://www.srcML.org/srcML/position';

/**
 * Given a target unit and recent archive apply XPath to extract a list of
 * variable name strings that occur within the scanned unit
 * 
 * @param filename 
 * @param srcmlFile 
 * @returns 
 */
function extractNames(filename: string, srcmlFile: string) {
    const xmlString = fs.readFileSync(srcmlFile, 'utf-8');
    const doc = new DOMParser().parseFromString(xmlString, 'text/xml');

    const select = xpath.useNamespaces({
        src: SRCML_NS,
        pos: POS_NS
    });

    // all <name> elements not directly under <call>
    const nodes = select(
        `//src:unit[@filename="${filename}"]//src:name[parent::src:expr or parent::src:decl]`,
        doc
    ) as Node[];

    return nodes.map(node => {
        const el = node as Element;
        const name = el.textContent ?? '';
        const start = el.getAttribute('pos:start'); // e.g. "15:13"
        const end = el.getAttribute('pos:end');

        return { name, start, end };
    });
}

/**
 * Multi-line editor selection helper method
 * finds all profiles within a given multi-line
 * selection and performs a signal action against
 * each entry found
 * 
 * @param editor 
 * @param callback helper method that handles SliceSearch data
 * @returns 
 */
async function HandleSelection(editor: vscode.TextEditor, callback: (searchData: SliceSearch) => Promise<void>) {
    const selection = editor.selection;

    const startLine = selection.start.line + 1;       // 0-indexed
    const startCol = selection.start.character + 1;   // 0-indexed
    const endLine = selection.end.line + 1;
    const endCol = selection.end.character + 1;

    const srcmlFile = getRecentSrcML();
    const unitFile = getUnitFile(editor.document.uri.fsPath);

    if (!unitFile) {
        vscode.window.showErrorMessage("Error finding Unit File!");
        return;
    }

    console.log(`[DEBUG] ${unitFile} -> ${srcmlFile}`);

    const visited = new Set<string>();
    // array of distinct variables that occur within a multi-line selection
    const names = extractNames(unitFile, srcmlFile).filter( (name) => {
        let [line,col] = name.start?.split(':') ?? [];
        if (visited.has(name.name)) { return false; } // ignore duplicates

        // check line position
        if (Number(line) < startLine || Number(line) > endLine) { return false; }

        // check column position
        if (Number(line) === startLine && Number(col) < startCol) { return false; }
        if (Number(line) === endLine && Number(col) > endCol) { return false; }

        visited.add(name.name); // mark name as visited
        return true;
    } );

    console.log(names);

    // send find signal to each potential slice within the selection
    for (const v of names) {
        let [line,col] = v.start?.split(':') ?? [];
        const data: SliceSearch = {
            name: v.name,
            sline: [ Number(line), Number(col) ],
            file: fromFileTable(unitFile) ?? ""
        };
        await callback(data);
    }
}

import { SliceSearch, SrcSlicePanel } from './panel/panel';
import { fromFileTable, getRecentSrcML, getUnitFile } from './utils/generate';

/**
 * Creates a collection of target files that are copied to a tmp directory
 * and passed into srcML and srcSlice
 * 
 * @returns 
 */
function getTargets(): Array<[string,string]> {
    const tabs = vscode.window.tabGroups.all
                .flatMap(group => group.tabs)
                .filter(tab => tab.input instanceof vscode.TabInputText);

    let targets: Array<[string,string]> = [];
    for (const tab of tabs) {
        const input = tab.input as vscode.TabInputText;
        const filePath = input.uri.fsPath;

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(input.uri);
        if (!workspaceFolder) { continue; }

        const rootName = workspaceFolder.name;
        const relativePath = path.relative(
            workspaceFolder.uri.fsPath,
            filePath
        );

        // partial string used during copy: /tmp/abcdef/{tmpRelPath}
        const tmpRelPath = path.join(rootName, relativePath);

        targets.push([filePath,tmpRelPath]);
    }
    return targets;
}

/**
 * Creates a copy of the workspace to a tmp directory that is then
 * passed into srcML and srcSlice
 * 
 * @returns 
 */
async function getWorkspaceTargets(): Promise<Array<[string,string]>> {
    const files = await vscode.workspace.findFiles('**/*');

    let targets: Array<[string,string]> = [];
    for (const filePath of files.map(file => file.fsPath)) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) { continue; }

        const rootName = workspaceFolder.name;
        const relativePath = path.relative(
            workspaceFolder.uri.fsPath,
            filePath
        );

        // partial string used during copy: /tmp/abcdef/{tmpRelPath}
        const tmpRelPath = path.join(rootName, relativePath);

        targets.push([filePath,tmpRelPath]);
    }
    return targets;
}

interface SignalCtx {
    selectedText: string,
    selection: vscode.Selection,
    editor: vscode.TextEditor
}
/**
 * Use regex to extract potential variable names and their positions
 * to be used to find the best possible Slice Profile based on a
 * contained sline
 * 
 * Callback is related to how the function must use the search data, i.e FindSlice/HideSlice
 * 
 * @param ctx context regarding editor and editor selection
 * @param callback action to be performed
 */
async function SignalVariables(ctx: SignalCtx, callback: (searchData: SliceSearch) => Promise<void>) {
    // deconstruction of object
    const {selectedText, selection, editor} = ctx;

    // parse selected string and capture a list of variable names
    const regex = /\b[A-Za-z_][A-Za-z0-9_]*\b/g;
    let match;

    // use the exact position based on the regex match
    while ((match = regex.exec(selectedText)) !== null) {
        const name = match[0];
        const subStrPosition = match.index;

        const pos = editor.document.positionAt(
            editor.document.offsetAt(selection.start) + subStrPosition
        );

        // vscode positions are offset by one
        const searchData:SliceSearch = {
            name: name,
            sline: [pos.line + 1, pos.character + 1],
            file: editor.document.uri.fsPath
        };

        await callback(searchData);
    }
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    vscode.window.showInformationMessage("Slice Inspecter Active!");

    // establish custom context-events for detecting word select compared to section select
    const updateSelectionContext = (editor: vscode.TextEditor | undefined) => {
        if (!editor) {
            vscode.commands.executeCommand('setContext', 'slice-inspector.isWordSelection', false);
            vscode.commands.executeCommand('setContext', 'slice-inspector.isMultiLineSelection', false);
            return;
        }

        const sel = editor.selection;
        const isEmpty = sel.isEmpty;
        const isMultiLine = sel.start.line !== sel.end.line;

        const text = editor.document.getText(sel);
        const isWordSelection = !isEmpty && !isMultiLine && /^\w+$/.test(text);

        vscode.commands.executeCommand('setContext', 'slice-inspector.isWordSelection', isWordSelection);
        vscode.commands.executeCommand('setContext', 'slice-inspector.isMultiLineSelection', isMultiLine);
    };
    updateSelectionContext(vscode.window.activeTextEditor);

    // Update whenever the selection changes
    context.subscriptions.push(
        vscode.window.onDidChangeTextEditorSelection(e => updateSelectionContext(e.textEditor))
    );

    // Update when the active editor changes
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(updateSelectionContext)
    );

    let SlicePanel: SrcSlicePanel = new SrcSlicePanel(context);

    // subscribe an event to open the slice-viewer activity panel
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            "slice-viewer", // must match value for views.activitybar-id.id
            SlicePanel
        )
    );

    // event triggered when vscode document changes
    const docChange = vscode.window.onDidChangeActiveTextEditor(editor => {
        if (!editor) { return; }
        console.log(`Editor Changed (new tab opened) -> ${editor.document.uri.fsPath}`);
        SlicePanel?.Reload();
    });
    context.subscriptions.push(docChange);

    let getEditorSlices = vscode.commands.registerCommand("slice-inspector.getEditorSlices",
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }

            // gets the absolute file paths of active files in the workspace
            let targets: Array<[string,string]> = getTargets();
            
            await SlicePanel.ComputeSlices(targets);
            await vscode.commands.executeCommand('workbench.view.extension.slice-inspector');
        }
    );
    context.subscriptions.push(getEditorSlices);

    let getAllSlices = vscode.commands.registerCommand("slice-inspector.getAllSlices",
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }

            // gets the absolute file paths all files in the workspace
            let targets: Array<[string,string]> = await getWorkspaceTargets();
            
            await SlicePanel.ComputeSlices(targets);
            await vscode.commands.executeCommand('workbench.view.extension.slice-inspector');
        }
    );
    context.subscriptions.push(getAllSlices);

    let findSlice = vscode.commands.registerCommand("slice-inspector.findSlice",
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }

            const selection = editor.selection;
            const selectedText = editor.document.getText(selection);

            if (!selectedText) {
                vscode.window.showErrorMessage("No text is selected!");
                return;
            }

            
            SignalVariables({selectedText, selection, editor}, async (searchData: SliceSearch) => {
                if (!SlicePanel.HasProfiles()) {
                    // gets the absolute file paths of active files in the workspace
                    let targets: Array<[string,string]> = getTargets();

                    // generate slices
                    await SlicePanel.ComputeSlices( targets );
                }

                // send signal to mark desired slice
                await SlicePanel.FindSlice(searchData);
            });
            await vscode.commands.executeCommand('workbench.view.extension.slice-inspector');
        }
    );
    context.subscriptions.push(findSlice);
    let findSlices = vscode.commands.registerCommand("slice-inspector.findSlices",
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }

            if (!SlicePanel.HasProfiles()) {
                let targets: Array<[string,string]> = getTargets();
                await SlicePanel.ComputeSlices( targets );
            }

            console.log("[DEBUG]");
            await HandleSelection(editor, (data) => SlicePanel.FindSlice(data));
        }
    );
    context.subscriptions.push(findSlices);

    let hideSlice = vscode.commands.registerCommand("slice-inspector.hideSlice",
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }

            const selection = editor.selection;
            const selectedText = editor.document.getText(selection);

            if (!selectedText) {
                vscode.window.showErrorMessage("No text is selected!");
                return;
            }

            // gets the absolute file paths of active files in the workspace
            let targets: Array<[string,string]> = getTargets();

            SignalVariables({selectedText, selection, editor}, async (searchData: SliceSearch) => {
                if (!SlicePanel.HasProfiles()) {
                    // generate slices
                    await SlicePanel.ComputeSlices( targets );
                }

                // send signal to mark desired slice
                await SlicePanel.HideSlice(searchData);
            });
            await vscode.commands.executeCommand('workbench.view.extension.slice-inspector');
        }
    );
    context.subscriptions.push(hideSlice);
    let hideSlices = vscode.commands.registerCommand("slice-inspector.hideSlices",
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }

            if (!SlicePanel.HasProfiles()) {
                let targets: Array<[string,string]> = getTargets();
                await SlicePanel.ComputeSlices( targets );
            }

            await HandleSelection(editor, (data) => SlicePanel.HideSlice(data));
        }
    );
    context.subscriptions.push(hideSlices);

    let refreshVisuals = vscode.commands.registerCommand("slice-inspector.refreshVisuals",
        async () => {
            await SlicePanel.RefreshVisuals();
            await vscode.commands.executeCommand('workbench.view.extension.slice-inspector');
        }
    );
    context.subscriptions.push(refreshVisuals);

    let filterOn = vscode.commands.registerCommand("slice-inspector.filterOn",
        async () => {
            console.log("[!] Filter Profiles");
            SlicePanel.Filter(false);
            await vscode.commands.executeCommand('workbench.view.extension.slice-inspector');
        }
    );
    context.subscriptions.push(filterOn);
    let filterOff = vscode.commands.registerCommand("slice-inspector.filterOff",
        async () => {
            console.log("[!] No-Filter Profiles");
            SlicePanel.Filter(true);
            await vscode.commands.executeCommand('workbench.view.extension.slice-inspector');
        }
    );
    context.subscriptions.push(filterOff);
}

// This method is called when your extension is deactivated
export function deactivate() { }
