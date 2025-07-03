// Import Firebase services
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, collection, query, where, orderBy, limit, getDocs, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc, FieldValue, serverTimestamp as firestoreServerTimestamp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { app, auth, db } from './firebase-config.js'; // Import the initialized Firebase app, auth, and db

// Global variables (now explicitly exported if needed by other modules)
export let activeDepotFilterId = null; // Stores the ID of the currently active depot filter

// Import functions from other modules that main.js needs to call
import { renderDepotsDropdown, generateGrNo, loadDepotsList, editDepot, deleteDepot } from './depot.js';
import { renderPartiesDatalist, loadPartiesList, editParty, deleteParty } from './party.js';
import { renderSettingsDepotList, promptForDepotPassword, clearDepotPassword } from './settings.js';
import { loadGrRecords, printGrSlip, editGr, deleteGr } from './gr.js';

// Define serverTimestamp from Firestore's FieldValue for consistent export
export const serverTimestamp = firestoreServerTimestamp; // Export the FieldValue.serverTimestamp

document.addEventListener('DOMContentLoaded', () => {
    // Event Listeners for Navigation
    document.querySelectorAll('.nav-button').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.nav-button').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            showView(button.dataset.view);
        });
    });

    // Initial view based on URL hash or default
    const initialView = window.location.hash ? window.location.hash.substring(1) : 'dashboardView';
    showView(initialView);
    const initialNavButton = document.querySelector(`.nav-button[data-view="${initialView}"]`);
    if (initialNavButton) {
        initialNavButton.classList.add('active');
    }

    // Auth state observer
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // User is signed in
            document.getElementById('authView').classList.add('hidden');
            document.getElementById('mainContent').classList.remove('hidden');

            // Load initial data for logged-in user
            await loadDashboardRecentGRs();
            await loadDepotsList();
            await loadPartiesList();
            await renderDepotsDropdown(); // For GR Entry form
            await renderPartiesDatalist(); // For GR Entry form
            await loadGrRecords(); // For GR Records view
            await renderSettingsDepotList(); // For settings view

            // Generate GR No on depot select
            const depotSelect = document.getElementById('depotSelect');
            if (depotSelect) {
                depotSelect.addEventListener('change', () => generateGrNo(depotSelect.value));
            }

            // Set today's date for GR Entry
            const grDateInput = document.getElementById('grDate');
            if (grDateInput) {
                grDateInput.valueAsDate = new Date();
            }

        } else {
            // User is signed out
            document.getElementById('authView').classList.remove('hidden');
            document.getElementById('mainContent').classList.add('hidden');
            // Hide registration form initially if on login view
            const loginSection = document.getElementById('loginSection');
            const registerSection = document.getElementById('registerSection');
            if (loginSection && registerSection) {
                loginSection.classList.remove('hidden');
                registerSection.classList.add('hidden');
            }
        }
    });

    // Login/Register form toggles
    const showRegisterLink = document.getElementById('showRegister');
    const showLoginLink = document.getElementById('showLogin');
    if (showRegisterLink) {
        showRegisterLink.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('loginSection').classList.add('hidden');
            document.getElementById('registerSection').classList.remove('hidden');
        });
    }
    if (showLoginLink) {
        showLoginLink.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('registerSection').classList.add('hidden');
            document.getElementById('loginSection').classList.remove('hidden');
        });
    }

    // Logout button
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            try {
                await auth.signOut();
                showCustomModal('Logged Out', 'You have been successfully logged out.', 'alert');
            } catch (error) {
                console.error('Logout Error:', error);
                showCustomModal('Logout Failed', 'Failed to log out: ' + error.message, 'alert');
            }
        });
    }

    // Clear GR Entry Form button
    const clearGrFormButton = document.getElementById('clearGrFormButton');
    if (clearGrFormButton) {
        clearGrFormButton.addEventListener('click', () => {
            const grEntryForm = document.getElementById('grEntryForm');
            if (grEntryForm) {
                grEntryForm.reset();
                document.getElementById('grEntryId').value = '';
                document.getElementById('grDate').valueAsDate = new Date();
                // Ensure GR No is re-generated if depot is selected
                const depotSelect = document.getElementById('depotSelect');
                if (depotSelect && depotSelect.value) {
                    generateGrNo(depotSelect.value);
                } else {
                    document.getElementById('grNo').value = ''; // Clear if no depot
                }
            }
        });
    }

    // Clear GR Records Filters button
    const clearGrFiltersButton = document.getElementById('clearGrFiltersButton');
    if (clearGrFiltersButton) {
        clearGrFiltersButton.addEventListener('click', () => {
            document.getElementById('grRecordsSearch').value = '';
            document.getElementById('grRecordsDepotFilter').value = '';
            document.getElementById('grRecordsDateFilter').value = '';
            activeDepotFilterId = null; // Clear the global filter
            loadGrRecords(); // Reload records without filters
            renderDepotFilterButtons(); // Re-render buttons to reflect no active filter
        });
    }
});


