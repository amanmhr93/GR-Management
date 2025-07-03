import { auth, db } from './firebase-config.js'; // Import auth and db from firebase-config.js
import { showCustomModal, activeDepotFilterId, clearActiveDepotFilter, renderDepotFilterButtons } from './main.js'; // Import from main.js
import { collection, doc, getDocs, setDoc, updateDoc, deleteDoc, query, where, orderBy, FieldValue, addDoc, getDoc, limit } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";


let editingDepotId = null;

document.addEventListener('DOMContentLoaded', () => { // Wrap in DOMContentLoaded
    const depotForm = document.getElementById('depotForm');
    const clearDepotFormButton = document.getElementById('clearDepotFormButton');

    if (depotForm) {
        depotForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('depotName').value;
            const address = document.getElementById('depotAddress').value;
            const gst = document.getElementById('depotGST').value;

            if (!auth.currentUser) {
                showCustomModal('Authentication Required', 'You must be logged in to manage depots.', 'alert');
                return;
            }

            try {
                if (editingDepotId) {
                    // Update existing depot
                    await updateDoc(doc(db, 'depots', editingDepotId), { // Modular updateDoc
                        name,
                        address,
                        gst
                    });
                    showCustomModal('Success', 'Depot updated successfully!', 'alert');
                } else {
                    // Add new depot
                    await addDoc(collection(db, 'depots'), { // Modular addDoc
                        name,
                        address,
                        gst,
                        userId: auth.currentUser.uid,
                        createdAt: FieldValue.serverTimestamp()
                    });
                    showCustomModal('Success', 'Depot added successfully!', 'alert');
                }
                depotForm.reset();
                editingDepotId = null;
                loadDepotsList();
                renderDepotsDropdown(); // Refresh dropdown on GR entry
                renderDepotFilterButtons(); // Refresh buttons on GR records filter
            } catch (error) {
                console.error('Depot Save Error:', error);
                showCustomModal('Error', 'Failed to save depot: ' + error.message, 'alert');
            }
        });
    }

    if (clearDepotFormButton) {
        clearDepotFormButton.addEventListener('click', () => {
            if (depotForm) {
                depotForm.reset();
                editingDepotId = null;
                document.getElementById('depotId').value = ''; // Clear hidden ID
            }
        });
    }
});


/**
 * Loads and displays the list of depots in the Depot Master table.
 */
export async function loadDepotsList() {
    const depotsTableBody = document.getElementById('depotsTableBody');
    if (!depotsTableBody) return;

    depotsTableBody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-gray-500">Loading depots...</td></tr>';

    if (!auth.currentUser) {
        depotsTableBody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-gray-500">Please log in to view depots.</td></tr>';
        return;
    }

    try {
        const q = query(
            collection(db, 'depots'),
            where('userId', '==', auth.currentUser.uid),
            orderBy('name')
        );
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            depotsTableBody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-gray-500">No depots to display.</td></tr>';
            return;
        }

        depotsTableBody.innerHTML = ''; // Clear loading message
        querySnapshot.forEach(doc => {
            const depot = doc.data();
            const row = `
                <tr class="hover:bg-gray-50">
                    <td class="py-3 px-4">${depot.name}</td>
                    <td class="py-3 px-4">${depot.address || ''}</td>
                    <td class="py-3 px-4">${depot.gst || ''}</td>
                    <td class="py-3 px-4">
                        <button class="bg-blue-500 text-white px-3 py-1 rounded-md text-sm mr-2 hover:bg-blue-600" onclick="editDepot('${doc.id}')">Edit</button>
                        <button class="bg-red-500 text-white px-3 py-1 rounded-md text-sm hover:bg-red-600" onclick="deleteDepot('${doc.id}', '${depot.name}')">Delete</button>
                    </td>
                </tr>
            `;
            depotsTableBody.insertAdjacentHTML('beforeend', row);
        });
    } catch (error) {
        console.error('Error loading depots:', error);
        depotsTableBody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-red-500">Error loading depots.</td></tr>';
    }
}

/**
 * Populates the depot dropdown in the GR Entry form.
 */
export async function renderDepotsDropdown() {
    const depotSelect = document.getElementById('depotSelect');
    if (!depotSelect) return;

    depotSelect.innerHTML = '<option value="">Select Depot</option>'; // Default option

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
            option.value = doc.id; // Store depot ID as value
            option.textContent = depot.name;
            depotSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error populating depots dropdown:', error);
        showCustomModal('Error', 'Failed to load depots for dropdown: ' + error.message, 'alert');
    }
}

