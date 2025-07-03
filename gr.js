import { auth, db } from './firebase-config.js'; // Import auth and db from firebase-config.js
import { showCustomModal, loadDashboardRecentGRs, activeDepotFilterId, showView } from './main.js'; // Import from main.js
import { generateGrNo, renderDepotsDropdown } from './depot.js'; // Import generateGrNo and renderDepotsDropdown from depot.js
import { renderPartiesDatalist } from './party.js'; // Import renderPartiesDatalist from party.js
import { collection, doc, getDoc, addDoc, updateDoc, deleteDoc, query, where, orderBy, getDocs, FieldValue } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";


let editingGrId = null;

document.addEventListener('DOMContentLoaded', () => { // Wrap in DOMContentLoaded
    const grEntryForm = document.getElementById('grEntryForm');
    const grRecordsSearch = document.getElementById('grRecordsSearch');
    const grRecordsDepotFilter = document.getElementById('grRecordsDepotFilter');
    const grRecordsDateFilter = document.getElementById('grRecordsDateFilter');
    const printGrButton = document.getElementById('printGrButton');

    if (grEntryForm) {
        grEntryForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const grDate = document.getElementById('grDate').value;
            const grNo = document.getElementById('grNo').value; // This will now include the prefix
            const depotId = document.getElementById('depotSelect').value;
            const consigneeName = document.getElementById('consigneeName').value;
            const consigneeAddress = document.getElementById('consigneeAddress').value;
            const destination = document.getElementById('destination').value;
            const grInvoiceNo = document.getElementById('grInvoiceNo').value;
            const grQty = parseInt(document.getElementById('grQty').value);
            const grWeight = document.getElementById('grWeight').value;
            const grRemarks = document.getElementById('grRemarks').value;

            // Fetch depot name from selected depotId
            let depotName = '';
            if (depotId) {
                const depotDoc = await getDoc(doc(db, 'depots', depotId));
                if (depotDoc.exists()) {
                    depotName = depotDoc.data().name;
                }
            }

            if (!auth.currentUser) {
                showCustomModal('Authentication Required', 'You must be logged in to save GRs.', 'alert');
                return;
            }
            if (!depotId) {
                showCustomModal('Input Error', 'Please select a Depot.', 'alert');
                return;
            }
            if (isNaN(grQty) || grQty <= 0) {
                showCustomModal('Input Error', 'Quantity must be a positive number.', 'alert');
                return;
            }

            try {
                const grData = {
                    grDate,
                    grNo,
                    depotId,
                    depotName, // Store depot name for easier display/search
                    consigneeName,
                    consigneeAddress,
                    destination,
                    grInvoiceNo,
                    grQty,
                    grWeight,
                    grRemarks,
                    userId: auth.currentUser.uid,
                    createdAt: FieldValue.serverTimestamp() // Use modular FieldValue
                };

                if (editingGrId) {
                    // Update existing GR
                    await updateDoc(doc(db, 'gr_entries', editingGrId), grData);
                    showCustomModal('Success', 'GR updated successfully!', 'alert');
                } else {
                    // Add new GR
                    await addDoc(collection(db, 'gr_entries'), grData);
                    showCustomModal('Success', 'GR added successfully!', 'alert');
                }
                grEntryForm.reset();
                editingGrId = null;
                document.getElementById('grEntryId').value = '';
                document.getElementById('grDate').valueAsDate = new Date(); // Reset date
                generateGrNo(depotId); // Regenerate GR No for the same depot
                loadDashboardRecentGRs(); // Refresh dashboard
                loadGrRecords(); // Refresh GR records list
            } catch (error) {
                console.error('GR Save Error:', error);
                showCustomModal('Error', 'Failed to save GR: ' + error.message, 'alert');
            }
        });
    }

    if (grRecordsSearch) {
        grRecordsSearch.addEventListener('input', loadGrRecords);
    }
    if (grRecordsDepotFilter) {
        grRecordsDepotFilter.addEventListener('change', (e) => {
            activeDepotFilterId = e.target.value; // Update global filter
            loadGrRecords();
        });
    }
    if (grRecordsDateFilter) {
        grRecordsDateFilter.addEventListener('change', loadGrRecords);
    }
    if (printGrButton) {
        printGrButton.addEventListener('click', () => window.print());
    }
});


let currentGrRecords = []; // Store current GR records for export

/**
 * Loads and displays GR records based on filters.
 */
