/**
SPDX-License-Identifier: GPL-3.0-only

@file panel.ts

@copyright Copyright (C) 2013-2024 srcML, LLC. (www.srcML.org)
*/

import * as vscode from 'vscode';

import { srcML, srcSlice, fromFileTable } from '../utils/generate';
import { SliceProfile, SliceData } from '../utils/collections';
import { generateIdentifiers } from '../utils/utils';

import * as fs from "fs";
import * as path from "path";
import Visualizer from '../utils/components/visualize';
import ProfileWalker from '../utils/components/profileWalk';

export interface SliceSearch {
    name: string,
    sline: [number, number] | null | undefined,
    file: string
};

/**
 * 
 * @param filePath source code file path
 * @param targets array of source file path strings
 * @returns whether slices could be obtained from a source code file and the srcSlice output file
 */
async function computeSlices( targets: Array<[string,string]> ): Promise<[boolean,string,string]> {
    // (tuple) files = [tmpFilePath, srcMLOutput]
    vscode.window.setStatusBarMessage('passing file into srcML');
    const [srcMLSuccess, files] = await srcML(targets); // tuple deconstruct

    // if srcML ran successfully attempt to run srcSlice
    if (srcMLSuccess) {
        const [tmpFilePath, srcMLOutput] = files;

        vscode.window.setStatusBarMessage(`srcML output → ${tmpFilePath}`);

        vscode.window.setStatusBarMessage('generating slices');
        const [srcSliceSuccess, sliceFile] = await srcSlice(srcMLOutput); // srcslice output file path
        if (srcSliceSuccess) {
            vscode.window.setStatusBarMessage('slices generated!');
            return [true, srcMLOutput, sliceFile];
        } else {
            vscode.window.setStatusBarMessage('Error occured with srcSlice');
            return [false, srcMLOutput, ""];
        }
    } else {
        vscode.window.showErrorMessage('Error occured with srcML');
        return [false, "", ""];
    }
}

/**
 * Extracts Slice Profiles from srcSlice output file
 * @param srcSliceOutput srcSlice output file path
 * @returns Array of slice profiles extracted from srcSlice output file
 */
async function readSliceOutput(srcSliceOutput:string): Promise<Array<SliceProfile>> {
    try {
        const fileContent = fs.readFileSync(srcSliceOutput, 'utf-8');
        const slices = JSON.parse(fileContent);
        
        if (slices && typeof slices === 'object') {
            let profiles: Array<SliceProfile> = new Array<SliceProfile>();
            const sliceKeys = Object.keys(slices);

            const fileMap = new Map<string, Array<string>>();

            for (const sliceKey of sliceKeys) {
                const slice: SliceData = slices[sliceKey];
                const profile:SliceProfile = new SliceProfile(sliceKey, slice);
                
                await profile.setSlines();
                profiles.push(profile);

                const fileBase = path.basename(profile.getFile());

                if (!fileMap.has(fileBase)) {
                    fileMap.set(fileBase, []);
                }
                fileMap.get(fileBase)?.push(sliceKey);
            }

            // iterate over the group of sliceKeys values within the same base-file key
            for (const sliceKeys of fileMap.values()) {
                profiles = await generateIdentifiers(profiles, sliceKeys);
            }

            return profiles;
        } else {
            console.error('[-] Error occurred parsing JSON or JSON is not an object!');
            return [];
        }
    } catch (err) {
        console.error(`[-] Error: ${err}`);
        return [];
    }
}

// Responsible for adding content into the activity bar
export class SrcSlicePanel implements vscode.WebviewViewProvider {
    private slices: Array<SliceProfile> = new Array<SliceProfile>();

    private panel: vscode.WebviewView|undefined;
    private ctx: vscode.ExtensionContext;

    private visualizer:Visualizer|undefined;
    private walker:ProfileWalker|undefined;

