/**
SPDX-License-Identifier: GPL-3.0-only

@file profileWalk.ts

@copyright Copyright (C) 2013-2024 srcML, LLC. (www.srcML.org)
*/

import * as vscode from 'vscode';

import { LinePosition, SliceProfile } from '../../utils/collections';
import { fromFileTable } from '../generate';

export default class ProfileWalker {
    private slineIndex: number = 0;
    private profileIndex: number = 0;

    private profiles: Array<SliceProfile> = [];

    private lineFocus: vscode.TextEditorDecorationType|undefined;

    private slicePanel : vscode.WebviewView | undefined;

    constructor() {}

    setPanel(panel: vscode.WebviewView) {
        if (this.slicePanel) return; // only need to set this once
        this.slicePanel = panel;
    }

    private sortProfiles() {
        const profileMap = new Map<string, Array<SliceProfile>>();
        this.profiles.forEach( sp => {
            const [file, line, column, fileHash] = sp.sliceId.split('-');
            if (!profileMap.has(file)) {
                profileMap.set(file, []);
            }
            profileMap.get(file)?.push(sp);
        });

        this.profiles = [];

        // sort profiles by decl and rebuild the profiles array
        profileMap.forEach( (profiles, file) => {
            profiles.sort((a, b) => {
                const [aLine, aCol] = a.getDecl();
                const [bLine, bCol] = b.getDecl();
                return aLine !== bLine ? aLine - bLine : aCol - bCol;
            });
            this.profiles.push(... profiles);
        });
    }

    pushProfile(sp: SliceProfile, sline: [number, number] | undefined = undefined) {
        // do not insert duplicates
        if (this.profiles.find(p => p === sp)) return;
        console.log('[*] Adding Profile');

        this.profiles.push(sp);
        this.sortProfiles();

        if (this.slineIndex === 0) {
            // change index focus if the user is not
            // actively looking through the indexed slice
            this.profileIndex = this.profiles.length - 1;
        }
        
        // update index on new push
        if (!sline) return;
        // find command will send a sline based on selectedText
        // cursor is moved to that position
        this.slineIndex = sp.slines.findIndex(s => {
            return s[1].ToString() === `${sline[0]}:${sline[1]}`;
        });
    }
    popProfile(sp: SliceProfile|undefined) {
        if (!sp) return;
        console.log('[*] Removing Profile');

        const pos = this.profiles.findIndex(p => p === sp);
        if (pos === -1) return;

        this.profiles.splice(pos, 1);

        if (this.profiles.length > 0) {
            // re-index at most recent enabled profile (back of the array)
            this.profileIndex = this.profiles.length - 1;
            this.slineIndex = 0;

            this.repositionCursor();
        } else {
            this.clearDecorations();
        }
    }
    activeCount(): number { return this.profiles.length; };

    /**
     * Open a read-only editor based on the given
     * source file path
     * 
     * @param srcFile 
     */
    private async changeEditor(srcFile: string) {
        const file = fromFileTable(srcFile);
        const uri = vscode.Uri.from({
            scheme: "slice-preview",
            path: file,
            query: file
        });
        const doc = await vscode.workspace.openTextDocument(uri);
        // preserveFocus ensures focus is not stolen from the user when
        // pushing the document into foreground
        await vscode.window.showTextDocument(doc, { preserveFocus: true });
    }

    private moveCursor(pos: LinePosition|undefined) {
        if (!pos) return;

        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        // vscode position has an offset compared to stored position data
        const newCurPos = new vscode.Position(pos.line+1, pos.column+1);

        // show cursor position in the editor
        editor.selection = new vscode.Selection(newCurPos, newCurPos);
        editor.revealRange(
            new vscode.Range(newCurPos, newCurPos),
            vscode.TextEditorRevealType.InCenter
        );

        // dispose existing decoration before creating a new one
        this.clearDecorations();

        this.lineFocus = vscode.window.createTextEditorDecorationType({
            textDecoration: 'underline',
            isWholeLine: true
        });

        if (this.lineFocus) {
            const p = new vscode.Position(pos.line - 1, pos.column - 1);
            const r = new vscode.Range(p,p);
            editor?.setDecorations(this.lineFocus, [r]);
        }
    };

    /**
     * Move cursor to an sline
     */
    private async repositionCursor() {
        const sline = this.profiles[this.profileIndex].slines.at(this.slineIndex);
        if (!sline) return;

        const [ file, start, end ] = sline;
        await this.changeEditor(file);

        this.moveCursor(start);

        this.updateWalkDisplay();
    }

    /**
     * Move cursor to the next sline
     * 
     * @returns 
     */
    async nextOccurrance() {
        console.log("Find Next Sline");

        ++this.slineIndex;
        if (this.slineIndex >= this.profiles[this.profileIndex].slines.length) {
            this.profileIndex = ++this.profileIndex % this.profiles.length;
            this.slineIndex = 0;
        }

        await this.repositionCursor();
    }

    /**
     * Move cursor to the previous sline
     * 
     * @returns 
     */
    async lastOccurrance() {
        console.log("Find Previous Sline");

        --this.slineIndex;
        if (this.slineIndex < 0) {
            this.profileIndex = (--this.profileIndex + this.profiles.length) % this.profiles.length;
            this.slineIndex = this.profiles[this.profileIndex].slines.length - 1;
        }

        await this.repositionCursor();
    }

    private updateWalkDisplay() {
        const sp: SliceProfile = this.profiles[this.profileIndex];

        const sline: [number, number] = sp.getDecl();
        const targetString = `${sp.sliceData.name} ${sline[0]}:${sline[1]} ${sp.identifier}`;

        console.log(`[*] Find Find Focus String -> ${targetString}`);

        this.slicePanel?.webview.postMessage({
            command: 'update-find',
            findTarget: targetString
        });
    }

    private clearDecorations() {
        this.lineFocus?.dispose();
    }
    async hideFocusLine() {
        this.clearDecorations();
    }
};