export async function loadGrRecords() {
    const grRecordsTableBody = document.getElementById('grRecordsTableBody');
    if (!grRecordsTableBody) return;

    grRecordsTableBody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-gray-500">Loading GR records...</td></tr>';
    currentGrRecords = []; // Clear previous records

    if (!auth.currentUser) {
        grRecordsTableBody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-gray-500">Please log in to view GR records.</td></tr>';
        return;
    }

    try {
        let q = query(
            collection(db, 'gr_entries'),
            where('userId', '==', auth.currentUser.uid),
            orderBy('createdAt', 'desc')
        );

        const searchText = document.getElementById('grRecordsSearch').value.toLowerCase();
        const depotFilter = document.getElementById('grRecordsDepotFilter').value;
        const dateFilter = document.getElementById('grRecordsDateFilter').value; // YYYY-MM

        if (depotFilter) {
            q = query(q, where('depotId', '==', depotFilter));
        }

        if (dateFilter) {
            // Filter by month (YYYY-MM-DD for start/end of month)
            const year = parseInt(dateFilter.substring(0, 4));
            const month = parseInt(dateFilter.substring(5, 7)) - 1; // Month is 0-indexed for Date object
            const startDate = new Date(year, month, 1);
            const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999); // Last day of the month, end of day

            q = query(q,
                where('createdAt', '>=', startDate),
                where('createdAt', '<=', endDate)
            );
        }

        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            grRecordsTableBody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-gray-500">No GR records found.</td></tr>';
            return;
        }

        grRecordsTableBody.innerHTML = ''; // Clear loading message
        querySnapshot.forEach(doc => {
            const gr = doc.data();
            // Apply text search filter on client-side as Firestore doesn't support full-text search
            const matchesSearch = searchText === '' ||
                gr.grNo.toLowerCase().includes(searchText) ||
                gr.consigneeName.toLowerCase().includes(searchText) ||
                gr.destination.toLowerCase().includes(searchText) ||
                gr.depotName.toLowerCase().includes(searchText);

            if (matchesSearch) {
                currentGrRecords.push({ id: doc.id, ...gr }); // Store for export
                const grDate = gr.grDate ? new Date(gr.grDate).toLocaleDateString() : 'N/A';
                const row = `
                    <tr class="hover:bg-gray-50">
                        <td class="py-3 px-4">${gr.grNo}</td>
                        <td class="py-3 px-4">${grDate}</td>
                        <td class="py-3 px-4">${gr.depotName}</td>
                        <td class="py-3 px-4">${gr.consigneeName}</td>
                        <td class="py-3 px-4">${gr.destination}</td>
                        <td class="py-3 px-4">${gr.grQty}</td>
                        <td class="py-3 px-4">${gr.grWeight || ''}</td>
                        <td class="py-3 px-4">
                            <button class="bg-blue-500 text-white px-3 py-1 rounded-md text-sm mr-2 hover:bg-blue-600" onclick="editGr('${doc.id}')">Edit</button>
                            <button class="bg-red-500 text-white px-3 py-1 rounded-md text-sm mr-2 hover:bg-red-600" onclick="deleteGr('${doc.id}', '${gr.grNo}')">Delete</button>
                            <button class="bg-gray-500 text-white px-3 py-1 rounded-md text-sm hover:bg-gray-600" onclick="printGrSlip('${doc.id}')">Print</button>
                        </td>
                    </tr>
                `;
                grRecordsTableBody.insertAdjacentHTML('beforeend', row);
            }
        });

        if (currentGrRecords.length === 0 && querySnapshot.size > 0 && searchText !== '') {
             grRecordsTableBody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-gray-500">No GR records match your search.</td></tr>';
        } else if (currentGrRecords.length === 0) {
             grRecordsTableBody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-gray-500">No GR records found for the selected filters.</td></tr>';
        }


    } catch (error) {
        console.error('Error loading GR records:', error);
        grRecordsTableBody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-red-500">Error loading GR records.</td></tr>';
    }
}

/**
 * Edits a GR record.
 * @param {string} id - The ID of the GR to edit.
 */
export async function editGr(id) {
    if (!auth.currentUser) {
        showCustomModal('Authentication Required', 'You must be logged in to edit GRs.', 'alert');
        return;
    }
    try {
        const grDoc = await getDoc(doc(db, 'gr_entries', id));
        if (grDoc.exists()) {
            const gr = grDoc.data();
            document.getElementById('grEntryId').value = id;
            document.getElementById('grDate').value = gr.grDate;
            document.getElementById('grNo').value = gr.grNo;
            document.getElementById('depotSelect').value = gr.depotId; // Set dropdown
            document.getElementById('consigneeName').value = gr.consigneeName;
            document.getElementById('consigneeAddress').value = gr.consigneeAddress || '';
            document.getElementById('destination').value = gr.destination;
            document.getElementById('grInvoiceNo').value = gr.grInvoiceNo || '';
            document.getElementById('grQty').value = gr.grQty;
            document.getElementById('grWeight').value = gr.grWeight || '';
            document.getElementById('grRemarks').value = gr.grRemarks || '';
            editingGrId = id;
            showCustomModal('Editing GR', `Now editing GR No: ${gr.grNo}`, 'alert');
            showView('grEntryView'); // Switch to GR Entry view
        } else {
            showCustomModal('Error', 'GR record not found!', 'alert');
        }
    } catch (error) {
        console.error('Error editing GR:', error);
        showCustomModal('Error', 'Failed to retrieve GR for editing: ' + error.message, 'alert');
    }
}

