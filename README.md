AI Voice Interview Partner
Project Overview

AI Voice Interview Partner is a single-page, responsive web application designed to help users practice mock job interviews. It leverages Google’s Generative AI models for realistic conversational intelligence and Text-to-Speech (TTS) capabilities, providing an immersive voice-enabled experience.

Key Features:

Role-Specific Interviews: Practice mock interviews for Software Engineer, Data Analyst, Product Manager, and Sales Associate.

Voice Integration (TTS): The AI interviewer’s responses are converted to audio using the Gemini TTS model.

Voice Transcription (STT): Users can answer questions verbally with real-time transcription via the browser’s Web Speech API.

Real-time Feedback: Analyzes the full interview transcript to provide structured feedback covering clarity, relevance, and communication style.

Resilient API Calls: Implements exponential backoff for robust communication with the Gemini API endpoints.

Architecture & Technical Stack

Frontend:

React (Single Component Architecture - InterviewApp.jsx)

Tailwind CSS for modern, responsive styling

AI Models & APIs:

Chat & Feedback: gemini-2.5-flash-preview-09-2025

Text-to-Speech (TTS): gemini-2.5-flash-preview-tts

Utilities:

Custom PCM-to-WAV conversion for browser-compatible audio playback

Browser-native webkitSpeechRecognition for real-time speech transcription

withExponentialBackoff wrapper for reliable API calls

Design Principles:
![alt text](image.png)

Core Features & User Scenarios
Conversational Strategy

System Prompt Enforcement: The AI acts as a professional interviewer, asking one question at a time.

Agentic Focus: Single-turn output ensures controlled interview flow.

Context Management: Full chat history is submitted with every question for follow-up consistency.

Feedback Strategy

On interview completion, the AI switches roles from Interviewer → Analyst.

Provides structured feedback on:

Clarity

Relevance

Communication Style

Demo Scenarios:
![alt text](image-1.png)

Local Setup Instructions

Prerequisites:

Node.js & npm/yarn installed

Gemini API Key from Google AI Studio

Setup Steps:

Create Project & Install Dependencies (Vite Example):
npm create vite@latest interview-partner -- --template react
cd interview-partner
npm install
# Optional: Install Tailwind CSS if not included
Replace Application Code:

Replace src/App.jsx (or create src/InterviewApp.jsx) with the full application code provided.

Configure API Key:

Recommended: Use environment variables for security.

# .env
VITE_GEMINI_API_KEY="YOUR_ACTUAL_API_KEY"

Update InterviewApp.jsx to use the environment variable:

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

Run the Application:

npm run dev

Technical Implementation Highlights

Single-File React/Tailwind: Combines UI, logic, state, and styling in InterviewApp.jsx.

Resilient API Calls: Uses withExponentialBackoff for chat, TTS, and feedback API requests.

TTS Conversion: Custom base64ToArrayBuffer + pcmToWav ensures browser-compatible audio.

Real-Time STT: Uses browser-native speech recognition for smooth voice interaction.

Centralized State Management: Tracks chatHistory, interviewState, and loading states for fluid UX.

License

This project is open-source and free to use under the MIT License.