    resolveWebviewView(view: vscode.WebviewView) {
        this.panel = view;

        view.webview.options = {
            enableScripts: true
        };

        // content displayed in the activity bar
        view.webview.html = `
        <!DOCTYPE html>
        <html>
            <body>
                <h2>No Slices Computed</h2>
            </body>
        </html>
        `;

        // listen for signals from webview panel
        view.webview.onDidReceiveMessage(
            async (msg) => {
                if (msg.command) {
                    this.ParseCommand(msg);
                }
            },
            undefined
        );
    };

    constructor(context: vscode.ExtensionContext) {
        this.ctx = context;
        this.visualizer = new Visualizer(context);

        // when an edit is detected, if the user computed slices
        // inform the user that the slices may need recomputed
        vscode.workspace.onDidChangeTextDocument(event => {
            console.log("[!] Detected edit in editor");
            this.SendEditNotify();
        });
    }

    async ParseCommand(data:any) {
        if (data.command === "highlight") {
            // find the SliceProfile provided by the data
            const sliceId:string = data.sliceId;
            const highLightColor:string = data.color;

            const slice:SliceProfile|undefined = this.slices.find(sp => {
                return sp.sliceId === sliceId;
            });
            if (!slice) return;

            await this.visualizer?.CreateSliceMarkup(slice, highLightColor);
            await this.visualizer?.RenderBackgrounds();
        } else if (data.command === "rmHighlight") {
            const color:string = data.color;
            
            await this.visualizer?.RemoveSliceMarkup(color);
            await this.visualizer?.RenderBackgrounds();
        } else if (data.command === "nextOccurrance") {
            this.walker?.nextOccurrance();
        } else if (data.command === "lastOccurrance") {
            this.walker?.lastOccurrance();
        } else if (data.command === "quitFind") {
            if (this.walker) {
                // remove the walker
                this.panel?.webview.postMessage({
                    command: 'hide-find'
                });
                this.walker.dtor();
            }
        } else if (data.command === "refreshVisuals") {
            await this.visualizer?.ResetVisuals();
            setTimeout(() => {this.visualizer?.CheckOverlaps();}, 200);
        } else if (data.command === "filter") {
            vscode.window.showInformationMessage(data.message);
        } else {
            console.error(`Unknown Command: ${data.command}`);
        }
    }

    /**
     * Computes the slices between a list of given files
     * 
     * @param targets Array of file path strings
     */
    async ComputeSlices( targets: Array<[string,string]> ) {
        const [
            result,
            srcMLOutput,
            srcSliceOutput
        ] = await computeSlices(targets);

        if (result) {
            this.slices = await readSliceOutput(srcSliceOutput);
            if (this.slices.length === 0) {
                vscode.window.showWarningMessage("No Slices were generated", "Ok");
                return;
            }

            this.visualizer?.ResetPreviewer();
            this.visualizer?.ResetNotify();

            if (this.panel) {
                this.panel.webview.html = `
                <!DOCTYPE html>
                <html>
                    <body>
                        <h2>Loading Profiles</h2>
                    </body>
                </html>
                `;
            }
            await this.UpdateView();
        }
    }

    async Refresh() {
        // send signal to auto-select item
        this.panel?.webview.postMessage({
            command: 'refresh'
        });
    }

