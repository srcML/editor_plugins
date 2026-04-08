/**
SPDX-License-Identifier: GPL-3.0-only

@file utils.js

@copyright Copyright (C) 2013-2024 srcML, LLC. (www.srcML.org)
*/

export const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : undefined;

/**
 * [ slideId:string, color:string ]
 */
let selectedProfiles = [];
const alphaValue = "75";
let profileColors = [
    "#4c9aff",
    "#f6ff4d",
    "#00BFA6",
    "#FFB020",
    "#E57373"
];
const unselectedColor = "#6666667e";

// webview listens for input from vscode
if (vscode) {
    window.addEventListener('message', event => {
        const msg = event.data;
        console.log(msg);
        if (msg.command) {
            if (msg.command === "auto-select") {
                // short-cut endpoint to find a slice
                if (selectedProfiles.length < profileColors.length) {
                    addSelected(msg.sliceId);
                }
                ShowSelected();
            } else if (msg.command === "hide") {
                if (msg.sliceId) {
                    const index = selectedProfiles.findIndex(s => {
                        return s[0] === msg.sliceId;
                    });

                    if (index !== -1) {
                        console.log("Attempting to Hide Selected");

                        const hideTarget = selectedProfiles[index];
                        const highlightColor = hideTarget[1] + alphaValue;

                        // remove selected item
                        selectedProfiles.splice(index, 1);

                        GreyFill(highlightColor, msg.sliceId);
                    }
                }
            } else if (msg.command === "refresh") {
                RefreshAll();
            } else if (msg.command === "update-find") {
                if (msg.findTarget) {
                    const bottomBar = document.querySelector('.bottom-bar');
                    const findDisplay = document.getElementById('find_target_display');

                    if (bottomBar) {
                        bottomBar.style.display = 'block'; // display it
                        if (findDisplay) {
                            findDisplay.textContent = msg.findTarget;
                        }
                        bottomBar?.focus();
                    }
                }
            } else if (msg.command === "hide-find") {
                const bottomBar = document.querySelector('.bottom-bar');
                const findDisplay = document.getElementById('find_target_display');

                if (bottomBar) {
                    bottomBar.style.display = 'none'; // hide it
                    if (findDisplay) {
                        findDisplay.textContent = "";
                    }
                }
            }
        }
    });
}

/**
 * Find the svg associated with a selected sliceId and grey-fill
 * to show deselection
 * 
 * @param {*} highlightColor 
 * @param {*} sliceId 
 */
function GreyFill(highlightColor, sliceId) {
    // signals vscode api from webview panel
    vscode?.postMessage({
        command: 'rmHighlight',
        color: highlightColor
    });

    // change the fill color of the html elements svg to show unselected feedback
    // note that, the original color persists in the selectedProfiles list
    const li = document.querySelector(
        `#slice-list li[data-profile="${CSS.escape(sliceId)}"]`
    );
    const circle = li.querySelector("svg circle");
    circle?.setAttribute("fill", unselectedColor);
}

function FindUnusedColor() {
    // make a copy of allowed high-light colors
    let colors = [...profileColors];

    for (const item of selectedProfiles) {
        const index = colors.findIndex(c => {
            return c === item[1];
        });

        if (index !== -1) {
            colors.splice(index, 1);
        }
    }
    return colors.at(0);
}

/**
 * Append a new selected profile entry into collection
 * 
 * @param {*} sliceId 
 */
function addSelected(sliceId) {
    // check if sliceId is already in selectedProfiles
    if (selectedProfiles.find(s => { return s[0] === sliceId})) return;

    // push the new entry using the unused color
    const color = FindUnusedColor();
    if (color) {
        console.log("NEW SELECTION");
        selectedProfiles.push([sliceId, color]);
    }
};

function ShowSelected() {
    const [sliceid, color] = selectedProfiles.at(-1);
    if (!sliceid || !color) return;

    const li = document.querySelector(
        `#slice-list li[data-profile="${CSS.escape(sliceid)}"]`
    );
    const circle = li?.querySelector("svg circle");
    circle?.setAttribute("fill", color);

    showEntry(li);

    const highLightColor = color + alphaValue;
    // signals vscode api from webview panel
    vscode?.postMessage({
        command: 'highlight',
        sliceId: sliceid,
        color: highLightColor
    });
}

function RefreshAll() {
    // send a highlight signal passing all active items
    for (const item of selectedProfiles) {
        const li = document.querySelector(
            `#slice-list li[data-profile="${CSS.escape(item[0])}"]`
        );
        const circle = li?.querySelector("svg circle");
        circle?.setAttribute("fill", item[1]);
        
        showEntry(li);

        const highLightColor = item[1] + alphaValue;
        // signals vscode api from webview panel
        vscode?.postMessage({
            command: 'highlight',
            sliceId: item[0],
            color: highLightColor
        });
    }
}

