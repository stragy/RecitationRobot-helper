/**
 * 智能背诵助手 - 配置常量与全局状态
 */

// ==================== 全局状态 ====================
const AppState = {
    currentPage: 'home',
    content: {
        title: '',
        text: '',
        sentences: [],
        language: 'zh-CN'
    },
    settings: {
        speechRate: 0.9,
        speechVolume: 1,
        autoNext: true,
        language: 'auto'
    },
    recitation: {
        mode: 'repeat',
        currentIndex: 0,
        results: [],
        isListening: false,
        isSpeaking: false,
        isPaused: false,
        hintLevel: 0,
        retryCount: 0,
        maxRetries: 3
    },
    capabilities: {
        speechSynthesis: false,
        speechRecognition: false,
        microphone: false
    },
    history: {
        records: [],
        achievements: [],
        stats: {
            totalCount: 0,
            avgScore: 0,
            streakDays: 0,
            todayCount: 0
        }
    }
};

// ==================== 语言检测工具 ====================

/**
 * 检测浏览器功能支持情况
 */
async function detectCapabilities() {
    AppState.capabilities.speechSynthesis = 'speechSynthesis' in window;

    AppState.capabilities.speechRecognition = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        AppState.capabilities.microphone = true;
        stream.getTracks().forEach(track => track.stop());
    } catch (e) {
        AppState.capabilities.microphone = false;
    }

    console.log('功能支持情况:', AppState.capabilities);

    if (!AppState.capabilities.microphone) {
        console.warn('麦克风不可用，请使用支持麦克风的设备');
    }

    return AppState.capabilities;
}

/**
 * 检测文本主要语言
 */
function detectLanguage(text) {
    if (!text || text.trim().length === 0) return 'zh-CN';

    let chineseChars = 0;
    let englishChars = 0;
    let totalChars = 0;

    for (const char of text) {
        if (/[\u4e00-\u9fa5]/.test(char)) {
            chineseChars++;
            totalChars++;
        } else if (/[a-zA-Z]/.test(char)) {
            englishChars++;
            totalChars++;
        }
    }

    if (totalChars === 0) return 'zh-CN';

    const englishRatio = englishChars / totalChars;
    if (englishRatio > 0.6) return 'en-US';
    return 'zh-CN';
}

/**
 * 获取语言显示名称
 */
function getLanguageName(langCode) {
    const names = {
        'zh-CN': '中文',
        'en-US': 'English',
        'auto': '自动检测'
    };
    return names[langCode] || langCode;
}

/**
 * 获取语言对应的语音
 */
function getVoiceForLanguage(voices, langCode) {
    let voice = voices.find(v => v.lang === langCode);
    if (!voice) {
        const prefix = langCode.split('-')[0];
        voice = voices.find(v => v.lang.startsWith(prefix));
    }
    return voice || voices[0];
}
