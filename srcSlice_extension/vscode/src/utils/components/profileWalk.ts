/**
SPDX-License-Identifier: GPL-3.0-only

@file profileWalk.ts

@copyright Copyright (C) 2013-2024 srcML, LLC. (www.srcML.org)
*/

import * as vscode from 'vscode';

import { LinePosition, SliceProfile } from '../../utils/collections';

export default class ProfileWalker {
    private slineIndex: number = -1;
    private profile: SliceProfile|undefined;
    private lineFocus: vscode.TextEditorDecorationType|undefined;

    constructor(sline: [number, number], sp: SliceProfile) {
        this.slineIndex = sp.slines.findIndex(s => {
            return s[1].ToString() === `${sline[0]}:${sline[1]}`;
        });
        this.profile = sp;
    }
    dtor() {
        this.slineIndex = -1;
        this.profile = undefined;
        this.lineFocus?.dispose();
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
        this.lineFocus?.dispose();
        this.lineFocus = vscode.window.createTextEditorDecorationType({
            backgroundColor: "#626262ce",
            isWholeLine: true
        });
        if (this.lineFocus) {
            const p = new vscode.Position(pos.line - 1, pos.column - 1);
            const r = new vscode.Range(p,p);
            editor?.setDecorations(this.lineFocus, [r]);
        }
    };

    /**
     * Move cursor to the next sline of a particular SliceProfile
     * 
     * @returns 
     */
    nextOccurrance() {
        if (!this.profile) return;

        console.log("Find Next Sline");

        this.slineIndex = (this.slineIndex+1) % this.profile.slines.length;
        const pos = this.profile.slines.at(this.slineIndex)?.[1];
        this.moveCursor(pos);
    }

    /**
     * Move cursor to the previous sline of a particular SliceProfile
     * 
     * @returns 
     */
    lastOccurrance() {
        if (!this.profile) return;
        
        console.log("Find Previous Sline");

        this.slineIndex = (this.slineIndex - 1 + this.profile.slines.length) % this.profile.slines.length;
        const pos = this.profile.slines.at(this.slineIndex)?.[1];
        this.moveCursor(pos);
    }
};