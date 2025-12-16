const fs = require('fs');
const path = require('path');
const Groq = require('groq-sdk');

// Initialize Groq Client
const groqApiKey = process.env.GROQ_API_KEY;
let groqClient = null;

if (groqApiKey) {
    groqClient = new Groq({ apiKey: groqApiKey });
    console.log('✅ Groq API initialized successfully');
} else {
    console.log('⚠️  GROQ_API_KEY not found. Please add it to .env file');
    console.log('📍 Get free key from: https://console.groq.com');
}

// System prompt for medical expertise
const MEDICAL_SYSTEM_PROMPT = `You are an expert healthcare AI assistant for RM HealthCare. You provide helpful medical information, appointment guidance, and medicine-related advice in both English and Bengali.

IMPORTANT GUIDELINES:
1. Always include a disclaimer that you're an AI assistant and not a substitute for professional medical advice
2. Be bilingual - respond in the same language the user wrote in, or detected language
3. Provide accurate, evidence-based medical information
4. For medicines: Include dosage, frequency, food interactions, side effects, storage, age considerations
5. For appointments: Guide through booking process, cancellation policy, payment options
6. For emergencies: Always provide emergency contact number: +91 9635185829
7. Keep responses clear, well-formatted with emojis and bullet points
8. When mentioning specific medicines: Give brand names + generic names, typical doses, when to take
9. Always advise consulting a doctor for serious conditions
10. Support Bengali (Bangla) language responses when user writes in Bengali

AVAILABLE SERVICES:
- Appointment booking and management
- Doctor consultations across specializations (General Medicine, Cardiology, Orthopedics, Pediatrics, Dermatology, Dentistry)
- Medicine information and guidance
- Prescription analysis
- Payment and billing support
- Emergency medical support

MEDICAL INFORMATION YOU CAN PROVIDE:
- Common medicine dosages (Calpol, Crocin, Aspirin, Paracetamol, Ibuprofen, Amoxicillin, etc.)
- When to take medicines (with food, before food, after food, timing)
- Side effects and precautions
- Drug interactions
- Age-appropriate dosing
- Storage and shelf life information
- When to see a doctor
- General health information

Always remember: You are here to support, inform, and guide users to professional healthcare when needed.`;

// Detect language
function detectLanguage(text) {
    const bengaliPattern = /[\u0980-\u09FF]/g;
    const bengaliChars = (text.match(bengaliPattern) || []).length;
    return bengaliChars > text.length * 0.15 ? 'Bengali' : 'English';
}

// Store conversation history
const conversationHistory = new Map();

function getConversationHistory(userId) {
    if (!conversationHistory.has(userId)) {
        conversationHistory.set(userId, []);
    }
    return conversationHistory.get(userId);
}

// Store uploaded prescriptions
const uploadedPrescriptions = new Map();

// ===== MAIN CHAT ENDPOINT =====
exports.chat = async (req, res) => {
    try {
        const { message, userId, prescriptionText } = req.body;
        if (!message) {
            return res.status(400).json({ error: 'Message required' });
        }

        const uid = userId || 'anonymous-' + Math.random().toString(36).substr(2, 9);
        const language = detectLanguage(message);
        
        // Get or create conversation history
        let chatHistory = getConversationHistory(uid);
        
        let userMessage = message;
        let hasPrescription = false;

        // Check if prescription is uploaded
        if (prescriptionText) {
            hasPrescription = true;
            uploadedPrescriptions.set(uid, prescriptionText);
            userMessage += `\n\n[Patient uploaded prescription: ${prescriptionText}]`;
            console.log('📎 Prescription context added:', prescriptionText);
        } else if (uploadedPrescriptions.has(uid)) {
            hasPrescription = true;
            userMessage += `\n\n[Reference to previous prescription: ${uploadedPrescriptions.get(uid)}]`;
        }

        // If no Groq API key, use fallback demo response
        if (!groqClient) {
            const fallbackResponse = language === 'Bengali' 
                ? '⚠️ AI সেবা বর্তমানে উপলব্ধ নয়। অনুগ্রহ করে জরুরি সাহায্যের জন্য +91 9635185829 তে কল করুন।'
                : '⚠️ AI service temporarily unavailable. For urgent help, call +91 9635185829.';
            
            return res.json({
                success: true,
                reply: fallbackResponse,
                sessionId: uid,
                mode: 'fallback',
                hasPrescription: hasPrescription
            });
        }

        try {
            // Build messages array for Groq (system message first)
            const messages = [
                {
                    role: 'system',
                    content: MEDICAL_SYSTEM_PROMPT
                },
                ...chatHistory.map(msg => ({
                    role: msg.role,
                    content: msg.content
                })),
                {
                    role: 'user',
                    content: userMessage
                }
            ];

            // Call Groq API with streaming-like response
            const response = await groqClient.chat.completions.create({
                model: 'llama-3.3-70b-versatile', // Fast and capable model (free tier)
                messages: messages,
                temperature: 0.7,
                max_tokens: 1024,
                top_p: 1,
                frequency_penalty: 0,
                presence_penalty: 0
            });

            const assistantMessage = response.choices[0]?.message?.content || 'Unable to generate response';

            // Update conversation history
            chatHistory.push({ role: 'user', content: userMessage });
            chatHistory.push({ role: 'assistant', content: assistantMessage });
            conversationHistory.set(uid, chatHistory);

            // Keep history limited to last 20 messages
            if (chatHistory.length > 20) {
                chatHistory = chatHistory.slice(-20);
                conversationHistory.set(uid, chatHistory);
            }

            console.log(`✅ Groq response generated (${language}, Prescription: ${hasPrescription})`);

            res.json({
                success: true,
                reply: assistantMessage,
                sessionId: uid,
                mode: 'groq-ai',
                language: language,
                hasPrescription: hasPrescription,
                tokenUsage: {
                    input: response.usage?.prompt_tokens || 0,
                    output: response.usage?.completion_tokens || 0,
                    total: response.usage?.total_tokens || 0
                }
            });

        } catch (groqError) {
            console.error('❌ Groq API error:', groqError.message);
            
            // Check if it's a rate limit or quota error
            if (groqError.message.includes('rate_limit') || groqError.message.includes('quota')) {
                return res.json({
                    success: false,
                    reply: language === 'Bengali' 
                        ? '🔄 সার্ভার ব্যস্ত। একটু অপেক্ষা করুন এবং আবার চেষ্টা করুন।'
                        : '🔄 Server is busy. Please wait and try again.',
                    sessionId: uid,
                    error: 'Rate limited - please retry'
                });
            }

            throw groqError;
        }

    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({ 
            error: 'Chat failed', 
            details: error.message,
            hint: 'Please check GROQ_API_KEY in .env file'
        });
    }
};

