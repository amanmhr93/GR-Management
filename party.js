import { auth, db } from './firebase-config.js'; // Import auth and db from firebase-config.js
import { showCustomModal, showView, serverTimestamp } from './main.js'; // Import showCustomModal, showView, and serverTimestamp from main.js
import { collection, doc, getDocs, addDoc, updateDoc, deleteDoc, query, where, orderBy } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";


let editingPartyId = null;

document.addEventListener('DOMContentLoaded', () => { // Wrap in DOMContentLoaded
    const partyForm = document.getElementById('partyForm');
    const bulkPartyData = document.getElementById('bulkPartyData');
    const bulkAddPartiesButton = document.getElementById('bulkAddPartiesButton');
    const clearPartyFormButton = document.getElementById('clearPartyFormButton');

    if (partyForm) {
        partyForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('partyName').value;
            const address = document.getElementById('partyAddress').value;
            const gst = document.getElementById('partyGST').value;

            if (!auth.currentUser) {
                showCustomModal('Authentication Required', 'You must be logged in to manage parties.', 'alert');
                return;
            }

            try {
                if (editingPartyId) {
                    // Update existing party
                    await updateDoc(doc(db, 'parties', editingPartyId), { // Modular updateDoc
                        name,
                        address,
                        gst
                    });
                    showCustomModal('Success', 'Party updated successfully!', 'alert');
                } else {
                    // Add new party
                    await addDoc(collection(db, 'parties'), { // Modular addDoc
                        name,
                        address,
                        gst,
                        userId: auth.currentUser.uid,
                        createdAt: serverTimestamp()
                    });
                    showCustomModal('Success', 'Party added successfully!', 'alert');
                }
                partyForm.reset();
                editingPartyId = null;
                loadPartiesList();
                renderPartiesDatalist();
            } catch (error) {
                console.error('Party Save Error:', error);
                showCustomModal('Error', 'Failed to save party: ' + error.message, 'alert');
            }
        });
    }

    if (bulkAddPartiesButton) {
        bulkAddPartiesButton.addEventListener('click', () => {
            if (bulkPartyData) {
                bulkAddParties(bulkPartyData.value);
            }
        });
    }

    if (clearPartyFormButton) {
        clearPartyFormButton.addEventListener('click', () => {
            if (partyForm) {
                partyForm.reset();
                editingPartyId = null;
                document.getElementById('partyId').value = '';
            }
        });
    }
});


/**
 * Loads and displays the list of parties in the Party Master table.
 */
export async function loadPartiesList() {
    const partiesTableBody = document.getElementById('partiesTableBody');
    if (!partiesTableBody) return;

    partiesTableBody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-gray-500">Loading parties...</td></tr>';

    if (!auth.currentUser) {
        partiesTableBody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-gray-500">Please log in to view parties.</td></tr>';
        return;
    }

    try {
        const q = query(
            collection(db, 'parties'),
            where('userId', '==', auth.currentUser.uid),
            orderBy('name')
        );
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            partiesTableBody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-gray-500">No parties to display.</td></tr>';
            return;
        }

        partiesTableBody.innerHTML = ''; // Clear loading message
        querySnapshot.forEach(doc => {
            const party = doc.data();
            const row = `
                <tr class="hover:bg-gray-50">
                    <td class="py-3 px-4">${party.name}</td>
                    <td class="py-3 px-4">${party.address || ''}</td>
                    <td class="py-3 px-4">${party.gst || ''}</td>
                    <td class="py-3 px-4">
                        <button class="bg-blue-500 text-white px-3 py-1 rounded-md text-sm mr-2 hover:bg-blue-600" onclick="editParty('${doc.id}')">Edit</button>
                        <button class="bg-red-500 text-white px-3 py-1 rounded-md text-sm hover:bg-red-600" onclick="deleteParty('${doc.id}', '${party.name}')">Delete</button>
                    </td>
                </tr>
            `;
            partiesTableBody.insertAdjacentHTML('beforeend', row);
        });
    } catch (error) {
        console.error('Error loading parties:', error);
        partiesTableBody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-red-500">Error loading parties.</td></tr>';
    }
}

/**
 * Populates the datalist for consignee name input in the GR Entry form.
 */
