// firebase-config.js
// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCUXPLmRebGNWm1-yKnqqHQ6coVIfmiYhI",
  authDomain: "ftl-data.firebaseapp.com",
  projectId: "ftl-data",
  storageBucket: "ftl-data.firebasestorage.app",
  messagingSenderId: "886868759133",
  appId: "1:886868759133:web:7c87aa26dec689cc37b3b4"
};

// Import the functions you need from the Firebase SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Get service instances
const auth = getAuth(app);
const db = getFirestore(app);

// Export app, auth, and db for use in other modules
export { app, auth, db };