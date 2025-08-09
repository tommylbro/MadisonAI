const functions = require('firebase-functions');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Ensure you have configured your environment variable for the API key.
// Run 'firebase functions:config:set gemini.api_key="YOUR_GEMINI_API_KEY"'
// Replace "YOUR_GEMINI_API_KEY" with your actual key from the Google AI Studio.
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

exports.generateChatResponse = functions.https.onCall(async (data, context) => {
  // Check if the user is authenticated.
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }

  const userMessage = data.message;
  if (!userMessage) {
    throw new functions.https.HttpsError('invalid-argument', 'The function must be called with a "message" argument.');
  }

  try {
    const chat = model.startChat({
      history: [
        // You can pre-populate the chat history here if needed
      ],
      generationConfig: {
        maxOutputTokens: 1000,
      },
    });

    const result = await chat.sendMessage(userMessage);
    const response = await result.response;
    const text = response.text();

    return { text: text };
  } catch (error) {
    console.error('Gemini API call failed:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get a response from the AI model.', error);
  }
});
