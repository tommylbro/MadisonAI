/* global __firebase_config, __app_id, __initial_auth_token */

// import AppWindow from './index.js'; // (Unused import removed or comment out if not needed)
import { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithCustomToken,
  signInAnonymously,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  onSnapshot,
  addDoc,
  serverTimestamp,
  doc,
  setDoc,
  query,
  limit,
  getDocs
} from 'firebase/firestore';
import { marked } from 'marked';
import { createPortal } from 'react-dom';
import { Sparkles, MessageSquareMore, Image, LoaderCircle, X, ExternalLink, Menu, Plus, Play, Pause, Mic, Settings, Volume2, PenTool } from 'lucide-react';


// --- Firebase Configuration ---
// The global variables are provided by the Canvas environment.
// We fall back to a local config for development purposes if they are not defined.
const localFirebaseConfig = {
  apiKey: "AIzaSyDhJoNaFf0qgl4VTuUXj16ysJG1hycq-p8",
  authDomain: "ai-chatbot-88602.firebaseapp.com",
  projectId: "ai-chatbot-88602",
  storageBucket: "ai-chatbot-88602.firebasestorage.app",
  messagingSenderId: "167580287666",
  appId: "1:167580287666:web:9e8313ae6e667e47d47fab",
  measurementId: "G-CXKJ8QRLZ1"
};