/**
 * Shows a specific view section and hides others.
 * @param {string} viewId - The ID of the section to show (e.g., 'dashboardView').
 */
export function showView(viewId) { // Export showView
    document.querySelectorAll('.view-section').forEach(section => {
        section.classList.add('hidden');
    });
    const targetView = document.getElementById(viewId);
    if (targetView) {
        targetView.classList.remove('hidden');
        window.location.hash = viewId; // Update URL hash
    }
}

/**
 * Loads and displays recent GR entries for the dashboard.
 */
export async function loadDashboardRecentGRs() { // Export loadDashboardRecentGRs
    const dashboardRecentGrList = document.getElementById('dashboardRecentGrList');
    if (!dashboardRecentGrList) return; // Exit if element not found

    dashboardRecentGrList.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-500">Loading recent GRs...</td></tr>';

    if (!auth.currentUser) {
        dashboardRecentGrList.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-500">Please log in to view recent GRs.</td></tr>';
        return;
    }

    try {
        const q = query(
            collection(db, 'gr_entries'),
            where('userId', '==', auth.currentUser.uid),
            orderBy('createdAt', 'desc'),
            limit(5)
        );
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            dashboardRecentGrList.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-500">No recent GRs to display.</td></tr>';
            return;
        }

        dashboardRecentGrList.innerHTML = ''; // Clear loading message
        querySnapshot.forEach(doc => {
            const gr = doc.data();
            const grDate = gr.grDate ? new Date(gr.grDate).toLocaleDateString() : 'N/A';
            const row = `
                <tr class="hover:bg-gray-50">
                    <td class="py-3 px-4">${gr.grNo}</td>
                    <td class="py-3 px-4">${grDate}</td>
                    <td class="py-3 px-4">${gr.consigneeName}</td>
                    <td class="py-3 px-4">${gr.destination}</td>
                    <td class="py-3 px-4">${gr.depotName}</td>
                </tr>
            `;
            dashboardRecentGrList.insertAdjacentHTML('beforeend', row);
        });
    } catch (error) {
        console.error('Error loading dashboard recent GRs:', error);
        dashboardRecentGrList.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-red-500">Error loading GRs.</td></tr>';
    }
}

/**
 * Displays a custom modal dialog (alert, confirm, or prompt).
 * @param {string} title - The title of the modal.
 * @param {string} message - The message to display.
 * @param {'alert'|'confirm'|'prompt'} type - The type of modal.
 * @returns {Promise<boolean|string|null>} - Resolves with true/false for confirm, string for prompt, null for alert.
 */