/**
 * Edits a depot.
 * @param {string} id - The ID of the depot to edit.
 */
export async function editDepot(id) {
    if (!auth.currentUser) {
        showCustomModal('Authentication Required', 'You must be logged in to edit depots.', 'alert');
        return;
    }
    try {
        const depotDoc = await getDoc(doc(db, 'depots', id));
        if (depotDoc.exists()) {
            const depot = depotDoc.data();
            document.getElementById('depotId').value = id;
            document.getElementById('depotName').value = depot.name;
            document.getElementById('depotAddress').value = depot.address || '';
            document.getElementById('depotGST').value = depot.gst || '';
            editingDepotId = id;
            showCustomModal('Editing Depot', `Now editing: ${depot.name}`, 'alert');
            showView('depotView'); // Ensure depot view is active
        } else {
            showCustomModal('Error', 'Depot not found!', 'alert');
        }
    } catch (error) {
        console.error('Error editing depot:', error);
        showCustomModal('Error', 'Failed to retrieve depot for editing: ' + error.message, 'alert');
    }
}

/**
 * Deletes a depot after confirmation.
 * @param {string} id - The ID of the depot to delete.
 * @param {string} name - The name of the depot for confirmation message.
 */
export async function deleteDepot(id, name) {
    if (!auth.currentUser) {
        showCustomModal('Authentication Required', 'You must be logged in to delete depots.', 'alert');
        return;
    }
    const confirmed = await showCustomModal('Confirm Delete', `Are you sure you want to delete depot: ${name}? This action cannot be undone.`, 'confirm');
    if (!confirmed) {
        return;
    }
    try {
        await deleteDoc(doc(db, 'depots', id));
        showCustomModal('Success', 'Depot deleted successfully!', 'alert');
        loadDepotsList();
        renderDepotsDropdown(); // Refresh dropdown on GR entry
        renderDepotFilterButtons(); // Refresh buttons on GR records filter
        if (editingDepotId === id) { // If the deleted depot was being edited
            document.getElementById('depotForm').reset();
            editingDepotId = null;
            document.getElementById('depotId').value = '';
        }
    } catch (error) {
        console.error('Error deleting depot:', error);
        showCustomModal('Error', 'Failed to delete depot: ' + error.message, 'alert');
    }
}

/**
 * Generates the next GR number based on the selected depot and updates the GR No. field.
 * @param {string} depotId - The ID of the selected depot.
 */
export async function generateGrNo(depotId) {
    const grNoInput = document.getElementById('grNo');
    if (!grNoInput || !depotId || !auth.currentUser) {
        grNoInput.value = '';
        return;
    }

    try {
        const depotDoc = await getDoc(doc(db, 'depots', depotId));
        if (!depotDoc.exists()) {
            console.error('Selected depot not found.');
            grNoInput.value = '';
            return;
        }
        const depotData = depotDoc.data();
        // Generate prefix based on depot name (e.g., first 3 letters of depot name, uppercase, and without spaces/special chars
        const depotPrefix = depotData.name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase();

        // Query for the latest GR number for the *selected depot*
        const q = query(
            collection(db, 'gr_entries'), // Modular collection
            where('userId', '==', auth.currentUser.uid),
            where('depotId', '==', depotId), // Filter by selected depot
            orderBy('grNo', 'desc'), // Order by the string GR number
            limit(1) // Limit is now imported
        );
        const snapshot = await getDocs(q); // Modular getDocs

        let nextGrNumber = 1;
        if (!snapshot.empty) {
            const latestGr = snapshot.docs[0].data();
            const lastGrNo = latestGr.grNo; // e.g., "DEL-001", "DEL-002"
            const parts = lastGrNo.split('-');
            const numPart = parseInt(parts[parts.length - 1]); // Get the last part, convert to number
            if (!isNaN(numPart)) {
                nextGrNumber = numPart + 1;
            }
        }
        // Format the number with leading zeros, e.g., 001, 002
        const formattedGrNumber = String(nextGrNumber).padStart(3, '0');
        document.getElementById('grNo').value = `${depotPrefix}-${formattedGrNumber}`;

    } catch (error) {
        console.error('Error generating GR No.:', error);
        showCustomModal('Error', 'Failed to generate GR number: ' + error.message, 'alert');
        grNoInput.value = '';
    }
}