import { CheckCircle, Loader2, MessageSquare, Mic, Star, Volume2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

// --- System Instructions & Prompts ---
// UPDATED: Now accepts a full Job Description or Role string to customize the interview context.
const INTERVIEWER_SYSTEM_PROMPT = (jobContext) => `You are an AI interviewer conducting a mock interview based on the following Job Description or Role: 
"${jobContext}"

Your goal is to be professional, challenging, and fair. 

Operational Rules:
1. **Contextual Relevance:** tailored your questions specifically to the skills, requirements, and responsibilities mentioned in the provided Job Description.
2. **One Question at a Time:** Never ask multiple questions in a single turn.
3. **Targeted Follow-up:** If the candidate's answer is incomplete, vague, or misses key technical details, ask a specific follow-up question to probe their depth.
4. **Off-Topic Handling (Chatty User):** If the user goes off-topic or rambles about irrelevant personal details, politely acknowledge the input but firmly redirect the conversation back to the specific interview topic.
5. **Boundary Maintenance (Edge Case):** If the user asks you to perform tasks outside the scope of a mock interview (e.g., "write a poem", "explain stock prices"), firmly refuse and state that you are focused strictly on the interview.
6. **No Early Feedback:** Do not provide feedback or scores until the user explicitly requests to finish the interview.

Start the interview by asking the first question immediately after the opening phrase.`;

const FEEDBACK_PROMPT = `Analyze the following interview transcript and provide constructive feedback to the candidate. 
You MUST return the output as a single JSON object that conforms to the specified schema. 
The score for each criterion must be an integer between 1 (Poor) and 5 (Excellent).
The DetailedFeedback should contain a concise summary and 3-5 bullet points covering the interview's strengths and weaknesses based on the specific Job Description provided.`;

// --- API Configuration ---
const CHAT_MODEL = "gemini-2.5-flash-preview-09-2025";
const TTS_MODEL = "gemini-2.5-flash-preview-tts";
const apiKey = "YOUR_API_KEY_HERE"; 

// --- JSON Schema for Structured Feedback ---
const FEEDBACK_SCHEMA = {
    type: "OBJECT",
    properties: {
        OverallScore: { type: "INTEGER", description: "Overall rating (1-5)." },
        ClarityAndStructureScore: { type: "INTEGER", description: "Score for answer clarity and structure (1-5)." },
        RelevanceAndDepthScore: { type: "INTEGER", description: "Score for technical relevance and depth of knowledge (1-5)." },
        ConfidenceAndCommunicationScore: { type: "INTEGER", description: "Score for verbal confidence and communication style (1-5)." },
        DetailedFeedback: { type: "STRING", description: "A summary of performance followed by 3-5 key bullet points for improvement." },
    },
    propertyOrdering: [
        "OverallScore",
        "ClarityAndStructureScore",
        "RelevanceAndDepthScore",
        "ConfidenceAndCommunicationScore",
        "DetailedFeedback"
    ]
};

// Helper functions for exponential backoff retry logic
const withExponentialBackoff = async (fn, retries = 5, delay = 1000) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === retries - 1) throw error;
            console.warn(`Attempt ${i + 1} failed. Retrying in ${delay}ms...`, error);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2;
        }
    }
};

// --- TTS Audio Handling Functions (PCM to WAV conversion) ---

const base64ToArrayBuffer = (base64) => {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
};