const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : localFirebaseConfig;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Utility function for generating unique IDs (like conversation IDs)
const generateId = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Converts a base64 string to an ArrayBuffer
function base64ToArrayBuffer(base64) {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Converts PCM audio data to a WAV blob
function pcmToWav(pcmData, sampleRate) {
  const pcm16 = new Int16Array(pcmData);
  const buffer = new ArrayBuffer(44 + pcm16.length * 2);
  const view = new DataView(buffer);
  const writeString = (view, offset, string) => {
      for (let i = 0; i < string.length; i++) {
          view.setUint8(offset + i, string.charCodeAt(i));
      }
  };

  let offset = 0;
  writeString(view, offset, 'RIFF'); offset += 4;
  view.setUint32(offset, 36 + pcm16.length * 2, true); offset += 4;
  writeString(view, offset, 'WAVE'); offset += 4;
  writeString(view, offset, 'fmt '); offset += 4;
  view.setUint32(offset, 16, true); offset += 4; // Sub-chunk size
  view.setUint16(offset, 1, true); offset += 2; // Audio format (1 = PCM)
  view.setUint16(offset, 1, true); offset += 2; // Number of channels
  view.setUint32(offset, sampleRate, true); offset += 4; // Sample rate
  view.setUint32(offset, sampleRate * 2, true); offset += 4; // Byte rate
  view.setUint16(offset, 2, true); offset += 2; // Block align
  view.setUint16(offset, 16, true); offset += 2; // Bits per sample
  writeString(view, offset, 'data'); offset += 4;
  view.setUint32(offset, pcm16.length * 2, true); offset += 4; // Data size

  for (let i = 0; i < pcm16.length; i++) {
      view.setInt16(offset, pcm16[i], true);
      offset += 2;
  }

  return new Blob([view], { type: 'audio/wav' });
}

// Prebuilt voices available for TTS
const prebuiltVoices = [
  'Kore', 'Puck', 'Charon', 'Fenrir', 'Leda', 'Orus', 'Aoede', 'Callirrhoe', 'Autonoe',
  'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina', 'Erinome', 'Algenib',
  'Rasalgethi', 'Laomedeia', 'Achernar', 'Alnilam', 'Schedar', 'Gacrux',
  'Pulcherrima', 'Achird', 'Zubenelgenubi', 'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat'
];

// The main App component
function App() {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [isSigningInWithLink, setIsSigningInWithLink] = useState(false);
  const [isAIGenerating, setIsAIGenerating] = useState(false);
  const [authMode, setAuthMode] = useState('email-link');

  // New states for conversation history and sidebar
  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceName, setVoiceName] = useState('Kore');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);

  // New states for Gemini features
  const [systemInstruction, setSystemInstruction] = useState('');
  const [generationSettings, setGenerationSettings] = useState({
    temperature: 0.9,
    topK: 40,
    topP: 0.95
  });
  const [showGeminiModal, setShowGeminiModal] = useState(false);
  const [translationTargetLanguage, setTranslationTargetLanguage] = useState('en-US');
  const [textToContinue, setTextToContinue] = useState('');
  const [textToTranslate, setTextToTranslate] = useState('');

  // New state for the creative writing feature
  const [showCreativeWriterModal, setShowCreativeWriterModal] = useState(false);
  const [creativeTopic, setCreativeTopic] = useState('');
  const [creativeStyle, setCreativeStyle] = useState('Poem');
  const [creativeTone, setCreativeTone] = useState('Neutral');

  const messagesEndRef = useRef(null);
  const audioRef = useRef(null);
  const currentAudioIdRef = useRef(null);

  // Scroll to bottom of messages whenever messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Exponential backoff utility for API calls
  const fetchWithExponentialBackoff = async (url, options, retries = 5, delay = 1000) => {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API error: ${errorData.error?.message || response.statusText}`);
      }
      return response;
    } catch (error) {
      if (retries > 0 && error.message.includes("API error")) {
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchWithExponentialBackoff(url, options, retries - 1, delay * 2);
      }
      throw error;
    }
  };

  // 1. Initialize Firebase and set up authentication.
  useEffect(() => {
    if (Object.keys(firebaseConfig).length === 0 || !firebaseConfig.apiKey) {
      setError('Firebase configuration is missing or incomplete. Please ensure your Firebase config is correctly set, especially the API Key.');
      setLoading(false);
      return;
    }

    try {
      const firebaseApp = initializeApp(firebaseConfig);
      const authInstance = getAuth(firebaseApp);
      const dbInstance = getFirestore(firebaseApp);

      setAuth(authInstance);
      setDb(dbInstance);

      const unsubscribe = onAuthStateChanged(authInstance, async (currentUser) => {
        if (currentUser) {
          setUser(currentUser);
          setIsAuthReady(true);
          setError(null);
        } else {
          if (initialAuthToken) {
             try {
               await signInWithCustomToken(authInstance, initialAuthToken);
             } catch (e) {
               console.error("Custom token sign-in failed:", e);
               setError(`Custom token sign-in failed: ${e.message}. This usually means the token is invalid or expired. Please try refreshing.`);
             }
          } else if (!isSigningInWithLink) {
            try {
              await signInAnonymously(authInstance);
            } catch (e) {
              console.error("Anonymous sign-in failed:", e);
              setError(`Anonymous sign-in failed: ${e.message}. Please ensure Anonymous Authentication is enabled in your Firebase project settings.`);
            }
          }
          setIsAuthReady(true);
        }
        setLoading(false);
      });
      return () => unsubscribe();
    } catch (e) {
      setError(`Failed to initialize Firebase: ${e.message}. Please check the console for more details.`);
      setLoading(false);
    }
  }, []);

  // 2. Handle email link sign-in.
  useEffect(() => {
    if (!auth || !isAuthReady) return;

    if (isSignInWithEmailLink(auth, window.location.href)) {
      setIsSigningInWithLink(true);
      setLoading(true);

      let storedEmail = window.localStorage.getItem('emailForSignIn');

      if (!storedEmail) {
        // Using a custom modal instead of prompt
        const modalDiv = document.createElement('div');
        modalDiv.className = 'fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50';
        modalDiv.innerHTML = `
          <div class="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-lg max-w-sm w-full">
            <h3 class="text-xl font-bold mb-4">Confirm Email</h3>
            <p class="mb-4">Please provide your email to complete sign-in.</p>
            <input id="email-confirm-input" type="email" placeholder="Enter your email" class="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
            <button id="email-confirm-button" class="w-full bg-indigo-500 text-white p-3 rounded-lg shadow-md hover:bg-indigo-600 transition-colors duration-200">Confirm</button>
          </div>
        `;
        document.body.appendChild(modalDiv);

        const emailConfirmInput = modalDiv.querySelector('#email-confirm-input');
        const emailConfirmButton = modalDiv.querySelector('#email-confirm-button');

        emailConfirmButton.onclick = () => {
          storedEmail = emailConfirmInput.value;
          if (storedEmail) {
            document.body.removeChild(modalDiv);
            continueSignIn(storedEmail);
          } else {
            console.error("Email not provided. Please try again.");
          }
        };

        const continueSignIn = (emailToUse) => {
          signInWithEmailLink(auth, emailToUse, window.location.href)
            .then((result) => {
              window.localStorage.removeItem('emailForSignIn');
              setUser(result.user);
              setIsSigningInWithLink(false);
              setLoading(false);
              setError(null);
              window.history.replaceState({}, document.title, window.location.pathname);
            })
            .catch((error) => {
              setError(`Error completing sign-in with link: ${error.message}`);
              setIsSigningInWithLink(false);
              setLoading(false);
              window.history.replaceState({}, document.title, window.location.pathname);
            });
        };
        return; // Exit the effect to wait for user input
      }

      signInWithEmailLink(auth, storedEmail, window.location.href)
        .then((result) => {
          window.localStorage.removeItem('emailForSignIn');
          setUser(result.user);
          setIsSigningInWithLink(false);
          setLoading(false);
          setError(null);
          window.history.replaceState({}, document.title, window.location.pathname);
        })
        .catch((error) => {
          setError(`Error completing sign-in with link: ${error.message}`);
          setIsSigningInWithLink(false);
          setLoading(false);
          window.history.replaceState({}, document.title, window.location.pathname);
        });
    }
  }, [auth, isAuthReady]);

  // 3. Fetch conversations for the current user.
  useEffect(() => {
    if (!db || !user || !isAuthReady) return;

    const conversationsCollectionRef = collection(db, 'artifacts', appId, 'users', user.uid, 'conversations');
    const unsubscribe = onSnapshot(conversationsCollectionRef, (querySnapshot) => {
      const fetchedConversations = [];
      querySnapshot.forEach((doc) => {
        fetchedConversations.push({ id: doc.id, ...doc.data() });
      });

      fetchedConversations.sort((a, b) => (b.lastUpdated?.seconds || 0) - (a.lastUpdated?.seconds || 0));

      setConversations(fetchedConversations);

      if (!currentConversationId && fetchedConversations.length > 0) {
        setCurrentConversationId(fetchedConversations[0].id);
      } else if (fetchedConversations.length === 0) {
        setCurrentConversationId(null);
        setMessages([]);
      }
    }, (firestoreError) => {
      setError(`Failed to load conversations: ${firestoreError.message}`);
      console.error("Firestore conversations error:", firestoreError);
    });

    return () => unsubscribe();
  }, [db, user, isAuthReady, appId, currentConversationId]);

  // 4. Fetch messages for the current conversation.
  useEffect(() => {
    if (!db || !user || !currentConversationId) {
      setMessages([]); // Clear messages if no conversation is selected
      return;
    }

    const messagesCollectionRef = collection(db, 'artifacts', appId, 'users', user.uid, 'conversations', currentConversationId, 'messages');
    const unsubscribe = onSnapshot(messagesCollectionRef, (querySnapshot) => {
      const fetchedMessages = [];
      querySnapshot.forEach((doc) => {
        fetchedMessages.push({ id: doc.id, ...doc.data() });
      });

      fetchedMessages.sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));

      setMessages(fetchedMessages);
    }, (firestoreError) => {
      setError(`Failed to load messages for conversation: ${firestoreError.message}`);
      console.error("Firestore messages error:", firestoreError);
    });

    return () => unsubscribe();
  }, [db, user, currentConversationId, appId]);

  // 5. Start a new conversation.
  const startNewChat = async () => {
    if (!db || !user) {
      setError("You must be logged in to start a new chat.");
      return;
    }

    setMessages([]);
    setNewMessage('');
    setSelectedImage(null);
    setError(null);
    setIsAIGenerating(false);
    setIsSummarizing(false);
    setIsGeneratingImage(false);

    try {
      const conversationsCollectionRef = collection(db, 'artifacts', appId, 'users', user.uid, 'conversations');
      const newConversationDocRef = doc(conversationsCollectionRef);
      const newConvId = newConversationDocRef.id;

      await setDoc(newConversationDocRef, {
        title: 'New Chat',
        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp(),
      });

      setCurrentConversationId(newConvId);
      setIsSidebarOpen(false);
    } catch (e) {
      setError(`Failed to create a new chat: ${e.message}`);
      console.error("Error creating new conversation:", e);
    }
  };

  // 6. Handle sending a new message (and creating a new conversation if needed).
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() && !selectedImage || !user || !db || isAIGenerating || isSpeaking) return;

    let conversationIdToUse = currentConversationId;
    const userMessageText = newMessage;
    const imageToSend = selectedImage;
    setNewMessage('');
    setSelectedImage(null);

    const command = userMessageText.toLowerCase().trim();

    // If no conversation is active, create a new one.
    if (!conversationIdToUse) {
      const newConvId = generateId();
      const conversationsCollectionRef = collection(db, 'artifacts', appId, 'users', user.uid, 'conversations');
      const newConversationDocRef = doc(conversationsCollectionRef, newConvId);
      const initialTitle = userMessageText ? (userMessageText.substring(0, 50) + (userMessageText.length > 50 ? '...' : '')) : 'New chat with image';

      try {
        await setDoc(newConversationDocRef, {
          title: initialTitle,
          createdAt: serverTimestamp(),
          lastUpdated: serverTimestamp(),
        });
        conversationIdToUse = newConvId;
        setCurrentConversationId(newConvId);
      } catch (createError) {
        setError(`Failed to create new conversation: ${createError.message}`);
        console.error("Error creating new conversation:", createError);
        return;
      }
    } else {
      // Otherwise, just update the lastUpdated timestamp of the current conversation.
      const conversationDocRef = doc(db, 'artifacts', appId, 'users', user.uid, 'conversations', conversationIdToUse);
      try {
        await setDoc(conversationDocRef, { lastUpdated: serverTimestamp() }, { merge: true });
      } catch (updateError) {
        console.error("Error updating conversation timestamp:", updateError);
      }
    }

    // Add user message to Firestore
    try {
      const messagesCollectionRef = collection(db, 'artifacts', appId, 'users', user.uid, 'conversations', conversationIdToUse, 'messages');
      await addDoc(messagesCollectionRef, {
        text: userMessageText,
        userId: user.uid,
        userName: `User_${user.uid.substring(0, 5)}`,
        timestamp: serverTimestamp(),
        type: 'user-message',
        imageData: imageToSend
      });
    } catch (e) {
      setError(`Failed to send message: ${e.message}`);
      return;
    }

    if (imageToSend) {
      handleImageAnalysis(userMessageText, imageToSend, conversationIdToUse);
    } else if (command.startsWith('image of')) {
      const imagePrompt = userMessageText.substring('image of'.length).trim();
      handleGenerateImage(imagePrompt, conversationIdToUse);
    } else {
      handleAIResponse(userMessageText, conversationIdToUse);
    }
  };

  // Function to handle image upload
  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // 7. Handle sending the sign-in email link.
  const handleSendSignInLink = async (e) => {
    e.preventDefault();
    if (!auth || !email.trim()) {
      setError("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    setError(null);
    const actionCodeSettings = {
      url: window.location.origin,
      handleCodeInApp: true,
    };
    try {
      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      setEmailSent(true);
      window.localStorage.setItem('emailForSignIn', email);
      setLoading(false);
    } catch (error) {
      setError(`Failed to send sign-in link: ${error.message}`);
      setLoading(false);
    }
  };

  // 8. Handle Email/Password Registration
  const handleEmailPasswordSignUp = async (e) => {
    e.preventDefault();
    if (!auth || !email.trim() || !password.trim()) {
      setError("Please enter a valid email and password.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      setEmail('');
      setPassword('');
      setLoading(false);
    } catch (error) {
      setError(`Registration failed: ${error.message}`);
      setLoading(false);
    }
  };

  // 9. Handle Email/Password Login
  const handleEmailPasswordLogin = async (e) => {
    e.preventDefault();
    if (!auth || !email.trim() || !password.trim()) {
      setError("Please enter a valid email and password.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setEmail('');
      setPassword('');
      setLoading(false);
    } catch (error) {
      setError(`Login failed: ${error.message}`);
      setLoading(false);
    }
  };

  // 10. Handle Logout
  const handleLogout = async () => {
    if (!auth) return;
    try {
      await signOut(auth);
      setUser(null);
      setMessages([]);
      setConversations([]);
      setCurrentConversationId(null);
      setEmailSent(false);
      setIsSigningInWithLink(false);
      setAuthMode('email-link');
      setError(null);
    } catch (error) {
      setError(`Logout failed: ${error.message}`);
    }
  };

  // 11. Handle summarization of the current chat using the Gemini API
  const handleSummarizeChat = async () => {
    const conversationId = currentConversationId;
    if (!conversationId || messages.length === 0 || isAIGenerating || isSummarizing || isGeneratingImage) return;
    setIsSummarizing(true);
    setError(null);
    setShowGeminiModal(false);
    const messagesCollectionRef = collection(db, 'artifacts', appId, 'users', user.uid, 'conversations', conversationId, 'messages');
    const summarizeMessageRef = doc(messagesCollectionRef);
    try {
      // Add a placeholder message for the AI response
      await setDoc(summarizeMessageRef, {
        text: 'Summarizing...',
        userId: 'bot',
        userName: 'AI Chatbot',
        timestamp: serverTimestamp(),
        type: 'ai-response',
      });
      const chatHistoryText = messages
        .filter(msg => msg.type === 'user-message' || msg.type === 'ai-response')
        .map(msg => `${msg.userId === user.uid ? 'User' : 'AI'}: ${msg.text}`)
        .join('\n');
      const prompt = `Please summarize the following chat conversation into a concise paragraph:\n\n${chatHistoryText}`;
      const chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
      const payload = {
        contents: chatHistory,
        generationConfig: {
          temperature: generationSettings.temperature,
          topK: generationSettings.topK,
          topP: generationSettings.topP,
        },
      };
      if (systemInstruction) {
        payload.systemInstruction = { parts: [{ text: systemInstruction }] };
      }
      const apiKey = "AIzaSyCBBfnCqQlfrOCmSPzNuyC8F4jT0OHUX7g";
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
      const response = await fetchWithExponentialBackoff(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      let responseText = "Sorry, I couldn't generate a summary.";
      if (result.candidates && result.candidates.length > 0 && result.candidates[0].content && result.candidates[0].content.parts && result.candidates[0].content.parts.length > 0) {
        responseText = result.candidates[0].content.parts[0].text;
      }
      await setDoc(summarizeMessageRef, {
        text: responseText,
        type: 'ai-response',
      }, { merge: true });
    } catch (error) {
      console.error("Error summarizing chat:", error);
      await setDoc(summarizeMessageRef, {
        text: `An error occurred while summarizing. Error: ${error.message}`,
      }, { merge: true });
      setError(`Summarization error: ${error.message}`);
    } finally {
      setIsSummarizing(false);
    }
  };

  // 12. Handle image generation from a text prompt using the Gemini API
  const handleGenerateImage = async (imagePrompt, conversationId) => {
    if (!conversationId || isAIGenerating || isGeneratingImage || isSummarizing) return;
    setIsGeneratingImage(true);
    setError(null);
    const messagesCollectionRef = collection(db, 'artifacts', appId, 'users', user.uid, 'conversations', conversationId, 'messages');
    const imageMessageDocRef = doc(messagesCollectionRef);
    const imageMessageId = imageMessageDocRef.id;

    try {
      // Add a placeholder message for the AI response
      await setDoc(imageMessageDocRef, {
        text: 'Generating image...',
        userId: 'bot',
        userName: 'AI Chatbot',
        timestamp: serverTimestamp(),
        type: 'ai-response',
      });

      const payload = {
        instances: { prompt: imagePrompt },
        parameters: { "sampleCount": 1 }
      };
      const apiKey = "AIzaSyCBBfnCqQlfrOCmSPzNuyC8F4jT0OHUX7g";
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`;
      const response = await fetchWithExponentialBackoff(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();

      let imageUrl = null;
      let responseText = "Sorry, I couldn't generate an image.";

      if (result.predictions && result.predictions.length > 0 && result.predictions[0].bytesBase64Encoded) {
        imageUrl = `data:image/png;base64,${result.predictions[0].bytesBase64Encoded}`;
        responseText = `Here is the image you requested based on the prompt: "${imagePrompt}"`;
      } else {
        console.error("Error generating image:", result);
        responseText = `An error occurred while generating the image: ${JSON.stringify(result)}`;
      }

      await setDoc(imageMessageDocRef, {
        text: responseText,
        type: 'ai-response',
        imageUrl: imageUrl,
      }, { merge: true });

    } catch (error) {
      console.error("Error generating image:", error);
      await setDoc(imageMessageDocRef, {
        text: `An error occurred while generating the image. Error: ${error.message}`,
      }, { merge: true });
      setError(`Image generation error: ${error.message}`);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // 13. Handle text-based AI response using the Gemini API
  const handleAIResponse = async (userMessage, conversationId) => {
    if (!conversationId || isAIGenerating || isGeneratingImage || isSummarizing) return;
    setIsAIGenerating(true);
    setError(null);
    const messagesCollectionRef = collection(db, 'artifacts', appId, 'users', user.uid, 'conversations', conversationId, 'messages');
    const aiMessageDocRef = doc(messagesCollectionRef);

    try {
      // Add a placeholder for the AI response
      await setDoc(aiMessageDocRef, {
        text: '...',
        userId: 'bot',
        userName: 'AI Chatbot',
        timestamp: serverTimestamp(),
        type: 'ai-response',
      });

      const chatHistory = messages
        .map(msg => ({
          role: msg.userId === user.uid ? 'user' : 'model',
          parts: [{ text: msg.text }],
        }));
      chatHistory.push({ role: 'user', parts: [{ text: userMessage }] });

      const payload = {
        contents: chatHistory,
        generationConfig: {
          temperature: generationSettings.temperature,
          topK: generationSettings.topK,
          topP: generationSettings.topP,
        },
      };

      if (systemInstruction) {
        payload.systemInstruction = { parts: [{ text: systemInstruction }] };
      }

      const apiKey = "AIzaSyCBBfnCqQlfrOCmSPzNuyC8F4jT0OHUX7g";
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

      const response = await fetchWithExponentialBackoff(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();

      let responseText = "Sorry, I couldn't generate a response.";
      if (result.candidates && result.candidates.length > 0 && result.candidates[0].content && result.candidates[0].content.parts && result.candidates[0].content.parts.length > 0) {
        responseText = result.candidates[0].content.parts[0].text;
      }

      await setDoc(aiMessageDocRef, {
        text: responseText,
        type: 'ai-response',
      }, { merge: true });

    } catch (error) {
      console.error("Error fetching AI response:", error);
      await setDoc(aiMessageDocRef, {
        text: `An error occurred while generating a response. Error: ${error.message}`,
      }, { merge: true });
      setError(`AI response error: ${error.message}`);
    } finally {
      setIsAIGenerating(false);
    }
  };

  // 14. Handle creative writing using the Gemini API
  const handleCreativeWriting = async (topic, style, tone, conversationId) => {
    if (!conversationId || isAIGenerating) return;
    setIsAIGenerating(true);
    setError(null);
    setShowCreativeWriterModal(false);

    const messagesCollectionRef = collection(db, 'artifacts', appId, 'users', user.uid, 'conversations', conversationId, 'messages');
    const aiMessageDocRef = doc(messagesCollectionRef);

    try {
      await setDoc(aiMessageDocRef, {
        text: 'Writing...',
        userId: 'bot',
        userName: 'AI Chatbot',
        timestamp: serverTimestamp(),
        type: 'ai-response',
      });

      const prompt = `Write a ${style} about the topic "${topic}" in a ${tone} tone.`;
      const chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
      const payload = { contents: chatHistory };

      const apiKey = "AIzaSyCBBfnCqQlfrOCmSPzNuyC8F4jT0OHUX7g";
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
      const response = await fetchWithExponentialBackoff(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();

      let responseText = "Sorry, I couldn't complete the creative writing request.";
      if (result.candidates && result.candidates.length > 0 && result.candidates[0].content && result.candidates[0].content.parts && result.candidates[0].content.parts.length > 0) {
        responseText = result.candidates[0].content.parts[0].text;
      }

      await setDoc(aiMessageDocRef, {
        text: responseText,
        type: 'ai-response',
      }, { merge: true });

    } catch (error) {
      console.error("Error in creative writing:", error);
      await setDoc(aiMessageDocRef, {
        text: `An error occurred while writing. Error: ${error.message}`,
      }, { merge: true });
      setError(`Creative writing error: ${error.message}`);
    } finally {
      setIsAIGenerating(false);
    }
  };

  // 15. Handle image analysis with the Gemini API
  const handleImageAnalysis = async (userPrompt, imageData, conversationId) => {
    if (!conversationId || isAIGenerating) return;
    setIsAIGenerating(true);
    setError(null);
    const messagesCollectionRef = collection(db, 'artifacts', appId, 'users', user.uid, 'conversations', conversationId, 'messages');
    const aiMessageDocRef = doc(messagesCollectionRef);

    try {
      await setDoc(aiMessageDocRef, {
        text: 'Analyzing image...',
        userId: 'bot',
        userName: 'AI Chatbot',
        timestamp: serverTimestamp(),
        type: 'ai-response',
      });

      const base64ImageData = imageData.split(',')[1];
      const payload = {
        contents: [
          {
            role: "user",
            parts: [
              { text: userPrompt || "What is in this image?" },
              {
                inlineData: {
                  mimeType: "image/png",
                  data: base64ImageData
                }
              }
            ]
          }
        ],
      };

      const apiKey = "AIzaSyCBBfnCqQlfrOCmSPzNuyC8F4jT0OHUX7g";
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
      const response = await fetchWithExponentialBackoff(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();

      let responseText = "Sorry, I couldn't analyze the image.";
      if (result.candidates && result.candidates.length > 0 && result.candidates[0].content && result.candidates[0].content.parts && result.candidates[0].content.parts.length > 0) {
        responseText = result.candidates[0].content.parts[0].text;
      }

      await setDoc(aiMessageDocRef, {
        text: responseText,
        type: 'ai-response',
      }, { merge: true });

    } catch (error) {
      console.error("Error analyzing image:", error);
      await setDoc(aiMessageDocRef, {
        text: `An error occurred while analyzing the image. Error: ${error.message}`,
      }, { merge: true });
      setError(`Image analysis error: ${error.message}`);
    } finally {
      setIsAIGenerating(false);
    }
  };

  // 16. TTS Functions
  const playAudio = async (text, messageId) => {
    // If the same audio is already playing, pause it.
    if (isSpeaking && currentAudioIdRef.current === messageId) {
      pauseAudio();
      return;
    }

    // Stop any other playing audio.
    stopAudio();

    setIsSpeaking(true);
    currentAudioIdRef.current = messageId;
    
    // Add audio loading indicator to the message
    const messageDocRef = doc(db, 'artifacts', appId, 'users', user.uid, 'conversations', currentConversationId, 'messages', messageId);
    await setDoc(messageDocRef, { audioState: 'loading' }, { merge: true });

    try {
      const payload = {
        contents: [{
          parts: [{ text: `Say in a conversational tone: ${text}` }]
        }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voiceName }
            }
          }
        },
        model: "gemini-2.5-flash-preview-tts"
      };

      const apiKey = "AIzaSyCBBfnCqQlfrOCmSPzNuyC8F4jT0OHUX7g";
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;
      const response = await fetchWithExponentialBackoff(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      const part = result?.candidates?.[0]?.content?.parts?.[0];
      const audioData = part?.inlineData?.data;
      const mimeType = part?.inlineData?.mimeType;

      if (audioData && mimeType && mimeType.startsWith("audio/")) {
        // API returns signed PCM16 audio data with the sample rate in the mime type
        const sampleRateMatch = mimeType.match(/rate=(\d+)/);
        const sampleRate = sampleRateMatch ? parseInt(sampleRateMatch[1], 10) : 16000;
        const pcmData = base64ToArrayBuffer(audioData);
        const pcm16 = new Int16Array(pcmData);
        const wavBlob = pcmToWav(pcm16, sampleRate);
        const audioUrl = URL.createObjectURL(wavBlob);

        if (audioRef.current && currentAudioIdRef.current === messageId) {
          audioRef.current.src = audioUrl;
          
          try {
            const playPromise = audioRef.current.play();
            if (playPromise !== undefined) {
              playPromise.catch(error => {
                // This will catch the DOMException error
                console.error("Error playing audio:", error);
                stopAudio();
                setDoc(messageDocRef, { audioState: 'error' }, { merge: true });
              }).then(() => {
                // Playback started successfully
                setDoc(messageDocRef, { audioState: 'playing' }, { merge: true });
              });
            }
          } catch (error) {
            console.error("Immediate play() error:", error);
            setDoc(messageDocRef, { audioState: 'error' }, { merge: true });
            stopAudio();
          }

          audioRef.current.onended = () => {
            stopAudio();
            setDoc(messageDocRef, { audioState: 'paused' }, { merge: true });
          };
        } else {
            // A different play request was made while this one was loading.
            // Do nothing to avoid the "reloaded" error.
            stopAudio();
            setDoc(messageDocRef, { audioState: 'stopped' }, { merge: true });
        }
      } else {
        console.error("Audio data not found or invalid mime type:", result);
        await setDoc(messageDocRef, { audioState: 'error' }, { merge: true });
        setError("Error: Could not generate audio.");
        setIsSpeaking(false);
      }
    } catch (error) {
      console.error("Error during TTS:", error);
      await setDoc(messageDocRef, { audioState: 'error' }, { merge: true });
      setError("Error: Could not generate audio.");
      setIsSpeaking(false);
    }
  };

  const pauseAudio = async () => {
    if (audioRef.current && isSpeaking) {
      audioRef.current.pause();
      setIsSpeaking(false);
      const messageId = currentAudioIdRef.current;
      if (messageId) {
        const messageDocRef = doc(db, 'artifacts', appId, 'users', user.uid, 'conversations', currentConversationId, 'messages', messageId);
        await setDoc(messageDocRef, { audioState: 'paused' }, { merge: true });
      }
    }
  };

  const stopAudio = async () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsSpeaking(false);
      const messageId = currentAudioIdRef.current;
      if (messageId) {
        const messageDocRef = doc(db, 'artifacts', appId, 'users', user.uid, 'conversations', currentConversationId, 'messages', messageId);
        await setDoc(messageDocRef, { audioState: 'stopped' }, { merge: true });
        currentAudioIdRef.current = null;
      }
    }
  };

  // 17. Handle translation of a message
  const handleTranslateMessage = async (text, language, messageId) => {
    if (isAIGenerating) return;
    setIsAIGenerating(true);
    setError(null);
    setShowGeminiModal(false);

    const messagesCollectionRef = collection(db, 'artifacts', appId, 'users', user.uid, 'conversations', currentConversationId, 'messages');
    const aiMessageDocRef = doc(messagesCollectionRef);

    try {
      await setDoc(aiMessageDocRef, {
        text: 'Translating...',
        userId: 'bot',
        userName: 'AI Chatbot',
        timestamp: serverTimestamp(),
        type: 'ai-response',
      });

      const prompt = `Translate the following text to the language with BCP-47 code ${language}: "${text}"`;
      const chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
      const payload = { contents: chatHistory };

      const apiKey = "AIzaSyCBBfnCqQlfrOCmSPzNuyC8F4jT0OHUX7g";
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
      const response = await fetchWithExponentialBackoff(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();

      let responseText = "Sorry, I couldn't translate that.";
      if (result.candidates && result.candidates.length > 0 && result.candidates[0].content && result.candidates[0].content.parts && result.candidates[0].content.parts.length > 0) {
        responseText = result.candidates[0].content.parts[0].text;
      }

      await setDoc(aiMessageDocRef, {
        text: `Translation of message '${messageId}':\n\n${responseText}`,
        type: 'ai-response',
      }, { merge: true });

    } catch (error) {
      console.error("Error translating message:", error);
      await setDoc(aiMessageDocRef, {
        text: `An error occurred while translating. Error: ${error.message}`,
      }, { merge: true });
      setError(`Translation error: ${error.message}`);
    } finally {
      setIsAIGenerating(false);
    }
  };

  // 18. Handle continuing a text-based prompt
  const handleContinueText = async (text, messageId) => {
    if (isAIGenerating) return;
    setIsAIGenerating(true);
    setError(null);
    setShowGeminiModal(false);

    const messagesCollectionRef = collection(db, 'artifacts', appId, 'users', user.uid, 'conversations', currentConversationId, 'messages');
    const aiMessageDocRef = doc(messagesCollectionRef);

    try {
      await setDoc(aiMessageDocRef, {
        text: 'Continuing...',
        userId: 'bot',
        userName: 'AI Chatbot',
        timestamp: serverTimestamp(),
        type: 'ai-response',
      });

      const prompt = `Continue the following text from where it left off:\n\n${text}`;
      const chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
      const payload = { contents: chatHistory };

      const apiKey = "AIzaSyCBBfnCqQlfrOCmSPzNuyC8F4jT0OHUX7g";
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
      const response = await fetchWithExponentialBackoff(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();

      let responseText = "Sorry, I couldn't continue that text.";
      if (result.candidates && result.candidates.length > 0 && result.candidates[0].content && result.candidates[0].content.parts && result.candidates[0].content.parts.length > 0) {
        responseText = result.candidates[0].content.parts[0].text;
      }

      await setDoc(aiMessageDocRef, {
        text: `Continuation of message '${messageId}':\n\n${responseText}`,
        type: 'ai-response',
      }, { merge: true });

    } catch (error) {
      console.error("Error continuing text:", error);
      await setDoc(aiMessageDocRef, {
        text: `An error occurred while continuing the text. Error: ${error.message}`,
      }, { merge: true });
      setError(`Continue text error: ${error.message}`);
    } finally {
      setIsAIGenerating(false);
    }
  };

  if (loading || !isAuthReady) {
    return <div className="flex items-center justify-center h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <LoaderCircle className="h-8 w-8 animate-spin mr-2" />
      Loading...
    </div>;
  }

  if (error) {
    return <div className="flex items-center justify-center h-screen bg-gray-100 dark:bg-gray-900 text-red-500 p-4 text-center">
      <p>{error}</p>
    </div>;
  }

  // Auth UI
  const AuthUI = () => (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
        <div className="flex justify-center mb-6">
          <Sparkles className="h-12 w-12 text-indigo-500" />
        </div>
        <title className="text: 3xl;" font="extrabold;" text-align="center;" text="gray 900 dark, gray 100;" mb="2;">MadisonAI</title>
        <h1 className="text-3xl font-extrabold text-center text-gray-900 dark:text-gray-100 mb-2">Welcome</h1>
        <p className="text-center text-gray-600 dark:text-gray-400 mb-8">Sign in to start chatting with the AI.</p>

        <div className="flex justify-center mb-6 space-x-4">
          <button
            onClick={() => setAuthMode('email-link')}
            className={`p-3 rounded-xl transition-colors duration-200 ${authMode === 'email-link' ? 'bg-indigo-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'}`}
          >
            Email Link
          </button>
          <button
            onClick={() => setAuthMode('email-password')}
            className={`p-3 rounded-xl transition-colors duration-200 ${authMode === 'email-password' ? 'bg-indigo-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'}`}
          >
            Email/Password
          </button>
        </div>

        {authMode === 'email-link' && (
          <form onSubmit={handleSendSignInLink} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              className="w-full p-4 border border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
            <button
              type="submit"
              className="w-full bg-indigo-500 text-white p-4 rounded-xl shadow-lg hover:bg-indigo-600 transition-colors duration-200"
            >
              Send Sign-in Link
            </button>
            {emailSent && <p className="text-green-500 text-center mt-2">Check your email for the sign-in link!</p>}
          </form>
        )}

        {authMode === 'email-password' && (
          <form onSubmit={handleEmailPasswordLogin} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full p-4 border border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full p-4 border border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
            <button
              type="submit"
              className="w-full bg-indigo-500 text-white p-4 rounded-xl shadow-lg hover:bg-indigo-600 transition-colors duration-200"
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={handleEmailPasswordSignUp}
              className="w-full p-4 text-indigo-500 border border-indigo-500 rounded-xl shadow-lg hover:bg-indigo-50 transition-colors duration-200 dark:hover:bg-indigo-900"
            >
              Create Account
            </button>
          </form>
        )}
      </div>
    </div>
  );

  if (!user) {
    return <AuthUI />;
  }

  // Main Chat UI
  const ChatUI = () => (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-gray-100 overflow-hidden">
      {/* Sidebar */}
      <aside className={`transition-all duration-300 ease-in-out transform ${isSidebarOpen ? 'w-64 md:w-80' : 'w-0 -translate-x-full md:w-16 md:translate-x-0'} md:relative fixed inset-y-0 left-0 bg-white dark:bg-gray-900 shadow-lg z-40 flex flex-col`}>
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors duration-200 md:hidden">
            <Menu className="h-6 w-6" />
          </button>
          <div className={`flex-grow ${isSidebarOpen ? '' : 'hidden md:flex flex-col items-center'}`}>
            {isSidebarOpen && <h2 className="text-xl font-bold">Conversations</h2>}
            {!isSidebarOpen && <Menu className="h-6 w-6 mb-1 text-gray-500 dark:text-gray-400" />}
            {!isSidebarOpen && <span className="text-xs text-gray-500 dark:text-gray-400">Menu</span>}
          </div>
          <button onClick={startNewChat} className={`p-2 rounded-full text-indigo-500 hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-colors duration-200 ${isSidebarOpen ? '' : 'hidden md:block'}`} title="New Chat">
            <Plus className="h-6 w-6" />
          </button>
        </div>
        <div className="flex-grow overflow-y-auto p-4 space-y-2">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => setCurrentConversationId(conv.id)}
              className={`p-3 rounded-lg cursor-pointer transition-colors duration-200 ${currentConversationId === conv.id ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200 font-semibold' : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
            >
              {isSidebarOpen ? conv.title : <MessageSquareMore className="h-6 w-6 text-gray-500 dark:text-gray-400" />}
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-gray-200 dark:border-gray-800">
          <div className={`flex items-center justify-between ${isSidebarOpen ? '' : 'hidden md:flex-col'}`}>
            <span className={`text-sm text-gray-500 dark:text-gray-400 ${isSidebarOpen ? '' : 'mb-2'}`}>
              {isSidebarOpen ? `User: ${user.uid}` : `UID: ${user.uid.substring(0, 5)}...`}
            </span>
            <button onClick={handleLogout} className={`p-2 rounded-lg text-red-500 hover:bg-red-100 dark:hover:bg-red-900 transition-colors duration-200 ${isSidebarOpen ? '' : 'w-full'}`}>
              {isSidebarOpen ? 'Logout' : <X className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-950 transition-all duration-300 ease-in-out">
        {/* Header */}
        <header className="flex-shrink-0 flex items-center justify-between p-4 bg-white dark:bg-gray-900 shadow-md">
          <div className="flex items-center space-x-4">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="md:hidden p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors duration-200">
              <Menu className="h-6 w-6" />
            </button>
            <h1 className="text-xl font-bold">{conversations.find(c => c.id === currentConversationId)?.title || 'Welcome'}</h1>
          </div>
          <div className="flex items-center space-x-2">
            <button onClick={() => setShowGeminiModal(true)} className="p-2 rounded-full text-indigo-500 hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-colors duration-200">
              <Sparkles className="h-6 w-6" />
            </button>
            <button onClick={() => setShowCreativeWriterModal(true)} className="p-2 rounded-full text-green-500 hover:bg-green-100 dark:hover:bg-green-900 transition-colors duration-200">
              <PenTool className="h-6 w-6" />
            </button>
            <button onClick={() => setShowSettingsModal(true)} className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors duration-200">
              <Settings className="h-6 w-6" />
            </button>
          </div>
        </header>

        {/* Message Display Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400 text-center">
              Start a new conversation or select one from the sidebar.
            </div>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.userId === user.uid ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-xl p-4 rounded-3xl shadow-md ${msg.userId === user.uid ? 'bg-indigo-500 text-white rounded-br-none' : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-none'}`}
              >
                <div className="flex items-start">
                  <div className="flex-1">
                    <div className="font-bold mb-1">{msg.userName}</div>
                    {msg.imageData && (
                      <div className="mb-2">
                        <img src={msg.imageData} alt="User upload" className="rounded-lg max-w-full h-auto" />
                      </div>
                    )}
                    {msg.text && (
                      <div className="prose dark:prose-invert" dangerouslySetInnerHTML={{ __html: marked.parse(msg.text) }} />
                    )}
                    {msg.imageUrl && (
                      <div className="mt-2">
                        <img src={msg.imageUrl} alt="AI generated" className="rounded-lg max-w-full h-auto" />
                      </div>
                    )}
                  </div>
                  {msg.userId !== user.uid && msg.text && (
                    <div className="flex-shrink-0 ml-2">
                      {isSpeaking && currentAudioIdRef.current === msg.id ? (
                        <button onClick={pauseAudio} className="text-gray-500 dark:text-gray-400 hover:text-indigo-500">
                          <Pause className="h-5 w-5" />
                        </button>
                      ) : (
                        <button onClick={() => playAudio(msg.text, msg.id)} className="text-gray-500 dark:text-gray-400 hover:text-indigo-500">
                          <Play className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {(isAIGenerating || isSummarizing || isGeneratingImage) && (
            <div className="flex justify-start">
              <div className="max-w-xl p-4 rounded-3xl shadow-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-none">
                <div className="flex items-center space-x-2">
                  <LoaderCircle className="h-5 w-5 animate-spin" />
                  <p>{isSummarizing ? 'Summarizing...' : isGeneratingImage ? 'Generating image...' : 'AI is typing...'}</p>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="flex-shrink-0 bg-white dark:bg-gray-900 p-4 shadow-top">
          {selectedImage && (
            <div className="relative mb-4">
              <img src={selectedImage} alt="Preview" className="h-24 w-auto rounded-lg shadow-md" />
              <button onClick={() => setSelectedImage(null)} className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 shadow-lg">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <form onSubmit={handleSendMessage} className="flex items-center space-x-4">
            <input
              type="file"
              id="image-upload"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
            <label htmlFor="image-upload" className="p-3 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors duration-200 cursor-pointer">
              <Image className="h-6 w-6" />
            </label>
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 p-3 border border-gray-300 dark:border-gray-600 rounded-full bg-gray-50 dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={isAIGenerating || isSpeaking}
            />
            <button
              type="submit"
              className="p-3 bg-indigo-500 text-white rounded-full shadow-md hover:bg-indigo-600 transition-colors duration-200"
              disabled={isAIGenerating || isSpeaking || (!newMessage.trim() && !selectedImage)}
            >
              <ExternalLink className="h-6 w-6 rotate-90" />
            </button>
          </form>
          <audio ref={audioRef} className="hidden" />
        </div>
      </main>

      {/* Gemini Modal */}
      {showGeminiModal && createPortal(
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-6 w-full max-w-md mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Gemini Options</h2>
              <button onClick={() => setShowGeminiModal(false)} className="p-1 rounded-full text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <button
                onClick={handleSummarizeChat}
                className="w-full bg-blue-500 text-white p-3 rounded-lg shadow-md hover:bg-blue-600 transition-colors duration-200"
                disabled={isAIGenerating || isSummarizing || isGeneratingImage}
              >
                Summarize Current Chat
              </button>
              <hr className="border-gray-200 dark:border-gray-700" />
              <div>
                <h3 className="text-lg font-semibold mb-2">Continue Writing</h3>
                <textarea
                  value={textToContinue}
                  onChange={(e) => setTextToContinue(e.target.value)}
                  placeholder="Enter text to continue..."
                  rows="4"
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                ></textarea>
                <button
                  onClick={() => handleContinueText(textToContinue, generateId())}
                  className="w-full bg-purple-500 text-white p-3 rounded-lg shadow-md hover:bg-purple-600 transition-colors duration-200 mt-2"
                  disabled={isAIGenerating || !textToContinue}
                >
                  Continue
                </button>
              </div>
              <hr className="border-gray-200 dark:border-gray-700" />
              <div>
                <h3 className="text-lg font-semibold mb-2">Translate Text</h3>
                <textarea
                  value={textToTranslate}
                  onChange={(e) => setTextToTranslate(e.target.value)}
                  placeholder="Enter text to translate..."
                  rows="4"
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                ></textarea>
                <select
                  value={translationTargetLanguage}
                  onChange={(e) => setTranslationTargetLanguage(e.target.value)}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 mt-2"
                >
                  <option value="en-US">English (US)</option>
                  <option value="es-US">Spanish (US)</option>
                  <option value="fr-FR">French (France)</option>
                  <option value="de-DE">German (Germany)</option>
                  <option value="ja-JP">Japanese (Japan)</option>
                  <option value="ko-KR">Korean (Korea)</option>
                  <option value="zh-CN">Chinese (Simplified)</option>
                </select>
                <button
                  onClick={() => handleTranslateMessage(textToTranslate, translationTargetLanguage, generateId())}
                  className="w-full bg-teal-500 text-white p-3 rounded-lg shadow-md hover:bg-teal-600 transition-colors duration-200 mt-2"
                  disabled={isAIGenerating || !textToTranslate}
                >
                  Translate
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Creative Writer Modal */}
      {showCreativeWriterModal && createPortal(
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-6 w-full max-w-md mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Creative Writer</h2>
              <button onClick={() => setShowCreativeWriterModal(false)} className="p-1 rounded-full text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Topic</label>
                <input
                  type="text"
                  value={creativeTopic}
                  onChange={(e) => setCreativeTopic(e.target.value)}
                  placeholder="e.g., A lone astronaut"
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Style</label>
                <select
                  value={creativeStyle}
                  onChange={(e) => setCreativeStyle(e.target.value)}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="Poem">Poem</option>
                  <option value="Short Story">Short Story</option>
                  <option value="Screenplay">Screenplay</option>
                  <option value="Blog Post">Blog Post</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tone</label>
                <select
                  value={creativeTone}
                  onChange={(e) => setCreativeTone(e.target.value)}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="Neutral">Neutral</option>
                  <option value="Happy">Happy</option>
                  <option value="Sad">Sad</option>
                  <option value="Excited">Excited</option>
                  <option value="Mysterious">Mysterious</option>
                </select>
              </div>

              <button
                onClick={() => handleCreativeWriting(creativeTopic, creativeStyle, creativeTone, currentConversationId)}
                className="w-full bg-indigo-500 text-white p-3 rounded-lg shadow-md hover:bg-indigo-600 transition-colors duration-200 mt-4"
                disabled={isAIGenerating || !creativeTopic}
              >
                Generate
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Settings Modal */}
      {showSettingsModal && createPortal(
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-6 w-full max-w-md mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">App Settings</h2>
              <button onClick={() => setShowSettingsModal(false)} className="p-1 rounded-full text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">TTS Settings</h3>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Voice</label>
                <select
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value)}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {prebuiltVoices.map((voice) => (
                    <option key={voice} value={voice}>{voice}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );

  return <ChatUI />;

}

export default App;
