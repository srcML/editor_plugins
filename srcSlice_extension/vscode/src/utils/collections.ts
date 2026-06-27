/**
SPDX-License-Identifier: GPL-3.0-only

@file collections.ts

@copyright Copyright (C) 2013-2024 srcML, LLC. (www.srcML.org)
*/

import * as vscode from 'vscode';

import { generateSlines, generateStepOvers, sleep } from './utils';
import { fromFileTable } from './generate';

// typedef alias
export interface SliceData {
    file:string,
    language:string,
    namespace:Array<string>,
    class:string,
    function:string,
    type:string,
    name:string,
    decl:string,
    dependence:Array<JSON>, // { "anything":"anything" }
    aliases:Array<JSON>,    // { "anything":"anything" }
    calls:Array<{
        functionName:string,
        parameter:string,
        definitionPosition:string,
        endOfFunction:string,
        invoke:string
    }>,
    use:Array<string>,
    definition:Array<string>,
    controlEdges?:Array<[string,string]>
}

/**
 * Holds the SliceProfile JSON-blob (sliceData) and JSON-blob Key String (sliceId)
 */
export class SliceProfile {
    public sliceData: SliceData;
    public sliceId: string;
    public identifier: string = "";
    public slines: Array<[string, LinePosition, LinePosition]> = [];
    public stepOvers: Array<[number,number]> = []; // collection of indice jumps to step over function calls
    public containedFiles: Set<string> = new Set<string>();

    constructor(id:string, data: SliceData) {
        this.sliceData = data;
        this.sliceId = id;
    }

    async setSlines() {
        this.slines = await generateSlines(this);

        this.stepOvers = await generateStepOvers(this.slines);

        console.log(this.stepOvers);

        // establish the list of files the slice is contained within
        // respective to the vscode.editor
        for (const sline of this.slines) {
            const tmpFile = sline[0];
            if (tmpFile) {
                const workspaceFile = fromFileTable(tmpFile);
                if (workspaceFile) {
                    // translate file from table
                    this.containedFiles.add(workspaceFile);
                }
            }
        }
    }

    /**
     * Display string formatted: `name declLine:declColumn`
     * 
     * example: `x 4:8`
     * 
     * @returns 
     */
    getDisplayString() {
        if (!this.sliceId) {
            vscode.window.showWarningMessage('Slice Id not defined');
            return "Display Error";
        }

        const components = this.sliceId.split("-");

        const name = components[0];
        const line = components[1];
        const column = components[2];

        return `${name} ${line}:${column}`;
    }

    /**
     * 
     * @returns file attribute from profile
     */
    getFile() {
        const { file } = this.sliceData;
        return file;
    }

    /**
     * 
     * @returns file hash string within slice id
     */
    getFileHash() {
        if (!this.sliceId) {
            vscode.window.showWarningMessage('Slice Id not defined');
            return "";
        }

        const components = this.sliceId.split("-");
        if (components.length === 4) {
            return components[components.length-1];
        }
        return "";
    }

    /**
     * 
     * @returns profile's declaration line:column position
     */
    getDecl(): [number, number] {
        if (!this.sliceData.decl) {
            vscode.window.showWarningMessage('Slice decl not defined');
            return [0,0];
        }

        const components = this.sliceData.decl.split(":");
        const line = components[1];
        const column = components[2];
        return [Number(line), Number(column)];
    }
};

/**
 * line:column position
 */
export class LinePosition {
    public line:number;
    public column:number;

    constructor(l:number = 0, c:number = 0) {
        this.line = l;
        this.column = c;
    }

    ToString() {
        return `${this.line}:${this.column}`;
    }
};

export class HighLight {
    private lineDecoration: vscode.TextEditorDecorationType|undefined;
    private rulerDecoration: vscode.TextEditorDecorationType|undefined;

    public fileTarget:string = "";
    private recentEditor: vscode.TextEditor|undefined;
    private isWholeLine: boolean = true;

    private color:string = "#0000000"; // full alpha
    private ranges: Array<vscode.Range> = [];
    private originalRanges: Array<vscode.Range> = []; // used to reset the this.ranges if modified

    constructor(color:string = "#62626260", wholeLine:boolean = true) {
        this.color = color;
        this.isWholeLine = wholeLine;
        
        const lineBehavior = wholeLine ? (
            vscode.DecorationRangeBehavior.OpenOpen
        ) : (
            vscode.DecorationRangeBehavior.ClosedClosed
        );

        this.lineDecoration = vscode.window.createTextEditorDecorationType({
            backgroundColor: color,
            isWholeLine: wholeLine,
            rangeBehavior: lineBehavior
        });

        if (wholeLine) {
            let bgColor = '';
            let mainColor = '';

            const themeKind = vscode.window.activeColorTheme.kind;
            if (themeKind === vscode.ColorThemeKind.Dark) {
                bgColor = '#9b9b9b7e';
                mainColor = '#d9d9d9';
            } else if (themeKind === vscode.ColorThemeKind.Light) {
                bgColor = '#bfbfbf3d';
                mainColor = '#343434';
            } else if (themeKind === vscode.ColorThemeKind.HighContrast) {
                bgColor = '#3e7ea541';
                mainColor = '#06B6D4';
            } else if (themeKind === vscode.ColorThemeKind.HighContrastLight) {
                bgColor = '#35ab495e';
                mainColor = '#3fde69';
            }

            // create a decoration that shows in the ruler section
            // of the scroll bar
            this.rulerDecoration = vscode.window.createTextEditorDecorationType({
                backgroundColor: bgColor,
                overviewRulerColor: mainColor,
                overviewRulerLane: vscode.OverviewRulerLane.Left
            });
        }
    }
    dtor() {
        console.log(`---> disposing decoration`);
        this.lineDecoration?.dispose();
        this.rulerDecoration?.dispose();

        this.color = "#00000000";
        this.lineDecoration = this.rulerDecoration = this.recentEditor = undefined;
        this.ranges = [];
    }

