import { auth } from './firebase-config.js'; // CORRECT: Import auth from firebase-config.js
import { showCustomModal } from './main.js'; // Import showCustomModal from main.js
import {
    createUserWithEmailAndPassword, // Still needed if you enable email/password alongside
    signInWithEmailAndPassword,
    EmailAuthProvider,
    reauthenticateWithCredential,
    updatePassword,
    // NEW IMPORTS FOR EMAIL LINK AUTH
    sendSignInLinkToEmail,
    isSignInWithEmailLink,
    signInWithEmailLink
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";


const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

// Existing Login Form Listener (remains unchanged for email/password login)
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const emailInput = document.getElementById('loginEmail');
        const passwordInput = document.getElementById('loginPassword');
        if (!emailInput || !passwordInput) {
            showCustomModal('Error', 'Login form elements missing!', 'alert');
            return;
        }
        const email = emailInput.value;
        const password = passwordInput.value;

        try {
            await signInWithEmailAndPassword(auth, email, password); // Use modular signInWithEmailAndPassword
            showCustomModal('Success', 'Logged in successfully!', 'alert');
            // UI update handled by auth.onAuthStateChanged in main.js
        } catch (error) {
            console.error('Login Error:', error);
            showCustomModal('Login Failed', 'Login failed: ' + error.message, 'alert');
        }
    });
}

// **UPDATED REGISTER FORM LISTENER FOR EMAIL LINK AUTH**
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const emailInput = document.getElementById('registerEmail');
        // We no longer need password fields for email-link registration
        // const passwordInput = document.getElementById('registerPassword');
        // const confirmPasswordInput = document.getElementById('registerConfirmPassword');

        if (!emailInput) {
            showCustomModal('Error', 'Registration email field missing!', 'alert');
            return;
        }
        const email = emailInput.value;

        // Configuration for the email verification link
        const actionCodeSettings = {
            // URL you want to redirect back to. This should be the URL of your app
            // where you will handle the sign-in link.
            // For a single-page app or if you want to handle it on the same page,
            // `window.location.origin` is a good default.
            // This domain must be added to the authorized domains list in your Firebase Console.
            url: window.location.origin,
            handleCodeInApp: true, // This must be true for in-app handling

            // Optional: If you have iOS/Android apps and want the link to open them
            // iOS: {
            //   bundleId: 'com.example.ios'
            // },
            // android: {
            //   packageName: 'com.example.android',
            //   installApp: true,
            //   minimumVersion: '12'
            // },
            // Optional: If you are using Firebase Dynamic Links with a custom domain
            // linkDomain: 'your-custom-dynamic-link-domain.com'
        };

        try {
            await sendSignInLinkToEmail(auth, email, actionCodeSettings);
            // Save the email locally for when the user returns via the link
            window.localStorage.setItem('emailForSignIn', email);
            showCustomModal(
                'Verification Email Sent',
                `A verification link has been sent to ${email}. Please check your inbox and click the link to complete your registration and log in.`,
                'alert'
            );
            emailInput.value = ''; // Clear the input after sending
        } catch (error) {
            console.error('Error sending email link:', error);
            showCustomModal('Registration Failed', 'Could not send verification email: ' + error.message, 'alert');
        }
    });
}

// **NEW: Handle Email Link Sign-in when the page loads**
// This code needs to run on the page the user is redirected to after clicking the email link.
// Since auth.js is loaded on your initial page, this will execute when the user returns.
window.addEventListener('load', async () => {
    // Confirm the link is a sign-in with email link.
    if (isSignInWithEmailLink(auth, window.location.href)) {
        let email = window.localStorage.getItem('emailForSignIn');
        if (!email) {
            // User opened the link on a different browser/device or cleared localStorage.
            // Prompt the user to re-enter their email for security.
            email = await showCustomModal('Email Required', 'Please provide your email to complete sign-in:', 'prompt');
            if (!email) {
                showCustomModal('Error', 'Email not provided, sign-in cancelled.', 'alert');
                return;
            }
        }

        try {
            // Sign in the user with the email link.
            await signInWithEmailLink(auth, email, window.location.href);
            // Clear email from storage.
            window.localStorage.removeItem('emailForSignIn');
            showCustomModal('Success', 'Successfully registered/logged in!', 'alert');
            // Firebase's onAuthStateChanged listener in main.js will now handle UI updates.
        } catch (error) {
            console.error('Error signing in with email link:', error);
            showCustomModal('Login Failed', 'Could not complete sign-in: ' + error.message, 'alert');
        }
    }
});

// If you have password change functionality, ensure EmailAuthProvider and reauthenticateWithCredential
// are correctly imported and used within that specific section, as they are not
// directly part of the email-link registration flow.
// The snippet you provided for changePasswordForm seems to imply Firebase Compat SDK
// (firebase.auth.EmailAuthProvider), you should ensure it's using the modular SDK imports if you haven't.
// For changing password after email link sign-in, you would typically need to prompt for
// a new password and use `updatePassword(user, newPassword)`. Reauthentication
// might be needed based on the user's current authentication state.