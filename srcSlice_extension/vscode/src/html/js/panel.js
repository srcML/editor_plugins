/**
SPDX-License-Identifier: GPL-3.0-only

@file panel.js

@copyright Copyright (C) 2013-2024 srcML, LLC. (www.srcML.org)
*/

import { SendMessage, RefreshAll, ManageEntries,
         SelectSlice, GetNextOccurrance, GetLastOccurrance } from "./utils.js";

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
                ManageEntries(items, false);
            }
            // show list entries
            if (e.key === 'l') {
                ManageEntries(items, true);
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
            SendMessage({ command: 'quitFind' });
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
        SendMessage({ command: 'quitFind' });
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
        SendMessage({ command: 'refreshVisuals' });
        setTimeout(() => { RefreshAll() }, 100);
    });

    const profileFilterBtn = document.getElementById('profile-filter');
    profileFilterBtn?.addEventListener('click', () => {
        console.log(`[!] Filtering Profile List Display`);

        const sliceList = document.getElementById('slice-list');
        const items = Array.from(sliceList.querySelectorAll('[role="slice"]'));
        
        // find attached span element
        const btnIcon = profileFilterBtn.children.item(0);
        if (!btnIcon) return;
        
        if (btnIcon.classList.contains("codicon-filter")) {
            btnIcon.classList.remove("codicon-filter");
            
            // show filter active
            btnIcon.classList.add("codicon-filter-filled");
            btnIcon.title = "Show selected only";
            
            // popup feedback
            SendMessage({ command: 'filter', message: 'Hiding unselected profiles' });
        } else if (btnIcon.classList.contains("codicon-filter-filled")) {
            btnIcon.classList.remove("codicon-filter-filled");
            
            // show filter inactive
            btnIcon.classList.add("codicon-filter");
            btnIcon.title = "Show all profiles";
            
            // popup feedback
            SendMessage({ command: 'filter', message: 'Showing all profiles' });
        }
        
        // button click toggles the filtering just like the shortcuts ALT + K and ALT + L
        const showAll = (btnIcon.title === "Show all profiles");
        ManageEntries(items, showAll);
    });
}

HandleKeyboard();
HandleMouse();