export async function renderPartiesDatalist() {
    const partiesDatalist = document.getElementById('partiesDatalist');
    if (!partiesDatalist) return;

    partiesDatalist.innerHTML = ''; // Clear existing options

    if (!auth.currentUser) return;

    try {
        const q = query(
            collection(db, 'parties'),
            where('userId', '==', auth.currentUser.uid),
            orderBy('name')
        );
        const querySnapshot = await getDocs(q);

        querySnapshot.forEach((doc) => {
            const party = doc.data();
            const option = document.createElement('option');
            option.value = party.name;
            partiesDatalist.appendChild(option);
        });
    } catch (error) {
        console.error('Error populating parties datalist:', error);
        showCustomModal('Error', 'Failed to load parties for auto-complete: ' + error.message, 'alert');
    }
}

/**
 * Edits a party.
 * @param {string} id - The ID of the party to edit.
 */
export async function editParty(id) {
    if (!auth.currentUser) {
        showCustomModal('Authentication Required', 'You must be logged in to edit parties.', 'alert');
        return;
    }
    try {
        const partyDoc = await doc(db, 'parties', id);
        const partySnapshot = await getDoc(partyDoc); // Use getDoc
        if (partySnapshot.exists()) {
            const party = partySnapshot.data();
            document.getElementById('partyId').value = id;
            document.getElementById('partyName').value = party.name;
            document.getElementById('partyAddress').value = party.address || '';
            document.getElementById('partyGST').value = party.gst || '';
            editingPartyId = id;
            showCustomModal('Editing Party', `Now editing: ${party.name}`, 'alert');
            showView('partyView'); // Ensure party view is active
        } else {
            showCustomModal('Error', 'Party not found!', 'alert');
        }
    } catch (error) {
        console.error('Error editing party:', error);
        showCustomModal('Error', 'Failed to retrieve party for editing: ' + error.message, 'alert');
    }
}

/**
 * Deletes a party after confirmation.
 * @param {string} id - The ID of the party to delete.
 * @param {string} name - The name of the party for confirmation message.
 */
export async function deleteParty(id, name) {
    if (!auth.currentUser) {
        showCustomModal('Authentication Required', 'You must be logged in to delete parties.', 'alert');
        return;
    }
    const confirmed = await showCustomModal('Confirm Delete', `Are you sure you want to delete party: ${name}? This action cannot be undone.`, 'confirm');
    if (!confirmed) {
        return;
    }
    try {
        await deleteDoc(doc(db, 'parties', id));
        showCustomModal('Success', 'Party deleted successfully!', 'alert');
        loadPartiesList();
        renderPartiesDatalist();
        if (editingPartyId === id) { // If the deleted party was being edited
            document.getElementById('partyForm').reset();
            editingPartyId = null;
            document.getElementById('partyId').value = '';
        }
    } catch (error) {
        console.error('Error deleting party:', error);
        showCustomModal('Error', 'Failed to delete party: ' + error.message, 'alert');
    }
}

/**
 * Adds multiple parties from a CSV-like string.
 * @param {string} csvData - String containing party data (Name, Address, GST No. per line).
 */
export async function bulkAddParties(csvData) {
    if (!auth.currentUser) {
        showCustomModal('Authentication Required', 'You must be logged in to bulk add parties.', 'alert');
        return;
    }

    if (!csvData.trim()) {
        showCustomModal('Input Required', 'Please paste party data in the text area.', 'alert');
        return;
    }

    const lines = csvData.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    if (lines.length === 0) {
        showCustomModal('Input Required', 'No valid data found in the text area.', 'alert');
        return;
    }

    let successfulAdds = 0;
    let failedAdds = 0;
    const errors = [];

    for (const line of lines) {
        const parts = line.split(',').map(part => part.trim());
        if (parts.length >= 1) { // Name is required
            const name = parts[0];
            const address = parts[1] || '';
            const gst = parts[2] || '';

            if (!name) {
                errors.push(`Skipping line due to missing name: "${line}"`);
                failedAdds++;
                continue;
            }

            try {
                await addDoc(collection(db, 'parties'), {
                    name,
                    address,
                    gst,
                    userId: auth.currentUser.uid,
                    createdAt: serverTimestamp()
                });
                successfulAdds++;
            } catch (error) {
                console.error(`Error adding party "${name}":`, error);
                errors.push(`Failed to add party "${name}": ${error.message}`);
                failedAdds++;
            }
        } else {
            errors.push(`Skipping malformed line: "${line}"`);
            failedAdds++;
        }
    }

    let message = `Bulk add complete: ${successfulAdds} parties added, ${failedAdds} failed.`;
    if (errors.length > 0) {
        message += '\n\nDetails:\n' + errors.join('\n');
    }

    showCustomModal('Bulk Add Result', message, 'alert');
    document.getElementById('bulkPartyData').value = ''; // Clear textarea
    loadPartiesList(); // Refresh list
    renderPartiesDatalist(); // Refresh datalist
}