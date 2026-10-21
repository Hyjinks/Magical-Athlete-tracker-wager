// Firebase project for the hosted web app (https://magical-athlete.web.app).
//
// This config is meant to be public: it only says which Firebase project to
// talk to. What anyone can read or change is decided by firestore.rules.
export const firebaseConfig = {
  apiKey: "AIzaSyCjB4z1O0WUcFKzDHd-4O7cN_3ZHhCww50",
  authDomain: "magical-athlete.firebaseapp.com",
  projectId: "magical-athlete",
  storageBucket: "magical-athlete.firebasestorage.app",
  messagingSenderId: "138696149617",
  appId: "1:138696149617:web:2001a37d247845d88be9d0",
};

// Firebase App Check: proves requests come from this app on a real browser,
// so nobody can script the database with the public config above. Off while
// this is empty. To turn it on (docs/DEPLOY.md, "App Check"): create a
// reCAPTCHA v3 key for magical-athlete.web.app, register it in the Firebase
// console under App Check, and paste the site key (public by design) here.
export const appCheckSiteKey = "";