const pcmToWav = (pcmData, sampleRate) => {
    const numChannels = 1; 
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const byteRate = sampleRate * numChannels * bytesPerSample;
    const blockAlign = numChannels * bytesPerSample;
    const dataSize = pcmData.byteLength;
    const totalFileSize = 36 + dataSize;

    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    let offset = 0;
    const littleEndian = true;
    const bigEndian = false; 

    view.setUint32(offset, 0x52494646, bigEndian); 
    offset += 4;
    view.setUint32(offset, totalFileSize, littleEndian); 
    offset += 4;
    view.setUint32(offset, 0x57415645, bigEndian); 
    offset += 4;

    view.setUint32(offset, 0x666d7420, bigEndian); 
    offset += 4;
    view.setUint32(offset, 16, littleEndian); 
    offset += 4;
    view.setUint16(offset, 1, littleEndian); 
    offset += 2;
    view.setUint16(offset, numChannels, littleEndian); 
    offset += 2;
    view.setUint32(offset, sampleRate, littleEndian); 
    offset += 4;
    view.setUint32(offset, byteRate, littleEndian); 
    offset += 4;
    view.setUint16(offset, blockAlign, littleEndian); 
    offset += 2;
    view.setUint16(offset, bitsPerSample, littleEndian); 
    offset += 2;

    view.setUint32(offset, 0x64617461, bigEndian); 
    offset += 4;
    view.setUint32(offset, dataSize, littleEndian); 
    offset += 4;

    const pcmDataView = new Uint8Array(pcmData);
    const wavDataView = new Uint8Array(buffer, offset, pcmDataView.byteLength);
    wavDataView.set(pcmDataView);

    return new Blob([buffer], { type: 'audio/wav' });
};

const fetchTTSAudio = async (text) => {
    if (!text) return null;

    const payload = {
        contents: [{ parts: [{ text: text }] }],
        generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: "Kore" }
                }
            }
        },
    };

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${apiKey}`;

    const response = await withExponentialBackoff(() => fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }));

    if (!response.ok) {
        console.error("TTS API call failed:", response.status, await response.text());
        return null;
    }

    const result = await response.json();

    const part = result?.candidates?.[0]?.content?.parts?.[0];
    const audioData = part?.inlineData?.data;
    const mimeType = part?.inlineData?.mimeType;

    if (audioData && mimeType && mimeType.startsWith("audio/")) {
        const sampleRateMatch = mimeType.match(/rate=(\d+)/);
        const sampleRate = sampleRateMatch ? parseInt(sampleRateMatch[1], 10) : 16000;
        
        const pcmData = base64ToArrayBuffer(audioData);
        const wavBlob = pcmToWav(pcmData, sampleRate);
        return URL.createObjectURL(wavBlob);
    }

    return null;
};

const fetchChatResponse = async (history, prompt, systemInstruction, tools = undefined) => {
    const contents = [...history, { role: "user", parts: [{ text: prompt }] }];
    
    const payload = {
        contents: contents,
        systemInstruction: { parts: [{ text: systemInstruction }] },
        tools: tools,
    };

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${CHAT_MODEL}:generateContent?key=${apiKey}`;

    const response = await withExponentialBackoff(() => fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }));
    
    if (!response.ok) {
        throw new Error(`API call failed with status ${response.status}: ${await response.text()}`);
    }

    const result = await response.json();
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't generate a response.";
    
    const updatedHistory = [...history, { role: "user", parts: [{ text: prompt }] }];
    
    return { text, updatedHistory };
};