    /**
     * After slices are computed they are displayed in the primary bar
     * WebView after modifying a HTML file template
     * 
     * @returns 
     */
    async UpdateView() {
        if (!this.panel) { return; }

        // clear pre-existing highlight line decorations
        this.ClearHighlights();

        // sort the slices by identifier strings
        this.slices = this.slices.sort((a, b) => {
            return a.identifier.localeCompare(b.identifier);
        });

        // sort slices by line:def
        this.slices = this.slices.sort((a, b) => {
            if (a.identifier === b.identifier) {
                const [a_line, a_col] = a.getDecl();
                const [b_line, b_col] = b.getDecl();

                if (a_line !== b_line) {
                    return a_line - b_line;
                }

                return a_col - b_col;
            }

            return 0;
        });

        let sliceList = "";
        let recentSection = undefined;
        let newSection = false;

        const activeEditors = vscode.window.visibleTextEditors;

        for (const slice of this.slices) {
            // upon section change
            if (!recentSection || (recentSection !== slice.identifier)) {
                if (newSection) {
                    // close the previous section
                    sliceList += "</details>";
                }

                const fileActive = activeEditors.find(editor => {
                    return editor.document.uri.fsPath === fromFileTable(slice.getFile());
                });
                
                // create a new section to group
                // slices of alike identifier strings
                sliceList += `
                <details ${ (fileActive) ? "open" : "close"}>
                    <summary>${slice.identifier}</summary>\n
                `;

                recentSection = slice.identifier;
                newSection = true;
            }

            sliceList += `
            <li role="slice" tabindex="-1" data-profile="${slice.sliceId}">
                <svg class="icon" width="16" height="16">
                    <circle cx="8" cy="8" r="4" fill="#6666667e"></circle>
                </svg>
                ${slice.getDisplayString()}
            </li>
            `;
        }
        if (newSection) {
            // close the previous section if one was created
            sliceList += "</details>";
        }
        
        const baseDir = __dirname;

        const filePath = path.join(baseDir, "../../src/html/panel.html");
        let fileContent = await fs.promises.readFile(filePath, "utf8");

        // inject the slice list into the webview
        fileContent = fileContent.replace("{{slice_profiles}}",sliceList);
        
        // convert the path to panel.js into a vscode uri in order to load it into
        // the panel.html page
        const scriptPath = vscode.Uri.file(
            path.join(this.ctx.extensionPath, 'src/html/js/panel.js')
        );
        const scriptUri = this.panel.webview.asWebviewUri(scriptPath);
        fileContent = fileContent.replace("{{script_uri}}", scriptUri.toString());

        this.panel.webview.html = fileContent;
    }

    /**
     * 
     * @param name slice profile name
     * @param file file path slice is contained within
     * @param sline target profile sline
     * @returns slice profile
     */
    private async FindSliceFromSline(name:string, file:string, sline: [Number,Number]) {
        const t_sline = `${sline?.[0]}:${sline?.[1]}`;
        const sp = this.slices.find(s => {
            if (s.sliceData.name === name) {
                for (const sline of s.slines) {
                    const matchingPosition:boolean  = t_sline === sline[1].ToString();
                    const matchingFile:boolean      = fromFileTable(s.sliceData.file) === file;
    
                    if (matchingPosition && matchingFile) {
                        return s;
                    }
                }
            }
        });
        return sp;
    }

    private DisplayFind(sline: [number, number], sp: SliceProfile) {
        if (this.walker) {
            this.walker.dtor();
        }
        this.walker = new ProfileWalker(sline, sp);

        const targetString = `${sp.sliceData.name} ${sline[0]}:${sline[1]} ${sp.identifier}`;

        // signal to focus on the find section
        // of the panel
        this.panel?.webview.postMessage({
            command: 'update-find',
            findTarget: targetString
        });
    }

    async FindSlice(data: SliceSearch) {
        const { name, sline, file } = data;
        if (!sline) return;
        if (this.slices.length === 0) return;

        const sp = await this.FindSliceFromSline(name, file, sline);
        if (!sp) {
            vscode.window.showWarningMessage(`Slice not Found: ${name}`);
            return;
        }

        console.log(`Finding Slice Id -> ${sp.sliceId}`);

        this.DisplayFind(sline, sp);

        // send signal to auto-select item
        this.panel?.webview.postMessage({
            command: 'auto-select',
            sliceId: sp.sliceId
        });
    }

    async HideSlice(data: SliceSearch) {
        const { name, sline, file } = data;
        if (!sline) return;
        if (this.slices.length === 0) return;

        const sp = await this.FindSliceFromSline(name, file, sline);
        if (!sp) return;

        console.log(`Hiding Slice Id -> ${sp.sliceId}`);

        // send signal to auto-select item
        this.panel?.webview.postMessage({
            command: 'hide',
            sliceId: sp.sliceId
        });
    }

    async ClearHighlights() {
        this.visualizer?.ClearHighlights();
    }

    async SendEditNotify() {
        if (this.slices.length === 0) return;
        await this.visualizer?.SendEditNotify();
    }

    HasProfiles() { return this.slices.length > 0; }
    GetProfileWalker() { return this.walker; }
}