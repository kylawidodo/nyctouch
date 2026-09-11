// Firebase web app configuration for the nyctouch-b43f2 project.
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDcqzRntHdZK9a6Z18sNfgiYt2b_0OEkHI',
  authDomain: 'nyctouch-b43f2.firebaseapp.com',
  databaseURL: 'https://nyctouch-b43f2-default-rtdb.firebaseio.com',
  projectId: 'nyctouch-b43f2',
  storageBucket: 'nyctouch-b43f2.firebasestorage.app',
  messagingSenderId: '997171151173',
  appId: '1:997171151173:web:a2f84e6e364e330be23e2c',
};

export const FIREBASE_CONFIGURED = Object.values(FIREBASE_CONFIG).every(Boolean);