const generateFeedback = async (transcript) => {
    const transcriptText = transcript.map(msg => `${msg.role === 'model' ? 'Interviewer' : 'Candidate'}: ${msg.parts[0].text}`).join('\n');
    const fullPrompt = FEEDBACK_PROMPT + "\n\n--- Transcript ---\n" + transcriptText;

    const payload = {
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: FEEDBACK_SCHEMA,
        },
    };

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${CHAT_MODEL}:generateContent?key=${apiKey}`;
    
    const response = await withExponentialBackoff(() => fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }));
    
    if (!response.ok) {
        throw new Error(`API call failed with status ${response.status}: ${await response.text()}`);
    }

    const result = await response.json();
    const jsonText = result?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!jsonText) {
        throw new Error("Could not retrieve JSON feedback from model.");
    }
    return JSON.parse(jsonText);
};


const InterviewApp = () => {
    // Replaced 'role' state with 'jobDescription'
    const [jobDescription, setJobDescription] = useState("");
    const [chatHistory, setChatHistory] = useState([]); 
    const [interviewState, setInterviewState] = useState('initial'); 
    const [loading, setLoading] = useState(false);
    const [userInput, setUserInput] = useState('');
    const [audioUrl, setAudioUrl] = useState(null);
    const [feedbackReport, setFeedbackReport] = useState(null);

    const [isListening, setIsListening] = useState(false);
    const [liveTranscript, setLiveTranscript] = useState('');
    const [recognition, setRecognition] = useState(null); 
    
    const finalTranscriptRef = useRef(''); 
    const isStoppingRef = useRef(false); 
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    const playAudio = useCallback((url) => {
        if (url) {
            const audio = new Audio(url);
            audio.play().catch(e => console.error("Error playing audio:", e));
        }
    }, []);

    useEffect(() => {
        if (audioUrl) {
            playAudio(audioUrl);
            
            return () => URL.revokeObjectURL(audioUrl);
        }
    }, [audioUrl, playAudio]);


    const handleAskQuestion = async (userPrompt) => {
        if (loading || !userPrompt.trim()) return;

        setLoading(true);
        setUserInput('');
        setAudioUrl(null);

        const userMessage = { role: 'user', parts: [{ text: userPrompt }] };
        const historyWithUser = [...chatHistory, userMessage];
        setChatHistory(historyWithUser);

        try {
            const systemInstruction = INTERVIEWER_SYSTEM_PROMPT(jobDescription);

            const { text: aiResponse } = await fetchChatResponse(historyWithUser, userPrompt, systemInstruction);
            
            const newHistory = [
                ...historyWithUser,
                { role: 'model', parts: [{ text: aiResponse }] }
            ];
            setChatHistory(newHistory);

            const url = await fetchTTSAudio(aiResponse);
            setAudioUrl(url);

        } catch (error) {
            console.error("Error asking question:", error);
            const errorMessage = { role: 'model', parts: [{ text: "Sorry, I had trouble processing that. Can you repeat your answer?" }] };
            setChatHistory(h => [...h, errorMessage]);
        } finally {
            setLoading(false);
        }
    };
    
    const handleStartInterview = async () => {
        if (!jobDescription.trim()) return; // Validation

        setLoading(true);
        setChatHistory([]);
        setAudioUrl(null);
        setInterviewState('in-progress');
        setFeedbackReport(null);

        const promptToAI = "Start the interview. Ask your first question.";

        try {
            const systemInstruction = INTERVIEWER_SYSTEM_PROMPT(jobDescription);
            
            const { text: firstQuestion, updatedHistory: tempHistory } = await fetchChatResponse([], promptToAI, systemInstruction);

            const newHistory = [
                ...tempHistory,
                { role: 'model', parts: [{ text: firstQuestion }] }
            ];
            setChatHistory(newHistory);

            const url = await fetchTTSAudio(firstQuestion);
            setAudioUrl(url);

        } catch (error) {
            console.error("Error starting interview:", error);
            setChatHistory([{ role: 'model', parts: [{ text: "An error occurred while starting the interview. Please try again." }] }]);
        } finally {
            setLoading(false);
        }
    };

    const handleGenerateFeedback = async () => {
        setLoading(true);
        setAudioUrl(null);
        setInterviewState('feedback');
        setFeedbackReport(null);

        const historyForFeedback = chatHistory.filter(m => m.parts.length > 0 && m.parts[0].text.length > 0);

        try {
            const report = await generateFeedback(historyForFeedback);
            setFeedbackReport(report);

            const ttsText = `Your interview is complete. Your overall score is ${report.OverallScore} out of 5. ${report.DetailedFeedback}`;
            const url = await fetchTTSAudio(ttsText); 
            setAudioUrl(url);

        } catch (error) {
            console.error("Error generating feedback:", error);
            setFeedbackReport({ error: "An error occurred while generating feedback." });
        } finally {
            setLoading(false);
        }
    };
    
    const toggleListening = () => {
        if (!SpeechRecognition) {
            alert("Your browser does not support the Web Speech API for transcription. Please use the text input.");
            return;
        }

        if (loading || interviewState !== 'in-progress') return;

        if (isListening && recognition) {
            // STOP Listening (Manual Stop)
            isStoppingRef.current = true; // Flag that this stop is intentional
            recognition.stop();
            
            // Wait for onend to finish cleanup and submission
        } else {
            // START Listening
            finalTranscriptRef.current = ''; 
            isStoppingRef.current = false;
            setLiveTranscript('');
            setIsListening(true);
            
            const newRecognition = new SpeechRecognition();
            newRecognition.continuous = true; 
            newRecognition.interimResults = true; 
            newRecognition.lang = 'en-US';
            setRecognition(newRecognition); 

            newRecognition.onresult = (event) => {
                let currentInterimTranscript = '';
                
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalTranscriptRef.current += transcript + ' '; 
                    } else {
                        currentInterimTranscript += transcript;
                    }
                }
                
                setLiveTranscript((finalTranscriptRef.current.trim() + ' ' + currentInterimTranscript.trim()).trim());
            };

            newRecognition.onend = () => {
                const manualStop = isStoppingRef.current;
                
                // Cleanup recognition state
                setIsListening(false);
                setRecognition(null);
                
                if (manualStop) {
                    isStoppingRef.current = false; // FIX: Reset flag so input isn't disabled later
                    
                    // Submission logic for manual stop
                    const finalText = finalTranscriptRef.current.trim();
                    finalTranscriptRef.current = ''; 
                    setLiveTranscript(''); 
                    
                    if (finalText) {
                        handleAskQuestion(finalText); 
                    } else {
                        setUserInput('');
                    }
                } else {
                    // Auto-stop/Timeout, restart to continue listening
                    if (interviewState === 'in-progress') {
                        // Restart recognition immediately to avoid losing context
                        newRecognition.start(); 
                        setIsListening(true); // Set state back to listening
                        setRecognition(newRecognition); // Re-assign recognition object
                    }
                }
            };

            newRecognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                setIsListening(false);
                setRecognition(null);
                setLiveTranscript('');
                if (event.error !== 'no-speech' && event.error !== 'aborted') {
                     alert(`Speech recognition error: ${event.error}. Please use the text input.`);
                }
            };

            try {
                newRecognition.start();
            } catch (e) {
                console.error("Error starting recognition:", e);
                setIsListening(false);
                setRecognition(null);
            }
        }
    };

    const ConversationBubble = ({ message }) => {
        const isAI = message.role === 'model';
        const text = message.parts[0].text;
        const color = isAI ? 'bg-indigo-100 text-indigo-900' : 'bg-green-100 text-green-900';
        const alignment = isAI ? 'justify-start' : 'justify-end';
        const speaker = isAI ? 'Interviewer' : 'You';
        const icon = isAI ? <Volume2 size={16} className="text-indigo-500 mr-2" /> : <Mic size={16} className="text-green-500 mr-2" />;

        return (
            <div className={`flex ${alignment} my-3`}>
                <div className={`max-w-[80%] p-4 rounded-xl shadow-lg ${color} transition-all duration-300`}>
                    <div className="flex items-center font-semibold mb-1 text-sm">
                        {icon}
                        <span>{speaker}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-base">{text}</p>
                </div>
            </div>
        );
    };
    
    const ScoreBadge = ({ score }) => {
        const scoreOutOf5 = Math.min(5, Math.max(1, score));
        const colorClass = scoreOutOf5 >= 4 ? 'bg-green-600' : scoreOutOf5 >= 3 ? 'bg-yellow-600' : 'bg-red-600';

        return (
            <div className={`flex items-center justify-center w-14 h-14 rounded-full text-white font-extrabold text-xl ${colorClass} shadow-xl`}>
                {scoreOutOf5}
            </div>
        );
    };
    
    const StarRating = ({ score }) => {
        const stars = [];
        for (let i = 1; i <= 5; i++) {
            stars.push(
                <Star
                    key={i}
                    size={22}
                    className={i <= score ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}
                />
            );
        }
        return <div className="flex space-x-1">{stars}</div>;
    };

    const FeedbackReportDisplay = ({ report }) => {
        if (report.error) {
            return <p className="text-red-600 font-semibold">{report.error}</p>;
        }

        const criteria = [
            { key: 'ClarityAndStructureScore', label: 'Clarity & Structure' },
            { key: 'RelevanceAndDepthScore', label: 'Relevance & Depth' },
            { key: 'ConfidenceAndCommunicationScore', label: 'Confidence & Communication' },
        ];
        
        const renderDetailedFeedback = (text) => {
            const lines = text.split('\n').filter(line => line.trim().length > 0);
            return lines.map((line, index) => {
                if (line.trim().startsWith('*') || line.trim().startsWith('-')) {
                    return <li key={index} className="ml-5 list-disc text-gray-700">{line.replace(/^[\*\-]\s*/, '').trim()}</li>;
                }
                return <p key={index} className="font-semibold text-gray-800 mb-2">{line.trim()}</p>;
            });
        };


        return (
            <div className="space-y-8">
                <div className="flex items-center justify-between p-5 bg-indigo-50 border-l-4 border-indigo-600 rounded-xl shadow-md">
                    <h4 className="text-2xl font-extrabold text-indigo-900">Overall Performance</h4>
                    <div className="flex items-center space-x-3">
                        <ScoreBadge score={report.OverallScore} />
                        <span className="text-indigo-600 font-semibold text-lg">/ 5.0</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {criteria.map(({ key, label }) => (
                        <div key={key} className="p-4 bg-white rounded-xl shadow-lg border border-gray-200 text-center">
                            <h5 className="text-base font-bold text-gray-700 mb-2">{label}</h5>
                            <StarRating score={report[key]} />
                        </div>
                    ))}
                </div>

                <div>
                    <h4 className="text-xl font-bold text-indigo-800 mb-3 border-b pb-2">Actionable Insights</h4>
                    <div className="p-5 bg-white rounded-xl shadow-lg border border-gray-100">
                        <ul className="list-none space-y-2">
                           {renderDetailedFeedback(report.DetailedFeedback)}
                        </ul>
                    </div>
                </div>
            </div>
        );
    };


    return (
        <div className="min-h-screen bg-gray-50 flex items-start justify-center p-4 sm:p-8">
            <div className="w-full max-w-3xl bg-white p-6 sm:p-8 rounded-2xl shadow-2xl">
                <header className="text-center mb-8">
                    <h1 className="text-4xl font-extrabold text-indigo-700 flex items-center justify-center">
                        <MessageSquare className="w-9 h-9 mr-3" />
                        AI Interview Practice Partner
                    </h1>
                    <p className="text-gray-600 mt-2 text-lg">Practice and Ace your next interview .</p>
                </header>

                <div className="flex flex-col sm:flex-row gap-4 mb-8 p-6 bg-indigo-50 rounded-xl shadow-inner">
                    <div className="flex-grow">
                        <label className="block text-sm font-bold text-indigo-700 mb-1">
                            Enter Job Role or Paste Job Description
                        </label>
                        <textarea
                            value={jobDescription}
                            onChange={(e) => setJobDescription(e.target.value)}
                            placeholder="E.g., Senior React Developer, Sales Associate, or paste a full Job Description..."
                            className="w-full p-3 border-2 border-indigo-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 transition duration-200 shadow-sm h-24 resize-none"
                            disabled={interviewState !== 'initial'}
                        />
                    </div>
                    <button
                        onClick={interviewState === 'initial' ? handleStartInterview : handleGenerateFeedback}
                        disabled={loading || (interviewState === 'feedback' && feedbackReport) || (interviewState === 'initial' && !jobDescription.trim())}
                        className={`mt-4 sm:mt-0 sm:ml-4 px-8 py-3 rounded-xl font-extrabold text-white shadow-lg transition duration-300 transform hover:scale-[1.02] flex-shrink-0 h-fit self-center
                            ${interviewState === 'initial' ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/50' : 'bg-red-500 hover:bg-red-600 shadow-red-500/50'}
                            ${loading || (interviewState === 'feedback' && feedbackReport) || (interviewState === 'initial' && !jobDescription.trim()) ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                    >
                        {loading && interviewState === 'initial' ? <Loader2 className="w-5 h-5 animate-spin mr-2 inline" /> : null}
                        {interviewState === 'initial' ? 'Start Interview' : 'Finish & Feedback'}
                    </button>
                </div>

                <div className="bg-gray-100 p-4 border-2 border-gray-200 rounded-xl h-[400px] overflow-y-auto shadow-inner mb-6 space-y-4">
                    {interviewState === 'initial' && (
                        <p className="text-center text-gray-500 mt-20 p-4">Enter a job role or description above and click 'Start Interview' to begin.</p>
                    )}

                    {interviewState === 'in-progress' && chatHistory.length > 0 && chatHistory.map((message, index) => (
                        <ConversationBubble key={index} message={message} />
                    ))}

                    {loading && interviewState === 'in-progress' && (
                        <div className="flex justify-start my-3">
                            <div className="bg-indigo-100 text-indigo-800 p-4 rounded-xl shadow-md flex items-center">
                                <Loader2 className="w-5 h-5 mr-2 animate-spin text-indigo-600" />
                                Interviewer is thinking...
                            </div>
                        </div>
                    )}

                    {interviewState === 'feedback' && (
                        <div className="p-4 bg-white rounded-xl shadow-lg">
                            <h3 className="text-2xl font-bold text-indigo-700 flex items-center mb-6">
                                <CheckCircle className="w-7 h-7 mr-3 text-green-500" />
                                Interview Performance Report
                            </h3>
                            {loading && !feedbackReport ? (
                                <div className="flex items-center text-gray-600 justify-center h-48">
                                    <Loader2 className="w-8 h-8 mr-3 animate-spin text-indigo-500" />
                                    <span className="text-lg">Analyzing performance and generating structured report...</span>
                                </div>
                            ) : (
                                feedbackReport && <FeedbackReportDisplay report={feedbackReport} />
                            )}
                        </div>
                    )}
                </div>

                <div className="flex gap-3 items-center">
                    <input
                        type="text"
                        placeholder={
                            isListening ? "Listening... Click the mic to stop and send." : 
                            interviewState === 'in-progress' ? "Type or click the mic to speak..." : 
                            "Start the interview first."
                        }
                        value={isListening ? liveTranscript : userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleAskQuestion(userInput);
                        }}
                        className={`flex-grow p-3 border-2 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 transition duration-200 shadow-md
                            ${isListening ? 'bg-yellow-50 border-yellow-400' : 'bg-white border-gray-300'}
                        `}
                        disabled={loading || interviewState !== 'in-progress' || isStoppingRef.current}
                    />
                    <button
                        onClick={() => handleAskQuestion(userInput)}
                        disabled={loading || interviewState !== 'in-progress' || !userInput.trim() || isListening}
                        className={`px-5 py-3 rounded-xl font-bold text-white shadow-lg transition duration-300 transform hover:scale-[1.02]
                            ${loading || interviewState !== 'in-progress' || !userInput.trim() || isListening ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/50'}
                        `}
                        title="Send via text"
                    >
                        Send
                    </button>
                    <button
                        onClick={toggleListening} 
                        disabled={loading || interviewState !== 'in-progress'}
                        className={`p-3 rounded-xl font-bold text-white shadow-lg transition duration-300 transform hover:scale-[1.02]
                            ${isListening ? 'bg-red-500 hover:bg-red-600 animate-pulse shadow-red-500/50' : 'bg-green-600 hover:bg-green-700 shadow-green-500/50'}
                            ${loading || interviewState !== 'in-progress' ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                        title={isListening ? "Click to stop recording and send" : "Start voice transcription"}
                    >
                        <Mic className="w-6 h-6" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default InterviewApp;