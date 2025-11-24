AI Interview Practice Partner
1. Project Overview
The AI Voice Interview Partner is a professional mock interview application built as a single-page, responsive application. It leverages Google's Generative AI models for conversational depth and Text-to-Speech (TTS) capabilities for an immersive, voice-enabled experience.
Key Features
Custom Job Role/Description: Unlike basic apps with rigid presets, this tool allows users to paste any Job Description or type any Job Role. The AI dynamically adapts its persona and questions to match the specific requirements provided by the user.
Voice Integration (TTS): All AI interviewer responses are converted to audio using the Gemini TTS model (gemini-2.5-flash-preview-tts) and played back to the user.
Continuous Voice Transcription (STT): Users can click a microphone button to use the browser's Web Speech API. The system employs a self-restarting loop to reliably capture long, continuous answers without being cut off by internal browser timeouts.
Structured Diagnostic Feedback (Innovation): Analyzes the full interview transcript to generate a structured JSON report, providing measurable performance scores (1-5) across specific criteria.
2. Architecture and Technical Stack
Architecture Diagram
Technology Stack
Frontend Framework: React (Single Component InterviewApp.jsx)
Styling: Tailwind CSS (for modern, responsive design)
Conversational AI: gemini-2.5-flash-preview-09-2025 (Chat, Feedback Generation, Structured JSON)
Audio Generation: gemini-2.5-flash-preview-tts (Text-to-Speech)
Audio Conversion: Pure JavaScript functions for converting raw PCM audio data into playable WAV format.
Constraint Adherence & Design Decisions
<img width="1003" height="656" alt="image" src="https://github.com/user-attachments/assets/fa6c0f17-56c9-44fb-840e-8939bb0353ee" />
3. Local Setup Instructions

This application is designed to run in a typical React development environment (e.g., using Vite or Create React App).

Prerequisites

Node.js & npm/yarn: Ensure you have Node.js installed.

Gemini API Key: Obtain an API key from Google AI Studio.

Setup Steps

Create Project & Install (Using Vite as example):

npm create vite@latest interview-partner -- --template react
cd interview-partner
npm install
# (Optional, depending on template: Install Tailwind CSS)


Replace Application Code:

Replace the contents of your primary React file (e.g., src/App.jsx or create src/InterviewApp.jsx and update main.jsx) with the complete application code.

Configure API Key (Crucial):
The provided code uses an empty string const apiKey = "";, which works in the Canvas environment. When running locally, you must provide your actual key.

Secure Method (Recommended for Vite):

Create a file named .env in your project root.

Add your key using the VITE_ prefix:

VITE_GEMINI_API_KEY="AIzaSy...your-actual-key-here"


In the InterviewApp.jsx file, update the apiKey line to load this variable:

const apiKey = "YOUR_API_KEY_HERE"; 


Run the Application:

npm run dev


The application will start running, usually accessible at http://localhost:5173.