let unselected = undefined;
function SelectSlice(sliceId, ctrlDown) {
    // pop helper method
    const popItem = (t) => {
        const i = selectedProfiles.findIndex(s => { return s === t});
        if (i !== -1) {
            selectedProfiles.splice(i, 1);
        }
    };

    /**
     * Remove a selected item from the selectedProfiles collection
     * 
     * Update the attached svg fill color to unselected color value
     * 
     * @param {*} t selected item
     * @return newly unselected profile or undefined
     */
    const unselectItem = (t) => {
        if (!t) return undefined;

        console.log("UNSELECTING");

        // remove newly unselected from active list
        popItem(t);

        const highlightColor = t[1] + alphaValue;

        GreyFill(highlightColor, t[0]);

        return t;
    };

    /**
     * Swap Highlight color values between a selectedProfile t and an unselected
     * 
     * @param {*} t profile swap target
     */
    const swapColors = (t) => {
        if (!unselected) return;

        // keep a copy of the color of the unselected item to apply to its swap target
        const tmpColor = unselected[1];

        // change the values of the elements directly
        unselected[1] = t[1];

        const targetIndex = selectedProfiles.findIndex(s => { return s === t});
        selectedProfiles[targetIndex][1] = tmpColor;

        // refresh the state to ensure all changes
        // are displayed on the extension side
        RefreshAll();
    }

    const target = selectedProfiles.find(s => { return s[0] === sliceId });
    if (unselected) {
        if (selectedProfiles.includes(target)) {
            if (ctrlDown) {
                // swap
                swapColors(target);
                // reinsert unselected into collection
                selectedProfiles.push(unselected);
            } else {
                unselected = unselectItem(target);
            }
        } else {
            // drop the recently unselected item
            // and add a new selection to the collection
            unselected = undefined;
            addSelected(sliceId);
        }
    } else {
        if (selectedProfiles.includes(target)) {
            unselected = unselectItem(target);
        } else if (selectedProfiles.length < profileColors.length) {
            addSelected(sliceId);
        }
    }

    // show interaction feedback (selected/unselected)
    ShowSelected();
}

function GetNextOccurrance() {
    vscode.postMessage({ command: 'nextOccurrance' });
}

function GetLastOccurrance() {
    vscode.postMessage({ command: 'lastOccurrance' });
}

function manageEntries(entries, isVisible) {
    if (!entries) return;
    entries.forEach(li => {
        const circle = li.querySelector("svg circle");
        const fillColor = circle?.getAttribute("fill");

        // keep selected profiles visible
        if (circle && fillColor !== unselectedColor) {
            return;
        }

        li.style.display = isVisible ? '' : 'none';
    });
}

function showEntry(entry) {
    if (!entry) return;
    entry.style.display = '';
}

let currentIndex = 0;
export function HandleKeyboard() {
    const sliceList = document.getElementById('slice-list');
    const items = Array.from(sliceList.querySelectorAll('[role="slice"]'));

    // Initialize focus on the first item when sliceList itself is focused
    sliceList?.addEventListener('focus', () => {
        items[currentIndex].tabIndex = 0;
        items[currentIndex].focus();
    });

    // Handle arrow key navigation
    sliceList?.addEventListener('keydown', (e) => {
        e.preventDefault();
        const ctrlDown = e.ctrlKey;
        const altDown = e.altKey;
        
        if (altDown) {
            // hide list entries
            if (e.key === 'k') {
                manageEntries(items, false);
            }
            // show list entries
            if (e.key === 'l') {
                manageEntries(items, true);
            }

            return;
        }

        if (e.key === 'ArrowDown') {
            items[currentIndex].tabIndex = -1;
            currentIndex = (currentIndex + 1) % items.length;
            items[currentIndex].tabIndex = 0;

            items[currentIndex].focus();
        } else if (e.key === 'ArrowUp') {
            items[currentIndex].tabIndex = -1;
            currentIndex = (currentIndex - 1 + items.length) % items.length;
            items[currentIndex].tabIndex = 0;

            items[currentIndex].focus();
        } else if (e.key === 'Home') {
            items[currentIndex].tabIndex = -1;
            currentIndex = 0;
            items[currentIndex].tabIndex = 0;

            items[currentIndex].focus();
        } else if (e.key === 'End') {
            items[currentIndex].tabIndex = -1;
            currentIndex = items.length - 1;
            items[currentIndex].tabIndex = 0;

            items[currentIndex].focus();
        } else if (e.key === 'Enter' || e.key === ' ') {
            // extracts the data-profile attribute value
            const value = items[currentIndex].dataset.profile;
            
            SelectSlice(value,ctrlDown);
        }
    });
    
    const profileFind = document.querySelector('.bottom-bar');
    profileFind?.addEventListener('keydown', (e) => {
        e.preventDefault();
        const shiftDown = e.shiftKey;
        
        if (e.key === 'Enter' || e.key === ' ') {
            if (shiftDown) {
                // prev
                console.log("Find Prev Instance")
                GetLastOccurrance();
            } else {
                // next
                console.log("Find Next Instance")
                GetNextOccurrance();
            }
        } else if (e.key === "Escape") {
            vscode.postMessage({ command: 'quitFind' });
        }
    });
}

export function HandleMouse() {
    const sliceList = document.getElementById('slice-list');

    // mouse input
    sliceList?.addEventListener("click", (e) => {

        // get the closet list item on click
        const item = e.target.closest("li");
        if (!item || !sliceList.contains(item)) { return; }

        // extracts the data-profile attribute value
        const value = item.dataset.profile;

        const ctrlDown = e.ctrlKey;
        SelectSlice(value,ctrlDown);
    });

    // find exit button
    const findExitBtn = document.getElementById('findExitBtn');
    findExitBtn?.addEventListener('click', () => {
        vscode.postMessage({ command: 'quitFind' });
    });

    // find next button
    const findNextBtn = document.getElementById('findNextBtn');
    findNextBtn?.addEventListener('click', () => {
        GetNextOccurrance();
    });

    // find prev button
    const findPrevBtn = document.getElementById('findPrevBtn');
    findPrevBtn?.addEventListener('click', () => {
        GetLastOccurrance();
    });

    // visual refresh button
    const refreshVisualsBtn = document.getElementById('refresh-visuals');
    refreshVisualsBtn?.addEventListener('click', () => {
        console.log(`[!] Signaling Visualizer to Refresh`);
        vscode.postMessage({ command: 'refreshVisuals' });
        setTimeout(() => { RefreshAll() }, 100);
    });
}