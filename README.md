AI Chatbot App
An AI Chatbot application powered by Google Gemini, built with React and Electron. This app is configured for deployment as a website with Firebase Hosting and as a desktop application for Windows, macOS, and Linux.

Project Structure
public/: Static assets for the web app.

src/: React source code.

functions/: Firebase Cloud Functions for the backend logic (secure AI calls).

electron.js: The main process file for the Electron desktop application.

preload.js: A secure script for exposing a limited API to the Electron renderer process.

firebase.json: Configuration for Firebase Hosting and Functions.

firestore.rules: Security rules for the Firestore database.

package.json: Project dependencies and scripts.

tailwind.config.js & postcss.config.js: Configuration for Tailwind CSS.

Getting Started
Prerequisites
Node.js (LTS version)

npm

A Firebase Project

A Google AI Studio API Key

Troubleshooting: "Missing or insufficient permissions" Error
If you are getting a Missing or insufficient permissions error, it is almost certainly because the Firestore security rules have not been deployed to your project. This is the most critical step to fix your current error.

To fix this, you must explicitly deploy the security rules:

Ensure you have a file named firestore.rules at the root of your project with the contents provided in the firestore.rules immersive document.

Run the following command from your project's root directory:

firebase deploy --only firestore:rules

You can verify that the rules are deployed correctly by checking your Firebase console under Firestore Database -> Rules. The rules should show allow read, write: if request.auth != null; for the chat messages collection.

Setup
Install dependencies:

npm install

Configure Firebase:

Make sure you have the Firebase CLI installed (npm install -g firebase-tools).

Log in to Firebase: firebase login.

Set your Firebase project: firebase use --add.

Configure the Gemini API key as an environment variable for your functions:

firebase functions:config:set gemini.api_key="YOUR_GEMINI_API_KEY"

Replace YOUR_GEMINI_API_KEY with your actual key from the Google AI Studio.
Note: This command should be run inside your functions directory.

Development
To run the app in development mode for both the web and Electron, use the following script.

npm run electron-dev

This command will start the React development server on http://localhost:3000 and then launch the Electron window, which will load the web server.

Deployment
1. Website Deployment (Firebase Hosting)
To deploy the app as a website, you need to first build the React application and then deploy it to Firebase Hosting.

Build the React app:

npm run build

Deploy to Firebase Hosting:

firebase deploy --only hosting,functions,firestore

This command deploys your built web application, the Firebase Cloud Function, and your Firestore security rules to your project.

2. Android and Windows Deployment (Electron)
This project uses electron-builder to package the application for desktop platforms. The package.json file is already configured for Windows (win), macOS (mac), and Linux (linux) targets.

Build the desktop apps:

npm run electron-pack

This command will create a dist folder in your project directory containing the installers and binaries for the configured platforms.

3. Android Deployment
The google-services.json file you provided is specifically for Android. To deploy your app to Android, you would typically use a framework like React Native or Flutter. This project is built with Electron and React for web and desktop platforms. You can still use the Firebase backend and Cloud Functions, but you will need to create a separate Android-specific frontend application that uses the google-services.json file for Firebase client-side configuration.

The google-services.json file should be placed in the android/app directory of your Android Studio project. The contents of the google-services.json file are correct for configuring an Android app to connect to your Firebase project ai-chatbot-88602.