/**
SPDX-License-Identifier: GPL-3.0-only

@file previewer.ts

@copyright Copyright (C) 2013-2024 srcML, LLC. (www.srcML.org)
*/

import * as vscode from 'vscode';

import * as fs from "fs";
import * as path from "path";

/**
 * Determins the vscode languageid based on file extension
 * 
 * @param fileName
 * @returns 
 */
function getLanguageId(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();

    switch (ext) {
        // C
        case ".c":
            return "c";
        case ".h":
            // Default .h headers to cpp, could be C if needed
            return "cpp";

        // C++
        case ".cpp":
        case ".cxx":
        case ".cc":
        case ".c++":
        case ".cp":
        case ".hpp":
        case ".hh":
        case ".hxx":
            return "cpp";

        // C#
        case ".cs":
            return "csharp";

        // Java
        case ".java":
            return "java";

        // Objective-C
        case ".m":
            return "objective-c";
        case ".mm":
            return "objective-cpp";

        // Other common C-family / misc
        case ".ino":   // Arduino
            return "cpp";
        case ".idl":
            return "cpp"; 

        default:
            return ""; // Unknown / no language
    }
}

class SlicePreviewFS implements vscode.FileSystemProvider {

    private files = new Map<string, Uint8Array>();
    private emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();

    readonly onDidChangeFile = this.emitter.event;

    setContent(uri: vscode.Uri, text: string) {
        const bytes = new TextEncoder().encode(text);
        this.files.set(uri.toString(), bytes);

        this.emitter.fire([{
            type: vscode.FileChangeType.Changed,
            uri
        }]);
    }

    stat(uri: vscode.Uri): vscode.FileStat {
        const data = this.files.get(uri.toString());

        return {
            type: vscode.FileType.File,
            ctime: 0,
            mtime: 0,
            size: data?.length ?? 0
        };
    }

    readFile(uri: vscode.Uri): Uint8Array {
        return this.files.get(uri.toString()) ?? new Uint8Array();
    }

    readDirectory(): [string, vscode.FileType][] {
        return [];
    }

    watch(): vscode.Disposable {
        return new vscode.Disposable(() => {});
    }

    private showDeny() { throw vscode.FileSystemError.NoPermissions("Snapshots are readonly"); };

    writeFile():       void { this.showDeny(); }
    delete():          void { this.showDeny(); }
    rename():          void { this.showDeny(); }
    createDirectory(): void { this.showDeny(); }
}

const sliceFS = new SlicePreviewFS();
vscode.workspace.registerFileSystemProvider(
    "slice-preview",
    sliceFS,
    { isReadonly: true }
);

interface Snapshot {
    textDoc: vscode.TextDocument;
    baseDoc: string;
}
export default class Previewer {
    private previewDocuments = new Map<string, Snapshot>();

    constructor() { this.reset(); }

    getSnapShotCount() {
        return this.previewDocuments.size;
    }

    async getSnapshot(srcPath:string): Promise<Snapshot | undefined> {
        const key = srcPath;
        if (!this.previewDocuments.has(key)) {
            try {

                const previewUri = vscode.Uri.from({
                    scheme: "slice-preview",
                    path: key,
                    query: key
                });
                
                /* populate virtual file */
                const content = fs.readFileSync(srcPath, "utf8");
                await sliceFS.setContent(previewUri, content);
    
                const doc = await vscode.workspace.openTextDocument(previewUri);
    
                /* preserve language highlighting */
                await vscode.languages.setTextDocumentLanguage(
                    doc,
                    getLanguageId(srcPath)
                );
    
                this.previewDocuments.set(key, {
                    textDoc: doc,
                    baseDoc: key
                });
            } catch (e) {
                console.error(`[PREVIEWER] ${e}`);
                return undefined;
            }
        }

        return this.previewDocuments.get(key);
    }

    findBaseUri(path: string): string | undefined {
        let baseFsPath: string | undefined;
        this.previewDocuments.forEach((v) => {
            if (v.textDoc.uri.fsPath === path) {
                baseFsPath = v.baseDoc;
            }
        });
        return baseFsPath;
    }

    reset() {
        for (const group of vscode.window.tabGroups.all) {
            for (const tab of group.tabs) {
                if (
                    tab.input instanceof vscode.TabInputText &&
                    tab.input.uri.scheme === "slice-preview"
                ) {
                    vscode.window.tabGroups.close(tab);
                }
            }
        }
        
        this.previewDocuments.clear();
    }
}