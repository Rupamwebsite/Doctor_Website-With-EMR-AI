// AI Chat Widget JavaScript

let chatSessionId = 'user_' + Date.now();
let currentPrescriptionFile = null;

// Initialize chat widget
function initializeChatWidget() {
    const chatInput = document.getElementById('chat-input');
    const minimizeBtn = document.getElementById('chat-minimize-btn');
    const closeBtn = document.getElementById('chat-close-btn');
    const chatWidget = document.getElementById('ai-chat-widget');
    const toggleBtn = document.getElementById('chat-toggle-btn');

    // Minimize button
    if (minimizeBtn) {
        minimizeBtn.addEventListener('click', function(e) {
            e.preventDefault();
            chatWidget.style.display = 'none';
            toggleBtn.style.display = 'flex';
        });
    }

    // Close button
    if (closeBtn) {
        closeBtn.addEventListener('click', function(e) {
            e.preventDefault();
            chatWidget.style.display = 'none';
            toggleBtn.style.display = 'flex';
        });
    }

    if (chatInput) {
        chatInput.focus();
    }
}

// Toggle chat visibility
function toggleChat() {
    const chatWidget = document.getElementById('ai-chat-widget');
    const toggleBtn = document.getElementById('chat-toggle-btn');

    if (chatWidget.style.display === 'none' || chatWidget.style.display === '') {
        chatWidget.style.display = 'flex';
        toggleBtn.style.display = 'none';
        // Focus input after animation
        setTimeout(() => {
            const input = document.getElementById('chat-input');
            if (input) input.focus();
        }, 300);
    } else {
        chatWidget.style.display = 'none';
        toggleBtn.style.display = 'flex';
    }
}

// Send chat message
async function sendChatMessage() {
    const chatInput = document.getElementById('chat-input');
    const message = chatInput.value.trim();

    if (!message) return;

    // Add user message to chat
    addMessageToChat(message, 'user');
    chatInput.value = '';

    // Show loading indicator
    addMessageToChat('চিন্তা করছি... একটু অপেক্ষা করুন', 'bot-loading');

    try {
        const payload = {
            message: message,
            userId: chatSessionId
        };

        // ⭐ ADD PRESCRIPTION TEXT IF AVAILABLE
        if (currentPrescriptionFile) {
            const prescText = document.getElementById('prescription-text');
            if (prescText && prescText.textContent) {
                payload.prescriptionText = prescText.textContent;
                console.log('📎 Sending with prescription:', payload.prescriptionText);
            }
        }

        console.log('📤 Sending payload:', payload);

        const response = await fetch('/api/chat/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        console.log('📥 Response:', data);

        // Remove loading message
        removeLastMessage();

        if (data.success) {
            addMessageToChat(data.reply, 'bot');
        } else {
            addMessageToChat('❌ ত্রুটি! আবার চেষ্টা করুন।', 'bot');
        }
    } catch (error) {
        console.error('Chat error:', error);
        removeLastMessage();
        addMessageToChat('❌ সংযোগ ত্রুটি। ইন্টারনেট চেক করুন।', 'bot');
    }
}

// Add message to chat display
function addMessageToChat(text, sender) {
    const chatMessages = document.getElementById('chat-messages');
    const messageEl = document.createElement('div');
    messageEl.className = `message ${sender === 'user' ? 'user-message' : 'bot-message'} ${sender === 'bot-loading' ? 'loading' : ''}`;

    const contentEl = document.createElement('div');
    contentEl.className = 'message-content';
    
    // Handle markdown-like formatting
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\n/g, '<br>');
    
    contentEl.innerHTML = text;
    messageEl.appendChild(contentEl);

    const timeEl = document.createElement('small');
    timeEl.className = 'message-time';
    timeEl.textContent = getCurrentTime();
    messageEl.appendChild(timeEl);

    chatMessages.appendChild(messageEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Remove last message (for loading indicator)
function removeLastMessage() {
    const chatMessages = document.getElementById('chat-messages');
    const messages = chatMessages.querySelectorAll('.message');
    if (messages.length > 0) {
        messages[messages.length - 1].remove();
    }
}

// Handle prescription file upload
async function handlePrescriptionUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    currentPrescriptionFile = file;

    try {
        // Show uploading status
        addMessageToChat('📤 Uploading prescription... please wait', 'bot');

        const formData = new FormData();
        formData.append('prescription', file);

        const response = await fetch('/api/chat/prescribe', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        // Remove uploading message
        removeLastMessage();

        if (data.success) {
            // Show prescription preview
            const previewDiv = document.getElementById('prescription-preview');
            const previewText = document.getElementById('prescription-text');
            
            // Display prescription info
            let displayText = `✅ প্রেসক্রিপশন আপলোড হয়েছে\n`;
            displayText += `📄 ${data.fileName}\n`;
            displayText += `📊 Size: ${data.fileSize} KB`;
            
            previewText.textContent = displayText;
            previewDiv.style.display = 'block';

            // Add success message
            const successMsg = `✅ **প্রেসক্রিপশন সফলভাবে আপলোড হয়েছে!**\n\n📄 ফাইল: ${data.fileName}\n📊 সাইজ: ${data.fileSize} KB\n\n**এখন আমাকে প্রশ্ন করুন:**\n• এই ওষুধ কি?\n• কিভাবে খেতে হয়?\n• কি পার্শ্বপ্রতিক্রিয়া হতে পারে?\n• খাবারের সাথে খেতে পারি?`;
            addMessageToChat(successMsg, 'bot');
        } else {
            addMessageToChat('❌ প্রেসক্রিপশন আপলোড ব্যর্থ। আবার চেষ্টা করুন।', 'bot');
        }
    } catch (error) {
        console.error('Prescription upload error:', error);
        removeLastMessage();
        addMessageToChat('❌ ত্রুটি: ইন্টারনেট চেক করুন এবং পুনরায় চেষ্টা করুন।', 'bot');
    }

    // Reset file input
    document.getElementById('prescription-file').value = '';
}

// Clear prescription
function clearPrescription() {
    currentPrescriptionFile = null;
    document.getElementById('prescription-preview').style.display = 'none';
    document.getElementById('prescription-file').value = '';
    addMessageToChat('Prescription cleared. How can I help you now?', 'bot');
}

// Handle Enter key in chat input
function handleChatKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendChatMessage();
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    initializeChatWidget();
});

// Get current time
function getCurrentTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}