// ===== PRESCRIPTION ENDPOINT =====
exports.processPrescription = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false,
                error: 'No file uploaded' 
            });
        }

        const fileName = req.file.filename;
        const fileSize = (req.file.size / 1024).toFixed(2);
        const mimeType = req.file.mimetype;

        // Log for debugging
        console.log('✅ Prescription uploaded:', {
            fileName: fileName,
            fileSize: fileSize + ' KB',
            mimetype: mimeType
        });

        // Create prescription description with more metadata
        const prescriptionDesc = `${fileName} (${fileSize}KB, ${mimeType})`;

        res.json({
            success: true,
            prescriptionText: prescriptionDesc,
            fileName: fileName,
            fileSize: fileSize,
            message: '✅ Prescription uploaded! Now ask me about the medicines in your prescription.'
        });

    } catch (error) {
        console.error('❌ Prescription error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Upload failed', 
            details: error.message 
        });
    }
};

// ===== GET CONVERSATION HISTORY =====
exports.getHistory = async (req, res) => {
    try {
        const { userId } = req.query;
        const history = getConversationHistory(userId || 'anonymous');
        
        res.json({ 
            success: true, 
            messages: history,
            totalMessages: history.length
        });
    } catch (error) {
        res.status(500).json({ error: 'History retrieval failed' });
    }
};

// ===== CLEAR CONVERSATION HISTORY =====
exports.clearHistory = async (req, res) => {
    try {
        const { userId } = req.body;
        const id = userId || 'anonymous';
        
        if (conversationHistory.has(id)) {
            conversationHistory.delete(id);
            uploadedPrescriptions.delete(id);
            console.log('✅ History cleared for user:', id);
        }
        
        res.json({ 
            success: true, 
            message: 'Conversation and prescription history cleared' 
        });
    } catch (error) {
        res.status(500).json({ error: 'Clear history failed' });
    }
};

// ===== FAQ ENDPOINT =====
exports.quickFaq = async (req, res) => {
    try {
        const { question } = req.body;

        if (!groqClient) {
            return res.json({
                success: false,
                reply: '⚠️ AI service not available. Please add GROQ_API_KEY to .env',
                isFaq: true
            });
        }

        const response = await groqClient.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [
                {
                    role: 'system',
                    content: MEDICAL_SYSTEM_PROMPT
                },
                {
                    role: 'user',
                    content: question
                }
            ],
            temperature: 0.7,
            max_tokens: 512
        });

        const reply = response.choices[0]?.message?.content || 'Unable to answer';

        res.json({ 
            success: true, 
            reply: reply, 
            isFaq: true,
            mode: 'groq-ai'
        });

    } catch (error) {
        console.error('FAQ error:', error);
        res.status(500).json({ 
            error: 'FAQ failed',
            details: error.message
        });
    }
};

// ===== HEALTH CHECK ENDPOINT =====
exports.health = async (req, res) => {
    try {
        res.json({
            success: true,
            status: groqClient ? '✅ Ready (Groq AI enabled)' : '⚠️ Demo mode (Groq API key missing)',
            groqEnabled: !!groqClient,
            model: 'llama-3.3-70b-versatile',
            description: 'Healthcare AI Chat Assistant'
        });
    } catch (error) {
        res.status(500).json({ error: 'Health check failed' });
    }
};