/**
 * Deletes a GR record after confirmation.
 * @param {string} id - The ID of the GR to delete.
 * @param {string} grNo - The GR number for confirmation message.
 */
export async function deleteGr(id, grNo) {
    if (!auth.currentUser) {
        showCustomModal('Authentication Required', 'You must be logged in to delete GRs.', 'alert');
        return;
    }
    const confirmed = await showCustomModal('Confirm Delete', `Are you sure you want to delete GR No: ${grNo}? This action cannot be undone.`, 'confirm');
    if (!confirmed) {
        return;
    }
    try {
        await deleteDoc(doc(db, 'gr_entries', id));
        showCustomModal('Success', 'GR record deleted successfully!', 'alert');
        loadDashboardRecentGRs(); // Refresh dashboard
        loadGrRecords(); // Refresh GR records list
        if (editingGrId === id) { // If the deleted GR was being edited
            document.getElementById('grEntryForm').reset();
            editingGrId = null;
            document.getElementById('grEntryId').value = '';
        }
    } catch (error) {
        console.error('Error deleting GR:', error);
        showCustomModal('Error', 'Failed to delete GR: ' + error.message, 'alert');
    }
}

/**
 * Populates the print view with GR slip data and switches to print view.
 * @param {string} id - The ID of the GR to print.
 */
export async function printGrSlip(id) {
    if (!auth.currentUser) {
        showCustomModal('Authentication Required', 'You must be logged in to print GRs.', 'alert');
        return;
    }
    try {
        const grDoc = await getDoc(doc(db, 'gr_entries', id));
        if (grDoc.exists()) {
            const gr = grDoc.data();
            document.getElementById('printGrNo').textContent = gr.grNo;
            document.getElementById('printGrDate').textContent = gr.grDate ? new Date(gr.grDate).toLocaleDateString() : 'N/A';
            document.getElementById('printDepotName').textContent = gr.depotName;
            document.getElementById('printConsigneeName').textContent = gr.consigneeName;
            document.getElementById('printConsigneeAddress').textContent = gr.consigneeAddress || '';
            document.getElementById('printDestination').textContent = gr.destination;
            document.getElementById('printGrInvoiceNo').textContent = gr.grInvoiceNo || '';
            document.getElementById('printGrQty').textContent = gr.grQty;
            document.getElementById('printGrWeight').textContent = gr.grWeight || '';
            document.getElementById('printGrRemarks').textContent = gr.grRemarks || '';

            showView('grPrintView'); // Switch to the print view
        } else {
            showCustomModal('Error', 'GR record not found for printing!', 'alert');
        }
    } catch (error) {
        console.error('Error preparing GR for print:', error);
        showCustomModal('Error', 'Failed to prepare GR for printing: ' + error.message, 'alert');
    }
}

/**
 * Exports current filtered GR records to an Excel-compatible CSV file.
 */
export async function exportGrToExcel() {
    if (currentGrRecords.length === 0) {
        showCustomModal('No Data', 'No GR records to export. Please load records first.', 'alert');
        return;
    }

    try {
        let csvContent = 'GR No.,Date,Depot,Consignee Name,Consignee Address,Destination,Invoice No.,Quantity,Weight,Remarks,Transport Name\n';

        currentGrRecords.forEach(gr => {
            const grDate = gr.grDate ? new Date(gr.grDate).toLocaleDateString() : '';
            // Basic CSV escaping for fields that might contain commas or newlines
            const escapeCsv = (value) => {
                if (value === null || value === undefined) return '';
                let stringValue = String(value);
                if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r')) {
                    return `"${stringValue.replace(/"/g, '""')}"`;
                }
                return stringValue;
            };

            const row = [
                escapeCsv(gr.grNo),
                escapeCsv(grDate),
                escapeCsv(gr.depotName),
                escapeCsv(gr.consigneeName),
                escapeCsv(gr.consigneeAddress),
                escapeCsv(gr.destination),
                escapeCsv(gr.grInvoiceNo),
                escapeCsv(gr.grQty),
                escapeCsv(gr.grWeight),
                escapeCsv(gr.grRemarks),
                escapeCsv("Ganesh Road Carrier") // Static transport name
            ].join(',');
            csvContent += row + '\n';
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        if (link.download !== undefined) { // Feature detection for download attribute
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `GR_Records_Export_${new Date().toISOString().slice(0,10)}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showCustomModal('Export Complete', 'GR records exported successfully to CSV!', 'alert');
        } else {
            showCustomModal('Export Failed', 'Your browser does not support downloading files directly. Please copy the data manually.', 'alert');
        }

    } catch (error) {
        console.error("Error exporting GR records:", error);
        showCustomModal('Export Error', 'Failed to export GR records: ' + error.message, 'alert');
    }
}