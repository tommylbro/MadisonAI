import React, { useState, useEffect, useRef } from 'react';
import { collection, addDoc, serverTimestamp, query, onSnapshot } from 'firebase/firestore';
import { SendHorizonal, Bot } from 'lucide-react';

const AIChatbot = ({ db, userId, appId }) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [isAIGenerating, setIsAIGenerating] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);

  // Fetch messages from Firestore in real-time
  useEffect(() => {
    if (!db || !userId) {
      console.warn("Firestore or User ID not available, skipping message fetch.");
      return;
    }

    console.log(`[FIRESTORE] Fetching messages for user: ${userId}`);
    const messagesCollectionPath = `artifacts/${appId}/public/data/messages`;
    const messagesCollectionRef = collection(db, messagesCollectionPath);
    const q = query(messagesCollectionRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log('[FIRESTORE] New message snapshot received.');
      const fetchedMessages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      const sortedMessages = fetchedMessages.sort((a, b) => (a.timestamp?.toMillis() || 0) - (b.timestamp?.toMillis() || 0));
      setMessages(sortedMessages);
      setError(null);
    }, (firestoreError) => {
      console.error("[FIRESTORE ERROR] Error fetching messages:", firestoreError.message);
      setError(`Failed to load messages. Details: ${firestoreError.message}`);
    });
    
    return () => {
      console.log('[FIRESTORE] Unsubscribing from messages collection.');
      unsubscribe();
    };
  }, [db, userId, appId]);

  // Use a separate useEffect to handle AI responses to user messages
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (db && lastMessage && lastMessage.sender === 'user' && !isAIGenerating) {
      const getAIResponse = async () => {
        setIsAIGenerating(true);
        console.log("[AI] User sent a message. Generating AI response...");
        try {
          const chatHistory = messages.map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }]
          }));
          
          const prompt = {
            role: "user", 
            parts: [{ text: lastMessage.text }] 
          };

          const payload = { contents: [...chatHistory, prompt] };
          const apiKey = "";
          const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
          
          const response = await fetch(apiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
          });

          const result = await response.json();
          let responseText = "Sorry, I couldn't generate a response.";
          if (result.candidates && result.candidates.length > 0 &&
              result.candidates[0].content && result.candidates[0].content.parts &&
              result.candidates[0].content.parts.length > 0) {
            responseText = result.candidates[0].content.parts[0].text;
            console.log("[AI] Generated AI response successfully.");
          }

          await addDoc(collection(db, `artifacts/${appId}/public/data/messages`), {
            text: responseText,
            sender: 'bot',
            timestamp: serverTimestamp(),
            userId: "bot"
          });
        } catch (e) {
          console.error("[AI ERROR] Error getting AI response:", e);
          await addDoc(collection(db, `artifacts/${appId}/public/data/messages`), {
            text: `Sorry, I am having trouble processing that request. Error: ${e.message}`,
            sender: 'bot',
            timestamp: serverTimestamp(),
            userId: "bot"
          });
        } finally {
          setIsAIGenerating(false);
        }
      };
      getAIResponse();
    }
  }, [messages, db, isAIGenerating, appId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (input.trim() === '' || !db || !userId || isAIGenerating) {
      console.warn("[SEND] Message send blocked. Input is empty, DB/userId not ready, or AI is generating.");
      return;
    }
    try {
      const messagesCollectionPath = `artifacts/${appId}/public/data/messages`;
      console.log(`[SEND] Attempting to send message to path: ${messagesCollectionPath}`);
      const messagesCollectionRef = collection(db, messagesCollectionPath);
      await addDoc(messagesCollectionRef, { 
        text: input, 
        sender: 'user', 
        timestamp: serverTimestamp(),
        userId: userId // Add userId to the message for identification
      });
      setInput('');
      console.log("[SEND] Message sent successfully.");
    } catch (e) {
      console.error("[SEND ERROR] Error adding document: ", e);
      setError(`Failed to send message: ${e.message}`);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && input.trim() !== '' && !isAIGenerating) {
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col w-full max-w-xl h-[80vh] bg-white dark:bg-gray-800 rounded-2xl shadow-2xl">
      <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700 rounded-t-2xl">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">AI Chatbot</h1>
        {userId && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            User ID: <span className="font-mono">{userId}</span>
          </span>
        )}
      </div>
      <div className="flex-grow p-4 overflow-y-auto space-y-4">
        {error ? (
          <div className="flex justify-center items-center h-full text-red-500 font-medium text-center p-4">
            <p>{error}</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex justify-center items-center h-full">
            <span className="text-gray-500 dark:text-gray-400">Start a new conversation!</span>
          </div>
        ) : (
          messages.map((message, index) => (
            <div key={index} className={`flex items-start gap-3 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              {message.sender === 'bot' && (
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-200 dark:bg-indigo-700">
                  <Bot size={16} className="text-indigo-600 dark:text-indigo-200" />
                </div>
              )}
              <div className={`p-3 rounded-lg max-w-[70%] ${message.sender === 'user' ? 'bg-indigo-500 text-white dark:bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'}`}>
                <p className="whitespace-pre-wrap">{message.text}</p>
              </div>
            </div>
          ))
        )}
        {isAIGenerating && (
          <div className="flex items-start gap-3 justify-start">
            <div className="p-3 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white max-w-[70%]">
              <Bot size={16} className="inline-block mr-2" />
              <div className="dot-flashing"></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <div className="relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
            className="flex-grow rounded-full border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-900 px-4 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
            disabled={isAIGenerating}
          />
          <button
            onClick={sendMessage}
            disabled={isAIGenerating || input.trim() === ''}
            className="ml-3 p-2 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-400 transition-colors"
          >
            <SendHorizonal size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default AIChatbot;
