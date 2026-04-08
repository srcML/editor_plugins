/**
SPDX-License-Identifier: GPL-3.0-only

@file extension.ts

@copyright Copyright (C) 2013-2024 srcML, LLC. (www.srcML.org)
*/

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import * as path from 'path';

import { SliceSearch, SrcSlicePanel } from './panel/panel';

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
        if (!workspaceFolder) continue;

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
        if (!workspaceFolder) continue;

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
    vscode.window.showInformationMessage("srcSlice extension active!");

    let SlicePanel: SrcSlicePanel = new SrcSlicePanel(context);

    // subscribe an event to open the srcSlice-viewer activity panel
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            "srcSlice-viewer", // must match value for views.activitybar-id.id
            SlicePanel
        )
    );

    // event triggered when vscode document changes
    const docChange = vscode.window.onDidChangeActiveTextEditor(editor => {
        if (!editor) { return; }
        console.log(`Editor Changed (new tab opened) -> ${editor.document.uri.fsPath}`);
        SlicePanel?.Refresh();
    });
    context.subscriptions.push(docChange);

    let getEditorSlices = vscode.commands.registerCommand("srcslice-extension.getEditorSlices",
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }

            // gets the absolute file paths of active files in the workspace
            let targets: Array<[string,string]> = getTargets();
            
            await SlicePanel.ComputeSlices(targets);
            await vscode.commands.executeCommand('workbench.view.extension.srcSlice-extension');
        }
    );
    context.subscriptions.push(getEditorSlices);

    let getAllSlices = vscode.commands.registerCommand("srcslice-extension.getAllSlices",
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }

            // gets the absolute file paths all files in the workspace
            let targets: Array<[string,string]> = await getWorkspaceTargets();
            
            await SlicePanel.ComputeSlices(targets);
            await vscode.commands.executeCommand('workbench.view.extension.srcSlice-extension');
        }
    );
    context.subscriptions.push(getAllSlices);

    let findSlice = vscode.commands.registerCommand("srcslice-extension.findSlice",
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
                await SlicePanel.FindSlice(searchData);
            });
            await vscode.commands.executeCommand('workbench.view.extension.srcSlice-extension');
        }
    );
    context.subscriptions.push(findSlice);

    let hideSlice = vscode.commands.registerCommand("srcslice-extension.hideSlice",
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
            await vscode.commands.executeCommand('workbench.view.extension.srcSlice-extension');
        }
    );
    context.subscriptions.push(hideSlice);
}

// This method is called when your extension is deactivated
export function deactivate() { }