export function showCustomModal(title, message, type = 'alert') { // Export showCustomModal
    const modal = document.getElementById('customModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    const modalInput = document.getElementById('modalInput');
    const modalButtons = document.getElementById('modalButtons');

    if (!modal || !modalTitle || !modalMessage || !modalInput || !modalButtons) {
        console.error('Modal elements not found.');
        alert(`${title}: ${message}`); // Fallback to native alert
        return Promise.resolve(null);
    }

    return new Promise(resolve => {
        modalTitle.textContent = title;
        modalMessage.textContent = message;
        modalInput.classList.add('hidden'); // Hide input by default
        modalInput.value = ''; // Clear previous input
        modalButtons.innerHTML = ''; // Clear previous buttons

        if (type === 'prompt') {
            modalInput.type = 'text'; // Default to text for prompt
            if (message.toLowerCase().includes('password')) {
                modalInput.type = 'password'; // Use password type if message implies password
            }
            modalInput.classList.remove('hidden');
            const submitButton = document.createElement('button');
            submitButton.textContent = 'Submit';
            submitButton.classList.add('bg-blue-600', 'hover:bg-blue-700', 'text-white', 'font-bold', 'py-2', 'px-4', 'rounded-md', 'shadow-md', 'transition', 'duration-200', 'ease-in-out');
            submitButton.onclick = () => {
                modal.classList.add('hidden');
                resolve(modalInput.value);
            };
            const cancelButton = document.createElement('button');
            cancelButton.textContent = 'Cancel';
            cancelButton.classList.add('bg-gray-200', 'hover:bg-gray-300', 'text-gray-800', 'font-bold', 'py-2', 'px-4', 'rounded-md', 'shadow-sm', 'transition', 'duration-200', 'ease-in-out');
            cancelButton.onclick = () => {
                modal.classList.add('hidden');
                resolve(null);
            };
            modalButtons.appendChild(cancelButton);
            modalButtons.appendChild(submitButton);

        } else if (type === 'alert') {
            const okButton = document.createElement('button');
            okButton.textContent = 'OK';
            okButton.classList.add('bg-blue-600', 'hover:bg-blue-700', 'text-white', 'font-bold', 'py-2', 'px-4', 'rounded-md', 'shadow-md', 'transition', 'duration-200', 'ease-in-out');
            okButton.onclick = () => {
                modal.classList.add('hidden');
                resolve(true);
            };
            modalButtons.appendChild(okButton);
        } else if (type === 'confirm') {
            const cancelButton = document.createElement('button');
            cancelButton.textContent = 'Cancel';
            cancelButton.classList.add('bg-gray-200', 'hover:bg-gray-300', 'text-gray-800', 'font-bold', 'py-2', 'px-4', 'rounded-md', 'shadow-sm', 'transition', 'duration-200', 'ease-in-out');
            cancelButton.onclick = () => {
                modal.classList.add('hidden');
                resolve(false);
            };

            const okButton = document.createElement('button');
            okButton.textContent = 'OK';
            okButton.classList.add('bg-blue-600', 'hover:bg-blue-700', 'text-white', 'font-bold', 'py-2', 'px-4', 'rounded-md', 'shadow-md', 'transition', 'duration-200', 'ease-in-out');
            okButton.onclick = () => {
                modal.classList.add('hidden');
                resolve(true);
            };

            modalButtons.appendChild(cancelButton);
            modalButtons.appendChild(okButton);
        }

        modal.classList.remove('hidden');
    });
}

/**
 * Render depot filter buttons for GR Records view.
 * This needs to be called after depots are loaded.
 */
export async function renderDepotFilterButtons() { // Export renderDepotFilterButtons
    const depotFilterSelect = document.getElementById('grRecordsDepotFilter');
    if (!depotFilterSelect) return;

    // Clear existing options, but keep the default "All Depots" option
    depotFilterSelect.innerHTML = '<option value="">All Depots</option>';

    if (!auth.currentUser) return;

    try {
        const q = query(
            collection(db, 'depots'),
            where('userId', '==', auth.currentUser.uid),
            orderBy('name')
        );
        const querySnapshot = await getDocs(q);

        querySnapshot.forEach((doc) => {
            const depot = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = depot.name;
            depotFilterSelect.appendChild(option);
        });

        // Set the current filter if one is active
        if (activeDepotFilterId) {
            depotFilterSelect.value = activeDepotFilterId;
        }
    } catch (error) {
        console.error('Error rendering depot filter buttons:', error);
        showCustomModal('Error', 'Failed to load depots for filter: ' + error.message, 'alert');
    }
}

/**
 * Clears the currently active depot filter.
 */
export function clearActiveDepotFilter() { // Export clearActiveDepotFilter
    activeDepotFilterId = null;
    const depotFilterSelect = document.getElementById('grRecordsDepotFilter');
    if (depotFilterSelect) {
        depotFilterSelect.value = ''; // Reset the dropdown
    }
    loadGrRecords(); // Reload GRs without the filter
    showCustomModal('Filter Cleared', 'Depot filter has been cleared.', 'alert');
}

// Expose functions to the global window object for inline onclick attributes
// This is typically for old-style event handlers, prefer addEventListener if possible
window.editDepot = editDepot;
window.deleteDepot = deleteDepot;
window.editParty = editParty;
window.deleteParty = deleteParty;
window.editGr = editGr;
window.deleteGr = deleteGr;
window.printGrSlip = printGrSlip;
window.promptForDepotPassword = promptForDepotPassword;
window.clearDepotPassword = clearDepotPassword;