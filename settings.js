import { auth, db } from './firebase-config.js'; // Import auth and db from firebase-config.js
import { showCustomModal, activeDepotFilterId, clearActiveDepotFilter } from './main.js'; // Import from main.js
import { collection, doc, getDocs, updateDoc, query, where, orderBy, deleteField } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword as updateFirebasePassword } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";


document.addEventListener('DOMContentLoaded', () => { // Wrap in DOMContentLoaded
    const changePasswordForm = document.getElementById('changePasswordForm');
    if (changePasswordForm) {
        changePasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const currentPassword = document.getElementById('currentPassword').value;
            const newPassword = document.getElementById('newPassword').value;
            const confirmNewPassword = document.getElementById('confirmNewPassword').value;

            if (newPassword !== confirmNewPassword) {
                showCustomModal('Error', 'New passwords do not match!', 'alert');
                return;
            }

            const user = auth.currentUser;
            if (!user) {
                showCustomModal('Authentication Required', 'No user logged in.', 'alert');
                return;
            }

            // Important: Reauthentication is generally required for security-sensitive operations
            // if the user signed in too long ago, or if they signed in with a method
            // that doesn't provide a password (like email link, Google, etc.) and they
            // are now trying to set one.
            try {
                // If the user previously signed in with email/password
                if (user.providerData.some(provider => provider.providerId === 'password')) {
                    const credential = EmailAuthProvider.credential(user.email, currentPassword);
                    await reauthenticateWithCredential(user, credential);
                } else {
                    // For users signed in via email link or other providers, reauthentication
                    // might need to happen via a fresh email link, or by prompting for a new password directly
                    // if this is their first time setting one after email link sign-in.
                    // For simplicity, this example assumes the user might set password for the first time
                    // or change it after initial password setup.
                    // If you strictly want reauth for email-link users, you'd send another email link.
                    // Or, if this is their first password, you simply call updatePassword.
                    // The error message provided in context indicated `firebase.auth.EmailAuthProvider.credential`
                    // which suggests a need for reauth logic.
                }

                await updateFirebasePassword(user, newPassword); // Use modular updatePassword
                showCustomModal('Success', 'Password changed successfully!', 'alert');
                changePasswordForm.reset();
            } catch (error) {
                console.error('Error changing password:', error);
                // Provide more specific feedback based on error.code
                let errorMessage = 'Failed to change password. ' + error.message;
                if (error.code === 'auth/wrong-password') {
                    errorMessage = 'Current password is incorrect.';
                } else if (error.code === 'auth/requires-recent-login') {
                    errorMessage = 'Please re-login to change your password (due to security reasons, this operation requires recent authentication).';
                } else if (error.code === 'auth/weak-password') {
                    errorMessage = 'New password is too weak. Please choose a stronger password.';
                }
                showCustomModal('Password Change Failed', errorMessage, 'alert');
            }
        });
    }
});


/**
 * Renders the list of depots with their password status in the settings view.
 */
export async function renderSettingsDepotList() {
    const settingsDepotList = document.getElementById('settingsDepotList');
    if (!settingsDepotList) return;

    settingsDepotList.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-gray-500">Loading depot settings...</td></tr>';

    if (!auth.currentUser) {
        settingsDepotList.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-gray-500">Please log in to manage depot settings.</td></tr>';
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
            settingsDepotList.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-gray-500">No depots to configure passwords for.</td></tr>';
            return;
        }

        settingsDepotList.innerHTML = ''; // Clear loading message
        querySnapshot.forEach(doc => {
            const depot = doc.data();
            const hasPassword = !!depot.password; // Check if password field exists
            const passwordStatus = hasPassword ? 'Set' : 'Not Set';
            const actionButton = hasPassword
                ? `<button class="bg-red-500 text-white px-3 py-1 rounded-md text-sm hover:bg-red-600" onclick="clearDepotPassword('${doc.id}', '${depot.name}')">Clear Password</button>`
                : `<button class="bg-green-500 text-white px-3 py-1 rounded-md text-sm hover:bg-green-600" onclick="promptForDepotPassword('${doc.id}', '${depot.name}')">Set Password</button>`;

            const row = `
                <tr class="hover:bg-gray-50">
                    <td class="py-3 px-4">${depot.name}</td>
                    <td class="py-3 px-4">${passwordStatus}</td>
                    <td class="py-3 px-4">${actionButton}</td>
                </tr>
            `;
            settingsDepotList.insertAdjacentHTML('beforeend', row);
        });
    } catch (error) {
        console.error('Error loading depot settings:', error);
        settingsDepotList.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-red-500">Error loading depot settings.</td></tr>';
    }
}

/**
 * Prompts the user for a new password for a specific depot and sets it.
 * @param {string} depotId - The ID of the depot.
 * @param {string} depotName - The name of the depot.
 */
export async function promptForDepotPassword(depotId, depotName) { // Export this function
    const password = await showCustomModal('Set Depot Password', `Enter a password for ${depotName}:`, 'prompt');
    if (password === null) { // User cancelled or didn't enter anything
        return;
    }
    if (password.length < 6) { // Firebase minimum password length
        showCustomModal('Password Error', 'Password must be at least 6 characters long.', 'alert');
        return;
    }

    try {
        // You should hash this password before storing it for security!
        // For simplicity, directly storing here. In production, use a cloud function
        // to hash or a secure client-side hashing library.
        await updateDoc(doc(db, 'depots', depotId), { // Modular updateDoc
            password: password // IMPORTANT: In a real app, hash this password securely!
        });
        showCustomModal('Success', `Password set for ${depotName}.`, 'alert');
        renderSettingsDepotList(); // Refresh list to show status change
    } catch (error) {
        console.error("Error setting depot password:", error);
        showCustomModal('Error', "Failed to set depot password: " + error.message, 'alert');
    }
}

/**
 * Clears the password for a specific depot using the custom modal for confirmation.
 * @param {string} depotId - The ID of the depot.
 * @param {string} depotName - The name of the depot.
 */
export async function clearDepotPassword(depotId, depotName) { // Export this function
    const confirmed = await showCustomModal('Confirm Action', `Are you sure you want to clear the password for ${depotName}? This means data for this depot will be visible to anyone.`, 'confirm');
    if (!confirmed) {
        return;
    }

    try {
        // Remove the 'password' field from the depot document using deleteField
        await updateDoc(doc(db, 'depots', depotId), { // Modular updateDoc
            password: deleteField() // Use deleteField from modular SDK
        });
        showCustomModal('Success', `Password for ${depotName} cleared.`, 'alert');
        renderSettingsDepotList(); // Refresh list to show status change

        // If this depot was the active filter, clear the filter
        if (activeDepotFilterId === depotId) {
            clearActiveDepotFilter();
        }
    } catch (error) {
        console.error("Error clearing depot password:", error);
        showCustomModal('Error', "Failed to clear depot password: " + error.message, 'alert');
    }
}