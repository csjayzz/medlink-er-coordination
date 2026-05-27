# MedLink ER Coordination

MedLink ER Coordination is a healthcare workflow prototype that helps ambulance medics send structured pre-arrival alerts to a hospital dashboard before the patient reaches the ER.

The project focuses on real-time coordination flows, role-based interfaces, Firebase-backed data handling, and voice-assisted field documentation.

## Project Summary

- Dual-interface workflow for field medics and hospital staff
- Voice-assisted alert capture for faster field intake
- Firebase Auth and Firestore-backed alert flow
- Timeline, vitals tracking, attachments, and case history views
- Firestore rules and Cloud Functions setup for role claims and scheduled cleanup

## Why This Project Stands Out

- It solves a realistic operational problem instead of being a generic CRUD app
- It combines frontend product thinking with backend workflow design
- It shows practical use of TypeScript, Firebase, real-time updates, and AI tooling
- It demonstrates awareness of security, audit logging, and healthcare-style data handling

## Tech Stack

- React 18
- TypeScript
- Vite
- Firebase Auth
- Cloud Firestore
- Firebase Hosting
- Firebase Cloud Functions
- Google Gemini Live API
- Recharts
- Tailwind CSS utilities used throughout the UI

## Core Features

### Medic Experience

- Create and transmit pre-arrival alerts
- Use voice-assisted form filling for patient details
- Track ETA, severity, vitals, treatments, and notes
- Attach field images or supporting documents
- View active missions and completed case history

### Hospital Experience

- Monitor incoming cases in a dashboard view
- Review alert details, vitals trends, attachments, and timeline
- Update patient status as cases progress
- Use preparation checklists and resource-planning views

### Backend / Platform

- Firestore-backed alert subscriptions
- Local fallback mode for development and testing
- Firestore security rules for alert and audit access
- Demo shared-key AES-GCM encryption for PHI fields across medic and hospital clients
- Cloud Function support for role assignment
- Scheduled cleanup function for expired alerts

## Architecture Notes

- The frontend is a Vite React app with role-based screens for medic and hospital users.
- Alerts are stored in Firestore when Firebase Auth is active, with local fallback available for development and offline testing.
- Firebase Hosting serves the SPA, and Firestore rules gate data access by role.
- PHI fields use a shared-key demo encryption flow so cross-client decryption works in the hospital dashboard; production key management would need a backend-issued key service.
- Cloud Functions are included for custom claims and scheduled maintenance, but the app can still be demoed without deploying Functions.

## Local Setup

**Prerequisites:** Node.js, Firebase CLI

1. Install root dependencies:
   `npm install`
2. Copy `.env.example` to `.env.local`
3. Fill in:
   `VITE_API_KEY`
   `VITE_FIREBASE_API_KEY`
   `VITE_FIREBASE_AUTH_DOMAIN`
   `VITE_FIREBASE_PROJECT_ID`
   `VITE_FIREBASE_STORAGE_BUCKET`
   `VITE_FIREBASE_MESSAGING_SENDER_ID`
   `VITE_FIREBASE_APP_ID`
4. Install Functions dependencies if you want Functions locally:
   `cd functions && npm install`
5. Start the app:
   `npm run dev`

## Build

- Frontend:
  `npm run build`
- Functions:
  `cd functions && npm run build`

## Deploy

### Hosting + Firestore Only

If you want to demo the app without Cloud Functions:

1. Build the app:
   `npm run build`
2. Deploy hosting and Firestore rules:
   `firebase deploy --only hosting,firestore`

### Full Firebase Deploy

If you want Hosting, Firestore, and Cloud Functions:

1. Set the Firebase project in `.firebaserc`
2. Build frontend and Functions
3. Run:
   `firebase deploy`

Note: Cloud Functions deployment may require the Firebase project to be on the Blaze plan.