    async reApply(editor: vscode.TextEditor|undefined) {
        if (!this.ranges) { return; }
        if (!this.lineDecoration) { return; }

        // decorations are only applied to the given editor
        editor?.setDecorations(this.lineDecoration, this.ranges);

        if (this.rulerDecoration) {
            const getRuleRanges = (ranges: vscode.Range[]) => {
                const rulerRanges: vscode.Range[] = [];
                ranges.forEach(r => {
                    rulerRanges.push(new vscode.Range(r.start.line, 0, r.start.line, 0));
                });
                return rulerRanges;
            };
            editor?.setDecorations(this.rulerDecoration, getRuleRanges(this.ranges));
        }

        this.recentEditor = editor;
    }

    getColor() { return this.color; }

    getDecoration() { return this.lineDecoration; }

    setRanges(ranges: Array<vscode.Range>|undefined) {
        if (!ranges) { return; }
        this.ranges = ranges;

        if (this.originalRanges.length === 0) {
            this.originalRanges = [... this.ranges];
        }
    };
    getRanges() { return this.ranges; };

    // adds a given range is its not present
    addRange(range: vscode.Range) {
        this.ranges.forEach(r => {
            if (r.isEqual(range)) { return; }
        });
        this.ranges.push(range);
    }
    // removes a given range if possible
    removeRange(range: vscode.Range) {
        const index = this.ranges.findIndex(r => {
            return r.isEqual(range);
        });
        if (index === -1) { return; }
        this.ranges.splice(index, 1);
    }

    getRecentEditor() { return this.recentEditor; }
    setRecentEditor(editor: vscode.TextEditor|undefined) { if (editor) { this.recentEditor = editor; } }

    /**
     * 
     * @param other - highlight target
     * @returns if the current highlight has any overlapping ranges with a given highlight
     */
    overlaps(other: HighLight): boolean {
        if (this === other) { return true; }
        if (!other) { return false; }

        const fp1 = this.recentEditor?.document.uri.fsPath;
        const fp2 = other.getRecentEditor()?.document.uri.fsPath;

        // check if the high lights exist in the same editor
        if (fp1 !== fp2) { return false; }

        for (const r of this.ranges) {
            for (const r2 of other.getRanges()) {
                const matching = r.isEqual(r2);
                if (matching) { return true; }
            }
        }

        return false;
    }

    revert() {
        this.ranges = [];
        this.ranges = [... this.originalRanges];
        this.reApply(this.recentEditor);
    }

    applyRulerDecoration() {
        if (this.rulerDecoration) {
            const getRuleRanges = (ranges: vscode.Range[]) => {
                const rulerRanges: vscode.Range[] = [];
                ranges.forEach(r => {
                    rulerRanges.push(new vscode.Range(r.start.line, 0, r.start.line, 0));
                });
                return rulerRanges;
            };
            this.recentEditor?.setDecorations(this.rulerDecoration, getRuleRanges(this.ranges));
        }
    }
};

export class ColorToggle {
    private running: boolean = true;

    constructor(highLights: Set<HighLight>|undefined, commonRange: Set<vscode.Range>|undefined) {
        this.swapColors(highLights, commonRange);
    }
    dtor() {
        this.running = false;
    }

    private async swapColors(highLights: Set<HighLight>|undefined, commonRange: Set<vscode.Range>|undefined) {
        if (commonRange && highLights) {
            const clearRange = async () => {
                // remove the set of ranges all highlights in the group
                // have in common (intersection)
                highLights.forEach(target => {
                    commonRange.forEach(range => {
                        target.removeRange(range);
                    });
                    target.reApply(target.getRecentEditor());
                });
            };
            await clearRange();

            while (this.running) {
                // iterate over each highlight entry and apply
                // the intersection range
                for (const focus of highLights) {
                    for (const target of highLights) {
                        if (!this.running) { return; }

                        await clearRange();
                        for (const range of commonRange) {
                            if (focus === target) {
                                target.addRange(range);
                            } else {
                                target.removeRange(range);
                            }
                        }
                        target.reApply(target.getRecentEditor());
                        if (focus === target) { await sleep(1000); }
                    }
                }
            }
        }
    }
};